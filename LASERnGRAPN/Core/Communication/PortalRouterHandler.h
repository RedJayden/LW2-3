#pragma once

#include <atomic>
#include <functional>
#include <mutex>
#include <sstream>
#include <string_view>
#include <thread>
#include <unordered_map>

#include "include/cef_values.h"
#include "include/wrapper/cef_message_router.h"

using QueryIdT = long long;

class PortalRouterHandler final : public CefMessageRouterBrowserSide::Handler {
private:
	using Browser = CefRefPtr<CefBrowser>;
	using Payload = CefRefPtr<CefDictionaryValue>;
	using Callback = CefRefPtr<CefMessageRouterBrowserSide::Callback>;
	using HandlerFunc = std::function<void(Browser, Payload, Callback)>;

public:
	PortalRouterHandler();
	~PortalRouterHandler() override;

	bool
		OnQuery(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
			QueryIdT query_id, const CefString& request, bool persistent,
			CefRefPtr<CefMessageRouterBrowserSide::Callback> callback) override;

	void OnQueryCanceled(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
		QueryIdT query_id) override;

	void AddRef() const;
	bool Release() const;
	bool HasOneRef() const;
	bool HasAtLeastOneRef() const;

private:
	void InitializeCommandMap();
	void Add(std::string_view channel, HandlerFunc fn);
	HWND GetTopLevelWindow(CefRefPtr<CefBrowser> browser);

	// --- [NEW] Background Polling & Caching ---
	struct MotionStatusCache {
		double x = 0, y = 0, z = 0;
		bool servoX = false, servoY = false, servoZ = false;
		bool homedX = false, homedY = false, homedZ = false;
		bool alarmX = false, alarmY = false, alarmZ = false;
		std::string alarmReasonX = "None", alarmReasonY = "None", alarmReasonZ = "None";
		int servoStateX = 0, servoStateY = 0, servoStateZ = 0;
		int alarmResetStateX = 0, alarmResetStateY = 0, alarmResetStateZ = 0;
		bool emo = false;
		bool commError = false;
		std::string commErrorMessage = "";
		int homingAll = 0, homingX = 0, homingY = 0, homingZ = 0;

		bool scannerConnected = false;
		unsigned int scannerHeadStatus = 0;
		unsigned int scannerInitStatus = 0;

		// [Safety] Detail Info
		bool interlockTriggered = false;
		std::string safetyMessage = "";
		std::string errorAxis = "";
		double errorValue = 0;
		double errorLimit = 0;
	};

	void StartPolling();
	void StopPolling();
	void PollingLoop();
		void PollingLoopMachineType1or2();
		void PollingLoopMachineType3();

	MotionStatusCache m_MotionCache;
	std::mutex m_CacheMutex;
	std::string m_AureliaStatusJson = "{\"connected\": false}";
	std::mutex m_AureliaCacheMutex;
	std::thread m_PollingThread;
	std::atomic<bool> m_StopPolling{ false };
	bool m_isMainOpened = false;
	bool m_bEMOTriggered = false;
	bool m_bInterlockTriggered = false;

	// [FIX] Persistent "homing in progress" flags per axis, set when a home command
	// is issued and cleared only on real completion (HOME_DONE_BIT) or cancel.
	// The raw PMAC homing register (MotionStatusCache::homingX/Y/Z) is transient and
	// does not reliably stay at a single "in progress" value for the whole homing
	// routine, so it cannot be used to gate the software interlock check.
	std::atomic<bool> m_bHomingX{ false };
	std::atomic<bool> m_bHomingY{ false };
	std::atomic<bool> m_bHomingZ{ false };

	// ----- Handlers -----
	// HW & UI
	void HandleHwStartInit(Browser, Payload, Callback);
	void HandleHwGetProgress(Browser, Payload, Callback);
	void HandleUiGetTheme(Browser, Payload, Callback);
	void HandleUiSetTheme(Browser, Payload, Callback);

	// App & Window
	void HandleAppOpenMain(Browser, Payload, Callback);
	void HandleAppQuit(Browser, Payload, Callback);
	void HandleWindowMinimize(Browser, Payload, Callback);
	void HandleWindowMaximizeToggle(Browser, Payload, Callback);
	void HandleWindowClose(Browser, Payload, Callback);
	void HandleWindowDrag(Browser, Payload, Callback);

	// Camera
	void HandleCameraStart(Browser, Payload, Callback);
	void HandleCameraStop(Browser, Payload, Callback);
	void HandleCameraGetRange(Browser, Payload, Callback);
	void HandleCameraSetParams(Browser, Payload, Callback);

