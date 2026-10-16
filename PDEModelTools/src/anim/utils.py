import re
import struct
from typing import Dict, List, Tuple, TYPE_CHECKING

from mathutils import Matrix, Quaternion, Vector
from ..log import get_module_logger

if TYPE_CHECKING:
    import bpy

log = get_module_logger("ANIM")

Transform = Tuple[Vector, Quaternion]


def read_frame_transform_layout(frame_bytes, layout: str, byte_offset: int = 0):
    if len(frame_bytes) < byte_offset + 28:
        return None
    if layout == "quatpos":
        qx, qy, qz, qw = struct.unpack_from("<4f", frame_bytes, byte_offset)
        px, py, pz = struct.unpack_from("<3f", frame_bytes, byte_offset + 16)
    else:
        px, py, pz = struct.unpack_from("<3f", frame_bytes, byte_offset)
        qx, qy, qz, qw = struct.unpack_from("<4f", frame_bytes, byte_offset + 12)
    quat = Quaternion((qw, qx, qy, qz))
    return (px, py, pz), quat


def calc_track_delta(track: List[Transform]) -> Tuple[float, float]:
    if len(track) < 2:
        return 0.0, 0.0
    loc0, rot0 = track[0]
    max_dt = 0.0
    max_da = 0.0
    for loc, rot in track[1:]:
        dt = (loc - loc0).length
        if dt > max_dt:
            max_dt = dt
        da = rot0.rotation_difference(rot).angle
        if da > max_da:
            max_da = da
    return max_dt, max_da


def calc_raw_float_delta(
    data: bytes,
    soffset: int,
    frames_number: int,
    stride_floats: int,
) -> Tuple[float, float]:
    if frames_number < 2 or stride_floats <= 0:
        return 0.0, 0.0
    stride_bytes = stride_floats * 4
    f0 = struct.unpack_from(f"<{stride_floats}f", data, soffset)
    max_abs = 0.0
    max_diff = 0.0
    for frame_index in range(frames_number):
        offset = soffset + frame_index * stride_bytes
        fi = struct.unpack_from(f"<{stride_floats}f", data, offset)
        for a, b in zip(f0, fi):
            aa = abs(b)
            if aa > max_abs:
                max_abs = aa
            diff = abs(b - a)
            if diff > max_diff:
                max_diff = diff
    return max_abs, max_diff


def choose_transform_window(
    data: bytes,
    soffset: int,
    frames_number: int,
    stride_bytes: int,
) -> Tuple[str, int]:
    # 强制使用 posquat 布局，与 C# AnimParser.cs 保持一致
    # C# 代码按顺序读取: px, py, pz, rx, ry, rz, rw
    return "posquat", 0


def get_or_create_fcurve(action, data_path, array_index):
    fc = action.fcurves.find(data_path, index=array_index)
    if fc is not None:
        return fc
    return action.fcurves.new(data_path=data_path, index=array_index)


def apply_root_fix_to_rotation(root_fix, root_fix_inv, quat):
    mat_local_dx = quat.to_matrix().to_4x4()
    mat_local_bl = root_fix @ mat_local_dx @ root_fix_inv
    return mat_local_bl.to_quaternion()


def apply_root_fix_to_location(root_fix, pos3):
    x, y, z = pos3
    v4 = Vector((x, y, z, 1.0))
    v4 = root_fix @ v4
    return Vector((v4[0], v4[1], v4[2]))


def is_valid_group_name(name: str) -> bool:
    if not name or not isinstance(name, str):
        return False
    return re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", name) is not None


