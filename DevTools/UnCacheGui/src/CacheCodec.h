// CacheCodec.h
// .cache 格式解析 + LZ 解压模块。
// 算法语义与控制台版 UnCache（UnPdeC/Src/UnCache）完全一致，
// 差别只在接口形态：改为 (指针, 长度) 零拷贝接口，不再用 std::vector 传整份文件。

#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace codec {

// 依赖项（dep_count > 0 时才有）
struct Dependence {
	std::string path;      // 依赖文件路径（原样字节，通常为 ASCII）
	uint32_t timeLow = 0;  // FILETIME 低 32 位
	uint32_t timeHigh = 0; // FILETIME 高 32 位
};

// 头部解析结果（不含任何数据拷贝，供内存预算与日志使用）
struct Header {
	uint64_t depOffset = 0;     // 依赖块字节数（不含 dep_count 自身）
	uint8_t sizeFlag = 0;       // 位于 0x18 + depOffset
	uint64_t dataStart = 0;     // 有效数据（压缩段 / 原始段）起始偏移
	uint32_t outSize = 0;       // 解压后大小；0x6E 时为剩余长度
	bool decompress = false;    // sizeFlag 低位是否为 1（需要真正解压）
	std::vector<Dependence> dependences;
};

// 解压产物。data 可能直接指向映射视图（不解压时零拷贝），
// 也可能指向 Scratch 里的解压缓冲 —— 因此 Scratch 必须比 data 活得更久。
struct Payload {
	const uint8_t* data = nullptr;
	size_t size = 0;
	bool decompressed = false;  // 是否真正执行了 LZ 解压
	bool stripped = false;      // 是否删掉了前 8 字节
	bool truncated = false;     // 数据流提前结束，尾部为 0（提示可能损坏）
};

// 每工作线程一份，跨文件复用，避免反复大块分配。
struct Scratch {
	std::vector<uint8_t> buffer;
};

// 只解析头部，不碰数据段。失败返回 false 并写入 error（宽字符，可直接进 UI）。
bool ParseHeader(const uint8_t* fileData, size_t fileSize, Header& header, std::wstring& error);

// 依据头部取出有效数据：需要解压时解压进 scratch，否则直接返回视图。
// stripHeader 为 true 时删除结果的前 8 字节（对 0x6D/0x6E/0x6F 三种分支统一生效）。
bool Decode(const uint8_t* fileData, size_t fileSize, const Header& header,
            bool stripHeader, Scratch& scratch, Payload& payload, std::wstring& error);

// 裸 LZ 解压（模拟原始汇编寄存器状态），dstSize 即期望解压后大小。
// 返回实际填充字节数；越界或数据不足时提前结束，剩余字节保持 0（与控制台版一致）。
size_t LzDecompress(const uint8_t* src, size_t srcSize, uint8_t* dst, size_t dstSize);

// 供调试/日志：把 sizeFlag 渲染成 "0x6F (LZ 压缩, 4 字节长度字段)" 这样的可读文本。
std::wstring DescribeSizeFlag(uint8_t sizeFlag);

} // namespace codec