	// motion
	void HandleMotionAllHome(Browser, Payload, Callback);
	void HandleMotionHome(Browser, Payload, Callback);
	void HandleMotionCancelHome(Browser, Payload, Callback);
	void HandleMotionJogStart(Browser, Payload, Callback);
	void HandleMotionJogStop(Browser, Payload, Callback);
	void HandleMotionMoveRel(Browser, Payload, Callback);
	void HandleMotionMoveAbs(Browser, Payload, Callback);
	void HandleMotionStop(Browser, Payload, Callback);
	void HandleMotionGetPosition(Browser, Payload, Callback);
	void HandleMotionSetServo(Browser, Payload, Callback);
	void HandleMotionResetAlarm(Browser, Payload, Callback);
	void HandleFastechAlarmReset(Browser, Payload, Callback);
	void HandleMotionSetSpeed(Browser, Payload, Callback);

	// GCode
	std::atomic<bool> bFlagMtGetPosition{ true }; 
	std::atomic<bool> m_isGetPositionPolling{ false }; 
	void HandleGCodeWrite(Browser, Payload, Callback);
	void HandleGcodeRun(Browser, Payload, Callback);
	void HandleGcodeStatus(Browser, Payload, Callback);

	// Moons Preset
	void HandleMoonsGetPresets(Browser, Payload, Callback);

	// Scanner Handlers
	void HandleScannerGenerate(Browser, Payload, Callback);
	void HandleScannerRun(Browser, Payload, Callback);

	// Dialogs
	void HandleDialogLoadImage(Browser, Payload, Callback);
	void HandleDialogSaveImage(Browser, Payload, Callback);
	void HandleDialogSaveRecipeFile(Browser, Payload, Callback);

	// Calibration
	void HandleCalibrationSave(Browser, Payload, Callback);
	void HandleCalibrationLoad(Browser, Payload, Callback);
	void HandleCalibrationList(Browser, Payload, Callback);
	void HandleCalibrationRollback(Browser, Payload, Callback);
	void HandleCalibrationDelete(Browser, Payload, Callback);

	// Camera Configuration
	void HandleConfigGetCamera(Browser, Payload, Callback);
	void HandleConfigGetMachineStatus(Browser, Payload, Callback);
	void HandleConfigSetCamera(Browser, Payload, Callback);

	// Laser Configuration
	void HandleConfigGetLaser(Browser, Payload, Callback);
	void HandleConfigSetLaser(Browser, Payload, Callback);

	// Aurelia Laser Handlers
	void HandleAureliaPower(Browser, Payload, Callback);
	void HandleAureliaShutter(Browser, Payload, Callback);
	void HandleAureliaSetParams(Browser, Payload, Callback);
	void HandleAureliaSave(Browser, Payload, Callback);

	// Scanner Configuration
	void HandleConfigGetScanner(Browser, Payload, Callback);
	void HandleConfigSetScanner(Browser, Payload, Callback);

	// Motion Configuration
	void HandleConfigGetMotion(Browser, Payload, Callback);
	void HandleConfigSetMotion(Browser, Payload, Callback);

	// Moons Configuration (Lens/Mirror)
	void HandleConfigGetMoons(Browser, Payload, Callback);
	void HandleConfigSetMoons(Browser, Payload, Callback);

	// Laser Set Center Reform
	void HandleCalibGetState(Browser, Payload, Callback);
	void HandleCalibSetViewRatio(Browser, Payload, Callback);
	void HandleCalibPickCenter(Browser, Payload, Callback);
	void HandleCalibApply(Browser, Payload, Callback);
	void HandleCalibSave(Browser, Payload, Callback);

	// Recipe Center
	void HandleRecipeCenterLoad(Browser, Payload, Callback);
	void HandleRecipeCenterSave(Browser, Payload, Callback);

	// Color Preset Library (프로젝트와 무관하게 재사용되는 전역 색상 프리셋)
	void HandlePresetLibraryLoad(Browser, Payload, Callback);
	void HandlePresetLibrarySave(Browser, Payload, Callback);

	// Logs
	void HandleLogWrite(Browser, Payload, Callback);

	// Light Control
	void HandleLightGetConfig(Browser, Payload, Callback);
	void HandleLightSetVal(Browser, Payload, Callback);
	void HandleLightSetEnable(Browser, Payload, Callback);
	void HandleLightSetMode(Browser, Payload, Callback);
	void HandleLightSave(Browser, Payload, Callback);

	struct CalibState {
		int viewRatio = 100; // 50-100
		double pixelX = 0, pixelY = 0;
		double motionX = 0, motionY = 0;
	};
	std::unordered_map<std::string, CalibState> m_CalibStates; 

	void LoadCalibState();
	void SaveCalibState();

	// ---------------- Ref counting ----------------
	static std::string MakeOk();
	static std::string MakeErr(const char* msg);
	static std::string DictToJson(CefRefPtr<CefDictionaryValue> d);

	mutable std::atomic<int> ref_count_{ 0 };
	std::unordered_map<std::string_view, HandlerFunc> command_map_;

	PortalRouterHandler(const PortalRouterHandler&) = delete;
	PortalRouterHandler& operator=(const PortalRouterHandler&) = delete;

	// 정수형과 실수형을 모두 처리 (기본값 지정 가능)
	double GetSafeDouble(Payload p, const CString& key, double defaultValue = 0.0);
};