def parse_anim_tracks(
    data: bytes,
    file_stem: str,
    root_fix: Matrix,
    root_fix_inv: Matrix,
    anim_count_hint: int = 0,
    logger=None,
) -> List[Tuple[str, List[Transform]]]:
    group_eoffset = 0
    anim_count = anim_count_hint
    if len(data) >= 8:
        magic_1, anim_count_read = struct.unpack("<2I", data[:8])
        if magic_1 == 0x500:
            anim_count = anim_count_read
            group_eoffset = 8
            if logger:
                logger.debug(
                    "检测到 .anim 文件头 magic 0x500, anim_count: %s", anim_count
                )

    file_size = len(data)
    possible_end_offset = data.find(file_stem.encode("utf-8"), 0)
    if possible_end_offset != -1:
        file_size = possible_end_offset - 4

    groups: List[Tuple[str, int, int, int, int, int]] = []
    while True:
        if group_eoffset + 4 > file_size:
            break

        group_name_length = struct.unpack("<I", data[group_eoffset : group_eoffset + 4])[0]
        if group_name_length > 63:
            break

        name_start = group_eoffset + 4
        name_end = name_start + group_name_length
        if name_end > file_size:
            break

        try:
            group_name = data[name_start:name_end].decode("utf-8").strip('\x00')
        except Exception:
            break

        if not is_valid_group_name(group_name):
            break

        frames_offset = name_end
        if frames_offset + 4 > file_size:
            break
        frames_number = struct.unpack("<I", data[frames_offset : frames_offset + 4])[0]
        if frames_number <= 0:
            break

        feature_offset = frames_offset + 4
        if feature_offset + 4 > file_size:
            break
        float_count = struct.unpack("<I", data[feature_offset : feature_offset + 4])[0]
        if float_count <= 0 or float_count % frames_number != 0:
            break

        stride_floats = float_count // frames_number
        stride_bytes = stride_floats * 4
        if stride_bytes < 28:
            break

        soffset = feature_offset + 4
        eoffset = soffset + frames_number * stride_bytes
        if eoffset > file_size:
            break

        groups.append(
            (group_name, frames_number, soffset, eoffset, stride_bytes, stride_floats)
        )
        group_eoffset = eoffset

        if group_eoffset == file_size:
            break
        if anim_count and len(groups) >= anim_count:
            break

    # Change to List to preserve order for Index Mapping
    tracks_list: List[Tuple[str, List[Transform]]] = []
    name_counts: Dict[str, int] = {}
    max_raw_name = None
    max_raw_abs = 0.0
    max_raw_diff = 0.0
    for group_name, frames_number, soffset, eoffset, stride_bytes, stride_floats in groups:
        # 处理重名骨骼 (如 knee_l, knee_l.001)
        # 确保动画轨道名称与 Blender 生成的骨骼名称一致
        if group_name in name_counts:
            count = name_counts[group_name]
            unique_name = f"{group_name}.{count:03d}"
            name_counts[group_name] += 1
            group_name = unique_name
        else:
            name_counts[group_name] = 1

        raw_abs, raw_diff = calc_raw_float_delta(
            data, soffset, frames_number, stride_floats
        )
        if raw_abs > max_raw_abs or raw_diff > max_raw_diff:
            max_raw_abs = max(max_raw_abs, raw_abs)
            max_raw_diff = max(max_raw_diff, raw_diff)
            max_raw_name = group_name
        
        current_track_data = []
        tracks_list.append((group_name, current_track_data))
        
        layout, byte_offset = choose_transform_window(data, soffset, frames_number, stride_bytes)
        if logger:
            logger.debug("轨道 %s 使用布局: %s offset=%s", group_name, layout, byte_offset)

        for i in range(frames_number):
            frame_offset = soffset + i * stride_bytes
            if frame_offset + 28 > eoffset or frame_offset + 28 > file_size:
                break

            frame_data = data[frame_offset : frame_offset + stride_bytes]
            parsed = read_frame_transform_layout(frame_data, layout, byte_offset)
            if parsed is None:
                break

            pos, quat = parsed
            # 不在解析阶段应用 root_fix，保留原始数据
            current_track_data.append((Vector(pos), quat))


    if logger and max_raw_name:
        logger.debug(
            "最大原始float变化轨道: %s max_abs=%s max_diff=%s",
            max_raw_name,
            max_raw_abs,
            max_raw_diff,
        )
    return tracks_list


def get_original_bind_matrix(bone) -> Matrix:
    """
    Retrieve the original Bind Pose matrix from custom property if available.
    Otherwise return bone.matrix_local.
    """
    if "bind_pose_mat" in bone:
        try:
            # Reconstruct from flat list
            flat = bone["bind_pose_mat"]
            if len(flat) == 16:
                rows = [flat[i:i+4] for i in range(0, 16, 4)]
                return Matrix(rows)
        except Exception:
            pass
    return bone.matrix_local


from ..skel.utils import get_root_fix_matrix

