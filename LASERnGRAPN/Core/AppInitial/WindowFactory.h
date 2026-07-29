#pragma once

/**
 * @file WindowFactory.h
 * @brief CEF Views 기반 최상위 창 생성(스플래시/메인 공용)
 */

#include "include/cef_base.h"         // CefRefPtr
#include "include/internal/cef_types.h"

class SimpleHandler;  ///< forward
class CefBrowser;     ///< forward
class CefBrowserView; ///< forward
class CefWindow;      ///< forward

/**
 * @brief CEF Views 기반 최상위 창 생성(스플래시/메인 공용)
 * @param url                 초기 로드 URL
 * @param runtime_style       CEF 런타임 스타일
 * @param handler             브라우저 핸들러
 * @param width               초기 너비
 * @param height              초기 높이
 * @param show_state          초기 표시 상태
 * @param start_fullscreen    전체화면 시작 여부
 * @return 생성된 CefBrowser 포인터
 */
CefRefPtr<CefBrowser> CreatePortalWindow(
    const CefString& url,
    cef_runtime_style_t runtime_style,
    CefRefPtr<SimpleHandler> handler,
    int width, int height,
    cef_show_state_t show_state,
    bool start_fullscreen
);
