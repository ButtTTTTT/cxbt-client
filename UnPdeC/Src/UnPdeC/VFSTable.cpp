#include "Pch.h"
#include "VFSTable.h"
#include "Logger.h"
#include "MemoryMapper.h"
#include "Tracking.h"
#include "Types.h"
#include "GV.h"

// VFS 表相关工具：负责扫描 XOR 文件中的表块并根据表解析真实数据偏移
namespace UnPdeC::VFSTable {
	namespace {
		constexpr uint64_t VFS_OFFSET_SHIFT = 0xA;
		constexpr uint64_t VFS_PAGE_SIZE = 0x1000;
		constexpr uint64_t VFS_PAGE_MASK = 0x3FF;
		constexpr uint32_t VFS_VALUE_MASK = 0x7FFFFFFF;
		constexpr uint64_t VFS_TABLE_SKIP = 0x400000;
		constexpr uint32_t UINT32_SIZE = 4;

		// 根据文件中的逻辑偏移，从合并后的 VFS 表中计算下一个逻辑偏移值
		uint64_t CalculateVfsValue(const UnPdeC::RuntimeContext& ctx, uint64_t file_offset) {
			if (ctx.VfsTablesArr.empty()) {
				throw std::runtime_error("VFS表未加载或为空");
			}

			uint64_t final_offset = ((file_offset >> VFS_OFFSET_SHIFT) * VFS_PAGE_SIZE) + ((file_offset & VFS_PAGE_MASK) * UINT32_SIZE);

			if (final_offset >= ctx.VfsTablesArr.size() || final_offset + UINT32_SIZE > ctx.VfsTablesArr.size()) {
				throw std::runtime_error("偏移量超出数组范围");
			}

			uint32_t pde = (static_cast<uint8_t>(ctx.VfsTablesArr[final_offset + 3]) << 24) |
				(static_cast<uint8_t>(ctx.VfsTablesArr[final_offset + 2]) << 16) |
				(static_cast<uint8_t>(ctx.VfsTablesArr[final_offset + 1]) << 8) |
				static_cast<uint8_t>(ctx.VfsTablesArr[final_offset]);

			return pde & VFS_VALUE_MASK;
		}

		// 计算组成一个文件的所有 VFS 逻辑偏移列表，支持跨多个 0x1000 页
		std::vector<uint64_t> CalculateVfsOffsets(const UnPdeC::RuntimeContext& ctx, uint64_t file_size, uint64_t file_offset) {
			std::vector<uint64_t> vfs_offsets;

			if (file_size <= VFS_PAGE_SIZE) {
				vfs_offsets.push_back(file_offset);
			} else {
				uint64_t vfs_offset_count = (file_size / VFS_PAGE_SIZE) + (file_size % VFS_PAGE_SIZE ? 1 : 0);
				vfs_offsets.push_back(file_offset);

				for (uint32_t i = 1; i < vfs_offset_count; ++i) {
					uint64_t vfs_val = CalculateVfsValue(ctx, file_offset);
					vfs_offsets.push_back(vfs_val);
					file_offset = vfs_val;
				}
			}

			return vfs_offsets;
		}

		uint64_t RawToRealOffset(uint64_t OrigOffset) {
			uint64_t shifted = static_cast<uint64_t>(OrigOffset) >> 10;
			uint64_t intermediate = OrigOffset + shifted + 1;
			return intermediate << 12;
		}
	}

	bool DumpVfsTable(UnPdeC::RuntimeContext& ctx, const std::filesystem::path& xorFilePath) {
		Logger::Info("开始处理VFS表");
		std::cout << " > 开始处理VFS表\n";

		try {
			auto& mapper = MemoryMapper::GetInstance();
			mapper.OpenFile(xorFilePath.string());

			uint64_t fileSize = mapper.GetFileSize();
			Logger::Info("文件大小: " + std::to_string(fileSize) + " 字节");

			ctx.BlockTracker = std::make_unique<Tracking::BlockTracker>(fileSize);
			Logger::Debug("已设置全局块追踪器");

			std::filesystem::path vtoFilePath = ctx.ThisXor.OutputPath / "VfsOffsets.txt";
			std::filesystem::path vtFilePath = ctx.ThisXor.OutputPath / "VfsTable.hex";

			std::ofstream vtoFile(vtoFilePath);
			std::ofstream vtFile(vtFilePath, std::ios::binary);

			if (!vtoFile || !vtFile) {
				Logger::Error("无法创建输出文件");
				std::cerr << " !无法创建输出文件\n";
				return false;
			}

			auto tracker = ctx.BlockTracker.get();

			std::vector<std::pair<uint64_t, uint32_t>> readBlocks;
			std::vector<uint64_t> offsets;

			uint64_t offset = 0;
			while (offset < fileSize) {
				offsets.push_back(offset);

				uint32_t readSize = VFS_PAGE_SIZE;
				if (offset + readSize > fileSize) {
					readSize = static_cast<uint32_t>(fileSize - offset);
				}

				readBlocks.emplace_back(offset, readSize);

				if (tracker) {
					tracker->MarkVisited(offset);
				}

				offset += VFS_PAGE_SIZE;
				offset += VFS_TABLE_SKIP;

				if (offset >= fileSize) {
					break;
				}
			}

			Logger::Info("找到 " + std::to_string(readBlocks.size()) + " 个VFS表块");
			std::cout << " > 正在批量读取 " << readBlocks.size() << " 个VFS表块...\n";
			auto vfsDataChunks = mapper.ReadMultipleBlocks(readBlocks);

			std::vector<uint8_t> TempVfs;

			for (size_t i = 0; i < vfsDataChunks.size(); ++i) {
				const auto& chunk = vfsDataChunks[i];
				uint64_t currentOffset = offsets[i];

				vtoFile << std::format("0x{:X}\n", currentOffset);
				vtFile.write(reinterpret_cast<const char*>(chunk.data()), chunk.size());
				TempVfs.insert(TempVfs.end(), chunk.begin(), chunk.end());

				if ((i + 1) % 10 == 0 || (i + 1) == vfsDataChunks.size()) {
					std::cout << " > 已处理 " << (i + 1) << "/" << vfsDataChunks.size()
						<< " 个VFS表块\n";
				}
			}

			ctx.VfsTablesArr = std::move(TempVfs);

			std::cout << " > VFS偏移:" << ctx.ThisXor.RootDirName << "\\VfsOffsets.txt" << "\n";
			std::cout << " > VFS表:" << ctx.ThisXor.RootDirName << "\\VfsTable.hex" << "\n";
			std::cout << " > 共处理 " << vfsDataChunks.size() << " 个VFS表块，总大小: "
				<< ctx.VfsTablesArr.size() << " 字节\n";
			std::cout << " > VFS表处理完成\n";

			Logger::Info("VFS表处理完成，共 " + std::to_string(vfsDataChunks.size()) + " 个块，总大小: " + std::to_string(ctx.VfsTablesArr.size()) + " 字节");
			return !ctx.VfsTablesArr.empty();

		} catch (const std::exception& e) {
			Logger::Error("处理VFS表时发生错误: " + std::string(e.what()));
			std::cerr << " !处理VFS表时发生错误: " << e.what() << "\n";
			return false;
		}
	}

