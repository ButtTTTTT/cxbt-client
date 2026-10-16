using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Input;
using PDEKit.Services;

namespace PDEKit.ViewModels;

/// <summary>
/// XOR 解密功能的 ViewModel
/// </summary>
public class XorViewModel : INotifyPropertyChanged
{
    private byte[]? _pdeKey;
    private string _inputPath = "";
    private string _statusText = "就绪";
    private double _progressValue;
    private bool _isProcessing;
    private string _currentFile = "";
    private string _progressDetail = "";

    /// <summary>PDEKEY 密钥表（延迟生成）</summary>
    private byte[] PdeKey => _pdeKey ??= FastXorService.GeneratePdeKey();

    /// <summary>输入路径（文件或目录）</summary>
    public string InputPath
    {
        get => _inputPath;
        set { _inputPath = value; OnPropertyChanged(); }
    }

    /// <summary>状态文本</summary>
    public string StatusText
    {
        get => _statusText;
        set { _statusText = value; OnPropertyChanged(); }
    }

    /// <summary>进度值 (0-100)</summary>
    public double ProgressValue
    {
        get => _progressValue;
        set { _progressValue = value; OnPropertyChanged(); }
    }

    /// <summary>是否正在处理</summary>
    public bool IsProcessing
    {
        get => _isProcessing;
        set
        {
            _isProcessing = value;
            OnPropertyChanged();
            CommandManager.InvalidateRequerySuggested();
        }
    }

    /// <summary>当前处理的文件名</summary>
    public string CurrentFile
    {
        get => _currentFile;
        set { _currentFile = value; OnPropertyChanged(); }
    }

    /// <summary>进度详情（如 "3.5 MB / 12.8 MB"）</summary>
    public string ProgressDetail
    {
        get => _progressDetail;
        set { _progressDetail = value; OnPropertyChanged(); }
    }

    /// <summary>日志输出集合</summary>
    public ObservableCollection<string> Logs { get; } = [];

    /// <summary>开始执行 XOR 解密命令</summary>
    public ICommand StartCommand { get; }

    /// <summary>浏览文件命令</summary>
    public ICommand BrowseFileCommand { get; }

    /// <summary>浏览目录命令</summary>
    public ICommand BrowseFolderCommand { get; }

    public XorViewModel()
    {
        StartCommand = new RelayCommand(ExecuteStart, CanExecuteStart);
        BrowseFileCommand = new RelayCommand(ExecuteBrowseFile);
        BrowseFolderCommand = new RelayCommand(ExecuteBrowseFolder);
    }

    private bool CanExecuteStart() => !IsProcessing && !string.IsNullOrWhiteSpace(InputPath);

    private async void ExecuteStart()
    {
        if (IsProcessing || string.IsNullOrWhiteSpace(InputPath))
            return;

        IsProcessing = true;
        ProgressValue = 0;
        StatusText = "正在处理...";
        Logs.Clear();

        AddLog($"[FastXOR] 开始处理: {InputPath}");

        try
        {
            if (File.Exists(InputPath))
            {
                await ProcessSingleFileAsync(InputPath);
            }
            else if (Directory.Exists(InputPath))
            {
                await ProcessDirectoryAsync(InputPath);
            }
            else
            {
                StatusText = "路径不存在";
                AddLog($"[错误] 路径不存在: {InputPath}");
            }
        }
        catch (Exception ex)
        {
            StatusText = "处理出错";
            AddLog($"[错误] {ex.Message}");
        }
        finally
        {
            IsProcessing = false;
        }
    }

    private async Task ProcessSingleFileAsync(string filePath)
    {
        AddLog($"[处理] {Path.GetFileName(filePath)}");

        var result = await Task.Run(() =>
        {
            return FastXorService.ProcessFile(filePath, PdeKey, info =>
            {
                Application.Current.Dispatcher.Invoke(() =>
                {
                    ProgressValue = info.ProgressPercent;
                    CurrentFile = info.CurrentFile;
                    ProgressDetail = FormatSize(info.BytesProcessed) + " / " + FormatSize(info.TotalBytes);

                    if (info.ErrorMessage != null)
                    {
                        AddLog($"[错误] {info.CurrentFile}: {info.ErrorMessage}");
                    }
                });
            });
        });

        if (result != null)
        {
            StatusText = "处理完成";
            ProgressValue = 100;
            AddLog($"[完成] 输出: {Path.GetFileName(result)}");
        }
        else
        {
            StatusText = "处理失败";
        }
    }

    private async Task ProcessDirectoryAsync(string dirPath)
    {
        AddLog($"[目录] 递归处理: {dirPath}");

        var count = await FastXorService.ProcessDirectoryAsync(dirPath, PdeKey, info =>
        {
            Application.Current.Dispatcher.Invoke(() =>
            {
                ProgressValue = info.ProgressPercent;
                CurrentFile = info.CurrentFile;
                ProgressDetail = $"({info.FilesProcessed}/{info.TotalFiles} 文件) {FormatSize(info.BytesProcessed)} / {FormatSize(info.TotalBytes)}";

                if (info.ErrorMessage != null)
                {
                    AddLog($"[错误] {info.CurrentFile}: {info.ErrorMessage}");
                }

                if (info.IsCompleted)
                {
                    StatusText = $"处理完成 ({info.FilesProcessed} 个文件)";
                    ProgressValue = 100;
                }
            });
        });

        if (count > 0)
        {
            AddLog($"[完成] 共处理 {count} 个文件");
        }
        else
        {
            StatusText = "没有文件需要处理";
            AddLog("[信息] 没有找到需要处理的文件");
        }
    }

    private void ExecuteBrowseFile()
    {
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Title = "选择 PDE 文件",
            Filter = "PDE 文件 (*.pde)|*.pde|所有文件 (*.*)|*.*",
            Multiselect = false
        };

        if (dialog.ShowDialog() == true)
        {
            InputPath = dialog.FileName;
        }
    }

    private void ExecuteBrowseFolder()
    {
        // 使用 Windows Shell COM API 打开文件夹选择对话框（无需 WinForms 引用）
        var dialog = new FolderPicker
        {
            Title = "选择包含 PDE 文件的目录"
        };

        if (dialog.ShowDialog() == true)
        {
            InputPath = dialog.ResultPath;
        }
    }

    /// <summary>
    /// 处理拖放的路径
    /// </summary>
    public void HandleDrop(string[] droppedPaths)
    {
        if (droppedPaths.Length > 0)
        {
            InputPath = droppedPaths[0];
        }
    }

    private void AddLog(string message)
    {
        var timestamp = DateTime.Now.ToString("HH:mm:ss");
        Logs.Add($"[{timestamp}] {message}");
    }

    private static string FormatSize(long bytes)
    {
        string[] units = ["B", "KB", "MB", "GB", "TB"];
        int unitIndex = 0;
        double size = bytes;

        while (size >= 1024 && unitIndex < 4)
        {
            size /= 1024;
            unitIndex++;
        }

        return $"{size:F2} {units[unitIndex]}";
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}

/// <summary>
/// 通用命令实现
/// </summary>
public class RelayCommand : ICommand
{
    private readonly Action _execute;
    private readonly Func<bool>? _canExecute;

    public RelayCommand(Action execute, Func<bool>? canExecute = null)
    {
        _execute = execute;
        _canExecute = canExecute;
    }

    public bool CanExecute(object? parameter) => _canExecute?.Invoke() ?? true;

    public void Execute(object? parameter) => _execute();

    public event EventHandler? CanExecuteChanged
    {
        add => CommandManager.RequerySuggested += value;
        remove => CommandManager.RequerySuggested -= value;
    }
}
