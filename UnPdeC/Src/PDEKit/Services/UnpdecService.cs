using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;

namespace PDEKit.Services;

/// <summary>
/// PDE 解包核心服务
/// 移植自 UnPdeC 的 Tools + VFSTable + Extract + RecursiveMode + RecursiveHelpers
/// </summary>
public static class UnpdecService
{
    #region 常量

    private const uint VFS_OFFSET_SHIFT = 0xA;
    private const uint VFS_PAGE_SIZE = 0x1000;
    private const uint VFS_PAGE_MASK = 0x3FF;
    private const uint VFS_VALUE_MASK = 0x7FFFFFFF;
    private const uint VFS_TABLE_SKIP = 0x400000;
    private const uint UINT32_SIZE = 4;

    private const uint CONTROL_WORD_SIZE = 4;
    private const uint FIRST_8_BYTES = 8;
    private const byte FLAG_OFFSET = 0x18;
    private const byte TYPE_6F_OFFSET = 0x21;
    private const byte TYPE_6F_SIZE_OFFSET = 0x1D;
    private const byte TYPE_6D_OFFSET = 0x1B;
    private const byte TYPE_6D_SIZE_OFFSET = 0x1A;
    private const byte TYPE_UNCOMPRESSED_OFFSET = 0x29;
    private const byte TYPE_UNCOMPRESSED_WITH_HEADER_OFFSET = 0x21;
    private const byte FLAG_TYPE_6F = 0x6F;
    private const byte FLAG_TYPE_6D = 0x6D;

    private static readonly byte[] ByteLimit = [4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0];

    #endregion

    #region 数据结构

    public enum ExtractModeEnum
    {
        /// <summary>混合模式（推荐）：mesh/skel/anim/physx 保留前8字节</summary>
        Mixed = 0,
        /// <summary>递归模式：删除全部前8字节</summary>
        Recursive = 1,
        /// <summary>保留模式：保留全部前8字节</summary>
        KeepFirst8 = 2,
        /// <summary>缓存模式：保留 .cache 文件，不进行二次解压</summary>
        Cache = 3,
    }

    public class UnpackContext
    {
        public string XorFilePath = "";
        public string XorFileName = "";
        public string RootDirName = "";
        public string OutputDir = "";
        public byte[] VfsTablesArr = [];
        public ExtractModeEnum ExtractMode = ExtractModeEnum.Mixed;

        /// <summary>
        /// 是否为缓存模式（ExtractMode == Cache）
        /// </summary>
        public bool CacheMode => ExtractMode == ExtractModeEnum.Cache;
        public long TotalFiles;
        public long ProcessedFiles;
    }

    public class ProgressInfo
    {
        public string CurrentFile { get; init; } = "";
        public long ProcessedFiles { get; init; }
        public long TotalFiles { get; init; }
        public string Phase { get; init; } = "";
        public bool IsCompleted { get; init; }
        public string? ErrorMessage { get; init; }
    }

    private struct HexOffsetInfo
    {
        public byte Type;          // 1=文件，2=目录
        public string Name = "";
        public long UnixTime;
        public uint Size;
        public uint OriginalOffset;

        public HexOffsetInfo() { }
    }

    private struct DirectoryPair
    {
        public string ParentDir;
        public string CurrentDir;

        public DirectoryPair(string parent, string current)
        {
            ParentDir = parent;
            CurrentDir = current;
        }
    }

    #endregion

    #region 公共 API

