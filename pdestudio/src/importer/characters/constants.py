#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 角色常量定义

角色分类映射、显示名称映射等静态常量。
"""

# 角色映射: 目录名 -> (category, display_name)
# display_name 仅在 enum_callbacks 中硬编码使用，不写入 JSON
CHARACTER_MAP = {
    # Player
    "butcher":     ("player", "重机枪手"),
    "fireman":     ("player", "火箭兵"),
    "leader":      ("player", "突击手"),
    "firebat":     ("player", "火焰兵"),
    "nurse":       ("player", "医疗兵"),
    "engineer":    ("player", "工程兵"),
    "officelady":  ("player", "狙击手"),
    # Boss
    "boss02":         ("boss", "Boss-02"),
    "boss04001":      ("boss", "Boss-04001"),
    "boss04002":      ("boss", "Boss-04002"),
    "bossuav04003":   ("boss", "Boss-UAV-04003"),
    "bossuav04004":   ("boss", "Boss-UAV-04004"),
    # Tank
    "tank01_1":    ("tank", "坦克 MK1"),
    "tank01_2":    ("tank", "坦克 MK2"),
    "tank01_3":    ("tank", "坦克 MK3"),
    # Gunship
    "gunship01lv1": ("gunship", "直升机 LV1"),
    "gunship01lv2": ("gunship", "直升机 LV2"),
    "gunship01lv3": ("gunship", "直升机 LV3"),
    "gunship01lv4": ("gunship", "直升机 LV4"),
    # Cell
    "cell01":      ("cell", "生化-01"),
    "cell02":      ("cell", "生化-02"),
    "cell03":      ("cell", "生化-03"),
    "cell04":      ("cell", "生化-04"),
    "cell05":      ("cell", "生化-05"),
    "cellhero01":  ("cell", "生化英雄-01"),
    "cellrmb01":   ("cell", "生化RMB-01"),
    # Other
    "proprole01":  ("other", "道具角色-01"),
    "robot":       ("other", "机器人"),
}

# Category labels
CATEGORY_LABELS = {
    "player":  "玩家",
    "boss":    "Boss",
    "tank":    "坦克",
    "gunship": "武装直升机",
    "cell":    "生化体",
    "other":   "其他",
}

# 分类排序优先级
CATEGORY_ORDER = ["player", "boss", "tank", "gunship", "cell", "other"]


def classify_character(dir_name: str) -> tuple:
    """根据目录名推断角色分类和显示名

    Returns:
        (category, display_name)
    """
    base = dir_name
    for suffix in ("_0", "_1"):
        if base.endswith(suffix):
            base = base[:-2]
            break

    if base in CHARACTER_MAP:
        category, _ = CHARACTER_MAP[base]
        return (category, base)  # JSON 只存英文名，不存中文

    if base.startswith("boss"):
        return ("boss", base)
    if base.startswith("tank"):
        return ("tank", base)
    if base.startswith("gunship"):
        return ("gunship", base)
    if base.startswith("cell"):
        return ("cell", base)

    return ("other", base)


# 动画类型 → VFS 路径段 (category, view)
# char_tp: animation/character/thirdperson/<animset>/
# char_fp: animation/character/firstperson/<animset>/
# prop_tp: animation/prop/thirdperson/<animset>/
# prop_fp: animation/prop/firstperson/<animset>/
ANIM_TYPE_PATHS = {
    "char_tp": ("character", "thirdperson"),
    "char_fp": ("character", "firstperson"),
    "prop_tp": ("prop", "thirdperson"),
    "prop_fp": ("prop", "firstperson"),
}
