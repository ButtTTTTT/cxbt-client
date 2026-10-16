using ReCache.Models;
using System.IO;

namespace ReCache.Services;

/// <summary>
/// 打包进度报告
/// </summary>
public class PackProgress {
    public int Percent { get; set; }
    public string Stage { get; set; } = "";
    public long BytesProcessed { get; set; }
    public long TotalBytes { get; set; }
}

/// <summary>
/// .cache 文件打包器
/// 
/// .cache 文件结构:
/// ┌──────────┬──────────────────────────────────────────────────┐
/// │ 偏移      │ 内容                                              │
/// ├──────────┼──────────────────────────────────────────────────┤
/// │ 0x00-0x03│ 文件类型标识                                      │
/// │ 0x04-0x07│ 固定值 0x00010002                                 │
/// │ 0x08-0x0B│ 未知（通常为0）                                    │
/// │ 0x0C-0x0F│ 区间数据大小（从0x18到文件末尾的大小）               │
/// │ 0x10-0x13│ CRC32校验码 (大端序)                               │
/// │ 0x14-0x17│ 文件数量（通常为1）                                │
/// │ 0x18     │ sizeFlag: 0x6F (压缩) / 0x6E (不压缩)             │
/// ├──────────┴──────────────────────────────────────────────────┤
/// │ 当 sizeFlag = 0x6F (压缩):                                  │
/// │   0x19-0x1C: 区间大小 (4字节) = 压缩数据大小 + 9              │
/// │   0x1D-0x20: 原始文件大小 (4字节)                             │
/// │   0x21-End: 压缩数据                                         │
/// ├─────────────────────────────────────────────────────────────┤
/// │ 当 sizeFlag = 0x6E (不压缩):                                │
/// │   0x19-0x1C: 区间大小 (4字节)                                 │
/// │   0x1D-0x20: 数据大小                                        │
/// │   0x21-0x28: 8字节填充                                       │
/// │   0x29-End: 原始数据                                         │
/// └─────────────────────────────────────────────────────────────┘
/// </summary>
public static class CachePacker {
    // 文件格式常量
    public const uint FIXED_VALUE = 0x00010002u;
    public const byte SIZE_FLAG_COMPRESSED = 0x6F;
    public const byte SIZE_FLAG_UNCOMPRESSED = 0x6E;
    public const int HEADER_SIZE = 0x18;
    public const int CRC_OFFSET = 0x10;
    public const int FILE_COUNT_OFFSET = 0x14;
    public const int SIZE_FLAG_OFFSET = 0x18;
    
    // 日志相关
    private static readonly string _logPath = Path.Combine(Path.GetTempPath(), "ReCache_Packer.log");
    private static readonly object _logLock = new();
    
