#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio - 多对象 Mesh 数据合并

将多个 Blender Mesh 对象的数据合并为单个 PDE .mesh 格式。

场景导入时每个 Primitive 创建独立 Mesh 对象（挂在父 Empty 下），
导出时需要合并所有对象的数据为一个 PDE mesh 文件。

合并策略:
    - Points/Normals/UVs/Tangents: 直接拼接，索引加偏移
    - FaceVertices: 顶点索引 + vertex_offset
    - FaceVertexNormals: 法线索引 + normal_offset
    - FaceVertexUVIndices: UV 索引 + uv_offset
    - FaceMaterials: 材质索引 + material_offset
    - FaceVertexCount/FaceTriangles: 逐面数据，直接拼接
"""

from typing import List, Dict, Any

from ..log import get_module_logger

log = get_module_logger("MESH_MERGE")


def merge_multi_object_data(
    per_object_results: List[dict],
) -> dict:
    """合并多个对象的提取结果为单个 mesh 数据

    Args:
        per_object_results: 每个对象的结果列表，每个元素包含:
            - "mesh_data": extract_mesh_data 返回的 mesh_lua
            - "materials": extract_materials 返回的 materials_lua
            - "face_material_indices": extract_materials 返回的面材质映射
            - "joints": 骨骼名列表
            - "is_skinned": 是否蒙皮
            - "obj_name": 对象名（日志用）

    Returns:
        合并后的结果 dict:
            - "mesh_data": 合并后的 mesh Lua 表
            - "materials": 合并后的材质列表
            - "joints": 骨骼名列表（取第一个有骨骼的对象）
            - "is_skinned": 是否有蒙皮对象
    """
    all_materials: List[dict] = []
    all_points: List[float] = []
    all_normals: List[float] = []
    all_face_vertex_count: List[int] = []
    all_face_vertices: List[int] = []
    all_face_vertex_normals: List[int] = []
    all_face_triangle_count: List[int] = []
    all_face_triangles: List[int] = []
    all_face_materials: List[int] = []
    all_colors: List[float] = []
    all_face_vertex_colors: List[int] = []
    all_blend_counts: List[int] = []
    all_blend_indices: List[int] = []
    all_blend_weights: List[float] = []
    all_uv_sets: List[dict] = []

    vertex_offset = 0
    normal_offset = 0
    color_offset = 0
    material_offset = 0
    has_skinning = False
    joints_result: List[str] = []

    for result in per_object_results:
        mesh_data = result["mesh_data"]
        materials = result["materials"]
        face_mat_indices = result["face_material_indices"]
        obj_name = result.get("obj_name", "?")

        n_points = len(mesh_data["Points"]) // 3
        n_normals = len(mesh_data["Normals"]) // 3
        n_colors = len(mesh_data.get("Colors", [])) // 4
        n_materials = len(materials)
        obj_joints = result.get("joints", [])
        n_joints = len(obj_joints)

        # Points
        all_points.extend(mesh_data["Points"])

        # Normals
        all_normals.extend(mesh_data["Normals"])

        # Face vertex count (per-face, no offset)
        all_face_vertex_count.extend(mesh_data["FaceVertexCount"])

        # Face vertices (vertex index + offset)
        for fv in mesh_data["FaceVertices"]:
            all_face_vertices.append(fv + vertex_offset)

        # Face vertex normals (normal index + offset)
        for fn in mesh_data["FaceVertexNormals"]:
            all_face_vertex_normals.append(fn + normal_offset)

        # Face triangle count + triangles (per-face, relative, no offset)
        all_face_triangle_count.extend(mesh_data["FaceTriangleCount"])
        all_face_triangles.extend(mesh_data["FaceTriangles"])

        # Face materials (per-polygon, from mesh_data + material_offset)
        # FaceMaterials 已按多边形面构建（与 FaceVertexCount 一一对应）
        for fm in mesh_data["FaceMaterials"]:
            all_face_materials.append(fm + material_offset)

        # Colors
        if mesh_data.get("Colors"):
            all_colors.extend(mesh_data["Colors"])
            for fc in mesh_data.get("FaceVertexColors", []):
                all_face_vertex_colors.append(fc + color_offset)

        # UV sets
        _merge_uv_sets(all_uv_sets, mesh_data.get("UVSets", []))

        # Skinning — BlendIndices 的 joint_offset 处理
        # 场景导入时多个 Primitive 共享同一骨骼列表，
        # 如果骨骼列表重复，不加 offset 避免索引偏移
        if mesh_data.get("BlendCounts"):
            has_skinning = True
            all_blend_counts.extend(mesh_data["BlendCounts"])

            # joint_offset 始终等于当前 joints_result 长度
            # 如果骨骼列表与已有列表完全重复，不加 offset
            current_offset = len(joints_result)
            if obj_joints and joints_result and obj_joints == joints_result:
                # 共享同一骨骼列表，BlendIndices 不加 offset
                all_blend_indices.extend(mesh_data["BlendIndices"])
            else:
                # 不同骨骼列表，加 offset
                for bi in mesh_data["BlendIndices"]:
                    all_blend_indices.append(bi + current_offset)
                if obj_joints:
                    joints_result.extend(obj_joints)

            all_blend_weights.extend(mesh_data["BlendWeights"])

        # Materials
        all_materials.extend(materials)

        log.debug(
            f"  合并 {obj_name}: +{n_points} 顶点, +{n_materials} 材质, "
            f"+{n_joints} 骨骼"
        )

        # Update offsets
        vertex_offset += n_points
        normal_offset += n_normals
        color_offset += n_colors
        material_offset += n_materials

    # Assemble merged mesh data
    merged_mesh = {
        "Points": all_points,
        "Normals": all_normals,
        "FaceVertexCount": all_face_vertex_count,
        "FaceVertices": all_face_vertices,
        "FaceVertexNormals": all_face_vertex_normals,
        "FaceTriangleCount": all_face_triangle_count,
        "FaceTriangles": all_face_triangles,
        "FaceMaterials": all_face_materials,
    }

    # Colors
    # FaceVertexColors 必须与 FaceVertices 严格等长，且不能为空。
    # 引擎的顶点焊接键 = (vertex, normal, uv0, uv1, color)：
    # 长度不足会越界读取、留空则 v.color 未初始化，两者都让 color 变成随机值，
    # 本可合并的顶点因此全部分裂（实测顶点数膨胀 +32%，三角形数不变）。
    # 无顶点色时统一补 Maya 默认白色 (1,1,1,1)，使 v.color 恒为确定值。
    if all_colors and len(all_face_vertex_colors) == len(all_face_vertices):
        merged_mesh["Colors"] = all_colors
        merged_mesh["FaceVertexColors"] = all_face_vertex_colors
    else:
        if all_colors:
            log.warning(
                f"  顶点色索引数与面顶点数不匹配 "
                f"({len(all_face_vertex_colors)} vs {len(all_face_vertices)})，"
                f"改为填充默认白色")
        merged_mesh["Colors"] = [1.0, 1.0, 1.0, 1.0]
        merged_mesh["FaceVertexColors"] = [0] * len(all_face_vertices)

    # Skinning
    if has_skinning and all_blend_counts:
        merged_mesh["BlendCounts"] = all_blend_counts
        merged_mesh["BlendIndices"] = all_blend_indices
        merged_mesh["BlendWeights"] = all_blend_weights
    else:
        merged_mesh["BlendCounts"] = {}
        merged_mesh["BlendIndices"] = {}
        merged_mesh["BlendWeights"] = {}

    # UV sets（确保始终3套：引擎StreamStatic固定有uv0/uv1/uv2）
    while len(all_uv_sets) < 3:
        idx = len(all_uv_sets)
        all_uv_sets.append(_empty_uv_set(f"map{idx + 1}"))

    merged_mesh["UVSets"] = all_uv_sets

    total_v = len(all_points) // 3
    total_f = len(all_face_vertex_count)
    log.info(f"合并完成: {total_v} 顶点, {total_f} 面, {len(all_materials)} 材质")

    return {
        "mesh_data": merged_mesh,
        "materials": all_materials,
        "joints": joints_result if has_skinning else [],
        "is_skinned": has_skinning,
    }


def _merge_uv_sets(dest: List[dict], src: List[dict]):
    """合并 UV 集，按索引对应"""
    for i, src_uv in enumerate(src):
        if i >= len(dest):
            dest.append(_empty_uv_set(src_uv.get("Name", f"map{i+1}")))

        dest_uv = dest[i]

        uv_offset = len(dest_uv["UVs"]) // 2
        tan_offset = len(dest_uv["Tangents"]) // 3

        dest_uv["UVs"].extend(src_uv.get("UVs", []))
        dest_uv["Tangents"].extend(src_uv.get("Tangents", []))
        dest_uv["Binormals"].extend(src_uv.get("Binormals", []))

        for idx in src_uv.get("FaceVertexUVIndices", []):
            dest_uv["FaceVertexUVIndices"].append(idx + uv_offset)
        for idx in src_uv.get("FaceVertexTangentIndices", []):
            dest_uv["FaceVertexTangentIndices"].append(idx + tan_offset)


def _empty_uv_set(name: str = "map1") -> dict:
    """创建空 UV 集"""
    return {
        "Name": name,
        "UVs": [],
        "Tangents": [],
        "Binormals": [],
        "FaceVertexUVIndices": [],
        "FaceVertexTangentIndices": [],
    }
