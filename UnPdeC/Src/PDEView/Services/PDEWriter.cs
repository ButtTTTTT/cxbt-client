using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using PDEView.Models;

namespace PDEView.Services
{
    public class PDEWriter : IDisposable
    {
        private const uint BLOCK_SIZE = 0x1000;
        private const uint DATA_SEGMENT_SIZE = 0x400000;
        private const uint ROOT_DIR_OFFSET = 0x1000;
        private const uint ROOT_DIR_SIZE = 0x1000;

        private FileStream? _fileStream;
        private BinaryReader? _binaryReader;
        private byte[]? _vfsTable;
        private VFSManager? _vfsManager;
        private DirectoryManager? _directoryManager;
        private PDEEntry? _rootEntry;
        private string? _filePath;
        private long _fileSize;

        private readonly Dictionary<ulong, byte[]> _modifiedData = [];
        private readonly Dictionary<ulong, byte[]> _newData = [];
        private long _totalFileSize;
        private string? _exportDirectory;

        public bool HasUnsavedChanges { get; private set; }
        public PDEEntry? RootEntry => _rootEntry;
        public string ExportDirectory => _exportDirectory ?? string.Empty;
        public long FileSize => _totalFileSize;

        public static async Task<PDEWriter> CreateAsync(string filePath)
        {
            var writer = new PDEWriter();
            await writer.LoadAsync(filePath);
            return writer;
        }

        private PDEWriter() { }

        private async Task LoadAsync(string filePath)
        {
            _filePath = filePath;
            _fileSize = new FileInfo(filePath).Length;
            _totalFileSize = _fileSize;

            Log($"[LoadAsync] 文件路径: {filePath}");
            Log($"[LoadAsync] 文件大小: {_fileSize} bytes (0x{_fileSize:X})");

            string fileName = Path.GetFileNameWithoutExtension(filePath);
            string dir = Path.GetDirectoryName(filePath) ?? "";
            _exportDirectory = Path.Combine(dir, fileName + "_edit");

            _fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
            _binaryReader = new BinaryReader(_fileStream);

            await ExtractVFSTableAsync();

            Log($"[LoadAsync] VFS表大小: {_vfsTable!.Length} bytes");
            LogVfsTablePreview();

            _vfsManager = new VFSManager(_vfsTable);
            _directoryManager = new DirectoryManager(_vfsManager, this);

            _rootEntry = await ParseRootDirectory();

            Log($"[LoadAsync] 根目录子条目数: {_rootEntry.Children.Count}");
        }

        public byte[] ReadFileData(ulong offset, uint size)
        {
            if (_modifiedData.TryGetValue(offset, out byte[]? cachedData) && cachedData != null)
            {
                if (cachedData.Length >= size)
                {
                    byte[] result = new byte[size];
                    Array.Copy(cachedData, 0, result, 0, size);
                    return result;
                }
            }

            if (_newData.TryGetValue(offset, out byte[]? newData) && newData != null)
            {
                if (newData.Length >= size)
                {
                    byte[] result = new byte[size];
                    Array.Copy(newData, 0, result, 0, size);
                    return result;
                }
            }

            if (offset >= (ulong)_fileSize)
            {
                return new byte[size];
            }

            lock (_fileStream!)
            {
                _fileStream!.Seek((long)offset, SeekOrigin.Begin);
                uint readSize = size;
                if (offset + size > (ulong)_fileSize)
                {
                    readSize = (uint)(_fileSize - (long)offset);
                }

                byte[] data = _binaryReader!.ReadBytes((int)readSize);
                PDEKey.XorData(data, offset);

                if (data.Length < size)
                {
                    byte[] fullData = new byte[size];
                    Array.Copy(data, 0, fullData, 0, data.Length);
                    return fullData;
                }

                return data;
            }
        }

        public byte[] ReadEntryData(ulong rawOffset, uint size)
        {
            Log($"[ReadEntryData] rawOffset={rawOffset} (0x{rawOffset:X}), size={size} (0x{size:X})");

            if (size <= BLOCK_SIZE)
            {
                ulong realOffset = VFSManager.RawToRealOffset(rawOffset);
                Log($"[ReadEntryData] 单块读取, realOffset=0x{realOffset:X}");
                return ReadFileData(realOffset, size);
            }

            Log($"[ReadEntryData] 多块读取, 需要VFS链");
            return ReadDataWithVFSChain(rawOffset, size);
        }

        private byte[] ReadDataWithVFSChain(ulong rawOffset, uint size)
        {
            List<byte> result = [];
            ulong currentRawOffset = rawOffset;
            uint remaining = size;
            int blockIndex = 0;

            Log($"[ReadDataWithVFSChain] 开始读取, rawOffset={rawOffset}, 总大小={size}");

            while (remaining > 0)
            {
                ulong realOffset = VFSManager.RawToRealOffset(currentRawOffset);
                uint readSize = Math.Min(BLOCK_SIZE, remaining);

                // 读取当前块的VFS值
                uint vfsValue = GetVFSValue(currentRawOffset);
                Log($"[ReadDataWithVFSChain] 块#{blockIndex}: rawOffset={currentRawOffset}, realOffset=0x{realOffset:X}, VFS值=0x{vfsValue:X08}");

                byte[] chunk = ReadFileData(realOffset, readSize);
                result.AddRange(chunk);

                remaining -= readSize;
                blockIndex++;

                // 从 VFS 表获取下一个块的原始偏移量
                if (remaining > 0)
                {
                    ulong nextOffset = GetNextVFSOffset(currentRawOffset);
                    Log($"[ReadDataWithVFSChain] 下一个块rawOffset={nextOffset}");
                    if (nextOffset == ulong.MaxValue)
                    {
                        Log($"[ReadDataWithVFSChain] 警告: VFS链中断，剩余{remaining}字节未读取");
                        break;
                    }
                    currentRawOffset = nextOffset;
                }
            }

            Log($"[ReadDataWithVFSChain] 完成，读取了{blockIndex}个块，共{result.Count}字节");
            return [.. result];
        }