    /// <summary>
    /// 执行 PDE 解包
    /// </summary>
    public static async Task<bool> UnpackAsync(string xorFilePath, string outputBaseDir,
        ExtractModeEnum extractMode, Action<ProgressInfo>? onProgress = null)
    {
        return await Task.Run(() =>
        {
            var ctx = new UnpackContext
            {
                XorFilePath = xorFilePath,
                XorFileName = Path.GetFileNameWithoutExtension(xorFilePath),
                OutputDir = outputBaseDir,
                ExtractMode = extractMode,
            };

            // 根据解压模式生成输出目录名（与 C++ 原版一致）
            ctx.RootDirName = BuildOutputDirectoryName(ctx);
            string fullOutputDir = Path.Combine(ctx.OutputDir, ctx.RootDirName);

            try
            {
                using var mapper = new MemoryMapperService();

                // 阶段1：初始化输出目录
                onProgress?.Invoke(new ProgressInfo { Phase = $"初始化输出目录: {ctx.RootDirName}..." });
                if (!Directory.Exists(fullOutputDir))
                    Directory.CreateDirectory(fullOutputDir);

                // 阶段2：打开文件并加载 VFS 表
                onProgress?.Invoke(new ProgressInfo { Phase = "加载 VFS 表..." });
                mapper.OpenFile(xorFilePath);
                if (!DumpVfsTable(ctx, mapper))
                {
                    onProgress?.Invoke(new ProgressInfo { IsCompleted = true, ErrorMessage = "VFS 表加载失败" });
                    return false;
                }

                // 阶段3：递归提取
                onProgress?.Invoke(new ProgressInfo { Phase = "开始递归提取..." });
                var rootDir = new DirectoryPair(ctx.RootDirName, ctx.RootDirName);
                TryExtract(ctx, mapper, 0, 0x1000, rootDir, onProgress);

                onProgress?.Invoke(new ProgressInfo
                {
                    Phase = "解包完成",
                    ProcessedFiles = ctx.ProcessedFiles,
                    TotalFiles = ctx.TotalFiles,
                    IsCompleted = true
                });
                return true;
            }
            catch (Exception ex)
            {
                onProgress?.Invoke(new ProgressInfo { IsCompleted = true, ErrorMessage = ex.Message });
                return false;
            }
        });
    }

    /// <summary>
    /// 根据缓存模式和解压模式生成输出目录名
    /// 移植自 C++ 的 OutputDirectoryNameImpl
    /// </summary>
    private static string BuildOutputDirectoryName(UnpackContext ctx)
    {
        string baseName = ctx.XorFileName;
        string cacheSuffix = ctx.CacheMode ? "_cache" : "_nocache";
        string extractSuffix = ctx.ExtractMode switch
        {
            ExtractModeEnum.Cache => "",
            ExtractModeEnum.KeepFirst8 => "_k8byte",
            ExtractModeEnum.Recursive => "_r8byte",
            _ => "_m8byte"
        };

        return baseName + cacheSuffix + extractSuffix;
    }

    #endregion

    #region VFS 表处理

    private static bool DumpVfsTable(UnpackContext ctx, MemoryMapperService mapper)
    {
        try
        {
            long fileSize = mapper.FileSize;
            var readBlocks = new List<(long offset, int size)>();
            var offsets = new List<long>();

            long offset = 0;
            while (offset < fileSize)
            {
                offsets.Add(offset);
                int readSize = (int)VFS_PAGE_SIZE;
                if (offset + readSize > fileSize)
                    readSize = (int)(fileSize - offset);

                readBlocks.Add((offset, readSize));
                offset += VFS_PAGE_SIZE + VFS_TABLE_SKIP;

                if (offset >= fileSize) break;
            }

            var vfsDataChunks = mapper.ReadMultipleBlocks(readBlocks);
            var tempVfs = new List<byte>();

            for (int i = 0; i < vfsDataChunks.Count; i++)
            {
                tempVfs.AddRange(vfsDataChunks[i]);
            }

            ctx.VfsTablesArr = tempVfs.ToArray();
            return ctx.VfsTablesArr.Length > 0;
        }
        catch
        {
            return false;
        }
    }

