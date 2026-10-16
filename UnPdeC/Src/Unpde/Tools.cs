namespace UnPde {
    public static class Tools {
        public static void Init(SThisXor xorFile) {
            try {
                Console.WriteLine("\n > 正在初始化Tools");

                // 设置输出根目录名称
                xorFile.RootDirName = OutputDirectoryName(xorFile.Name);

                // 创建输出目录
                string outputPath = Path.Combine(GlobalVars.AppDir, xorFile.RootDirName);

                // 设置设置输出目录
                xorFile.OutputPath = outputPath;

                // 保存到GlobalVars
                GlobalVars.ThisXor = xorFile;
                Console.WriteLine($" > 输出目录: {xorFile.RootDirName}");

                if (!Directory.Exists(outputPath)) {
                    try {
                        Directory.CreateDirectory(outputPath);
                    } catch (Exception e) {
                        Console.WriteLine($" !创建目录失败: {e.Message}");
                        return;
                    }
                }

                // 初始化内存映射器
                MemoryMapper.GetInstance().OpenFile(xorFile.Path);

                // 处理VFS表
                bool vfsDumped = VFSTable.DumpVfsTable(GlobalVars.ThisXor.Path);
                if (!vfsDumped) {
                    Console.WriteLine(" !处理VFS表失败");
                    return;
                }

                Console.WriteLine(" > 初始化Tools完成");
                UI.PrintLine();
            } catch (Exception e) {
                Console.WriteLine($" !初始化Tools失败: {e.Message}");
            }
        }

        public static void FindXorFile() {
            Console.WriteLine(" > 开始查找XOR文件");

            List<SThisXor> xorArr = new List<SThisXor>();
            string exePath = AppContext.BaseDirectory;
            GlobalVars.AppDir = exePath;

            foreach (string file in Directory.GetFiles(exePath, "*.xor")) {
                SThisXor nowXor = new SThisXor();
                string fileName = Path.GetFileNameWithoutExtension(file);

                nowXor.Name = fileName;
                nowXor.Size = new FileInfo(file).Length;
                nowXor.Path = file;
                nowXor.JsonPath = Path.Combine(exePath, fileName + ".json");
                xorArr.Add(nowXor);
            }

            if (xorArr.Count == 0) {
                Console.WriteLine(" ! 没有找到Xor文件\n\n > 按任意键退出");
                Console.ReadKey();
                Environment.Exit(-1);
            }

            GlobalVars.XorArr = xorArr;

            for (int i = 0; i < xorArr.Count; i++) {
                Console.WriteLine($"  {i}: {xorArr[i].Name}");
            }

            UI.PrintLine();
        }

        public static string ToHexString(ulong value) {
            return $"0x{value:X}";
        }

        public static ulong RawToRealOffset(ulong origOffset) {
            ulong shifted = origOffset >> 10;
            ulong intermediate = origOffset + shifted + 1;
            return intermediate << 12;
        }

        public static ulong RealToRawOffset(ulong pdeOffset) {
            return (pdeOffset >> 12) * 1024 / 1025;
        }

        public static bool NameCheck(string name) {
            // 检查空字符串、尾随空格或点号
            if (string.IsNullOrEmpty(name) || name.EndsWith(" ") || name.EndsWith(".")) {
                return false;
            }

            // 定义文件名允许的字符
            const string invalidChars = "\"*:<>?|\\/";
            return name.All(ch =>
                ch >= 0x20 && ch <= 0x7E &&
                !invalidChars.Contains(ch));
        }

        public static byte[] GetByteOfXor(ulong Start, ulong Size) {
            using FileStream XORFILE_FS = new FileStream(GlobalVars.ThisXor.Path, FileMode.Open, FileAccess.Read);
            if (XORFILE_FS == null) {
                Console.WriteLine($"无法打开xor文件: {GlobalVars.ThisXor.Name}");
                return Array.Empty<byte>();
            }

            // 将 ulong 转换为 int，确保不会溢出
            if (Start > long.MaxValue) {
                Console.WriteLine("起始偏移过大");
                return Array.Empty<byte>();
            }

            XORFILE_FS.Seek((long)Start, SeekOrigin.Begin);

            // 将 ulong 转换为 int，确保不会溢出
            int readSize = (int)Math.Min(Size, int.MaxValue);
            byte[] buffer = new byte[readSize];
            int bytesRead = XORFILE_FS.Read(buffer, 0, readSize);

            if (bytesRead != readSize) {
                Console.WriteLine("读取PDE文件失败");
                return Array.Empty<byte>();
            }

            return buffer;
        }

        public static void GetHasCacheMode() {
            char cacheMode = 'N';  // 默认值
            Console.WriteLine("\n > 缓存模式\n    [Y]启用: 不进行二次解压,直接导出.cache文件!\n    [N]禁用[推荐]: 进行二次解压,导出为解压后的文件! \n > 选择[默认N]: ");

            string input = Console.ReadLine();

            if (!string.IsNullOrEmpty(input) && (input[0] == 'Y' || input[0] == 'y' || input[0] == 'N' || input[0] == 'n')) {
                cacheMode = char.ToUpper(input[0]);
            }

            bool mode = (cacheMode == 'Y');
            GlobalVars.CacheMode = mode;
            Console.WriteLine($" > 缓存模式: {(mode ? "启用" : "禁用")}");

            if (!mode) {
                GetHasSaveFirst8Byte();
            } else {
                UI.PrintLine();
            }
        }

        public static void GetHasSaveFirst8Byte() {
            char saveFirst8Byte = 'N';  // 默认值
            Console.WriteLine("\n > 保留前8字节\n    [Y]启用: 保留包含文件特征和数量的8个字节!\n    [N]禁用[推荐]: 如果不是为了研究文件,那么可以选择此项!\n > 选择[默认N]: ");

            string input = Console.ReadLine();

            if (!string.IsNullOrEmpty(input) && (input[0] == 'Y' || input[0] == 'y' || input[0] == 'N' || input[0] == 'n')) {
                saveFirst8Byte = char.ToUpper(input[0]);
            }

            bool mode = (saveFirst8Byte == 'Y');
            GlobalVars.SaveFirst8Byte = mode;
            Console.WriteLine($" > 保留前8字节: {(mode ? "启用" : "禁用")}");

            UI.PrintLine();
        }

        public static string OutputDirectoryName(string fileName) {
            // 去除文件扩展名作为基础名称
            string baseName = Path.GetFileNameWithoutExtension(fileName);
            // 根据缓存模式决定后缀
            string cacheSuffix = GlobalVars.CacheMode ? "_c" : "_nc";
            string saveFirst8ByteSuffix = GlobalVars.SaveFirst8Byte ? "_s8" : "_ns8";

            // 组合目录名称：基础名_模式[_cache]
            return baseName + cacheSuffix + saveFirst8ByteSuffix;
        }

        public static uint Get4Byte(byte[] data, ulong offset) {
            if (offset + 4 > (ulong)data.Length) {
                throw new ArgumentOutOfRangeException(nameof(offset), "PdeOffset out of range");
            }

            return BitConverter.ToUInt32(data, (int)offset);
        }
    }
}