// GuiMessages.h
// 工作线程 -> UI 线程的自定义消息。载荷一律堆分配，接收方负责 delete；
// PostMessage 失败（窗口已销毁）时由发送方立即回收，避免泄漏。

#pragma once

#include <windows.h>

#define WM_APP_DROP          (WM_APP + 1) // lParam = std::vector<std::wstring>*
#define WM_APP_SCAN_DONE     (WM_APP + 2) // lParam = std::vector<TaskEntry>*
#define WM_APP_FILE_DONE     (WM_APP + 3) // lParam = FileResult*
#define WM_APP_FINISHED      (WM_APP + 4) // lParam = EngineStats*
#define WM_APP_SCAN_PROGRESS (WM_APP + 5) // wParam = 已发现数量

#define IDT_TICK 1

// 安全投递：窗口销毁时释放载荷
template <typename T>
inline void PostPayload(HWND hwnd, UINT msg, T* payload, WPARAM wParam = 0) {
	if (payload == nullptr)
		return;
	if (!PostMessageW(hwnd, msg, wParam, reinterpret_cast<LPARAM>(payload)))
		delete payload;
}
