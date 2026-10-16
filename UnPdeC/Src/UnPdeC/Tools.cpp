#include "Pch.h"
#include "GV.h"
#include "Logger.h"
#include "MemoryMapper.h"
#include "Tools.h"
#include "Types.h"
#include "UI.h"
#include "VFSTable.h"

// 工具模块实现：负责初始化解压环境、查找 XOR 文件以及通用读写与模式配置
namespace UnPdeC::Tools {
	void ThrowError(ErrorCode code, const std::string& message) {
		std::string errorStr;
		switch (code) {
			case ErrorCode::FILE_NOT_FOUND:
				errorStr = "文件未找到";
				break;
			case ErrorCode::FILE_OPEN_FAILED:
				errorStr = "文件打开失败";
				break;
			case ErrorCode::FILE_READ_FAILED:
				errorStr = "文件读取失败";
				break;
			case ErrorCode::FILE_WRITE_FAILED:
				errorStr = "文件写入失败";
				break;
			case ErrorCode::INVALID_OFFSET:
				errorStr = "无效的偏移量";
				break;
			case ErrorCode::INVALID_SIZE:
				errorStr = "无效的大小";
				break;
			case ErrorCode::VFS_TABLE_ERROR:
				errorStr = "VFS表错误";
				break;
			case ErrorCode::DECOMPRESSION_ERROR:
				errorStr = "解压错误";
				break;
			case ErrorCode::MEMORY_ERROR:
				errorStr = "内存错误";
				break;
			case ErrorCode::INVALID_ARGUMENT:
				errorStr = "无效的参数";
				break;
			case ErrorCode::UNKNOWN_ERROR:
				errorStr = "未知错误";
				break;
			default:
				errorStr = "错误";
				break;
		}
		throw std::runtime_error(errorStr + ": " + message);
	}

	namespace {
		// 根据当前缓存/解压模式拼接输出目录名称，便于区分不同配置下的结果
		std::string OutputDirectoryNameImpl(const UnPdeC::RuntimeContext& ctx, const std::string& fileName) {
			std::string baseName = fileName.substr(0, fileName.find_last_of('.'));
			std::string cacheSuffix = ctx.CacheMode ? "_cache" : "_nocache";
			std::string saveFirst8ByteSuffix;
			if (!ctx.CacheMode) {
				if (ctx.ExtractMode == 'B') {
					saveFirst8ByteSuffix = "_k8byte";
				} else if (ctx.ExtractMode == 'A') {
					saveFirst8ByteSuffix = "_r8byte";
				} else {
					saveFirst8ByteSuffix = "_m8byte";
				}
			}
			return baseName + cacheSuffix + saveFirst8ByteSuffix;
		}
	}

	void Init(UnPdeC::RuntimeContext& ctx, UnPdeC::SThisXor& xorFile) {
		try {
			Logger::Info("开始初始化Tools");
			std::cout << "\n > 正在初始化Tools\n";

			xorFile.RootDirName = OutputDirectoryNameImpl(ctx, xorFile.Name);

			std::filesystem::path OutputPath = ctx.AppDir / xorFile.RootDirName;
			xorFile.OutputPath = OutputPath;

			ctx.ThisXor = xorFile;
			Logger::Info("输出目录: " + xorFile.RootDirName);
			std::cout << " > 输出目录: " << xorFile.RootDirName << "\n";

			if (!std::filesystem::exists(OutputPath)) {
				try {
					std::filesystem::create_directory(OutputPath);
					Logger::Debug("创建输出目录: " + OutputPath.string());
				} catch (const std::exception& e) {
					Logger::Error("创建目录失败: " + std::string(e.what()));
					std::cerr << " !创建目录失败: " << e.what() << "\n";
					return;
				}
			}

			MemoryMapper::GetInstance().OpenFile(xorFile.Path);
			Logger::Debug("打开文件: " + xorFile.Path);

			bool VfsDunped = VFSTable::DumpVfsTable(ctx, ctx.ThisXor.Path);
			if (!VfsDunped) {
				Logger::Error("处理VFS表失败");
				std::cerr << " !处理VFS表失败\n";
				return;
			}

			Logger::Info("初始化Tools完成");
			std::cout << " > 初始化Tools完成\n";
			UI::PrintLine();
		} catch (const std::exception& e) {
			Logger::Error("初始化Tools失败: " + std::string(e.what()));
			std::cerr << " !初始化Tools失败: " << e.what() << "\n";
		}
	}

