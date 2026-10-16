#include "Pch.h"
#include "RecursiveHelpers.h"
#include "Extract.h"
#include "GV.h"
#include "Logger.h"
#include "Tools.h"
#include "Types.h"
#include "VFSTable.h"

namespace UnPdeC::RecursiveMode::Helpers {
	// 将 VFS 数据块解析为 SHexOffsetInfo 列表：
	// - 每个条目固定占用 0x80 字节，其中：
	//   * Byte[0]          : 条目类型（1=文件，2=目录，其它值跳过）
	//   * Byte[1..n]      : 以 '\0' 结尾的 UTF-8 名称，最长不超过 0x6F 字节
	//   * Byte[0x70..0x77]: NTFS 时间戳（自 1601-01-01 以来的 100ns 计数）
	//   * Byte[0x78..0x7B]: 原始偏移 OriginalOffset
	//   * Byte[0x7C..0x7F]: 条目大小 Size
	// - 本函数会进行基本合法性检查，只保留名称有效、类型为 1 或 2 的条目
	static std::vector<SHexOffsetInfo> ParseOffsetInfo(std::span<const uint8_t> data) {
		constexpr uint32_t blockSize = 0x80;
		constexpr uint32_t maxNameLength = 0x6F;
		constexpr uint32_t ntfsTimeOffset = 0x70;
		constexpr uint64_t windowsTick = 10000000ULL;
		constexpr uint64_t secToUnixEpoch = 11644473600ULL;

		Logger::Debug("开始解析偏移信息，数据大小: " + std::to_string(data.size()));

		const size_t blockCount = data.size() / blockSize;
		Logger::Debug("块数量: " + std::to_string(blockCount));

		std::vector<SHexOffsetInfo> offsetInfos;
		offsetInfos.reserve(blockCount);

		for (size_t blockIndex = 0; blockIndex < blockCount; ++blockIndex) {
			const size_t blockStart = blockIndex * blockSize;
			auto block = data.subspan(blockStart, blockSize);

			// 第 0 字节决定条目类型：1=文件，2=目录，其它值直接跳过
			const uint8_t entryType = block[0];
			if (entryType != 1 && entryType != 2) continue;

			// 从第 1 字节开始查找 '\0' 作为名称结束位置
			const auto nameEnd = std::find(block.begin() + 1, block.end(), '\0');
			const size_t nameLength = std::distance(block.begin() + 1, nameEnd);

			// 名称为空或超出允许长度时视为无效条目
			if (nameLength == 0 || nameLength >= maxNameLength) {
				continue;
			}

			const std::string entryName(reinterpret_cast<const char*>(block.data() + 1), nameLength);

			uint32_t entrySize = 0;
			uint32_t originalOffset = 0;

			std::memcpy(&originalOffset, block.data() + blockSize - 8, 4);
			std::memcpy(&entrySize, block.data() + blockSize - 4, 4);

			// 从 NTFS 时间戳字段转换为 Unix 时间戳（秒）
			uint64_t ntfsTime = 0;
			std::memcpy(&ntfsTime, block.data() + ntfsTimeOffset, 8);

			uint64_t secondsSince1601 = ntfsTime / windowsTick;
			time_t unixTime = static_cast<time_t>(secondsSince1601 - secToUnixEpoch);

			offsetInfos.emplace_back(SHexOffsetInfo{
				entryType,
				entryName,
				unixTime,
				entrySize,
				originalOffset
			});
		}

		Logger::Debug("解析完成，找到 " + std::to_string(offsetInfos.size()) + " 个条目");
		return offsetInfos;
	}

	std::vector<SHexOffsetInfo> ReadOffsetInfo(UnPdeC::RuntimeContext& ctx, uint32_t offset, uint32_t size) {
		// 从当前 .xor 文件中读取指定偏移和大小的 VFS 数据块
		std::vector<uint8_t> vfsDataBlock = UnPdeC::VFSTable::ReadDataFromXor(ctx, offset, size);
		return ParseOffsetInfo(std::span(vfsDataBlock));
	}

