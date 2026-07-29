#include "pch.h"

// 스플래시 UI 창 생성
// Main UI 창 생성
// 스플래시 먼저 띄우고, JS가 "app.openMain"을 보내면 메인 창을 생성

// Copyright (c) 2013 The Chromium Embedded Framework Authors. All rights
// reserved. Use of this source code is governed by a BSD-style license that
// can be found in the LICENSE file.

#include "simple_app.h"

#include "include/cef_browser.h"
#include "include/cef_command_line.h"
#include "include/views/cef_browser_view.h"
#include "include/views/cef_window.h"
#include "include/wrapper/cef_helpers.h"
#include "include/cef_v8.h"
#include "include/cef_scheme.h"             // 스킴 선언에 필요
#include "include/base/cef_logging.h"

#include "simple_handler.h"

#include "FolderUtil.h"

#include "Core/AppInitial/AppConfig.h"
#include "Core/AppInitial/BuildPortalUrl.h"
#include "Core/AppInitial/WindowFactory.h"
#include "Core/MachineProfile.h"

// 외부에서 부를 수 있도록 선언 (WindowFactory 구현부에 존재)
extern CefRefPtr<CefBrowser> CreatePortalWindow(const CefString& url,
    cef_runtime_style_t runtime_style,
    CefRefPtr<SimpleHandler> handler,
    int width, int height,
    cef_show_state_t show_state,
    bool start_fullscreen);

// 생성자 (ctor : constructor)
SimpleApp::SimpleApp() = default;

/**
* @brief 화면 영역 사이즈 구하기
*/
static RECT GetPrimaryWorkArea()
{
    HMONITOR hMon = MonitorFromPoint(POINT{ 0,0 }, MONITOR_DEFAULTTOPRIMARY);
    MONITORINFO mi{ sizeof(mi) };
    GetMonitorInfoW(hMon, &mi);
    return mi.rcWork; // 작업표시줄 제외
}

static POINT GetCenteredTopLeft(int clientW, int clientH)
{
    RECT work = GetPrimaryWorkArea();
    int monW = work.right - work.left;
    int monH = work.bottom - work.top;
    POINT pt;
    pt.x = work.left + (monW - clientW) / 2;
    pt.y = work.top + (monH - clientH) / 2;
    return pt;
}


/**
* @brief Renderer: V8 컨텍스트가 만들어질 때 라우터에 알림
*/
void SimpleApp::OnContextCreated(CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefFrame> frame,
    CefRefPtr<CefV8Context> context)
{
    if (!msg_router_renderer_) {
        CefMessageRouterConfig cfg; // 기본: window.cefQuery / window.cefQueryCancel
        msg_router_renderer_ = CefMessageRouterRendererSide::Create(cfg);
    }
    msg_router_renderer_->OnContextCreated(browser, frame, context);
}

void SimpleApp::OnContextReleased(CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefFrame> frame,
    CefRefPtr<CefV8Context> context)
{
    if (msg_router_renderer_)
        msg_router_renderer_->OnContextReleased(browser, frame, context);
}

bool SimpleApp::OnProcessMessageReceived(CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefFrame> frame,
    CefProcessId source_process,
    CefRefPtr<CefProcessMessage> message)
{
    if (msg_router_renderer_ &&
        msg_router_renderer_->OnProcessMessageReceived(browser, frame, source_process, message))
        return true;
    return false;
}

