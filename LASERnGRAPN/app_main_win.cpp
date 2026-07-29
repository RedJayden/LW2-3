#include "pch.h"

// Copyright (c) 2013 The Chromium Embedded Framework Authors. All rights
// reserved. Use of this source code is governed by a BSD-style license that
// can be found in the LICENSE file.

// CEF
#include "include/cef_command_line.h"
#include "include/cef_sandbox_win.h"
#include "include/cef_version_info.h"
#include "render_app.h"
#include "simple_app.h"

// 공통 유틸리티 초기화
#include "Core/AppInitial/AppBootstrap.h"
#include "Core/AppInitial/DevtoolsKeyBlocker.h"
#include "Native/ui/cef/CefInit.h"
#include "Native/ui/cef/CefLog.h"

// #include "VisionTester.h"
#include "Modules/Motor/PMAC/Power_PMAC/Include/PowerPmac.h"
#include "simple_handler.h"
// Shlobj.h 헤더를 추가하여 SHGetFolderPathW 함수를 사용
#include <Shlobj.h>
#include <string>

#include "Native/ui/cef/AppSchemeFactory.h"

// MC1/MC2 머신 타입 판별
#include "Core/MachineType.h"
#include "Core/MachineProfile.h"

#include "Modules/Scanner/SinoGalvo/Base/SinoGalvoController.h"
#include "Modules/Scanner/ScanLab/Base/ScanlabController.h"

// 카메라 영상 테스트
// #include "VisionTester.h"

