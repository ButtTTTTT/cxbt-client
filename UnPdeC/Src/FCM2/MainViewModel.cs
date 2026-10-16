using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Input;

namespace FCM2 {
	public class MainViewModel : ViewModelBase {
		private string _statusMessage = "请拖拽或选择文件开始转换";
		private bool _isProcessing = false;
		private string? _outputDirectory;
		private string _modelOutputName = "";

		public ObservableCollection<FileItem> MeshFiles { get; } = new();
		public ObservableCollection<FileItem> SkelFiles { get; } = new();
		public ObservableCollection<FileItem> AnimFiles { get; } = new();

		// 用于拼接名称的标签集合
		public ObservableCollection<string> NameTags { get; } = new();

		public string StatusMessage {
			get => _statusMessage;
			set => SetProperty(ref _statusMessage, value);
		}

		public bool IsProcessing {
			get => _isProcessing;
			set => SetProperty(ref _isProcessing, value);
		}

		public string? OutputDirectory {
			get => _outputDirectory;
			set => SetProperty(ref _outputDirectory, value);
		}

		public string ModelOutputName {
			get => _modelOutputName;
			set => SetProperty(ref _modelOutputName, value);
		}

		public ICommand AddMeshFilesCommand { get; }
		public ICommand AddSkelFilesCommand { get; }
		public ICommand AddAnimFilesCommand { get; }
		public ICommand ClearMeshFilesCommand { get; }
		public ICommand ClearSkelFilesCommand { get; }
		public ICommand ClearAnimFilesCommand { get; }
		public ICommand ConvertCommand { get; }
		public ICommand BrowseOutputCommand { get; }
		public ICommand ResetOutputCommand { get; }
		public ICommand OpenOutputCommand { get; }
		public ICommand RemoveMeshFileCommand { get; }
		public ICommand RemoveSkelFileCommand { get; }
		public ICommand RemoveAnimFileCommand { get; }
		public ICommand AppendNameTagCommand { get; }

		private readonly string _defaultOutputDirectory;
		
		// 记住各类型最后打开的目录
		private string? _lastMeshDirectory;
		private string? _lastSkelDirectory;
		private string? _lastAnimDirectory;

		public MainViewModel() {
			// 初始化默认输出目录
			_defaultOutputDirectory = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "SMDS");
			OutputDirectory = _defaultOutputDirectory;
			
			AddMeshFilesCommand = new RelayCommand(AddMeshFiles);
			AddSkelFilesCommand = new RelayCommand(AddSkelFiles);
			AddAnimFilesCommand = new RelayCommand(AddAnimFiles);
			ClearMeshFilesCommand = new RelayCommand(ClearMeshFiles);
			ClearSkelFilesCommand = new RelayCommand(ClearSkelFiles);
			ClearAnimFilesCommand = new RelayCommand(ClearAnimFiles);
			ConvertCommand = new RelayCommand(Convert, CanConvert);
			BrowseOutputCommand = new RelayCommand(BrowseOutput);
			ResetOutputCommand = new RelayCommand(ResetOutput);
			OpenOutputCommand = new RelayCommand(OpenOutput);
			RemoveMeshFileCommand = new RelayCommand<FileItem>(RemoveMeshFile);
			RemoveSkelFileCommand = new RelayCommand<FileItem>(RemoveSkelFile);
			RemoveAnimFileCommand = new RelayCommand<FileItem>(RemoveAnimFile);
			AppendNameTagCommand = new RelayCommand<string>(AppendNameTag);
		}

		public void AddDroppedFiles(string[] files) {
			foreach (var file in files) {
				AddFile(file);
			}
			UpdateStatus();
			UpdateNameTags();
		}

		private void AddFile(string filePath) {
			if (!File.Exists(filePath)) return;

			var item = new FileItem(filePath);
			switch (item.Type) {
				case FileType.Mesh:
					if (!MeshFiles.Any(f => f.FilePath == filePath))
						Application.Current.Dispatcher.Invoke(() => MeshFiles.Add(item));
					break;
				case FileType.Skel:
					// 只允许一个 skel 文件，先清空再添加
					Application.Current.Dispatcher.Invoke(() => {
						SkelFiles.Clear();
						SkelFiles.Add(item);
					});
					break;
				case FileType.Anim:
					if (!AnimFiles.Any(f => f.FilePath == filePath))
						Application.Current.Dispatcher.Invoke(() => AnimFiles.Add(item));
					break;
			}
		}

