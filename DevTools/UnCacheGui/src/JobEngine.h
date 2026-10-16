// JobEngine.h
// 批量解压作业引擎：递归扫描 .cache、内存映射读取、线程池并行解压、原地写出。
// 所有回调都在工作线程上触发，接收方（GUI）只做 PostMessage 转投主线程。

#pragma once

#include <atomic>
#include <cstdint>
#include <condition_variable>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "CacheCodec.h"

// 单个文件的处理状态
enum class FileStatus : uint8_t {
	Queued = 0,   // 排队中（仅 UI 初态）
	Success,      // 解压写出成功
	Failed,       // 失败（损坏 / IO 错误）
	Skipped,      // 跳过（输出已存在等）
	Cancelled,    // 被停止
};

struct JobOptions {
	bool stripHeader = true;              // 是否删除解压结果前 8 字节
	bool stripAllExtensions = false;      // true = 所有格式都删；false = 只删下面列表里的
	std::vector<std::wstring> stripExtensions{ L"dds", L"tga" }; // 小写、不含点
	bool recursive = true;                // 拖入文件夹时递归子目录
	bool skipExisting = true;             // 输出已存在则跳过
	uint32_t threadCount = 0;             // 0 = 自动（按 CPU 逻辑核）
};

struct TaskEntry {
	std::wstring path;
	uint64_t size = 0;
};

struct FileResult {
	uint32_t index = 0;
	FileStatus status = FileStatus::Queued;
	uint64_t inSize = 0;
	uint64_t outSize = 0;
	uint64_t elapsedMs = 0;
	std::wstring message; // 失败原因，或 "0x6F 压缩/4字节长度, 已删头8字节" 之类的说明
};

struct EngineStats {
	uint64_t totalBytes = 0;
	uint64_t doneBytes = 0;
	uint32_t totalFiles = 0;
	uint32_t doneFiles = 0;
	uint32_t success = 0;
	uint32_t failed = 0;
	uint32_t skipped = 0;
};

struct EngineCallbacks {
	std::function<void(const std::vector<TaskEntry>&)> onScanned; // 扫描完成（可能耗时较久）
	std::function<void(uint32_t foundCount)> onScanProgress;       // 扫描期间节流回报
	std::function<void(const FileResult&)> onFileDone;             // 每个文件一条
	std::function<void(const EngineStats&)> onFinished;            // 全部线程退出
};

class JobEngine {
public:
	JobEngine() = default;
	~JobEngine();

	JobEngine(const JobEngine&) = delete;
	JobEngine& operator=(const JobEngine&) = delete;

	// 阶段一：后台扫描（roots 为文件/文件夹混合列表）。返回 false 表示正在忙。
	bool StartScan(std::vector<std::wstring> roots, JobOptions options, EngineCallbacks callbacks);

	// 跳过扫描，直接用已有的任务列表开跑（“开始解压”重试现有列表）。
	bool StartTasks(std::vector<TaskEntry> tasks, JobOptions options, EngineCallbacks callbacks);

	// 阶段二：扫描回调里由 UI 调用，启动线程池。
	void Run();

	void Stop();
	bool IsBusy() const { return m_busy.load(std::memory_order_relaxed); }
	EngineStats Snapshot() const;

	// 工具：把 .cache 输入路径换算成输出路径（xxx.lua.cache -> xxx.luac，其余去掉 .cache）
	static std::wstring MakeOutputPath(const std::wstring& cachePath);
	// 工具：取扩展名（小写、不含点）
	static std::wstring ExtensionOf(const std::wstring& path);

private:
	void ScanWorker();
	void ThreadWorker();
	void ProcessOne(const TaskEntry& task, uint32_t index, codec::Scratch& scratch, FileResult& result);

	bool ReserveMemory(size_t bytes);
	void ReleaseMemory(size_t bytes);

	uint32_t ResolveThreadCount() const;

	JobOptions m_options;
	EngineCallbacks m_callbacks;
	std::vector<std::wstring> m_roots; // 拖入/选中的原始路径（文件或文件夹）
	std::vector<TaskEntry> m_tasks;    // 扫描结果，扫描线程写、池线程只读

	std::thread m_scanThread;     // 扫描线程
	std::thread m_supervisor;     // 创建并回收线程池，最后回报 onFinished

	std::atomic<uint32_t> m_nextIndex{ 0 };
	std::atomic<bool> m_stop{ false };
	std::atomic<bool> m_busy{ false };

	mutable std::mutex m_statMutex;
	EngineStats m_stats;

	std::mutex m_memMutex;
	std::condition_variable m_memCv;
	uint64_t m_memUsed = 0;
	uint64_t m_memLimit = 256ull << 20;
};
