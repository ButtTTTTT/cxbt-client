namespace ReCache.Models;

/// <summary>
/// 压缩模式
/// </summary>
public enum CompressionMode {
    /// <summary>
    /// 压缩 (0x6F) - 标准 LZ77 压缩
    /// </summary>
    Compress,

    /// <summary>
    /// 不压缩 (0x6E) - 数据直接存储
    /// </summary>
    NoCompression
}

/// <summary>
/// 打包选项
/// </summary>
public class PackOptions {
    /// <summary>
    /// 压缩模式（默认压缩）
    /// </summary>
    public CompressionMode CompressionMode { get; set; } = CompressionMode.Compress;

    /// <summary>
    /// 是否添加 .cache 扩展名
    /// </summary>
    public bool AddCacheExtension { get; set; } = true;

    /// <summary>
    /// 文件类型标识 (4字节, 默认填 FF)
    /// </summary>
    public uint FileTypeIdentifier { get; set; } = 0xFFFFFFFF;

    /// <summary>
    /// CRC32 校验码 (默认填 FF，如果指定 RootPath 则自动计算)
    /// </summary>
    public uint Crc32 { get; set; } = 0xFFFFFFFF;

    /// <summary>
    /// 原始 .cache 文件路径（用于读取前 8 字节和 CRC32）
    /// </summary>
    public string? OriginalCachePath { get; set; }

    /// <summary>
    /// 资源根目录路径（用于计算 CRC32）
    /// 必须是 .cache 文件所在的根目录
    /// </summary>
    public string? RootPath { get; set; }

    /// <summary>
    /// 从原始 .cache 文件解压出的前 8 字节头部
    /// </summary>
    public byte[]? OriginalFirst8Bytes { get; set; }

    /// <summary>
    /// 是否在打包时在待压缩文件数据前添加原始8字节头
    /// </summary>
    public bool PrependFirst8Bytes { get; set; }
}
