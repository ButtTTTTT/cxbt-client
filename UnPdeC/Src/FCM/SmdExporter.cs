using System;
using System.Collections.Generic;
using System.IO;
using System.Numerics;

namespace FCM {
	/// <summary>
	/// [导出模块] Valve SMD 格式导出器
	/// <para>
	/// 负责将解析后的骨架、网格和动画数据导出为 Valve Source Engine 使用的 SMD (Studiomdl Data) 文本格式。
	/// SMD 是一种基于 ASCII 的中间格式，易于阅读和调试，被广泛用于 Half-Life 系列及相关模组开发。
	/// </para>
	/// </summary>
	static class SmdExporter {
		/// <summary>
		/// [导出入口] 导出参考网格 (Reference Mesh) 到 SMD 文件。
		/// <para>
		/// 参考网格包含骨骼定义、T-Pose 骨架以及加权的网格几何体。
		/// 通常对应 .smd 文件中的 "triangles" 部分。
		/// </para>
		/// </summary>
		/// <param name="skeleton">骨架数据</param>
		/// <param name="mesh">网格数据</param>
		/// <param name="path">输出文件的绝对路径</param>
		internal static void ExportSMD(Skeleton skeleton, MeshData mesh, string path) {
			using var sw = new StreamWriter(File.Open(path, FileMode.Create, FileAccess.Write, FileShare.Read));
			var boneMap = BuildBoneMap(skeleton);
			var skeletonNameMap = BuildSkeletonNameMap(skeleton);
			
			// [文件头] 必须以 "version 1" 开头
			sw.WriteLine("version 1");
			
			// [骨骼节点] 写入所有保留的骨骼及其父子关系
			sw.WriteLine("nodes");
			WriteNodes(sw, skeleton, boneMap);
			sw.WriteLine("end");
			
			// [骨架姿势] 对于参考网格，通常只写入一帧（time 0），即绑定姿势（Bind Pose）
			sw.WriteLine("skeleton");
			WriteSkeleton(sw, skeleton, boneMap, null, 0);
			sw.WriteLine("end");
			
			// [三角形数据] 写入几何体顶点数据、UV、法线及骨骼权重
			sw.WriteLine("triangles");
			WriteTriangles(sw, skeleton, mesh, boneMap, skeletonNameMap);
			sw.WriteLine("end");
		}

		/// <summary>
		/// [导出入口] 导出动画数据到 SMD 文件。
		/// <para>
		/// 动画 SMD 仅包含骨骼定义和关键帧动画数据，不包含三角形几何体。
		/// </para>
		/// </summary>
		/// <param name="skeleton">基础骨架</param>
		/// <param name="anim">动画数据</param>
		/// <param name="path">输出文件的绝对路径</param>
		internal static void ExportAnimSMD(Skeleton skeleton, AnimData anim, string path) {
			using var sw = new StreamWriter(File.Open(path, FileMode.Create, FileAccess.Write, FileShare.Read));
			var boneMap = BuildBoneMap(skeleton);
			
			sw.WriteLine("version 1");
			sw.WriteLine("nodes");
			WriteNodes(sw, skeleton, boneMap);
			sw.WriteLine("end");
			
			sw.WriteLine("skeleton");
			int maxFrames = 0;
			// 计算所有轨道中的最大帧数
			foreach (var t in anim.Tracks) if (t.FrameCount > maxFrames) maxFrames = (int)t.FrameCount;
			
			// 构建轨道查询表，优化查找性能
			var trackMap = new Dictionary<string, AnimTrack>(StringComparer.OrdinalIgnoreCase);
			foreach (var t in anim.Tracks) trackMap[t.BoneName] = t;
			
			// [空间检测] 启发式检测动画数据是基于全局空间还是局部空间
			bool animGlobal = IsAnimGlobalPose(skeleton, trackMap);
			
			// 逐帧写入所有骨骼的姿势
			for (int f = 0; f < maxFrames; f++) {
				WriteSkeleton(sw, skeleton, boneMap, trackMap, f, animGlobal);
			}
			sw.WriteLine("end");
			
			// 动画文件不需要几何体数据，但必须包含空的 triangles 块
			sw.WriteLine("triangles");
			sw.WriteLine("end");
		}

