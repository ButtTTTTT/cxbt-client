// MainWindow.cpp
// 主窗口实现：OwnerData 列表、锚定布局、拖放、定时聚合刷新、失败清单导出。

#include "MainWindow.h"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>

#include <commctrl.h>
#include <ole2.h>
#include <shellapi.h>
#include <shobjidl.h>
#include <windowsx.h>

#include <algorithm>
#include <chrono>
#include <format>
#include <numeric>
#include <string_view>
#include <vector>

#include "../resource.h"
#include "DropTarget.h"
#include "GuiMessages.h"

namespace {

// 列顺序
enum Column {
	ColName = 0,
	ColDir,
	ColStatus,
	ColIn,
	ColOut,
	ColTime,
	ColDetail,
	ColCount
};

constexpr UINT kTickMs = 120;         // UI 聚合刷新周期
const uint32_t kThreadChoices[] = { 0, 1, 2, 4, 8, 16, 32 };
constexpr const wchar_t* kDefaultHint =
	L"把 .cache 文件或文件夹直接拖到本窗口即可开始解压（支持一次拖多个）";
constexpr const wchar_t* kHoverHint = L"松开鼠标即可开始解压（.cache 文件 / 文件夹）";

std::wstring FmtBytes(uint64_t bytes) {
	const double b = static_cast<double>(bytes);
	if (bytes < 1024)
		return std::format(L"{} B", bytes);
	if (bytes < 1024ull * 1024)
		return std::format(L"{:.1f} KB", b / 1024.0);
	if (bytes < 1024ull * 1024 * 1024)
		return std::format(L"{:.2f} MB", b / (1024.0 * 1024.0));
	return std::format(L"{:.2f} GB", b / (1024.0 * 1024.0 * 1024.0));
}

std::wstring FmtMs(uint64_t ms) {
	if (ms < 1000)
		return std::format(L"{}ms", ms);
	return std::format(L"{:.2f}s", ms / 1000.0);
}

std::wstring_view StatusTextOf(int state) {
	switch (state) {
	case 1: return L"成功";
	case 2: return L"失败";
	case 3: return L"跳过";
	case 4: return L"取消";
	default: return L"排队";
	}
}

// 扩展名列表解析：支持 ; , 、 ， 空格 分隔，忽略前导点，统一小写
std::vector<std::wstring> SplitExtList(std::wstring_view raw) {
	std::vector<std::wstring> out;
	size_t pos = 0;
	while (pos <= raw.size()) {
		size_t next = raw.find_first_of(L";,、， \t", pos);
		if (next == std::wstring_view::npos)
			next = raw.size();
		std::wstring token(raw.substr(pos, next - pos));
		while (!token.empty() && token.front() == L'.')
			token.erase(token.begin());
		if (!token.empty()) {
			std::transform(token.begin(), token.end(), token.begin(),
			               [](wchar_t c) { return static_cast<wchar_t>(towlower(c)); });
			if (std::find(out.begin(), out.end(), token) == out.end())
				out.push_back(std::move(token));
		}
		pos = next + 1;
	}
	return out;
}

std::wstring GetText(HWND h) {
	const int len = GetWindowTextLengthW(h);
	std::wstring s(static_cast<size_t>(len) + 1, L'\0');
	const int n = GetWindowTextW(h, s.data(), len + 1);
	s.resize(n > 0 ? n : 0);
	return s;
}

std::wstring ExeDirOf(HINSTANCE inst) {
	wchar_t buf[MAX_PATH * 2];
	const DWORD n = GetModuleFileNameW(inst, buf, static_cast<DWORD>(std::size(buf)));
	std::wstring path(buf, n);
	const size_t slash = path.find_last_of(L"\\/");
	return (slash == std::wstring::npos) ? std::wstring(L".") : path.substr(0, slash);
}

std::string Utf8FromWide(const std::wstring& w) {
	if (w.empty())
		return {};
	const int len = WideCharToMultiByte(CP_UTF8, 0, w.data(), static_cast<int>(w.size()), nullptr, 0, nullptr, nullptr);
	std::string out(static_cast<size_t>(len), '\0');
	WideCharToMultiByte(CP_UTF8, 0, w.data(), static_cast<int>(w.size()), out.data(), len, nullptr, nullptr);
	return out;
}

bool EndsWithCI(std::wstring_view s, std::wstring_view suffix) {
	if (s.size() < suffix.size())
		return false;
	return _wcsicmp(s.data() + (s.size() - suffix.size()), suffix.data()) == 0;
}

void PathsFromShellItems(IShellItemArray* arr, std::vector<std::wstring>& out) {
	DWORD count = 0;
	if (FAILED(arr->GetCount(&count)))
		return;
	out.reserve(out.size() + count);
	for (DWORD i = 0; i < count; ++i) {
		IShellItem* item = nullptr;
		if (FAILED(arr->GetItemAt(i, &item)) || item == nullptr)
			continue;
		LPWSTR raw = nullptr;
		if (SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &raw)) && raw) {
			out.emplace_back(raw);
			CoTaskMemFree(raw);
		}
		item->Release();
	}
}

} // namespace

// ------------------------------ 构造 / 生命周期 ------------------------------

MainWindow::MainWindow(HINSTANCE hInst) : m_hInst(hInst) {}

MainWindow::~MainWindow() {
	if (m_hFont)
		DeleteObject(m_hFont);
}

bool MainWindow::Create(int nCmdShow) {
	m_hDlg = CreateDialogParamW(m_hInst, MAKEINTRESOURCEW(IDD_MAIN), nullptr, DlgProc,
	                            reinterpret_cast<LPARAM>(this));
	if (m_hDlg == nullptr)
		return false;
	ShowWindow(m_hDlg, nCmdShow);
	UpdateWindow(m_hDlg);
	return true;
}

INT_PTR CALLBACK MainWindow::DlgProc(HWND hDlg, UINT msg, WPARAM wParam, LPARAM lParam) {
	if (msg == WM_INITDIALOG)
		SetWindowLongPtrW(hDlg, GWLP_USERDATA, static_cast<LONG_PTR>(lParam));
	auto* self = reinterpret_cast<MainWindow*>(GetWindowLongPtrW(hDlg, GWLP_USERDATA));
	if (self == nullptr)
		return FALSE;
	// WM_INITDIALOG 在 CreateDialogParamW 返回之前同步触发，此时成员 m_hDlg 尚未被赋值，
	// 必须先把它设好，否则 OnInitDialog/LoadSettings 里的 GetDlgItem(m_hDlg, ...) 会拿到空句柄。
	if (msg == WM_INITDIALOG)
		self->m_hDlg = hDlg;
	return self->OnMessage(msg, wParam, lParam);
}

