using System.Collections.ObjectModel;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Input;
using Microsoft.Win32;
using PDEView.Models;
using PDEView.Services;

namespace PDEView.ViewModels;

public class MainViewModel : BaseViewModel {
    private PDEEntry? _rootEntry;
    private PDEEntry? _selectedEntry;
    private List<PDEEntry> _selectedEntries = [];
    private PDEEntry? _currentDirectory;
    private ObservableCollection<PDEEntry> _currentDirectoryEntries = [];
    private string _cacheHexContent = string.Empty;
    private string _lz77HexContent = string.Empty;
    private string _textContent = string.Empty;
    private string _statusMessage = "就绪";
    private bool _isLoading;
    private string _currentFilePath = string.Empty;
    private PDEWriter? _writer;
    private DirectoryLoader? _directoryLoader;
    private bool _isDirectoryMode;

    private List<PDEEntry> _navigationHistory = [];
    private int _navigationIndex = -1;

    private ExtractMode _currentExtractMode = ExtractMode.NoExtract;

    public PDEEntry? RootEntry {
        get => _rootEntry;
        set {
            _rootEntry = value;
            _currentDirectory = value;
            UpdateCurrentDirectoryEntries();
            OnPropertyChanged();
            OnPropertyChanged(nameof(HasFile));
            OnPropertyChanged(nameof(BreadcrumbPath));
            CommandManager.InvalidateRequerySuggested();
        }
    }

    public PDEEntry? CurrentDirectory {
        get => _currentDirectory;
        set {
            _currentDirectory = value;
            UpdateCurrentDirectoryEntries();
            OnPropertyChanged();
            OnPropertyChanged(nameof(BreadcrumbPath));
        }
    }

    public ObservableCollection<PDEEntry> CurrentDirectoryEntries => _currentDirectoryEntries;

    private void UpdateCurrentDirectoryEntries() {
        _currentDirectoryEntries.Clear();
        if (_currentDirectory != null) {
            var sortedEntries = _currentDirectory.Children
                .OrderBy(e => e.IsFile)
                .ThenBy(e => e.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();

            foreach (var child in sortedEntries) {
                _currentDirectoryEntries.Add(child);
            }
        }
    }

    public ObservableCollection<BreadcrumbItem> BreadcrumbPath {
        get {
            var path = new ObservableCollection<BreadcrumbItem>();
            if (_currentDirectory == null || _rootEntry == null)
                return path;

            var current = _currentDirectory;
            while (current != null && current != _rootEntry) {
                path.Insert(0, new BreadcrumbItem(current, this));
                current = current.Parent;
            }
            return path;
        }
    }

    public PDEEntry? SelectedEntry {
        get => _selectedEntry;
        set {
            _selectedEntry = value;
            OnPropertyChanged();
            LoadHexPreview();
            CommandManager.InvalidateRequerySuggested();
        }
    }

    public List<PDEEntry> SelectedEntries {
        get => _selectedEntries;
        set => _selectedEntries = value ?? [];
    }

    public ExtractMode CurrentExtractMode {
        get => _currentExtractMode;
        set {
            _currentExtractMode = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(CurrentExtractModeText));
        }
    }

    public string CurrentExtractModeText {
        get {
            return _currentExtractMode switch {
                ExtractMode.NoExtract => "[不二次解压]",
                ExtractMode.RemoveFirst8Bytes => "[移除 8 字节]",
                ExtractMode.KeepFirst8Bytes => "[保留 8 字节]",
                ExtractMode.Mixed => "[混合模式]",
                _ => "[未知]"
            };
        }
    }

    public string CacheHexContent {
        get => _cacheHexContent;
        set {
            _cacheHexContent = value;
            OnPropertyChanged();
        }
    }

    public string LZ77HexContent {
        get => _lz77HexContent;
        set {
            _lz77HexContent = value;
            OnPropertyChanged();
        }
    }

    public string TextContent {
        get => _textContent;
        set {
            _textContent = value;
            OnPropertyChanged();
        }
    }

