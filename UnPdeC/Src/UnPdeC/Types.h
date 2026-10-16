#pragma once

#include <corecrt.h>
#include <cstdint>
#include <filesystem>
#include <string>

namespace UnPdeC {
	/// <summary>
	/// 将 64 位整数格式化为 0x 前缀的大写十六进制字符串
	/// </summary>
	std::string ToHexString(uint64_t value);

	/// <summary>
	/// 描述一个 .xor 文件的基本信息以及与其关联的输出目录
	/// </summary>
	struct SThisXor {
		/// <summary>
		/// 不带扩展名的文件名
		/// </summary>
		std::string Name;
		/// <summary>
		/// 文件大小（字节）
		/// </summary>
		long Size = 0;
		/// <summary>
		/// 完整文件路径
		/// </summary>
		std::string Path;
		/// <summary>
		/// 可选的元数据 JSON 文件路径
		/// </summary>
		std::string JsonPath;
		/// <summary>
		/// 输出根目录名称（根据模式拼接的目录名）
		/// </summary>
		std::string RootDirName;
		/// <summary>
		/// 输出根目录完整路径
		/// </summary>
		std::filesystem::path OutputPath;
	};

	/// <summary>
	/// 保存递归提取时父目录和当前目录的路径信息
	/// </summary>
	struct SDirectoryPair {
		/// <summary>
		/// 上一级目录
		/// </summary>
		std::filesystem::path ParentDir;
		/// <summary>
		/// 当前目录
		/// </summary>
		std::filesystem::path CurrentDir;
	};

	/// <summary>
	/// 从十六进制偏移表中解析出的单个条目信息
	/// </summary>
	struct SHexOffsetInfo {
		/// <summary>
		/// 条目类型：1=文件，2=目录
		/// </summary>
		uint8_t Type;
		/// <summary>
		/// 条目名称（文件名或目录名）
		/// </summary>
		std::string Name;
		/// <summary>
		/// NTFS 时间转换后的 Unix 时间戳
		/// </summary>
		time_t UnixTime;
		/// <summary>
		/// 数据大小（字节）
		/// </summary>
		uint32_t Size;
		/// <summary>
		/// VFS 中记录的原始偏移量
		/// </summary>
		uint32_t OriginalOffset;
	};

	/// <summary>
	/// 用于调试/分析的块元信息结构
	/// </summary>
	struct SBlockMeta {
		bool isValid = false;
		std::string type;
		std::string name;
		std::string rawOffset;
		std::string realOffset;
		std::string size;
		std::string blockRealOffset;
		std::string blockRawOffset;
	};

	/// <summary>
	/// 记录需要持久化保存的块元数据信息
	/// </summary>
	struct SMetaSaveInfo {
		std::string type;
		std::string name;
		uint64_t rawOffset;
		uint64_t size;
		std::string directoryPath;
	};

	/// <summary>
	/// 用于解压算法中的反向引用描述
	/// </summary>
	struct BackReferenceInfo {
		/// <summary>
		/// 相对于当前写入位置的偏移量
		/// </summary>
		uint32_t offset;
		/// <summary>
		/// 需要复制的字节数
		/// </summary>
		uint32_t length;
		/// <summary>
		/// 为解析该引用从输入流中消耗的字节数
		/// </summary>
		uint32_t bytesConsumed;
	};

	/// <summary>
	/// 自定义解压状态机的运行时状态
	/// </summary>
	struct DecompressionState {
		/// <summary>
		/// 当前控制字，最低位决定接下来处理的模式
		/// </summary>
		uint32_t controlWord;
		/// <summary>
		/// 当前读取源数据的位置
		/// </summary>
		uint32_t sourceIndex;
		/// <summary>
		/// 当前写入解压后数据的位置
		/// </summary>
		uint32_t destIndex;
		/// <summary>
		/// 期望解压出的总大小
		/// </summary>
		uint32_t targetSize;

		/// <summary>
		/// 使用目标大小初始化状态机
		/// </summary>
		DecompressionState(uint32_t size);
		/// <summary>
		/// 是否已经写满目标大小
		/// </summary>
		bool isComplete() const;
		/// <summary>
		/// 判断解压缓冲区中是否至少还剩下 needed 个可写字节
		/// </summary>
		bool hasEnoughSpace(uint32_t needed = 10) const;
	};
}
