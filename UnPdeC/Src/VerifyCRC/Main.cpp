// VerifyCRC 工具：
// 给定文件或目录，计算路径和文件内容的 CRC 值，
// 并与文件头中记录的 CRC（大端序）进行比对，验证是否一致。

#include <cstdint>
#include <exception>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <Windows.h>

#include "LookupTable.h"

// 以“类 Unix”（正斜杠 /）的形式保存路径字符串：
// FilePath: 完整文件路径（相对于程序所在目录，形如 /cache/...）
// DirPath:  文件所在目录路径（不带结尾斜杠）
// DirPathWithSlash: 文件所在目录路径（带结尾斜杠）
struct UnixPaths {
	std::string FilePath;
	std::string DirPath;
	std::string DirPathWithSlash;
};

// 存放针对不同路径字符串计算出的 CRC 结果：
// FileHash: 针对 FilePath 的 CRC
// DirHash: 针对 DirPath 的 CRC
// DirHashWithSlash: 针对 DirPathWithSlash 的 CRC
struct UnixPathsResult {
	uint32_t FileHash;
	uint32_t DirHash;
	uint32_t DirHashWithSlash;
};

//static const unsigned char LookupTable[] = {};

// 对单个字节进行 CRC 更新：
// - 先用当前 hash 的低 8 位与输入字节进行异或；
// - 再用异或后的结果作为索引，从查找表中取 4 字节并与 hash 高 24 位混合。
static uint32_t ProcessByte(unsigned char byteValue, uint32_t hashValue) {
	byteValue ^= (unsigned char)hashValue;
	hashValue = (hashValue >> 8) ^ *reinterpret_cast<const uint32_t*>(&LookupTable[byteValue * 4]);
	return hashValue;
}

// 以给定字符串为“种子”，计算初始 CRC 值。
// 这里通常使用固定的 key（例如 "crc_key"）来初始化 CRC。
static uint32_t CalculateCrcValue(const std::string& crc_key) {
	uint32_t crcValue = 0x0;
	const char* ptr = crc_key.c_str();
	while (*ptr) {
		unsigned char c = *ptr++;
		crcValue = ProcessByte(c, crcValue);
	}
	return crcValue;
}

// 基于同一个初始 CRC（crcValue），分别对文件路径和目录路径做 CRC 计算，
// 得到三个不同的路径相关 Hash 值。
static UnixPathsResult CalculateFilePathHash(uint32_t crcValue, const UnixPaths& filePaths) {
	UnixPathsResult result = { crcValue, crcValue, crcValue };

	// 针对完整文件路径（包含文件名）计算 FileHash
	const char* ptr = filePaths.FilePath.c_str();
	while (*ptr) {
		result.FileHash = ProcessByte(*ptr++, result.FileHash);
	}

	// 针对目录路径（不带结尾 /）计算 DirHash
	ptr = filePaths.DirPath.c_str();
	while (*ptr) {
		result.DirHash = ProcessByte(*ptr++, result.DirHash);
	}

	// 针对目录路径（带结尾 /）计算 DirHashWithSlash
	ptr = filePaths.DirPathWithSlash.c_str();
	while (*ptr) {
		result.DirHashWithSlash = ProcessByte(*ptr++, result.DirHashWithSlash);
	}

	return result;
}

// 根据路径 Hash（通常是 FileHash）和文件内容计算最终 CRC：
// - 先读取整个文件到内存；
// - 从偏移 0x10 处读出文件头记录的 CRC（大端序）；
// - 从偏移 0x18 开始，对后续所有字节进行 CRC 计算。
// fileHeaderCRCValue 通过引用返回文件头中存储的 CRC。
static uint32_t CalculateFileContentHash(uint32_t pathHash, const std::string& filePath, uint32_t& fileHeaderCRCValue) {
	std::ifstream file(filePath, std::ios::binary);
	if (!file) {
		std::cout << "文件未找到: " << filePath << "\n";
		return 0;
	}

	// 将整个文件读入内存，以便按偏移访问头部和正文
	std::vector<char> buffer(std::filesystem::file_size(filePath));
	file.read(buffer.data(), buffer.size());
	file.close();

	// 如果文件长度足够，尝试从 0x10 处读出 4 字节的文件头 CRC（大端序）
	if (buffer.size() >= 0x14) {
		unsigned char* bytes = reinterpret_cast<unsigned char*>(&buffer[0x10]);
		fileHeaderCRCValue = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
	}

	// 从给定的路径 Hash 开始，继续对文件正文部分做 CRC
	uint32_t hashValue = pathHash;
	for (size_t i = 0x18; i < buffer.size(); i++) {
		hashValue = ProcessByte(static_cast<unsigned char>(buffer[i]), hashValue);
	}

	return hashValue;
}