    private void LoadHexPreview() {
        if (_selectedEntry == null || !_selectedEntry.IsFile) {
            CacheHexContent = string.Empty;
            LZ77HexContent = string.Empty;
            TextContent = string.Empty;
            return;
        }

        try {
            byte[] rawData;
            
            if (_isDirectoryMode && _directoryLoader != null) {
                rawData = _directoryLoader.ReadFile(_selectedEntry);
            }
            else if (_writer != null) {
                rawData = _writer.ExtractFile(_selectedEntry);
            }
            else {
                CacheHexContent = "无可用数据源";
                LZ77HexContent = "无可用数据源";
                TextContent = "无可用数据源";
                return;
            }
            
            bool isCacheFile = Decompressor.IsCacheFile(_selectedEntry.Name);

            int cachePreviewSize = Math.Min(rawData.Length, 0x1000);
            CacheHexContent = FormatHexDump(rawData, cachePreviewSize);

            if (isCacheFile) {
                byte[] decompressedData = Decompressor.PreExtract(rawData, _selectedEntry.Name, ExtractMode.KeepFirst8Bytes);
                int lz77PreviewSize = Math.Min(decompressedData.Length, 4096);
                LZ77HexContent = FormatHexDump(decompressedData, lz77PreviewSize);
                UpdateTextContent(decompressedData, lz77PreviewSize);
            } else {
                LZ77HexContent = "[非 .cache 文件，无需 LZ77 解压]";
                UpdateTextContent(rawData, cachePreviewSize);
            }
        } catch {
            CacheHexContent = "无法读取文件内容";
            LZ77HexContent = "无法读取文件内容";
            TextContent = "无法解码文本内容";
        }
    }

    private void UpdateTextContent(byte[] data, int length) {
        try {
            TextContent = Encoding.UTF8.GetString(data, 0, Math.Min(length, data.Length));
        } catch {
            TextContent = "无法解码文本内容";
        }
    }

    public bool CanGoBack => _navigationIndex > 0;
    public bool CanGoForward => _navigationIndex < _navigationHistory.Count - 1;
    public bool CanGoUp => _currentDirectory != null && _currentDirectory.Parent != null;

    private static string FormatHexDump(byte[] data, int length) {
        var sb = new StringBuilder();

        for (int i = 0; i < length; i += 16) {
            sb.Append($"{i:X8}  ");

            for (int j = 0; j < 16; j++) {
                if (j == 8) sb.Append(" ");

                if (i + j < length) {
                    sb.Append($"{data[i + j]:X2} ");
                } else {
                    sb.Append("   ");
                }
            }

            sb.Append(" |");
            for (int j = 0; j < 16 && i + j < length; j++) {
                byte b = data[i + j];
                sb.Append(b >= 32 && b < 127 ? (char)b : '.');
            }
            sb.AppendLine("|");
        }

        return sb.ToString();
    }

    public string StatusMessage {
        get => _statusMessage;
        set {
            _statusMessage = value;
            OnPropertyChanged();
        }
    }

