#include "Pch.h"
#include "UI.h"

// 控制台相关的 UI 辅助函数：编码初始化、标题设置以及简单的装饰输出
namespace UnPdeC::UI {

	/// <summary>
	/// 初始化控制台编码为 UTF-8
	/// </summary>
	void InitConsoleEncoding() {
		SetConsoleOutputCP(CP_UTF8);
		SetConsoleCP(CP_UTF8);
		std::setlocale(LC_ALL, ".UTF-8");
	}

	/// <summary>
	/// 设置控制台标题,版本信息
	/// </summary>
	void SetConsoleTitleWithVersion() {
		TCHAR szFilePath[MAX_PATH] = { 0 };

		if (GetModuleFileName(NULL, szFilePath, MAX_PATH) == 0) {
			SetConsoleTitle(TEXT("Error: Cannot get module file name."));
			return;
		}

		DWORD dwHandle = 0;
		DWORD dwInfoSize = GetFileVersionInfoSize(szFilePath, &dwHandle);
		if (dwInfoSize == 0) {
			SetConsoleTitle(TEXT("Error: Cannot get version info."));
			return;
		}

		std::vector<BYTE> versionInfo(dwInfoSize);
		if (!GetFileVersionInfo(szFilePath, 0, dwInfoSize, versionInfo.data())) {
			SetConsoleTitle(TEXT("Error: Cannot get version info."));
			return;
		}

		VS_FIXEDFILEINFO* pFileInfo = nullptr;
		UINT uLen = 0;
		if (!VerQueryValue(versionInfo.data(), TEXT("\\"), (LPVOID*)&pFileInfo, &uLen)) {
			SetConsoleTitle(TEXT("Error: Cannot query version value."));
			return;
		}

		auto version = std::format(TEXT("UnPdeC V:{}.{}.{}.{}"),
			HIWORD(pFileInfo->dwFileVersionMS),
			LOWORD(pFileInfo->dwFileVersionMS),
			HIWORD(pFileInfo->dwFileVersionLS),
			LOWORD(pFileInfo->dwFileVersionLS));

		SetConsoleTitle(version.c_str());
	}

	/// <summary>
	/// 打印应用信息
	/// </summary>
	void PrintAppInfo() {
		const std::string AppInfo =
			"\n"
			"  ██╗   ██╗ ███╗   ██╗ ██████╗  ██████╗  ███████╗  ██████╗\n"
			"  ██║   ██║ ████╗  ██║ ██╔══██╗ ██╔══██╗ ██╔════╝ ██╔════╝\n"
			"  ██║   ██║ ██╔██╗ ██║ ██████╔╝ ██║  ██║ █████╗   ██║     \n"
			"  ██║   ██║ ██║╚██╗██║ ██╔═══╝  ██║  ██║ ██╔══╝   ██║     \n"
			"  ╚██████╔╝ ██║ ╚████║ ██║      ██████╔╝ ███████╗ ╚██████╗\n"
			"   ╚═════╝  ╚═╝  ╚═══╝ ╚═╝      ╚═════╝  ╚══════╝  ╚═════╝\n"
			"-----------------------------------------------------------\n\n";
		std::cout << AppInfo;
	}

	/// <summary>
	/// 打印装饰线
	/// </summary>
	void PrintLine() {
		std::cout << "-----------------------------------------------------------\n";
	}
}
