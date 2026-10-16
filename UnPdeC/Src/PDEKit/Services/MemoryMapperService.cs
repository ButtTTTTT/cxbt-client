using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;

namespace PDEKit.Services;

/// <summary>
/// 基于 Win32 内存映射 API 的高性能只读文件访问
/// 移植自 UnPdeC/MemoryMapper.cpp
/// </summary>
public sealed class MemoryMapperService : IDisposable
{
    private IntPtr _hFile = new(-1);
    private IntPtr _hMapFile = IntPtr.Zero;
    private string _currentPath = "";
    private long _fileSize;
    private long _allocationGranularity;

    public long FileSize => _fileSize;
    public string CurrentPath => _currentPath;
    public bool IsOpen => _hFile.ToInt64() != -1;

    public MemoryMapperService()
    {
        var sysInfo = new SYSTEM_INFO();
        GetSystemInfo(ref sysInfo);
        _allocationGranularity = sysInfo.dwAllocationGranularity;
    }

    public void OpenFile(string filePath)
    {
        if (_hFile.ToInt64() != -1 && filePath == _currentPath)
            return;

        CloseFile();

        _hFile = CreateFileW(
            filePath,
            FileAccess.GENERIC_READ,
            FileShare.FILE_SHARE_READ,
            IntPtr.Zero,
            CreationDisposition.OPEN_EXISTING,
            FileFlags.FILE_ATTRIBUTE_NORMAL | FileFlags.FILE_FLAG_RANDOM_ACCESS,
            IntPtr.Zero);

        if (_hFile.ToInt64() == -1)
            throw new IOException($"无法打开文件: {filePath}");

        if (!GetFileSizeEx(_hFile, out long fileSize))
        {
            CloseHandle(_hFile);
            _hFile = new IntPtr(-1);
            throw new IOException($"获取文件大小失败: {filePath}");
        }
        _fileSize = fileSize;

        _hMapFile = CreateFileMappingW(
            _hFile,
            IntPtr.Zero,
            FileMapProtection.PAGE_READONLY,
            (uint)(fileSize >> 32),
            (uint)(fileSize & 0xFFFFFFFF),
            IntPtr.Zero);

        if (_hMapFile == IntPtr.Zero)
        {
            CloseHandle(_hFile);
            _hFile = new IntPtr(-1);
            throw new IOException($"创建文件映射失败: {filePath}");
        }

        _currentPath = filePath;
    }

    public void CloseFile()
    {
        if (_hMapFile != IntPtr.Zero)
        {
            CloseHandle(_hMapFile);
            _hMapFile = IntPtr.Zero;
        }
        if (_hFile.ToInt64() != -1)
        {
            CloseHandle(_hFile);
            _hFile = new IntPtr(-1);
        }
        _currentPath = "";
        _fileSize = 0;
    }

    public byte[] ReadData(long offset, int size)
    {
        if (_hMapFile == IntPtr.Zero)
            throw new InvalidOperationException("文件未打开");

        if (offset >= _fileSize)
            return [];

        if (offset + size > _fileSize)
            size = (int)(_fileSize - offset);

        long viewOffset = offset / _allocationGranularity * _allocationGranularity;
        int offsetInView = (int)(offset - viewOffset);
        int viewSize = offsetInView + size;

        if (viewOffset + viewSize > _fileSize)
            viewSize = (int)(_fileSize - viewOffset);

        IntPtr baseAddress = MapViewOfFile(
            _hMapFile,
            FileMapAccess.FILE_MAP_READ,
            (uint)(viewOffset >> 32),
            (uint)(viewOffset & 0xFFFFFFFF),
            viewSize);

        if (baseAddress == IntPtr.Zero)
            throw new IOException("映射文件视图失败");

        try
        {
            var data = new byte[size];
            Marshal.Copy(baseAddress + offsetInView, data, 0, size);
            return data;
        }
        finally
        {
            UnmapViewOfFile(baseAddress);
        }
    }

