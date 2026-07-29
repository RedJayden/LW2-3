#include "pch.h"
#include "WindowFactory.h"

#include <dwmapi.h>
#pragma comment(lib, "dwmapi.lib")

#include <functional>

#include "WindowStyleUtil.h"        // RegisterCefForTop, TryInstallHitTestOnTop ...
#include "simple_handler.h"
#include "Core/AppInitial/AppConfig.h"

#include "include/cef_app.h"
#include "include/cef_browser.h"
#include "include/views/cef_browser_view.h"
#include "include/views/cef_window.h"
#include "include/wrapper/cef_helpers.h"

//───────────────────────────────────────────────────────────
// UI 스레드 실행 유틸
//───────────────────────────────────────────────────────────

class RunOnUI : public CefTask {
public:
    explicit RunOnUI(std::function<void()> fn) : fn_(std::move(fn)) {}
    void Execute() override { if (fn_) fn_(); }
private:
    std::function<void()> fn_;
    IMPLEMENT_REFCOUNTING(RunOnUI);
};

static inline void PostUI(std::function<void()> fn) {
    CefPostTask(TID_UI, new RunOnUI(std::move(fn)));
}

static inline void PostDelayedUI(int delay_ms, std::function<void()> fn) {
    CefPostDelayedTask(TID_UI, new RunOnUI(std::move(fn)), delay_ms);
}

//───────────────────────────────────────────────────────────
// Facade: 브라우저/윈도우 강제 리프레시 (Win32 경로도 호출하므로 보조용)
//───────────────────────────────────────────────────────────

static void ForceBrowserRefresh_(CefRefPtr<CefWindow> window,
    CefRefPtr<CefBrowserView> browser_view)
{
    if (!window) return;

    HWND hwndTop = window->GetWindowHandle();
    if (!::IsWindow(hwndTop) || !::IsWindowVisible(hwndTop))
        return;

    RECT rc{}; ::GetClientRect(hwndTop, &rc);
    const int cx = rc.right - rc.left;
    const int cy = rc.bottom - rc.top;

    if (browser_view) {
        browser_view->SetBounds(CefRect(0, 0, cx, cy));
        if (auto br = browser_view->GetBrowser()) {
            if (auto host = br->GetHost()) {
                host->WasHidden(false);              // 표시 직후 숨김 해제
                host->NotifyMoveOrResizeStarted();
                host->WasResized();
                host->Invalidate(PET_VIEW);
                host->SetFocus(true);
            }
        }
    }

    if (HWND cefChild = FindCefHitTestTargetDeep(hwndTop)) {
        ::ShowWindow(cefChild, SW_SHOWNA);
        ::SendMessageW(cefChild, WM_SIZE, SIZE_RESTORED, MAKELPARAM(cx, cy));
    }

    ::RedrawWindow(hwndTop, nullptr, nullptr,
        RDW_INVALIDATE | RDW_ERASE | RDW_ALLCHILDREN | RDW_UPDATENOW);
}

namespace {

    class PortalBrowserViewDelegate : public CefBrowserViewDelegate {
    public:
        explicit PortalBrowserViewDelegate(cef_runtime_style_t style) : style_(style) {}
        cef_runtime_style_t GetBrowserRuntimeStyle() override { return style_; }
    private:
        const cef_runtime_style_t style_;
        IMPLEMENT_REFCOUNTING(PortalBrowserViewDelegate);
    };

    class PortalWindowDelegate : public CefWindowDelegate {
    public:
        PortalWindowDelegate(CefRefPtr<CefBrowserView> browser_view,
            cef_runtime_style_t runtime_style,
            cef_show_state_t    initial_show_state,
            int width, int height,
            bool start_fullscreen,
            bool is_splash)
            : browser_view_(browser_view),
            runtime_style_(runtime_style),
            initial_show_state_(initial_show_state),
            width_(width), height_(height),
            start_fullscreen_(start_fullscreen),
            is_splash_(is_splash) {
        }

