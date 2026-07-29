#include "pch.h"
#include "simple_handler.h"
#include "resource.h"

#include <atomic>
#include <functional>
#include <sstream>
#include <vector>

#include "include/base/cef_bind.h"
#include "include/base/cef_callback.h"
#include "include/cef_app.h"
#include "include/cef_menu_model.h"
#include "include/cef_parser.h"
#include "include/cef_task.h"
#include "include/cef_values.h"
#include "include/internal/cef_types.h" // MENU_ID_USER_FIRST
#include "include/wrapper/cef_closure_task.h"
#include "include/wrapper/cef_helpers.h"
#include "include/wrapper/cef_message_router.h"

#include "Core/AppInitial/AppConfig.h"
#include "Core/AppInitial/DevtoolsKeyBlocker.h"
#include "Core/AppInitial/WindowStyleUtil.h"
#include "Core/Communication/PortalRouterHandler.h"
#include "Core/Services/HwInitService.h"

// ──────────────────────────────────────────────
// 전역
// ──────────────────────────────────────────────
namespace {
SimpleHandler *g_instance = nullptr;
std::atomic<bool> g_cef_alive{true};

inline bool IsDevToolsURL(const std::string &url) {
  return !url.empty() && url.rfind("chrome-devtools://", 0) == 0;
}

class BroadcastJsTask : public CefTask {
public:
  BroadcastJsTask(SimpleHandler *handler, const std::string &js)
      : handler_(handler), js_(js) {}

  void Execute() override {
    if (handler_)
      handler_->BroadcastJS(js_);
  }

private:
  CefRefPtr<SimpleHandler> handler_;
  std::string js_;
  IMPLEMENT_REFCOUNTING(BroadcastJsTask);
};
} // namespace

/**
 * @brief CEF 브라우저 윈도우에 애플리케이션 아이콘 설정
 * @details
 *  - 디자인 패턴: Facade (HWND + 리소스 아이콘 설정을 한 함수로 캡슐화)
 *  - WM_SETICON을 사용하여 큰/작은 아이콘 모두 지정
 * @param hwnd 브라우저가 사용하는 Win32 윈도우 핸들
 */
static void SetAppIconToBrowserWindow(HWND hwnd) {
  if (!::IsWindow(hwnd)) {
    return;
  }

  HINSTANCE hInst = ::GetModuleHandleW(nullptr);

  // 큰 아이콘 (타이틀바, Alt+Tab 등)
  HICON hIconBig = (HICON)::LoadImageW(
      hInst,
      MAKEINTRESOURCEW(IDR_MAINLOGO), ///< 리소스에 추가한 아이콘 ID
      IMAGE_ICON, 32, 32, ///< 원하는 크기 (0,0 + LR_DEFAULTSIZE도 가능)
      LR_SHARED);

  // 작은 아이콘 (작은 캡션, 작업 표시줄 작은 아이콘 등)
  HICON hIconSmall = (HICON)::LoadImageW(hInst, MAKEINTRESOURCEW(IDR_MAINLOGO),
                                         IMAGE_ICON, 16, 16, LR_SHARED);

  if (hIconBig) {
    ::SendMessageW(hwnd, WM_SETICON, ICON_BIG, (LPARAM)hIconBig);
  }
  if (hIconSmall) {
    ::SendMessageW(hwnd, WM_SETICON, ICON_SMALL, (LPARAM)hIconSmall);
  }
}

// 사용자 메뉴 빌더 (옵션)
std::function<void(CefRefPtr<CefMenuModel>, CefRefPtr<CefContextMenuParams>)>
    SimpleHandler::s_menu_builder_{};

// ──────────────────────────────────────────────
// SimpleHandler
// ─────────────────────────────────────────────-
SimpleHandler::SimpleHandler(bool is_alloy_style)
    : is_alloy_style_(is_alloy_style) {
#if !defined(NDEBUG)
//    DCHECK(!g_instance);
#endif

  g_instance = this;
  g_cef_alive.store(true);

  // 메시지 라우터 + 브릿지 등록
  CefMessageRouterConfig cfg;
  message_router_ = CefMessageRouterBrowserSide::Create(cfg);
  bridge_handler_ = new PortalRouterHandler();
  message_router_->AddHandler(bridge_handler_.get(), /*first=*/false);
}

SimpleHandler::~SimpleHandler() {
  if (message_router_ && bridge_handler_) {
    message_router_->RemoveHandler(bridge_handler_.get());
    bridge_handler_ = nullptr;
    message_router_ = nullptr;
  }
  g_instance = nullptr;
  g_cef_alive.store(false);
}

