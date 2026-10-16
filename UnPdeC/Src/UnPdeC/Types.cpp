#include "Pch.h"
#include "Types.h"

namespace UnPdeC {
	DecompressionState::DecompressionState(uint32_t size)
		: controlWord(1), sourceIndex(0), destIndex(0), targetSize(size) {
	}

	bool DecompressionState::isComplete() const {
		return destIndex >= targetSize;
	}

	bool DecompressionState::hasEnoughSpace(uint32_t needed) const {
		return destIndex < targetSize - needed;
	}

	std::string ToHexString(uint64_t value) {
		std::stringstream stream;
		stream << "0x" << std::uppercase << std::hex << value;
		return stream.str();
	}
}
