#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""PDE Studio - 动画帧率一致性工具

问题背景:
    PDE 引擎的动画固定 96fps，但 Blender 里"帧号 -> 秒"的换算依赖全局的
    ``scene.render.fps``。导入动画时我们会把它设成 96，可这个全局值很容易
    被后续操作覆盖（加载别的 .blend、手动改、模板默认值等）。

    一旦 ``scene.render.fps`` 与动画真实帧率不符，会产生**很隐蔽**的错误:
      - 时间轴播放速度错（96 -> 60 时慢 1.6 倍）
      - 导出 glTF 时按 scene.fps 把帧号换算成秒，动画时长整体偏差
      - 导出 PDE .anim 时采样步长（exporter/anim.py:122）同样基于 scene.fps

解决方案:
    1. 导入动画时把真实帧率写到 Action 自定义属性 ``pde_anim_fps``
    2. 提供 check/fix 工具，在"文件加载后"和"手动点击"两个时机校正
"""

import bpy

PDE_ANIM_FPS = 96.0

# Action 上记录真实帧率的自定义属性名
ANIM_FPS_PROP = "pde_anim_fps"


def tag_action_fps(action, fps: float = PDE_ANIM_FPS):
    """把 PDE 动画的真实帧率记录到 Action 上

    记录后，即使 scene.render.fps 被外部改动，也能检测出来并修正。
    """
    if action is None:
        return
    try:
        action[ANIM_FPS_PROP] = float(fps)
    except Exception:
        pass


def iter_pde_actions():
    """遍历所有被引用的、带帧率标记的 PDE Action

    Returns:
        [(action, fps), ...]
    """
    result = []
    for action in bpy.data.actions:
        if action.users == 0:
            continue            # 孤儿数据（其它文件的残留），跳过
        fps = action.get(ANIM_FPS_PROP)
        if fps:
            try:
                result.append((action, float(fps)))
            except (TypeError, ValueError):
                continue
    return result


def check_scene_fps(scene) -> dict:
    """检查场景帧率是否与 PDE 动画匹配

    Returns:
        dict:
            ok        -- 是否一致
            expected  -- PDE 动画要求的帧率（多帧率混杂时为 None）
            actual    -- 当前 scene 帧率
            actions   -- 受影响的 Action 名列表
            mixed     -- 是否存在多个不同帧率的 PDE 动画
            fps_values-- 出现过的所有帧率
    """
    fps_base = float(getattr(scene.render, "fps_base", 1.0) or 1.0)
    actual = float(scene.render.fps) / max(fps_base, 1e-9)

    actions = iter_pde_actions()
    if not actions:
        return {
            "ok": True, "expected": None, "actual": actual,
            "actions": [], "mixed": False, "fps_values": [],
        }

    fps_values = sorted({round(f, 6) for _, f in actions})
    mixed = len(fps_values) > 1
    expected = None if mixed else fps_values[0]
    ok = (not mixed) and abs(actual - fps_values[0]) < 1e-6

    return {
        "ok": ok,
        "expected": expected,
        "actual": actual,
        "actions": [a.name for a, _ in actions],
        "mixed": mixed,
        "fps_values": fps_values,
    }


def fix_scene_fps(scene, fps: float = None):
    """把 scene.render.fps 校正为 PDE 动画的帧率

    只改帧率，**不动帧范围** —— Action 的帧号本身是正确的，
    帧率修正后时长自然恢复正确。

    Returns:
        (changed: bool, message: str)
    """
    info = check_scene_fps(scene)

    if not info["actions"]:
        return False, "场景中没有 PDE 动画，无需修正"

    if info["mixed"]:
        return False, ("场景中存在帧率不一致的 PDE 动画 %s，无法自动修正"
                       % (info["fps_values"],))

    target = float(fps) if fps else float(info["expected"])
    if abs(info["actual"] - target) < 1e-6:
        return False, "帧率已经是 %g，无需修正" % target

    scene.render.fps = int(round(target))
    scene.render.fps_base = 1.0

    return True, ("动画帧率 %g -> %g（%d 个 PDE 动画：%s）"
                  % (info["actual"], target, len(info["actions"]),
                     ", ".join(info["actions"][:4])
                     + (" …" if len(info["actions"]) > 4 else "")))