    private static byte[] ReadDataFromXor(UnpackContext ctx, MemoryMapperService mapper, ulong vfsOffset, long blockSize)
    {
        var vfsOffsets = CalculateVfsOffsets(ctx, blockSize, vfsOffset);

        uint lastOffsetSize = (uint)(blockSize % VFS_PAGE_SIZE);
        if (lastOffsetSize == 0)
            lastOffsetSize = VFS_PAGE_SIZE;

        mapper.OpenFile(ctx.XorFilePath);
        long fileSize = mapper.FileSize;

        var readBlocks = new List<(long offset, int size)>();
        var realOffsets = new List<long>();

        for (int i = 0; i < vfsOffsets.Count; i++)
        {
            long realOffset = RawToRealOffset((long)vfsOffsets[i]);
            int readSize = (i == vfsOffsets.Count - 1) ? (int)lastOffsetSize : (int)VFS_PAGE_SIZE;

            if (realOffset >= fileSize) continue;
            if (realOffset + readSize > fileSize)
                readSize = (int)(fileSize - realOffset);

            readBlocks.Add((realOffset, readSize));
            realOffsets.Add(realOffset);
        }

        var chunks = mapper.ReadMultipleBlocks(readBlocks);
        var result = new List<byte>((int)blockSize);
        foreach (var chunk in chunks)
            result.AddRange(chunk);

        return result.ToArray();
    }

    private static ulong CalculateVfsValue(UnpackContext ctx, ulong fileOffset)
    {
        if (ctx.VfsTablesArr.Length == 0)
            throw new InvalidOperationException("VFS表未加载或为空");

        ulong finalOffset = ((fileOffset >> (int)VFS_OFFSET_SHIFT) * VFS_PAGE_SIZE) + ((fileOffset & VFS_PAGE_MASK) * UINT32_SIZE);

        if (finalOffset >= (ulong)ctx.VfsTablesArr.Length || finalOffset + UINT32_SIZE > (ulong)ctx.VfsTablesArr.Length)
            throw new InvalidOperationException("偏移量超出数组范围");

        int idx = (int)finalOffset;
        uint pde = (uint)(ctx.VfsTablesArr[idx + 3] << 24 |
                          ctx.VfsTablesArr[idx + 2] << 16 |
                          ctx.VfsTablesArr[idx + 1] << 8 |
                          ctx.VfsTablesArr[idx]);

        return pde & VFS_VALUE_MASK;
    }

    private static List<ulong> CalculateVfsOffsets(UnpackContext ctx, long fileSize, ulong fileOffset)
    {
        var vfsOffsets = new List<ulong>();

        if (fileSize <= VFS_PAGE_SIZE)
        {
            vfsOffsets.Add(fileOffset);
        }
        else
        {
            long vfsOffsetCount = (fileSize / (long)VFS_PAGE_SIZE) + (fileSize % VFS_PAGE_SIZE != 0 ? 1L : 0L);
            vfsOffsets.Add(fileOffset);

            for (int i = 1; i < vfsOffsetCount; i++)
            {
                ulong vfsVal = CalculateVfsValue(ctx, fileOffset);
                vfsOffsets.Add(vfsVal);
                fileOffset = vfsVal;
            }
        }

        return vfsOffsets;
    }

    private static long RawToRealOffset(long origOffset)
    {
        long shifted = origOffset >> 10;
        long intermediate = origOffset + shifted + 1;
        return intermediate << 12;
    }

    // ulong overload
    private static long RawToRealOffset(ulong origOffset) => RawToRealOffset((long)origOffset);

    #endregion

    #region 递归提取

    private static void TryExtract(UnpackContext ctx, MemoryMapperService mapper, uint offset, uint size,
        DirectoryPair directory, Action<ProgressInfo>? onProgress)
    {
        var entries = ReadOffsetInfo(ctx, mapper, offset, size);
        DispatchEntries(ctx, mapper, entries, directory, onProgress);
    }

    private static List<HexOffsetInfo> ReadOffsetInfo(UnpackContext ctx, MemoryMapperService mapper, uint offset, uint size)
    {
        var data = ReadDataFromXor(ctx, mapper, offset, size);
        return ParseOffsetInfo(data);
    }