// 공통 커맨드라인 – file:// 정책 완화(자원 로드 허용)
void SimpleApp::OnBeforeCommandLineProcessing(const CefString& /*process_type*/,
    CefRefPtr<CefCommandLine> cmd) {
    // file:/// 페이지가 다른 file:/// 자원(css/js 등)을 로드할 수 있게 허용
    cmd->AppendSwitch("allow-file-access-from-files");
    cmd->AppendSwitch("allow-file-access");
    // 개발 중 CORS 이슈가 걸리면(필요시에만)
    cmd->AppendSwitch("disable-web-security");

    // DevTools 비활성화
    //cmd->AppendSwitch("disable-dev-tools");

    // [FIX] Windows 11 Alt+Tab 창 증식 버그 방지를 위해 하드웨어 가속 컴포지팅 활성화
    //md->AppendSwitch("disable-gpu");
    //cmd->AppendSwitch("disable-gpu-compositing");
    cmd->AppendSwitch("no-sandbox");

    // 1. 기존 가속 설정 확인 (이미 반영되어 있다면 유지)
    if (!cmd->HasSwitch("enable-gpu")) {
        cmd->AppendSwitch("enable-gpu");
        cmd->AppendSwitch("gpu-rasterization");
    }

    // 2. [수정] GPU 프로세스 격리 복원.
    // in-process-gpu + disable-gpu-sandbox는 IPC/샌드박스발 GPU 크래시를 줄여주지만,
    // 대신 GPU 프로세스와 렌더러 프로세스의 격리 경계를 없애버려 GPU 쪽 CHECK 실패(STATUS_BREAKPOINT)가
    // 발생하면 전체 페이지가 "Aw, Snap!"으로 죽는다(원래는 GPU 프로세스만 투명하게 재시작됨).
    // 실제 크래시 원인이었던 use-gl=desktop은 이미 아래에서 제거되어 있으므로, GPU 프로세스를
    // 다시 분리해 격리 경계를 되살린다. (docs/checkpoints/CEF_TextSelect_Crash_Analysis.md 참조)
    // cmd->AppendSwitch("in-process-gpu");
    // cmd->AppendSwitch("disable-gpu-sandbox");

    // 3. 구글 GCM 백그라운드 네트워킹 강제 비활성화
    cmd->AppendSwitch("disable-background-networking");
    cmd->AppendSwitch("disable-component-update"); // GCM 및 구글 컴포넌트 업데이트 시도 원천 차단
    cmd->AppendSwitch("disable-sync"); // 불필요한 동기화 통신 차단


    // GPU Test
    // [수정] ignore-gpu-blocklist 제거: 저사양/구형 GPU 드라이버는 Chromium 자체 블록리스트
    // 판단에 맡겨, 문제가 있는 하드웨어 조합에서는 자동으로 소프트웨어 렌더링으로 폴백되게 한다.
    // cmd->AppendSwitch("ignore-gpu-blocklist");

    // [Phase 3] machine.ini의 GPU_TIER 값에 따라 GPU 가속 스위치 세트를 분기한다.
    // LOW(저사양): D3D11 하드웨어 가속 대신 SwiftShader 소프트웨어 렌더링을 강제해,
    //   docs/checkpoints/CEF_TextSelect_Crash_Analysis.md에서 분석한 STATUS_BREAKPOINT
    //   크래시(저사양 GPU/드라이버에서 재현 빈도가 높음) 자체를 회피한다.
    // HIGH(기본값, 고사양): 기존과 동일하게 D3D11 하드웨어 가속 유지.
    if (MachineProfile::Instance().IsGpuTierLow()) {
        cmd->AppendSwitchWithValue("use-gl", "swiftshader");
        cmd->AppendSwitchWithValue("use-angle", "swiftshader");
    } else {
        // 2. GPU 래스터화 강제 활성화
        cmd->AppendSwitch("enable-gpu-rasterization");

        // 3. 캔버스 2D 가속 활성화
        cmd->AppendSwitch("enable-accelerated-2d-canvas");

        // 4. Zero-copy 비디오 디코딩 활성화 (메모리 효율)
        cmd->AppendSwitch("enable-zero-copy");

        // 5. WebGL 성능 최적화 (Windows 환경 충돌 원인 제거)
        // cmd->AppendSwitch("use-gl=desktop"); // <== 이 녀석이 GPU Crash의 주범입니다!
        cmd->AppendSwitchWithValue("use-angle", "d3d11"); // 안정적인 Direct3D 11 가속 사용
    }
    // end

    // ↓↓↓ 다크 모드 강제 (Chromium)
    cmd->AppendSwitch("force-dark-mode");
    // 페이지 강제 다크 렌더링 기능 (선택)
    cmd->AppendSwitchWithValue("enable-features", "WebContentsForceDark");

    // [FIX] Windows 11 Alt-Tab 고스트 창 증식 방지를 위한 오클루전 계산 비활성화
    cmd->AppendSwitchWithValue("disable-features", "CalculateNativeWinOcclusion");

    // Portal Build 시 디버깅.
    // 프론트엔드에서 .map 파일 생성해야 함.
	// vite.config..ts 에서 build.sourcemap = true 설정 해야함
    // 모든 오리진에서의 디버깅 요청을 허용한다는 뜻입니다.
    cmd->AppendSwitchWithValue("remote-allow-origins", "*");
    // 설정을 확실하게 하기 위해 명령줄 스위치로도 포트 지정
    cmd->AppendSwitchWithValue("remote-debugging-port", "9222");
}


void SimpleApp::OnContextInitialized() {
    CEF_REQUIRE_UI_THREAD();

    // 스킴 등록을 '브라우저 만들기' 전에 무조건 호출
    // 내부 구현: CefRegisterSchemeHandlerFactory("http","app", new AppSchemeHandlerFactory())
    //RegisterAppSchemeHandler();

    // 설정 부트스트랩
    AppConfig::bootstrap();

    auto command_line = CefCommandLine::GetGlobalCommandLine();
    const bool use_alloy =
        command_line->HasSwitch("use-alloy-style");
    const auto runtime_style =
        use_alloy ? CEF_RUNTIME_STYLE_ALLOY : CEF_RUNTIME_STYLE_DEFAULT;

    // 핸들러 준비
    CefRefPtr<SimpleHandler> handler(new SimpleHandler(use_alloy));
    handler->SetAppName("LW-Portal");

    // 스플래시 URL
    auto splashUrl = BuildPortalUrl(L"#/splash");

    // 스플래시 작은 창으로 시작
    CreatePortalWindow(
        splashUrl,
        runtime_style,
        handler,
        AppConfig::instance().splash_width ? AppConfig::instance().splash_width : 420,
        AppConfig::instance().splash_height ? AppConfig::instance().splash_height : 420,
        CEF_SHOW_STATE_HIDDEN,
        /*start_fullscreen=*/false);
}

CefRefPtr<CefClient> SimpleApp::GetDefaultClient() {
    return SimpleHandler::GetInstance();
}