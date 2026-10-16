#pragma once

#include <string>
#include <vector>

#include "GV.h"
#include <cstdint>

namespace UnPdeC::Extract {
	/// <summary>
	/// 预处理压缩数据，根据文件类型、标识位以及运行上下文进行解压或裁剪
	/// </summary>
	/// <param name="ctx">
	/// 运行时上下文：
	/// - ExtractMode == 'B'：始终保留前 8 字节（混合模式）
	/// - ExtractMode == 'C'：仅对特定 .cache 文件保留前 8 字节
	/// - 其他模式：统一删除前 8 字节或固定头部
	/// </param>
	/// <param name="compressedData">
	/// 初次解密/读取后的原始字节数组，可能仍然包含：
	/// - 自定义头部（大小信息、标识位等）
	/// - 二次压缩数据（需调用内部 FinalExtract 解压）
	/// - 未压缩的裸数据（只需裁掉头部）
	/// </param>
	/// <param name="fileName">
	/// 文件名，仅用于日志输出和错误提示，不参与实际解压逻辑
	/// </param>
	/// <returns>
	/// 返回二次处理后的最终内容：
	/// - 对 0x6F/0x6D 类型：完成二次解压，并按 ExtractMode 选择是否保留前 8 字节
	/// - 对未压缩类型：只删除固定头部（0x21 或 0x29 字节），并视需要保留前 8 字节
	/// </returns>
	/// <exception cref="std::runtime_error">
	/// - 当数据长度不足以读取标识位或大小字段时
	/// - 当遇到未知的压缩标识值时
	/// </exception>
	/// <remarks>
	/// 标识位位于偏移 0x18（FLAG_OFFSET）：
	/// - 0x6F：使用 4 字节大小字段（偏移 0x1D），数据从偏移 0x21 开始
	/// - 0x6D：使用 1 字节大小字段（偏移 0x1A），数据从偏移 0x1B 开始
	/// - 其他奇数值：视为未知类型，直接抛出异常
	/// - 偶数值：视为未压缩，按 TYPE_UNCOMPRESSED_OFFSET/TYPE_UNCOMPRESSED_WITH_HEADER_OFFSET 进行头部裁剪
	/// </remarks>
	std::vector<uint8_t> PreExtract(const UnPdeC::RuntimeContext& ctx, const std::vector<uint8_t>& compressedData, const std::string& fileName);
}
