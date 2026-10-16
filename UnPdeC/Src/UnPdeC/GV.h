#pragma once

#include <filesystem>
#include <memory>
#include <vector>

#include "Tracking.h"
#include "Types.h"
#include <cstdint>

namespace UnPdeC {
	/// <summary>
	/// 运行时上下文，贯穿整个程序生命周期，用于在各个模块之间传递状态与配置
	/// </summary>
	class RuntimeContext {
	public:
		/// <summary>
		/// 当前进程中发现的所有 .xor 文件列表
		/// 
		/// 由扫描入口目录得到的结果，后续解包流程会依次遍历此数组：
		/// - 每个元素包含 .xor 文件路径以及对应的基础信息
		/// - Reset 不会清空该列表，仅清理“当前正在处理”的状态
		/// </summary>
		std::vector<SThisXor> XorArr;

		/// <summary>
		/// 当前正在处理的 .xor 文件信息
		/// 
		/// 在处理多个 .xor 时，主流程会在切换文件前更新该字段：
		/// - path：当前 .xor 文件的完整路径
		/// - index/offset：视 SThisXor 定义而定，用于日志与调试
		/// Reset 会将其重置为 { "", 0L }，表示当前没有活动的 .xor
		/// </summary>
		SThisXor ThisXor{ "", 0L };

		/// <summary>
		/// 程序所在目录，用作所有输出路径的根目录
		/// 
		/// 一般在程序启动时初始化为可执行文件所在目录，后续用于：
		/// - 生成解包输出目录
		/// - 生成日志文件路径
		/// - 作为相对路径解析的基准
		/// </summary>
		std::filesystem::path AppDir;

		/// <summary>
		/// 已经读取并合并好的 VFS 表原始字节数组
		/// 
		/// 从 .xor 或关联文件中解析出的虚拟文件系统表数据：
		/// - 可能包含一个或多个分块，已在前置步骤完成拼接
		/// - 供后续目录遍历、文件定位等逻辑统一使用
		/// Reset 会清空该数组，以免旧数据影响下一次解包
		/// </summary>
		std::vector<uint8_t> VfsTablesArr;

		/// <summary>
		/// 缓存模式开关，决定是否对 .cache 文件进行二次解压
		/// 
		/// - false：按普通文件处理，通常仅进行一次解密/解压
		/// - true ：对识别出的 .cache 文件启用二次解压和头部裁剪逻辑
		/// Reset 会将其恢复为 false，保证新一轮处理从默认状态开始
		/// </summary>
		bool CacheMode = false;

		/// <summary>
		/// 解压模式：
		/// A=删除前8字节，B=保留前8字节，C=按文件类型混合处理
		/// 
		/// 该模式会影响 Extract::PreExtract 的行为：
		/// - 'A'：统一删除前 8 字节（适合只关心纯数据的场景）
		/// - 'B'：统一保留前 8 字节（适合调试或需要原始头部的场景）
		/// - 'C'：仅对部分资源（如 .mesh/.skel/.anim/.physx）保留 8 字节
		/// Reset 会将其恢复为默认值 'C'
		/// </summary>
		char ExtractMode = 'C';

		/// <summary>
		/// 块访问追踪器，用于记录哪些物理块被读取过
		/// 
		/// 一般在需要分析 I/O 模式或调试时启用：
		/// - 通过记录每次块访问，可以统计热点区域
		/// - 也可以辅助判断 VFS 表或数据块是否存在异常访问
		/// Reset 会释放（reset）该智能指针，清空所有追踪信息
		/// </summary>
		std::unique_ptr<Tracking::BlockTracker> BlockTracker;

		/// <summary>
		/// 重置运行时上下文，清空与当前 .xor 文件相关的状态
		/// 
		/// 注意：该函数不会影响 XorArr 和 AppDir 等“全局级别”字段，
		/// 仅用于在处理完一个 .xor 后，为下一次处理准备干净的局部状态
		/// </summary>
		void Reset();
	};
}
