#pragma once

#include <windows.h>

/**
 * @file WindowStyleUtil.h
 * @brief 보더리스(캡션 제거) + 리사이즈 + 작업영역 최대화/복원 + CEF 연동
 */

enum BorderlessFlags : unsigned {
    BLF_None = 0,
    BLF_Resizable = 1u << 0,
    BLF_BlockCtrlF4 = 1u << 1,
    BLF_BlockAltF4 = 1u << 2,
    BLF_DraggableWhole = 1u << 3,
    BLF_SkipTaskbar = 1u << 4,
};

constexpr UINT_PTR kHitTestRetryTimer = 0xB0B2;
constexpr UINT     kHitTestRetryIntervalMs = 50;
constexpr int      kHitTestRetryCount = 20;

/** @brief 스타일/리프레시 지연 처리용 사용자 메시지 */
constexpr UINT     WM_APP_REFRESH = WM_APP + 0x51;

//───────────────────────────────────────────────────────────
// Facade
//───────────────────────────────────────────────────────────
void ApplyBorderless(HWND hwndTop, unsigned flags);
void UninstallBorderless(HWND hwndTop);
void MaximizeToWorkArea(HWND hwndTop);
void RestoreFromSaved(HWND hwndTop);

//───────────────────────────────────────────────────────────
// CEF 렌더/자식 HWND 히트테스트(Resize) 서브클래스
//───────────────────────────────────────────────────────────
HWND FindCefHitTestTarget(HWND hwndTop);
HWND FindCefHitTestTargetDeep(HWND hwndTop);
void InstallHitTestSubclass(HWND hwndHitTest, unsigned flags);
void UpdateHitTestFlags(HWND hwndHitTest, unsigned flags);
void RemoveHitTestSubclass(HWND hwndHitTest);
void TryInstallHitTestOnTop(HWND hwndTop);

inline HWND GetTopLevelFromAny(HWND h) { return h ? ::GetAncestor(h, GA_ROOT) : nullptr; }

//───────────────────────────────────────────────────────────
// CEF 연동 등록/해제 (Win32 서브클래스에서 WasHidden/Refresh 호출 위함)
//───────────────────────────────────────────────────────────
class CefWindow;      // fwd
class CefBrowserView; // fwd

void RegisterCefForTop(HWND hwndTop, CefWindow* cefWin, CefBrowserView* cefBv);
void UnregisterCefForTop(HWND hwndTop);
