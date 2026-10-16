/**
 * PdeBinaryLoader.ts
 * 完整移植自项目下新增的四大 PDE 引擎逆向工具链源码：
 * 1. pdestudio/src/importer/binary/ (crc32.py, cache_decoder.py, mesh.py, skeleton.py, animation.py)
 * 2. pdestudio/src/importer/scenes/ (lua_parser.py, scene_import_helpers.py)
 * 3. PDEModelTools/ (level/parser.py, character/parser.py, weapon/parser.py)
 * 4. UnPdeC/Tools/ & DevTools/UnCacheGui/ (FastXOR.cs, OffsetCalc.cs, UnCache.cs, VerifyCRC.cs)
 */

import * as THREE from 'three';

// ============================================================================
// 1. PDE 专用 CRC32 校验表与密钥派生 (Ported from pdestudio/src/importer/binary/crc32.py & UnPdeC/VerifyCRC.cs)
// ============================================================================
export const PDE_CRC32_TABLE = new Uint32Array([
  0x00000000, 0x04C11DB7, 0x09823B6E, 0x0D4326D9, 0x130476DC, 0x17C56B6B, 0x1A864DB2, 0x1E475005,
  0x2608EDB8, 0x22C9F00F, 0x2F8AD6D6, 0x2B4BCB61, 0x350C9B64, 0x31CD86D3, 0x3C8EA00A, 0x384FBDBD,
  0x4C11DB70, 0x48D0C6C7, 0x4593E01E, 0x4152FDA9, 0x5F15ADAC, 0x5BD4B01B, 0x569796C2, 0x52568B75,
  0x6A1936C8, 0x6ED82B7F, 0x639B0DA6, 0x675A1011, 0x791D4014, 0x7DDC5DA3, 0x709F7B7A, 0x745E66CD,
  0x9823B6E0, 0x9CE2AB57, 0x91A18D8E, 0x95609039, 0x8B27C03C, 0x8FE6DD8B, 0x82A5FB52, 0x8664E6E5,
  0xBE2B5B58, 0xBAEA46EF, 0xB7A96036, 0xB3687D81, 0xAD2F2D84, 0xA9EE3033, 0xA4AD16EA, 0xA06C0B5D,
  0xD4326D90, 0xD0F37027, 0xDDB056FE, 0xD9714B49, 0xC7361B4C, 0xC3F706FB, 0xCEB42022, 0xCA753D95,
  0xF23A8028, 0xF6FB9D9F, 0xFBB8BB46, 0xFF79A6F1, 0xE13EF6F4, 0xE5FFEB43, 0xE8BCCD9A, 0xEC7DD02D,
  0x34867077, 0x30476DC0, 0x3D044B19, 0x39C556AE, 0x278206AB, 0x23431B1C, 0x2E003DC5, 0x2AC12072,
  0x128E9DCF, 0x164F8078, 0x1B0CA6A1, 0x1FCDBB16, 0x018AEB13, 0x054BF6A4, 0x0808D07D, 0x0CC9CDCA,
  0x7897AB07, 0x7C56B6B0, 0x71159069, 0x75D48DDE, 0x6B93DDDB, 0x6F52C06C, 0x6211E6B5, 0x66D0FB02,
  0x5E9F46BF, 0x5A5E5B08, 0x571D7DD1, 0x53DC6066, 0x4D9B3063, 0x495A2DD4, 0x44190B0D, 0x40D816BA,
  0xACA5C697, 0xA864DB20, 0xA527FDF9, 0xA1E6E04E, 0xBFA1B04B, 0xBB60ADFC, 0xB6238B25, 0xB2E29692,
  0x8AAD2B2F, 0x8E6C3698, 0x832F1041, 0x87EE0DF6, 0x99A95DF3, 0x9D684044, 0x902B669D, 0x94EA7B2A,
  0xE0B41DE7, 0xE4750050, 0xE9362689, 0xEDF73B3E, 0xF3B06B3B, 0xF771768C, 0xFA325055, 0xFEF34DE2,
  0xC6BCF05F, 0xC27DEDE8, 0xCF3ECB31, 0xCBFFD686, 0xD5B88683, 0xD1799B34, 0xDC3ABDED, 0xD8FBA05A,
  0x690CE0EE, 0x6DCDFD59, 0x608EDB80, 0x644FC637, 0x7A089632, 0x7EC98B85, 0x738AAD5C, 0x774BB0EB,
  0x4F040D56, 0x4BC510E1, 0x46863638, 0x42472B8F, 0x5C007B8A, 0x58C1663D, 0x558240E4, 0x51435D53,
  0x251D3B9E, 0x21DC2629, 0x2C9F00F0, 0x285E1D47, 0x36194D42, 0x32D850F5, 0x3F9B762C, 0x3B5A6B9B,
  0x0315D626, 0x07D4CB91, 0x0A97ED48, 0x0E56F0FF, 0x1011A0FA, 0x14D0BD4D, 0x19939B94, 0x1D528623,
  0xF12F560E, 0xF5EE4BB9, 0xF8AD6D60, 0xFC6C70D7, 0xE22B20D2, 0xE6EA3D65, 0xEBA91BBC, 0xEF68060B,
  0xD727BBB6, 0xD3E6A601, 0xDEA580D8, 0xDA649D6F, 0xC423CD6A, 0xC0E2D0DD, 0xCDA1F604, 0xC960EBB3,
  0xBD3E8D7E, 0xB9FF90C9, 0xB4BCB610, 0xB07DABA7, 0xAE3AFBA2, 0xAAFBE615, 0xA7B8C0CC, 0xA379DD7B,
  0x9B3660C6, 0x9FF77D71, 0x92B45BA8, 0x9675461F, 0x8832161A, 0x8CF30BAD, 0x81B02D74, 0x857130C3,
  0x5D8A9099, 0x594B8D2E, 0x5408ABF7, 0x50C9B640, 0x4E8EE645, 0x4A4FFBF2, 0x470CDD2B, 0x43CDC09C,
  0x7B827D21, 0x7F436096, 0x7200464F, 0x76C15BF8, 0x68860BFD, 0x6C47164A, 0x61043093, 0x65C52D24,
  0x119B4BE9, 0x155A565E, 0x18197087, 0x1CD86D30, 0x029F3D35, 0x065E2082, 0x0B1D065B, 0x0FDC1BEC,
  0x3793A651, 0x3352BBE6, 0x3E119D3F, 0x3AD08088, 0x2497D08D, 0x2056CD3A, 0x2D15EBE3, 0x29D4F654,
  0xC5A92679, 0xC1683BCE, 0xCC2B1D17, 0xC8EA00A0, 0xD6AD50A5, 0xD26C4D12, 0xDF2F6BCB, 0xDBEE767C,
  0xE3A1CBC1, 0xE760D676, 0xEA23F0AF, 0xEEE2ED18, 0xF0A5BD1D, 0xF464A0AA, 0xF9278673, 0xFD669BC4,
  0x89B8FD09, 0x8D79E0BE, 0x803AC667, 0x84FBDBD0, 0x9ABC8BD5, 0x9E7D9662, 0x933EB0BB, 0x97FFAD0C,
  0xAFB010B1, 0xAB710D06, 0xA6322BDF, 0xA2F33668, 0xBCB4666D, 0xB8757BDA, 0xB5365D03, 0xB1F740B4,
]);

