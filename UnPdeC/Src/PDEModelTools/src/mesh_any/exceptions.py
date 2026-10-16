"""
网格解析异常模块

定义网格解析过程中可能出现的各种异常类型。
提供详细的错误上下文信息，便于调试和问题定位。
"""

from typing import Optional


class MeshParseError(Exception):
    """
    网格解析基础异常
    
    所有网格解析相关异常的基类。
    """
    
    def __init__(self, message: str, filepath: Optional[str] = None):
        self.filepath = filepath
        super().__init__(message)
    
    def __str__(self) -> str:
        if self.filepath:
            return f"[{self.filepath}] {super().__str__()}"
        return super().__str__()


class InvalidMeshHeaderError(MeshParseError):
    """
    无效的网格头部异常
    
    当文件头部数据不符合预期格式时抛出。
    """
    
    def __init__(
        self, 
        filepath: str, 
        offset: int, 
        expected: bytes, 
        actual: bytes
    ):
        self.offset = offset
        self.expected = expected
        self.actual = actual
        
        message = (
            f"Invalid mesh header at offset 0x{offset:x}\n"
            f"Expected: {expected.hex()}\n"
            f"Actual: {actual.hex()}"
        )
        super().__init__(message, filepath)


class UnsupportedMeshTypeError(MeshParseError):
    """
    不支持的网格类型异常
    
    当遇到未知的网格类型或版本时抛出。
    """
    
    def __init__(self, mesh_type: str, version: str = "", filepath: Optional[str] = None):
        self.mesh_type = mesh_type
        self.version = version
        
        message = f"Unsupported mesh type: {mesh_type}"
        if version:
            message += f" (version: {version})"
        
        super().__init__(message, filepath)


class VertexDataMismatchError(MeshParseError):
    """
    顶点数据不匹配异常
    
    当顶点数据大小或数量与头部信息不一致时抛出。
    """
    
    def __init__(
        self, 
        filepath: str, 
        expected_count: int, 
        actual_count: int,
        data_type: str = "vertices"
    ):
        self.expected_count = expected_count
        self.actual_count = actual_count
        self.data_type = data_type
        
        message = (
            f"{data_type} count mismatch: "
            f"expected {expected_count}, got {actual_count}"
        )
        super().__init__(message, filepath)


class FaceDataMismatchError(MeshParseError):
    """
    面数据不匹配异常
    
    当面数据大小与预期不符时抛出。
    """
    
    def __init__(
        self, 
        filepath: str, 
        expected_size: int, 
        actual_size: int
    ):
        self.expected_size = expected_size
        self.actual_size = actual_size
        
        message = (
            f"Face data size mismatch: "
            f"expected 0x{expected_size:x} bytes, got 0x{actual_size:x} bytes"
        )
        super().__init__(message, filepath)


class IncompleteDataError(MeshParseError):
    """
    数据不完整异常
    
    当文件数据不足以完成解析时抛出。
    """
    
    def __init__(self, filepath: str, required: int, available: int, context: str = ""):
        self.required = required
        self.available = available
        self.context = context
        
        message = f"Incomplete data: required {required} bytes, available {available} bytes"
        if context:
            message += f" ({context})"
        
        super().__init__(message, filepath)


class TextureParseError(MeshParseError):
    """
    贴图解析异常
    
    当贴图数据解析失败时抛出。
    """
    
    def __init__(self, filepath: str, map_type: str, reason: str = ""):
        self.map_type = map_type
        self.reason = reason
        
        message = f"Failed to parse {map_type}"
        if reason:
            message += f": {reason}"
        
        super().__init__(message, filepath)


class BoneDataError(MeshParseError):
    """
    骨骼数据异常
    
    当骨骼相关数据解析失败时抛出。
    """
    
    def __init__(self, filepath: str, bone_index: int, reason: str = ""):
        self.bone_index = bone_index
        self.reason = reason
        
        message = f"Invalid bone data at index {bone_index}"
        if reason:
            message += f": {reason}"
        
        super().__init__(message, filepath)
