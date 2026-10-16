using System.Text;

namespace ReCache.Services;

/// <summary>
/// 解压器 - 用于验证压缩算法的正确性
/// 与 UnCache 的 C++ 实现保持一致
/// </summary>
public static class Decompressor
{
    /// <summary>
    /// SHIFT_TABLE: 根据控制字低4位决定一次拷贝多少字节
    /// </summary>
    private static readonly byte[] ShiftTable = [4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0];

    /// <summary>
    /// 解压数据
    /// </summary>
    public static byte[] Decompress(byte[] compressedData, int decompressedSize)
    {
        if (compressedData == null || compressedData.Length == 0 || decompressedSize <= 0)
            return [];

        byte[] output = new byte[decompressedSize];
        
        // 寄存器状态
        uint eax = 1;  // 控制字，初始为 1 表示需要读取
        int esi = 0;   // 输入指针
        int ebp = 0;   // 输出指针

        // 主解压循环
        while (true)
        {
            // 如果 eax == 1，读取新的控制字
            if (eax == 1)
            {
                if (esi + 4 > compressedData.Length)
                    break;
                eax = BitConverter.ToUInt32(compressedData, esi);
                // 注意：原始汇编没有 OR 0x80000000，因为压缩器已经设置了 bit 31
                esi += 4;
            }

            // 预读 ecx
            if (esi + 4 > compressedData.Length)
                break;
            uint ecx = BitConverter.ToUInt32(compressedData, esi);

            // 检查 bit 0
            if ((eax & 1) == 0)
            {
                // 字面复制
                // 检查是否接近末尾
                if (ebp >= decompressedSize - 10)
                    break;

                int shiftAmount = ShiftTable[eax & 0xF];

                // 写入 ecx 的低 shiftAmount 字节
                for (int i = 0; i < shiftAmount && ebp + i < decompressedSize; i++)
                {
                    output[ebp + i] = (byte)((ecx >> (i * 8)) & 0xFF);
                }

                ebp += shiftAmount;
                esi += shiftAmount;
                eax >>= shiftAmount;
            }
            else
            {
                // 引用复制
                eax >>= 1;  // 右移 1 位

                int offset, length, bytesConsumed;
                
                // 解析 offset 和 length
                if ((ecx & 3) != 0)
                {
                    if ((ecx & 2) != 0)
                    {
                        if ((ecx & 1) != 0)
                        {
                            if ((ecx & 0x7F) == 3)
                            {
                                // Mode 5: 4字节
                                offset = (int)(ecx >> 15);
                                length = (int)(((ecx >> 7) & 0xFF) + 3);
                                bytesConsumed = 4;
                            }
                            else
                            {
                                // Mode 4: 3字节
                                offset = (int)((ecx >> 7) & 0x1FFFF);
                                length = (int)(((ecx >> 2) & 0x1F) + 2);
                                bytesConsumed = 3;
                            }
                        }
                        else
                        {
                            // Mode 3: 2字节
                            offset = (int)((ecx >> 6) & 0x3FF);
                            length = (int)(((ecx >> 2) & 0xF) + 3);
                            bytesConsumed = 2;
                        }
                    }
                    else
                    {
                        // Mode 2: 2字节
                        offset = (int)((ecx >> 2) & 0x3FFF);
                        length = 3;
                        bytesConsumed = 2;
                    }
                }
                else
                {
                    // Mode 1: 1字节
                    offset = (int)((ecx >> 2) & 0x3F);
                    length = 3;
                    bytesConsumed = 1;
                }

                // 验证
                if (offset > ebp || ebp + length > decompressedSize)
                    break;

                // 从输出缓冲复制
                for (int i = 0; i < length; i++)
                {
                    output[ebp + i] = output[ebp - offset + i];
                }

                ebp += length;
                esi += bytesConsumed;
            }
        }

        // 补齐循环
        while (ebp < decompressedSize)
        {
            if (eax == 1)
            {
                if (esi + 4 > compressedData.Length)
                    break;
                esi += 4;  // 跳过控制字
                eax = 0x80000000u;
            }

            if (esi >= compressedData.Length)
                break;

            output[ebp] = compressedData[esi];
            ebp++;
            esi++;
            eax >>= 1;
        }

        // 返回实际解压的数据
        byte[] result = new byte[ebp];
        Array.Copy(output, result, ebp);
        return result;
    }

    /// <summary>
    /// 获取 .cache 文件解压后的前 8 字节头部
    /// </summary>
    /// <param name="cacheData">原始 .cache 文件数据</param>
    /// <returns>解压后的前 8 字节，失败返回 null</returns>
    public static byte[]? ExtractFirst8Bytes(byte[] cacheData)
    {
        byte[] decompressed = DecompressCacheFile(cacheData);
        if (decompressed == null || decompressed.Length < 8)
            return null;

        byte[] first8 = new byte[8];
        Array.Copy(decompressed, 0, first8, 0, 8);
        return first8;
    }

    /// <summary>
    /// 将字节数组格式化为 Hex 字符串，4字节一组，组间双空格
    /// </summary>
    public static string FormatHex(byte[] data)
    {
        var groups = new List<string>();
        for (int i = 0; i < data.Length; i += 4)
        {
            int count = Math.Min(4, data.Length - i);
            var hexBytes = new string[count];
            for (int j = 0; j < count; j++)
            {
                hexBytes[j] = $"{data[i + j]:X2}";
            }
            groups.Add(string.Join(" ", hexBytes));
        }
        return string.Join("  ", groups);
    }

    /// <summary>
    /// 解压 .cache 文件
    /// </summary>
    public static byte[] DecompressCacheFile(byte[] cacheData)
    {
        if (cacheData == null || cacheData.Length <= 0x18)
            return [];

        byte sizeFlag = cacheData[0x18];
        byte[] compressedData;
        int decompressedSize;

        switch (sizeFlag)
        {
            case 0x6F:
                if (cacheData.Length <= 0x21)
                    return [];
                decompressedSize = (int)BitConverter.ToUInt32(cacheData, 0x1D);
                compressedData = new byte[cacheData.Length - 0x21];
                Array.Copy(cacheData, 0x21, compressedData, 0, compressedData.Length);
                break;

            case 0x6D:
                if (cacheData.Length <= 0x1B)
                    return [];
                decompressedSize = cacheData[0x1A];
                compressedData = new byte[cacheData.Length - 0x1B];
                Array.Copy(cacheData, 0x1B, compressedData, 0, compressedData.Length);
                break;

            case 0x6E:
                if (cacheData.Length <= 0x29)
                    return [];
                // 未压缩，直接返回数据
                byte[] uncompressed = new byte[cacheData.Length - 0x29];
                Array.Copy(cacheData, 0x29, uncompressed, 0, uncompressed.Length);
                return uncompressed;

            default:
                return [];
        }

        return Decompress(compressedData, decompressedSize);
    }
}
