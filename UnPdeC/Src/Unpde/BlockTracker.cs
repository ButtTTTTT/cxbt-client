using System.Text.Json;

namespace UnPde {
    public static class Tracking {
        private static BlockTracker _globalBlockTracker;

        public static BlockTracker GetGlobalBlockTracker() => _globalBlockTracker;
        public static void SetGlobalBlockTracker(BlockTracker tracker) => _globalBlockTracker = tracker;

        public class BlockTracker {
            private readonly ulong _totalBlocks;
            private readonly bool[] _visitedMap;

            public BlockTracker(ulong fileSize) {
                _totalBlocks = (fileSize + 0xFFF) / 0x1000;
                _visitedMap = new bool[_totalBlocks];
            }

            public void MarkVisited(ulong physicalOffset) {
                ulong blockIdx = physicalOffset / 0x1000;
                if (blockIdx < _totalBlocks) {
                    _visitedMap[blockIdx] = true;
                }
            }

            public bool IsVisited(ulong blockIdx) => blockIdx < _totalBlocks ? _visitedMap[blockIdx] : false;
            public ulong TotalBlocks() => _totalBlocks;
            public bool[] GetVisitedMap() => _visitedMap;
        }

        public static void ExportAccessedListWithMissingDetection(BlockTracker tracker, string filename) {
            ulong totalBlocks = tracker.TotalBlocks();
            bool[] visitedMap = tracker.GetVisitedMap();

            // 存储已访问的块地址
            List<ulong> accessedBlocks = new List<ulong>();

            // 收集所有已访问的块
            for (ulong i = 0; i < totalBlocks; i++) {
                if (visitedMap[i]) {
                    ulong blockStart = i * 0x1000;
                    accessedBlocks.Add(blockStart);
                }
            }

            // 按地址排序
            accessedBlocks.Sort();

            // 检测缺失的块
            List<ulong> missingBlocks = new List<ulong>();
            if (accessedBlocks.Count > 0) {
                ulong startAddr = accessedBlocks[0];
                ulong endAddr = accessedBlocks[accessedBlocks.Count - 1];

                // 创建一个集合来快速查找已访问的块
                HashSet<ulong> accessedSet = new HashSet<ulong>(accessedBlocks);

                // 检查从第一个到最后一个之间的所有块
                for (ulong addr = startAddr; addr <= endAddr; addr += 0x1000) {
                    if (!accessedSet.Contains(addr)) {
                        missingBlocks.Add(addr);
                    }
                }
            }

            // 打印未覆盖的区域信息
            if (missingBlocks.Count > 0) {
                Console.WriteLine("\n未覆盖的区域 (未访问的块):");
                Console.WriteLine("========================================");

                // 按范围分组显示未覆盖的区域
                ulong rangeStart = missingBlocks[0];
                ulong rangeEnd = rangeStart;

                for (int i = 1; i < missingBlocks.Count; i++) {
                    if (missingBlocks[i] == rangeEnd + 0x1000) {
                        // 连续块，扩展范围
                        rangeEnd = missingBlocks[i];
                    } else {
                        // 不连续块，输出当前范围
                        Console.WriteLine($"0x{rangeStart:X} - 0x{rangeEnd:X} ({(rangeEnd - rangeStart) / 0x1000 + 1} 块)");

                        // 开始新范围
                        rangeStart = missingBlocks[i];
                        rangeEnd = rangeStart;
                    }
                }

                // 输出最后一个范围
                Console.WriteLine($"0x{rangeStart:X} - 0x{rangeEnd:X} ({(rangeEnd - rangeStart) / 0x1000 + 1} 块)");

                Console.WriteLine("========================================");
                Console.WriteLine($" > BlockTracker 总共 {missingBlocks.Count} 个未访问块");
            }

            // 创建JSON对象
            var jsonData = new {
                accessed = accessedBlocks.Select(addr => $"0x{addr:X}").ToArray(),
                missing = missingBlocks.Count > 0 ? missingBlocks.Select(addr => $"0x{addr:X}").ToArray() : null,
                stats = new {
                    total_blocks = totalBlocks,
                    accessed_blocks = accessedBlocks.Count,
                    missing_blocks = missingBlocks.Count,
                    coverage_percentage = totalBlocks > 0 ? (accessedBlocks.Count * 100.0 / totalBlocks) : 0.0
                }
            };

            // 写入文件
            try {
                string jsonString = JsonSerializer.Serialize(jsonData, new JsonSerializerOptions {
                    WriteIndented = true,
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                });

                File.WriteAllText(filename, jsonString);
                Console.WriteLine($" > BlockTracker已导出至: {GlobalVars.ThisXor.RootDirName}\\BlockTracker.json");
            } catch (Exception ex) {
                Console.WriteLine($" > BlockTracker导出失败: {GlobalVars.ThisXor.RootDirName}\\BlockTracker.json");
                Console.WriteLine($"   错误: {ex.Message}");
            }
        }
    }
}