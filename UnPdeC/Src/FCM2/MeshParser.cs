using System;
using System.Collections.Generic;
using System.IO;
using System.Numerics;

namespace FCM2 {
	static class MeshParser {
		internal static MeshData ParseMesh(string filePath) {
			using var fs = File.OpenRead(filePath);
			using var br = new BinaryReader(fs);

			var mesh = new MeshData();
			if (!IOUtil.CanRead(br, 4)) return mesh;
			uint objectCount = 0;
			uint boneMinMaxCount = 0;
			var names = new List<string>();
			long start = br.BaseStream.Position;
			bool usedBoneBlock = TryReadBoneNameBlock(br, mesh, out boneMinMaxCount);
			if (usedBoneBlock) {
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
				br.BaseStream.Position = start;
				objectCount = br.ReadUInt32();
				if (!TryReadNameList(br, (int)objectCount, out names)) {
					names = new List<string>((int)objectCount);
				}
			}

			if (!usedBoneBlock) {
				long posAfterNames = br.BaseStream.Position;
				if (IOUtil.CanRead(br, 4)) {
					uint maybeCount = br.ReadUInt32();
					if (maybeCount != objectCount) {
						br.BaseStream.Position = posAfterNames;
					}
				}
			}

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
				for (int i = 0; i < objectCount; i++) {
					minMaxList.Add((Vector3.Zero, Vector3.Zero));
				}
			}

			if (usedBoneBlock) {
				headers = FindObjectHeaders(br, 0, br.BaseStream.Length - 40);
				if (headers.Count > 0) {
					objectCount = (uint)headers.Count;
					if (minMaxList.Count < objectCount) {
						minMaxList.Clear();
						for (int i = 0; i < objectCount; i++) minMaxList.Add((Vector3.Zero, Vector3.Zero));
					}
				}
			}

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
					if (IOUtil.CanRead(br, 12)) {
						uint objCount2 = br.ReadUInt32();
						if (IOUtil.CanRead(br, 8)) {
							faceCount = br.ReadUInt32();
							transformCount = br.ReadUInt32();
							uint d4 = 0, d5 = 0, d6 = 0, d7 = 0, d8 = 0;
							if (IOUtil.CanRead(br, 16)) { d4 = br.ReadUInt32(); d5 = br.ReadUInt32(); } else goto scanHeader;
							if (IOUtil.CanRead(br, 8)) { d6 = br.ReadUInt32(); d7 = br.ReadUInt32(); } else goto scanHeader;
							long afterD7 = br.BaseStream.Position;
							if (transformCount > 0) {
								if (d7 % transformCount == 0) transformBytes = d7;
								else if (d6 % transformCount == 0) transformBytes = d6;
								else if (IOUtil.CanRead(br, 4)) {
									d8 = br.ReadUInt32();
									if (d8 % transformCount == 0) transformBytes = d8;
								}
							}
							stride = (transformCount > 0 && transformBytes > 0) ? (int)(transformBytes / transformCount) : 0;
							headerOk = stride >= 0x34 && stride <= 0x80 && faceCount > 0 && faceCount < 500000 && transformCount > 0 && transformCount < 500000;
							br.BaseStream.Position = Math.Min(br.BaseStream.Length, afterD7);
							if (IOUtil.CanRead(br, 1)) br.ReadByte();
						}
					}
				}

