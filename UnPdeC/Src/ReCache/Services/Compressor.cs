using System.Diagnostics;
using System.IO;

namespace ReCache.Services;

/// <summary>
/// LZ77 变体压缩器 - 修复补齐循环问题
/// </summary>
public static class Compressor {
    private static readonly byte[] ShiftTable = [4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0];
    private const int MaxBitsPerControlWord = 31;
    private const int MaxOffset = 131071; // 0x1FFFF
    private const int MaxLength = 258;
    private const int MinMatchLength = 3;

    // 日志开关
    private static bool _enableLog = true;
    private static readonly object _logLock = new();

    private static void Log(string message) {
        if (!_enableLog) return;
        lock (_logLock) {
            string timestamp = DateTime.Now.ToString("HH:mm:ss.fff");
            Debug.WriteLine($"[{timestamp}] {message}");
            File.AppendAllText(Path.Combine(Path.GetTempPath(), "ReCache_Compressor.log"), $"[{timestamp}] {message}\n");
        }
    }

    public static void EnableLogging(bool enable) {
        _enableLog = enable;
    }

    public static byte[] Compress(byte[] data) {
        if (data == null || data.Length == 0) {
            Log("Compress: 输入数据为空");
            return Array.Empty<byte>();
        }

        Log($"Compress: 开始压缩, 输入大小 = {data.Length} bytes");
        var stopwatch = Stopwatch.StartNew();

        using var output = new MemoryStream(data.Length / 2 + 256);
        int pos = 0;
        int controlWordCount = 0;
        int totalLiterals = 0;
        int totalMatches = 0;
        int totalMatchBytes = 0;

        while (pos < data.Length) {
            controlWordCount++;

            if (controlWordCount % 100 == 0) {
                Log($"Compress: 已处理 {controlWordCount} 个控制字, pos = {pos}/{data.Length} ({100.0 * pos / data.Length:F1}%)");
            }

            // 构建一个控制字和对应的数据
            uint controlWord = 0x80000000;
            int bitPos = 0;
            using var blockData = new MemoryStream(256);

            uint simEax = controlWord;

            while (bitPos < MaxBitsPerControlWord && pos < data.Length) {
                // 接近末尾时停止主循环（让补齐循环处理）
                if (pos + 10 >= data.Length) {
                    break;
                }

                // 查找最佳匹配
                var (offset, length) = FindBestMatch(data, pos);

                if (length >= MinMatchLength) {
                    // 引用复制：消耗 1 位
                    controlWord |= (1u << bitPos);
                    bitPos++;
                    simEax >>= 1;

                    // 编码引用
                    var encoded = EncodeBackReference(offset, length);
                    blockData.Write(encoded, 0, encoded.Length);

                    totalMatches++;
                    totalMatchBytes += length;
                    pos += length;
                } else {
                    // 字面复制
                    int shiftAmount = ShiftTable[simEax & 0xF];
                    if (shiftAmount == 0) {
                        shiftAmount = 1;
                    }

                    // 确保不超过数据边界
                    shiftAmount = Math.Min(shiftAmount, data.Length - pos);
                    if (shiftAmount <= 0) {
                        break;
                    }

                    bitPos += shiftAmount;
                    simEax >>= shiftAmount;

                    // 写入原始数据
                    blockData.Write(data, pos, shiftAmount);
                    totalLiterals += shiftAmount;
                    pos += shiftAmount;
                }
            }

            // 修复：如果内层循环没有处理任何位（bitPos == 0），说明接近末尾，退出外层循环
            if (bitPos == 0) {
                Log($"Compress: bitPos == 0, 退出外层循环, pos = {pos}");
                break;
            }

            // 写入控制字
            output.Write(BitConverter.GetBytes(controlWord), 0, 4);

            // 写入块数据
            blockData.WriteTo(output);
        }

        // 添加补齐数据（用于解压器的补齐循环）
        int remaining = data.Length - pos;
        if (remaining > 0) {
            Log($"Compress: 添加补齐数据, remaining = {remaining}");

            // 关键修复：确保补齐控制字在主循环最后控制字的所有位被消耗完后才写入
            // 我们需要写入一个控制字，使得解压器能正确读取剩余数据
            // 但问题是：解压器的补齐循环会在 eax == 1 时才跳过控制字
            // 而主循环退出时 eax 可能不是 1

            // 解决方案：不写入额外的控制字，而是直接写入剩余数据
            // 让补齐循环从当前位置继续读取
            // 
            // 但是，我们需要确保解压器能够正确处理这种情况
            // 根据分析，当主循环退出时 eax = 0x2000，补齐循环会把接下来的字节当作数据处理
            // 所以我们应该直接写入剩余数据，不添加控制字

            // 直接写入剩余的原始数据
            output.Write(data, pos, remaining);
        }

        stopwatch.Stop();
        var result = output.ToArray();

        Log($"Compress: 完成 - 输入: {data.Length} bytes, 输出: {result.Length} bytes, " +
            $"压缩率: {100.0 * result.Length / data.Length:F1}%, " +
            $"耗时: {stopwatch.ElapsedMilliseconds} ms, " +
            $"控制字: {controlWordCount}, 字面字节: {totalLiterals}, " +
            $"匹配次数: {totalMatches}, 匹配字节: {totalMatchBytes}");

        return result;
    }

