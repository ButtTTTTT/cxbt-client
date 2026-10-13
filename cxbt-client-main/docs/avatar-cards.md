# 造型卡数据

`public/assets/avatar-cards/catalog.json` 保存从 `log-2026-10-13.txt` 提取的 157 套不同外观：25 张商城卡、1 张背包卡、131 套装备外观。商城卡按 `sid` 合并，装备外观按解析后的部件数据去重。页面另外保留原有 8 套基础职业外观。

在大厅的「造型卡」页点击卡片，会切换角色模型和头像；所选卡片按账号和角色名保存在本地，刷新后恢复。进入战场时本地角色沿用该造型。多人网络协议目前仍传递原有的职业和创建外观，其他玩家的皮肤同步需要后续服务器支持。

模型、纹理、颜色、装备层级和配件变换来自原始缓存和日志。导入器只解析字面量，不执行日志里的 Lua，也不导出账号和玩家资料。当前支持服装、头部纹理、左右眼、嘴、鼻、耳朵、固定与可移动配件；日志中的投影贴花参数保存在 `appearanceData.decal`，尚未烘焙到模型。

重新抓包后，先生成资产（Blender 提供 DDS/TGA 读取和 NumPy）：

```powershell
blender --background --factory-startup --python-exit-code 1 --python scripts/prepare-avatar-cards.py
```

可在命令末尾添加 `-- --workspace E:/Game-RE/CXBT --logs log-2026-10-13.txt` 指定数据来源。默认读取工作区根目录中的 `log-2026-10-13*.txt`。

运行 Vite 后，生成实际角色缩略图，并验证卡片切换：

```powershell
node scripts/prepare-avatar-thumbnails.mjs http://127.0.0.1:5175
npm.cmd run smoke:avatars -- http://127.0.0.1:5175
```

`CHROMIUM_PATH` 可指定 Chromium/Edge；Windows 默认使用标准安装路径的 Edge。缩略图复用大厅的 `CharacterPreview`，自动化检查覆盖每张卡的模型与头像、分页、快速切换、刷新恢复、装备保留、搜索、重置和局内模型与动作加载。测试浏览器资料放在系统临时目录，结束时清理。
