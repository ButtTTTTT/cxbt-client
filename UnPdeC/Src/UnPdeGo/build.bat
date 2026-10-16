@echo off
setlocal enabledelayedexpansion

echo ========================================
echo UnPdeGO 编译脚本
echo ========================================

REM 设置版本信息
set VERSION=1.0.0
set BUILD_DATE=%date:~0,10%_%time:~0,8%
set BUILD_DATE=%BUILD_DATE: =0%

REM 创建 bin 目录
if not exist "bin" mkdir bin

REM 编译优化版本（去除调试信息，减小文件大小）
echo.
echo 正在编译 Release 版本...
go build -trimpath -ldflags "-s -w -X main.version=%VERSION% -X main.buildDate=%BUILD_DATE%" -o bin\UnPdeGO.exe

if errorlevel 1 (
    echo 编译失败!
    pause
    exit /b 1
)

echo.
echo ========================================
echo 编译完成!
echo ========================================
echo Release 版本: bin\UnPdeGO.exe
echo 版本信息:     v%VERSION%
echo 编译时间:     %BUILD_DATE%
echo ========================================

echo.
pause