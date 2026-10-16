// Logger.h
// 日志模块：支持按日志级别（Info / Debug）输出，
// 并自动从 __FILE__ 提取文件名作为前缀（如 I.Main / D.CacheParser）。
//
// 用法：
//   LOG_INFO("xxx");   — 简要日志，默认始终输出
//   LOG_DEBUG("xxx");  — 详细日志，仅在启动参数 -log d 时输出

#pragma once

#include <string>

// 日志级别
enum class LogLevel {
	Info,   // 简要日志（默认输出）
	Debug   // 详细日志（仅 -log d 时输出）
};

// 单例日志器
class Logger {
public:
	static Logger& getInstance();

	// 设置日志级别（Info = 简要，Debug = 详细）
	void setLevel(LogLevel level);

	// 当前是否处于 Debug 模式
	bool isDebugEnabled() const;

	// 输出一条日志
	// level:     日志级别
	// filePath:  编译期 __FILE__ 宏，用于提取文件名前缀
	// message:   日志内容
	void log(LogLevel level, const char* filePath, const std::string& message);

private:
	Logger() = default;
	LogLevel m_level = LogLevel::Info;

	// 从完整路径中提取不含扩展名的文件名（如 "Main.cpp" -> "Main"）
	static std::string extractFileBaseName(const char* filePath);

	// 日志级别转单字符（Info -> 'I', Debug -> 'D'）
	static char levelToChar(LogLevel level);
};

// 便捷宏：自动捕获当前源文件路径
#define LOG_INFO(msg)  Logger::getInstance().log(LogLevel::Info,  __FILE__, (msg))
#define LOG_DEBUG(msg) Logger::getInstance().log(LogLevel::Debug, __FILE__, (msg))
