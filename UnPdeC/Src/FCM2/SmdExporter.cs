using System;
using System.Collections.Generic;
using System.IO;
using System.Numerics;

namespace FCM2 {
	static class SmdExporter {
		internal static void ExportSMD(Skeleton skeleton, MeshData mesh, string path) {
			using var sw = new StreamWriter(File.Open(path, FileMode.Create, FileAccess.Write, FileShare.Read));
			var boneMap = BuildBoneMap(skeleton);
			var skeletonNameMap = BuildSkeletonNameMap(skeleton);
			sw.WriteLine("version 1");
			sw.WriteLine("nodes");
			WriteNodes(sw, skeleton, boneMap);
			sw.WriteLine("end");
			sw.WriteLine("skeleton");
			WriteSkeleton(sw, skeleton, boneMap, null, 0);
			sw.WriteLine("end");
			sw.WriteLine("triangles");
			WriteTriangles(sw, skeleton, mesh, boneMap, skeletonNameMap);
			sw.WriteLine("end");
		}

		internal static void ExportAnimSMD(Skeleton skeleton, AnimData anim, string path) {
			using var sw = new StreamWriter(File.Open(path, FileMode.Create, FileAccess.Write, FileShare.Read));
			var boneMap = BuildBoneMap(skeleton);
			sw.WriteLine("version 1");
			sw.WriteLine("nodes");
			WriteNodes(sw, skeleton, boneMap);
			sw.WriteLine("end");
			sw.WriteLine("skeleton");
			int maxFrames = 0;
			foreach (var t in anim.Tracks) if (t.FrameCount > maxFrames) maxFrames = (int)t.FrameCount;
			var trackMap = new Dictionary<string, AnimTrack>(StringComparer.OrdinalIgnoreCase);
			foreach (var t in anim.Tracks) trackMap[t.BoneName] = t;
			bool animGlobal = IsAnimGlobalPose(skeleton, trackMap);
			for (int f = 0; f < maxFrames; f++) {
				WriteSkeleton(sw, skeleton, boneMap, trackMap, f, animGlobal);
			}
			sw.WriteLine("end");
			sw.WriteLine("triangles");
			sw.WriteLine("end");
		}

		static BoneMap BuildBoneMap(Skeleton skeleton) {
			var map = new BoneMap();
			map.OldToNew = new int[skeleton.Bones.Count];
			for (int i = 0; i < map.OldToNew.Length; i++) map.OldToNew[i] = -1;
			for (int i = 0; i < skeleton.Bones.Count; i++) {
				var name = skeleton.Bones[i].Name;
				if (!string.IsNullOrEmpty(name)) {
					map.OldToNew[i] = map.Kept.Count;
					map.Kept.Add(i);
				}
			}
			return map;
		}

		static Dictionary<string, int> BuildSkeletonNameMap(Skeleton skeleton) {
			var map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
			for (int i = 0; i < skeleton.Bones.Count; i++) {
				var name = skeleton.Bones[i].Name;
				if (!string.IsNullOrEmpty(name) && !map.ContainsKey(name)) {
					map[name] = i;
				}
			}
			return map;
		}

		static List<(int bone, float weight)> BuildVertexLinks(Skeleton skeleton, MeshData mesh, MeshVertex v, BoneMap boneMap, Dictionary<string, int> skeletonNameMap) {
			var links = new List<(int bone, float weight)>();
			var weights = new[] { v.Weights.X, v.Weights.Y, v.Weights.Z, v.Weights.W };
			float total = 0;
			for (int i = 0; i < 4; i++) {
				float w = weights[i];
				int meshBoneIndex = v.BoneIndices[i];
				if (w <= 0 || meshBoneIndex == 0xFF) continue;
				int skeletonBone = MeshParser.MapMeshBoneIndexToSkeletonIndex(mesh, skeletonNameMap, meshBoneIndex);
				int newBoneIndex = MapBoneIndex(skeleton, boneMap, skeletonBone);
				links.Add((newBoneIndex, w));
				total += w;
			}
			if (links.Count == 0) {
				int skeletonBone = MeshParser.MapMeshBoneIndexToSkeletonIndex(mesh, skeletonNameMap, v.BoneIndices[0]);
				int newBoneIndex = MapBoneIndex(skeleton, boneMap, skeletonBone);
				links.Add((newBoneIndex, 1f));
				return links;
			}
			if (Math.Abs(total - 1f) > 0.0001f) {
				for (int i = 0; i < links.Count; i++) {
					links[i] = (links[i].bone, links[i].weight / total);
				}
			}
			links.Sort((a, b) => b.weight.CompareTo(a.weight));
			return links;
		}