def is_anim_global_pose(
    tracks: Dict[str, List[Transform]],
    armature_obj,
    logger=None
) -> bool:
    """Detect if the animation tracks are in Global space or Local space."""
    if not armature_obj or not armature_obj.data:
        return False

    bones = armature_obj.data.bones
    local_better = 0
    global_better = 0
    checked_count = 0
    
    # 获取 Root Fix Matrix
    root_fix = get_root_fix_matrix()
    root_fix_inv = root_fix.inverted()

    for bone_name, frames in tracks.items():
        if not frames:
            continue
        
        bone = bones.get(bone_name)
        if not bone or not bone.parent:
            continue

        # Use first frame for comparison
        raw_loc, raw_rot = frames[0]
        
        # Get Bind Pose (Rest Pose) in Blender Space
        global_bind_mat = get_original_bind_matrix(bone)
        global_bind_loc = global_bind_mat.to_translation()
        global_bind_rot = global_bind_mat.to_quaternion()

        # 1. Hypothesis: Global Space
        # Raw Data is Global Game Space -> Convert to Blender Space
        global_hyp_loc = apply_root_fix_to_location(root_fix, raw_loc)
        global_hyp_rot = apply_root_fix_to_rotation(root_fix, root_fix_inv, raw_rot)
        
        d_global = (global_hyp_loc - global_bind_loc).length
        a_global = global_hyp_rot.rotation_difference(global_bind_rot).angle

        # 2. Hypothesis: Local Space
        # Raw Data is Local Space (relative to parent)
        # Must apply Root Fix to Local Transform as well (Conjugation)
        # L' = R @ L @ R^-1
        parent_global_mat = get_original_bind_matrix(bone.parent)
        
        local_hyp_loc = apply_root_fix_to_location(root_fix, raw_loc)
        local_hyp_rot = apply_root_fix_to_rotation(root_fix, root_fix_inv, raw_rot)
        
        mat_local_bl = local_hyp_rot.to_matrix().to_4x4()
        mat_local_bl.translation = local_hyp_loc
        
        local_hyp_mat = parent_global_mat @ mat_local_bl
        local_hyp_loc_world = local_hyp_mat.to_translation()
        local_hyp_rot_world = local_hyp_mat.to_quaternion()
        
        d_local = (local_hyp_loc_world - global_bind_loc).length
        a_local = local_hyp_rot_world.rotation_difference(global_bind_rot).angle

        # Score: Lower is better (closer to Bind Pose)
        score_global = d_global + a_global
        score_local = d_local + a_local

        if score_local < score_global:
            local_better += 1
        else:
            global_better += 1
        checked_count += 1

    result = global_better > local_better
    if logger:
        logger.debug("Anim Type Detection: Checked=%d, GlobalBetter=%d, LocalBetter=%d, Result=%s", 
                     checked_count, global_better, local_better, "GLOBAL" if result else "LOCAL")
    return result


