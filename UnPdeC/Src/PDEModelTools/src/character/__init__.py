"""
角色装备模块

提供角色装备的解析和导入功能。
"""

from .character_types import (
    TeamSide,
    EquipmentSlot,
    EquipmentInfo,
    CharacterBase,
    CharacterTeam,
    CharacterInfo,
)
from .parser import CharacterScriptParser
from .operator import (
    PMT_OT_ScanCharacters,
    PMT_OT_ImportCharacter,
    get_character_cache,
    clear_character_cache,
)

__all__ = (
    # 类型
    "TeamSide",
    "EquipmentSlot",
    "EquipmentInfo",
    "CharacterBase",
    "CharacterTeam",
    "CharacterInfo",
    # 解析器
    "CharacterScriptParser",
    # 操作符
    "PMT_OT_ScanCharacters",
    "PMT_OT_ImportCharacter",
    # 缓存
    "get_character_cache",
    "clear_character_cache",
)