        /// <summary>
        /// 获取VFS表中的原始值
        /// </summary>
        private uint GetVFSValue(ulong rawOffset)
        {
            // 计算在 VFS 表中的位置
            // final_offset = ((file_offset >> 10) * 0x1000) + ((file_offset & 0x3FF) * 4)
            ulong blockIndex = rawOffset >> 10;
            ulong blockOffset = (rawOffset & 0x3FF) * 4;
            ulong vfsEntryOffset = blockIndex * BLOCK_SIZE + blockOffset;

            if (vfsEntryOffset + 4 > (ulong)_vfsTable!.Length)
            {
                return 0x80000000;
            }

            // 读取小端序 4 字节值
            return (uint)(
                (_vfsTable![vfsEntryOffset + 3] << 24) |
                (_vfsTable[vfsEntryOffset + 2] << 16) |
                (_vfsTable[vfsEntryOffset + 1] << 8) |
                _vfsTable[vfsEntryOffset]);
        }

        /// <summary>
        /// 从 VFS 表中读取下一个块的原始偏移量
        /// 对应 C++ 版本的 CalculateVfsValue
        /// </summary>
        private ulong GetNextVFSOffset(ulong rawOffset)
        {
            uint vfsValue = GetVFSValue(rawOffset);

            // 返回下一个块的原始偏移量（去掉最高位标记）
            uint nextOffset = vfsValue & 0x7FFFFFFF;

            // 如果值为0，表示这是条目的第一个块，没有下一个块
            if (nextOffset == 0)
            {
                return ulong.MaxValue;
            }

            return nextOffset;
        }

        private async Task ExtractVFSTableAsync()
        {
            long vfsSize = 0;
            long offset = 0;
            while (offset < _fileSize)
            {
                vfsSize += (int)BLOCK_SIZE;
                offset += (int)BLOCK_SIZE;
                offset += (int)DATA_SEGMENT_SIZE;
            }

            _vfsTable = new byte[vfsSize];

            long vfsOffset = 0;
            offset = 0;
            while (offset < _fileSize)
            {
                uint readSize = BLOCK_SIZE;
                if (offset + readSize > _fileSize)
                {
                    readSize = (uint)(_fileSize - offset);
                }

                _fileStream!.Seek(offset, SeekOrigin.Begin);
                int bytesRead = await _fileStream.ReadAsync(_vfsTable!.AsMemory((int)vfsOffset, (int)readSize));

                PDEKey.XorData(_vfsTable, (int)vfsOffset, bytesRead, (ulong)offset);

                vfsOffset += bytesRead;
                offset += (int)BLOCK_SIZE;
                offset += (int)DATA_SEGMENT_SIZE;

                if (offset >= _fileSize) break;
            }
        }

        private async Task<PDEEntry> ParseRootDirectory()
        {
            return await Task.Run(() =>
            {
                var entries = _directoryManager!.ReadDirectory(0, ROOT_DIR_SIZE);
                var rootEntry = new PDEEntry
                {
                    Type = EntryType.Directory,
                    Name = "Root",
                    Offset = 0,
                    Size = ROOT_DIR_SIZE,
                    Children = entries,
                    IsLoaded = true
                };

                foreach (var entry in entries)
                {
                    entry.Parent = rootEntry;
                    if (entry.IsDirectory)
                    {
                        entry.Children = [];
                        entry.IsLoaded = false;
                    }
                    else
                    {
                        entry.IsLoaded = true;
                    }
                }

                return rootEntry;
            });
        }

        public void LoadDirectory(PDEEntry directory)
        {
            if (directory == null || !directory.IsDirectory) return;

            if (IsDirectoryLoaded(directory)) return;

            try
            {
                var entries = _directoryManager!.ReadDirectory(directory.Offset, directory.Size);

                directory.Children.Clear();
                foreach (var entry in entries)
                {
                    entry.Parent = directory;
                    directory.Children.Add(entry);

                    if (entry.IsDirectory)
                    {
                        entry.Children = [];
                        entry.IsLoaded = false;
                    }
                    else
                    {
                        entry.IsLoaded = true;
                    }
                }

                directory.IsLoaded = true;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Load directory failed: {directory.Name} - {ex.Message}");
            }
        }

        public static bool IsDirectoryLoaded(PDEEntry directory)
        {
            if (directory == null || !directory.IsDirectory) return true;
            return directory.IsLoaded;
        }

        public byte[] ExtractFile(PDEEntry entry)
        {
            if (entry == null || entry.IsDirectory)
            {
                return [];
            }

            return ReadEntryData(entry.Offset, entry.Size);
        }

        private static void Log(string message)
        {
            System.Diagnostics.Debug.WriteLine(message);
            System.Console.WriteLine(message);
        }

        private void LogVfsTablePreview()
        {
            Log("[VFS表] 前32个条目:");
            for (int i = 0; i < 32 && i * 4 + 4 <= _vfsTable!.Length; i++)
            {
                uint value = (uint)(
                    (_vfsTable[i * 4 + 3] << 24) |
                    (_vfsTable[i * 4 + 2] << 16) |
                    (_vfsTable[i * 4 + 1] << 8) |
                    _vfsTable[i * 4]);
                Log($"  [{i,3}] rawOffset={i,4}: 0x{value:X08}");
            }
        }

        public void Dispose()
        {
            _binaryReader?.Dispose();
            _fileStream?.Dispose();
            GC.SuppressFinalize(this);
        }
    }
}
