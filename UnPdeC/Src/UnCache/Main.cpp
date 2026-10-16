// UnCache 工具：
// 解析并解压游戏/应用生成的 .cache 文件，恢复出原始数据。
// 根据文件头中的标志（sizeFlag）判断数据布局与是否需要解压，
// 对于 .lua.cache 文件，会输出为 .luac。
//
// 用法：
//   UnCache <input_file.cache> [-log d]
//   -log d: 启用 Debug 级别日志（输出更详细的信息）
//
// 也可以将 .cache 关联到 UnCache.exe 直接双击打开。

#include "CacheParser.h"
#include "Logger.h"

#include <exception>
#include <filesystem>
#include <format>
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

// 打印用法信息
static void PrintUsage() {
	LOG_INFO("Usage: UnCache <input_file.cache> [-log d]");
	LOG_INFO("  -log d  Enable debug-level logging");
	LOG_INFO("Or set the .cache file to open as UnCache.exe");
	LOG_INFO("请提供正确的输入文件路径。");
}

// 解析命令行参数，提取输入文件路径和是否启用 Debug 日志。
// 返回 false 表示未提供有效的输入文件。
static bool ParseArguments(int argc, char* argv[],
                           std::string& inputFile, bool& debugLog) {
	debugLog = false;
	bool foundFile = false;

	for (int i = 1; i < argc; ++i) {
		std::string_view arg = argv[i];

		if (arg == "-log" && i + 1 < argc) {
			// -log 后面需要跟一个级别参数
			std::string_view level = argv[++i];
			if (level == "d" || level == "D") {
				debugLog = true;
			}
		} else if (!arg.starts_with('-') && !foundFile) {
			// 第一个非 - 开头的参数视为输入文件
			inputFile = std::string(arg);
			foundFile = true;
		}
	}

	return foundFile;
}

int main(int argc, char* argv[]) {
	std::string inputFilePath;
	bool debugLog = false;

	if (!ParseArguments(argc, argv, inputFilePath, debugLog)) {
		PrintUsage();
		return 1;
	}

	// 配置日志级别
	Logger::getInstance().setLevel(debugLog ? LogLevel::Debug : LogLevel::Info);

	try {
		std::filesystem::path input_file = inputFilePath;
		if (!std::filesystem::exists(input_file)) {
			throw std::runtime_error("Input file not found");
		}

		auto filename = input_file.filename().string();
		auto directory = input_file.parent_path();

		LOG_DEBUG(std::format("Processing file: {}", filename));
		LOG_DEBUG(std::format("Output directory: {}", directory.string()));

		// 以二进制形式读取整个 .cache 文件到内存
		std::ifstream file(input_file, std::ios::binary);
		std::vector<uint8_t> fileData((std::istreambuf_iterator<char>(file)),
		                               std::istreambuf_iterator<char>());
		file.close();

		LOG_DEBUG(std::format("Raw file size: {} bytes", fileData.size()));

		// 计算依赖信息块偏移（零拷贝，仅计算大小）
		auto depOffset = CalculateDependenceOffset(fileData);

		// 预处理并解压出实际数据（传入偏移量动态定位 LZ 数据区域）
		auto decryptedData = PreProcess(fileData, filename, depOffset);
		LOG_DEBUG(std::format("Decrypted data size: {} bytes", decryptedData.size()));

		// 决定输出文件名：
		// - 对于 *.lua.cache -> *.luac；
		// - 其他情况则去掉末尾的 ".cache"。
		std::filesystem::path output_file;
		if (filename.length() >= 10 && filename.substr(filename.length() - 10) == ".lua.cache") {
			std::string base_name = filename.substr(0, filename.length() - 10);
			output_file = directory / (base_name + ".luac");
			LOG_DEBUG("Detected .lua.cache file, output as .luac format");
		} else {
			output_file = directory / filename.substr(0, filename.length() - 6);
		}

		LOG_DEBUG(std::format("Writing to: {}", output_file.string()));

		// 写入文件
		std::ofstream outFile(output_file, std::ios::binary);
		if (!outFile) {
			throw std::runtime_error("Failed to create output file");
		}
		outFile.write(reinterpret_cast<const char*>(decryptedData.data()),
		              decryptedData.size());
		outFile.close();

		// 简单确认输出文件写入成功并打印大小
		if (std::filesystem::exists(output_file)) {
			LOG_INFO(std::format("Successfully created: {} ({} bytes)",
				output_file.filename().string(),
				std::filesystem::file_size(output_file)));
		} else {
			throw std::runtime_error("Failed to verify output file");
		}
	} catch (const std::exception& e) {
		LOG_INFO(std::format("Error: {}", e.what()));
		return 1;
	}

	return 0;
}
