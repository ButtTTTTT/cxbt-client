using System;
using System.Collections.Generic;
using System.IO;
using System.Numerics;

namespace FCM {
	/// <summary>
	/// [核心模块] 网格文件解析器
	/// <para>
	/// 负责解析 .mesh 二进制文件，提取几何数据（顶点、索引）、材质分组（SubMeshes）及骨骼绑定信息。
	/// 该解析器包含复杂的启发式逻辑（Heuristic Scanning），以应对文件格式的多样性和潜在的版本差异。
	/// </para>
	/// </summary>
	static class MeshParser {
		/// <summary>
		/// [解析入口] 解析 .mesh 文件并构建 MeshData 对象。
		/// </summary>
		/// <param name="filePath">网格文件的绝对路径</param>
		/// <returns>解析完成的 MeshData 对象</returns>
		internal static MeshData ParseMesh(string filePath) {
			using var fs = File.OpenRead(filePath);
			using var br = new BinaryReader(fs);

			var mesh = new MeshData();
			if (!IOUtil.CanRead(br, 4)) return mesh;
			uint objectCount = 0;
			uint boneMinMaxCount = 0;
			var names = new List<string>();
			long start = br.BaseStream.Position;

			// [骨骼调色板解析尝试]
			// 优先尝试读取骨骼名称块（Bone Palette）。
			// 这一块定义了该网格引用的骨骼列表，用于将顶点的局部骨骼索引映射到全局骨架。
			bool usedBoneBlock = TryReadBoneNameBlock(br, mesh, out boneMinMaxCount);
			if (usedBoneBlock) {
				// [跳过未知数据块]
				// 如果成功读取了骨骼块，通常后面会跟随一些边界盒信息或预计算的矩阵数据。
				// 我们暂时跳过这些数据以定位到对象计数。
				for (int i = 0; i < boneMinMaxCount; i++) {
					if (!IOUtil.CanRead(br, 24)) return mesh;
					br.ReadSingle();
					br.ReadSingle();
					br.ReadSingle();
					br.ReadSingle();
					br.ReadSingle();
					br.ReadSingle();
				}
				if (!IOUtil.CanRead(br, 4)) return mesh;
				objectCount = br.ReadUInt32();
			} else {
				// [回退策略]
				// 如果没有检测到骨骼块，重置文件指针，尝试按旧版本格式读取对象名称列表。
				br.BaseStream.Position = start;
				objectCount = br.ReadUInt32();
				if (!TryReadNameList(br, (int)objectCount, out names)) {
					names = new List<string>((int)objectCount);
				}
			}

			// [对象数量验证]
			// 通过检查后续数据的一致性来验证读取到的 objectCount 是否合理。
			if (!usedBoneBlock) {
				long posAfterNames = br.BaseStream.Position;
				if (IOUtil.CanRead(br, 4)) {
					uint maybeCount = br.ReadUInt32();
					if (maybeCount != objectCount) {
						// 如果再次读取的计数不匹配，说明可能遇到了不同的格式变体，回退指针。
						br.BaseStream.Position = posAfterNames;
					}
				}
			}

			// [边界盒 (AABB) 解析]
			// 读取每个子网格对象的轴对齐边界盒。
			var minMaxList = new List<(Vector3 min, Vector3 max)>((int)objectCount);
			var headers = new List<MeshObjectHeader>();
			if (!usedBoneBlock) {
				for (int i = 0; i < objectCount; i++) {
					if (!IOUtil.CanRead(br, 24)) break;
					float minX = br.ReadSingle();
					float minY = br.ReadSingle();
					float minZ = br.ReadSingle();
					float maxX = br.ReadSingle();
					float maxY = br.ReadSingle();
					float maxZ = br.ReadSingle();
					minMaxList.Add((new Vector3(minX, minY, minZ), new Vector3(maxX, maxY, maxZ)));
				}
			} else {
				// 如果存在骨骼块，边界盒数据的布局可能不同，这里先填充零值占位。
				for (int i = 0; i < objectCount; i++) {
					minMaxList.Add((Vector3.Zero, Vector3.Zero));
				}
			}

			// [全文件扫描策略]
			// 如果使用了骨骼块格式，对象头的位置可能不固定。
			// 此时启用全文件扫描模式，搜索符合 MeshObjectHeader 特征的数据块。
			if (usedBoneBlock) {
				headers = FindObjectHeaders(br, 0, br.BaseStream.Length - 40);
				if (headers.Count > 0) {
					objectCount = (uint)headers.Count;
					// 根据扫描结果调整边界盒列表大小
					if (minMaxList.Count < objectCount) {
						minMaxList.Clear();
						for (int i = 0; i < objectCount; i++) minMaxList.Add((Vector3.Zero, Vector3.Zero));
					}
				}
			}

			// [子网格对象解析循环]
			// 逐个解析子网格对象。
			for (int i = 0; i < objectCount; i++) {
				if (i >= minMaxList.Count) break;
				var obj = new MeshObject {
					Name = i < names.Count ? names[i] : string.Empty,
					Min = minMaxList[i].min,
					Max = minMaxList[i].max
				};

				long headerStart = br.BaseStream.Position;
				uint faceCount = 0;
				uint transformCount = 0;
				uint transformBytes = 0;
				int stride = 0;
				int headerSize = 0x1D;

				bool headerOk = false;
				// [对象头定位]
				// 策略 A：使用之前全文件扫描缓存的头信息
				if (headers.Count > 0 && i < headers.Count) {
					var h = headers[i];
					faceCount = h.FaceCount;
					transformCount = h.TransformCount;
					transformBytes = h.TransformBytes;
					stride = h.Stride;
					headerSize = h.HeaderSize;
					br.BaseStream.Position = h.Offset + headerSize;
					headerOk = true;
				} else {
					// 策略 B：尝试按顺序解析头信息
					if (IOUtil.CanRead(br, 12)) {
						uint objCount2 = br.ReadUInt32();
						if (IOUtil.CanRead(br, 8)) {
							faceCount = br.ReadUInt32();
							transformCount = br.ReadUInt32();
							uint d4 = 0, d5 = 0, d6 = 0, d7 = 0, d8 = 0;
							if (IOUtil.CanRead(br, 16)) { d4 = br.ReadUInt32(); d5 = br.ReadUInt32(); } else goto scanHeader;
							if (IOUtil.CanRead(br, 8)) { d6 = br.ReadUInt32(); d7 = br.ReadUInt32(); } else goto scanHeader;
							long afterD7 = br.BaseStream.Position;
							
							// [步长推断]
							// 尝试通过数据总大小和顶点数量推断顶点步长 (Stride)
							if (transformCount > 0) {
								if (d7 % transformCount == 0) transformBytes = d7;
								else if (d6 % transformCount == 0) transformBytes = d6;
								else if (IOUtil.CanRead(br, 4)) {
									d8 = br.ReadUInt32();
									if (d8 % transformCount == 0) transformBytes = d8;
								}
							}
							stride = (transformCount > 0 && transformBytes > 0) ? (int)(transformBytes / transformCount) : 0;
							
							// [启发式校验]
							// 检查推断出的 stride 和 counts 是否在合理范围内
							headerOk = stride >= 0x34 && stride <= 0x80 && faceCount > 0 && faceCount < 500000 && transformCount > 0 && transformCount < 500000;
							br.BaseStream.Position = Math.Min(br.BaseStream.Length, afterD7);
							if (IOUtil.CanRead(br, 1)) br.ReadByte();
						}
					}
				}

			scanHeader:
				// [局部扫描恢复]
				// 如果顺序解析失败，尝试在当前位置附近小范围扫描，寻找可能的对象头
				if (!headerOk) {
					long scanStart = Math.Max(0, headerStart - 4096);
					long scanEnd = Math.Min(br.BaseStream.Length - 40, headerStart + 32768);
					if (ScanForObjectHeader(br, scanStart, scanEnd, out long foundOffset, out uint foundObj, out uint foundFace, out uint foundTrans, out uint foundTBytes, out int foundStride, out int foundHeaderSize)) {
						br.BaseStream.Position = foundOffset + foundHeaderSize;
						faceCount = foundFace;
						transformCount = foundTrans;
						transformBytes = foundTBytes;
						stride = foundStride;
						headerSize = foundHeaderSize;
						headerOk = true;
					} else {
						break; // 无法恢复，停止解析
					}
				}

				obj.FaceCount = faceCount;
				obj.TransformCount = transformCount;
				obj.TransformBytes = transformBytes;
				obj.VertexStride = stride;

				// [顶点数据读取]
				// 根据推断的 stride 读取顶点属性
				if (transformBytes > 0 && stride > 0) {
					long verticesBytes = (long)stride * transformCount;
					if (IOUtil.CanRead(br, (int)Math.Min(verticesBytes, int.MaxValue))) {
						if (stride >= 0x40) {
							for (int v = 0; v < transformCount; v++) {
								var vert = new MeshVertex();
								vert.Position = new Vector3(br.ReadSingle(), br.ReadSingle(), br.ReadSingle());
								vert.Normal = IOUtil.ReadHalf3(br); // 半精度浮点数法线
								IOUtil.ReadHalf(br); // W 分量或填充
								vert.Tangent = IOUtil.ReadHalf3(br); // 半精度浮点数切线
								IOUtil.ReadHalf(br);
								vert.Bitangent = IOUtil.ReadHalf3(br); // 半精度浮点数副切线
								IOUtil.ReadHalf(br);
								vert.BoneIndices = br.ReadBytes(4); // 4字节骨骼索引
								vert.Weights = new Vector4(br.ReadSingle(), br.ReadSingle(), br.ReadSingle(), br.ReadSingle()); // 浮点数权重
								vert.UV = IOUtil.ReadHalf2(br); // 半精度 UV
								vert.Unknown = IOUtil.CanRead(br, 4) ? br.ReadUInt32() : 0;
								int remaining = stride - 0x40;
								if (remaining > 0 && IOUtil.CanRead(br, remaining)) br.ReadBytes(remaining);
								obj.Vertices.Add(vert);
							}
						} else {
							// [异常处理]
							// 步长过小（< 64字节），可能包含压缩数据或未知格式，跳过该块
							int toSkip = (int)Math.Min(verticesBytes, int.MaxValue);
							if (toSkip > 0 && IOUtil.CanRead(br, toSkip)) br.ReadBytes(toSkip);
						}
					}
				}

				// [索引数据读取]
				// 读取三角形索引缓冲（Index Buffer）
				var indices = new List<int>();
				if (!IOUtil.CanRead(br, 4)) break;
				uint faceBytesMaybe = br.ReadUInt32();
				uint expectedFaceBytes = faceCount * 12; // 3 ints per face * 4 bytes per int
				int indexCount = (int)(faceCount * 3);

				if (faceBytesMaybe == expectedFaceBytes) {
					// 标准格式：先是字节大小，然后是索引数据
					for (int f = 0; f < indexCount; f++) {
						if (!IOUtil.CanRead(br, 4)) break;
						indices.Add(br.ReadInt32());
					}
				} else {
					// 变体格式：没有字节大小头，第一个值就是索引的一部分
					indices.Add((int)faceBytesMaybe);
					for (int f = 1; f < indexCount; f++) {
						if (!IOUtil.CanRead(br, 4)) break;
						indices.Add(br.ReadInt32());
					}
				}

				obj.Indices = indices;
				mesh.Objects.Add(obj);
			}

			return mesh;
		}

