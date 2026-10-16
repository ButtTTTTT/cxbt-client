"""
Mesh 文件索引系统

扫描 mesh 目录建立文件索引，用于快速查找 mesh 文件的实际路径。
"""

import os
from typing import Dict, List, Optional, Set
from ..log import get_module_logger

log = get_module_logger("MESH_INDEX")


class MeshIndex:
    """
    Mesh 文件索引
    
    扫描 mesh 目录建立文件名到实际路径的映射，支持：
    - 按文件名搜索
    - 按相对路径搜索
    - 按对象类型推断路径
    """
    
    # 不同类型对象的默认搜索目录
    SEARCH_PATHS = {
        "gate": ["prop/gate", "prop", "scene"],
        "active_object": ["prop", "scene"],
        "main_scene": ["scene"],
        "default": ["scene", "prop", "prop/gate"],
    }
    
    def __init__(self):
        """初始化索引"""
        self._file_index: Dict[str, str] = {}  # 文件名 -> 绝对路径
        self._relative_index: Dict[str, str] = {}  # 相对路径（不含mesh前缀） -> 绝对路径
        self._resource_root: str = ""
        self._scanned: bool = False
    
    def scan(self, resource_root: str, force: bool = False) -> bool:
        """
        扫描 mesh 目录建立索引
        
        Args:
            resource_root: 资源根目录
            force: 是否强制重新扫描
        
        Returns:
            是否扫描成功
        """
        if self._scanned and not force and self._resource_root == resource_root:
            return True
        
        mesh_dir = os.path.join(resource_root, "mesh")
        if not os.path.isdir(mesh_dir):
            log.warning(f"Mesh 目录不存在: {mesh_dir}")
            return False
        
        self._file_index.clear()
        self._relative_index.clear()
        self._resource_root = resource_root
        
        # 递归扫描 mesh 目录
        file_count = 0
        for root, dirs, files in os.walk(mesh_dir):
            for filename in files:
                # 只索引 .mesh 和 .dds 文件
                if filename.endswith(('.mesh', '.dds')):
                    full_path = os.path.join(root, filename)
                    
                    # 文件名索引
                    if filename not in self._file_index:
                        self._file_index[filename] = full_path
                    
                    # 相对路径索引（相对于 mesh 目录）
                    rel_path = os.path.relpath(full_path, mesh_dir)
                    # 标准化路径分隔符
                    rel_path = rel_path.replace('\\', '/')
                    self._relative_index[rel_path] = full_path
                    
                    file_count += 1
        
        self._scanned = True
        log.info(f"Mesh 索引完成: {file_count} 个文件")
        return True
    
    def find_mesh(self, mesh_path: str, object_type: str = "default") -> Optional[str]:
        """
        查找 mesh 文件的实际路径
        
        Args:
            mesh_path: 脚本中的 mesh 路径
            object_type: 对象类型 (gate, active_object, main_scene)
        
        Returns:
            绝对路径，找不到返回 None
        """
        if not self._scanned:
            log.warning("索引未扫描，请先调用 scan()")
            return None
        
        # 提取文件名
        filename = os.path.basename(mesh_path)
        
        # 策略 1: 尝试完整相对路径匹配
        if mesh_path in self._relative_index:
            return self._relative_index[mesh_path]
        
        # 处理 ../ 前缀
        search_path = mesh_path
        if search_path.startswith("../"):
            search_path = search_path[3:]
            if search_path in self._relative_index:
                return self._relative_index[search_path]
        
        # 策略 2: 根据对象类型在特定目录搜索
        search_dirs = self.SEARCH_PATHS.get(object_type, self.SEARCH_PATHS["default"])
        for dir_path in search_dirs:
            full_rel_path = f"{dir_path}/{search_path}"
            if full_rel_path in self._relative_index:
                return self._relative_index[full_rel_path]
            
            # 也尝试直接用文件名
            full_rel_path = f"{dir_path}/{filename}"
            if full_rel_path in self._relative_index:
                return self._relative_index[full_rel_path]
        
        # 策略 3: 直接按文件名搜索
        if filename in self._file_index:
            return self._file_index[filename]
        
        # 策略 4: 尝试更多路径组合
        # 例如 "windmils/windmils.mesh" 可能在 prop/windmils/ 下
        if '/' in search_path:
            parts = search_path.split('/')
            # 尝试在 prop 下查找
            prop_path = f"prop/{search_path}"
            if prop_path in self._relative_index:
                return self._relative_index[prop_path]
        
        log.debug(f"未找到 mesh: {mesh_path} (类型: {object_type})")
        return None
    
    def find_material(self, material_path: str) -> Optional[str]:
        """
        查找材质文件的实际路径
        
        Args:
            material_path: 脚本中的材质路径
        
        Returns:
            绝对路径，找不到返回 None
        """
        if not self._scanned:
            return None
        
        # 材质文件可能在:
        # 1. mesh/scene/materials/
        # 2. mesh/ 目录下的其他位置
        
        # 尝试完整路径
        if material_path in self._relative_index:
            return self._relative_index[material_path]
        
        # 尝试 scene/materials/ 下
        mat_path = f"scene/{material_path}"
        if mat_path in self._relative_index:
            return self._relative_index[mat_path]
        
        # 尝试 materials/ 下
        mat_path = f"scene/materials/{os.path.basename(material_path)}"
        if mat_path in self._relative_index:
            return self._relative_index[mat_path]
        
        # 直接按文件名搜索
        filename = os.path.basename(material_path)
        if filename in self._file_index:
            return self._file_index[filename]
        
        return None
    
    def get_stats(self) -> dict:
        """获取索引统计信息"""
        return {
            "scanned": self._scanned,
            "file_count": len(self._file_index),
            "resource_root": self._resource_root,
        }


# 全局索引实例
_mesh_index: Optional[MeshIndex] = None


def get_mesh_index() -> MeshIndex:
    """获取全局 mesh 索引实例"""
    global _mesh_index
    if _mesh_index is None:
        _mesh_index = MeshIndex()
    return _mesh_index
