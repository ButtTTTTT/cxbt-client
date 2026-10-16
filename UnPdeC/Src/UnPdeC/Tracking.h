#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace UnPdeC::Tracking {
    class BlockTracker {
    private:
        uint64_t total_blocks_;
        std::vector<bool> visited_map_;

    public:
        /// <summary>
        /// 构造函数，初始化块追踪器
        /// </summary>
        /// <param name="file_size">文件总大小（字节）</param>
        BlockTracker(uint64_t file_size);

        /// <summary>
        /// 标记指定物理偏移量对应的块为已访问
        /// </summary>
        /// <param name="physical_offset">物理偏移量</param>
        void MarkVisited(uint64_t physical_offset);

        /// <summary>
        /// 检查指定块索引是否已被访问
        /// </summary>
        /// <param name="block_idx">块索引</param>
        /// <returns>如果已访问则返回 true，否则返回 false</returns>
        bool IsVisited(uint64_t block_idx) const;

        /// <summary>
        /// 获取总块数
        /// </summary>
        /// <returns>总块数</returns>
        uint64_t TotalBlocks() const;

        /// <summary>
        /// 获取访问状态映射表
        /// </summary>
        /// <returns>访问状态映射表的常量引用</returns>
        const std::vector<bool>& GetVisitedMap() const;
    };

    /// <summary>
    /// 导出已访问块列表并检测缺失块
    /// </summary>
    /// <param name="tracker">块追踪器实例</param>
    /// <param name="filename">导出文件名</param>
    void ExportAccessedListWithMissingDetection(const BlockTracker& tracker, const std::string& filename);
}
