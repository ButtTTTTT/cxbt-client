#include "Pch.h"
#include "GV.h"
#include "RecursiveMode.h"
#include "Tools.h"
#include "UI.h"

int main() {
	// 全局运行时上下文,贯穿整个解包流程
	UnPdeC::RuntimeContext ctx;

	// 初始化控制台编码、防止中文输出乱码
	UnPdeC::UI::InitConsoleEncoding();
	// 设置控制台标题,版本信息
	UnPdeC::UI::SetConsoleTitleWithVersion();
	// 在程序开始时打印应用信息和简单说明
	UnPdeC::UI::PrintAppInfo();

	// 扫描当前目录及子目录
	UnPdeC::Tools::FindXorFile(ctx);

	// 如果没有找到任何 .xor 文件，则直接提示并退出
	if (ctx.XorArr.empty()) {
		std::cout << " > 未找到任何.xor文件\n";
		return 0;
	}

	// 输出发现的 .xor 数量
	std::cout << " > 找到 " << ctx.XorArr.size() << " 个.xor文件\n";
	// 询问/检测是否启用 .cache 二次解压模式，并可能修改 ctx.CacheMode/ExtractMode
	UnPdeC::Tools::GetHasCacheMode(ctx);
	// 记录下当前用户选择的模式，用于每次处理完一个 .xor 后恢复
	const bool cacheMode = ctx.CacheMode;
	const char extractMode = ctx.ExtractMode;

	// 依次处理每一个 .xor 文件
	for (auto& xorFile : ctx.XorArr) {
		// 针对当前 .xor 初始化上下文（路径、输出目录、VFS 表等）
		UnPdeC::Tools::Init(ctx, xorFile);
		// 进入递归解包模式：遍历 VFS 结构并解压其中的各类文件
		UnPdeC::RecursiveMode::ExtractRecursive(ctx);
		// 处理完一个 .xor 后，重置与其相关的临时状态
		ctx.Reset();
		// 但需要恢复用户最初选择的 CacheMode 和 ExtractMode
		ctx.CacheMode = cacheMode;
		ctx.ExtractMode = extractMode;
		// 在不同 .xor 之间打印分隔线，便于阅读日志
		UnPdeC::UI::PrintLine();
	}

	// 所有 .xor 文件处理完成后输出总结信息
	std::cout << "\n > Xor文件解压完成!\n";
	UnPdeC::UI::PrintLine();

	// 暂停控制台，便于用户查看输出结果
	system("pause");
	return 0;
}
