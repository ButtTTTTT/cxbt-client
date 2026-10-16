#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio 导出器公共工具

提供导出器共用的 Lua 表序列化、文件写入、编译脚本生成等功能。
"""

import os
import math
from typing import Any

from ..log import get_module_logger

log = get_module_logger("EXPORT")


# =============================================================================
# Lua 表序列化
# =============================================================================

class LuaSerializer:
    """
    Lua 表序列化器

    将 Python 数据结构序列化为 PDE 引擎使用的 Lua 表格式文本。
    支持：number, string, bool, list, dict。
    """

    def __init__(self, indent_str="    "):
        self.indent_str = indent_str

    def serialize(self, value: Any, indent: int = 0) -> str:
        """
        将 Python 值序列化为 Lua 表格式字符串

        Args:
            value: 要序列化的值
            indent: 当前缩进级别

        Returns:
            Lua 格式的字符串
        """
        if value is None:
            return "nil"
        elif isinstance(value, bool):
            return "true" if value else "false"
        elif isinstance(value, (int, float)):
            # 浮点数格式化：避免过长的小数，但保持精度
            if isinstance(value, float):
                # 如果是整数，不写 .0
                if value == int(value) and not math.isinf(value):
                    return str(int(value))
                else:
                    return f"{value:.6g}"
            return str(value)
        elif isinstance(value, str):
            return self._serialize_string(value)
        elif isinstance(value, (list, tuple)):
            return self._serialize_array(value, indent)
        elif isinstance(value, dict):
            return self._serialize_table(value, indent)
        else:
            return str(value)

    def _serialize_string(self, s: str) -> str:
        """序列化字符串，处理特殊字符"""
        # 转义双引号和反斜杠
        s = s.replace("\\", "\\\\")
        s = s.replace('"', '\\"')
        s = s.replace("\n", "\\n")
        s = s.replace("\r", "\\r")
        s = s.replace("\t", "\\t")
        return f'"{s}"'

    def _serialize_array(self, arr: list, indent: int) -> str:
        """序列化数组（Lua 中用整数索引的表）

        对齐 Maya 导出器格式: 简单数组每行写多个值 (wrap=10),
        大幅减少文件行数和大小。例如 280506 个切线值:
        - 旧格式 (每行1个): 280506 行
        - 新格式 (每行10个): 28051 行
        """
        if not arr:
            return "{}"

        all_simple = all(isinstance(v, (int, float, str, bool)) for v in arr)

        if all_simple:
            parts = [self.serialize(v, indent + 1) for v in arr]
            line = ", ".join(parts)
            if len(line) < 80:
                return "{" + line + "}"

            # 每行写 wrap 个值 (对齐 Maya 导出器)
            wrap = 10
            prefix = self.indent_str * (indent + 1)
            close_prefix = self.indent_str * indent
            lines = []
            for i in range(0, len(parts), wrap):
                chunk = ", ".join(parts[i:i + wrap])
                lines.append(f"{prefix}{chunk},")
            return "{\n" + "\n".join(lines) + f"\n{close_prefix}}}"

        prefix = self.indent_str * (indent + 1)
        close_prefix = self.indent_str * indent
        lines = [f"{prefix}{self.serialize(v, indent + 1)}" for v in arr]
        return "{\n" + ",\n".join(lines) + f",\n{close_prefix}}}"

    def _serialize_table(self, table: dict, indent: int) -> str:
        """序列化字典（Lua 中用字符串键的表）"""
        if not table:
            return "{}"

        prefix = self.indent_str * (indent + 1)
        close_prefix = self.indent_str * indent

        lines = []
        for key, value in table.items():
            v_str = self.serialize(value, indent + 1)
            if isinstance(key, str):
                # Lua 标识符可以不用引号（如果只含字母数字下划线）
                if key.isidentifier() and not key[0].isdigit():
                    lines.append(f"{prefix}{key} = {v_str}")
                else:
                    lines.append(f"{prefix}[{self._serialize_string(key)}] = {v_str}")
            else:
                lines.append(f"{prefix}[{self.serialize(key)}] = {v_str}")

        return "{\n" + ",\n".join(lines) + f",\n{close_prefix}}}"


# 全局序列化器实例
_serializer = LuaSerializer()


def lua_serialize(value: Any, indent: int = 0) -> str:
    """快捷方法：将 Python 值序列化为 Lua 表格式字符串"""
    return _serializer.serialize(value, indent)


def lua_table_to_file(table_dict: dict, filepath: str, header_comment: str = "") -> bool:
    """
    将 Python 字典写入为 PDE Lua 表文件

    Args:
        table_dict: 顶层 Lua 表的字典表示 { "Materials": [...], "Joints": [...], "Mesh": {...} }
        filepath: 输出文件路径
        header_comment: 文件头注释

    Returns:
        是否成功
    """
    try:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        lines = []
        if header_comment:
            lines.append(f"-- {header_comment}")
            lines.append("")

        for key, value in table_dict.items():
            lines.append(f"{key} = {_serializer.serialize(value, 0)}")
            lines.append("")

        content = "\n".join(lines)

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)

        log.info(f"文件已写入: {filepath}")
        return True

    except Exception as e:
        log.error(f"写入文件失败 {filepath}: {e}")
        return False


# =============================================================================
# 编译脚本生成
# =============================================================================

def generate_build_scripts(
    mesh_name: str,
    export_dir: str,
    vfs_prefix: str = "/mesh/",
    has_skel: bool = False,
    has_anim: bool = False,
) -> bool:
    """
    生成 cache_xxx.lua 和 gen_xxx.lua 编译脚本

    场景 mesh（vfs_prefix 包含 "/scene/"）自动在 physx 段添加 .mesh 文件，
    确保 gen 脚本同时构建 .physx.cache 碰撞数据。

    Args:
        mesh_name: 模型名称（如 "goldcoin"）
        export_dir: 导出目录路径
        vfs_prefix: VFS 路径前缀（如 "/mesh/prop/goldcoin/"）
        has_skel: 是否包含骨骼文件
        has_anim: 是否包含动画文件

    Returns:
        是否成功
    """
    try:
        # 确保路径以 / 结尾
        if not vfs_prefix.endswith("/"):
            vfs_prefix += "/"

        # 资源列表
        resources = [
            f'"{vfs_prefix}{mesh_name}.mesh"',
        ]
        if has_skel:
            resources.append(f'"{vfs_prefix}{mesh_name}.skel"')
        if has_anim:
            resources.append(f'"{vfs_prefix}{mesh_name}.anim"')

        # --- cache_xxx.lua ---
        cache_content = "resource = {\n"
        for r in resources:
            cache_content += f"    {r},\n"
        cache_content += "}\n"

        # 场景 mesh 需要构建 physx 碰撞数据
        # 原版 gen_cache_list.sh 中 physx 段列出所有 scene/*.mesh
        # 检测 vfs_prefix 是否包含 "/scene/" 来自动判断
        is_scene = "/scene/" in vfs_prefix
        if is_scene:
            cache_content += "physx = {\n"
            cache_content += f'    "{vfs_prefix}{mesh_name}.mesh",\n'
            cache_content += "}\n"
        else:
            cache_content += "physx = {\n}\n"
        cache_content += "copy = {\n}\n"

        cache_path = os.path.join(export_dir, f"cache_{mesh_name}.lua")
        with open(cache_path, "w", encoding="utf-8") as f:
            f.write(cache_content)
        log.info(f"资源清单已生成: {cache_path}")

        # --- gen_xxx.lua ---
        from .gen_script_template import generate_gen_script
        gen_content = generate_gen_script(mesh_name)
        gen_path = os.path.join(export_dir, f"gen_{mesh_name}.lua")
        with open(gen_path, "w", encoding="utf-8") as f:
            f.write(gen_content)
        log.info(f"编译脚本已生成: {gen_path}")

        return True

    except Exception as e:
        log.error(f"生成编译脚本失败: {e}")
        return False


# =============================================================================
# 数学工具
# =============================================================================

def quaternion_to_wxyz(q) -> tuple:
    """
    将 Blender 四元数转换为 (qx, qy, qz, qw) 格式

    Blender 的四元数顺序是 (w, x, y, z)
    PDE 使用 (x, y, z, w) 顺序

    Args:
        q: Blender Quaternion 对象

    Returns:
        (qx, qy, qz, qw) 元组
    """
    return (q.x, q.y, q.z, q.w)


def vec3_to_pde(v, scale: float = 1.0) -> tuple:
    """
    将 Blender 3D 矢量转换为 PDE 坐标

    PDE 游戏单位=米，与 Blender 默认米制一致，默认 scale=1.0。
    如需厘米可手动传入 scale=100。

    Args:
        v: Blender Vector 对象
        scale: 缩放倍数（默认1.0）

    Returns:
        (x, y, z) 元组
    """
    return (v.x * scale, v.y * scale, v.z * scale)


# 重新导出 export_utils 中的工具函数，方便外部统一导入
from .export_utils import (  # noqa: E402
    convert_position_to_pde,
    convert_quaternion_to_pde,
    convert_direction_to_pde,
    get_armature_coord_mode,
    get_pde_rest_world_matrices,
    get_pexport_dir,
    build_mesh_export_path,
    build_skel_export_path,
    build_anim_export_path,
    derive_vfs_prefix,
    derive_mesh_vfs_dir,
)


# =============================================================================
# 对象查找工具
# =============================================================================

def find_armature(context, selected_only: bool = True) -> object:
    """
    在当前场景中查找 Armature 对象

    Args:
        context: Blender 上下文
        selected_only: 仅查找选中对象

    Returns:
        Armature 对象，未找到返回 None
    """
    objects = context.selected_objects if selected_only else context.scene.objects
    for obj in objects:
        if obj.type == 'ARMATURE':
            return obj
    return None


def find_mesh_objects(context, selected_only: bool = True) -> list:
    """
    在当前场景中查找 Mesh 对象

    Args:
        context: Blender 上下文
        selected_only: 仅查找选中对象

    Returns:
        Mesh 对象列表
    """
    objects = context.selected_objects if selected_only else context.scene.objects
    return [obj for obj in objects if obj.type == 'MESH']