    public List<byte[]> ReadMultipleBlocks(List<(long offset, int size)> blocks)
    {
        if (_hMapFile == IntPtr.Zero)
            throw new InvalidOperationException("文件未打开");

        var results = new byte[blocks.Count][];
        var indices = Enumerable.Range(0, blocks.Count).OrderBy(i => blocks[i].offset).ToList();

        IntPtr currentView = IntPtr.Zero;
        long currentViewOffset = 0;
        int currentViewSize = 0;

        foreach (int idx in indices)
        {
            var (offset, size) = blocks[idx];

            if (offset >= _fileSize)
            {
                results[idx] = [];
                continue;
            }

            int adjustedSize = size;
            if (offset + adjustedSize > _fileSize)
                adjustedSize = (int)(_fileSize - offset);

            // Check if current view covers this block
            if (currentView == IntPtr.Zero ||
                offset < currentViewOffset ||
                offset + adjustedSize > currentViewOffset + currentViewSize)
            {
                if (currentView != IntPtr.Zero)
                    UnmapViewOfFile(currentView);

                long viewOffset = offset / _allocationGranularity * _allocationGranularity;
                int offsetInView = (int)(offset - viewOffset);
                int viewSize = offsetInView + adjustedSize;

                if (viewOffset + viewSize > _fileSize)
                    viewSize = (int)(_fileSize - viewOffset);

                currentView = MapViewOfFile(
                    _hMapFile,
                    FileMapAccess.FILE_MAP_READ,
                    (uint)(viewOffset >> 32),
                    (uint)(viewOffset & 0xFFFFFFFF),
                    viewSize);

                if (currentView == IntPtr.Zero)
                    throw new IOException("映射文件视图失败");

                currentViewOffset = viewOffset;
                currentViewSize = viewSize;
            }

            int inViewOffset = (int)(offset - currentViewOffset);
            var data = new byte[adjustedSize];
            Marshal.Copy(currentView + inViewOffset, data, 0, adjustedSize);
            results[idx] = data;
        }

        if (currentView != IntPtr.Zero)
            UnmapViewOfFile(currentView);

        return results.ToList();
    }

    public void Dispose()
    {
        CloseFile();
        GC.SuppressFinalize(this);
    }

    ~MemoryMapperService() => CloseFile();

    #region Win32 Interop

    [StructLayout(LayoutKind.Sequential)]
    private struct SYSTEM_INFO
    {
        public ushort wProcessorArchitecture;
        public ushort wReserved;
        public uint dwPageSize;
        public IntPtr lpMinimumApplicationAddress;
        public IntPtr lpMaximumApplicationAddress;
        public long dwActiveProcessorMask;
        public uint dwNumberOfProcessors;
        public long dwAllocationGranularity;
        public ushort wProcessorLevel;
        public ushort wProcessorRevision;
    }

    [DllImport("kernel32.dll")]
    private static extern void GetSystemInfo(ref SYSTEM_INFO lpSystemInfo);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateFileW(
        string lpFileName,
        FileAccess dwDesiredAccess,
        FileShare dwShareMode,
        IntPtr lpSecurityAttributes,
        CreationDisposition dwCreationDisposition,
        FileFlags dwFlagsAndAttributes,
        IntPtr hTemplateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileSizeEx(IntPtr hFile, out long lpFileSize);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateFileMappingW(
        IntPtr hFile,
        IntPtr lpFileMappingAttributes,
        FileMapProtection flProtect,
        uint dwMaximumSizeHigh,
        uint dwMaximumSizeLow,
        IntPtr lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr MapViewOfFile(
        IntPtr hFileMappingObject,
        FileMapAccess dwDesiredAccess,
        uint dwFileOffsetHigh,
        uint dwFileOffsetLow,
        int dwNumberOfBytesToMap);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool UnmapViewOfFile(IntPtr lpBaseAddress);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    [Flags]
    private enum FileAccess : uint
    {
        GENERIC_READ = 0x80000000,
    }

    [Flags]
    private enum FileShare : uint
    {
        FILE_SHARE_READ = 0x00000001,
        FILE_SHARE_WRITE = 0x00000002,
    }

    private enum CreationDisposition : uint
    {
        OPEN_EXISTING = 3,
    }

    [Flags]
    private enum FileFlags : uint
    {
        FILE_ATTRIBUTE_NORMAL = 0x00000080,
        FILE_FLAG_RANDOM_ACCESS = 0x10000000,
        FILE_FLAG_SEQUENTIAL_SCAN = 0x08000000,
    }

    private enum FileMapProtection : uint
    {
        PAGE_READONLY = 0x02,
    }

    [Flags]
    private enum FileMapAccess : uint
    {
        FILE_MAP_READ = 0x0004,
    }

    #endregion
}
