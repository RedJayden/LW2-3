#pragma once

#include <string>
/**
 * @file HttpResponseUtil.h
 * @brief CEF HTTP 응답 및 IPC(JSON) 응답 유틸리티
 */

#include "include/cef_response.h"
#include "include/cef_values.h"            // CefDictionaryValue, CefValue
#include "include/cef_parser.h"            // CefWriteJSON
#include "include/wrapper/cef_message_router.h" // CefMessageRouterBrowserSide

/**
 * @file HttpResponseUtil.h
 * @brief CEF 응답 헤더 공통 유틸
 * @details
 *  - 디자인 패턴: Utility
 *  - MJPEG, JSON 등의 공통 헤더 세팅을 모듈화.
 */
namespace http
{
    /**
     * @brief 캐시 방지 헤더 설정
     * @param headers 응답 헤더 맵
     */
    void SetNoCacheHeaders(CefResponse::HeaderMap& headers);

    /**
     * @brief 단순 CORS 허용 헤더 추가
     * @param headers 응답 헤더 맵
     */
    void AddCorsAllowAll(CefResponse::HeaderMap& headers);

    /**
     * @brief MJPEG 응답 헤더 설정
     * @param response CEF 응답 객체
     * @param boundary 바운더리 문자열 (예: "frame")
     */
    void SetMjpegHeaders(CefRefPtr<CefResponse> response,
        const std::string& boundary);

    /**
     * @brief JSON 응답 헤더 설정
     * @param response CEF 응답 객체
     */
    void SetJsonHeaders(CefRefPtr<CefResponse> response);
}

/**
 * @namespace HttpResponseUtil
 * @brief CEF MessageRouter 기반 IPC JSON 응답 유틸리티
 */
namespace HttpResponseUtil
{
    /// @brief 메시지 라우터 콜백 타입 별칭
    using Callback = CefRefPtr<CefMessageRouterBrowserSide::Callback>;

    /**
     * @brief JSON 딕셔너리를 IPC 응답으로 전송
     * @param callback CEF 메시지 라우터 콜백
     * @param dict 응답 데이터 (CefDictionaryValue)
     */
    void ReplyJson(Callback callback,
        CefRefPtr<CefDictionaryValue> dict);

    /**
     * @brief 성공 응답을 전송 ({"ok": true})
     * @param callback CEF 메시지 라우터 콜백
     */
    void ReplyJsonOk(Callback callback);

    /**
     * @brief 에러 응답을 전송 ({"ok": false, "message": "..."} )
     * @param callback CEF 메시지 라우터 콜백
     * @param message 에러 메시지
     */
    void ReplyJsonError(Callback callback,
        const std::string& message);
}