#include "pch.h"

#include "BuildPortalUrl.h"
#include "AppConfig.h"

#include <string>
#include <Shlwapi.h>
#pragma comment(lib, "Shlwapi.lib")

// Windows absolute path -> file:// URL
static std::wstring MakeFileUrlFromLocalPath(const std::wstring& absPath) {
    std::wstring url; url.reserve(16 + absPath.size());
    url.append(L"file:///");
    for (wchar_t ch : absPath) url.push_back(ch == L'\\' ? L'/' : ch);
    return url;
}

// route를 항상 "#/<route>"로 정규화
static std::wstring NormalizeRoute(const std::wstring& r) {
    if (r.empty()) return L"#/splash";             // 기본 라우트
    if (r[0] == L'#')   return r;                  // 이미 "#/..." 형태
    if (r[0] == L'/')   return L"#" + r;           // "/main" -> "#/main"
    return L"#/" + r;                               // "main"  -> "#/main"
}

CefString BuildPortalUrl(const std::wstring& route) {
    const auto& cfg = AppConfig::instance();
    const std::wstring hash = NormalizeRoute(route);

    if (cfg.portal_mode == PortalMode::Dist) {
        // dist/index.html + "#/<route>"
        const std::wstring base = MakeFileUrlFromLocalPath(cfg.dist_index);
        return CefString(base + hash);
    }
    else {
        // dev 서버 URL (예: http://localhost:5173) + "#/<route>"
        // cfg.dev_url 말미 슬래시는 있어도 없어도 무관 (# 앞이라 충돌 없음)
        return CefString(cfg.dev_url + hash);
    }
}