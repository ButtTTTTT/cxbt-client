"""
材质处理模块

提供 PBR 材质创建、贴图加载等功能。
使用 Blender 4.5+ 的节点系统实现。

遵循原则：
- 单个文件不超过 500 行
- 使用 Blender 原生 API，无外部依赖
- 通过 compat.py 处理版本兼容性
"""

import bpy
import os
from typing import Set, Optional, Dict, Any

from ..log import get_module_logger
from .compat import (
    get_specular_input_name,
    create_bsdf_node,
)

log = get_module_logger("MAT")

# =============================================================================
# 常量定义
# =============================================================================

# 节点名称
COLORMAP_NODE_NAME = "Colormap"
SPECULARMAP_NODE_NAME = "SpecularMap"
ROUGHNESSMAP_NODE_NAME = "RoughnessMap"
BSDF_NODE_NAME = "Principled BSDF"

# Alpha 模式
ALPHA_MODE_CHANNEL_PACKED = "CHANNEL_PACKED"


# =============================================================================
# 材质创建
# =============================================================================

def create_pbr_material(
    material_name: str,
    color_map_path: str,
    mesh_type: str = "Unset",
    specular_map_path: str = "",
    roughness_map_path: str = "",
) -> Optional[bpy.types.Material]:
    """
    创建基于物理渲染(PBR)的材质
    
    使用 Blender 4.5 的节点系统创建完整的 PBR 材质。
    
    Args:
        material_name: 材质名称
        color_map_path: 颜色贴图文件路径
        mesh_type: 网格类型（用于日志和特殊处理）
        specular_map_path: 镜面反射贴图路径
        roughness_map_path: 粗糙度贴图路径
    
    Returns:
        创建的材质对象，失败返回 None
    """
    # 创建材质
    material = bpy.data.materials.new(name=material_name)
    material.use_nodes = True
    
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    
    # 清理默认节点
    nodes.clear()
    
    # 创建 BSDF 节点
    bsdf = create_bsdf_node(nodes, location=(0, 0))
    
    # 创建输出节点
    output = nodes.new(type="ShaderNodeOutputMaterial")
    output.location = (300, 0)
    links.new(output.inputs["Surface"], bsdf.outputs["BSDF"])
    
    # 创建并连接贴图节点
    _setup_color_map(nodes, links, bsdf, color_map_path, material, mesh_type)
    _setup_specular_map(nodes, links, bsdf, specular_map_path)
    _setup_roughness_map(nodes, links, bsdf, roughness_map_path)
    
    log.debug(f"已创建 PBR 材质: {material_name}")
    return material


def _setup_color_map(
    nodes, 
    links, 
    bsdf, 
    color_map_path: str,
    material: bpy.types.Material,
    mesh_type: str
) -> None:
    """设置颜色贴图"""
    if not color_map_path or not os.path.exists(color_map_path):
        if color_map_path:
            log.debug(f"颜色贴图文件不存在: {color_map_path}")
        return
    
    # 创建贴图节点
    color_node = nodes.new(type="ShaderNodeTexImage")
    color_node.name = COLORMAP_NODE_NAME
    color_node.location = (-600, 300)
    
    # 加载贴图
    color_node.image = bpy.data.images.load(color_map_path, check_existing=True)
    color_node.image.alpha_mode = ALPHA_MODE_CHANNEL_PACKED
    
    # 连接到基础颜色
    links.new(bsdf.inputs["Base Color"], color_node.outputs["Color"])
    
    # 处理 Alpha 通道
    if color_node.image.depth == 32:
        _setup_alpha_blending(material, bsdf, color_node, links, mesh_type)
    
    log.debug(f"已加载颜色贴图: {os.path.basename(color_map_path)}")


