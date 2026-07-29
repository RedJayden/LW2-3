#include "pch.h"
#undef MIN
#undef MAX
#include <fstream>
#include <shlobj.h>
#include <thread>


#include "../../Modules/IO_Control/LightController.h"
#include "../../Modules/Motor/EqMotionRunPara.h"
#include "../../Modules/Motor/Moons'/MoonsConfigService.h"
#include "../../Modules/Vision/VisionBridge/VisionBridge.h"
#include "../../Modules/Vision/CalibVision/CalibVision.h"
#include "Core/Communication/PortalRouterHandler.h"


#include "include/cef_parser.h"
#include "include/cef_values.h"
#include "include/wrapper/cef_helpers.h"

#include "Core/AppInitial/AppConfig.h"
#include "Core/AppInitial/WindowStyleUtil.h"
#include "Native/ui/cef/HttpResponseUtil.h"
#include "channels.gen.h"
#include "simple_handler.h"
#include <fstream>
#include <thread>

#include "../../Modules/IO_Control/LightController.h"
#include "../../Modules/Laser/Aurelia/AureliaController.h"
#include "../../Modules/Scanner/SinoGalvo/Base/SinoGalvoController.h"
#include "../../Modules/Scanner/ScanLab/Base/ScanlabController.h"
#include "../../Shared/Util/LogManager.h"
#include "../MachineType.h" // MC1/MC2 머신 타입 판별
#include "../MachineProfile.h"
#include "Core/Device/GCodeService.h"


// (예) Vision 브리지 접근(실 구현에 맞춰 바꾸세요)
// extern bool     VM_Start(int id, bool preview);
// extern bool     VM_Stop(int id);
// extern double   VM_GetFps(int id);
// extern bool     VM_GetRange(int id, double& emin, double& emax, double&
// estep,
//    double& gmin, double& gmax, double& gstep);
// extern bool     VM_SetExposure(int id, double exp);
// extern bool     VM_SetGain(int id, double gain);

// ---------------- JSON helpers ----------------
std::string PortalRouterHandler::MakeOk() { return "{\"ok\":true}"; }
std::string PortalRouterHandler::MakeErr(const char *msg) {
  std::ostringstream oss;
  oss << "{\"ok\":false,\"error\":\"" << msg << "\"}";
  return oss.str();
}

std::string PortalRouterHandler::DictToJson(CefRefPtr<CefDictionaryValue> d) {
  CefRefPtr<CefValue> v = CefValue::Create();
  v->SetDictionary(d);
  return CefWriteJSON(v, JSON_WRITER_DEFAULT).ToString();
}

/**
 * @brief 정수형(int)과 실수형(double)을 모두 처리하여 double로 반환합니다.
 * @details CEF Dictionary는 타입에 엄격하므로, VTYPE_INT인 경우 GetDouble()
 * 호출 시 0.0을 반환합니다. 이를 방지하기 위해 타입을 확인하고 형변환을
 * 수행합니다.
 */
double PortalRouterHandler::GetSafeDouble(Payload p, const CString &key,
                                          double defaultValue) {
  if (!p)
    return defaultValue;

  // [Fix] CString -> CefString(LPCWSTR) conversion
  CefString cefKey((LPCTSTR)key);

  if (!p->HasKey(cefKey))
    return defaultValue;

  CefRefPtr<CefValue> val = p->GetValue(cefKey);
  if (!val)
    return defaultValue;

  if (val->GetType() == VTYPE_DOUBLE) {
    return val->GetDouble();
  } else if (val->GetType() == VTYPE_INT) {
    return static_cast<double>(val->GetInt());
  } else if (val->GetType() == VTYPE_STRING) {
    return _ttof(val->GetString().ToWString().c_str());
  }

  return defaultValue;
}

// ---------------- Ctor ----------------
PortalRouterHandler::PortalRouterHandler() {
  InitializeCommandMap();

  LogManager::Instance().Initialize("Log");

  // [Fix] Path relative to EXE (Bin/LASERnGRAPN.exe) ->
  // Bin/Config/LightConfig.ini
  LightController::Instance().Initialize("Config\\LightConfig.ini");
  EqMotionRunPara::Instance().Initialize("Config\\EqMotionRunPara.ini");

  // Aurelia Laser Initialization (Read from AureliaConfig.ini)
  AureliaController::Instance().Initialize();

  StartPolling();
}

PortalRouterHandler::~PortalRouterHandler() { StopPolling(); }

// ---------------- Map utils ----------------
void PortalRouterHandler::Add(std::string_view channel, HandlerFunc fn) {
  command_map_.emplace(channel, std::move(fn));
}

// ---------------- Map init ----------------
void PortalRouterHandler::InitializeCommandMap() {
  using namespace ipc; // use app.*, camera.* constants

  // HW & UI (로컬 상수 – 채널 합의가 없으므로 여기만 문자열 상수 사용)
  Add("hw.startInit",
      [this](Browser b, Payload p, Callback c) { HandleHwStartInit(b, p, c); });
  Add("hw.getProgress", [this](Browser b, Payload p, Callback c) {
    HandleHwGetProgress(b, p, c);
  });
  Add("ui.getTheme",
      [this](Browser b, Payload p, Callback c) { HandleUiGetTheme(b, p, c); });
  Add("ui.setTheme",
      [this](Browser b, Payload p, Callback c) { HandleUiSetTheme(b, p, c); });

  // App & Window (공통 상수 사용)
  Add(app_openMain,
      [this](Browser b, Payload p, Callback c) { HandleAppOpenMain(b, p, c); });
  Add(app_quit,
      [this](Browser b, Payload p, Callback c) { HandleAppQuit(b, p, c); });
  Add(app_window_minimize, [this](Browser b, Payload p, Callback c) {
    HandleWindowMinimize(b, p, c);
  });
  Add(app_window_maximizeToggle, [this](Browser b, Payload p, Callback c) {
    HandleWindowMaximizeToggle(b, p, c);
  });
  Add(app_window_close,
      [this](Browser b, Payload p, Callback c) { HandleWindowClose(b, p, c); });
  Add(app_window_drag,
      [this](Browser b, Payload p, Callback c) { HandleWindowDrag(b, p, c); });

  // Camera (공통 상수 사용)
  Add(camera_start,
      [this](Browser b, Payload p, Callback c) { HandleCameraStart(b, p, c); });
  Add(camera_stop,
      [this](Browser b, Payload p, Callback c) { HandleCameraStop(b, p, c); });
  Add(camera_getRange, [this](Browser b, Payload p, Callback c) {
    HandleCameraGetRange(b, p, c);
  });
  Add(camera_setParams, [this](Browser b, Payload p, Callback c) {
    HandleCameraSetParams(b, p, c);
  });

  // motion
  Add(motion_homeAll, [this](Browser b, Payload p, Callback c) {
    HandleMotionAllHome(b, p, c);
  });
  Add(motion_home,
      [this](Browser b, Payload p, Callback c) { HandleMotionHome(b, p, c); });
  Add("motion.cancelHome", [this](Browser b, Payload p, Callback c) {
    HandleMotionCancelHome(b, p, c);
  });
  Add(motion_jog_start, [this](Browser b, Payload p, Callback c) {
    HandleMotionJogStart(b, p, c);
  });
  Add(motion_jog_stop, [this](Browser b, Payload p, Callback c) {
    HandleMotionJogStop(b, p, c);
  });
  Add(motion_moveRel, [this](Browser b, Payload p, Callback c) {
    HandleMotionMoveRel(b, p, c);
  });
  Add(motion_moveAbs, [this](Browser b, Payload p, Callback c) {
    HandleMotionMoveAbs(b, p, c);
  });
  Add(motion_stop,
      [this](Browser b, Payload p, Callback c) { HandleMotionStop(b, p, c); });
  Add(motion_getPosition, [this](Browser b, Payload p, Callback c) {
    HandleMotionGetPosition(b, p, c);
  });
  Add("cmd.motion.setServo", [this](Browser b, Payload p, Callback c) {
    HandleMotionSetServo(b, p, c);
  });
  Add("cmd.motion.resetAlarm", [this](Browser b, Payload p, Callback c) {
    HandleMotionResetAlarm(b, p, c);
  });
  Add("cmd.motion.fastechAlarmReset", [this](Browser b, Payload p, Callback c) {
    HandleFastechAlarmReset(b, p, c);
  });
  Add(motion_setJogSpeed, [this](Browser b, Payload p, Callback c) {
    HandleMotionSetSpeed(b, p, c);
  });

  // GCode
  Add(cmd_gcode_write,
      [this](Browser b, Payload p, Callback c) { HandleGCodeWrite(b, p, c); });
  Add(cmd_gcode_run,
      [this](Browser b, Payload p, Callback c) { HandleGcodeRun(b, p, c); });
  Add(cmd_gcode_status,
      [this](Browser b, Payload p, Callback c) { HandleGcodeStatus(b, p, c); });

  // Moons Preset
  Add(cmd_moons_preset, [this](Browser b, Payload p, Callback c) {
    HandleMoonsGetPresets(b, p, c);
  });

  // Scanner
  Add(cmd_scanner_generate, [this](Browser b, Payload p, Callback c) {
    HandleScannerGenerate(b, p, c);
  });
  Add(cmd_scanner_run,
      [this](Browser b, Payload p, Callback c) { HandleScannerRun(b, p, c); });

  Add("cmd.scanner.stop", [this](Browser b, Payload p, Callback c) {
    if (g_Scanner) {
      g_Scanner->Stop();
    }
    c->Success(MakeOk());
  });
  // [기능2 2026-07-22] 갈보 미러를 센터(0,0)로 이동. MoveToCenter()가 최대 2초 블로킹하므로
  // 워커 스레드에서 실행하고 즉시 응답한다(fire-and-forget 버튼).
  Add("cmd.scanner.center", [this](Browser b, Payload p, Callback c) {
    WORK_1([]() {
      if (g_Scanner) {
        g_Scanner->MoveToCenter();
      }
    });
    c->Success(MakeOk());
  });
  Add("cmd.scanner.init", [this](Browser b, Payload p, Callback c) {
    if (g_Scanner) {
      bool ok = g_Scanner->Initialize();
      c->Success(ok ? MakeOk() : MakeErr("Scanner initialization failed"));
    } else {
      c->Success(MakeErr("Scanner controller not available"));
    }
  });

  // Dialogs
  Add(cmd_dialog_openImage, [this](Browser b, Payload p, Callback c) {
    HandleDialogLoadImage(b, p, c);
  });
  Add(cmd_dialog_saveImage, [this](Browser b, Payload p, Callback c) {
    HandleDialogSaveImage(b, p, c);
  });
  // Note: saveRecipeFile might not have a generated constant if not in schema?
  // Checking schema... user didn't show schema but let's assume saveRecipeFile
  // is not in the list I saw in gen.h gen.h showed cmd.dialog.saveImage and
  // openImage. It did NOT show saveRecipeFile. So I will leave saveRecipeFile
  // as string.
  Add("cmd.dialog.saveRecipeFile", [this](Browser b, Payload p, Callback c) {
    HandleDialogSaveRecipeFile(b, p, c);
  });

  // Calibration
  Add(cmd_calibration_save, [this](Browser b, Payload p, Callback c) {
    HandleCalibrationSave(b, p, c);
  });
  Add(cmd_calibration_load, [this](Browser b, Payload p, Callback c) {
    HandleCalibrationLoad(b, p, c);
  });
  Add(cmd_calibration_list, [this](Browser b, Payload p, Callback c) {
    HandleCalibrationList(b, p, c);
  });
  Add(cmd_calibration_rollback, [this](Browser b, Payload p, Callback c) {
    HandleCalibrationRollback(b, p, c);
  });
  Add(cmd_calibration_delete, [this](Browser b, Payload p, Callback c) {
    HandleCalibrationDelete(b, p, c);
  });

  // ------------------------------------------------------------------
  // Calibration Vision (Phase 1/2/3) — CalibVision Facade 위임
  // ------------------------------------------------------------------
  // Phase 1: ROI 내 단일 타겟(사각형/원) 자동 피팅
  Add("cmd.vision.autoFit", [this](Browser b, Payload p, Callback c) {
    const int camId = static_cast<int>(GetSafeDouble(p, _T("camId"), 0.0));
    const double x = GetSafeDouble(p, _T("x"));
    const double y = GetSafeDouble(p, _T("y"));
    const double w = GetSafeDouble(p, _T("w"));
    const double h = GetSafeDouble(p, _T("h"));
    std::string shape = p && p->HasKey("shape")
                            ? p->GetString("shape").ToString()
                            : std::string("auto");
    // OpenCV 연산은 수 ms~수십 ms — UI 스레드 블로킹 방지 위해 워커에서 수행
    WORK_1([camId, x, y, w, h, shape, c]() {
      c->Success(CalibVision::Instance().AutoFitJson(camId, x, y, w, h, shape));
    });
  });

  // Phase 2: 체커보드/도트그리드 전자동 검출
  Add("cmd.vision.detectPattern", [this](Browser b, Payload p, Callback c) {
    const int camId = static_cast<int>(GetSafeDouble(p, _T("camId"), 0.0));
    const int cols = static_cast<int>(GetSafeDouble(p, _T("cols"), 0.0));
    const int rows = static_cast<int>(GetSafeDouble(p, _T("rows"), 0.0));
    const double pitch = GetSafeDouble(p, _T("pitchMm"));
    std::string pattern = p && p->HasKey("pattern")
                              ? p->GetString("pattern").ToString()
                              : std::string("chessboard");
    WORK_1([camId, cols, rows, pitch, pattern, c]() {
      c->Success(CalibVision::Instance().DetectPatternJson(camId, pattern, cols,
                                                           rows, pitch));
    });
  });

  // Phase 3: 스테이지 이동 기반 자동 캘리브레이션 (시작/상태/중단)
  Add("cmd.vision.stageCalibStart", [this](Browser b, Payload p, Callback c) {
    const int camId = static_cast<int>(GetSafeDouble(p, _T("camId"), 0.0));
    const double stepMm = GetSafeDouble(p, _T("stepMm"), 0.5);
    std::string speed = p && p->HasKey("speed")
                            ? p->GetString("speed").ToString()
                            : std::string("slow");
    c->Success(CalibVision::Instance().StageCalibStart(camId, stepMm, speed));
  });
  Add("cmd.vision.stageCalibStatus", [this](Browser b, Payload p, Callback c) {
    c->Success(CalibVision::Instance().StageCalibStatusJson());
  });
  Add("cmd.vision.stageCalibAbort", [this](Browser b, Payload p, Callback c) {
    c->Success(CalibVision::Instance().StageCalibAbort());
  });

  // Camera Configuration
  Add(cmd_config_getCamera, [this](Browser b, Payload p, Callback c) {
    HandleConfigGetCamera(b, p, c);
  });
  Add("cmd.config.getMachineStatus", [this](Browser b, Payload p, Callback c) {
    HandleConfigGetMachineStatus(b, p, c);
  });
  Add(cmd_config_setCamera, [this](Browser b, Payload p, Callback c) {
    HandleConfigSetCamera(b, p, c);
  });

  // [New] Laser Configuration
  Add("cmd.config.getLaser", [this](Browser b, Payload p, Callback c) {
    HandleConfigGetLaser(b, p, c);
  });
  Add("cmd.config.setLaser", [this](Browser b, Payload p, Callback c) {
    HandleConfigSetLaser(b, p, c);
  });

  // Aurelia Laser Channels
  Add("cmd.aurelia.power", [this](Browser b, Payload p, Callback c) {
    HandleAureliaPower(b, p, c);
  });
  Add("cmd.aurelia.shutter", [this](Browser b, Payload p, Callback c) {
    HandleAureliaShutter(b, p, c);
  });
  Add("cmd.aurelia.setParams", [this](Browser b, Payload p, Callback c) {
    HandleAureliaSetParams(b, p, c);
  });
  Add("cmd.aurelia.save",
      [this](Browser b, Payload p, Callback c) { HandleAureliaSave(b, p, c); });
  Add("cmd.aurelia.getStatus", [this](Browser b, Payload p, Callback c) {
    // [FIX] UI 스레드 데드락 방지를 위해 백그라운드 캐시 데이터를 즉시 반환함.
    std::string json;
    {
      std::lock_guard<std::mutex> lock(m_AureliaCacheMutex);
      json = m_AureliaStatusJson;
    }
    if (json.empty())
      json = "{\"connected\": false}";
    c->Success(json);
  });

  // Scanner Configuration
  Add("cmd.config.getScanner", [this](Browser b, Payload p, Callback c) {
    HandleConfigGetScanner(b, p, c);
  });
  Add("cmd.config.setScanner", [this](Browser b, Payload p, Callback c) {
    HandleConfigSetScanner(b, p, c);
  });

  // Recipe Center
  Add("cmd.recipe.center.load", [this](Browser b, Payload p, Callback c) {
    HandleRecipeCenterLoad(b, p, c);
  });
  Add("cmd.recipe.center.save", [this](Browser b, Payload p, Callback c) {
    HandleRecipeCenterSave(b, p, c);
  });

  // Color Preset Library
  Add("cmd.presetLibrary.load", [this](Browser b, Payload p, Callback c) {
    HandlePresetLibraryLoad(b, p, c);
  });
  Add("cmd.presetLibrary.save", [this](Browser b, Payload p, Callback c) {
    HandlePresetLibrarySave(b, p, c);
  });

  // [NEW] Logs
  Add("cmd.log.write",
      [this](Browser b, Payload p, Callback c) { HandleLogWrite(b, p, c); });

  // Motion Configuration
  Add(cmd_config_getMotion, [this](Browser b, Payload p, Callback c) {
    HandleConfigGetMotion(b, p, c);
  });
  Add(cmd_config_setMotion, [this](Browser b, Payload p, Callback c) {
    HandleConfigSetMotion(b, p, c);
  });

  // [NEW] Moons Configuration
  Add("cmd.config.getMoons", [this](Browser b, Payload p, Callback c) {
    HandleConfigGetMoons(b, p, c);
  });
  Add("cmd.config.setMoons", [this](Browser b, Payload p, Callback c) {
    HandleConfigSetMoons(b, p, c);
  });

  // Laser Set Center Reform
  Add(cmd_calib_getState, [this](Browser b, Payload p, Callback c) {
    HandleCalibGetState(b, p, c);
  });
  Add(cmd_calib_setViewRatio, [this](Browser b, Payload p, Callback c) {
    HandleCalibSetViewRatio(b, p, c);
  });
  Add(cmd_calib_pickCenter, [this](Browser b, Payload p, Callback c) {
    HandleCalibPickCenter(b, p, c);
  });
  Add(cmd_calib_apply,
      [this](Browser b, Payload p, Callback c) { HandleCalibApply(b, p, c); });
  Add(cmd_calib_save,
      [this](Browser b, Payload p, Callback c) { HandleCalibSave(b, p, c); });

  // [NEW] Light Control
  Add("cmd.light.get_config", [this](Browser b, Payload p, Callback c) {
    HandleLightGetConfig(b, p, c);
  });
  Add("cmd.light.set_val",
      [this](Browser b, Payload p, Callback c) { HandleLightSetVal(b, p, c); });
  Add("cmd.light.set_mode", [this](Browser b, Payload p, Callback c) {
    HandleLightSetMode(b, p, c);
  });
  Add("cmd.light.save",
      [this](Browser b, Payload p, Callback c) { HandleLightSave(b, p, c); });
  // [NEW] Light Enable
  Add("cmd.light.set_enable", [this](Browser b, Payload p, Callback c) {
    HandleLightSetEnable(b, p, c);
  });

  bFlagMtGetPosition = true;
  LoadCalibState(); // Initial Load
}

// ---------------- OnQuery ----------------
bool PortalRouterHandler::OnQuery(
    CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
    QueryIdT /*query_id*/, const CefString &request, bool /*persistent*/,
    CefRefPtr<CefMessageRouterBrowserSide::Callback> cb) {
  CEF_REQUIRE_UI_THREAD();

  /**
   * @brief Log the query request with size limitation.
   * @details TRACE macro has a buffer limit (usually 512-1024 bytes).
   * Massive payloads like generated G-Code will cause a "Buffer too small" C++
   * runtime assertion. To prevent this, we truncate the logging string if it
   * exceeds a safe threshold.
   */
  std::wstring reqStr = request.ToWString();
  if (reqStr.length() > 256) {
    reqStr = reqStr.substr(0, 256) + L" ... [TRUNCATED]";
  }
  TRACE(_T("OnQuery : %s\n"), reqStr.c_str());

  auto v = CefParseJSON(request, JSON_PARSER_RFC);
  if (!v || !v->IsValid() || v->GetType() != VTYPE_DICTIONARY) {
    cb->Failure(400, "bad json");
    return true;
  }

  auto dict = v->GetDictionary();
  if (!dict->HasKey("channel")) {
    cb->Failure(400, "no channel");
    return true;
  }

  const std::string ch = dict->GetString("channel");
  auto it =
      command_map_.find(ch); // std::string -> string_view OK (temporary view)

  if (it == command_map_.end()) {
    cb->Failure(404, "unknown channel");
    return true;
  }

  Payload payload = dict->HasKey("payload") ? dict->GetDictionary("payload")
                                            : CefDictionaryValue::Create();

  it->second(browser, payload, cb);
  return true;
}

