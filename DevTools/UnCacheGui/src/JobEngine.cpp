// JobEngine.cpp
// 扫描 / 并行解压 / 写出的具体实现。

#include "JobEngine.h"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>

#include <algorithm>
#include <chrono>
#include <cstring>
#include <format>
#include <string_view>

namespace {

constexpr uint64_t KB = 1024ull;
constexpr uint64_t MB = KB * 1024ull;
constexpr size_t WRITE_CHUNK = 16ull * MB;   // 单次 WriteFile 上限，控制工作集
constexpr uint64_t PER_THREAD_BUDGET = 192ull * MB; // 并行解压的私有内存配额（每线程）

bool EndsWithNoCase(std::wstring_view s, std::wstring_view suffix) {
	if (s.size() < suffix.size())
		return false;
	return _wcsicmp(s.data() + (s.size() - suffix.size()), suffix.data()) == 0;
}

std::wstring WinErrorText(DWORD code) {
	wchar_t* buf = nullptr;
	const DWORD n = FormatMessageW(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM |
	                               FORMAT_MESSAGE_IGNORE_INSERTS,
	                               nullptr, code, 0, reinterpret_cast<LPWSTR>(&buf), 0, nullptr);
	std::wstring text;
	if (n > 0 && buf) {
		text.assign(buf, n);
		while (!text.empty() && (text.back() == L'\r' || text.back() == L'\n' || text.back() == L' '))
			text.pop_back();
	}
	if (buf)
		LocalFree(buf);
	if (text.empty())
		text = L"未知错误";
	return std::format(L"{} (0x{:08X})", text, code);
}

uint64_t FileSizeOf(const WIN32_FIND_DATAW& fd) {
	return (static_cast<uint64_t>(fd.nFileSizeHigh) << 32) | fd.nFileSizeLow;
}

// 写出全部内容；失败返回 false
bool WriteAll(HANDLE hFile, const uint8_t* data, size_t size, std::wstring& error) {
	while (size > 0) {
		const DWORD chunk = static_cast<DWORD>(std::min<size_t>(size, WRITE_CHUNK));
		DWORD written = 0;
		if (!WriteFile(hFile, data, chunk, &written, nullptr) || written != chunk) {
			error = std::format(L"写入失败：{}", WinErrorText(GetLastError()));
			return false;
		}
		data += chunk;
		size -= chunk;
	}
	return true;
}

} // namespace

// ------------------------------ 工具 ------------------------------

std::wstring JobEngine::MakeOutputPath(const std::wstring& cachePath) {
	// xxx.lua.cache -> xxx.luac；其余去掉末尾 .cache
	if (EndsWithNoCase(cachePath, L".lua.cache"))
		return cachePath.substr(0, cachePath.size() - 10) + L".luac";
	if (EndsWithNoCase(cachePath, L".cache"))
		return cachePath.substr(0, cachePath.size() - 6);
	return cachePath + L".unpacked";
}

std::wstring JobEngine::ExtensionOf(const std::wstring& path) {
	const size_t slash = path.find_last_of(L"\\/");
	const size_t dot = path.find_last_of(L'.');
	if (dot == std::wstring::npos || (slash != std::wstring::npos && dot < slash))
		return {};
	std::wstring ext = path.substr(dot + 1);
	std::transform(ext.begin(), ext.end(), ext.begin(), [](wchar_t c) {
		return static_cast<wchar_t>(towlower(c));
	});
	return ext;
}

// ------------------------------ 生命周期 ------------------------------

JobEngine::~JobEngine() {
	m_stop.store(true, std::memory_order_release);
	{
		std::lock_guard lk(m_memMutex);
		m_memCv.notify_all();
	}
	if (m_scanThread.joinable())
		m_scanThread.join();
	if (m_supervisor.joinable())
		m_supervisor.join();
}

void JobEngine::Stop() {
	m_stop.store(true, std::memory_order_release);
	std::lock_guard lk(m_memMutex);
	m_memCv.notify_all();
}

EngineStats JobEngine::Snapshot() const {
	std::lock_guard lk(m_statMutex);
	return m_stats;
}

bool JobEngine::StartScan(std::vector<std::wstring> roots, JobOptions options, EngineCallbacks callbacks) {
	if (IsBusy())
		return false;
	// 上一任扫描线程已经跑完，但 std::thread 对象在被 join 前仍是 joinable，
	// 对 joinable 对象移动赋值会直接 std::terminate（表现为程序突然退出），先回收。
	if (m_scanThread.joinable())
		m_scanThread.join();

	m_options = std::move(options);
	m_callbacks = std::move(callbacks);
	m_roots = std::move(roots);
	m_tasks.clear();
	m_nextIndex.store(0);
	m_stop.store(false);
	m_busy.store(true);
	{
		std::lock_guard lk(m_statMutex);
		m_stats = {};
	}

	uint32_t threads = ResolveThreadCount();
	m_memLimit = std::max(256ull * MB, static_cast<uint64_t>(threads) * PER_THREAD_BUDGET);

	m_scanThread = std::thread([this] { ScanWorker(); });
	return true;
}