export function calculatePdeCrc(data: Uint8Array | string): number {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const length = bytes.length;
  let crc = (length ^ 0xFFFFFFFF) >>> 0;
  for (let i = 0; i < length; i++) {
    const idx = (bytes[i] ^ (crc >>> 24)) & 0xFF;
    crc = (PDE_CRC32_TABLE[idx] ^ ((crc << 8) >>> 0)) >>> 0;
  }
  return (~crc) >>> 0;
}

export const PDE_CRC_KEY = calculatePdeCrc('crc_key');

// ============================================================================
// 2. UnPdeC: OffsetCalc & FastXOR (Ported from UnPdeC/Tools/OffsetCalc.cs & FastXOR.cs)
// ============================================================================
export function calculateActualPdeOffset(rawBlockOffset: number): number {
  const raw = rawBlockOffset >>> 0;
  return (((raw >>> 10) + raw + 1) * 0x1000);
}

export function fastXorBlock(block: Uint8Array, xorKey: Uint8Array): Uint8Array {
  const out = new Uint8Array(block.length);
  const keyLen = xorKey.length || 1;
  for (let i = 0; i < block.length; i++) {
    out[i] = block[i] ^ xorKey[i % keyLen];
  }
  return out;
}

// ============================================================================
// 3. .cache 解密与 LZ 解压器 (Ported from pdestudio/src/importer/binary/cache_decoder.py & UnPdeC/UnCache.cs)
// ============================================================================
export interface PdeCacheDecodeResult {
  validHeader: boolean;
  packVer: number;
  headerCrc: number;
  computedCrc: number;
  crcMatched: boolean;
  decompressedSize: number;
  payload: Uint8Array;
}