def convert_tracks_to_pose_basis(
    tracks: Dict[str, List[Transform]],
    armature_obj,
    ignore_translation: bool = False,
    logger=None,
) -> Dict[str, List[Transform]]:
    if not armature_obj or not armature_obj.data:
        return tracks
    
    bones = armature_obj.data.bones
    
    # 获取 Root Fix Matrix
    root_fix = get_root_fix_matrix()
    root_fix_inv = root_fix.inverted()
    
    # 1. Detect Animation Type
    is_global = is_anim_global_pose(tracks, armature_obj, logger)

    
    # 2. Sort bones by hierarchy (parents first)
    sorted_bones = []
    visited = set()
    
    def visit(b):
        if b.name in visited:
            return
        if b.parent:
            visit(b.parent)
        sorted_bones.append(b)
        visited.add(b.name)

    for bone in bones:
        visit(bone)

    # 3. Process tracks
    result: Dict[str, List[Transform]] = {}
    
    # We need to know the max frames to iterate frame by frame
    max_frames = 0
    for frames in tracks.values():
        max_frames = max(max_frames, len(frames))

    # Pre-calculate Original Bind Globals for calculating Truth
    original_bind_globals = {b.name: get_original_bind_matrix(b) for b in bones}
    bone_parents = {b.name: b.parent.name if b.parent else None for b in bones}
    
    # Pre-calculate Rest Relative Matrices for Blender Bones (The Target Structure)
    # Basis = Rest_Relative^-1 * Local_Transform
    # 使用 original_bind_globals 保持一致性
    bone_blender_rest_relatives = {}
    for b in bones:
        parent_name = bone_parents[b.name]
        if parent_name:
            p_rest = original_bind_globals[parent_name]
            c_rest = original_bind_globals[b.name]
            bone_blender_rest_relatives[b.name] = p_rest.inverted() @ c_rest
        else:
            bone_blender_rest_relatives[b.name] = original_bind_globals[b.name]

    # Initialize result lists
    for name in tracks:
        result[name] = []

    for frame_idx in range(max_frames):
        # Cache for current frame global matrices
        # This stores the "Truth" Global Matrix for the frame
        current_frame_globals = {}

        for i, bone in enumerate(sorted_bones):
            name = bone.name
            
            # Get raw track data for this frame
            raw_transform = None
            if name in tracks and frame_idx < len(tracks[name]):
                raw_transform = tracks[name][frame_idx]
            
            # Calculate Global Matrix for this bone (The Truth)
            mat_global = None
            
            if is_global:
                if raw_transform:
                    loc, rot = raw_transform
                    # Global: Apply Root Fix to convert Game Global -> Blender Global
                    loc_bl = apply_root_fix_to_location(root_fix, loc)
                    rot_bl = apply_root_fix_to_rotation(root_fix, root_fix_inv, rot)
                    
                    mat_global = rot_bl.to_matrix().to_4x4()
                    mat_global.translation = loc_bl
                else:
                    # Fallback to Original Bind Pose Global
                    mat_global = original_bind_globals[name]
            else:
                # Local Space (Parent Relative)
                parent_name = bone_parents[name]
                
                # Get Parent Global (Truth)
                parent_global = current_frame_globals.get(parent_name, original_bind_globals.get(parent_name, Matrix()))
                
                if raw_transform:
                    loc, rot = raw_transform
                    # Local: Apply Root Fix to convert Game Local -> Blender Local
                    # L' = R @ L @ R^-1 (Conjugation)
                    loc_bl = apply_root_fix_to_location(root_fix, loc)
                    rot_bl = apply_root_fix_to_rotation(root_fix, root_fix_inv, rot)
                    
                    mat_local_bl = rot_bl.to_matrix().to_4x4()
                    mat_local_bl.translation = loc_bl
                    
                    # Global = Parent @ Local
                    mat_global = parent_global @ mat_local_bl
                else:
                    # No track -> Use Original Bind Pose Global
                    # FIX: If parent has moved, Child should follow Parent in Rest Pose Relative relationship
                    if parent_name:
                         # Global = Parent_Current_Global @ Rest_Relative
                         mat_global = parent_global @ bone_blender_rest_relatives[name]
                    else:
                         mat_global = original_bind_globals[name]

            # Store Truth
            current_frame_globals[name] = mat_global

            # Debug log for Root bone frame 0
            if frame_idx == 0 and i == 0 and logger:
                 logger.debug("Bone %s Frame 0:", name)
                 logger.debug("  Raw: %s", raw_transform)
                 logger.debug("  Mat Global (Blender): %s", mat_global)

            # If we have a track to output (or if we want to force keyframes?), 
            # currently we only output if input has track.
            if raw_transform is not None:
                # Convert Truth Global -> Blender Basis
                
                # 1. Convert to Blender Local (relative to Blender Parent Pose)
                # Note: We need the Parent's "Truth" Pose again
                parent_name = bone_parents[name]
                if parent_name:
                    parent_global = current_frame_globals.get(parent_name, original_bind_globals.get(parent_name, Matrix()))
                    # Blender Local = Parent_Global_Truth^-1 @ Global_Truth
                    mat_local_bl = parent_global.inverted() @ mat_global
                else:
                    # Root
                    mat_local_bl = mat_global
                
                # 2. Convert Blender Local -> Blender Basis
                # Basis = Blender_Rest_Relative^-1 @ Blender_Local
                rest_rel = bone_blender_rest_relatives[name]

                # ---------------------------------------------------------------------
                # Fix for "Separation" issues (Floating Limbs)
                # If ignore_translation is True, we force the Local Translation to match 
                # the Rest Pose Relative Translation. This ensures bones stay connected.
                # We typically only apply this to non-root bones.
                # ---------------------------------------------------------------------
                if ignore_translation and parent_name:
                     # Force translation to match Rest Pose (relative to parent)
                     mat_local_bl.translation = rest_rel.translation

                mat_basis = rest_rel.inverted() @ mat_local_bl

                if frame_idx == 0 and i == 0 and logger:
                    logger.debug("  Parent Global: %s", parent_global if parent_name else "Identity")
                    logger.debug("  Mat Local (Blender): %s", mat_local_bl)
                    logger.debug("  Rest Relative: %s", rest_rel)
                    logger.debug("  Mat Basis (Result): %s", mat_basis)
                
                result[name].append((mat_basis.to_translation(), mat_basis.to_quaternion()))

    if logger:
        logger.debug("已将 %s 条轨道转换为 pose basis 空间 (Mode: %s, IgnoreTrans: %s)", len(result), "GLOBAL" if is_global else "LOCAL", ignore_translation)
    return result


