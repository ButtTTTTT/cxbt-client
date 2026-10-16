#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "GV.h"
#include "Types.h"

namespace UnPdeC::Tools {
	/// <summary>
	/// 工具模块统一使用的错误码枚举，便于调用方根据类型进行处理
	/// </summary>
	enum class ErrorCode {
		SUCCESS = 0,
		FILE_NOT_FOUND,
		FILE_OPEN_FAILED,
		FILE_READ_FAILED,
		FILE_WRITE_FAILED,
		INVALID_OFFSET,
		INVALID_SIZE,
		VFS_TABLE_ERROR,
		DECOMPRESSION_ERROR,
		MEMORY_ERROR,
		INVALID_ARGUMENT,
		UNKNOWN_ERROR
	};

	/// <summary>
	/// 抛出带有错误代码和消息的错误
	/// </summary>
	/// <param name="code">错误代码</param>
	/// <param name="message">错误消息</param>
	void ThrowError(ErrorCode code, const std::string& message);

	/// <summary>
	/// 初始化工具模块
	/// </summary>
	/// <param name="xorFile">XOR文件结构引用</param>
	void Init(UnPdeC::RuntimeContext& ctx, UnPdeC::SThisXor& xorFile);

	/// <summary>
	/// 查找xor文件
	/// </summary>
	void FindXorFile(UnPdeC::RuntimeContext& ctx);

	/// <summary>
	/// 将原始偏移量转换为实际偏移量
	/// </summary>
	/// <param name="OrigOffset">原始偏移量</param>
	/// <returns>实际偏移量</returns>
	uint64_t RawToRealOffset(uint64_t OrigOffset);

	/// <summary>
	/// 将实际偏移量转换为原始偏移量
	/// </summary>
	/// <param name="PdeOffset">实际偏移量</param>
	/// <returns>原始偏移量</returns>
	uint64_t RealToRawOffset(uint64_t PdeOffset);

	/// <summary>
	/// 从XOR文件中获取指定位置和大小的字节数据
	/// </summary>
	/// <param name="Start">起始位置</param>
	/// <param name="Size">大小</param>
	/// <returns>字节数据</returns>
	std::vector<uint8_t> GetByteOfXor(UnPdeC::RuntimeContext& ctx, uint64_t Start, uint64_t Size);

	/// <summary>
	/// 获取缓存模式设置
	/// </summary>
	void GetHasCacheMode(UnPdeC::RuntimeContext& ctx);

	/// <summary>
	/// 获取解压模式设置
	/// </summary>
	void GetExtractMode(UnPdeC::RuntimeContext& ctx);

	/// <summary>
	/// 从字节数据中读取4字节数值
	/// </summary>
	/// <param name="data">字节数据</param>
	/// <param name="offset">偏移量</param>
	/// <returns>4字节数值</returns>
	std::uint32_t Get4Byte(const std::vector<std::uint8_t>& data, std::uint64_t offset);
}
