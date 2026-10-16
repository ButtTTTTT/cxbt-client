#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 角色导入子包

重新导出操作符和面板类，供上层 __init__.py 注册。
"""

from .operators import (
    PDE_OT_ScanCharacters,
    PDE_OT_ImportCharacterTP,
)
from .panel import (
    PDE_PT_CharacterMainPanel,
    PDE_PT_CharacterOptionsPanel,
)
from .accessory_operators import (
    PDE_OT_ImportAccessory,
)
from .accessory_panel import (
    PDE_PT_HatPanel,
    PDE_PT_ChestPanel,
    PDE_PT_MedalPanel,
)
from .anim_list import (
    PDE_AnimListItem,
    PDE_UL_AnimList,
)
from .anim_operators import (
    PDE_OT_RefreshAnimList,
    PDE_OT_AnimSelectAll,
    PDE_OT_AnimDeselectAll,
    PDE_OT_ImportAnimations,
)
from .anim_panel import (
    PDE_PT_CharacterAnimationPanel,
)

__all__ = [
    # 角色导入
    "PDE_OT_ScanCharacters",
    "PDE_OT_ImportCharacterTP",
    "PDE_PT_CharacterMainPanel",
    "PDE_PT_CharacterOptionsPanel",
    # 配饰导入
    "PDE_OT_ImportAccessory",
    "PDE_PT_HatPanel",
    "PDE_PT_ChestPanel",
    "PDE_PT_MedalPanel",
    # 动画导入
    "PDE_AnimListItem",
    "PDE_UL_AnimList",
    "PDE_OT_RefreshAnimList",
    "PDE_OT_AnimSelectAll",
    "PDE_OT_AnimDeselectAll",
    "PDE_OT_ImportAnimations",
    "PDE_PT_CharacterAnimationPanel",
]
