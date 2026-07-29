// simple_app.h
#pragma once

// Copyright (c) 2013 The Chromium Embedded Framework Authors. All rights
// reserved. Use of this source code is governed by a BSD-style license that
// can be found in the LICENSE file.


/**
* @file simple_app.h
* @brief 브라우저 프로세스 핸들러: 스킴 선언 + 초기 창 생성
* @details
* - 디자인 패턴 : Facade(브라우저 프로세스 초기화), Strategy(런타임 스타일 분기)
* - 현재 라우팅: FE는 http://app/* 를 사용하므로 AppSchemeFactory에서
*   CefRegisterSchemeHandlerFactory("http","app", ...) 로 등록합니다.
* - (옵션) app:// 을 쓰려면 OnRegisterCustomSchemes 에서 표준 스킴 등록 필요.
*/

#ifndef CEF_TESTS_CEFSIMPLE_SIMPLE_APP_H_
#define CEF_TESTS_CEFSIMPLE_SIMPLE_APP_H_

#include "include/cef_app.h"
#include "include/wrapper/cef_message_router.h"
#include "include/cef_scheme.h"


/**
* @class SimpleApp
* @brief Application-level callbacks for the browser & renderer processes.
*/
class SimpleApp : public CefApp,
    public CefBrowserProcessHandler,
    public CefRenderProcessHandler
{
public:
	// @brief 생성자
    SimpleApp();

    // CefApp methods:
    CefRefPtr<CefBrowserProcessHandler> GetBrowserProcessHandler() override { return this; }
    CefRefPtr<CefRenderProcessHandler>  GetRenderProcessHandler()  override { return this; }


    /**
    * @brief 커맨드 라인 스위치 설정
    * file:/// 에서 자원 로드 허용 등 커맨드라인 추가
    * */
    void OnBeforeCommandLineProcessing(const CefString& process_type,
        CefRefPtr<CefCommandLine> command_line) override;

    // Renderer process
    void OnContextCreated(CefRefPtr<CefBrowser> browser,
        CefRefPtr<CefFrame> frame,
        CefRefPtr<CefV8Context> context) override;
    void OnContextReleased(CefRefPtr<CefBrowser> browser,
        CefRefPtr<CefFrame> frame,
        CefRefPtr<CefV8Context> context) override;
    bool OnProcessMessageReceived(CefRefPtr<CefBrowser> browser,
        CefRefPtr<CefFrame> frame,
        CefProcessId source_process,
        CefRefPtr<CefProcessMessage> message) override;

    // Browser process:
    void OnContextInitialized() override;
    CefRefPtr<CefClient> GetDefaultClient() override;

private:
    /// @brief 렌더러 사이드 라우터
    CefRefPtr<CefMessageRouterRendererSide> msg_router_renderer_;

    // Include the default reference counting implementation.
    IMPLEMENT_REFCOUNTING(SimpleApp);
    DISALLOW_COPY_AND_ASSIGN(SimpleApp);
};

#endif  // CEF_TESTS_CEFSIMPLE_SIMPLE_APP_H_
