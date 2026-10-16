// DropTarget.cpp
// CF_HDROP 拖放接收实现。所有回调都在注册窗口所属的 UI 线程（STA）上触发。

#include "DropTarget.h"

#include "GuiMessages.h"
#include "MainWindow.h"

namespace {

// CF_HDROP 的标准剪贴板格式 ID 固定为 15，无需 RegisterClipboardFormat
constexpr CLIPFORMAT kFormatHDrop = static_cast<CLIPFORMAT>(15);

}

HRESULT WindowDropTarget::QueryInterface(REFIID riid, void** ppv) {
	if (ppv == nullptr)
		return E_POINTER;
	if (riid == IID_IUnknown || riid == IID_IDropTarget) {
		*ppv = static_cast<IDropTarget*>(this);
		return S_OK;
	}
	*ppv = nullptr;
	return E_NOINTERFACE;
}

bool WindowDropTarget::HasExecutablePayload(IDataObject* pDataObj, UINT* pFormatCount) {
	if (pDataObj == nullptr)
		return false;

	// 快速路径：shell 拖拽必然带 CF_HDROP
	FORMATETC fe{};
	fe.cfFormat = kFormatHDrop;
	fe.ptd = nullptr;
	fe.dwAspect = DVASPECT_CONTENT;
	fe.lindex = -1;
	fe.tymed = TYMED_HGLOBAL;
	if (SUCCEEDED(pDataObj->QueryGetData(&fe))) {
		if (pFormatCount)
			*pFormatCount = 1;
		return true;
	}

	// 兜底：枚举格式表找 HDROP（少数Shell扩展会变换呈现方式）
	IEnumFORMATETC* pEnum = nullptr;
	if (FAILED(pDataObj->EnumFormatEtc(DATADIR_GET, &pEnum)) || pEnum == nullptr)
		return false;
	FORMATETC item{};
	bool found = false;
	while (pEnum->Next(1, &item, nullptr) == S_OK) {
		if (item.cfFormat == fe.cfFormat) {
			found = true;
			break;
		}
	}
	pEnum->Release();
	if (pFormatCount)
		*pFormatCount = found ? 1 : 0;
	return found;
}

IFACEMETHODIMP WindowDropTarget::DragEnter(IDataObject* pDataObj, DWORD /*grfKeyState*/, POINTL /*pt*/,
                                           DWORD* pdwEffect) {
	const bool ok = HasExecutablePayload(pDataObj, nullptr);
	*pdwEffect = ok ? DROPEFFECT_COPY : DROPEFFECT_NONE;
	if (ok && !m_hovering) {
		m_hovering = true;
		if (m_owner)
			m_owner->NotifyHover(true);
	}
	return S_OK;
}

IFACEMETHODIMP WindowDropTarget::DragOver(DWORD /*grfKeyState*/, POINTL /*pt*/, DWORD* pdwEffect) {
	*pdwEffect = m_hovering ? DROPEFFECT_COPY : DROPEFFECT_NONE;
	return S_OK;
}

IFACEMETHODIMP WindowDropTarget::DragLeave() {
	if (m_hovering) {
		m_hovering = false;
		if (m_owner)
			m_owner->NotifyHover(false);
	}
	return S_OK;
}

IFACEMETHODIMP WindowDropTarget::Drop(IDataObject* pDataObj, DWORD /*grfKeyState*/, POINTL /*pt*/,
                                      DWORD* pdwEffect) {
	*pdwEffect = DROPEFFECT_NONE;
	if (m_hovering) {
		m_hovering = false;
		if (m_owner)
			m_owner->NotifyHover(false);
	}

	FORMATETC fe{};
	fe.cfFormat = kFormatHDrop;
	fe.ptd = nullptr;
	fe.dwAspect = DVASPECT_CONTENT;
	fe.lindex = -1;
	fe.tymed = TYMED_HGLOBAL;

	STGMEDIUM medium{};
	if (FAILED(pDataObj->GetData(&fe, &medium)))
		return S_OK;
	if (medium.tymed != TYMED_HGLOBAL || medium.hGlobal == nullptr) {
		ReleaseStgMedium(&medium);
		return S_OK;
	}

	void* data = GlobalLock(medium.hGlobal);
	if (data != nullptr) {
		HDROP hDrop = static_cast<HDROP>(data);
		const UINT count = DragQueryFileW(hDrop, 0xFFFFFFFFu, nullptr, 0);
		std::vector<std::wstring> paths;
		paths.reserve(count);
		for (UINT i = 0; i < count; ++i) {
			const UINT len = DragQueryFileW(hDrop, i, nullptr, 0);
			if (len == 0)
				continue;
			std::wstring path(len, L'\0');
			if (DragQueryFileW(hDrop, i, path.data(), len + 1) != 0)
				paths.push_back(std::move(path));
		}
		GlobalUnlock(medium.hGlobal);
		if (m_owner && !paths.empty()) {
			m_owner->SubmitPaths(std::move(paths));
			*pdwEffect = DROPEFFECT_COPY;
		}
	}

	ReleaseStgMedium(&medium);
	return S_OK;
}