SimpleHandler *SimpleHandler::GetInstance() { return g_instance; }

void SimpleHandler::SetCustomContextMenuBuilder(
    std::function<void(CefRefPtr<CefMenuModel>,
                       CefRefPtr<CefContextMenuParams>)>
        builder) {
  s_menu_builder_ = std::move(builder);
}

void SimpleHandler::OnTitleChange(CefRefPtr<CefBrowser> browser,
                                  const CefString &title) {
  CEF_REQUIRE_UI_THREAD();
  PlatformTitleChange(browser, title); // Views 미사용
}

void SimpleHandler::OnAfterCreated(CefRefPtr<CefBrowser> browser) {
  CEF_REQUIRE_UI_THREAD();
  browser_list_.push_back(browser);

  // HWND 를 얻어서 아이콘 설정
  HWND hwnd = browser->GetHost()->GetWindowHandle();
  SetAppIconToBrowserWindow(hwnd);

  // [MODIFIED] 메인 브라우저만 보더리스 적용
  // URL은 OnAfterCreated 시점에 비어있을 수 있으므로(DevTools 등), IsPopup()도
  // 함께 체크
  const std::string url = browser->GetMainFrame()->GetURL();
  if (IsDevToolsURL(url) || browser->IsPopup()) {
    // DevTools / Popup Window: Keep standard system title bar
    // Do NOT apply borderless
  } else {
    // Main Application Window (Non-popup)
    // [FIX] CEF Views 구조에서 GetWindowHandle()은 최상위 창이 아닌 내부 자식(RenderWidget)을 반환합니다.
    // 여기에 ApplyBorderless를 호출하여 WS_POPUP 속성을 주면 부모로부터 분리된 유령 창이 Alt-Tab에 등록됩니다.
    // 따라서 이 중복 로직을 제거하고 WindowFactory::OnWindowCreated에서만 스타일을 관리하도록 합니다.
    /*
    HWND top = browser->GetHost()->GetWindowHandle();
    if (top) {
      ApplyBorderless(top, BLF_Resizable | BLF_BlockCtrlF4);
      InstallDevtoolsKeyBlocker(top); // 창 레벨 특수키/시스템명령 차단
      TryInstallHitTestOnTop(top);
      SetTimer(top, kHitTestRetryTimer, kHitTestRetryIntervalMs, nullptr);
    }
    */
  }
}

bool SimpleHandler::OnBeforePopup(
    CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
    int popup_id,
    const CefString &target_url, const CefString &target_frame_name,
    CefLifeSpanHandler::WindowOpenDisposition target_disposition, bool user_gesture,
    const CefPopupFeatures &popupFeatures, CefWindowInfo &windowInfo,
    CefRefPtr<CefClient> &client, CefBrowserSettings &settings,
    CefRefPtr<CefDictionaryValue> &extra_info, bool *no_javascript_access) {
  CEF_REQUIRE_UI_THREAD();

  // 모든 팝업 요청을 차단하여 불필요한 Alt+Tab 항목 생성을 방지합니다.
  // 필요한 경우 특정 URL이나 조건에 따라 허용하도록 수정할 수 있습니다.
  return true; 
}

bool SimpleHandler::DoClose(CefRefPtr<CefBrowser> /*browser*/) {
  CEF_REQUIRE_UI_THREAD();
  if (browser_list_.size() == 1)
    is_closing_ = true;
  return false;
}

void SimpleHandler::OnBeforeClose(CefRefPtr<CefBrowser> browser) {
  CEF_REQUIRE_UI_THREAD();

  if (message_router_)
    message_router_->OnBeforeClose(browser);

  if (HWND hwnd = browser->GetHost()->GetWindowHandle()) {
    UninstallDevtoolsKeyBlocker(hwnd); // 해제
    UninstallBorderless(hwnd);
    UnregisterCefForTop(hwnd);
  }

  // 리스트 정리
  for (auto it = browser_list_.begin(); it != browser_list_.end(); ++it) {
    if ((*it)->IsSame(browser)) {
      browser_list_.erase(it);
      break;
    }
  }

  if (browser_list_.empty()) {
    HwInitService::instance().request_stop_and_join();
    CefQuitMessageLoop();
    
    // [ADD] 좀비 프로세스 방지를 위해 메인 윈도우 메시지 루프에 종료 신호를 보냅니다.
    ::PostQuitMessage(0);
  }
}

