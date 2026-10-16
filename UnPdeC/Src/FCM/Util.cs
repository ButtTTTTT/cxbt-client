using System;
using System.IO;
using System.Numerics;

namespace FCM {
	/// <summary>
	/// [基础模块] 数学计算工具库
	/// <para>
	/// 提供矩阵构建、坐标系转换、四元数与欧拉角转换等3D数学辅助方法。
	/// 封装了 System.Numerics 的底层操作，适配本项目的特定需求（如 Source Engine 坐标系）。
	/// </para>
	/// </summary>
	static class MathUtil {
		/// <summary>
		/// [矩阵构建] 构建骨骼的局部变换矩阵 (Local Transform Matrix)。
		/// <para>
		/// 3D数学原理：
		/// 标准的变换组合顺序是：缩放 (Scale) -> 旋转 (Rotation) -> 位移 (Translation)。
		/// 记作：M = T * R * S (列向量/左乘习惯) 或 S * R * T (行向量/右乘习惯)。
		/// System.Numerics 使用行主序 (Row-Major)，因此乘法顺序为 Scale * Rotation * Translation。
		/// 这样保证了缩放沿局部轴进行，旋转基于缩放后的对象，最后将结果移动到指定位置。
		/// </para>
		/// </summary>
		/// <param name="b">骨骼对象，包含 Pos/Rot/Scale 数据</param>
		/// <returns>合成后的局部变换矩阵</returns>
		internal static Matrix4x4 BuildLocalMatrix(Bone b) {
			var T = Matrix4x4.CreateTranslation(b.Position);
			var R = Matrix4x4.CreateFromQuaternion(b.Rotation);
			var S = Matrix4x4.CreateScale(b.Scale);
			// [矩阵乘法顺序]
			// Row-Major: v_new = v_old * S * R * T
			return S * R * T;
		}

		/// <summary>
		/// [矩阵构建] 根据位置和旋转构建局部变换矩阵（默认缩放为 1）。
		/// </summary>
		/// <param name="position">位移向量</param>
		/// <param name="rotation">旋转四元数</param>
		/// <returns>局部变换矩阵</returns>
		internal static Matrix4x4 BuildLocalMatrix(Vector3 position, Quaternion rotation) {
			var T = Matrix4x4.CreateTranslation(position);
			var R = Matrix4x4.CreateFromQuaternion(rotation);
			return R * T;
		}

		/// <summary>
		/// [坐标系转换] 构建根修正矩阵 (Root Fix Matrix)。
		/// <para>
		/// 行业背景：
		/// 不同的游戏引擎和建模软件使用不同的坐标系标准。
		/// 例如：Unity/Maya 通常是 Y-Up (Y轴向上)，而 Source Engine/Unreal/3ds Max 通常是 Z-Up (Z轴向上)。
		/// 此矩阵用于将 Y-Up 坐标系的数据旋转为 Z-Up 坐标系（绕 X 轴旋转）。
		/// </para>
		/// </summary>
		/// <returns>坐标系转换矩阵</returns>
		internal static Matrix4x4 RootFixMatrix() {
			// 变换逻辑：
			// X -> X
			// Y -> Z
			// Z -> -Y
			// 这相当于绕 X 轴旋转 -90 度（或 +90 度，取决于手性）。
			return new Matrix4x4(
				1, 0, 0, 0,
				0, 0, -1, 0,
				0, 1, 0, 0,
				0, 0, 0, 1
			);
		}

		/// <summary>
		/// [四元数运算] 计算两个四元数之间的角位移（弧度）。
		/// <para>
		/// 3D数学原理：
		/// 两个单位四元数点积的绝对值对应半角的余弦值。
		/// Angle = 2 * acos(|dot(q1, q2)|).
		/// 取绝对值是因为 q 和 -q 表示相同的旋转姿态（双倍覆盖特性）。
		/// </para>
		/// </summary>
		/// <param name="a">四元数 A</param>
		/// <param name="b">四元数 B</param>
		/// <returns>角度（弧度）</returns>
		internal static float QuaternionAngle(Quaternion a, Quaternion b) {
			float dot = MathF.Abs(Quaternion.Dot(a, b));
			if (dot > 1f) dot = 1f; // 钳制以防数值误差导致 NaN
			return 2f * MathF.Acos(dot);
		}

