using System.IO;

namespace PDEKit.Services;

/// <summary>
/// FastXOR 服务：使用 PDEKEY 对文件进行异或加密/解密
/// 移植自 FastXOR/Main.cpp，核心逻辑不变
/// </summary>
public static class FastXorService
{
    /// <summary>
    /// PDEKEY 密钥表长度
    /// </summary>
    private const int KeyLength = 0x1000;

    /// <summary>
    /// 缓冲区大小（8MB）
    /// </summary>
    private const int BufferSize = 8 * 1024 * 1024;

    /// <summary>
    /// 生成 PDEKEY 密钥表
    /// 基于逆向得到的汇编逻辑：从初始 EAX=0x42574954 出发，循环乘以 0x7FCF，
    /// 再将 EAX 各字节异或得到 1 字节值，最终填满 0x1000 字节的密钥表。
    /// </summary>
    public static byte[] GeneratePdeKey()
    {
        var key = new byte[KeyLength];
        uint eax = 0x42574954;

        for (int i = 0; i < KeyLength; i++)
        {
            eax *= 0x7FCF;
            key[i] = (byte)((eax >> 24) ^ ((eax >> 16) & 0xFF) ^ ((eax >> 8) & 0xFF) ^ (eax & 0xFF));
        }

        return key;
    }

    /// <summary>
    /// 处理进度信息
    /// </summary>
    public class ProgressInfo
    {
        /// <summary>当前正在处理的文件名</summary>
        public string CurrentFile { get; init; } = "";

        /// <summary>已处理的文件数</summary>
        public int FilesProcessed { get; init; }

        /// <summary>总文件数</summary>
        public int TotalFiles { get; init; }

        /// <summary>已处理的字节数</summary>
        public long BytesProcessed { get; init; }

        /// <summary>总字节数</summary>
        public long TotalBytes { get; init; }

        /// <summary>进度百分比 (0-100)</summary>
        public double ProgressPercent => TotalBytes > 0 ? (double)BytesProcessed / TotalBytes * 100.0 : 0;

        /// <summary>是否完成</summary>
        public bool IsCompleted { get; init; }

        /// <summary>错误信息（为空表示无错误）</summary>
        public string? ErrorMessage { get; init; }
    }

    /// <summary>
    /// 处理单个文件：使用 PDEKEY 进行异或运算，输出文件扩展名追加 ".xor"
    /// 如果输入文件已经是 .xor 扩展名，则去除 .xor（反向操作）
    /// </summary>
    /// <param name="inputPath">输入文件路径</param>
    /// <param name="key">PDEKEY 密钥表</param>
    /// <param name="onProgress">进度回调</param>
    /// <returns>输出文件路径；失败返回 null</returns>
    public static string? ProcessFile(string inputPath, byte[] key, Action<ProgressInfo>? onProgress = null)
    {
        try
        {
            if (!File.Exists(inputPath))
                return null;

            // 判断是加密还是解密：.xor 扩展名则去除，否则追加 .xor
            string outputFilePath;
            if (inputPath.EndsWith(".xor", StringComparison.OrdinalIgnoreCase))
            {
                outputFilePath = inputPath[..^4]; // 去除末尾 ".xor"
            }
            else
            {
                outputFilePath = inputPath + ".xor";
            }

            var fileInfo = new FileInfo(inputPath);
            long totalBytes = fileInfo.Length;
            long bytesProcessed = 0;

            var buffer = new byte[BufferSize];

            using var input = new FileStream(inputPath, FileMode.Open, FileAccess.Read, FileShare.Read, BufferSize);
            using var output = new FileStream(outputFilePath, FileMode.Create, FileAccess.Write, FileShare.None, BufferSize);

            int bytesRead;
            while ((bytesRead = input.Read(buffer, 0, buffer.Length)) > 0)
            {
                // 异或处理：按文件全局偏移轮转使用 PDEKEY
                long offsetBase = bytesProcessed;
                for (int i = 0; i < bytesRead; i++)
                {
                    buffer[i] ^= key[(int)((offsetBase + i) % KeyLength)];
                }

                output.Write(buffer, 0, bytesRead);
                bytesProcessed += bytesRead;

                onProgress?.Invoke(new ProgressInfo
                {
                    CurrentFile = Path.GetFileName(inputPath),
                    BytesProcessed = bytesProcessed,
                    TotalBytes = totalBytes,
                    FilesProcessed = 0,
                    TotalFiles = 1,
                    IsCompleted = false
                });
            }

            return outputFilePath;
        }
        catch (Exception ex)
        {
            onProgress?.Invoke(new ProgressInfo
            {
                CurrentFile = Path.GetFileName(inputPath),
                ErrorMessage = ex.Message,
                IsCompleted = true
            });
            return null;
        }
    }