void SimpleHandler::OnLoadError(CefRefPtr<CefBrowser> /*browser*/,
                                CefRefPtr<CefFrame> frame, ErrorCode errorCode,
                                const CefString &errorText,
                                const CefString &failedUrl) {
  CEF_REQUIRE_UI_THREAD();
  if (!frame->IsMain())
    return;

  std::wostringstream oss;
  oss << L"[OnLoadError] code=" << static_cast<int>(errorCode) << L" text="
      << errorText.ToWString() << L" url=" << failedUrl.ToWString() << L"\n";
  OutputDebugStringW(oss.str().c_str());
}

void SimpleHandler::OnRenderProcessTerminated(CefRefPtr<CefBrowser> browser,
                                              TerminationStatus status,
                                              int error_code,
                                              const CefString &error_string) {
  CEF_REQUIRE_UI_THREAD();

  std::wostringstream oss;
  oss << L"[OnRenderProcessTerminated] status=" << static_cast<int>(status)
      << L" error_code=" << error_code
      << L" error_string=" << error_string.ToWString() << L"\n";
  OutputDebugStringW(oss.str().c_str());

  // [FIX] GPU가 in-process-gpu로 렌더러와 통합되어 있어, GPU 쪽 내부 오류(CHECK 실패 등)도
  // 이 콜백으로 도달할 수 있다. 기본 동작(사용자가 "Aw, Snap!" 화면에 갇힘)을 막기 위해
  // 현재 메인 프레임 URL을 즉시 재로드해 자동 복구를 시도한다.
  if (!browser)
    return;
  CefRefPtr<CefFrame> frame = browser->GetMainFrame();
  if (frame)
    frame->LoadURL(frame->GetURL());
}

void SimpleHandler::OnLoadEnd(CefRefPtr<CefBrowser> browser,
                              CefRefPtr<CefFrame> frame,
                              int /*httpStatusCode*/) {
  CEF_REQUIRE_UI_THREAD();
  if (!frame->IsMain())
    return;

  // 앱 이름 주입
  if (!app_name_.empty()) {
    auto v = CefValue::Create();
    v->SetString(app_name_);
    const std::string json = CefWriteJSON(v, JSON_WRITER_DEFAULT).ToString();
    frame->ExecuteJavaScript("window.__APP_NAME = " + json + ";",
                             frame->GetURL(), 0);
  }

  // Win32 핸들로 표시
  if (!browser->IsPopup()) {
    if (auto host = browser->GetHost()) {
      if (HWND hTop = ::GetTopLevelFromAny(host->GetWindowHandle())) {
        ::ShowWindow(hTop, SW_SHOW);
        ::SetForegroundWindow(hTop);
      }
    }
  }

  if (auto host = browser->GetHost()) {
    host->WasHidden(false);
    host->WasResized();
  }
}

bool SimpleHandler::OnBeforeBrowse(CefRefPtr<CefBrowser> browser,
                                   CefRefPtr<CefFrame> frame,
                                   CefRefPtr<CefRequest> /*request*/,
                                   bool /*user_gesture*/,
                                   bool /*is_redirect*/) {
  if (message_router_)
    message_router_->OnBeforeBrowse(browser, frame);
  return false;
}

bool SimpleHandler::OnProcessMessageReceived(
    CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
    CefProcessId source_process, CefRefPtr<CefProcessMessage> message) {
  if (message_router_ && message_router_->OnProcessMessageReceived(
                             browser, frame, source_process, message))
    return true;
  return false;
}

void SimpleHandler::OnFullscreenModeChange(CefRefPtr<CefBrowser> /*browser*/,
                                           bool /*entering_fullscreen*/) {
  CEF_REQUIRE_UI_THREAD();
  // Views 미사용: no-op
}

// ──────────────────────────────────────────────
// 입력 키 차단 (F12 / Ctrl+Shift+I 완전 차단)
// ─────────────────────────────────────────────-
bool SimpleHandler::OnPreKeyEvent(CefRefPtr<CefBrowser> /*browser*/,
                                  const CefKeyEvent &event,
                                  CefEventHandle /*os_event*/,
                                  bool * /*is_keyboard_shortcut*/) {
  if (event.type != KEYEVENT_RAWKEYDOWN)
    return false;

  const bool ctrl = (event.modifiers & EVENTFLAG_CONTROL_DOWN) != 0;
  const bool shift = (event.modifiers & EVENTFLAG_SHIFT_DOWN) != 0;

  if (event.windows_key_code == VK_ESCAPE)
    return true;
  if (event.windows_key_code >= VK_F1 && event.windows_key_code <= VK_F24)
    return true;
  if ((event.windows_key_code == 'I' || event.windows_key_code == 'J') &&
      ctrl && shift)
    return true;
  if (event.windows_key_code == VK_F4 && (event.modifiers & EVENTFLAG_ALT_DOWN))
    return true;

  return false; // 나머지는 기본 처리
}

