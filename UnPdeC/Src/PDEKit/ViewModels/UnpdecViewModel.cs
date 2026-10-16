using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Input;
using PDEKit.Services;

namespace PDEKit.ViewModels;

/// <summary>
/// PDE 解包功能的 ViewModel
/// </summary>
public class UnpdecViewModel : INotifyPropertyChanged
{
    private string _inputPath = "";
    private string _statusText = "就绪";
    private double _progressValue;
    private bool _isProcessing;
    private string _currentFile = "";
    private UnpdecService.ExtractModeEnum _extractMode = UnpdecService.ExtractModeEnum.Mixed;

    public string InputPath
    {
        get => _inputPath;
        set { _inputPath = value; OnPropertyChanged(); }
    }

    public string StatusText
    {
        get => _statusText;
        set { _statusText = value; OnPropertyChanged(); }
    }

    public double ProgressValue
    {
        get => _progressValue;
        set { _progressValue = value; OnPropertyChanged(); }
    }

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

    public string CurrentFile
    {
        get => _currentFile;
        set { _currentFile = value; OnPropertyChanged(); }
    }

    /// <summary>解包模式</summary>
    public UnpdecService.ExtractModeEnum ExtractMode
    {
        get => _extractMode;
        set { _extractMode = value; OnPropertyChanged(); }
    }

    public ObservableCollection<string> Logs { get; } = [];

    public ICommand StartCommand { get; }
    public ICommand BrowseFileCommand { get; }

    public UnpdecViewModel()
    {
        StartCommand = new RelayCommand(ExecuteStart, CanExecuteStart);
        BrowseFileCommand = new RelayCommand(ExecuteBrowseFile);
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

        AddLog($"[UnPdeC] 开始解包: {InputPath}");

        try
        {
            // 输出目录与输入文件同目录
            string outputDir = Path.GetDirectoryName(InputPath) ?? "";
            bool success = await UnpdecService.UnpackAsync(
                InputPath, outputDir, ExtractMode, info =>
                {
                    Application.Current.Dispatcher.Invoke(() =>
                    {
                        if (info.ErrorMessage != null)
                        {
                            AddLog($"[错误] {info.CurrentFile}: {info.ErrorMessage}");
                        }

                        CurrentFile = info.CurrentFile;
                        StatusText = info.Phase;

                        if (info.TotalFiles > 0)
                        {
                            ProgressValue = (double)info.ProcessedFiles / info.TotalFiles * 100;
                        }

                        if (info.IsCompleted)
                        {
                            StatusText = info.ErrorMessage != null ? "解包失败" : "解包完成";
                            ProgressValue = info.ErrorMessage != null ? ProgressValue : 100;
                            AddLog(info.ErrorMessage != null
                                ? $"[失败] {info.ErrorMessage}"
                                : $"[完成] 共处理 {info.ProcessedFiles} 个文件");
                        }
                    });
                });

            if (!success)
            {
                StatusText = "解包失败";
            }
        }
        catch (Exception ex)
        {
            StatusText = "解包出错";
            AddLog($"[错误] {ex.Message}");
        }
        finally
        {
            IsProcessing = false;
        }
    }

    private void ExecuteBrowseFile()
    {
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Title = "选择 XOR 文件",
            Filter = "XOR 文件 (*.xor)|*.xor|所有文件 (*.*)|*.*",
            Multiselect = false
        };

        if (dialog.ShowDialog() == true)
        {
            InputPath = dialog.FileName;
        }
    }

    public void HandleDrop(string[] droppedPaths)
    {
        if (droppedPaths.Length > 0)
            InputPath = droppedPaths[0];
    }

    private void AddLog(string message)
    {
        var timestamp = DateTime.Now.ToString("HH:mm:ss");
        Logs.Add($"[{timestamp}] {message}");
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
}
