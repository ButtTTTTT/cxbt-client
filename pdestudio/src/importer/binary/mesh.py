#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio - Binary Mesh Parser

Parse MeshResource::LoadData() binary stream.

Format (from MeshResource.cpp:296-392):
    uint32 type (1=kStatic, 2=kSkin)
    if kSkin: bonenames + bone_aabbs
    if kStatic: local_aabb (24B)
    uint32 primitive_count
    for each primitive:
        primitive_count, vertex_count, layer, cull_mode, blend_mode, visible
        vertex_buffer (StreamStatic 52B or StreamSkin 64B)
        index_buffer (U32 indices)
        byte has_material; if true: Material::Load(stream)
        uint32 collision_mode
    int32 physical_material_count; uint32 values

StreamStatic (52B): Vector3(12) + half4 normal(8) + half4 tangent(8) +
    half4 binormal(8) + half2 uv0(4) + half2 uv1(4) + half2 uv2(4) + ARGB color(4)
StreamSkin (64B): Vector3(12) + half4 normal(8) + half4 tangent(8) +
    half4 binormal(8) + BYTE blendindices[4](4) + Vector4 blendweight(16) +
    half2 uv0(4) + half2 uv1(4)
"""

import struct
from typing import List, Tuple, Optional
from dataclasses import dataclass, field

from ...log import get_module_logger

log = get_module_logger("MESH_BIN")


# =============================================================================
# Half-float decode
# =============================================================================

def _half_to_float(h: int) -> float:
    sign = (h >> 15) & 1
    exp = (h >> 10) & 0x1F
    mant = h & 0x3FF
    if exp == 0:
        if mant == 0:
            return (-1.0) ** sign * 0.0
        return (-1.0) ** sign * (2 ** -14) * (mant / 1024.0)
    elif exp == 31:
        return float('inf') if mant == 0 else float('nan')
    return (-1.0) ** sign * (2 ** (exp - 15)) * (1.0 + mant / 1024.0)


def _decode_half2(v: int) -> Tuple[float, float]:
    return (_half_to_float(v & 0xFFFF), _half_to_float((v >> 16) & 0xFFFF))


def _decode_half4(v: int) -> Tuple[float, float, float, float]:
    return (_half_to_float(v & 0xFFFF), _half_to_float((v >> 16) & 0xFFFF),
            _half_to_float((v >> 32) & 0xFFFF), _half_to_float((v >> 48) & 0xFFFF))


# =============================================================================
# Data classes
# =============================================================================

@dataclass
class PDEMaterial:
    vertex_shaders: List[str] = field(default_factory=list)
    pixel_shaders: List[str] = field(default_factory=list)
    vertex_uniform: List[List[dict]] = field(default_factory=list)
    pixel_uniform: List[List[dict]] = field(default_factory=list)
    texture_uniform: List[List[dict]] = field(default_factory=list)


@dataclass
class PDEVertexStatic:
    position: Tuple[float, float, float]
    normal: Tuple[float, float, float, float]
    tangent: Tuple[float, float, float, float]
    binormal: Tuple[float, float, float, float]
    uv0: Tuple[float, float]
    uv1: Tuple[float, float]
    uv2: Tuple[float, float]
    color: int


@dataclass
class PDEVertexSkin:
    position: Tuple[float, float, float]
    normal: Tuple[float, float, float, float]
    tangent: Tuple[float, float, float, float]
    binormal: Tuple[float, float, float, float]
    blend_indices: Tuple[int, int, int, int]
    blend_weight: Tuple[float, float, float, float]
    uv0: Tuple[float, float]
    uv1: Tuple[float, float]


@dataclass
class PDEPrimitive:
    primitive_count: int = 0
    vertex_count: int = 0
    layer: int = 0
    cull_mode: int = 0
    blend_mode: int = 0
    visible: bool = True
    vertices_static: List[PDEVertexStatic] = field(default_factory=list)
    vertices_skin: List[PDEVertexSkin] = field(default_factory=list)
    indices: List[int] = field(default_factory=list)
    material: Optional[PDEMaterial] = None
    collision_mode: int = 0


@dataclass
class PDEMesh:
    mesh_type: int = 0
    bone_names: List[str] = field(default_factory=list)
    local_aabb: Optional[Tuple[float, ...]] = None
    primitives: List[PDEPrimitive] = field(default_factory=list)
    physical_materials: List[int] = field(default_factory=list)


# =============================================================================
# Material binary parse
# =============================================================================

def _parse_material(data: bytes, pos: int) -> Tuple[PDEMaterial, int]:
    mat = PDEMaterial()

    vs_count, = struct.unpack_from('<I', data, pos); pos += 4
    for _ in range(vs_count):
        slen, = struct.unpack_from('<I', data, pos); pos += 4
        name = data[pos:pos + slen].decode('utf-8', errors='replace'); pos += slen
        mat.vertex_shaders.append(name)

    ps_count, = struct.unpack_from('<I', data, pos); pos += 4
    for _ in range(ps_count):
        slen, = struct.unpack_from('<I', data, pos); pos += 4
        name = data[pos:pos + slen].decode('utf-8', errors='replace'); pos += slen
        mat.pixel_shaders.append(name)

    # Vertex uniform (per LOD)
    vu_lod, = struct.unpack_from('<I', data, pos); pos += 4
    for _ in range(vu_lod):
        u_cnt, = struct.unpack_from('<I', data, pos); pos += 4
        lod_u = []
        for _ in range(u_cnt):
            nlen, = struct.unpack_from('<I', data, pos); pos += 4
            tn = data[pos:pos + nlen].decode('utf-8', errors='replace'); pos += nlen
            vc, = struct.unpack_from('<I', data, pos); pos += 4
            vals = list(struct.unpack_from(f'<{vc}f', data, pos)); pos += vc * 4
            lod_u.append({"type_name": tn, "values": vals})
        mat.vertex_uniform.append(lod_u)

    # Pixel uniform (per LOD)
    pu_lod, = struct.unpack_from('<I', data, pos); pos += 4
    for _ in range(pu_lod):
        u_cnt, = struct.unpack_from('<I', data, pos); pos += 4
        lod_u = []
        for _ in range(u_cnt):
            nlen, = struct.unpack_from('<I', data, pos); pos += 4
            tn = data[pos:pos + nlen].decode('utf-8', errors='replace'); pos += nlen
            vc, = struct.unpack_from('<I', data, pos); pos += 4
            vals = list(struct.unpack_from(f'<{vc}f', data, pos)); pos += vc * 4
            lod_u.append({"type_name": tn, "values": vals})
        mat.pixel_uniform.append(lod_u)

    # Texture uniform (per LOD)
    tu_lod, = struct.unpack_from('<I', data, pos); pos += 4
    for _ in range(tu_lod):
        tc, = struct.unpack_from('<I', data, pos); pos += 4
        lod_t = []
        for _ in range(tc):
            nlen, = struct.unpack_from('<I', data, pos); pos += 4
            tn = data[pos:pos + nlen].decode('utf-8', errors='replace'); pos += nlen
            plen, = struct.unpack_from('<I', data, pos); pos += 4
            tp = data[pos:pos + plen].decode('utf-8', errors='replace'); pos += plen
            lod_t.append({"type_name": tn, "path": tp})
        mat.texture_uniform.append(lod_t)

    return mat, pos


# =============================================================================
# Mesh binary parse
# =============================================================================

def parse_mesh_binary(data: bytes, offset: int = 0) -> PDEMesh:
    mesh = PDEMesh()
    pos = offset

    # 跳过 Resource::LoadData 读取的 type 字段（4字节）
    # MeshResource::LoadData 也先调用 Resource::LoadData(stream)
    res_type, = struct.unpack_from('<I', data, pos); pos += 4
    log.debug(f"Resource type: 0x{res_type:04x}")

    # MeshType
    mesh.mesh_type, = struct.unpack_from('<I', data, pos); pos += 4
    log.debug(f"MeshType: {mesh.mesh_type} ({'kStatic' if mesh.mesh_type==1 else 'kSkin' if mesh.mesh_type==2 else '?'})")

    if mesh.mesh_type == 2:  # kSkin
        bc, = struct.unpack_from('<I', data, pos); pos += 4
        for _ in range(bc):
            nlen, = struct.unpack_from('<I', data, pos); pos += 4
            name = data[pos:pos+nlen].decode('utf-8', errors='replace'); pos += nlen
            mesh.bone_names.append(name)
        log.debug(f"Bones: {bc}")
        log.info(f"BoneNames: {mesh.bone_names}")
        ac, = struct.unpack_from('<I', data, pos); pos += 4
        pos += ac * 24
    elif mesh.mesh_type == 1:  # kStatic
        aabb = struct.unpack_from('<6f', data, pos); pos += 24
        mesh.local_aabb = aabb

    pc, = struct.unpack_from('<I', data, pos); pos += 4
    log.debug(f"Primitives: {pc}")

    for i in range(pc):
        prim = PDEPrimitive()
        prim.primitive_count, = struct.unpack_from('<I', data, pos); pos += 4
        prim.vertex_count, = struct.unpack_from('<I', data, pos); pos += 4
        prim.layer, = struct.unpack_from('<I', data, pos); pos += 4
        prim.cull_mode, = struct.unpack_from('<I', data, pos); pos += 4
        prim.blend_mode, = struct.unpack_from('<I', data, pos); pos += 4
        prim.visible = bool(data[pos]); pos += 1
        log.debug(f"  Prim {i}: {prim.primitive_count} tris, {prim.vertex_count} verts")

        # Vertex buffer
        vb_size, = struct.unpack_from('<I', data, pos); pos += 4
        vb_data = data[pos:pos+vb_size]; pos += vb_size

        if mesh.mesh_type == 1:  # StreamStatic 52B
            for vi in range(prim.vertex_count):
                vo = vi * 52
                px, py, pz = struct.unpack_from('<3f', vb_data, vo); vo += 12
                nr, = struct.unpack_from('<Q', vb_data, vo); vo += 8
                tr, = struct.unpack_from('<Q', vb_data, vo); vo += 8
                br, = struct.unpack_from('<Q', vb_data, vo); vo += 8
                u0, = struct.unpack_from('<I', vb_data, vo); vo += 4
                u1, = struct.unpack_from('<I', vb_data, vo); vo += 4
                u2, = struct.unpack_from('<I', vb_data, vo); vo += 4
                col, = struct.unpack_from('<I', vb_data, vo); vo += 4
                prim.vertices_static.append(PDEVertexStatic(
                    position=(px,py,pz), normal=_decode_half4(nr),
                    tangent=_decode_half4(tr), binormal=_decode_half4(br),
                    uv0=_decode_half2(u0), uv1=_decode_half2(u1),
                    uv2=_decode_half2(u2), color=col))
        else:  # StreamSkin 64B
            for vi in range(prim.vertex_count):
                vo = vi * 64
                px, py, pz = struct.unpack_from('<3f', vb_data, vo); vo += 12
                nr, = struct.unpack_from('<Q', vb_data, vo); vo += 8
                tr, = struct.unpack_from('<Q', vb_data, vo); vo += 8
                br, = struct.unpack_from('<Q', vb_data, vo); vo += 8
                bi = tuple(vb_data[vo+j] for j in range(4)); vo += 4
                bw = struct.unpack_from('<4f', vb_data, vo); vo += 16
                u0, = struct.unpack_from('<I', vb_data, vo); vo += 4
                u1, = struct.unpack_from('<I', vb_data, vo); vo += 4
                prim.vertices_skin.append(PDEVertexSkin(
                    position=(px,py,pz), normal=_decode_half4(nr),
                    tangent=_decode_half4(tr), binormal=_decode_half4(br),
                    blend_indices=bi, blend_weight=bw,
                    uv0=_decode_half2(u0), uv1=_decode_half2(u1)))

        # Index buffer (U32 indices per MeshResource.cpp:258)
        ib_size, = struct.unpack_from('<I', data, pos); pos += 4
        ib_data = data[pos:pos+ib_size]; pos += ib_size
        idx_cnt = ib_size // 4  # U32 = 4 bytes each
        prim.indices = list(struct.unpack_from(f'<{idx_cnt}I', ib_data))

        # Material
        has_mat = data[pos]; pos += 1
        if has_mat:
            prim.material, pos = _parse_material(data, pos)
            if prim.material:
                log.debug(f"    VS: {prim.material.vertex_shaders}")
                log.debug(f"    PS: {prim.material.pixel_shaders}")
                for li, lt in enumerate(prim.material.texture_uniform):
                    for t in lt:
                        log.debug(f"    Tex LOD{li}: {t['type_name']}={t['path']}")

        prim.collision_mode, = struct.unpack_from('<I', data, pos); pos += 4
        mesh.primitives.append(prim)

    # Physical materials
    pmc, = struct.unpack_from('<i', data, pos); pos += 4
    for _ in range(pmc):
        v, = struct.unpack_from('<I', data, pos); pos += 4
        mesh.physical_materials.append(v)

    return mesh
