#include "AppSchemeFactory.h"
#include "pch.h"


#include "include/cef_parser.h" // CefParseURL
#include "include/cef_request.h"
#include "include/cef_scheme.h"
#include "include/wrapper/cef_helpers.h" // CEF_REQUIRE_IO_THREAD


#include "Native/ui/cef/handlers/CameraResourceHandler.h"

namespace {
/**
 * @brief http://app/* 전용 SchemeHandlerFactory
 * @details
 *  - 디자인 패턴: Factory Method
 *  - http 스킴 + host == "app" 인 경우만 커스텀 리소스 핸들러를 생성.
 */
class AppSchemeHandlerFactory final : public CefSchemeHandlerFactory {
public:
  CefRefPtr<CefResourceHandler> Create(CefRefPtr<CefBrowser> browser,
                                       CefRefPtr<CefFrame> frame,
                                       const CefString &scheme_name,
                                       CefRefPtr<CefRequest> request) override {
    CEF_REQUIRE_IO_THREAD();

    const auto url = request->GetURL().ToString();

    // path 추출
    CefURLParts parts;
    CefParseURL(request->GetURL(), parts);
    std::string path = CefString(&parts.path); // "/camera/frame" 같은 형태

    if (path.find("/camera/frame") == 0) {
      return new CameraFrameResourceHandler();
    }
    if (path.find("/camera/fps") == 0) {
      return new CameraFpsResourceHandler();
    }

    // 그 외 경로는 CEF 기본 로직에 맡김
    return nullptr;
  }

private:
  IMPLEMENT_REFCOUNTING(AppSchemeHandlerFactory);
};

std::atomic_bool g_registered{false};
} // namespace

namespace app {
void RegisterAppSchemeHandler() {
  bool expected = false;
  if (!g_registered.compare_exchange_strong(expected, true)) {
    // 이미 등록됨
    return;
  }

  CefRegisterSchemeHandlerFactory("http", "app", new AppSchemeHandlerFactory());
}

void UnregisterAppSchemeHandler() {
  bool expected = true;
  if (!g_registered.compare_exchange_strong(expected, false)) {
    // 아직/이미 해제됨
    return;
  }

  CefRegisterSchemeHandlerFactory("http", "app", nullptr);
}
} // namespace app
