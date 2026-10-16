using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using PDEView.Models;

namespace PDEView.Services
{
    public class DirectoryManager
    {
        private const int ENTRY_SIZE = 0x80;
        private const int MAX_NAME_LENGTH = 110;
        private const uint BLOCK_SIZE = 0x1000;

        private readonly PDEWriter _writer;

        public DirectoryManager(VFSManager vfsManager, PDEWriter writer)
        {
            _writer = writer;
        }

        public List<PDEEntry> ReadDirectory(ulong rawOffset, uint size)
        {
            Log($"[ReadDirectory] 开始读取目录: rawOffset={rawOffset}, size={size}");
            List<PDEEntry> entries = new List<PDEEntry>();

            if (_writer == null) return entries;

            try
            {
                byte[] dirData = _writer.ReadEntryData(rawOffset, size);

                if (dirData == null || dirData.Length == 0)
                {
                    Log($"[ReadDirectory] 目录数据为空");
                    return entries;
                }

                Log($"[ReadDirectory] 读取到 {dirData.Length} 字节数据");
                int entryCount = dirData.Length / ENTRY_SIZE;
                Log($"[ReadDirectory] 预计条目数: {entryCount}");

                for (int i = 0; i < entryCount; i++)
                {
                    int entryOffset = i * ENTRY_SIZE;

                    byte entryType = dirData[entryOffset];
                    
                    // 按照C++版本的逻辑：只检查类型是否为1或2，不是则continue（不是break）
                    if (entryType != 1 && entryType != 2)
                    {
                        continue;
                    }

                    // 从第1字节开始查找'\0'作为名称结束位置
                    int nameEnd = entryOffset + 1;
                    while (nameEnd < entryOffset + ENTRY_SIZE && dirData[nameEnd] != 0)
                    {
                        nameEnd++;
                    }
                    int nameLength = nameEnd - (entryOffset + 1);

                    // 名称为空或超出允许长度时视为无效条目
                    if (nameLength == 0 || nameLength >= MAX_NAME_LENGTH)
                    {
                        continue;
                    }

                    string entryName = Encoding.UTF8.GetString(dirData, entryOffset + 1, nameLength);

                    // 从NTFS时间戳字段转换为Unix时间戳
                    ulong ntfsTime = BitConverter.ToUInt64(dirData, entryOffset + 0x70);
                    long unixTime = ConvertNtfsTimeToUnix(ntfsTime);

                    // 读取偏移量和大小（与C++版本一致，不做额外验证）
                    uint entryDataOffset = BitConverter.ToUInt32(dirData, entryOffset + ENTRY_SIZE - 8);
                    uint entrySize = BitConverter.ToUInt32(dirData, entryOffset + ENTRY_SIZE - 4);
                    
                    Log($"[ReadDirectory] 条目#{i}: 类型={entryType}, 名称={entryName}, Offset={entryDataOffset}, Size={entrySize}");

                    entries.Add(new PDEEntry
                    {
                        Type = (EntryType)entryType,
                        Name = entryName,
                        UnixTime = unixTime,
                        Size = entrySize,
                        Offset = entryDataOffset
                    });
                }
                
                Log($"[ReadDirectory] 解析完成，有效条目数: {entries.Count}");
            }
            catch (Exception ex)
            {
                Log($"[ReadDirectory] 错误: {ex.Message}");
                System.Diagnostics.Debug.WriteLine($"Read directory failed: {ex.Message}");
            }

            return entries;
        }

        private void Log(string message)
        {
            System.Diagnostics.Debug.WriteLine(message);
            System.Console.WriteLine(message);
        }
        
        private long ConvertNtfsTimeToUnix(ulong ntfsTime)
        {
            const ulong WINDOWS_TICK = 10000000UL;
            const ulong SEC_TO_UNIX_EPOCH = 11644473600UL;

            ulong secondsSince1601 = ntfsTime / WINDOWS_TICK;
            return (long)(secondsSince1601 - SEC_TO_UNIX_EPOCH);
        }

        public byte[] CreateEntryBytes(PDEEntry entry)
        {
            byte[] entryBytes = new byte[ENTRY_SIZE];

            entryBytes[0] = (byte)entry.Type;

            byte[] nameBytes = Encoding.UTF8.GetBytes(entry.Name);
            if (nameBytes.Length > MAX_NAME_LENGTH)
            {
                throw new ArgumentException($"Name too long: {entry.Name} (max {MAX_NAME_LENGTH} bytes)");
            }
            Array.Copy(nameBytes, 0, entryBytes, 1, nameBytes.Length);

            ulong ntfsTime = ConvertUnixToNtfsTime(entry.UnixTime);
            byte[] timeBytes = BitConverter.GetBytes(ntfsTime);
            Array.Copy(timeBytes, 0, entryBytes, 0x70, 8);

            byte[] offsetBytes = BitConverter.GetBytes(entry.Offset);
            Array.Copy(offsetBytes, 0, entryBytes, ENTRY_SIZE - 8, 4);

            byte[] sizeBytes = BitConverter.GetBytes(entry.Size);
            Array.Copy(sizeBytes, 0, entryBytes, ENTRY_SIZE - 4, 4);

            return entryBytes;
        }

        private ulong ConvertUnixToNtfsTime(long unixTime)
        {
            const ulong WINDOWS_TICK = 10000000UL;
            const ulong SEC_TO_UNIX_EPOCH = 11644473600UL;

            ulong secondsSince1601 = (ulong)unixTime + SEC_TO_UNIX_EPOCH;
            return secondsSince1601 * WINDOWS_TICK;
        }
    }
}
