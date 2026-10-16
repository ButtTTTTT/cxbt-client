package main

import (
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
)

// 计算VFS表值
func calculateVfsValue(fileOffset uint64) (uint64, error) {
	// 确保VFS表已加载
	if len(VfsTablesArr) == 0 {
		return 0, fmt.Errorf("VFS表未加载或为空")
	}

	finalOffset := ((fileOffset >> 0xA) * 0x1000) + ((fileOffset & 0x3FF) * 4)

	// 更严格的边界检查
	if finalOffset >= uint64(len(VfsTablesArr)) || finalOffset+3 >= uint64(len(VfsTablesArr)) {
		return 0, fmt.Errorf("偏移量超出数组范围: 0x%X", fileOffset)
	}

	// 读取4字节值
	pde := binary.LittleEndian.Uint32(VfsTablesArr[finalOffset:])
	return uint64(pde & 0x7FFFFFFF), nil
}

// 计算VFS表偏移列表
func calculateVfsOffsets(fileSize, fileOffset uint64) ([]uint64, error) {
	var vfsOffsets []uint64

	if fileSize <= 0x1000 {
		vfsOffsets = append(vfsOffsets, fileOffset)
	} else {
		vfsOffsetCount := fileSize / 0x1000
		if fileSize%0x1000 != 0 {
			vfsOffsetCount++
		}

		vfsOffsets = append(vfsOffsets, fileOffset) // 添加第一个偏移

		// 循环读取剩余的VFS表偏移
		for i := uint64(1); i < vfsOffsetCount; i++ {
			// 计算VFS表值
			vfsVal, err := calculateVfsValue(fileOffset)
			if err != nil {
				return nil, err
			}
			vfsOffsets = append(vfsOffsets, vfsVal)
			fileOffset = vfsVal
		}
	}

	return vfsOffsets, nil
}

// 从.xor文件中提取VFS表数据
func DumpVfsTable(xorFilePath string) (bool, error) {
	fmt.Println(" > 开始处理VFS表")

	// 使用内存映射管理器打开文件
	mapper := GetMemoryMapperInstance()
	err := mapper.OpenFile(xorFilePath)
	if err != nil {
		return false, fmt.Errorf("打开文件失败: %v", err)
	}

	// 获取文件大小
	fileSize := mapper.GetFileSize()

	// 准备输出文件
	vtoFilePath := filepath.Join(ThisXorObj.OutputPath, "VfsOffsets.txt")
	vtFilePath := filepath.Join(ThisXorObj.OutputPath, "VfsTable.hex")

	vtoFile, err := os.Create(vtoFilePath)
	if err != nil {
		return false, fmt.Errorf("创建VfsOffsets.txt失败: %v", err)
	}
	defer vtoFile.Close()

	vtFile, err := os.Create(vtFilePath)
	if err != nil {
		return false, fmt.Errorf("创建VfsTable.hex失败: %v", err)
	}
	defer vtFile.Close()

	// 计算所有需要读取的块
	var readBlocks []struct {
		offset uint64
		size   uint32
	}
	var offsets []uint64

	offset := uint64(0)
	for offset < uint64(fileSize) {
		offsets = append(offsets, offset)

		// 计算实际读取大小（避免超出文件末尾）
		readSize := uint32(0x1000)
		if offset+uint64(readSize) > uint64(fileSize) {
			readSize = uint32(uint64(fileSize) - offset)
		}

		readBlocks = append(readBlocks, struct {
			offset uint64
			size   uint32
		}{offset: offset, size: readSize})

		// 计算下一个偏移
		offset += 0x1000   // 跳过此次4KB的表
		offset += 0x400000 // 跳过4MB数据

		// 如果下一个偏移已经超出文件大小，停止
		if offset >= uint64(fileSize) {
			break
		}
	}

	// 批量读取所有VFS表数据
	fmt.Printf(" > 正在批量读取 %d 个VFS表块...\n", len(readBlocks))
	var tempVfs []byte

	// 初始化 BlockTracker
	tracker := NewBlockTracker(uint64(fileSize))
	SetGlobalBlockTracker(tracker)

	for i, block := range readBlocks {
		currentOffset := offsets[i]

		// 记录当前偏移到文本文件
		vtoFile.WriteString(fmt.Sprintf("0x%X\n", currentOffset))

		// 读取数据
		data, err := mapper.ReadData(int64(block.offset), block.size)
		if err != nil {
			return false, fmt.Errorf("读取数据失败: %v", err)
		}

		// 标记当前块为已访问
		tracker.MarkVisited(uint64(block.offset))

		// 写入VFS表数据到输出文件
		vtFile.Write(data)

		// 添加到临时缓冲区
		tempVfs = append(tempVfs, data...)

		// 输出进度（每处理10个块输出一次进度）
		if (i+1)%10 == 0 || (i+1) == len(readBlocks) {
			fmt.Printf(" > 已处理 %d/%d 个VFS表块\n", i+1, len(readBlocks))
		}
	}

	// 保存到全局数组
	VfsTablesArr = tempVfs

	fmt.Printf(" > VFS偏移: %s\\VfsOffsets.txt\n", ThisXorObj.RootDirName)
	fmt.Printf(" > VFS表: %s\\VfsTable.hex\n", ThisXorObj.RootDirName)
	fmt.Printf(" > 共处理 %d 个VFS表块，总大小: %d 字节\n", len(readBlocks), len(VfsTablesArr))
	fmt.Println(" > VFS表处理完成")

	return len(VfsTablesArr) > 0, nil
}