bool JobEngine::StartTasks(std::vector<TaskEntry> tasks, JobOptions options, EngineCallbacks callbacks) {
	if (IsBusy())
		return false;

	m_options = std::move(options);
	m_callbacks = std::move(callbacks);
	m_roots.clear();
	m_tasks = std::move(tasks);
	m_nextIndex.store(0);
	m_stop.store(false);
	m_busy.store(true);
	{
		std::lock_guard lk(m_statMutex);
		m_stats = {};
		m_stats.totalFiles = static_cast<uint32_t>(m_tasks.size());
		uint64_t bytes = 0;
		for (const auto& t : m_tasks)
			bytes += t.size;
		m_stats.totalBytes = bytes;
	}

	m_memLimit = std::max(256ull * MB, static_cast<uint64_t>(ResolveThreadCount()) * PER_THREAD_BUDGET);
	Run();
	return true;
}

uint32_t JobEngine::ResolveThreadCount() const {
	uint32_t threads = m_options.threadCount;
	if (threads == 0)
		threads = std::max<uint32_t>(2u, std::thread::hardware_concurrency());
	return std::clamp<uint32_t>(threads, 1u, 64u);
}

void JobEngine::Run() {
	// 同 StartScan：回收上一任 supervisor 线程对象，避免对 joinable 对象赋值触发 terminate。
	// 能走到这里说明上一作业已结束（busy 已清零），join 只会等它最后几次 PostMessage，不会死锁。
	if (m_supervisor.joinable())
		m_supervisor.join();

	if (m_tasks.empty()) {
		m_busy.store(false);
		if (m_callbacks.onFinished)
			m_callbacks.onFinished(Snapshot());
		return;
	}

	const uint32_t threads = std::min<uint32_t>(ResolveThreadCount(), static_cast<uint32_t>(m_tasks.size()));

	m_supervisor = std::thread([this, threads] {
		std::vector<std::thread> pool;
		pool.reserve(threads);
		for (uint32_t i = 0; i < threads; ++i)
			pool.emplace_back([this] { ThreadWorker(); });
		for (auto& t : pool)
			t.join();

		m_busy.store(false);
		if (m_callbacks.onFinished)
			m_callbacks.onFinished(Snapshot());
	});
}

// ------------------------------ 扫描 ------------------------------

