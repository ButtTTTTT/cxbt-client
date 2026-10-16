package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// 初始化工具类
func Init(xorFile ThisXor) error {
	fmt.Println("\n > 正在初始化Tools")

	// 设置输出根目录名称
	xorFile.RootDirName = OutputDirectoryName(xorFile.Name)

	// 创建输出目录
	outputPath := filepath.Join(AppDir, xorFile.RootDirName)
	xorFile.OutputPath = outputPath

	// 保存到全局变量
	SetThisXor(xorFile)
	fmt.Printf(" > 输出目录: %s\n", xorFile.RootDirName)

	// 创建目录
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return fmt.Errorf("创建目录失败: %v", err)
	}

	// 处理VFS表
	vfsDumped, err := DumpVfsTable(xorFile.Path)
	if err != nil || !vfsDumped {
		return fmt.Errorf("处理VFS表失败: %v", err)
	}

	fmt.Println(" > 初始化Tools完成")
	return nil
}

// 查找.xor文件
func FindXorFile() []ThisXor {
	fmt.Println(" > 开始查找XOR文件")

	exePath, err := os.Executable()
	if err != nil {
		fmt.Printf("获取可执行文件路径失败: %v\n", err)
		return nil
	}
	AppDir = filepath.Dir(exePath)

	var xorFiles []ThisXor

	// 使用 os.ReadDir 只读取当前目录，不递归子目录
	entries, err := os.ReadDir(AppDir)
	if err != nil {
		fmt.Printf("读取目录失败: %v\n", err)
		return nil
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue // 跳过目录
		}

		if strings.EqualFold(filepath.Ext(entry.Name()), ".xor") {
			info, err := entry.Info()
			if err != nil {
				continue // 跳过无法获取信息的文件
			}

			fileName := strings.TrimSuffix(info.Name(), filepath.Ext(info.Name()))
			xorFile := ThisXor{
				Name:     fileName,
				Size:     info.Size(),
				Path:     filepath.Join(AppDir, info.Name()),
				JsonPath: filepath.Join(AppDir, fileName+".json"),
			}
			xorFiles = append(xorFiles, xorFile)
		}
	}

	for i, file := range xorFiles {
		fmt.Printf("  %d: %s\n", i, file.Name)
	}

	SetXorArr(xorFiles)
	return xorFiles
}

// 转换为16进制字符串
func ToHexString(value uint64) string {
	return fmt.Sprintf("0x%X", value)
}

// 原始偏移值转换为实际偏移值
func RawToRealOffset(origOffset uint64) uint64 {
	shifted := origOffset >> 10
	intermediate := origOffset + shifted + 1
	return intermediate << 12
}

// 实际偏移值转换为原始偏移值
func RealToRawOffset(pdeOffset uint64) uint64 {
	return (pdeOffset >> 12) * 1024 / 1025
}

// 验证名称是否合法
func NameCheck(name string) bool {
	if len(name) == 0 || name[len(name)-1] == ' ' || name[len(name)-1] == '.' {
		return false
	}

	invalidChars := "\"*:<>?|\\/"
	for _, ch := range name {
		if ch < 0x20 || ch > 0x7E {
			return false
		}
		if strings.ContainsRune(invalidChars, ch) {
			return false
		}
	}
	return true
}

// 获取是否启用缓存模式
func GetHasCacheMode() {
	fmt.Print("\n > 缓存模式\n    [Y]启用: 不进行二次解压,直接导出.cache文件!\n    [N]禁用[推荐]: 进行二次解压,导出为解压后的文件! \n > 选择[默认N]: ")

	reader := bufio.NewReader(os.Stdin)
	input, _ := reader.ReadString('\n')
	input = strings.TrimSpace(input)

	var cacheMode bool
	if len(input) > 0 && (input[0] == 'Y' || input[0] == 'y') {
		cacheMode = true
	} else {
		cacheMode = false
	}

	CacheMode = cacheMode
	fmt.Printf(" > 缓存模式: %s\n", map[bool]string{true: "启用", false: "禁用"}[cacheMode])

	if !cacheMode {
		GetHasSaveFirst8Byte()
	}
}

// 获取是否保留前8字节
func GetHasSaveFirst8Byte() {
	fmt.Print("\n > 保留前8字节\n    [Y]启用: 保留包含文件特征和数量的8个字节!\n    [N]禁用[推荐]: 如果不是为了研究文件,那么可以选择此项!\n > 选择[默认N]: ")

	reader := bufio.NewReader(os.Stdin)
	input, _ := reader.ReadString('\n')
	input = strings.TrimSpace(input)

	var saveFirst8Byte bool
	if len(input) > 0 && (input[0] == 'Y' || input[0] == 'y') {
		saveFirst8Byte = true
	} else {
		saveFirst8Byte = false
	}

	SaveFirst8Byte = saveFirst8Byte
	fmt.Printf(" > 保留前8字节: %s\n", map[bool]string{true: "启用", false: "禁用"}[saveFirst8Byte])
}

// 获取解压目录名
func OutputDirectoryName(fileName string) string {
	baseName := strings.TrimSuffix(fileName, filepath.Ext(fileName))
	cacheSuffix := "_c"
	if !CacheMode {
		cacheSuffix = "_nc"
	}

	saveFirst8ByteSuffix := "_s8"
	if !SaveFirst8Byte {
		saveFirst8ByteSuffix = "_ns8"
	}

	return baseName + cacheSuffix + saveFirst8ByteSuffix
}
