package main

import (
	"fmt"
	"sync"
)

var (
	XorArr         []ThisXor
	ThisXorObj     ThisXor
	AppDir         string
	VfsTablesArr   []byte
	CacheMode      bool
	SaveFirst8Byte bool
	globalMutex    sync.Mutex
)

// 复位所有静态成员变量
func Reset() {
	globalMutex.Lock()
	defer globalMutex.Unlock()

	XorArr = nil
	ThisXorObj = ThisXor{}
	AppDir = ""
	VfsTablesArr = nil
	CacheMode = false
	SaveFirst8Byte = false

	fmt.Println("\n > 全局变量已重置")
}

// 设置当前Xor文件信息
func SetThisXor(xor ThisXor) {
	globalMutex.Lock()
	defer globalMutex.Unlock()
	ThisXorObj = xor
}

// 获取当前Xor文件信息
func GetThisXor() ThisXor {
	globalMutex.Lock()
	defer globalMutex.Unlock()
	return ThisXorObj
}

// 设置Xor文件数组
func SetXorArr(arr []ThisXor) {
	globalMutex.Lock()
	defer globalMutex.Unlock()
	XorArr = arr
}

// 获取Xor文件数组
func GetXorArr() []ThisXor {
	globalMutex.Lock()
	defer globalMutex.Unlock()
	return XorArr
}
