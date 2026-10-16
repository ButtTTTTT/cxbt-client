// 递归解包模块实现文件：
// - 负责从根目录开始解析 VFS 表，并通过 Helpers 递归导出所有文件/目录
// - 同时处理块访问追踪导出与内存映射文件清理等收尾工作
#include "Pch.h"
#include "RecursiveMode.h"
#include "GV.h"
#include "Logger.h"
#include "MemoryMapper.h"
#include "RecursiveHelpers.h"
#include "Tracking.h"
#include "Types.h"
#include "UI.h"

// 递归提取实现细节命名空间，仅在本翻译单元内部使用
namespace UnPdeC::RecursiveMode::Detail {
	// VFS 根目录所在的数据块信息：
	// - 从偏移 0x0 开始
	// - 长度固定为 0x1000 字节
	constexpr uint64_t ROOT_OFFSET = 0x0;
	constexpr uint32_t ROOT_SIZE = 0x1000;

	void TryExtract(UnPdeC::RuntimeContext& ctx, uint32_t offset, uint32_t size, const SDirectoryPair& directory);

	/// <summary>
	/// 尝试从指定偏移量和大小提取数据块，并根据条目类型递归处理
	/// </summary>
	/// <param name="offset">VFS 表中的偏移量（以字节为单位）</param>
	/// <param name="size">要提取的数据大小（字节数）</param>
	/// <param name="directory">
	/// 当前递归层级对应的虚拟目录信息：
	/// - RootDir：解包根目录名
	/// - CurrentDir：当前处理的相对路径
	/// </param>
	/// <remarks>
	/// 该函数会：
	/// 1. 调用 Helpers::ReadOffsetInfo 读取并解析 SHexOffsetInfo 列表
	/// 2. 调用 Helpers::DispatchEntries 将文件/目录条目分发给对应处理函数
	/// 3. 对目录条目继续递归调用 TryExtract，实现整棵目录树的深度遍历
	/// </remarks>
	void TryExtract(UnPdeC::RuntimeContext& ctx, uint32_t offset, uint32_t size, const SDirectoryPair& directory) {
		std::vector<SHexOffsetInfo> entries = UnPdeC::RecursiveMode::Helpers::ReadOffsetInfo(ctx, offset, size);
		UnPdeC::RecursiveMode::Helpers::DispatchEntries(ctx, entries, directory,
			[&ctx](const SHexOffsetInfo& entry, const SDirectoryPair& currentDir, const std::filesystem::path& baseDir) {
			UnPdeC::RecursiveMode::Helpers::ProcessDirectoryEntry(
				ctx,
				entry,
				currentDir,
				baseDir,
				[&ctx](uint32_t childOffset, uint32_t childSize, const SDirectoryPair& nextDir) {
				TryExtract(ctx, childOffset, childSize, nextDir);
			});
		});
	}
}

namespace UnPdeC::RecursiveMode {
	void ExtractRecursive(UnPdeC::RuntimeContext& ctx) {
		Logger::Info("开始解压: " + ctx.ThisXor.Name);
		std::cout << "\n > 开始解压" << ctx.ThisXor.Name << "\n";

		// 构造根目录描述：RootDir 和 CurrentDir 均为顶层输出目录名
		SDirectoryPair rootDir = { std::filesystem::path(ctx.ThisXor.RootDirName), std::filesystem::path(ctx.ThisXor.RootDirName) };

		// 从根目录对应的数据块开始解析和提取
		Logger::Debug("开始从根目录提取");
		Detail::TryExtract(ctx, Detail::ROOT_OFFSET, Detail::ROOT_SIZE, rootDir);

		if (ctx.BlockTracker) {
			// 块追踪信息统一导出到当前 xor 对应的根输出目录下
			std::filesystem::path outputDir = ctx.AppDir / ctx.ThisXor.RootDirName;
			if (!std::filesystem::exists(outputDir)) {
				std::filesystem::create_directories(outputDir);
			}

			std::filesystem::path detailedJsonPath = outputDir / "BlockTracker.json";
			Logger::Info("导出块追踪信息: " + detailedJsonPath.string());
			UnPdeC::Tracking::ExportAccessedListWithMissingDetection(*ctx.BlockTracker, detailedJsonPath.string());
		}

		try {
			// 解包结束后关闭当前使用的内存映射文件，避免占用句柄和内存
			UnPdeC::MemoryMapper::GetInstance().CloseFile();
			Logger::Debug("关闭内存映射文件");
		} catch (const std::exception& e) {
			Logger::Error("清理失败: " + std::string(e.what()));
			std::cerr << "清理失败: " << e.what() << std::endl;
		}

		Logger::Info("解压完成");
		std::cout << " > 解压完成\n";
		UnPdeC::UI::PrintLine();
	}
}