		/// <summary>
		/// [内部结构] 网格对象头信息缓存
		/// <para>
		/// 用于存储全文件扫描过程中发现的潜在对象头信息。
		/// </para>
		/// </summary>
		class MeshObjectHeader {
			public long Offset;          // 文件偏移量
			public uint FaceCount;       // 面数
			public uint TransformCount;  // 变换点数
			public uint TransformBytes;  // 变换数据总字节数
			public int Stride;           // 顶点步长
			public int HeaderSize;       // 头结构大小
		}

		/// <summary>
		/// [扫描工具] 在指定范围内搜索所有可能的对象头。
		/// <para>
		/// 当标准解析流程失败时（例如偏移量错位），此方法通过暴力扫描（Brute-force Scan）来定位数据块。
		/// </para>
		/// </summary>
		static List<MeshObjectHeader> FindObjectHeaders(BinaryReader br, long scanStart, long scanEnd) {
			var headers = new List<MeshObjectHeader>();
			long original = br.BaseStream.Position;
			long len = br.BaseStream.Length;
			for (long i = scanStart; i <= scanEnd; i++) {
				if (TryReadObjectHeaderAt(br, i, out var header)) {
					// [完整性验证]
					// 验证头信息描述的数据块是否超出文件范围
					long totalBytes = header.HeaderSize + header.TransformBytes + 4 + (long)header.FaceCount * 12;
					if (i + totalBytes <= len) {
						headers.Add(header);
						i = i + header.HeaderSize - 1; // 优化：跳过已确认的头区域，避免重复扫描
					}
				}
			}
			br.BaseStream.Position = original;
			return headers;
		}

