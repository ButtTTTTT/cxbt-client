// FlagFinder 工具：
// 在指定目录中批量扫描文件，提取文件特征并做统计分析。
// 支持两种模式：
//   1) Cache 模式：针对 .cache 文件，分析 0x18 偏移处的 flag 和前 8 字节头部；
//   2) Decompress 模式：针对已解压文件，按扩展名分组统计前 8 字节头部到文件列表的映射。

#define _CRT_SECURE_NO_WARNINGS
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <iostream>
#include <map>
#include <mutex>
#include <set>
#include <string>
#include <string_view>
#include <thread>
#include <unordered_map>
#include <utility>
#include <vector>

#include <windows.h>

namespace fs = std::filesystem;

// ── 字符串工具函数 ────────────────────────────────────────────

static bool ends_with_ci(std::string_view str, std::string_view suffix) {
	if (suffix.size() > str.size()) return false;
	auto it = str.rbegin();
	auto si = suffix.rbegin();
	for (; si != suffix.rend(); ++it, ++si) {
		char a = *it, b = *si;
		if (a >= 'A' && a <= 'Z') a += 32;
		if (b >= 'A' && b <= 'Z') b += 32;
		if (a != b) return false;
	}
	return true;
}

static std::string extract_suffix_fast(const std::string& filepath) {
	size_t last_sep = filepath.find_last_of("/\\");
	std::string_view filename = (last_sep != std::string::npos)
		? std::string_view(filepath).substr(last_sep + 1)
		: std::string_view(filepath);

	size_t last_dot = filename.find_last_of('.');
	if (last_dot == std::string_view::npos) return "";

	std::string ext(filename.substr(last_dot + 1));

	if (ext == "cache") {
		std::string_view stem = filename.substr(0, last_dot);
		size_t prev_dot = stem.find_last_of('.');
		return (prev_dot != std::string_view::npos)
			? std::string(stem.substr(prev_dot + 1)) : std::string(stem);
	}

	return ext;
}

// 重载：直接接受 cFileName，避免构造 string
static std::string extract_suffix_from_name(const char* cfilename) {
	std::string_view filename(cfilename);

	size_t last_dot = filename.find_last_of('.');
	if (last_dot == std::string_view::npos) return "";

	std::string ext(filename.substr(last_dot + 1));

	if (ext == "cache") {
		std::string_view stem = filename.substr(0, last_dot);
		size_t prev_dot = stem.find_last_of('.');
		return (prev_dot != std::string_view::npos)
			? std::string(stem.substr(prev_dot + 1)) : std::string(stem);
	}

	return ext;
}

static std::string make_relative_path(std::string_view filepath, std::string_view base) {
	if (base.size() > 1 && (base.back() == '/' || base.back() == '\\')) {
		base.remove_suffix(1);
	}
	if (filepath.size() > base.size()) {
		bool match = true;
		for (size_t i = 0; i < base.size(); ++i) {
			char a = filepath[i], b = base[i];
			if (a == '\\') a = '/';
			if (b == '\\') b = '/';
			if (a != b) { match = false; break; }
		}
		if (match) {
			char sep = filepath[base.size()];
			if (sep == '/' || sep == '\\') {
				return std::string(filepath.substr(base.size() + 1));
			}
		}
	}
	return std::string(filepath);
}

// ── Win32 文件读取 ────────────────────────────────────────────

static bool read_file_header(const char* filepath, uint8_t* header, uint8_t* flag) {
	HANDLE hFile = CreateFileA(
		filepath, GENERIC_READ, FILE_SHARE_READ,
		nullptr, OPEN_EXISTING, FILE_FLAG_SEQUENTIAL_SCAN, nullptr);
	if (hFile == INVALID_HANDLE_VALUE) return false;

	uint8_t buffer[0x19] = { 0 };
	DWORD bytesRead = 0;
	BOOL result = ReadFile(hFile, buffer, 0x19, &bytesRead, nullptr);
	CloseHandle(hFile);

	if (!result || bytesRead < 8) return false;

	memcpy(header, buffer, 8);
	*flag = (bytesRead >= 0x19) ? buffer[0x18] : 0;
	return true;
}

