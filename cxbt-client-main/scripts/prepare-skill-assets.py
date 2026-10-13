"""Export the skill panel skins, skill icons and the per-job skill catalogue.

blender -b --factory-startup --python-exit-code 1 --python scripts/prepare-skill-assets.py

Panel geometry comes from personalInfo.lua (right_main_3 / profession_skill and
ComFuc.SkillPointItem), skins from sys/skinF.lua and texts from game_text.lua.
Skill ids, levels and costs are server-owned, so the job tables below are
reconstructed from the four class screenshots plus the cache's id_datalist_* and
tips_abilities_* entries.  Blender reads the original .tga skins; the browser
only ever receives PNG.
"""
from pathlib import Path
import json
import re
import struct
import zlib

import bpy
import numpy as np

CLIENT = Path(__file__).resolve().parents[1]
ROOT = CLIENT.parents[1]
CACHE = ROOT / "AvatarStar_cache"
PATCH = ROOT / "AvatarStar_zh_cn_cache"
OUTPUT = CLIENT / "public/assets/lobby"
catalog = json.loads((OUTPUT / "catalog.json").read_text(encoding="utf-8"))
sources = json.loads((OUTPUT / "sources.json").read_text(encoding="utf-8"))

# personalInfo.lua: SkillPointItem rows and the profession_skill tab bar.
ROWS = (10, 37, 568, 83, 84)
BAR_WIDTHS = (0, 74, 146, 218, 290, 364)
MAX_LEVEL = 5

# Job tables: resource id, display name, active/passive, tips_abilities_* key.
# The cache has no text for the biochemist skills, so those keep their screenshot
# names without a description.
JOBS = {
    "guardian": ("护卫兵", [
        ("cure", "战场急救", "active", "Battlefield_Heal"),
        ("shock", "冲击波", "active", "Shockwave"),
        ("vitals", "要害射击", "passive", "Achilles_Heel"),
        ("rain", "箭雨", "active", "Arrow_Shower"),
        ("energy", "生命胶囊", "active", "Healing_Beacon"),
    ]),
    "gunner": ("重装兵", [
        ("shield", "能量盾", "active", "Shield"),
        ("gallop", "加速鼓舞", "active", "Haste"),
        ("tenacity", "霸体", "passive", "Perseverance"),
        ("heropower", "火力提升", "passive", "Blitzkrieg"),
        ("transfer", "伤害转移", "passive", "Damage_Converter"),
    ]),
    "biochemist": ("生化专家", [
        ("conduction", "生命传导", "active", None),
        ("suckblood", "生命抽取", "passive", None),
        ("plague", "瘟疫传播", "passive", None),
        ("gasbomb", "毒气弹", "passive", None),
        ("overreaction", "过激反应", "active", None),
    ]),
    "assassin": ("突击兵", [
        ("latent", "隐形", "active", "Stealth"),
        ("piercing", "致命一击", "passive", "Fatal_Shot"),
        ("poison", "毒刃", "passive", "Poison_Pierce"),
        ("spurt", "冲刺", "active", "Deadly_Sprint"),
        ("snare", "地雷", "active", "Trap"),
    ]),
}
TAB_STATES = (("normal", "nomal"), ("hover", "hower"), ("down", "down"))


def source(relative):
    for folder in (PATCH, CACHE):
        path = folder / relative
        if path.exists():
            return path
    raise FileNotFoundError(relative)


def pixels(path):
    image = bpy.data.images.load(str(path), check_existing=True)
    width, height = image.size
    values = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(values)
    result = (values.reshape(height, width, 4)[::-1].clip(0, 1) * 255).round().astype(np.uint8)
    bpy.data.images.remove(image)
    return result


def resize(image, width, height):
    x = np.round(np.linspace(0, image.shape[1] - 1, width)).astype(int)
    y = np.round(np.linspace(0, image.shape[0] - 1, height)).astype(int)
    return image[y[:, None], x]


def nine_slice(image, size, margins):
    """Match Gui.Image's fixed edges before CSS scaling, avoiding GPU seams."""
    left, top, right, bottom = margins
    height, width = image.shape[:2]
    xs, ys = [0, left, width - right, width], [0, top, height - bottom, height]
    dx, dy = [0, left, size[0] - right, size[0]], [0, top, size[1] - bottom, size[1]]
    canvas = np.zeros((size[1], size[0], 4), dtype=np.uint8)
    for y in range(3):
        for x in range(3):
            if dx[x + 1] <= dx[x] or dy[y + 1] <= dy[y]:
                continue
            patch = image[min(ys[y], height - 1):max(ys[y + 1], ys[y] + 1), min(xs[x], width - 1):max(xs[x + 1], xs[x] + 1)]
            canvas[dy[y]:dy[y + 1], dx[x]:dx[x + 1]] = resize(patch, dx[x + 1] - dx[x], dy[y + 1] - dy[y])
    return canvas


