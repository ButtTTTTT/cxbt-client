#include "Pch.h"
#include "Extract.h"
#include "GV.h"
#include "Logger.h"
#include "Tools.h"
#include "Types.h"

namespace UnPdeC {
	// 专门负责 .cache 及相关文件的二次解压与头部裁剪逻辑：
	// - 根据头部标识位判断是否需要进行“二次解压”（FinalExtract）
	// - 对未压缩数据仅进行头部裁剪，并按 ExtractMode 决定是否保留前 8 字节
	// - 内部的解压实现是一个基于控制字的 LZ 类变长编码算法
	namespace {
		constexpr uint32_t CONTROL_WORD_SIZE = 4;
		constexpr uint32_t FIRST_8_BYTES = 8;
		constexpr uint8_t FLAG_OFFSET = 0x18;
		constexpr uint8_t TYPE_6F_OFFSET = 0x21;
		constexpr uint8_t TYPE_6F_SIZE_OFFSET = 0x1D;
		constexpr uint8_t TYPE_6D_OFFSET = 0x1B;
		constexpr uint8_t TYPE_6D_SIZE_OFFSET = 0x1A;
		constexpr uint8_t TYPE_UNCOMPRESSED_OFFSET = 0x29;
		constexpr uint8_t TYPE_UNCOMPRESSED_WITH_HEADER_OFFSET = 0x21;
		constexpr uint8_t FLAG_TYPE_6F = 0x6F;
		constexpr uint8_t FLAG_TYPE_6D = 0x6D;

		// 根据控制字末 4 位决定一次最多“直接复制”多少字节：
		// - 值为 0 表示本次不复制
		// - 其他值表示复制 1~4 字节，并据此右移控制字和源索引
		uint8_t ByteLimit[16] = { 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0 };

		/// <summary>
		/// 判断文件是否需要保留前8字节（混合模式专用）
		/// </summary>
		/// <param name="fileName">文件名</param>
		/// <returns>是否保留前8字节</returns>
		// 仅根据文件扩展名判断是否属于需要保留前 8 字节的“混合头部”资源
		// 该判断与运行时 ExtractMode 无关，只负责静态类型判定
		bool ShouldSaveFirst8Byte(const std::string& fileName) {
			std::string lowerFileName = fileName;
			std::transform(lowerFileName.begin(), lowerFileName.end(), lowerFileName.begin(),
				[](unsigned char c) { return static_cast<char>(std::tolower(c)); });
			return lowerFileName.ends_with(".mesh.cache") || lowerFileName.ends_with(".skel.cache") || lowerFileName.ends_with(".anim.cache") || lowerFileName.ends_with(".physx.cache");
		}

		// 综合运行时上下文和文件名，最终决定是否保留前 8 字节：
		// - 'B'：强制保留，用于混合模式、调试或兼容场景
		// - 'C'：仅对特定 .mesh/.skel/.anim/.physx 这类资源保留
		// - 其他模式：统一删除前 8 字节
		bool ShouldKeepFirst8Bytes(const UnPdeC::RuntimeContext& ctx, const std::string& fileName) {
			if (ctx.ExtractMode == 'B') {
				return true;
			}
			if (ctx.ExtractMode == 'C') {
				return ShouldSaveFirst8Byte(fileName);
			}
			return false;
		}

		/// <summary>
		/// 从 32 位数据中解析反向引用参数（offset/length/bytesConsumed）
		/// </summary>
		/// <param name="data">
		/// 当前从压缩流中读取的 4 字节原始值，内部按照最低 2 位和随后的
		/// 多段比特位进行模式划分，以支持不同范围和长度的反向拷贝：
		/// - bytesConsumed：本次在源数据中实际消耗的字节数（1~4）
		/// - offset：从解压缓冲区当前位置向前回溯的偏移
		/// - length：需要拷贝的字节数
		/// </param>
		/// <returns>
		/// 返回一个 BackReferenceInfo 结构，供后续 processBackReferenceMode 使用
		/// </returns>
		BackReferenceInfo parseBackReference(uint32_t data) {
			BackReferenceInfo info = { 0, 0, 0 };

			if ((data & 3) != 0) {
				if ((data & 2) != 0) {
					if ((data & 1) != 0) {
						if ((data & 0x7F) == 3) {
							info.offset = data >> 15;
							info.length = ((data >> 7) & 0xFF) + 3;
							info.bytesConsumed = 4;
						} else {
							info.offset = (data >> 7) & 0x1FFFF;
							info.length = ((data >> 2) & 0x1F) + 2;
							info.bytesConsumed = 3;
						}
					} else {
						info.offset = (data >> 6) & 0x3FF;
						info.length = ((data >> 2) & 0xF) + 3;
						info.bytesConsumed = 2;
					}
				} else {
					info.offset = (data >> 2) & 0x3FFF;
					info.length = 3;
					info.bytesConsumed = 2;
				}
			} else {
				info.offset = (data >> 2) & 0x3F;
				info.length = 3;
				info.bytesConsumed = 1;
			}

			return info;
		}