// 从.xor文件中读取数据
func ReadDataFromXor(vfsOffset, blockSize uint64) ([]byte, error) {
	// 检查VFS表是否加载
	if len(VfsTablesArr) == 0 {
		return nil, fmt.Errorf("VFS表未加载")
	}

	// 检查Xor文件路径是否设置
	if ThisXorObj.Path == "" {
		return nil, fmt.Errorf("当前未设置.xor文件路径")
	}

	// 计算VFS表偏移
	vfsOffsets, err := calculateVfsOffsets(blockSize, vfsOffset)
	if err != nil {
		return nil, err
	}

	// 计算最后一个偏移值的大小
	lastOffsetSize := blockSize % 0x1000
	if lastOffsetSize == 0 {
		lastOffsetSize = 0x1000
	}

	// 获取内存映射器实例
	mapper := GetMemoryMapperInstance()

	// 确保文件已打开
	err = mapper.OpenFile(ThisXorObj.Path)
	if err != nil {
		return nil, fmt.Errorf("打开文件失败: %v", err)
	}

	// 获取文件大小
	fileSize := mapper.GetFileSize()

	// 准备批量读取列表
	var readBlocks []struct {
		offset uint64
		size   uint32
	}
	// var realOffsets []uint64

	// 获取全局 BlockTracker
	tracker := GetGlobalBlockTracker()

	for i, offset := range vfsOffsets {
		realOffset := RawToRealOffset(offset)
		readSize := uint32(0x1000)
		if i == len(vfsOffsets)-1 {
			readSize = uint32(lastOffsetSize)
		}

		// 检查偏移是否有效
		if realOffset >= uint64(fileSize) {
			fmt.Printf("警告: 偏移 %d 超出文件范围\n", realOffset)
			continue
		}

		// 调整读取大小，确保不超出文件范围
		if realOffset+uint64(readSize) > uint64(fileSize) {
			readSize = uint32(uint64(fileSize) - realOffset)
			fmt.Printf("警告: 在偏移 %d 处调整读取大小为 %d 字节\n", realOffset, readSize)
		}

		// 标记已访问的块
		if tracker != nil {
			tracker.MarkVisited(realOffset)
		}

		readBlocks = append(readBlocks, struct {
			offset uint64
			size   uint32
		}{offset: realOffset, size: readSize})
		// realOffsets = append(realOffsets, realOffset)
	}

	// 批量读取所有块
	var result []byte
	for _, block := range readBlocks {
		data, err := mapper.ReadData(int64(block.offset), block.size)
		if err != nil {
			return nil, fmt.Errorf("读取数据失败: %v", err)
		}

		// 添加到结果
		result = append(result, data...)
	}

	// 检查结果大小是否匹配
	if uint64(len(result)) != blockSize {
		fmt.Printf("警告: 请求 %d 字节，但实际读取 %d 字节\n", blockSize, len(result))
	}

	return result, nil
}
