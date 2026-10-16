package main

import (
	"fmt"
	"runtime"
	"syscall"
	"unsafe"
)

// 设置控制台标题
func SetConsoleTitleWithVersion() {
	if runtime.GOOS == "windows" {
		// 使用 Windows API 设置控制台标题
		kernel32 := syscall.NewLazyDLL("kernel32.dll")
		setConsoleTitle := kernel32.NewProc("SetConsoleTitleW")

		// 转换为 UTF-16 字符串
		title := "UnPdeGO"
		ptr, err := syscall.UTF16PtrFromString(title)
		if err != nil {
			fmt.Printf("转换字符串失败: %v\n", err)
			return
		}

		// 调用 SetConsoleTitleW
		ret, _, err := setConsoleTitle.Call(uintptr(unsafe.Pointer(ptr)))
		if ret == 0 {
			fmt.Printf("设置控制台标题失败: %v\n", err)
		}
	} else {
		// 对于非 Windows 系统，使用 ANSI 转义序列
		fmt.Print("\033]0;UnPdeGO\007")
	}
}

// 打印程序信息
func PrintAppInfo() {
	const appInfo = `
  ██    ██ ███    ██ ██████  ██████  ███████  ██████   ██████  
  ██    ██ ████   ██ ██   ██ ██   ██ ██      ██       ██    ██ 
  ██    ██ ██ ██  ██ ██████  ██   ██ █████   ██   ███ ██    ██ 
  ██    ██ ██  ██ ██ ██      ██   ██ ██      ██    ██ ██    ██ 
   ██████  ██   ████ ██      ██████  ███████  ██████   ██████  
                                                                                                                   
-----------------------------------------------------------

`
	fmt.Print(appInfo)
}

// 打印间隔线
func PrintLine() {
	fmt.Println("-----------------------------------------------------------")
}
