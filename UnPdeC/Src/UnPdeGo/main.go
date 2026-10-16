package main

import (
	"fmt"
	"os"
)

func main() {
	// 设置控制台标题
	SetConsoleTitleWithVersion()

	// 打印程序信息
	PrintAppInfo()

	// 查找所有Xor文件
	xorFiles := FindXorFile()
	if len(xorFiles) == 0 {
		fmt.Println(" ! 没有找到Xor文件\n\n > 按任意键退出")
		fmt.Scanln()
		os.Exit(-1)
	}

	// 处理所有找到的Xor文件
	for _, xorFile := range xorFiles {
		// 解压选项
		GetHasCacheMode()

		// 初始化工具
		Init(xorFile)

		// 使用VFS表递归的方式解压
		ExtractRecursive()

		// 复位所有静态变量,为下次解压做准备
		Reset()
		PrintLine()
	}

	fmt.Println("\n > Xor文件解压完成!")
	PrintLine()

	fmt.Print("按任意键继续...")
	fmt.Scanln()
}
