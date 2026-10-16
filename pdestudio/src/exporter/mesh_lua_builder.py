#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - Mesh Lua 表组装器

将提取的网格数据（Points/Normals/Faces/UV/Tangents/Skin）
组装为 PDE 引擎 Lua 表格式，供 mesh.py 写入 .mesh 文件。

关键对齐:
- UVSets 始终导出3套（引擎 StreamStatic 固定有 uv0/uv1/uv2 三个槽位）
- None UV 层导出为空 UVSet（引擎创建空 UVSet, GetUVs 返回 NULL）
- 切线/副法线按面顶点顺序写入(不去重), 索引连续 0,1,2...
"""

from ..log import get_module_logger

log = get_module_logger("MESH_LUA")


def assemble_mesh_lua(
    points_list, normals_list, face_data,
    uv_layers, uv_values_per_set,
    export_tangents, export_vertex_colors,
    colors_list, is_skinned,
):
    """组装 Mesh Lua 表

    Args:
        points_list: 顶点坐标列表 [[x,y,z], ...]
        normals_list: 法线列表 [[nx,ny,nz], ...]
        face_data: _build_face_data 返回的字典
        uv_layers: UV 层列表 (长度3, None=占位)
        uv_values_per_set: 每套 UV 的值列表
        export_tangents: 是否导出切线
        export_vertex_colors: 是否导出顶点色
        colors_list: 顶点色列表
        is_skinned: 是否蒙皮

    Returns:
        PDE Lua 表格式的 mesh 字典
    """
    flat_points = [v for p in points_list for v in p]
    flat_normals = [v for n in normals_list for v in n]

    mesh_lua = {
        "Points": flat_points,
        "Normals": flat_normals,
        "FaceVertexCount": face_data["face_vertex_count"],
        "FaceVertices": face_data["face_vertices"],
        "FaceVertexNormals": face_data["face_vertex_normals"],
        "FaceTriangleCount": face_data["face_triangle_count"],
        "FaceTriangles": face_data["face_triangles"],
        "FaceMaterials": face_data["face_materials"],
    }

    # 顶点色
    # FaceVertexColors 必须与 FaceVertices 严格等长：
    # 引擎 CreateColorSet 不做边界检查，长度不足会越界读取，
    # 使焊接键 (vertex, normal, uv0, uv1, color) 中的 color 取到随机值，
    # 本可合并的顶点因此无法合并（实测顶点膨胀 +32%，三角形数不变）。
    n_face_vertices = len(face_data["face_vertices"])
    fv_colors = face_data["face_vertex_colors"] or []
    if export_vertex_colors and colors_list and len(fv_colors) == n_face_vertices:
        mesh_lua["Colors"] = [v for c in colors_list for v in c]
        mesh_lua["FaceVertexColors"] = fv_colors
    else:
        # 无顶点色时必须补一份 Maya 默认白色 (1,1,1,1)，不能留空。
        #
        # 引擎的顶点焊接键 = (vertex, normal, uv0, uv1, color)，
        # 若 Colors / FaceVertexColors 留空，v.color 会取到未初始化的随机值，
        # 本可合并的顶点因此全部分裂 —— 实测顶点数膨胀 +32%（三角形数不变）。
        #
        # Maya 导出器 fnMesh.getColors(temp, NULL, &defaultColor) 同样总是产出
        # 全白颜色，故此举与原版行为一致。
        mesh_lua["Colors"] = [1.0, 1.0, 1.0, 1.0]
        mesh_lua["FaceVertexColors"] = [0] * n_face_vertices

    # 蒙皮
    if is_skinned and face_data["flat_blend_counts"]:
        mesh_lua["BlendCounts"] = face_data["flat_blend_counts"]
        mesh_lua["BlendIndices"] = face_data["flat_blend_indices"]
        mesh_lua["BlendWeights"] = face_data["flat_blend_weights"]
    else:
        mesh_lua["BlendCounts"] = {}
        mesh_lua["BlendIndices"] = {}
        mesh_lua["BlendWeights"] = {}

    # UV 集
    uv_sets_lua = []
    for i in range(len(uv_layers)):
        uv_name = "map1" if i == 0 else f"map{i + 1}"

        if uv_layers[i] is None:
            uv_sets_lua.append({
                "Name": uv_name,
                "UVs": {},
                "Tangents": {},
                "Binormals": {},
                "FaceVertexUVIndices": {},
                "FaceVertexTangentIndices": {},
            })
            continue

        uv_set_lua = {
            "Name": uv_name,
            "UVs": [v for uv in uv_values_per_set[i] for v in uv],
        }
        if export_tangents and face_data["tangent_values_per_fv"] is not None:
            tan_vals = face_data["tangent_values_per_fv"]
            bin_vals = face_data["binormal_values_per_fv"]
            uv_set_lua["Tangents"] = [v for t in tan_vals for v in t]
            uv_set_lua["Binormals"] = [v for b in bin_vals for v in b]
            uv_set_lua["FaceVertexUVIndices"] = \
                face_data["face_vertex_uv_per_set"][i]
            uv_set_lua["FaceVertexTangentIndices"] = \
                face_data["face_vertex_tangent_indices"] or []
        else:
            uv_set_lua["Tangents"] = {}
            uv_set_lua["Binormals"] = {}
            uv_set_lua["FaceVertexUVIndices"] = \
                face_data["face_vertex_uv_per_set"][i]
            uv_set_lua["FaceVertexTangentIndices"] = {}
        uv_sets_lua.append(uv_set_lua)

    if not uv_sets_lua:
        uv_sets_lua.append({
            "Name": "map1", "UVs": {}, "Tangents": {}, "Binormals": {},
            "FaceVertexUVIndices": {}, "FaceVertexTangentIndices": {},
        })

    mesh_lua["UVSets"] = uv_sets_lua
    return mesh_lua
