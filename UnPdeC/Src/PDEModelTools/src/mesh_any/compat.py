"""
Blender 4.5 - 5.1 兼容性层

处理 API 差异，确保代码在各版本正常工作。
遵循 Blender 扩展开发最佳实践。

使用方法:
    from .compat import (
        get_blender_version,
        get_specular_input_name,
        set_mesh_normals,
        add_smooth_by_angle_modifier,
    )
"""

import bpy
from typing import Optional, List, Tuple

# 模块日志
from ..log import get_module_logger

log = get_module_logger("COMPAT")


# =============================================================================
# 版本检测
# =============================================================================

def get_blender_version() -> Tuple[int, int, int]:
    """
    获取 Blender 版本号
    
    Returns:
        版本元组，如 (4, 5, 0) 或 (5, 1, 1)
    """
    return bpy.app.version


def get_blender_version_string() -> str:
    """
    获取 Blender 版本字符串
    
    Returns:
        版本字符串，如 "4.5.0"
    """
    return f"{bpy.app.version[0]}.{bpy.app.version[1]}.{bpy.app.version[2]}"


def is_blender_45_or_later() -> bool:
    """检查是否为 Blender 4.5 或更高版本"""
    return bpy.app.version >= (4, 5, 0)


def is_blender_50_or_later() -> bool:
    """检查是否为 Blender 5.0 或更高版本"""
    return bpy.app.version >= (5, 0, 0)


def has_auto_smooth() -> bool:
    """
    检查是否支持 use_auto_smooth
    
    Note:
        Blender 4.1 移除了 mesh.use_auto_smooth 属性，
        改为使用 "Smooth by Angle" 几何节点修改器。
    """
    return bpy.app.version < (4, 1, 0)


# =============================================================================
# 材质 API 兼容
# =============================================================================

def get_specular_input_name() -> str:
    """
    获取 Principled BSDF 的 Specular 输入名称
    
    Note:
        Blender 4.0 将 "Specular" 重命名为 "Specular IOR Level"
    
    Returns:
        输入名称字符串
    """
    return "Specular IOR Level" if bpy.app.version >= (4, 0, 0) else "Specular"


def get_roughness_input_name() -> str:
    """
    获取 Principled BSDF 的 Roughness 输入名称
    
    Note:
        Roughness 输入名称在各版本保持一致，此函数用于统一接口
    
    Returns:
        输入名称字符串
    """
    return "Roughness"


def create_bsdf_node(nodes, location: Tuple[int, int] = (0, 0)) -> bpy.types.Node:
    """
    创建 Principled BSDF 节点
    
    Args:
        nodes: 节点树
        location: 节点位置
    
    Returns:
        BSDF 节点实例
    """
    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = location
    bsdf.name = "Principled BSDF"
    
    # Blender 4.0+ 默认 IOR 更符合物理
    # 设置为 1.0 表示无折射（空气）
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = 1.0
    
    return bsdf


def get_material_blend_method_enum() -> List[str]:
    """
    获取支持的材质混合方法
    
    Returns:
        混合方法列表
    """
    # Blender 4.5+ 支持的混合方法
    return ['OPAQUE', 'BLEND', 'CLIP', 'HASHED']


# =============================================================================
# 网格 API 兼容
# =============================================================================

def set_mesh_normals(mesh: bpy.types.Mesh, normals: List[Tuple[float, float, float]]) -> bool:
    """
    跨版本设置网格自定义法线
    
    Args:
        mesh: 目标网格
        normals: 法线列表，每个元素为 (x, y, z) 元组
    
    Returns:
        是否设置成功
    """
    if not normals or len(normals) != len(mesh.vertices):
        log.warning(f"法线数量({len(normals)})与顶点数量({len(mesh.vertices)})不匹配")
        return False
    
    try:
        # Blender 2.82+ 推荐方法
        mesh.normals_split_custom_set_from_vertices(normals)
        return True
    except (AttributeError, RuntimeError) as e:
        log.debug(f"使用备选法线设置方法: {e}")
        try:
            # 备选方法：直接设置顶点法线
            for i, n in enumerate(normals):
                if i < len(mesh.vertices):
                    mesh.vertices[i].normal = n
            return True
        except Exception as e2:
            log.error(f"法线设置失败: {e2}")
            return False


def add_smooth_by_angle_modifier(
    obj: bpy.types.Object, 
    angle_deg: float = 30.0
) -> Optional[bpy.types.Modifier]:
    """
    添加平滑法线效果
    
    Note:
        Blender 4.1+ 使用几何节点修改器替代 auto_smooth
        
    Args:
        obj: 目标对象
        angle_deg: 平滑角度（度）
    
    Returns:
        创建的修改器（如果有）
    """
    mesh = obj.data
    
    # Blender 4.1+ 使用新的平滑方式
    if bpy.app.version >= (4, 1, 0):
        # 方法1：尝试使用内置操作符
        try:
            # 保存当前选择状态
            was_selected = obj.select_get()
            was_active = bpy.context.view_layer.objects.active == obj
            
            # 选择对象
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            
            # 应用平滑
            bpy.ops.object.shade_smooth_by_angle(angle=angle_deg)
            
            # 恢复选择状态
            if not was_selected:
                obj.select_set(False)
            
            log.debug(f"已为 {obj.name} 应用 Smooth by Angle ({angle_deg}°)")
            return None
            
        except (AttributeError, RuntimeError) as e:
            log.debug(f"Smooth by Angle 操作符不可用: {e}")
    
    # 旧版本：使用 auto_smooth 属性
    if hasattr(mesh, 'use_auto_smooth'):
        mesh.use_auto_smooth = True
        mesh.auto_smooth_angle = angle_deg
        log.debug(f"已启用 auto_smooth ({angle_deg}°)")
    
    return None


