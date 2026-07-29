#include "pch.h"
#include "WindowStyleUtil.h"

#include <algorithm>
#include <vector>
#include <map>
#include <commctrl.h>
#include <dwmapi.h>

#pragma comment(lib, "comctl32.lib")
#pragma comment(lib, "dwmapi.lib")

// CEF 호출에 필요
#include "include/cef_browser.h"
#include "include/views/cef_window.h"
#include "include/views/cef_browser_view.h"

// SDK 호환
#ifndef DWMWA_USE_IMMERSIVE_DARK_MODE
#define DWMWA_USE_IMMERSIVE_DARK_MODE 20
#endif
#ifndef DWMWA_WINDOW_CORNER_PREFERENCE
#define DWMWA_WINDOW_CORNER_PREFERENCE 33
#endif
#ifndef DWMWA_BORDER_COLOR
#define DWMWA_BORDER_COLOR 34
#endif
#ifndef DWMWCP_ROUND
#define DWMWCP_DEFAULT     0
#define DWMWCP_DONOTROUND  1
#define DWMWCP_ROUND       2
#define DWMWCP_ROUNDSMALL  3
#endif

static const UINT_PTR kSubclassIdDevtoolsBlocker = 0xD7E2A11; // unique

namespace {
    constexpr int kTopDragHeight = 0; ///< 캡션 영역 없음(FE가 드래그 담당)
    int  g_hitTestRetry = 0;
    bool g_inSize = false;

    struct SavedRect { RECT rc{}; bool has = false; } g_saved;

    struct CefGlue {
        CefRefPtr<CefWindow>      win;
        CefRefPtr<CefBrowserView> bv;
    };
    // hwndTop → CEF 포인터 매핑 (메인 Top만 등록)
    std::map<HWND, CefGlue> g_cefMap;
}

// DPI에 따른 리사이즈 경계 픽셀
static inline int GetResizeBorderPx(HWND) {
    const int frame = ::GetSystemMetrics(SM_CXFRAME);
    const int pad = ::GetSystemMetrics(SM_CXPADDEDBORDER);
    return (std::max)(8, frame + pad);
}

//───────────────────────────────────────────────────────────
// DWM/Corner/Border
//───────────────────────────────────────────────────────────
static void ApplyDwmAttributesIfAvailable(HWND hwnd) {
    if (!::IsWindow(hwnd)) return;

    BOOL dark = TRUE;
    ::DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, &dark, sizeof(dark));
    const UINT DWMWA_USE_IMMERSIVE_DARK_MODE_OLD = 19;
    ::DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE_OLD, &dark, sizeof(dark));

    UINT corner = DWMWCP_ROUND;
    ::DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &corner, sizeof(corner));

    const COLORREF transparent = 0x00000000;
    ::DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, &transparent, sizeof(transparent));

    MARGINS m0{ 0,0,0,0 };
    ::DwmExtendFrameIntoClientArea(hwnd, &m0);
}

static void SetCornerAndBorderForState(HWND hwnd, bool maximized) {
    if (!::IsWindow(hwnd)) return;

    UINT corner = maximized ? DWMWCP_DONOTROUND : DWMWCP_ROUND;
    ::DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &corner, sizeof(corner));

    COLORREF border = maximized ? RGB(0, 0, 0) : 0x00000000;
    ::DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, &border, sizeof(border));

    MARGINS m0{ 0,0,0,0 };
    ::DwmExtendFrameIntoClientArea(hwnd, &m0);
}

