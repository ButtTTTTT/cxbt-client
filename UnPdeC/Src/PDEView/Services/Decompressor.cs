namespace PDEView.Services;

/// <summary>
/// 解压模式枚举
/// </summary>
public enum ExtractMode
{
    /// <summary>
    /// 不进行二次解压，直接导出原始 .cache 文件
    /// </summary>
    NoExtract,
    
    /// <summary>
    /// 二次解压 - 模式A：全部删除前8字节
    /// </summary>
    RemoveFirst8Bytes,
    
    /// <summary>
    /// 二次解压 - 模式B：全部保留前8字节
    /// </summary>
    KeepFirst8Bytes,
    
/// <summary>
/// 二次解压 - 模式C：部分文件保留前8字节（.mesh, .skel, .anim, .lua, .luac）
/// </summary>
Mixed
}

/// <summary>
/// 解压服务，支持不同的解压模式
/// </summary>
public static class Decompressor
{
    private static readonly byte[] ByteLimit = { 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0 };
    
    // 需要保留前8字节的文件扩展名（混合模式C专用）
    private static readonly HashSet<string> KeepFirst8BytesExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mesh",
        ".skel",
        ".anim",
        ".lua",
        ".luac"
    };

    /// <summary>
    /// 判断文件是否为 .cache 文件
    /// </summary>
    public static bool IsCacheFile(string fileName)
    {
        return fileName.EndsWith(".cache", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// 判断文件在混合模式下是否需要保留前8字节
    /// </summary>
    public static bool ShouldKeepFirst8BytesMixed(string fileName)
    {
        // 检查去掉 .cache 后缀后的扩展名
        string nameWithoutCache = fileName;
        if (fileName.EndsWith(".cache", StringComparison.OrdinalIgnoreCase))
        {
            nameWithoutCache = fileName.Substring(0, fileName.Length - 6);
        }
        
        // 检查是否包含特定扩展名
        foreach (var ext in KeepFirst8BytesExtensions)
        {
            if (nameWithoutCache.EndsWith(ext, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        
        return false;
    }

    /// <summary>
    /// 根据解压模式预处理数据
    /// </summary>
    /// <param name="compressedData">原始压缩数据</param>
    /// <param name="fileName">文件名（用于判断混合模式）</param>
    /// <param name="mode">解压模式</param>
    /// <returns>处理后的数据</returns>
    public static byte[] PreExtract(byte[] compressedData, string fileName, ExtractMode mode)
    {
        // 不解压模式：直接返回原始数据
        if (mode == ExtractMode.NoExtract)
        {
            return compressedData ?? Array.Empty<byte>();
        }

        if (compressedData == null || compressedData.Length <= 0x18)
        {
            return compressedData ?? Array.Empty<byte>();
        }

        try
        {
            byte sizeFlag = compressedData[0x18];

            if ((sizeFlag & 1) != 0)
            {
                // 压缩数据
                byte[] encryptedData;
                uint extractedSize;

                switch (sizeFlag)
                {
                    case 0x6F:
                        if (compressedData.Length <= 0x21)
                            return compressedData;

                        extractedSize = BitConverter.ToUInt32(compressedData, 0x1D);
                        encryptedData = new byte[compressedData.Length - 0x21];
                        Array.Copy(compressedData, 0x21, encryptedData, 0, encryptedData.Length);
                        break;

                    case 0x6D:
                        if (compressedData.Length <= 0x1B)
                            return compressedData;

                        extractedSize = compressedData[0x1A];
                        encryptedData = new byte[compressedData.Length - 0x1B];
                        Array.Copy(compressedData, 0x1B, encryptedData, 0, encryptedData.Length);
                        break;

                    default:
                        return compressedData;
                }

                if (extractedSize == 0 || extractedSize > 100 * 1024 * 1024)
                {
                    return compressedData;
                }

                byte[] extractedData = FinalExtract(encryptedData, extractedSize);

                // 根据模式决定是否删除前8字节
                bool removeFirst8Bytes = ShouldRemoveFirst8Bytes(fileName, mode);
                
                if (removeFirst8Bytes && extractedData.Length > 8)
                {
                    byte[] result = new byte[extractedData.Length - 8];
                    Array.Copy(extractedData, 8, result, 0, result.Length);
                    return result;
                }

                return extractedData;
            }
            else
            {
                // 未压缩数据
                if (compressedData.Length <= 0x29)
                {
                    return compressedData;
                }

                // 根据模式决定处理方式
                bool removeFirst8Bytes = ShouldRemoveFirst8Bytes(fileName, mode);
                
                if (removeFirst8Bytes)
                {
                    // 删除前 0x29 字节（包含前8字节头）
                    byte[] data = new byte[compressedData.Length - 0x29];
                    Array.Copy(compressedData, 0x29, data, 0, data.Length);
                    return data;
                }
                else
                {
                    // 保留前8字节：删除前 0x21 字节
                    if (compressedData.Length <= 0x21)
                    {
                        return compressedData;
                    }
                    byte[] data = new byte[compressedData.Length - 0x21];
                    Array.Copy(compressedData, 0x21, data, 0, data.Length);
                    return data;
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"PreExtract error: {ex.Message}");
            return compressedData ?? Array.Empty<byte>();
        }
    }

    /// <summary>
    /// 判断是否需要删除前8字节
    /// </summary>
    private static bool ShouldRemoveFirst8Bytes(string fileName, ExtractMode mode)
    {
        return mode switch
        {
            ExtractMode.NoExtract => false,  // 不解压模式不处理
            ExtractMode.RemoveFirst8Bytes => true,  // 模式A：全部删除
            ExtractMode.KeepFirst8Bytes => false,   // 模式B：全部保留
            ExtractMode.Mixed => !ShouldKeepFirst8BytesMixed(fileName), // 模式C：部分保留
            _ => true
        };
    }

    /// <summary>
    /// 兼容旧版本的 PreExtract（默认删除前8字节）
    /// </summary>
    public static byte[] PreExtract(byte[] compressedData)
    {
        return PreExtract(compressedData, string.Empty, ExtractMode.RemoveFirst8Bytes);
    }

    private static byte[] FinalExtract(byte[] compressedData, uint extractedSize)
    {
        try
        {
            if (compressedData == null || compressedData.Length == 0)
            {
                return Array.Empty<byte>();
            }

            if (extractedSize == 0 || extractedSize > int.MaxValue)
            {
                return Array.Empty<byte>();
            }

            byte[] extractedData = new byte[extractedSize];

            uint controlWord = 1;
            int sourceIndex = 0;
            int destIndex = 0;
            int maxIterations = (int)extractedSize * 10;

            while (destIndex < (int)extractedSize && maxIterations-- > 0)
            {
                if (controlWord == 1)
                {
                    if (sourceIndex + 4 > compressedData.Length) break;
                    controlWord = BitConverter.ToUInt32(compressedData, sourceIndex) | 0x80000000u;
                    sourceIndex += 4;
                }

                if (sourceIndex >= compressedData.Length) break;

                if ((controlWord & 1) == 0)
                {
                    uint bytesToCopy = ByteLimit[controlWord & 0xF];
                    
                    if (bytesToCopy == 0)
                    {
                        sourceIndex++;
                        controlWord >>= 4;
                        continue;
                    }

                    if (destIndex + bytesToCopy > extractedData.Length)
                    {
                        bytesToCopy = (uint)(extractedData.Length - destIndex);
                    }

                    if (sourceIndex + bytesToCopy <= compressedData.Length)
                    {
                        Array.Copy(compressedData, sourceIndex, extractedData, destIndex, bytesToCopy);
                    }

                    destIndex += (int)bytesToCopy;
                    sourceIndex += (int)bytesToCopy;
                    controlWord >>= (int)bytesToCopy;
                }
                else
                {
                    if (sourceIndex + 4 > compressedData.Length) break;
                    
                    uint currentData = BitConverter.ToUInt32(compressedData, sourceIndex);
                    controlWord >>= 1;

                    var info = ParseBackReference(currentData);
                    sourceIndex += (int)info.BytesConsumed;

                    int referenceIndex = destIndex - (int)info.Offset;
                    
                    if (referenceIndex >= 0 && info.Offset > 0 && info.Length > 0)
                    {
                        for (int i = 0; i < info.Length && destIndex + i < extractedData.Length; i++)
                        {
                            if (referenceIndex + i < extractedData.Length)
                            {
                                extractedData[destIndex + i] = extractedData[referenceIndex + i];
                            }
                        }
                        destIndex += (int)info.Length;
                    }
                    else
                    {
                        destIndex++;
                    }
                }
            }

            return extractedData;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"FinalExtract error: {ex.Message}");
            return Array.Empty<byte>();
        }
    }

    private static (uint Offset, uint Length, uint BytesConsumed) ParseBackReference(uint data)
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
}
