// CacheParser.cpp
// 缓存文件解析模块实现

#include "CacheParser.h"
#include "Decompressor.h"
#include "Logger.h"

#include <format>
#include <stdexcept>
#include <string>

uint64_t CalculateDependenceOffset(const std::vector<uint8_t>& fileData) {
	if (fileData.size() < 0x0C) {
		throw std::runtime_error("File too short to read dep_count");
	}

	uint32_t depCount = Get4Byte(fileData, 0x08);
	if (depCount == 0) {
		return 0; // 无依赖信息
	}

	LOG_DEBUG(std::format("Detected dependence info: {} entr{}",
		depCount, (depCount == 1 ? "y" : "ies")));

	uint64_t offset = 0x0C; // 依赖块起始偏移
	for (uint32_t i = 0; i < depCount; i++) {
		if (offset + 4 > fileData.size()) {
			throw std::runtime_error("Dependence block truncated: cannot read path length");
		}
		uint32_t pathLength = Get4Byte(fileData, offset);
		offset += 4;

		if (offset + pathLength > fileData.size()) {
			throw std::runtime_error("Dependence block truncated: cannot read path");
		}
		std::string depPath(fileData.begin() + offset, fileData.begin() + offset + pathLength);
		offset += pathLength;

		if (offset + 8 > fileData.size()) {
			throw std::runtime_error("Dependence block truncated: cannot read timestamp");
		}
		offset += 8; // FILETIME (dwLowDateTime + dwHighDateTime)

		LOG_DEBUG(std::format("  [{}] {}", i, depPath));
	}

	uint64_t depSize = offset - 0x0C;
	LOG_DEBUG(std::format("Dependence block size: {} bytes", depSize));
	return depSize;
}

std::vector<uint8_t> PreProcess(const std::vector<uint8_t>& fileData,
                                const std::string& fileName,
                                uint64_t depOffset) {
	uint64_t base = 0x0C + depOffset; // data_size 字段的起始偏移

	if (fileData.size() < base + 0x0C) { // 至少需要到 sizeFlag (base + 0x0C)
		throw std::runtime_error("File data too short");
	}

	uint8_t sizeFlag = fileData[base + 0x0C]; // 即 0x18 + depOffset
	std::vector<uint8_t> encryptedData;
	uint32_t decryptedSize;
	std::vector<uint8_t> decryptedData;

	if (sizeFlag == 0x6F) {
		if (fileData.size() < base + 0x15) { // 0x21 + depOffset
			throw std::runtime_error("0x6F flag file data too short");
		}
		// 4 字节解压后大小
		decryptedSize = Get4Byte(fileData, base + 0x11); // 0x1D + depOffset
		// 压缩数据从 0x21 + depOffset 开始
		encryptedData.assign(fileData.begin() + base + 0x15, fileData.end());
	} else if (sizeFlag == 0x6D) {
		// 1 字节解压后大小
		decryptedSize = fileData[base + 0x0E]; // 0x1A + depOffset
		// 压缩数据从 0x1B + depOffset 开始
		encryptedData.assign(fileData.begin() + base + 0x0F, fileData.end());
	} else if (sizeFlag == 0x6E) {
		// 该类型数据从 0x29 + depOffset 开始为"已解压"内容，直接返回
		return std::vector<uint8_t>(fileData.begin() + base + 0x1D, fileData.end());
	} else {
		LOG_DEBUG(std::format("Unknown size flag: 0x{:02X}", static_cast<unsigned>(sizeFlag)));
		throw std::runtime_error("Unknown size flag: " + std::to_string(sizeFlag));
	}

	LOG_DEBUG(std::format("Size flag: 0x{:02X}, decompressed size: {} bytes",
		static_cast<unsigned>(sizeFlag), decryptedSize));

	// sizeFlag 的最低位决定是否真正解压
	if (decryptedSize - 0x1 > 0xF4240) {
		if ((sizeFlag & 0x01) == 0) {
			LOG_DEBUG("Size > 0xF4240, flag bit 0 = 0, skipping decompression");
		} else {
			LOG_DEBUG("Size > 0xF4240, flag bit 0 = 1, performing decompression");
			decryptedData = Decompress(encryptedData, decryptedSize, fileName);
		}
	} else {
		if ((sizeFlag & 0x01) == 0) {
			LOG_DEBUG("Size <= 0xF4240, flag bit 0 = 0, skipping decompression");
		} else {
			LOG_DEBUG("Size <= 0xF4240, flag bit 0 = 1, performing decompression");
			decryptedData = Decompress(encryptedData, decryptedSize, fileName);
		}
	}

	return decryptedData;
}