INT_PTR MainWindow::OnMessage(UINT msg, WPARAM wParam, LPARAM lParam) {
	switch (msg) {
	case WM_INITDIALOG:
		OnInitDialog();
		return TRUE;
	case WM_COMMAND:
		OnCommand(LOWORD(wParam), HIWORD(wParam), reinterpret_cast<HWND>(lParam));
		return TRUE;
	case WM_NOTIFY:
		return OnNotify(reinterpret_cast<LPNMHDR>(lParam));
	case WM_SIZE:
		if (wParam != SIZE_MINIMIZED)
			ApplyLayout();
		return 0;
	case WM_CTLCOLORSTATIC: {
		// 拖放提示 / 输出规则说明用次级灰，弱化视觉占用，突出重点控件
		const HWND child = reinterpret_cast<HWND>(lParam);
		if (child == GetDlgItem(m_hDlg, IDC_STATIC_DROP) ||
		    child == GetDlgItem(m_hDlg, IDC_STATIC_NOTE)) {
			auto hdc = reinterpret_cast<HDC>(wParam);
			SetTextColor(hdc, RGB(108, 108, 108));
			SetBkMode(hdc, TRANSPARENT);
			return reinterpret_cast<INT_PTR>(GetStockObject(NULL_BRUSH));
		}
		return FALSE;
	}
	case WM_DPICHANGED: {
		const RECT* suggested = reinterpret_cast<const RECT*>(lParam);
		const UINT oldDpi = m_dpi;
		m_dpi = HIWORD(wParam);
		// 先换字体（MapDialogRect 依赖对话框当前字体），再按比例缩放列宽。
		SetupFont(m_dpi);
		InitStatusBar(); // 状态栏自然高度随字体变化
		if (oldDpi != 0 && oldDpi != m_dpi && m_hList) {
			HWND hh = ListView_GetHeader(m_hList);
			if (hh) {
				const int n = Header_GetItemCount(hh);
				for (int i = 0; i < n; ++i) {
					HDITEMW hi{};
					hi.mask = HDI_WIDTH;
					if (Header_GetItem(hh, i, &hi)) {
						hi.cxy = MulDiv(hi.cxy, static_cast<int>(m_dpi), static_cast<int>(oldDpi));
						Header_SetItem(hh, i, &hi);
					}
				}
			}
		}
		SetWindowPos(m_hDlg, nullptr, suggested->left, suggested->top,
		             suggested->right - suggested->left, suggested->bottom - suggested->top,
		             SWP_NOZORDER | SWP_NOACTIVATE);
		ApplyLayout();
		return TRUE;
	}
	case WM_TIMER:
		if (wParam == IDT_TICK)
			OnTick();
		return 0;
	case WM_APP_SCAN_DONE:
		OnScanDone(lParam);
		return 0;
	case WM_APP_FILE_DONE:
		OnFileDone(lParam);
		return 0;
	case WM_APP_FINISHED:
		OnJobFinished(lParam);
		return 0;
	case WM_APP_SCAN_PROGRESS:
		m_scanFound = static_cast<uint32_t>(wParam);
		return 0;
	case WM_CLOSE:
		if (m_engine.IsBusy())
			m_engine.Stop();
		DestroyWindow(m_hDlg);
		return TRUE;
	case WM_DESTROY:
		KillTimer(m_hDlg, IDT_TICK);
		if (m_dropTarget) {
			RevokeDragDrop(m_hDlg);
			delete static_cast<WindowDropTarget*>(m_dropTarget);
			m_dropTarget = nullptr;
		}
		SaveSettings();
		m_hDlg = nullptr;
		PostQuitMessage(0);
		return TRUE;
	default:
		return FALSE;
	}
}

// ------------------------------ 初始化 ------------------------------

void MainWindow::OnInitDialog() {
	m_hList = GetDlgItem(m_hDlg, IDC_LIST_FILES);
	m_hProgress = GetDlgItem(m_hDlg, IDC_PROGRESS);
	m_dpi = GetDpiForWindow(m_hDlg);

	SetupFont(m_dpi);
	InitListColumns();
	InitStatusBar();
	SetAppIcon();

	SendMessageW(static_cast<HWND>(GetDlgItem(m_hDlg, IDC_COMBO_THREADS)), CB_ADDSTRING, 0,
	             reinterpret_cast<LPARAM>(L"自动"));
	for (uint32_t i = 1; i < std::size(kThreadChoices); ++i) {
		std::wstring s = std::format(L"{}", kThreadChoices[i]);
		SendMessageW(static_cast<HWND>(GetDlgItem(m_hDlg, IDC_COMBO_THREADS)), CB_ADDSTRING, 0,
		             reinterpret_cast<LPARAM>(s.c_str()));
	}

	LoadSettings();
	SyncOptionEnable();
	// 按当前 DPI 定稿窗口尺寸并摆放所有控件（确定性布局，无需捕获）。
	FitWindowToDesign();
	ApplyLayout();
	SetRunningUi(false);
	SetStatusText(L"就绪");
	SetStatusPanel(1, L"文件 0/0");
	SetStatusPanel(2, L"-");

	auto* target = new WindowDropTarget(this, m_hDlg);
	if (SUCCEEDED(RegisterDragDrop(m_hDlg, target)))
		m_dropTarget = target;
	else
		delete target;

	SetTimer(m_hDlg, IDT_TICK, kTickMs, nullptr);
}

