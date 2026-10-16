// DropTarget.h
// 窗口级 OLE 拖放：接收资源管理器拖入的文件/文件夹（CF_HDROP）。

#pragma once

#include <windows.h>
#include <objbase.h>
#include <shlobj.h>

#include <vector>
#include <string>

class MainWindow;

class WindowDropTarget final : public IDropTarget {
public:
	WindowDropTarget(MainWindow* owner, HWND hwnd) : m_owner(owner), m_hwnd(hwnd) {}

	// IUnknown
	IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override;
	IFACEMETHODIMP_(ULONG) AddRef() override { return 2; }  // 单例，无需引用计数
	IFACEMETHODIMP_(ULONG) Release() override { return 1; }

	// IDropTarget
	IFACEMETHODIMP DragEnter(IDataObject* pDataObj, DWORD grfKeyState, POINTL pt, DWORD* pdwEffect) override;
	IFACEMETHODIMP DragOver(DWORD grfKeyState, POINTL pt, DWORD* pdwEffect) override;
	IFACEMETHODIMP DragLeave() override;
	IFACEMETHODIMP Drop(IDataObject* pDataObj, DWORD grfKeyState, POINTL pt, DWORD* pdwEffect) override;

private:
	static bool HasExecutablePayload(IDataObject* pDataObj, UINT* pFormatCount);

	MainWindow* m_owner = nullptr;
	HWND m_hwnd = nullptr;
	bool m_hovering = false;
};
