#pragma once

#include <atomic>
#include <vector>
#include <string>

#include "include/cef_resource_handler.h"
#include "include/cef_request.h"
#include "include/cef_response.h"
#include "include/wrapper/cef_helpers.h"

#include "Native/ui/cef/LatestFrameStore.h"

/**
 * @file CameraResourceHandler.h
 * @brief 단일 JPEG + FPS JSON 핸들러
 *
 *  - GET http://app/camera/frame?id=N → image/jpeg 1장
 *  - GET http://app/camera/fps?id=N   → {"fps": 12.34}
 */
class CameraFrameResourceHandler : public CefResourceHandler
{
public:
    CameraFrameResourceHandler();
    ~CameraFrameResourceHandler() override = default;

    bool ProcessRequest(CefRefPtr<CefRequest> request,
        CefRefPtr<CefCallback> callback) override;

    void GetResponseHeaders(CefRefPtr<CefResponse> response,
        int64_t& response_length,
        CefString& redirectUrl) override;

    bool ReadResponse(void* data_out,
        int bytes_to_read,
        int& bytes_read,
        CefRefPtr<CefCallback> callback) override;

    void Cancel() override;

private:
    void ParseUrl(const CefString& url);

private:
    int                    camId_ = 0;
    std::atomic<bool>      cancelled_{ false };
    std::vector<unsigned char> jpeg_;     ///< LatestFrameStore 에서 읽은 JPEG
    size_t                 offset_ = 0; ///< ReadResponse 진행 위치

    IMPLEMENT_REFCOUNTING(CameraFrameResourceHandler);
};

/**
 * @brief http://app/camera/fps?id=N → FPS JSON
 */
class CameraFpsResourceHandler : public CefResourceHandler
{
public:
    CameraFpsResourceHandler();
    ~CameraFpsResourceHandler() override = default;

    bool ProcessRequest(CefRefPtr<CefRequest> request,
        CefRefPtr<CefCallback> callback) override;

    void GetResponseHeaders(CefRefPtr<CefResponse> response,
        int64_t& response_length,
        CefString& redirectUrl) override;

    bool ReadResponse(void* data_out,
        int bytes_to_read,
        int& bytes_read,
        CefRefPtr<CefCallback> callback) override;

    void Cancel() override;

private:
    int               camId_ = 0;
    std::atomic<bool> cancelled_{ false };
    bool              sent_ = false;
    std::string       json_;

    IMPLEMENT_REFCOUNTING(CameraFpsResourceHandler);
};