def _setup_alpha_blending(
    material: bpy.types.Material,
    bsdf,
    color_node,
    links,
    mesh_type: str
) -> None:
    """设置透明度混合"""
    # 默认不透明
    material.blend_method = 'OPAQUE'
    
    # 仅在明确需要透明时启用
    # 可以根据 mesh_type 或贴图名称判断
    if mesh_type == "Prop":
        # 检查贴图名称是否包含透明关键词
        if color_node.image and color_node.image.name:
            name = color_node.image.name.lower()
            if any(kw in name for kw in ["透明", "alpha", "trans", "glass"]):
                material.blend_method = 'BLEND'
                
                # Blender 4.5+ 使用 surface_render_method
                if hasattr(material, 'surface_render_method'):
                    material.surface_render_method = 'BLENDED'
                
                # 连接 Alpha
                links.new(bsdf.inputs["Alpha"], color_node.outputs["Alpha"])
                
                log.debug("已启用透明度混合")


def _setup_specular_map(nodes, links, bsdf, specular_map_path: str) -> None:
    """设置镜面反射贴图"""
    if not specular_map_path or not os.path.exists(specular_map_path):
        return
    
    spec_node = nodes.new(type="ShaderNodeTexImage")
    spec_node.name = SPECULARMAP_NODE_NAME
    spec_node.location = (-600, 0)
    
    spec_node.image = bpy.data.images.load(specular_map_path, check_existing=True)
    spec_node.image.alpha_mode = 'NONE'
    
    # 使用 compat 层获取正确的输入名称
    spec_input = get_specular_input_name()
    
    if spec_input in bsdf.inputs:
        links.new(bsdf.inputs[spec_input], spec_node.outputs["Color"])
        log.debug(f"已加载镜面反射贴图")
    else:
        log.warning(f"BSDF 缺少 {spec_input} 输入")


def _setup_roughness_map(nodes, links, bsdf, roughness_map_path: str) -> None:
    """设置粗糙度贴图"""
    if not roughness_map_path or not os.path.exists(roughness_map_path):
        return
    
    roughness_node = nodes.new(type="ShaderNodeTexImage")
    roughness_node.name = ROUGHNESSMAP_NODE_NAME
    roughness_node.location = (-600, -300)
    
    roughness_node.image = bpy.data.images.load(roughness_map_path, check_existing=True)
    roughness_node.image.alpha_mode = 'NONE'
    
    if "Roughness" in bsdf.inputs:
        links.new(bsdf.inputs["Roughness"], roughness_node.outputs["Color"])
        log.debug("已加载粗糙度贴图")


# =============================================================================
# 材质分配
# =============================================================================

def setup_material(
    target_object: bpy.types.Object,
    color_map_info: Dict[str, Any],
    resource_dir: str,
    processed_materials: Set[str],
    mesh_type: str = "Unset",
) -> bool:
    """
    为对象设置材质（处理路径标准化）
    
    Args:
        target_object: 目标对象
        color_map_info: 贴图信息字典
        resource_dir: 资源根目录
        processed_materials: 已处理的材质集合
        mesh_type: 网格类型
    
    Returns:
        是否设置成功
    """
    if not color_map_info:
        return False
    
    # 提取贴图信息
    color_map = _extract_color_map_info(color_map_info)
    
    if not color_map.get("name"):
        log.debug("无有效贴图名称")
        return False
    
    # 构建完整路径
    full_color_path = _build_full_path(color_map["path"], resource_dir)
    full_specular_path = _build_full_path(
        color_map.get("specular_path", ""), resource_dir
    )
    full_roughness_path = _build_full_path(
        color_map.get("roughness_path", ""), resource_dir
    )
    
    # 创建或复用材质
    material_identifier = f"{color_map['name']}_{mesh_type}"
    
    if material_identifier in processed_materials:
        # 复用现有材质
        if color_map["name"] in bpy.data.materials:
            material = bpy.data.materials[color_map["name"]]
            _assign_material(target_object, material)
            return True
    
    # 创建新材质
    material = create_pbr_material(
        color_map["name"],
        full_color_path,
        mesh_type,
        full_specular_path,
        full_roughness_path,
    )
    
    if material:
        processed_materials.add(material_identifier)
        _assign_material(target_object, material)
        return True
    
    return False