//───────────────────────────────────────────────────────────
// 스타일 적용
//───────────────────────────────────────────────────────────
static void ToggleThickFrame(HWND hwnd, bool enable) {
    if (!::IsWindow(hwnd)) return;
    LONG_PTR style = ::GetWindowLongPtr(hwnd, GWL_STYLE);
    if (enable) style |= WS_THICKFRAME;
    else        style &= ~WS_THICKFRAME;
    ::SetWindowLongPtr(hwnd, GWL_STYLE, style);
    ::SetWindowPos(hwnd, nullptr, 0, 0, 0, 0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
}

static void ApplyBaseStyle(HWND hwnd, unsigned flags) {
    LONG_PTR style = ::GetWindowLongPtr(hwnd, GWL_STYLE);
    LONG_PTR ex = ::GetWindowLongPtr(hwnd, GWL_EXSTYLE);

    style &= ~(WS_CAPTION | WS_OVERLAPPED);
    style |= (WS_POPUP | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_THICKFRAME);

    if (flags & BLF_SkipTaskbar) {
        ex |= WS_EX_TOOLWINDOW;
        ex &= ~WS_EX_APPWINDOW;
    } else {
        ex &= ~WS_EX_TOOLWINDOW;
        ex |= WS_EX_APPWINDOW;
    }

    ::SetWindowLongPtr(hwnd, GWL_STYLE, style);
    ::SetWindowLongPtr(hwnd, GWL_EXSTYLE, ex);
    ::SetWindowPos(hwnd, nullptr, 0, 0, 0, 0,
        SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
}

static void FixWorkAreaOffByOne(HWND hwndTop) {
    if (!::IsWindow(hwndTop)) return;

    HMONITOR hMon = ::MonitorFromWindow(hwndTop, MONITOR_DEFAULTTONEAREST);
    MONITORINFO mi{ sizeof(mi) };
    if (!::GetMonitorInfo(hMon, &mi)) return;

    RECT wr{}; ::GetWindowRect(hwndTop, &wr);
    const RECT& w = mi.rcWork;

    int dx = 0, dy = 0, dw = 0, dh = 0;
    if (wr.left != w.left)   dx = w.left - wr.left;
    if (wr.top != w.top)    dy = w.top - wr.top;
    if (wr.right != w.right)  dw = (w.right - w.left) - (wr.right - wr.left);
    if (wr.bottom != w.bottom) dh = (w.bottom - w.top) - (wr.bottom - wr.top);

    if (dx || dy || dw || dh) {
        ::SetWindowPos(hwndTop, HWND_TOP,
            wr.left + dx, wr.top + dy,
            (wr.right - wr.left) + dw,
            (wr.bottom - wr.top) + dh,
            SWP_NOOWNERZORDER | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    }
}

//───────────────────────────────────────────────────────────
// CEF 렌더 HWND 탐색 — DevTools(Top-level) 제외 필터링
//───────────────────────────────────────────────────────────

//static bool IsAllowedCefClassForHitTest(const wchar_t* cls) {
//    if (!cls) return false;
//    // 렌더/브라우저 뷰/윈도우(자식일 때만)
//    if (lstrcmpiW(cls, L"Chrome_RenderWidgetHostHWND") == 0) return true;
//    if (lstrcmpiW(cls, L"CefBrowserWindow") == 0) return true;
//    if (lstrcmpiW(cls, L"CefBrowserView") == 0) return true;
//    // Chrome_WidgetWin_0 는 DevTools top-level 도 사용하므로 제외
//    return false;
//}

static bool IsAllowedCefClassForHitTest(const wchar_t* cls) {
    if (!cls) return false;
    // 오직 렌더 위젯만 허용 (DevTools/Chrome_WidgetWin_0 등 완전 배제)
    return lstrcmpiW(cls, L"Chrome_RenderWidgetHostHWND") == 0;
}

//static bool IsPotentialRenderChild(HWND h, HWND hwndTop) {
//    if (!::IsWindow(h)) return false;
//
//    // 1) 자식만 허용(DevTools는 보통 top-level)
//    LONG_PTR style = ::GetWindowLongPtr(h, GWL_STYLE);
//    if ((style & WS_CHILD) == 0) return false;
//
//    // 2) 동일 루트
//    if (::GetAncestor(h, GA_ROOT) != hwndTop) return false;
//
//    // 3) 거의 전체 영역
//    RECT rcTop{}; ::GetClientRect(hwndTop, &rcTop);
//    RECT rc{};    ::GetClientRect(h, &rc);
//    const int wTop = rcTop.right - rcTop.left;
//    const int hTop = rcTop.bottom - rcTop.top;
//    const int width = rc.right - rc.left;
//    const int height = rc.bottom - rc.top;
//    if (width < (wTop * 9) / 10) return false;
//    if (height < (hTop * 9) / 10) return false;
//
//    return true;
//}

static bool IsPotentialRenderChild(HWND h, HWND hwndTop) {
    if (!::IsWindow(h)) return false;
    LONG_PTR style = ::GetWindowLongPtr(h, GWL_STYLE);
    if ((style & WS_CHILD) == 0) return false;              // 자식만
    if (::GetAncestor(h, GA_ROOT) != hwndTop) return false; // 동일 루트
    RECT rt{}, rc{}; ::GetClientRect(hwndTop, &rt); ::GetClientRect(h, &rc);
    int wTop = rt.right - rt.left, hTop = rt.bottom - rt.top;
    int wSize = rc.right - rc.left, hSize = rc.bottom - rc.top;
    return (wSize >= (wTop * 9) / 10) && (hSize >= (hTop * 9) / 10);
}

HWND FindCefHitTestTarget(HWND hwndTop) {
    if (!::IsWindow(hwndTop)) return nullptr;
    HWND child = ::GetWindow(hwndTop, GW_CHILD);
    wchar_t cls[128] = { 0 };

    while (child) {
        if (::IsWindowVisible(child)) {
            ::GetClassNameW(child, cls, 127);
            if (IsAllowedCefClassForHitTest(cls) && IsPotentialRenderChild(child, hwndTop)) {
                return child;
            }
        }
        child = ::GetWindow(child, GW_HWNDNEXT);
    }
    return nullptr;
}

static HWND FindCefHitTestTargetDeepImpl(HWND hwndTop) {
    std::vector<HWND> q; q.push_back(hwndTop);
    wchar_t cls[128] = { 0 };

    while (!q.empty()) {
        HWND h = q.back(); q.pop_back();
        if (!::IsWindow(h)) continue;

        LONG_PTR style = ::GetWindowLongPtr(h, GWL_STYLE);
        if ((style & WS_CHILD) && ::IsWindowVisible(h)) {
            ::GetClassNameW(h, cls, 127);
            if (IsAllowedCefClassForHitTest(cls) && IsPotentialRenderChild(h, hwndTop)) {
                return h;
            }
        }
        for (HWND c = ::GetWindow(h, GW_CHILD); c; c = ::GetWindow(c, GW_HWNDNEXT)) {
            q.push_back(c);
        }
    }
    return nullptr;
}

HWND FindCefHitTestTargetDeep(HWND hwndTop) {
    if (HWND h = FindCefHitTestTarget(hwndTop)) return h;
    if (HWND d = FindCefHitTestTargetDeepImpl(hwndTop)) return d;
    return nullptr;
}

//───────────────────────────────────────────────────────────
// HitTest 서브클래스(자식 렌더 HWND에만 설치)
//───────────────────────────────────────────────────────────
static LRESULT CALLBACK HitTestProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam,
    UINT_PTR, DWORD_PTR refData) {
    const unsigned flags = static_cast<unsigned>(refData);
    const bool     resizable = (flags & BLF_Resizable) != 0;
    const bool     dragAnywhere = (flags & BLF_DraggableWhole) != 0;

    switch (msg) {
    case WM_NCHITTEST: {
        if (!resizable || ::IsZoomed(::GetAncestor(hwnd, GA_ROOT))) {
            return dragAnywhere ? HTCAPTION : HTCLIENT;
        }
        const int b = GetResizeBorderPx(hwnd);
        POINT pt{ GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
        RECT wr; ::GetWindowRect(hwnd, &wr);

        const bool L = (pt.x <= wr.left + b);
        const bool R = (pt.x >= wr.right - b);
        const bool T = (pt.y <= wr.top + b);
        const bool B = (pt.y >= wr.bottom - b);

        if (T && L) return HTTOPLEFT;
        if (T && R) return HTTOPRIGHT;
        if (B && L) return HTBOTTOMLEFT;
        if (B && R) return HTBOTTOMRIGHT;
        if (L)     return HTLEFT;
        if (R)     return HTRIGHT;
        if (T)     return HTTOP;
        if (B)     return HTBOTTOM;
        return dragAnywhere ? HTCAPTION : HTCLIENT;
    }
    }
    return ::DefSubclassProc(hwnd, msg, wParam, lParam);
}

void InstallHitTestSubclass(HWND hwndHitTest, unsigned flags) {
    if (!::IsWindow(hwndHitTest)) return;
    ::RemoveWindowSubclass(hwndHitTest, HitTestProc, 0xB0B1);
    ::SetWindowSubclass(hwndHitTest, HitTestProc, 0xB0B1, static_cast<DWORD_PTR>(flags));
}

void UpdateHitTestFlags(HWND hwndHitTest, unsigned flags) {
    InstallHitTestSubclass(hwndHitTest, flags);
}

void RemoveHitTestSubclass(HWND hwndHitTest) {
    if (!::IsWindow(hwndHitTest)) return;
    ::RemoveWindowSubclass(hwndHitTest, HitTestProc, 0xB0B1);
}

void TryInstallHitTestOnTop(HWND hwndTop) {
    if (!::IsWindow(hwndTop)) return;
    if (HWND target = FindCefHitTestTarget(hwndTop)) {
        InstallHitTestSubclass(target, BLF_Resizable);
        OutputDebugStringW(L"[HitTest] installed on render child\n");
    }
    else if (HWND deep = FindCefHitTestTargetDeepImpl(hwndTop)) {
        InstallHitTestSubclass(deep, BLF_Resizable);
        OutputDebugStringW(L"[HitTest] installed on deep render child\n");
    }
    else {
        OutputDebugStringW(L"[HitTest] render child not found yet\n");
    }
}

//───────────────────────────────────────────────────────────
// CEF 강제 리프레시/숨김 헬퍼
//───────────────────────────────────────────────────────────
namespace {
    void CefForceRefresh(HWND hwndTop, bool ensureShown)
    {
        auto it = g_cefMap.find(hwndTop);
        if (it == g_cefMap.end()) return;         // 메인 Top이 아니면 무시(DevTools 안전)
        auto win = it->second.win;
        auto bv = it->second.bv;
        if (!win || !bv) return;

        if (ensureShown) {
            if (auto br = bv->GetBrowser()) {
                if (auto host = br->GetHost()) {
                    host->WasHidden(false);       // ★ 복원 시 가장 먼저
                }
            }
        }

        RECT rc{}; ::GetClientRect(hwndTop, &rc);
        const int cx = rc.right - rc.left;
        const int cy = rc.bottom - rc.top;

        bv->SetBounds(CefRect(0, 0, cx, cy));

        if (auto br = bv->GetBrowser()) {
            if (auto host = br->GetHost()) {
                host->NotifyMoveOrResizeStarted();
                host->WasResized();
                host->Invalidate(PET_VIEW);
                // host->SetFocus(true); // 포커스를 강제로 가져오면 React 텍스트 상자 입력이 끊길 수 있으므로 제거
            }
        }

        // 렌더 자식에게 WM_SIZE를 반복해서 보내는 부분은 주석 처리 (웹 화면 전체 리사이징 울렁거림/크래시의 원인 중 하나)
        /*
        if (HWND cefChild = FindCefHitTestTargetDeep(hwndTop)) {
            ::ShowWindow(cefChild, SW_SHOWNA);
            ::SendMessageW(cefChild, WM_SIZE, SIZE_RESTORED, MAKELPARAM(cx, cy));
        }
        */

        ::RedrawWindow(hwndTop, nullptr, nullptr,
            RDW_INVALIDATE | RDW_ERASE | RDW_ALLCHILDREN | RDW_UPDATENOW);
    }

    void CefMarkHidden(HWND hwndTop)
    {
        auto it = g_cefMap.find(hwndTop);
        if (it == g_cefMap.end()) return;         // 메인 Top이 아니면 무시
        auto bv = it->second.bv;
        if (!bv) return;
        if (auto br = bv->GetBrowser()) {
            if (auto host = br->GetHost()) {
                host->WasHidden(true);
            }
        }
    }
}

//───────────────────────────────────────────────────────────
// 등록/해제
//───────────────────────────────────────────────────────────
void RegisterCefForTop(HWND hwndTop, CefWindow* cefWin, CefBrowserView* cefBv)
{
    if (!::IsWindow(hwndTop) || !cefWin || !cefBv) return;
    g_cefMap[hwndTop] = { cefWin, cefBv };
}
void UnregisterCefForTop(HWND hwndTop) { g_cefMap.erase(hwndTop); }

//───────────────────────────────────────────────────────────
// Borderless 본체 서브클래스
//───────────────────────────────────────────────────────────
static LRESULT CALLBACK BorderlessProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam,
    UINT_PTR, DWORD_PTR refData)
{
    const unsigned flags = static_cast<unsigned>(refData);
    const bool     canResize = (flags & BLF_Resizable) != 0;
    const bool     blockAltF4 = (flags & BLF_BlockAltF4) != 0;
    const bool     dragAnywhere = (flags & BLF_DraggableWhole) != 0;

    switch (msg) {
    case WM_CREATE:
        ApplyDwmAttributesIfAvailable(hwnd);
        g_hitTestRetry = 0;
        TryInstallHitTestOnTop(hwnd);
        ::SetTimer(hwnd, kHitTestRetryTimer, kHitTestRetryIntervalMs, nullptr);
        break;

    case WM_NCCALCSIZE:
        if (!canResize && wParam) return 0;
        break;

    case WM_NCACTIVATE:
        break; // 기본 처리(합성 지연 방지)

    case WM_GETMINMAXINFO: {
        auto* mmi = reinterpret_cast<MINMAXINFO*>(lParam);
        HMONITOR hMon = ::MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        MONITORINFO mi{ sizeof(mi) };
        if (::GetMonitorInfo(hMon, &mi)) {
            const RECT& w = mi.rcWork;
            const RECT& m = mi.rcMonitor;
            mmi->ptMaxPosition.x = w.left - m.left;
            mmi->ptMaxPosition.y = w.top - m.top;
            mmi->ptMaxSize.x = w.right - w.left;
            mmi->ptMaxSize.y = w.bottom - w.top;
        }
        return 0;
    }

    case WM_SYSCOMMAND: {
        const auto cmd = (wParam & 0xFFF0);
        if (blockAltF4 && cmd == SC_CLOSE) return 0;

        if (cmd == SC_MAXIMIZE) {
            PostMessage(hwnd, WM_APP_REFRESH, /*maximize*/1, 0);
            return 0;
        }
        if (cmd == SC_RESTORE) {
            if (::IsIconic(hwnd)) {
                // 아이코닉이면 OS 기본 복원 흐름 통과
                return ::DefSubclassProc(hwnd, msg, wParam, lParam);
            }
            PostMessage(hwnd, WM_APP_REFRESH, /*maximize*/0, 0);
            return 0;
        }
        break;
    }

    case WM_NCHITTEST: {
        POINT pt{ GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
        RECT  wr; ::GetWindowRect(hwnd, &wr);

        if (pt.y < wr.top + kTopDragHeight) return HTCLIENT;

        if (canResize && !::IsZoomed(hwnd)) {
            const int b = GetResizeBorderPx(hwnd);
            const bool L = pt.x < wr.left + b;
            const bool R = pt.x > wr.right - b;
            const bool T = pt.y < wr.top + b;
            const bool B = pt.y > wr.bottom - b;

            if (T && L) return HTTOPLEFT;
            if (T && R) return HTTOPRIGHT;
            if (B && L) return HTBOTTOMLEFT;
            if (B && R) return HTBOTTOMRIGHT;
            if (T)     return HTTOP;
            if (B)     return HTBOTTOM;
            if (L)     return HTLEFT;
            if (R)     return HTRIGHT;
        }
        return dragAnywhere ? HTCAPTION : HTCLIENT;
    }

    case WM_SIZE: {
        if (g_inSize) break;
        g_inSize = true;

        switch (wParam) {
        case SIZE_MINIMIZED:
            CefMarkHidden(hwnd); // 최소화 시 즉시 숨김
            break;

        case SIZE_MAXIMIZED:
        case SIZE_RESTORED:
            // 즉시 스타일/리프레시 금지 → 한 틱 지연
            PostMessage(hwnd, WM_APP_REFRESH, (wParam == SIZE_MAXIMIZED) ? 1 : 0, 0);
            break;
        }
        g_inSize = false;
        return 0;
    }

    case WM_SHOWWINDOW:
        if (wParam == TRUE && !::IsIconic(hwnd)) {
            // 창이 보여질 때 항상 강제로 리프레시하면 React 로딩 즈음에 "울렁거림" 발생.
            // 기본 그리기만 보장 (cef_browser_host WasHidden 해제)
            CefForceRefresh(hwnd, true);
        }
        break;

    case WM_TIMER:
        if (wParam == kHitTestRetryTimer) {
            TryInstallHitTestOnTop(hwnd);
            if (++g_hitTestRetry >= kHitTestRetryCount) {
                ::KillTimer(hwnd, kHitTestRetryTimer);
            }
            return 0;
        }
        break;

    case WM_DPICHANGED: {
        RECT* prcNew = reinterpret_cast<RECT*>(lParam);
        ::SetWindowPos(hwnd, nullptr,
            prcNew->left, prcNew->top,
            prcNew->right - prcNew->left,
            prcNew->bottom - prcNew->top,
            SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
        if (::IsZoomed(hwnd)) {
            FixWorkAreaOffByOne(hwnd);
        }
        PostMessage(hwnd, WM_APP_REFRESH, ::IsZoomed(hwnd) ? 1 : 0, 0);
        return 0;
    }

    case WM_APP_REFRESH: {
        if (g_cefMap.find(hwnd) == g_cefMap.end()) return 0;
        if (::IsIconic(hwnd)) return 0;

        // 중복 호출 최적화 (이전 상태와 동일하면 무시)
        static std::map<HWND, BOOL> s_lastZoomState;
        const BOOL isMax = ::IsZoomed(hwnd);

        // 변경된 경우에만 창 프레임을 갱신
        if (s_lastZoomState.find(hwnd) == s_lastZoomState.end() || s_lastZoomState[hwnd] != isMax) {
            s_lastZoomState[hwnd] = isMax;

            if (isMax) {
                ToggleThickFrame(hwnd, false);
                SetCornerAndBorderForState(hwnd, true);
                FixWorkAreaOffByOne(hwnd);
            }
            else {
                ToggleThickFrame(hwnd, true);
                SetCornerAndBorderForState(hwnd, false);
            }
        }

        // 복원/표시 직후 강제 리프레시 (숨김 해제 포함)
        CefForceRefresh(hwnd, /*ensureShown=*/true);

        return 0;
    }

    } // switch

    return ::DefSubclassProc(hwnd, msg, wParam, lParam);
}

//───────────────────────────────────────────────────────────
// Public API
//───────────────────────────────────────────────────────────
void ApplyBorderless(HWND hwndTop, unsigned flags) {
    if (!::IsWindow(hwndTop)) return;

    // [SAFETY] 자식 윈도우(WS_CHILD)에 대해서는 ApplyBorderless를 수행하지 않습니다.
    // 자식 윈도우에 WS_POPUP 스타일을 주면 별개의 최상위 창으로 승격되어 Alt-Tab 리스트에 중복 생성됩니다.
    if (::GetWindowLongPtr(hwndTop, GWL_STYLE) & WS_CHILD) {
        OutputDebugStringW(L"[WARNING] ApplyBorderless called on CHILD window. Ignoring to prevent Alt-Tab duplication.\n");
        return;
    }
    ::RemoveWindowSubclass(hwndTop, BorderlessProc, 1);
    ::SetWindowSubclass(hwndTop, BorderlessProc, 1, static_cast<DWORD_PTR>(flags));
    ApplyBaseStyle(hwndTop, flags);
    ApplyDwmAttributesIfAvailable(hwndTop);
}

void UninstallBorderless(HWND hwndTop) {
    if (!::IsWindow(hwndTop)) return;
    ::RemoveWindowSubclass(hwndTop, BorderlessProc, 1);
}

void MaximizeToWorkArea(HWND hwndTop) {
    if (!::IsWindow(hwndTop)) return;

    if (!g_saved.has) {
        ::GetWindowRect(hwndTop, &g_saved.rc);
        g_saved.has = true;
    }

    ToggleThickFrame(hwndTop, false);

    HMONITOR hMon = ::MonitorFromWindow(hwndTop, MONITOR_DEFAULTTONEAREST);
    MONITORINFO mi{ sizeof(mi) };
    if (::GetMonitorInfo(hMon, &mi)) {
        const RECT& w = mi.rcWork;
        ::SetWindowPos(hwndTop, HWND_TOP, w.left, w.top,
            w.right - w.left, w.bottom - w.top,
            SWP_NOOWNERZORDER | SWP_NOZORDER | SWP_SHOWWINDOW | SWP_FRAMECHANGED);
    }

    SetCornerAndBorderForState(hwndTop, true);
}

void RestoreFromSaved(HWND hwndTop) {
    if (!::IsWindow(hwndTop) || !g_saved.has) return;

    if (::IsIconic(hwndTop)) {
        ::ShowWindow(hwndTop, SW_RESTORE);
    }

    const RECT& r = g_saved.rc;
    ::SetWindowPos(hwndTop, HWND_TOP, r.left, r.top,
        r.right - r.left, r.bottom - r.top,
        SWP_NOOWNERZORDER | SWP_NOZORDER | SWP_SHOWWINDOW | SWP_FRAMECHANGED);

    g_saved.has = false;

    ToggleThickFrame(hwndTop, true);
    SetCornerAndBorderForState(hwndTop, false);

    ::RedrawWindow(hwndTop, nullptr, nullptr,
        RDW_INVALIDATE | RDW_ERASE | RDW_ALLCHILDREN | RDW_UPDATENOW);
}

static LRESULT CALLBACK DevtoolsBlockerProc(
    HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam,
    UINT_PTR, DWORD_PTR)
{
    switch (msg) {
    case WM_KEYDOWN:
    case WM_SYSKEYDOWN:
    {
        const bool ctrl = (GetKeyState(VK_CONTROL) & 0x8000) != 0;
        const bool shift = (GetKeyState(VK_SHIFT) & 0x8000) != 0;

        const WPARAM vk = wParam;
        if (vk == VK_F12) return 0;                          // ★ F12 완전 차단
        //if (ctrl && shift && (vk == 'I' || vk == 'J')) return 0; // ★ Ctrl+Shift+I/J 차단
        break;
    }
    default: break;
    }
    return DefSubclassProc(hwnd, msg, wParam, lParam);
}

// CEF 렌더 위젯을 찾아 같은 서브클래스도 설치
static void AttachBlockerToRenderChild(HWND top)
{
    if (!IsWindow(top)) return;

    // 프로젝트에 이미 있는 헬퍼를 쓰세요. 없으면 FindWindowEx로 대체 가능.
    HWND child = FindCefHitTestTargetDeep(top); // RenderWidgetHostHWND
    if (child && IsWindow(child))
        SetWindowSubclass(child, DevtoolsBlockerProc, kSubclassIdDevtoolsBlocker, 0);
}

