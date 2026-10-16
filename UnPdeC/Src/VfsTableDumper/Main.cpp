// VFS 表导出工具：从 .xor 文件中按固定间隔抽取 0x1000 字节块，
// 并将块起始偏移记录到文本文件，将原始数据写入二进制文件。

#include <algorithm>
#include <cctype>
#include <exception>
#include <filesystem>
#include <format>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

// 为 std::filesystem 命名空间起别名，方便书写
namespace fs = std::filesystem;

// 处理一个 .xor 文件：
// 1. 计算文件大小；
// 2. 以 0x400000 字节为步长，在每个区块内读取 0x1000 字节数据；
// 3. 将每个数据块的起始偏移写入 vto 文本文件；
// 4. 将数据块内容拼接写入 vt 二进制文件。
static bool ProcessXorFile(const fs::path& xorFilePath) {
	std::cout << "处理文件: " << xorFilePath.string() << std::endl;

	// 以二进制方式打开输入文件
	std::ifstream xorFile(xorFilePath, std::ios::binary);
	if (!xorFile) {
		std::cerr << "无法打开文件: " << xorFilePath.string() << std::endl;
		return false;
	}

	// 移动到文件末尾获取文件大小，然后复位到开头
	xorFile.seekg(0, std::ios::end);
	std::streamsize fileSize = xorFile.tellg();
	xorFile.seekg(0, std::ios::beg);

	// 使用原始文件名（不含扩展名）作为输出文件名前缀
	fs::path stemName = xorFilePath.stem();
	// 输出目录与输入文件相同
	fs::path outputDir = xorFilePath.parent_path();

	// vto: 记录每个数据块的起始偏移（文本）
	fs::path vtoFilePath = outputDir / (stemName.string() + "-vto.txt");
	// vt: 保存所有提取出来的数据块（原始二进制）
	fs::path vtFilePath = outputDir / (stemName.string() + "-vt.hex");

	// 打开输出文件
	std::ofstream vtoFile(vtoFilePath);
	std::ofstream vtFile(vtFilePath, std::ios::binary);

	if (!vtoFile || !vtFile) {
		std::cerr << "无法创建输出文件" << std::endl;
		return false;
	}

	// 每次读取 0x1000 字节到缓冲区
	std::vector<char> buffer(0x1000);
	// 当前块的起始偏移
	std::streamsize offset = 0;

	// 循环处理整个文件，直到到达或超过文件尾
	while (offset < fileSize) {
		// 将当前块起始偏移写入 vto 文本文件（十六进制）
		vtoFile << std::format("0x{:X}\n", offset);
		std::cout << std::format("读取偏移: 0x{:X}\n", offset);

		// 跳转到当前偏移位置，读取 0x1000 字节
		xorFile.seekg(offset);
		xorFile.read(buffer.data(), 0x1000);

		// 如果剩余数据不足 0x1000 字节，则读取到文件结尾为止
		if (xorFile.gcount() != 0x1000) {
			std::cerr << std::format("警告: 在偏移0x{:X}处无法读取完整的0x1000字节\n", offset);
			vtFile.write(buffer.data(), xorFile.gcount());
			break;
		}

		// 正常情况下将完整的 0x1000 字节写入 vt 输出文件
		vtFile.write(buffer.data(), 0x1000);

		// 跳到下一个区块：先移动一个块大小，再跨过 0x400000 字节间隔
		offset += 0x1000;
		offset += 0x400000;

		// 如果已经超出文件大小则退出
		if (offset >= fileSize) {
			break;
		}
	}

	std::cout << "处理完成: " << xorFilePath.string() << std::endl;
	std::cout << "偏移记录已保存到: " << vtoFilePath.string() << std::endl;
	std::cout << "VFS表数据已保存到: " << vtFilePath.string() << std::endl;

	return true;
}

// 遍历指定目录，自动处理其中所有扩展名为 .xor 的文件
void ProcessAllXorFiles(const fs::path& directory) {
	std::cout << "处理目录: " << directory.string() << std::endl;

	for (const auto& entry : fs::directory_iterator(directory)) {
		// 只处理普通文件，并且扩展名必须为 .xor
		if (entry.is_regular_file() && entry.path().extension() == ".xor") {
			ProcessXorFile(entry.path());
		}
	}
}

// 程序入口：
// - 如果命令行提供了参数，则将每个参数视作待处理的 .xor 文件路径；
// - 如果没有提供参数，则默认处理当前工作目录下的所有 .xor 文件。
int main(int argc, char* argv[]) {
	try {
		if (argc > 1) {
			// 记录是否有至少一个文件处理成功
			bool processedAnyFile = false;

			// 从第一个参数开始依次处理
			for (int i = 1; i < argc; i++) {
				fs::path filePath = argv[i];

				// 先检查文件是否存在
				if (!fs::exists(filePath)) {
					std::cerr << "文件不存在: " << filePath.string() << std::endl;
					continue;
				}

				// 将扩展名转为小写，便于比较
				std::string extension = filePath.extension().string();
				std::transform(extension.begin(), extension.end(), extension.begin(),
					[](unsigned char c) { return static_cast<char>(std::tolower(c)); });

				// 只接受 .xor 文件
				if (extension != ".xor") {
					std::cerr << "不是.xor文件: " << filePath.string() << std::endl;
					continue;
				}

				// 实际处理文件，如果成功则标记
				if (ProcessXorFile(filePath)) {
					processedAnyFile = true;
				}
			}

			// 如果一个文件都没有成功处理，则返回错误码
			if (!processedAnyFile) {
				std::cerr << "未能成功处理任何文件" << std::endl;
				return 1;
			}
		}
		else {
			// 无参数时，处理当前工作目录下所有 .xor 文件
			ProcessAllXorFiles(fs::current_path());
		}

		std::cout << "所有文件处理完成!" << std::endl;
	}
	catch (const std::exception& e) {
		// 捕获所有 std::exception，并输出错误信息
		std::cerr << "发生错误: " << e.what() << std::endl;
		return 1;
	}

	return 0;
}
