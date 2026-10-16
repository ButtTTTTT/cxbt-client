// Logger.cpp
// 日志模块实现

#include "Logger.h"

#include <iostream>
#include <string_view>

Logger& Logger::getInstance() {
	static Logger instance;
	return instance;
}

void Logger::setLevel(LogLevel level) {
	m_level = level;
}

bool Logger::isDebugEnabled() const {
	return m_level == LogLevel::Debug;
}

void Logger::log(LogLevel level, const char* filePath, const std::string& message) {
	// Debug 级别的日志仅在 Debug 模式下输出；
	// Info 级别的日志始终输出。
	if (level == LogLevel::Debug && m_level == LogLevel::Info) {
		return;
	}

	std::string fileBaseName = extractFileBaseName(filePath);
	char levelChar = levelToChar(level);

	std::cout << levelChar << '.' << fileBaseName << ": " << message << '\n';
}

std::string Logger::extractFileBaseName(const char* filePath) {
	std::string_view path(filePath);

	// 查找最后一个路径分隔符（兼容 '/' 和 '\'）
	size_t lastSep = path.find_last_of("\\/");
	size_t fileNameStart = (lastSep == std::string_view::npos) ? 0 : lastSep + 1;

	// 查找扩展名分隔符（最后一个 '.'）
	size_t extPos = path.find_last_of('.');

	// 截取不含扩展名的文件名
	size_t fileNameEnd = (extPos != std::string_view::npos && extPos > fileNameStart)
	                     ? extPos
	                     : path.length();

	return std::string(path.substr(fileNameStart, fileNameEnd - fileNameStart));
}

char Logger::levelToChar(LogLevel level) {
	switch (level) {
		case LogLevel::Info:  return 'I';
		case LogLevel::Debug: return 'D';
		default:              return '?';
	}
}
