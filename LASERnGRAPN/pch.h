#pragma once

#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

// 모든 Windows 및 MFC 관련 헤더를 먼저 포함합니다.
#include <ShlObj.h>  // BROWSEINFO, SHBrowseForFolder
#include <Shlwapi.h> // PathRemoveFileSpec, PathAddBackslash, PathFileExists
#include <afxdlgs.h> // CFileDialog
#include <afxwin.h>  // CString, CWnd
#include <shellapi.h>
#include <windows.h>

// 나머지 표준 라이브러리 및 다른 헤더들을 포함합니다.
#include <functional>
#include <map>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

// 프로젝트 공통 유틸리티 (매우 중요: CSPtr, SyncMap 등이 여기에 정의됨)
#include "Shared\Util\UtilCommon.h"

// 모터 관련 기본 클래스
#include "Modules\Motor\Base\Motor.h"

// 구체적인 모터 구현 및 컨트롤러
#include "Modules/Motor/PMAC/Power_PMAC/Include/PMAC.h"
#include "Modules\Motor\Moons'\MoonsMotor.h"
#include "Modules\Motor\Moons'\include\SCLLibHelper.h"
#include "Modules\Motor\PMAC\PMACMotor.h"
#include "Modules\Motor\Fastech\FastechMotor.h"
#include "Modules\Motor\TestMotor\TestMotor.h"

// ZeroG 보드 제어 클래스
#include "Modules/IO_Control/ZeroG/ZeroG.h"


// 상위 레이어 로직
#include "Modules/Motor/GCode/GCode.h"

// 스캐너 라이브러리
#include "Modules/Scanner/IScannerController.h"

#pragma comment(lib, "Shlwapi.lib")

//-----------------------------------------------
extern CIniFile INI_PMAC;
extern CIniFile INI_MOONS;
extern CIniFile INI_FASTECH;
extern CIniFile INI_ZEROG;

extern PMAC g_PMAC;
extern SCLLibHelper g_MoonsHelper;

extern Motor g_X;
extern Motor g_Y;
extern Motor g_Z;
extern Motor g_Mirror;
extern Motor g_Lens;

extern GCode g_GCode;

extern std::map<CString, Motor *> g_AxisMap;
//-----------------------------------------------

// 스캐너 객체 (동적 생명주기 관리를 위해 unique_ptr 사용)
extern std::unique_ptr<IScannerController> g_Scanner;

extern ZeroG g_ZeroG;