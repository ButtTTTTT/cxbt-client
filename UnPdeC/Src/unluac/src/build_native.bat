@echo off
set JAVA_HOME=D:\SDKs\JDK\graalvm-jdk-25.0.1+8.1
set PATH=%JAVA_HOME%\bin;%PATH%
cd /d "%~dp0"

REM Compile the JAR file to a native executable using GraalVM
native-image -jar Unluac.jar -H:+AddAllCharsets --enable-url-protocols=http,https -o Unluac

REM Check if the native image compilation was successful
if %ERRORLEVEL% neq 0 (
    echo Native image compilation failed.
    goto end
)

echo Native image creation was successful.
goto end

:end
pause
