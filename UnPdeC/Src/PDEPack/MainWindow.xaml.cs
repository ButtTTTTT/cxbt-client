﻿﻿﻿﻿﻿using System.IO;
using System.Windows;
using Microsoft.Win32;
using System.Collections.Generic;
using System.Threading.Tasks;
using System;

namespace PDEPack
{
    public partial class MainWindow : Window
    {
        private const uint BLOCK_SIZE = 0x1000;      // 4KB块大小
        private const uint DATA_SEGMENT_SIZE = 0x400000; // 4MB数据段大小
        private const int ENTRY_SIZE = 0x80;         // 128字节每条目

        public MainWindow()
        {
            InitializeComponent();
        }

        private void Window_DragOver(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                var paths = (string[])e.Data.GetData(DataFormats.FileDrop);
                if (paths.Length == 1 && Directory.Exists(paths[0]))
                {
                    e.Effects = DragDropEffects.Copy;
                    e.Handled = true;
                    return;
                }
            }
            e.Effects = DragDropEffects.None;
            e.Handled = true;
        }

        private void Window_Drop(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                var paths = (string[])e.Data.GetData(DataFormats.FileDrop);
                if (paths.Length == 1 && Directory.Exists(paths[0]))
                {
                    ProcessDirectory(paths[0]);
                }
            }
        }

        private void DropZone_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new OpenFolderDialog
            {
                Title = "选择要打包的文件夹"
            };

            if (dialog.ShowDialog() == true)
            {
                ProcessDirectory(dialog.FolderName);
            }
        }

        private async void ProcessDirectory(string directoryPath)
        {
            try
            {
                StatusText.Text = "正在打包...";
                ProgressBar.Visibility = Visibility.Visible;
                ProgressBar.IsIndeterminate = true;
                IsEnabled = false;

                string outputPath = Path.Combine(
                    Path.GetDirectoryName(directoryPath)!,
                    Path.GetFileName(directoryPath) + ".pde"
                );

                await Task.Run(() => PackDirectory(directoryPath, outputPath));

                StatusText.Text = $"完成！输出: {Path.GetFileName(outputPath)}";
                ProgressBar.Visibility = Visibility.Collapsed;
                
                MessageBox.Show($"打包完成！\n输出文件: {outputPath}", "成功", 
                    MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                StatusText.Text = $"错误: {ex.Message}";
                ProgressBar.Visibility = Visibility.Collapsed;
                MessageBox.Show($"打包失败: {ex.Message}", "错误", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                IsEnabled = true;
            }
        }

        /// <summary>
        /// 打包目录为PDE文件
        /// 
        /// 流式写入流程（支持大于2GB的文件）：
        /// 1. 收集所有文件和目录结构
        /// 2. 第一遍遍历：为所有条目分配 rawOffset（按深度优先顺序）
        /// 3. 计算文件大小
        /// 4. 创建 FileStream 并预分配文件大小
        /// 5. 逐条目写入数据（VFS表项 + 数据块），直接写入文件
        /// 6. 加密VFS块（流式读取-修改-写回）
        /// </summary>
        private void PackDirectory(string directoryPath, string outputPath)
        {
            // 1. 收集所有文件和目录信息
            var rootEntry = new PackEntry
            {
                Name = "Root",
                IsDirectory = true,
                Children = new List<PackEntry>()
            };

            CollectEntries(directoryPath, rootEntry);

            // 2. 收集所有条目的扁平列表（深度优先）
            var allEntries = new List<PackEntry>();
            CollectAllEntriesFlat(rootEntry, allEntries);

            // 3. 第一遍：为所有条目分配 rawOffset
            uint currentRawOffset = 0;
            for (int i = 0; i < allEntries.Count; i++)
            {
                var entry = allEntries[i];
                
                if (entry.IsDirectory)
                {
                    // 计算目录数据大小（基于子条目数量）
                    int dirDataSize = entry.Children.Count * ENTRY_SIZE;
                    dirDataSize = ((dirDataSize + (int)BLOCK_SIZE - 1) / (int)BLOCK_SIZE) * (int)BLOCK_SIZE;
                    if (dirDataSize == 0) dirDataSize = (int)BLOCK_SIZE;
                    
                    entry.Offset = currentRawOffset;
                    entry.Size = (uint)dirDataSize;
                    entry.BlockCount = (uint)(dirDataSize / BLOCK_SIZE);
                    
                    currentRawOffset += entry.BlockCount;
                }
                else
                {
                    // 文件：大小已经确定
                    uint fileBlocks = (entry.Size + BLOCK_SIZE - 1) / BLOCK_SIZE;
                    if (fileBlocks == 0) fileBlocks = 1;
                    
                    entry.Offset = currentRawOffset;
                    entry.BlockCount = fileBlocks;
                    
                    currentRawOffset += fileBlocks;
                }
            }

            // 4. 计算文件大小
            uint maxRawOffset = currentRawOffset;
            uint totalSegments = (maxRawOffset + 1023) / 1024;
            if (totalSegments == 0) totalSegments = 1;

            ulong fileSize;
            if (maxRawOffset > 0)
            {
                uint lastSegment = (maxRawOffset - 1) / 1024;
                uint lastBlockInSegment = (maxRawOffset - 1) % 1024;
                fileSize = (ulong)(lastSegment * (BLOCK_SIZE + DATA_SEGMENT_SIZE) + BLOCK_SIZE + (lastBlockInSegment + 1) * BLOCK_SIZE);
            }
            else
            {
                fileSize = BLOCK_SIZE + BLOCK_SIZE;
            }

            // 5. 流式写入：使用 FileStream 直接写入文件，不再使用 byte[] 缓冲区
            using var fs = new FileStream(outputPath, FileMode.Create, FileAccess.ReadWrite, FileShare.None);
            // 预分配文件大小
            fs.SetLength((long)fileSize);

            // 6. 逐条目写入数据（VFS表项 + 数据块），直接写入文件
            for (int i = 0; i < allEntries.Count; i++)
            {
                var entry = allEntries[i];
                
                if (entry.IsDirectory)
                {
                    byte[] dirData = SerializeDirectory(entry);
                    WriteVfsEntries(fs, entry);
                    WriteEntryDataToStream(fs, entry, dirData);
                }
                else
                {
                    WriteVfsEntries(fs, entry);
                    WriteFileEntryDataToStream(fs, entry);
                }
            }

            // 7. 加密VFS块（流式读取-修改-写回）
            byte[] vfsBlock = new byte[BLOCK_SIZE];
            for (uint seg = 0; seg < totalSegments; seg++)
            {
                ulong vfsOffset = (ulong)(seg * (BLOCK_SIZE + DATA_SEGMENT_SIZE));
                if (vfsOffset < fileSize)
                {
                    fs.Seek((long)vfsOffset, SeekOrigin.Begin);
                    fs.ReadExactly(vfsBlock, 0, (int)BLOCK_SIZE);
                    PDEKey.XorData(vfsBlock, 0, (int)BLOCK_SIZE, vfsOffset);
                    fs.Seek((long)vfsOffset, SeekOrigin.Begin);
                    fs.Write(vfsBlock, 0, (int)BLOCK_SIZE);
                }
            }
            fs.Flush();
            
            System.Diagnostics.Debug.WriteLine($"[PackDirectory] 完成！文件大小: {fileSize} bytes, 条目数: {allEntries.Count}");
        }

        /// <summary>
        /// 收集所有条目的扁平列表（深度优先，目录在前）
        /// </summary>
        private void CollectAllEntriesFlat(PackEntry directory, List<PackEntry> list)
        {
            // 添加当前目录
            list.Add(directory);
            
            // 先添加所有子目录（递归）
            foreach (var child in directory.Children)
            {
                if (child.IsDirectory)
                {
                    CollectAllEntriesFlat(child, list);
                }
            }
            
            // 再添加所有文件
            foreach (var child in directory.Children)
            {
                if (!child.IsDirectory)
                {
                    list.Add(child);
                }
            }
        }

        /// <summary>
        /// 递归收集目录结构
        /// </summary>
        private void CollectEntries(string path, PackEntry parent)
        {
            // 添加目录
            foreach (var dir in Directory.GetDirectories(path))
            {
                var entry = new PackEntry
                {
                    Name = Path.GetFileName(dir),
                    IsDirectory = true,
                    Children = new List<PackEntry>()
                };
                parent.Children.Add(entry);
                CollectEntries(dir, entry);
            }

            // 添加文件
            foreach (var file in Directory.GetFiles(path))
            {
                var entry = new PackEntry
                {
                    Name = Path.GetFileName(file),
                    IsDirectory = false,
                    FilePath = file,
                    Size = (uint)new FileInfo(file).Length
                };
                parent.Children.Add(entry);
            }
        }

        /// <summary>
        /// 序列化目录条目（此时子条目的 Offset 和 Size 已经确定）
        /// </summary>
        private byte[] SerializeDirectory(PackEntry directory)
        {
            List<byte> data = new List<byte>();
            foreach (var child in directory.Children)
            {
                byte[] entryBytes = CreateEntryBytes(child);
                data.AddRange(entryBytes);
            }
            return data.ToArray();
        }

        /// <summary>
        /// 创建条目字节数据
        /// 
        /// 条目结构 (0x80 = 128 字节):
        /// 0x00: 类型 (1=文件, 2=目录)
        /// 0x01: 名称 (UTF-8, 最大110字节, null terminated)
        /// 0x70: 时间戳 (8字节, NTFS FILETIME)
        /// 0x78: Offset (4字节, rawOffset 块索引) ← 最后8字节的前4字节
        /// 0x7C: Size (4字节) ← 最后8字节的后4字节
        /// 
        /// 根据原始文件分析和 DirectoryManager.cs 读取逻辑:
        /// - ENTRY_SIZE - 8 = 0x78 存储的是 Offset (rawOffset)
        /// - ENTRY_SIZE - 4 = 0x7C 存储的是 Size
        /// </summary>
        private byte[] CreateEntryBytes(PackEntry entry)
        {
            byte[] entryBytes = new byte[ENTRY_SIZE];

            // 类型
            entryBytes[0] = (byte)(entry.IsDirectory ? 2 : 1);

            // 名称
            byte[] nameBytes = System.Text.Encoding.UTF8.GetBytes(entry.Name);
            if (nameBytes.Length > 110)
            {
                nameBytes = nameBytes[..110];
            }
            Array.Copy(nameBytes, 0, entryBytes, 1, nameBytes.Length);

            // 时间戳 (当前时间 -> NTFS FILETIME)
            ulong ntfsTime = (ulong)DateTime.Now.ToFileTime();
            byte[] timeBytes = BitConverter.GetBytes(ntfsTime);
            Array.Copy(timeBytes, 0, entryBytes, 0x70, 8);

            // 0x78: Offset (rawOffset) - 最后8字节的前4字节
            BitConverter.TryWriteBytes(new Span<byte>(entryBytes, ENTRY_SIZE - 8, 4), entry.Offset);

            // 0x7C: Size - 最后8字节的后4字节
            BitConverter.TryWriteBytes(new Span<byte>(entryBytes, ENTRY_SIZE - 4, 4), entry.Size);

            System.Diagnostics.Debug.WriteLine($"[CreateEntryBytes] {entry.Name}: Type={entryBytes[0]}, Offset=0x{entry.Offset:X}, Size=0x{entry.Size:X}");
            System.Diagnostics.Debug.WriteLine($"  最后8字节: {BitConverter.ToString(entryBytes, 0x78, 8)}");

            return entryBytes;
        }

        /// <summary>
        /// 写入VFS表项到文件流
        /// 
        /// 正确规则：
        /// - 单块条目：VFS值 = 0x80000000（唯一块）
        /// - 多块条目的非最后块：VFS值 = 0x80000000 | 下一个块的rawOffset
        /// - 多块条目的最后块：VFS值 = 0x80000000
        /// </summary>
        private void WriteVfsEntries(FileStream fs, PackEntry entry)
        {
            uint blocks = entry.BlockCount;
            byte[] vfsValueBytes = new byte[4];

            for (uint i = 0; i < blocks; i++)
            {
                uint currentRawOffset = entry.Offset + i;
                
                // 计算VFS表条目位置
                uint segmentIndex = currentRawOffset / 1024;
                uint blockInSegment = currentRawOffset % 1024;

                ulong vfsBlockFileOffset = (ulong)segmentIndex * (BLOCK_SIZE + DATA_SEGMENT_SIZE);
                uint vfsEntryOffsetInBlock = blockInSegment * 4;
                ulong vfsEntryFileOffset = vfsBlockFileOffset + vfsEntryOffsetInBlock;

                // 确定VFS值
                uint vfsValue;
                if (i == blocks - 1)
                {
                    vfsValue = 0x80000000;
                }
                else
                {
                    vfsValue = 0x80000000 | (currentRawOffset + 1);
                }

                // 流式写入VFS值
                vfsValueBytes[0] = (byte)(vfsValue & 0xFF);
                vfsValueBytes[1] = (byte)((vfsValue >> 8) & 0xFF);
                vfsValueBytes[2] = (byte)((vfsValue >> 16) & 0xFF);
                vfsValueBytes[3] = (byte)((vfsValue >> 24) & 0xFF);

                fs.Seek((long)vfsEntryFileOffset, SeekOrigin.Begin);
                fs.Write(vfsValueBytes, 0, 4);
            }
        }

        /// <summary>
        /// 将目录数据逐块写入文件流（已序列化的 byte[] 数据）
        /// 
        /// 重要：数据写入必须逐块进行，因为 rawOffset 到 realOffset 的映射
        /// 在 segment 边界处存在 VFS 表块的空洞。
        /// </summary>
        private void WriteEntryDataToStream(FileStream fs, PackEntry entry, byte[] data)
        {
            uint blocks = entry.BlockCount;
            byte[] blockData = new byte[BLOCK_SIZE];

            for (uint i = 0; i < blocks; i++)
            {
                uint currentRawOffset = entry.Offset + i;
                ulong realOffset = RawToRealOffset(currentRawOffset);
                
                // 准备当前块的数据
                Array.Clear(blockData, 0, blockData.Length);
                int dataOffset = (int)(i * BLOCK_SIZE);
                int copyLength = Math.Min((int)BLOCK_SIZE, data.Length - dataOffset);
                if (copyLength > 0)
                {
                    Array.Copy(data, dataOffset, blockData, 0, copyLength);
                }
                
                // 加密当前块（使用该块的 realOffset 作为加密偏移）
                PDEKey.XorData(blockData, realOffset);
                
                // 流式写入当前块
                fs.Seek((long)realOffset, SeekOrigin.Begin);
                fs.Write(blockData, 0, (int)BLOCK_SIZE);
            }
        }

        /// <summary>
        /// 将文件数据逐块写入文件流（从源文件读取，避免一次性加载大文件到内存）
        /// 
        /// 与 WriteEntryDataToStream 不同，此方法直接从源文件流式读取，
        /// 不需要先将整个文件内容读入 byte[]，适合大文件处理。
        /// </summary>
        private void WriteFileEntryDataToStream(FileStream fs, PackEntry entry)
        {
            uint blocks = entry.BlockCount;
            byte[] blockData = new byte[BLOCK_SIZE];

            using var sourceFs = new FileStream(entry.FilePath!, FileMode.Open, FileAccess.Read, FileShare.Read);
            int remainingBytes = (int)entry.Size;

            for (uint i = 0; i < blocks; i++)
            {
                uint currentRawOffset = entry.Offset + i;
                ulong realOffset = RawToRealOffset(currentRawOffset);
                
                // 准备当前块的数据
                Array.Clear(blockData, 0, blockData.Length);
                int readLength = Math.Min((int)BLOCK_SIZE, remainingBytes);
                if (readLength > 0)
                {
                    sourceFs.ReadExactly(blockData, 0, readLength);
                    remainingBytes -= readLength;
                }
                
                // 加密当前块（使用该块的 realOffset 作为加密偏移）
                PDEKey.XorData(blockData, realOffset);
                
                // 流式写入当前块
                fs.Seek((long)realOffset, SeekOrigin.Begin);
                fs.Write(blockData, 0, (int)BLOCK_SIZE);
            }
        }

        /// <summary>
        /// 原始偏移转换为实际偏移
        /// </summary>
        private static ulong RawToRealOffset(ulong rawOffset)
        {
            ulong shifted = rawOffset >> 10;
            ulong intermediate = rawOffset + shifted + 1;
            return intermediate << 12;
        }
    }

    /// <summary>
    /// 打包条目信息
    /// </summary>
    internal class PackEntry
    {
        public string Name { get; set; } = "";
        public bool IsDirectory { get; set; }
        public string? FilePath { get; set; }
        public uint Size { get; set; }
        public uint Offset { get; set; }
        public uint BlockCount { get; set; }
        public List<PackEntry> Children { get; set; } = new();
    }

    /// <summary>
    /// PDE密钥生成器
    /// </summary>
    internal static class PDEKey
    {
        private static readonly byte[] _key = new byte[0x1000];
        private static bool _initialized = false;

        public static byte[] GetKey()
        {
            if (!_initialized)
            {
                GenerateKey();
            }
            return _key;
        }

        private static void GenerateKey()
        {
            uint eax = 0x42574954;

            for (int i = 0; i < 0x1000; i++)
            {
                eax *= 0x7FCF;
                _key[i] = (byte)((eax >> 24) ^ ((eax >> 16) & 0xFF) ^ ((eax >> 8) & 0xFF) ^ (eax & 0xFF));
            }

            _initialized = true;
        }

        public static void XorData(byte[] data, ulong startOffset = 0)
        {
            var key = GetKey();
            for (int i = 0; i < data.Length; i++)
            {
                data[i] ^= key[(startOffset + (ulong)i) % 0x1000UL];
            }
        }

        public static void XorData(byte[] data, int dataOffset, int length, ulong fileOffset)
        {
            var key = GetKey();
            for (int i = 0; i < length; i++)
            {
                data[dataOffset + i] ^= key[(fileOffset + (ulong)i) % 0x1000UL];
            }
        }
    }
}
