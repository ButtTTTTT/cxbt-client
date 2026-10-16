using System;
using System.Collections.Generic;
using System.Numerics;

namespace FCM {
	/// <summary>
	/// [基础数据结构] 骨骼节点
	/// <para>
	/// 表示骨架层级中的单个节点。每个骨骼定义了一个局部坐标空间（Local Space）。
	/// 在骨骼层级中，子骨骼的变换是相对于父骨骼的。这种相对性支持了正向运动学（FK）和层级动画。
	/// </para>
	/// </summary>
	class Bone {
		/// <summary>
		/// 父骨骼索引。
		/// <para>
		/// -1 表示该骨骼是根骨骼（Root Bone）。
		/// C# 优化：使用整数索引而非对象引用，有利于内存紧凑布局和序列化，也方便在扁平列表（List）中快速查找。
		/// </para>
		/// </summary>
		public int ParentIndex;

		/// <summary>
		/// 骨骼名称。
		/// <para>
		/// 唯一标识符，通常用于将动画轨道（AnimTrack）绑定到具体的骨架节点上。
		/// </para>
		/// </summary>
		public string Name = string.Empty;

		/// <summary>
		/// [T-Pose数据] 局部位置（位移）。
		/// <para>
		/// 相对于父骨骼坐标系的位移量。属于绑定姿势（Bind Pose）的一部分。
		/// </para>
		/// </summary>
		public Vector3 Position;

		/// <summary>
		/// [T-Pose数据] 局部旋转。
		/// <para>
		/// 相对于父骨骼坐标系的旋转量，使用四元数（Quaternion）存储以避免万向节死锁（Gimbal Lock）。
		/// </para>
		/// </summary>
		public Quaternion Rotation;

		/// <summary>
		/// [T-Pose数据] 局部缩放。
		/// <para>
		/// 默认为 (1,1,1)。
		/// 注意：在骨骼层级中非均匀缩放（Non-uniform scale）可能会导致子节点产生剪切（Shearing）变形，某些引擎可能不支持。
		/// </para>
		/// </summary>
		public Vector3 Scale = Vector3.One;
	}

	/// <summary>
	/// [核心数据结构] 完整骨架
	/// <para>
	/// 包含所有骨骼节点的列表及其对应的全局绑定姿势矩阵。
	/// </para>
	/// </summary>
	class Skeleton {
		/// <summary>
		/// 骨骼列表（扁平化存储）。
		/// <para>
		/// 顺序至关重要：通常遵循拓扑排序（Topological Sort），即父节点总是出现在子节点之前。
		/// 这种顺序保证了在计算全局变换时，可以单次线性遍历完成，无需递归。
		/// </para>
		/// </summary>
		public List<Bone> Bones = new List<Bone>();

		/// <summary>
		/// 全局绑定姿势矩阵数组（模型空间）。
		/// <para>
		/// 描述了网格在未播放动画（T-Pose/A-Pose）时，每个骨骼相对于模型原点的绝对变换。
		/// </para>
		/// </summary>
		public Matrix4x4[] BindPose = Array.Empty<Matrix4x4>();

		/// <summary>
		/// [蒙皮核心] 逆全局绑定姿势矩阵数组。
		/// <para>
		/// 公式：M_inv = Inverse(M_bind_global)
		/// 作用：将模型空间下的顶点变换回该骨骼的局部空间。
		/// </para>
		/// <para>
		/// 蒙皮原理（Linear Blend Skinning, LBS）：
		/// v_final = Σ ( w_i * (M_anim_global_i * M_inv_bind_i) * v_bind_pos )
		/// 逆矩阵的作用是抵消顶点的初始绑定变换，使其能跟随骨骼的当前动画变换（M_anim_global_i）运动。
		/// </para>
		/// </summary>
		public Matrix4x4[] InverseBindPose = Array.Empty<Matrix4x4>();
	}

	/// <summary>
	/// [渲染数据] 网格顶点
	/// <para>
	/// 包含顶点的几何属性（位置、法线）、纹理属性（UV、切线空间）和蒙皮属性（骨骼索引、权重）。
	/// </para>
	/// </summary>
	class MeshVertex {
		/// <summary>
		/// 顶点位置。
		/// <para>
		/// 通常定义在模型空间（Model Space）中，即相对于网格原点的坐标。
		/// </para>
		/// </summary>
		public Vector3 Position;

