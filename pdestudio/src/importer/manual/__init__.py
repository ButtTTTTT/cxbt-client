#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 手动导入子包

重新导出操作符和面板类，供上层 __init__.py 注册。
"""

from .operators import (
    PDE_OT_ImportMesh,
    PDE_OT_ImportSkel,
    PDE_OT_ImportAnim,
    PDE_OT_Diagnostics,
)
from .panels import (
    PDE_PT_ImportMainPanel,
    PDE_PT_ImportSkelPanel,
    PDE_PT_ImportMeshPanel,
    PDE_PT_ImportAnimPanel,
    PDE_PT_ImportInfoPanel,
)

__all__ = [
    "PDE_OT_ImportMesh",
    "PDE_OT_ImportSkel",
    "PDE_OT_ImportAnim",
    "PDE_OT_Diagnostics",
    "PDE_PT_ImportMainPanel",
    "PDE_PT_ImportSkelPanel",
    "PDE_PT_ImportMeshPanel",
    "PDE_PT_ImportAnimPanel",
    "PDE_PT_ImportInfoPanel",
]