		private void AddMeshFiles() {
			var dialog = new Microsoft.Win32.OpenFileDialog {
				Multiselect = true,
				Filter = "Mesh 文件 (*.mesh)|*.mesh|所有文件 (*.*)|*.*",
				Title = "选择 Mesh 模型文件",
				InitialDirectory = _lastMeshDirectory
			};

			if (dialog.ShowDialog() == true) {
				// 记住最后打开的目录
				_lastMeshDirectory = Path.GetDirectoryName(dialog.FileNames[0]);
				foreach (var file in dialog.FileNames) {
					AddFile(file);
				}
				UpdateStatus();
				UpdateNameTags();
			}
		}

		private void AddSkelFiles() {
			var dialog = new Microsoft.Win32.OpenFileDialog {
				Multiselect = false,  // 只允许选择一个 skel 文件
				Filter = "Skeleton 文件 (*.skel)|*.skel|所有文件 (*.*)|*.*",
				Title = "选择 Skel 骨架文件 (仅支持单个文件)",
				InitialDirectory = _lastSkelDirectory
			};

			if (dialog.ShowDialog() == true) {
				// 记住最后打开的目录
				_lastSkelDirectory = Path.GetDirectoryName(dialog.FileName);
				// 先清空再添加（只保留一个）
				SkelFiles.Clear();
				AddFile(dialog.FileName);
				UpdateStatus();
				UpdateNameTags();
			}
		}

		private void AddAnimFiles() {
			var dialog = new Microsoft.Win32.OpenFileDialog {
				Multiselect = true,
				Filter = "Animation 文件 (*.anim)|*.anim|所有文件 (*.*)|*.*",
				Title = "选择 Anim 动画文件",
				InitialDirectory = _lastAnimDirectory
			};

			if (dialog.ShowDialog() == true) {
				// 记住最后打开的目录
				_lastAnimDirectory = Path.GetDirectoryName(dialog.FileNames[0]);
				foreach (var file in dialog.FileNames) {
					AddFile(file);
				}
				UpdateStatus();
			}
		}

		private void ClearMeshFiles() {
			MeshFiles.Clear();
			UpdateStatus();
			UpdateNameTags();
		}

		private void ClearSkelFiles() {
			SkelFiles.Clear();
			UpdateStatus();
			UpdateNameTags();
		}

		private void ClearAnimFiles() {
			AnimFiles.Clear();
			UpdateStatus();
		}

		private void RemoveMeshFile(FileItem? item) {
			if (item != null) {
				MeshFiles.Remove(item);
				UpdateStatus();
				UpdateNameTags();
			}
		}

		private void RemoveSkelFile(FileItem? item) {
			if (item != null) {
				SkelFiles.Remove(item);
				UpdateStatus();
				UpdateNameTags();
			}
		}

		private void RemoveAnimFile(FileItem? item) {
			if (item != null) {
				AnimFiles.Remove(item);
				UpdateStatus();
			}
		}

		/// <summary>
		/// 追加名称标签到导出名称
		/// </summary>
		private void AppendNameTag(string? tag) {
			if (!string.IsNullOrEmpty(tag)) {
				// 追加到导出名称末尾
				if (string.IsNullOrEmpty(ModelOutputName)) {
					ModelOutputName = tag;
				} else {
					ModelOutputName = ModelOutputName.TrimEnd() + "_" + tag;
				}
			}
		}