		/// <summary>
		/// [辅助工具] 构建骨骼索引映射表，自动剔除无名骨骼。
		/// <para>
		/// 许多 DCC 工具会导出无用的辅助节点，我们需要将其过滤掉，并重新映射剩余骨骼的索引。
		/// </para>
		/// </summary>
		static BoneMap BuildBoneMap(Skeleton skeleton) {
			var map = new BoneMap();
			map.OldToNew = new int[skeleton.Bones.Count];
			for (int i = 0; i < map.OldToNew.Length; i++) map.OldToNew[i] = -1; // 初始化为 -1 (剔除)
			for (int i = 0; i < skeleton.Bones.Count; i++) {
				var name = skeleton.Bones[i].Name;
				if (!string.IsNullOrEmpty(name)) {
					map.OldToNew[i] = map.Kept.Count; // 记录新旧索引映射
					map.Kept.Add(i);
				}
			}
			return map;
		}

		/// <summary>
		/// [辅助工具] 构建骨骼名称到索引的查找表。
		/// </summary>
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

		/// <summary>
		/// [蒙皮权重] 构建顶点的骨骼权重链接 (Bone Weights Links)。
		/// <para>
		/// SMD 格式要求每个顶点显式列出受影响的骨骼索引及其权重。
		/// 本方法负责将网格的局部骨骼索引转换为导出后的新骨骼索引，并进行权重归一化和排序。
		/// </para>
		/// </summary>
		/// <param name="skeleton">原始骨架</param>
		/// <param name="mesh">网格数据</param>
		/// <param name="v">当前处理的顶点</param>
		/// <param name="boneMap">骨骼索引重映射表</param>
		/// <param name="skeletonNameMap">骨骼名称查找表</param>
		/// <returns>排序后的 (骨骼索引, 权重) 列表</returns>
		static List<(int bone, float weight)> BuildVertexLinks(Skeleton skeleton, MeshData mesh, MeshVertex v, BoneMap boneMap, Dictionary<string, int> skeletonNameMap) {
			var links = new List<(int bone, float weight)>();
			var weights = new[] { v.Weights.X, v.Weights.Y, v.Weights.Z, v.Weights.W };
			float total = 0;
			
			// [权重收集]
			// 遍历最多 4 个骨骼影响
			for (int i = 0; i < 4; i++) {
				float w = weights[i];
				int meshBoneIndex = v.BoneIndices[i];
				
				// [过滤无效数据]
				// 忽略权重为 0 或索引无效 (0xFF) 的条目
				if (w <= 0 || meshBoneIndex == 0xFF) continue;
				
				// [多级索引映射]
				// 1. Mesh Local Index -> Global Skeleton Name -> Global Skeleton Index
				int skeletonBone = MeshParser.MapMeshBoneIndexToSkeletonIndex(mesh, skeletonNameMap, meshBoneIndex);
				// 2. Global Skeleton Index -> Exported Bone Index (剔除后)
				int newBoneIndex = MapBoneIndex(skeleton, boneMap, skeletonBone);
				
				links.Add((newBoneIndex, w));
				total += w;
			}
			
			// [异常处理]
			// 如果没有有效权重（刚体绑定或数据错误），默认绑定到第一个关联骨骼，权重设为 1.0
			if (links.Count == 0) {
				int skeletonBone = MeshParser.MapMeshBoneIndexToSkeletonIndex(mesh, skeletonNameMap, v.BoneIndices[0]);
				int newBoneIndex = MapBoneIndex(skeleton, boneMap, skeletonBone);
				links.Add((newBoneIndex, 1f));
				return links;
			}
			
			// [权重归一化]
			// 确保权重之和严格等于 1.0，防止蒙皮变形
			if (Math.Abs(total - 1f) > 0.0001f) {
				for (int i = 0; i < links.Count; i++) {
					links[i] = (links[i].bone, links[i].weight / total);
				}
			}
			
			// [排序优化]
			// 按权重降序排序。Source Engine 推荐权重大的骨骼排在前面，且某些编译器限制链接数量（如最多3个）。
			links.Sort((a, b) => b.weight.CompareTo(a.weight));
			return links;
		}

