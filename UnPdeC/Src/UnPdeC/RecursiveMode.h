#pragma once

#include "GV.h"

namespace UnPdeC::RecursiveMode {
	/// <summary>
	/// 递归提取 VFS 文件中的所有内容
	/// </summary>
	/// <remarks>
	/// 该函数是递归提取模式的主入口，整体流程概览：
	/// 1. 使用 ThisXor.RootDirName 构造根目录 SDirectoryPair
	/// 2. 从根目录（偏移量 0x0，大小 0x1000）开始解析 VFS 表条目
	/// 3. 通过 RecursiveMode::Helpers 调用链递归处理所有子目录和文件
	/// 4. 将解析出的文件写入磁盘，并根据条目时间设置文件/目录时间戳
	/// 5. 如果启用了块追踪器 BlockTracker，导出块访问信息到 BlockTracker.json
	/// 6. 关闭 MemoryMapper 中的内存映射文件以释放系统资源
	/// 
	/// 文件提取行为受 CacheMode 影响：
	/// - CacheMode=false：处理缓存文件（解压、重命名）
	/// - CacheMode=true：保留原始缓存文件
	/// 同时，ExtractMode 会影响缓存文件二次解压时是否保留前 8 字节等行为。
	/// </remarks>
	void ExtractRecursive(UnPdeC::RuntimeContext& ctx);
}