    private static List<HexOffsetInfo> ParseOffsetInfo(byte[] data)
    {
        const int blockSize = 0x80;
        const int maxNameLength = 0x6F;
        const int ntfsTimeOffset = 0x70;
        const ulong windowsTick = 10000000UL;
        const ulong secToUnixEpoch = 11644473600UL;

        int blockCount = data.Length / blockSize;
        var offsetInfos = new List<HexOffsetInfo>(blockCount);

        for (int blockIndex = 0; blockIndex < blockCount; blockIndex++)
        {
            int blockStart = blockIndex * blockSize;
            byte entryType = data[blockStart];

            if (entryType != 1 && entryType != 2) continue;

            // 查找名称结束位置
            int nameEnd = blockStart + 1;
            while (nameEnd < blockStart + blockSize && data[nameEnd] != 0)
                nameEnd++;

            int nameLength = nameEnd - (blockStart + 1);
            if (nameLength == 0 || nameLength >= maxNameLength) continue;

            string entryName = System.Text.Encoding.UTF8.GetString(data, blockStart + 1, nameLength);

            uint originalOffset = BitConverter.ToUInt32(data, blockStart + blockSize - 8);
            uint entrySize = BitConverter.ToUInt32(data, blockStart + blockSize - 4);

            ulong ntfsTime = BitConverter.ToUInt64(data, blockStart + ntfsTimeOffset);
            long unixTime = (long)(ntfsTime / windowsTick - secToUnixEpoch);

            offsetInfos.Add(new HexOffsetInfo
            {
                Type = entryType,
                Name = entryName,
                UnixTime = unixTime,
                Size = entrySize,
                OriginalOffset = originalOffset
            });
        }

        return offsetInfos;
    }

    private static void DispatchEntries(UnpackContext ctx, MemoryMapperService mapper,
        List<HexOffsetInfo> entries, DirectoryPair directory, Action<ProgressInfo>? onProgress)
    {
        string baseDir = Path.Combine(ctx.OutputDir, directory.CurrentDir);

        foreach (var entry in entries)
        {
            try
            {
                if (entry.Type == 1)
                {
                    ProcessFileEntry(ctx, mapper, entry, baseDir, onProgress);
                }
                else if (entry.Type == 2)
                {
                    ProcessDirectoryEntry(ctx, mapper, entry, directory, baseDir, onProgress);
                }
            }
            catch (Exception ex)
            {
                onProgress?.Invoke(new ProgressInfo
                {
                    CurrentFile = entry.Name,
                    ErrorMessage = ex.Message,
                });
            }
        }
    }

    private static void ProcessFileEntry(UnpackContext ctx, MemoryMapperService mapper,
        HexOffsetInfo entry, string baseDir, Action<ProgressInfo>? onProgress)
    {
        var (finalName, needProcessData) = BuildFileProcessPlan(ctx, entry.Name);
        string filePath = Path.Combine(baseDir, finalName);

        if (File.Exists(filePath)) return;

        ctx.TotalFiles++;
        onProgress?.Invoke(new ProgressInfo
        {
            CurrentFile = finalName,
            ProcessedFiles = ctx.ProcessedFiles,
            TotalFiles = ctx.TotalFiles,
            Phase = "提取文件",
        });

        var fileData = ReadDataFromXor(ctx, mapper, entry.OriginalOffset, entry.Size);

        if (fileData.Length != entry.Size || fileData.Length == 0 || string.IsNullOrEmpty(entry.Name))
            return;

        byte[] processedData;
        if (needProcessData)
        {
            processedData = PreExtract(ctx, fileData, entry.Name);
        }
        else
        {
            processedData = fileData;
        }

        // 确保目录存在
        var dir = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            Directory.CreateDirectory(dir);

        if (!File.Exists(filePath))
        {
            File.WriteAllBytes(filePath, processedData);
            SetFileTimestamp(filePath, entry.UnixTime);
        }

        ctx.ProcessedFiles++;
    }

