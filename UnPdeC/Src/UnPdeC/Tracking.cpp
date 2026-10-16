#include "Pch.h"
#include "Tracking.h"
//#include <nlohmann/json.hpp>

namespace UnPdeC::Tracking {
	// BlockTracker 实现：用于记录哪些物理块被访问到，并在结束时导出覆盖情况
	namespace {
		constexpr uint64_t BLOCK_SIZE = 0x1000;
		constexpr uint64_t BLOCK_MASK = 0xFFF;
	}

	BlockTracker::BlockTracker(uint64_t file_size)
		: total_blocks_((file_size + BLOCK_MASK) / BLOCK_SIZE),
		visited_map_(total_blocks_, false) {
	}

	void BlockTracker::MarkVisited(uint64_t physical_offset) {
		uint64_t block_idx = physical_offset / BLOCK_SIZE;
		if (block_idx < total_blocks_) {
			visited_map_[block_idx] = true;
		}
	}

	bool BlockTracker::IsVisited(uint64_t block_idx) const {
		return block_idx < total_blocks_ ? visited_map_[block_idx] : false;
	}

	uint64_t BlockTracker::TotalBlocks() const {
		return total_blocks_;
	}

	const std::vector<bool>& BlockTracker::GetVisitedMap() const {
		return visited_map_;
	}

	// 将已访问块与缺失块序列化为 JSON，并在控制台输出连续缺失区间
	void ExportAccessedListWithMissingDetection(const BlockTracker& tracker, const std::string& filename) {
		uint64_t total_blocks = tracker.TotalBlocks();
		const auto& visited_map = tracker.GetVisitedMap();

		std::vector<uint64_t> accessed_blocks;

		for (uint64_t i = 0; i < total_blocks; i++) {
			if (visited_map[i]) {
				uint64_t block_start = i * BLOCK_SIZE;
				accessed_blocks.push_back(block_start);
			}
		}

		std::sort(accessed_blocks.begin(), accessed_blocks.end());

		std::vector<uint64_t> missing_blocks;
		if (!accessed_blocks.empty()) {
			uint64_t start_addr = accessed_blocks.front();
			uint64_t end_addr = accessed_blocks.back();

			std::set<uint64_t> accessed_set(accessed_blocks.begin(), accessed_blocks.end());

			for (uint64_t addr = start_addr; addr <= end_addr; addr += BLOCK_SIZE) {
				if (accessed_set.find(addr) == accessed_set.end()) {
					missing_blocks.push_back(addr);
				}
			}
		}

		if (!missing_blocks.empty()) {
			std::cout << "\n未覆盖的区域 (未访问的块):\n";
			std::cout << "========================================\n";

			uint64_t range_start = missing_blocks[0];
			uint64_t range_end = range_start;

			for (size_t i = 1; i < missing_blocks.size(); i++) {
				if (missing_blocks[i] == range_end + BLOCK_SIZE) {
					range_end = missing_blocks[i];
				} else {
					std::cout << "0x" << std::hex << std::uppercase << range_start
						<< " - 0x" << std::hex << std::uppercase << range_end
						<< " (" << ((range_end - range_start) / BLOCK_SIZE + 1) << " 块)\n";

					range_start = missing_blocks[i];
					range_end = range_start;
				}
			}

			std::cout << "0x" << std::hex << std::uppercase << range_start
				<< " - 0x" << std::hex << std::uppercase << range_end
				<< " (" << ((range_end - range_start) / BLOCK_SIZE + 1) << " 块)\n";

			std::cout << "========================================\n";
			std::cout << " > BlockTracker 总共 " << missing_blocks.size() << " 个未访问块\n";
		}

		nlohmann::ordered_json j;

		nlohmann::ordered_json accessed_array = nlohmann::ordered_json::array();
		for (uint64_t addr : accessed_blocks) {
			std::stringstream ss;
			ss << "0x" << std::hex << std::uppercase << addr;
			accessed_array.push_back(ss.str());
		}
		j["accessed"] = accessed_array;

		if (!missing_blocks.empty()) {
			nlohmann::ordered_json missing_array = nlohmann::ordered_json::array();
			for (uint64_t addr : missing_blocks) {
				std::stringstream ss;
				ss << "0x" << std::hex << std::uppercase << addr;
				missing_array.push_back(ss.str());
			}
			j["missing"] = missing_array;
		}

		j["stats"] = {
			{"total_blocks", total_blocks},
			{"accessed_blocks", accessed_blocks.size()},
			{"missing_blocks", missing_blocks.size()},
			{"coverage_percentage", total_blocks > 0 ? (accessed_blocks.size() * 100.0 / total_blocks) : 0.0}
		};

		std::ofstream o(filename);
		std::string sotrfilename = filename;
		if (o) {
			o << std::setw(4) << j << std::endl;
			std::cout << " > BlockTracker已导出至: " << sotrfilename;
		} else {
			std::cerr << " > BlockTracker导出失败: " << sotrfilename;
		}
	}
}