		/// <summary>
		/// [扫描工具] 扫描单个对象头。
		/// <para>
		/// 找到第一个匹配的头即停止。
		/// </para>
		/// </summary>
		static bool ScanForObjectHeader(BinaryReader br, long scanStart, long scanEnd, out long foundOffset, out uint objCount, out uint faceCount, out uint transformCount, out uint transformBytes, out int stride, out int headerSize) {
			foundOffset = 0;
			objCount = 0;
			faceCount = 0;
			transformCount = 0;
			transformBytes = 0;
			stride = 0;
			headerSize = 0;
			long original = br.BaseStream.Position;
			for (long i = scanStart; i <= scanEnd; i++) {
				if (TryReadObjectHeaderAt(br, i, out var header)) {
					foundOffset = header.Offset;
					objCount = 1;
					faceCount = header.FaceCount;
					transformCount = header.TransformCount;
					transformBytes = header.TransformBytes;
					stride = header.Stride;
					headerSize = header.HeaderSize;
					br.BaseStream.Position = original;
					return true;
				}
			}
			br.BaseStream.Position = original;
			return false;
		}

		/// <summary>
		/// [核心逻辑] 尝试解析指定偏移处的对象头。
		/// <para>
		/// 这是一个模式匹配过程，检查数据特征是否符合 MeshObjectHeader 的结构。
		/// </para>
		/// </summary>
		static bool TryReadObjectHeaderAt(BinaryReader br, long offset, out MeshObjectHeader header) {
			header = new MeshObjectHeader();
			br.BaseStream.Position = offset;
			if (!IOUtil.CanRead(br, 12)) return false;
			uint obj = br.ReadUInt32();
			uint face = br.ReadUInt32();
			uint trans = br.ReadUInt32();
			
			// [启发式检查]
			// 过滤掉明显不合理的值
			if (obj == 0 || obj > 256) return false;
			if (face == 0 || face > 2000000) return false;
			if (trans == 0 || trans > 2000000) return false;
			
			if (!IOUtil.CanRead(br, 16)) return false;
			uint u0 = br.ReadUInt32();
			uint u1 = br.ReadUInt32();
			if (!IOUtil.CanRead(br, 8)) return false;
			uint u2 = br.ReadUInt32();
			uint u3 = br.ReadUInt32();
			
			uint tbytes = 0;
			int headerSize = 0;
			uint[] u = new uint[] { u0, u1, u2, u3 };
			
			// [步长验证]
			// 检查后续的 4 个 uint 中是否有一个能整除 transformCount
			// 如果能整除，该值很可能是 transformBytes（总字节数），从而推算出 stride
			for (int k = 0; k < 4; k++) {
				if (u[k] > 0 && (u[k] % trans) == 0) {
					tbytes = u[k];
					headerSize = 24 + 4; // 基础头大小修正
					break;
				}
			}
			
			// [偏移尝试]
			// 某些变体格式可能有额外的填充字节，尝试偏移 1 或 0 字节查找
			if (tbytes == 0) {
				br.BaseStream.Position = offset + 25;
				if (IOUtil.CanRead(br, 4)) {
					uint t2 = br.ReadUInt32();
					if (t2 > 0 && (t2 % trans) == 0) {
						tbytes = t2;
						headerSize = 25 + 4;
					}
				}
			}
			if (tbytes == 0) {
				br.BaseStream.Position = offset + 24;
				if (IOUtil.CanRead(br, 4)) {
					uint t3 = br.ReadUInt32();
					if (t3 > 0 && (t3 % trans) == 0) {
						tbytes = t3;
						headerSize = 24 + 4;
					}
				}
			}
			
			if (tbytes == 0) return false;
			int s = (int)(tbytes / trans);
			// [最终步长检查]
			// 验证 stride 是否在常见范围内 (52B 到 128B 是常见的 3D 顶点结构大小)
			if (s < 0x34 || s > 0x80) return false;
			
			header.Offset = offset;
			header.FaceCount = face;
			header.TransformCount = trans;
			header.TransformBytes = tbytes;
			header.Stride = s;
			header.HeaderSize = headerSize > 0 ? headerSize : 0x1D;
			return true;
		}

