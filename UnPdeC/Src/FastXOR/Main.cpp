// FastXOR 工具：
// 使用一段固定算法生成的 PDEKEY，对指定文件或目录中的所有文件执行异或运算，
// 生成同名但扩展名追加 ".xor" 的输出文件，并在控制台显示整体进度条。

#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <windows.h>

// PDEKEY: 用于异或处理的密钥表，长度为 0x1000 字节。
// 程序启动时通过 GetPdeKey() 按特定算法生成一次，全程复用。
static std::vector<uint8_t> PDEKEY(0x1000);

// 全局变量用于跟踪总进度：
// - totalBytesToProcess: 所有待处理文件的总字节数；
// - totalBytesProcessed: 已经处理完成的字节数。
static uint64_t totalBytesToProcess = 0;
static uint64_t totalBytesProcessed = 0;

// 控制台辅助：清除当前行并把光标移到行首。
static void clearLine() {
	std::cout << "\033[2K\r";
}

// 控制台辅助：将光标向上移动指定行数（用于进度条动态刷新）。
static void moveCursorUp(int lines) {
	std::cout << "\033[" << lines << "A";
}

// 控制台辅助：将光标向下移动指定行数。
static void moveCursorDown(int lines) {
	std::cout << "\033[" << lines << "B";
}

/// <summary>
/// 格式化文件大小，例如：1024 -> "1.00 KB"
/// </summary>
/// <param name="bytes">大小</param>
/// <returns>格式化后的大小</returns>
static std::string formatFileSize(uint64_t bytes) {
	const char* units[] = { "B", "KB", "MB", "GB", "TB" };
	int unitIndex = 0;
	double size = static_cast<double>(bytes);

	while (size >= 1024 && unitIndex < 4) {
		size /= 1024;
		unitIndex++;
	}

	std::ostringstream oss;
	oss << std::fixed << std::setprecision(2) << size << " " << units[unitIndex];
	return oss.str();
}

/// <summary>
/// 生成 PDEKEY：
/// 基于逆向得到的汇编逻辑，从初始 EAX=0x42574954 出发，循环乘以 0x7FCF，
/// 再将 EAX 各字节异或得到一个 1 字节值，最终填满 0x1000 字节的密钥表。
/// </summary>
static void GetPdeKey() {
	// 初始化EAX寄存器，基于汇编代码 0x00A608E0
	uint32_t EAX = 0x42574954;

	// 生成密钥
	for (size_t i = 0; i < 0x1000; ++i) {
		EAX *= 0x7FCF;
		PDEKEY[i] = static_cast<uint8_t>((EAX >> 24) ^ ((EAX >> 16) & 0xFF) ^ ((EAX >> 8) & 0xFF) ^ (EAX & 0xFF));
	}
	std::cout << "√ PDEKEY Generated Successfully\n\n";
}

/// <summary>
/// 显示整体进度条：
/// 进度 = totalBytesProcessed / totalBytesToProcess，
/// 在控制台预留的一行内动态刷新显示。
/// </summary>
static void showProgress() {
	const int barWidth = 50;
	float progress = static_cast<float>(totalBytesProcessed) / totalBytesToProcess;
	int pos = static_cast<int>(barWidth * progress);

	// 将光标移动到进度条那一行并清空
	moveCursorDown(1);
	clearLine();

	// 绘制进度条本体
	std::cout << "[";
	for (int i = 0; i < barWidth; ++i) {
		if (i < pos) std::cout << "=";
		else if (i == pos) std::cout << ">";
		else std::cout << " ";
	}
	std::cout << "] " << std::fixed << std::setprecision(2) << (progress * 100.0) << "%";

	// 光标回到上一行，保持界面整齐
	moveCursorUp(1);
	std::cout.flush();
}

/// <summary>
/// 对文件块进行异或处理并写入输出文件：
/// - 从输入流读取最多 buffer.size() 字节到 buffer；
/// - 使用 PDEKEY 进行按字节异或（按文件全局偏移轮转密钥）；
/// - 将处理后的数据写入输出流；
/// - 更新当前文件和全局进度，再刷新进度条。
/// </summary>
/// <param name="input">输入文件流</param>
/// <param name="output">输出文件流</param>
/// <param name="buffer">数据缓冲区</param>
/// <param name="bytesProcessed">当前文件已处理的字节数</param>
static void XorAndWriteChunk(std::ifstream& input, std::ofstream& output, std::vector<uint8_t>& buffer, uint64_t& bytesProcessed) {
	constexpr size_t KeyLength = 0x1000; // PDEKEY的长度

	// 读取数据到缓冲区
	std::streamsize bytesRead = input.read(reinterpret_cast<char*>(buffer.data()), buffer.size()).gcount();

	// 若本次没有读取到任何数据（EOF 或错误），直接返回
	if (bytesRead <= 0) {
		return;
	}

	// 异或处理：按文件全局偏移轮转使用 PDEKEY
	for (std::streamsize i = 0; i < bytesRead; ++i) {
		buffer[i] ^= PDEKEY[(bytesProcessed + i) % KeyLength];
	}

	// 写入处理后的数据
	output.write(reinterpret_cast<char*>(buffer.data()), bytesRead);
	bytesProcessed += bytesRead;
	totalBytesProcessed += bytesRead;

	// 更新进度显示
	showProgress();
}

