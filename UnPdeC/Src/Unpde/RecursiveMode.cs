using System.Text;

namespace UnPde {
    public static class RecursiveMode {
        public static void ExtractRecursive() {
            Console.WriteLine($"\n > 开始解压{GlobalVars.ThisXor.Name}");

            // 创建根目录结构
            SDirectoryPair rootDir = new() {
                ParentDir = GlobalVars.ThisXor.RootDirName,
                CurrentDir = GlobalVars.ThisXor.RootDirName
            };

            // 启动递归解析流程
            // 参数说明：
            // 0x0 - VFS表偏移地址
            // 0x1000 - VFS中每个数据块大小（4KB）
            // rootDir - 根目录信息对象
            Detail.TryExtract(0x0, 0x1000, rootDir);

            // 解析完成后生成分析结果
            var tracker = Tracking.GetGlobalBlockTracker();
            if (tracker != null) {
                // 确保输出目录存在
                string outputDir = Path.Combine(GlobalVars.AppDir, GlobalVars.ThisXor.RootDirName);
                if (!Directory.Exists(outputDir)) {
                    Directory.CreateDirectory(outputDir);
                }

                // 导出已访问块列表（带缺失检测）
                string detailedJsonPath = Path.Combine(outputDir, "BlockTracker.json");
                Tracking.ExportAccessedListWithMissingDetection(tracker, detailedJsonPath);
            }

            // 清理资源
            try {
                MemoryMapper.GetInstance().CloseFile();
            } catch (Exception e) {
                Console.WriteLine($"清理失败: {e.Message}");
            }

            Console.WriteLine(" > 解压完成");
            UI.PrintLine();
        }

        private static class Detail {
            public static void TryExtract(uint offset, uint size, SDirectoryPair directory) {
                // 读取VFS数据块
                byte[] vfsDataBlock = VFSTable.ReadDataFromXor(offset, size);

                // 解析文件或目录信息
                List<SHexOffsetInfo> entries = ParseOffsetInfo(vfsDataBlock);

                // 保存到文件系统
                SaveExtractedData(entries, directory);
            }

            public static List<SHexOffsetInfo> ParseOffsetInfo(byte[] data) {
                // 定义每个数据块的大小（128字节）
                const int blockSize = 0x80;

                // 计算数据块的数量（总数据大小除以块大小）
                int blockCount = data.Length / blockSize;

                // 创建返回结果向量，预分配空间以提高性能
                List<SHexOffsetInfo> offsetInfos = new List<SHexOffsetInfo>(blockCount);

                // 遍历所有数据块
                for (int blockIndex = 0; blockIndex < blockCount; blockIndex++) {
                    // 计算当前块的起始位置（索引 * 块大小）
                    int blockStart = blockIndex * blockSize;

                    // 1: 读取条目类型（第一个字节）
                    // 1 = 文件, 2 = 目录, 其他值跳过
                    byte entryType = data[blockStart];
                    if (entryType != 1 && entryType != 2) continue;

                    // 2: 查找名称结束位置（从第二个字节开始查找'\0'）
                    int nameEnd = blockStart + 1;
                    while (nameEnd < blockStart + blockSize && data[nameEnd] != 0) {
                        nameEnd++;
                    }

                    // 计算名称长度（从第二个字节到结束符的距离）
                    int nameLength = nameEnd - (blockStart + 1);

                    // 名称有效性检查：
                    if (nameLength == 0 || nameLength >= 0x6f) {
                        Console.WriteLine("获取名称尾部失败！跳过！");
                        continue;
                    }

                    // 从字节数据构造名称字符串
                    string entryName = Encoding.UTF8.GetString(data, blockStart + 1, nameLength);

                    // 3: 读取大小和偏移信息（最后8字节）
                    uint entrySize = BitConverter.ToUInt32(data, blockStart + blockSize - 4);
                    uint originalOffset = BitConverter.ToUInt32(data, blockStart + blockSize - 8);

                    // 4: 读取NTFS时间戳（偏移0x70-0x77，共8字节）
                    ulong ntfsTime = BitConverter.ToUInt64(data, blockStart + 0x70);

                    // 转换NTFS时间戳为Unix时间戳
                    const ulong WINDOWS_TICK = 10000000UL; // 100纳秒单位
                    const ulong SEC_TO_UNIX_EPOCH = 11644473600UL; // 1601-01-01到1970-01-01的秒数

                    // 转换步骤：
                    // 1. 将100纳秒单位转换为秒（除以10,000,000）
                    // 2. 减去1601到1970的秒数差
                    ulong secondsSince1601 = ntfsTime / WINDOWS_TICK;
                    long unixTime = (long)(secondsSince1601 - SEC_TO_UNIX_EPOCH);

                    // 创建偏移信息结构并添加到结果向量
                    offsetInfos.Add(new SHexOffsetInfo {
                        Type = entryType,
                        Name = entryName,
                        UnixTime = unixTime,
                        Size = entrySize,
                        OriginalOffset = originalOffset
                    });
                }

                // 返回所有解析出的偏移信息
                return offsetInfos;
            }