// ──────────────────────────────────────────────
// 컨텍스트 메뉴: DevTools 항목 없음(사용자 정의만)
// ─────────────────────────────────────────────-
void SimpleHandler::OnBeforeContextMenu(CefRefPtr<CefBrowser> /*browser*/,
                                        CefRefPtr<CefFrame> /*frame*/,
                                        CefRefPtr<CefContextMenuParams> params,
                                        CefRefPtr<CefMenuModel> model) {
  //    model->Clear(); // 기존 마우스 오른쪽 버튼 팝업 메뉴 표시
  if (s_menu_builder_)
    s_menu_builder_(model, params); // 사용자 정의 메뉴
}

bool SimpleHandler::OnContextMenuCommand(
    CefRefPtr<CefBrowser> /*browser*/, CefRefPtr<CefFrame> /*frame*/,
    CefRefPtr<CefContextMenuParams> /*params*/, int /*command_id*/,
    EventFlags /*event_flags*/) {
  // 사용자 정의 항목만 사용. 여기서는 별도 처리 없음.
  return false;
}

void SimpleHandler::ForEachBrowser(
    const std::function<void(CefRefPtr<CefBrowser>)> &fn) {
  CEF_REQUIRE_UI_THREAD();
  std::vector<CefRefPtr<CefBrowser>> snapshot;
  snapshot.reserve(browser_list_.size());
  for (auto &b : browser_list_)
    if (b)
      snapshot.push_back(b);
  for (auto &b : snapshot)
    fn(b);
}

void SimpleHandler::BroadcastJS(const std::string &js) {
  if (!CefCurrentlyOn(TID_UI)) {
    CefPostTask(TID_UI, new BroadcastJsTask(this, js));
    return;
  }
  ForEachBrowser([&](CefRefPtr<CefBrowser> b) {
    if (auto f = b->GetMainFrame())
      f->ExecuteJavaScript(js, f->GetURL(), 0);
  });
}

void SimpleHandler::SetAppName(std::string app_name) {
  app_name_ = std::move(app_name);
}

bool SimpleHandler::OnConsoleMessage(CefRefPtr<CefBrowser> /*browser*/,
                                     cef_log_severity_t level,
                                     const CefString &message,
                                     const CefString &source, int line) {
  std::wostringstream oss;
  oss << L"[console] (" << static_cast<int>(level) << L") "
      << message.ToWString() << L" @" << source.ToWString() << L":" << line
      << L"\n";
  OutputDebugStringW(oss.str().c_str());
  return false;
}

// ──────────────────────────────────────────────
// 파일 다이얼로그 (CefDialogHandler)
// ──────────────────────────────────────────────
#include <commdlg.h>

/**
 * @brief <input accept> 기반 열기 다이얼로그를 커스텀 Win32 다이얼로그로 대체.
 * @details
 *  - 디자인 패턴: Adapter — CEF accept 목록(확장자/MIME)을 Win32 OPENFILENAME
 *    필터 문자열로 변환한다.
 *  - CEF 기본 다이얼로그는 확장자별 개별 필터만 나열하고 첫 항목을 기본으로
 *    선택하므로, 여러 형식을 받는 "Import File" UX에 맞게
 *    "All Supported Files (통합)" 필터를 1번(기본)으로 배치한다.
 *  - 저장/폴더 선택 모드, 필터 1개 이하는 기본 동작(false)으로 위임한다.
 */
