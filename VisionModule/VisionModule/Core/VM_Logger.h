#pragma once
/**
 * @file VM_Logger.h
 * @brief VisionModule 내부 로깅 어댑터
 */

#include <mutex>
#include <string>
#include "IVisionModule.h" // VM_LogCallback

 /**
  * @class VM_Logger
  * @brief 외부 콜백으로 로그를 전달하는 어댑터 (Singleton)
  * @details Facade 바깥(VisionModuleImpl/Drivers)에서 공통 사용
  */
class VM_Logger {
public:
    static VM_Logger& Instance() {
        static VM_Logger s; return s;
    }

    /// 외부 로그 콜백을 설정
    void SetCallback(VM_LogCallback cb) {
        std::lock_guard<std::mutex> lk(m_);
        cb_ = cb;
    }

    /// 레벨과 메시지로 로깅
    void Log(int level, const std::string& msg) {
        std::lock_guard<std::mutex> lk(m_);
        if (cb_) cb_(level, msg.c_str());
#ifdef _DEBUG
        OutputDebugStringA(("[VM] " + msg + "\n").c_str());
#endif
    }

private:
    VM_Logger() = default;
    std::mutex m_;
    VM_LogCallback cb_{ nullptr };
};