		/// <summary>
		/// 更新当前解压控制字（controlWord）
		/// </summary>
		/// <param name="state">
		/// 解压状态对象，当 controlWord == 1 时表示当前控制字已耗尽，
		/// 需要从压缩数据中再读取 4 字节作为新的控制字
		/// </param>
		/// <param name="data">
		/// 整个压缩数据缓冲区，用于在 sourceIndex 处读取新的 4 字节控制字
		/// </param>
		/// <returns>
		/// - true：成功读取或不需要更新控制字
		/// - false：剩余数据不足 4 字节，无法继续解压
		/// </returns>
		bool updateControlWord(DecompressionState& state, const std::vector<uint8_t>& data) {
			if (state.controlWord == 1) {
				if (static_cast<unsigned long long>(state.sourceIndex) + CONTROL_WORD_SIZE > data.size()) return false;
				state.controlWord = Tools::Get4Byte(data, state.sourceIndex);
				state.sourceIndex += CONTROL_WORD_SIZE;
			}
			return true;
		}

		/// <summary>
		/// 处理“直接复制”模式，将源数据中的字节原样写入解压缓冲区
		/// </summary>
		/// <param name="state">
		/// 解压状态对象，包含当前 sourceIndex/destIndex/controlWord 等信息
		/// </param>
		/// <param name="data">
		/// 当前从压缩流中读取的 4 字节数据，将按小端序整体 memcpy 写入目标位置，
		/// 实际写入字节数受 ByteLimit[controlWord & 0xF] 控制
		/// </param>
		/// <param name="extractedData">
		/// 解压后的目标缓冲区，必须在调用前保证有足够空间（hasEnoughSpace）
		/// </param>
		/// <returns>
		/// - true：复制成功，索引与控制字已正确前进
		/// - false：目标空间不足，无法完成本次复制
		/// </returns>
		bool processCopyMode(DecompressionState& state, uint32_t data, std::vector<uint8_t>& extractedData) {
			if (!state.hasEnoughSpace()) return false;

			std::memcpy(extractedData.data() + state.destIndex, &data, sizeof(data));

			uint32_t bytesToCopy = ByteLimit[state.controlWord & 0xF];
			state.destIndex += bytesToCopy;
			state.sourceIndex += bytesToCopy;
			state.controlWord >>= bytesToCopy;

			return true;
		}

		/// <summary>
		/// 处理“反向引用”模式，根据 parseBackReference 的结果执行回溯拷贝
		/// </summary>
		/// <param name="state">
		/// 解压状态对象，会暂时右移 1 位控制字以消耗当前标志位，
		/// 在完成反向引用拷贝后再恢复
		/// </param>
		/// <param name="data">
		/// 当前从压缩流中读取的 4 字节数据，用于解析 offset/length/bytesConsumed
		/// </param>
		/// <param name="extractedData">
		/// 解压目标缓冲区，offset 和 length 均以该缓冲区为基准进行回溯复制
		/// </param>
		/// <returns>
		/// - true：成功完成回溯拷贝，destIndex 已向前推进
		/// - false：引用起始位置或目标位置越界，无法安全拷贝
		/// </returns>
		bool processBackReferenceMode(DecompressionState& state, uint32_t data, std::vector<uint8_t>& extractedData) {
			state.controlWord >>= 1;
			uint32_t savedControlWord = state.controlWord;

			BackReferenceInfo info = parseBackReference(data);
			state.sourceIndex += info.bytesConsumed;

			uint32_t referenceIndex = state.destIndex - info.offset;
			if (referenceIndex >= extractedData.size()) return false;

			for (uint32_t i = 0; i < info.length; ++i) {
				if (state.destIndex + static_cast<unsigned long long>(i) >= extractedData.size() ||
					static_cast<unsigned long long>(referenceIndex) + i >= extractedData.size()) break;
				extractedData[state.destIndex + static_cast<std::vector<uint8_t, std::allocator<uint8_t>>::size_type>(i)] = extractedData[static_cast<std::vector<uint8_t, std::allocator<uint8_t>>::size_type>(referenceIndex) + i];
			}

			state.destIndex += info.length;
			state.controlWord = savedControlWord;

			return true;
		}

