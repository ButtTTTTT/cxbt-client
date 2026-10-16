@echo off
setlocal enabledelayedexpansion

:: 遍历当前目录下所有.zip文件
for %%f in (*.zip) do (
    echo Found zip file: %%f
    "D:\Apps\Blender\5.1.2\blender.exe" --command extension validate "%%f"
)

pause