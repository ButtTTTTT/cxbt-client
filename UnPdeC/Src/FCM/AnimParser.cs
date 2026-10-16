using System.IO;
using System.Numerics;

namespace FCM {
	/// <summary>
	/// [核心模块] 动画文件解析器
	/// <para>
	/// 负责解析 .anim 二进制文件，提取骨骼动画数据。
	/// 支持读取多条动画轨道（Animation Tracks），每条轨道对应一根骨骼的关键帧序列。
	/// </para>
	/// </summary>
	static class AnimParser {
		/// <summary>
		/// [解析入口] 解析 .anim 文件并构建 AnimData 对象。
		/// </summary>
		/// <param name="filePath">动画文件的绝对路径</param>
		/// <returns>解析完成的 AnimData 对象，包含所有骨骼的动画轨道</returns>
		internal static AnimData ParseAnim(string filePath) {
			using var fs = File.OpenRead(filePath);
			using var br = new BinaryReader(fs);

			// [文件头解析]
			// 读取文件版本或标识符
			br.ReadUInt32(); // Version or Magic
			uint trackCount = br.ReadUInt32(); // 动画轨道数量（对应受影响的骨骼数）

			var anim = new AnimData();
			for (int i = 0; i < trackCount; i++) {
				// [轨道头解析]
				// 读取受该轨道控制的骨骼名称
				int nameLen = br.ReadInt32();
				string name = nameLen > 0 ? System.Text.Encoding.ASCII.GetString(br.ReadBytes(nameLen)) : string.Empty;
				
				uint frameCount = br.ReadUInt32();
				uint wordCount = br.ReadUInt32(); // 单帧数据字长（可能用于步长计算或校验）

				var track = new AnimTrack {
					BoneName = name,
					FrameCount = frameCount,
					WordCount = wordCount
				};

				// [关键帧数据解析]
				// 逐帧读取位移（Position）和旋转（Rotation）数据
				// 注意：这里假设关键帧是均匀采样的（Uniform Sampling），即每帧时间间隔固定
				for (int f = 0; f < frameCount; f++) {
					float px = br.ReadSingle();
					float py = br.ReadSingle();
					float pz = br.ReadSingle();
					float rx = br.ReadSingle();
					float ry = br.ReadSingle();
					float rz = br.ReadSingle();
					float rw = br.ReadSingle();
					
					track.Frames.Add(new AnimFrame {
						Position = new Vector3(px, py, pz),
						Rotation = new Quaternion(rx, ry, rz, rw) // 四元数旋转
					});
				}

				anim.Tracks.Add(track);
			}

			return anim;
		}
	}
}