bool SimpleHandler::OnFileDialog(
    CefRefPtr<CefBrowser> browser, FileDialogMode mode, const CefString &title,
    const CefString &default_file_path,
    const std::vector<CefString> &accept_filters,
    const std::vector<CefString> &accept_extensions,
    const std::vector<CefString> &accept_descriptions,
    CefRefPtr<CefFileDialogCallback> callback) {
  CEF_REQUIRE_UI_THREAD();

  const bool is_open =
      (mode == FILE_DIALOG_OPEN || mode == FILE_DIALOG_OPEN_MULTIPLE);
  if (!is_open || accept_filters.size() < 2) {
    return false; // 기본 다이얼로그 사용
  }

  // 1) accept 목록 → 필터 스펙 수집 (".svg" → "*.svg", MIME은 확장 목록 사용)
  std::vector<std::wstring> specs;  // 항목별 스펙 ("*.svg" 또는 "*.png;*.jpg")
  std::vector<std::wstring> labels; // 항목별 표시 라벨
  std::wstring combined;            // 통합 스펙 "*.svg;*.dxf;..."

  for (size_t i = 0; i < accept_filters.size(); ++i) {
    const std::wstring f = accept_filters[i].ToWString();
    std::wstring spec;

    if (!f.empty() && f[0] == L'.') {
      spec = L"*" + f;
    } else if (i < accept_extensions.size() && !accept_extensions[i].empty()) {
      // MIME 타입: ".png;.jpg" 확장 목록 → "*.png;*.jpg"
      std::wstringstream ss(accept_extensions[i].ToWString());
      std::wstring tok;
      while (std::getline(ss, tok, L';')) {
        if (tok.empty())
          continue;
        if (!spec.empty())
          spec += L';';
        spec += (tok[0] == L'.') ? (L"*" + tok) : tok;
      }
    }
    if (spec.empty())
      continue;

    std::wstring label;
    if (i < accept_descriptions.size() && !accept_descriptions[i].empty()) {
      label = accept_descriptions[i].ToWString();
    } else {
      // ".svg" → "SVG File"
      std::wstring up = (f.size() > 1 && f[0] == L'.') ? f.substr(1) : f;
      for (auto &c : up)
        c = static_cast<wchar_t>(::towupper(c));
      label = up + L" File";
    }

    labels.push_back(label + L" (" + spec + L")");
    specs.push_back(spec);
    if (!combined.empty())
      combined += L';';
    combined += spec;
  }
  if (combined.empty()) {
    return false;
  }

  // 2) 필터 문자열 조립: [All Supported Files(기본)] + 개별 항목 + All Files
  std::wstring filter;
  filter += L"All Supported Files (" + combined + L")";
  filter.push_back(L'\0');
  filter += combined;
  filter.push_back(L'\0');
  for (size_t i = 0; i < specs.size(); ++i) {
    filter += labels[i];
    filter.push_back(L'\0');
    filter += specs[i];
    filter.push_back(L'\0');
  }
  filter += L"All Files (*.*)";
  filter.push_back(L'\0');
  filter += L"*.*";
  filter.push_back(L'\0');
  filter.push_back(L'\0');

  // 3) Win32 열기 다이얼로그 실행
  const bool multiple = (mode == FILE_DIALOG_OPEN_MULTIPLE);
  std::vector<wchar_t> file_buf(multiple ? 32768 : MAX_PATH, L'\0');
  if (!default_file_path.empty()) {
    wcsncpy_s(file_buf.data(), file_buf.size(),
              default_file_path.ToWString().c_str(), _TRUNCATE);
  }

  const std::wstring title_w = title.ToWString();

  OPENFILENAMEW ofn = {};
  ofn.lStructSize = sizeof(ofn);
  if (browser && browser->GetHost()) {
    ofn.hwndOwner =
        ::GetAncestor(browser->GetHost()->GetWindowHandle(), GA_ROOT);
  }
  ofn.lpstrFilter = filter.c_str();
  ofn.nFilterIndex = 1; // ★ "All Supported Files"를 기본 선택
  ofn.lpstrFile = file_buf.data();
  ofn.nMaxFile = static_cast<DWORD>(file_buf.size());
  if (!title_w.empty()) {
    ofn.lpstrTitle = title_w.c_str();
  }
  ofn.Flags = OFN_PATHMUSTEXIST | OFN_FILEMUSTEXIST | OFN_NOCHANGEDIR |
              OFN_EXPLORER;
  if (multiple) {
    ofn.Flags |= OFN_ALLOWMULTISELECT;
  }

  if (::GetOpenFileNameW(&ofn) == TRUE) {
    std::vector<CefString> paths;
    if (multiple) {
      // 멀티선택 버퍼: "dir\0file1\0file2\0\0" (단일 선택 시 "fullpath\0\0")
      const wchar_t *p = file_buf.data();
      const std::wstring first = p;
      p += first.size() + 1;
      if (*p == L'\0') {
        paths.push_back(first);
      } else {
        while (*p) {
          const std::wstring name = p;
          p += name.size() + 1;
          paths.push_back(first + L"\\" + name);
        }
      }
    } else {
      paths.push_back(std::wstring(file_buf.data()));
    }
    callback->Continue(paths);
  } else {
    callback->Cancel();
  }
  return true;
}

void SimpleHandler::CloseAllBrowsers(bool force_close) {
  CEF_REQUIRE_UI_THREAD();
  BrowserList browsers = browser_list_; // snapshot
  for (auto &browser : browsers) {
    if (auto host = browser->GetHost())
      host->CloseBrowser(force_close);
  }
}
