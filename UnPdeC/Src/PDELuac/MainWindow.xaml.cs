using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Documents;
using System.Windows.Media;
using Microsoft.Win32;

namespace PDELuac {
    public partial class MainWindow : Window {
        private LuacWrapper? _luac;
        private string? _rootPath;
        private List<string> _filesToCompile = new();

        public MainWindow() {
            InitializeComponent();
            Loaded += MainWindow_Loaded;
            UpdatePDEInfo();
        }

        private void MainWindow_Loaded(object sender, RoutedEventArgs e) {
            try {
                _luac = new LuacWrapper();
            } catch (Exception ex) {
                MessageBox.Show($"DLL 加载失败: {ex.Message}\n\n请确保 luac_dll.dll 在程序同目录下。",
                    "错误", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        #region 日志

        private void Log(string message, bool isError = false, bool isWarning = false) {
            Dispatcher.Invoke(() => {
                var paragraph = new Paragraph();
                var run = new Run($"[{DateTime.Now:HH:mm:ss}] {message}");

                if (isError)
                    run.Foreground = Brushes.Red;
                else if (isWarning)
                    run.Foreground = Brushes.Orange;
                else
                    run.Foreground = Brushes.Green;

                paragraph.Inlines.Add(run);
                rtbLog.Document.Blocks.Add(paragraph);
                rtbLog.ScrollToEnd();
            });
        }

        private void LogInfo(string message) => Log(message, false, false);
        private void LogError(string message) => Log(message, true, false);
        private void LogWarning(string message) => Log(message, false, true);

        #endregion

        #region PDE头部信息显示

        private void UpdatePDEInfo() {
            if (txtPDEInfo == null || chkAddPDEHeader == null)
                return;

            try {
                txtPDEInfo.Text = "";

                var grayBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#666"));
                var blueBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2196F3"));
                var orangeBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FF9800"));

                txtPDEInfo.Inlines.Add(new Run("勾选时: ") { Foreground = grayBrush });
                txtPDEInfo.Inlines.Add(new Run("[魔数 4B][Lua大小 4B][Lua字节码]") {
                    Foreground = blueBrush,
                    FontWeight = chkAddPDEHeader.IsChecked == true ? FontWeights.Bold : FontWeights.Normal
                });
                txtPDEInfo.Inlines.Add(new Run("  |  不勾选: ") { Foreground = grayBrush });
                txtPDEInfo.Inlines.Add(new Run("[Lua字节码]") {
                    Foreground = chkAddPDEHeader.IsChecked == true ? orangeBrush : Brushes.Green,
                    FontWeight = chkAddPDEHeader.IsChecked == true ? FontWeights.Normal : FontWeights.Bold
                });
            } catch {
                // 忽略初始化时的错误
            }
        }

        private void ChkAddPDEHeader_Changed(object sender, RoutedEventArgs e) {
            UpdatePDEInfo();
        }

        #endregion

        #region 文件收集

        private bool ValidateRootPath() {
            string path = txtRootPath.Text.Trim();
            if (string.IsNullOrEmpty(path)) {
                grpRootPath.Tag = "Invalid";
                return false;
            }

            if (!Directory.Exists(path)) {
                grpRootPath.Tag = "Invalid";
                return false;
            }

            grpRootPath.Tag = null;
            _rootPath = path;
            return true;
        }

        private void CollectLuaFiles(string[] paths) {
            _filesToCompile.Clear();

            foreach (var path in paths) {
                if (File.Exists(path)) {
                    AddLuaFile(path);
                } else if (Directory.Exists(path)) {
                    try {
                        var luaFiles = Directory.GetFiles(path, "*.lua", SearchOption.AllDirectories);
                        foreach (var file in luaFiles)
                            AddLuaFile(file);
                    } catch (Exception ex) {
                        LogError($"扫描目录失败: {ex.Message}");
                    }
                }
            }
        }

        private void AddLuaFile(string filePath) {
            if (!filePath.EndsWith(".lua", StringComparison.OrdinalIgnoreCase))
                return;

            if (!_filesToCompile.Contains(filePath, StringComparer.OrdinalIgnoreCase))
                _filesToCompile.Add(filePath);
        }

        private string CalculateGamePath(string filePath) {
            if (string.IsNullOrEmpty(_rootPath))
                return Path.GetFileName(filePath);

            try {
                string fullPath = Path.GetFullPath(filePath);
                string fullRoot = Path.GetFullPath(_rootPath);

                if (fullPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase)) {
                    string relativePath = fullPath.Substring(fullRoot.Length);
                    relativePath = relativePath.TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                    return "/" + relativePath.Replace('\\', '/');
                }
            } catch { }

            return Path.GetFileName(filePath);
        }

        #endregion

        #region 编译

        private async void ProcessFiles() {
            if (_filesToCompile.Count == 0) {
                LogWarning("没有找到 .lua 文件");
                return;
            }

            if (_luac == null) {
                MessageBox.Show("DLL 未正确加载，无法编译", "错误", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            // 在 UI 线程获取编译选项（避免后台线程访问 UI 控件）
            bool addPDEHeader = chkAddPDEHeader.IsChecked == true;
            uint magicNumber = 0x010A0000;
            if (!string.IsNullOrWhiteSpace(txtMagicNumber.Text)) {
                try {
                    string hex = txtMagicNumber.Text.Trim();
                    if (hex.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
                        hex = hex.Substring(2);
                    magicNumber = Convert.ToUInt32(hex, 16);
                } catch {
                    LogWarning($"无效的魔数: {txtMagicNumber.Text}，使用默认值");
                }
            }

            // 更新 UI 状态
            IsEnabled = false;
            StatusText.Text = $"正在编译 {_filesToCompile.Count} 个文件...";

            int success = 0, failed = 0;
            bool localAddPDEHeader = addPDEHeader;
            uint localMagicNumber = magicNumber;

            await System.Threading.Tasks.Task.Run(() => {
                foreach (var file in _filesToCompile) {
                    try {
                        bool result = CompileFile(file, localAddPDEHeader, localMagicNumber);
                        if (result)
                            success++;
                        else
                            failed++;
                    } catch (Exception ex) {
                        LogError($"编译异常: {Path.GetFileName(file)} - {ex.Message}");
                        failed++;
                    }
                }
            });

            // 恢复 UI 状态
            IsEnabled = true;
            StatusText.Text = $"完成: {success} 成功, {failed} 失败";

            LogInfo($"编译完成: {success} 成功, {failed} 失败");
        }

        private bool CompileFile(string sourceFile, bool addPDEHeader, uint magicNumber) {
            try {
                // 输出到源文件同目录
                string outputDir = Path.GetDirectoryName(sourceFile)!;

                string fileName = Path.GetFileNameWithoutExtension(sourceFile);
                if (fileName.EndsWith(".luac", StringComparison.OrdinalIgnoreCase))
                    fileName = fileName.Substring(0, fileName.Length - 5);

                string outputFile = Path.Combine(outputDir, fileName + ".luac");

                string gamePath = CalculateGamePath(sourceFile);
                if (!gamePath.StartsWith("@"))
                    gamePath = "@" + gamePath;

                bool strip = false; // 默认不剥离调试信息

                string errorMsg;
                bool success = _luac!.CompileForPDEGame(sourceFile, outputFile, gamePath, strip, addPDEHeader, magicNumber, out errorMsg);

                if (success)
                    LogInfo($"成功: {Path.GetFileName(sourceFile)} -> {Path.GetFileName(outputFile)}");
                else
                    LogError($"失败: {Path.GetFileName(sourceFile)} - {errorMsg}");

                return success;
            } catch (Exception ex) {
                LogError($"异常: {Path.GetFileName(sourceFile)} - {ex.Message}");
                return false;
            }
        }

        #endregion

        #region 事件处理

        private void TxtRootPath_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e) {
            ValidateRootPath();
        }

        private void Window_DragOver(object sender, DragEventArgs e) {
            if (e.Data.GetDataPresent(DataFormats.FileDrop)) {
                e.Effects = DragDropEffects.Copy;
                e.Handled = true;
                return;
            }
            e.Effects = DragDropEffects.None;
            e.Handled = true;
        }

        private void Window_Drop(object sender, DragEventArgs e) {
            if (!ValidateRootPath()) {
                MessageBox.Show("请先设置根目录！", "提示", MessageBoxButton.OK, MessageBoxImage.Warning);
                txtRootPath.Focus();
                return;
            }

            if (e.Data.GetDataPresent(DataFormats.FileDrop)) {
                var paths = (string[])e.Data.GetData(DataFormats.FileDrop);
                CollectLuaFiles(paths);

                if (_filesToCompile.Count > 0) {
                    StatusText.Text = $"已添加 {_filesToCompile.Count} 个 .lua 文件";
                    ProcessFiles();
                } else {
                    StatusText.Text = "未找到 .lua 文件";
                    LogWarning("拖入的文件中没有 .lua 文件");
                }
            }
        }

        private void DropZone_Click(object sender, RoutedEventArgs e) {
            if (!ValidateRootPath()) {
                MessageBox.Show("请先设置根目录！", "提示", MessageBoxButton.OK, MessageBoxImage.Warning);
                txtRootPath.Focus();
                return;
            }

            var dialog = new OpenFileDialog {
                Title = "选择 Lua 文件",
                Filter = "Lua 文件 (*.lua)|*.lua|所有文件 (*.*)|*.*",
                Multiselect = true
            };

            if (dialog.ShowDialog() == true) {
                CollectLuaFiles(dialog.FileNames);
                if (_filesToCompile.Count > 0) {
                    StatusText.Text = $"已添加 {_filesToCompile.Count} 个 .lua 文件";
                    ProcessFiles();
                }
            }
        }

        private void BtnBrowseRoot_Click(object sender, RoutedEventArgs e) {
            var dialog = new OpenFolderDialog { Title = "选择游戏资源根目录" };
            if (dialog.ShowDialog() == true) {
                txtRootPath.Text = dialog.FolderName;
                ValidateRootPath();
            }
        }

        #endregion

        protected override void OnClosed(EventArgs e) {
            _luac?.Dispose();
            base.OnClosed(e);
        }
    }
}