        // 초기에 절대 Show() 하지 말고 보더리스/HitTest 등 모든 셋업을 완료한 뒤,
        // **첫 로드 완료 시점(SimpleHandler::OnLoadEnd)**에만 보여줍니다. (스플래시/메인 공통)
        void OnWindowCreated(CefRefPtr<CefWindow> window) override {
            window->SetTitle(is_splash_ ? "LASERnGRAPN Main" : "LASERnGRAPN");
            window->AddChildView(browser_view_);

            const auto& config = AppConfig::instance();
            const int w = is_splash_ ? config.splash_width : config.main_width;
            const int h = is_splash_ ? config.splash_height : config.main_height;
            window->SetSize(CefSize(w, h));

            if (HWND hwnd = window->GetWindowHandle()) {
                RECT rc{}; ::GetClientRect(hwnd, &rc);
                if (browser_view_) {
                    browser_view_->SetBounds(CefRect(0, 0, rc.right - rc.left, rc.bottom - rc.top));
                }

                // 처음엔 항상 숨김
                window->SetVisible(false);

                if (is_splash_) {
                    ApplyBorderless(hwnd, BLF_DraggableWhole | BLF_SkipTaskbar);
                    window->CenterWindow(CefSize(width_, height_));
                    window->Show(); // 반드시 한 번 호출
                }
                else {
                    ApplyBorderless(hwnd, BLF_Resizable);
                    window->Show();
                    TryInstallHitTestOnTop(hwnd);
                    ::SetTimer(hwnd, kHitTestRetryTimer, kHitTestRetryIntervalMs, nullptr);
                }

                // Win32 서브클래스가 WasHidden/Refresh를 수행할 수 있도록 등록
                RegisterCefForTop(hwnd, window.get(), browser_view_.get());
            }
        }

        void OnWindowBoundsChanged(CefRefPtr<CefWindow> window, const CefRect&) override {
            // 경계 변화마다 보조 리프레시
            ForceBrowserRefresh_(window, browser_view_);
            if (HWND hwnd = window->GetWindowHandle()) {
                TryInstallHitTestOnTop(hwnd);
            }
        }

        void OnWindowDestroyed(CefRefPtr<CefWindow> window) override {
            if (HWND hwnd = window->GetWindowHandle()) {
                UninstallBorderless(hwnd);
                UnregisterCefForTop(hwnd); // 등록 해제
            }
            browser_view_ = nullptr;
        }

        bool CanClose(CefRefPtr<CefWindow> /*window*/) override {
            if (auto browser = browser_view_ ? browser_view_->GetBrowser() : nullptr) {
                return browser->GetHost()->TryCloseBrowser();
            }
            return true;
        }

        CefSize GetPreferredSize(CefRefPtr<CefView>) override {
            return CefSize(width_, height_);
        }

        cef_runtime_style_t GetWindowRuntimeStyle() override {
            return runtime_style_;
        }

        // 140.1에서는 OnAccelerator/SetAccelerator 시그니처가 다르므로 사용하지 않음.
        // (F12/Inspect는 SimpleHandler::OnPreKeyEvent에서 ShowDevTools로 처리)

    private:
        CefRefPtr<CefBrowserView>  browser_view_;
        const cef_runtime_style_t  runtime_style_;
        const cef_show_state_t     initial_show_state_;
        const int                  width_, height_;
        const bool                 start_fullscreen_;
        const bool                 is_splash_;

        IMPLEMENT_REFCOUNTING(PortalWindowDelegate);
        DISALLOW_COPY_AND_ASSIGN(PortalWindowDelegate);
    };

    inline bool IsSplashUrl(const CefString& url) {
        const std::string u = url.ToString();
        // Main if explicitly "main" or "#/main"
        if (u.find("main") != std::string::npos || u.find("#/main") != std::string::npos)
            return false;
        // Default to Splash for "splash", empty hash, or "index.html"
        return true;
    }

} // namespace

//───────────────────────────────────────────────────────────
// Public API
//───────────────────────────────────────────────────────────

CefRefPtr<CefBrowser> CreatePortalWindow(const CefString& url,
    cef_runtime_style_t runtime_style,
    CefRefPtr<SimpleHandler> handler,
    int width, int height,
    cef_show_state_t show_state,
    bool start_fullscreen)
{
    CEF_REQUIRE_UI_THREAD();

    const bool is_splash = IsSplashUrl(url);

    CefBrowserSettings browser_settings;
    // 렌더 지연 시 플래싱 방지용 어두운 배경
    browser_settings.background_color = CefColorSetARGB(255, 26, 26, 26);

    CefRefPtr<CefBrowserView> browser_view = CefBrowserView::CreateBrowserView(
        handler, url, browser_settings, nullptr, nullptr,
        new PortalBrowserViewDelegate(runtime_style));

    CefWindow::CreateTopLevelWindow(new PortalWindowDelegate(
        browser_view,
        runtime_style,
        show_state,
        width, height,
        start_fullscreen,
        is_splash));

    return browser_view->GetBrowser();
}