    private static void Log(string message) {
        lock (_logLock) {
            string timestamp = DateTime.Now.ToString("HH:mm:ss.fff");
            string logMessage = $"[{timestamp}] {message}";
            System.Diagnostics.Debug.WriteLine(logMessage);
            File.AppendAllText(_logPath, logMessage + "\n");
        }
    }
    /// <summary>
    /// 从原始 .cache 文件读取头部信息（仅前 8 字节和 CRC32）
    /// sizeFlag 不参考，因为修改后的文件大小可能变化很大
    /// </summary>
    /// <param name="cachePath">原始 .cache 文件路径</param>
    /// <returns>包含头部信息的 PackOptions，如果读取失败返回 null</returns>
    public static PackOptions? ReadOriginalCacheHeader(string cachePath) {
        if (!File.Exists(cachePath)) {
            Log($"ReadOriginalCacheHeader: 文件不存在 - {cachePath}");
            return null;
        }

        try {
            byte[] header = new byte[0x14]; // 只读取前 20 字节（0x00-0x13）
            using (var fs = new FileStream(cachePath, FileMode.Open, FileAccess.Read)) {
                if (fs.Read(header, 0, header.Length) < header.Length) {
                    Log($"ReadOriginalCacheHeader: 文件太小 - {cachePath}");
                    return null;
                }
            }

            var options = new PackOptions {
                FileTypeIdentifier = BitConverter.ToUInt32(header, 0x00),
                Crc32 = BitConverter.ToUInt32(header, CRC_OFFSET)
            };
            
            Log($"ReadOriginalCacheHeader: 成功读取 - FileTypeIdentifier=0x{options.FileTypeIdentifier:X8}, Crc32=0x{options.Crc32:X8}");
            return options;
        }
        catch (Exception ex) {
            Log($"ReadOriginalCacheHeader: 读取失败 - {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// 打包文件为 .cache 格式
    /// </summary>
    /// <param name="inputPath">输入文件路径</param>
    /// <param name="outputPath">输出文件路径</param>
    /// <param name="options">打包选项</param>
    /// <param name="progress">进度报告回调（可选）</param>
    /// <param name="cancellationToken">取消令牌（可选）</param>
    /// <returns>打包后的文件大小</returns>
    public static long Pack(string inputPath, string outputPath, PackOptions options, 
        Action<PackProgress>? progress = null, CancellationToken cancellationToken = default) {
        
        var fileInfo = new FileInfo(inputPath);
        long totalBytes = fileInfo.Length;
        
        // 报告进度：读取文件
        progress?.Invoke(new PackProgress { Percent = 0, Stage = "读取文件中...", TotalBytes = totalBytes });
        
        // 检查取消
        cancellationToken.ThrowIfCancellationRequested();
        
        // 读取原始文件
        byte[] fileData = File.ReadAllBytes(inputPath);
        
        // 智能判断是否需要添加8字节头：
        // - 如果待压缩文件前8字节与原始8字节一致，不插入（避免重复）
        // - 如果不一致且勾选了"包含8字节头"，则插入8字节
        if (options.OriginalFirst8Bytes != null && options.OriginalFirst8Bytes.Length == 8) {
            bool alreadyHas8Bytes = fileData.Length >= 8;
            if (alreadyHas8Bytes) {
                for (int i = 0; i < 8; i++) {
                    if (fileData[i] != options.OriginalFirst8Bytes[i]) {
                        alreadyHas8Bytes = false;
                        break;
                    }
                }
            }
            
            if (alreadyHas8Bytes) {
                // 文件已包含8字节头，不插入
                Log($"Pack: 待压缩文件已包含8字节头，跳过插入");
            } else if (options.PrependFirst8Bytes) {
                // 不一致且勾选了，插入8字节头
                Log($"Pack: 在文件数据前插入8字节头 - {Decompressor.FormatHex(options.OriginalFirst8Bytes)}");
                byte[] combinedData = new byte[8 + fileData.Length];
                Array.Copy(options.OriginalFirst8Bytes, 0, combinedData, 0, 8);
                Array.Copy(fileData, 0, combinedData, 8, fileData.Length);
                fileData = combinedData;
            } else {
                Log($"Pack: 8字节头不一致但未勾选包含，不插入");
            }
        }
        
        // 报告进度：读取完成
        progress?.Invoke(new PackProgress { Percent = 20, Stage = "文件已加载", BytesProcessed = totalBytes, TotalBytes = totalBytes });
        
        cancellationToken.ThrowIfCancellationRequested();

        // 如果指定了原始 .cache 文件，尝试从中读取头部信息（仅前 8 字节和 CRC32）
        PackOptions effectiveOptions = options;
        if (!string.IsNullOrEmpty(options.OriginalCachePath) && File.Exists(options.OriginalCachePath)) {
            var originalOptions = ReadOriginalCacheHeader(options.OriginalCachePath);
            if (originalOptions != null) {
                // 合并选项：使用原始 .cache 文件的前 8 字节
                // sizeFlag 不参考，压缩模式由用户选择
                effectiveOptions = new PackOptions {
                    CompressionMode = options.CompressionMode,
                    AddCacheExtension = options.AddCacheExtension,
                    FileTypeIdentifier = originalOptions.FileTypeIdentifier,
                    Crc32 = options.Crc32, // CRC 由用户决定是否重新计算
                    RootPath = options.RootPath,
                    OriginalFirst8Bytes = options.OriginalFirst8Bytes,
                    PrependFirst8Bytes = options.PrependFirst8Bytes
                };
            }
        }
        
        // 报告进度：开始压缩
        progress?.Invoke(new PackProgress { Percent = 30, Stage = "压缩中...", TotalBytes = totalBytes });
        
        cancellationToken.ThrowIfCancellationRequested();

        // 根据压缩模式选择打包方式
        byte[] cacheData = effectiveOptions.CompressionMode == CompressionMode.NoCompression
            ? BuildUncompressed(fileData, effectiveOptions)
            : BuildCompressed(fileData, effectiveOptions);
        
        // 报告进度：压缩完成
        progress?.Invoke(new PackProgress { Percent = 70, Stage = "压缩完成", TotalBytes = totalBytes });
        
        cancellationToken.ThrowIfCancellationRequested();

        // 如果指定了资源根目录，重新计算 CRC
        if (!string.IsNullOrEmpty(options.RootPath) && Directory.Exists(options.RootPath)) {
            progress?.Invoke(new PackProgress { Percent = 80, Stage = "计算CRC中...", TotalBytes = totalBytes });
            
            // 计算 Unix 风格相对路径
            string unixPath = CrcCalculator.ConvertToUnixPath(outputPath, options.RootPath);
            
            // 计算新的 CRC
            uint newCrc = CrcCalculator.CalculateNewCacheCrc(unixPath, cacheData);
            
            // 更新 CRC（偏移 0x10，大端序）
            byte[] crcBytes = BitConverter.GetBytes(newCrc);
            if (BitConverter.IsLittleEndian) {
                // 需要转换为大端序
                Array.Reverse(crcBytes);
            }
            Array.Copy(crcBytes, 0, cacheData, CRC_OFFSET, 4);
        }
        
        // 报告进度：写入文件
        progress?.Invoke(new PackProgress { Percent = 90, Stage = "写入输出文件...", TotalBytes = totalBytes });
        
        cancellationToken.ThrowIfCancellationRequested();

        // 写入输出文件
        File.WriteAllBytes(outputPath, cacheData);
        
        // 报告进度：完成
        progress?.Invoke(new PackProgress { Percent = 100, Stage = "完成", TotalBytes = totalBytes });

        return cacheData.Length;
    }

    /// <summary>
    /// 构建未压缩的 .cache 文件 (sizeFlag = 0x6E)
    /// </summary>
    private static byte[] BuildUncompressed(byte[] data, PackOptions options) {
        // 区间大小 = 数据大小 + 17 (从 0x18 到结尾)
        uint rangeSize = (uint)(data.Length + 17);

        using var ms = new MemoryStream();
        using var writer = new BinaryWriter(ms);

        // 写入公共头部
        WriteCommonHeader(writer, options, rangeSize);
        
        // 0x18: sizeFlag = 0x6E
        writer.Write(SIZE_FLAG_UNCOMPRESSED);
        
        // 0x19-0x1C: 区间大小 (4字节)
        writer.Write(rangeSize);
        
        // 0x1D-0x20: 数据大小
        writer.Write((uint)data.Length);
        
        // 0x21-0x28: 8字节填充
        writer.Write(new byte[8]);
        
        // 0x29-End: 原始数据
        writer.Write(data);
        
        return ms.ToArray();
    }

    /// <summary>
    /// 构建压缩的 .cache 文件 (sizeFlag = 0x6F)
    /// </summary>
    private static byte[] BuildCompressed(byte[] data, PackOptions options) {
        // 压缩数据
        byte[] compressedData = Compressor.Compress(data);

        // 区间大小 = 压缩数据大小 + 9 (从 0x18 到结尾)
        uint rangeSize = (uint)(compressedData.Length + 9);

        using var ms = new MemoryStream();
        using var writer = new BinaryWriter(ms);

        // 写入公共头部
        WriteCommonHeader(writer, options, rangeSize);
        
        // 0x18: sizeFlag = 0x6F
        writer.Write(SIZE_FLAG_COMPRESSED);
        
        // 0x19-0x1C: 区间大小 (4字节)
        writer.Write(rangeSize);
        
        // 0x1D-0x20: 原始文件大小 (4字节)
        writer.Write((uint)data.Length);
        
        // 0x21-End: 压缩数据
        writer.Write(compressedData);
        
        return ms.ToArray();
    }
    
    /// <summary>
    /// 写入公共头部（0x00-0x17）
    /// </summary>
    private static void WriteCommonHeader(BinaryWriter writer, PackOptions options, uint rangeSize) {
        // 0x00-0x03: 文件类型标识
        writer.Write(options.FileTypeIdentifier);
        
        // 0x04-0x07: 固定值
        writer.Write(FIXED_VALUE);
        
        // 0x08-0x0B: 未知
        writer.Write(0u);
        
        // 0x0C-0x0F: 区间数据大小
        writer.Write(rangeSize);
        
        // 0x10-0x13: CRC32 (大端序)
        WriteBigEndian(writer, options.Crc32);
        
        // 0x14-0x17: 文件数量
        writer.Write(1u);
    }

    /// <summary>
    /// 写入大端序的 4 字节值
    /// </summary>
    private static void WriteBigEndian(BinaryWriter writer, uint value) {
        byte[] bytes = BitConverter.GetBytes(value);
        if (BitConverter.IsLittleEndian) {
            Array.Reverse(bytes);
        }
        writer.Write(bytes);
    }

    /// <summary>
    /// 获取推荐的输出路径
    /// </summary>
    public static string GetOutputPath(string inputPath, bool addCacheExtension) {
        string directory = Path.GetDirectoryName(inputPath) ?? "";
        string fileName = Path.GetFileNameWithoutExtension(inputPath);

        if (addCacheExtension) {
            return Path.Combine(directory, fileName + Path.GetExtension(inputPath) + ".cache");
        } else {
            return Path.Combine(directory, fileName + ".cache");
        }
    }
}
