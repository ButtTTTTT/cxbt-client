// CacheCodec.cpp
// .cache 解析与 LZ 解压实现（算法逐条对照 UnPdeC/Src/UnCache 的 CacheParser.cpp / Decompressor.cpp）。

#include "CacheCodec.h"

#include <cstring>
#include <format>

namespace codec {

namespace {

// 标志位模式 -> 本次可直接拷贝的字面字节数（与控制台版 SHIFT_TABLE 完全一致）
constexpr uint8_t SHIFT_TABLE[16] = { 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0 };

// 解压时模拟原始汇编寄存器状态
struct RegisterState {
	uint32_t eax; // 标志位队列，按位消耗
	uint32_t ecx; // 从输入流预读的控制/偏移/长度字
	uint32_t ebp; // 输出缓冲写偏移
	uint32_t esi; // 输入缓冲读偏移
	uint32_t edi; // 目标解压总长度
};

constexpr uint64_t DEP_BLOCK_START = 0x0C; // dep_count 之后，依赖块起始
constexpr uint64_t DEP_COUNT_FIELD = 0x08; // dep_count 字段偏移
constexpr uint64_t FLAG_FIELD_DELTA = 0x0C;  // sizeFlag 相对 base 的偏移
constexpr uint64_t OUT_SIZE_4B_DELTA = 0x11; // 0x6F：4 字节长度字段相对 base 的偏移
constexpr uint64_t DATA_4B_DELTA = 0x15;     // 0x6F：数据起始相对 base 的偏移
constexpr uint64_t OUT_SIZE_1B_DELTA = 0x0E; // 0x6D：1 字节长度字段相对 base 的偏移
constexpr uint64_t DATA_1B_DELTA = 0x0F;     // 0x6D：数据起始相对 base 的偏移
constexpr uint64_t DATA_RAW_DELTA = 0x1D;    // 0x6E：数据起始相对 base 的偏移
constexpr size_t STRIP_BYTES = 8;            // 解压结果头部需删除的字节数

inline uint32_t ReadU32(const uint8_t* p) {
	uint32_t v;
	std::memcpy(&v, p, sizeof(v));
	return v;
}

} // namespace

bool ParseHeader(const uint8_t* fileData, size_t fileSize, Header& header, std::wstring& error) {
	header = {};

	if (fileData == nullptr || fileSize < DEP_BLOCK_START) {
		error = L"文件过小，不是有效的 .cache 文件";
		return false;
	}

	// ---- 依赖块：0x08 处 dep_count，之后每项 = u32 路径长 + 路径 + FILETIME(8B) ----
	const uint32_t depCount = ReadU32(fileData + DEP_COUNT_FIELD);
	uint64_t offset = DEP_BLOCK_START;
	if (depCount > 0) {
		// 防御：dep_count 异常巨大时先按剩余长度做一次粗校验，避免无意义长循环
		if (depCount > fileSize) {
			error = std::format(L"依赖项数量异常（{}），文件已损坏", depCount);
			return false;
		}
		header.dependences.reserve(depCount < 4096 ? depCount : 4096);
		for (uint32_t i = 0; i < depCount; ++i) {
			if (offset + 4 > fileSize) {
				error = L"依赖块被截断：读不到路径长度";
				return false;
			}
			const uint32_t pathLength = ReadU32(fileData + offset);
			offset += 4;

			if (offset + pathLength > fileSize) {
				error = L"依赖块被截断：读不到完整路径";
				return false;
			}
			std::string_view raw(reinterpret_cast<const char*>(fileData + offset), pathLength);
			header.dependences.push_back({ std::string(raw), 0, 0 });
			offset += pathLength;

			if (offset + 8 > fileSize) {
				error = L"依赖块被截断：读不到时间戳";
				return false;
			}
			header.dependences.back().timeLow = ReadU32(fileData + offset);
			header.dependences.back().timeHigh = ReadU32(fileData + offset + 4);
			offset += 8;
		}
	}
	header.depOffset = offset - DEP_BLOCK_START;

	// ---- sizeFlag 位于 0x18 + depOffset ----
	const uint64_t base = DEP_BLOCK_START + header.depOffset;
	if (fileSize < base + FLAG_FIELD_DELTA + 1) {
		error = L"文件数据不足，读不到 sizeFlag";
		return false;
	}
	const uint8_t sizeFlag = fileData[base + FLAG_FIELD_DELTA];
	header.sizeFlag = sizeFlag;
	header.decompress = (sizeFlag & 0x01) != 0;

	switch (sizeFlag) {
	case 0x6F: // 4 字节解压后长度
		if (fileSize < base + DATA_4B_DELTA) {
			error = L"0x6F 标志文件数据不足";
			return false;
		}
		header.outSize = ReadU32(fileData + base + OUT_SIZE_4B_DELTA);
		header.dataStart = base + DATA_4B_DELTA;
		break;
	case 0x6D: // 1 字节解压后长度
		if (fileSize < base + DATA_1B_DELTA) {
			error = L"0x6D 标志文件数据不足";
			return false;
		}
		header.outSize = fileData[base + OUT_SIZE_1B_DELTA];
		header.dataStart = base + DATA_1B_DELTA;
		break;
	case 0x6E: // 未压缩，直接截取
		if (fileSize < base + DATA_RAW_DELTA) {
			error = L"0x6E 标志文件数据不足";
			return false;
		}
		header.dataStart = base + DATA_RAW_DELTA;
		header.outSize = static_cast<uint32_t>(fileSize - header.dataStart);
		break;
	default:
		error = std::format(L"未知的 sizeFlag：0x{:02X}", static_cast<unsigned>(sizeFlag));
		return false;
	}

	if (header.dataStart > fileSize) {
		error = L"数据起始偏移越界，文件已损坏";
		return false;
	}
	return true;
}

bool Decode(const uint8_t* fileData, size_t fileSize, const Header& header,
            bool stripHeader, Scratch& scratch, Payload& payload, std::wstring& error) {
	payload = {};

	if (header.decompress) {
		// sizeFlag 低位为 1：真正执行 LZ 解压
		if (header.outSize == 0) {
			error = L"解压后长度为 0，文件已损坏";
			return false;
		}
		if (scratch.buffer.size() < header.outSize)
			scratch.buffer.resize(header.outSize);
		// 与控制台版严格等价：原版每次都 new 一个零初始化的输出缓冲。
		// scratch 跨文件复用，必须先把本次要用的 [0,outSize) 清零，否则 offset==0 的
		// 自引用拷贝会读到上一个文件残留的脏字节（原版此时写的是零）。
		std::memset(scratch.buffer.data(), 0, header.outSize);

		const size_t filled = LzDecompress(fileData + header.dataStart, fileSize - header.dataStart,
		                                   scratch.buffer.data(), header.outSize);
		payload.data = scratch.buffer.data();
		payload.size = header.outSize; // 与控制台版一致：不足也按声明长度输出，尾部保持 0
		payload.decompressed = true;
		payload.truncated = (filled < header.outSize);
	} else {
		// 低位为 0（含 0x6E）：数据原样存放，直接给映射视图，零拷贝
		payload.data = fileData + header.dataStart;
		payload.size = fileSize - header.dataStart;
	}

	// 删除解压结果的前 8 字节（用偏移实现，绝不做 O(n) 的 memmove）
	// 与控制台版保持一致：只有真正走过 LZ 解压的结果才有这 8 字节头需要删除；
	// 0x6E / 低位为 0 的原样存储数据没有这个头，不能删。
	if (stripHeader && payload.decompressed) {
		if (payload.size >= STRIP_BYTES) {
			payload.data += STRIP_BYTES;
			payload.size -= STRIP_BYTES;
			payload.stripped = true;
		} else {
			error = std::format(L"结果仅 {} 字节，不足以前 8 字节头部删除", payload.size);
			return false;
		}
	}

	if (payload.size == 0) {
		error = L"解压结果为空";
		return false;
	}
	return true;
}

size_t LzDecompress(const uint8_t* src, size_t srcSize, uint8_t* dst, size_t dstSize) {
	if (dstSize == 0)
		return 0;

	RegisterState regs = { 1, 0, 0, 0, static_cast<uint32_t>(dstSize) };

	while (true) {
		// eax == 1 表示标志位队列已耗尽，需要读入新的控制字
		if (regs.eax == 1) {
			if (regs.esi + 4 > srcSize)
				break;
			std::memcpy(&regs.eax, src + regs.esi, sizeof(uint32_t));
			// 原始汇编没有 OR 0x80000000，压缩器已置好 bit31
			regs.esi += 4;
		}

		// 每轮至少预读一个 32 位控制字 ecx
		if (regs.esi + 4 > srcSize)
			break;
		std::memcpy(&regs.ecx, src + regs.esi, sizeof(uint32_t));

		if ((regs.eax & 1) == 0) {
			// 字面拷贝：把 ecx 的低若干字节直接写入输出
			if (regs.ebp >= regs.edi - 10)
				break;

			const uint32_t shiftAmount = SHIFT_TABLE[regs.eax & 0xF];
			// 与控制台版等价：ECX 就是从 [ESI] 预读的小端 4 字节
			const uint32_t avail = regs.edi - regs.ebp;
			const uint32_t count = shiftAmount < avail ? shiftAmount : avail;
			for (uint32_t i = 0; i < count; ++i)
				dst[regs.ebp + i] = static_cast<uint8_t>(regs.ecx >> (i * 8));

			regs.ebp += shiftAmount;
			regs.esi += shiftAmount;
			regs.eax >>= shiftAmount;
		} else {
			// 引用拷贝：从输出缓冲向前 offset 处复制 length 字节
			const uint32_t savedBits = regs.eax >> 1;
			uint32_t offset = 0;
			uint32_t length = 0;

			if ((regs.ecx & 3) != 0) {
				if ((regs.ecx & 2) != 0) {
					if ((regs.ecx & 1) != 0) {
						if ((regs.ecx & 0x7F) == 3) { // 特例：更长的 offset/length
							offset = regs.ecx >> 15;
							length = ((regs.ecx >> 7) & 0xFF) + 3;
							regs.esi += 4;
						} else {
							offset = (regs.ecx >> 7) & 0x1FFFF;
							length = ((regs.ecx >> 2) & 0x1F) + 2;
							regs.esi += 3;
						}
					} else {
						offset = (regs.ecx >> 6) & 0x3FF;
						length = ((regs.ecx >> 2) & 0xF) + 3;
						regs.esi += 2;
					}
				} else {
					offset = (regs.ecx >> 2) & 0x3FFF;
					length = 3;
					regs.esi += 2;
				}
			} else {
				offset = (regs.ecx >> 2) & 0x3F;
				length = 3;
				regs.esi += 1;
			}

			// 与控制台版一致：不对 offset==0 额外早退（原版会自拷贝 length 个零字节后继续）。
			if (offset > regs.ebp || regs.ebp + length > regs.edi)
				break;

			// 自回环复制：offset < length 时逐字节，否则可整块搬
			uint8_t* out = dst + regs.ebp;
			const uint8_t* ref = out - offset;
			if (offset >= length) {
				std::memcpy(out, ref, length);
			} else {
				for (uint32_t i = 0; i < length; ++i)
					out[i] = ref[i];
			}

			regs.ebp += length;
			regs.eax = savedBits;
		}
	}

	// 主循环结束后输出仍未填满：按字面逐字节补齐
	while (regs.ebp < regs.edi) {
		if (regs.eax == 1) {
			if (regs.esi + 4 > srcSize)
				break;
			regs.eax = 0x80000000;
			regs.esi += 4;
		}
		if (regs.esi >= srcSize)
			break;
		dst[regs.ebp++] = src[regs.esi++];
		regs.eax >>= 1;
	}

	return regs.ebp;
}

std::wstring DescribeSizeFlag(uint8_t sizeFlag) {
	switch (sizeFlag) {
	case 0x6D:
		return L"0x6D 压缩/1字节长度";
	case 0x6E:
		return L"0x6E 未压缩/直接截取";
	case 0x6F:
		return L"0x6F 压缩/4字节长度";
	default:
		return std::format(L"0x{:02X} 未知", static_cast<unsigned>(sizeFlag));
	}
}

} // namespace codec
