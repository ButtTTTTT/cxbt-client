using System;
using System.Collections.Generic;
using System.IO;

namespace PDEView.Services
{
    public class VFSAllocation
    {
        public ulong StartRawOffset { get; set; }
        public ulong StartRealOffset { get; set; }
        public ulong VfsTableOffset { get; set; }
        public uint BlockCount { get; set; }
        public List<ulong> BlockRawOffsets { get; set; } = new();
        public List<ulong> BlockRealOffsets { get; set; } = new();
    }

    public class VFSManager
    {
        private const uint BLOCK_SIZE = 0x1000;
        private const uint DATA_SEGMENT_SIZE = 0x400000;
        private const uint VFS_TABLE_SIZE = 0x1000;

        private readonly byte[]? _fileData;
        private readonly byte[] _vfsTable;
        private readonly ulong _fileSize;

        public VFSManager(byte[] fileData, byte[] vfsTable)
        {
            _fileData = fileData;
            _vfsTable = vfsTable;
            _fileSize = fileData != null ? (ulong)fileData.Length : 0;
        }
        
        public VFSManager(byte[] vfsTable)
        {
            _fileData = null;
            _vfsTable = vfsTable ?? throw new ArgumentNullException(nameof(vfsTable));
            _fileSize = 0;
        }

        public uint CalculateBlockCount(uint fileSize)
        {
            return (fileSize + BLOCK_SIZE - 1) / BLOCK_SIZE;
        }

        public static ulong RawToRealOffset(ulong rawOffset)
        {
            ulong shifted = rawOffset >> 10;
            ulong intermediate = rawOffset + shifted + 1;
            return intermediate << 12;
        }

        public static ulong RealToRawOffset(ulong realOffset)
        {
            return (realOffset >> 12) * 1024 / 1025;
        }

        public static ulong CalculateVFSTableEntryOffset(ulong fileRawOffset)
        {
            ulong blockIndex = fileRawOffset >> 10;
            ulong blockOffset = (fileRawOffset & 0x3FF) * 4;
            return blockIndex * 0x1000 + blockOffset;
        }

        public uint ReadVFSEntry(ulong vfsTableOffset)
        {
            if (vfsTableOffset + 4 > (ulong)_vfsTable.Length)
            {
                return 0x80000000;
            }

            return (uint)((_vfsTable[vfsTableOffset + 3] << 24) |
                         (_vfsTable[vfsTableOffset + 2] << 16) |
                         (_vfsTable[vfsTableOffset + 1] << 8) |
                         _vfsTable[vfsTableOffset]);
        }

        public ulong GetNextBlockOffset(ulong currentRawOffset)
        {
            ulong vfsEntryOffset = CalculateVFSTableEntryOffset(currentRawOffset);
            uint vfsValue = ReadVFSEntry(vfsEntryOffset);

            if ((vfsValue & 0x80000000) == 0)
            {
                return ulong.MaxValue;
            }
            
            uint nextRawOffset = vfsValue & 0x7FFFFFFF;
            
            if (nextRawOffset == 0)
            {
                return ulong.MaxValue;
            }
            
            return nextRawOffset;
        }
        
        public bool IsFreeBlock(ulong currentRawOffset)
        {
            ulong vfsEntryOffset = CalculateVFSTableEntryOffset(currentRawOffset);
            uint vfsValue = ReadVFSEntry(vfsEntryOffset);
            
            return (vfsValue & 0x80000000) == 0;
        }
        
        public bool IsBlockUsed(ulong currentRawOffset)
        {
            ulong vfsEntryOffset = CalculateVFSTableEntryOffset(currentRawOffset);
            uint vfsValue = ReadVFSEntry(vfsEntryOffset);
            
            return (vfsValue & 0x80000000) != 0;
        }
        
        public uint GetBlockVFSValue(ulong currentRawOffset)
        {
            ulong vfsEntryOffset = CalculateVFSTableEntryOffset(currentRawOffset);
            return ReadVFSEntry(vfsEntryOffset);
        }
    }
}
