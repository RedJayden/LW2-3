#include "pch.h"
#include "DevtoolsKeyBlocker.h"

#include <windowsx.h>
#include <commctrl.h>
#include <atomic>

static HHOOK g_kbdHook = nullptr;
static std::atomic<bool> g_hookInstalled{ false };

// --- 유틸 ---
static inline bool IsCtrlDown() { return (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0; }
static inline bool IsShiftDown() { return (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0; }
static inline bool IsAltDown() { return (GetAsyncKeyState(VK_MENU) & 0x8000) != 0; }

// F1~F24 범위 확인
static inline bool IsFunctionKey(DWORD vk) { return vk >= VK_F1 && vk <= VK_F24; }

// 차단 여부 판정 (keydown 시점에만 사용)
static bool ShouldBlock(DWORD vk) {
    //// Alt+F4
    //if (vk == VK_F4 && IsAltDown()) return true;

    //// Esc
    //if (vk == VK_ESCAPE) return true;

    //// F1~F24 전부
    //if (IsFunctionKey(vk)) return true;

    //// Ctrl+Shift+I/J (디버깅/DevTools 단축키)
    ////if ((vk == 'I' || vk == 'J') && IsCtrlDown() && IsShiftDown()) return true;

    //// DevTools 핫키 (혹시 OS 레벨에서 올 경우)
    //if (vk == VK_F12) return true;

    return false;
}

// --- 저수준 키보드 훅 (프로세스 전체 키 입력을 가장 먼저 걸러냄) ---
static LRESULT CALLBACK LowLevelKeyboardProc(int code, WPARAM wParam, LPARAM lParam)
{
    if (0)//code == HC_ACTION)
    {
        OutputDebugStringW(L"[KeyBlock] F12 Blocked\n");

        auto* k = reinterpret_cast<KBDLLHOOKSTRUCT*>(lParam);
        const DWORD vk = k->vkCode;

        // Keydown 이벤트 검사
        if (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN)
        {
            // 모든 특수키 차단
            if (ShouldBlock(vk))
            {
                // F12 포함: 메시지를 OS/CEF로 보내지 않고 즉시 swallow
                return 1;  // 1 = 메시지 무시 (시스템까지 전달 안됨)
            }
        }
    }

    // 그 외는 다음 훅으로 전달
    return CallNextHookEx(g_kbdHook, code, wParam, lParam);
}

void InstallGlobalKeyBlocker() {
    //if (g_hookInstalled.load()) return;
    //g_kbdHook = SetWindowsHookExW(WH_KEYBOARD_LL, LowLevelKeyboardProc, GetModuleHandleW(nullptr), 0);
    //g_hookInstalled.store(g_kbdHook != nullptr);
}

void UninstallGlobalKeyBlocker() {
    //if (!g_hookInstalled.load()) return;
    //if (g_kbdHook) {
    //    UnhookWindowsHookEx(g_kbdHook);
    //    g_kbdHook = nullptr;
    //}
    //g_hookInstalled.store(false);
}

// --- 윈도우 서브클래스: Alt 키 메뉴/시스템 명령(닫기 등)도 차단 ---
#ifndef SUBCLASSPROC
#define SUBCLASSPROC __stdcall
#endif

static const UINT_PTR kSubclassId = 0xD3ADBEEF;

static LRESULT SUBCLASSPROC KeyBlockerSubclassProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam,
    UINT_PTR /*id*/, DWORD_PTR /*ref*/) {
    //switch (msg) {
    //case WM_SYSCOMMAND:
    //    // Alt 키 메뉴/닫기 등 시스템 명령 차단
    //    if (wParam == SC_CLOSE || wParam == SC_KEYMENU || wParam == SC_TASKLIST) {
    //        return 0;
    //    }
    //    break;

    //case WM_SYSKEYDOWN:
    //    // Alt 조합 키 차단 (특히 Alt+F4)
    //    if (ShouldBlock(static_cast<DWORD>(wParam))) return 0;
    //    break;

    //case WM_KEYDOWN:
    //    if (ShouldBlock(static_cast<DWORD>(wParam))) return 0;
    //    break;

    //default:
    //    break;
    //}
    return DefSubclassProc(hWnd, msg, wParam, lParam);
}

void InstallDevtoolsKeyBlocker(HWND top) {
    if (!IsWindow(top)) return;
    // 중복 설치 방지: 이미 있으면 실패해도 문제 없음
//    SetWindowSubclass(top, KeyBlockerSubclassProc, kSubclassId, 0);
}

void UninstallDevtoolsKeyBlocker(HWND top) {
    if (!IsWindow(top)) return;
//    RemoveWindowSubclass(top, KeyBlockerSubclassProc, kSubclassId);
}