def write_transforms_to_action(action, data_path_loc: str, data_path_rot: str, transforms: List[Transform]) -> None:
    count = len(transforms)
    if count == 0:
        log.warning("write_transforms_to_action: transforms 为空")
        return
    
    fc_lx = get_or_create_fcurve(action, data_path_loc, 0)
    fc_ly = get_or_create_fcurve(action, data_path_loc, 1)
    fc_lz = get_or_create_fcurve(action, data_path_loc, 2)
    fc_rw = get_or_create_fcurve(action, data_path_rot, 0)
    fc_rx = get_or_create_fcurve(action, data_path_rot, 1)
    fc_ry = get_or_create_fcurve(action, data_path_rot, 2)
    fc_rz = get_or_create_fcurve(action, data_path_rot, 3)

    for fc in (fc_lx, fc_ly, fc_lz, fc_rw, fc_rx, fc_ry, fc_rz):
        fc.keyframe_points.clear()
        fc.keyframe_points.add(count)

    for i, (loc, rot) in enumerate(transforms):
        frame_num = i + 1
        fc_lx.keyframe_points[i].co = (frame_num, float(loc.x))
        fc_ly.keyframe_points[i].co = (frame_num, float(loc.y))
        fc_lz.keyframe_points[i].co = (frame_num, float(loc.z))
        fc_rw.keyframe_points[i].co = (frame_num, float(rot.w))
        fc_rx.keyframe_points[i].co = (frame_num, float(rot.x))
        fc_ry.keyframe_points[i].co = (frame_num, float(rot.y))
        fc_rz.keyframe_points[i].co = (frame_num, float(rot.z))

    for fc in (fc_lx, fc_ly, fc_lz, fc_rw, fc_rx, fc_ry, fc_rz):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
        fc.update()
    
    log.debug("写入 FCurves: %s, %d 帧, action.fcurves 数量: %d", data_path_loc, count, len(action.fcurves))


def get_or_create_channelbag(action, slot) -> "bpy.types.ActionChannelbag | None":
    """
    获取或创建 Action 的 ChannelBag（用于 Blender 5.0+ Slotted Actions）
    
    Blender 5.0 结构: Action -> Layer -> Strip -> ChannelBag -> FCurves
    """
    if not action or not slot:
        return None
    
    # 检查是否已有 ChannelBag
    if hasattr(action, 'layers'):
        for layer in action.layers:
            if hasattr(layer, 'strips'):
                for strip in layer.strips:
                    cb = strip.channelbag(slot)
                    if cb:
                        return cb
        
        # 没有 ChannelBag，需要创建
        # 确保有 Layer
        try:
            layer = action.layers[0]
        except IndexError:
            layer = action.layers.new("Layer")
        
        # 确保有 Strip
        try:
            strip = layer.strips[0]
        except IndexError:
            strip = layer.strips.new(type='KEYFRAME')
        
        # 创建 ChannelBag
        if hasattr(strip, 'channelbag'):
            return strip.channelbag(slot, ensure=True)
    
    return None


def write_transforms_via_keyframe_insert(obj, bone_name: str, transforms: List[Transform], action=None, slot=None) -> None:
    """
    使用 keyframe_insert API 写入动画数据。
    
    在 Blender 5.0 Slotted Actions 模式下，需要传递 slot 参数。
    """
    pose_bone = obj.pose.bones.get(bone_name)
    if not pose_bone:
        log.warning("未找到骨骼: %s", bone_name)
        return
    
    if not transforms:
        log.warning("transforms 为空: %s", bone_name)
        return

    # Ensure rotation mode is QUATERNION
    if pose_bone.rotation_mode != 'QUATERNION':
        pose_bone.rotation_mode = 'QUATERNION'

    # 检查是否有活动的 Action
    if not obj.animation_data or not obj.animation_data.action:
        log.warning("骨架没有活动 Action")
        return

    # Blender 5.0+ Slotted Actions: 直接操作 channelbag.fcurves
    if slot and hasattr(action, 'layers'):
        channelbag = get_or_create_channelbag(action, slot)
        if channelbag:
            write_transforms_to_channelbag(channelbag, pose_bone, transforms)
            return
        # 如果获取 channelbag 失败，回退到 keyframe_insert
        log.warning("无法获取 ChannelBag，回退到 keyframe_insert")

    # 传统模式：使用 keyframe_insert
    for i, (loc, rot) in enumerate(transforms):
        frame_num = i + 1
        pose_bone.location = loc
        pose_bone.rotation_quaternion = rot
        pose_bone.keyframe_insert(data_path="location", frame=frame_num)
        pose_bone.keyframe_insert(data_path="rotation_quaternion", frame=frame_num)
    
    log.debug("为骨骼 %s 设置了 %d 帧动画", bone_name, len(transforms))


