package main

import (
	"bufio"
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// ExtractTask 表示一个文件解压任务
type ExtractTask struct {
	Entry   HexOffsetInfo
	BaseDir string
}

// 全局统计变量
var (
	totalDirsCreated    int32
	totalFilesProcessed int32
	totalBytesWritten   int64
)

// 解析文件或目录的偏移信息
func parseOffsetInfo(data []byte) []HexOffsetInfo {
	const blockSize = 0x80
	blockCount := len(data) / blockSize

	var offsetInfos []HexOffsetInfo

	for blockIndex := 0; blockIndex < blockCount; blockIndex++ {
		blockStart := blockIndex * blockSize
		block := data[blockStart : blockStart+blockSize]

		// 读取条目类型（第一个字节）
		entryType := block[0]
		if entryType != 1 && entryType != 2 {
			continue
		}

		// 查找名称结束位置（从第二个字节开始查找'\0'）
		nameEnd := -1
		for i := 1; i < len(block); i++ {
			if block[i] == 0 {
				nameEnd = i
				break
			}
		}

		// 名称有效性检查
		if nameEnd == -1 || nameEnd-1 >= 0x6f {
			fmt.Println("获取名称尾部失败！跳过！")
			continue
		}

		// 从字节数据构造名称字符串
		entryName := string(block[1:nameEnd])

		// 读取大小和偏移信息（最后8字节）
		entrySize := binary.LittleEndian.Uint32(block[blockSize-4:])
		originalOffset := binary.LittleEndian.Uint32(block[blockSize-8:])

		// 读取NTFS时间戳（偏移0x70-0x77，共8字节）
		ntfsTime := binary.LittleEndian.Uint64(block[0x70:])

		// 转换NTFS时间戳为Unix时间戳
		const windowsTick = 10000000
		const secToUnixEpoch = 11644473600
		secondsSince1601 := ntfsTime / windowsTick
		unixTime := time.Unix(int64(secondsSince1601-secToUnixEpoch), 0)

		// 创建偏移信息结构并添加到结果向量
		offsetInfos = append(offsetInfos, HexOffsetInfo{
			Type:           entryType,
			Name:           entryName,
			UnixTime:       unixTime,
			Size:           entrySize,
			OriginalOffset: originalOffset,
		})
	}

	return offsetInfos
}

// 保存解析内容到文件系统
func saveExtractedData(entries []HexOffsetInfo, directory DirectoryPair, taskChan chan<- ExtractTask) {
	baseDir := filepath.Join(AppDir, directory.CurrentDir)

	for _, entry := range entries {
		tryExtractEntry(entry, baseDir, directory, taskChan)
	}
}

// 尝试解析指定偏移的数据
func tryExtract(offset, size uint32, directory DirectoryPair, taskChan chan<- ExtractTask) {
	// 读取VFS数据块
	vfsDataBlock, err := ReadDataFromXor(uint64(offset), uint64(size))
	if err != nil {
		fmt.Printf("读取VFS数据失败: %v\n", err)
		return
	}

	// 解析文件或目录信息
	entries := parseOffsetInfo(vfsDataBlock)

	// 保存到文件系统，传递任务通道
	saveExtractedData(entries, directory, taskChan)
}

// 尝试解析单个条目
func tryExtractEntry(entry HexOffsetInfo, baseDir string, directory DirectoryPair, taskChan chan<- ExtractTask) {
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("处理条目失败: %v\n", r)
		}
	}()

	switch entry.Type {
	case 1: // 文件处理
		// 发送文件任务到通道
		taskChan <- ExtractTask{Entry: entry, BaseDir: baseDir}
	case 2: // 目录处理
		processDirectoryEntry(entry, baseDir, directory, taskChan)
	default:
		fmt.Printf("未知的条目类型: %d\n", entry.Type)
	}
}