// ── 线程本地数据与全局数据 ─────────────────────────────────────

struct ThreadLocalData {
	std::unordered_map<uint8_t, std::vector<std::string>> by_flag;
	std::unordered_map<std::string, std::vector<std::pair<std::array<uint8_t, 8>, std::string>>> by_suffix_headers;
	std::unordered_map<std::string, std::vector<std::pair<std::array<uint8_t, 8>, std::string>>> decomp_data;
	int processed_files = 0;
};

struct {
	std::unordered_map<uint8_t, std::vector<std::string>> by_flag;
	std::mutex flag_mutex;

	std::unordered_map<std::string, std::vector<std::pair<std::array<uint8_t, 8>, std::string>>> by_suffix_headers;
	std::mutex suffix_mutex;

	std::unordered_map<std::string, std::vector<std::pair<std::array<uint8_t, 8>, std::string>>> decomp_data;
	std::mutex decomp_mutex;

	std::atomic<int> processed_files{ 0 };
	std::atomic<int> total_headers{ 0 };
} analysis_data;

static void merge_local_data(ThreadLocalData& local) {
	{
		std::lock_guard<std::mutex> lock(analysis_data.flag_mutex);
		for (auto& [flag, paths] : local.by_flag) {
			auto& g = analysis_data.by_flag[flag];
			g.insert(g.end(),
				std::make_move_iterator(paths.begin()),
				std::make_move_iterator(paths.end()));
		}
	}
	{
		std::lock_guard<std::mutex> lock(analysis_data.suffix_mutex);
		for (auto& [suffix, headers] : local.by_suffix_headers) {
			auto& g = analysis_data.by_suffix_headers[suffix];
			g.insert(g.end(),
				std::make_move_iterator(headers.begin()),
				std::make_move_iterator(headers.end()));
		}
	}
	{
		std::lock_guard<std::mutex> lock(analysis_data.decomp_mutex);
		for (auto& [suffix, headers] : local.decomp_data) {
			auto& g = analysis_data.decomp_data[suffix];
			g.insert(g.end(),
				std::make_move_iterator(headers.begin()),
				std::make_move_iterator(headers.end()));
		}
	}
	analysis_data.processed_files += local.processed_files;
}

// ── 扫描+处理合并：单遍递归 ───────────────────────────────────
// 关键优化：扫描到一个文件就立刻读取头部，利用操作系统的目录缓存和文件预读
// 避免了"先遍历一遍收集路径，再遍历一遍读取头部"的两遍问题

enum class ScanMode {
	CacheOnly,
	NonCache
};

