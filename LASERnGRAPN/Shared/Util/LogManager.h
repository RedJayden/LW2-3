#pragma once

#include <string>
#include <mutex>
#include <fstream>

class LogManager {
public:
    static LogManager& Instance() {
        static LogManager instance;
        return instance;
    }

    void Initialize(const std::string& logDir = "Log");
    void Write(const std::string& level, const std::string& source, const std::string& message);

private:
    LogManager() = default;
    ~LogManager();

    std::mutex m_mutex;
    std::ofstream m_file;
    std::string m_logDir;
    std::string m_currentDate;

    void OpenNewFileIfNeeded();
    std::string GetCurrentDateString();
    std::string GetCurrentTimeString();
};