		/// <summary>
		/// 在主循环结束后，处理剩余的“直接复制”字节
		/// </summary>
		/// <param name="state">
		/// 解压状态对象，主循环可能因控制字用尽或数据不足提前退出，
		/// 此函数在不再触发反向引用的前提下，将余下数据顺序拷贝出来
		/// </param>
		/// <param name="compressedData">
		/// 压缩数据缓冲区，用于读取还未消费的原始字节
		/// </param>
		/// <param name="extractedData">
		/// 解压后的目标缓冲区，写入位置从 state.destIndex 开始
		/// </param>
		void processRemainingData(DecompressionState& state, const std::vector<uint8_t>& compressedData, std::vector<uint8_t>& extractedData) {
			while (state.destIndex < state.targetSize) {
				if (state.controlWord == 1) {
					if (static_cast<unsigned long long>(state.sourceIndex) + 4 > compressedData.size()) break;
					state.controlWord = 0x80000000;
					state.sourceIndex += 4;
				}
				if (state.sourceIndex >= compressedData.size()) break;
				extractedData[state.destIndex] = compressedData[state.sourceIndex];
				++state.destIndex;
				++state.sourceIndex;
				state.controlWord >>= 1;
			}
		}

		/// <summary>
		/// 对已经定位好的压缩数据执行最终解压（不再包含额外头部）
		/// </summary>
		/// <param name="compressedData">
		/// 仅包含纯压缩流的字节数组：头部已由 PreExtract 剪除，
		/// 首字节应对应解压算法的起始控制字/数据布局
		/// </param>
		/// <param name="extractedSize">
		/// 目标解压大小，由上层根据头部字段解析得到，用于分配输出缓冲区
		/// </param>
		/// <param name="fileName">
		/// 文件名，仅用于日志和错误输出，便于定位问题资源
		/// </param>
		/// <returns>
		/// 解压后的完整数据缓冲区，长度等于 extractedSize
		/// </returns>
		/// <exception cref="std::runtime_error">
		/// 当解压过程中发生异常（如越界访问等）时，会记录详细日志并抛出
		/// </exception>
		std::vector<uint8_t> FinalExtract(const std::vector<uint8_t>& compressedData, uint64_t extractedSize, const std::string& fileName) {
			Logger::Debug("开始解压文件: " + fileName + ", 压缩大小: " + std::to_string(compressedData.size()) + ", 解压后大小: " + std::to_string(extractedSize));

			try {
				std::vector<uint8_t> extractedData(extractedSize);
				DecompressionState state(static_cast<uint32_t>(extractedSize));

				while (!state.isComplete()) {
					if (!updateControlWord(state, compressedData)) break;

					if (static_cast<unsigned long long>(state.sourceIndex) + CONTROL_WORD_SIZE > compressedData.size()) break;
					uint32_t currentData = Tools::Get4Byte(compressedData, state.sourceIndex);

					if ((state.controlWord & 1) == 0) {
						if (!processCopyMode(state, currentData, extractedData)) break;
					} else {
						if (!processBackReferenceMode(state, currentData, extractedData)) break;
					}
				}

				processRemainingData(state, compressedData, extractedData);

				Logger::Debug("文件解压完成: " + fileName + ", 实际解压大小: " + std::to_string(state.destIndex));
				return extractedData;
			} catch (const std::exception& e) {
				Logger::Error("解压文件失败: " + fileName + ", 错误: " + std::string(e.what()));
				throw std::runtime_error("[错误] 解压 " + fileName + " 失败: " + std::string(e.what()));
			}
		}
	}

