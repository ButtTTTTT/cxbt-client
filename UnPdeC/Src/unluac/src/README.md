# 感谢
    感谢 AeonLucid 的开源项目
    项目地址 https://github.com/AeonLucid/AvatarStarCBT

# 注意
    此版为修改版！！！

# 将java项目编译成独立的可执行文件

## 下载 Oracle GraalVM
    https://www.graalvm.org/downloads/

    设置环境变量
    这个和设置JDK的环境变量是一样的，
    https://www.graalvm.org/latest/getting-started/windows/
    
    JAVA_HOME D:\SDKs\JDK\graalvm-jdk-25.0.1+8.1
    PATH D:\SDKs\JDK\graalvm-jdk-25.0.1+8.1\bin

    也就是说Oracle GraalVM可以编译java项目为 (.jar)
    以及可以编译成独立的可执行文件 (.exe)

## 编译为.jar
    运行 build_jar.bat.bat 即可得到 unluac.jar

## 编译为.exe
    运行 build_native.bat 将会生成一个 unluac.exe

## .luac打开方式
    将.luac文件的打开方式设置为 unluac.exe
    即可将字节码转换为.lua文件

## 中文乱码
    使用vscode 以 GB2312 编码打开，
    然后在保存为UTF-8编码即可正常显示中文
    部分文件默认就是UTF-8编码！