    private static void ProcessDirectoryEntry(UnpackContext ctx, MemoryMapperService mapper,
        HexOffsetInfo entry, DirectoryPair directory, string baseDir, Action<ProgressInfo>? onProgress)
    {
        string dirPath = Path.Combine(baseDir, entry.Name);
        if (!Directory.Exists(dirPath))
            Directory.CreateDirectory(dirPath);

        var nextDir = new DirectoryPair(directory.CurrentDir, Path.Combine(directory.CurrentDir, entry.Name));
        TryExtract(ctx, mapper, entry.OriginalOffset, entry.Size, nextDir, onProgress);
        SetFileTimestamp(dirPath, entry.UnixTime);
    }

    private static (string finalName, bool needProcessData) BuildFileProcessPlan(UnpackContext ctx, string name)
    {
        string finalName = name;
        bool needProcessData = false;

        if (!ctx.CacheMode)
        {
            if (name.EndsWith(".lua.cache", StringComparison.OrdinalIgnoreCase))
            {
                finalName = name[..^10] + ".luac";
                needProcessData = true;
            }
            else if (name.EndsWith(".lua", StringComparison.OrdinalIgnoreCase))
            {
                finalName = name[..^4] + ".luac";
            }
            else if (name.Contains(".cache", StringComparison.OrdinalIgnoreCase))
            {
                int pos = name.IndexOf(".cache", StringComparison.OrdinalIgnoreCase);
                finalName = name[..pos];
                needProcessData = true;
            }
        }

        return (finalName, needProcessData);
    }

    #endregion

    #region 解压算法 (Extract)

    private static byte[] PreExtract(UnpackContext ctx, byte[] compressedData, string fileName)
    {
        if (compressedData.Length <= FLAG_OFFSET)
            throw new InvalidDataException($"数据大小不足，无法读取标识位: {fileName}");

        byte sizeFlag = compressedData[FLAG_OFFSET];

        if ((sizeFlag & 1) != 0)
        {
            byte[] encryptedData;
            uint extractedSize = 0;

            switch (sizeFlag)
            {
                case FLAG_TYPE_6F:
                    if (compressedData.Length <= TYPE_6F_OFFSET)
                        throw new InvalidDataException($"数据大小不足，无法读取 0x6F 类型文件: {fileName}");
                    extractedSize = BitConverter.ToUInt32(compressedData, TYPE_6F_SIZE_OFFSET);
                    encryptedData = compressedData[(int)TYPE_6F_OFFSET..];
                    break;

                case FLAG_TYPE_6D:
                    if (compressedData.Length <= TYPE_6D_OFFSET)
                        throw new InvalidDataException($"数据大小不足，无法读取 0x6D 类型文件: {fileName}");
                    extractedSize = compressedData[TYPE_6D_SIZE_OFFSET];
                    encryptedData = compressedData[(int)TYPE_6D_OFFSET..];
                    break;

                default:
                    throw new InvalidDataException($"未知的解压标识: 0x{sizeFlag:X2}, 文件: {fileName}");
            }

            var extractedData = FinalExtract(encryptedData, extractedSize, fileName);

            bool saveFirst8Byte = ShouldKeepFirst8Bytes(ctx, fileName);
            if (!saveFirst8Byte && extractedData.Length > FIRST_8_BYTES)
            {
                extractedData = extractedData[(int)FIRST_8_BYTES..];
            }

            return extractedData;
        }
        else
        {
            // 未压缩文件
            if (compressedData.Length <= TYPE_UNCOMPRESSED_OFFSET)
            {
                return compressedData;
            }

            bool saveFirst8Byte = ShouldKeepFirst8Bytes(ctx, fileName);
            if (saveFirst8Byte)
            {
                return compressedData[(int)TYPE_UNCOMPRESSED_WITH_HEADER_OFFSET..];
            }
            else
            {
                return compressedData[(int)TYPE_UNCOMPRESSED_OFFSET..];
            }
        }
    }

