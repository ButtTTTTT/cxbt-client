using System;
using System.IO;

namespace FCM {
	/// <summary>
	/// [程序入口] FCM 模型转换工具
	/// <para>
	/// 这是一个命令行工具，用于将专有格式（.skel, .mesh, .anim）转换为通用的 Source Engine SMD 格式。
	/// 支持模型合并（多个 mesh 合并为一个 smd）和动画导出。
	/// </para>
	/// </summary>
	class Program {
		static readonly string BaseDir = AppDomain.CurrentDomain.BaseDirectory;

		// [调试配置] 默认测试路径
		// 方便在 IDE 中直接调试，无需配置命令行参数
		// 第三人称测试用例
		static readonly string DefaultSkelPath = Path.Combine(BaseDir, @"TestRes\thirdperson\fireman_01_0\fireman_tp_skeleton.skel");
		static readonly string DefaultMeshPath = string.Join(",",
			Path.Combine(BaseDir, @"TestRes\thirdperson\fireman_01_0\body01_lod0.mesh"),
			Path.Combine(BaseDir, @"TestRes\thirdperson\fireman_01_0\cloth01_lod0.mesh"));
		static readonly string DefaultAnimPath = Path.Combine(BaseDir, @"TestRes\thirdperson\fireman_01_0\stdshoot.anim");
		static readonly string DefaultModelOutPath = Path.Combine(BaseDir, @"TestRes\thirdperson\fireman_01_0\body01_lod0.smd");
		static readonly string DefaultAnimOutPath = Path.Combine(BaseDir, @"TestRes\thirdperson\fireman_01_0\stdshoot.smd");

		// 第一人称测试用例 (注释状态)
		//static readonly string DefaultSkelPath = Path.Combine(BaseDir, @"TestRes\firstperson\fireman_01_0\fireman_fp_skeleton.skel");
		//static readonly string DefaultMeshPath = Path.Combine(BaseDir, @"TestRes\firstperson\fireman_01_0\cloth01_lod0.mesh");
		//static readonly string DefaultAnimPath = Path.Combine(BaseDir, @"TestRes\firstperson\fireman_01_0\reloadthree.anim");
		//static readonly string DefaultModelOutPath = Path.Combine(BaseDir, @"TestRes\firstperson\fireman_01_0\cloth01_lod0.smd");
		//static readonly string DefaultAnimOutPath = Path.Combine(BaseDir, @"TestRes\firstperson\fireman_01_0\reloadthree.smd");

		/// <summary>
		/// 主函数。
		/// </summary>
		/// <param name="args">命令行参数</param>
		static void Main(string[] args) {
			// [无参模式] 使用硬编码的测试路径
			if (args.Length == 0) {
				var defaultMeshFiles = DefaultMeshPath.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
				ExportWithPaths(DefaultSkelPath, defaultMeshFiles, DefaultAnimPath, DefaultModelOutPath, DefaultAnimOutPath);
				return;
			}

			// [单文件调试模式] 打印文件结构信息
			if (args.Length == 1) {
				var ext = Path.GetExtension(args[0]).ToLowerInvariant();
				if (ext == ".skel")
					PrintSkel(args[0]);
				else if (ext == ".mesh")
					PrintMesh(args[0]);
				else if (ext == ".anim")
					PrintAnim(args[0]);
				else
					Console.WriteLine("Unknown extension");
				return;
			}

			// [标准转换模式]
			// 用法: FCM.exe <skel> <mesh1,mesh2...> <anim>
			var skelPath = args[0];
			var meshPaths = args.Length > 1 ? args[1] : string.Empty;
			var animPath = args.Length > 2 ? args[2] : string.Empty;

			// 处理多 mesh 输入（逗号分隔）
			var meshFiles = meshPaths.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
			string outModelPath = string.Empty;
			if (meshFiles.Length > 0) {
				// 输出文件名取第一个 mesh 的文件名，但扩展名为 .smd
				outModelPath = Path.ChangeExtension(meshFiles[0], ".smd");
			}

			// 自动生成动画输出路径
			var outAnimPath = !string.IsNullOrEmpty(animPath)
				? Path.Combine(Path.GetDirectoryName(animPath) ?? ".", Path.GetFileNameWithoutExtension(animPath) + "_anim.smd")
				: string.Empty;

			ExportWithPaths(skelPath, meshFiles, animPath, outModelPath, outAnimPath);
		}

