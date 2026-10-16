package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"sync"
)

// BlockTracker 块跟踪器结构体
type BlockTracker struct {
	totalBlocks uint64
	visitedMap  []bool
}

var (
	globalBlockTracker *BlockTracker
	blockTrackerMutex  sync.Mutex
)

// NewBlockTracker 创建新的块跟踪器
func NewBlockTracker(fileSize uint64) *BlockTracker {
	totalBlocks := (fileSize + 0xFFF) / 0x1000
	return &BlockTracker{
		totalBlocks: totalBlocks,
		visitedMap:  make([]bool, totalBlocks),
	}
}

// MarkVisited 标记块为已访问
func (bt *BlockTracker) MarkVisited(physicalOffset uint64) {
	blockIdx := physicalOffset / 0x1000
	if blockIdx < bt.totalBlocks {
		bt.visitedMap[blockIdx] = true
	}
}

// IsVisited 检查块是否已访问
func (bt *BlockTracker) IsVisited(blockIdx uint64) bool {
	if blockIdx < bt.totalBlocks {
		return bt.visitedMap[blockIdx]
	}
	return false
}

// TotalBlocks 获取总块数
func (bt *BlockTracker) TotalBlocks() uint64 {
	return bt.totalBlocks
}

// GetVisitedMap 获取访问映射
func (bt *BlockTracker) GetVisitedMap() []bool {
	return bt.visitedMap
}

// GetGlobalBlockTracker 获取全局块跟踪器实例
func GetGlobalBlockTracker() *BlockTracker {
	blockTrackerMutex.Lock()
	defer blockTrackerMutex.Unlock()
	return globalBlockTracker
}

// SetGlobalBlockTracker 设置全局块跟踪器
func SetGlobalBlockTracker(tracker *BlockTracker) {
	blockTrackerMutex.Lock()
	defer blockTrackerMutex.Unlock()
	globalBlockTracker = tracker
}

// ExportAccessedListWithMissingDetection 导出已访问块列表并检测缺失块
func ExportAccessedListWithMissingDetection(tracker *BlockTracker, filename string) error {
	totalBlocks := tracker.TotalBlocks()
	visitedMap := tracker.GetVisitedMap()

	// 存储已访问的块地址
	var accessedBlocks []uint64
	for i := uint64(0); i < totalBlocks; i++ {
		if visitedMap[i] {
			blockStart := i * 0x1000
			accessedBlocks = append(accessedBlocks, blockStart)
		}
	}

	// 按地址排序
	sort.Slice(accessedBlocks, func(i, j int) bool {
		return accessedBlocks[i] < accessedBlocks[j]
	})

	// 检测缺失的块
	var missingBlocks []uint64
	if len(accessedBlocks) > 0 {
		startAddr := accessedBlocks[0]
		endAddr := accessedBlocks[len(accessedBlocks)-1]

		// 创建集合来快速查找已访问的块
		accessedSet := make(map[uint64]bool)
		for _, addr := range accessedBlocks {
			accessedSet[addr] = true
		}

		// 检查从第一个到最后一个之间的所有块
		for addr := startAddr; addr <= endAddr; addr += 0x1000 {
			if !accessedSet[addr] {
				missingBlocks = append(missingBlocks, addr)
			}
		}
	}

	// 打印未覆盖的区域信息
	if len(missingBlocks) > 0 {
		fmt.Println("\n未覆盖的区域 (未访问的块):")
		fmt.Println("========================================")

		// 按范围分组显示未覆盖的区域
		rangeStart := missingBlocks[0]
		rangeEnd := rangeStart

		for i := 1; i < len(missingBlocks); i++ {
			if missingBlocks[i] == rangeEnd+0x1000 {
				// 连续块，扩展范围
				rangeEnd = missingBlocks[i]
			} else {
				// 不连续块，输出当前范围
				blockCount := (rangeEnd-rangeStart)/0x1000 + 1
				fmt.Printf("0x%X - 0x%X (%d 块)\n", rangeStart, rangeEnd, blockCount)

				// 开始新范围
				rangeStart = missingBlocks[i]
				rangeEnd = rangeStart
			}
		}

		// 输出最后一个范围
		blockCount := (rangeEnd-rangeStart)/0x1000 + 1
		fmt.Printf("0x%X - 0x%X (%d 块)\n", rangeStart, rangeEnd, blockCount)

		fmt.Println("========================================")
		fmt.Printf(" > BlockTracker 总共 %d 个未访问块\n", len(missingBlocks))
	}

	// 创建JSON对象
	result := map[string]interface{}{
		"accessed": []string{},
		"stats": map[string]interface{}{
			"total_blocks":        totalBlocks,
			"accessed_blocks":     len(accessedBlocks),
			"missing_blocks":      len(missingBlocks),
			"coverage_percentage": 0.0,
		},
	}

	// 添加已访问的块地址数组
	accessedArray := make([]string, 0, len(accessedBlocks))
	for _, addr := range accessedBlocks {
		accessedArray = append(accessedArray, fmt.Sprintf("0x%X", addr))
	}
	result["accessed"] = accessedArray

	// 添加缺失的块地址数组
	if len(missingBlocks) > 0 {
		missingArray := make([]string, 0, len(missingBlocks))
		for _, addr := range missingBlocks {
			missingArray = append(missingArray, fmt.Sprintf("0x%X", addr))
		}
		result["missing"] = missingArray
	}

	// 计算覆盖率
	if totalBlocks > 0 {
		result["stats"].(map[string]interface{})["coverage_percentage"] =
			float64(len(accessedBlocks)) * 100.0 / float64(totalBlocks)
	}

	// 写入文件
	file, err := os.Create(filename)
	if err != nil {
		return fmt.Errorf("创建文件失败: %v", err)
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "    ")
	if err := encoder.Encode(result); err != nil {
		return fmt.Errorf("写入JSON失败: %v", err)
	}

	fmt.Printf(" > BlockTracker已导出至: %s\n", filename)
	return nil
}
