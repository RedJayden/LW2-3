#pragma once

#include <atomic>
#include <functional>
#include <string>
#include <vector>

#include "include/cef_browser.h"
#include "include/cef_client.h"
#include "include/cef_context_menu_handler.h" // CefContextMenuParams fwd decl 포함
#include "include/cef_dialog_handler.h" // OnFileDialog (Import File 통합 필터)
#include "include/cef_display_handler.h"
#include "include/cef_frame.h"
#include "include/cef_keyboard_handler.h"
#include "include/cef_life_span_handler.h"
#include "include/cef_load_handler.h"
#include "include/cef_menu_model.h"
#include "include/cef_request.h"
#include "include/cef_values.h"
#include "include/wrapper/cef_helpers.h"
#include "include/wrapper/cef_message_router.h"


class PortalRouterHandler;

/** 메인 CEF 핸들러 (Views 미사용) */
class SimpleHandler : public CefClient,
                      public CefLifeSpanHandler,
                      public CefLoadHandler,
                      public CefDisplayHandler,
                      public CefContextMenuHandler,
                      public CefKeyboardHandler,
                      public CefRequestHandler,
                      public CefDialogHandler {
public:
  explicit SimpleHandler(bool is_alloy_style);
  ~SimpleHandler() override;

  static SimpleHandler *GetInstance();

  // 사용자 정의 컨텍스트 메뉴 빌더 주입 (DevTools 항목은 여기서도 추가하지
  // 마세요)
  static void SetCustomContextMenuBuilder(
      std::function<void(CefRefPtr<CefMenuModel>,
                         CefRefPtr<CefContextMenuParams>)>
          builder);

  // CefClient providers
  CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler() override { return this; }
  CefRefPtr<CefLoadHandler> GetLoadHandler() override { return this; }
  CefRefPtr<CefDisplayHandler> GetDisplayHandler() override { return this; }
  CefRefPtr<CefContextMenuHandler> GetContextMenuHandler() override {
    return this;
  }
  CefRefPtr<CefKeyboardHandler> GetKeyboardHandler() override { return this; }
  CefRefPtr<CefRequestHandler> GetRequestHandler() override { return this; }
  CefRefPtr<CefDialogHandler> GetDialogHandler() override { return this; }

  // Display / LifeSpan / Load / IPC
  void OnTitleChange(CefRefPtr<CefBrowser>, const CefString &title) override;
  void OnAfterCreated(CefRefPtr<CefBrowser>) override;
  bool OnBeforePopup(CefRefPtr<CefBrowser> browser,
                     CefRefPtr<CefFrame> frame,
                     int popup_id,
                     const CefString &target_url,
                     const CefString &target_frame_name,
                     CefLifeSpanHandler::WindowOpenDisposition target_disposition,
                     bool user_gesture,
                     const CefPopupFeatures &popupFeatures,
                     CefWindowInfo &windowInfo,
                     CefRefPtr<CefClient> &client,
                     CefBrowserSettings &settings,
                     CefRefPtr<CefDictionaryValue> &extra_info,
                     bool *no_javascript_access) override;
  bool DoClose(CefRefPtr<CefBrowser>) override;
  void OnBeforeClose(CefRefPtr<CefBrowser>) override;

  void OnLoadError(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame>, ErrorCode,
                   const CefString &errorText,
                   const CefString &failedUrl) override;

  void OnLoadEnd(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame>,
                 int httpStatusCode) override;

  // CefRequestHandler
  bool OnBeforeBrowse(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame>,
                      CefRefPtr<CefRequest>, bool user_gesture,
                      bool is_redirect) override;

  bool OnProcessMessageReceived(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame>,
                                CefProcessId,
                                CefRefPtr<CefProcessMessage>) override;

  void OnFullscreenModeChange(CefRefPtr<CefBrowser>,
                              bool entering_fullscreen) override;

  /**
   * @brief 렌더러(GPU 포함, in-process-gpu 구성) 프로세스가 비정상 종료되었을 때 호출됨.
   * @details 기본 CEF 동작은 "Aw, Snap!" 오류 페이지를 띄운 채 방치하는 것이므로,
   *          현재 프레임 URL을 즉시 재로드하여 사용자가 크래시 화면에 갇히지 않도록 한다.
   */
  void OnRenderProcessTerminated(CefRefPtr<CefBrowser> browser,
                                 TerminationStatus status, int error_code,
                                 const CefString &error_string) override;

  // Keyboard / Context Menu
  bool OnPreKeyEvent(CefRefPtr<CefBrowser>, const CefKeyEvent &, CefEventHandle,
                     bool *is_keyboard_shortcut) override;

  void OnBeforeContextMenu(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame>,
                           CefRefPtr<CefContextMenuParams>,
                           CefRefPtr<CefMenuModel>) override;

  bool OnContextMenuCommand(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame>,
                            CefRefPtr<CefContextMenuParams>, int command_id,
                            EventFlags) override;

  bool OnConsoleMessage(CefRefPtr<CefBrowser>, cef_log_severity_t,
                        const CefString &message, const CefString &source,
                        int line) override;

  /**
   * @brief 파일 선택 다이얼로그 커스터마이즈 (CefDialogHandler).
   * @details
   *  - 디자인 패턴: Adapter — CEF accept 목록을 Win32 OPENFILENAME 필터로 변환.
   *  - <input accept="..."> 기반 열기 다이얼로그에서 CEF 기본 동작(확장자별
   *    개별 필터)을 대체하여 "All Supported Files" 통합 필터를 1번(기본)으로
   *    제공한다. (Import File 버튼 UX 요구)
   *  - 저장/폴더 모드 및 단일 필터는 기본 다이얼로그(false 반환)를 사용한다.
   */
  bool OnFileDialog(CefRefPtr<CefBrowser> browser, FileDialogMode mode,
                    const CefString &title, const CefString &default_file_path,
                    const std::vector<CefString> &accept_filters,
                    const std::vector<CefString> &accept_extensions,
                    const std::vector<CefString> &accept_descriptions,
                    CefRefPtr<CefFileDialogCallback> callback) override;

  // Utilities
  void ForEachBrowser(const std::function<void(CefRefPtr<CefBrowser>)> &fn);
  void BroadcastJS(const std::string &js);
  void SetAppName(std::string app_name);
  void CloseAllBrowsers(bool force_close);

protected:
  void PlatformTitleChange(CefRefPtr<CefBrowser>, const CefString &title);

private:
  bool is_alloy_style_{false};
  bool is_closing_{false};
  std::string app_name_{};

  using BrowserList = std::vector<CefRefPtr<CefBrowser>>;
  BrowserList browser_list_{};

  CefRefPtr<CefMessageRouterBrowserSide> message_router_{};
  CefRefPtr<PortalRouterHandler> bridge_handler_{};

  static std::function<void(CefRefPtr<CefMenuModel>,
                            CefRefPtr<CefContextMenuParams>)>
      s_menu_builder_;

private:
  IMPLEMENT_REFCOUNTING(SimpleHandler);
  DISALLOW_COPY_AND_ASSIGN(SimpleHandler);
};