		/// <summary>
		/// [转换管线] 执行完整的模型/动画转换流程。
		/// <para>
		/// 1. 解析骨架并计算 Bind Pose。
		/// 2. 解析并合并所有 Mesh 文件。
		/// 3. 导出模型 SMD。
		/// 4. 解析动画并导出动画 SMD。
		/// </para>
		/// </summary>
		static void ExportWithPaths(string skelPath, string[] meshPaths, string animPath, string outModelPath, string outAnimPath) {
			if (!File.Exists(skelPath)) {
				Console.WriteLine($"Missing skel: {skelPath}");
				return;
			}

			// 1. 加载骨架
			var skeleton = SkelParser.ParseSkel(skelPath);
			SkelParser.BuildBindPose(skeleton); // 关键步骤：计算全局变换矩阵
			Console.WriteLine($"Skeleton Bones: {skeleton.Bones.Count}");

			// 2. 加载和合并网格
			MeshData? mesh = null;
			if (meshPaths != null && meshPaths.Length > 0) {
				foreach (var path in meshPaths) {
					if (File.Exists(path) && Path.GetExtension(path).Equals(".mesh", StringComparison.OrdinalIgnoreCase)) {
						var m = MeshParser.ParseMesh(path);
						Console.WriteLine($"Parsed Mesh: {path} (Objects: {m.Objects.Count})");
						if (mesh == null) {
							mesh = m;
						} else {
							MeshParser.MergeMesh(mesh, m); // 批处理合并
						}
					}
				}

				// 3. 导出模型
				if (mesh != null) {
					Console.WriteLine($"Total Mesh Objects: {mesh.Objects.Count}");
					if (!string.IsNullOrEmpty(outModelPath)) {
						SmdExporter.ExportSMD(skeleton, mesh, outModelPath);
						Console.WriteLine($"Exported model SMD: {outModelPath}");
					}
				}
			}

			// 4. 加载和导出动画
			if (!string.IsNullOrEmpty(animPath) && File.Exists(animPath) && Path.GetExtension(animPath).Equals(".anim", StringComparison.OrdinalIgnoreCase)) {
				var anim = AnimParser.ParseAnim(animPath);
				if (!string.IsNullOrEmpty(outAnimPath)) {
					SmdExporter.ExportAnimSMD(skeleton, anim, outAnimPath);
					Console.WriteLine($"Exported anim SMD: {outAnimPath}");
				}
			}
		}

		/// <summary>
		/// [调试工具] 打印骨架信息。
		/// </summary>
		static void PrintSkel(string skelPath) {
			var skeleton = SkelParser.ParseSkel(skelPath);
			SkelParser.BuildBindPose(skeleton);

			Console.WriteLine($"Skeleton Bones: {skeleton.Bones.Count}");
			for (int i = 0; i < skeleton.Bones.Count; i++) {
				var b = skeleton.Bones[i];
				Console.WriteLine($"{i}: {b.Name} parent={b.ParentIndex}");
				var m = skeleton.BindPose[i];
				Console.WriteLine($"{m.M11:F6} {m.M12:F6} {m.M13:F6} {m.M14:F6}");
				Console.WriteLine($"{m.M21:F6} {m.M22:F6} {m.M23:F6} {m.M24:F6}");
				Console.WriteLine($"{m.M31:F6} {m.M32:F6} {m.M33:F6} {m.M34:F6}");
				Console.WriteLine($"{m.M41:F6} {m.M42:F6} {m.M43:F6} {m.M44:F6}");
				Console.WriteLine();
			}
		}

		/// <summary>
		/// [调试工具] 打印网格信息。
		/// </summary>
		static void PrintMesh(string meshPath) {
			var mesh = MeshParser.ParseMesh(meshPath);
			Console.WriteLine($"Mesh Objects: {mesh.Objects.Count}");
			for (int i = 0; i < mesh.Objects.Count; i++) {
				var o = mesh.Objects[i];
				Console.WriteLine($"{i}: {o.Name} verts={o.Vertices.Count} faces={o.FaceCount} stride=0x{o.VertexStride:X}");
			}
		}

		/// <summary>
		/// [调试工具] 打印动画信息。
		/// </summary>
		static void PrintAnim(string animPath) {
			var anim = AnimParser.ParseAnim(animPath);
			Console.WriteLine($"Anim Tracks: {anim.Tracks.Count}");
			for (int i = 0; i < anim.Tracks.Count; i++) {
				var t = anim.Tracks[i];
				Console.WriteLine($"{i}: {t.BoneName} frames={t.FrameCount}");
			}
		}
	}
}