            public static void SaveExtractedData(List<SHexOffsetInfo> entries, SDirectoryPair directory) {
                string baseDir = Path.Combine(GlobalVars.AppDir, directory.CurrentDir);

                foreach (var entry in entries) {
                    try {
                        if (entry.Type == 1) // 文件处理
                        {
                            // 1. 文件名处理优化
                            string finalName = entry.Name;
                            bool needProcessData = false;

                            if (!GlobalVars.CacheMode) {
                                // 使用后缀检查替代字符串查找
                                if (entry.Name.EndsWith(".lua.cache")) {
                                    finalName = entry.Name.Replace(".lua.cache", ".luac");
                                    needProcessData = true;
                                } else if (entry.Name.EndsWith(".lua")) {
                                    finalName = entry.Name.Replace(".lua", ".luac");
                                } else if (entry.Name.Contains(".cache")) {
                                    int pos = entry.Name.IndexOf(".cache");
                                    finalName = entry.Name.Substring(0, pos);
                                    needProcessData = true;
                                }
                            } else if (entry.Name.Contains(".cache")) {
                                needProcessData = false; // 明确缓存模式处理逻辑
                            }

                            // 2. 路径构建优化
                            string filePath = Path.Combine(baseDir, finalName);
                            if (File.Exists(filePath)) continue;

                            // 3. 数据读取优化（避免不必要的拷贝）
                            Console.WriteLine($"△ File: {finalName}");
                            byte[] fileData = VFSTable.ReadDataFromXor(entry.OriginalOffset, entry.Size);

                            // 4. 数据校验增强
                            if (fileData.Length != entry.Size || fileData.Length == 0 || string.IsNullOrEmpty(entry.Name)) {
                                Console.WriteLine($" 数据校验失败: {finalName}");
                                continue;
                            }

                            // 5. 数据处理优化
                            byte[] processedData;
                            if (needProcessData) {
                                processedData = Extract.PreExtract(fileData, entry.Name);
                            } else {
                                processedData = fileData; // 避免数据复制
                            }

                            // 6. 文件写入优化
                            if (!File.Exists(filePath)) {
                                // 确保目录存在
                                string dirPath = Path.GetDirectoryName(filePath);
                                if (!Directory.Exists(dirPath)) {
                                    Directory.CreateDirectory(dirPath);
                                }

                                using FileStream outFile = new FileStream(filePath, FileMode.Create, FileAccess.Write);
                                outFile.Write(processedData, 0, processedData.Length);
                            }
                        } else if (entry.Type == 2) // 目录处理优化
                          {
                            string dirPath = Path.Combine(baseDir, entry.Name);

                            if (!Directory.Exists(dirPath)) {
                                Console.WriteLine($"▲ Dir: {Path.GetFileName(dirPath)}");

                                try {
                                    Directory.CreateDirectory(dirPath);
                                } catch (Exception ex) {
                                    Console.WriteLine($" 创建目录失败: {dirPath} ({ex.Message})");
                                    continue;
                                }
                            }

                            // 递归参数优化
                            TryExtract(entry.OriginalOffset, entry.Size,
                                      new SDirectoryPair {
                                          ParentDir = directory.CurrentDir,
                                          CurrentDir = Path.Combine(directory.CurrentDir, entry.Name)
                                      });
                        }
                    } catch (Exception e) {
                        Console.WriteLine($" 处理条目失败: {e.Message}");
                    }
                }
            }
        }
    }
}