		/// <summary>
		/// 顶点法线。
		/// <para>
		/// 用于光照计算（Shading）。定义了表面朝向。
		/// </para>
		/// </summary>
		public Vector3 Normal;

		/// <summary>
		/// 切线向量。
		/// <para>
		/// 用于法线贴图（Normal Mapping）。指向 UV 贴图的 U 轴正方向。
		/// </para>
		/// </summary>
		public Vector3 Tangent;

		/// <summary>
		/// 副切线向量（或称双切线）。
		/// <para>
		/// 用于法线贴图。指向 UV 贴图的 V 轴正方向。
		/// 通常与法线和切线正交，构成切线空间（Tangent Space）基底。
		/// </para>
		/// </summary>
		public Vector3 Bitangent;

		/// <summary>
		/// [蒙皮数据] 影响该顶点的骨骼索引。
		/// <para>
		/// 数组长度通常为 4，对应现代图形 API（DirectX/OpenGL/Vulkan）和游戏引擎的常见限制。
		/// 这里的索引是指向 MeshData.BoneNames 的局部索引，或者是全局 Skeleton 的索引（取决于具体实现）。
		/// </para>
		/// </summary>
		public byte[] BoneIndices = new byte[4];

		/// <summary>
		/// [蒙皮数据] 骨骼权重。
		/// <para>
		/// 对应 BoneIndices 中每个骨骼的影响程度。
		/// 归一化约束：所有分量之和必须等于 1.0 (Sum(Weights) == 1.0)。
		/// </para>
		/// </summary>
		public Vector4 Weights;

		/// <summary>
		/// 纹理坐标 (UV)。
		/// <para>
		/// 将 2D 纹理映射到 3D 表面。范围通常在 [0, 1]。
		/// </para>
		/// </summary>
		public Vector2 UV;

		/// <summary>
		/// 预留字段 / 未知数据。
		/// <para>
		/// 可能用于顶点颜色（Vertex Color）或其他自定义属性。
		/// </para>
		/// </summary>
		public uint Unknown;
	}

	/// <summary>
	/// [渲染对象] 子网格 (SubMesh)
	/// <para>
	/// 表示网格中的一个子集，通常对应一个独立的材质球（Material）。
	/// 在渲染管线中，这通常对应一次绘制调用（Draw Call）。
	/// </para>
	/// </summary>
	class MeshObject {
		/// <summary>
		/// 对象名称。
		/// </summary>
		public string Name = string.Empty;

		/// <summary>
		/// [包围盒] AABB 最小点。
		/// <para>
		/// 轴对齐包围盒（Axis-Aligned Bounding Box）的最小角点。
		/// 用于视锥体剔除（Frustum Culling）和快速碰撞检测。
		/// </para>
		/// </summary>
		public Vector3 Min;

		/// <summary>
		/// [包围盒] AABB 最大点。
		/// </summary>
		public Vector3 Max;

		/// <summary>
		/// 面数（三角形数量）。
		/// <para>
		/// Indices.Count / 3。
		/// </para>
		/// </summary>
		public uint FaceCount;

		/// <summary>
		/// 变换后的顶点数量（TransformCount）。
		/// <para>
		/// 在某些格式中可能指代原始数据中的顶点块大小或数量。
		/// </para>
		/// </summary>
		public uint TransformCount;

		/// <summary>
		/// 变换数据的字节大小。
		/// </summary>
		public uint TransformBytes;

		/// <summary>
		/// 顶点步长（Stride）。
		/// <para>
		/// 表示单个顶点数据占用的字节数。
		/// 决定了顶点缓冲（Vertex Buffer）的内存布局（Layout）。
		/// </para>
		/// </summary>
		public int VertexStride;

		/// <summary>
		/// 顶点列表。
		/// <para>
		/// 构成网格的几何点数据。
		/// </para>
		/// </summary>
		public List<MeshVertex> Vertices = new List<MeshVertex>();

		/// <summary>
		/// 索引列表（三角形拓扑）。
		/// <para>
		/// 定义了网格的拓扑结构。每三个索引构成一个三角形。
		/// 使用索引可以复用顶点数据，减少显存占用。
		/// </para>
		/// </summary>
		public List<int> Indices = new List<int>();
	}

