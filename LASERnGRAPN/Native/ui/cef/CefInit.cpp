#include "pch.h"

#include "CefInit.h"
#include "include/base/cef_logging.h"
#include <Windows.h>
#include <ShlObj.h>    // SHCreateDirectoryExW
#include <string>
#include <filesystem> // C++17 filesystem (권장)

namespace {
    namespace fs = std::filesystem;

    /**
     * @brief 현재 실행 파일의 디렉토리 경로를 반환합니다.
     * @return std::wstring 실행 파일 폴더 경로
     */
    std::wstring GetExeDir() {
        wchar_t exe[MAX_PATH] = {};
        ::GetModuleFileNameW(nullptr, exe, MAX_PATH);
        std::wstring dir = exe;
        size_t lastSlash = dir.find_last_of(L"\\/");
        if (lastSlash != std::wstring::npos) {
            dir.erase(lastSlash + 1);
        }
        return dir;
    }

    /**
     * @brief 두 경로 문자열을 결합합니다.
     */
    std::wstring Join(const std::wstring& a, const std::wstring& b) {
        if (a.empty()) return b;
        fs::path pathA(a);
        fs::path pathB(b);
        return (pathA / pathB).wstring();
    }

    /**
     * @brief 디렉토리가 존재하지 않으면 생성합니다.
     */
    void EnsureDir(const std::wstring& path) {
        if (path.empty()) return;
        // C++17 방식 또는 기존 SHCreateDirectoryExW 사용 가능
        std::error_code ec;
        fs::create_directories(path, ec);
    }

    /**
     * @brief 기존 로그 파일이 너무 비대해지는 것을 방지하기 위해 초기화합니다.
     * @details 프로그램 시작 시 기존 로그 파일을 삭제합니다.
     * @param path 로그 파일 전체 경로
     */
    void ResetLogFile(const std::wstring& path) {
        std::error_code ec;
        if (fs::exists(path, ec)) {
            fs::remove(path, ec);
        }
    }

    /**
     * @brief VS Output 및 CEF 로그 시스템에 정보를 기록합니다.
     */
    void LogInfo(const std::wstring& msg) {
        ::OutputDebugStringW((L"[CEF Init] " + msg + L"\n").c_str());
        // CEF 초기화 전이라도 OutputDebugString은 유효함
    }
}

void InitCefSettings(CefSettings& s) {
    s.no_sandbox = true;

    // Bin 디렉토리 기준으로 구성
    const auto exeDir = GetExeDir();
    const auto logPath = Join(exeDir, L"LASERnGRAPN_CEF.log");

    // root_cache_path (루트)
    const auto rootCache = Join(exeDir, L"cef_cache_root");

    // cache_path (반드시 root_cache_path의 하위 폴더여야 함)
    const auto cachePath = Join(rootCache, L"Profile_Default");

    // 디렉토리 생성
    EnsureDir(rootCache);
    EnsureDir(cachePath);

    // 실행 시마다 로그 파일 초기화 (계속 쌓이는 것 방지)
    ResetLogFile(logPath);

    // 3. CEF 경로 매핑
    CefString(&s.log_file).FromWString(logPath);
    CefString(&s.root_cache_path).FromWString(rootCache);
    CefString(&s.cache_path).FromWString(cachePath);

    // 4. 로그 레벨 설정 (핵심 변경 사항)
    // VERBOSE는 영상 데이터 처리 시 GB 단위 로그를 유발하므로 절대 피해야 함.
#ifdef _DEBUG
    // 디버그 모드: 경고 이상의 에러만 기록하거나, 필요시 INFO로 변경
	s.log_severity = LOGSEVERITY_WARNING; // LOGSEVERITY_VERBOSE (모든 정보 기록)
    // s.log_severity = LOGSEVERITY_INFO; // 일반적인 디버깅용
#else
    // 릴리즈 모드: 로그 끄기 (성능 및 용량 최적화)
    //s.log_severity = LOGSEVERITY_DISABLE;
    // 만약 에러 추적이 꼭 필요하다면:
    s.log_severity = LOGSEVERITY_ERROR;
#endif

    // 5. 기타 옵션 (필요시 활성화)
    // s.remote_debugging_port = 8088; // 원격 디버깅 필요 시 포트 개방

    // (옵션) 세션 쿠키/크래시 리포트 등
    // s.persist_session_cookies = true;
    // s.persist_user_preferences = true;

    LogInfo(L"log=" + logPath + L", root_cache=" + rootCache + L", cache=" + cachePath);
}