		/// <summary>
		/// 更新名称标签集合
		/// 提取 Mesh 文件的目录名和 Skel 文件的名称
		/// </summary>
		private void UpdateNameTags() {
			NameTags.Clear();
			
			// 从 Mesh 文件提取目录名
			// 例如: D:\...\weapon\ak47\mz1_n_lod0.mesh -> ak47
			var meshParentDirs = new System.Collections.Generic.HashSet<string>();
			foreach (var mesh in MeshFiles) {
				var dir = Path.GetDirectoryName(mesh.FilePath);
				if (!string.IsNullOrEmpty(dir)) {
					var parentDirName = new DirectoryInfo(dir).Name;
					if (!string.IsNullOrEmpty(parentDirName)) {
						meshParentDirs.Add(parentDirName);
					}
				}
			}
			foreach (var dir in meshParentDirs.OrderBy(d => d)) {
				NameTags.Add(dir);
			}
			
			// 从 Skel 文件提取文件名（不含扩展名）
			// 例如: ak47skeleton.skel -> ak47skeleton
			var skelNames = new System.Collections.Generic.HashSet<string>();
			foreach (var skel in SkelFiles) {
				var name = Path.GetFileNameWithoutExtension(skel.FileName);
				if (!string.IsNullOrEmpty(name)) {
					skelNames.Add(name);
				}
			}
			foreach (var name in skelNames.OrderBy(n => n)) {
				NameTags.Add(name);
			}

			// 生成默认导出名称（不再自动修改输出目录）
			if (MeshFiles.Count > 0) {
				ModelOutputName = GenerateModelName();
			}
		}

		/// <summary>
		/// 生成默认导出名称 - 使用目录名而非文件名
		/// </summary>
		private string GenerateModelName() {
			// 从 Mesh 文件提取目录名
			var dirNames = new System.Collections.Generic.HashSet<string>();
			foreach (var mesh in MeshFiles) {
				var dir = Path.GetDirectoryName(mesh.FilePath);
				if (!string.IsNullOrEmpty(dir)) {
					var parentDirName = new DirectoryInfo(dir).Name;
					if (!string.IsNullOrEmpty(parentDirName)) {
						dirNames.Add(parentDirName);
					}
				}
			}
			
			// 从 Skel 文件提取文件名
			var skelNames = new System.Collections.Generic.HashSet<string>();
			foreach (var skel in SkelFiles) {
				var name = Path.GetFileNameWithoutExtension(skel.FileName);
				if (!string.IsNullOrEmpty(name)) {
					skelNames.Add(name);
				}
			}

			// 合并：目录名 + skel名称
			var allNames = dirNames.Concat(skelNames).Distinct().OrderBy(n => n).ToArray();
			return string.Join("_", allNames);
		}

		private bool CanConvert() {
			return !IsProcessing && SkelFiles.Count > 0;
		}

