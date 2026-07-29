#pragma once
#include "include/base/cef_logging.h"
#include <Windows.h>
#include <string>
#include <sstream>

/** @brief Wide → UTF-8 변환 */
inline std::string WideToUtf8(const std::wstring& w) {
    if (w.empty()) return {};
    const int len = ::WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(),
        nullptr, 0, nullptr, nullptr);
    std::string out(len, '\0');
    ::WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(),
        out.data(), len, nullptr, nullptr);
    return out;
}

/** @brief VS 출력 + CEF 파일 로그에 동시에 남기는 매크로 */
#define LOG_INFO_BOTH(msg) \
    do { \
        std::wostringstream _w; \
        _w << L"[INFO] " << msg << L"\n"; \
        ::OutputDebugStringW(_w.str().c_str()); \
        LOG(INFO) << WideToUtf8(_w.str()); \
    } while(0)
