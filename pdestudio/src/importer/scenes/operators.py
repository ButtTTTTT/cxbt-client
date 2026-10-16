#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 场景导入操作符

操作符:
- PDE_OT_ScanScenes:   扫描场景目录, 生成 scene.json
- PDE_OT_ImportScene:  导入选中的场景 (mesh + 活动物体 + 门)

导入逻辑委托给 scene_import_helpers 模块。
"""

import bpy
from bpy.types import Operator

from ...log import get_module_logger
from .scene_import_helpers import (
    get_vfs_root,
    get_scene_json,
    find_scene,
    import_scene_mesh,
    import_hold_point,
    import_active_object,
    import_gate,
    ensure_collection,
)
from .panel import _populate_scene_list

log = get_module_logger("SCN_OPS")


class PDE_OT_ScanScenes(Operator):
    """扫描场景目录，生成 scene.json"""

    bl_idname = "pde_studio.scan_scenes"
    bl_label = "Scan Scenes"
    bl_description = "Scan scene directory and build scene.json"

    def execute(self, context):
        props = context.scene.pde_studio_props
        vfs_root = get_vfs_root(props)

        if not vfs_root:
            self.report({"ERROR"}, "Set VFS root first!")
            return {"CANCELLED"}

        scene_dir = vfs_root + "/level"
        if not scene_dir:
            self.report({"ERROR"}, "VFS root has no level directory")
            return {"CANCELLED"}

        from .scanner import scan_scenes, save_scene_json
        data = scan_scenes(scene_dir)

        if not data or not data.get("scenes"):
            self.report({"WARNING"}, "No scenes found")
            return {"CANCELLED"}

        # 保存 scene.json 到磁盘，供导入操作读取
        try:
            json_path = save_scene_json(data, scene_dir)
            log.info(f"scene.json 已保存: {json_path}")
        except Exception as e:
            self.report({"ERROR"}, f"Failed to save scene.json: {e}")
            return {"CANCELLED"}

        # 从 scene.json 填充列表（与刷新按钮逻辑一致）
        _populate_scene_list(props)
        props.scene_index = 0
        if props.scene_items:
            props.scene_sel_name = props.scene_items[0].name

        self.report({"INFO"}, f"Found {len(data.get('scenes', []))} scenes")
        return {"FINISHED"}


class PDE_OT_ImportScene(Operator):
    """导入选中的场景"""

    bl_idname = "pde_studio.import_scene"
    bl_label = "Import Scene"
    bl_description = "Import selected scene mesh and objects"

    def execute(self, context):
        props = context.scene.pde_studio_props
        vfs_root = get_vfs_root(props)

        if not vfs_root:
            self.report({"ERROR"}, "Set VFS root first!")
            return {"CANCELLED"}

        data = get_scene_json(props)
        if not data:
            self.report({"ERROR"}, "Scan scenes first!")
            return {"CANCELLED"}

        if props.scene_sel_name == "NONE":
            self.report({"WARNING"}, "Select a scene first!")
            return {"CANCELLED"}

        scn = find_scene(data, props.scene_sel_name)
        if not scn:
            self.report({"ERROR"}, f"Scene not found: {props.scene_sel_name}")
            return {"CANCELLED"}

        import_objects = props.scene_import_objects
        import_gates = props.scene_import_gates

        map_name = scn.get("map_name") or scn["file_name"]
        log.info(f"=== Import Scene ===")
        log.info(f"  Scene: {map_name} ({scn['file_name']})")
        log.info(f"  Scene mesh: {scn.get('scene_mesh')}")
        if import_objects:
            log.info(f"  Active objects: {len(scn.get('active_objects', []))}")
        if import_gates:
            log.info(f"  Gates: {len(scn.get('gates', []))}")

        count = 0
        coord_mode = props.import_coord_mode
        scale = props.import_scale

        # 创建分类集合
        coll_scene = ensure_collection("Scene")
        coll_objects = ensure_collection("Objects")
        coll_gates = ensure_collection("Gates")

        # 1. 导入场景 mesh → Scene 集合
        scene_mesh = scn.get("scene_mesh")
        if scene_mesh:
            mesh_obj = import_scene_mesh(
                props, vfs_root, scene_mesh, coord_mode, scale,
                target_collection=coll_scene)
            if mesh_obj:
                count += 1

        # 2. 导入活动物体 (风车、雷达等) → Objects 集合
        if import_objects:
            for obj in scn.get("active_objects", []):
                mesh_obj = import_active_object(
                    props, vfs_root, obj, coord_mode, scale,
                    target_collection=coll_objects)
                if mesh_obj:
                    count += 1

        # 3. 导入门 → Gates 集合
        if import_gates:
            for gate in scn.get("gates", []):
                mesh_obj = import_gate(
                    props, vfs_root, gate, coord_mode, scale,
                    target_collection=coll_gates)
                if mesh_obj:
                    count += 1

        # 4. 导入据点 mesh (Centerpoint) → Scene 集合
        hold_point = scn.get("hold_point_mesh")
        if hold_point:
            mesh_obj = import_hold_point(
                props, vfs_root, hold_point, coord_mode, scale,
                target_collection=coll_scene)
            if mesh_obj:
                count += 1

        if count > 0:
            self.report({"INFO"}, f"Imported {count} items")
            return {"FINISHED"}
        else:
            self.report({"WARNING"}, "Nothing imported")
            return {"CANCELLED"}