		private void Convert() {
			if (IsProcessing) return;

			IsProcessing = true;
			StatusMessage = "正在转换...";

			try {
				var meshPaths = MeshFiles.Select(f => f.FilePath).ToArray();
				var animPaths = AnimFiles.Select(f => f.FilePath).ToArray();

				// 确定模型输出目录
				var outDir = OutputDirectory;
				if (string.IsNullOrEmpty(outDir) && SkelFiles.Count > 0) {
					outDir = Path.GetDirectoryName(SkelFiles[0].FilePath) ?? ".";
				}

				// 确保输出目录存在
				if (!string.IsNullOrEmpty(outDir) && !Directory.Exists(outDir)) {
					Directory.CreateDirectory(outDir);
				}

				// 合并所有 Mesh
				MeshData? mergedMesh = null;
				if (meshPaths.Length > 0) {
					foreach (var path in meshPaths) {
						if (File.Exists(path)) {
							var m = MeshParser.ParseMesh(path);
							if (mergedMesh == null) {
								mergedMesh = m;
							} else {
								MeshParser.MergeMesh(mergedMesh, m);
							}
						}
					}
				}

				int successCount = 0;
				int totalCount = SkelFiles.Count + AnimFiles.Count;

				// 为每个 Skel 分别导出模型
				foreach (var skelFile in SkelFiles) {
				var skelPath = skelFile.FilePath;

				// 解析骨架
				var skeleton = SkelParser.ParseSkel(skelPath);
				SkelParser.BuildBindPose(skeleton);
				StatusMessage = $"骨架解析完成: {skeleton.Bones.Count} 根骨骼";

				// 导出模型
				if (mergedMesh != null) {
					// 使用用户指定的名称或生成名称
					var modelName = string.IsNullOrWhiteSpace(ModelOutputName) 
						? GenerateModelName() 
						: ModelOutputName.Trim();
					
					// 确保文件名以 .smd 结尾
					if (!modelName.EndsWith(".smd", StringComparison.OrdinalIgnoreCase)) {
						modelName += ".smd";
					}
					
					var outModelPath = Path.Combine(outDir, modelName);
					SmdExporter.ExportSMD(skeleton, mergedMesh, outModelPath);
					StatusMessage = $"模型导出完成: {Path.GetFileName(outModelPath)}";
					successCount++;
				}
			}

			// 导出动画
			if (animPaths.Length > 0 && SkelFiles.Count > 0) {
				var skeleton = SkelParser.ParseSkel(SkelFiles[0].FilePath);
				SkelParser.BuildBindPose(skeleton);

					foreach (var animPath in animPaths) {
						if (File.Exists(animPath)) {
							var anim = AnimParser.ParseAnim(animPath);
							// 使用动画文件原来的目录
							var animDir = Path.GetDirectoryName(animPath) ?? outDir;
							var outAnimPath = Path.Combine(animDir, Path.GetFileNameWithoutExtension(animPath) + ".smd");
							SmdExporter.ExportAnimSMD(skeleton, anim, outAnimPath);
							StatusMessage = $"动画导出完成: {Path.GetFileName(outAnimPath)}";
							successCount++;
						}
					}
				}

				if (totalCount == 0) {
					StatusMessage = "没有需要转换的文件（需要Skel+Mesh或Anim文件）";
				} else {
					StatusMessage = $"转换完成! 成功导出 {successCount}/{totalCount} 个文件";
				}
			} catch (Exception ex) {
				StatusMessage = $"转换失败: {ex.Message}";
				MessageBox.Show($"转换失败:\n{ex.Message}", "错误", MessageBoxButton.OK, MessageBoxImage.Error);
			} finally {
				IsProcessing = false;
				CommandManager.InvalidateRequerySuggested();
			}
		}

		private string FormatMeshName(string name) {
			// 尝试将 body01_lod0 转换为 body_01_lod0
			if (string.IsNullOrEmpty(name)) return "model";

			// 查找数字前的位置插入下划线
			var result = System.Text.RegularExpressions.Regex.Replace(name, @"([a-zA-Z]+)(\d+)", "$1_$2");
			return result;
		}

		private void ResetOutput() {
			OutputDirectory = _defaultOutputDirectory;
			StatusMessage = "已恢复默认输出目录";
		}

		private void OpenOutput() {
			try {
				var dir = OutputDirectory ?? _defaultOutputDirectory;
				if (!Directory.Exists(dir)) {
					Directory.CreateDirectory(dir);
				}
				System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo {
					FileName = dir,
					UseShellExecute = true,
					Verb = "open"
				});
			} catch (Exception ex) {
				MessageBox.Show($"无法打开目录: {ex.Message}", "错误", MessageBoxButton.OK, MessageBoxImage.Error);
			}
		}

		private void BrowseOutput() {
			var dialog = new Microsoft.Win32.SaveFileDialog {
				Title = "选择输出目录",
				FileName = "select_folder",
				Filter = "文件夹|*.placeholder"
			};

			if (dialog.ShowDialog() == true) {
				OutputDirectory = Path.GetDirectoryName(dialog.FileName);
			}
		}

		private void UpdateStatus() {
			var parts = new System.Collections.Generic.List<string>();
			if (MeshFiles.Count > 0) parts.Add($"{MeshFiles.Count} 个Mesh");
			if (SkelFiles.Count > 0) parts.Add($"{SkelFiles.Count} 个Skel");
			if (AnimFiles.Count > 0) parts.Add($"{AnimFiles.Count} 个Anim");
			
			StatusMessage = parts.Count > 0 
				? $"已加载: {string.Join(", ", parts)}" 
				: "请拖拽或选择文件开始转换";

			CommandManager.InvalidateRequerySuggested();
		}
	}
}
