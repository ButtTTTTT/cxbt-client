#include "Pch.h"
#include "GV.h"

namespace UnPdeC {
	// 重置与当前 .xor 文件相关的状态，确保每次处理新的文件时上下文干净：
	// - 不会修改 XorArr（已发现的 .xor 列表）和 AppDir（程序目录）
	// - 只清理本轮解包过程产生的、与具体 .xor 绑定的临时数据
	void RuntimeContext::Reset() {
		ThisXor = { "", 0L };
		VfsTablesArr.clear();
		CacheMode = false;
		ExtractMode = 'C';
		BlockTracker.reset();

		std::cout << "\n > 上下文已重置\n";
	}
}
