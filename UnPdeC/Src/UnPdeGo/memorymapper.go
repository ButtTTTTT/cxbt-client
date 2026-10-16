package main

import (
	"os"
	"sync"
)

// 内存映射器
type MemoryMapper struct {
	file     *os.File
	fileSize int64
	mu       sync.Mutex
}

var (
	memoryMapperInstance *MemoryMapper
	memoryMapperOnce     sync.Once
)

// 获取单例实例
func GetMemoryMapperInstance() *MemoryMapper {
	memoryMapperOnce.Do(func() {
		memoryMapperInstance = &MemoryMapper{}
	})
	return memoryMapperInstance
}

// 打开文件
func (mm *MemoryMapper) OpenFile(filePath string) error {
	mm.mu.Lock()
	defer mm.mu.Unlock()

	if mm.file != nil {
		mm.file.Close()
	}

	file, err := os.Open(filePath)
	if err != nil {
		return err
	}

	info, err := file.Stat()
	if err != nil {
		file.Close()
		return err
	}

	mm.file = file
	mm.fileSize = info.Size()
	return nil
}

// 关闭文件
func (mm *MemoryMapper) CloseFile() error {
	mm.mu.Lock()
	defer mm.mu.Unlock()

	if mm.file != nil {
		err := mm.file.Close()
		mm.file = nil
		mm.fileSize = 0
		return err
	}
	return nil
}

// 获取文件大小
func (mm *MemoryMapper) GetFileSize() int64 {
	mm.mu.Lock()
	defer mm.mu.Unlock()
	return mm.fileSize
}

// 读取数据
func (mm *MemoryMapper) ReadData(offset int64, size uint32) ([]byte, error) {
	mm.mu.Lock()
	defer mm.mu.Unlock()

	if mm.file == nil {
		return nil, os.ErrClosed
	}

	if offset >= mm.fileSize {
		return nil, nil
	}

	if offset+int64(size) > mm.fileSize {
		size = uint32(mm.fileSize - offset)
	}

	buf := make([]byte, size)
	_, err := mm.file.ReadAt(buf, offset)
	if err != nil {
		return nil, err
	}

	return buf, nil
}
