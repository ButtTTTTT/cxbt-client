#pragma once

#include <atomic>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>
#include <Windows.h>

namespace UnPdeC {
	/// <summary>
	/// 基于 Win32 内存映射实现的高性能只读文件访问工具，支持多视图复用
	/// </summary>
	class MemoryMapper {
	private:
		HANDLE m_hFile = INVALID_HANDLE_VALUE;
		HANDLE m_hMapFile = NULL;
		std::string m_currentPath;
		std::atomic<uint64_t> m_fileSize = 0;
		uint64_t m_allocationGranularity = 0;

		struct MappedView {
			LPVOID baseAddress = nullptr;
			uint64_t viewOffset = 0;
			uint32_t viewSize = 0;
		};

		std::unordered_map<uint64_t, std::unique_ptr<MappedView>> m_viewCache;
		mutable std::recursive_mutex m_mutex;

		void CleanupViews();
		std::unique_ptr<MappedView> CreateView(uint64_t offset, uint32_t size);
		const uint8_t* GetOrCreateView(uint64_t offset, uint32_t size);

	public:
		/// <summary>
		/// 构造函数，初始化内存映射器
		/// </summary>
		MemoryMapper();

		/// <summary>
		/// 析构函数，自动关闭文件
		/// </summary>
		~MemoryMapper();

		MemoryMapper(const MemoryMapper&) = delete;
		MemoryMapper& operator=(const MemoryMapper&) = delete;

		/// <summary>
		/// 获取单例实例
		/// </summary>
		/// <returns>MemoryMapper 单例实例的引用</returns>
		static MemoryMapper& GetInstance();

		/// <summary>
		/// 打开文件并创建内存映射
		/// </summary>
		/// <param name="filePath">要打开的文件路径</param>
		/// <exception cref="std::runtime_error">当文件打开失败时抛出异常</exception>
		void OpenFile(const std::string& filePath);

		/// <summary>
		/// 关闭文件并清理所有映射视图
		/// </summary>
		void CloseFile();

		/// <summary>
		/// 从文件中读取指定偏移量和大小的数据
		/// </summary>
		/// <param name="offset">读取起始偏移量</param>
		/// <param name="size">要读取的数据大小</param>
		/// <returns>读取到的数据字节数组</returns>
		/// <exception cref="std::runtime_error">当文件未打开时抛出异常</exception>
		std::vector<uint8_t> ReadData(uint64_t offset, uint32_t size);

		/// <summary>
		/// 批量读取多个数据块，优化读取性能
		/// </summary>
		/// <param name="blocks">要读取的数据块列表，每个元素包含偏移量和大小</param>
		/// <returns>读取到的数据块数组</returns>
		/// <exception cref="std::runtime_error">当文件未打开时抛出异常</exception>
		std::vector<std::vector<uint8_t>> ReadMultipleBlocks(
			const std::vector<std::pair<uint64_t, uint32_t>>& blocks);

		/// <summary>
		/// 获取当前打开文件的大小
		/// </summary>
		/// <returns>文件大小（字节）</returns>
		uint64_t GetFileSize() const;

		/// <summary>
		/// 获取当前打开文件的路径
		/// </summary>
		/// <returns>文件路径字符串</returns>
		const std::string& GetCurrentPath() const;

		/// <summary>
		/// 检查文件是否已打开
		/// </summary>
		/// <returns>如果文件已打开则返回 true，否则返回 false</returns>
		bool IsOpen() const;
	};
}