def ensure_uv_layer(mesh: bpy.types.Mesh, name: str = "UVMap") -> bpy.types.MeshUVLoopLayer:
    """
    确保 UV 图层存在
    
    Args:
        mesh: 目标网格
        name: UV 图层名称
    
    Returns:
        UV 图层实例
    """
    if mesh.uv_layers:
        return mesh.uv_layers[0]
    
    return mesh.uv_layers.new(name=name)


# =============================================================================
# 批量数据操作 (foreach_set/get)
# =============================================================================

def set_vertices_batch(
    mesh: bpy.types.Mesh, 
    vertices: List[Tuple[float, float, float]]
) -> bool:
    """
    批量设置顶点坐标
    
    使用 foreach_set 实现，比循环快 10-50 倍
    
    Args:
        mesh: 目标网格
        vertices: 顶点坐标列表
    
    Returns:
        是否设置成功
    """
    if len(vertices) != len(mesh.vertices):
        log.warning(f"顶点数量不匹配: {len(vertices)} vs {len(mesh.vertices)}")
        return False
    
    # 扁平化顶点数组
    vertices_flat = [coord for v in vertices for coord in v]
    
    try:
        mesh.vertices.foreach_set("co", vertices_flat)
        return True
    except Exception as e:
        log.error(f"批量设置顶点失败: {e}")
        return False


def set_uv_batch(
    mesh: bpy.types.Mesh, 
    uvs: List[Tuple[float, float]],
    uv_layer_name: str = "UVMap"
) -> bool:
    """
    批量设置 UV 坐标
    
    使用 foreach_set 实现，比循环快 5-10 倍
    
    Args:
        mesh: 目标网格
        uvs: UV 坐标列表
        uv_layer_name: UV 图层名称
    
    Returns:
        是否设置成功
    """
    if not uvs:
        return False
    
    uv_layer = ensure_uv_layer(mesh, uv_layer_name)
    loop_count = len(mesh.loops)
    uv_count = len(uvs)
    
    # 构建扁平化 UV 数组
    uv_array = [0.0] * (loop_count * 2)
    
    for i, loop in enumerate(mesh.loops):
        vi = loop.vertex_index
        if vi < uv_count:
            uv_array[i * 2] = uvs[vi][0]
            uv_array[i * 2 + 1] = uvs[vi][1]
    
    try:
        uv_layer.data.foreach_set("uv", uv_array)
        return True
    except Exception as e:
        log.error(f"批量设置 UV 失败: {e}")
        return False


def get_vertices_batch(mesh: bpy.types.Mesh) -> List[Tuple[float, float, float]]:
    """
    批量获取顶点坐标
    
    使用 foreach_get 实现
    
    Args:
        mesh: 目标网格
    
    Returns:
        顶点坐标列表
    """
    vertex_count = len(mesh.vertices)
    coords_flat = [0.0] * (vertex_count * 3)
    
    mesh.vertices.foreach_get("co", coords_flat)
    
    # 重组为元组列表
    return [
        (coords_flat[i * 3], coords_flat[i * 3 + 1], coords_flat[i * 3 + 2])
        for i in range(vertex_count)
    ]


# =============================================================================
# 其他兼容性工具
# =============================================================================

def safe_register_class(cls) -> bool:
    """
    安全注册 Blender 类
    
    Args:
        cls: 要注册的类
    
    Returns:
        是否注册成功
    """
    try:
        bpy.utils.register_class(cls)
        return True
    except ValueError:
        # 类已注册
        return True
    except Exception as e:
        log.error(f"注册类失败 {cls.__name__}: {e}")
        return False


def safe_unregister_class(cls) -> bool:
    """
    安全注销 Blender 类
    
    Args:
        cls: 要注销的类
    
    Returns:
        是否注销成功
    """
    try:
        bpy.utils.unregister_class(cls)
        return True
    except RuntimeError:
        # 类未注册
        return True
    except Exception as e:
        log.error(f"注销类失败 {cls.__name__}: {e}")
        return False


# =============================================================================
# 模块信息
# =============================================================================

def log_version_info() -> None:
    """记录 Blender 版本信息"""
    version = get_blender_version()
    version_str = get_blender_version_string()
    
    log.info(f"Blender 版本: {version_str}")
    log.debug(f"版本元组: {version}")
    log.debug(f"支持 auto_smooth: {has_auto_smooth()}")
    log.debug(f"Specular 输入名: {get_specular_input_name()}")


# 初始化时记录版本信息
log_version_info()
