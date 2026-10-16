// MainWindow.h
// 主窗口：纯 Win32 对话框（资源模板 IDD_MAIN）+ OwnerData ListView + 拖放 + 定时刷新。

#pragma once

#include <windows.h>
#include <cstdint>
#include <string>
#include <vector>

#include "JobEngine.h"

class MainWindow {
public:
	explicit MainWindow(HINSTANCE hInst);
	~MainWindow();

	bool Create(int nCmdShow);
	HWND Handle() const { return m_hDlg; }

	// 拖放落点（Ole 回调在 UI 线程上，可直接调用）：立即开始扫描 + 解压
	void SubmitPaths(std::vector<std::wstring>&& paths);

	// 拖拽悬停提示（同样在 UI 线程）
	void NotifyHover(bool entering);

private:
	// OwnerData 行模型：所有显示文本在结果到达时一次性格式化，绘制阶段零换算
	struct Row {
		std::wstring path;
		std::wstring name;
		std::wstring dir;
		std::wstring status;
		std::wstring detail;
		std::wstring inText;
		std::wstring outText;
		std::wstring timeText;
		uint64_t inBytes = 0;
		uint64_t outBytes = 0;
		uint64_t ms = 0;
		int state = 0; // 0 排队 1 成功 2 失败 3 跳过 4 取消
	};

	// 以模板 DLU 为基准的确定性布局：ApplyLayout 每次只用「当前 DPI + 当前客户区尺寸」
	// 重新计算控件位置，天然幂等，不受最小化/恢复/重绘时序影响。
	struct LayoutSpec {
		int id;
		int x, y, cx, cy;   // 模板 DLU
		bool pinRight;
		bool pinBottom;
		bool stretchWidth;
		bool stretchHeight;
	};

	static INT_PTR CALLBACK DlgProc(HWND hDlg, UINT msg, WPARAM wParam, LPARAM lParam);
	INT_PTR OnMessage(UINT msg, WPARAM wParam, LPARAM lParam);

	void OnInitDialog();
	void OnCommand(int id, int code, HWND ctrl);
	LRESULT OnNotify(LPNMHDR nm);
	void OnTick();
	void OnScanDone(LPARAM lParam);
	void OnFileDone(LPARAM lParam);
	void OnJobFinished(LPARAM lParam);

	void SetupFont(UINT dpi);
	void SetAppIcon();
	void InitListColumns();
	void InitStatusBar();
	void SyncOptionEnable();
	SIZE DesignClient();                        // 工作区 620x324 DLU 对应的物理尺寸（当前 DPI，不含状态栏）
	void FitWindowToDesign();                   // 按当前 DPI 把窗口外框设为设计尺寸 + 状态栏高度
	void SetStatusText(std::wstring_view text);      // 状态栏面板 0（左侧拉伸）
	void SetStatusPanel(int panel, std::wstring_view text); // 状态栏固定面板 1/2

	JobOptions CurrentOptions() const;
	EngineCallbacks MakeCallbacks();
	void RerunFromList();
	void SetRunningUi(bool running);
	void RebuildList(const std::vector<TaskEntry>& tasks);
	void ResetRowsToQueued();
	void ApplyLayout();
	void UpdateCounters(const EngineStats& stats);
	void UpdateSortIndicator(int column, bool ascending);
	void RedrawDirty();
	void RedrawAll();
	void WriteFailureLog(bool manual);
	void SaveSettings();
	void LoadSettings();
	void PickFiles();
	void PickFolder();
	void OpenOutputDir();
	void StartWithRoots(std::vector<std::wstring>&& roots);

	const std::wstring* CellOf(const Row& row, int col) const;
	void SortRows(int column, bool ascending);

	HINSTANCE m_hInst = nullptr;
	HWND m_hDlg = nullptr;
	HWND m_hList = nullptr;
	HWND m_hProgress = nullptr;
	HWND m_hStatusBar = nullptr;
	int m_statusBarHeight = 20;             // 物理像素，按字体/DPI 计算
	HFONT m_hFont = nullptr;
	UINT m_dpi = 96;

	std::vector<Row> m_rows;
	std::vector<uint32_t> m_order;      // 显示位置 -> m_rows 下标
	std::vector<int> m_posOfTask;       // 任务下标 -> 显示位置（-1 表示无效）
	std::vector<uint32_t> m_dirty;      // 本 tick 需要重绘的显示位置
	std::vector<std::wstring> m_lastRoots;
	std::wstring m_statusSuffix; // 上一次作业附加到状态栏的文案（如失败清单路径）

	JobEngine m_engine;
	void* m_dropTarget = nullptr; // WindowDropTarget*，生命周期跟随窗口
	bool m_running = false;
	int m_sortColumn = -1;
	bool m_sortAscending = true;

	// 速率统计
	uint64_t m_lastBytes = 0;
	ULONGLONG m_lastTickMs = 0;
	double m_speedBytesPerSec = 0.0;
	ULONGLONG m_jobStartMs = 0;

	uint32_t m_progressTotalMB = 1;
	uint32_t m_progressDoneMB = 0;
	bool m_scanning = false;
	uint32_t m_scanFound = 0;
};
