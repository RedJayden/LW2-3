#include "pch.h"
#include "HttpResponseUtil.h"

/**
 * @file HttpResponseUtil.cpp
 */

namespace http
{
    void SetNoCacheHeaders(CefResponse::HeaderMap& headers)
    {
        headers.insert({ "Cache-Control", "no-cache, no-store, must-revalidate" });
        headers.insert({ "Pragma", "no-cache" });
        headers.insert({ "Expires", "0" });
        headers.insert({ "Connection", "close" });
    }

    void AddCorsAllowAll(CefResponse::HeaderMap& headers)
    {
        headers.insert({ "Access-Control-Allow-Origin", "*" });
        headers.insert({ "Access-Control-Allow-Methods", "GET, OPTIONS" });
        headers.insert({ "Access-Control-Allow-Headers", "Content-Type" });
    }

    void SetMjpegHeaders(CefRefPtr<CefResponse> response,
        const std::string& boundary)
    {
        response->SetStatus(200);
        response->SetStatusText("OK");
        response->SetMimeType("multipart/x-mixed-replace");

        CefResponse::HeaderMap headers;
        SetNoCacheHeaders(headers);
        // CORS는 필요 없지만, 확장성 위해 켜 둘 수도 있음
        AddCorsAllowAll(headers);

        // boundary는 응답 body에서만 쓰이지만, 참고용으로 넣고 싶으면 아래 주석 해제
        // headers.insert({ "X-MJPEG-Boundary", boundary });

        response->SetHeaderMap(headers);
    }

    void SetJsonHeaders(CefRefPtr<CefResponse> response)
    {
        response->SetStatus(200);
        response->SetStatusText("OK");
        response->SetMimeType("application/json");

        CefResponse::HeaderMap headers;
        SetNoCacheHeaders(headers);
        AddCorsAllowAll(headers);
        response->SetHeaderMap(headers);
    }
}

// =============================
// IPC(JSON) 응답 유틸 구현부
// =============================

namespace HttpResponseUtil
{
    /**
     * @brief CefDictionaryValue를 JSON 문자열로 변환하여 IPC 응답
     */
    void ReplyJson(Callback callback,
        CefRefPtr<CefDictionaryValue> dict)
    {
        if (!callback.get()) {
            return;
        }

        // CefValue로 래핑
        CefRefPtr<CefValue> root = CefValue::Create();
        root->SetDictionary(dict);

        // JSON 문자열로 직렬화
        CefString json = CefWriteJSON(root, JSON_WRITER_DEFAULT);

        // Portal 쪽으로 응답
        callback->Success(json);
    }

    void ReplyJsonOk(Callback callback)
    {
        auto dict = CefDictionaryValue::Create();
        dict->SetBool("ok", true);
        ReplyJson(callback, dict);
    }

    void ReplyJsonError(Callback callback,
        const std::string& message)
    {
        auto dict = CefDictionaryValue::Create();
        dict->SetBool("ok", false);
        dict->SetString("message", message);
        ReplyJson(callback, dict);
    }
}