void JobEngine::ScanWorker() {
	std::vector<TaskEntry> tasks;
	std::vector<std::wstring> dirs;
	tasks.reserve(1024);
	dirs.reserve(256);

	// 分离根：.cache 文件直接收录，文件夹进入遍历栈
	for (const auto& root : m_roots) {
		const DWORD attrs = GetFileAttributesW(root.c_str());
		if (attrs == INVALID_FILE_ATTRIBUTES)
			continue;
		if (attrs & FILE_ATTRIBUTE_DIRECTORY) {
			dirs.push_back(root);
		} else if (EndsWithNoCase(root, L".cache")) {
			WIN32_FIND_DATAW fd{};
			const uint64_t size = (FindFirstFileW(root.c_str(), &fd) != INVALID_HANDLE_VALUE)
			                      ? FileSizeOf(fd)
			                      : 0ull;
			tasks.push_back({ root, size });
		}
	}

	uint32_t reported = 0;
	auto reportTime = std::chrono::steady_clock::now();
	auto maybeReport = [&] {
		const auto tp = std::chrono::steady_clock::now();
		const uint32_t found = static_cast<uint32_t>(tasks.size());
		if (found - reported >= 512 ||
		    std::chrono::duration_cast<std::chrono::milliseconds>(tp - reportTime).count() > 200) {
			reported = found;
			reportTime = tp;
			if (m_callbacks.onScanProgress)
				m_callbacks.onScanProgress(reported);
		}
	};

	// 显式栈遍历，避免超深目录递归；用 FindFirstFile/FindNextFile 一次拿到大小，免去逐文件 stat
	for (size_t di = 0; di < dirs.size(); ++di) {
		if (m_stop.load(std::memory_order_relaxed))
			break;
		std::wstring pattern = dirs[di];
		if (!pattern.empty() && pattern.back() != L'\\' && pattern.back() != L'/')
			pattern += L'\\';
		const std::wstring dirText = pattern;
		pattern += L'*';

		WIN32_FIND_DATAW fd{};
		HANDLE hFind = FindFirstFileW(pattern.c_str(), &fd);
		if (hFind == INVALID_HANDLE_VALUE)
			continue;
		do {
			const std::wstring_view name(fd.cFileName);
			if (name == L"." || name == L"..")
				continue;
			const bool isDir = (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
			if (isDir) {
				// 不跟随符号链接/目录 junction，防环
				if (fd.dwReserved0 == IO_REPARSE_TAG_SYMLINK)
					continue;
				if (m_options.recursive)
					dirs.push_back(std::wstring(dirText) + std::wstring(name));
			} else if (EndsWithNoCase(name, L".cache")) {
				tasks.push_back({ std::wstring(dirText) + std::wstring(name), FileSizeOf(fd) });
				maybeReport();
			}
		} while (FindNextFileW(hFind, &fd));
		FindClose(hFind);
	}

	maybeReport();

	m_tasks = std::move(tasks);
	{
		std::lock_guard lk(m_statMutex);
		m_stats.totalFiles = static_cast<uint32_t>(m_tasks.size());
		uint64_t bytes = 0;
		for (const auto& t : m_tasks)
			bytes += t.size;
		m_stats.totalBytes = bytes;
	}
	// 扫到空列表时 UI 不会再调 Run()，而 m_busy 只在 supervisor 结束时清零，
	// 不处理会让引擎永远「忙」，后续所有任务被拒。在这里自行释放。
	if (m_tasks.empty())
		m_busy.store(false);
	if (m_callbacks.onScanned)
		m_callbacks.onScanned(m_tasks);
}

// ------------------------------ 工作线程 ------------------------------

void JobEngine::ThreadWorker() {
	codec::Scratch scratch;
	while (true) {
		if (m_stop.load(std::memory_order_relaxed))
			break;
		const uint32_t index = m_nextIndex.fetch_add(1, std::memory_order_relaxed);
		if (index >= static_cast<uint32_t>(m_tasks.size()))
			break;

		FileResult result;
		result.index = index;
		ProcessOne(m_tasks[index], index, scratch, result);

		{
			std::lock_guard lk(m_statMutex);
			m_stats.doneBytes += result.inSize;
			++m_stats.doneFiles;
			switch (result.status) {
			case FileStatus::Success: ++m_stats.success; break;
			case FileStatus::Failed:  ++m_stats.failed;  break;
			case FileStatus::Skipped: ++m_stats.skipped; break;
			default: break;
			}
		}

		if (m_callbacks.onFileDone)
			m_callbacks.onFileDone(result);
	}
}

bool JobEngine::ReserveMemory(size_t bytes) {
	if (bytes == 0)
		return true;
	std::unique_lock lk(m_memMutex);
	m_memCv.wait(lk, [this, bytes] {
		return m_stop.load(std::memory_order_relaxed) || m_memUsed + bytes <= m_memLimit || m_memUsed == 0;
	});
	if (m_stop.load(std::memory_order_relaxed))
		return false;
	m_memUsed += bytes;
	return true;
}

void JobEngine::ReleaseMemory(size_t bytes) {
	{
		std::lock_guard lk(m_memMutex);
		m_memUsed = (m_memUsed > bytes) ? (m_memUsed - bytes) : 0;
	}
	m_memCv.notify_all();
}

void JobEngine::ProcessOne(const TaskEntry& task, uint32_t /*index*/,
                           codec::Scratch& scratch, FileResult& result) {
	result.inSize = task.size;
	result.status = FileStatus::Failed;

	const auto t0 = std::chrono::steady_clock::now();
	const std::wstring outPath = MakeOutputPath(task.path);

	auto finish = [&] {
		result.elapsedMs = static_cast<uint64_t>(
			std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - t0).count());
	};

	// 是否需要删除前 8 字节：按输出文件的扩展名判定
	bool strip = false;
	if (m_options.stripHeader) {
		if (m_options.stripAllExtensions) {
			strip = true;
		} else {
			const std::wstring ext = ExtensionOf(outPath);
			strip = std::find(m_options.stripExtensions.begin(), m_options.stripExtensions.end(), ext) !=
			        m_options.stripExtensions.end();
		}
	}

	if (m_options.skipExisting && GetFileAttributesW(outPath.c_str()) != INVALID_FILE_ATTRIBUTES) {
		result.status = FileStatus::Skipped;
		result.message = L"输出已存在，跳过";
		return finish();
	}

	// ---- 读：优先内存映射（零拷贝，顺序扫描提示） ----
	HANDLE hIn = CreateFileW(task.path.c_str(), GENERIC_READ,
	                         FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
	                         nullptr, OPEN_EXISTING, FILE_FLAG_SEQUENTIAL_SCAN, nullptr);
	if (hIn == INVALID_HANDLE_VALUE) {
		result.message = std::format(L"打开源文件失败：{}", WinErrorText(GetLastError()));
		return finish();
	}

	LARGE_INTEGER liSize{};
	GetFileSizeEx(hIn, &liSize);
	const uint64_t fileSize = static_cast<uint64_t>(std::max<LONGLONG>(0, liSize.QuadPart));
	result.inSize = fileSize;
	if (fileSize == 0) {
		CloseHandle(hIn);
		result.message = L"源文件为空";
		return finish();
	}

	const uint8_t* view = nullptr;
	HANDLE hMap = nullptr;
	std::vector<uint8_t> fallback; // 映射失败（网络盘 / 特殊文件系统）时退回普通读

	if (fileSize <= 0x7FFFFFFF0000ull) {
		hMap = CreateFileMappingW(hIn, nullptr, PAGE_READONLY, 0, 0, nullptr);
		if (hMap)
			view = static_cast<const uint8_t*>(MapViewOfFile(hMap, FILE_MAP_READ, 0, 0, 0));
	}
	if (view == nullptr) {
		if (hMap) { CloseHandle(hMap); hMap = nullptr; }
		if (!ReserveMemory(static_cast<size_t>(fileSize))) {
			CloseHandle(hIn);
			result.status = FileStatus::Cancelled;
			result.message = L"已停止";
			return finish();
		}
		fallback.resize(static_cast<size_t>(fileSize));
		size_t done = 0;
		while (done < fallback.size()) {
			DWORD got = 0;
			const DWORD want = static_cast<DWORD>(std::min<size_t>(fallback.size() - done, WRITE_CHUNK));
			if (!ReadFile(hIn, fallback.data() + done, want, &got, nullptr) || got == 0) {
				ReleaseMemory(static_cast<size_t>(fileSize));
				CloseHandle(hIn);
				result.message = std::format(L"读取失败：{}", WinErrorText(GetLastError()));
				return finish();
			}
			done += got;
		}
		view = fallback.data();
	}

	codec::Header header;
	codec::Payload payload;
	std::wstring error;
	const size_t mappedSize = static_cast<size_t>(fileSize);

	bool reservedOut = false;
	if (!codec::ParseHeader(view, mappedSize, header, error)) {
		result.message = error;
	} else {
		const size_t need = header.decompress ? header.outSize : 0;
		if (need > 0) {
			if (!ReserveMemory(need)) {
				result.status = FileStatus::Cancelled;
				result.message = L"已停止";
			} else
				reservedOut = true;
		}
		if (result.status != FileStatus::Cancelled && !codec::Decode(view, mappedSize, header, strip, scratch, payload, error))
			result.message = error;
	}

	if (result.message.empty()) {
		// ---- 写：CREATE_ALWAYS，预分配磁盘簇，分块顺序写 ----
		HANDLE hOut = CreateFileW(outPath.c_str(), GENERIC_WRITE, 0, nullptr,
		                          CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_SEQUENTIAL_SCAN, nullptr);
		if (hOut == INVALID_HANDLE_VALUE) {
			result.message = std::format(L"创建输出文件失败：{}", WinErrorText(GetLastError()));
		} else {
			FILE_ALLOCATION_INFO alloc{};
			alloc.AllocationSize.QuadPart = static_cast<LONGLONG>(payload.size);
			SetFileInformationByHandle(hOut, FileAllocationInfo, &alloc, sizeof(alloc));

			if (!WriteAll(hOut, payload.data, payload.size, error)) {
				result.message = error;
			} else {
				result.status = FileStatus::Success;
				result.outSize = payload.size;
				std::wstring note = codec::DescribeSizeFlag(header.sizeFlag);
				if (payload.decompressed)
					note += L" → LZ 解压";
				else
					note += L" → 原样截取";
				if (payload.stripped)
					note += L" → 已删前 8 字节";
				if (payload.truncated)
					note += L" → 数据流提前结束(尾部补零)";
				result.message = std::move(note);
			}
			CloseHandle(hOut);
			if (result.status != FileStatus::Success)
				DeleteFileW(outPath.c_str()); // 不留半成品
		}
	}

	if (view == fallback.data())
		ReleaseMemory(static_cast<size_t>(fileSize));
	else
		UnmapViewOfFile(view);
	if (reservedOut)
		ReleaseMemory(header.outSize);
	if (hMap)
		CloseHandle(hMap);
	CloseHandle(hIn);

	finish();
}