namespace {
	int RunMain(HINSTANCE hInstance, LPTSTR lpCmdLine, int nCmdShow,
		void* sandbox_info) {
		// 0) 프로세스 전체 특수키 차단 시작
		//        InstallGlobalKeyBlocker();

		// 공용 컨트롤 초기화 (클래식 컨트롤)
		INITCOMMONCONTROLSEX icc{ sizeof(icc), ICC_WIN95_CLASSES };
		InitCommonControlsEx(&icc);

		CefMainArgs main_args(hInstance);

		// 1) 커맨드라인 파싱 및 서브프로세스 진입
		CefRefPtr<CefCommandLine> command_line = CefCommandLine::CreateCommandLine();
		command_line->InitFromString(::GetCommandLineW());
		const CefString process_type = command_line->GetSwitchValue("type");

		// 서브프로세스용 app 선택 (renderer 등)
		CefRefPtr<CefApp> app_sub;
		if (process_type == "renderer") {
			app_sub = new RenderApp(); // 렌더러 프로세스
		}
		else {
			app_sub = nullptr; // 기타 서브프로세스: 기본 처리
		}



		// 서브프로세스 실행
		int exit_code = CefExecuteProcess(main_args, app_sub, sandbox_info);
		if (exit_code >= 0) {
			AppBootstrap::UninstallGlobalKeyBlockerSafe();
			return exit_code;
		}

		// 2) 브라우저 프로세스용 App
		CefRefPtr<SimpleApp> app_browser(new SimpleApp);

		// 3) CEF 설정
		CefSettings settings;
		// 2. 샌드박스는 비활성화
		settings.no_sandbox = true;
		// 3. Windowless Rendering 비활성화
		// settings.windowless_rendering_enabled = false;

		// 4. 메시지 루프를 직접 실행하므로 멀티 스레드 메시지 루프를 끕니다.
		// settings.multi_threaded_message_loop = false;

		// 디버깅 로그 설정
		InitCefSettings(settings);

		// [FIX] 작동에 무관한 구글 API (GCM) 경고 등 잡다한 에러 로그 완전 차단
		settings.log_severity = LOGSEVERITY_FATAL;

		/*
		// =============== 디버깅 로그 설정 추가 ===============
		wchar_t path_buffer[MAX_PATH];
		// 사용자의 로컬 AppData 경로를 얻어옵니다 (예:
		C:\Users\사용자이름\AppData\Local)
		// 윈도우 탐색기에 "%LOCALAPPDATA%\LW-Portal" 입력하면 debug.log 볼 수 있다.
		if (SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, 0,
		path_buffer))) {
				// 우리 앱 전용 폴더 경로를 만듭니다.
				std::wstring app_data_path = path_buffer;
				app_data_path += L"\\LASERnGRAPN"; // 앱 이름에 맞게 수정 가능

				// 폴더가 없으면 생성합니다.
				CreateDirectoryW(app_data_path.c_str(), NULL);

				// 1. 캐시 경로를 설정합니다 (WARNING 해결)
				std::wstring cache_path = app_data_path + L"\\cache";
				CefString(&settings.root_cache_path) = cache_path;

				// 2. 로그 파일 경로를 절대 경로로 설정합니다 (ERROR 해결)
				std::wstring log_path = app_data_path + L"\\debug.log";
				CefString(&settings.log_file) = log_path;
				settings.log_severity = LOGSEVERITY_VERBOSE;
		}
		// ====================================================
		*/

		// CEF 초기화
		if (!CefInitialize(main_args, settings, app_browser.get(), sandbox_info)) {
			AppBootstrap::UninstallGlobalKeyBlockerSafe();
			return CefGetExitCode();
		}

		// Bin 폴더 내부에 있는 VisionModule.dll 사용
		wchar_t exePath[MAX_PATH];
		GetModuleFileNameW(nullptr, exePath, MAX_PATH);

		std::wstring exeDir(exePath);
		exeDir = exeDir.substr(0, exeDir.find_last_of(L"\\/"));

		// DLL 파일 로드
		std::wstring dllPath = exeDir + L"\\VisionModule.dll";

		// 4) VisionBridge + CEF 스킴 등록 (CefInitialize 이후)
		// - COM -> VisionBridge 초기화 -> RegisterAppSchemeHandler 스킴 핸들러 등록
		AppBootstrap::InitVisionaAndScheme(dllPath, /*camIndex=*/0);

		// 카메라 영상 출력 테스트
		// RunVisionTest(0); // 0=dummy,1=Hik, 2=Object

		Invoke::Init();

		WORK_1([]() {
			if (MachineProfile::Instance().GetMotion() == "Fastech") {
				// Fastech 모션 사용
				g_X.SetInstance(std::make_unique<FastechMotor>(_T("X")));
				g_Y.SetInstance(std::make_unique<FastechMotor>(_T("Y")));
				// g_Z.SetInstance(std::make_unique<FastechMotor>(_T("Z")));
				g_Z.SetInstance(std::make_unique<TestMotor>());

				FastechUtil::SetParameter(_T("X"), g_X);
				FastechUtil::SetParameter(_T("Y"), g_Y);
				FastechUtil::SetParameter(_T("Z"), g_Z);

				g_X.Connect();
				g_Y.Connect();
				g_Z.Connect();

				g_X.Servo(TRUE);
				g_Y.Servo(TRUE);
				g_Z.Servo(TRUE);

				if (MachineProfile::Instance().HasZeroG()) {
					g_ZeroG.OpenPort(INI_ZEROG.GetInt(_T("CONNECT"), _T("COM")));
				}
			}
			else if (MachineProfile::Instance().GetMotion() == "PMAC") {
				// PMAC 모션 사용
				g_X.SetInstance(std::make_unique<PMACMotor>(_T("X"), &g_PMAC));
				g_Y.SetInstance(std::make_unique<PMACMotor>(_T("Y"), &g_PMAC));
				g_Z.SetInstance(std::make_unique<PMACMotor>(_T("Z"), &g_PMAC));

				// Moons Mirror 모터 초기화 (Mirror 모터 탑재 시), Moons 미러 모터 사용
				g_Mirror.SetInstance(std::make_unique<MoonsMotor>(&g_MoonsHelper));
			}

			if (MachineProfile::Instance().GetMotion() == "PMAC") {
				// MC1: Lens 모터 초기화 (Lens 모터 탑재 시), Moons 렌즈 모터 사용
				if (MachineProfile::Instance().HasLensMotor()) {
					g_Lens.SetInstance(std::make_unique<MoonsMotor>(&g_MoonsHelper));
				}

				g_PMAC.Connect(INI_PMAC.GetString(_T("MOTOR"), _T("IP")));

				PMACUtil::SetParameter(_T("X"), g_X);
				PMACUtil::SetParameter(_T("Y"), g_Y);
				PMACUtil::SetParameter(_T("Z"), g_Z);
				if (MachineProfile::Instance().HasLensMotor()) {
					MoonsUtil::SetParameter(_T("LENS"), g_Lens);
				}
				MoonsUtil::SetParameter(_T("MIRROR"), g_Mirror);

				g_X.Servo(TRUE);
				g_Y.Servo(TRUE);
				g_Z.Servo(TRUE);

				// Mirror 와 Lens 모터에 전원을 인가하는 PMAC 명령어
				g_PMAC.Write(_T("MtrMirror_OnOff=1"));
				if (MachineProfile::Instance().HasLensMotor()) {
					g_PMAC.Write(_T("MtrObject_OnOff=1"));
				}

				if (MachineProfile::Instance().HasLensMotor()) {
					MoonsUtil::TryMirrorInitialze(g_Lens, g_PMAC, 10);
				}
				MoonsUtil::TryMirrorInitialze(g_Mirror, g_PMAC, 10);

				if (MachineProfile::Instance().HasLensMotor()) {
					g_Lens.Connect();
				}
				g_Mirror.Connect();
				g_Mirror.Servo(TRUE);
				if (MachineProfile::Instance().HasLensMotor()) {
					g_Lens.Servo(TRUE);
				}
				g_Mirror.Connect();
				g_Mirror.Servo(TRUE);

				// Laser Control Global Initialization
				// PMAC에서 Object모드에서 Dot 도형 싱글 펄스 가공 관련 설정 (GCode 사용)
				CString selAddr =
					INI_PMAC.GetString(_T("COMMON_CMD"), _T("LASER_CTRL_SELECTOR"));
				if (!selAddr.IsEmpty())
					g_PMAC.Write(selAddr, _T("1"));

				CString ttlAddr =
					INI_PMAC.GetString(_T("COMMON_CMD"), _T("TTL_OUTPUT_TIME"));
				if (!ttlAddr.IsEmpty())
					g_PMAC.Write(ttlAddr, _T("20"));

				CString shutAddr =
					INI_PMAC.GetString(_T("COMMON_CMD"), _T("LASER_SHUTTER"));
				if (!shutAddr.IsEmpty())
					g_PMAC.Write(shutAddr, _T("2"));
			}

			// Scanner 연결 (활성화 시에만 로드)
			if (MachineProfile::Instance().UseScanner())
			{
				// 시노 갈보 사용
				if (MachineProfile::Instance().GetScanner() == "SinoGalvo")
				{
					g_Scanner = std::make_unique<SinoGalvoController>();
					bool bScannerConnected = g_Scanner->IsOpen();
					if (!bScannerConnected)
					{
						g_Scanner->OpenDevice();
						g_Scanner->Cancel();
					}
				}
				else if (MachineProfile::Instance().GetScanner() == "Scanlab")
				{
					g_Scanner = std::make_unique<ScanlabController>();
					bool bScannerConnected = g_Scanner->IsOpen();
					if (!bScannerConnected)
					{
						g_Scanner->OpenDevice();
						g_Scanner->Cancel();
					}
				}
			}
			});


		// 5) 메시지 루프 실행
		CefRunMessageLoop();

		// 6) 종료
		if (MachineProfile::Instance().GetMotion() == "PMAC") {
			g_Mirror.Servo(FALSE);
			if (MachineProfile::Instance().HasLensMotor()) {
				g_Lens.Servo(FALSE);
			}
			g_PMAC.Close();
		}

		// scanner 닫기
		if (g_Scanner && g_Scanner->IsOpen())
			g_Scanner->CloseDevice();
		g_Scanner.reset();

		AppBootstrap::ShutdownVision();

		// 스레드풀을 CEF 종료 전에 먼저 정리하여 댕글링 참조 방지
		Invoke::Release(1000);
		CefShutdown();

		// 프로세스 전체 특수키 차단 해제
		AppBootstrap::UninstallGlobalKeyBlockerSafe();

		return 0;
	}

} // namespace

#if defined(CEF_USE_BOOTSTRAP)
CEF_BOOTSTRAP_EXPORT int RunWinMain(HINSTANCE hInstance, LPTSTR lpCmdLine,
	int nCmdShow, void* sandbox_info,
	cef_version_info_t*) {
	return ::RunMain(hInstance, lpCmdLine, nCmdShow, sandbox_info);
}
#else
int APIENTRY wWinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance,
	LPTSTR lpCmdLine, int nCmdShow) {
	UNREFERENCED_PARAMETER(hPrevInstance);
	UNREFERENCED_PARAMETER(lpCmdLine);

#if defined(ARCH_CPU_32_BITS)
	const int exit_code = CefRunWinMainWithPreferredStackSize(
		wWinMain, hInstance, lpCmdLine, nCmdShow);
	if (exit_code >= 0)
		return exit_code;
#endif

	void* sandbox_info = nullptr;
#if defined(CEF_USE_SANDBOX)
	CefScopedSandboxInfo scoped_sandbox;
	sandbox_info = scoped_sandbox.sandbox_info();
#endif

	return ::RunMain(hInstance, lpCmdLine, nCmdShow, sandbox_info);
}
#endif // !defined(CEF_USE_BOOTSTRAP)