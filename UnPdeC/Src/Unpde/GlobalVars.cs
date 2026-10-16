namespace UnPde {
    public static class GlobalVars {
        public static List<SThisXor> XorArr = new List<SThisXor>(); // Xor信息列表
        public static SThisXor ThisXor = new SThisXor { Name = "", Size = 0L }; // 当前正在处理的Xor文件信息
        public static string AppDir = ""; // App所在目录
        public static byte[] VfsTablesArr = Array.Empty<byte>(); // VFS表数据

        // 解压时的选项
        public static bool CacheMode = false;   // 是否为缓存模式
        public static bool SaveFirst8Byte = false; // 是否保留解压后文件前8字节

        /// <summary>
        /// 复位所有静态成员变量
        /// </summary>
        public static void Reset() {
            // 只重置与当前解压会话相关的变量
            ThisXor = new SThisXor { Name = "", Size = 0L };
            VfsTablesArr = Array.Empty<byte>();
            CacheMode = false;
            SaveFirst8Byte = false;

            Console.WriteLine("\n > 全局变量已重置");
        }
    }
}