// 将任意输入路径转换为“相对于程序所在目录”的 Unix 风格路径：
// - 先得到当前可执行文件所在目录；
// - 把目标路径转成绝对路径后，计算相对于程序目录的相对路径；
// - 将反斜杠 \ 替换为 /；
// - 去掉末尾的 ".cache" 扩展名（如果存在）；
// - 确保路径以 / 开头；
// - 同时构造目录路径及带结尾 / 的目录路径。
static UnixPaths ConvertToUnixPath(const std::string& fullPath) {
	try {
		char exePath[MAX_PATH];
		GetModuleFileNameA(NULL, exePath, MAX_PATH);
		std::filesystem::path crcProgramPath = std::filesystem::path(exePath).parent_path();

		std::filesystem::path targetPath = std::filesystem::absolute(fullPath);
		std::filesystem::path relativePath = std::filesystem::relative(targetPath, crcProgramPath);

		UnixPaths result = { relativePath.string(), "", "" };

		// 将 Windows 风格的路径分隔符 \ 替换为 Unix 风格的 /
		for (size_t i = 0; i < result.FilePath.size(); i++) {
			if (result.FilePath[i] == '\\') {
				result.FilePath[i] = '/';
			}
		}

		// 如果以 ".cache" 结尾，则去掉该扩展名
		if (result.FilePath.length() > 6 && result.FilePath.substr(result.FilePath.length() - 6) == ".cache") {
			result.FilePath = result.FilePath.substr(0, result.FilePath.length() - 6);
		}

		// 如果不是以 / 开头，则补上前导 /
		if (!result.FilePath.empty() && result.FilePath[0] != '/') {
			result.FilePath = "/" + result.FilePath;
		}

		// 构造目录路径及其带结尾 / 的版本
		std::filesystem::path pathtemp(result.FilePath);
		std::filesystem::path parentPath = pathtemp.parent_path();
		std::string CX2 = parentPath.string();
		result.DirPath = CX2;
		result.DirPathWithSlash = CX2 + "/";

		return result;
	}
	catch (const std::exception& e) {
		std::cout << "Error converting path: " << e.what() << "\n";
		return { "", "", "" };
	}
}

// 将无符号 32 位整数转换为大端序表示，并以大写十六进制字符串的形式返回。
// 注意：当前代码中未直接使用该函数，但保留以便调试或扩展。
static std::string ToUpperEndian(uint32_t value) {
	uint32_t bigEndian = ((value & 0xFF) << 24) |
		((value & 0xFF00) << 8) |
		((value & 0xFF0000) >> 8) |
		((value & 0xFF000000) >> 24);
	std::stringstream ss;
	ss << std::hex << std::uppercase << bigEndian;
	return ss.str();
}