		/// <summary>
		/// [格式写入] 写入 "nodes" 块。
		/// <para>
		/// 格式：BoneIndex "BoneName" ParentIndex
		/// </para>
		/// </summary>
		static void WriteNodes(StreamWriter sw, Skeleton skeleton, BoneMap boneMap) {
			for (int newIndex = 0; newIndex < boneMap.Kept.Count; newIndex++) {
				int oldIndex = boneMap.Kept[newIndex];
				var b = skeleton.Bones[oldIndex];
				int parent = SkelParser.GetEffectiveParentIndex(skeleton, oldIndex);
				int parentNew = -1;
				// 映射父骨骼索引到新索引
				if (parent >= 0 && parent < skeleton.Bones.Count) {
					parentNew = boneMap.OldToNew[parent];
				}
				sw.WriteLine($"{newIndex} \"{b.Name}\" {parentNew}");
			}
		}

		/// <summary>
		/// [格式写入] 写入 "skeleton" 块中的一帧数据。
		/// <para>
		/// 格式：time X
		/// BoneIndex PosX PosY PosZ RotX RotY RotZ
		/// 注意：旋转使用欧拉角（Euler Angles），位置和旋转需要根据坐标系差异进行转换。
		/// </para>
		/// </summary>
		static void WriteSkeleton(StreamWriter sw, Skeleton skeleton, BoneMap boneMap, Dictionary<string, AnimTrack>? animTracks, int frame, bool animGlobal = false) {
			sw.WriteLine($"time {frame}");
			
			// [坐标系修正]
			// 构建用于将当前坐标系（如 Y-Up）转换为目标坐标系（Z-Up）的矩阵
			var axis = MathUtil.RootFixMatrix();
			Matrix4x4.Invert(axis, out var invAxis);
			
			Vector3[] localPositions = Array.Empty<Vector3>();
			Quaternion[] localRotations = Array.Empty<Quaternion>();
			
			// 如果没有动画轨道（即导出参考姿势），先从全局 BindPose 计算出局部姿势
			if (animTracks == null) {
				GetLocalPoseFromGlobal(skeleton, out localPositions, out localRotations);
			}
			
			for (int newIndex = 0; newIndex < boneMap.Kept.Count; newIndex++) {
				int oldIndex = boneMap.Kept[newIndex];
				var b = skeleton.Bones[oldIndex];
				Vector3 pos;
				Quaternion rot;
				
				// [姿势获取]
				// 优先从动画轨道获取数据，否则使用参考姿势
				if (animTracks != null && animTracks.TryGetValue(b.Name, out var track) && frame < track.Frames.Count) {
					pos = track.Frames[frame].Position;
					rot = track.Frames[frame].Rotation;
					
					// [空间转换]
					// 如果源动画数据是全局空间的（某些引擎特性），必须将其转换为局部空间
					// 公式：Local = Global * Inverse(Global_Parent)
					if (animGlobal) {
						int parent = SkelParser.GetEffectiveParentIndex(skeleton, oldIndex);
						if (parent >= 0 && parent < skeleton.Bones.Count) {
							var parentBone = skeleton.Bones[parent];
							Matrix4x4 parentM;
							// 获取父骨骼在当前帧的全局变换
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
					// 使用计算好的参考姿势
					pos = localPositions.Length > 0 ? localPositions[oldIndex] : b.Position;
					rot = localRotations.Length > 0 ? localRotations[oldIndex] : b.Rotation;
				}
				
				// [最终变换]
				// 应用坐标系旋转：Pos_new = Pos * Axis
				// 旋转转换稍微复杂：Rot_new = Axis_Inv * Rot * Axis (基变换)
				pos = Vector3.Transform(pos, axis);
				var r = Matrix4x4.CreateFromQuaternion(rot);
				var converted = invAxis * r * axis;
				rot = Quaternion.CreateFromRotationMatrix(converted);
				
				// [欧拉角转换]
				// SMD 使用欧拉角存储旋转
				var euler = MathUtil.QuaternionToEuler(rot);
				
				sw.WriteLine($"{newIndex} {pos.X:F6} {pos.Y:F6} {pos.Z:F6} {euler.X:F6} {euler.Y:F6} {euler.Z:F6}");
			}
		}

		/// <summary>
		/// [格式写入] 写入 "triangles" 块。
		/// <para>
		/// 遍历所有子网格，写入每个三角形的材质名和三个顶点数据。
		/// </para>
		/// </summary>
		static void WriteTriangles(StreamWriter sw, Skeleton skeleton, MeshData mesh, BoneMap boneMap, Dictionary<string, int> skeletonNameMap) {
			for (int oi = 0; oi < mesh.Objects.Count; oi++) {
				var obj = mesh.Objects[oi];
				var material = string.IsNullOrEmpty(obj.Name) ? "default" : obj.Name;
				
				// 遍历索引缓冲区
				for (int idx = 0; idx + 2 < obj.Indices.Count; idx += 3) {
					int i0 = obj.Indices[idx];
					int i1 = obj.Indices[idx + 1];
					int i2 = obj.Indices[idx + 2];
					
					// 索引越界检查
					if (i0 < 0 || i1 < 0 || i2 < 0) continue;
					if (i0 >= obj.Vertices.Count || i1 >= obj.Vertices.Count || i2 >= obj.Vertices.Count) continue;
					
					sw.WriteLine(material); // 每个三角形前一行是材质名
					WriteVertex(sw, skeleton, mesh, obj.Vertices[i0], boneMap, skeletonNameMap);
					WriteVertex(sw, skeleton, mesh, obj.Vertices[i1], boneMap, skeletonNameMap);
					WriteVertex(sw, skeleton, mesh, obj.Vertices[i2], boneMap, skeletonNameMap);
				}
			}
		}

		static void WriteVertex(StreamWriter sw, Skeleton skeleton, MeshData mesh, MeshVertex v, BoneMap boneMap, Dictionary<string, int> skeletonNameMap) {
			var links = BuildVertexLinks(skeleton, mesh, v, boneMap, skeletonNameMap);
			int baseBone = links.Count > 0 ? links[0].bone : 0;
			
			// [顶点变换]
			// 将顶点位置和法线转换到目标坐标系（如 Z-Up）
			var axis = MathUtil.RootFixMatrix();
			var pos = Vector3.Transform(v.Position, axis);
			var nrm = Vector3.Transform(v.Normal, axis);
			if (nrm.LengthSquared() > 0) nrm = Vector3.Normalize(nrm);
			
			// [数据行格式]
			// ParentBone PosX PosY PosZ NormX NormY NormZ U V LinksCount [BoneIndex Weight]...
			sw.Write($"{baseBone} {pos.X:F6} {pos.Y:F6} {pos.Z:F6} {nrm.X:F6} {nrm.Y:F6} {nrm.Z:F6} {v.UV.X:F6} {v.UV.Y:F6}");
			sw.Write($" {links.Count}");
			for (int i = 0; i < links.Count; i++) {
				sw.Write($" {links[i].bone} {links[i].weight:F6}");
			}
			sw.WriteLine();
		}

		/// <summary>
		/// [逆向计算] 从全局绑定姿势矩阵计算局部变换数据（Pos/Rot）。
		/// <para>
		/// 当骨架数据中只存储了 Global Bind Pose Matrix，而没有存储显式的局部 SRT 数据时，
		/// 需要通过矩阵逆运算还原局部变换。
		/// 公式：Local_i = Global_i * Inverse(Global_Parent_i)
		/// </para>
		/// </summary>
		static void GetLocalPoseFromGlobal(Skeleton skeleton, out Vector3[] positions, out Quaternion[] rotations) {
			int n = skeleton.Bones.Count;
			positions = new Vector3[n];
			rotations = new Quaternion[n];
			var globals = new Matrix4x4[n];
			
			// 缓存全局矩阵
			for (int i = 0; i < n; i++) {
				globals[i] = skeleton.BindPose[i];
			}
			
			for (int i = 0; i < n; i++) {
				int parent = SkelParser.GetEffectiveParentIndex(skeleton, i);
				Matrix4x4 local = globals[i];
				
				// 如果有父节点，乘以父节点的逆全局矩阵
				if (parent >= 0 && parent < n) {
					if (Matrix4x4.Invert(globals[parent], out var invParent)) {
						local = globals[i] * invParent;
					}
				}
				
				// 分解局部矩阵为平移、旋转、缩放
				if (!Matrix4x4.Decompose(local, out var scale, out var rotation, out var translation)) {
					// 分解失败时（例如矩阵退化），回退到骨骼原始存储的数据（如果可用）
					translation = skeleton.Bones[i].Position;
					rotation = skeleton.Bones[i].Rotation;
				}
				positions[i] = translation;
				rotations[i] = rotation;
			}
		}

		/// <summary>
		/// [启发式检测] 判断动画数据是否存储在全局空间。
		/// <para>
		/// 某些格式的动画数据存储的是绝对变换而非相对父节点的变换。
		/// 此方法通过对比第一帧动画与局部/全局绑定姿势的相似度，来推断数据的空间类型。
		/// </para>
		/// </summary>
		/// <returns>True 表示动画数据很可能是全局空间，False 表示局部空间</returns>
		static bool IsAnimGlobalPose(Skeleton skeleton, Dictionary<string, AnimTrack> animTracks) {
			GetLocalPoseFromGlobal(skeleton, out var localPositions, out var localRotations);
			int localBetter = 0;
			int globalBetter = 0;
			int checkedCount = 0;
			
			// 随机采样或遍历所有骨骼进行投票
			for (int i = 0; i < skeleton.Bones.Count; i++) {
				var b = skeleton.Bones[i];
				if (string.IsNullOrEmpty(b.Name)) continue;
				if (!animTracks.TryGetValue(b.Name, out var track)) continue;
				if (track.Frames.Count == 0) continue;
				int parent = SkelParser.GetEffectiveParentIndex(skeleton, i);
				if (parent < 0) continue; // 根节点通常局部=全局，无法区分
				
				var frame = track.Frames[0]; // 取第一帧作为样本
				
				// 假设 1：动画数据是局部空间的
				// 计算与计算出的局部 Bind Pose 的差异
				float dLocal = Vector3.Distance(frame.Position, localPositions[i]);
				float aLocal = MathUtil.QuaternionAngle(frame.Rotation, localRotations[i]);

				// 假设 2：动画数据是全局空间的
				// 计算与全局 Bind Pose 的差异
				Matrix4x4 globalM = skeleton.BindPose[i];
				if (!Matrix4x4.Decompose(globalM, out var s, out var globalRot, out var globalPos)) {
					globalPos = globalM.Translation;
					globalRot = Quaternion.CreateFromRotationMatrix(globalM);
				}

				float dGlobal = Vector3.Distance(frame.Position, globalPos);
				float aGlobal = MathUtil.QuaternionAngle(frame.Rotation, globalRot);

				// 简单的评分机制：差异越小越匹配
				float scoreLocal = dLocal + aLocal;
				float scoreGlobal = dGlobal + aGlobal;
				
				if (scoreLocal < scoreGlobal) localBetter++; else globalBetter++;
				checkedCount++;
			}
			
			if (checkedCount == 0) return false; // 默认局部
			return globalBetter > localBetter;
		}

		/// <summary>
		/// [索引映射] 将原始骨骼索引转换为导出后的新索引。
		/// </summary>
		static int MapBoneIndex(Skeleton skeleton, BoneMap boneMap, int boneIndex) {
			if (boneIndex >= 0 && boneIndex < boneMap.OldToNew.Length) {
				int mapped = boneMap.OldToNew[boneIndex];
				if (mapped >= 0) return mapped;
			}
			// [降级处理]
			// 如果当前骨骼被剔除（mapped == -1），尝试映射到其父骨骼
			// 这保证了蒙皮权重不会丢失，而是转移到最近的有效祖先上
			int parent = boneIndex >= 0 && boneIndex < skeleton.Bones.Count ? SkelParser.GetEffectiveParentIndex(skeleton, boneIndex) : -1;
			if (parent >= 0 && parent < boneMap.OldToNew.Length) {
				int mapped = boneMap.OldToNew[parent];
				if (mapped >= 0) return mapped;
			}
			return 0; // 最终回退到根节点
		}
	}
}