		/// <summary>
		/// [骨骼解析] 尝试读取骨骼名称块（Bone Palette）。
		/// <para>
		/// 骨骼块包含该网格使用的所有骨骼名称列表。
		/// 成功读取后，会更新 MeshData.BoneNames 并返回 true。
		/// </para>
		/// </summary>
		static bool TryReadBoneNameBlock(BinaryReader br, MeshData mesh, out uint boneMinMaxCount) {
			boneMinMaxCount = 0;
			long start = br.BaseStream.Position;
			if (!IOUtil.CanRead(br, 4)) return false;
			uint boneCount = br.ReadUInt32();
			
			// [合理性检查]
			// 骨骼数量通常不会很大，如果超过 512，很可能是读取到了错误的数据
			if (boneCount == 0 || boneCount > 512) {
				br.BaseStream.Position = start;
				return false;
			}
			List<string> boneNames;
			bool namesOk = TryReadNameList(br, (int)boneCount, out boneNames);
			if (!namesOk) {
				// [对齐修正尝试]
				// 尝试跳过几个字节（1-2个int），应对可能的字节对齐（Padding）问题
				for (int skip = 1; skip <= 2; skip++) {
					br.BaseStream.Position = start + skip * 4;
					if (!IOUtil.CanRead(br, 4)) break;
					uint altCount = br.ReadUInt32();
					if (altCount == 0 || altCount > 512) continue;
					if (TryReadNameList(br, (int)altCount, out boneNames)) {
						boneCount = altCount;
						namesOk = true;
						break;
					}
				}
			}
			if (!namesOk) {
				br.BaseStream.Position = start;
				return false;
			}
			if (!IOUtil.CanRead(br, 4)) {
				br.BaseStream.Position = start;
				return false;
			}
			uint marker = br.ReadUInt32();
			
			// [边界计数推断]
			// 某些格式在骨骼列表后会有一个计数器，指示后续数据块的大小
			if (marker == boneCount) {
				boneMinMaxCount = boneCount;
			} else if (marker >= 16 && marker <= 4096) {
				boneMinMaxCount = marker;
			} else {
				boneMinMaxCount = boneCount;
			}
			
			// 预检查后续数据是否足够，避免读取越界
			if (!IOUtil.CanRead(br, (int)(24 * boneMinMaxCount))) {
				br.BaseStream.Position = start;
				return false;
			}
			mesh.BoneNames = boneNames;
			return true;
		}