function decompressPdeLzCore(src: Uint8Array, expectedSize: number): Uint8Array {
  const dst = new Uint8Array(expectedSize);
  let srcPos = 0;
  let dstPos = 0;
  const srcLen = src.length;

  let ctrl = 0;
  let ctrlBits = 0;

  while (srcPos < srcLen && dstPos < expectedSize) {
    if (ctrlBits === 0) {
      if (srcPos + 4 > srcLen) break;
      ctrl = (src[srcPos] | (src[srcPos + 1] << 8) | (src[srcPos + 2] << 16) | (src[srcPos + 3] << 24)) >>> 0;
      srcPos += 4;
      ctrlBits = 32;
    }

    if ((ctrl & 1) === 0) {
      // Literal byte
      dst[dstPos++] = src[srcPos++];
    } else {
      // Back-reference
      if (srcPos + 1 >= srcLen) break;
      const b0 = src[srcPos];
      const b1 = src[srcPos + 1];
      const word = b0 | (b1 << 8);
      let matchLen = word & 0x07;
      let offset = word >>> 3;
      srcPos += 2;

      if (matchLen === 0) {
        if (srcPos >= srcLen) break;
        matchLen = src[srcPos++] + 8;
      } else {
        matchLen += 2;
      }

      let refPos = dstPos - offset;
      for (let i = 0; i < matchLen && dstPos < expectedSize; i++) {
        dst[dstPos++] = refPos >= 0 ? dst[refPos++] : 0;
      }
    }

    ctrl >>>= 1;
    ctrlBits--;
  }

  return dst.subarray(0, dstPos);
}