def write_transforms_to_channelbag(channelbag, pose_bone, transforms: List[Transform]) -> None:
    """
    直接写入 FCurves 到 ChannelBag（Blender 5.0+ Slotted Actions）
    
    这是参考 Blender 官方 anim_utils.py 中的实现方式。
    """
    bone_name = pose_bone.name
    count = len(transforms)
    if count == 0:
        return
    
    # 构建 data_path
    # pose.bones["bone_name"].location
    # pose.bones["bone_name"].rotation_quaternion
    import bpy
    data_path_loc = f'pose.bones["{bpy.utils.escape_identifier(bone_name)}"].location'
    data_path_rot = f'pose.bones["{bpy.utils.escape_identifier(bone_name)}"].rotation_quaternion'
    
    # 获取或创建 FCurves
    fcurves = channelbag.fcurves
    
    # Location: x, y, z (indices 0, 1, 2)
    fc_lx = fcurves.find(data_path_loc, index=0)
    fc_ly = fcurves.find(data_path_loc, index=1)
    fc_lz = fcurves.find(data_path_loc, index=2)
    
    if fc_lx is None:
        fc_lx = fcurves.new(data_path=data_path_loc, index=0, group_name=bone_name)
    if fc_ly is None:
        fc_ly = fcurves.new(data_path=data_path_loc, index=1, group_name=bone_name)
    if fc_lz is None:
        fc_lz = fcurves.new(data_path=data_path_loc, index=2, group_name=bone_name)
    
    # Rotation: w, x, y, z (indices 0, 1, 2, 3)
    fc_rw = fcurves.find(data_path_rot, index=0)
    fc_rx = fcurves.find(data_path_rot, index=1)
    fc_ry = fcurves.find(data_path_rot, index=2)
    fc_rz = fcurves.find(data_path_rot, index=3)
    
    if fc_rw is None:
        fc_rw = fcurves.new(data_path=data_path_rot, index=0, group_name=bone_name)
    if fc_rx is None:
        fc_rx = fcurves.new(data_path=data_path_rot, index=1, group_name=bone_name)
    if fc_ry is None:
        fc_ry = fcurves.new(data_path=data_path_rot, index=2, group_name=bone_name)
    if fc_rz is None:
        fc_rz = fcurves.new(data_path=data_path_rot, index=3, group_name=bone_name)
    
    # 清空并添加关键帧点
    for fc in (fc_lx, fc_ly, fc_lz, fc_rw, fc_rx, fc_ry, fc_rz):
        fc.keyframe_points.clear()
        fc.keyframe_points.add(count)
    
    # 填充关键帧数据
    for i, (loc, rot) in enumerate(transforms):
        frame_num = i + 1
        fc_lx.keyframe_points[i].co = (frame_num, float(loc.x))
        fc_ly.keyframe_points[i].co = (frame_num, float(loc.y))
        fc_lz.keyframe_points[i].co = (frame_num, float(loc.z))
        fc_rw.keyframe_points[i].co = (frame_num, float(rot.w))
        fc_rx.keyframe_points[i].co = (frame_num, float(rot.x))
        fc_ry.keyframe_points[i].co = (frame_num, float(rot.y))
        fc_rz.keyframe_points[i].co = (frame_num, float(rot.z))
    
    # 设置插值并更新
    for fc in (fc_lx, fc_ly, fc_lz, fc_rw, fc_rx, fc_ry, fc_rz):
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
        fc.update()
    
    log.debug("为骨骼 %s 写入 %d 帧到 ChannelBag (fcurves 数量: %d)", bone_name, count, len(fcurves))
