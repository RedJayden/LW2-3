#include "pch.h"
#include "LogManager.h"
#include <chrono>
#include <iomanip>
#include <sstream>
#include <iostream>
#include <filesystem>

LogManager::~LogManager() {
    if (m_file.is_open()) {
        m_file.close();
    }
}

void LogManager::Initialize(const std::string& logDir) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_logDir = logDir;
    
    // Ensure directory exists
    std::filesystem::path dirPath(m_logDir);
    if (!std::filesystem::exists(dirPath)) {
        std::filesystem::create_directories(dirPath);
    }

    OpenNewFileIfNeeded();
}

std::string LogManager::GetCurrentDateString() {
    auto now = std::chrono::system_clock::now();
    auto in_time_t = std::chrono::system_clock::to_time_t(now);
    tm buf;
    localtime_s(&buf, &in_time_t); // Windows secure
    std::stringstream ss;
    ss << std::put_time(&buf, "%Y-%m-%d");
    return ss.str();
}

std::string LogManager::GetCurrentTimeString() {
    auto now = std::chrono::system_clock::now();
    auto in_time_t = std::chrono::system_clock::to_time_t(now);
    tm buf;
    localtime_s(&buf, &in_time_t); // Windows secure
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
    std::stringstream ss;
    ss << std::put_time(&buf, "%H:%M:%S") << '.' << std::setfill('0') << std::setw(3) << ms.count();
    return ss.str();
}

void LogManager::OpenNewFileIfNeeded() {
    std::string today = GetCurrentDateString();
    if (m_currentDate != today || !m_file.is_open()) {
        if (m_file.is_open()) {
            m_file.close();
        }
        m_currentDate = today;
        std::string filename = m_logDir + "/Log_" + today + ".txt";
        m_file.open(filename, std::ios::app);
    }
}

void LogManager::Write(const std::string& level, const std::string& source, const std::string& message) {
    std::lock_guard<std::mutex> lock(m_mutex);
    OpenNewFileIfNeeded();
    if (m_file.is_open()) {
        m_file << "[" << GetCurrentDateString() << " " << GetCurrentTimeString() << "] "
               << "[" << level << "] "
               << "[" << source << "] "
               << message << "\n";
        m_file.flush();
    }
}
