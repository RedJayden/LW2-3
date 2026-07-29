#include "pch.h"

#include "AppConfig.h"

#include <windows.h>
#include <shlwapi.h>
#include "include/cef_command_line.h"

#pragma comment(lib, "Shlwapi.lib")

static std::wstring GetExeDir() {
    wchar_t buf[MAX_PATH]{};
    GetModuleFileNameW(nullptr, buf, MAX_PATH);
    PathRemoveFileSpecW(buf);
    return buf;
}

static AppConfig g_cfg;

const AppConfig& AppConfig::instance() { return g_cfg; }

/// <summary>
/// 실행 옵션으로 강제 전환:
// --portal - mode = dev
// --portal - mode = dist
// --portal - dev - url = http://192.168.0.5:5173
// --fullscreen - main(필요 시)
/// </summary>

void AppConfig::bootstrap() {
    // 1) 기본값(빌드타입별)
#if defined(_DEBUG)
    // Debug 기본 : dev 서버(http ://localhost:5173)로 연결
    // g_cfg.portal_mode = PortalMode::Dev;  // 로컬서버
    g_cfg.portal_mode = PortalMode::Dist;   // 디렉토리 Bin\Web
#else
    // Release 기본 : 배포(web / index.html)로 연결
    g_cfg.portal_mode = PortalMode::Dist;
#endif

    g_cfg.dist_index = GetExeDir() + L"\\web\\index.html";
    g_cfg.start_fullscreen_main = false;
    g_cfg.start_fullscreen_splash = false;

    // 2) 커맨드라인 스위치로 덮어쓰기
    auto cmd = CefCommandLine::GetGlobalCommandLine();

    if (cmd->HasSwitch("portal-mode")) {
        auto v = cmd->GetSwitchValue("portal-mode");
        if (v == "dev")  g_cfg.portal_mode = PortalMode::Dev;
        if (v == "dist") g_cfg.portal_mode = PortalMode::Dist;
    }
    if (cmd->HasSwitch("portal-dev-url")) {
        g_cfg.dev_url = cmd->GetSwitchValue("portal-dev-url").ToWString();
    }
    if (cmd->HasSwitch("fullscreen-main")) {
        g_cfg.start_fullscreen_main = true;
    }
}
