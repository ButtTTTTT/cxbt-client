using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace PDEView.Models;

public enum EntryType : byte
{
    File = 1,
    Directory = 2
}

public class PDEEntry : INotifyPropertyChanged
{
    private string _name = string.Empty;
    private EntryType _type;
    private uint _size;
    private bool _isLoaded;

    public event PropertyChangedEventHandler? PropertyChanged;

    protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }

    public EntryType Type
    {
        get => _type;
        set
        {
            _type = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsDirectory));
            OnPropertyChanged(nameof(IsFile));
        }
    }

    public string Name
    {
        get => _name;
        set
        {
            if (_name != value)
            {
                _name = value;
                OnPropertyChanged();
            }
        }
    }

    public long UnixTime { get; set; }
    public uint Offset { get; set; }

    public uint Size
    {
        get => _size;
        set
        {
            if (_size != value)
            {
                _size = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(FormattedSize));
            }
        }
    }

    public string FullPath { get; set; } = string.Empty;
    public PDEEntry? Parent { get; set; }
    public List<PDEEntry> Children { get; set; } = new();

    public bool IsLoaded
    {
        get => _isLoaded;
        set
        {
            _isLoaded = value;
            OnPropertyChanged();
        }
    }

    internal uint _tempBlockCount { get; set; }
    internal uint _originalOffset { get; set; }

    public bool IsDirectory => Type == EntryType.Directory;
    public bool IsFile => Type == EntryType.File;
    public DateTime ModifiedTime => DateTimeOffset.FromUnixTimeSeconds(UnixTime).LocalDateTime;

    /// <summary>
    /// 格式化的时间字符串
    /// </summary>
    public string FormattedTime => ModifiedTime.ToString("yyyy-MM-dd HH:mm");

    /// <summary>
    /// 数据块数量（向上取整）
    /// </summary>
    public uint BlockCount
    {
        get
        {
            if (IsDirectory || Size == 0) return 0;
            return (Size + 0xFFF) / 0x1000;  // 向上取整到 4KB 块
        }
    }

    public string FormattedSize
    {
        get
        {
            if (IsDirectory) return "<DIR>";
            return FormatSize(Size);
        }
    }

    private static string FormatSize(uint bytes)
    {
        string[] units = { "B", "KB", "MB", "GB" };
        double size = bytes;
        int unitIndex = 0;

        while (size >= 1024 && unitIndex < units.Length - 1)
        {
            size /= 1024;
            unitIndex++;
        }

        return $"{size:F2} {units[unitIndex]}";
    }
}
