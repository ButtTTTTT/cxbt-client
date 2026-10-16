﻿﻿﻿﻿using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Linq;
using System.IO;
using PDEView.Models;
using PDEView.ViewModels;

namespace PDEView
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
            KeyDown += MainWindow_KeyDown;
        }

        private void MainWindow_KeyDown(object sender, KeyEventArgs e)
        {
            if (DataContext is MainViewModel viewModel)
            {
                // Backspace: 返回上一级
                if (e.Key == Key.Back && viewModel.CanGoUp)
                {
                    viewModel.GoUp();
                    e.Handled = true;
                }
                // F2: 重命名
                else if (e.Key == Key.F2 && viewModel.SelectedEntry != null)
                {
                    ShowRenameDialog(viewModel.SelectedEntry, viewModel);
                    e.Handled = true;
                }
            }
        }

        private void ShowRenameDialog(PDEEntry entry, MainViewModel viewModel)
        {
            var dialog = new RenameWindow(entry.Name);
            if (dialog.ShowDialog() == true)
            {
                entry.Name = dialog.NewName;
                viewModel.StatusMessage = $"已重命名为: {dialog.NewName}";
            }
        }

        // 拖放支持
        private void Window_DragOver(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                var files = (string[])e.Data.GetData(DataFormats.FileDrop);
                if (files.Length == 1)
                {
                    var ext = Path.GetExtension(files[0]).ToLower();
                    if (ext == ".pde" || ext == ".xor")
                    {
                        e.Effects = DragDropEffects.Copy;
                        e.Handled = true;
                        return;
                    }
                }
            }
            e.Effects = DragDropEffects.None;
            e.Handled = true;
        }

        private void Window_Drop(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                var files = (string[])e.Data.GetData(DataFormats.FileDrop);
                if (files.Length == 1)
                {
                    var file = files[0];
                    var ext = Path.GetExtension(file).ToLower();
                    if (ext == ".pde" || ext == ".xor")
                    {
                        if (DataContext is MainViewModel viewModel)
                        {
                            _ = viewModel.LoadFileFromPath(file);
                        }
                    }
                }
            }
            e.Handled = true;
        }

        private void FileListView_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (DataContext is MainViewModel viewModel && FileListView.SelectedItems.Count > 0)
            {
                viewModel.SelectedEntries = FileListView.SelectedItems.Cast<PDEEntry>().ToList();
            }
        }

        // 排序状态
        private string _sortBy = "Name";
        private bool _sortAscending = true;

        private void FileListView_HeaderClick(object sender, RoutedEventArgs e)
        {
            if (e.OriginalSource is GridViewColumnHeader header && header.Column != null)
            {
                string? newSortBy = header.Column.Header?.ToString();
                
                if (!string.IsNullOrEmpty(newSortBy))
                {
                    // 切换排序方向
                    if (_sortBy == newSortBy)
                    {
                        _sortAscending = !_sortAscending;
                    }
                    else
                    {
                        _sortBy = newSortBy;
                        _sortAscending = true;
                    }

                    // 应用排序
                    ApplySorting();
                }
            }
        }

        private void ApplySorting()
        {
            if (DataContext is MainViewModel viewModel)
            {
                var entries = viewModel.CurrentDirectoryEntries.ToList();
                
                var sorted = _sortBy switch
                {
                    "名称" => _sortAscending 
                        ? entries.OrderBy(e => e.Name, StringComparer.OrdinalIgnoreCase)
                        : entries.OrderByDescending(e => e.Name, StringComparer.OrdinalIgnoreCase),
                    "大小" => _sortAscending 
                        ? entries.OrderBy(e => e.Size)
                        : entries.OrderByDescending(e => e.Size),
                    "块数" => _sortAscending 
                        ? entries.OrderBy(e => e.BlockCount)
                        : entries.OrderByDescending(e => e.BlockCount),
                    "修改时间" => _sortAscending 
                        ? entries.OrderBy(e => e.ModifiedTime)
                        : entries.OrderByDescending(e => e.ModifiedTime),
                    _ => entries.OrderBy(e => e.Name, StringComparer.OrdinalIgnoreCase)
                };

                // 目录始终在前面
                var finalSorted = sorted.ToList();
                
                viewModel.CurrentDirectoryEntries.Clear();
                foreach (var entry in finalSorted)
                {
                    viewModel.CurrentDirectoryEntries.Add(entry);
                }

                viewModel.StatusMessage = $"按 {_sortBy} 排序（{(_sortAscending ? "升序" : "降序")}）";
            }
        }

        private void MenuItem_Rename_Click(object sender, RoutedEventArgs e)
        {
            if (DataContext is MainViewModel viewModel && viewModel.SelectedEntry != null)
            {
                ShowRenameDialog(viewModel.SelectedEntry, viewModel);
            }
        }

        private void FileListView_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            var listView = sender as ListView;
            if (listView == null) return;

            var point = e.GetPosition(listView);
            var hitTestResult = VisualTreeHelper.HitTest(listView, point);
            
            if (hitTestResult != null)
            {
                var element = hitTestResult.VisualHit as DependencyObject;
                while (element != null)
                {
                    if (element is ListViewItem item && item.DataContext is PDEEntry entry)
                    {
                        if (DataContext is MainViewModel viewModel)
                        {
                            if (entry.IsDirectory)
                            {
                                viewModel.NavigateToDirectory(entry);
                            }
                            else
                            {
                                viewModel.ExportSelected();
                            }
                        }
                        e.Handled = true;
                        return;
                    }
                    element = VisualTreeHelper.GetParent(element);
                }
            }
        }
    }

    public class EntryIconConverter : System.Windows.Data.IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            if (value is PDEEntry entry)
            {
                if (entry.IsDirectory)
                    return "[D]";

                string ext = System.IO.Path.GetExtension(entry.Name).ToLower();
                return ext switch
                {
                    ".lua" or ".luac" => "[L]",
                    ".png" or ".jpg" or ".jpeg" or ".bmp" or ".gif" => "[I]",
                    ".mp3" or ".wav" or ".ogg" => "[A]",
                    ".txt" or ".json" or ".xml" => "[T]",
                    ".cache" => "[C]",
                    _ => "[F]"
                };
            }
            return "[?]";
        }

        public object ConvertBack(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    public class BlockCountConverter : System.Windows.Data.IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            if (value is uint count && count > 0)
                return count.ToString();
            return "-";
        }

        public object ConvertBack(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    public class EntryIconTooltipConverter : System.Windows.Data.IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            if (value is PDEEntry entry)
            {
                if (entry.IsDirectory)
                    return "目录";

                string ext = System.IO.Path.GetExtension(entry.Name).ToLower();
                return ext switch
                {
                    ".lua" or ".luac" => "Lua 脚本",
                    ".png" or ".jpg" or ".jpeg" or ".bmp" or ".gif" => "图片",
                    ".mp3" or ".wav" or ".ogg" => "音频",
                    ".txt" or ".json" or ".xml" => "文本",
                    ".cache" => "Cache 文件",
                    _ => "文件"
                };
            }
            return "未知";
        }

        public object ConvertBack(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    public class InverseBooleanToVisibilityConverter : System.Windows.Data.IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            if (value is bool boolValue)
            {
                return boolValue ? Visibility.Collapsed : Visibility.Visible;
            }
            return Visibility.Visible;
        }

        public object ConvertBack(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    public class BooleanToVisibilityConverter : System.Windows.Data.IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            if (value is bool boolValue)
            {
                return boolValue ? Visibility.Visible : Visibility.Collapsed;
            }
            return Visibility.Collapsed;
        }

        public object ConvertBack(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    public class NotNullToVisibilityConverter : System.Windows.Data.IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            return value != null ? Visibility.Visible : Visibility.Collapsed;
        }

        public object ConvertBack(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }

    public class NullToVisibilityConverter : System.Windows.Data.IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            return value == null ? Visibility.Visible : Visibility.Collapsed;
        }

        public object ConvertBack(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
