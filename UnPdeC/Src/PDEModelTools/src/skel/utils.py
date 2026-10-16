# skel\utils.py
import math
import struct

from mathutils import Vector, Matrix, Quaternion

from ..log import get_module_logger

log = get_module_logger("SKEL")


def validate_file(file):
    """验证文件是否是skel文件"""
    log.debug("> validate_file()")
    try:
        # 读取魔数
        magic = struct.unpack("<I", file.read(4))[0]
        # 返回魔数是否为0x600
        return magic == 0x600
    except Exception as e:
        log.debug("文件验证失败: %s", e)
        return False


def read_header_info(file):
    """读取文件头部信息，包括魔数和骨骼数量"""
    log.debug("> read_header_info()")
    try:
        # 骨骼数量
        bone_count = struct.unpack("<I", file.read(4))[0]
        log.debug("读到: 骨骼数量 %s", bone_count)
        if bone_count <= 0:
            log.debug("读取文件头部信息失败: 骨骼数量为0")
            return None

        # 虚拟骨骼 8字节  (FFFFFFFF 00000000)
        virtual_bone = struct.unpack("<2I", file.read(8))
        log.debug("读到: 虚拟骨骼: %s %s", hex(virtual_bone[0]), hex(virtual_bone[1]))
        if virtual_bone != (0xFFFFFFFF, 0x00000000):
            log.debug("读取文件头部信息失败: 虚拟骨骼0不是0xFFFFFFFF")
            return None

        # 减去虚拟骨骼
        return bone_count - 1
    except struct.error as e:
        log.debug("读取文件头部信息失败: %s", e)
        return None


def read_bone_info(file):
    """读取骨骼名称和层级"""
    # log.debug("> read_bone_info()")
    try:
        # 父级
        parent = struct.unpack("<i", file.read(4))[0]
        # log.debug("读到: 父级: %s", parent)
        
        # 骨骼名称长度
        name_length = struct.unpack("<I", file.read(4))[0]
        # log.debug("读到: 骨骼名称长度: %s", name_length)
        
        # 骨骼名称
        name = file.read(name_length).decode("utf-8", errors='replace').strip('\x00')

        if parent >= 0:
            parent -= 1
        log.debug("读到: 父级,骨骼名: %s %s", parent, name)

        # 返回骨骼名称和层级
        return {"parent": parent, "name": name}
    except struct.error as e:
        log.debug("读取骨骼信息失败: %s", e)
        return None


def read_bone_transform(file):
    """读取骨骼变换数据 (位置 + 四元数旋转)"""
    try:
        # 读取位置 (x, y, z)
        position = struct.unpack("<fff", file.read(12))
        # 读取四元数旋转 (qx, qy, qz, qw)
        rotation = struct.unpack("<ffff", file.read(16))
        # 缩放 (默认为1.0)
        scale = (1.0, 1.0, 1.0)
        
        # log.debug("位置: %s 旋转: %s 缩放: %s", position, rotation, scale)

        return {"position": position, "rotation": rotation, "scale": scale}
    except struct.error as e:
        log.debug("读取骨骼变换数据失败: %s", e)
        return None


def build_local_matrix(bone):
    transform = bone.get("transform")
    if not transform:
        return Matrix.Identity(4)
    pos = Vector(transform["position"])
    qx, qy, qz, qw = transform["rotation"]
    quat = Quaternion((qw, qx, qy, qz))
    scale = Vector(transform.get("scale", (1.0, 1.0, 1.0)))
    # Column-major: T @ R @ S matches原始代码的 S * R * T（row-major）
    return Matrix.LocRotScale(pos, quat, scale)


def build_bind_pose_matrices(bones):
    bone_count = len(bones)
    bind_pose = [None] * bone_count
    inv_bind_pose = [None] * bone_count
    for i in range(bone_count):
        local = build_local_matrix(bones[i])
        parent_idx = bones[i]["parent"]
        if parent_idx >= 0 and parent_idx < bone_count and bind_pose[parent_idx] is not None:
            bind_pose[i] = bind_pose[parent_idx] @ local
        else:
            bind_pose[i] = local
        inv_bind_pose[i] = bind_pose[i].inverted()
    return bind_pose, inv_bind_pose


