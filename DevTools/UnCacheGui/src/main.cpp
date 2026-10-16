// main.cpp
// UnCache GUI 入口：OleInitialize(STA) + 通用控件 + 消息循环。

#include "MainWindow.h"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <commctrl.h>
#include <ole2.h>
#include <shellapi.h>

#include <vector>
#include <string>

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE, LPWSTR, int nCmdShow) {
	// 必须在创建任何窗口之前设定 DPI 感知。工程虽然自带 app.manifest，但链接器 GenerateManifest=false
	// 下运行时仍可能是 DPI 未感知（GetDpiForWindow 返回 96），高分屏会发虚/偏小。这里用 API 强制
	// Per-Monitor V2，动态解析以便在旧系统上平滑降级；必须在任何 UI 初始化之前调用。
	if (HMODULE user32 = GetModuleHandleW(L"user32.dll")) {
		using SetCtxFn = BOOL(WINAPI*)(DPI_AWARENESS_CONTEXT);
		auto pSetCtx = reinterpret_cast<SetCtxFn>(
		    reinterpret_cast<void*>(GetProcAddress(user32, "SetProcessDpiAwarenessContext")));
		if (pSetCtx == nullptr ||
		    !pSetCtx(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)) {
			// 退回系统级感知（例如 Windows 8.1 / 调用被更早的上下文锁定时）
			SetProcessDPIAware();
		}
	}

	INITCOMMONCONTROLSEX icc{};
	icc.dwSize = sizeof(icc);
	icc.dwICC = ICC_LISTVIEW_CLASSES | ICC_BAR_CLASSES | ICC_STANDARD_CLASSES | ICC_DATE_CLASSES;
	InitCommonControlsEx(&icc);

	// 拖放需要 STA 套间；失败则退回普通 COM 初始化（拖放不可用，其余功能正常）
	HRESULT oleHr = OleInitialize(nullptr);
	if (FAILED(oleHr))
		oleHr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

	MainWindow window(hInstance);
	if (!window.Create(nCmdShow)) {
		MessageBoxW(nullptr, L"主窗口创建失败（检查资源/通用控件版本）。", L"UnCache GUI", MB_OK | MB_ICONERROR);
		if (SUCCEEDED(oleHr) && oleHr != S_FALSE)
			CoUninitialize();
		return 1;
	}

	HWND mainWnd = window.Handle();

	// 命令行传入的路径：直接当作拖入处理，方便脚本/右键调用
	int argc = 0;
	LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
	if (argv != nullptr) {
		if (argc > 1) {
			std::vector<std::wstring> paths;
			paths.reserve(static_cast<size_t>(argc - 1));
			for (int i = 1; i < argc; ++i) {
				if (argv[i] != nullptr && argv[i][0] != L'\0')
					paths.emplace_back(argv[i]);
			}
			if (!paths.empty())
				window.SubmitPaths(std::move(paths));
		}
		LocalFree(argv);
	}

	MSG msg{};
	while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
		if (mainWnd != nullptr && !IsDialogMessageW(mainWnd, &msg)) {
			TranslateMessage(&msg);
			DispatchMessageW(&msg);
		} else if (mainWnd == nullptr) {
			TranslateMessage(&msg);
			DispatchMessageW(&msg);
		}
	}

	if (SUCCEEDED(oleHr))
		CoUninitialize();
	return static_cast<int>(msg.wParam);
}