static void scan_and_process_recursive(
	const std::string& dir_path, ScanMode mode, ThreadLocalData& local,
	size_t root_dir_len = 0)
{
	std::string search_pattern = dir_path + "\\*";

	WIN32_FIND_DATAA find_data;
	HANDLE hFind = FindFirstFileA(search_pattern.c_str(), &find_data);
	if (hFind == INVALID_HANDLE_VALUE) return;

	std::vector<std::string> subdirs;

	do {
		if (find_data.cFileName[0] == '.' &&
			(find_data.cFileName[1] == '\0' ||
				(find_data.cFileName[1] == '.' && find_data.cFileName[2] == '\0'))) {
			continue;
		}

		if (find_data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
			subdirs.emplace_back(dir_path + "\\" + find_data.cFileName);
			continue;
		}

		bool is_cache = ends_with_ci(find_data.cFileName, ".cache");

		if (mode == ScanMode::CacheOnly) {
			if (!is_cache) continue;
		} else {
			if (is_cache) continue;

			// 只在根目录层级排除直接子文件
			if (root_dir_len > 0) {
				// 构造完整路径之前先检查：dir_path 已经是 root_dir 的子路径
				// 根目录直接子文件：dir_path == root_dir，文件直接在根目录下
				if (dir_path.size() == root_dir_len) {
					// 这是根目录下的直接文件，跳过
					continue;
				}
			}
		}

		// 需要处理的文件：立刻读取头部
		std::string full_path = dir_path + "\\" + find_data.cFileName;

		uint8_t header[8] = { 0 };
		uint8_t flag = 0;
		if (!read_file_header(full_path.c_str(), header, &flag)) continue;

		if (mode == ScanMode::CacheOnly) {
			local.by_flag[flag].push_back(full_path);

			std::string suffix = extract_suffix_from_name(find_data.cFileName);
			std::array<uint8_t, 8> header_arr{};
			memcpy(header_arr.data(), header, 8);
			local.by_suffix_headers[suffix].emplace_back(header_arr, full_path);
		} else {
			std::string suffix = extract_suffix_from_name(find_data.cFileName);
			std::array<uint8_t, 8> header_arr{};
			memcpy(header_arr.data(), header, 8);
			local.decomp_data[suffix].emplace_back(header_arr, full_path);
		}

		local.processed_files++;
	} while (FindNextFileA(hFind, &find_data));

	FindClose(hFind);

	// 递归处理子目录
	for (auto& subdir : subdirs) {
		scan_and_process_recursive(subdir, mode, local, root_dir_len);
	}
}

// ── 并行处理：按根目录子目录分配线程 ───────────────────────────
// 不同于之前把文件列表分片，这里每个线程独立扫描一个子目录
// 每个线程内部做 scan+process 合并，最大化磁盘顺序读取

static void parallel_scan_and_process(
	const std::string& root_dir, ScanMode mode)
{
	// 第一步：枚举根目录下的所有一级子目录
	std::vector<std::string> top_entries;
	std::string search_pattern = root_dir + "\\*";

	WIN32_FIND_DATAA find_data;
	HANDLE hFind = FindFirstFileA(search_pattern.c_str(), &find_data);
	if (hFind == INVALID_HANDLE_VALUE) return;

	do {
		if (find_data.cFileName[0] == '.' &&
			(find_data.cFileName[1] == '\0' ||
				(find_data.cFileName[1] == '.' && find_data.cFileName[2] == '\0'))) {
			continue;
		}

		std::string full_path = root_dir + "\\" + find_data.cFileName;

		if (find_data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
			top_entries.push_back(std::move(full_path));
		} else {
			// 根目录下的文件也加入列表（CacheOnly 模式可能需要）
			top_entries.push_back(std::move(full_path));
		}
	} while (FindNextFileA(hFind, &find_data));
	FindClose(hFind);

	// 第二步：按线程数分配一级子目录
	const unsigned num_threads = std::thread::hardware_concurrency();
	const size_t items_per_thread = (top_entries.size() + num_threads - 1) / num_threads;

	std::vector<std::thread> threads;
	threads.reserve(num_threads);

	for (unsigned i = 0; i < num_threads; ++i) {
		size_t start_idx = i * items_per_thread;
		size_t end_idx = std::min<size_t>(start_idx + items_per_thread, top_entries.size());
		if (start_idx >= top_entries.size()) break;

		threads.emplace_back([&top_entries, start_idx, end_idx, mode, &root_dir]() {
			ThreadLocalData local;
			for (size_t j = start_idx; j < end_idx; ++j) {
				const auto& entry = top_entries[j];
				DWORD attrs = GetFileAttributesA(entry.c_str());
				if (attrs != INVALID_FILE_ATTRIBUTES && (attrs & FILE_ATTRIBUTE_DIRECTORY)) {
					// 子目录：递归扫描+处理（root_dir_len 设为根目录长度，用于 NonCache 排除）
					scan_and_process_recursive(entry, mode, local, root_dir.size());
				} else {
					// 根目录下的文件
					bool is_cache = ends_with_ci(entry, ".cache");

					if (mode == ScanMode::CacheOnly) {
						if (!is_cache) continue;
					} else {
						// NonCache 模式排除根目录直接子文件
						continue;
					}

					uint8_t header[8] = { 0 };
					uint8_t flag = 0;
					if (!read_file_header(entry.c_str(), header, &flag)) continue;

					if (mode == ScanMode::CacheOnly) {
						local.by_flag[flag].push_back(entry);

						std::string suffix = extract_suffix_fast(entry);
						std::array<uint8_t, 8> header_arr{};
						memcpy(header_arr.data(), header, 8);
						local.by_suffix_headers[suffix].emplace_back(header_arr, entry);
					}

					local.processed_files++;
				}
			}
			merge_local_data(local);
		});
	}

	for (auto& t : threads) t.join();
}

