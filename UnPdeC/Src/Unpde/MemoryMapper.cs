using System.IO.MemoryMappedFiles;

namespace UnPde {
    public class MemoryMapper : IDisposable {
        private static readonly Lazy<MemoryMapper> _instance = new Lazy<MemoryMapper>(() => new MemoryMapper());
        public static MemoryMapper GetInstance() => _instance.Value;

        private FileStream _fileStream;
        private MemoryMappedFile _memoryMappedFile;
        private string _currentPath = "";
        private long _fileSize = 0;

        // 视图缓存 (视图偏移 -> 视图对象)
        private readonly Dictionary<long, MemoryMappedViewAccessor> _viewCache = new Dictionary<long, MemoryMappedViewAccessor>();
        private readonly ReaderWriterLockSlim _cacheLock = new ReaderWriterLockSlim();

        // 系统分配粒度
        private readonly int _allocationGranularity = Environment.SystemPageSize;

        private MemoryMapper() { }

        public void OpenFile(string filePath) {
            if (_currentPath == filePath && _memoryMappedFile != null) {
                return; // 已经打开相同的文件
            }

            // 关闭当前文件（如果有）
            CloseFile();

            try {
                _fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
                _fileSize = _fileStream.Length;
                _memoryMappedFile = MemoryMappedFile.CreateFromFile(_fileStream, null, 0, MemoryMappedFileAccess.Read, HandleInheritability.None, false);
                _currentPath = filePath;
            } catch (Exception ex) {
                throw new Exception($"无法打开文件: {filePath}, 错误: {ex.Message}");
            }
        }

        public void CloseFile() {
            _cacheLock.EnterWriteLock();
            try {
                foreach (var view in _viewCache.Values) {
                    view.Dispose();
                }
                _viewCache.Clear();

                _memoryMappedFile?.Dispose();
                _memoryMappedFile = null;

                _fileStream?.Dispose();
                _fileStream = null;

                _currentPath = "";
                _fileSize = 0;
            } finally {
                _cacheLock.ExitWriteLock();
            }
        }

        public byte[] ReadData(long offset, int size) {
            if (_memoryMappedFile == null) {
                throw new Exception("文件未打开");
            }

            // 检查偏移是否有效
            if (offset >= _fileSize) {
                return Array.Empty<byte>();
            }

            // 调整大小，确保不超出文件范围
            if (offset + size > _fileSize) {
                size = (int)(_fileSize - offset);
            }

            // 获取数据指针
            byte[] buffer = new byte[size];
            long viewOffset = offset / _allocationGranularity * _allocationGranularity;
            long offsetInView = offset - viewOffset;

            _cacheLock.EnterUpgradeableReadLock();
            try {
                if (!_viewCache.TryGetValue(viewOffset, out MemoryMappedViewAccessor view)) {
                    _cacheLock.EnterWriteLock();
                    try {
                        // 创建新视图
                        view = _memoryMappedFile.CreateViewAccessor(viewOffset, Math.Min(_fileSize - viewOffset, _allocationGranularity * 2), MemoryMappedFileAccess.Read);
                        _viewCache[viewOffset] = view;
                    } finally {
                        _cacheLock.ExitWriteLock();
                    }
                }

                view.ReadArray(offsetInView, buffer, 0, size);
            } finally {
                _cacheLock.ExitUpgradeableReadLock();
            }

            return buffer;
        }

        public List<byte[]> ReadMultipleBlocks(List<(ulong, uint)> blocks) {
            if (_memoryMappedFile == null) {
                throw new Exception("文件未打开");
            }

            List<byte[]> results = new List<byte[]>();
            if (blocks.Count == 0) return results;

            // 按偏移排序以提高局部性
            var sortedBlocks = blocks.Select((b, i) => new { Block = b, Index = i })
                                    .OrderBy(x => x.Block.Item1)
                                    .ToList();

            foreach (var item in sortedBlocks) {
                var block = item.Block;
                results.Add(ReadData((long)block.Item1, (int)block.Item2));
            }

            // 恢复到原始顺序
            var orderedResults = new byte[blocks.Count][];
            for (int i = 0; i < sortedBlocks.Count; i++) {
                orderedResults[sortedBlocks[i].Index] = results[i];
            }

            return orderedResults.ToList();
        }

        public long GetFileSize() => _fileSize;
        public string GetCurrentPath() => _currentPath;
        public bool IsOpen() => _memoryMappedFile != null;

        public void Dispose() {
            CloseFile();
            _cacheLock.Dispose();
        }
    }
}