	void DispatchEntries(UnPdeC::RuntimeContext& ctx,
						 const std::vector<SHexOffsetInfo>& entries,
						 const SDirectoryPair& directory,
						 const std::function<void(const SHexOffsetInfo&, const SDirectoryPair&, const std::filesystem::path&)>& handleDirectory) {
		// 计算当前目录在磁盘上的物理路径：AppDir / 当前虚拟目录
		const auto& baseDir = ctx.AppDir / directory.CurrentDir.string();

		Logger::Info("开始提取数据到目录: " + baseDir.string() + ", 条目数: " + std::to_string(entries.size()));

		for (size_t i = 0; i < entries.size(); ++i) {
			const auto& entry = entries[i];

			try {
				// Type=1 表示文件条目，交由 ProcessFileEntry 生成文件
				if (entry.Type == 1) {
					ProcessFileEntry(ctx, entry, baseDir);
				// Type=2 表示目录条目，由外部回调决定如何继续递归
				} else if (entry.Type == 2) {
					handleDirectory(entry, directory, baseDir);
				}
			} catch (const std::exception& e) {
				Logger::Error("处理条目失败: " + std::string(e.what()));
				std::cout << " 处理条目失败: " << e.what() << "\n";
			}
		}

		Logger::Info("数据提取完成");
	}

	namespace {
		struct FileProcessPlan {
			std::string finalName;
			bool needProcessData;
		};

		// 根据当前缓存/解压模式和文件名生成最终输出文件名以及是否需要二次解压：
		// - CacheMode=false（推荐解包模式）：
		//   * *.lua.cache -> *.luac（解压 + 改扩展名）
		//   * *.lua       -> *.luac（仅改扩展名，方便直接当字节码使用）
		//   * 其它 *.cache -> 去掉 .cache 后缀，并对数据执行二次解压
		// - CacheMode=true（保留缓存）：
		//   * 含 .cache 的文件保持原名，且不做二次解压，仅原样导出
		FileProcessPlan BuildFileProcessPlan(const UnPdeC::RuntimeContext& ctx, const std::string& name) {
			FileProcessPlan plan{ name, false };

			if (!ctx.CacheMode) {
				if (name.ends_with(".lua.cache")) {
					plan.finalName.replace(plan.finalName.size() - 10, 10, ".luac");
					plan.needProcessData = true;
				} else if (name.ends_with(".lua")) {
					plan.finalName.replace(plan.finalName.size() - 4, 4, ".luac");
				} else if (size_t pos = name.find(".cache"); pos != std::string::npos) {
					plan.finalName = name.substr(0, pos);
					plan.needProcessData = true;
				}
			} else if (name.find(".cache") != std::string::npos) {
				plan.needProcessData = false;
			}

			return plan;
		}

		// 将数据写入指定路径的文件，失败时返回 false 方便上层统一处理：
		// - 使用二进制模式打开文件，确保字节流不被任何编码转换
		// - 写入完成后主动关闭文件句柄，尽快释放系统资源
		// - 出错时记录日志，交由调用方决定是否抛出异常
		bool SaveFileData(const std::filesystem::path& filePath, const std::vector<uint8_t>& data) {
			std::ofstream outFile(filePath, std::ios::binary);
			if (!outFile) {
				Logger::Error("文件创建失败: " + filePath.string());
				return false;
			}
			outFile.write(reinterpret_cast<const char*>(data.data()),
						  static_cast<std::streamsize>(data.size()));
			outFile.close();
			Logger::Debug("文件保存成功: " + filePath.string());
			return true;
		}

		// 确保目标目录存在，不存在时尝试创建并返回最终目录路径：
		// - 若目录不存在，则打印简要信息并尝试创建所有缺失的中间目录
		// - 创建失败时记录错误并返回空路径，由调用方决定后续处理
		std::filesystem::path EnsureDirectory(const std::filesystem::path& baseDir, const std::string& name) {
			std::filesystem::path dirPath = baseDir / name;
			std::error_code ec;

			if (!std::filesystem::exists(dirPath)) {
				std::cout << "▲: " << name << "\n";
				Logger::Debug("创建目录: " + dirPath.string());

				if (!std::filesystem::create_directories(dirPath, ec) || ec) {
					Logger::Error("创建目录失败: " + dirPath.string() + " (" + ec.message() + ")");
					return {};
				}
			}

			return dirPath;
		}

