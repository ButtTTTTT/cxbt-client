#include "Pch.h"
#include "MemoryMapper.h"

namespace UnPdeC {
	// 根据系统分配粒度初始化映射器，后续所有视图创建都按该粒度对齐
	MemoryMapper::MemoryMapper() {
		SYSTEM_INFO sysInfo;
		GetSystemInfo(&sysInfo);
		m_allocationGranularity = sysInfo.dwAllocationGranularity;
	}

	MemoryMapper::~MemoryMapper() {
		CloseFile();
	}

	MemoryMapper& MemoryMapper::GetInstance() {
		static MemoryMapper instance;
		return instance;
	}

	// 释放当前缓存的所有视图，通常在重新打开文件或关闭文件时调用
	void MemoryMapper::CleanupViews() {
		for (auto& pair : m_viewCache) {
			if (pair.second->baseAddress) {
				UnmapViewOfFile(pair.second->baseAddress);
			}
		}
		m_viewCache.clear();
	}

	// 在指定偏移处创建新的映射视图，并在内部对齐到系统分配粒度
	std::unique_ptr<MemoryMapper::MappedView> MemoryMapper::CreateView(uint64_t offset, uint32_t size) {
		uint64_t viewOffset = offset / m_allocationGranularity * m_allocationGranularity;
		DWORD offsetInView = static_cast<DWORD>(offset - viewOffset);
		DWORD viewSize = offsetInView + size;

		if (viewOffset + viewSize > m_fileSize) {
			viewSize = static_cast<DWORD>(m_fileSize - viewOffset);
		}

		LPVOID baseAddress = MapViewOfFile(
			m_hMapFile, FILE_MAP_READ,
			static_cast<DWORD>(viewOffset >> 32),
			static_cast<DWORD>(viewOffset & 0xFFFFFFFF),
			viewSize
		);

		if (!baseAddress) {
			DWORD error = GetLastError();
			throw std::runtime_error("映射文件视图失败: " + std::to_string(error));
		}

		auto view = std::make_unique<MappedView>();
		view->baseAddress = baseAddress;
		view->viewOffset = viewOffset;
		view->viewSize = viewSize;
		return view;
	}

	// 复用或创建映射视图，返回给定偏移处的只读字节指针
	const uint8_t* MemoryMapper::GetOrCreateView(uint64_t offset, uint32_t size) {
		uint64_t viewOffset = offset / m_allocationGranularity * m_allocationGranularity;
		auto it = m_viewCache.find(viewOffset);
		if (it != m_viewCache.end()) {
			return static_cast<const uint8_t*>(it->second->baseAddress) + (offset - viewOffset);
		}
		auto view = CreateView(offset, size);
		const uint8_t* dataPtr = static_cast<const uint8_t*>(view->baseAddress) + (offset - viewOffset);
		m_viewCache[viewOffset] = std::move(view);
		return dataPtr;
	}

	void MemoryMapper::OpenFile(const std::string& filePath) {
		std::lock_guard<std::recursive_mutex> lock(m_mutex);

		if (m_hFile != INVALID_HANDLE_VALUE && filePath == m_currentPath) {
			return;
		}

		if (m_hFile != INVALID_HANDLE_VALUE) {
			CleanupViews();
			if (m_hMapFile) {
				CloseHandle(m_hMapFile);
				m_hMapFile = NULL;
			}
			CloseHandle(m_hFile);
			m_hFile = INVALID_HANDLE_VALUE;
		}

		m_hFile = CreateFileA(
			filePath.c_str(), GENERIC_READ,
			FILE_SHARE_READ, NULL, OPEN_EXISTING,
			FILE_ATTRIBUTE_NORMAL | FILE_FLAG_RANDOM_ACCESS | FILE_FLAG_SEQUENTIAL_SCAN, NULL
		);

		if (m_hFile == INVALID_HANDLE_VALUE) {
			DWORD error = GetLastError();
			throw std::runtime_error("无法打开文件: " + filePath + ", 错误: " + std::to_string(error));
		}

		LARGE_INTEGER fileSize;
		if (!GetFileSizeEx(m_hFile, &fileSize)) {
			DWORD error = GetLastError();
			CloseHandle(m_hFile);
			m_hFile = INVALID_HANDLE_VALUE;
			throw std::runtime_error("获取文件大小失败: " + std::to_string(error));
		}
		m_fileSize = fileSize.QuadPart;

		m_hMapFile = CreateFileMapping(
			m_hFile, NULL, PAGE_READONLY,
			static_cast<DWORD>(m_fileSize >> 32),
			static_cast<DWORD>(m_fileSize & 0xFFFFFFFF), NULL
		);

		if (m_hMapFile == NULL) {
			DWORD error = GetLastError();
			CloseHandle(m_hFile);
			m_hFile = INVALID_HANDLE_VALUE;
			throw std::runtime_error("创建文件映射失败: " + std::to_string(error));
		}

		m_currentPath = filePath;
	}

