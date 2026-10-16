// LuacWrapper.cs - C# P/Invoke wrapper for luac_dll
// Add this file to your WPF project

using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace LuacTools
{
    /// <summary>
    /// Lua 5.2-alpha 编译器 DLL 的 C# 包装类
    /// </summary>
    public class LuacWrapper : IDisposable
    {
        private const string DLL_NAME = "luac_dll.dll";

        #region DLL Imports

        [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
        private static extern int luac_compile_file(
            [MarshalAs(UnmanagedType.LPStr)] string source_file,
            [MarshalAs(UnmanagedType.LPStr)] string output_file,
            int strip,
            StringBuilder error_msg,
            int error_msg_size);

        [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
        private static extern int luac_compile_string(
            [MarshalAs(UnmanagedType.LPStr)] string source_code,
            [MarshalAs(UnmanagedType.LPStr)] string source_name,
            int strip,
            out IntPtr out_buffer,
            out UIntPtr out_size,
            StringBuilder error_msg,
            int error_msg_size);

        [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
        private static extern void luac_free_buffer(IntPtr buffer);

        [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.LPStr)]
        private static extern string luac_version();

        [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
        private static extern int luac_add_header(
            [MarshalAs(UnmanagedType.LPStr)] string input_file,
            [MarshalAs(UnmanagedType.LPStr)] string output_file,
            byte[] header_data,
            int header_size,
            StringBuilder error_msg,
            int error_msg_size);

        [DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
        private static extern int luac_compile_with_header(
            [MarshalAs(UnmanagedType.LPStr)] string source_file,
            [MarshalAs(UnmanagedType.LPStr)] string output_file,
            byte[] header_data,
            int header_size,
            int strip,
            StringBuilder error_msg,
            int error_msg_size);

        #endregion

        private bool _disposed = false;

        /// <summary>
        /// 获取 Lua 版本字符串
        /// </summary>
        public static string Version => luac_version();

        /// <summary>
        /// 编译 Lua 源文件到字节码文件
        /// </summary>
        /// <param name="sourceFile">Lua 源文件路径</param>
        /// <param name="outputFile">输出的 .luac 文件路径</param>
        /// <param name="strip">是否剥离调试信息</param>
        /// <param name="errorMessage">错误信息</param>
        /// <returns>成功返回 true</returns>
        public bool CompileFile(string sourceFile, string outputFile, bool strip = false, out string errorMessage)
        {
            var sb = new StringBuilder(1024);
            int result = luac_compile_file(sourceFile, outputFile, strip ? 1 : 0, sb, sb.Capacity);
            errorMessage = sb.ToString();
            return result == 0;
        }

        /// <summary>
        /// 编译 Lua 源代码字符串到字节数组
        /// </summary>
        /// <param name="sourceCode">Lua 源代码</param>
        /// <param name="sourceName">源代码名称（用于错误信息）</param>
        /// <param name="strip">是否剥离调试信息</param>
        /// <param name="bytecode">输出的字节码</param>
        /// <param name="errorMessage">错误信息</param>
        /// <returns>成功返回 true</returns>
        public bool CompileString(string sourceCode, string sourceName, bool strip, out byte[] bytecode, out string errorMessage)
        {
            bytecode = null;
            var sb = new StringBuilder(1024);
            IntPtr bufferPtr;
            UIntPtr size;

            int result = luac_compile_string(sourceCode, sourceName, strip ? 1 : 0,
                out bufferPtr, out size, sb, sb.Capacity);

            errorMessage = sb.ToString();

            if (result == 0 && bufferPtr != IntPtr.Zero)
            {
                try
                {
                    int len = (int)size;
                    bytecode = new byte[len];
                    Marshal.Copy(bufferPtr, bytecode, 0, len);
                }
                finally
                {
                    luac_free_buffer(bufferPtr);
                }
                return true;
            }

            return false;
        }

        /// <summary>
        /// 为文件添加自定义头部
        /// </summary>
        /// <param name="inputFile">输入文件</param>
        /// <param name="outputFile">输出文件</param>
        /// <param name="header">自定义头部数据</param>
        /// <param name="errorMessage">错误信息</param>
        /// <returns>成功返回 true</returns>
        public bool AddHeader(string inputFile, string outputFile, byte[] header, out string errorMessage)
        {
            var sb = new StringBuilder(1024);
            int result = luac_add_header(inputFile, outputFile, header, header.Length, sb, sb.Capacity);
            errorMessage = sb.ToString();
            return result == 0;
        }

        /// <summary>
        /// 编译 Lua 源文件并添加自定义头部（一步完成）
        /// </summary>
        /// <param name="sourceFile">Lua 源文件路径</param>
        /// <param name="outputFile">输出文件路径</param>
        /// <param name="header">自定义头部数据（可为 null）</param>
        /// <param name="strip">是否剥离调试信息</param>
        /// <param name="errorMessage">错误信息</param>
        /// <returns>成功返回 true</returns>
        public bool CompileWithHeader(string sourceFile, string outputFile, byte[] header, bool strip, out string errorMessage)
        {
            var sb = new StringBuilder(1024);
            int headerSize = header?.Length ?? 0;
            int result = luac_compile_with_header(sourceFile, outputFile, header, headerSize, strip ? 1 : 0, sb, sb.Capacity);
            errorMessage = sb.ToString();
            return result == 0;
        }

        /// <summary>
        /// 创建游戏的 8 字节头部（路径信息格式）
        /// </summary>
        /// <param name="luaPath">Lua 文件路径（如 /scripts/static_msg.lua）</param>
        /// <returns>8 字节头部数据</returns>
        public static byte[] CreateGameHeader(string luaPath)
        {
            // 格式: [4字节路径长度][路径字符串][填充到对齐]
            byte[] pathBytes = Encoding.ASCII.GetBytes(luaPath);
            int pathLen = pathBytes.Length;

            using (var ms = new MemoryStream())
            using (var writer = new BinaryWriter(ms))
            {
                // 写入路径长度（小端序）
                writer.Write((byte)(pathLen & 0xFF));
                writer.Write((byte)((pathLen >> 8) & 0xFF));
                writer.Write((byte)((pathLen >> 16) & 0xFF));
                writer.Write((byte)((pathLen >> 24) & 0xFF));

                // 写入路径字符串
                writer.Write(pathBytes);

                // 写入 null 终止符
                writer.Write((byte)0);

                return ms.ToArray();
            }
        }

        /// <summary>
        /// 一步完成：编译并打包成游戏格式
        /// </summary>
        /// <param name="sourceFile">Lua 源文件</param>
        /// <param name="outputFile">输出文件</param>
        /// <param name="gamePath">游戏中的路径</param>
        /// <param name="strip">是否剥离调试信息</param>
        /// <param name="errorMessage">错误信息</param>
        /// <returns>成功返回 true</returns>
        public bool CompileForGame(string sourceFile, string outputFile, string gamePath, bool strip, out string errorMessage)
        {
            byte[] header = CreateGameHeader(gamePath);
            return CompileWithHeader(sourceFile, outputFile, header, strip, out errorMessage);
        }

        public void Dispose()
        {
            if (!_disposed)
            {
                _disposed = true;
            }
        }
    }
}