	namespace Extract {
		std::vector<uint8_t> PreExtract(const UnPdeC::RuntimeContext& ctx, const std::vector<uint8_t>& compressedData, const std::string& fileName) {
			Logger::Debug("开始预处理文件: " + fileName + ", 数据大小: " + std::to_string(compressedData.size()));

			if (compressedData.size() <= FLAG_OFFSET) {
				Logger::Error("数据大小不足: " + fileName);
				Tools::ThrowError(Tools::ErrorCode::INVALID_SIZE, "数据大小不足，无法读取标识位");
			}

			uint8_t sizeFlag = compressedData[FLAG_OFFSET];
			Logger::Debug("文件标识: 0x" + UnPdeC::ToHexString(sizeFlag));

			if ((sizeFlag & 1) != 0) {
				std::vector<uint8_t> encryptedData;
				uint64_t extractedSize = 0;

				switch (sizeFlag) {
					case FLAG_TYPE_6F:
						Logger::Debug("文件类型: 0x6F");
						if (compressedData.size() <= TYPE_6F_OFFSET) {
							Logger::Error("数据大小不足: " + fileName);
							throw std::runtime_error("数据大小不足，无法读取 0x6F 类型文件");
						}

						extractedSize = Tools::Get4Byte(compressedData, TYPE_6F_SIZE_OFFSET);
						Logger::Debug("解压后大小: " + std::to_string(extractedSize));

						encryptedData.resize(compressedData.size() - TYPE_6F_OFFSET);
						std::copy(compressedData.begin() + TYPE_6F_OFFSET, compressedData.end(), encryptedData.begin());
						break;

					case FLAG_TYPE_6D:
						Logger::Debug("文件类型: 0x6D");
						if (compressedData.size() <= TYPE_6D_OFFSET) {
							Logger::Error("数据大小不足: " + fileName);
							throw std::runtime_error("数据大小不足，无法读取 0x6D 类型文件");
						}

						extractedSize = compressedData[TYPE_6D_SIZE_OFFSET];
						Logger::Debug("解压后大小: " + std::to_string(extractedSize));

						encryptedData.resize(compressedData.size() - TYPE_6D_OFFSET);
						std::copy(compressedData.begin() + TYPE_6D_OFFSET, compressedData.end(), encryptedData.begin());
						break;

					default:
						Logger::Error("未知的解压标识: 0x" + UnPdeC::ToHexString(sizeFlag) + ", 文件: " + fileName);
						Tools::ThrowError(Tools::ErrorCode::UNKNOWN_ERROR, "未知的解压标识: " + std::to_string(sizeFlag));
				}

				std::vector<uint8_t> extractedData = FinalExtract(encryptedData, extractedSize, fileName);

				bool saveFirst8Byte = ShouldKeepFirst8Bytes(ctx, fileName);

				if (!saveFirst8Byte) {
					if (extractedData.size() > FIRST_8_BYTES) {
						Logger::Debug("删除前8字节");
						extractedData.erase(extractedData.begin(), extractedData.begin() + FIRST_8_BYTES);
					}
				}

				Logger::Debug("预处理完成: " + fileName + ", 结果大小: " + std::to_string(extractedData.size()));
				return extractedData;
			} else {
				Logger::Debug("未压缩文件");
				if (compressedData.size() <= TYPE_UNCOMPRESSED_OFFSET) {
					Logger::Warning("字节数组长度不足，无法删除前0x29个字节: " + fileName);
					std::cout << "[警告] " << fileName << " 初次解压后的字节数组长度不足，无法删除前0x29个字节\n";
					return compressedData;
				} else {
					bool saveFirst8Byte = ShouldKeepFirst8Bytes(ctx, fileName);

					if (saveFirst8Byte) {
						Logger::Debug("保留前8字节");
						std::vector<uint8_t> result(std::next(compressedData.begin(), TYPE_UNCOMPRESSED_WITH_HEADER_OFFSET), compressedData.end());
						return result;
					} else {
						Logger::Debug("删除前0x29字节");
						std::vector<uint8_t> result(std::next(compressedData.begin(), TYPE_UNCOMPRESSED_OFFSET), compressedData.end());
						return result;
					}
				}
			}
		}
	}
}
