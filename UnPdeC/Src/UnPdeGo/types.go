package main

import (
	"time"
)

// 当前xor文件信息结构体
type ThisXor struct {
	Name        string
	Size        int64
	Path        string
	JsonPath    string
	RootDirName string
	OutputPath  string
}

// 文件夹路径信息结构体
type DirectoryPair struct {
	ParentDir  string
	CurrentDir string
}

// 文件/目录偏移量元信息结构体
type HexOffsetInfo struct {
	Type           uint8
	Name           string
	UnixTime       time.Time
	Size           uint32
	OriginalOffset uint32
}

// 数据块解析信息结构体
type BlockMeta struct {
	IsValid         bool
	Type            string
	Name            string
	RawOffset       string
	RealOffset      string
	Size            string
	BlockRealOffset string
	BlockRawOffset  string
}

// 文件/目录保存元信息结构体
type MataSaveInfo struct {
	Type          string
	Name          string
	RawOffset     uint64
	Size          uint64
	DirectoryPath string
}

// 回溯引用信息结构体
type BackReferenceInfo struct {
	Offset        uint32
	Length        uint32
	BytesConsumed uint32
}

// 解压状态结构体
type DecompressionState struct {
	ControlWord uint32
	SourceIndex uint32
	DestIndex   uint32
	TargetSize  uint32
}

// 创建解压状态
func NewDecompressionState(size uint32) *DecompressionState {
	return &DecompressionState{
		ControlWord: 1,
		TargetSize:  size,
	}
}

// 检查是否已完成解压
func (ds *DecompressionState) IsComplete() bool {
	return ds.DestIndex >= ds.TargetSize
}

// 检查是否有足够空间
func (ds *DecompressionState) HasEnoughSpace(needed uint32) bool {
	if needed == 0 {
		needed = 10
	}
	return ds.DestIndex < ds.TargetSize-needed
}