    /// <summary>
    /// 快速查找最佳匹配
    /// </summary>
    private static (int offset, int length) FindBestMatch(byte[] data, int position) {
        if (position + MinMatchLength > data.Length)
            return (0, 0);

        int bestOffset = 0;
        int bestLength = 0;

        // 限制搜索窗口以提高性能
        int windowSize = Math.Min(position, 4096); // 4KB 窗口
        int searchStart = position - windowSize;

        // 使用较大的步长进行粗略搜索
        int step = Math.Max(1, windowSize / 128);

        for (int i = searchStart; i < position; i += step) {
            // 快速检查首字节
            if (data[i] != data[position])
                continue;

            // 计算匹配长度
            int matchLength = 1;
            int maxLen = Math.Min(MaxLength, data.Length - position);

            // 展开比较
            while (matchLength + 8 <= maxLen) {
                if (BitConverter.ToInt64(data, i + matchLength) == BitConverter.ToInt64(data, position + matchLength))
                    matchLength += 8;
                else
                    break;
            }

            while (matchLength < maxLen && data[i + matchLength] == data[position + matchLength])
                matchLength++;

            if (matchLength >= MinMatchLength && matchLength > bestLength) {
                bestOffset = position - i;
                bestLength = matchLength;

                // 找到足够好的匹配就停止
                if (bestLength >= 64)
                    return (bestOffset, bestLength);
            }
        }

        // 如果找到候选，在附近精细搜索
        if (step > 1 && bestLength >= MinMatchLength) {
            int bestPos = position - bestOffset;
            int fineStart = Math.Max(searchStart, bestPos - step);
            int fineEnd = Math.Min(position, bestPos + step);

            for (int i = fineStart; i < fineEnd; i++) {
                if (data[i] != data[position])
                    continue;

                int matchLength = 1;
                int maxLen = Math.Min(MaxLength, data.Length - position);

                while (matchLength + 8 <= maxLen) {
                    if (BitConverter.ToInt64(data, i + matchLength) == BitConverter.ToInt64(data, position + matchLength))
                        matchLength += 8;
                    else
                        break;
                }

                while (matchLength < maxLen && data[i + matchLength] == data[position + matchLength])
                    matchLength++;

                if (matchLength >= MinMatchLength && matchLength > bestLength) {
                    bestOffset = position - i;
                    bestLength = matchLength;

                    if (bestLength >= MaxLength)
                        return (bestOffset, bestLength);
                }
            }
        }

        return (bestOffset, bestLength);
    }

    private static byte[] EncodeBackReference(int offset, int length) {
        // Mode 1: 1字节, offset <= 63, length == 3
        if (offset <= 63 && length == 3) {
            return new byte[] { (byte)((offset << 2) | 0) };
        }

        // Mode 2: 2字节, offset <= 16383, length == 3
        if (offset <= 16383 && length == 3) {
            ushort value = (ushort)((offset << 2) | 1);
            return BitConverter.GetBytes(value);
        }

        // Mode 3: 2字节, offset <= 1023, 3 <= length <= 18
        if (offset <= 1023 && length >= 3 && length <= 18) {
            ushort value = (ushort)(((length - 3) << 2) | 2 | ((offset & 0x3FF) << 6));
            return BitConverter.GetBytes(value);
        }

        // Mode 5: 4字节 (Mode 4 暂不使用)
        if (length >= 3 && length <= 258 && offset <= MaxOffset) {
            uint value = 3u | ((uint)(length - 3) << 7) | ((uint)offset << 15);
            return BitConverter.GetBytes(value);
        }

        Log($"EncodeBackReference: 无法编码 - offset = {offset}, length = {length}");
        return Array.Empty<byte>();
    }
}
