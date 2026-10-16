using System.IO;
using System.Text;
using PDEView.Models;

namespace PDEView.Services;

public class PDELoader : IDisposable
{
    private readonly string _filePath;
    private byte[] _fileData = Array.Empty<byte>();
    private byte[] _vfsTable = Array.Empty<byte>();
    private bool _initialized = false;
    private readonly object _lock = new();

    public PDELoader(string filePath)
    {
        _filePath = filePath;
    }

    private async Task EnsureInitializedAsync()
    {
        if (_initialized) return;

        lock (_lock)
        {
            if (_initialized) return;
        }

        _fileData = await File.ReadAllBytesAsync(_filePath);
        PDEKey.XorData(_fileData);
        ExtractVFSTable();

        lock (_lock)
        {
            _initialized = true;
        }
    }

    public async Task<PDEEntry> LoadAsync()
    {
        await EnsureInitializedAsync();
        return await ParseEntriesAsync(0, 0x1000, null, "");
    }

    private void ExtractVFSTable()
    {
        ulong fileSize = (ulong)_fileData.Length;
        List<byte> vfsTable = new();

        ulong offset = 0;
        while (offset < fileSize)
        {
            uint readSize = 0x1000;
            if (offset + readSize > fileSize)
            {
                readSize = (uint)(fileSize - offset);
            }

            if (offset + readSize <= (ulong)_fileData.Length)
            {
                byte[] chunk = new byte[readSize];
                Array.Copy(_fileData, (long)offset, chunk, 0, (long)readSize);
                vfsTable.AddRange(chunk);
            }

            offset += 0x1000;
            offset += 0x400000;

            if (offset >= fileSize) break;
        }

        _vfsTable = vfsTable.ToArray();
    }

    private async Task<PDEEntry> ParseEntriesAsync(uint offset, uint size, PDEEntry? parent, string currentPath)
    {
        byte[] dataBlock = ReadDataFromVFS(offset, size);
        List<PDEEntry> entries = ParseEntryList(dataBlock, parent, currentPath);

        PDEEntry rootEntry = new PDEEntry
        {
            Type = EntryType.Directory,
            Name = parent == null ? "Root" : "",
            Offset = offset,
            Size = size,
            Parent = parent,
            FullPath = currentPath,
            Children = entries
        };

        foreach (var entry in entries.Where(e => e.IsDirectory))
        {
            try
            {
                var childEntries = await ParseEntriesAsync(entry.Offset, entry.Size, entry, entry.FullPath);
                entry.Children = childEntries.Children;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Parse directory failed: {entry.Name} - {ex.Message}");
            }
        }

        return rootEntry;
    }

    private byte[] ReadDataFromVFS(ulong vfsOffset, ulong blockSize)
    {
        if (blockSize == 0) return Array.Empty<byte>();

        List<byte> result = new();

        if (blockSize <= 0x1000)
        {
            return ReadFromRealOffset(vfsOffset, blockSize);
        }

        ulong blockCount = (blockSize / 0x1000) + (blockSize % 0x1000 > 0 ? 1UL : 0UL);

        ulong currentOffset = vfsOffset;
        for (uint i = 0; i < blockCount; i++)
        {
            uint readSize = (i == blockCount - 1) ? (uint)(blockSize % 0x1000) : 0x1000;
            if (readSize == 0) readSize = 0x1000;

            byte[] chunk = ReadFromRealOffset(currentOffset, readSize);
            result.AddRange(chunk);

            if (i < blockCount - 1)
            {
                currentOffset = CalculateNextVFSOffset(currentOffset);
            }
        }

        return result.ToArray();
    }

    private byte[] ReadFromRealOffset(ulong offset, ulong size)
    {
        ulong realOffset = RawToRealOffset(offset);
        if (realOffset >= (ulong)_fileData.Length)
        {
            return Array.Empty<byte>();
        }
        if (realOffset + size > (ulong)_fileData.Length)
        {
            size = (ulong)_fileData.Length - realOffset;
        }

        if (size > int.MaxValue)
        {
            size = int.MaxValue;
        }

        byte[] data = new byte[size];
        Array.Copy(_fileData, (long)realOffset, data, 0, (long)size);
        return data;
    }

    private ulong CalculateNextVFSOffset(ulong currentOffset)
    {
        ulong vfsValue = CalculateVFSValue(currentOffset);
        return vfsValue;
    }

    private ulong CalculateVFSValue(ulong fileOffset)
    {
        if (_vfsTable.Length == 0) return 0;

        ulong finalOffset = ((fileOffset >> 10) * 0x1000) + ((fileOffset & 0x3FF) * 4);

        if (finalOffset + 3 >= (ulong)_vfsTable.Length)
        {
            return 0;
        }

        uint pde = (uint)((_vfsTable[finalOffset + 3] << 24) |
                         (_vfsTable[finalOffset + 2] << 16) |
                         (_vfsTable[finalOffset + 1] << 8) |
                         _vfsTable[finalOffset]);

        return pde & 0x7FFFFFFF;
    }

    private ulong RawToRealOffset(ulong origOffset)
    {
        ulong shifted = origOffset >> 10;
        ulong intermediate = origOffset + shifted + 1;
        return intermediate << 12;
    }

    private List<PDEEntry> ParseEntryList(byte[] data, PDEEntry? parent, string currentPath)
    {
        const int blockSize = 0x80;
        int blockCount = data.Length / blockSize;
        List<PDEEntry> entries = new();

        for (int i = 0; i < blockCount; i++)
        {
            int blockStart = i * blockSize;

            byte entryType = data[blockStart];
            if (entryType != 1 && entryType != 2) continue;

            int nameEnd = blockStart + 1;
            while (nameEnd < blockStart + blockSize && data[nameEnd] != 0)
            {
                nameEnd++;
            }
            int nameLength = nameEnd - (blockStart + 1);
            if (nameLength == 0 || nameLength >= 0x6f) continue;

            string entryName = Encoding.UTF8.GetString(data, blockStart + 1, nameLength);

            uint entrySize = BitConverter.ToUInt32(data, blockStart + blockSize - 4);
            uint originalOffset = BitConverter.ToUInt32(data, blockStart + blockSize - 8);

            ulong ntfsTime = BitConverter.ToUInt64(data, blockStart + 0x70);
            long unixTime = ConvertNtfsTimeToUnix(ntfsTime);

            string fullPath = string.IsNullOrEmpty(currentPath) ? entryName : $"{currentPath}/{entryName}";

            entries.Add(new PDEEntry
            {
                Type = (EntryType)entryType,
                Name = entryName,
                UnixTime = unixTime,
                Size = entrySize,
                Offset = originalOffset,
                Parent = parent,
                FullPath = fullPath
            });
        }

        return entries;
    }

    private long ConvertNtfsTimeToUnix(ulong ntfsTime)
    {
        const ulong WINDOWS_TICK = 10000000UL;
        const ulong SEC_TO_UNIX_EPOCH = 11644473600UL;

        ulong secondsSince1601 = ntfsTime / WINDOWS_TICK;
        return (long)(secondsSince1601 - SEC_TO_UNIX_EPOCH);
    }

    public async Task<byte[]> ExtractFileAsync(PDEEntry entry)
    {
        if (entry.IsDirectory) return Array.Empty<byte>();

        await EnsureInitializedAsync();

        byte[] data = ReadDataFromVFS(entry.Offset, entry.Size);
        return data;
    }

    public void Dispose()
    {
        _fileData = Array.Empty<byte>();
        _vfsTable = Array.Empty<byte>();
        _initialized = false;
    }
}
