#pragma once

#include <cstdint>
#include <filesystem>
#include <vector>

#include "GV.h"

namespace UnPdeC::VFSTable {
    /// <summary>
    /// 导出VFS表到文件
    /// </summary>
    /// <param name="xorFilePath">XOR文件路径</param>
    /// <returns>如果成功则返回 true，否则返回 false</returns>
    bool DumpVfsTable(UnPdeC::RuntimeContext& ctx, const std::filesystem::path& xorFilePath);

    /// <summary>
    /// 从XOR文件中读取指定VFS偏移量和块大小的数据
    /// </summary>
    /// <param name="VfsOffset">VFS偏移量</param>
    /// <param name="BlockSize">块大小</param>
    /// <returns>读取到的数据字节数组</returns>
    std::vector<uint8_t> ReadDataFromXor(UnPdeC::RuntimeContext& ctx, uint64_t VfsOffset, uint64_t BlockSize);
}
