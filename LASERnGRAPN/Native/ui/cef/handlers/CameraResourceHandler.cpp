// Native/ui/cef/handlers/CameraResourceHandler.cpp
#include "pch.h"
#include "CameraResourceHandler.h"

#include "include/cef_parser.h"
#include "include/wrapper/cef_helpers.h"

/**
 * @file CameraResourceHandler.cpp
 */

namespace
{
    /// @brief URL 쿼리에서 id 파라미터 파싱
    int ParseCameraId(const CefString& url)
    {
        CefURLParts parts;
        if (!CefParseURL(url, parts))
            return 0;

        std::string query = CefString(&parts.query);
        int id = 0;
        auto pos = query.find("id=");
        if (pos != std::string::npos)
        {
            id = std::atoi(query.c_str() + pos + 3);
            if (id < 0) id = 0;
        }
        return id;
    }
} // namespace

// ============================================================================
// CameraFrameResourceHandler : 단일 JPEG
// ============================================================================

CameraFrameResourceHandler::CameraFrameResourceHandler() = default;

void CameraFrameResourceHandler::ParseUrl(const CefString& url)
{
    camId_ = ParseCameraId(url);

    std::string msg = "[CameraFrame] ParseUrl url=";
    msg += url.ToString();
    msg += " camId=" + std::to_string(camId_);
    ::OutputDebugStringA((msg + "\n").c_str());
}

bool CameraFrameResourceHandler::ProcessRequest(CefRefPtr<CefRequest> request,
    CefRefPtr<CefCallback> callback)
{
    CEF_REQUIRE_IO_THREAD();

    cancelled_ = false;
    jpeg_.clear();
    offset_ = 0;

    const auto url = request->GetURL();
    ParseUrl(url);

    // 여기서는 단순히 URL 파싱만 하고, 실제 JPEG 읽기는 GetResponseHeaders 에서 처리
    callback->Continue();
    return true;
}

void CameraFrameResourceHandler::GetResponseHeaders(CefRefPtr<CefResponse> response,
    int64_t& response_length,
    CefString& redirectUrl)
{
    CEF_REQUIRE_IO_THREAD();

    response->SetStatus(200);
    response->SetStatusText("OK");

    CefResponse::HeaderMap headers;
    headers.insert({ "Cache-Control", "no-cache, no-store, must-revalidate" });
    headers.insert({ "Pragma", "no-cache" });
    headers.insert({ "Expires", "0" });
    headers.insert({ "Connection", "close" });
    headers.insert({ "Access-Control-Allow-Origin", "*" });

    // LatestFrameStore 에서 JPEG 한 장 가져오기
    double fps = 0.0;
    bool ok = LatestFrameStore::Instance().TryGetLatest(camId_, jpeg_, fps);

    if (!ok || jpeg_.empty())
    {
        // 프레임이 아직 없으면 204 No Content 응답
        response->SetStatus(204);
        response->SetMimeType("text/plain");
        response_length = 0;
        redirectUrl = CefString();
        response->SetHeaderMap(headers);

        ::OutputDebugStringA(
            "[CameraFrame] GetResponseHeaders: no jpeg, send 204\n");
        return;
    }

    headers.insert({ "Content-Type", "image/jpeg" });

    response->SetHeaderMap(headers);
    response->SetMimeType("image/jpeg");

    response_length = static_cast<int64_t>(jpeg_.size());
    redirectUrl = CefString();

    char buf[128];
    sprintf_s(buf, "[CameraFrame] jpeg size=%zu fps=%.2f\n",
        jpeg_.size(), fps);
    ::OutputDebugStringA(buf);
}

bool CameraFrameResourceHandler::ReadResponse(void* data_out,
    int bytes_to_read,
    int& bytes_read,
    CefRefPtr<CefCallback>)
{
    CEF_REQUIRE_IO_THREAD();

    bytes_read = 0;

    if (cancelled_)
        return false;

    if (jpeg_.empty())
        return false;

    const size_t remain = jpeg_.size() - offset_;
    if (remain == 0)
        return false;

    const size_t toCopy =
        (std::min)(static_cast<size_t>(bytes_to_read), remain);

    memcpy(data_out, jpeg_.data() + offset_, toCopy);
    offset_ += toCopy;
    bytes_read = static_cast<int>(toCopy);

    return true; // 아직 남았으면 CEF 가 다시 호출, 다 보내면 false 반환
}

void CameraFrameResourceHandler::Cancel()
{
    CEF_REQUIRE_IO_THREAD();
    cancelled_ = true;
}

// ============================================================================
// CameraFpsResourceHandler : FPS JSON
// ============================================================================

CameraFpsResourceHandler::CameraFpsResourceHandler() = default;

bool CameraFpsResourceHandler::ProcessRequest(CefRefPtr<CefRequest> request,
    CefRefPtr<CefCallback> callback)
{
    CEF_REQUIRE_IO_THREAD();

    cancelled_ = false;
    sent_ = false;
    json_.clear();

    const auto url = request->GetURL();
    camId_ = ParseCameraId(url);

    {
        std::string msg = "[CameraFps] ProcessRequest url=";
        msg += url.ToString();
        msg += " camId=" + std::to_string(camId_);
        ::OutputDebugStringA((msg + "\n").c_str());
    }

    // OPTIONS(CORS preflight) 처리
    if (request->GetMethod() == "OPTIONS")
    {
        json_ = "{}";
        callback->Continue();
        return true;
    }

    std::vector<unsigned char> jpegDummy;
    double fps = 0.0;
    LatestFrameStore::Instance().TryGetLatest(camId_, jpegDummy, fps);

    json_ = "{\"fps\":";
    json_ += std::to_string(fps);
    json_ += "}";

    callback->Continue();
    return true;
}

void CameraFpsResourceHandler::GetResponseHeaders(
    CefRefPtr<CefResponse> response,
    int64_t& response_length,
    CefString&)
{
    CEF_REQUIRE_IO_THREAD();

    response->SetStatus(200);
    response->SetStatusText("OK");
    response->SetMimeType("application/json");

    CefResponse::HeaderMap headers;
    headers.insert({ "Cache-Control", "no-cache, no-store, must-revalidate" });
    headers.insert({ "Pragma", "no-cache" });
    headers.insert({ "Expires", "0" });
    headers.insert({ "Connection", "close" });
    headers.insert({ "Content-Type", "application/json; charset=utf-8" });
    headers.insert({ "Access-Control-Allow-Origin", "*" });

    response->SetHeaderMap(headers);
    response_length = static_cast<int64_t>(json_.size());
}

bool CameraFpsResourceHandler::ReadResponse(void* data_out,
    int bytes_to_read,
    int& bytes_read,
    CefRefPtr<CefCallback>)
{
    CEF_REQUIRE_IO_THREAD();

    bytes_read = 0;

    if (cancelled_ || sent_)
        return false;

    const size_t len = json_.size();
    if (len == 0)
        return false;

    const size_t toCopy =
        (std::min)(static_cast<size_t>(bytes_to_read), len);

    memcpy(data_out, json_.data(), toCopy);
    bytes_read = static_cast<int>(toCopy);

    sent_ = true;
    return true;
}

void CameraFpsResourceHandler::Cancel()
{
    CEF_REQUIRE_IO_THREAD();
    cancelled_ = true;
}
