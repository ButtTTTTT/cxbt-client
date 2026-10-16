"""
mesh_export - 网格导出模块

提供将 Blender 场景中的网格对象导出为 PDE 引擎 .mesh 文件的功能。

子模块:
  - exporter: 静态网格二进制导出器核心逻辑
  - operator: Blender 导出操作器 (UI 入口)
"""

from .exporter import export_static_mesh
from .operator import PMT_OT_ExportMesh

__all__ = ("export_static_mesh", "PMT_OT_ExportMesh")