		/// <summary>
		/// [基础工具] 尝试读取字符串列表。
		/// <para>
		/// 格式：[Length (int32)][String Data (bytes)] ...
		/// </para>
		/// </summary>
		static bool TryReadNameList(BinaryReader br, int count, out List<string> names) {
			names = new List<string>(count);
			long start = br.BaseStream.Position;
			for (int i = 0; i < count; i++) {
				if (!IOUtil.CanRead(br, 4)) {
					br.BaseStream.Position = start;
					return false;
				}
				int nameLen = br.ReadInt32();
				// [字符串长度验证]
				// 长度必须合理（0-64字节），且剩余数据足够读取
				if (nameLen < 0 || nameLen > 64 || !IOUtil.CanRead(br, nameLen)) {
					br.BaseStream.Position = start;
					return false;
				}
				var bytes = nameLen > 0 ? br.ReadBytes(nameLen) : Array.Empty<byte>();
				// [字符内容验证]
				// 检查是否仅包含 ASCII 可打印字符，排除乱码
				if (nameLen > 0 && !IsLikelyNameBytes(bytes)) {
					br.BaseStream.Position = start;
					return false;
				}
				names.Add(nameLen > 0 ? System.Text.Encoding.ASCII.GetString(bytes) : string.Empty);
			}
			return true;
		}

