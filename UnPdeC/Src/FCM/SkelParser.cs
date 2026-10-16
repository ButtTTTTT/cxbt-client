using System;
using System.Collections.Generic;
using System.IO;
using System.Numerics;

namespace FCM {
	/// <summary>
	/// [核心模块] 骨架文件解析器
	/// <para>
	/// 负责解析 .skel 二进制文件，重建骨骼层级结构（Hierarchy），提取骨骼名称及基础变换数据（Bind Pose）。
	/// 该类是骨骼动画系统的基础，为蒙皮网格（Skinned Mesh）提供必要的骨架数据支持。
	/// </para>
	/// </summary>
	static class SkelParser {
		/// <summary>
		/// [解析入口] 解析 .skel 文件并构建 Skeleton 对象。
		/// </summary>
		/// <param name="filePath">骨架文件的绝对路径</param>
		/// <returns>解析完成的 Skeleton 对象，包含完整的骨骼列表和层级关系</returns>
		internal static Skeleton ParseSkel(string filePath) {
			using var fs = File.OpenRead(filePath);
			using var br = new BinaryReader(fs);

			// [文件头解析]
			// 读取文件头信息，通常包含魔数（Magic Number）、版本号或未知标识符
			br.ReadUInt32(); // 未知头信息
			uint count = br.ReadUInt32(); // 骨骼数量（Bone Count）

			var skeleton = new Skeleton();
			uint v0 = br.ReadUInt32(); // 版本标识或魔数 0
			uint v1 = br.ReadUInt32(); // 版本标识或魔数 1

			// [版本兼容性处理]
			// 某些旧版本或特定格式的骨架文件可能包含一个虚拟根节点（Dummy Root）或计数方式存在差异
			// 通过检查特定标志位 (v0, v1) 来调整骨骼名称的读取数量
			int nameCount = (v0 == 0xFFFFFFFF && v1 == 0x00000000) ? (int)count - 1 : (int)count;
			skeleton.Bones = new List<Bone>(nameCount);

			// [层级与名称解析]
			// 骨架文件的结构通常先存储层级关系（父节点索引）和骨骼名称，随后存储变换数据
			// 这种布局有利于预先构建拓扑结构
			for (int i = 0; i < nameCount; i++) {
				int parent = br.ReadInt32();
				int nameLen = br.ReadInt32();
				string name = nameLen > 0 ? System.Text.Encoding.ASCII.GetString(br.ReadBytes(nameLen)) : string.Empty;

				skeleton.Bones.Add(new Bone {
					ParentIndex = parent >= 0 ? parent - 1 : -1, // 调整为从0开始的索引，-1表示根节点
					Name = name
				});
			}

			// [变换数据解析]
			// 读取骨骼的局部变换数据（Local Transform），通常包含位移（Translation）和旋转（Rotation）
			// 缩放（Scale）通常默认为 (1,1,1)，除非文件显式包含缩放数据
			uint transformsCount = br.ReadUInt32();
			if (v0 == 0xFFFFFFFF && v1 == 0x00000000 && transformsCount > 0) {
				// [数据对齐/填充处理]
				// 跳过可能的额外数据块或填充字节，确保读取指针主要对齐到变换数据开始位置
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
				b.Rotation = new Quaternion(qx, qy, qz, qw); // 四元数旋转
				b.Position = new Vector3(tx, ty, tz);       // 局部位移
				b.Scale = Vector3.One;                      // 默认单位缩放
			}

			// NormalizeSkeletonPose(skeleton); // 可选：标准化骨架姿势
			return skeleton;
		}

		/// <summary>
		/// [图形学核心] 构建骨架的全局绑定姿势矩阵（模型空间）及其逆绑定矩阵。
		/// 
		/// <para>
		/// 3D数学原理（正向运动学 FK）：
		/// 此函数执行正向运动学计算，将骨骼的局部变换（Local Transform）累积为模型空间下的全局变换（Global Transform）。
		/// 矩阵乘法顺序：Global_Child = Local_Child * Global_Parent
		/// 由于骨骼列表通常是按拓扑顺序存储的（父节点在前，子节点在后），我们可以通过单次遍历高效完成计算。
		/// </para>
		/// <para>
		/// 蒙皮关键数据：
		/// 同时计算逆绑定姿势矩阵（Inverse Bind Pose Matrix），这是蒙皮（Skinning）计算中将顶点从模型空间变换回骨骼局部空间的必要数据。
		/// 公式：v_local = M_inverse_bind * v_model
		/// </para>
		/// </summary>
		/// <param name="skeleton">目标骨架对象</param>
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
					// [矩阵乘法注意事项]
					// System.Numerics 使用行主序（Row-Major）矩阵。
					// 变换顺序：v_new = v_old * Local * Parent
					// 代码实现：local * skeleton.BindPose[parent]
					// 这表示先进行局部变换，再进行父级变换，从而转换到模型空间。
					skeleton.BindPose[i] = local * skeleton.BindPose[parent];
			}

			// [计算逆绑定矩阵]
			// 用于蒙皮计算：将模型空间的顶点变换回该骨骼的局部空间（T-Pose状态下）
			for (int i = 0; i < n; i++) {
				Matrix4x4.Invert(skeleton.BindPose[i], out skeleton.InverseBindPose[i]);
			}
		}

		/// <summary>
		/// [辅助工具] 获取有效的父骨骼索引，自动跳过DCC工具生成的虚拟辅助骨骼。
		/// 
		/// <para>
		/// 行业背景：
		/// 3D美术工具（如Maya/3ds Max/Blender）在导出时常会插入无名称的虚拟节点（Virtual Bones/Helpers）用于分组或约束。
		/// 这些节点并非实际的蒙皮骨骼。为了保持游戏引擎中骨架层级的纯净性，我们需要跳过这些节点，
		/// 将子骨骼直接连接到最近的一个有效父骨骼上（逻辑上的“塌陷”操作）。
		/// </para>
		/// </summary>
		/// <param name="skeleton">骨架对象</param>
		/// <param name="boneIndex">当前查询的骨骼索引</param>
		/// <returns>最近的有效父骨骼索引，若无则返回 -1</returns>
		internal static int GetEffectiveParentIndex(Skeleton skeleton, int boneIndex) {
			int parent = skeleton.Bones[boneIndex].ParentIndex;
			// 递归向上查找，直到找到一个有名称的骨骼或到达根节点
			while (parent >= 0 && parent < skeleton.Bones.Count && string.IsNullOrEmpty(skeleton.Bones[parent].Name)) {
				parent = skeleton.Bones[parent].ParentIndex;
			}
			return parent;
		}
	}
}
