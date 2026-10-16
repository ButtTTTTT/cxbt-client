#pragma once

// 预编译头（PCH）：
// - 集中包含在整个项目中高频使用的标准库与第三方头文件
// - 在各 .cpp 中只需包含 "Pch.h" 即可获得这些依赖，从而提升编译速度
// - 建议仅在此处放置稳定且几乎处处都需要的头文件，避免引入过多无关依赖

#include <Windows.h>

#include <algorithm>
#include <chrono>
#include <cctype>
#include <clocale>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <exception>
#include <filesystem>
#include <format>
#include <fstream>
#include <functional>
#include <iomanip>
#include <ios>
#include <iostream>
#include <iterator>
#include <memory>
#include <mutex>
#include <numeric>
#include <set>
#include <span>
#include <sstream>
#include <stdexcept>
#include <string>
#include <system_error>
#include <utility>
#include <vector>
#include <nlohmann/json.hpp>