		static bool IsLikelyNameBytes(byte[] bytes) {
			for (int i = 0; i < bytes.Length; i++) {
				byte b = bytes[i];
				if (b < 32 || b > 126) return false; // ASCII Printable
			}
			return true;
		}

		/// <summary>
		/// [骨骼映射] 将网格的局部骨骼索引映射到全局骨架的索引。
		/// <para>
		/// 网格顶点中存储的 BoneIndices 是局部索引（指向 MeshData.BoneNames）。
		/// 此方法将这些局部索引转换为 Skeleton 对象中的全局骨骼索引。
		/// </para>
		/// </summary>
		/// <param name="mesh">网格数据</param>
		/// <param name="skeletonNameMap">骨架名称到索引的映射表</param>
		/// <param name="meshBoneIndex">网格中的局部骨骼索引</param>
		/// <returns>全局骨骼索引</returns>
		internal static int MapMeshBoneIndexToSkeletonIndex(MeshData mesh, Dictionary<string, int> skeletonNameMap, int meshBoneIndex) {
			if (mesh.BoneNames.Count > meshBoneIndex && meshBoneIndex >= 0) {
				string name = mesh.BoneNames[meshBoneIndex];
				if (!string.IsNullOrEmpty(name) && skeletonNameMap.TryGetValue(name, out var idx)) {
					return idx;
				}
			}
			return meshBoneIndex;
		}

		/// <summary>
		/// [网格合并] 合并两个网格数据对象。
		/// <para>
		/// 将 source 网格的数据合并到 target 网格中。
		/// 核心工作是处理骨骼索引的重映射（Remapping），确保合并后的顶点引用正确的骨骼。
		/// 这通常用于批处理（Batching）或将分离的模型部件组合成一个整体。
		/// </para>
		/// </summary>
		internal static void MergeMesh(MeshData target, MeshData source) {
			if (target == null || source == null) return;

			// 1. 合并骨骼名称列表 (Bone Palette Merge)
			// 构建 source 到 target 的骨骼索引映射表
			var sourceToTargetBoneMap = new int[source.BoneNames.Count];
			for (int i = 0; i < source.BoneNames.Count; i++) {
				string name = source.BoneNames[i];
				int targetIndex = target.BoneNames.IndexOf(name);
				if (targetIndex < 0) {
					// 如果 target 中不存在该骨骼，则添加
					targetIndex = target.BoneNames.Count;
					target.BoneNames.Add(name);
				}
				sourceToTargetBoneMap[i] = targetIndex;
			}

			// 2. 迁移对象及数据重映射 (Migrate and Remap)
			foreach (var obj in source.Objects) {
				// 修正顶点的骨骼索引
				// 将 source 的局部索引转换为 target 的局部索引
				foreach (var v in obj.Vertices) {
					var newIndices = new byte[4];
					for (int k = 0; k < 4; k++) {
						int oldIdx = v.BoneIndices[k];
						if (oldIdx < sourceToTargetBoneMap.Length) {
							newIndices[k] = (byte)sourceToTargetBoneMap[oldIdx];
						} else {
							newIndices[k] = (byte)oldIdx; // 容错处理：保留原值（尽管可能无效）
						}
					}
					v.BoneIndices = newIndices;
				}
				target.Objects.Add(obj);
			}
		}
	}
}
