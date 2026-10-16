// Decompressor.h
// 解压模块：模拟原始汇编逻辑，对 .cache 文件中的 LZ 压缩数据进行解压。

#pragma once

#include <cstdint>
#include <string>
#include <vector>

// 从 data 的指定偏移处安全读取 4 字节（小端），不足则抛出异常。
uint32_t Get4Byte(const std::vector<uint8_t>& data, uint64_t offset);

// 解压 .cache 文件中的压缩数据段。
//
// compressedData:   已经截取出的压缩数据段
// decompressedSize: 期望解压后的大小（来自文件头）
// fileName:         仅用于错误信息输出
//
// 返回：解压后的数据缓冲区
std::vector<uint8_t> Decompress(const std::vector<uint8_t>& compressedData,
                                uint32_t decompressedSize,
                                const std::string& fileName);
