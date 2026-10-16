// LuacWrapper.cs - C# P/Invoke wrapper for luac_dll
// Lua 5.2-alpha compiler DLL wrapper for PDE game

using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace PDELuac {
    /// <summary>
    /// Lua 5.2-alpha 编译器 DLL 的 C# 包装类
    /// </summary>
    public class LuacWrapper : IDisposable {
        private const string DLL_NAME = "luac_dll.dll";
        private static IntPtr _dllHandle = IntPtr.Zero;
        private static bool _initialized = false;
        private static string? _initError = null;

        // 委托类型
        private delegate int LuacCompileFileDelegate(
            string source_file, string output_file, int strip,
            StringBuilder error_msg, int error_msg_size);
        private delegate int LuacCompileStringDelegate(
            string source_code, string source_name, int strip,
            out IntPtr out_buffer, out UIntPtr out_size,
            StringBuilder error_msg, int error_msg_size);
        private delegate void LuacFreeBufferDelegate(IntPtr buffer);
        private delegate IntPtr LuacVersionDelegate();

        // 委托实例
        private static LuacCompileFileDelegate? _compileFile;
        private static LuacCompileStringDelegate? _compileString;
        private static LuacFreeBufferDelegate? _freeBuffer;
        private static LuacVersionDelegate? _version;

        // 静态初始化
        static LuacWrapper() {
            InitializeDll();
        }

        private static void InitializeDll() {
            if (_initialized) return;

            try {
                string dllPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, DLL_NAME);

                if (!File.Exists(dllPath)) {
                    _initError = $"DLL 文件不存在: {dllPath}";
                    _initialized = true;
                    return;
                }

                if (NativeLibrary.TryLoad(dllPath, out _dllHandle)) {
                    _compileFile = GetDelegate<LuacCompileFileDelegate>("luac_compile_file");
                    _compileString = GetDelegate<LuacCompileStringDelegate>("luac_compile_string");
                    _freeBuffer = GetDelegate<LuacFreeBufferDelegate>("luac_free_buffer");
                    _version = GetDelegate<LuacVersionDelegate>("luac_version");
                } else {
                    _initError = "无法加载 DLL (可能是架构不匹配)";
                }
            } catch (Exception ex) {
                _initError = $"DLL 加载异常: {ex.Message}";
            } finally {
                _initialized = true;
            }
        }

        private static T? GetDelegate<T>(string name) where T : Delegate {
            if (_dllHandle == IntPtr.Zero) return null;
            IntPtr procAddress = NativeLibrary.GetExport(_dllHandle, name);
            if (procAddress == IntPtr.Zero) return null;
            return Marshal.GetDelegateForFunctionPointer<T>(procAddress);
        }

        private bool _disposed = false;

        public static string Version {
            get {
                if (_version != null) {
                    IntPtr ptr = _version();
                    if (ptr != IntPtr.Zero)
                        return Marshal.PtrToStringAnsi(ptr) ?? "未知版本";
                }
                return _initError ?? "DLL 未初始化";
            }
        }

        public static bool IsDllAvailable => _dllHandle != IntPtr.Zero && _compileFile != null;
        public static string? InitError => _initError;

        /// <summary>
        /// 编译 Lua 源文件到字节码文件
        /// </summary>
        public bool CompileFile(string sourceFile, string outputFile, bool strip, out string errorMessage) {
            errorMessage = string.Empty;
            if (_compileFile == null) {
                errorMessage = _initError ?? "DLL 函数未加载";
                return false;
            }

            var sb = new StringBuilder(1024);
            int result = _compileFile(sourceFile, outputFile, strip ? 1 : 0, sb, sb.Capacity);
            errorMessage = sb.ToString();
            return result == 0;
        }

        /// <summary>
        /// 为 PDE 游戏编译 Lua 文件
        /// 格式: [4字节标识][4字节Lua大小][Lua字节码]
        /// </summary>
        public bool CompileForPDEGame(string sourceFile, string outputFile, string gamePath,
            bool strip, bool addPDEHeader, uint magicNumber, out string errorMessage) {
            errorMessage = string.Empty;

            // 先编译为临时文件
            string tempFile = Path.GetTempFileName();
            try {
                // 编译为标准 Lua 字节码
                if (!CompileFile(sourceFile, tempFile, strip, out errorMessage))
                    return false;

                // 读取编译后的内容
                byte[] luacContent = File.ReadAllBytes(tempFile);

                // 修改 Lua 字节码中的路径
                luacContent = SetLuacSourcePath(luacContent, gamePath);

                // 如果需要添加 PDE 8字节头部
                if (addPDEHeader) {
                    luacContent = CreatePDEFile(luacContent, magicNumber);
                }

                // 写入最终文件
                File.WriteAllBytes(outputFile, luacContent);
                return true;
            } finally {
                if (File.Exists(tempFile))
                    File.Delete(tempFile);
            }
        }

        /// <summary>
        /// 创建 PDE 游戏格式的文件
        /// 格式: [4字节标识(大端序)][4字节Lua大小(小端序)][Lua字节码]
        /// </summary>
        public static byte[] CreatePDEFile(byte[] luacContent, uint magicNumber) {
            using (var ms = new MemoryStream())
            using (var writer = new BinaryWriter(ms)) {
                // 写入 4字节标识/魔数 (大端序)
                writer.Write((byte)((magicNumber >> 24) & 0xFF));
                writer.Write((byte)((magicNumber >> 16) & 0xFF));
                writer.Write((byte)((magicNumber >> 8) & 0xFF));
                writer.Write((byte)(magicNumber & 0xFF));
                // 写入 4字节 Lua 字节码大小 (小端序)
                writer.Write(luacContent.Length);
                // 写入 Lua 字节码内容
                writer.Write(luacContent);
                return ms.ToArray();
            }
        }

        /// <summary>
        /// 设置 Lua 字节码中的 source 路径
        /// Lua 5.1 字节码格式：
        /// [12字节头部][size_t 路径长度][路径字符串+null][函数体...]
        /// 注意：路径长度包含 null terminator
        /// </summary>
        private static byte[] SetLuacSourcePath(byte[] luacContent, string gamePath) {
            // 确保路径以 @ 开头
            if (!gamePath.StartsWith("@"))
                gamePath = "@" + gamePath;

            // 路径字符串 + null terminator
            byte[] pathBytes = Encoding.UTF8.GetBytes(gamePath);
            int pathLenWithNull = pathBytes.Length + 1;  // 包含 null terminator

            using (var ms = new MemoryStream())
            using (var writer = new BinaryWriter(ms)) {
                // 写入 Lua 头部 (12字节)
                // 偏移 0-3: 签名 "\x1bLua"
                // 偏移 4: 版本号 (0x51 for Lua 5.1)
                // 偏移 5: 格式版本
                // 偏移 6: 字节序
                // 偏移 7: int大小
                // 偏移 8: size_t大小
                // 偏移 9: Instruction大小
                // 偏移 10: lua_Number大小
                // 偏移 11: 整数标志
                writer.Write(luacContent, 0, 12);

                // 获取 size_t 大小
                byte sizeOfSizeT = luacContent[8];

                // 写入路径长度 (size_t) - 包含 null terminator
                if (sizeOfSizeT == 8) {
                    writer.Write((long)pathLenWithNull);
                } else {
                    writer.Write(pathLenWithNull);
                }

                // 写入路径字符串
                writer.Write(pathBytes);
                // 写入 null terminator
                writer.Write((byte)0);

                // 计算跳过原始头部和路径后的剩余内容
                int headerSize = 12;
                int oldPathLen = ReadLuacPathLength(luacContent, headerSize, sizeOfSizeT);
                int skipSize = headerSize + (int)sizeOfSizeT + oldPathLen;

                // 写入剩余内容
                if (skipSize < luacContent.Length) {
                    writer.Write(luacContent, skipSize, luacContent.Length - skipSize);
                }

                return ms.ToArray();
            }
        }

        /// <summary>
        /// 读取 Lua 字节码中的路径长度
        /// </summary>
        private static int ReadLuacPathLength(byte[] content, int headerSize, byte sizeOfSizeT) {
            if (sizeOfSizeT == 8)
                return (int)BitConverter.ToInt64(content, headerSize);
            else
                return BitConverter.ToInt32(content, headerSize);
        }

        public void Dispose() {
            if (!_disposed) {
                _disposed = true;
            }
        }
    }
}
