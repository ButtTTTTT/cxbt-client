using static UnPde.Tracking;

namespace UnPde {
    public static class VFSTable {
        public static bool DumpVfsTable(string xorFilePath) {
            Console.WriteLine(" > 开始处理VFS表");

            try {
                // 使用内存映射管理器打开文件
                var mapper = MemoryMapper.GetInstance();
                mapper.OpenFile(xorFilePath);

                // 获取文件大小
                ulong fileSize = (ulong)mapper.GetFileSize();

                // 初始化 BlockTracker
                Tracking.SetGlobalBlockTracker(new BlockTracker(fileSize));

                // 准备输出文件
                string vtoFilePath = Path.Combine(GlobalVars.ThisXor.OutputPath, "VfsOffsets.txt");
                string vtFilePath = Path.Combine(GlobalVars.ThisXor.OutputPath, "VfsTable.hex");

                using StreamWriter vtoFile = new StreamWriter(vtoFilePath);
                using FileStream vtFile = new FileStream(vtFilePath, FileMode.Create, FileAccess.Write);

                // 获取全局 BlockTracker
                var tracker = Tracking.GetGlobalBlockTracker();

                // 计算所有需要读取的块
                List<(ulong, uint)> readBlocks = new List<(ulong, uint)>();
                List<ulong> offsets = new List<ulong>();

                ulong offset = 0;
                while (offset < fileSize) {
                    offsets.Add(offset);

                    // 计算实际读取大小（避免超出文件末尾）
                    uint readSize = 0x1000;
                    if (offset + readSize > fileSize) {
                        readSize = (uint)(fileSize - offset);
                    }

                    readBlocks.Add((offset, readSize));

                    // 标记当前块为已访问
                    tracker?.MarkVisited(offset);

                    // 计算下一个偏移
                    offset += 0x1000; // 跳过此次4KB的表
                    offset += 0x400000; // 跳过4MB数据

                    // 如果下一个偏移已经超出文件大小，停止
                    if (offset >= fileSize) {
                        break;
                    }
                }

                // 批量读取所有VFS表数据
                Console.WriteLine($" > 正在批量读取 {readBlocks.Count} 个VFS表块...");
                var vfsDataChunks = mapper.ReadMultipleBlocks(readBlocks);

                // 处理读取的数据
                List<byte> tempVfs = new List<byte>();

                for (int i = 0; i < vfsDataChunks.Count; i++) {
                    var chunk = vfsDataChunks[i];
                    ulong currentOffset = offsets[i];

                    // 记录当前偏移到文本文件
                    vtoFile.WriteLine($"0x{currentOffset:X}");

                    // 写入VFS表数据到输出文件
                    vtFile.Write(chunk, 0, chunk.Length);

                    // 添加到临时缓冲区
                    tempVfs.AddRange(chunk);

                    // 输出进度（每处理10个块输出一次进度）
                    if ((i + 1) % 10 == 0 || (i + 1) == vfsDataChunks.Count) {
                        Console.WriteLine($" > 已处理 {i + 1}/{vfsDataChunks.Count} 个VFS表块");
                    }
                }

                // 保存到全局数组
                GlobalVars.VfsTablesArr = tempVfs.ToArray();

                Console.WriteLine($" > VFS偏移: {GlobalVars.ThisXor.RootDirName}\\VfsOffsets.txt");
                Console.WriteLine($" > VFS表: {GlobalVars.ThisXor.RootDirName}\\VfsTable.hex");
                Console.WriteLine($" > 共处理 {vfsDataChunks.Count} 个VFS表块，总大小: {GlobalVars.VfsTablesArr.Length} 字节");
                Console.WriteLine(" > VFS表处理完成");

                return GlobalVars.VfsTablesArr.Length > 0;
            } catch (Exception e) {
                Console.WriteLine($" !处理VFS表时发生错误: {e.Message}");
                return false;
            }
        }

