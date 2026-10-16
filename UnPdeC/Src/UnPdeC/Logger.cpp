#include "Pch.h"
#include "Logger.h"

namespace UnPdeC::Logger {
	// 简单的按级别过滤的文件日志实现，仅在设置日志文件后才真正输出
	namespace {
		LogLevel current_level = LogLevel::Info;
		std::ofstream log_file;
	}

	void SetLevel(LogLevel level) {
		current_level = level;
	}

	void SetLogFile(const std::string& filename) {
		log_file.open(filename, std::ios::app);
	}

	void Log(LogLevel level, const std::string& message) {
		if (level < current_level) return;

		auto now = std::chrono::system_clock::now();
		auto time = std::chrono::system_clock::to_time_t(now);
		char time_str[26];
		ctime_s(time_str, sizeof(time_str), &time);
		time_str[24] = '\0';

		const char* level_str = "";
		switch (level) {
			case LogLevel::Debug:   level_str = "[DEBUG]"; break;
			case LogLevel::Info:    level_str = "[INFO]"; break;
			case LogLevel::Warning: level_str = "[WARN]"; break;
			case LogLevel::Error:   level_str = "[ERROR]"; break;
		}

		std::string log_line = std::string(time_str) + " " + level_str + " " + message;

		if (log_file.is_open()) {
			log_file << log_line << "\n";
			log_file.flush();
		}
	}

	void Debug(const std::string& message) { Log(LogLevel::Debug, message); }
	void Info(const std::string& message) { Log(LogLevel::Info, message); }
	void Warning(const std::string& message) { Log(LogLevel::Warning, message); }
	void Error(const std::string& message) { Log(LogLevel::Error, message); }
}
