using System.IO;
using PDEView.Models;

namespace PDEView.Services;

public class DirectoryLoader : IDisposable
{
    private readonly string _directoryPath;
    private bool _disposed;

    public DirectoryLoader(string directoryPath)
    {
        _directoryPath = directoryPath;
    }

    public async Task<PDEEntry> LoadAsync()
    {
        return await Task.Run(() => ScanDirectory(_directoryPath, null, ""));
    }

    private PDEEntry ScanDirectory(string path, PDEEntry? parent, string currentPath)
    {
        var dirInfo = new DirectoryInfo(path);
        
        var rootEntry = new PDEEntry
        {
            Type = EntryType.Directory,
            Name = parent == null ? Path.GetFileName(path) : dirInfo.Name,
            Offset = 0,
            Size = 0,
            Parent = parent,
            FullPath = currentPath,
            UnixTime = new DateTimeOffset(dirInfo.LastWriteTime).ToUnixTimeSeconds(),
            IsLoaded = true
        };

        var children = new List<PDEEntry>();

        try
        {
            foreach (var dir in Directory.GetDirectories(path))
            {
                var dirName = Path.GetFileName(dir);
                var childPath = string.IsNullOrEmpty(currentPath) ? dirName : $"{currentPath}/{dirName}";
                
                var childEntry = ScanDirectory(dir, rootEntry, childPath);
                if (childEntry.Children.Count > 0 || HasCacheFiles(dir))
                {
                    children.Add(childEntry);
                }
            }

            foreach (var file in Directory.GetFiles(path, "*.cache"))
            {
                var fileInfo = new FileInfo(file);
                var fileName = Path.GetFileName(file);
                var childPath = string.IsNullOrEmpty(currentPath) ? fileName : $"{currentPath}/{fileName}";

                var fileEntry = new PDEEntry
                {
                    Type = EntryType.File,
                    Name = fileName,
                    Offset = 0,
                    Size = (uint)fileInfo.Length,
                    Parent = rootEntry,
                    FullPath = childPath,
                    UnixTime = new DateTimeOffset(fileInfo.LastWriteTime).ToUnixTimeSeconds(),
                    IsLoaded = true
                };

                children.Add(fileEntry);
            }
        }
        catch (UnauthorizedAccessException)
        {
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error scanning directory: {ex.Message}");
        }

        rootEntry.Children = children;
        return rootEntry;
    }

    private bool HasCacheFiles(string directory)
    {
        try
        {
            if (Directory.GetFiles(directory, "*.cache").Length > 0)
                return true;

            foreach (var subDir in Directory.GetDirectories(directory))
            {
                if (HasCacheFiles(subDir))
                    return true;
            }
        }
        catch { }
        
        return false;
    }

    public byte[] ReadFile(PDEEntry entry)
    {
        if (entry.IsDirectory) return Array.Empty<byte>();

        string fullPath = Path.Combine(_directoryPath, entry.FullPath);
        
        if (!File.Exists(fullPath)) return Array.Empty<byte>();

        return File.ReadAllBytes(fullPath);
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            _disposed = true;
        }
    }
}