		// 使用 Win32 API 将文件或目录时间戳设置为源文件对应的时间：
		// - 将 Unix 时间戳（自 1970-01-01 以来的秒数）转换为 NTFS FILETIME
		// - 同时设置创建时间、访问时间和修改时间，保持三者一致
		// - 对目录使用 FILE_FLAG_BACKUP_SEMANTICS 打开句柄
		void SetFileTimestamp(const std::filesystem::path& path, time_t unixTime) {
			constexpr uint64_t windowsTick = 10000000ULL;
			constexpr uint64_t secToUnixEpoch = 11644473600ULL;

			uint64_t secondsSince1601 = static_cast<uint64_t>(unixTime) + secToUnixEpoch;
			uint64_t ntfsTime = secondsSince1601 * windowsTick;

			FILETIME fileTime{};
			fileTime.dwLowDateTime = static_cast<DWORD>(ntfsTime & 0xFFFFFFFF);
			fileTime.dwHighDateTime = static_cast<DWORD>((ntfsTime >> 32) & 0xFFFFFFFF);

			HANDLE hFile = CreateFileW(
				path.c_str(),
				GENERIC_WRITE,
				FILE_SHARE_READ | FILE_SHARE_WRITE,
				nullptr,
				OPEN_EXISTING,
				FILE_FLAG_BACKUP_SEMANTICS,
				nullptr
			);

			if (hFile == INVALID_HANDLE_VALUE) {
				Logger::Warning("无法打开文件以设置时间戳: " + path.string());
				return;
			}

			if (!SetFileTime(hFile, &fileTime, &fileTime, &fileTime)) {
				Logger::Warning("设置文件时间戳失败: " + path.string());
			}
			CloseHandle(hFile);
		}
	}

	bool ProcessFileEntry(UnPdeC::RuntimeContext& ctx, const SHexOffsetInfo& entry, const std::filesystem::path& baseDir) {
		FileProcessPlan plan = BuildFileProcessPlan(ctx, entry.Name);
		std::filesystem::path filePath = baseDir / plan.finalName;
		if (std::filesystem::exists(filePath)) {
			return true;
		}

		std::cout << "  △: " << plan.finalName << "\n";
		Logger::Debug("提取文件: " + plan.finalName);

		auto fileData = UnPdeC::VFSTable::ReadDataFromXor(ctx, entry.OriginalOffset, entry.Size);

		if (fileData.size() != entry.Size || fileData.empty() || entry.Name.empty()) {
			Logger::Warning("数据校验失败: " + plan.finalName);
			std::cout << " 数据校验失败: " << plan.finalName << "\n";
			return false;
		}

		std::vector<uint8_t> processedData;
		if (plan.needProcessData) {
			Logger::Debug("解压数据: " + plan.finalName);
			processedData = UnPdeC::Extract::PreExtract(ctx, fileData, entry.Name);
		} else {
			processedData = std::move(fileData);
		}

		if (!std::filesystem::exists(filePath)) {
			if (!SaveFileData(filePath, processedData)) {
				Tools::ThrowError(Tools::ErrorCode::FILE_WRITE_FAILED, "文件创建失败");
			}

			SetFileTimestamp(filePath, entry.UnixTime);
		}

		return true;
	}

	bool ProcessDirectoryEntry(UnPdeC::RuntimeContext& ctx,
							   const SHexOffsetInfo& entry,
							   const SDirectoryPair& directory,
							   const std::filesystem::path& baseDir,
							   const std::function<void(uint32_t, uint32_t, const SDirectoryPair&)>& tryExtract) {
		std::filesystem::path dirPath = EnsureDirectory(baseDir, entry.Name);
		if (dirPath.empty()) {
			return false;
		}

		tryExtract(entry.OriginalOffset, entry.Size, { directory.CurrentDir, directory.CurrentDir / entry.Name });

		SetFileTimestamp(dirPath, entry.UnixTime);
		return true;
	}
}
