// CRC 查找表声明：
// 由外部目标文件/模块提供一个只读的 256 * 4 字节表，
// 每一项是 4 字节的常量，用于加速 CRC 计算。
#pragma once

// 用于 CRC 计算的查找表。
// 在实现文件中定义为 256 * 4 字节（即 1024 字节）的常量数组：
//   const unsigned char LookupTable[1024] = { ... };
// 此处只做声明，方便在多个源文件中复用同一张表。
extern const unsigned char LookupTable[];
