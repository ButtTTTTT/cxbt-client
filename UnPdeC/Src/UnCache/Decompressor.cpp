// Decompressor.cpp
// 解压模块实现：模拟原始汇编中的寄存器状态来解压 LZ 压缩数据。

#include "Decompressor.h"

#include <cstring>
#include <exception>
#include <format>
#include <stdexcept>

// 解压算法使用的位移表：
// 根据当前标志位模式（eax 低 4 位），确定一次可以直接拷贝多少字节。
static constexpr uint8_t SHIFT_TABLE[16] = { 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0 };

// 用来模拟原始汇编中的寄存器状态：
// eax: 压缩标志位缓冲（按位消耗）；
// ecx: 从输入流中读取的控制/偏移/长度信息；
// ebp: 输出缓冲当前写入偏移；
// esi: 输入缓冲当前读取偏移；
// edi: 目标解压后数据总长度。
struct RegisterState {
	uint32_t eax;
	uint32_t ecx;
	uint32_t ebp;
	uint32_t esi;
	uint32_t edi;
};

uint32_t Get4Byte(const std::vector<uint8_t>& data, uint64_t offset) {
	if (offset + 4 > data.size()) {
		throw std::out_of_range("Offset out of range");
	}
	uint32_t value;
	std::memcpy(&value, data.data() + offset, sizeof(value));
	return value;
}

// 算法大致逻辑：
// 1. 使用 RegisterState 模拟解压过程中寄存器变更；
// 2. eax 作为"标志位队列"，低位决定是复制字面数据，还是复制历史数据块；
// 3. 当为字面数据时，从输入直接拷贝若干字节到输出；
// 4. 当为引用数据时，从 ecx 中解析 offset/length，并在输出缓冲中做自回环复制；
// 5. 循环结束后，如果输出尚未填满，再按字面方式补齐。
std::vector<uint8_t> Decompress(const std::vector<uint8_t>& compressedData,
                                uint32_t decompressedSize,
                                const std::string& fileName) {
	try {
		// 预先分配解压后的输出缓冲
		std::vector<uint8_t> outputBuffer(decompressedSize);
		// 初始化寄存器状态，edi 保存解压目标大小
		RegisterState regs = { 1, 0, 0, 0, decompressedSize };

		const uint8_t* srcPtr = compressedData.data();
		uint8_t* dstPtr = outputBuffer.data();

		// 主解压循环
		while (true) {
			// 如果 eax 当前为 1，表示需要从输入读取新的控制位
			if (regs.eax == 1) {
				if (regs.esi + sizeof(uint32_t) > compressedData.size())
					break;
				std::memcpy(&regs.eax, &srcPtr[regs.esi], sizeof(uint32_t));
				// 注意：原始汇编没有 OR 0x80000000，因为压缩器已经设置了 bit 31
				regs.esi += sizeof(uint32_t);
			}

			// 每轮至少需要再读取一个 32 位的 ecx 控制字
			if (regs.esi + sizeof(uint32_t) > compressedData.size())
				break;
			std::memcpy(&regs.ecx, &srcPtr[regs.esi], sizeof(uint32_t));

			// eax 低位为 0：表示直接拷贝若干字面数据到输出
			if ((regs.eax & 1) == 0) {
				// 保留一点空间，防止越界
				if (regs.ebp >= regs.edi - 10)
					break;

				// 根据 eax 低 4 位决定一次拷贝字节数
				uint32_t shiftAmount = SHIFT_TABLE[regs.eax & 0xF];

				// 原始汇编行为（地址 004CFBCD）：
				//   MOV dword ptr [EBP], ECX  ; 直接写入 ECX 的 4 字节
				//   ...后续指令移动指针...
				//
				// 注意：ECX 是在循环开始时预读的（地址 004CFB0B: MOV ECX, dword ptr [ESI]）
				// 原来代码是 dstPtr[regs.ebp + i] = srcPtr[regs.esi + i];
				// 这是从输入缓冲区读取，而原始汇编是写入预读的 ECX 值。
				// 两种方式在小端序下等价（因为 ECX 就是从 [ESI] 读取的），
				// 但使用 ECX 更准确地模拟原始行为，且避免多次内存访问。
				//
				// (regs.ecx >> (i * 8)) & 0xFF 提取 ECX 的第 i 个字节（小端序）
				for (uint32_t i = 0; i < shiftAmount; ++i) {
					if (regs.ebp + i >= decompressedSize)
						break;
					dstPtr[regs.ebp + i] = (regs.ecx >> (i * 8)) & 0xFF;
				}

				regs.ebp += shiftAmount;
				regs.esi += shiftAmount;
				regs.eax >>= shiftAmount;
			} else {
				// eax 低位为 1：接下来为"引用复制"（类似 LZ 系列算法）
				uint32_t savedBits = regs.eax >> 1;
				uint32_t offset = 0;
				uint32_t length = 0;

				// ecx 的最低两位、以及后续位，编码了 offset/length 的多种模式
				if ((regs.ecx & 3) != 0) {
					if ((regs.ecx & 2) != 0) {
						if ((regs.ecx & 1) != 0) {
							// 一种特殊模式：更长的 offset/length
							if ((regs.ecx & 0x7F) == 3) {
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

				// offset 不能超过当前已解压长度，同时不能写出缓冲区范围
				if (offset > regs.ebp || regs.ebp + length > decompressedSize) {
					break;
				}

				// 从输出缓冲中按 offset 向前引用复制 length 个字节
				for (uint32_t i = 0; i < length; ++i) {
					dstPtr[regs.ebp + i] = dstPtr[regs.ebp - offset + i];
				}

				regs.ebp += length;
				regs.eax = savedBits;
			}
		}

		// 主循环结束后，如果输出仍未填满，用字面复制方式补齐剩余数据
		while (regs.ebp < regs.edi) {
			if (regs.eax == 1) {
				if (regs.esi + sizeof(uint32_t) > compressedData.size())
					break;
				regs.eax = 0x80000000;
				regs.esi += sizeof(uint32_t);
			}
			if (regs.esi >= compressedData.size())
				break;
			dstPtr[regs.ebp++] = srcPtr[regs.esi++];
			regs.eax >>= 1;
		}

		return outputBuffer;
	} catch (const std::exception& e) {
		// 捕获内部异常并附加文件名信息，再抛出上层处理
		throw std::runtime_error(
			std::format("Decompression failed for {}: {}",
				fileName, e.what()));
	}
}