			scanHeader:
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
						break;
					}
				}

				obj.FaceCount = faceCount;
				obj.TransformCount = transformCount;
				obj.TransformBytes = transformBytes;
				obj.VertexStride = stride;

				if (transformBytes > 0 && stride > 0) {
					long verticesBytes = (long)stride * transformCount;
					if (IOUtil.CanRead(br, (int)Math.Min(verticesBytes, int.MaxValue))) {
						if (stride >= 0x40) {
							for (int v = 0; v < transformCount; v++) {
								var vert = new MeshVertex();
								vert.Position = new Vector3(br.ReadSingle(), br.ReadSingle(), br.ReadSingle());
								vert.Normal = IOUtil.ReadHalf3(br);
								IOUtil.ReadHalf(br);
								vert.Tangent = IOUtil.ReadHalf3(br);
								IOUtil.ReadHalf(br);
								vert.Bitangent = IOUtil.ReadHalf3(br);
								IOUtil.ReadHalf(br);
								vert.BoneIndices = br.ReadBytes(4);
								vert.Weights = new Vector4(br.ReadSingle(), br.ReadSingle(), br.ReadSingle(), br.ReadSingle());
								vert.UV = IOUtil.ReadHalf2(br);
								vert.Unknown = IOUtil.CanRead(br, 4) ? br.ReadUInt32() : 0;
								int remaining = stride - 0x40;
								if (remaining > 0 && IOUtil.CanRead(br, remaining)) br.ReadBytes(remaining);
								obj.Vertices.Add(vert);
							}
						} else {
							int toSkip = (int)Math.Min(verticesBytes, int.MaxValue);
							if (toSkip > 0 && IOUtil.CanRead(br, toSkip)) br.ReadBytes(toSkip);
						}
					}
				}

				var indices = new List<int>();
				if (!IOUtil.CanRead(br, 4)) break;
				uint faceBytesMaybe = br.ReadUInt32();
				uint expectedFaceBytes = faceCount * 12;
				int indexCount = (int)(faceCount * 3);

				if (faceBytesMaybe == expectedFaceBytes) {
					for (int f = 0; f < indexCount; f++) {
						if (!IOUtil.CanRead(br, 4)) break;
						indices.Add(br.ReadInt32());
					}
				} else {
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

		class MeshObjectHeader {
			public long Offset;
			public uint FaceCount;
			public uint TransformCount;
			public uint TransformBytes;
			public int Stride;
			public int HeaderSize;
		}

		static List<MeshObjectHeader> FindObjectHeaders(BinaryReader br, long scanStart, long scanEnd) {
			var headers = new List<MeshObjectHeader>();
			long original = br.BaseStream.Position;
			long len = br.BaseStream.Length;
			for (long i = scanStart; i <= scanEnd; i++) {
				if (TryReadObjectHeaderAt(br, i, out var header)) {
					long totalBytes = header.HeaderSize + header.TransformBytes + 4 + (long)header.FaceCount * 12;
					if (i + totalBytes <= len) {
						headers.Add(header);
						i = i + header.HeaderSize - 1;
					}
				}
			}
			br.BaseStream.Position = original;
			return headers;
		}

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

		static bool TryReadObjectHeaderAt(BinaryReader br, long offset, out MeshObjectHeader header) {
			header = new MeshObjectHeader();
			br.BaseStream.Position = offset;
			if (!IOUtil.CanRead(br, 12)) return false;
			uint obj = br.ReadUInt32();
			uint face = br.ReadUInt32();
			uint trans = br.ReadUInt32();
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
			for (int k = 0; k < 4; k++) {
				if (u[k] > 0 && (u[k] % trans) == 0) {
					tbytes = u[k];
					headerSize = 24 + 4;
					break;
				}
			}
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
			if (s < 0x34 || s > 0x80) return false;
			header.Offset = offset;
			header.FaceCount = face;
			header.TransformCount = trans;
			header.TransformBytes = tbytes;
			header.Stride = s;
			header.HeaderSize = headerSize > 0 ? headerSize : 0x1D;
			return true;
		}

		static bool TryReadBoneNameBlock(BinaryReader br, MeshData mesh, out uint boneMinMaxCount) {
			boneMinMaxCount = 0;
			long start = br.BaseStream.Position;
			if (!IOUtil.CanRead(br, 4)) return false;
			uint boneCount = br.ReadUInt32();
			if (boneCount == 0 || boneCount > 512) {
				br.BaseStream.Position = start;
				return false;
			}
			List<string> boneNames;
			bool namesOk = TryReadNameList(br, (int)boneCount, out boneNames);
			if (!namesOk) {
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
			if (marker == boneCount) {
				boneMinMaxCount = boneCount;
			} else if (marker >= 16 && marker <= 4096) {
				boneMinMaxCount = marker;
			} else {
				boneMinMaxCount = boneCount;
			}
			if (!IOUtil.CanRead(br, (int)(24 * boneMinMaxCount))) {
				br.BaseStream.Position = start;
				return false;
			}
			mesh.BoneNames = boneNames;
			return true;
		}

		static bool TryReadNameList(BinaryReader br, int count, out List<string> names) {
			names = new List<string>(count);
			long start = br.BaseStream.Position;
			for (int i = 0; i < count; i++) {
				if (!IOUtil.CanRead(br, 4)) {
					br.BaseStream.Position = start;
					return false;
				}
				int nameLen = br.ReadInt32();
				if (nameLen < 0 || nameLen > 64 || !IOUtil.CanRead(br, nameLen)) {
					br.BaseStream.Position = start;
					return false;
				}
				var bytes = nameLen > 0 ? br.ReadBytes(nameLen) : Array.Empty<byte>();
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
				if (b < 32 || b > 126) return false;
			}
			return true;
		}

		internal static int MapMeshBoneIndexToSkeletonIndex(MeshData mesh, Dictionary<string, int> skeletonNameMap, int meshBoneIndex) {
			if (mesh.BoneNames.Count > meshBoneIndex && meshBoneIndex >= 0) {
				string name = mesh.BoneNames[meshBoneIndex];
				if (!string.IsNullOrEmpty(name) && skeletonNameMap.TryGetValue(name, out var idx)) {
					return idx;
				}
			}
			return meshBoneIndex;
		}

		internal static void MergeMesh(MeshData target, MeshData source) {
			if (target == null || source == null) return;

			// 检查骨骼列表是否兼容（简单起见，假设所有mesh都使用相同的骨架配置）
			// 如果 source 的 boneNames 和 target 不一致，可能需要重新映射 boneIndices
			// 这里我们假设它们是共享同一套骨架配置的，或者直接追加

			// 实际上，不同 mesh 文件可能包含不同的 BoneNames 列表（局部列表）
			// 因此我们需要重新映射 source 的 bone indices 到 target 的列表中
			// 或者，我们建立一个统一的全局 bone names 列表

			// 策略：将 source 的 Objects 添加到 target
			// 对于 source 的每个 Object，需要修正其 Vertex 的 BoneIndices
			// 使其指向 target.BoneNames 中对应的名称

			// 1. 合并 BoneNames
			var sourceToTargetBoneMap = new int[source.BoneNames.Count];
			for (int i = 0; i < source.BoneNames.Count; i++) {
				string name = source.BoneNames[i];
				int targetIndex = target.BoneNames.IndexOf(name);
				if (targetIndex < 0) {
					targetIndex = target.BoneNames.Count;
					target.BoneNames.Add(name);
				}
				sourceToTargetBoneMap[i] = targetIndex;
			}

			// 2. 迁移 Objects
			foreach (var obj in source.Objects) {
				// 深度复制 object 以防修改原始数据（虽然这里 source 之后可能就不用了）
				// 修正 BoneIndices
				foreach (var v in obj.Vertices) {
					var newIndices = new byte[4];
					for (int k = 0; k < 4; k++) {
						int oldIdx = v.BoneIndices[k];
						if (oldIdx < sourceToTargetBoneMap.Length) {
							newIndices[k] = (byte)sourceToTargetBoneMap[oldIdx];
						} else {
							newIndices[k] = (byte)oldIdx; // 应该不会发生，除非数据损坏
						}
					}
					v.BoneIndices = newIndices;
				}
				target.Objects.Add(obj);
			}
		}
	}
}
