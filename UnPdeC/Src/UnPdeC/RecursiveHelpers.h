#pragma once

#include <filesystem>
#include <functional>
#include <vector>

#include "GV.h"
#include "Types.h"
#include <cstdint>

namespace UnPdeC::RecursiveMode::Helpers {
	/// <summary>
	/// 处理单个文件条目：根据当前模式决定是否二次解压并写入磁盘
	/// 
	/// 行为包括：
	/// - 依据 CacheMode 和文件名（是否含 .cache/.lua.cache 等）生成最终输出文件名
	/// - 视 needProcessData 决定是否调用 Extract::PreExtract 进行二次解压与头部裁剪
	/// - 写入文件并设置时间戳为 VFS 条目记录的时间
	/// - 磁盘上已有同名文件时直接跳过，避免重复工作
	/// </summary>
	bool ProcessFileEntry(UnPdeC::RuntimeContext& ctx, const SHexOffsetInfo& entry, const std::filesystem::path& baseDir);

	/// <summary>
	/// 处理单个目录条目：创建子目录并递归调用提取逻辑
	/// 
	/// - 在 baseDir 下创建以 entry.Name 命名的子目录
	/// - 调用外部提供的 tryExtract 回调，对子目录对应的 VFS 数据块继续解析
	/// - 设置目录时间戳为条目中的 UnixTime
	/// </summary>
	bool ProcessDirectoryEntry(UnPdeC::RuntimeContext& ctx,
							   const SHexOffsetInfo& entry,
							   const SDirectoryPair& directory,
							   const std::filesystem::path& baseDir,
							   const std::function<void(uint32_t, uint32_t, const SDirectoryPair&)>& tryExtract);

	/// <summary>
	/// 从指定偏移和大小的 VFS 数据块中读取偏移信息列表
	/// 
	/// - 调用 VFSTable::ReadDataFromXor，从当前 .xor 中读取指定 offset/size 的数据块
	/// - 使用内部 ParseOffsetInfo 解析为 SHexOffsetInfo 列表
	/// - 过滤掉无效条目（名称为空/过长、类型不是 1 或 2 的块）
	/// </summary>
	std::vector<SHexOffsetInfo> ReadOffsetInfo(UnPdeC::RuntimeContext& ctx, uint32_t offset, uint32_t size);

	/// <summary>
	/// 根据条目类型分发处理逻辑：文件条目写入文件，目录条目继续递归
	/// 
	/// - 遍历 entries 数组，将 Type==1 的条目交给 ProcessFileEntry
	/// - 将 Type==2 的条目交给外部 handleDirectory 回调，由调用方决定如何递归
	/// - 在处理过程中记录日志，出现异常时不会中断整个批次，只记录错误信息
	/// </summary>
	void DispatchEntries(UnPdeC::RuntimeContext& ctx,
						 const std::vector<SHexOffsetInfo>& entries,
						 const SDirectoryPair& directory,
						 const std::function<void(const SHexOffsetInfo&, const SDirectoryPair&, const std::filesystem::path&)>& handleDirectory);
}