		/// <summary>
		/// [旋转转换] 将四元数转换为欧拉角（弧度）。
		/// <para>
		/// 3D数学原理：
		/// 欧拉角存在万向节死锁（Gimbal Lock）问题，不适合插值，但许多旧格式（如 SMD）要求使用欧拉角存储。
		/// 转换过程涉及三角函数的反解，需要注意旋转顺序（Rotation Order）。
		/// 本实现采用 Z-X-Y 顺序或类似的航空惯例，适配 Source Engine 的需求。
		/// 返回值分量通常对应：Roll (X), Pitch (Y), Yaw (Z)。
		/// </para>
		/// </summary>
		/// <param name="q">输入的旋转四元数</param>
		/// <returns>欧拉角 Vector3(Roll, Pitch, Yaw)</returns>
		internal static Vector3 QuaternionToEuler(Quaternion q) {
			// Roll (x-axis rotation)
			float sinr_cosp = 2f * (q.W * q.X + q.Y * q.Z);
			float cosr_cosp = 1f - 2f * (q.X * q.X + q.Y * q.Y);
			float roll = MathF.Atan2(sinr_cosp, cosr_cosp);

			// Pitch (y-axis rotation)
			float sinp = 2f * (q.W * q.Y - q.Z * q.X);
			float pitch;
			if (MathF.Abs(sinp) >= 1f) pitch = MathF.CopySign(MathF.PI / 2f, sinp); // 避免超出范围
			else pitch = MathF.Asin(sinp);

			// Yaw (z-axis rotation)
			float siny_cosp = 2f * (q.W * q.Z + q.X * q.Y);
			float cosy_cosp = 1f - 2f * (q.Y * q.Y + q.Z * q.Z);
			float yaw = MathF.Atan2(siny_cosp, cosy_cosp);

			return new Vector3(roll, pitch, yaw);
		}
	}

	/// <summary>
	/// [基础模块] 二进制读取辅助工具
	/// <para>
	/// 提供对非标准数据类型（如半精度浮点数）的读取支持，以及流状态检查。
	/// </para>
	/// </summary>
	static class IOUtil {
		/// <summary>
		/// [流状态] 检查流中是否还有足够的字节可读。
		/// </summary>
		/// <param name="br">二进制读取器</param>
		/// <param name="bytes">需要读取的字节数</param>
		/// <returns>如果剩余字节足够返回 true，否则返回 false</returns>
		internal static bool CanRead(BinaryReader br, int bytes) {
			return br.BaseStream.Position + bytes <= br.BaseStream.Length;
		}

		/// <summary>
		/// [数据类型] 读取半精度浮点数 (Half Precision Float, FP16)。
		/// <para>
		/// 硬件背景：
		/// FP16 占用 16 位（1 bit 符号，5 bits 指数，10 bits 尾数）。
		/// 广泛应用于现代 GPU 顶点格式（法线、UV、颜色），以减少显存占用和带宽消耗。
		/// 相比 FP32，精度较低但通常对几何属性已足够。
		/// </para>
		/// </summary>
		/// <param name="br">BinaryReader</param>
		/// <returns>转换后的单精度浮点数 (float/FP32)</returns>
		internal static float ReadHalf(BinaryReader br) {
			ushort value = br.ReadUInt16();
			return (float)BitConverter.UInt16BitsToHalf(value);
		}

		/// <summary>
		/// 读取两个半精度浮点数，组成 Vector2 (如 UV)。
		/// </summary>
		internal static Vector2 ReadHalf2(BinaryReader br) {
			return new Vector2(ReadHalf(br), ReadHalf(br));
		}

		/// <summary>
		/// 读取三个半精度浮点数，组成 Vector3 (如法线、切线)。
		/// </summary>
		internal static Vector3 ReadHalf3(BinaryReader br) {
			return new Vector3(ReadHalf(br), ReadHalf(br), ReadHalf(br));
		}
	}
}
