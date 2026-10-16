using System.IO;
using System.Numerics;

namespace FCM2 {
	static class AnimParser {
		internal static AnimData ParseAnim(string filePath) {
			using var fs = File.OpenRead(filePath);
			using var br = new BinaryReader(fs);

			br.ReadUInt32();
			uint trackCount = br.ReadUInt32();

			var anim = new AnimData();
			for (int i = 0; i < trackCount; i++) {
				int nameLen = br.ReadInt32();
				string name = nameLen > 0 ? System.Text.Encoding.ASCII.GetString(br.ReadBytes(nameLen)) : string.Empty;
				uint frameCount = br.ReadUInt32();
				uint wordCount = br.ReadUInt32();

				var track = new AnimTrack {
					BoneName = name,
					FrameCount = frameCount,
					WordCount = wordCount
				};

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
						Rotation = new Quaternion(rx, ry, rz, rw)
					});
				}

				anim.Tracks.Add(track);
			}

			return anim;
		}
	}
}
