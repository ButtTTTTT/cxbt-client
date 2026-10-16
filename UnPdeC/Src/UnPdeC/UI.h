#pragma once

namespace UnPdeC::UI {
	/// <summary>
	/// 初始化控制台编码为 UTF-8
	/// </summary>
	void InitConsoleEncoding();

	/// <summary>
	/// 设置控制台标题,版本信息
	/// </summary>
	void SetConsoleTitleWithVersion();

	/// <summary>
	/// 打印应用信息
	/// </summary>
	void PrintAppInfo();

	/// <summary>
	/// 打印装饰线
	/// </summary>
	void PrintLine();
}
