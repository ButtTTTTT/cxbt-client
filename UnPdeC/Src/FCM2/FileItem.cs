using System.IO;

namespace FCM2 {
	/// <summary>
	/// 表示一个文件项
	/// </summary>
	public class FileItem {
		public string FilePath { get; set; } = string.Empty;
		public string FileName { get; set; } = string.Empty;
		public FileType Type { get; set; }
		
		public FileItem(string filePath) {
			FilePath = filePath;
			FileName = Path.GetFileName(filePath);
			var ext = Path.GetExtension(filePath).ToLowerInvariant();
			Type = ext switch {
				".mesh" => FileType.Mesh,
				".skel" => FileType.Skel,
				".anim" => FileType.Anim,
				_ => FileType.Unknown
			};
		}
	}

	public enum FileType {
		Unknown,
		Mesh,
		Skel,
		Anim
	}
}