// 针对单个文件路径执行完整的 CRC 校验流程：
// 1. 确认路径存在；
// 2. 转换为 Unix 风格相对路径（供路径 Hash 使用）；
// 3. 计算初始 CRC 值（基于固定 key）；
// 4. 基于路径计算 FileHash/DirHash 等；
// 5. 读取文件内容并计算最终 CRC；
// 6. 将计算结果与文件头中的 CRC 对比并输出。
static void ProcessPath(const std::string& path) {
	std::string originalPath = path;

	if (!std::filesystem::exists(originalPath)) {
		std::cout << "[!] Path not found: " << originalPath << "\n\n";
		return;
	}

	UnixPaths unixPath = ConvertToUnixPath(originalPath);

	if (unixPath.FilePath.empty()) {
		std::cout << "[!] Path conversion failed!\n\n";
		return;
	}

	// 使用固定 key 得到初始 CRC 值
	uint32_t crcValue = CalculateCrcValue("crc_key");
	// 根据 Unix 风格路径计算路径相关哈希
	UnixPathsResult filePathHash = CalculateFilePathHash(crcValue, unixPath);

	// 从文件头读出的 CRC（大端序）
	uint32_t fileHeaderCRCValue = 0;
	// 基于路径 Hash + 文件内容计算得到的 CRC
	uint32_t fileContentHash = CalculateFileContentHash(filePathHash.FileHash, originalPath, fileHeaderCRCValue);

	// 将计算得到的 CRC 转换为大端序，便于与文件头中记录的值比较
	uint32_t calculatedBigEndian = ((fileContentHash & 0xFF) << 24) |
		((fileContentHash & 0xFF00) << 8) |
		((fileContentHash & 0xFF0000) >> 8) |
		((fileContentHash & 0xFF000000) >> 24);
	bool crcMatch = (calculatedBigEndian == fileHeaderCRCValue);

	// 输出路径及路径哈希信息
	std::cout << "△: " << unixPath.FilePath << "\n";
	std::cout << "  DIR:  " << std::hex << std::uppercase << std::setw(8) << std::setfill('0') << filePathHash.DirHash
		<< "  PATH: " << std::hex << std::uppercase << std::setw(8) << std::setfill('0') << filePathHash.FileHash << "\n";

	// 输出文件头 CRC 与计算 CRC 的对比结果
	if (crcMatch) {
		std::cout << "  FILE: " << std::hex << std::uppercase << std::setw(8) << std::setfill('0') << fileHeaderCRCValue
			<< "  CALC: " << std::hex << std::uppercase << std::setw(8) << std::setfill('0') << calculatedBigEndian << "  [OK]\n";
	}
	else {
		std::cout << "  FILE: " << std::hex << std::uppercase << std::setw(8) << std::setfill('0') << fileHeaderCRCValue
			<< "  CALC: " << std::hex << std::uppercase << std::setw(8) << std::setfill('0') << calculatedBigEndian << "  [FAIL]\n";
	}

	std::cout << "\n";
}

// 递归遍历目录，针对其中每一个普通文件调用 ProcessPath。
static void ProcessDirectoryRecursive(const std::string& dirPath) {
	for (const auto& entry : std::filesystem::directory_iterator(dirPath)) {
		if (entry.is_directory()) {
			ProcessDirectoryRecursive(entry.path().string());
		}
		else if (entry.is_regular_file()) {
			ProcessPath(entry.path().string());
		}
	}
}

// 程序入口：
// - 如果通过命令行参数传入路径，则先对这些路径执行一次 CRC 校验；
//   · 若参数为目录，则递归处理其下所有文件；
//   · 若参数为文件，则仅校验该文件。
// - 随后进入交互模式，从标准输入读取路径：
//   · 输入 "q" 或 "Q" 退出；
//   · 输入为空则忽略；
//   · 输入目录或文件路径，分别做递归或单文件校验。
int main(int argc, char* argv[]) {
	std::cout << "\n";
	std::cout << "> Verifying CRC\n";
	std::cout << "> Place in Cache root dir\n";
	std::cout << "> All values in BIG-ENDIAN\n";
	std::cout << ">\n";

	// 首先处理命令行参数中给出的路径（如果有）
	if (argc > 1) {
		for (int i = 1; i < argc; i++) {
			std::string path = argv[i];
			if (std::filesystem::is_directory(path)) {
				ProcessDirectoryRecursive(path);
			}
			else {
				ProcessPath(path);
			}
		}
	}

	// 然后进入交互模式，可以反复输入路径进行 CRC 校验
	while (true) {
		std::cout << "> ";
		std::string input;
		std::getline(std::cin, input);

		if (input == "q" || input == "Q") {
			break;
		}

		if (input.empty()) {
			continue;
		}

		if (std::filesystem::is_directory(input)) {
			ProcessDirectoryRecursive(input);
		}
		else {
			ProcessPath(input);
		}
	}

	std::cout << "\n[*] Session terminated.\n\n";
	return 0;
}
