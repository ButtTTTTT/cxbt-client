using System;
using System.IO;
using System.Numerics;

namespace FCM2 {
	static class MathUtil {
		internal static Matrix4x4 BuildLocalMatrix(Bone b) {
			var T = Matrix4x4.CreateTranslation(b.Position);
			var R = Matrix4x4.CreateFromQuaternion(b.Rotation);
			var S = Matrix4x4.CreateScale(b.Scale);
			return S * R * T;
		}

		internal static Matrix4x4 BuildLocalMatrix(Vector3 position, Quaternion rotation) {
			var T = Matrix4x4.CreateTranslation(position);
			var R = Matrix4x4.CreateFromQuaternion(rotation);
			return R * T;
		}

		internal static Matrix4x4 RootFixMatrix() {
			return new Matrix4x4(
				1, 0, 0, 0,
				0, 0, -1, 0,
				0, 1, 0, 0,
				0, 0, 0, 1
			);
		}

		internal static float QuaternionAngle(Quaternion a, Quaternion b) {
			float dot = MathF.Abs(Quaternion.Dot(a, b));
			if (dot > 1f) dot = 1f;
			return 2f * MathF.Acos(dot);
		}

		internal static Vector3 QuaternionToEuler(Quaternion q) {
			float sinr_cosp = 2f * (q.W * q.X + q.Y * q.Z);
			float cosr_cosp = 1f - 2f * (q.X * q.X + q.Y * q.Y);
			float roll = MathF.Atan2(sinr_cosp, cosr_cosp);
			float sinp = 2f * (q.W * q.Y - q.Z * q.X);
			float pitch;
			if (MathF.Abs(sinp) >= 1f) pitch = MathF.CopySign(MathF.PI / 2f, sinp);
			else pitch = MathF.Asin(sinp);
			float siny_cosp = 2f * (q.W * q.Z + q.X * q.Y);
			float cosy_cosp = 1f - 2f * (q.Y * q.Y + q.Z * q.Z);
			float yaw = MathF.Atan2(siny_cosp, cosy_cosp);
			// float deg = 180f / MathF.PI;
			// return new Vector3(roll * deg, pitch * deg, yaw * deg);
			return new Vector3(roll, pitch, yaw);
		}
	}

	static class IOUtil {
		internal static bool CanRead(BinaryReader br, int bytes) {
			return br.BaseStream.Position + bytes <= br.BaseStream.Length;
		}

		internal static float ReadHalf(BinaryReader br) {
			ushort value = br.ReadUInt16();
			return (float)BitConverter.UInt16BitsToHalf(value);
		}

		internal static Vector2 ReadHalf2(BinaryReader br) {
			return new Vector2(ReadHalf(br), ReadHalf(br));
		}

		internal static Vector3 ReadHalf3(BinaryReader br) {
			return new Vector3(ReadHalf(br), ReadHalf(br), ReadHalf(br));
		}
	}
}