// ---------------- Helpers ----------------
HWND PortalRouterHandler::GetTopLevelWindow(CefRefPtr<CefBrowser> browser) {
  if (browser && browser->GetHost()) {
    return GetTopLevelFromAny(browser->GetHost()->GetWindowHandle());
  }
  return nullptr;
}

// ---------------- HW & UI ----------------
void PortalRouterHandler::HandleHwStartInit(Browser, Payload, Callback cb) {
  if (auto *h = SimpleHandler::GetInstance())
    h->BroadcastJS("window.__startHw && window.__startHw()");
  cb->Success(MakeOk());
}
void PortalRouterHandler::HandleHwGetProgress(Browser, Payload, Callback cb) {
  cb->Success("{\"percent\":0,\"step\":\"N/A\",\"log\":[]}");
}
void PortalRouterHandler::HandleUiGetTheme(Browser, Payload, Callback cb) {
  cb->Success("{\"theme\":\"dark\"}");
}
void PortalRouterHandler::HandleUiSetTheme(Browser, Payload payload,
                                           Callback cb) {
  std::string t = payload->GetString("theme");
  if (t != "dark" && t != "light")
    t = "light";
  if (auto *h = SimpleHandler::GetInstance())
    h->BroadcastJS("window.__applyTheme && window.__applyTheme('" + t + "');");
  cb->Success(MakeOk());
}

// ---------------- App & Window ----------------
void PortalRouterHandler::HandleAppOpenMain(Browser browser, Payload,
                                            Callback cb) {
  OutputDebugStringW(L"[DEBUG] HandleAppOpenMain called.\n");

  if (m_isMainOpened) {
    OutputDebugStringW(
        L"[DEBUG] HandleAppOpenMain: Already processed. Skipping.\n");
    // [FIX] 이미 메인 창이 열린 상태에서 반복적으로 SetForegroundWindow를
    // 호출하여 포커스를 뺏어가는 현상을 방지하기 위해 주석 처리함.
    /*
    if (HWND hTop = GetTopLevelWindow(browser)) {
            ::SetForegroundWindow(hTop);
    }
    */
    cb->Success(MakeOk());
    return;
  }
  m_isMainOpened = true;

  HWND hTop = GetTopLevelWindow(browser);
  if (!hTop) {
    cb->Failure(500, "no top window");
    return;
  }

  // [FIX] 스플래시 창에서 적용했던 'SkipTaskbar' 설정을 제거하고 메인
  // 윈도우용(Resizable) 스타일을 재적용합니다. 이 작업을 수행해야 작업 표시줄에
  // 아이콘이 정상적으로 다시 나타납니다. 스타일 변경을 Windows 셸(작업 표시줄,
  // Alt+Tab) 시스템이 인식하도록 HIDE 후 변경합니다.
  ::ShowWindow(hTop, SW_HIDE);
  ApplyBorderless(hTop, BLF_Resizable);

  const auto &cfg = AppConfig::instance();
  RECT work_area;
  SystemParametersInfo(SPI_GETWORKAREA, 0, &work_area, 0);
  const int screen_w = work_area.right - work_area.left;
  const int screen_h = work_area.bottom - work_area.top;

  RECT nr;
  nr.left = work_area.left + (screen_w - cfg.main_width) / 2;
  nr.top = work_area.top + (screen_h - cfg.main_height) / 2;
  nr.right = nr.left + cfg.main_width;
  nr.bottom = nr.top + cfg.main_height;

  // [FIX] Flicker elimination: Do NOT force SW_SHOWNORMAL before Maximize.
  // Just ensure the window has the correct style and then Maximize.

  // WINDOWPLACEMENT wp = { sizeof(wp) };
  // ::GetWindowPlacement(hTop, &wp);
  // wp.rcNormalPosition = nr; wp.showCmd = SW_SHOWNORMAL;
  // ::SetWindowPlacement(hTop, &wp);

  if (::IsZoomed(hTop)) {
    if (auto f = browser->GetMainFrame())
      f->ExecuteJavaScript(
          "if (location.hash !== '#/main') location.hash = '#/main';",
          f->GetURL(), 0);
    cb->Success(MakeOk());
    return;
  }

  ApplyBorderless(hTop, BLF_Resizable | BLF_BlockCtrlF4);
  if (HWND hHit = FindCefHitTestTarget(hTop))
    InstallHitTestSubclass(hHit, BLF_Resizable);

  ::ShowWindow(hTop, SW_SHOWMAXIMIZED);
  ::SetForegroundWindow(hTop);

  if (auto f = browser->GetMainFrame())
    f->ExecuteJavaScript(
        "if (location.hash !== '#/main') location.hash = '#/main';",
        f->GetURL(), 0);

  cb->Success(MakeOk());
}

void PortalRouterHandler::HandleAppQuit(Browser, Payload, Callback cb) {
  if (auto *h = SimpleHandler::GetInstance())
    h->CloseAllBrowsers(true);
  cb->Success(MakeOk());
}
void PortalRouterHandler::HandleWindowMinimize(Browser browser, Payload,
                                               Callback cb) {
  if (HWND hTop = GetTopLevelWindow(browser)) {
    // 스플래시 단계에서 적용한 BLF_SkipTaskbar를 제거하고 리사이즈 가능한 메인
    // 스타일로 복원합니다.
    ApplyBorderless(hTop, BLF_Resizable);

    // 윈도우 최소화
    ::ShowWindow(hTop, SW_MINIMIZE);
  }
  cb->Success(MakeOk());
}
void PortalRouterHandler::HandleWindowMaximizeToggle(Browser browser, Payload,
                                                     Callback cb) {
  if (HWND hTop = GetTopLevelWindow(browser)) {
    // 스플래시 단계에서 적용한 BLF_SkipTaskbar를 제거하고 리사이즈 가능한 메인
    // 스타일로 복원합니다.
    ApplyBorderless(hTop, BLF_Resizable);

    // 윈도우 최대화 및 스타일 리프레시
    if (::IsZoomed(hTop)) {
      ::ShowWindow(hTop, SW_RESTORE);
      ::SetWindowPos(hTop, NULL, 0, 0, 1280, 960, SWP_NOMOVE | SWP_NOZORDER);
    } else {
      ::ShowWindow(hTop, SW_MAXIMIZE);
    }
  }
  cb->Success(MakeOk());
}
void PortalRouterHandler::HandleWindowClose(Browser browser, Payload,
                                            Callback cb) {
  if (browser && browser->GetHost())
    browser->GetHost()->CloseBrowser(false);
  cb->Success(MakeOk());
}
void PortalRouterHandler::HandleWindowDrag(Browser browser, Payload,
                                           Callback cb) {
  if (HWND hTop = GetTopLevelWindow(browser)) {
    // [FIX] Ensure Drag-Restore uses the fixed size (1280x960)
    if (::IsZoomed(hTop)) {
      WINDOWPLACEMENT wp = {sizeof(wp)};
      if (::GetWindowPlacement(hTop, &wp)) {
        // Maintain top/left, force width/height
        int width = 1280;
        int height = 960;
        wp.rcNormalPosition.right = wp.rcNormalPosition.left + width;
        wp.rcNormalPosition.bottom = wp.rcNormalPosition.top + height;
        ::SetWindowPlacement(hTop, &wp);
      }
    }

    ::ReleaseCapture();
    ::SendMessage(hTop, WM_SYSCOMMAND, SC_MOVE | HTCAPTION, 0);
  }
  cb->Success(MakeOk());
}

#include "Modules/Vision/VisionBridge/VisionBridge.h"

// ---------------- Camera ----------------
void PortalRouterHandler::HandleCameraStart(Browser, Payload p, Callback cb) {
  const int id = p->HasKey("id") ? p->GetInt("id") : 0;
  const bool preview = p->HasKey("preview") ? p->GetBool("preview") : true;

  WORK_1([id, preview, cb]() {
    bool ok = false; // try { ok = VM_Start(id, preview); }
    // catch (...) { ok = false; }
    cb->Success(ok ? MakeOk() : MakeErr("camera.start failed"));
  });
}
void PortalRouterHandler::HandleCameraStop(Browser, Payload p, Callback cb) {
  const int id = p->HasKey("id") ? p->GetInt("id") : 0;
  WORK_1([id, cb]() {
    bool ok = false; // try { ok = VM_Stop(id); }
    // catch (...) { ok = false; }
    cb->Success(ok ? MakeOk() : MakeErr("camera.stop failed"));
  });
}
void PortalRouterHandler::HandleCameraGetRange(Browser p, Payload pPayload,
                                               Callback cb) {
  const int id = pPayload->HasKey("id") ? pPayload->GetInt("id") : 0;

  WORK_1([id, cb]() {
    double emin = 50, emax = 40000, estep = 50;
    double gmin = 0, gmax = 24, gstep = 1;
    // try { VM_GetRange(id, emin, emax, estep, gmin, gmax, gstep); }
    // catch (...) {}

    auto d = CefDictionaryValue::Create();
    auto e = CefDictionaryValue::Create();
    auto g = CefDictionaryValue::Create();

    e->SetDouble("min", emin);
    e->SetDouble("max", emax);
    e->SetDouble("inc", estep);
    g->SetDouble("min", gmin);
    g->SetDouble("max", gmax);
    g->SetDouble("inc", gstep);
    d->SetDictionary("exposure", e);
    d->SetDictionary("gain", g);

    // [User Request] - Check if camera is physically connected
    bool isConnected = VisionBridge::Instance().HasCamera(id);
    d->SetBool("connected", isConnected);

    cb->Success(DictToJson(d));
  });
}
void PortalRouterHandler::HandleCameraSetParams(Browser, Payload p,
                                                Callback cb) {
  const int id = p->HasKey("id") ? p->GetInt("id") : 0;

  // Extract values before moving to worker thread
  // [FIX] Use -1.0 as sentinel to skip updating if key is missing
  double exposure =
      p->HasKey("exposure") ? GetSafeDouble(p, "exposure", -1.0) : -1.0;
  double gain = p->HasKey("gain") ? GetSafeDouble(p, "gain", -1.0) : -1.0;

  WORK_1([id, exposure, gain, cb]() {
    bool ok = true;
    try {
      if (exposure >= 0) {
        ok = ok && VisionBridge::Instance().SetExposure(id, exposure);
      }
      if (gain >= 0) {
        ok = ok && VisionBridge::Instance().SetGain(id, gain);
      }
    } catch (...) {
      ok = false;
    }
    cb->Success(ok ? MakeOk() : MakeErr("camera.setParams failed"));
  });
}

// ---------------- Motion ----------------
void PortalRouterHandler::HandleMotionAllHome(Browser b, Payload p,
                                              Callback cb) {
  TRACE(_T("HandleMotionAllHome called\n"));

  m_bHomingX = true;
  m_bHomingY = true;
  m_bHomingZ = true;

  if (MachineProfile::Instance().GetMotion() == "PMAC") {
    WORK_1([]() {
      try {
        PMACUtil::AllHome();
        if (MachineProfile::Instance().HasLensMotor()) {
          MoonsUtil::TryMirrorInitialze(g_Lens, g_PMAC, 10);
          MotorUtil::Async::Home(&g_Lens, INFINITE);
        }

        MoonsUtil::TryMirrorInitialze(g_Mirror, g_PMAC, 10);
        MotorUtil::Async::Home(&g_Mirror, INFINITE);
      } catch (...) {
      }
    });
  } else {
    WORK_1([]() {
      MotorUtil::Sync::Home(&g_Z, INFINITE);
      MotorUtil::Async::Home(&g_X, INFINITE);
      MotorUtil::Async::Home(&g_Y, INFINITE);
    });
  }

  cb->Success(MakeOk());
}

void PortalRouterHandler::HandleMotionHome(Browser b, Payload p, Callback cb) {
  // {"channel":"motion.home","payload":{"axis":"X"}}
  TRACE(_T("HandleMotionHome called\n"));

  CString Axis = (LPCTSTR)p->GetString(_T("axis")).c_str();

  if (Axis == _T("X")) m_bHomingX = true;
  else if (Axis == _T("Y")) m_bHomingY = true;
  else if (Axis == _T("Z")) m_bHomingZ = true;

  WORK_1([Axis]() {
    try {
      if (g_AxisMap.find(Axis) != g_AxisMap.end()) {
        g_AxisMap[Axis]->Homing();
      }
    } catch (...) {
    }
  });

  cb->Success(MakeOk());
}

void PortalRouterHandler::HandleMotionCancelHome(Browser b, Payload p,
                                                 Callback cb) {
  TRACE(_T("HandleMotionCancelHome called\n"));

  std::string axisStr = "";
  if (p.get() && p->HasKey("axis")) {
    axisStr = p->GetString("axis").ToString();
  }

  if (axisStr.empty() || axisStr == "all") {
    m_bHomingX = false;
    m_bHomingY = false;
    m_bHomingZ = false;
  } else if (axisStr == "X") {
    m_bHomingX = false;
  } else if (axisStr == "Y") {
    m_bHomingY = false;
  } else if (axisStr == "Z") {
    m_bHomingZ = false;
  }

  if (MachineProfile::Instance().GetMotion() == "PMAC") {
    WORK_1([axisStr, cb]() {
      CString varName;
      if (axisStr.empty() || axisStr == "all") {
        varName = INI_PMAC.GetString(_T("MOTOR"), _T("ALL_HOME"));
      } else if (axisStr == "X") {
        varName = INI_PMAC.GetString(_T("X"), _T("HOME"));
      } else if (axisStr == "Y") {
        varName = INI_PMAC.GetString(_T("Y"), _T("HOME"));
      } else if (axisStr == "Z") {
        varName = INI_PMAC.GetString(_T("Z"), _T("HOME"));
      } else {
        cb->Success(MakeErr("Invalid axis"));
        return;
      }

      if (varName.IsEmpty()) {
        cb->Success(MakeErr("Homing variable not found"));
        return;
      }

      CString cmd;
      cmd.Format(_T("%s=2"), varName.GetString());
      if (g_PMAC.Write(cmd)) {
        cb->Success(MakeOk());
      } else {
        cb->Success(MakeErr("Failed to cancel homing"));
      }
    });
  } else if (MachineProfile::Instance().GetMotion() == "Fastech") {
    WORK_1([axisStr, cb]() {
      BOOL Ret = FALSE;
      CString varName;
      if (axisStr.empty() || axisStr == "all") {
        Ret = g_X.Stop();
        Ret = g_Y.Stop();
        Ret = g_Z.Stop();
      } else if (axisStr == "X") {
        Ret = g_X.Stop();
      } else if (axisStr == "Y") {
        Ret = g_Y.Stop();
      } else if (axisStr == "Z") {
        Ret = g_Z.Stop();
      } else {
        cb->Success(MakeErr("Invalid axis"));
        return;
      }

      if (Ret) {
        cb->Success(MakeOk());
      } else {
        cb->Success(MakeErr("Failed to cancel homing"));
      }
    });
  }
}

void PortalRouterHandler::HandleMotionStop(Browser b, Payload p, Callback cb) {
  TRACE(_T("HandleMotionStop called\n"));

  if (MachineProfile::Instance().GetMotion() == "PMAC") {
    WORK_1([cb]() {
      PMACUtil::AllStop();
      cb->Success(MakeOk());
    });
  } else if (MachineProfile::Instance().GetMotion() == "Fastech") {
    WORK_1([cb]() {
      g_X.Stop();
      g_Y.Stop();
      g_Z.Stop();
      cb->Success(MakeOk());
    });
  }
}

void PortalRouterHandler::HandleMotionJogStart(Browser b, Payload p,
                                               Callback cb) {
  // {"channel":"motion.jog.start","payload":{"axis":"X","dir":"+","speed":"mid"}}
  TRACE(_T("motion.jog.start called\n"));

  std::string axisStr = p->GetString("axis").ToString();
  CString Axis = (LPCTSTR)p->GetString(_T("axis")).c_str();
  BOOL Dir = ((CString)(LPCTSTR)p->GetString(_T("dir")).c_str()) == _T("+");
  std::string speedMode = p->GetString("speed").ToString();

  WORK_1([axisStr, Axis, Dir, speedMode]() {
    try {
      // Apply speed profile if available
      auto *pParams = EqMotionRunPara::Instance().GetAxis(axisStr);
      if (pParams && g_AxisMap.find(Axis) != g_AxisMap.end()) {
        double vel = pParams->mid.velocity;
        double accel = pParams->mid.accel_time;

        if (speedMode == "slow") {
          vel = pParams->slow.velocity;
          accel = pParams->slow.accel_time;
        } else if (speedMode == "fast") {
          vel = pParams->fast.velocity;
          accel = pParams->fast.accel_time;
        }

        if (MachineProfile::Instance().GetUnitMultiplier() == 1.0) {
          vel /= 1000.0;
          accel /= 1000.0;
        }

        g_AxisMap[Axis]->SetSpeed(vel, accel);
      }

      if (Dir)
        g_AxisMap[Axis]->JogCW();
      else
        g_AxisMap[Axis]->JogCCW();
    } catch (...) {
    }
  });

  cb->Success(MakeOk());
}

void PortalRouterHandler::HandleMotionJogStop(Browser b, Payload p,
                                              Callback cb) {
  // {"channel":"motion.jog.stop","payload":{"axis":"X"}}
  TRACE(_T("motion.jog.stop called\n"));

  CString Axis = (LPCTSTR)p->GetString(_T("axis")).c_str();

  WORK_1([Axis, cb]() {
    g_AxisMap[Axis]->Stop();
    cb->Success(MakeOk());
  });
}

void PortalRouterHandler::HandleMotionMoveRel(Browser b, Payload p,
                                              Callback cb) {
  // {"channel":"motion.moveRel","payload":{"axis":"X","distance":10,"speed":"mid"}}

  std::string axisStr = p->GetString("axis").ToString();
  CString Axis = (LPCTSTR)p->GetString(_T("axis"))
                     .c_str(); // CefString -> LPCTSTR -> CString

  // [Refactor] GetSafeDouble을 사용하여 10(int)도 10.0(double)으로 안전하게
  // 변환
  double Distance = GetSafeDouble(p, _T("distance"));
  std::string speedMode = p->GetString("speed").ToString();

  Distance *= MachineProfile::Instance().GetUnitMultiplier();

  WORK_1([axisStr, Axis, Distance, speedMode]() {
    try {
      // Apply speed profile if available
      auto *pParams = EqMotionRunPara::Instance().GetAxis(axisStr);
      if (pParams && g_AxisMap.find(Axis) != g_AxisMap.end()) {
        double vel = pParams->mid.velocity;
        double accel = pParams->mid.accel_time;

        if (speedMode == "slow") {
          vel = pParams->slow.velocity;
          accel = pParams->slow.accel_time;
        } else if (speedMode == "fast") {
          vel = pParams->fast.velocity;
          accel = pParams->fast.accel_time;
        }

        if (MachineProfile::Instance().GetUnitMultiplier() == 1.0) {
          vel /= 1000.0;
          accel /= 1000.0;
        }

        g_AxisMap[Axis]->SetSpeed(vel, accel);
      }

      g_AxisMap[Axis]->MovRel(Distance);
    } catch (...) {
    }
  });

  cb->Success(MakeOk());
}

void PortalRouterHandler::HandleMotionMoveAbs(Browser b, Payload p,
                                              Callback cb) {
  // {"channel":"motion.moveAbs","payload":{"axis":"X","position":0,"speed":"mid"}}
  TRACE(_T("motion.MoveRel called\n"));

  std::string axisStr = p->GetString("axis").ToString();
  CString Axis = (LPCTSTR)p->GetString(_T("axis")).c_str();

  // [Refactor] GetSafeDouble 사용
  double Pos = GetSafeDouble(p, _T("position"));
  std::string speedMode = p->GetString("speed").ToString();

  Pos *= MachineProfile::Instance().GetUnitMultiplier();

  WORK_1([axisStr, Axis, Pos, speedMode]() {
    try {
      // Apply speed profile if available
      auto *pParams = EqMotionRunPara::Instance().GetAxis(axisStr);
      if (pParams && g_AxisMap.find(Axis) != g_AxisMap.end()) {
        double vel = pParams->mid.velocity;
        double accel = pParams->mid.accel_time;

        if (speedMode == "slow") {
          vel = pParams->slow.velocity;
          accel = pParams->slow.accel_time;
        } else if (speedMode == "fast") {
          vel = pParams->fast.velocity;
          accel = pParams->fast.accel_time;
        }

        if (MachineProfile::Instance().GetUnitMultiplier() == 1.0) {
          vel /= 1000.0;
          accel /= 1000.0;
        }

        g_AxisMap[Axis]->SetSpeed(vel, accel);
      }
      g_AxisMap[Axis]->MovAbs(Pos);
    } catch (...) {
    }
  });

  cb->Success(MakeOk());
}

