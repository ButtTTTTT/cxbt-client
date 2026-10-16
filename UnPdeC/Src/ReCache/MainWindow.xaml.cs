using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.Win32;
using ReCache.Models;
using ReCache.Services;

namespace ReCache;

/// <summary>
/// ReCache - .cache File Packer
/// </summary>
public partial class MainWindow : Window {
    private bool _isProcessing;
    private bool _isUpdatingRootPath;
    
    // 取消令牌源
    private CancellationTokenSource? _cancellationTokenSource;
    
    // 资源根目录路径（用于计算 CRC32）
    private string? _rootPath;
    
    // 根目录历史记录
    private static readonly string _rootPathHistoryFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "ReCache", "root_history.txt");
    
    // 原始 .cache 文件路径（可选）
    private string? _sourceCachePath;
    
    // 从原始 .cache 文件解压出的前 8 字节
    private byte[]? _originalFirst8Bytes;
    
    // 要处理的文件路径
    private string? _inputFilePath;
    
    // 输出目录（可选，默认为输入文件同目录）
    private string? _outputDirectory;

    // 日志相关
    private static readonly string _logPath = Path.Combine(Path.GetTempPath(), "ReCache_Main.log");
    private static readonly object _logLock = new();

    private static void Log(string message) {
        lock (_logLock) {
            string timestamp = DateTime.Now.ToString("HH:mm:ss.fff");
            string logMessage = $"[{timestamp}] {message}";
            Debug.WriteLine(logMessage);
            File.AppendAllText(_logPath, logMessage + "\n");
        }
    }

    public MainWindow() {
        File.WriteAllText(_logPath, $"=== ReCache Session Started at {DateTime.Now} ===\n");
        Log("MainWindow: 初始化");
        
        InitializeComponent();
        LoadRootPathHistory();
        UpdateUI();
        Log("MainWindow: 初始化完成");
    }

    #region 拖放处理

    private void Window_DragOver(object sender, DragEventArgs e) {
        if (_isProcessing) {
            e.Effects = DragDropEffects.None;
            e.Handled = true;
            return;
        }

        if (e.Data.GetDataPresent(DataFormats.FileDrop)) {
            e.Effects = DragDropEffects.Copy;
        } else {
            e.Effects = DragDropEffects.None;
        }
        e.Handled = true;
    }

    private void Window_Drop(object sender, DragEventArgs e) {
        if (_isProcessing) return;

        if (e.Data.GetDataPresent(DataFormats.FileDrop)) {
            var paths = (string[])e.Data.GetData(DataFormats.FileDrop);
            if (paths.Length > 0) {
                var path = paths[0];
                
                // 判断类型
                if (Directory.Exists(path)) {
                    // 目录 -> 设置为资源根目录
                    SetRootPath(path);
                } else if (File.Exists(path)) {
                    if (path.EndsWith(".cache", StringComparison.OrdinalIgnoreCase)) {
                        // .cache 文件 -> 设置为原始 .cache 文件
                        SetSourceCache(path);
                    } else {
                        // 其他文件 -> 设置为要处理的文件
                        SetInputFile(path);
                    }
                }
            }
        }
    }

    #endregion

    #region 文件选择

    private void RootPath_Click(object sender, RoutedEventArgs e) {
        if (_isProcessing) return;

        var dialog = new OpenFolderDialog {
            Title = "选择缓存根目录"
        };

        if (dialog.ShowDialog() == true) {
            SetRootPath(dialog.FolderName);
        }
    }

    private void RootPathCombo_SelectionChanged(object sender, SelectionChangedEventArgs e) {
        if (_isUpdatingRootPath) return;
        if (RootPathCombo.SelectedItem is string selectedPath && !string.IsNullOrEmpty(selectedPath)) {
            SetRootPath(selectedPath);
        }
    }

    private void RootPathCombo_KeyDown(object sender, System.Windows.Input.KeyEventArgs e) {
        if (e.Key == System.Windows.Input.Key.Enter) {
            string path = RootPathCombo.Text?.Trim() ?? "";
            if (!string.IsNullOrEmpty(path)) {
                SetRootPath(path);
            }
            e.Handled = true;
        }
    }

    private void ClearRootPath_Click(object sender, RoutedEventArgs e) {
        _rootPath = null;
        RootPathCombo.Text = "";
        RootPathCombo.SelectedItem = null;
        ResetCrcDisplay();
        Log("ClearRootPath: 清除资源根目录");
        UpdateUI();
    }

    private void ClearInputFile_Click(object sender, RoutedEventArgs e) {
        _inputFilePath = null;
        DropZoneText.Text = "拖放或点击选择文件";
        InputFileName.Text = "-";
        InputFileSize.Text = "-";
        OutputFileName.Text = "-";
        OutputFileSize.Text = "-";
        InputFirst8BytesText.Text = "-";
        InputFirst8BytesText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E65100"));
        Input8BytesBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E0E0E0"));
        Input8BytesBorder.Background = Brushes.Transparent;
        Log("ClearInputFile: 清除待压缩文件");
        UpdateUI();
    }

    private void SourceCache_Click(object sender, RoutedEventArgs e) {
        if (_isProcessing) return;

        var dialog = new OpenFileDialog {
            Title = "选择原始 .cache 文件",
            Filter = "缓存文件 (*.cache)|*.cache|所有文件 (*.*)|*.*"
        };

        if (dialog.ShowDialog() == true) {
            SetSourceCache(dialog.FileName);
        }
    }

    private void ClearSourceCache_Click(object sender, RoutedEventArgs e) {
        _sourceCachePath = null;
        _originalFirst8Bytes = null;
        SourceCacheText.Text = "点击选择 .cache";
        First8BytesText.Text = "-";
        First8BytesText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0066CC"));
        InputFirst8BytesText.Text = "-";
        InputFirst8BytesText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E65100"));
        Prepend8BytesCheckBox.IsChecked = true;
        ResetCrcDisplay();
        ResetHeaderCheckDisplay();
        Log("ClearSourceCache: 清除原始 .cache 文件");
        UpdateUI();
    }

    private void DropZone_Click(object sender, RoutedEventArgs e) {
        if (_isProcessing) return;

        var dialog = new OpenFileDialog {
            Title = "选择要压缩的文件",
            Filter = "所有文件 (*.*)|*.*"
        };

        if (dialog.ShowDialog() == true) {
            SetInputFile(dialog.FileName);
        }
    }

    private void SetRootPath(string path) {
        if (!Directory.Exists(path)) return;
        
        _rootPath = path;
        _isUpdatingRootPath = true;
        RootPathCombo.Text = path;
        _isUpdatingRootPath = false;
        AddRootPathToHistory(path);
        Log($"SetRootPath: 设置资源根目录 = {path}");
        
        // 如果已经有原始 .cache 文件，自动验证
        if (!string.IsNullOrEmpty(_sourceCachePath)) {
            VerifyCrc();
        }
        
        UpdateUI();
    }

    private void SetSourceCache(string path) {
        if (!File.Exists(path)) return;
        
        _sourceCachePath = path;
        SourceCacheText.Text = Path.GetFileName(path);
        Log($"SetSourceCache: 设置原始 .cache 文件 = {path}");
        
        // 尝试解压前 8 字节
        try {
            byte[] cacheData = File.ReadAllBytes(path);
            _originalFirst8Bytes = Services.Decompressor.ExtractFirst8Bytes(cacheData);
            
            if (_originalFirst8Bytes != null) {
                First8BytesText.Text = Services.Decompressor.FormatHex(_originalFirst8Bytes);
                Log($"SetSourceCache: 解压前8字节 = {Services.Decompressor.FormatHex(_originalFirst8Bytes)}");
            } else {
                First8BytesText.Text = "(无法解压)";
                First8BytesText.Foreground = Brushes.Red;
                Log("SetSourceCache: 无法解压前8字节");
            }
        } catch (Exception ex) {
            _originalFirst8Bytes = null;
            First8BytesText.Text = $"(错误: {ex.Message})";
            First8BytesText.Foreground = Brushes.Red;
            Log($"SetSourceCache: 解压前8字节失败 - {ex.Message}");
        }
        
        // 如果已经有待压缩文件，检查头部是否匹配
        if (!string.IsNullOrEmpty(_inputFilePath) && _originalFirst8Bytes != null) {
            CheckInputFileHeader();
        }
        
        // 如果已经设置了根目录，自动验证
        if (!string.IsNullOrEmpty(_rootPath)) {
            VerifyCrc();
        }
        
        UpdateUI();
    }

    private void SetInputFile(string path) {
        if (!File.Exists(path)) return;
        
        // 过滤不符合要求的文件
        if (!IsValidInputFile(path)) {
            string fileName = Path.GetFileName(path);
            Log($"SetInputFile: 拒绝文件 {fileName} - 不符合过滤规则");
            MessageBox.Show(
                $"无法使用此文件作为输入:\n\n{fileName}\n\n" +
                "以下文件类型不被允许:\n" +
                "• .cache 文件\n" +
                "• .luac 文件\n" +
                "• 双后缀文件 (如 xxx.dds.cache, xxx.luac.lua)",
                "无效的文件类型",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            return;
        }
        
        _inputFilePath = path;
        var fileInfo = new FileInfo(path);
        
        InputFileName.Text = Path.GetFileName(path);
        InputFileSize.Text = FormatFileSize(fileInfo.Length);
        
        // 预计算输出文件名
        string outputPath = GetOutputPath(path);
        OutputFileName.Text = Path.GetFileName(outputPath);
        OutputFileSize.Text = "-";
        
        DropZoneText.Text = Path.GetFileName(path);
        
        Log($"SetInputFile: 设置输入文件 = {path}, 大小 = {fileInfo.Length} bytes");
        
        // 展示待压缩文件前8字节
        try {
            byte[] inputFileData = File.ReadAllBytes(path);
            if (inputFileData.Length >= 8) {
                byte[] inputFirst8 = inputFileData[..8];
                InputFirst8BytesText.Text = Services.Decompressor.FormatHex(inputFirst8);
                Log($"SetInputFile: 待压缩文件前8字节 = {Services.Decompressor.FormatHex(inputFirst8)}");
            } else if (inputFileData.Length > 0) {
                InputFirst8BytesText.Text = Services.Decompressor.FormatHex(inputFileData) + " (不足8字节)";
                InputFirst8BytesText.Foreground = Brushes.Orange;
            } else {
                InputFirst8BytesText.Text = "(空文件)";
                InputFirst8BytesText.Foreground = Brushes.Red;
            }
        } catch (Exception ex) {
            InputFirst8BytesText.Text = $"(读取失败)";
            InputFirst8BytesText.Foreground = Brushes.Red;
            Log($"SetInputFile: 读取前8字节失败 - {ex.Message}");
        }
        
        // 如果已经有原始8字节头，检查待压缩文件头部是否匹配
        if (_originalFirst8Bytes != null) {
            CheckInputFileHeader();
        }
        
        UpdateUI();
    }
    
    /// <summary>
    /// 检查文件是否符合输入要求
    /// 过滤规则：
    /// 1. 不能是 .cache 文件
    /// 2. 不能是 .luac 文件
    /// 3. 不能有双后缀（如 xxx.dds.cache, xxx.luac.lua）
    /// </summary>
    private bool IsValidInputFile(string path) {
        string extension = Path.GetExtension(path).ToLowerInvariant();
        
        // 规则1: 不能是 .cache 文件
        if (extension == ".cache") {
            return false;
        }
        
        // 规则2: 不能是 .luac 文件
        if (extension == ".luac") {
            return false;
        }
        
        // 规则3: 不能有双后缀
        string fileNameWithoutExt = Path.GetFileNameWithoutExtension(path);
        string secondExtension = Path.GetExtension(fileNameWithoutExt).ToLowerInvariant();
        if (!string.IsNullOrEmpty(secondExtension)) {
            return false;
        }
        
        return true;
    }

    #endregion

    #region CRC 验证

    private void VerifyCrc() {
        if (string.IsNullOrEmpty(_sourceCachePath) || string.IsNullOrEmpty(_rootPath)) {
            ResetCrcDisplay();
            return;
        }

        try {
            // 读取文件头中存储的 CRC（大端序，偏移 0x10）
            byte[] header = new byte[0x14];
            using (var fs = new FileStream(_sourceCachePath, FileMode.Open, FileAccess.Read)) {
                fs.Read(header, 0, header.Length);
            }
            
            // 读取大端序 CRC
            uint storedCrc = ((uint)header[0x10] << 24) | 
                             ((uint)header[0x11] << 16) | 
                             ((uint)header[0x12] << 8) | 
                             (uint)header[0x13];
            
            // 计算新的 CRC
            uint calculatedCrc = CrcCalculator.CalculateCacheCrc(_sourceCachePath, _rootPath);
            
            // 显示结果
            StoredCrcText.Text = $"0x{storedCrc:X8}";
            CalculatedCrcText.Text = $"0x{calculatedCrc:X8}";
            
            if (storedCrc == calculatedCrc) {
                StoredCrcText.Foreground = Brushes.Green;
                CalculatedCrcText.Foreground = Brushes.Green;
                CrcResultPanel.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#4CAF50"));
                CrcResultPanel.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E8F5E9"));
                StatusText.Text = "CRC 校验: 通过 ✓";
                StatusText.Foreground = Brushes.Green;
            } else {
                StoredCrcText.Foreground = Brushes.Red;
                CalculatedCrcText.Foreground = Brushes.Red;
                CrcResultPanel.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FFC107"));
                CrcResultPanel.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FFF8E1"));
                StatusText.Text = "CRC 校验: 不匹配 ✗";
                StatusText.Foreground = Brushes.Red;
            }
            
            Log($"VerifyCrc: 存储CRC = 0x{storedCrc:X8}, 计算CRC = 0x{calculatedCrc:X8}, 匹配 = {storedCrc == calculatedCrc}");
        }
        catch (Exception ex) {
            Log($"VerifyCrc: 验证失败 - {ex.Message}");
            StatusText.Text = $"CRC 校验失败: {ex.Message}";
            StatusText.Foreground = Brushes.Red;
            ResetCrcDisplay();
        }
    }

    private void ResetCrcDisplay() {
        StoredCrcText.Text = "-";
        CalculatedCrcText.Text = "-";
        StoredCrcText.Foreground = Brushes.Gray;
        CalculatedCrcText.Foreground = Brushes.Gray;
        CrcResultPanel.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E0E0E0"));
        CrcResultPanel.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FAFAFA"));
        First8BytesText.Text = "-";
        First8BytesText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0066CC"));
        InputFirst8BytesText.Text = "-";
        InputFirst8BytesText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E65100"));
        Cache8BytesBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E0E0E0"));
        Cache8BytesBorder.Background = Brushes.Transparent;
        Input8BytesBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E0E0E0"));
        Input8BytesBorder.Background = Brushes.Transparent;
    }

    /// <summary>
    /// 检查待压缩文件的头部是否包含原始8字节
    /// 默认勾选"包含8字节头"：
    /// - 一致时，打包不插入（即使勾选也不会重复插入）
    /// - 不一致时，打包需要插入8字节头（勾选时才插入）
    /// </summary>
    private void CheckInputFileHeader() {
        if (_originalFirst8Bytes == null || string.IsNullOrEmpty(_inputFilePath)) {
            Prepend8BytesCheckBox.IsChecked = true;
            return;
        }

        try {
            byte[] inputFileData = File.ReadAllBytes(_inputFilePath);
            
            if (inputFileData.Length < 8) {
                // 文件太小，不可能包含8字节头
                Prepend8BytesCheckBox.IsChecked = true;
                Set8BytesBorderState(false);
                StatusText.Text = "待压缩文件太小，需要添加8字节头";
                StatusText.Foreground = Brushes.Orange;
                Log("CheckInputFileHeader: 文件太小，需要添加8字节头");
                return;
            }

            // 检查待压缩文件的前8字节是否与原始8字节匹配
            bool headerMatches = true;
            for (int i = 0; i < 8; i++) {
                if (inputFileData[i] != _originalFirst8Bytes[i]) {
                    headerMatches = false;
                    break;
                }
            }

            Set8BytesBorderState(headerMatches);

            if (headerMatches) {
                // 头部已包含8字节，勾选与否不影响（不会重复插入）
                Prepend8BytesCheckBox.IsChecked = true;
                StatusText.Text = "8字节头一致 ✓ (打包时不会重复插入)";
                StatusText.Foreground = Brushes.Green;
                Log("CheckInputFileHeader: 文件头部已包含8字节");
            } else {
                // 头部不包含8字节，勾选则插入
                Prepend8BytesCheckBox.IsChecked = true;
                string inputHex = Services.Decompressor.FormatHex(inputFileData[..8]);
                string originalHex = Services.Decompressor.FormatHex(_originalFirst8Bytes);
                StatusText.Text = "8字节头不一致 ✗ (勾选则插入8字节头)";
                StatusText.Foreground = Brushes.Orange;
                Log($"CheckInputFileHeader: 文件头部不匹配 - 文件头=[{inputHex}], 原始头=[{originalHex}]");
                
                MessageBox.Show(
                    $"待压缩文件的头部与原始8字节头不一致!\n\n" +
                    $"待压缩文件前8字节: {inputHex}\n" +
                    $"原始8字节头:       {originalHex}\n\n" +
                    $"\"包含8字节头\"已勾选，打包时将在文件数据前插入原始8字节。\n" +
                    $"如果不需要插入，请取消勾选。",
                    "头部不匹配",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
            }
        } catch (Exception ex) {
            Log($"CheckInputFileHeader: 检查失败 - {ex.Message}");
        }
    }

    /// <summary>
    /// 设置8字节面板的边框和背景颜色
    /// </summary>
    private void Set8BytesBorderState(bool matches) {
        if (matches) {
            // 绿色：一致
            Cache8BytesBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#4CAF50"));
            Cache8BytesBorder.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E8F5E9"));
            Input8BytesBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#4CAF50"));
            Input8BytesBorder.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E8F5E9"));
        } else {
            // 黄色：不一致
            Cache8BytesBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FFC107"));
            Cache8BytesBorder.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FFF8E1"));
            Input8BytesBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FFC107"));
            Input8BytesBorder.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FFF8E1"));
        }
    }

    /// <summary>
    /// 重置头部检查显示
    /// </summary>
    private void ResetHeaderCheckDisplay() {
        Prepend8BytesCheckBox.IsChecked = true;
        InputFirst8BytesText.Text = "-";
        InputFirst8BytesText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E65100"));
        Cache8BytesBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E0E0E0"));
        Cache8BytesBorder.Background = Brushes.Transparent;
        Input8BytesBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E0E0E0"));
        Input8BytesBorder.Background = Brushes.Transparent;
    }

    #endregion

    #region 打包处理

    private async void Pack_Click(object sender, RoutedEventArgs e) {
        if (string.IsNullOrEmpty(_inputFilePath) || _isProcessing)
            return;

        // 检查目录是否匹配
        if (!string.IsNullOrEmpty(_sourceCachePath)) {
            string? inputDir = Path.GetDirectoryName(_inputFilePath);
            string? sourceDir = Path.GetDirectoryName(_sourceCachePath);
            
            if (!string.Equals(inputDir, sourceDir, StringComparison.OrdinalIgnoreCase)) {
                var result = MessageBox.Show(
                    $"警告: 输入文件与原始缓存文件不在同一目录!\n\n" +
                    $"输入文件目录:\n{inputDir}\n\n" +
                    $"原始缓存文件目录:\n{sourceDir}\n\n" +
                    $"这可能导致 CRC32 不正确。是否继续?",
                    "目录不匹配警告",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Warning);
                
                if (result != MessageBoxResult.Yes) {
                    Log("Pack_Click: 用户取消操作（目录不匹配）");
                    return;
                }
            }
        }

        Log($"Pack_Click: 开始打包");
        
        _isProcessing = true;
        _cancellationTokenSource = new CancellationTokenSource();
        
        // 更新UI状态
        ProgressBar.Visibility = Visibility.Visible;
        ProgressBar.Value = 0;
        ProgressBar.IsIndeterminate = false;
        StatusText.Text = "准备中...";
        StatusText.Foreground = Brushes.Gray;
        PackButton.Content = "取消";
        PackButton.IsEnabled = true;
        IsEnabled = false;
        PackButton.IsEnabled = true; // 保持取消按钮可用

        var options = GetPackOptions();
        Log($"Pack_Click: 压缩模式 = {options.CompressionMode}, 添加扩展名 = {options.AddCacheExtension}");
        
        if (!string.IsNullOrEmpty(_rootPath)) {
            Log($"Pack_Click: 使用资源根目录 = {_rootPath}");
            options.RootPath = _rootPath;
        }
        
        if (!string.IsNullOrEmpty(_sourceCachePath)) {
            Log($"Pack_Click: 使用原始 .cache 文件 = {_sourceCachePath}");
            options.OriginalCachePath = _sourceCachePath;
        }

        var stopwatch = Stopwatch.StartNew();

        try {
            string outputPath = GetOutputPath(_inputFilePath);
            Log($"Pack_Click: 输出路径 = {outputPath}");
            
            // 进度报告回调
            var progress = new Progress<PackProgress>(p => {
                Dispatcher.Invoke(() => {
                    ProgressBar.Value = p.Percent;
                    StatusText.Text = $"{p.Stage} ({p.Percent}%)";
                });
            });
            
            IProgress<PackProgress> progressInterface = progress;
            
            long outputSize = await Task.Run(() => CachePacker.Pack(
                _inputFilePath, outputPath, options, 
                progressInterface.Report, 
                _cancellationTokenSource.Token), 
                _cancellationTokenSource.Token);
            
            stopwatch.Stop();
            Log($"Pack_Click: 压缩完成, 输出大小 = {outputSize} bytes, 耗时 = {stopwatch.ElapsedMilliseconds} ms");
            
            // 更新输出信息
            OutputFileSize.Text = FormatFileSize(outputSize);
            
            StatusText.Text = $"成功! {FormatFileSize(new FileInfo(_inputFilePath).Length)} → {FormatFileSize(outputSize)}";
            StatusText.Foreground = Brushes.Green;
            
            MessageBox.Show($"文件打包成功!\n\n输入: {FormatFileSize(new FileInfo(_inputFilePath).Length)}\n输出: {FormatFileSize(outputSize)}\n耗时: {stopwatch.ElapsedMilliseconds} 毫秒",
                "成功", MessageBoxButton.OK, MessageBoxImage.Information);
                
        } catch (OperationCanceledException) {
            stopwatch.Stop();
            Log($"Pack_Click: 用户取消操作");
            StatusText.Text = "已取消";
            StatusText.Foreground = Brushes.Orange;
            MessageBox.Show("用户取消了操作。", "已取消", MessageBoxButton.OK, MessageBoxImage.Information);
        } catch (Exception ex) {
            stopwatch.Stop();
            Log($"Pack_Click: 压缩失败 - {ex.Message}\n{ex.StackTrace}");
            
            StatusText.Text = $"错误: {ex.Message}";
            StatusText.Foreground = Brushes.Red;
            
            MessageBox.Show($"打包失败: {ex.Message}", "错误",
                MessageBoxButton.OK, MessageBoxImage.Error);
        } finally {
            _isProcessing = false;
            _cancellationTokenSource?.Dispose();
            _cancellationTokenSource = null;
            ProgressBar.Visibility = Visibility.Collapsed;
            ProgressBar.Value = 0;
            PackButton.Content = "打包";
            IsEnabled = true;
            UpdateUI();
            Log($"Pack_Click: 日志文件位置: {_logPath}");
        }
    }
    
    private void CancelButton_Click(object sender, RoutedEventArgs e) {
        if (_isProcessing && _cancellationTokenSource != null) {
            Log("CancelButton_Click: 用户请求取消");
            _cancellationTokenSource.Cancel();
        }
    }

    private PackOptions GetPackOptions() {
        return new PackOptions {
            CompressionMode = (CompressionMode)CompressionModeCombo.SelectedIndex,
            AddCacheExtension = AddCacheExtensionCheckBox.IsChecked == true,
            FileTypeIdentifier = 0xFFFFFFFF,
            Crc32 = 0xFFFFFFFF,
            OriginalFirst8Bytes = _originalFirst8Bytes,
            PrependFirst8Bytes = Prepend8BytesCheckBox.IsChecked == true
        };
    }

    private string GetOutputPath(string inputPath) {
        // 使用自定义输出目录或输入文件所在目录
        string directory = !string.IsNullOrEmpty(_outputDirectory) && Directory.Exists(_outputDirectory) 
            ? _outputDirectory 
            : Path.GetDirectoryName(inputPath) ?? "";
        string fileName = Path.GetFileNameWithoutExtension(inputPath);
        bool addExtension = AddCacheExtensionCheckBox.IsChecked == true;

        if (addExtension) {
            return Path.Combine(directory, fileName + Path.GetExtension(inputPath) + ".cache");
        } else {
            return Path.Combine(directory, fileName + ".cache");
        }
    }

    #endregion

    #region UI 更新

    private void UpdateUI() {
        // 必须设置根目录才能打包（否则无法计算 CRC32）
        bool canPack = !string.IsNullOrEmpty(_inputFilePath) && 
                       !string.IsNullOrEmpty(_rootPath) && 
                       !_isProcessing;
        PackButton.IsEnabled = canPack;
    }

    private static string FormatFileSize(long bytes) {
        string[] units = ["B", "KB", "MB", "GB"];
        double size = bytes;
        int unitIndex = 0;

        while (size >= 1024 && unitIndex < units.Length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return $"{size:F2} {units[unitIndex]}";
    }

    #endregion

    #region 输出目录选择

    private void OutputDir_Click(object sender, RoutedEventArgs e) {
        if (_isProcessing) return;
        
        var dialog = new OpenFolderDialog {
            Title = "选择输出目录"
        };
        
        if (dialog.ShowDialog() == true) {
            SetOutputDirectory(dialog.FolderName);
        }
    }

    private void OpenOutputDir_Click(object sender, RoutedEventArgs e) {
        string? path = _outputDirectory;
        if (string.IsNullOrEmpty(path) && !string.IsNullOrEmpty(_inputFilePath)) {
            path = Path.GetDirectoryName(_inputFilePath);
        }
        
        if (!string.IsNullOrEmpty(path) && Directory.Exists(path)) {
            try {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo {
                    FileName = path,
                    UseShellExecute = true,
                    Verb = "open"
                });
            } catch (Exception ex) {
                Log($"OpenOutputDir_Click: 打开目录失败 - {ex.Message}");
            }
        }
    }

    private void ClearOutputDir_Click(object sender, RoutedEventArgs e) {
        _outputDirectory = null;
        OutputDirText.Text = "点击选择输出目录 (可选)";
        Log("ClearOutputDir: 清除输出目录");
        
        // 更新输出文件名预览
        if (!string.IsNullOrEmpty(_inputFilePath)) {
            string outputPath = GetOutputPath(_inputFilePath);
            OutputFileName.Text = Path.GetFileName(outputPath);
        }
    }

    private void SetOutputDirectory(string path) {
        if (!Directory.Exists(path)) return;
        
        _outputDirectory = path;
        OutputDirText.Text = path;
        Log($"SetOutputDirectory: 设置输出目录 = {path}");
        
        // 更新输出文件名预览
        if (!string.IsNullOrEmpty(_inputFilePath)) {
            string outputPath = GetOutputPath(_inputFilePath);
            OutputFileName.Text = Path.GetFileName(outputPath);
        }
    }

    #endregion

    #region 根目录历史记录

    /// <summary>
    /// 加载根目录历史记录到 ComboBox
    /// </summary>
    private void LoadRootPathHistory() {
        try {
            if (File.Exists(_rootPathHistoryFile)) {
                var lines = File.ReadAllLines(_rootPathHistoryFile)
                    .Where(l => !string.IsNullOrWhiteSpace(l) && Directory.Exists(l))
                    .Distinct()
                    .Take(20);
                foreach (var line in lines) {
                    RootPathCombo.Items.Add(line);
                }
            }
        } catch (Exception ex) {
            Log($"LoadRootPathHistory: 加载失败 - {ex.Message}");
        }
    }

    /// <summary>
    /// 将根目录添加到历史记录
    /// </summary>
    private void AddRootPathToHistory(string path) {
        try {
            // 确保目录存在
            var dir = Path.GetDirectoryName(_rootPathHistoryFile);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) {
                Directory.CreateDirectory(dir);
            }

            // 读取现有历史
            var existing = new List<string>();
            if (File.Exists(_rootPathHistoryFile)) {
                existing = File.ReadAllLines(_rootPathHistoryFile).ToList();
            }

            // 移除重复项并插入到最前面
            existing.RemoveAll(l => string.Equals(l, path, StringComparison.OrdinalIgnoreCase));
            existing.Insert(0, path);

            // 最多保留20条
            if (existing.Count > 20) {
                existing = existing.Take(20).ToList();
            }

            File.WriteAllLines(_rootPathHistoryFile, existing);

            // 更新 ComboBox
            _isUpdatingRootPath = true;
            RootPathCombo.Items.Remove(path);
            RootPathCombo.Items.Insert(0, path);
            RootPathCombo.SelectedItem = path;
            _isUpdatingRootPath = false;
        } catch (Exception ex) {
            Log($"AddRootPathToHistory: 保存失败 - {ex.Message}");
        }
    }

    #endregion
}
