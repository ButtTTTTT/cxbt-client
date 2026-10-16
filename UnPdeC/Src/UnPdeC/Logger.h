#pragma once

#include <string>

namespace UnPdeC::Logger {
    /// <summary>
    /// 日志级别枚举，定义不同严重程度的日志级别
    /// </summary>
    enum class LogLevel {
        Debug = 0,
        Info = 1,
        Warning = 2,
        Error = 3
    };

    /// <summary>
    /// 设置当前日志级别
    /// </summary>
    /// <param name="level">要设置的日志级别</param>
    void SetLevel(LogLevel level);

    /// <summary>
    /// 设置日志输出文件
    /// </summary>
    /// <param name="filename">日志文件名</param>
    void SetLogFile(const std::string& filename);

    /// <summary>
    /// 记录指定级别的日志消息
    /// </summary>
    /// <param name="level">日志级别</param>
    /// <param name="message">日志消息内容</param>
    void Log(LogLevel level, const std::string& message);

    /// <summary>
    /// 记录调试级别日志
    /// </summary>
    /// <param name="message">日志消息内容</param>
    void Debug(const std::string& message);

    /// <summary>
    /// 记录信息级别日志
    /// </summary>
    /// <param name="message">日志消息内容</param>
    void Info(const std::string& message);

    /// <summary>
    /// 记录警告级别日志
    /// </summary>
    /// <param name="message">日志消息内容</param>
    void Warning(const std::string& message);

    /// <summary>
    /// 记录错误级别日志
    /// </summary>
    /// <param name="message">日志消息内容</param>
    void Error(const std::string& message);
}
