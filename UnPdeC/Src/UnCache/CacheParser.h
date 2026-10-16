// CacheParser.h
// 缓存文件解析模块：解析 .cache 文件头部，计算依赖信息偏移，
// 并根据 sizeFlag 判断数据布局与解压策略。

#pragma once

#include <cstdint>
#include <string>
#include <vector>

// 计算 .cache 文件中依赖信息块的字节大小（零拷贝）。
//
// .cache 文件头 0x08 偏移处为 dep_count（依赖数量）：
// - dep_count == 0：无依赖信息，返回 0。文件头固定 0x18 字节。
// - dep_count > 0：在 0x0C 处紧跟 dep_count 个依赖项，每个依赖项格式为：
//     uint32  path_length    路径字符串长度（无 null 终止符）
//     char[]  path           路径字符串
//     uint32  time_low       FILETIME 低 32 位
//     uint32  time_high      FILETIME 高 32 位
//   返回依赖块的总字节数（不含 dep_count 字段本身）。
uint64_t CalculateDependenceOffset(const std::vector<uint8_t>& fileData);

// 预处理 .cache 文件的头部，根据 sizeFlag 判断数据布局与解压策略：
// - 文件头最少需要 0x1B + depOffset 字节；
// - depOffset: 依赖信息块的字节大小（0 = 无依赖），由 CalculateDependenceOffset 计算；
// - sizeFlag 位于偏移 0x18 + depOffset；
//   · 0x6F：在 0x1D+depOffset 位置存有 4 字节解压后大小，数据从 0x21+depOffset 开始；
//   · 0x6D：在 0x1A+depOffset 字节存有 1 字节解压后大小，数据从 0x1B+depOffset 开始；
//   · 0x6E：数据从 0x29+depOffset 开始，直接返回后续数据（不解压）；
//   · 其他值：视为未知格式，抛异常。
// 同时根据（解压后大小 与 0xF4240 的比较）和 sizeFlag 低位决定是否实际调用解压。
std::vector<uint8_t> PreProcess(const std::vector<uint8_t>& fileData,
                                const std::string& fileName,
                                uint64_t depOffset);