    /// <summary>
    /// 处理目录：递归遍历目录中的所有文件并执行异或运算
    /// </summary>
    /// <param name="dirPath">目录路径</param>
    /// <param name="key">PDEKEY 密钥表</param>
    /// <param name="onProgress">进度回调</param>
    /// <returns>成功处理的文件数</returns>
    public static async Task<int> ProcessDirectoryAsync(string dirPath, byte[] key, Action<ProgressInfo>? onProgress = null)
    {
        return await Task.Run(() =>
        {
            if (!Directory.Exists(dirPath))
            {
                onProgress?.Invoke(new ProgressInfo { ErrorMessage = $"目录不存在: {dirPath}", IsCompleted = true });
                return 0;
            }

            // 收集所有待处理的文件（排除 .xor 文件避免重复处理）
            var files = new List<string>();
            CollectFiles(dirPath, files);

            if (files.Count == 0)
            {
                onProgress?.Invoke(new ProgressInfo { IsCompleted = true });
                return 0;
            }

            // 计算总字节数
            long totalBytes = 0;
            foreach (var f in files)
            {
                try { totalBytes += new FileInfo(f).Length; } catch { }
            }

            long globalBytesProcessed = 0;
            int filesProcessed = 0;

            foreach (var filePath in files)
            {
                var fileInfo = new FileInfo(filePath);
                long fileSize = fileInfo.Length;

                try
                {
                    // 判断输出路径
                    string outputFilePath;
                    if (filePath.EndsWith(".xor", StringComparison.OrdinalIgnoreCase))
                    {
                        outputFilePath = filePath[..^4];
                    }
                    else
                    {
                        outputFilePath = filePath + ".xor";
                    }

                    var buffer = new byte[BufferSize];
                    long fileBytesProcessed = 0;

                    using var input = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, BufferSize);
                    using var output = new FileStream(outputFilePath, FileMode.Create, FileAccess.Write, FileShare.None, BufferSize);

                    int bytesRead;
                    while ((bytesRead = input.Read(buffer, 0, buffer.Length)) > 0)
                    {
                        long offsetBase = fileBytesProcessed;
                        for (int i = 0; i < bytesRead; i++)
                        {
                            buffer[i] ^= key[(int)((offsetBase + i) % KeyLength)];
                        }

                        output.Write(buffer, 0, bytesRead);
                        fileBytesProcessed += bytesRead;
                        globalBytesProcessed += bytesRead;

                        onProgress?.Invoke(new ProgressInfo
                        {
                            CurrentFile = Path.GetFileName(filePath),
                            FilesProcessed = filesProcessed,
                            TotalFiles = files.Count,
                            BytesProcessed = globalBytesProcessed,
                            TotalBytes = totalBytes,
                            IsCompleted = false
                        });
                    }

                    filesProcessed++;
                }
                catch (Exception ex)
                {
                    onProgress?.Invoke(new ProgressInfo
                    {
                        CurrentFile = Path.GetFileName(filePath),
                        FilesProcessed = filesProcessed,
                        TotalFiles = files.Count,
                        BytesProcessed = globalBytesProcessed,
                        TotalBytes = totalBytes,
                        ErrorMessage = ex.Message,
                        IsCompleted = false
                    });
                }
            }

            onProgress?.Invoke(new ProgressInfo
            {
                CurrentFile = "",
                FilesProcessed = filesProcessed,
                TotalFiles = files.Count,
                BytesProcessed = globalBytesProcessed,
                TotalBytes = totalBytes,
                IsCompleted = true
            });

            return filesProcessed;
        });
    }

    /// <summary>
    /// 递归收集目录中所有非 .xor 的文件
    /// </summary>
    private static void CollectFiles(string dirPath, List<string> files)
    {
        try
        {
            foreach (var file in Directory.GetFiles(dirPath))
            {
                if (!file.EndsWith(".xor", StringComparison.OrdinalIgnoreCase))
                {
                    files.Add(file);
                }
            }

            foreach (var dir in Directory.GetDirectories(dirPath))
            {
                CollectFiles(dir, files);
            }
        }
        catch { }
    }

    /// <summary>
    /// 计算路径的总大小（用于预计算进度）
    /// </summary>
    public static long CalculateTotalSize(string path)
    {
        if (File.Exists(path))
        {
            try { return new FileInfo(path).Length; } catch { return 0; }
        }

        if (Directory.Exists(path))
        {
            long total = 0;
            try
            {
                foreach (var file in Directory.GetFiles(path, "*", SearchOption.AllDirectories))
                {
                    if (!file.EndsWith(".xor", StringComparison.OrdinalIgnoreCase))
                    {
                        try { total += new FileInfo(file).Length; } catch { }
                    }
                }
            }
            catch { }
            return total;
        }

        return 0;
    }
}