def create_bone_chain(edit_bones, bones):
    """按照C#逻辑创建骨骼链"""
    if not bones:
        log.warning("没有骨骼数据，无法创建骨骼链")
        return

    bone_count = len(bones)
    bone_objects = [None] * bone_count
    bind_pose, inv_bind_pose = build_bind_pose_matrices(bones)
    root_fix = get_root_fix_matrix()
    root_fix_inv = root_fix.inverted()
    children = [[] for _ in range(bone_count)]
    for i in range(bone_count):
        parent_idx = bones[i]["parent"]
        if parent_idx >= 0 and parent_idx < bone_count:
            children[parent_idx].append(i)
    
    # 第一遍：创建所有骨骼
    # 过滤掉名字为空的骨骼，并建立索引映射
    valid_bones_indices = []
    old_to_new_index = {}
    
    for i in range(bone_count):
        bone_info = bones[i]
        bone_name = bone_info["name"]
        
        # C# SmdExporter 逻辑：忽略空名字的骨骼
        # 但为了保证动画导入时的层级链完整（特别是 Local 动画），我们不能跳过任何骨骼
        # 否则会导致 Local 动画计算时的父级引用错误，造成模型严重变形
        if not bone_name:
            # 给空名字骨骼一个自动生成的名称，确保它被创建
            bone_name = f"Bone_{i:03d}"
            bone_info["name"] = bone_name
            # log.debug("忽略空名字骨骼: 索引 %s", i)
            # continue
            
        if "transform" not in bone_info:
            log.warning("骨骼 %s 缺少变换数据，跳过", bone_name)
            continue
            
        old_to_new_index[i] = len(valid_bones_indices)
        valid_bones_indices.append(i)

    # 创建有效的 EditBones
    for i in valid_bones_indices:
        bone_info = bones[i]
        bone_name = bone_info["name"]
        
        bone = edit_bones.new(bone_name)
        bp = bind_pose[i]
        if bp is None:
            continue
        bp_bl = root_fix @ bp @ root_fix_inv
        bone.head = bp_bl.translation
        bone.tail = bone.head + Vector((0.0, 0.02, 0.0))
        
        # 存储原始逻辑 Bind Pose (用于动画重定向)
        # 展平矩阵为列表
        flat_bp = [e for v in bp_bl for e in v]
        bone["bind_pose_mat"] = flat_bp
        # 存储原始文件索引，用于动画导入时处理重名骨骼
        bone["pmt_file_index"] = i

        bone_objects[i] = bone # 注意：bone_objects 仍然使用原始索引，方便后续查找
        bone_info["bind_pose"] = bp
        bone_info["inverse_bind_pose"] = inv_bind_pose[i]
        bone_info["bind_pose_bl"] = bp_bl
        log.debug("创建骨骼: %s, 位置: %s", bone_name, bone.head)

    # 重建有效的父子关系树（针对 valid_bones）
    # 我们需要为 valid_bones 中的每个骨骼找到它的有效父骨骼（跳过空名字骨骼）
    valid_children = {i: [] for i in valid_bones_indices}
    
    for i in valid_bones_indices:
        bone_info = bones[i]
        
        # 寻找有效父骨骼 (GetEffectiveParentIndex)
        parent_idx = bone_info["parent"]
        effective_parent_idx = -1
        
        curr_p = parent_idx
        while curr_p >= 0 and curr_p < bone_count:
            if curr_p in old_to_new_index:
                effective_parent_idx = curr_p
                break
            # 如果当前父骨骼是无效的（空名字），继续向上找
            curr_p = bones[curr_p]["parent"]
            
        if effective_parent_idx >= 0:
            valid_children[effective_parent_idx].append(i)
            
            # 设置 Blender 父子关系
            if bone_objects[effective_parent_idx] and bone_objects[i]:
                bone_objects[i].parent = bone_objects[effective_parent_idx]
                bone_objects[i].use_connect = False

    # 第二遍：设置骨骼方向 (使用 valid_children)
    for i in valid_bones_indices:
        if bone_objects[i] is None:
            continue
            
        bone_info = bones[i]
        current_bone = bone_objects[i]
        parent_idx = bone_info["parent"] # 原始父级，用于Fallback


        # -------------------------------------------------------------------------
        # 核心逻辑修复：严格 Bind Pose 模式 (Strict Bind Pose)
        # 之前的"视觉连接"逻辑虽然好看，但改变了骨骼的轴向，导致动画数据（基于原始Bind Pose）
        # 应用后出现严重扭曲。
        # 现在必须强制骨骼的 Y 轴和 Roll 完全匹配文件中的 Bind Pose 矩阵。
        # 骨骼长度仅用于显示，不再强制连接到子骨骼。
        # -------------------------------------------------------------------------
        
        length = 0.05
        
        # 1. 计算视觉长度 (仅供显示，不影响方向)
        # 取所有子骨骼距离的平均值
        sum_len = 0.0
        valid_child_count = 0
        
        for child_idx in valid_children[i]:
            child_bone = bone_objects[child_idx]
            if child_bone is None:
                continue
            dist = (child_bone.head - current_bone.head).length
            if dist > 0.0001:
                sum_len += dist
                valid_child_count += 1
        
        if valid_child_count > 0:
            length = sum_len / valid_child_count
        
        # 2. 强制使用 Bind Pose 的方向
        bp_bl = bone_info.get("bind_pose_bl")
        if bp_bl:
            mat_rot = bp_bl.to_3x3()
            y_axis = mat_rot @ Vector((0.0, 1.0, 0.0))
            z_axis = mat_rot @ Vector((0.0, 0.0, 1.0))
            
            # 设置 Tail (Head + Y_Axis * Length)
            current_bone.tail = current_bone.head + y_axis * length
            
            # 设置 Roll (对齐 Z 轴)
            try:
                current_bone.align_roll(z_axis)
            except:
                # 备用方案：对齐 X 轴
                x_axis = mat_rot @ Vector((1.0, 0.0, 0.0))
                # Z = X cross Y
                new_z = x_axis.cross(y_axis)
                current_bone.align_roll(new_z)
        else:
            # 如果没有 Bind Pose (理论上不应该发生)，回退到默认
            current_bone.tail = current_bone.head + Vector((0.0, length, 0.0))



    # 统计结果
    created_count = len([b for b in bone_objects if b is not None])
    log.info("成功创建了 %s/%s 根骨骼", created_count, bone_count)





# def convert_coordinates(coords):
#     x, y, z = coords
#     return x, -z, y


def get_root_fix_matrix():
    m = Matrix.Identity(4)
    m[0][0], m[0][1], m[0][2] = 1.0, 0.0, 0.0
    m[1][0], m[1][1], m[1][2] = 0.0, 0.0, -1.0
    m[2][0], m[2][1], m[2][2] = 0.0, 1.0, 0.0
    return m



# def calculate_bone_roll(bone):
#     """计算骨骼的roll角度"""
#     if "arm" in bone.name.lower():
#         return math.radians(90)
#     elif "leg" in bone.name.lower():
#         return math.radians(-90)
#     elif "hand" in bone.name.lower():
#         return math.radians(180)
#     return 0


def add_bone_constraints(armature_obj):
    """添加骨骼约束"""
    pose = armature_obj.pose

    # 添加IK约束
    for bone_name in pose.bones:
        if "IK" in bone_name:
            target_name = bone_name.replace("IK", "")
            if target_name in pose.bones:
                constraint = pose.bones[target_name].constraints.new("IK")
                constraint.target = armature_obj
                constraint.subtarget = bone_name