def write_png(image, destination):
    height, width = image.shape[:2]

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">2I5B", width, height, 8, 6, 0, 0, 0))
                            + chunk(b"IDAT", zlib.compress(b"".join(b"\0" + row.tobytes() for row in image), 9)) + chunk(b"IEND", b""))


def export(key, name, size=None, margins=None, folder="ui", path=None):
    source_path = path or source("ui/skinf/" + name)
    image = pixels(source_path)
    if size and margins:
        image = nine_slice(image, size, margins)
    elif size:
        image = resize(image, *size)
    destination = OUTPUT / folder / (key + ".png")
    write_png(image, destination)
    relative = destination.relative_to(OUTPUT).as_posix()
    sources[relative] = [source_path.relative_to(ROOT).as_posix()]
    if folder == "ui":
        catalog["ui"][key] = relative
    return relative


def texts():
    table = (CACHE / "scripts/game_text.lua").read_text(encoding="utf-8")
    entries = re.findall(r'^\t(\w+)\s*=\s*"((?:[^"\\]|\\.)*)",\s*$', table, re.M)
    return {key: value.replace("\\n", "\n").replace('\\"', '"') for key, value in entries}


def skill(entry, table):
    resource, name, kind, key = entry
    icon = OUTPUT / "icons" / (resource + ".png")
    if not icon.exists():
        raise FileNotFoundError(f"{icon} is missing; run scripts/prepare-lobby-assets.py first")
    disabled = None
    variant = CACHE / f"ui/skinf/lobby/{resource}_disabled.tga"
    if variant.exists():
        disabled = export(resource + "_disabled", f"lobby/{resource}_disabled.tga", folder="icons")
    description = table.get(f"tips_abilities_{key}_Desc_01") if key else None
    levels = [table.get(f"tips_abilities_{key}_mode{number}") for number in range(1, MAX_LEVEL + 1)] if key else []
    return {"id": resource, "name": name, "kind": kind, "icon": f"icons/{resource}.png", "disabledIcon": disabled,
            "tip": key, "description": description, "levels": levels}


def main():
    # personalInfo.lua profession_skill: 592x508 panel, 568x83 rows, 364x31 bars.
    export("skillPanel", "skin_jineng_ditu_01.tga", (592, 508), (290, 35, 290, 35))
    export("skillRow", "skin_common_background23_02.tga", (ROWS[2], ROWS[3]))
    export("skillBar", "skin_common_skill01.tga")
    export("skillBarLearned", "skin_common_skill02.tga")
    export("skillBarPending", "skin_common_skill03.tga")
    export("skillPoints", "skin_common_pagebar_BG.tga", (400, 38), (10, 10, 10, 10))
    export("skillPartition", "skin_jineng_hengxian_01.tga", (153, 2), (5, 1, 5, 1))
    export("bossSkillCard", "skin_pet_bg03.tga", (282, 132), (55, 36, 55, 36))
    export("bossSkillCardInner", "skin_pet_bg05.tga", (176, 114), (16, 16, 16, 16))
    for state, suffix in TAB_STATES:
        export("skillTab_" + state, "skin_common_button5_" + suffix + ".tga", (127, 31), (20, 5, 20, 5))
        export("skillAdd_" + state, f"skin_common_skill_plus_{state}.tga")
        export("skillRemove_" + state, f"skin_common_skill_minus_{state}.tga")
        export("bossSkillButton_" + state, f"skin_hecheng_buy_{state}.tga", (122, 35), (20, 5, 20, 5))
    export("skillAdd_disabled", "skin_common_skill_plus_disabled.tga")
    export("skillRemove_disabled", "skin_common_skill_minus_disabled.tga")
    export("bossSkillButton_disabled", "skin_hecheng_buy_disabled.tga", (122, 35), (20, 5, 20, 5))

    table = texts()
    document = {"maxLevel": MAX_LEVEL, "barWidths": list(BAR_WIDTHS),
                "jobs": {job: {"name": name, "skills": [skill(entry, table) for entry in entries]}
                         for job, (name, entries) in JOBS.items()}}
    (OUTPUT / "skills.json").write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUTPUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUTPUT / "sources.json").write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Prepared skill panel skins, skill icons and skills.json.")


main()