/// <summary>
/// 处理单个文件：
/// - 跳过已经是 .xor 的文件，避免重复处理；
/// - 检查文件存在并能打开；
/// - 输出文件名在原扩展名后追加 ".xor"；
/// - 使用 8MB 缓冲区循环读取 + 异或 + 写入，直到文件结束。
/// </summary>
/// <param name="filePath">待处理文件的路径</param>
static void processFile(const std::filesystem::path& filePath) {
	// 跳过已处理的.xor文件
	if (filePath.extension() == ".xor") {
		clearLine();
		std::cout << "! Skipping .xor File: " << filePath.filename() << "\n";
		return;
	}

	// 验证文件存在
	if (!std::filesystem::exists(filePath)) {
		clearLine();
		std::cerr << "! File does not exist: " << filePath << "\n";
		return;
	}

	// 打开输入文件
	std::ifstream input(filePath, std::ios::binary);
	if (!input) {
		clearLine();
		std::cerr << "! Failed to open input file: " << filePath << "\n";
		return;
	}

	// 创建输出文件路径：原扩展名后加 ".xor"
	std::filesystem::path outputFilePath = filePath;
	outputFilePath.replace_extension(outputFilePath.extension().string() + ".xor");

	// 打开输出文件
	std::ofstream output(outputFilePath, std::ios::binary);
	if (!output) {
		clearLine();
		std::cerr << "! Failed to create output file: " << outputFilePath << "\n";
		return;
	}

	clearLine();
	std::cout << ">> Input: " << filePath.filename() << "\n";

	// 设置8MB的缓冲区以提高I/O效率
	const size_t bufferSize = static_cast<size_t>(8 * 1024) * 1024;
	std::vector<uint8_t> buffer(bufferSize);
	uint64_t bytesProcessed = 0;

	// 分块读取、处理和写入文件
	while (input) {
		XorAndWriteChunk(input, output, buffer, bytesProcessed);
	}

	clearLine();
	std::cout << "<< Output: " << outputFilePath.filename() << " " << formatFileSize(bytesProcessed) << "\n";
}

/// <summary>
/// 递归处理目录中的所有文件：
/// 对目录下及子目录中每一个普通文件调用 processFile，
/// 已经是 .xor 的文件会在 processFile 内部自动跳过。
/// </summary>
/// <param name="dirPath">目录路径</param>
static void processDirectory(const std::filesystem::path& dirPath) {
	clearLine();
	std::cout << ">> Processing Directory: " << dirPath << "\n";

	// 递归遍历目录中的所有文件
	for (const auto& entry : std::filesystem::recursive_directory_iterator(dirPath)) {
		if (entry.is_regular_file()) {
			processFile(entry.path());
		}
	}
}

/// <summary>
/// 计算所有文件的总大小，用于绘制整体进度：
/// - 若 path 为普通文件，直接累加其大小；
/// - 若为目录，则递归遍历并累加所有非 .xor 文件的大小。
/// </summary>
/// <param name="path">文件或目录路径</param>
static void calculateTotalSize(const std::filesystem::path& path) {
	if (std::filesystem::is_regular_file(path)) {
		totalBytesToProcess += std::filesystem::file_size(path);
	}
	else if (std::filesystem::is_directory(path)) {
		for (const auto& entry : std::filesystem::recursive_directory_iterator(path)) {
			if (entry.is_regular_file() && entry.path().extension() != ".xor") {
				totalBytesToProcess += std::filesystem::file_size(entry);
			}
		}
	}
}

/// <summary>
/// 主函数：
/// - 设置控制台标题并启用 ANSI 转义序列（用于进度条和光标控制）；
/// - 检查并读取命令行参数（支持多文件/多目录）；
/// - 生成 PDEKEY；
/// - 预先统计所有将要处理的数据总大小；
/// - 逐个处理参数所指的文件或目录，实时更新进度；
/// - 处理完成后提示，并等待用户按键退出。
/// </summary>
/// <param name="argc">命令行参数数量</param>
/// <param name="argv">命令行参数数组</param>
/// <returns>程序执行状态码</returns>
int main(int argc, char* argv[]) {
	// 设置控制台标题
	SetConsoleTitle(TEXT("FastXOR"));

	// 启用 ANSI 转义序列（使 \033[...] 生效）
	HANDLE hOut = GetStdHandle(STD_OUTPUT_HANDLE);
	DWORD dwMode = 0;
	GetConsoleMode(hOut, &dwMode);
	SetConsoleMode(hOut, dwMode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);

	// 显示程序信息和使用说明
	std::cout << "FastXOR\n\tBy:letleon\n\tDesc: Fast xor .pde bin file\n\n";
	std::cout << "Usage:\n\tFastXOR.exe <file_path_or_directory>\n\tOr drag and drop files or a directory onto FastXOR.exe\n\n";

	// 检查命令行参数
	if (argc < 2) {
		std::cout << "Please provide a file or directory path.\n";
		std::cin.get();
		return 1;
	}

	// 生成PDEKEY（只需生成一次，全局复用）
	GetPdeKey();

	// 计算总处理大小（支持多个参数）
	for (int i = 1; i < argc; ++i) {
		calculateTotalSize(argv[i]);
	}

	// 显示总处理大小
	std::cout << "Total size to process: " << formatFileSize(totalBytesToProcess) << "\n";

	// 处理所有指定的文件或目录
	std::cout << "\n"; // 为进度条预留一行
	for (int i = 1; i < argc; ++i) {
		std::filesystem::path path = argv[i];
		if (std::filesystem::is_directory(path)) {
			processDirectory(path);
		}
		else if (std::filesystem::is_regular_file(path)) {
			processFile(path);
		}
		else {
			clearLine();
			std::cerr << "! Invalid Path: " << path << "\n";
		}
	}

	clearLine();
	std::cout << "\n√ Processing Completed\n";
	std::cin.get();
	return 0;
}