		static void WriteNodes(StreamWriter sw, Skeleton skeleton, BoneMap boneMap) {
			for (int newIndex = 0; newIndex < boneMap.Kept.Count; newIndex++) {
				int oldIndex = boneMap.Kept[newIndex];
				var b = skeleton.Bones[oldIndex];
				int parent = SkelParser.GetEffectiveParentIndex(skeleton, oldIndex);
				int parentNew = -1;
				if (parent >= 0 && parent < skeleton.Bones.Count) {
					parentNew = boneMap.OldToNew[parent];
				}
				sw.WriteLine($"{newIndex} \"{b.Name}\" {parentNew}");
			}
		}

		static void WriteSkeleton(StreamWriter sw, Skeleton skeleton, BoneMap boneMap, Dictionary<string, AnimTrack>? animTracks, int frame, bool animGlobal = false) {
			sw.WriteLine($"time {frame}");
			var axis = MathUtil.RootFixMatrix();
			Matrix4x4.Invert(axis, out var invAxis);
			Vector3[] localPositions = Array.Empty<Vector3>();
			Quaternion[] localRotations = Array.Empty<Quaternion>();
			if (animTracks == null) {
				GetLocalPoseFromGlobal(skeleton, out localPositions, out localRotations);
			}
			for (int newIndex = 0; newIndex < boneMap.Kept.Count; newIndex++) {
				int oldIndex = boneMap.Kept[newIndex];
				var b = skeleton.Bones[oldIndex];
				Vector3 pos;
				Quaternion rot;
				if (animTracks != null && animTracks.TryGetValue(b.Name, out var track) && frame < track.Frames.Count) {
					pos = track.Frames[frame].Position;
					rot = track.Frames[frame].Rotation;
					if (animGlobal) {
						int parent = SkelParser.GetEffectiveParentIndex(skeleton, oldIndex);
						if (parent >= 0 && parent < skeleton.Bones.Count) {
							var parentBone = skeleton.Bones[parent];
							Matrix4x4 parentM;
							if (animTracks.TryGetValue(parentBone.Name, out var pTrack) && frame < pTrack.Frames.Count) {
								parentM = MathUtil.BuildLocalMatrix(pTrack.Frames[frame].Position, pTrack.Frames[frame].Rotation);
							} else {
								parentM = skeleton.BindPose[parent];
							}
							var globalM = MathUtil.BuildLocalMatrix(pos, rot);
							if (Matrix4x4.Invert(parentM, out var invParent)) {
								var localM = globalM * invParent;
								if (Matrix4x4.Decompose(localM, out var scale, out var localRot, out var localPos)) {
									pos = localPos;
									rot = localRot;
								}
							}
						}
					}
				} else {
					pos = localPositions.Length > 0 ? localPositions[oldIndex] : b.Position;
					rot = localRotations.Length > 0 ? localRotations[oldIndex] : b.Rotation;
				}
				pos = Vector3.Transform(pos, axis);
				var r = Matrix4x4.CreateFromQuaternion(rot);
				var converted = invAxis * r * axis;
				rot = Quaternion.CreateFromRotationMatrix(converted);
				var euler = MathUtil.QuaternionToEuler(rot);
				sw.WriteLine($"{newIndex} {pos.X:F6} {pos.Y:F6} {pos.Z:F6} {euler.X:F6} {euler.Y:F6} {euler.Z:F6}");
			}
		}

		static void WriteTriangles(StreamWriter sw, Skeleton skeleton, MeshData mesh, BoneMap boneMap, Dictionary<string, int> skeletonNameMap) {
			for (int oi = 0; oi < mesh.Objects.Count; oi++) {
				var obj = mesh.Objects[oi];
				var material = string.IsNullOrEmpty(obj.Name) ? "default" : obj.Name;
				for (int idx = 0; idx + 2 < obj.Indices.Count; idx += 3) {
					int i0 = obj.Indices[idx];
					int i1 = obj.Indices[idx + 1];
					int i2 = obj.Indices[idx + 2];
					if (i0 < 0 || i1 < 0 || i2 < 0) continue;
					if (i0 >= obj.Vertices.Count || i1 >= obj.Vertices.Count || i2 >= obj.Vertices.Count) continue;
					sw.WriteLine(material);
					WriteVertex(sw, skeleton, mesh, obj.Vertices[i0], boneMap, skeletonNameMap);
					WriteVertex(sw, skeleton, mesh, obj.Vertices[i1], boneMap, skeletonNameMap);
					WriteVertex(sw, skeleton, mesh, obj.Vertices[i2], boneMap, skeletonNameMap);
				}
			}
		}