void MainWindow::SetupFont(UINT dpi) {
	// 用系统标准 UI 字体（Segoe UI 9pt，随 DPI 缩放，并跟随用户在系统里设置的字号）。
	// 注意：.rc 模板 FONT 9 的单位是「磅」，此前误按「9 像素」建字体，界面会小一圈。
	HFONT hFont = nullptr;
	NONCLIENTMETRICSW ncm{};
	ncm.cbSize = sizeof(ncm);
	if (SystemParametersInfoForDpi(SPI_GETNONCLIENTMETRICS, sizeof(ncm), &ncm, 0, dpi))
		hFont = CreateFontIndirectW(&ncm.lfMessageFont);
	if (hFont == nullptr)
		hFont = CreateFontW(-MulDiv(12, static_cast<int>(dpi), 96), 0, 0, 0, FW_REGULAR, FALSE, FALSE, FALSE,
		                    DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
		                    CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
	if (hFont == nullptr)
		return;
	if (m_hFont)
		DeleteObject(m_hFont);
	m_hFont = hFont;
	// 统一给全部子控件换字体（ListView / Progress 默认继承对话框字体，这里显式设置以支持 DPI 变更）
	for (HWND child = GetWindow(m_hDlg, GW_CHILD); child; child = GetWindow(child, GW_HWNDNEXT))
		SendMessageW(child, WM_SETFONT, reinterpret_cast<WPARAM>(m_hFont), TRUE);
}

void MainWindow::InitListColumns() {
	ListView_SetUnicodeFormat(m_hList, TRUE);

	struct { const wchar_t* text; int width; } cols[ColCount] = {
		{ L"文件", 210 }, { L"目录", 260 }, { L"状态", 52 },
		{ L"输入", 76 }, { L"输出", 76 }, { L"耗时", 56 }, { L"说明", 280 },
	};
	LVCOLUMNW c{};
	c.mask = LVCF_TEXT | LVCF_WIDTH | LVCF_SUBITEM;
	for (int i = 0; i < ColCount; ++i) {
		c.iSubItem = i;
		c.pszText = const_cast<LPWSTR>(cols[i].text);
		c.cx = MulDiv(cols[i].width, static_cast<int>(m_dpi), 96);
		ListView_InsertColumn(m_hList, i, &c);
	}
	ListView_SetExtendedListViewStyle(m_hList,
		LVS_EX_FULLROWSELECT | LVS_EX_DOUBLEBUFFER | LVS_EX_HEADERDRAGDROP);
}

// ------------------------------ 布局（模板 DLU 确定性布局） ------------------------------

// 把模板工作区 620x324 DLU 换算成当前 DPI 下的物理尺寸（依赖对话框当前字体）。
// 注意：只含控件工作区，不含底部状态栏（状态栏高度按字体物理像素另算）。
SIZE MainWindow::DesignClient() {
	RECT d{ 0, 0, 620, 324 };
	MapDialogRect(m_hDlg, &d);
	return { d.right, d.bottom };
}

// 按当前 DPI 把窗口外框调整为设计尺寸（工作区 + 状态栏），使初始布局严格等于模板比例。
void MainWindow::FitWindowToDesign() {
	const SIZE design = DesignClient();
	RECT cr{}, wr{};
	GetClientRect(m_hDlg, &cr);
	GetWindowRect(m_hDlg, &wr);
	const int borderX = (wr.right - wr.left) - cr.right;
	const int borderY = (wr.bottom - wr.top) - cr.bottom;
	SetWindowPos(m_hDlg, nullptr, 0, 0, design.cx + borderX, design.cy + m_statusBarHeight + borderY,
	             SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
}

// 完全由「模板 DLU + 当前 DPI + 当前客户区尺寸」计算，不捕获任何运行时几何，
// 因此对 resize / 最大化 / 最小化恢复 / DPI 变更都是幂等的（同一尺寸永远得到同一布局）。
void MainWindow::ApplyLayout() {
	static const LayoutSpec kSpecs[] = {
		// id,                    x,   y,  cx,  cy,  pinR, pinB, strW, strH
		{ IDC_BTN_FILES,           8,   7,  84, 14, false, false, false, false },
		{ IDC_BTN_FOLDER,         96,   7,  66, 14, false, false, false, false },
		{ IDC_BTN_START,         178,   7,  52, 14, false, false, false, false },
		{ IDC_BTN_STOP,          234,   7,  34, 14, false, false, false, false },
		{ IDC_BTN_CLEAR,         272,   7,  46, 14, false, false, false, false },
		{ IDC_BTN_EXPORTFAIL,    458,   7,  72, 14,  true, false, false, false },
		{ IDC_BTN_OPENOUT,       534,   7,  78, 14,  true, false, false, false },
		{ IDC_STATIC_DROP,         8,  26, 604, 10, false, false,  true, false },
		{ IDC_GROUP_OPTIONS,       8,  40, 604, 64, false, false,  true, false },
		{ IDC_CHECK_STRIP,        17,  53, 240, 10, false, false, false, false },
		{ IDC_RADIO_STRIP_EXT,    17,  67, 104, 10, false, false, false, false },
		{ IDC_EDIT_STRIPEXT,     126,  66,  84, 12, false, false, false, false },
		{ IDC_RADIO_STRIP_ALL,   216,  67,  84, 10, false, false, false, false },
		{ IDC_CHECK_RECURSE,      17,  82,  96, 10, false, false, false, false },
		{ IDC_CHECK_SKIPEXIST,   120,  82, 104, 10, false, false, false, false },
		{ IDC_STATIC_PARALLEL,   232,  82,  26,  8, false, false, false, false },
		{ IDC_COMBO_THREADS,     262,  80,  66, 90, false, false, false, false },
		{ IDC_STATIC_NOTE,        17,  95, 588, 10, false, false,  true, false },
		{ IDC_LIST_FILES,          8, 110, 604,200, false, false,  true,  true },
		{ IDC_PROGRESS,            8, 314, 604,  8, false,  true,  true, false },
	};

	const SIZE design = DesignClient();
	RECT cr;
	GetClientRect(m_hDlg, &cr);
	// 状态栏占据底部物理像素，其余控件在剩下的「工作区」内布局。
	const int workBottom = cr.bottom - m_statusBarHeight;

	for (const auto& s : kSpecs) {
		HWND hw = GetDlgItem(m_hDlg, s.id);
		if (hw == nullptr)
			continue;
		RECT r{ s.x, s.y, s.x + s.cx, s.y + s.cy };
		MapDialogRect(m_hDlg, &r);
		int x = r.left;
		int y = r.top;
		int w = r.right - r.left;
		int h = r.bottom - r.top;
		const int rightGap = design.cx - r.right;   // 距右边界留白（已随 DPI 缩放）
		const int bottomGap = design.cy - r.bottom; // 距工作区下边界留白
		if (s.stretchWidth)
			w = cr.right - rightGap - x;
		else if (s.pinRight)
			x = cr.right - rightGap - w;
		if (s.stretchHeight)
			h = workBottom - bottomGap - y;
		else if (s.pinBottom)
			y = workBottom - bottomGap - h;
		MoveWindow(hw, x, y, std::max(0, w), std::max(0, h), TRUE);
	}

	// 状态栏：通底满宽，面板 = [状态文本(拉伸) | 计数 | 速率]
	if (m_hStatusBar) {
		MoveWindow(m_hStatusBar, 0, workBottom, cr.right, m_statusBarHeight, TRUE);
		const int p1 = MulDiv(230, static_cast<int>(m_dpi), 96);
		const int p2 = MulDiv(170, static_cast<int>(m_dpi), 96);
		int parts[3] = { cr.right - p1 - p2, cr.right - p2, -1 };
		SendMessageW(m_hStatusBar, SB_SETPARTS, 3, reinterpret_cast<LPARAM>(parts));
	}
}

// ------------------------------ 状态栏 / 图标 ------------------------------

void MainWindow::InitStatusBar() {
	m_hStatusBar = GetDlgItem(m_hDlg, IDC_STATUSBAR);
	if (m_hStatusBar == nullptr)
		return;
	// 自然高度 = 字体行高 + 上下留白（物理像素，随 DPI）
	HDC hdc = GetDC(m_hDlg);
	HFONT old = static_cast<HFONT>(SelectObject(hdc, m_hFont));
	TEXTMETRICW tm{};
	GetTextMetricsW(hdc, &tm);
	SelectObject(hdc, old);
	ReleaseDC(m_hDlg, hdc);
	m_statusBarHeight = tm.tmHeight + MulDiv(6, static_cast<int>(m_dpi), 96);
}

void MainWindow::SetStatusText(std::wstring_view text) {
	if (m_hStatusBar)
		SendMessageW(m_hStatusBar, SB_SETTEXTW, 0 | SBT_NOBORDERS,
		             reinterpret_cast<LPARAM>(std::wstring(text).c_str()));
}

void MainWindow::SetStatusPanel(int panel, std::wstring_view text) {
	if (m_hStatusBar)
		SendMessageW(m_hStatusBar, SB_SETTEXTW, panel | SBT_NOBORDERS,
		             reinterpret_cast<LPARAM>(std::wstring(text).c_str()));
}

void MainWindow::SetAppIcon() {
	const int cxBig = GetSystemMetrics(SM_CXICON);
	const int cyBig = GetSystemMetrics(SM_CYICON);
	const int cxSmall = GetSystemMetrics(SM_CXSMICON);
	const int cySmall = GetSystemMetrics(SM_CYSMICON);
	if (HICON hBig = static_cast<HICON>(LoadImageW(m_hInst, MAKEINTRESOURCEW(IDI_APP), IMAGE_ICON,
	                                               cxBig, cyBig, LR_SHARED)))
		SendMessageW(m_hDlg, WM_SETICON, ICON_BIG, reinterpret_cast<LPARAM>(hBig));
	if (HICON hSmall = static_cast<HICON>(LoadImageW(m_hInst, MAKEINTRESOURCEW(IDI_APP), IMAGE_ICON,
	                                                 cxSmall, cySmall, LR_SHARED)))
		SendMessageW(m_hDlg, WM_SETICON, ICON_SMALL, reinterpret_cast<LPARAM>(hSmall));
}

// ------------------------------ 选项 ------------------------------

JobOptions MainWindow::CurrentOptions() const {
	JobOptions o;
	o.stripHeader = Button_GetCheck(GetDlgItem(m_hDlg, IDC_CHECK_STRIP)) == BST_CHECKED;
	o.stripAllExtensions = Button_GetCheck(GetDlgItem(m_hDlg, IDC_RADIO_STRIP_ALL)) == BST_CHECKED;
	o.stripExtensions = SplitExtList(GetText(GetDlgItem(m_hDlg, IDC_EDIT_STRIPEXT)));
	o.recursive = Button_GetCheck(GetDlgItem(m_hDlg, IDC_CHECK_RECURSE)) == BST_CHECKED;
	o.skipExisting = Button_GetCheck(GetDlgItem(m_hDlg, IDC_CHECK_SKIPEXIST)) == BST_CHECKED;
	const int idx = static_cast<int>(SendMessageW(GetDlgItem(m_hDlg, IDC_COMBO_THREADS), CB_GETCURSEL, 0, 0));
	o.threadCount = (idx >= 0 && idx < static_cast<int>(std::size(kThreadChoices)))
	                    ? kThreadChoices[idx] : 0u;
	return o;
}

void MainWindow::SyncOptionEnable() {
	const bool strip = Button_GetCheck(GetDlgItem(m_hDlg, IDC_CHECK_STRIP)) == BST_CHECKED;
	const bool byExt = Button_GetCheck(GetDlgItem(m_hDlg, IDC_RADIO_STRIP_EXT)) == BST_CHECKED;
	EnableWindow(GetDlgItem(m_hDlg, IDC_RADIO_STRIP_EXT), strip);
	EnableWindow(GetDlgItem(m_hDlg, IDC_RADIO_STRIP_ALL), strip);
	EnableWindow(GetDlgItem(m_hDlg, IDC_EDIT_STRIPEXT), strip && byExt);
}

void MainWindow::SaveSettings() {
	const std::wstring ini = ExeDirOf(m_hInst) + L"\\UnCacheGui.ini";
	const auto writeInt = [&ini](const wchar_t* key, INT_PTR value) {
		const std::wstring text = std::format(L"{}", value);
		WritePrivateProfileStringW(L"Options", key, text.c_str(), ini.c_str());
	};
	writeInt(L"Strip", Button_GetCheck(GetDlgItem(m_hDlg, IDC_CHECK_STRIP)) ? 1 : 0);
	writeInt(L"Mode", Button_GetCheck(GetDlgItem(m_hDlg, IDC_RADIO_STRIP_ALL)) ? 1 : 0);
	writeInt(L"Recurse", Button_GetCheck(GetDlgItem(m_hDlg, IDC_CHECK_RECURSE)) ? 1 : 0);
	writeInt(L"SkipExist", Button_GetCheck(GetDlgItem(m_hDlg, IDC_CHECK_SKIPEXIST)) ? 1 : 0);
	writeInt(L"Threads", SendMessageW(GetDlgItem(m_hDlg, IDC_COMBO_THREADS), CB_GETCURSEL, 0, 0));
	wchar_t ext[256] = {};
	GetWindowTextW(GetDlgItem(m_hDlg, IDC_EDIT_STRIPEXT), ext, 256);
	WritePrivateProfileStringW(L"Options", L"Ext", ext, ini.c_str());
}

void MainWindow::LoadSettings() {
	const std::wstring ini = ExeDirOf(m_hInst) + L"\\UnCacheGui.ini";
	// 不做“文件不存在即早退”的判断：GetPrivateProfile* 在文件/键缺失时会返回默认值，
	// 这样即使是首次运行也能把控件初始化成合理的默认状态（勾选删头、扩展名列表非空）。
	Button_SetCheck(GetDlgItem(m_hDlg, IDC_CHECK_STRIP), GetPrivateProfileIntW(L"Options", L"Strip", 1, ini.c_str()) ? BST_CHECKED : BST_UNCHECKED);
	Button_SetCheck(GetDlgItem(m_hDlg, IDC_RADIO_STRIP_ALL), GetPrivateProfileIntW(L"Options", L"Mode", 0, ini.c_str()) ? BST_CHECKED : BST_UNCHECKED);
	Button_SetCheck(GetDlgItem(m_hDlg, IDC_RADIO_STRIP_EXT), GetPrivateProfileIntW(L"Options", L"Mode", 0, ini.c_str()) ? BST_UNCHECKED : BST_CHECKED);
	Button_SetCheck(GetDlgItem(m_hDlg, IDC_CHECK_RECURSE), GetPrivateProfileIntW(L"Options", L"Recurse", 1, ini.c_str()) ? BST_CHECKED : BST_UNCHECKED);
	Button_SetCheck(GetDlgItem(m_hDlg, IDC_CHECK_SKIPEXIST), GetPrivateProfileIntW(L"Options", L"SkipExist", 0, ini.c_str()) ? BST_CHECKED : BST_UNCHECKED);
	const int idx = GetPrivateProfileIntW(L"Options", L"Threads", 0, ini.c_str());
	if (idx >= 0 && idx < static_cast<int>(std::size(kThreadChoices)))
		SendMessageW(GetDlgItem(m_hDlg, IDC_COMBO_THREADS), CB_SETCURSEL, idx, 0);
	wchar_t ext[256] = {};
	GetPrivateProfileStringW(L"Options", L"Ext", L"dds;tga", ext, 256, ini.c_str());
	SetWindowTextW(GetDlgItem(m_hDlg, IDC_EDIT_STRIPEXT), ext);
}

void MainWindow::SetRunningUi(bool running) {
	m_running = running;
	EnableWindow(GetDlgItem(m_hDlg, IDC_BTN_START), !running);
	EnableWindow(GetDlgItem(m_hDlg, IDC_BTN_STOP), running);
	EnableWindow(GetDlgItem(m_hDlg, IDC_BTN_CLEAR), !running);
	EnableWindow(GetDlgItem(m_hDlg, IDC_BTN_FILES), !running);
	EnableWindow(GetDlgItem(m_hDlg, IDC_BTN_FOLDER), !running);
	for (const int id : { IDC_CHECK_STRIP, IDC_RADIO_STRIP_EXT, IDC_RADIO_STRIP_ALL, IDC_EDIT_STRIPEXT,
	                      IDC_CHECK_RECURSE, IDC_CHECK_SKIPEXIST, IDC_COMBO_THREADS })
		EnableWindow(GetDlgItem(m_hDlg, id), !running);
}

// ------------------------------ 作业调度 ------------------------------

void MainWindow::StartWithRoots(std::vector<std::wstring>&& roots) {
	if (m_engine.IsBusy()) {
		SetStatusText(L"正在处理中，请先等待或点击停止");
		return;
	}
	m_lastRoots = roots;

	EngineCallbacks cb = MakeCallbacks();

	m_scanning = true;
	m_scanFound = 0;
	m_jobStartMs = GetTickCount64();
	m_lastBytes = 0;
	m_lastTickMs = 0;
	m_speedBytesPerSec = 0.0;
	SetRunningUi(true);
	SendMessageW(m_hProgress, PBM_SETMARQUEE, TRUE, 40);
	SetStatusText(L"扫描目录中…");

	if (!m_engine.StartScan(std::move(roots), CurrentOptions(), std::move(cb))) {
		m_scanning = false;
		SendMessageW(m_hProgress, PBM_SETMARQUEE, FALSE, 0);
		SetRunningUi(false);
		SetStatusText(L"启动失败：引擎正忙");
	}
}

void MainWindow::SubmitPaths(std::vector<std::wstring>&& paths) {
	std::vector<std::wstring> roots;
	roots.reserve(paths.size());
	uint32_t ignored = 0;
	for (auto& p : paths) {
		const DWORD attrs = GetFileAttributesW(p.c_str());
		if (attrs == INVALID_FILE_ATTRIBUTES) {
			++ignored;
			continue;
		}
		if (attrs & FILE_ATTRIBUTE_DIRECTORY)
			roots.push_back(std::move(p));
		else if (EndsWithCI(p, L".cache"))
			roots.push_back(std::move(p));
		else
			++ignored;
	}
	if (roots.empty()) {
		SetStatusText(L"拖入的内容里没有 .cache 文件或文件夹");
		return;
	}
	if (m_engine.IsBusy()) {
		SetStatusText(L"正在处理中，请先等待或点击停止");
		return;
	}
	m_rows.clear();
	m_order.clear();
	m_posOfTask.clear();
	ListView_SetItemCount(m_hList, 0);
	StartWithRoots(std::move(roots));
}

void MainWindow::OnScanDone(LPARAM lParam) {
	auto* tasks = reinterpret_cast<std::vector<TaskEntry>*>(lParam);
	m_scanning = false;
	RebuildList(*tasks);
	const bool empty = tasks->empty();
	delete tasks;
	SendMessageW(m_hProgress, PBM_SETMARQUEE, FALSE, 0);

	if (empty) {
		SetRunningUi(false);
		SetStatusText(L"未发现任何 .cache 文件");
		return;
	}
	SetStatusText(L"解压中…");
	m_engine.Run();
}

void MainWindow::ResetRowsToQueued() {
	for (auto& r : m_rows) {
		r.state = 0;
		r.status = StatusTextOf(0);
		r.detail.clear();
		r.outText.clear();
		r.timeText.clear();
		r.outBytes = 0;
		r.ms = 0;
	}
}

void MainWindow::RebuildList(const std::vector<TaskEntry>& tasks) {
	m_rows.clear();
	m_rows.resize(tasks.size());
	for (size_t i = 0; i < tasks.size(); ++i) {
		Row& r = m_rows[i];
		r.path = tasks[i].path;
		r.inBytes = tasks[i].size;
		const size_t slash = r.path.find_last_of(L"\\/");
		r.name = (slash == std::wstring::npos) ? r.path : r.path.substr(slash + 1);
		r.dir = (slash == std::wstring::npos) ? std::wstring() : r.path.substr(0, slash);
		r.status = StatusTextOf(0);
		r.inText = FmtBytes(r.inBytes);
	}
	m_order.resize(m_rows.size());
	std::iota(m_order.begin(), m_order.end(), 0u);
	m_posOfTask.assign(m_rows.size(), -1);
	for (size_t i = 0; i < m_order.size(); ++i)
		m_posOfTask[m_order[i]] = static_cast<int>(i);

	if (m_sortColumn >= 0)
		SortRows(m_sortColumn, m_sortAscending);

	ListView_SetItemCount(m_hList, static_cast<int>(m_rows.size()));
	ListView_RedrawItems(m_hList, 0, static_cast<int>(m_rows.size()));
	UpdateWindow(m_hList);

	uint64_t total = 0;
	for (const auto& t : tasks)
		total += t.size;
	m_progressTotalMB = static_cast<uint32_t>(std::max<uint64_t>(1, total / (1024ull * 1024)));
	m_progressDoneMB = 0;
	SendMessageW(m_hProgress, PBM_SETRANGE32, 0, static_cast<LPARAM>(m_progressTotalMB));
	SendMessageW(m_hProgress, PBM_SETPOS, 0, 0);
}

// ------------------------------ 回调投递 ------------------------------

EngineCallbacks MainWindow::MakeCallbacks() {
	EngineCallbacks cb;
	const HWND hwnd = m_hDlg;
	cb.onScanProgress = [hwnd](uint32_t found) {
		PostMessageW(hwnd, WM_APP_SCAN_PROGRESS, static_cast<WPARAM>(found), 0);
	};
	cb.onScanned = [hwnd](const std::vector<TaskEntry>& tasks) {
		PostPayload(hwnd, WM_APP_SCAN_DONE, new std::vector<TaskEntry>(tasks));
	};
	cb.onFileDone = [hwnd](const FileResult& r) {
		PostPayload(hwnd, WM_APP_FILE_DONE, new FileResult(r));
	};
	cb.onFinished = [hwnd](const EngineStats& s) {
		PostPayload(hwnd, WM_APP_FINISHED, new EngineStats(s));
	};
	return cb;
}

void MainWindow::RerunFromList() {
	if (m_engine.IsBusy() || m_rows.empty())
		return;
	std::vector<TaskEntry> tasks;
	tasks.reserve(m_rows.size());
	uint64_t total = 0;
	for (const auto& r : m_rows) {
		tasks.push_back({ r.path, r.inBytes });
		total += r.inBytes;
	}
	ResetRowsToQueued();
	m_progressTotalMB = static_cast<uint32_t>(std::max<uint64_t>(1, total / (1024ull * 1024)));
	m_progressDoneMB = 0;
	SendMessageW(m_hProgress, PBM_SETRANGE32, 0, static_cast<LPARAM>(m_progressTotalMB));
	SendMessageW(m_hProgress, PBM_SETPOS, 0, 0);

	m_scanning = false;
	m_scanFound = 0;
	m_jobStartMs = GetTickCount64();
	m_lastBytes = 0;
	m_lastTickMs = 0;
	m_speedBytesPerSec = 0.0;
	SetRunningUi(true);
	RedrawAll();
	SetStatusText(L"解压中…");

	if (!m_engine.StartTasks(std::move(tasks), CurrentOptions(), MakeCallbacks())) {
		SetRunningUi(false);
		SetStatusText(L"启动失败：引擎正忙");
	}
}

// ------------------------------ 命令 ------------------------------

void MainWindow::OnCommand(int id, int code, HWND ctrl) {
	(void)ctrl;
	switch (id) {
	case IDC_BTN_FILES:
		PickFiles();
		return;
	case IDC_BTN_FOLDER:
		PickFolder();
		return;
	case IDC_BTN_START:
		if (m_rows.empty())
			SetStatusText(L"列表为空：请先拖入 .cache 文件或文件夹");
		else
			RerunFromList();
		return;
	case IDC_BTN_STOP:
		if (m_engine.IsBusy()) {
			m_engine.Stop();
			SetStatusText(L"正在停止…");
		}
		return;
	case IDC_BTN_CLEAR:
		if (!m_engine.IsBusy()) {
			m_rows.clear();
			m_order.clear();
			m_posOfTask.clear();
			m_dirty.clear();
			m_lastRoots.clear();
			ListView_SetItemCount(m_hList, 0);
			SendMessageW(m_hProgress, PBM_SETPOS, 0, 0);
			SetStatusPanel(1, L"文件 0/0");
			SetStatusPanel(2, L"-");
			if (HWND h = GetDlgItem(m_hDlg, IDC_STATIC_DROP))
				SetWindowTextW(h, kDefaultHint);
		}
		return;
	case IDC_BTN_EXPORTFAIL:
		WriteFailureLog(true);
		return;
	case IDC_BTN_OPENOUT:
		OpenOutputDir();
		return;
	case IDC_CHECK_STRIP:
	case IDC_RADIO_STRIP_EXT:
	case IDC_RADIO_STRIP_ALL:
		if (code == BN_CLICKED)
			SyncOptionEnable();
		return;
	case IDCANCEL:
		if (m_engine.IsBusy()) {
			m_engine.Stop();
			SetStatusText(L"正在停止…");
		} else {
			DestroyWindow(m_hDlg);
		}
		return;
	default:
		// 其余控件的普通通知（EN_CHANGE / CBN_SELENDOK 等）无需额外处理
		return;
	}
}

void MainWindow::NotifyHover(bool entering) {
	if (m_hDlg == nullptr)
		return;
	if (HWND h = GetDlgItem(m_hDlg, IDC_STATIC_DROP))
		SetWindowTextW(h, entering ? kHoverHint : kDefaultHint);
}

// ------------------------------ 列表通知 ------------------------------

const std::wstring* MainWindow::CellOf(const Row& row, int col) const {
	switch (col) {
	case ColName: return &row.name;
	case ColDir: return &row.dir;
	case ColStatus: return &row.status;
	case ColIn: return &row.inText;
	case ColOut: return &row.outText;
	case ColTime: return &row.timeText;
	default: return &row.detail;
	}
}

LRESULT MainWindow::OnNotify(LPNMHDR nm) {
	if (nm->hwndFrom != m_hList)
		return 0;

	switch (nm->code) {
	case LVN_GETDISPINFOW: {
		auto* di = reinterpret_cast<NMLVDISPINFOW*>(nm);
		const LONG pos = di->item.iItem;
		if (pos < 0 || static_cast<size_t>(pos) >= m_order.size())
			return 0;
		const Row& row = m_rows[m_order[static_cast<size_t>(pos)]];
		if (di->item.mask & LVIF_TEXT) {
			const std::wstring* cell = CellOf(row, di->item.iSubItem);
			if (di->item.pszText != nullptr) {
				const int keep = di->item.cchTextMax > 0 ? di->item.cchTextMax - 1 : 0;
				lstrcpynW(di->item.pszText, cell->c_str(), keep + 1);
			} else {
				di->item.cchTextMax = static_cast<int>(cell->size());
			}
		}
		return 0;
	}
	case LVN_COLUMNCLICK: {
		auto* lvc = reinterpret_cast<NMLISTVIEW*>(nm);
		const int col = lvc->iSubItem;
		if (col < 0 || col >= ColCount)
			return 0;
		m_sortAscending = (col == m_sortColumn) ? !m_sortAscending : true;
		m_sortColumn = col;
		SortRows(col, m_sortAscending);
		UpdateSortIndicator(col, m_sortAscending);
		return 0;
	}
	case NM_CUSTOMDRAW: {
		auto* cd = reinterpret_cast<NMLVCUSTOMDRAW*>(nm);
		switch (cd->nmcd.dwDrawStage) {
		case CDDS_PREPAINT:
			return CDRF_NOTIFYITEMDRAW;
		case CDDS_ITEMPREPAINT: {
			const size_t pos = static_cast<size_t>(cd->nmcd.dwItemSpec);
			if (pos >= m_order.size())
				return CDRF_DODEFAULT;
			// 选中行交给系统画高亮，不破坏主题选中色
			if ((ListView_GetItemState(m_hList, static_cast<int>(cd->nmcd.dwItemSpec), LVIS_SELECTED) & LVIS_SELECTED) != 0)
				return CDRF_DODEFAULT;
			cd->clrTextBk = (pos & 1u) ? RGB(246, 248, 251) : RGB(255, 255, 255); // 斑马纹
			return CDRF_NOTIFYSUBITEMDRAW;
		}
		case CDDS_ITEMPREPAINT | CDDS_SUBITEM: {
			const size_t pos = static_cast<size_t>(cd->nmcd.dwItemSpec);
			if (pos >= m_order.size())
				return CDRF_DODEFAULT;
			const Row& row = m_rows[m_order[pos]];
			const int col = cd->iSubItem;
			COLORREF clr = RGB(22, 22, 22); // 默认正文近黑
			switch (row.state) {
			case 1: // 成功：状态列绿，说明列灰
				if (col == ColStatus) clr = RGB(0, 138, 61);
				else if (col == ColDetail) clr = RGB(108, 108, 108);
				break;
			case 2: // 失败：状态/说明红
				if (col == ColStatus || col == ColDetail) clr = RGB(204, 0, 0);
				break;
			case 3: // 跳过：琥珀色
				if (col == ColStatus || col == ColDetail) clr = RGB(196, 120, 0);
				break;
			case 4: // 取消：灰
				if (col == ColStatus || col == ColDetail) clr = RGB(130, 130, 130);
				break;
			default: // 排队：状态列灰，其余保持正文色
				if (col == ColStatus) clr = RGB(150, 150, 150);
				break;
			}
			cd->clrText = clr;
			return CDRF_NEWFONT;
		}
		default:
			return CDRF_DODEFAULT;
		}
	}
	default:
		return 0;
	}
}

void MainWindow::SortRows(int column, bool ascending) {
	if (m_order.empty())
		return;
	auto less = [this, column](uint32_t a, uint32_t b) {
		const Row& x = m_rows[a];
		const Row& y = m_rows[b];
		switch (column) {
		case ColIn:
			if (x.inBytes != y.inBytes) return x.inBytes < y.inBytes;
			break;
		case ColOut:
			if (x.outBytes != y.outBytes) return x.outBytes < y.outBytes;
			break;
		case ColTime:
			if (x.ms != y.ms) return x.ms < y.ms;
			break;
		case ColStatus:
			if (x.state != y.state) return x.state < y.state;
			break;
		case ColDir:
			return (_wcsicmp(x.dir.c_str(), y.dir.c_str()) < 0) ||
			       (_wcsicmp(x.dir.c_str(), y.dir.c_str()) == 0 && _wcsicmp(x.name.c_str(), y.name.c_str()) < 0);
		default:
			break;
		}
		return _wcsicmp(x.name.c_str(), y.name.c_str()) < 0;
	};

	if (ascending)
		std::stable_sort(m_order.begin(), m_order.end(), less);
	else
		std::stable_sort(m_order.begin(), m_order.end(), [this, &less](uint32_t a, uint32_t b) { return less(b, a); });

	for (size_t i = 0; i < m_order.size(); ++i)
		m_posOfTask[m_order[i]] = static_cast<int>(i);
	m_dirty.clear();
	RedrawAll();
}

void MainWindow::UpdateSortIndicator(int column, bool ascending) {
	HWND hHeader = ListView_GetHeader(m_hList);
	if (hHeader == nullptr)
		return;
	const int count = Header_GetItemCount(hHeader);
	for (int i = 0; i < count; ++i) {
		HDITEMW hi{};
		hi.mask = HDI_FORMAT;
		if (!Header_GetItem(hHeader, i, &hi))
			continue;
		hi.fmt &= ~(HDF_SORTUP | HDF_SORTDOWN);
		if (i == column)
			hi.fmt |= ascending ? HDF_SORTUP : HDF_SORTDOWN;
		Header_SetItem(hHeader, i, &hi);
	}
}

void MainWindow::RedrawDirty() {
	if (m_dirty.empty())
		return;
	uint32_t lo = m_dirty.front(), hi = m_dirty.front();
	for (const uint32_t v : m_dirty) {
		lo = std::min(lo, v);
		hi = std::max(hi, v);
	}
	m_dirty.clear();
	if (hi >= lo)
		ListView_RedrawItems(m_hList, static_cast<int>(lo), static_cast<int>(hi));
}

void MainWindow::RedrawAll() {
	if (m_rows.empty())
		return;
	ListView_RedrawItems(m_hList, 0, static_cast<int>(m_rows.size()) - 1);
}

// ------------------------------ 结果处理 ------------------------------

void MainWindow::OnFileDone(LPARAM lParam) {
	auto* res = reinterpret_cast<FileResult*>(lParam);
	if (res != nullptr) {
		if (res->index < m_posOfTask.size()) {
			const int pos = m_posOfTask[res->index];
			if (pos >= 0 && static_cast<size_t>(pos) < m_order.size()) {
				Row& r = m_rows[m_order[static_cast<size_t>(pos)]];
				switch (res->status) {
				case FileStatus::Success:   r.state = 1; break;
				case FileStatus::Failed:    r.state = 2; break;
				case FileStatus::Skipped:   r.state = 3; break;
				case FileStatus::Cancelled: r.state = 4; break;
				default:                    r.state = 0; break;
				}
				r.status = StatusTextOf(r.state);
				r.inBytes = res->inSize;
				r.outBytes = res->outSize;
				r.ms = res->elapsedMs;
				r.inText = FmtBytes(res->inSize);
				r.outText = (r.state == 1) ? FmtBytes(res->outSize) : std::wstring(L"—");
				r.timeText = (r.state == 1 || r.state == 2) ? FmtMs(res->elapsedMs) : std::wstring(L"—");
				r.detail = res->message;
				m_dirty.push_back(static_cast<uint32_t>(pos));
			}
		}
		delete res;
	}
}

void MainWindow::OnJobFinished(LPARAM lParam) {
	auto* stats = reinterpret_cast<EngineStats*>(lParam);
	if (stats == nullptr)
		return;
	const EngineStats s = *stats;
	delete stats;

	SetRunningUi(false);
	m_scanning = false;

	// 停止后残留的排队行统一标为取消
	const uint32_t cancelled = s.totalFiles > s.doneFiles ? s.totalFiles - s.doneFiles : 0u;
	if (cancelled > 0) {
		for (auto& r : m_rows) {
			if (r.state == 0) {
				r.state = 4;
				r.status = StatusTextOf(4);
			}
		}
		m_dirty.clear();
		RedrawAll();
	}

	m_progressDoneMB = m_progressTotalMB;
	SendMessageW(m_hProgress, PBM_SETPOS, static_cast<WPARAM>(m_progressDoneMB), 0);
	UpdateCounters(s);

	const double seconds = (GetTickCount64() - m_jobStartMs) / 1000.0;
	std::wstring text = std::format(L"完成：成功 {} · 失败 {} · 跳过 {} · 取消 {} · 共 {} 个 · 用时 {:.1f}s",
	                                s.success, s.failed, s.skipped, cancelled, s.totalFiles, seconds);
	m_statusSuffix.clear();
	if (s.failed > 0) {
		WriteFailureLog(false);
		text += m_statusSuffix;
	}
	SetStatusText(text.c_str());
	SetStatusPanel(2, L"-");
}

// ------------------------------ 定时刷新 ------------------------------

void MainWindow::OnTick() {
	if (m_scanning) {
		const std::wstring t = std::format(L"扫描目录中… 已发现 {} 个 .cache", m_scanFound);
		SetStatusText(t.c_str());
		return;
	}
	if (!m_running)
		return;

	const EngineStats s = m_engine.Snapshot();
	const uint32_t doneMB = static_cast<uint32_t>(s.doneBytes / (1024ull * 1024));
	if (doneMB != m_progressDoneMB) {
		m_progressDoneMB = std::min(doneMB, m_progressTotalMB);
		SendMessageW(m_hProgress, PBM_SETPOS, static_cast<WPARAM>(m_progressDoneMB), 0);
	}

	// 速率指数平滑，避免抖动
	const ULONGLONG now = GetTickCount64();
	if (m_lastTickMs == 0)
		m_lastTickMs = now;
	const ULONGLONG dt = now - m_lastTickMs;
	if (dt >= 240) {
		const uint64_t delta = s.doneBytes > m_lastBytes ? s.doneBytes - m_lastBytes : 0;
		const double inst = static_cast<double>(delta) * 1000.0 / static_cast<double>(dt);
		m_speedBytesPerSec = (m_speedBytesPerSec <= 1.0) ? inst : m_speedBytesPerSec * 0.6 + inst * 0.4;
		m_lastBytes = s.doneBytes;
		m_lastTickMs = now;
	}

	UpdateCounters(s);

	const double mbps = m_speedBytesPerSec / (1024.0 * 1024.0);
	const uint64_t remain = s.totalBytes > s.doneBytes ? s.totalBytes - s.doneBytes : 0;
	std::wstring speedText;
	if (m_speedBytesPerSec > 1.0)
		speedText = std::format(L"{:.1f} MB/s · 剩余 {}", mbps, FmtBytes(remain));
	else
		speedText = std::format(L"处理中 · 剩余 {}", FmtBytes(remain));
	SetStatusPanel(2, speedText);

	RedrawDirty();
}

void MainWindow::UpdateCounters(const EngineStats& s) {
	const std::wstring text = std::format(L"文件 {}/{} · 成功 {} · 失败 {} · 跳过 {}",
	                                      s.doneFiles, s.totalFiles, s.success, s.failed, s.skipped);
	SetStatusPanel(1, text);
}

// ------------------------------ 失败清单 ------------------------------

void MainWindow::WriteFailureLog(bool manual) {
	std::wstring body;
	uint32_t n = 0;
	for (const auto& r : m_rows) {
		if (r.state != 2)
			continue;
		++n;
		body += r.path;
		body += L"\r\n";
		if (!r.detail.empty())
			body += std::format(L"    {}\r\n", r.detail);
	}

	if (n == 0) {
		if (manual)
			MessageBoxW(m_hDlg, L"当前没有失败项。", L"UnCache GUI", MB_OK | MB_ICONINFORMATION);
		return;
	}

	SYSTEMTIME st{};
	GetLocalTime(&st);
	std::wstring text = std::format(L"UnCache GUI 失败清单　共 {} 项　时间 {:04d}-{:02d}-{:02d} {:02d}:{:02d}:{:02d}\r\n\r\n",
	                                n, st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond);
	text += body;

	const std::wstring path = ExeDirOf(m_hInst) + L"\\失败.log";
	const std::string utf8 = Utf8FromWide(text);
	HANDLE h = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
	if (h != INVALID_HANDLE_VALUE) {
		static const char kBom[3] = { static_cast<char>(0xEF), static_cast<char>(0xBB), static_cast<char>(0xBF) };
		DWORD written = 0;
		WriteFile(h, kBom, 3, &written, nullptr);
		WriteFile(h, utf8.data(), static_cast<DWORD>(utf8.size()), &written, nullptr);
		CloseHandle(h);
		m_statusSuffix = std::format(L"　失败清单已写入 {}", path);
	} else {
		m_statusSuffix = L"　失败清单写入失败";
	}

	if (manual)
		MessageBoxW(m_hDlg, path.c_str(), L"失败清单已导出", MB_OK | MB_ICONINFORMATION);
}

// ------------------------------ 文件对话框 ------------------------------

void MainWindow::PickFiles() {
	IFileOpenDialog* dlg = nullptr;
	if (FAILED(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_INPROC_SERVER,
	                            IID_PPV_ARGS(&dlg))))
		return;

	DWORD opts = 0;
	dlg->GetOptions(&opts);
	dlg->SetOptions(opts | FOS_ALLOWMULTISELECT | FOS_FILEMUSTEXIST | FOS_PATHMUSTEXIST);
	const COMDLG_FILTERSPEC filters[] = {
		{ L"cache 文件 (*.cache)", L"*.cache" },
		{ L"所有文件 (*.*)", L"*.*" },
	};
	dlg->SetFileTypes(2, filters);
	dlg->SetFileTypeIndex(1);
	dlg->SetTitle(L"选择 .cache 文件");

	if (SUCCEEDED(dlg->Show(m_hDlg))) {
		IShellItemArray* items = nullptr;
		if (SUCCEEDED(dlg->GetResults(&items)) && items) {
			std::vector<std::wstring> paths;
			PathsFromShellItems(items, paths);
			items->Release();
			if (!paths.empty())
				SubmitPaths(std::move(paths));
		}
	}
	dlg->Release();
}

void MainWindow::PickFolder() {
	IFileOpenDialog* dlg = nullptr;
	if (FAILED(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_INPROC_SERVER,
	                            IID_PPV_ARGS(&dlg))))
		return;

	DWORD opts = 0;
	dlg->GetOptions(&opts);
	dlg->SetOptions(opts | FOS_PICKFOLDERS | FOS_PATHMUSTEXIST);
	dlg->SetTitle(L"选择包含 .cache 的文件夹");

	if (SUCCEEDED(dlg->Show(m_hDlg))) {
		IShellItem* item = nullptr;
		if (SUCCEEDED(dlg->GetResult(&item)) && item) {
			LPWSTR raw = nullptr;
			if (SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &raw)) && raw) {
				std::vector<std::wstring> paths;
				paths.emplace_back(raw);
				CoTaskMemFree(raw);
				item->Release();
				SubmitPaths(std::move(paths));
				dlg->Release();
				return;
			}
			item->Release();
		}
	}
	dlg->Release();
}

void MainWindow::OpenOutputDir() {
	std::wstring dir;
	for (const auto& r : m_rows) {
		if (r.state == 1 && !r.dir.empty()) {
			dir = r.dir;
			break;
		}
	}
	if (dir.empty()) {
		for (const auto& r : m_rows) {
			if (!r.dir.empty()) {
				dir = r.dir;
				break;
			}
		}
	}
	if (dir.empty()) {
		SetStatusText(L"还没有可打开的输出目录");
		return;
	}
	if (reinterpret_cast<INT_PTR>(ShellExecuteW(m_hDlg, L"open", dir.c_str(), nullptr, nullptr, SW_SHOW)) <= 33)
		SetStatusText(L"无法打开目录");
}