	/// <summary>
	/// 查找xor文件
	/// </summary>
	/// <param name="ctx"></param>
	void FindXorFile(UnPdeC::RuntimeContext& ctx) {
		Logger::Info("开始查找XOR文件");
		std::cout << " > 开始查找XOR文件\n";

		std::vector<SThisXor> XorArr;
		char buffer[MAX_PATH];
		GetModuleFileNameA(NULL, buffer, MAX_PATH);
		std::filesystem::path exePath = std::filesystem::path(buffer).remove_filename();
		ctx.AppDir = exePath;

		for (const auto& entry : std::filesystem::directory_iterator(exePath)) {
			if (entry.path().extension() == ".xor") {
				SThisXor nowXor;
				std::string fileName = entry.path().filename().string();
				fileName = fileName.substr(0, fileName.find_first_of('.'));

				nowXor.Name = fileName;
				nowXor.Size = long(std::filesystem::file_size(entry.path()));
				nowXor.Path = entry.path().string();
				nowXor.JsonPath = (exePath / fileName).string() + ".json";
				XorArr.push_back(nowXor);

				Logger::Debug("找到XOR文件: " + fileName);
			}
		}

		if (XorArr.empty()) {
			Logger::Error("没有找到Xor文件");
			std::cout << " ! 没有找到Xor文件\n\n > 按任意键退出\n";
			std::cin.get();
			exit(-1);
		}

		ctx.XorArr = XorArr;
		Logger::Info("找到 " + std::to_string(XorArr.size()) + " 个XOR文件");

		for (int i = 0; i < static_cast<int>(XorArr.size()); i++) {
			std::cout << "  " << i << ": " << XorArr[i].Name << "\n";
		}

		UI::PrintLine();
	}

	uint64_t RawToRealOffset(uint64_t OrigOffset) {
		uint64_t shifted = static_cast<uint64_t>(OrigOffset) >> 10;
		uint64_t intermediate = OrigOffset + shifted + 1;
		return intermediate << 12;
	}

	uint64_t RealToRawOffset(uint64_t PdeOffset) {
		uint64_t intermediate = PdeOffset >> 12;
		uint64_t rawOffset = intermediate - 1;
		uint64_t shifted = rawOffset >> 10;
		return rawOffset - shifted;
	}

	std::vector<uint8_t> GetByteOfXor(UnPdeC::RuntimeContext& ctx, uint64_t Start, uint64_t Size) {
		try {
			auto& mapper = MemoryMapper::GetInstance();
			Logger::Debug("读取XOR文件: 偏移=" + UnPdeC::ToHexString(Start) + ", 大小=" + std::to_string(Size));
			return mapper.ReadData(Start, static_cast<uint32_t>(Size));
		} catch (const std::exception& e) {
			Logger::Error("读取XOR文件失败: " + std::string(e.what()));
			std::cerr << "无法读取xor文件: " << ctx.ThisXor.Name << "\n";
			return {};
		}
	}

	void GetHasCacheMode(UnPdeC::RuntimeContext& ctx) {
		char cacheMode = 'N';
		std::cout << "\n > 缓存模式\n    [Y]启用: 不进行二次解压,直接导出.cache文件! [_cache]\n    [N]禁用[推荐]: 进行二次解压,导出为解压后的文件! [_nocache]\n > 选择[默认N]: ";

		std::string input;
		std::getline(std::cin, input);

		if (!input.empty() && (input[0] == 'Y' || input[0] == 'y' || input[0] == 'N' || input[0] == 'n')) {
			cacheMode = static_cast<char>(toupper(input[0]));
		}

		bool mode = (cacheMode == 'Y');
		ctx.CacheMode = mode;
		std::cout << " > 缓存模式: " << (mode ? "启用 [_cache]" : "禁用 [_nocache]") << "\n";

		if (mode == false) {
			Tools::GetExtractMode(ctx);
		} else {
			UI::PrintLine();
		}
	}

	void GetExtractMode(UnPdeC::RuntimeContext& ctx) {
		char extractMode = 'C';
		std::cout << "\n > 解压选项\n    [A]删除前8字节: 删除全部导出文件的前8个字节! [_r8byte]\n    [B]保留前8字节: 保留全部导出文件的前8个字节! [_k8byte]\n    [C]混合导出[推荐]: .mesh .skel .anim 文件保留前8字节，其余全部删除前8字节，方便导入blender! [_m8byte]\n > 选择[默认C]: ";

		std::string input;
		std::getline(std::cin, input);

		if (!input.empty() && (input[0] == 'A' || input[0] == 'a' || input[0] == 'B' || input[0] == 'b' || input[0] == 'C' || input[0] == 'c')) {
			extractMode = static_cast<char>(toupper(input[0]));
		}

		ctx.ExtractMode = extractMode;

		switch (extractMode) {
			case 'A':
				std::cout << " > 解压选项: 删除前8字节 [_r8byte]\n";
				break;
			case 'B':
				std::cout << " > 解压选项: 保留前8字节 [_k8byte]\n";
				break;
			case 'C':
			default:
				std::cout << " > 解压选项: 混合导出 [_m8byte]\n";
				break;
		}

		UI::PrintLine();
	}

	std::uint32_t Get4Byte(const std::vector<std::uint8_t>& data, std::uint64_t offset) {
		if (offset + 4 > data.size()) {
			throw std::out_of_range("PdeOffset out of range");
		}
		std::uint32_t value;
		std::memcpy(&value, data.data() + offset, sizeof(value));
		return value;
	}
}