// ── 输出辅助 ──────────────────────────────────────────────────

static void write_header8(FILE* fp, const std::array<uint8_t, 8>& h) {
	fprintf(fp, "%02X%02X%02X%02X %02X%02X%02X%02X",
		h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]);
}

// ── main ──────────────────────────────────────────────────────

int main(int argc, char** argv) {
	SetConsoleOutputCP(CP_UTF8);
	SetConsoleCP(CP_UTF8);

	fs::path output_dir = fs::path(argv[0]).parent_path();
	if (output_dir.empty()) output_dir = fs::current_path();

	std::cout << R"(
                      File FlagFinder
                 文件特征分析工具  @letleon
 ══════════════════════════════════════════════════════════════

 选择处理模式:

   [1] Cache 模式（推荐用于游戏原始文件）
       → 处理扩展名为 .cache 的压缩/加密文件
       → 分析 0x18 偏移处的标志位（1字节）
       → 统计文件前8字节的分布情况
       → 输出到: 程序目录下 _Flag0x18.txt 和 _Header8Byte.txt

   [2] Decompress 模式（用于已解压的文件）
       → 处理所有非 .cache 文件
       → 提取每个文件的前8字节头部
       → 按文件扩展名分组展示
       → 输出到: 程序目录下 _Decomp_Header8Byte.txt
       → 自动排除根目录下的文件（保留子目录）

 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 )";

	int mode = 1;
	std::cout << "请输入模式编号 (1 或 2): ";
	std::cin >> mode;

	if (mode != 1 && mode != 2) {
		std::cerr << "无效的模式编号！\n";
		return 1;
	}

	std::cout << "\n已选择: " << (mode == 1 ? "Cache 模式" : "Decompress 模式") << "\n\n";

	const fs::path root_dir = (argc > 1) ? argv[1] : fs::current_path();

	std::string output_prefix = "FlagFinder";
	if (argc > 0) {
		fs::path exe_path(argv[0]);
		output_prefix = exe_path.stem().string();
	}

	if (!fs::exists(root_dir)) {
		std::cerr << "目录不存在: " << root_dir << "\n";
		return 1;
	}

	std::cout << "扫描目录: " << root_dir << "\n\n";

	const std::string root_dir_str = root_dir.string();
	const ScanMode scan_mode = (mode == 1) ? ScanMode::CacheOnly : ScanMode::NonCache;

	std::cout << "正在扫描并处理文件...\n";
	std::cout << "使用 " << std::thread::hardware_concurrency() << " 个线程\n\n";

	const auto start_time = std::chrono::high_resolution_clock::now();

	parallel_scan_and_process(root_dir_str, scan_mode);

	const auto end_time = std::chrono::high_resolution_clock::now();
	const auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time).count();

	// 输出统计信息
	std::cout << "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
	std::cout << "处理完成:\n"
		<< "  总文件数: " << analysis_data.processed_files << "\n"
		<< "  处理时间: " << duration << " ms\n";

	if (mode == 1) {
		std::unordered_map<std::string, std::set<std::array<uint8_t, 8>>> unique_headers;
		for (const auto& [suffix, headers] : analysis_data.by_suffix_headers) {
			for (const auto& [header, path] : headers) {
				unique_headers[suffix].insert(header);
			}
		}
		int total_unique = 0;
		for (const auto& [suffix, headers] : unique_headers) {
			total_unique += (int)headers.size();
		}

		std::cout << "  不同后缀类型: " << unique_headers.size() << "\n"
			<< "  不同Flag类型: " << analysis_data.by_flag.size() << "\n"
			<< "  唯一头数量: " << total_unique << "\n";
	} else {
		std::unordered_map<std::string, std::set<std::array<uint8_t, 8>>> unique_headers;
		for (const auto& [suffix, headers] : analysis_data.decomp_data) {
			for (const auto& [header, path] : headers) {
				unique_headers[suffix].insert(header);
			}
		}
		int total_header_types = 0;
		for (const auto& [suffix, headers] : unique_headers) {
			total_header_types += (int)headers.size();
		}
		std::cout << "  不同后缀类型: " << unique_headers.size() << "\n"
			<< "  总头部类型数: " << total_header_types << "\n";
	}
	std::cout << "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

	// 写入输出文件
	fs::current_path(output_dir);

	if (mode == 1) {
		{
			FILE* fp = fopen((output_prefix + "_Flag0x18.txt").c_str(), "w");
			if (!fp) {
				std::cerr << "无法创建输出文件\n";
				return 1;
			}
			for (const auto& [flag, paths] : analysis_data.by_flag) {
				fprintf(fp, "0x%02X (%zu):\n", flag, paths.size());
				for (const auto& p : paths) {
					std::string rel = make_relative_path(p, root_dir_str);
					fprintf(fp, "%s\n", rel.c_str());
				}
				fprintf(fp, "\n");
			}
			fclose(fp);
		}

		{
			FILE* fp = fopen((output_prefix + "_Head8Byte.txt").c_str(), "w");
			if (!fp) {
				std::cerr << "无法创建输出文件\n";
				return 1;
			}

			std::map<std::string, std::set<std::array<uint8_t, 8>>> sorted_headers;
			for (const auto& [suffix, headers] : analysis_data.by_suffix_headers) {
				for (const auto& [header, path] : headers) {
					sorted_headers[suffix].insert(header);
				}
			}

			for (const auto& [suffix, headers] : sorted_headers) {
				fprintf(fp, "[%s]\n", suffix.c_str());
				for (const auto& h : headers) {
					write_header8(fp, h);
					fprintf(fp, "\n");
				}
				fprintf(fp, "\n");
			}
			fclose(fp);
		}

		std::cout << "结果已保存至 " << (output_dir / (output_prefix + "_Flag0x18.txt")) << "\n";
		std::cout << "结果已保存至 " << (output_dir / (output_prefix + "_Head8Byte.txt")) << "\n";
	} else {
		FILE* fp = fopen((output_prefix + "_Head8Byte_Decomp.txt").c_str(), "w");
		if (!fp) {
			std::cerr << "无法创建输出文件\n";
			return 1;
		}

		std::map<std::string, std::map<std::array<uint8_t, 8>, std::vector<std::string>>> grouped;
		for (auto& [suffix, headers] : analysis_data.decomp_data) {
			for (auto& [header, path] : headers) {
				grouped[suffix][header].push_back(std::move(path));
			}
		}

		for (const auto& [suffix, header_map] : grouped) {
			fprintf(fp, "[%s]\n", suffix.c_str());
			for (const auto& [header, files] : header_map) {
				write_header8(fp, header);
				fprintf(fp, " (%zu files)\n", files.size());
				for (const auto& file : files) {
					std::string rel = make_relative_path(file, root_dir_str);
					fprintf(fp, "  %s\n", rel.c_str());
				}
				fprintf(fp, "\n");
			}
		}
		fclose(fp);

		std::cout << "结果已保存至 " << (output_dir / (output_prefix + "_Head8Byte_Decomp.txt")) << "\n";
	}

	std::cout << "\n按任意键退出...\n";
	std::cin.ignore();
	std::cin.get();

	return 0;
}