	std::vector<uint8_t> ReadDataFromXor(UnPdeC::RuntimeContext& ctx, uint64_t VfsOffset, uint64_t BlockSize) {
		Logger::Debug("读取数据: VFS偏移=" + UnPdeC::ToHexString(VfsOffset) + ", 块大小=" + std::to_string(BlockSize));

		try {
			if (ctx.VfsTablesArr.empty()) {
				Logger::Error("VFS表未加载");
				throw std::runtime_error("VFS表未加载");
			}

			if (ctx.ThisXor.Path.empty()) {
				Logger::Error("当前未设置.xor文件路径");
				throw std::runtime_error("当前未设置.xor文件路径");
			}

			auto vfs_offsets = CalculateVfsOffsets(ctx, BlockSize, VfsOffset);
			Logger::Debug("计算得到 " + std::to_string(vfs_offsets.size()) + " 个VFS偏移");

			uint32_t last_offset_size = BlockSize % VFS_PAGE_SIZE;
			if (last_offset_size == 0) {
				last_offset_size = VFS_PAGE_SIZE;
			}

			auto& mapper = MemoryMapper::GetInstance();
			mapper.OpenFile(ctx.ThisXor.Path);

			uint64_t fileSize = mapper.GetFileSize();

			std::vector<std::pair<uint64_t, uint32_t>> readBlocks;
			std::vector<uint64_t> realOffsets;

			for (size_t i = 0; i < vfs_offsets.size(); ++i) {
				uint64_t real_offset = RawToRealOffset(vfs_offsets[i]);
				uint32_t read_size = (i == vfs_offsets.size() - 1) ? last_offset_size : VFS_PAGE_SIZE;

				if (real_offset >= fileSize) {
					Logger::Warning("偏移 " + UnPdeC::ToHexString(real_offset) + " 超出文件范围");
					std::cerr << "警告: 偏移 " << real_offset << " 超出文件范围\n";
					continue;
				}

				if (real_offset + read_size > fileSize) {
					read_size = static_cast<uint32_t>(fileSize - real_offset);
					Logger::Warning("在偏移 " + UnPdeC::ToHexString(real_offset) + " 处调整读取大小为 " + std::to_string(read_size) + " 字节");
					std::cerr << "警告: 在偏移 " << real_offset
						<< " 处调整读取大小为 " << read_size << " 字节\n";
				}

				readBlocks.emplace_back(real_offset, read_size);
				realOffsets.push_back(real_offset);
			}

			auto chunks = mapper.ReadMultipleBlocks(readBlocks);

			std::vector<uint8_t> result;
			result.reserve(BlockSize);

			auto tracker = ctx.BlockTracker.get();

			for (size_t i = 0; i < chunks.size(); ++i) {
				const auto& chunk = chunks[i];
				uint64_t real_offset = realOffsets[i];

				result.insert(result.end(), chunk.begin(), chunk.end());

				if (tracker) {
					tracker->MarkVisited(real_offset);
				}
			}

			if (result.size() != BlockSize) {
				Logger::Warning("请求 " + std::to_string(BlockSize) + " 字节，但实际读取 " + std::to_string(result.size()) + " 字节");
				std::cerr << "警告: 请求 " << BlockSize << " 字节，但实际读取 "
					<< result.size() << " 字节\n";
			}

			Logger::Debug("成功读取 " + std::to_string(result.size()) + " 字节数据");
			return result;

		} catch (const std::exception& e) {
			Logger::Error("读取数据失败: " + std::string(e.what()));
			throw std::runtime_error(std::string("读取数据失败: ") + e.what());
		}
	}
}
