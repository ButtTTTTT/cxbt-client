namespace UnPde {
    /// <summary>
    /// 当前xor文件信息结构体
    /// </summary>
    public struct SThisXor {
        public string Name;      // xor文件名
        public long Size;        // xor文件大小（字节）
        public string Path;      // xor文件完整路径
        public string JsonPath;  // 关联的JSON配置文件路径
        public string RootDirName; // 输出根目录名
        public string OutputPath; // 输出目录路径
    }

    /// <summary>
    /// 文件夹路径信息结构体
    /// </summary>
    public struct SDirectoryPair {
        public string ParentDir;   // 上级目录路径
        public string CurrentDir;  // 当前目录路径
    }

    /// <summary>
    /// 文件/目录偏移量元信息结构体
    /// </summary>
    public struct SHexOffsetInfo {
        public byte Type;                 // 类型标识（1=文件，2=目录）
        public string Name;             // 文件/目录名称
        public long UnixTime;           // Unix Time
        public uint Size;                // 数据块大小（字节）
        public uint OriginalOffset;      // 原始偏移量
    }

    /// <summary>
    /// 数据块解析信息结构体
    /// </summary>
    public struct SBlockMeta {
        public bool IsValid;         // 标识当前块是否有效
        public string Type;             // 类型说明（"1"=文件，"2"=目录）
        public string Name;             // 块名称
        public string RawOffset;    // 编码后的偏移值（Hex字符串）
        public string RealOffset;    // 解码后的偏移值（Hex字符串）
        public string Size;             // 数据块大小（Hex字符串）
        public string BlockRealOffset;      // 块起始偏移量
        public string BlockRawOffset; // 块编码偏移量（Hex字符串）
    }

    /// <summary>
    /// 文件/目录保存元信息结构体
    /// </summary>
    public struct SMataSaveInfo {
        public string Type;            // 类型标识（"1"=文件，"2"=目录）
        public string Name;            // 文件/目录名称
        public ulong RawOffset;             // 文件起始偏移量（字节）
        public ulong Size;               // 文件大小（字节）
        public string DirectoryPath;   // 所属目录的完整路径
    }

    /// <summary>
    /// 回溯引用信息结构体 - 用于LZ77解压算法
    /// </summary>
    public struct BackReferenceInfo {
        public uint Offset;         // 回溯偏移
        public uint Length;         // 复制长度
        public uint BytesConsumed;  // 消耗的字节数
    }

    /// <summary>
    /// 解压状态结构体 - 维护解压过程中的状态
    /// </summary>
    public struct DecompressionState {
        public uint ControlWord;     // 控制位字
        public int SourceIndex;     // 压缩数据当前位置
        public int DestIndex;       // 解压数据当前位置
        public int TargetSize;      // 目标大小

        /// <summary>
        /// 构造函数
        /// </summary>
        /// <param name="size">目标解压大小</param>
        public DecompressionState(int size) {
            ControlWord = 1;
            SourceIndex = 0;
            DestIndex = 0;
            TargetSize = size;
        }

        /// <summary>
        /// 检查是否已完成解压
        /// </summary>
        /// <returns>如果已完成解压则返回true</returns>
        public bool IsComplete() {
            return DestIndex >= TargetSize;
        }

        /// <summary>
        /// 检查是否有足够空间
        /// </summary>
        /// <param name="needed">需要的空间大小</param>
        /// <returns>如果有足够空间则返回true</returns>
        public bool HasEnoughSpace(int needed = 10) {
            return DestIndex < TargetSize - needed;
        }
    }
}