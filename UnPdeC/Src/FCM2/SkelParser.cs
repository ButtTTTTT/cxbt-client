using System;
using System.Collections.Generic;
using System.IO;
using System.Numerics;

namespace FCM2 {
	static class SkelParser {
		internal static Skeleton ParseSkel(string filePath) {
			using var fs = File.OpenRead(filePath);
			using var br = new BinaryReader(fs);

			br.ReadUInt32();
			uint count = br.ReadUInt32();

			var skeleton = new Skeleton();
			uint v0 = br.ReadUInt32();
			uint v1 = br.ReadUInt32();
			int nameCount = (v0 == 0xFFFFFFFF && v1 == 0x00000000) ? (int)count - 1 : (int)count;
			skeleton.Bones = new List<Bone>(nameCount);

			for (int i = 0; i < nameCount; i++) {
				int parent = br.ReadInt32();
				int nameLen = br.ReadInt32();
				string name = nameLen > 0 ? System.Text.Encoding.ASCII.GetString(br.ReadBytes(nameLen)) : string.Empty;

				skeleton.Bones.Add(new Bone {
					ParentIndex = parent >= 0 ? parent - 1 : -1,
					Name = name
				});
			}

			uint transformsCount = br.ReadUInt32();
			if (v0 == 0xFFFFFFFF && v1 == 0x00000000 && transformsCount > 0) {
				if (IOUtil.CanRead(br, 0x1C)) br.ReadBytes(0x1C);
				transformsCount -= 1;
			}
			int toRead = Math.Min(nameCount, (int)transformsCount);
			for (int i = 0; i < toRead; i++) {
				float tx = br.ReadSingle();
				float ty = br.ReadSingle();
				float tz = br.ReadSingle();
				float qx = br.ReadSingle();
				float qy = br.ReadSingle();
				float qz = br.ReadSingle();
				float qw = br.ReadSingle();

				var b = skeleton.Bones[i];
				b.Rotation = new Quaternion(qx, qy, qz, qw);
				b.Position = new Vector3(tx, ty, tz);
				b.Scale = Vector3.One;
			}

			// NormalizeSkeletonPose(skeleton);
			return skeleton;
		}

		internal static void BuildBindPose(Skeleton skeleton) {
			int n = skeleton.Bones.Count;
			skeleton.BindPose = new Matrix4x4[n];
			skeleton.InverseBindPose = new Matrix4x4[n];

			for (int i = 0; i < n; i++) {
				var bone = skeleton.Bones[i];
				var local = MathUtil.BuildLocalMatrix(bone);
				int parent = GetEffectiveParentIndex(skeleton, i);
				if (parent < 0)
					skeleton.BindPose[i] = local;
				else
					skeleton.BindPose[i] = local * skeleton.BindPose[parent];
			}

			for (int i = 0; i < n; i++) {
				Matrix4x4.Invert(skeleton.BindPose[i], out skeleton.InverseBindPose[i]);
			}
		}

		internal static int GetEffectiveParentIndex(Skeleton skeleton, int boneIndex) {
			int parent = skeleton.Bones[boneIndex].ParentIndex;
			while (parent >= 0 && parent < skeleton.Bones.Count && string.IsNullOrEmpty(skeleton.Bones[parent].Name)) {
				parent = skeleton.Bones[parent].ParentIndex;
			}
			return parent;
		}
	}
}