export function decodePdeCacheBuffer(buffer: ArrayBuffer | Uint8Array): PdeCacheDecodeResult {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 13) {
    return {
      validHeader: false,
      packVer: 0,
      headerCrc: 0,
      computedCrc: 0,
      crcMatched: false,
      decompressedSize: bytes.length,
      payload: bytes,
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const packVer = view.getUint8(0);
  if (packVer !== 2) {
    return {
      validHeader: false,
      packVer,
      headerCrc: 0,
      computedCrc: 0,
      crcMatched: false,
      decompressedSize: bytes.length,
      payload: bytes,
    };
  }

  const headerCrc = view.getUint32(1, true);
  const sizeA = view.getUint32(5, true);
  const sizeB = view.getUint32(9, true);
  const body = bytes.subarray(13);

  let payload: Uint8Array;
  if (sizeA > sizeB) {
    payload = decompressPdeLzCore(body, sizeA);
  } else {
    payload = body.slice(0, sizeA);
  }

  const rawCrc = calculatePdeCrc(payload);
  const computedCrc = (rawCrc ^ PDE_CRC_KEY) >>> 0;

  return {
    validHeader: true,
    packVer,
    headerCrc,
    computedCrc,
    crcMatched: headerCrc === computedCrc,
    decompressedSize: payload.length,
    payload,
  };
}

// ============================================================================
// 4. Binary .mesh 解析器 (Ported from pdestudio/src/importer/binary/mesh.py & PDEModelTools)
// ============================================================================
export interface PdeMaterialData {
  name: string;
  shaderPath: string;
  uniforms: Record<string, number[]>;
  textures: Array<{ slot: string; path: string }>;
}

export interface PdeMeshData {
  version: number;
  meshType: 'kStatic' | 'kSkin';
  vertexCount: number;
  faceCount: number;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  uv2s?: Float32Array;
  boneIndices?: Uint16Array;
  boneWeights?: Float32Array;
  indices: Uint32Array;
  materials: PdeMaterialData[];
}

class BinaryCursor {
  private view: DataView;
  private bytes: Uint8Array;
  public offset = 0;

  constructor(buffer: ArrayBuffer | Uint8Array) {
    this.bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
  }

  get remaining(): number {
    return this.bytes.byteLength - this.offset;
  }

  u8(): number {
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }

  i32(): number {
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }

  u32(): number {
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  f32(): number {
    const v = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }

  str(): string {
    if (this.remaining < 4) return '';
    const len = this.u32();
    if (len <= 0 || len > this.remaining) return '';
    const slice = this.bytes.subarray(this.offset, this.offset + len);
    this.offset += len;
    // Strip trailing null bytes
    let end = slice.length;
    while (end > 0 && slice[end - 1] === 0) end--;
    return new TextDecoder('utf-8').decode(slice.subarray(0, end));
  }

  skip(n: number): void {
    this.offset = Math.min(this.bytes.byteLength, this.offset + n);
  }
}

export function parsePdeMeshBinary(rawBuffer: ArrayBuffer | Uint8Array): PdeMeshData {
  // Automatically unwrap .cache header if present
  const decoded = decodePdeCacheBuffer(rawBuffer);
  const cursor = new BinaryCursor(decoded.validHeader ? decoded.payload : rawBuffer);

  const version = cursor.u32();
  if (version !== 0x0100) {
    throw new Error(`Unsupported PDE .mesh version: 0x${version.toString(16)}`);
  }

  const typeFlag = cursor.u32(); // 1 = kStatic (52B/vert), 2 = kSkin (64B/vert)
  const meshType = typeFlag === 2 ? 'kSkin' : 'kStatic';
  const vertexCount = cursor.u32();

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const uv2s = meshType === 'kStatic' ? new Float32Array(vertexCount * 2) : undefined;
  const boneIndices = meshType === 'kSkin' ? new Uint16Array(vertexCount * 4) : undefined;
  const boneWeights = meshType === 'kSkin' ? new Float32Array(vertexCount * 4) : undefined;

  for (let i = 0; i < vertexCount; i++) {
    // Position (x, y, z)
    positions[i * 3 + 0] = cursor.f32();
    positions[i * 3 + 1] = cursor.f32();
    positions[i * 3 + 2] = cursor.f32();

    if (meshType === 'kSkin') {
      // Weights (3 floats, 4th derived) + 4 uint8 bone indices
      const w0 = cursor.f32();
      const w1 = cursor.f32();
      const w2 = cursor.f32();
      const w3 = Math.max(0, 1.0 - (w0 + w1 + w2));
      const b0 = cursor.u8();
      const b1 = cursor.u8();
      const b2 = cursor.u8();
      const b3 = cursor.u8();
      if (boneWeights && boneIndices) {
        boneWeights[i * 4 + 0] = w0;
        boneWeights[i * 4 + 1] = w1;
        boneWeights[i * 4 + 2] = w2;
        boneWeights[i * 4 + 3] = w3;
        boneIndices[i * 4 + 0] = b0;
        boneIndices[i * 4 + 1] = b1;
        boneIndices[i * 4 + 2] = b2;
        boneIndices[i * 4 + 3] = b3;
      }
    }

    // Normal (nx, ny, nz)
    normals[i * 3 + 0] = cursor.f32();
    normals[i * 3 + 1] = cursor.f32();
    normals[i * 3 + 2] = cursor.f32();

    // Tangent (4 floats = 16B)
    cursor.skip(16);

    // UV1 (u, 1-v)
    const u = cursor.f32();
    const v = cursor.f32();
    uvs[i * 2 + 0] = u;
    uvs[i * 2 + 1] = 1.0 - v;

    if (meshType === 'kStatic' && uv2s) {
      const u2 = cursor.f32();
      const v2 = cursor.f32();
      uv2s[i * 2 + 0] = u2;
      uv2s[i * 2 + 1] = 1.0 - v2;
    }
  }

  const indexCount = cursor.u32();
  const indices = new Uint32Array(indexCount);
  for (let i = 0; i < indexCount; i++) {
    indices[i] = cursor.u32();
  }

  const materials: PdeMaterialData[] = [];
  if (cursor.remaining >= 4) {
    const matCount = cursor.u32();
    for (let m = 0; m < matCount && cursor.remaining > 8; m++) {
      const name = cursor.str();
      const shaderPath = cursor.str();
      const uniformCount = cursor.remaining >= 4 ? cursor.u32() : 0;
      const uniforms: Record<string, number[]> = {};
      for (let u = 0; u < uniformCount && cursor.remaining >= 8; u++) {
        const uName = cursor.str();
        const byteSize = cursor.u32();
        const floatCount = Math.floor(byteSize / 4);
        const vals: number[] = [];
        for (let f = 0; f < floatCount && cursor.remaining >= 4; f++) {
          vals.push(cursor.f32());
        }
        uniforms[uName] = vals;
      }
      const texCount = cursor.remaining >= 4 ? cursor.u32() : 0;
      const textures: Array<{ slot: string; path: string }> = [];
      for (let t = 0; t < texCount && cursor.remaining >= 8; t++) {
        const slot = cursor.str();
        const path = cursor.str();
        textures.push({ slot, path });
      }
      materials.push({ name, shaderPath, uniforms, textures });
    }
  }

  return {
    version,
    meshType,
    vertexCount,
    faceCount: Math.floor(indexCount / 3),
    positions,
    normals,
    uvs,
    uv2s,
    boneIndices,
    boneWeights,
    indices,
    materials,
  };
}

export function buildThreeGeometryFromPdeMesh(mesh: PdeMeshData): any {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
  if (mesh.uv2s) {
    geom.setAttribute('uv2', new THREE.BufferAttribute(mesh.uv2s, 2));
  }
  if (mesh.boneIndices && mesh.boneWeights) {
    geom.setAttribute('skinIndex', new THREE.BufferAttribute(mesh.boneIndices, 4));
    geom.setAttribute('skinWeight', new THREE.BufferAttribute(mesh.boneWeights, 4));
  }
  geom.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geom.computeBoundingSphere();
  return geom;
}

// ============================================================================
// 5. Binary .skel 解析器 (Ported from pdestudio/src/importer/binary/skeleton.py)
// ============================================================================
export interface PdeJointData {
  index: number;
  parentId: number;
  name: string;
  translation: [number, number, number];
  rotation: [number, number, number, number]; // [x, y, z, w]
}

export interface PdeSkeletonData {
  version: number;
  jointCount: number;
  joints: PdeJointData[];
}

export function parsePdeSkeletonBinary(rawBuffer: ArrayBuffer | Uint8Array): PdeSkeletonData {
  const decoded = decodePdeCacheBuffer(rawBuffer);
  const cursor = new BinaryCursor(decoded.validHeader ? decoded.payload : rawBuffer);

  const version = cursor.u32();
  if (version !== 0x0600) {
    throw new Error(`Unsupported PDE .skel version: 0x${version.toString(16)}`);
  }

  const jointCount = cursor.u32();
  const parentIds: number[] = [];
  for (let i = 0; i < jointCount; i++) {
    parentIds.push(cursor.i32());
  }

  const names: string[] = [];
  for (let i = 0; i < jointCount; i++) {
    names.push(cursor.str());
  }

  const transformCount = cursor.u32();
  const joints: PdeJointData[] = [];
  for (let i = 0; i < Math.min(jointCount, transformCount); i++) {
    const tx = cursor.f32();
    const ty = cursor.f32();
    const tz = cursor.f32();
    const qx = cursor.f32();
    const qy = cursor.f32();
    const qz = cursor.f32();
    const qw = cursor.f32();
    joints.push({
      index: i,
      parentId: parentIds[i],
      name: names[i] || `Bone_${i}`,
      translation: [tx, ty, tz],
      rotation: [qx, qy, qz, qw],
    });
  }

  return { version, jointCount, joints };
}

// ============================================================================
// 6. Binary .anim 解析器 (Ported from pdestudio/src/importer/binary/animation.py)
//    注意：PDE 原生骨骼动画帧率为 96.0 FPS (Animation.cpp:1346)
// ============================================================================
export const PDE_NATIVE_ANIM_FPS = 96.0;

export interface PdeAnimationData {
  version: number;
  jointCount: number;
  frameCount: number;
  fps: number;
  duration: number;
  tracks: Array<{
    jointIndex: number;
    translations: Float32Array;
    rotations: Float32Array;
  }>;
}

export function parsePdeAnimationBinary(rawBuffer: ArrayBuffer | Uint8Array): PdeAnimationData {
  const decoded = decodePdeCacheBuffer(rawBuffer);
  const cursor = new BinaryCursor(decoded.validHeader ? decoded.payload : rawBuffer);

  const version = cursor.u32();
  if (version !== 0x0500) {
    throw new Error(`Unsupported PDE .anim version: 0x${version.toString(16)}`);
  }

  const jointCount = cursor.u32();
  const frameCount = cursor.u32();
  const duration = Math.max(0, (frameCount - 1) / PDE_NATIVE_ANIM_FPS);

  const tracks: PdeAnimationData['tracks'] = [];
  for (let j = 0; j < jointCount; j++) {
    const translations = new Float32Array(frameCount * 3);
    const rotations = new Float32Array(frameCount * 4);
    for (let f = 0; f < frameCount; f++) {
      translations[f * 3 + 0] = cursor.f32();
      translations[f * 3 + 1] = cursor.f32();
      translations[f * 3 + 2] = cursor.f32();
      rotations[f * 4 + 0] = cursor.f32();
      rotations[f * 4 + 1] = cursor.f32();
      rotations[f * 4 + 2] = cursor.f32();
      rotations[f * 4 + 3] = cursor.f32();
    }
    tracks.push({ jointIndex: j, translations, rotations });
  }

  return {
    version,
    jointCount,
    frameCount,
    fps: PDE_NATIVE_ANIM_FPS,
    duration,
    tracks,
  };
}

// ============================================================================
// 7. Lua 场景与配置脚本解析器 (Ported from pdestudio/src/importer/scenes/lua_parser.py & PDEModelTools)
// ============================================================================
export interface PdeParsedSceneScript {
  mapName?: string;
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  sunDirection?: [number, number, number];
  ambientLight?: [number, number, number, number];
  directionalLight?: [number, number, number, number];
  skyBox?: string;
  holdPointMesh?: {
    mesh: string;
    position: [number, number, number];
    rotation: [number, number, number];
  };
  gates: Array<{
    name: string;
    mesh: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  }>;
  activeObjects: Array<{
    type: string;
    mesh: string;
  }>;
  soundElements: Array<{
    sound: string;
    position: [number, number, number];
  }>;
}

function parseNums(raw: string): number[] {
  return raw
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !Number.isNaN(n));
}

export function parsePdeSceneLuaScript(luaText: string): PdeParsedSceneScript {
  const result: PdeParsedSceneScript = {
    gates: [],
    activeObjects: [],
    soundElements: [],
  };

  const mapNameMatch = luaText.match(/AddMapName\s*\(\s*["']([^"']+)["']\s*\)/);
  if (mapNameMatch) result.mapName = mapNameMatch[1];

  const skyMatch = luaText.match(/SetSkyBox\s*\(\s*["']([^"']+)["']\s*\)/);
  if (skyMatch) result.skyBox = skyMatch[1];

  const camPosMatch = luaText.match(/SetCameraPosition\s*\(([^)]+)\)/);
  if (camPosMatch) {
    const nums = parseNums(camPosMatch[1]);
    if (nums.length >= 3) result.cameraPosition = [nums[0], nums[1], nums[2]];
  }

  const camTargetMatch = luaText.match(/SetCameraTarget\s*\(([^)]+)\)/);
  if (camTargetMatch) {
    const nums = parseNums(camTargetMatch[1]);
    if (nums.length >= 3) result.cameraTarget = [nums[0], nums[1], nums[2]];
  }

  const sunMatch = luaText.match(/SetSunDirection\s*\(([^)]+)\)/);
  if (sunMatch) {
    const nums = parseNums(sunMatch[1]);
    if (nums.length >= 3) result.sunDirection = [nums[0], nums[1], nums[2]];
  }

  const ambMatch = luaText.match(/SetAmbientLight\s*\(([^)]+)\)/);
  if (ambMatch) {
    const nums = parseNums(ambMatch[1]);
    if (nums.length >= 4) result.ambientLight = [nums[0], nums[1], nums[2], nums[3]];
  }

  const dirMatch = luaText.match(/SetDirectionalLight\s*\(([^)]+)\)/);
  if (dirMatch) {
    const nums = parseNums(dirMatch[1]);
    if (nums.length >= 4) result.directionalLight = [nums[0], nums[1], nums[2], nums[3]];
  }

  const holdMatch = luaText.match(
    /SetHoldPointMesh\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/
  );
  if (holdMatch) {
    const pos = parseNums(holdMatch[2]);
    const rot = parseNums(holdMatch[3]);
    result.holdPointMesh = {
      mesh: holdMatch[1],
      position: pos.length >= 3 ? [pos[0], pos[1], pos[2]] : [0, 0, 0],
      rotation: rot.length >= 3 ? [rot[0], rot[1], rot[2]] : [0, 0, 0],
    };
  }

  const gateRegex =
    /AddGate\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*,\s*["']([^"']*)["']\s*,\s*([^)]+)\)/g;
  let gm: RegExpExecArray | null;
  while ((gm = gateRegex.exec(luaText)) !== null) {
    const nums = parseNums(gm[4]);
    result.gates.push({
      name: gm[1],
      mesh: gm[2],
      position: nums.length >= 3 ? [nums[0], nums[1], nums[2]] : [0, 0, 0],
      rotation: nums.length >= 6 ? [nums[3], nums[4], nums[5]] : [0, 0, 0],
      scale: nums.length >= 9 ? [nums[6], nums[7], nums[8]] : [1, 1, 1],
    });
  }

  const activeRegex = /AddActiveObject\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/g;
  let am: RegExpExecArray | null;
  while ((am = activeRegex.exec(luaText)) !== null) {
    result.activeObjects.push({ type: am[1], mesh: am[2] });
  }

  const soundRegex = /AddSoundElement\s*\(\s*["']([^"']+)["']\s*,\s*([^)]+)\)/g;
  let sm: RegExpExecArray | null;
  while ((sm = soundRegex.exec(luaText)) !== null) {
    const nums = parseNums(sm[2]);
    if (nums.length >= 3) {
      result.soundElements.push({
        sound: sm[1],
        position: [nums[0], nums[1], nums[2]],
      });
    }
  }

  return result;
}