		static void WriteVertex(StreamWriter sw, Skeleton skeleton, MeshData mesh, MeshVertex v, BoneMap boneMap, Dictionary<string, int> skeletonNameMap) {
			var links = BuildVertexLinks(skeleton, mesh, v, boneMap, skeletonNameMap);
			int baseBone = links.Count > 0 ? links[0].bone : 0;
			var axis = MathUtil.RootFixMatrix();
			var pos = Vector3.Transform(v.Position, axis);
			var nrm = Vector3.Transform(v.Normal, axis);
			if (nrm.LengthSquared() > 0) nrm = Vector3.Normalize(nrm);
			sw.Write($"{baseBone} {pos.X:F6} {pos.Y:F6} {pos.Z:F6} {nrm.X:F6} {nrm.Y:F6} {nrm.Z:F6} {v.UV.X:F6} {v.UV.Y:F6}");
			sw.Write($" {links.Count}");
			for (int i = 0; i < links.Count; i++) {
				sw.Write($" {links[i].bone} {links[i].weight:F6}");
			}
			sw.WriteLine();
		}

		static void GetLocalPoseFromGlobal(Skeleton skeleton, out Vector3[] positions, out Quaternion[] rotations) {
			int n = skeleton.Bones.Count;
			positions = new Vector3[n];
			rotations = new Quaternion[n];
			var globals = new Matrix4x4[n];
			for (int i = 0; i < n; i++) {
				globals[i] = skeleton.BindPose[i];
			}
			for (int i = 0; i < n; i++) {
				int parent = SkelParser.GetEffectiveParentIndex(skeleton, i);
				Matrix4x4 local = globals[i];
				if (parent >= 0 && parent < n) {
					if (Matrix4x4.Invert(globals[parent], out var invParent)) {
						local = globals[i] * invParent;
					}
				}
				if (!Matrix4x4.Decompose(local, out var scale, out var rotation, out var translation)) {
					translation = skeleton.Bones[i].Position;
					rotation = skeleton.Bones[i].Rotation;
				}
				positions[i] = translation;
				rotations[i] = rotation;
			}
		}

		static bool IsAnimGlobalPose(Skeleton skeleton, Dictionary<string, AnimTrack> animTracks) {
			GetLocalPoseFromGlobal(skeleton, out var localPositions, out var localRotations);
			int localBetter = 0;
			int globalBetter = 0;
			int checkedCount = 0;
			for (int i = 0; i < skeleton.Bones.Count; i++) {
				var b = skeleton.Bones[i];
				if (string.IsNullOrEmpty(b.Name)) continue;
				if (!animTracks.TryGetValue(b.Name, out var track)) continue;
				if (track.Frames.Count == 0) continue;
				int parent = SkelParser.GetEffectiveParentIndex(skeleton, i);
				if (parent < 0) continue;
				var frame = track.Frames[0];
				float dLocal = Vector3.Distance(frame.Position, localPositions[i]);
				float aLocal = MathUtil.QuaternionAngle(frame.Rotation, localRotations[i]);

				Matrix4x4 globalM = skeleton.BindPose[i];
				if (!Matrix4x4.Decompose(globalM, out var s, out var globalRot, out var globalPos)) {
					globalPos = globalM.Translation;
					globalRot = Quaternion.CreateFromRotationMatrix(globalM);
				}

				float dGlobal = Vector3.Distance(frame.Position, globalPos);
				float aGlobal = MathUtil.QuaternionAngle(frame.Rotation, globalRot);

				float scoreLocal = dLocal + aLocal;
				float scoreGlobal = dGlobal + aGlobal;
				if (scoreLocal < scoreGlobal) localBetter++; else globalBetter++;
				checkedCount++;
			}
			if (checkedCount == 0) return false;
			return globalBetter > localBetter;
		}

		static int MapBoneIndex(Skeleton skeleton, BoneMap boneMap, int boneIndex) {
			if (boneIndex >= 0 && boneIndex < boneMap.OldToNew.Length) {
				int mapped = boneMap.OldToNew[boneIndex];
				if (mapped >= 0) return mapped;
			}
			int parent = boneIndex >= 0 && boneIndex < skeleton.Bones.Count ? SkelParser.GetEffectiveParentIndex(skeleton, boneIndex) : -1;
			if (parent >= 0 && parent < boneMap.OldToNew.Length) {
				int mapped = boneMap.OldToNew[parent];
				if (mapped >= 0) return mapped;
			}
			return 0;
		}
	}
}
