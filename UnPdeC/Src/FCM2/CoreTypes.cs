using System;
using System.Collections.Generic;
using System.Numerics;

namespace FCM2 {
	class Bone {
		public int ParentIndex;
		public string Name = string.Empty;
		public Vector3 Position;
		public Quaternion Rotation;
		public Vector3 Scale = Vector3.One;
	}

	class Skeleton {
		public List<Bone> Bones = [];
		public Matrix4x4[] BindPose = [];
		public Matrix4x4[] InverseBindPose = [];
	}

	class MeshVertex {
		public Vector3 Position;
		public Vector3 Normal;
		public Vector3 Tangent;
		public Vector3 Bitangent;
		public byte[] BoneIndices = new byte[4];
		public Vector4 Weights;
		public Vector2 UV;
		public uint Unknown;
	}

	class MeshObject {
		public string Name = string.Empty;
		public Vector3 Min;
		public Vector3 Max;
		public uint FaceCount;
		public uint TransformCount;
		public uint TransformBytes;
		public int VertexStride;
		public List<MeshVertex> Vertices = new List<MeshVertex>();
		public List<int> Indices = new List<int>();
	}

	class MeshData {
		public List<MeshObject> Objects = new List<MeshObject>();
		public List<string> BoneNames = new List<string>();
	}

	class AnimFrame {
		public Vector3 Position;
		public Quaternion Rotation;
	}

	class AnimTrack {
		public string BoneName = string.Empty;
		public uint FrameCount;
		public uint WordCount;
		public List<AnimFrame> Frames = new List<AnimFrame>();
	}

	class AnimData {
		public List<AnimTrack> Tracks = new List<AnimTrack>();
	}

	class BoneMap {
		public List<int> Kept = new List<int>();
		public int[] OldToNew = Array.Empty<int>();
	}
}