    private static bool ShouldKeepFirst8Bytes(UnpackContext ctx, string fileName)
    {
        if (ctx.ExtractMode == ExtractModeEnum.KeepFirst8)
            return true;

        if (ctx.ExtractMode == ExtractModeEnum.Mixed)
        {
            string lower = fileName.ToLowerInvariant();
            return lower.EndsWith(".mesh.cache") ||
                   lower.EndsWith(".skel.cache") ||
                   lower.EndsWith(".anim.cache") ||
                   lower.EndsWith(".physx.cache");
        }

        return false;
    }

    private static byte[] FinalExtract(byte[] compressedData, uint extractedSize, string fileName)
    {
        var extractedData = new byte[extractedSize];
        uint controlWord = 1;
        uint sourceIndex = 0;
        uint destIndex = 0;

        while (destIndex < extractedSize)
        {
            // 更新控制字
            if (controlWord == 1)
            {
                if (sourceIndex + CONTROL_WORD_SIZE > compressedData.Length) break;
                controlWord = Get4Byte(compressedData, sourceIndex);
                sourceIndex += CONTROL_WORD_SIZE;
            }

            if (sourceIndex + CONTROL_WORD_SIZE > compressedData.Length) break;
            uint currentData = Get4Byte(compressedData, sourceIndex);

            if ((controlWord & 1) == 0)
            {
                // 复制模式
                if (destIndex >= extractedSize - 10) break;

                BitConverter.TryWriteBytes(new Span<byte>(extractedData, (int)destIndex, 4), currentData);

                uint bytesToCopy = ByteLimit[controlWord & 0xF];
                destIndex += bytesToCopy;
                sourceIndex += bytesToCopy;
                controlWord >>= (int)bytesToCopy;
            }
            else
            {
                // 反向引用模式
                controlWord >>= 1;
                uint savedControlWord = controlWord;

                var info = ParseBackReference(currentData);
                sourceIndex += info.bytesConsumed;

                uint referenceIndex = destIndex - info.offset;
                if (referenceIndex >= extractedData.Length) break;

                for (uint i = 0; i < info.length; i++)
                {
                    if (destIndex + i >= extractedData.Length || referenceIndex + i >= extractedData.Length) break;
                    extractedData[destIndex + i] = extractedData[referenceIndex + i];
                }

                destIndex += info.length;
                controlWord = savedControlWord;
            }
        }

        // 处理剩余数据
        while (destIndex < extractedSize)
        {
            if (controlWord == 1)
            {
                if (sourceIndex + 4 > compressedData.Length) break;
                controlWord = 0x80000000;
                sourceIndex += 4;
            }
            if (sourceIndex >= compressedData.Length) break;
            extractedData[destIndex] = compressedData[sourceIndex];
            destIndex++;
            sourceIndex++;
            controlWord >>= 1;
        }

        return extractedData;
    }

    private static (uint offset, uint length, uint bytesConsumed) ParseBackReference(uint data)
    {
        if ((data & 3) != 0)
        {
            if ((data & 2) != 0)
            {
                if ((data & 1) != 0)
                {
                    if ((data & 0x7F) == 3)
                    {
                        return (data >> 15, ((data >> 7) & 0xFF) + 3, 4);
                    }
                    else
                    {
                        return ((data >> 7) & 0x1FFFF, ((data >> 2) & 0x1F) + 2, 3);
                    }
                }
                else
                {
                    return ((data >> 6) & 0x3FF, ((data >> 2) & 0xF) + 3, 2);
                }
            }
            else
            {
                return ((data >> 2) & 0x3FFF, 3, 2);
            }
        }
        else
        {
            return ((data >> 2) & 0x3F, 3, 1);
        }
    }

    private static uint Get4Byte(byte[] data, long offset)
    {
        return BitConverter.ToUInt32(data, (int)offset);
    }

    #endregion

    #region 文件时间戳

    private static void SetFileTimestamp(string path, long unixTime)
    {
        try
        {
            var dateTime = DateTimeOffset.FromUnixTimeSeconds(unixTime).DateTime;
            File.SetCreationTime(path, dateTime);
            File.SetLastAccessTime(path, dateTime);
            File.SetLastWriteTime(path, dateTime);
        }
        catch { }
    }

    #endregion
}
