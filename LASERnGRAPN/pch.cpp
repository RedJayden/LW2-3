#include "pch.h"
#include "Modules\Motor\PMAC\PMACMotor.h"

// PMAC 관련 설정 파일 로드
CIniFile INI_PMAC(_T(".\\Config\\PmacConfig.ini"));
CIniFile INI_MOONS(_T(".\\Config\\MoonsConfig.ini"));
CIniFile INI_FASTECH(_T(".\\Config\\FastechConfig.ini"));
CIniFile INI_ZEROG(_T(".\\Config\\ZeroGConfig.ini"));

PMAC g_PMAC;
SCLLibHelper g_MoonsHelper;

Motor g_X;
Motor g_Y;
Motor g_Z;
Motor g_Mirror;
Motor g_Lens;

GCode g_GCode(&g_PMAC);

std::map<CString, Motor*> g_AxisMap = { {_T("X"), &g_X},
										 {_T("Y"), &g_Y},
										 {_T("Z"), &g_Z} };

// 스캐너 객체 정의 (unique_ptr)
std::unique_ptr<IScannerController> g_Scanner;

ZeroG g_ZeroG;