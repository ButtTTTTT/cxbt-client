# ui/__init__.py
"""PDE Studio UI 子包 — 导出操作符和面板

聚合所有 UI 模块，对外提供统一导入入口。
registration.py 通过 ``from ..ui import ...`` 引用本包。
"""

from .export_operators import (  # noqa: F401
    PDE_OT_ExportMesh,
    PDE_OT_ExportSkel,
    PDE_OT_ExportAnim,
)
from .mesh_operators import (  # noqa: F401
    PDE_OT_ExportSceneMesh,
    PDE_OT_ExportFPMesh,
    PDE_OT_ExportTPMesh,
    PDE_OT_ExportPropMesh,
)
from .skel_operators import (  # noqa: F401
    PDE_OT_ExportCharacterSkel,
    PDE_OT_ExportPropSkel,
)
from .anim_operators import (  # noqa: F401
    PDE_OT_ExportCharFPAnim,
    PDE_OT_ExportCharTPAnim,
    PDE_OT_ExportPropFPAnim,
    PDE_OT_ExportPropTPAnim,
    PDE_OT_FixSceneFPS,
)
from .panels import (  # noqa: F401
    PDE_PT_MainPanel,
    PDE_PT_SceneMeshPanel,
    PDE_PT_FirstPersonMeshPanel,
    PDE_PT_ThirdPersonMeshPanel,
    PDE_PT_PropMeshPanel,
    PDE_PT_SkelPanel,
    PDE_PT_AnimPanel,
    PDE_PT_HelpPanel,
)
from .primitive_panel import (  # noqa: F401
    PDE_PT_PrimitivePropsPanel,
)
from .primitive_operators import (  # noqa: F401
    PDE_OT_SetCollision,
    PDE_OT_SetPhysicsMaterial,
    PDE_OT_SetVisible,
    PDE_OT_SetBlendLayer,
    PDE_OT_SetBlendMode,
    PDE_OT_SetCullMode,
    PDE_OT_InitPrimitiveProps,
    PDE_OT_BatchSetCollision,
)
from .primitive_texture_operators import (  # noqa: F401
    PDE_OT_EditTexturePath,
    PDE_OT_AddTexture,
    PDE_OT_RemoveTexture,
    PDE_OT_CreatePDEMaterial,
)
from .primitive_shader_operators import (  # noqa: F401
    PDE_OT_EditShader,
    PDE_OT_AddShader,
    PDE_OT_RemoveShader,
    PDE_OT_AddUniform,
    PDE_OT_EditUniform,
    PDE_OT_RemoveUniform,
)