	void MemoryMapper::CloseFile() {
		std::lock_guard<std::recursive_mutex> lock(m_mutex);
		CleanupViews();
		if (m_hMapFile) {
			CloseHandle(m_hMapFile);
			m_hMapFile = NULL;
		}
		if (m_hFile != INVALID_HANDLE_VALUE) {
			CloseHandle(m_hFile);
			m_hFile = INVALID_HANDLE_VALUE;
		}
		m_currentPath.clear();
		m_fileSize = 0;
	}

	std::vector<uint8_t> MemoryMapper::ReadData(uint64_t offset, uint32_t size) {
		std::lock_guard<std::recursive_mutex> lock(m_mutex);

		if (m_hMapFile == NULL) {
			throw std::runtime_error("文件未打开");
		}

		if (offset >= m_fileSize) {
			return {};
		}

		if (offset + size > m_fileSize) {
			size = static_cast<uint32_t>(m_fileSize - offset);
		}

		const uint8_t* dataPtr = GetOrCreateView(offset, size);
		return std::vector<uint8_t>(dataPtr, dataPtr + size);
	}

	std::vector<std::vector<uint8_t>> MemoryMapper::ReadMultipleBlocks(
		const std::vector<std::pair<uint64_t, uint32_t>>& blocks) {
		std::lock_guard<std::recursive_mutex> lock(m_mutex);

		if (m_hMapFile == NULL) {
			throw std::runtime_error("文件未打开");
		}

		std::vector<std::vector<uint8_t>> results;
		results.reserve(blocks.size());

		if (blocks.empty()) {
			return results;
		}

		std::vector<size_t> indices(blocks.size());
		std::iota(indices.begin(), indices.end(), 0);
		std::sort(indices.begin(), indices.end(), [&](size_t a, size_t b) {
			return blocks[a].first < blocks[b].first;
		});

		std::unique_ptr<MappedView> currentView;

		for (size_t idx : indices) {
			const auto& block = blocks[idx];
			uint64_t offset = block.first;
			uint32_t size = block.second;

			if (offset >= m_fileSize) {
				results.push_back({});
				continue;
			}

			uint32_t adjustedSize = size;
			if (offset + size > m_fileSize) {
				adjustedSize = static_cast<uint32_t>(m_fileSize - offset);
			}

			if (!currentView || offset < currentView->viewOffset ||
				offset + adjustedSize > currentView->viewOffset + currentView->viewSize) {
				if (currentView) {
					UnmapViewOfFile(currentView->baseAddress);
					currentView.reset();
				}
				currentView = CreateView(offset, adjustedSize);
			}

			const uint8_t* dataPtr = static_cast<const uint8_t*>(currentView->baseAddress) +
				(offset - currentView->viewOffset);
			results.push_back(std::vector<uint8_t>(dataPtr, dataPtr + adjustedSize));
		}

		if (currentView) {
			UnmapViewOfFile(currentView->baseAddress);
		}

		std::vector<std::vector<uint8_t>> orderedResults(blocks.size());
		for (size_t i = 0; i < indices.size(); ++i) {
			orderedResults[indices[i]] = std::move(results[i]);
		}

		return orderedResults;
	}

	uint64_t MemoryMapper::GetFileSize() const {
		return m_fileSize.load();
	}

	const std::string& MemoryMapper::GetCurrentPath() const {
		return m_currentPath;
	}

	bool MemoryMapper::IsOpen() const {
		return m_hFile != INVALID_HANDLE_VALUE;
	}
}