def _extract_color_map_info(color_map_info: Dict[str, Any]) -> Dict[str, str]:
    """从不同格式的贴图信息中提取数据"""
    result = {
        "name": "",
        "path": "",
        "specular_path": "",
        "roughness_path": "",
    }
    
    # 格式1: CW 类型 - 包含 colormap/srmap/drmap
    if "colormap" in color_map_info:
        colormap = color_map_info["colormap"]
        if isinstance(colormap, dict):
            result["name"] = colormap.get("name", "")
            result["path"] = colormap.get("path", "")
        
        srmap = color_map_info.get("srmap", {})
        drmap = color_map_info.get("drmap", {})
        
        if isinstance(srmap, dict):
            result["specular_path"] = srmap.get("path", "")
        if isinstance(drmap, dict):
            result["roughness_path"] = drmap.get("path", "")
    
    # 格式2: 直接包含 name/path
    elif "name" in color_map_info:
        result["name"] = color_map_info.get("name", "")
        result["path"] = color_map_info.get("path", "")
    
    return result


def _build_full_path(relative_path: str, resource_dir: str) -> str:
    """构建完整贴图路径"""
    if not relative_path or not resource_dir:
        return ""
    
    # 标准化路径
    normalized = relative_path.lstrip("/").replace("/", os.sep)
    normalized = os.path.normpath(normalized)
    
    return os.path.join(resource_dir, normalized)


def _assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    """将材质分配给对象"""
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)
    
    log.debug(f"已为对象 {obj.name} 分配材质: {material.name}")


# =============================================================================
# 网格对象创建（整合几何和材质）
# =============================================================================

def create_mesh_object(
    context: bpy.types.Context,
    mesh_data: Dict[str, Any],
    base_name: str,
    object_index: int,
    processed_materials: Set[str],
    resource_dir: str,
    mesh_type: str = "Unset",
    bone_names: Optional[list] = None,
) -> Optional[bpy.types.Object]:
    """
    从网格数据创建完整的网格对象
    
    整合几何构建、材质设置、骨骼绑定等完整流程。
    
    Args:
        context: Blender 上下文
        mesh_data: 网格数据字典
        base_name: 基础名称
        object_index: 对象索引
        processed_materials: 已处理材质集合
        resource_dir: 资源目录
        mesh_type: 网格类型
        bone_names: 骨骼名称列表（用于顶点组命名）
    
    Returns:
        创建的网格对象
    """
    from .geometry import (
        build_mesh_geometry,
        transform_mesh_data,
        create_vertex_groups,
        find_best_armature,
        bind_mesh_to_armature,
        apply_standard_transform,
    )
    
    try:
        # 验证数据
        if not mesh_data:
            raise ValueError("网格数据为空")
        
        required_keys = ["vertex_data", "faces_data", "uvs", "colormap"]
        for key in required_keys:
            if key not in mesh_data:
                raise ValueError(f"缺少必要字段: {key}")
        
        if not mesh_data["vertex_data"] or not mesh_data["faces_data"]:
            raise ValueError("顶点数据或面数据为空")
        
        # 转换坐标系
        transform_mesh_data(mesh_data)
        
        # 创建对象名称
        object_name = f"{base_name}_{object_index}"
        
        # 创建网格数据和对象
        mesh = bpy.data.meshes.new(object_name)
        obj = bpy.data.objects.new(object_name, mesh)
        
        # 构建几何
        build_mesh_geometry(mesh, mesh_data)
        
        # 应用变换
        apply_standard_transform(obj)
        
        # 链接到场景
        context.collection.objects.link(obj)
        
        # 设置材质
        setup_material(
            obj,
            mesh_data["colormap"],
            resource_dir,
            processed_materials,
            mesh_type,
        )
        
        # 为 CW 类型创建顶点组
        if mesh_type == "CW":
            if mesh_data.get("bone_indices") and mesh_data.get("bone_weights"):
                create_vertex_groups(
                    obj,
                    mesh_data["bone_indices"],
                    mesh_data["bone_weights"],
                    bone_names,
                )
                
                # 尝试绑定到现有骨架
                armature = find_best_armature(context, obj)
                if armature:
                    bind_mesh_to_armature(obj, armature)
                    log.debug(f"已绑定到骨架: {armature.name}")
        
        log.info(f"成功创建网格对象: {object_name} (类型: {mesh_type})")
        return obj
        
    except ValueError as e:
        log.warning(f"数据验证失败: {e}")
        return None
    except Exception as e:
        log.error(f"创建网格对象失败: {e}")
        return None