        public static byte[] ReadDataFromXor(ulong vfsOffset, ulong blockSize) {
            try {
                // 检查VFS表是否加载
                if (GlobalVars.VfsTablesArr == null || GlobalVars.VfsTablesArr.Length == 0) {
                    throw new Exception("VFS表未加载");
                }

                // 检查Xor文件路径是否设置
                if (string.IsNullOrEmpty(GlobalVars.ThisXor.Path)) {
                    throw new Exception("当前未设置.xor文件路径");
                }

                // 计算VFS表偏移
                var vfsOffsets = CalculateVfsOffsets(blockSize, vfsOffset);

                // 计算最后一个偏移值的大小
                uint lastOffsetSize = (uint)(blockSize % 0x1000);
                if (lastOffsetSize == 0) {
                    lastOffsetSize = 0x1000;
                }

                // 获取内存映射器实例
                var mapper = MemoryMapper.GetInstance();

                // 确保文件已打开
                mapper.OpenFile(GlobalVars.ThisXor.Path);

                // 获取文件大小
                ulong fileSize = (ulong)mapper.GetFileSize();

                // 准备批量读取列表
                List<(ulong, uint)> readBlocks = new List<(ulong, uint)>();
                List<ulong> realOffsets = new List<ulong>();

                for (int i = 0; i < vfsOffsets.Count; i++) {
                    ulong realOffset = Tools.RawToRealOffset(vfsOffsets[i]);
                    uint readSize = (i == vfsOffsets.Count - 1) ? lastOffsetSize : 0x1000;

                    // 检查偏移是否有效
                    if (realOffset >= fileSize) {
                        Console.WriteLine($"警告: 偏移 {realOffset} 超出文件范围");
                        continue;
                    }

                    // 调整读取大小，确保不超出文件范围
                    if (realOffset + readSize > fileSize) {
                        readSize = (uint)(fileSize - realOffset);
                        Console.WriteLine($"警告: 在偏移 {realOffset} 处调整读取大小为 {readSize} 字节");
                    }

                    readBlocks.Add((realOffset, readSize));
                    realOffsets.Add(realOffset);
                }

                // 批量读取所有块
                var chunks = mapper.ReadMultipleBlocks(readBlocks);

                // 合并结果
                List<byte> result = new List<byte>();
                result.Capacity = (int)blockSize;

                // 获取全局 BlockTracker
                var tracker = Tracking.GetGlobalBlockTracker();

                for (int i = 0; i < chunks.Count; i++) {
                    var chunk = chunks[i];
                    ulong realOffset = realOffsets[i];

                    // 添加到结果
                    result.AddRange(chunk);

                    // 标记已访问的块
                    tracker?.MarkVisited(realOffset);
                }

                // 检查结果大小是否匹配
                if (result.Count != (long)blockSize) {
                    Console.WriteLine($"警告: 请求 {blockSize} 字节，但实际读取 {result.Count} 字节");
                }

                return result.ToArray();
            } catch (Exception e) {
                throw new Exception($"读取数据失败: {e.Message}");
            }
        }

        private static ulong CalculateVfsValue(ulong fileOffset) {
            // 确保VFS表已加载
            if (GlobalVars.VfsTablesArr == null || GlobalVars.VfsTablesArr.Length == 0) {
                throw new Exception("VFS表未加载或为空");
            }

            ulong finalOffset = ((fileOffset >> 0xA) * 0x1000) + ((fileOffset & 0x3FF) * 4);

            // 更严格的边界检查
            if (finalOffset >= (ulong)GlobalVars.VfsTablesArr.Length || finalOffset + 3 >= (ulong)GlobalVars.VfsTablesArr.Length) {
                throw new Exception($"偏移量超出数组范围: 0x{Tools.ToHexString(fileOffset)}");
            }

            // 读取4字节值
            uint pde = (uint)((GlobalVars.VfsTablesArr[finalOffset + 3] << 24) |
                             (GlobalVars.VfsTablesArr[finalOffset + 2] << 16) |
                             (GlobalVars.VfsTablesArr[finalOffset + 1] << 8) |
                             GlobalVars.VfsTablesArr[finalOffset]);

            return pde & 0x7FFFFFFF;
        }

        private static List<ulong> CalculateVfsOffsets(ulong fileSize, ulong fileOffset) {
            List<ulong> vfsOffsets = new List<ulong>();

            if (fileSize <= 0x1000) {
                vfsOffsets.Add(fileOffset);
            } else {
                ulong vfsOffsetCount = (fileSize / 0x1000) + (fileSize % 0x1000 > 0 ? 1UL : 0);

                vfsOffsets.Add(fileOffset); // 添加第一个偏移

                // 循环读取剩余的VFS表偏移
                for (uint i = 1; i < vfsOffsetCount; i++) {
                    // 计算VFS表值
                    ulong vfsVal = CalculateVfsValue(fileOffset);
                    vfsOffsets.Add(vfsVal);
                    fileOffset = vfsVal;
                }
            }

            return vfsOffsets;
        }
    }
}