    public bool IsLoading {
        get => _isLoading;
        set {
            _isLoading = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsNotLoading));
        }
    }

    public bool IsNotLoading => !IsLoading;
    public bool HasFile => RootEntry != null;
    public bool IsDirectoryMode => _isDirectoryMode;

    public string CurrentFilePath {
        get => _currentFilePath;
        set {
            _currentFilePath = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(FileName));
        }
    }

    public string FileName => Path.GetFileName(CurrentFilePath);

    public RelayCommand OpenCommand { get; }
    public RelayCommand CloseCommand { get; }
    public RelayCommand ExportCommand { get; }
    public RelayCommand ExportAllCommand { get; }
    public RelayCommand ExportWithOptionsCommand { get; }
    public RelayCommand RefreshCommand { get; }
    public RelayCommand NavigateToRootCommand { get; }
    public RelayCommand GoBackCommand { get; }
    public RelayCommand GoForwardCommand { get; }
    public RelayCommand GoUpCommand { get; }

    public MainViewModel() {
        OpenCommand = new RelayCommand(OpenFile, () => IsNotLoading);
        CloseCommand = new RelayCommand(CloseFile, () => HasFile);
        ExportCommand = new RelayCommand(ExportSelected, () => SelectedEntry != null);
        ExportAllCommand = new RelayCommand(ExportAll, () => HasFile);
        ExportWithOptionsCommand = new RelayCommand(ShowExportOptions);
        RefreshCommand = new RelayCommand(Refresh, () => HasFile && IsNotLoading);
        NavigateToRootCommand = new RelayCommand(NavigateToRoot, () => HasFile);
        GoBackCommand = new RelayCommand(GoBack, () => CanGoBack);
        GoForwardCommand = new RelayCommand(GoForward, () => CanGoForward);
        GoUpCommand = new RelayCommand(GoUp, () => CanGoUp);
    }

    public void GoBack() {
        if (_navigationIndex > 0) {
            _navigationIndex--;
            var dir = _navigationHistory[_navigationIndex];

            if (!_isDirectoryMode && _writer != null && !PDEWriter.IsDirectoryLoaded(dir)) {
                StatusMessage = $"加载目录: {dir.Name}...";
                _writer.LoadDirectory(dir);
            }

            _currentDirectory = dir;
            UpdateCurrentDirectoryEntries();
            OnPropertyChanged(nameof(CurrentDirectory));
            OnPropertyChanged(nameof(BreadcrumbPath));
            OnPropertyChanged(nameof(CanGoBack));
            OnPropertyChanged(nameof(CanGoForward));
            OnPropertyChanged(nameof(CanGoUp));
            SelectedEntry = null;
            StatusMessage = $"当前: {dir.Name}（{dir.Children.Count} 项）";
        }
    }

    public void GoForward() {
        if (_navigationIndex < _navigationHistory.Count - 1) {
            _navigationIndex++;
            var dir = _navigationHistory[_navigationIndex];

            if (!_isDirectoryMode && _writer != null && !PDEWriter.IsDirectoryLoaded(dir)) {
                StatusMessage = $"加载目录: {dir.Name}...";
                _writer.LoadDirectory(dir);
            }

            _currentDirectory = dir;
            UpdateCurrentDirectoryEntries();
            OnPropertyChanged(nameof(CurrentDirectory));
            OnPropertyChanged(nameof(BreadcrumbPath));
            OnPropertyChanged(nameof(CanGoBack));
            OnPropertyChanged(nameof(CanGoForward));
            OnPropertyChanged(nameof(CanGoUp));
            SelectedEntry = null;
            StatusMessage = $"当前: {dir.Name}（{dir.Children.Count} 项）";
        }
    }

    public void GoUp() {
        if (_currentDirectory?.Parent != null) {
            NavigateToDirectory(_currentDirectory.Parent);
        }
    }

    public void NavigateToRoot() {
        if (RootEntry != null) {
            NavigateToDirectory(RootEntry);
        }
    }

    public void NavigateToDirectory(PDEEntry directory) {
        if (directory != null && directory.IsDirectory) {
            if (!_isDirectoryMode && _writer != null && !PDEWriter.IsDirectoryLoaded(directory)) {
                StatusMessage = $"加载目录: {directory.Name}...";
                _writer.LoadDirectory(directory);
            }

            if (_navigationIndex < _navigationHistory.Count - 1) {
                _navigationHistory = _navigationHistory.Take(_navigationIndex + 1).ToList();
            }
            _navigationHistory.Add(directory);
            _navigationIndex = _navigationHistory.Count - 1;

            CurrentDirectory = directory;
            SelectedEntry = null;
            StatusMessage = $"当前: {directory.Name}（{directory.Children.Count} 项）";

            OnPropertyChanged(nameof(CanGoBack));
            OnPropertyChanged(nameof(CanGoForward));
            OnPropertyChanged(nameof(CanGoUp));
        }
    }

    private async void OpenFile() {
        var openMenu = new System.Windows.Controls.ContextMenu();
        
        var openFileItem = new System.Windows.Controls.MenuItem { Header = "打开 PDE/XOR 文件..." };
        var openDirItem = new System.Windows.Controls.MenuItem { Header = "打开目录（.cache）..." };
        
        openMenu.Items.Add(openFileItem);
        openMenu.Items.Add(openDirItem);
        
        openFileItem.Click += async (s, e) => {
            var dialog = new OpenFileDialog {
                Filter = "PDE 文件 (*.pde)|*.pde|XOR 文件 (*.xor)|*.xor|所有文件 (*.*)|*.*",
                Title = "打开 PDE 文件"
            };

            if (dialog.ShowDialog() == true) {
                await LoadFileAsync(dialog.FileName);
            }
        };
        
        openDirItem.Click += async (s, e) => {
            var folderDialog = new OpenFolderDialog {
                Title = "选择包含 .cache 文件的目录"
            };

            if (folderDialog.ShowDialog() == true) {
                await LoadDirectoryAsync(folderDialog.FolderName);
            }
        };
        
        openMenu.IsOpen = true;
    }

    private async Task LoadDirectoryAsync(string directoryPath) {
        IsLoading = true;
        StatusMessage = "扫描目录中...";

        try {
            _isDirectoryMode = true;
            _currentExtractMode = ExtractMode.KeepFirst8Bytes;
            OnPropertyChanged(nameof(CurrentExtractMode));
            OnPropertyChanged(nameof(CurrentExtractModeText));
            
            _writer?.Dispose();
            _writer = null;
            
            _directoryLoader?.Dispose();
            _directoryLoader = new DirectoryLoader(directoryPath);

            StatusMessage = "构建文件树...";
            RootEntry = await _directoryLoader.LoadAsync();
            CurrentFilePath = directoryPath;

            int totalFiles = CountFiles(RootEntry);
            StatusMessage = $"已加载目录: {FileName}（{totalFiles} 个 .cache 文件）";
        } catch (Exception ex) {
            MessageBox.Show($"加载目录失败: {ex.Message}", "错误", MessageBoxButton.OK, MessageBoxImage.Error);
            StatusMessage = "加载失败";
        } finally {
            IsLoading = false;
        }
    }

    private static int CountFiles(PDEEntry entry) {
        if (entry.IsFile) return 1;
        return entry.Children.Sum(CountFiles);
    }

    private async Task LoadFileAsync(string filePath) {
        IsLoading = true;
        StatusMessage = "加载文件头中...";

        try {
            _isDirectoryMode = false;
            _currentExtractMode = ExtractMode.NoExtract;
            OnPropertyChanged(nameof(CurrentExtractMode));
            OnPropertyChanged(nameof(CurrentExtractModeText));
            
            _directoryLoader?.Dispose();
            _directoryLoader = null;
            
            var fileInfo = new FileInfo(filePath);
            var fileSizeStr = FormatFileSize(fileInfo.Length);
            StatusMessage = $"加载文件中（{fileSizeStr}）...";

            StatusMessage = "解析 VFS 表中...";
            _writer = await PDEWriter.CreateAsync(filePath);

            StatusMessage = "解析根目录中...";

            RootEntry = _writer.RootEntry;
            CurrentFilePath = filePath;

            StatusMessage = $"已加载: {FileName}";
        } catch (Exception ex) {
            MessageBox.Show($"加载文件失败: {ex.Message}", "错误", MessageBoxButton.OK, MessageBoxImage.Error);
            StatusMessage = "加载失败";
        } finally {
            IsLoading = false;
        }
    }

    public async Task LoadFileFromPath(string filePath) {
        await LoadFileAsync(filePath);
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

    private void CloseFile() {
        RootEntry = null;
        SelectedEntry = null;
        CurrentFilePath = string.Empty;
        _writer?.Dispose();
        _writer = null;
        _directoryLoader?.Dispose();
        _directoryLoader = null;
        _isDirectoryMode = false;
        StatusMessage = "就绪";
    }

    private static string GetRelativePath(PDEEntry entry) {
        var pathParts = new List<string>();
        var current = entry;

        while (current != null && current.Parent != null) {
            pathParts.Insert(0, current.Name);
            current = current.Parent;
        }

        return string.Join(Path.DirectorySeparatorChar.ToString(), pathParts);
    }

    private static void SetTimestamp(string path, PDEEntry entry) {
        try {
            var modifiedTime = entry.ModifiedTime;

            if (entry.IsDirectory) {
                Directory.SetLastWriteTime(path, modifiedTime);
                Directory.SetCreationTime(path, modifiedTime);
                Directory.SetLastAccessTime(path, modifiedTime);
            } else {
                File.SetLastWriteTime(path, modifiedTime);
                File.SetCreationTime(path, modifiedTime);
                File.SetLastAccessTime(path, modifiedTime);
            }
        } catch (Exception ex) {
            System.Diagnostics.Debug.WriteLine($"Failed to set timestamp for {path}: {ex.Message}");
        }
    }

    private static string GetExportDirectorySuffix(ExtractMode mode) {
        return mode switch {
            ExtractMode.NoExtract => "_cache",
            ExtractMode.RemoveFirst8Bytes => "_nocache_m8byte",
            ExtractMode.KeepFirst8Bytes => "_nocache_k8byte",
            ExtractMode.Mixed => "_nocache_mixed",
            _ => "_nocache_mixed"
        };
    }

    private string GetExportDirectory(ExtractMode mode) {
        if (string.IsNullOrEmpty(CurrentFilePath))
            return string.Empty;

        if (_isDirectoryMode) {
            return CurrentFilePath;
        }

        string fileName = Path.GetFileNameWithoutExtension(CurrentFilePath);
        string dir = Path.GetDirectoryName(CurrentFilePath) ?? "";
        string suffix = GetExportDirectorySuffix(mode);

        return Path.Combine(dir, fileName + suffix);
    }

    public void ShowExportOptions() {
        var optionsWindow = new ExportOptionsWindow(_currentExtractMode, _isDirectoryMode) {
            Owner = Application.Current.MainWindow
        };

        if (optionsWindow.ShowDialog() == true && optionsWindow.IsConfirmed) {
            CurrentExtractMode = optionsWindow.SelectedMode;
        }
    }

    private async void ExecuteExportAll(ExtractMode mode) {
        if (RootEntry == null || (_writer == null && _directoryLoader == null)) return;

        try {
            string exportBase = GetExportDirectory(mode);
            
            if (string.IsNullOrEmpty(exportBase)) {
                MessageBox.Show("无法确定导出目录", "错误", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }
            
            System.Diagnostics.Debug.WriteLine($"Export directory: {exportBase}");
            
            int totalFiles = 0;
            int totalDirs = 0;

            StatusMessage = $"导出中，模式: {mode}...";

            await Task.Run(() => ExportRecursive(RootEntry, exportBase, mode, ref totalFiles, ref totalDirs));

            StatusMessage = $"已导出 {totalFiles} 个文件到: {exportBase}";
            MessageBox.Show($"导出完成！\n\n模式: {mode}\n文件数: {totalFiles}\n目录数: {totalDirs}\n\n位置: {exportBase}",
                "导出完成", MessageBoxButton.OK, MessageBoxImage.Information);
        } catch (Exception ex) {
            MessageBox.Show($"导出失败: {ex.Message}", "错误", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    public void ExportSelected() {
        if (_writer == null && _directoryLoader == null) return;

        try {
            string exportBase = GetExportDirectory(_currentExtractMode);

            var entriesToExport = SelectedEntries.Where(e => e != null).ToList();

            if (entriesToExport.Count > 1) {
                int fileCount = 0;
                int dirCount = 0;

                foreach (var entry in entriesToExport) {
                    if (entry.IsDirectory) {
                        ExportRecursive(entry, exportBase, _currentExtractMode, ref fileCount, ref dirCount);
                    } else {
                        string relativePath = GetRelativePath(entry);
                        string outputPath = Path.Combine(exportBase, relativePath);
                        ExportFile(entry, outputPath, _currentExtractMode);
                        fileCount++;
                    }
                }

                StatusMessage = $"已导出 {fileCount} 个文件，{dirCount} 个目录";
            } else if (SelectedEntry != null) {
                if (SelectedEntry.IsDirectory) {
                    int totalFiles = 0;
                    int totalDirs = 0;
                    ExportRecursive(SelectedEntry, exportBase, _currentExtractMode, ref totalFiles, ref totalDirs);
                    StatusMessage = $"已从 {SelectedEntry.Name} 导出 {totalFiles} 个文件";
                } else {
                    string relativePath = GetRelativePath(SelectedEntry);
                    string outputPath = Path.Combine(exportBase, relativePath);
                    ExportFile(SelectedEntry, outputPath, _currentExtractMode);
                    StatusMessage = $"已导出: {SelectedEntry.Name}";
                }
            }
        } catch (Exception ex) {
            MessageBox.Show($"导出失败: {ex.Message}", "错误", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void ExportAll() {
        if (RootEntry == null || (_writer == null && _directoryLoader == null)) return;
        ExecuteExportAll(_currentExtractMode);
    }

    private void ExportRecursive(PDEEntry entry, string basePath, ExtractMode mode, ref int fileCount, ref int dirCount) {
        if (entry.IsDirectory) {
            if (entry != RootEntry) dirCount++;

            if (!_isDirectoryMode && _writer != null && !PDEWriter.IsDirectoryLoaded(entry)) {
                _writer.LoadDirectory(entry);
            }

            foreach (var child in entry.Children) {
                ExportRecursive(child, basePath, mode, ref fileCount, ref dirCount);
            }

            if (entry != RootEntry) {
                string relativePath = GetRelativePath(entry);
                string dirPath = Path.Combine(basePath, relativePath);
                if (Directory.Exists(dirPath)) {
                    SetTimestamp(dirPath, entry);
                }
            }
        } else {
            fileCount++;

            string relativePath = GetRelativePath(entry);
            string outputPath = Path.Combine(basePath, relativePath);
            ExportFile(entry, outputPath, mode);
        }
    }

    private void ExportFile(PDEEntry entry, string outputPath, ExtractMode mode) {
        try {
            byte[] data;
            
            if (_isDirectoryMode && _directoryLoader != null) {
                data = _directoryLoader.ReadFile(entry);
            }
            else if (_writer != null) {
                data = _writer.ExtractFile(entry);
            }
            else {
                System.Diagnostics.Debug.WriteLine($"No data source for: {entry.Name}");
                return;
            }

            if (data == null || data.Length == 0) {
                System.Diagnostics.Debug.WriteLine($"Empty data for: {entry.Name}");
                return;
            }

            bool isCacheFile = Decompressor.IsCacheFile(entry.Name);

            if (isCacheFile) {
                if (_isDirectoryMode) {
                    data = Decompressor.PreExtract(data, entry.Name, mode);
                    if (outputPath.EndsWith(".cache", StringComparison.OrdinalIgnoreCase)) {
                        outputPath = outputPath.Substring(0, outputPath.Length - 6);
                    }
                }
                else {
                    bool isNoExtractMode = mode == ExtractMode.NoExtract;
                    data = Decompressor.PreExtract(data, entry.Name, mode);

                    if (!isNoExtractMode && outputPath.EndsWith(".cache", StringComparison.OrdinalIgnoreCase)) {
                        outputPath = outputPath.Substring(0, outputPath.Length - 6);
                    }
                }
            }

            string? dir = Path.GetDirectoryName(outputPath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) {
                Directory.CreateDirectory(dir);
            }

            File.WriteAllBytes(outputPath, data);
            System.Diagnostics.Debug.WriteLine($"Exported: {outputPath}");

            SetTimestamp(outputPath, entry);
        } catch (Exception ex) {
            System.Diagnostics.Debug.WriteLine($"Export failed: {entry.Name} - {ex.Message}");
            MessageBox.Show($"导出失败: {entry.Name}\n{ex.Message}", "错误", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void Refresh() {
        if (!string.IsNullOrEmpty(CurrentFilePath)) {
            await LoadFileAsync(CurrentFilePath);
        }
    }
}

public class BreadcrumbItem {
    public string Name { get; }
    public PDEEntry Entry { get; }
    private readonly MainViewModel _viewModel;

    public BreadcrumbItem(PDEEntry entry, MainViewModel viewModel) {
        Entry = entry;
        Name = entry.Name;
        _viewModel = viewModel;
    }

    public ICommand NavigateCommand => new RelayCommand(() => _viewModel.NavigateToDirectory(Entry));
}