void PortalRouterHandler::HandleMotionGetPosition(Browser b, Payload p,
                                                  Callback cb) {
  if (bFlagMtGetPosition) {
    // [Optimization] Return cached position immediately on the UI thread.
    // This solves UI freezing/delay during motion by avoiding driver locks on
    // the response path.
    MotionStatusCache cache;
    {
      std::lock_guard<std::mutex> lock(m_CacheMutex);
      cache = m_MotionCache;
    }

    CefRefPtr<CefDictionaryValue> Root = CefDictionaryValue::Create();
    CefRefPtr<CefDictionaryValue> PayLoad = CefDictionaryValue::Create();

    Root->SetString("channel", "motion.getPosition");
    PayLoad->SetDouble("X", cache.x);
    PayLoad->SetDouble("Y", cache.y);
    PayLoad->SetDouble("Z", cache.z);

    PayLoad->SetBool("servoX", cache.servoX);
    PayLoad->SetBool("servoY", cache.servoY);
    PayLoad->SetBool("servoZ", cache.servoZ);

    PayLoad->SetBool("homedX", cache.homedX);
    PayLoad->SetBool("homedY", cache.homedY);
    PayLoad->SetBool("homedZ", cache.homedZ);

    PayLoad->SetBool("alarmX", cache.alarmX);
    PayLoad->SetBool("alarmY", cache.alarmY);
    PayLoad->SetBool("alarmZ", cache.alarmZ);

    PayLoad->SetString("alarmReasonX", cache.alarmReasonX);
    PayLoad->SetString("alarmReasonY", cache.alarmReasonY);
    PayLoad->SetString("alarmReasonZ", cache.alarmReasonZ);

    PayLoad->SetInt("servoStateX", cache.servoStateX);
    PayLoad->SetInt("servoStateY", cache.servoStateY);
    PayLoad->SetInt("servoStateZ", cache.servoStateZ);

    PayLoad->SetInt("alarmResetStateX", cache.alarmResetStateX);
    PayLoad->SetInt("alarmResetStateY", cache.alarmResetStateY);
    PayLoad->SetInt("alarmResetStateZ", cache.alarmResetStateZ);

    CefRefPtr<CefDictionaryValue> safety = CefDictionaryValue::Create();
    safety->SetBool("emo", cache.emo);
    safety->SetBool("interlockTriggered", cache.interlockTriggered);
    safety->SetString("safetyMessage", cache.safetyMessage);
    safety->SetString("errorAxis", cache.errorAxis);
    safety->SetDouble("errorValue", cache.errorValue);
    safety->SetDouble("errorLimit", cache.errorLimit);
    PayLoad->SetDictionary("safety", safety);

    PayLoad->SetBool("scannerConnected", cache.scannerConnected);
    PayLoad->SetInt("scannerHeadStatus", cache.scannerHeadStatus);
    PayLoad->SetInt("scannerInitStatus", cache.scannerInitStatus);

    Root->SetDictionary("payload", PayLoad);
    cb->Success(PortalRouterHandler::DictToJson(Root));
  } else {
    cb->Failure(503, "Polling Disabled (G-Code Uploading)");
  }
}

void PortalRouterHandler::StartPolling() {
  m_StopPolling = false;
  m_PollingThread = std::thread(&PortalRouterHandler::PollingLoop, this);
}

void PortalRouterHandler::StopPolling() {
  m_StopPolling = true;
  if (m_PollingThread.joinable()) {
    m_PollingThread.join();
  }
}