	/// <summary>
	/// [根对象] 完整网格数据
	/// <para>
	/// 包含所有子网格对象及全局骨骼映射表。
	/// </para>
	/// </summary>
	class MeshData {
		/// <summary>
		/// 子网格对象列表。
		/// <para>
		/// 一个模型文件可能包含多个子网格，每个子网格可能使用不同的材质。
		/// </para>
		/// </summary>
		public List<MeshObject> Objects = new List<MeshObject>();

		/// <summary>
		/// [骨骼调色板] 网格引用的骨骼名称列表。
		/// <para>
		/// 这是一个局部到全局的映射表。
		/// MeshVertex.BoneIndices 存储的是这个列表的索引（局部索引），
		/// 而这个列表存储的是骨骼名称，用于去 Skeleton 中查找实际的变换矩阵。
		/// 这种间接引用机制允许网格只引用骨架的一个子集，优化数据大小并符合硬件限制。
		/// </para>
		/// </summary>
		public List<string> BoneNames = new List<string>();
	}

	/// <summary>
	/// [动画关键帧] 单帧数据
	/// <para>
	/// 定义了特定时间点骨骼相对于父节点的局部变换。
	/// </para>
	/// </summary>
	class AnimFrame {
		/// <summary>
		/// 位置偏移（局部空间）。
		/// <para>
		/// 动画采样时，通常使用线性插值（Linear Interpolation, Lerp）计算两个关键帧之间的位置。
		/// </para>
		/// </summary>
		public Vector3 Position;

		/// <summary>
		/// 旋转四元数（局部空间）。
		/// <para>
		/// 动画采样时，必须使用球面线性插值（Spherical Linear Interpolation, Slerp）以保证旋转的均匀性。
		/// </para>
		/// </summary>
		public Quaternion Rotation;
	}

	/// <summary>
	/// [动画轨道] 单个骨骼的动画曲线
	/// <para>
	/// 包含该骨骼在整个动画过程中的所有关键帧。
	/// </para>
	/// </summary>
	class AnimTrack {
		/// <summary>
		/// 受影响的骨骼名称。
		/// <para>
		/// 运行时通过名称将动画数据绑定到 Skeleton 的具体骨骼上。
		/// </para>
		/// </summary>
		public string BoneName = string.Empty;

		/// <summary>
		/// 关键帧总数。
		/// </summary>
		public uint FrameCount;

		/// <summary>
		/// 数据字数（用于解析校验）。
		/// </summary>
		public uint WordCount;

		/// <summary>
		/// 关键帧列表。
		/// <para>
		/// 采样原理：
		/// 假设动画帧率为 30fps，要获取时间 t 的姿势，需要找到 t 对应的两个相邻关键帧 frame_A 和 frame_B，
		/// 然后计算插值系数 alpha，进行混合：Result = Mix(frame_A, frame_B, alpha)。
		/// </para>
		/// </summary>
		public List<AnimFrame> Frames = new List<AnimFrame>();
	}

	/// <summary>
	/// [动画资源] 完整动画数据
	/// <para>
	/// 包含所有受影响骨骼的动画轨道。
	/// </para>
	/// </summary>
	class AnimData {
		/// <summary>
		/// 动画轨道列表。
		/// <para>
		/// 每个轨道对应骨架中的一根骨骼。未包含在列表中的骨骼将保持其绑定姿势（Bind Pose）或上一帧的状态。
		/// </para>
		/// </summary>
		public List<AnimTrack> Tracks = new List<AnimTrack>();
	}

	/// <summary>
	/// [工具类] 骨骼索引映射表
	/// <para>
	/// 用于在模型导出或优化过程中，处理骨骼剔除（Culling）导致的索引变化。
	/// 比如移除未被任何顶点引用的“废骨骼”后，需要重新映射顶点中的 BoneIndex。
	/// </para>
	/// </summary>
	class BoneMap {
		/// <summary>
		/// 保留的骨骼索引列表。
		/// <para>
		/// 映射关系：新索引 -> 旧索引。
		/// Kept[new_index] = old_index
		/// </para>
		/// </summary>
		public List<int> Kept = new List<int>();

		/// <summary>
		/// 旧索引到新索引的查找表。
		/// <para>
		/// 映射关系：旧索引 -> 新索引。
		/// OldToNew[old_index] = new_index
		/// 如果值为 -1，表示该骨骼已被剔除。
		/// 此数组提供 O(1) 的快速查找。
		/// </para>
		/// </summary>
		public int[] OldToNew = Array.Empty<int>();
	}
}