// 处理文件条目
func processFileEntry(entry HexOffsetInfo, baseDir string) {
	// 文件名处理优化
	finalName := entry.Name
	needProcessData := false

	if !CacheMode {
		// 使用后缀检查替代字符串查找
		if strings.HasSuffix(entry.Name, ".lua.cache") {
			finalName = strings.TrimSuffix(entry.Name, ".cache")
			needProcessData = true
		} else if strings.HasSuffix(entry.Name, ".lua") {
			finalName = entry.Name + "c"
		} else if pos := strings.Index(entry.Name, ".cache"); pos != -1 {
			finalName = entry.Name[:pos]
			needProcessData = true
		}
	} else if strings.Contains(entry.Name, ".cache") {
		needProcessData = false
	}

	// 路径构建优化
	filePath := filepath.Join(baseDir, finalName)
	if _, err := os.Stat(filePath); err == nil {
		return // 文件已存在
	}

	// 数据读取优化
	// fmt.Printf("△ File: %s\n", finalName)
	fileData, err := ReadDataFromXor(uint64(entry.OriginalOffset), uint64(entry.Size))
	if err != nil {
		fmt.Printf("读取文件数据失败: %v\n", err)
		return
	}

	// 数据校验增强
	if len(fileData) != int(entry.Size) || len(fileData) == 0 || entry.Name == "" {
		fmt.Printf("数据校验失败: %s\n", finalName)
		return
	}

	// 数据处理优化
	var processedData []byte
	if needProcessData {
		processedData, err = PreExtract(fileData, entry.Name)
		if err != nil {
			fmt.Printf("预处理数据失败: %v\n", err)
			return
		}
	} else {
		processedData = fileData
	}

	// 确保目录存在
	dirPath := filepath.Dir(filePath)
	if err := os.MkdirAll(dirPath, 0755); err != nil {
		fmt.Printf("创建目录失败: %v\n", err)
		return
	}

	// 文件写入优化（使用缓冲写入）
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		file, err := os.Create(filePath)
		if err != nil {
			fmt.Printf("创建文件失败: %v\n", err)
			return
		}
		defer file.Close()

		writer := bufio.NewWriter(file)
		_, err = writer.Write(processedData)
		if err != nil {
			fmt.Printf("写入文件失败: %v\n", err)
			return
		}
		writer.Flush() // 确保所有数据写入磁盘

		// 更新统计
		atomic.AddInt32(&totalFilesProcessed, 1)
		atomic.AddInt64(&totalBytesWritten, int64(len(processedData)))
	}
}

// 处理目录条目
func processDirectoryEntry(entry HexOffsetInfo, baseDir string, directory DirectoryPair, taskChan chan<- ExtractTask) {
	dirPath := filepath.Join(baseDir, entry.Name)

	if _, err := os.Stat(dirPath); os.IsNotExist(err) {
		fmt.Printf("▲ Dir: %s\n", filepath.Base(dirPath))

		if err := os.MkdirAll(dirPath, 0755); err != nil {
			fmt.Printf("创建目录失败: %s (%v)\n", dirPath, err)
			return
		}

		// 更新目录创建统计
		atomic.AddInt32(&totalDirsCreated, 1)

		// 递归参数优化，传递任务通道
		tryExtract(entry.OriginalOffset, entry.Size, DirectoryPair{
			ParentDir:  directory.CurrentDir,
			CurrentDir: filepath.Join(directory.CurrentDir, entry.Name),
		}, taskChan)
	}
}

// 通过递归VFS表来解析提取文件
func ExtractRecursive() {
	start := time.Now()
	defer func() {
		elapsed := time.Since(start)
		fmt.Printf(" > 解压完成，总耗时: %v\n", elapsed)
	}()

	// 重置统计变量
	atomic.StoreInt32(&totalDirsCreated, 0)
	atomic.StoreInt32(&totalFilesProcessed, 0)
	atomic.StoreInt64(&totalBytesWritten, 0)

	fmt.Printf("\n > 开始解压 %s\n", ThisXorObj.Name)

	// 创建任务通道和 Worker 池
	numWorkers := 4 // 对于I/O密集型任务，4个Worker通常是最佳选择
	taskChan := make(chan ExtractTask, numWorkers*10)
	var wg sync.WaitGroup

	// 启动 Worker goroutine
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for task := range taskChan {
				processFileEntry(task.Entry, task.BaseDir)
			}
		}(i)
	}

	// 创建根目录结构
	rootDir := DirectoryPair{
		ParentDir:  ThisXorObj.RootDirName,
		CurrentDir: ThisXorObj.RootDirName,
	}

	// 启动递归解析流程，传递任务通道
	tryExtract(0, 0x1000, rootDir, taskChan)

	// 关闭任务通道并等待所有 Worker 完成
	close(taskChan)
	wg.Wait()

	// 解析完成后生成分析结果
	if tracker := GetGlobalBlockTracker(); tracker != nil {
		// 确保输出目录存在
		outputDir := filepath.Join(AppDir, ThisXorObj.RootDirName)
		if err := os.MkdirAll(outputDir, 0755); err != nil {
			fmt.Printf("创建输出目录失败: %v\n", err)
		} else {
			// 导出已访问块列表（带缺失检测）
			jsonPath := filepath.Join(outputDir, "BlockTracker.json")
			if err := ExportAccessedListWithMissingDetection(tracker, jsonPath); err != nil {
				fmt.Printf("导出BlockTracker失败: %v\n", err)
			}
		}
	}

	// 打印统计信息
	dirsCreated := atomic.LoadInt32(&totalDirsCreated)
	filesProcessed := atomic.LoadInt32(&totalFilesProcessed)
	bytesWritten := atomic.LoadInt64(&totalBytesWritten)

	fmt.Printf(" > 统计: 创建了 %d 个目录, 处理了 %d 个文件, 总共写入 %s 数据\n",
		dirsCreated, filesProcessed, formatBytes(bytesWritten))

	// 清理资源
	mapper := GetMemoryMapperInstance()
	if err := mapper.CloseFile(); err != nil {
		fmt.Printf("清理失败: %v\n", err)
	}

	fmt.Println(" > 解压完成")
}

func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}