void PortalRouterHandler::PollingLoopMachineType1or2() {
  int aureliaTick = 0;
  while (!m_StopPolling) {
    if (bFlagMtGetPosition) {
      try {
        MotionStatusCache localCache;
        localCache.x = g_X.GetPos() / 1000.0;
        localCache.y = g_Y.GetPos() / 1000.0;
        localCache.z = g_Z.GetPos() / 1000.0;

        MotorStatus statusX = g_X.GetStatus();
        MotorStatus statusY = g_Y.GetStatus();
        MotorStatus statusZ = g_Z.GetStatus();

        localCache.servoX = statusX.m_Servo;
        localCache.servoY = statusY.m_Servo;
        localCache.servoZ = statusZ.m_Servo;
        localCache.homedX = statusX.m_HomeComplete;
        localCache.homedY = statusY.m_HomeComplete;
        localCache.homedZ = statusZ.m_HomeComplete;

        // [FIX] Clear the "homing in progress" flag only on real completion, so the
        // software interlock check resumes for that axis once it is actually homed.
        if (localCache.homedX) m_bHomingX = false;
        if (localCache.homedY) m_bHomingY = false;
        if (localCache.homedZ) m_bHomingZ = false;

        localCache.alarmX = statusX.m_IsAlarm;
        localCache.alarmY = statusY.m_IsAlarm;
        localCache.alarmZ = statusZ.m_IsAlarm;

        auto getAlarmReason = [](const MotorStatus &s) -> std::string {
          if (!s.m_IsAlarm)
            return "None";
          std::string errs = "";
          if (s.m_FollowingError)
            errs += "FollowingError, ";
          if (s.m_AmplifierFault)
            errs += "AmplifierFault, ";
          if (s.m_HomeSensorError)
            errs += "HomeSensorError, ";
          if (s.m_PositiveLimit)
            errs += "PositiveLimit, ";
          if (s.m_NegativeLimit)
            errs += "NegativeLimit, ";
          if (s.m_HomingError)
            errs += "HomingError, ";
          if (errs.empty())
            return "Unknown Alarm";
          if (errs.length() >= 2)
            errs = errs.substr(0, errs.length() - 2);
          return errs;
        };

        localCache.alarmReasonX = getAlarmReason(statusX);
        localCache.alarmReasonY = getAlarmReason(statusY);
        localCache.alarmReasonZ = getAlarmReason(statusZ);

        CString RetStr;
        if (g_PMAC.Read(_T("Mtr1_ServoOnOff"), RetStr))
          localCache.servoStateX = _ttoi(RetStr);
        if (g_PMAC.Read(_T("Mtr2_ServoOnOff"), RetStr))
          localCache.servoStateY = _ttoi(RetStr);
        if (g_PMAC.Read(_T("Mtr3_ServoOnOff"), RetStr))
          localCache.servoStateZ = _ttoi(RetStr);

        if (g_PMAC.Read(_T("Mtr1_AlarmReset"), RetStr))
          localCache.alarmResetStateX = _ttoi(RetStr);
        if (g_PMAC.Read(_T("Mtr2_AlarmReset"), RetStr))
          localCache.alarmResetStateY = _ttoi(RetStr);
        if (g_PMAC.Read(_T("Mtr3_AlarmReset"), RetStr))
          localCache.alarmResetStateZ = _ttoi(RetStr);

        CString AddrEmo =
            INI_PMAC.GetString(_T("COMMON_CMD"), _T("IN_EMG_STOP"));
        if (!AddrEmo.IsEmpty() && g_PMAC.Read(AddrEmo, RetStr)) {
          bool bEmoActive = (_ttoi(RetStr) == 0); // 0 is Active/Input ON
          localCache.emo = bEmoActive;

          if (bEmoActive && !m_bEMOTriggered) {
            m_bEMOTriggered = true;
            LogManager::Instance().Write(
                "CRITICAL", "Safety",
                "Emergency Stop Triggered! Kiling X, Y, Z Servos.");

            // Servo OFF X, Y, Z (Axes 1, 2, 3)
            g_PMAC.Write(_T("Mtr1_ServoOnOff=2"));
            g_PMAC.Write(_T("Mtr2_ServoOnOff=2"));
            g_PMAC.Write(_T("Mtr3_ServoOnOff=2"));
            PMACUtil::AllStop();

            localCache.safetyMessage = "EMERGENCY STOP TRIGGERED! (Servo OFF)";
          } else if (!bEmoActive) {
            m_bEMOTriggered = false;
          }
        }

        CString homingAddr = INI_PMAC.GetString(_T("MOTOR"), _T("ALL_HOME"));
        if (!homingAddr.IsEmpty() && g_PMAC.Read(homingAddr, RetStr))
          localCache.homingAll = _ttoi(RetStr);

        if (!INI_PMAC.GetString(_T("X"), _T("HOME")).IsEmpty() &&
            g_PMAC.Read(INI_PMAC.GetString(_T("X"), _T("HOME")), RetStr))
          localCache.homingX = _ttoi(RetStr);
        if (!INI_PMAC.GetString(_T("Y"), _T("HOME")).IsEmpty() &&
            g_PMAC.Read(INI_PMAC.GetString(_T("Y"), _T("HOME")), RetStr))
          localCache.homingY = _ttoi(RetStr);
        if (!INI_PMAC.GetString(_T("Z"), _T("HOME")).IsEmpty() &&
            g_PMAC.Read(INI_PMAC.GetString(_T("Z"), _T("HOME")), RetStr))
          localCache.homingZ = _ttoi(RetStr);

        // [Safety] Software Interlock Check
        // [FIX] Skip per-axis while that axis is actively homing: homing intentionally
        // drives an axis to/near its physical limits, so a soft interlock crossing at
        // that time is expected and must not AllStop() the in-progress homing motion.
        // Gated on m_bHoming{X,Y,Z}, a persistent flag set when homing is commanded and
        // cleared only on real completion/cancel -- the raw PMAC homing register
        // (localCache.homingX/Y/Z) is transient and does not reliably stay at a single
        // "in progress" value for the whole homing routine, so it is not used here.
        {
          auto isAxisHoming = [this](const std::string &axis) {
            if (axis == "X") return m_bHomingX.load();
            if (axis == "Y") return m_bHomingY.load();
            if (axis == "Z") return m_bHomingZ.load();
            return false;
          };

          std::vector<std::pair<std::string, double>> currentAxes = {
              {"X", localCache.x}, {"Y", localCache.y}, {"Z", localCache.z}};

          for (auto &axisPair : currentAxes) {
            if (isAxisHoming(axisPair.first)) {
              continue;
            }
            auto *pParams = EqMotionRunPara::Instance().GetAxis(axisPair.first);
            if (pParams && pParams->limit_used) {
              double pos = axisPair.second;
              bool bViolated = false;
              double limit = 0;

              if (pos < pParams->interlock_min) {
                bViolated = true;
                limit = pParams->interlock_min;
              } else if (pos > pParams->interlock_max) {
                bViolated = true;
                limit = pParams->interlock_max;
              }

              if (bViolated) {
                PMACUtil::AllStop();
                localCache.interlockTriggered = true;
                localCache.errorAxis = axisPair.first;
                localCache.errorValue = pos;
                localCache.errorLimit = limit;

                char buf[256];
                sprintf_s(buf,
                          "[%s] Soft Limit Exceeded! (Pos: %.3f, Limit: %.3f)",
                          axisPair.first.c_str(), pos, limit);
                localCache.safetyMessage = buf;

                if (!m_bInterlockTriggered) {
                  m_bInterlockTriggered = true;
                  LogManager::Instance().Write("ALARM", "Safety", buf);
                }
                break; // Only report one at a time
              } else {
                m_bInterlockTriggered = false;
              }
            }
          }
        }

        localCache.commError = g_PMAC.HasCommError();
        if (localCache.commError) {
          localCache.commErrorMessage =
              (const char *)CT2A(g_PMAC.GetCommError());
        }

        if (g_Scanner) {
          unsigned int initStatus = g_Scanner->GetInitStatus();
          unsigned int hs = g_Scanner->GetHeadStatus();
          static unsigned int lastInitStatus1 = 0xFFFFFFFF;
          static unsigned int lastHs1 = 0xFFFFFFFF;
          if (initStatus != lastInitStatus1 || hs != lastHs1) {
            lastInitStatus1 = initStatus;
            lastHs1 = hs;
            LogManager::Instance().Write("info", "Scanner", "[StatusPolling_M12] initStatus: " + std::to_string(initStatus) + ", headStatus: " + std::to_string(hs));
          }
          localCache.scannerInitStatus = initStatus;
          localCache.scannerHeadStatus = hs;
          bool cardOk = (initStatus & 0x80000000) != 0;
          bool headOk = (hs != 0);
          if (initStatus == 0 && hs == 0 && g_Scanner->IsOpen()) {
            cardOk = true;
            headOk = true;
          }
          localCache.scannerConnected = cardOk && headOk;
        }

        {
          std::lock_guard<std::mutex> lock(m_CacheMutex);
          m_MotionCache = localCache;
        }

        // 2. Aurelia Status Polling (Background)
        // UI 스레드 블로킹을 피하기 위해 여기서 1초 주기로 업데이트 (100ms *
        // 10)
        if (++aureliaTick >= 10) {
          aureliaTick = 0;
          std::string status = AureliaController::Instance().GetStatusJson();
          {
            std::lock_guard<std::mutex> lock(m_AureliaCacheMutex);
            m_AureliaStatusJson = status;
          }
        }
      } catch (...) {
      }
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }
}

void PortalRouterHandler::PollingLoopMachineType3() {
  int aureliaTick = 0;
  while (!m_StopPolling) {
    if (bFlagMtGetPosition) {
      try {
        MotionStatusCache localCache;
        localCache.x = g_X.GetPos();
        localCache.y = g_Y.GetPos();
        localCache.z = g_Z.GetPos();

        MotorStatus statusX = g_X.GetStatus();
        MotorStatus statusY = g_Y.GetStatus();
        MotorStatus statusZ = g_Z.GetStatus();

        localCache.servoX = statusX.m_Servo;
        localCache.servoY = statusY.m_Servo;
        localCache.servoZ = statusZ.m_Servo;
        localCache.homedX = statusX.m_HomeComplete;
        localCache.homedY = statusY.m_HomeComplete;
        localCache.homedZ = statusZ.m_HomeComplete;
        localCache.alarmX = statusX.m_IsAlarm;
        localCache.alarmY = statusY.m_IsAlarm;
        localCache.alarmZ = statusZ.m_IsAlarm;

        auto getAlarmReason = [](const MotorStatus &s) -> std::string {
          if (!s.m_IsAlarm)
            return "None";
          std::string errs = "";
          if (s.m_FollowingError)
            errs += "FollowingError, ";
          if (s.m_AmplifierFault)
            errs += "AmplifierFault, ";
          if (s.m_HomeSensorError)
            errs += "HomeSensorError, ";
          if (s.m_PositiveLimit)
            errs += "PositiveLimit, ";
          if (s.m_NegativeLimit)
            errs += "NegativeLimit, ";
          if (s.m_HomingError)
            errs += "HomingError, ";
          if (errs.empty())
            return "Unknown Alarm";
          if (errs.length() >= 2)
            errs = errs.substr(0, errs.length() - 2);
          return errs;
        };

        localCache.alarmReasonX = getAlarmReason(statusX);
        localCache.alarmReasonY = getAlarmReason(statusY);
        localCache.alarmReasonZ = getAlarmReason(statusZ);
        localCache.servoStateX = 0;
        localCache.servoStateY = 0;
        localCache.servoStateZ = 0;

        localCache.commError =
            statusX.m_IsAlarm || statusY.m_IsAlarm || statusZ.m_IsAlarm;
        if (localCache.commError) {
          if (statusX.m_IsAlarm)
            localCache.commErrorMessage =
                STR_A("X AlarmCode %d", g_X.GetLastError().m_Code);
          else if (statusY.m_IsAlarm)
            localCache.commErrorMessage =
                STR_A("Y AlarmCode %d", g_Y.GetLastError().m_Code);
          else if (statusZ.m_IsAlarm)
            localCache.commErrorMessage =
                STR_A("Z AlarmCode %d", g_Z.GetLastError().m_Code);
        }

        localCache.homingAll = statusX.m_HomeComplete ||
                               statusY.m_HomeComplete || statusZ.m_HomeComplete;
        localCache.homingX = statusX.m_HomeComplete;
        localCache.homingY = statusY.m_HomeComplete;
        localCache.homingZ = statusZ.m_HomeComplete;

        if (g_Scanner) {
          unsigned int initStatus = g_Scanner->GetInitStatus();
          unsigned int hs = g_Scanner->GetHeadStatus();
          static unsigned int lastInitStatus3 = 0xFFFFFFFF;
          static unsigned int lastHs3 = 0xFFFFFFFF;
          if (initStatus != lastInitStatus3 || hs != lastHs3) {
            lastInitStatus3 = initStatus;
            lastHs3 = hs;
            LogManager::Instance().Write("info", "Scanner", "[StatusPolling_M3] initStatus: " + std::to_string(initStatus) + ", headStatus: " + std::to_string(hs));
          }
          localCache.scannerInitStatus = initStatus;
          localCache.scannerHeadStatus = hs;
          bool cardOk = (initStatus & 0x80000000) != 0;
          bool headOk = (hs != 0);
          if (initStatus == 0 && hs == 0 && g_Scanner->IsOpen()) {
            cardOk = true;
            headOk = true;
          }
          localCache.scannerConnected = cardOk && headOk;
        }

        {
          std::lock_guard<std::mutex> lock(m_CacheMutex);
          m_MotionCache = localCache;
        }
      } catch (...) {
      }
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }
}

void PortalRouterHandler::PollingLoop() {
  if (MachineProfile::Instance().GetMotion() == "PMAC") {
    PollingLoopMachineType1or2();
  } else if (MachineProfile::Instance().GetMotion() == "Fastech") {
    PollingLoopMachineType3();
  }
}

void PortalRouterHandler::HandleMotionSetServo(Browser b, Payload p,
                                               Callback cb) {
  std::string axisStr = p->GetString("axis").ToString();
  int state = p->GetInt("state"); // 1 = ON, 2 = OFF

  if (MachineProfile::Instance().GetMotion() == "PMAC") {
    WORK_1([axisStr, state]() {
      try {
        CString cmd;
        if (axisStr == "X")
          cmd.Format(_T("Mtr1_ServoOnOff=%d"), state);
        else if (axisStr == "Y")
          cmd.Format(_T("Mtr2_ServoOnOff=%d"), state);
        else if (axisStr == "Z")
          cmd.Format(_T("Mtr3_ServoOnOff=%d"), state);

        if (!cmd.IsEmpty()) {
          g_PMAC.Write(cmd);
        }
      } catch (...) {
      }
    });
  } else if (MachineProfile::Instance().GetMotion() == "Fastech") {
    WORK_1([axisStr, state]() {
      try {
        BOOL onOff = (state == 1);
        if (axisStr == "X")
          g_X.Servo(onOff);
        else if (axisStr == "Y")
          g_Y.Servo(onOff);
        else if (axisStr == "Z")
          g_Z.Servo(onOff);
      } catch (...) {
      }
    });
  }
  cb->Success(MakeOk());
}

void PortalRouterHandler::HandleMotionResetAlarm(Browser b, Payload p,
                                                 Callback cb) {
  std::string axisStr = p->GetString("axis").ToString();
  int type = p->GetInt("type"); // 1 = Following Error, 2 = Amp Fault

  if (MachineProfile::Instance().GetMotion() == "PMAC") {
    WORK_1([axisStr, type]() {
      try {
        CString varName;
        if (axisStr == "X")
          varName = _T("Mtr1_AlarmReset");
        else if (axisStr == "Y")
          varName = _T("Mtr2_AlarmReset");
        else if (axisStr == "Z")
          varName = _T("Mtr3_AlarmReset");
        else
          return;

        CString cmd;
        cmd.Format(_T("%s=1"), varName.GetString());
        g_PMAC.Write(cmd);

        if (type == 2) {
          Sleep(10);
          g_PMAC.Write(cmd);
        }

        // Re-enable servo after a delay if it's an Amp Fault
        if (type == 2) {
          CString servoName;
          if (axisStr == "X")
            servoName = _T("Mtr1_ServoOnOff");
          else if (axisStr == "Y")
            servoName = _T("Mtr2_ServoOnOff");
          else if (axisStr == "Z")
            servoName = _T("Mtr3_ServoOnOff");

          std::thread([servoName]() {
            Sleep(15000);
            CString threadCmd;
            threadCmd.Format(_T("%s=1"), servoName.GetString());
            g_PMAC.Write(threadCmd);
          }).detach();
        }
      } catch (...) {
      }
    });
  } else if (MachineProfile::Instance().GetMotion() == "Fastech") {
    WORK_1([axisStr]() {
      if (axisStr == "X")
        g_X.AlarmReset();
      else if (axisStr == "Y")
        g_Y.AlarmReset();
      else if (axisStr == "Z")
        g_Z.AlarmReset();
    });
  }
  cb->Success(MakeOk());
}

void PortalRouterHandler::HandleFastechAlarmReset(Browser b, Payload p,
                                                  Callback cb) {
  std::string axisStr = p->GetString("axis").ToString();

  if (MachineProfile::Instance().GetMotion() == "Fastech") {
    WORK_1([axisStr]() {
      if (axisStr == "X")
        g_X.AlarmReset();
      else if (axisStr == "Y")
        g_Y.AlarmReset();
      else if (axisStr == "Z")
        g_Z.AlarmReset();
    });
  }
  cb->Success(MakeOk());
}

void PortalRouterHandler::HandleMotionSetSpeed(Browser b, Payload p,
                                               Callback cb) {
  // {"channel":"motion.setSpeed","payload":{"axis":"X","speed":"mid"}}
  TRACE(_T("motion.setSpeed called\n"));

  if (!p.get()) {
    HttpResponseUtil::ReplyJsonError(cb, "payload is null");
    return;
  }

  std::string axisStr = p->GetString("axis").ToString();
  std::string speedMode = p->GetString("speed").ToString();

  CString Axis = (LPCTSTR)p->GetString(_T("axis")).c_str();

  // Find params
  auto *pParams = EqMotionRunPara::Instance().GetAxis(axisStr);
  if (pParams) {
    double vel = 0;
    double accel = 0;

    if (speedMode == "slow") {
      vel = pParams->slow.velocity;
      accel = pParams->slow.accel_time;
    } else if (speedMode == "fast") {
      vel = pParams->fast.velocity;
      accel = pParams->fast.accel_time;
    } else {
      // Default to mid
      vel = pParams->mid.velocity;
      accel = pParams->mid.accel_time;
    }

    if (MachineProfile::Instance().GetUnitMultiplier() == 1.0) {
      vel /= 1000.0;
      accel /= 1000.0;
    }

    // Execute on Worker Thread to match other motion commands and ensure thread
    // safety if needed
    WORK_1([Axis, vel, accel]() {
      if (g_AxisMap.find(Axis) != g_AxisMap.end()) {
        g_AxisMap[Axis]->SetSpeed(vel, accel);
      }
    });
  }

  cb->Success(MakeOk());
}

// GCode Upload
void PortalRouterHandler::HandleGCodeWrite(Browser b, Payload p, Callback cb) {
  TRACE(_T("cmd.gcode.write called\n"));

  if (!p.get()) {
    HttpResponseUtil::ReplyJsonError(cb, "payload is null");
    return;
  }

  const std::string jobId = p->GetString("jobId").ToString();
  const std::string name = p->GetString("name").ToString();
  auto lineList = p->GetList("lines");

  if (!lineList.get()) {
    HttpResponseUtil::ReplyJsonError(cb, "lines is null");
    return;
  }

  std::vector<std::string> lines;
  const size_t count = lineList->GetSize();
  lines.reserve(count);
  for (size_t i = 0; i < count; ++i) {
    lines.emplace_back(lineList->GetString(i).ToString());
  }

  // Use WORK_1 to prevent blocking the UI thread during G-Code parsing/writing
  WORK_1([this, jobId, name, lines = std::move(lines), cb]() {
    try {
      bFlagMtGetPosition = false;
      // Removed UI thread Sleep(500) - if needed, Sleep here is OK as it's a
      // background thread
      Sleep(200);

      GCodeJob job{jobId, name,
                   std::move(const_cast<std::vector<std::string> &>(lines))};

      auto progressCallback = [](int percent) {
        if (auto *h = SimpleHandler::GetInstance()) {
          std::string js = "if(window.__onGCodeUploadProgress) "
                           "window.__onGCodeUploadProgress(" +
                           std::to_string(percent) + ");";
          h->BroadcastJS(js);
        }
      };

      const bool ok = GCodeService::Instance().WriteJob(job, progressCallback);

      Sleep(200);
      bFlagMtGetPosition = true;

      if (!ok) {
        cb->Failure(500, "WriteJob failed");
      } else {
        cb->Success(MakeOk());
      }
    } catch (...) {
      bFlagMtGetPosition = true;
      cb->Failure(500, "Exception in GCodeWrite worker");
    }
  });
}

void PortalRouterHandler::HandleGcodeRun(Browser b, Payload p, Callback cb) {
  TRACE(_T("cmd.gcode.run called\n"));

  if (!p.get()) {
    HttpResponseUtil::ReplyJsonError(cb, "payload is null");
    return;
  }

  const std::string jobId = p->GetString("jobId").ToString();

  // Check for 'mode' key (int)
  int mode = 0;
  if (p->HasKey("mode")) {
    mode = p->GetInt("mode");
  }

  int ttlTime = 0;
  if (p->HasKey("ttlTime")) {
    // [FIX] Convert ms (UI) to us (Native).
    // Use GetSafeDouble to handle both Int and Double from CEF/JS.
    ttlTime = (int)(GetSafeDouble(p, "ttlTime") * 1000.0);
  }

  const bool ok = GCodeService::Instance().RunJob(jobId, mode, ttlTime);

  if (!ok) {
    HttpResponseUtil::ReplyJsonError(cb, "RunJob failed");
  } else {
    HttpResponseUtil::ReplyJsonOk(cb);
  }
}

// [NEW] - GalvoController Integration
#include "Modules/Scanner/SinoGalvo/Base/SinoGalvoController.h"

void PortalRouterHandler::HandleGcodeStatus(Browser b, Payload p, Callback cb) {
  // TRACE(_T("cmd.gcode.status called\n")); // Too noisy for polling

  std::string jobId = "";
  if (p.get() && p->HasKey("jobId")) {
    jobId = p->GetString("jobId").ToString();
  }

  GCodeState state;
  int currentLine = 0;
  int totalLines = 0;
  bool ok =
      GCodeService::Instance().GetStatus(jobId, state, currentLine, totalLines);

  if (!ok) {
    // If failed (e.g. wrong jobId), treating it as error or idle depending on
    // context? Let's just return error for now so frontend knows.
    /*
       However, if frontend just started and has no jobId, it might query
       status. If GCodeService has no active job, it might return false or Idle.
       Let's assume the service handles empty string gracefully if we modify it,
       or we rely on frontend sending correct ID.
       For now, straight mapping.
    */
    HttpResponseUtil::ReplyJsonError(cb, "GetStatus failed");
    return;
  }

  std::string stateStr = "idle";
  switch (state) {
  case GCodeState::Idle:
    stateStr = "idle";
    break;
  case GCodeState::Running:
    stateStr = "running";
    break;
  case GCodeState::Paused:
    stateStr = "paused";
    break;
  case GCodeState::Completed:
    stateStr = "completed";
    break;
  case GCodeState::Error:
    stateStr = "error";
    break;
  }

  auto dict = CefDictionaryValue::Create();
  dict->SetBool("ok", true);
  dict->SetString("status", stateStr);
  dict->SetInt("currentLine", currentLine);
  dict->SetInt("totalLines", totalLines);

  cb->Success(DictToJson(dict));
}

/**
 * @brief Handle cmd.scanner.generate
 * Parsing: [{type:"JUMP", x:10, y:20}, ...]
 */
void PortalRouterHandler::HandleScannerGenerate(Browser b, Payload p,
                                                Callback cb) {
  TRACE(_T("cmd.scanner.generate called\n"));

  // [P1-3 2026-07-22] [Design Pattern: Balking] 가공 중 커맨드 교체 거부. Run 워커가 순회
  // 중인 m_commands를 교체하면 옛/새 커맨드가 뒤섞여 마킹된다(6차 이슈 S3). 프론트는 이
  // 에러로 handleGenerate가 실패 처리되어 Start 시퀀스가 중단된다.
  if (g_Scanner && g_Scanner->IsRunning()) {
    HttpResponseUtil::ReplyJsonError(cb, "Scanner is busy (marking in progress)");
    return;
  }

  if (!p.get() || !p->HasKey("commands")) {
    HttpResponseUtil::ReplyJsonError(cb, "Invalid payload");
    return;
  }

  auto list = p->GetList("commands");
  if (!list) {
    HttpResponseUtil::ReplyJsonError(cb, "commands list missing");
    return;
  }

  std::vector<ScannerCommand> cmds;
  size_t cnt = list->GetSize();
  cmds.reserve(cnt);

  for (size_t i = 0; i < cnt; ++i) {
    auto item = list->GetDictionary(i);
    if (!item)
      continue;

    ScannerCommand c;
    std::string typeStr = item->GetString("type");

    if (typeStr == "JUMP")
      c.type = ScannerCommandType::JUMP;
    else if (typeStr == "LINE") {
      c.type = ScannerCommandType::LINE;
      // Line now uses explicit start (startX, startY) and end (x, y)
      if (item->HasKey("startX") && item->HasKey("startY")) {
        c.startX = item->GetDouble("startX");
        c.startY = item->GetDouble("startY");
        c.hasStart = true;
      }
    } else if (typeStr == "CIRCLE")
      c.type = ScannerCommandType::CIRCLE;
    else if (typeStr == "RECT")
      c.type = ScannerCommandType::RECT;
    else if (typeStr == "ARC")
      c.type = ScannerCommandType::ARC;
    else if (typeStr == "ELLIPSE")
      c.type = ScannerCommandType::ELLIPSE;
    else if (typeStr == "EARC")
      c.type = ScannerCommandType::EARC;
    else if (typeStr == "POINT")
      c.type = ScannerCommandType::POINT;
    else if (typeStr == "Z_MOVE") {
      c.type = ScannerCommandType::Z_MOVE;
      // [이슈 3-③ 2026-07-21] Z_MOVE에 파킹 좌표가 명시된 경우에만 hasStart를 세운다.
      // 드라이버(Run)는 hasStart가 아닌 Z_MOVE에서 MovetTo를 생략해 (0,0) 센터 점프를 막는다.
      if (item->HasKey("startX") && item->HasKey("startY")) {
        c.startX = item->GetDouble("startX");
        c.startY = item->GetDouble("startY");
        c.hasStart = true;
      }
    } else if (typeStr == "DELAY") {
      c.type = ScannerCommandType::DELAY;
    } else if (typeStr == "SET_PARAM") {
      /* [색상별 Mark Speed 2026-07-22] 색상 그룹 경계의 속도/파워 전환 명령 */
      c.type = ScannerCommandType::SET_PARAM;
    } else if (typeStr == "REPEAT_BEGIN") {
      /* [7차 Mark Times 2026-07-23] 반복 블록 시작. repeatCount회 실행(드라이버 해석) */
      c.type = ScannerCommandType::REPEAT_BEGIN;
      c.repeatCount = item->HasKey("repeatCount") ? item->GetInt("repeatCount") : 1;
      // [Issue9 P3 2026-07-23] Layer color of this group ("#RRGGBB") for the measured
      // MARK TIMES pass broadcast. Driver validates the hex format before JS embedding.
      if (item->HasKey("color")) {
        c.color = item->GetString("color").ToString();
      }
    } else if (typeStr == "REPEAT_END") {
      c.type = ScannerCommandType::REPEAT_END;
    } else
      continue;

    // Common Fields
    c.x = PortalRouterHandler::GetSafeDouble(item, "x");
    c.y = PortalRouterHandler::GetSafeDouble(item, "y");

    // [NEW] Parsing Z and DelayTime
    c.z = PortalRouterHandler::GetSafeDouble(item, "z");
    c.delayTime = PortalRouterHandler::GetSafeDouble(item, "delayTime");

    // Optional Fields (depending on type, but safe to get if zero default)
    c.r = PortalRouterHandler::GetSafeDouble(item, "r");
    c.w = PortalRouterHandler::GetSafeDouble(item, "width");
    c.h = PortalRouterHandler::GetSafeDouble(item, "height");
    c.rx = PortalRouterHandler::GetSafeDouble(item, "rx");
    c.ry = PortalRouterHandler::GetSafeDouble(item, "ry");
    c.angle = PortalRouterHandler::GetSafeDouble(item, "angle");
    c.startAngle = PortalRouterHandler::GetSafeDouble(item, "startAngle");
    c.endAngle = PortalRouterHandler::GetSafeDouble(item, "endAngle");
    c.pointTime = PortalRouterHandler::GetSafeDouble(item, "pointTime");

    /* [색상별 Mark Speed 2026-07-22] SET_PARAM 필드. 키가 없으면 GetSafeDouble이 0을
       반환하므로 power는 "미지정(<0)" 기본값을 보존하기 위해 키 존재를 확인한다. */
    c.markSpeed = PortalRouterHandler::GetSafeDouble(item, "markSpeed");
    if (item->HasKey("power"))
      c.power = PortalRouterHandler::GetSafeDouble(item, "power");

    cmds.push_back(c);
  }

  if (g_Scanner) {
    g_Scanner->LoadCommands(cmds);
  }

  HttpResponseUtil::ReplyJsonOk(cb);
}

void PortalRouterHandler::HandleScannerRun(Browser b, Payload p, Callback cb) {
  TRACE(_T("cmd.scanner.run called\n"));

  // [P1-3 2026-07-22] [Design Pattern: Balking] 이미 가공 중이면 새 Run을 기동하지 않는다.
  // (Run() 자체에도 재진입 가드가 있지만, 여기서 선거부하면 프론트가 ok=false로 즉시 안다.)
  if (g_Scanner && g_Scanner->IsRunning()) {
    HttpResponseUtil::ReplyJsonError(cb, "Scanner is busy (marking in progress)");
    return;
  }

  // [NEW] Read Parameters
  int mode = 1;
  double markSpeed = -1.0;

  if (p.get()) {
    if (p->HasKey("mode"))
      mode = p->GetInt("mode");

    // [FIX] Use GetSafeDouble to handle Int/Double mismatch
    markSpeed = GetSafeDouble(p, _T("scannerMarkSpeed"));
  }

  // Update Controller if speed is valid
  if (markSpeed > 0 && g_Scanner) {
    g_Scanner->SetMarkSpeed(static_cast<float>(markSpeed));
  }

  // [NEW] Extract profile for calibration (default to scanner)
  std::string profile = "scanner";
  if (p.get() && p->HasKey("profile")) {
    profile = p->GetString("profile").ToString();
  }

  // Execute on Worker or UI thread?
  // Usually hardware calls should not block UI thread long, but StartMarking
  // might return immediately? We launch it on Worker just to be safe if it
  // blocks.
  WORK_1([profile]() {
    CString selAddr =
        INI_PMAC.GetString(_T("COMMON_CMD"), _T("LASER_CTRL_SELECTOR"));
    if (!selAddr.IsEmpty())
      g_PMAC.Write(selAddr, _T("1"));

    if (g_Scanner) {
      // [Issue10 P1 2026-07-23] Z 이동+정착 대기 공용 람다 — Run 중의 zMoveCallback과
      // Run 종료 후 시작 Z 복귀가 동일 로직을 공유한다(DRY). captureless라 std::function 변환 무비용.
      auto moveZAndSettle = [](double zAbsPos) {
        // zAbsPos is the target position in mm from Frontend
        double targetForMove =
            zAbsPos * MachineProfile::Instance().GetUnitMultiplier();

        if (g_AxisMap.count(_T("Z"))) {
          // [FIX] Ensure fast speed is set for Z_MOVE during Matrix
          auto *p = EqMotionRunPara::Instance().GetAxis("Z");
          if (p) {
            g_AxisMap[_T("Z")]->SetSpeed(p->fast.velocity, p->fast.accel_time);
          }
          g_AxisMap[_T("Z")]->MovAbs(targetForMove);
        }

        // Z축 허용 오차 확인 (0.005 mm 로 완화하고 1.5초 하드 타임아웃 적용하여 Settling Time 단축 및 딜레이 방지)
        // E-Stop/알람으로 모션이 비활성이어도 이 타임아웃으로 자연 탈출한다(무한 대기 없음).
        auto startWait = std::chrono::steady_clock::now();
        while (true) {
          // g_Z.GetPos() returns the raw value from the motor.
          // PMAC reads are in um (need / 1000 to get mm). Fastech reads are in
          // mm.
          double currentZ_raw = g_Z.GetPos();
          double currentZ_mm =
              currentZ_raw / MachineProfile::Instance().GetUnitMultiplier();

          // Compare in mm
          if (std::abs(currentZ_mm - zAbsPos) <= 0.005) {
            break;
          }
          if (std::chrono::steady_clock::now() - startWait > std::chrono::milliseconds(1500)) {
            TRACE(_T("Z axis wait timeout in ScannerRun!\n"));
            break;
          }
          Sleep(10);
        }
      };

      // [Issue10 P1 2026-07-23] Run 시작 직전의 "실측" Z 캡처(폴링 스토어 값이 아님 —
      // ScannerIssue10_ZReturn.md §2.2). 이 값이 이번 가공의 시작 Z 기준이 된다.
      const double startZ_mm =
          g_Z.GetPos() / MachineProfile::Instance().GetUnitMultiplier();

      g_Scanner->Run(profile, moveZAndSettle);

      // [Issue10 P1 2026-07-23] "Run 종료 시 Z = Run 시작 시 Z" 불변식 강제.
      // 정상 완료/Stop/예외 모두 Run() 반환으로 수렴하는 단일 지점이므로, 스트림 꼬리
      // Z_MOVE가 실행되지 못하는 경로(Stop 등)에서도 시작 Z가 유실되지 않는다(래칫 드리프트 차단).
      const double endZ_mm =
          g_Z.GetPos() / MachineProfile::Instance().GetUnitMultiplier();
      if (std::abs(endZ_mm - startZ_mm) > 0.005) {
        LogManager::Instance().Write(
            "info", "Scanner",
            "Z restored to start: " + std::to_string(endZ_mm) + "mm -> " +
                std::to_string(startZ_mm) + "mm (Issue10 run-boundary invariant)");
        moveZAndSettle(startZ_mm);
      }
    }
  });

  HttpResponseUtil::ReplyJsonOk(cb);
}

// [FIX] Use pure Win32 API to avoid MFC state issues (afxwin1.inl assertions)
#include <commdlg.h>
#include <fstream>

// Helper to get default image directory: ExeDir + "\\image"
static CString GetDefaultImageDir() {
  TCHAR szPath[MAX_PATH] = {0};
  ::GetModuleFileName(NULL, szPath, MAX_PATH);
  ::PathRemoveFileSpec(szPath);
  CString dir;
  dir.Format(_T("%s\\image"), szPath);
  if (!::PathFileExists(dir)) {
    ::CreateDirectory(dir, NULL);
  }
  return dir;
}

// Simple Base64 Helper (using APR or standard logic if available, otherwise
// minimal impl) For brevity, assuming CppBase64 or similar is not standard.
// Using simplified logic or finding existing utility is better.
// [Note] In MFC/Windows, CryptBinaryToString is available in
// wincrypt.h/crypt32.lib
#include <wincrypt.h>
#pragma comment(lib, "crypt32.lib")

static std::string Base64Encode(const std::vector<BYTE> &data) {
  DWORD len = 0;
  if (!CryptBinaryToStringA(data.data(), (DWORD)data.size(),
                            CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, NULL,
                            &len))
    return "";
  std::string out(len, '\0');
  if (!CryptBinaryToStringA(data.data(), (DWORD)data.size(),
                            CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, &out[0],
                            &len))
    return "";
  return out;
}

static std::vector<BYTE> Base64Decode(const std::string &in) {
  DWORD len = 0;
  // Strip header if present "data:image/png;base64,"
  std::string param = in;
  size_t comma = param.find(",");
  if (comma != std::string::npos)
    param = param.substr(comma + 1);

  if (!CryptStringToBinaryA(param.c_str(), 0, CRYPT_STRING_BASE64_ANY, NULL,
                            &len, NULL, NULL))
    return {};
  std::vector<BYTE> out(len);
  if (!CryptStringToBinaryA(param.c_str(), 0, CRYPT_STRING_BASE64_ANY,
                            out.data(), &len, NULL, NULL))
    return {};
  return out;
}

void PortalRouterHandler::HandleDialogLoadImage(Browser b, Payload p,
                                                Callback cb) {
  TRACE(_T("cmd.dialog.openImage called (Win32)\n"));

  CEF_REQUIRE_UI_THREAD();

  CString defaultDir = GetDefaultImageDir();

  OPENFILENAME ofn;
  TCHAR szFile[MAX_PATH] = {0};
  ZeroMemory(&ofn, sizeof(ofn));
  ofn.lStructSize = sizeof(ofn);
  ofn.hwndOwner = GetTopLevelWindow(b);
  ofn.lpstrFile = szFile;
  ofn.nMaxFile = sizeof(szFile);
  // null-terminated filter string: "Display\0Pattern\0Display\0Pattern\0\0"
  ofn.lpstrFilter = _T("Image Files ")
                    _T("(*.png;*.jpg;*.bmp;*.tiff)\0*.png;*.jpg;*.bmp;*.tiff;*")
                    _T(".tif\0All Files (*.*)\0*.*\0");
  ofn.nFilterIndex = 1;
  ofn.lpstrFileTitle = NULL;
  ofn.nMaxFileTitle = 0;
  ofn.lpstrInitialDir = defaultDir;
  ofn.Flags = OFN_PATHMUSTEXIST | OFN_FILEMUSTEXIST | OFN_NOCHANGEDIR;

  if (GetOpenFileName(&ofn) == TRUE) {
    CString filePath(ofn.lpstrFile);

    // Use std::ifstream instead of CFile to avoid MFC dependency here
    std::ifstream file(filePath, std::ios::binary | std::ios::ate);
    if (file.is_open()) {
      std::streamsize size = file.tellg();
      file.seekg(0, std::ios::beg);

      std::vector<BYTE> buf((size_t)size);
      if (file.read((char *)buf.data(), size)) {
        std::string base64 = Base64Encode(buf);

        // Determine mime type roughly
        std::string mime = "image/png";
        CString ext = ::PathFindExtension(filePath);
        ext.MakeLower();
        if (ext == _T(".jpg") || ext == _T(".jpeg"))
          mime = "image/jpeg";
        else if (ext == _T(".bmp"))
          mime = "image/bmp";
        else if (ext == _T(".tiff") || ext == _T(".tif"))
          mime = "image/tiff";

        std::string dataUrl = "data:" + mime + ";base64," + base64;

        auto dict = CefDictionaryValue::Create();
        dict->SetBool("ok", true);
        dict->SetString("data", dataUrl);
        dict->SetString("path", std::string(CT2CA(filePath)));
        cb->Success(PortalRouterHandler::DictToJson(dict));
      } else {
        cb->Success(MakeErr("Failed to read file"));
      }
    } else {
      cb->Success(MakeErr("Failed to open file"));
    }
  } else {
    cb->Success(MakeErr("Canceled"));
  }
}

void PortalRouterHandler::HandleDialogSaveImage(Browser b, Payload p,
                                                Callback cb) {
  TRACE(_T("cmd.dialog.saveImage called (Win32)\n"));

  CEF_REQUIRE_UI_THREAD();

  // 1. Check if frontend provided data (Base64)
  std::string inputData = "";
  if (p.get() && p->HasKey("data")) {
    inputData = p->GetString("data").ToString();
  }

  std::string fileName = "snapshot.png";
  if (p.get() && p->HasKey("fileName")) {
    fileName = p->GetString("fileName").ToString();
  }

  CString defaultDir = GetDefaultImageDir();

  OPENFILENAME ofn;
  TCHAR szFile[MAX_PATH] = {0};

  // Copy suggested filename to buffer
  CString suggMsg(CA2T(fileName.c_str()));
  _tcsncpy_s(szFile, MAX_PATH, suggMsg, _TRUNCATE);

  ZeroMemory(&ofn, sizeof(ofn));
  ofn.lStructSize = sizeof(ofn);
  ofn.hwndOwner = GetTopLevelWindow(b);
  ofn.lpstrFile = szFile;
  ofn.nMaxFile = sizeof(szFile);
  // [P2] WebP 항목 추가 (Portal exportToRaster: Chromium 네이티브 WebP 인코딩)
  ofn.lpstrFilter =
      _T("PNG Image (*.png)\0*.png\0JPEG Image (*.jpg)\0*.jpg\0Bitmap ")
      _T("(*.bmp)\0*.bmp\0WebP Image (*.webp)\0*.webp\0All Files (*.*)\0*.*\0");
  // [P2] 제안된 파일명 확장자에 맞춰 기본 필터 선택
  ofn.nFilterIndex = 1;
  {
    CString sugExt = ::PathFindExtension(suggMsg);
    if (sugExt.CompareNoCase(_T(".jpg")) == 0 ||
        sugExt.CompareNoCase(_T(".jpeg")) == 0) {
      ofn.nFilterIndex = 2;
    } else if (sugExt.CompareNoCase(_T(".bmp")) == 0) {
      ofn.nFilterIndex = 3;
    } else if (sugExt.CompareNoCase(_T(".webp")) == 0) {
      ofn.nFilterIndex = 4;
    }
  }
  ofn.lpstrFileTitle = NULL;
  ofn.nMaxFileTitle = 0;
  ofn.lpstrInitialDir = defaultDir;
  ofn.Flags = OFN_PATHMUSTEXIST | OFN_OVERWRITEPROMPT | OFN_NOCHANGEDIR;
  ofn.lpstrDefExt = _T("png");

  if (GetSaveFileName(&ofn) == TRUE) {
    CString filePath(ofn.lpstrFile);

    // Case A: Save provided data (Base64)
    if (!inputData.empty()) {
      std::vector<BYTE> buf = Base64Decode(inputData);
      if (buf.empty()) {
        cb->Success(MakeErr("Failed to decode Base64 data"));
        return;
      }

      std::ofstream file(filePath, std::ios::binary);
      if (file.is_open()) {
        file.write((const char *)buf.data(), buf.size());
        file.close();
        cb->Success(MakeOk());
      } else {
        cb->Success(MakeErr("Failed to write file"));
      }
    }
    // Case B: Capture from Camera (Backend)
    else {
      cv::Mat mat;
      double fps = 0.0;
      // Assuming ID 0 for main camera
      if (!VisionBridge::Instance().PopLatest(0, mat, fps) || mat.empty()) {
        cb->Success(MakeErr("Camera not ready or no frame captured"));
        return;
      }

      // Determine extension for encoding
      std::string ext = ".png";
      CString fileExt = ::PathFindExtension(filePath);
      if (!fileExt.IsEmpty()) {
        fileExt.MakeLower();
        ext = std::string(CT2CA(fileExt));
      }

      // Encode and Write
      std::vector<uchar> buf;
      bool encoded = false;
      try {
        encoded = cv::imencode(ext, mat, buf);
      } catch (...) {
        encoded = false;
      }

      if (encoded) {
        std::ofstream file(filePath, std::ios::binary);
        if (file.is_open()) {
          file.write((const char *)buf.data(), buf.size());
          file.close();
          cb->Success(MakeOk());
        } else {
          cb->Success(MakeErr("Failed to write file"));
        }
      } else {
        cb->Success(MakeErr("Failed to encode image"));
      }
    }
  } else {
    cb->Success(MakeErr("Canceled"));
  }
}

void PortalRouterHandler::HandleDialogSaveRecipeFile(Browser b, Payload p,
                                                     Callback cb) {
  TRACE(_T("cmd.dialog.saveRecipeFile called\n"));

  CEF_REQUIRE_UI_THREAD();

  if (!p.get() || !p->HasKey("data")) {
    cb->Success(MakeErr("No data to save"));
    return;
  }

  std::string data = p->GetString("data");
  std::string fileName = "file.txt";
  if (p->HasKey("fileName")) {
    fileName = p->GetString("fileName").ToString();
  }

  // Default Directory: Executable Directory
  TCHAR szExePath[MAX_PATH] = {0};
  ::GetModuleFileName(NULL, szExePath, MAX_PATH);
  ::PathRemoveFileSpec(szExePath); // Remove exe name

  OPENFILENAME ofn;
  TCHAR szFile[MAX_PATH] = {0};

  // Copy suggested filename
  CString suggMsg(CA2T(fileName.c_str()));
  _tcsncpy_s(szFile, MAX_PATH, suggMsg, _TRUNCATE);

  ZeroMemory(&ofn, sizeof(ofn));
  ofn.lStructSize = sizeof(ofn);
  ofn.hwndOwner = GetTopLevelWindow(b);
  ofn.lpstrFile = szFile;
  ofn.nMaxFile = sizeof(szFile);

  // Filter
  // Use '|' as placeholder for '\0' to avoid CString truncation
  CString filter = _T("All Files (*.*)|*.*||");

  // Quick heuristic for SVG/JSON/DXF
  CString ext = ::PathFindExtension(suggMsg);
  if (ext.CompareNoCase(_T(".svg")) == 0) {
    filter = _T("SVG File (*.svg)|*.svg|All Files (*.*)|*.*||");
  } else if (ext.CompareNoCase(_T(".json")) == 0) {
    filter = _T("JSON File (*.json)|*.json|All Files (*.*)|*.*||");
  } else if (ext.CompareNoCase(_T(".lng")) == 0) {
    filter = _T("Laser Project File (*.lng)|*.lng|All Files (*.*)|*.*||");
  } else if (ext.CompareNoCase(_T(".dxf")) == 0) {
    // [P4-c] DXF Export (Portal dxfExport.ts)
    filter = _T("DXF Drawing (*.dxf)|*.dxf|All Files (*.*)|*.*||");
  }

  // Replace '|' with '\0'
  int len = filter.GetLength();
  LPTSTR pFilter = filter.GetBuffer(len);
  for (int i = 0; i < len; i++) {
    if (pFilter[i] == _T('|'))
      pFilter[i] = _T('\0');
  }
  filter.ReleaseBuffer();

  ofn.lpstrFilter = filter;
  ofn.nFilterIndex = 1;
  ofn.lpstrInitialDir = szExePath; // Set Default Dir to Exe Dir
  ofn.Flags = OFN_PATHMUSTEXIST | OFN_OVERWRITEPROMPT | OFN_NOCHANGEDIR;

  if (GetSaveFileName(&ofn) == TRUE) {
    CString filePath(ofn.lpstrFile);

    // Write data to file
    std::ofstream file(filePath, std::ios::binary);
    if (file.is_open()) {
      file.write(data.c_str(), data.size());
      file.close();
      cb->Success(MakeOk());
    } else {
      cb->Success(MakeErr("Failed to write to file"));
    }
  } else {
    cb->Success(MakeErr("Canceled"));
  }
}

// ---------------- Camera Configuration (JSON) ----------------

// Helper to get Config directory: ExeDir + "\\Config"
static CString GetConfigDir() {
  TCHAR szPath[MAX_PATH] = {0};
  ::GetModuleFileName(NULL, szPath, MAX_PATH);
  ::PathRemoveFileSpec(szPath);
  CString dir;
  dir.Format(_T("%s\\Config"), szPath);
  if (!::PathFileExists(dir)) {
    ::CreateDirectory(dir, NULL);
  }
  return dir;
}

void PortalRouterHandler::HandleConfigGetCamera(Browser b, Payload p,
                                                Callback cb) {
  TRACE(_T("cmd.config.getCamera called\n"));

  // Read Bin/Config/CameraPara.json
  CString configDir = GetConfigDir();
  CString filePath;
  filePath.Format(_T("%s\\CameraPara.json"), configDir);

  std::ifstream file((LPCTSTR)filePath);
  if (!file.is_open()) {
    cb->Success(MakeErr("Failed to open CameraPara.json"));
    return;
  }

  std::stringstream buffer;
  buffer << file.rdbuf();
  std::string jsonContent = buffer.str();

  // Directly return the raw JSON content as payload
  // We wrap it in { ok: true, data: JSON_OBJECT }
  // But CEF's DictToJson expects CefDictionaryValue.
  // Let's parse the file content as CefValue to ensure it's valid JSON and
  // structure it correctly.

  CefRefPtr<CefValue> parsed = CefParseJSON(jsonContent, JSON_PARSER_RFC);
  if (!parsed || !parsed->IsValid() || parsed->GetType() != VTYPE_DICTIONARY) {
    cb->Success(MakeErr("Invalid JSON in CameraPara.json"));
    return;
  }

  auto dict = CefDictionaryValue::Create();
  dict->SetBool("ok", true);
  dict->SetDictionary("data", parsed->GetDictionary());

  cb->Success(PortalRouterHandler::DictToJson(dict));
}

void PortalRouterHandler::HandleConfigGetMachineStatus(Browser b, Payload p,
                                                       Callback cb) {
  TRACE(_T("cmd.config.getMachineStatus called\n"));

  auto dict = CefDictionaryValue::Create();
  dict->SetBool("ok", true);

  // 1. Hardware Info
  auto hardwareDict = CefDictionaryValue::Create();
  hardwareDict->SetString("scanner", MachineProfile::Instance().GetScanner());
  hardwareDict->SetString("motion", MachineProfile::Instance().GetMotion());
  hardwareDict->SetString("light", MachineProfile::Instance().GetLight());
  hardwareDict->SetString("laser", MachineProfile::Instance().GetLaser());
  dict->SetDictionary("hardware", hardwareDict);

  // 2. Features Capability Map
  auto featuresDict = CefDictionaryValue::Create();
  featuresDict->SetInt("lightChannels", MachineProfile::Instance().GetLightChannels());
  featuresDict->SetBool("hasLensMotor", MachineProfile::Instance().HasLensMotor());
  featuresDict->SetBool("hasZeroG", MachineProfile::Instance().HasZeroG());
  featuresDict->SetBool("useLight", MachineProfile::Instance().UseLight());
  featuresDict->SetBool("useLaser", MachineProfile::Instance().UseLaser());

  auto allowedModesList = CefListValue::Create();
  int modeIdx = 0;
  for (const auto& mode : MachineProfile::Instance().GetAllowedModes()) {
    allowedModesList->SetString(modeIdx++, mode);
  }
  featuresDict->SetList("allowedModes", allowedModesList);

  auto allowedLensesList = CefListValue::Create();
  int lensIdx = 0;
  for (const auto& lens : MachineProfile::Instance().GetAllowedLenses()) {
    allowedLensesList->SetString(lensIdx++, lens);
  }
  featuresDict->SetList("allowedLenses", allowedLensesList);
  dict->SetDictionary("features", featuresDict);

  // 3. Properties

  dict->SetInt("jogXDir", MachineProfile::Instance().GetJogXDir());
  dict->SetInt("jogYDir", MachineProfile::Instance().GetJogYDir());
  dict->SetInt("useCanvas", MachineProfile::Instance().GetUseCanvas());
  dict->SetInt("useProcessDetail", MachineProfile::Instance().GetUseProcessDetail());
  dict->SetInt("maxHistorySteps", MachineProfile::Instance().GetMaxHistorySteps());

  dict->SetInt("stageMinX", MachineProfile::Instance().GetStageMinX());
  dict->SetInt("stageMaxX", MachineProfile::Instance().GetStageMaxX());
  dict->SetInt("stageMinY", MachineProfile::Instance().GetStageMinY());
  dict->SetInt("stageMaxY", MachineProfile::Instance().GetStageMaxY());

  cb->Success(PortalRouterHandler::DictToJson(dict));
}

void PortalRouterHandler::HandleConfigSetCamera(Browser b, Payload p,
                                                Callback cb) {
  TRACE(_T("cmd.config.setCamera called\n"));

  if (!p.get() || !p->HasKey("data")) {
    cb->Success(MakeErr("No data provided"));
    return;
  }

  // "data" should be the updated JSON object for CameraPara.json
  auto dataDict = p->GetDictionary("data");

  // Convert back to string
  CefRefPtr<CefValue> v = CefValue::Create();
  v->SetDictionary(dataDict);
  std::string jsonString = CefWriteJSON(v, JSON_WRITER_PRETTY_PRINT).ToString();

  // Write to file
  CString configDir = GetConfigDir();
  CString filePath;
  filePath.Format(_T("%s\\CameraPara.json"), configDir);

  std::ofstream file((LPCTSTR)filePath);
  if (!file.is_open()) {
    cb->Success(MakeErr("Failed to write CameraPara.json"));
    return;
  }

  file << jsonString;
  file.close();

  cb->Success(MakeOk());
}

// Moons Preset
void PortalRouterHandler::HandleMoonsGetPresets(Browser b, Payload p,
                                                Callback cb) {
  // {"channel":"cmd.moons.preset","payload":{"scanner_base": "object_20",
  // "object_50"}}
  TRACE(_T("cmd_moons_preset called\n"));

  std::string payloadStr = p->GetString("payload").ToString();
  bool syncOnly = false;
  if (p.get() && p->HasKey("syncOnly")) {
    syncOnly = p->GetBool("syncOnly");
  }
  bool forceAbsolute = false;
  if (p.get() && p->HasKey("forceAbsolute")) {
    forceAbsolute = p->GetBool("forceAbsolute");
  }

  WORK_1([payloadStr, syncOnly, forceAbsolute]() {
    CString Payload = (LPCTSTR)CA2W(payloadStr.c_str());

    static bool s_is_first_preset_move = true;
    static double s_last_offset_x = INI_MOONS.GetDouble(_T("MIRROR"), _T("StageX_Offset"));
    static double s_last_offset_y = INI_MOONS.GetDouble(_T("MIRROR"), _T("StageY_Offset"));

    if (syncOnly) {
      double tgtOffsetW = 0.0;
      double tgtOffsetH = 0.0;
      if (Payload == _T("scanner_base")) {
        tgtOffsetW = INI_MOONS.GetDouble(_T("MIRROR"), _T("StageX_Offset"));
        tgtOffsetH = INI_MOONS.GetDouble(_T("MIRROR"), _T("StageY_Offset"));
      } else if (Payload == _T("object_x20")) {
        tgtOffsetW = INI_MOONS.GetDouble(_T("LENS"), _T("StageX20_Offset"));
        tgtOffsetH = INI_MOONS.GetDouble(_T("LENS"), _T("StageY20_Offset"));
      } else if (Payload == _T("object_x50")) {
        tgtOffsetW = INI_MOONS.GetDouble(_T("LENS"), _T("StageX50_Offset"));
        tgtOffsetH = INI_MOONS.GetDouble(_T("LENS"), _T("StageY50_Offset"));
      }
      TRACE(_T("[moonsPreset] Sync-only requested. Updating cached offsets to (%f, %f)\n"), tgtOffsetW, tgtOffsetH);
      s_last_offset_x = tgtOffsetW;
      s_last_offset_y = tgtOffsetH;
      return;
    }

    if (Payload == _T("scanner_base")) {
      double X = INI_MOONS.GetDouble(_T("MIRROR"), _T("SCANNER_POS"));
      double TargetZ = INI_MOONS.GetDouble(_T("MIRROR"), _T("SCANNER_Z_POS"));
      double SafeZ = INI_MOONS.GetDouble(_T("MIRROR"), _T("SCANNER_SAFE_Z"));
      double OffsetX = INI_MOONS.GetDouble(_T("MIRROR"), _T("StageX_Offset"));
      double OffsetY = INI_MOONS.GetDouble(_T("MIRROR"), _T("StageY_Offset"));

      double pmacMult = (MachineProfile::Instance().GetMotion() == "PMAC") ? 1000.0 : 1.0;
      double curZ = g_Z.GetPos() / pmacMult;
      double curMirror = g_Mirror.GetPos();

      // Check if we are already at the target preset state and stage offset is matching
      if (std::abs(curZ - TargetZ) < 0.1 && std::abs(curMirror - X) < 0.1 &&
          std::abs(OffsetX - s_last_offset_x) < 0.01 && std::abs(OffsetY - s_last_offset_y) < 0.01) {
        TRACE(_T("Already at scanner_base position with matched offset. Skipping preset movement.\n"));
        s_last_offset_x = OffsetX;
        s_last_offset_y = OffsetY;
        return;
      }

      if (MachineProfile::Instance().HasLensMotor()) {
        MoonsUtil::TryMirrorInitialze(g_Lens, g_PMAC, 10);
      }
      MoonsUtil::TryMirrorInitialze(g_Mirror, g_PMAC, 10);

      g_Mirror.Stop();
      g_Z.Stop();

      auto setFastSpeed = [](const std::string &axisName, Motor &motor) {
        auto *p = EqMotionRunPara::Instance().GetAxis(axisName);
        if (p) motor.SetSpeed(p->fast.velocity, p->fast.accel_time);
      };
      setFastSpeed("X", g_X);
      setFastSpeed("Y", g_Y);
      setFastSpeed("Z", g_Z);

      // 1. Move Z to Safe Z
      g_Z.MovAbs(SafeZ * pmacMult);
      auto startWait = std::chrono::steady_clock::now();
      while (std::abs(g_Z.GetPos() / pmacMult - SafeZ) > 0.005) {
          if (std::chrono::steady_clock::now() - startWait > std::chrono::seconds(5)) break;
          std::this_thread::sleep_for(std::chrono::milliseconds(20));
      }

      // 2. Relative XY Move & Mirror
      g_Mirror.SetSpeed(20.0, 100.0);
      g_Mirror.MovAbs(X);

      double CurX = g_X.GetPos() / pmacMult;
      double CurY = g_Y.GetPos() / pmacMult;
      double RelX = OffsetX - s_last_offset_x;
      double RelY = OffsetY - s_last_offset_y;

      double targetStageX = 0.0;
      double targetStageY = 0.0;

      if (forceAbsolute || s_is_first_preset_move) {
        s_is_first_preset_move = false;
        targetStageX = OffsetX;
        targetStageY = OffsetY;
        TRACE(_T("[moonsPreset] Absolute alignment to scanner_base original center requested: (%f, %f)\n"), targetStageX, targetStageY);
      } else {
        targetStageX = CurX + RelX;
        targetStageY = CurY + RelY;
      }

      g_X.MovAbs(targetStageX * pmacMult);
      g_Y.MovAbs(targetStageY * pmacMult);

      // Save as last offset
      s_last_offset_x = OffsetX;
      s_last_offset_y = OffsetY;

      // Wait XY roughly (optional, but good for safety before descending Z)
      startWait = std::chrono::steady_clock::now();
      while (std::abs(g_X.GetPos() / pmacMult - targetStageX) > 0.01 || std::abs(g_Y.GetPos() / pmacMult - targetStageY) > 0.01) {
          if (std::chrono::steady_clock::now() - startWait > std::chrono::seconds(5)) break;
          std::this_thread::sleep_for(std::chrono::milliseconds(20));
      }

      // 3. Move Z to Target
      g_Z.MovAbs(TargetZ * pmacMult);

    } else if (Payload == _T("object_x20")) {
      if (!MachineProfile::Instance().HasLensMotor()) return;

      double LenX = INI_MOONS.GetDouble(_T("LENS"), _T("x20"));
      double TargetZ = INI_MOONS.GetDouble(_T("LENS"), _T("x20_Z_POS"));
      double SafeZ = INI_MOONS.GetDouble(_T("LENS"), _T("x20_SAFE_Z"));
      double MirrorX = INI_MOONS.GetDouble(_T("MIRROR"), _T("OBJECTIVE_POS"));
      double OffsetX = INI_MOONS.GetDouble(_T("LENS"), _T("StageX20_Offset"));
      double OffsetY = INI_MOONS.GetDouble(_T("LENS"), _T("StageY20_Offset"));

      double pmacMult = (MachineProfile::Instance().GetMotion() == "PMAC") ? 1000.0 : 1.0;
      double curZ = g_Z.GetPos() / pmacMult;
      double curMirror = g_Mirror.GetPos();
      double curLens = g_Lens.GetPos();

      // Check if we are already at the target preset state and stage offset is matching
      if (std::abs(curZ - TargetZ) < 0.1 && std::abs(curMirror - MirrorX) < 0.1 && std::abs(curLens - LenX) < 0.1 &&
          std::abs(OffsetX - s_last_offset_x) < 0.01 && std::abs(OffsetY - s_last_offset_y) < 0.01) {
        TRACE(_T("Already at object_x20 position with matched offset. Skipping preset movement.\n"));
        s_last_offset_x = OffsetX;
        s_last_offset_y = OffsetY;
        return;
      }

      g_Mirror.Stop();
      g_Lens.Stop();
      g_Z.Stop();

      auto setFastSpeed = [](const std::string &axisName, Motor &motor) {
        auto *p = EqMotionRunPara::Instance().GetAxis(axisName);
        if (p) motor.SetSpeed(p->fast.velocity, p->fast.accel_time);
      };
      setFastSpeed("X", g_X);
      setFastSpeed("Y", g_Y);
      setFastSpeed("Z", g_Z);

      // 1. Safe Z
      g_Z.MovAbs(SafeZ * pmacMult);
      auto startWait = std::chrono::steady_clock::now();
      while (std::abs(g_Z.GetPos() / pmacMult - SafeZ) > 0.005) {
          if (std::chrono::steady_clock::now() - startWait > std::chrono::seconds(5)) break;
          std::this_thread::sleep_for(std::chrono::milliseconds(20));
      }

      // 2. Relative XY & Motors
      g_Mirror.SetSpeed(20.0, 100.0);
      g_Lens.SetSpeed(20.0, 100.0);
      g_Mirror.MovAbs(MirrorX);
      g_Lens.MovAbs(LenX);

      double CurX = g_X.GetPos() / pmacMult;
      double CurY = g_Y.GetPos() / pmacMult;
      double RelX = OffsetX - s_last_offset_x;
      double RelY = OffsetY - s_last_offset_y;

      double targetStageX = 0.0;
      double targetStageY = 0.0;

      if (forceAbsolute) {
        double ScannerOffsetX = INI_MOONS.GetDouble(_T("MIRROR"), _T("StageX_Offset"));
        double ScannerOffsetY = INI_MOONS.GetDouble(_T("MIRROR"), _T("StageY_Offset"));
        targetStageX = ScannerOffsetX + OffsetX;
        targetStageY = ScannerOffsetY + OffsetY;
        TRACE(_T("[moonsPreset] Absolute alignment to object_x20 center requested: (%f, %f)\n"), targetStageX, targetStageY);
      } else {
        targetStageX = CurX + RelX;
        targetStageY = CurY + RelY;
      }

      g_X.MovAbs(targetStageX * pmacMult);
      g_Y.MovAbs(targetStageY * pmacMult);

      s_last_offset_x = OffsetX;
      s_last_offset_y = OffsetY;

      startWait = std::chrono::steady_clock::now();
      while (std::abs(g_X.GetPos() / pmacMult - targetStageX) > 0.01 || std::abs(g_Y.GetPos() / pmacMult - targetStageY) > 0.01) {
          if (std::chrono::steady_clock::now() - startWait > std::chrono::seconds(5)) break;
          std::this_thread::sleep_for(std::chrono::milliseconds(20));
      }

      // 3. Target Z
      g_Z.MovAbs(TargetZ * pmacMult);

    } else if (Payload == _T("object_x50")) {
      double MirrorX, TargetZ, SafeZ, OffsetX, OffsetY;
      double LenX = INI_MOONS.GetDouble(_T("LENS"), _T("x50"));

      if (!MachineProfile::Instance().HasLensMotor()) {
        MirrorX = INI_MOONS.GetDouble(_T("LENS"), _T("x50"));
        TargetZ = INI_MOONS.GetDouble(_T("LENS"), _T("x50_Z_POS"));
        SafeZ = INI_MOONS.GetDouble(_T("LENS"), _T("x50_SAFE_Z"));
        OffsetX = INI_MOONS.GetDouble(_T("LENS"), _T("StageX50_Offset"));
        OffsetY = INI_MOONS.GetDouble(_T("LENS"), _T("StageY50_Offset"));
      } else {
        MirrorX = INI_MOONS.GetDouble(_T("MIRROR"), _T("OBJECTIVE_POS"));
        TargetZ = INI_MOONS.GetDouble(_T("LENS"), _T("x50_Z_POS"));
        SafeZ = INI_MOONS.GetDouble(_T("LENS"), _T("x50_SAFE_Z"));
        OffsetX = INI_MOONS.GetDouble(_T("LENS"), _T("StageX50_Offset"));
        OffsetY = INI_MOONS.GetDouble(_T("LENS"), _T("StageY50_Offset"));
      }

      double pmacMult = (MachineProfile::Instance().GetMotion() == "PMAC") ? 1000.0 : 1.0;
      double curZ = g_Z.GetPos() / pmacMult;
      double curMirror = g_Mirror.GetPos();
      double curLens = MachineProfile::Instance().HasLensMotor() ? g_Lens.GetPos() : 0.0;

      // Check if we are already at the target preset state and stage offset is matching
      bool isAlreadyAtTarget = std::abs(curZ - TargetZ) < 0.1 && std::abs(curMirror - MirrorX) < 0.1 &&
                               std::abs(OffsetX - s_last_offset_x) < 0.01 && std::abs(OffsetY - s_last_offset_y) < 0.01;
      if (MachineProfile::Instance().HasLensMotor()) {
        isAlreadyAtTarget = isAlreadyAtTarget && std::abs(curLens - LenX) < 0.1;
      }

      if (isAlreadyAtTarget) {
        TRACE(_T("Already at object_x50 position. Skipping preset movement.\n"));
        s_last_offset_x = OffsetX;
        s_last_offset_y = OffsetY;
        return;
      }

      if (MachineProfile::Instance().HasLensMotor()) {
        g_Lens.Stop();
        g_Lens.SetSpeed(20.0, 100.0);
        g_Lens.MovAbs(LenX);
      }

      g_Mirror.Stop();
      g_Z.Stop();

      auto setFastSpeed = [](const std::string &axisName, Motor &motor) {
        auto *p = EqMotionRunPara::Instance().GetAxis(axisName);
        if (p) motor.SetSpeed(p->fast.velocity, p->fast.accel_time);
      };
      setFastSpeed("X", g_X);
      setFastSpeed("Y", g_Y);
      setFastSpeed("Z", g_Z);
      g_Mirror.SetSpeed(20.0, 100.0);

      // 1. Safe Z
      g_Z.MovAbs(SafeZ * pmacMult);
      auto startWait = std::chrono::steady_clock::now();
      while (std::abs(g_Z.GetPos() / pmacMult - SafeZ) > 0.005) {
          if (std::chrono::steady_clock::now() - startWait > std::chrono::seconds(5)) break;
          std::this_thread::sleep_for(std::chrono::milliseconds(20));
      }

      // 2. Relative XY & Mirror
      g_Mirror.MovAbs(MirrorX);

      double CurX = g_X.GetPos() / pmacMult;
      double CurY = g_Y.GetPos() / pmacMult;
      double RelX = OffsetX - s_last_offset_x;
      double RelY = OffsetY - s_last_offset_y;

      double targetStageX = 0.0;
      double targetStageY = 0.0;

      if (forceAbsolute) {
        double ScannerOffsetX = INI_MOONS.GetDouble(_T("MIRROR"), _T("StageX_Offset"));
        double ScannerOffsetY = INI_MOONS.GetDouble(_T("MIRROR"), _T("StageY_Offset"));
        targetStageX = ScannerOffsetX + OffsetX;
        targetStageY = ScannerOffsetY + OffsetY;
        TRACE(_T("[moonsPreset] Absolute alignment to object_x50 center requested: (%f, %f)\n"), targetStageX, targetStageY);
      } else {
        targetStageX = CurX + RelX;
        targetStageY = CurY + RelY;
      }

      g_X.MovAbs(targetStageX * pmacMult);
      g_Y.MovAbs(targetStageY * pmacMult);

      s_last_offset_x = OffsetX;
      s_last_offset_y = OffsetY;

      startWait = std::chrono::steady_clock::now();
      while (std::abs(g_X.GetPos() / pmacMult - targetStageX) > 0.01 || std::abs(g_Y.GetPos() / pmacMult - targetStageY) > 0.01) {
          if (std::chrono::steady_clock::now() - startWait > std::chrono::seconds(5)) break;
          std::this_thread::sleep_for(std::chrono::milliseconds(20));
      }

      // 3. Target Z
      g_Z.MovAbs(TargetZ * pmacMult);
    }
  });

  cb->Success(MakeOk());
}

// ---------------- Refcount & canceled ----------------
void PortalRouterHandler::AddRef() const {
  ref_count_.fetch_add(1, std::memory_order_relaxed);
}
bool PortalRouterHandler::Release() const {
  if (ref_count_.fetch_sub(1, std::memory_order_acq_rel) == 1) {
    delete this;
    return true;
  }
  return false;
}
bool PortalRouterHandler::HasOneRef() const {
  return ref_count_.load(std::memory_order_acquire) == 1;
}
bool PortalRouterHandler::HasAtLeastOneRef() const {
  return ref_count_.load(std::memory_order_acquire) > 0;
}

void PortalRouterHandler::OnQueryCanceled(CefRefPtr<CefBrowser> browser,
                                          CefRefPtr<CefFrame> frame,
                                          QueryIdT query_id) {
  CEF_REQUIRE_UI_THREAD();
#ifdef _DEBUG
  std::wstringstream ss;
  ss << L"[PortalRouter] OnQueryCanceled: id=" << query_id << L", url="
     << (frame ? frame->GetURL().ToWString() : L"(no frame)") << L"\n";
  ::OutputDebugStringW(ss.str().c_str());
#endif
  (void)browser;
}

// Helper for calibration
static CString GetCalibrationDir(const CString &profile) {
  TCHAR szPath[MAX_PATH] = {0};
  ::GetModuleFileName(NULL, szPath, MAX_PATH);
  ::PathRemoveFileSpec(
      szPath); // Executable Directory (e.g. Bin/Debug or Release)

  // [FIX] Robust Path Resolution
  // Expected config paths:
  // 1. ./Config/calibration/profile (Dev/Standard)
  // 2. ../Config/calibration/profile (Run from Bin, Config in Root)
  // 3. ./resources/Config/calibration/profile (Electron Dist)

  // We try to find "Config" directory
  CString candidates[] = {_T("%s\\Config"), _T("%s\\..\\Config"),
                          _T("%s\\resources\\Config"),
                          _T("%s\\..\\..\\Config")};

  CString configBase;
  bool found = false;
  for (const auto &fmt : candidates) {
    CString tryPath;
    tryPath.Format(fmt, szPath);
    // Normalize path (resolve ..)
    TCHAR fullPath[MAX_PATH] = {0};
    if (::GetFullPathName(tryPath, MAX_PATH, fullPath, NULL)) {
      tryPath = fullPath;
    }

    if (::PathFileExists(tryPath)) {
      configBase = tryPath;
      found = true;
      break;
    }
  }

  if (!found) {
    // Fallback to default (create in current)
    configBase.Format(_T("%s\\Config"), szPath);
  }

  CString dir;
  dir.Format(_T("%s\\calibration\\%s"), configBase, profile);
  return dir;
}

static void EnsureDirectoryExists(const CString &path) {
  if (::PathFileExists(path))
    return;

  // Recursive creation simple approach or SHCreateDirectoryEx
  // Win32 CreateDirectory only creates one level.
  // Let's use SHCreateDirectoryEx for safety
  int ret = SHCreateDirectoryEx(NULL, path, NULL);
  if (ret != ERROR_SUCCESS && ret != ERROR_ALREADY_EXISTS &&
      ret != ERROR_FILE_EXISTS) {
    // Fallback or log?
    // Just try simplified parent check
  }
}

// ---------------- Calibration Implementation ----------------

void PortalRouterHandler::HandleCalibrationSave(Browser b, Payload p,
                                                Callback cb) {
  TRACE(_T("cmd.calibration.save called\n"));

  CEF_REQUIRE_UI_THREAD(); // Run on UI or FILE? For safety, UI thread is fine
  // for small JSONs.

  if (!p.get() || !p->HasKey("profile") || !p->HasKey("data")) {
    cb->Success(MakeErr("Missing profile or data"));
    return;
  }

  std::string profile = p->GetString("profile"); // "Scanner", "Object_x20"
  CefRefPtr<CefDictionaryValue> data = p->GetDictionary("data");
  std::string json = PortalRouterHandler::DictToJson(data);

  // 1. Prepare Directory
  CString dir = GetCalibrationDir(CString(CA2T(profile.c_str())));
  EnsureDirectoryExists(dir);

  // Create 'history' subdirectory
  CString historyDir;
  historyDir.Format(_T("%s\\history"), dir);
  EnsureDirectoryExists(historyDir);

  // 2. Save current.json
  CString currentPath;
  currentPath.Format(_T("%s\\current.json"), dir);
  {
    std::ofstream ofs(currentPath);
    if (ofs.is_open())
      ofs << json;
  }

  // 3. Save History File
  // [FIX] Always use Backend Local Time for filename generation to ensure valid
  // ASCII characters on disk. The frontend timestamp might contain format
  // issues or encoding issues.
  SYSTEMTIME st;
  GetLocalTime(&st);
  char buf[64];
  sprintf_s(buf, "%04d%02d%02d_%02d%02d%02d", st.wYear, st.wMonth, st.wDay,
            st.wHour, st.wMinute, st.wSecond);
  std::string safeTs = buf; // "YYYYMMDD_HHMMSS"

  std::string filename = safeTs + "_calib.json";

  // We update the local variable tsStr to this safe time so the Index entry
  // matches the filename
  std::string tsStr = safeTs;

  // [FIX] Avoid passing temporary CA2T to Format (variadic function).
  // Explicitly create CString for filename first.
  CString strFilename(CA2T(filename.c_str()));

  CString histPath;
  histPath.Format(_T("%s\\%s"), (LPCTSTR)historyDir, (LPCTSTR)strFilename);
  {
    std::ofstream ofs(histPath);
    if (ofs.is_open())
      ofs << json;
  }

  // 4. Update index.json
  // Load existing index
  CString indexPath;
  indexPath.Format(_T("%s\\index.json"), dir);

  auto indexList = CefListValue::Create();
  if (::PathFileExists(indexPath)) {
    std::ifstream ifs(indexPath);
    // ... Reading entire file to string, then ParseJSON ...
    std::stringstream buffer;
    buffer << ifs.rdbuf();
    auto val = CefParseJSON(buffer.str(), JSON_PARSER_RFC);
    if (val && val->IsValid() && val->GetType() == VTYPE_LIST) {
      indexList = val->GetList();
    }
  }

  // Create Summary Item
  auto summary = CefDictionaryValue::Create();
  summary->SetString("filename", filename);
  summary->SetString("timestamp", tsStr); // or original ISO string

  // Extract operator, rms, pass
  if (data->HasKey("meta")) {
    auto meta = data->GetDictionary("meta");
    if (meta->HasKey("operator"))
      summary->SetString("operator", meta->GetString("operator"));
  }
  // RMS/Pass if available (mock/real)
  // Assuming backend blind save, just passing what frontend sent?
  // Frontend sends 'meta' and 'calibration'.
  // Let's just save what we have.

  // Prepend (Insert at 0)
  // CefListValue doesn't support Insert, we have to rebuild.
  auto newIndex = CefListValue::Create();
  newIndex->SetDictionary(0, summary);
  for (size_t i = 0; i < indexList->GetSize(); ++i) {
    if (i >= 20)
      break; // Keep max 20
    newIndex->SetDictionary(i + 1, indexList->GetDictionary(i));
  }

  // Save Index
  {
    auto v = CefValue::Create();
    v->SetList(newIndex);
    std::string idxJson = CefWriteJSON(v, JSON_WRITER_DEFAULT).ToString();
    std::ofstream ofs(indexPath);
    if (ofs.is_open())
      ofs << idxJson;
  }

  cb->Success(MakeOk());
}

void PortalRouterHandler::HandleCalibrationLoad(Browser b, Payload p,
                                                Callback cb) {
  if (!p.get() || !p->HasKey("profile")) {
    cb->Success(MakeErr("No profile"));
    return;
  }
  std::string profile = p->GetString("profile");

  CString dir = GetCalibrationDir(CString(CA2T(profile.c_str())));
  CString currentPath;
  currentPath.Format(_T("%s\\current.json"), dir);

  CefRefPtr<CefDictionaryValue> data = nullptr;
  if (::PathFileExists(currentPath)) {
    std::ifstream ifs(currentPath);
    std::stringstream buffer;
    buffer << ifs.rdbuf();
    auto val = CefParseJSON(buffer.str(), JSON_PARSER_RFC);
    if (val && val->IsValid() && val->GetType() == VTYPE_DICTIONARY) {
      data = val->GetDictionary();
    }
  }

  auto res = CefDictionaryValue::Create();
  res->SetBool("ok", true);
  if (data)
    res->SetDictionary("data", data);
  cb->Success(DictToJson(res));
}

void PortalRouterHandler::HandleCalibrationList(Browser b, Payload p,
                                                Callback cb) {
  if (!p.get() || !p->HasKey("profile")) {
    cb->Success(MakeErr("No profile"));
    return;
  }
  std::string profile = p->GetString("profile");

  CString dir = GetCalibrationDir(CString(CA2T(profile.c_str())));
  CString indexPath;
  indexPath.Format(_T("%s\\index.json"), dir);

  CefRefPtr<CefListValue> list = CefListValue::Create(); // Empty by default
  if (::PathFileExists(indexPath)) {
    std::ifstream ifs(indexPath);
    std::stringstream buffer;
    buffer << ifs.rdbuf();
    auto val = CefParseJSON(buffer.str(), JSON_PARSER_RFC);
    if (val && val->IsValid() && val->GetType() == VTYPE_LIST) {
      list = val->GetList();
    }
  }

  auto res = CefDictionaryValue::Create();
  res->SetBool("ok", true);
  res->SetList("list", list);
  cb->Success(DictToJson(res));
}

void PortalRouterHandler::HandleCalibrationRollback(Browser b, Payload p,
                                                    Callback cb) {
  if (!p.get() || !p->HasKey("profile") || !p->HasKey("filename")) {
    cb->Success(MakeErr("Missing args"));
    return;
  }
  std::string profile = p->GetString("profile");
  std::string filename = p->GetString("filename");

  CString dir = GetCalibrationDir(CString(CA2T(profile.c_str())));
  CString currentPath;
  currentPath.Format(_T("%s\\current.json"), (LPCTSTR)dir);

  CString strFilename(CA2T(filename.c_str()));
  CString historyPath;
  historyPath.Format(_T("%s\\history\\%s"), (LPCTSTR)dir, (LPCTSTR)strFilename);

  if (::PathFileExists(historyPath)) {
    ::CopyFile(historyPath, currentPath, FALSE);
    cb->Success(MakeOk());
  } else {
    cb->Success(MakeErr("History file not found"));
  }
}

void PortalRouterHandler::HandleCalibrationDelete(Browser b, Payload p,
                                                  Callback cb) {
  if (!p.get() || !p->HasKey("profile") || !p->HasKey("filename")) {
    cb->Success(MakeErr("Missing args"));
    return;
  }
  std::string profile = p->GetString("profile");
  std::string filename = p->GetString("filename");

  CString dir = GetCalibrationDir(CString(CA2T(profile.c_str())));

  CString strFilename(CA2T(filename.c_str()));
  CString historyPath;
  historyPath.Format(_T("%s\\history\\%s"), (LPCTSTR)dir, (LPCTSTR)strFilename);

  // 1. Delete File
  // Even if file doesn't exist, we must remove it from index to keep
  // consistent.
  if (::PathFileExists(historyPath)) {
    if (!::DeleteFile(historyPath)) {
      TRACE(_T("[Calibration] Failed to delete file: %s\n"),
            (LPCTSTR)historyPath);
      // Verify if we should abort? No, let's try to clean index at least.
    }
  }

  // 2. Remove from Index
  CString indexPath;
  indexPath.Format(_T("%s\\index.json"), dir);
  if (::PathFileExists(indexPath)) {
    // Read existing
    CefRefPtr<CefListValue> list = nullptr;
    {
      std::ifstream ifs(indexPath);
      std::stringstream buffer;
      buffer << ifs.rdbuf();
      auto val = CefParseJSON(buffer.str(), JSON_PARSER_RFC);
      if (val && val->IsValid() && val->GetType() == VTYPE_LIST) {
        list = val->GetList();
      }
    }

    if (list) {
      auto newList = CefListValue::Create();
      size_t newIdx = 0;
      bool found = false;

      for (size_t i = 0; i < list->GetSize(); ++i) {
        auto item = list->GetDictionary(i);
        if (!item)
          continue;

        std::string fName = item->GetString("filename");
        if (fName == filename) {
          found = true;
          continue; // Skip (Delete)
        }
        newList->SetDictionary(newIdx++, item);
      }

      if (found) {
        // Write back only if changed
        auto v = CefValue::Create();
        v->SetList(newList);
        std::ofstream ofs(indexPath);
        if (ofs.is_open()) {
          ofs << CefWriteJSON(v, JSON_WRITER_DEFAULT).ToString();
          ofs.close();
        } else {
          cb->Success(MakeErr("Failed to write index.json"));
          return;
        }
      }
    }
  }

  cb->Success(MakeOk());
}

// ---------------- Laser Set Center Implementation ----------------

void PortalRouterHandler::LoadCalibState() {
  // Default val
  m_CalibStates["scanner"] = {100, 0, 0, 0, 0};
  m_CalibStates["object_x20"] = {100, 0, 0, 0, 0};
  m_CalibStates["object_x50"] = {100, 0, 0, 0, 0};

  CString configDir = GetConfigDir();
  CString filePath;
  filePath.Format(_T("%s\\CalibState.json"), (LPCTSTR)configDir);

  if (::PathFileExists(filePath)) {
    std::ifstream ifs(filePath);
    if (ifs.is_open()) {
      std::stringstream buffer;
      buffer << ifs.rdbuf();
      auto val = CefParseJSON(buffer.str(), JSON_PARSER_RFC);
      if (val && val->IsValid() && val->GetType() == VTYPE_DICTIONARY) {
        auto dict = val->GetDictionary();

        std::vector<CefString> keys;
        dict->GetKeys(keys);
        for (const auto &k : keys) {
          std::string keyStr = k.ToString();
          auto item = dict->GetDictionary(k);
          if (!item)
            continue;

          CalibState s;
          s.viewRatio = item->GetInt("viewRatio");
          if (s.viewRatio < 50)
            s.viewRatio = 50;
          if (s.viewRatio > 100)
            s.viewRatio = 100;

          auto p = item->GetDictionary("pixel");
          if (p) {
            s.pixelX = p->GetDouble("x");
            s.pixelY = p->GetDouble("y");
          }

          auto m = item->GetDictionary("motion");
          if (m) {
            s.motionX = m->GetDouble("x");
            s.motionY = m->GetDouble("y");
          }

          m_CalibStates[keyStr] = s;
        }
      }
    }
  }
}

void PortalRouterHandler::SaveCalibState() {
  auto root = CefDictionaryValue::Create();
  for (const auto &kv : m_CalibStates) {
    auto item = CefDictionaryValue::Create();
    item->SetInt("viewRatio", kv.second.viewRatio);

    auto p = CefDictionaryValue::Create();
    p->SetDouble("x", kv.second.pixelX);
    p->SetDouble("y", kv.second.pixelY);
    item->SetDictionary("pixel", p);

    auto m = CefDictionaryValue::Create();
    m->SetDouble("x", kv.second.motionX);
    m->SetDouble("y", kv.second.motionY);
    item->SetDictionary("motion", m);

    root->SetDictionary(kv.first, item);
  }

  CString configDir = GetConfigDir();
  CString filePath;
  filePath.Format(_T("%s\\CalibState.json"), (LPCTSTR)configDir);

  auto v = CefValue::Create();
  v->SetDictionary(root);
  std::string json = CefWriteJSON(v, JSON_WRITER_PRETTY_PRINT).ToString();

  std::ofstream ofs(filePath);
  if (ofs.is_open())
    ofs << json;
}

void PortalRouterHandler::HandleCalibGetState(Browser b, Payload p,
                                              Callback cb) {
  std::string profile = "scanner";
  if (p.get()) {
    if (p->HasKey("profile"))
      profile = p->GetString("profile").ToString();
    else if (p->HasKey("key"))
      profile = p->GetString("key").ToString();
  }

  // Safety check
  if (m_CalibStates.find(profile) == m_CalibStates.end()) {
    if (profile == "scanner" || profile == "object_x20" ||
        profile == "object_x50") {
      m_CalibStates[profile] = {100, 0, 0, 0, 0};
    } else {
      profile = "scanner";
    }
  }

  const auto &s = m_CalibStates[profile];

  auto res = CefDictionaryValue::Create();
  res->SetInt("viewRatio", s.viewRatio);
  auto pd = CefDictionaryValue::Create();
  pd->SetDouble("x", s.pixelX);
  pd->SetDouble("y", s.pixelY);
  auto md = CefDictionaryValue::Create();
  md->SetDouble("x", s.motionX);
  md->SetDouble("y", s.motionY);
  res->SetDictionary("pixel", pd);
  res->SetDictionary("motion", md);

  cb->Success(DictToJson(res));
}

void PortalRouterHandler::HandleCalibSetViewRatio(Browser b, Payload p,
                                                  Callback cb) {
  if (!p.get() || !p->HasKey("value")) {
    cb->Success(MakeErr("no value"));
    return;
  }

  std::string profile = "scanner";
  if (p->HasKey("profile"))
    profile = p->GetString("profile").ToString();
  else if (p->HasKey("key"))
    profile = p->GetString("key").ToString();

  int val = p->GetInt("value");
  if (val < 50)
    val = 50;
  if (val > 100)
    val = 100;

  m_CalibStates[profile].viewRatio = val;
  SaveCalibState();
  cb->Success(MakeOk());
}

void PortalRouterHandler::HandleCalibPickCenter(Browser b, Payload p,
                                                Callback cb) {
  if (!p.get()) {
    cb->Success(MakeErr("no payload"));
    return;
  }

  std::string profile = "scanner";
  if (p->HasKey("profile"))
    profile = p->GetString("profile").ToString();
  else if (p->HasKey("key"))
    profile = p->GetString("key").ToString();

  // Pixel Input
  double px = GetSafeDouble(p, _T("x"));
  double py = GetSafeDouble(p, _T("y"));

  // [Optimization] Move GetPos() and Save to worker thread
  WORK_1([this, px, py, profile, cb]() {
    try {
      // Motion Capture
      double mx = g_X.GetPos();
      double my = g_Y.GetPos();

      if (MachineProfile::Instance().GetMotion() == "PMAC") {
        mx /= 1000.0;
        my /= 1000.0;
      }

      m_CalibStates[profile].pixelX = px;
      m_CalibStates[profile].pixelY = py;
      m_CalibStates[profile].motionX = mx;
      m_CalibStates[profile].motionY = my;

      SaveCalibState();

      auto res = CefDictionaryValue::Create();
      auto pd = CefDictionaryValue::Create();
      pd->SetDouble("x", px);
      pd->SetDouble("y", py);
      auto md = CefDictionaryValue::Create();
      md->SetDouble("x", mx);
      md->SetDouble("y", my);
      res->SetDictionary("pixel", pd);
      res->SetDictionary("motion", md);

      cb->Success(DictToJson(res));
    } catch (...) {
      cb->Failure(500, "Error in PickCenter worker");
    }
  });
}

void PortalRouterHandler::HandleCalibSave(Browser b, Payload p, Callback cb) {
  SaveCalibState();
  cb->Success(MakeOk());
}

void PortalRouterHandler::HandleCalibApply(Browser b, Payload p, Callback cb) {
  std::string profile = "scanner";
  if (p.get()) {
    if (p->HasKey("profile"))
      profile = p->GetString("profile").ToString();
    else if (p->HasKey("key"))
      profile = p->GetString("key").ToString();
  }

  // Ensure we exist
  if (m_CalibStates.find(profile) == m_CalibStates.end()) {
    cb->Success(MakeErr("Profile not found"));
    return;
  }

  const auto &s = m_CalibStates[profile];

  bool ok = true;
  /**
   * @brief [REVISION] 자동 파라미터 업데이트 중단 (사용자 요청)
   * @details Calibration 'Apply' 시점에 하드웨어 INI(MoonsConfig)의 오프셋을
   * 강제로 덮어쓰던 로직을 제거함. 보정 결과는 CalibState.json에만 반영되며,
   * 'Stage Original Center' 등 하드웨어 파라미터는 사용자가 직접 'Parameter'
   * 페이지에서 수정 및 저장할 때만 변경됨.
   */
  /*
  if (profile == "scanner") {
          ok = ok &&
                  INI_MOONS.WriteNumber(_T("MIRROR"), _T("StageX_Offset"),
  s.motionX); ok = ok && INI_MOONS.WriteNumber(_T("MIRROR"),
  _T("StageY_Offset"), s.motionY);
  }
  else if (profile == "object_x20") {
          ok = ok &&
                  INI_MOONS.WriteNumber(_T("LENS"), _T("StageX20_Offset"),
  s.motionX); ok = ok && INI_MOONS.WriteNumber(_T("LENS"),
  _T("StageY20_Offset"), s.motionY);
  }
  else if (profile == "object_x50") {
          ok = ok &&
                  INI_MOONS.WriteNumber(_T("LENS"), _T("StageX50_Offset"),
  s.motionX); ok = ok && INI_MOONS.WriteNumber(_T("LENS"),
  _T("StageY50_Offset"), s.motionY);
  }
  */

  SaveCalibState();

  cb->Success(ok ? MakeOk() : MakeErr("Failed to write INI"));
}

// [NEW] Light Control Implementation
void PortalRouterHandler::HandleLightGetConfig(Browser b, Payload p,
                                               Callback cb) {
  auto &lc = LightController::Instance();
  lc.LoadConfig(); // [FIX] Reload from INI file explicitly

  auto res = CefDictionaryValue::Create();
  res->SetBool("ok", true);
  res->SetInt("mode", (int)lc.GetCurrentMode());

  auto profiles = lc.GetAllProfiles();

  auto addProfile = [&](const std::string &key) {
    auto list = CefListValue::Create();
    auto listOn = CefListValue::Create(); // [NEW] Enabled List
    if (profiles.count(key)) {
      const auto &chans = profiles[key];
      const auto &enables =
          lc.GetProfile(key == "scanner"    ? LightMode::SCANNER
                        : key == "object20" ? LightMode::OBJECT_20
                                            : LightMode::OBJECT_50)
              .enabled; // Access enabled via GetProfile since GetAllProfiles
                        // only returns ints?
      // Wait, GetAllProfiles returns map string->vector<int>. It loses
      // 'enabled'. I should modify GetAllProfiles OR just access individually
      // here. Iterating profiles map directly from GetAllProfiles is
      // insufficient.

      // Let's refactor: GetAllProfiles is helper but we need enabled too.
      // Better to iterate manual modes or fix GetAllProfiles.
      // I'll stick to manual mode mapping since GetAllProfiles is just
      // vector<int> in interface.

      // Actually, let's fix the logic below directly.
    }
  };

  // REWRITE addProfile to be more robust
  auto addProfileFull = [&](const std::string &key, LightMode mode) {
    auto prof = lc.GetProfile(mode);
    auto list = CefListValue::Create();
    auto listOn = CefListValue::Create();

    for (size_t i = 0; i < prof.channels.size(); ++i) {
      int hwVal = prof.channels[i];
      int uiVal = (int)round((hwVal / 1023.0) * 100.0);
      list->SetInt(i, uiVal);

      listOn->SetBool(i, prof.enabled[i]);
    }
    res->SetList(key, list);
    res->SetList(key + "_on", listOn);
  };

  addProfileFull("scanner", LightMode::SCANNER);
  addProfileFull("object20", LightMode::OBJECT_20);
  addProfileFull("object50", LightMode::OBJECT_50);

  cb->Success(DictToJson(res));
}

void PortalRouterHandler::HandleLightSetVal(Browser b, Payload p, Callback cb) {
  if (!p.get()) {
    cb->Success(MakeErr("no payload"));
    return;
  }

  std::string profile = p->GetString("profile").ToString();
  int ch = p->GetInt("ch");
  int uiVal = p->GetInt("val");

  WORK_1([profile, ch, uiVal, cb]() {
    int val = (int)round((uiVal / 100.0) * 1023.0);
    if (val < 0)
      val = 0;
    if (val > 1023)
      val = 1023;

    LightMode mode = LightMode::UNKNOWN;
    if (profile == "scanner")
      mode = LightMode::SCANNER;
    else if (profile == "object20")
      mode = LightMode::OBJECT_20;
    else if (profile == "object50")
      mode = LightMode::OBJECT_50;

    if (mode == LightMode::UNKNOWN) {
      cb->Success(MakeErr("Unknown profile"));
      return;
    }

    bool ok = LightController::Instance().SetChannelValue(mode, ch, val);
    cb->Success(ok ? MakeOk() : MakeErr("Failed to set value"));
  });
}

void PortalRouterHandler::HandleLightSetMode(Browser b, Payload p,
                                             Callback cb) {
  if (!p.get()) {
    cb->Success(MakeErr("no payload"));
    return;
  }
  std::string modeStr = p->GetString("mode").ToString();

  WORK_1([modeStr, cb]() {
    bool ok = LightController::Instance().SetMode(modeStr);
    cb->Success(ok ? MakeOk() : MakeErr("Failed to set mode"));
  });
}

void PortalRouterHandler::HandleLightSave(Browser b, Payload p, Callback cb) {
  WORK_1([cb]() {
    bool ok = LightController::Instance().SaveConfig();
    cb->Success(ok ? MakeOk() : MakeErr("Failed to save config"));
  });
}

void PortalRouterHandler::HandleLightSetEnable(Browser b, Payload p,
                                               Callback cb) {
  if (!p.get()) {
    cb->Success(MakeErr("no payload"));
    return;
  }

  std::string profile = p->GetString("profile").ToString();
  int ch = p->GetInt("ch");
  bool enabled = p->GetBool("enabled");

  WORK_1([profile, ch, enabled, cb]() {
    LightMode mode = LightMode::UNKNOWN;
    if (profile == "scanner")
      mode = LightMode::SCANNER;
    else if (profile == "object20")
      mode = LightMode::OBJECT_20;
    else if (profile == "object50")
      mode = LightMode::OBJECT_50;

    if (mode == LightMode::UNKNOWN) {
      cb->Success(MakeErr("Unknown profile"));
      return;
    }

    bool ok = LightController::Instance().SetChannelEnabled(mode, ch, enabled);
    cb->Success(ok ? MakeOk() : MakeErr("Failed to set enable"));
  });
}

// ---------------- Motion Configuration Implementation ----------------

void PortalRouterHandler::HandleConfigGetMotion(Browser b, Payload p,
                                                Callback cb) {
  auto &para = EqMotionRunPara::Instance();
  para.Load(); // Ensure we read latest from INI

  auto axesList = CefListValue::Create();
  int idx = 0;
  for (const auto &axis : para.GetAxes()) {
    auto ad = CefDictionaryValue::Create();
    ad->SetString("name", axis.name);

    ad->SetDouble("scale_unit", axis.scale_unit);
    ad->SetDouble("gcode_offset", axis.gcode_offset);
    ad->SetDouble("home_offset", axis.home_offset);

    ad->SetBool("limit_used", axis.limit_used);
    ad->SetDouble("limit_min", axis.limit_min);
    ad->SetDouble("limit_max", axis.limit_max);
    ad->SetDouble("interlock_min", axis.interlock_min);
    ad->SetDouble("interlock_max", axis.interlock_max);

    // [NEW] Default REL/ABS values for JOG
    ad->SetDouble("default_rel_val", axis.default_rel_val);
    ad->SetDouble("default_abs_val", axis.default_abs_val);

    // Speeds
    auto speeds = CefDictionaryValue::Create();

    auto setProfile = [&](const char *key, const MotionSpeedProfile &prof) {
      auto pd = CefDictionaryValue::Create();
      // [FIX] Convert velocity from um/s (INI) to mm/s (UI) -> Divide by 1000
      pd->SetDouble("velocity", prof.velocity / 1000.0);
      pd->SetDouble("accel_time", prof.accel_time);
      speeds->SetDictionary(key, pd);
    };

    setProfile("slow", axis.slow);
    setProfile("mid", axis.mid);
    setProfile("fast", axis.fast);

    ad->SetDictionary("speeds", speeds);
    axesList->SetDictionary(idx++, ad);
  }

  auto res = CefDictionaryValue::Create();
  res->SetBool("ok", true);

  // The frontend expects { ok, data: { axes: [] } } ? or just { ok, axes: [] }?
  // Looking at MotionParameterForm.tsx:
  // const { ok, data } = await hwFacade.getMotionConfig();
  // if (ok && data && data.axes) ...
  // So payload should be { axes: [...] } and it is assigned to data.
  // AND hwFacade returns { ok, data, message } wrapper usually handled by
  // ITransport or Facade? Let's check HardwareFacade.ts: async
  // getMotionConfig(): Promise<{ ok: boolean, data?: any, message?: string }> {
  //   const r = await di.transport.send(wire(Channels.cmd_config_getMotion),
  //   {}); return r as any;
  // }
  // If Backend returns { "ok": true, "axes": [...] }, then r.axes exists.
  // Facade returns r as any.
  // Form uses `data.axes`. This implies `r` should have `data` property?
  // Or does `hwFacade` wrap it? `di.transport.send` returns the Raw response?
  //
  // Let's check other handlers.
  // HandleCameraGetRange returns { exposure: ..., gain: ... }.
  // Facade `getRanges` returns `r`.
  //
  // But `MotionParameterForm.tsx`:
  // const { ok, data } = await hwFacade.getMotionConfig();
  //
  // If I return { "ok": true, "data": { "axes": [...] } }
  // Then `r.data.axes` works.
  //
  // Let's match that structure.

  auto data = CefDictionaryValue::Create();
  data->SetList("axes", axesList);

  res->SetDictionary("data", data);

  cb->Success(DictToJson(res));
}

void PortalRouterHandler::HandleConfigSetMotion(Browser b, Payload p,
                                                Callback cb) {
  if (!p.get() || !p->HasKey("data")) {
    cb->Success(MakeErr("no data"));
    return;
  }

  // frontend sends { data: config } where config is MotionConfig { axes: [] }
  auto data = p->GetDictionary("data");
  if (!data->HasKey("axes")) {
    cb->Success(MakeErr("no axes"));
    return;
  }

  auto axesList = data->GetList("axes");
  auto &para = EqMotionRunPara::Instance();
  // We modify the singleton's data directly

  size_t count = axesList->GetSize();
  for (size_t i = 0; i < count; ++i) {
    auto ad = axesList->GetDictionary(i);
    if (!ad)
      continue;

    std::string name = ad->GetString("name");

    MotionAxisParams *axis = para.GetAxis(name);
    if (!axis)
      continue;

    // Update values
    if (ad->HasKey("scale_unit"))
      axis->scale_unit = GetSafeDouble(ad, _T("scale_unit"));
    if (ad->HasKey("gcode_offset"))
      axis->gcode_offset = GetSafeDouble(ad, _T("gcode_offset"));
    if (ad->HasKey("home_offset"))
      axis->home_offset = GetSafeDouble(ad, _T("home_offset"));

    if (ad->HasKey("limit_used"))
      axis->limit_used = ad->GetBool("limit_used");
    if (ad->HasKey("limit_min"))
      axis->limit_min = GetSafeDouble(ad, _T("limit_min"));
    if (ad->HasKey("limit_max"))
      axis->limit_max = GetSafeDouble(ad, _T("limit_max"));
    if (ad->HasKey("interlock_min"))
      axis->interlock_min = GetSafeDouble(ad, _T("interlock_min"));
    if (ad->HasKey("interlock_max"))
      axis->interlock_max = GetSafeDouble(ad, _T("interlock_max"));

    // [NEW] Default REL/ABS values for JOG
    if (ad->HasKey("default_rel_val"))
      axis->default_rel_val = GetSafeDouble(ad, _T("default_rel_val"));
    if (ad->HasKey("default_abs_val"))
      axis->default_abs_val = GetSafeDouble(ad, _T("default_abs_val"));

    if (ad->HasKey("speeds")) {
      auto speeds = ad->GetDictionary("speeds");
      auto updateProfile = [&](const char *key, MotionSpeedProfile &pProfile) {
        if (speeds->HasKey(key)) {
          auto pd = speeds->GetDictionary(key);
          if (pd->HasKey("velocity")) {
            // [FIX] Convert velocity from mm/s (UI) to um/s (INI) -> Multiply
            // by 1000
            double uiVel = GetSafeDouble(pd, _T("velocity"));
            pProfile.velocity = uiVel * 1000.0;
          }
          if (pd->HasKey("accel_time"))
            pProfile.accel_time = GetSafeDouble(pd, _T("accel_time"));
        }
      };
      updateProfile("slow", axis->slow);
      updateProfile("mid", axis->mid);
      updateProfile("fast", axis->fast);
    }
  }

  para.Save();
  cb->Success(MakeOk());
}

void PortalRouterHandler::HandleConfigGetMoons(Browser b, Payload p,
                                               Callback cb) {
  MoonsConfigService::Instance().Load();
  auto &lens = MoonsConfigService::Instance().GetLens();
  auto &mirror = MoonsConfigService::Instance().GetMirror();
  auto &conn = MoonsConfigService::Instance().GetConnect();

  auto res = CefDictionaryValue::Create();
  res->SetBool("ok", true);

  auto data = CefDictionaryValue::Create();

  // Connect
  auto connect = CefDictionaryValue::Create();
  connect->SetInt("com", conn.com);
  connect->SetInt("baudrate", conn.baudrate);
  data->SetDictionary("connect", connect);

  auto setProfile = [](CefRefPtr<CefDictionaryValue> parent,
                       const std::string &key, const MotionProfile &prof) {
    auto p = CefDictionaryValue::Create();
    p->SetDouble("run_vel", prof.run_vel);
    p->SetDouble("run_acc", prof.run_acc);
    p->SetDouble("run_dec", prof.run_dec);
    parent->SetDictionary(key, p);
  };

  // Lens
  auto l = CefDictionaryValue::Create();
  l->SetInt("id", lens.id);
  l->SetDouble("lead", lens.lead);
  l->SetInt("pluse", lens.pluse);
  setProfile(l, "home", lens.home);
  setProfile(l, "move", lens.move);
  setProfile(l, "jog", lens.jog);
  l->SetDouble("x20", lens.x20);
  l->SetDouble("x20_z_pos", lens.x20_z_pos);
  l->SetDouble("x20_safe_z", lens.x20_safe_z);
  l->SetDouble("stage_x20_offset", lens.stage_x20_offset);
  l->SetDouble("stage_y20_offset", lens.stage_y20_offset);
  l->SetDouble("x50", lens.x50);
  l->SetDouble("x50_z_pos", lens.x50_z_pos);
  l->SetDouble("x50_safe_z", lens.x50_safe_z);
  l->SetDouble("stage_x50_offset", lens.stage_x50_offset);
  l->SetDouble("stage_y50_offset", lens.stage_y50_offset);
  data->SetDictionary("lens", l);

  // Mirror
  auto m = CefDictionaryValue::Create();
  m->SetInt("id", mirror.id);
  m->SetDouble("lead", mirror.lead);
  m->SetInt("pluse", mirror.pluse);
  setProfile(m, "home", mirror.home);
  setProfile(m, "move", mirror.move);
  setProfile(m, "jog", mirror.jog);
  m->SetDouble("scanner_pos", mirror.scanner_pos);
  m->SetDouble("scanner_z_pos", mirror.scanner_z_pos);
  m->SetDouble("scanner_safe_z", mirror.scanner_safe_z);
  m->SetDouble("objective_pos", mirror.objective_pos);
  m->SetDouble("stage_x_offset", mirror.stage_x_offset);
  m->SetDouble("stage_y_offset", mirror.stage_y_offset);
  data->SetDictionary("mirror", m);

  res->SetDictionary("data", data);
  cb->Success(DictToJson(res));
}

void PortalRouterHandler::HandleConfigSetMoons(Browser b, Payload p,
                                               Callback cb) {
  if (!p.get() || !p->HasKey("data")) {
    cb->Success(MakeErr("no data"));
    return;
  }

  auto data = p->GetDictionary("data");
  auto &service = MoonsConfigService::Instance();

  // Connect
  if (data->HasKey("connect")) {
    auto c = data->GetDictionary("connect");
    service.GetConnect().com = c->GetInt("com");
    service.GetConnect().baudrate = c->GetInt("baudrate");
  }

  auto getProfile = [this](CefRefPtr<CefDictionaryValue> parent,
                           const std::string &key, MotionProfile &prof) {
    if (parent->HasKey(key)) {
      auto p = parent->GetDictionary(key);
      prof.run_vel = GetSafeDouble(p, _T("run_vel"));
      prof.run_acc = GetSafeDouble(p, _T("run_acc"));
      prof.run_dec = GetSafeDouble(p, _T("run_dec"));
    }
  };

  // Lens
  if (data->HasKey("lens")) {
    auto l = data->GetDictionary("lens");
    auto &lens = service.GetLens();
    lens.id = l->GetInt("id");
    lens.lead = GetSafeDouble(l, _T("lead"));
    lens.pluse = l->GetInt("pluse");
    getProfile(l, "home", lens.home);
    getProfile(l, "move", lens.move);
    getProfile(l, "jog", lens.jog);
    lens.x20 = GetSafeDouble(l, _T("x20"));
    lens.x20_z_pos = GetSafeDouble(l, _T("x20_z_pos"));
    lens.x20_safe_z = GetSafeDouble(l, _T("x20_safe_z"));
    lens.stage_x20_offset = GetSafeDouble(l, _T("stage_x20_offset"));
    lens.stage_y20_offset = GetSafeDouble(l, _T("stage_y20_offset"));
    lens.x50 = GetSafeDouble(l, _T("x50"));
    lens.x50_z_pos = GetSafeDouble(l, _T("x50_z_pos"));
    lens.x50_safe_z = GetSafeDouble(l, _T("x50_safe_z"));
    lens.stage_x50_offset = GetSafeDouble(l, _T("stage_x50_offset"));
    lens.stage_y50_offset = GetSafeDouble(l, _T("stage_y50_offset"));
  }

  // Mirror
  if (data->HasKey("mirror")) {
    auto m = data->GetDictionary("mirror");
    auto &mirror = service.GetMirror();
    mirror.id = m->GetInt("id");
    mirror.lead = GetSafeDouble(m, _T("lead"));
    mirror.pluse = m->GetInt("pluse");
    getProfile(m, "home", mirror.home);
    getProfile(m, "move", mirror.move);
    getProfile(m, "jog", mirror.jog);
    mirror.scanner_pos = GetSafeDouble(m, _T("scanner_pos"));
    mirror.scanner_z_pos = GetSafeDouble(m, _T("scanner_z_pos"));
    mirror.scanner_safe_z = GetSafeDouble(m, _T("scanner_safe_z"));
    mirror.objective_pos = GetSafeDouble(m, _T("objective_pos"));
    mirror.stage_x_offset = GetSafeDouble(m, _T("stage_x_offset"));
    mirror.stage_y_offset = GetSafeDouble(m, _T("stage_y_offset"));
  }

  service.Save();
  cb->Success(MakeOk());
}

// ---------------- Recipe Center ----------------
void PortalRouterHandler::HandleRecipeCenterSave(Browser b, Payload p,
                                                 Callback cb) {
  if (!p.get() || !p->HasKey("data")) {
    cb->Success(MakeErr("no data"));
    return;
  }
  std::string jsonStr = p->GetString("data").ToString();

  std::ofstream ofs("Config\\RecipeCenter.json");
  if (ofs.is_open()) {
    ofs << jsonStr;
    ofs.close();
    cb->Success(MakeOk());
  } else {
    cb->Success(
        MakeErr("Failed to open Config\\RecipeCenter.json for writing"));
  }
}

void PortalRouterHandler::HandleRecipeCenterLoad(Browser b, Payload p,
                                                 Callback cb) {
  std::ifstream ifs("Config\\RecipeCenter.json");
  if (ifs.is_open()) {
    std::string jsonStr((std::istreambuf_iterator<char>(ifs)),
                        std::istreambuf_iterator<char>());
    ifs.close();

    auto res = CefDictionaryValue::Create();
    res->SetBool("ok", true);
    res->SetString("data", jsonStr);
    cb->Success(DictToJson(res));
  } else {
    // If not found, return empty data or specific error.
    auto res = CefDictionaryValue::Create();
    res->SetBool("ok", false);
    res->SetString("error", "File not found");
    cb->Success(DictToJson(res));
  }
}

// ---------------- Color Preset Library ----------------
// 프로젝트 레시피 파일과 무관하게 재사용 가능한 이름 붙은 색상 프리셋 목록을 저장한다.
// RecipeCenter와 동일하게 Config 폴더에 JSON 문자열 그대로 저장/로드한다.
void PortalRouterHandler::HandlePresetLibrarySave(Browser b, Payload p,
                                                  Callback cb) {
  if (!p.get() || !p->HasKey("data")) {
    cb->Success(MakeErr("no data"));
    return;
  }
  std::string jsonStr = p->GetString("data").ToString();

  std::ofstream ofs("Config\\ColorPresetLibrary.json");
  if (ofs.is_open()) {
    ofs << jsonStr;
    ofs.close();
    cb->Success(MakeOk());
  } else {
    cb->Success(
        MakeErr("Failed to open Config\\ColorPresetLibrary.json for writing"));
  }
}

void PortalRouterHandler::HandlePresetLibraryLoad(Browser b, Payload p,
                                                  Callback cb) {
  std::ifstream ifs("Config\\ColorPresetLibrary.json");
  if (ifs.is_open()) {
    std::string jsonStr((std::istreambuf_iterator<char>(ifs)),
                        std::istreambuf_iterator<char>());
    ifs.close();

    auto res = CefDictionaryValue::Create();
    res->SetBool("ok", true);
    res->SetString("data", jsonStr);
    cb->Success(DictToJson(res));
  } else {
    auto res = CefDictionaryValue::Create();
    res->SetBool("ok", false);
    res->SetString("error", "File not found");
    cb->Success(DictToJson(res));
  }
}

// ---------------- Logs ----------------
void PortalRouterHandler::HandleLogWrite(Browser b, Payload p, Callback cb) {
  std::string level =
      p->HasKey("level") ? p->GetString("level").ToString() : "INFO";
  std::string source =
      p->HasKey("source") ? p->GetString("source").ToString() : "Frontend";
  std::string message =
      p->HasKey("message") ? p->GetString("message").ToString() : "";

  LogManager::Instance().Write(level, source, message);
  cb->Success(MakeOk());
}

// ---------------- HandleConfigGetLaser ----------------
void PortalRouterHandler::HandleConfigGetLaser(Browser b, Payload p,
                                               Callback cb) {
  WORK_1([cb]() {
    // Read from INI_PMAC
    CString section = _T("COMMON_CMD");

    auto d = CefDictionaryValue::Create();

    // Basic attributes required by Parameter UI schema (dummy except shutter)
    d->SetBool("enabled", true);

    CString shutterVal;
    CString shutterAddr =
        INI_PMAC.GetString(section, _T("LASER_CTRL_SELECTOR"));
    if (!shutterAddr.IsEmpty()) {
      g_PMAC.Read(shutterAddr, shutterVal);
    }

    if (shutterVal.IsEmpty()) {
      shutterVal = _T("2"); // default OFF
    }

    d->SetInt("shutter", _ttoi(shutterVal));

    cb->Success(PortalRouterHandler::DictToJson(d));
  });
}

// ---------------- HandleConfigSetLaser ----------------
void PortalRouterHandler::HandleConfigSetLaser(Browser b, Payload p,
                                               Callback cb) {
  if (!p || !p->HasKey("data")) {
    cb->Failure(400, "Missing data object");
    return;
  }

  auto data = p->GetDictionary("data");
  int shutterVal = data->HasKey("shutter") ? data->GetInt("shutter") : -1;

  WORK_1([shutterVal, cb]() {
    if (shutterVal <= 0) {
      cb->Success(MakeOk());
      return;
    }

    if (MachineProfile::Instance().GetMotion() == "PMAC") {
      CString section = _T("COMMON_CMD");
      CString shutterAddr = INI_PMAC.GetString(section, _T("LASER_SHUTTER"));
      CString selectorAddr =
          INI_PMAC.GetString(section, _T("LASER_CTRL_SELECTOR"));

      if (shutterVal == 1) { // Shutter ON sequence
        if (!selectorAddr.IsEmpty())
          g_PMAC.Write(selectorAddr, _T("2"));
        if (!shutterAddr.IsEmpty())
          g_PMAC.Write(shutterAddr, _T("1"));
      } else if (shutterVal == 2) { // Shutter OFF sequence
        if (!shutterAddr.IsEmpty())
          g_PMAC.Write(shutterAddr, _T("2"));
        if (!selectorAddr.IsEmpty())
          g_PMAC.Write(selectorAddr, _T("1"));
      }
    } else if (MachineProfile::Instance().HasZeroG()) {
      BOOL OnOff = shutterVal == 1 ? TRUE : FALSE;
      g_ZeroG.LaserShutter(OnOff);
    }
    cb->Success(MakeOk());
  });
}

// ---------------- HandleConfigGetScanner ----------------
void PortalRouterHandler::HandleConfigGetScanner(Browser b, Payload p,
                                                 Callback cb) {
  WORK_1([cb]() {
    auto d = CefDictionaryValue::Create();
    if (MachineProfile::Instance().GetScanner() == "SinoGalvo") {
      auto &gc = SinoGalvoController::Instance();
      gc.LoadConfig();

      d->SetDouble("hRatio", gc.m_HRatio);
      d->SetDouble("vRatio", gc.m_VRatio);
      d->SetDouble("barrelDistortionX", gc.m_barrelDistortionX);
      d->SetDouble("barrelDistortionY", gc.m_barrelDistortionY);
      d->SetDouble("trapezoidalDistortionX", gc.m_trapezoidalDistortionX);
      d->SetDouble("trapezoidalDistortionY", gc.m_trapezoidalDistortionY);
      d->SetDouble("parallelogramDistortionX", gc.m_parallelogramDistortionX);
      d->SetDouble("parallelogramDistortionY", gc.m_parallelogramDistortionY);

      d->SetDouble("workSize", gc.m_workSize);

      d->SetBool("bXYExchange", gc.m_bXYExchange);
      d->SetBool("bXAxisN", gc.m_bXAxisN);
      d->SetBool("bYAxisN", gc.m_bYAxisN);
    } else if (MachineProfile::Instance().GetScanner() == "Scanlab") {
      auto &sc = ScanlabController::Instance();
      sc.LoadConfig();

      d->SetDouble("workSize", sc.GetWorkSize());
      d->SetDouble("markSpeed", sc.GetMarkSpeed());
      d->SetDouble("jumpSpeed", sc.GetJumpSpeed());

      d->SetBool("bXYExchange", sc.GetXYExchange());
      d->SetBool("bXAxisN", sc.GetXAxisN());
      d->SetBool("bYAxisN", sc.GetYAxisN());

      d->SetInt("rtcVersion", sc.GetRtcVersion());
      d->SetInt("cardNo", sc.GetCardNo());
      d->SetString("programFile", sc.GetProgramFile());
      d->SetString("correctionFile", sc.GetCorrectionFile());
      d->SetString("wavelength", sc.GetWavelength());

      double activeKFactor = 0.0;
      if (g_Scanner) {
        ScanlabController* pActiveSc = dynamic_cast<ScanlabController*>(g_Scanner.get());
        if (pActiveSc) {
          activeKFactor = pActiveSc->GetActiveKFactor();
        }
      }
      if (activeKFactor <= 0.0) {
        activeKFactor = sc.GetActiveKFactor();
        if (activeKFactor <= 0.0) {
          activeKFactor = 1048576.0 / sc.GetWorkSize();
        }
      }
      d->SetDouble("activeKFactor", activeKFactor);

      d->SetInt("laserMode", sc.GetLaserMode());
      d->SetInt("laserControl", sc.GetLaserControl());

      // Realtime Hardware Diagnostics (Query from active g_Scanner)
      unsigned int dllVer = 0, hexVer = 0, rtcVerNo = 0, serialNo = 0;
      if (g_Scanner) {
        ScanlabController* pActiveSc = dynamic_cast<ScanlabController*>(g_Scanner.get());
        if (pActiveSc) {
          dllVer = pActiveSc->GetDllVersion();
          hexVer = pActiveSc->GetHexVersion();
          rtcVerNo = pActiveSc->GetRtcVersionNumber();
          serialNo = pActiveSc->GetSerialNumber();
        }
      }

      d->SetInt("dllVersion", dllVer);
      d->SetInt("hexVersion", hexVer);
      d->SetInt("rtcVersionNo", rtcVerNo);
      d->SetInt("serialNumber", serialNo);
    }

    auto res = CefDictionaryValue::Create();
    res->SetBool("ok", true);
    res->SetDictionary("data", d);

    cb->Success(PortalRouterHandler::DictToJson(res));
  });
}

// ---------------- HandleConfigSetScanner ----------------
void PortalRouterHandler::HandleConfigSetScanner(Browser b, Payload p,
                                                 Callback cb) {
  if (!p || !p->HasKey("data")) {
    cb->Failure(400, "Missing data object");
    return;
  }

  auto data = p->GetDictionary("data");

  if (MachineProfile::Instance().GetScanner() == "SinoGalvo") {
    double hRatio = GetSafeDouble(data, "hRatio");
    double vRatio = GetSafeDouble(data, "vRatio");
    double barrelX = GetSafeDouble(data, "barrelDistortionX");
    double barrelY = GetSafeDouble(data, "barrelDistortionY");
    double trapX = GetSafeDouble(data, "trapezoidalDistortionX");
    double trapY = GetSafeDouble(data, "trapezoidalDistortionY");
    double paraX = GetSafeDouble(data, "parallelogramDistortionX");
    double paraY = GetSafeDouble(data, "parallelogramDistortionY");
    double workSize = GetSafeDouble(data, "workSize");

    bool bXYExchange = data->GetBool("bXYExchange");
    bool bXAxisN = data->GetBool("bXAxisN");
    bool bYAxisN = data->GetBool("bYAxisN");

    WORK_1([hRatio, vRatio, barrelX, barrelY, trapX, trapY, paraX, paraY,
            workSize, bXYExchange, bXAxisN, bYAxisN, cb]() {
      auto &gc = SinoGalvoController::Instance();

      gc.m_HRatio = hRatio;
      gc.m_VRatio = vRatio;
      gc.m_barrelDistortionX = barrelX;
      gc.m_barrelDistortionY = barrelY;
      gc.m_trapezoidalDistortionX = trapX;
      gc.m_trapezoidalDistortionY = trapY;
      gc.m_parallelogramDistortionX = paraX;
      gc.m_parallelogramDistortionY = paraY;
      gc.m_workSize = workSize;

      gc.m_bXYExchange = bXYExchange;
      gc.m_bXAxisN = bXAxisN;
      gc.m_bYAxisN = bYAxisN;

      bool ok = gc.SaveConfig();
      if (ok && gc.IsOpen()) {
          gc.SetDefaultCorrectionSet();
          gc.SetDefaultParameters(gc.GetMarkSpeed(), gc.GetJumpSpeed());
      }
      cb->Success(ok ? MakeOk() : MakeErr("Failed to save GalvoConfig.json"));
    });
  } else if (MachineProfile::Instance().GetScanner() == "Scanlab") {
    double workSize = GetSafeDouble(data, "workSize");
    double markSpeed = GetSafeDouble(data, "markSpeed");
    double jumpSpeed = GetSafeDouble(data, "jumpSpeed");

    bool bXYExchange = data->GetBool("bXYExchange");
    bool bXAxisN = data->GetBool("bXAxisN");
    bool bYAxisN = data->GetBool("bYAxisN");

    int rtcVersion = data->GetInt("rtcVersion");
    int cardNo = data->GetInt("cardNo");
    std::string programFile = data->GetString("programFile").ToString();
    std::string correctionFile = data->GetString("correctionFile").ToString();
    std::string wavelength = data->HasKey("wavelength") ? data->GetString("wavelength").ToString() : "IR_1064";
    double kFactor = GetSafeDouble(data, "kFactor");
    int laserMode = data->GetInt("laserMode");
    int laserControl = data->GetInt("laserControl");

    WORK_1([workSize, markSpeed, jumpSpeed, bXYExchange, bXAxisN, bYAxisN,
            rtcVersion, cardNo, programFile, correctionFile, wavelength, kFactor, laserMode, laserControl, cb]() {
      auto &sc = ScanlabController::Instance();

      sc.SetWorkSize(workSize);
      sc.SetMarkSpeed(static_cast<float>(markSpeed));
      sc.SetJumpSpeed(static_cast<float>(jumpSpeed));

      sc.SetXYExchange(bXYExchange);
      sc.SetXAxisN(bXAxisN);
      sc.SetYAxisN(bYAxisN);

      sc.SetRtcVersion(rtcVersion);
      sc.SetCardNo(cardNo);
      sc.SetProgramFile(programFile);
      sc.SetCorrectionFile(correctionFile);
      sc.SetWavelength(wavelength);
      sc.SetLaserMode(laserMode);
      sc.SetLaserControl(laserControl);

      bool ok = sc.SaveConfig();
      cb->Success(ok ? MakeOk() : MakeErr("Failed to save ScanlabConfig.json"));
    });
  }
}

// ---------------- Aurelia Laser Handlers ----------------

void PortalRouterHandler::HandleAureliaPower(Browser b, Payload p,
                                             Callback cb) {
  bool on = p->HasKey("on") ? p->GetBool("on") : false;
  WORK_1([on, cb]() {
    if (on)
      AureliaController::Instance().TurnOn();
    else
      AureliaController::Instance().TurnOff();
    cb->Success(MakeOk());
  });
}

void PortalRouterHandler::HandleAureliaShutter(Browser b, Payload p,
                                               Callback cb) {
  bool open = p->HasKey("open") ? p->GetBool("open") : false;
  WORK_1([open, cb]() {
    if (open)
      AureliaController::Instance().OpenShutter();
    else
      AureliaController::Instance().CloseShutter();
    cb->Success(MakeOk());
  });
}

void PortalRouterHandler::HandleAureliaSetParams(Browser b, Payload p,
                                                 Callback cb) {
  int prf = p->HasKey("prf") ? p->GetInt("prf") : -1;
  float amp = p->HasKey("amp") ? (float)GetSafeDouble(p, "amp", -1.0) : -1.0f;
  int burst = p->HasKey("burst") ? p->GetInt("burst") : -1;
  int pw = p->HasKey("pw") ? p->GetInt("pw") : -1;
  int mode = p->HasKey("mode") ? p->GetInt("mode") : -1;

  WORK_1([prf, amp, burst, pw, mode, cb]() {
    if (prf >= 0)
      AureliaController::Instance().SetFrequency(prf);
    if (amp >= 0)
      AureliaController::Instance().SetPower(amp);
    if (burst >= 0)
      AureliaController::Instance().SetBurst(burst);
    if (pw >= 0)
      AureliaController::Instance().SetPulseWidth(pw);
    if (mode >= 0)
      AureliaController::Instance().SetControlMode(mode);
    cb->Success(MakeOk());
  });
}

void PortalRouterHandler::HandleAureliaSave(Browser b, Payload p, Callback cb) {
  // Currently AureliaController doesn't have a specific Save method in the
  // interface, but we can add one if hardware supports persistent saving via
  // Modbus.
  cb->Success(MakeOk());
}
