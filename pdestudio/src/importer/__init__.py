#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDE Studio 导入器公共接口

从原版 PDE 引擎的二进制 .cache 格式导入 mesh/skel/anim 到 Blender。

导入路径:
  原版 .cache 文件 → binary/cache_decoder 解包 → 二进制数据 → core/mesh_builder 解析 → Blender 对象
"""
