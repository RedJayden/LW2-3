#include "pch.h"
#include "JhcLib.h"

// 전역 핸들 선언 (주의: 싱글톤이나 단일 객체로 사용할 것을 권장)
HINSTANCE hDll = NULL;

JhcLib::JhcLib(void)
{
    // 멤버 변수 초기화 (안전장치)
    OpenDevice = NULL;
    CloseDevice = NULL;
    IsOpen = NULL;
    SChSetPWM = NULL;
    SchOutLine = NULL;
    BufStart = NULL;
    StartMarking = NULL;
    CorrectionSet = NULL;
    SchLaserOut = NULL;
    SchOutRect = NULL;
    SchOutCircle = NULL;
    SchOutArc = NULL;
    SchOutEllipse = NULL;
    SchOutEArc = NULL;
    Cancel = NULL;
    Pause = NULL;
    Resume = NULL;
    ParameterSet = NULL;
    GalvoParameterSet = NULL;
    GetMarkingState = NULL;
    GetSystemState = NULL;
    IoOut = NULL;
    MotorOut = NULL;
    SchOutPoint = NULL;

    // 1. JHCLIB.dll 동적 로드
    // 프로젝트 속성의 문자 집합 설정(Unicode/Multi-byte)에 따라 _T() 매크로가 적절히 처리함
    hDll = LoadLibrary(_T("JHCLIB.dll"));

    if (hDll)
    {
        // ---------------------------------------------------------
        // 2. 장치 연결 및 기본 제어 함수 매핑
        // ---------------------------------------------------------
        OpenDevice = (lPOpenDevice)GetProcAddress(hDll, "JHCOpenDevice");           // [cite: 16]
        CloseDevice = (lPCloseDevice)GetProcAddress(hDll, "JHCCloseDevice");        // [cite: 18]
        IsOpen = (lPIsOpen)GetProcAddress(hDll, "JHCIsOpen");                       // [cite: 18]

        // ---------------------------------------------------------
        // 3. 레이저 및 마킹 데이터 생성 함수 매핑
        // ---------------------------------------------------------
        SChSetPWM = (lPSChSetPWM)GetProcAddress(hDll, "JHCSChSetPWM");              // [cite: 19]
        SchOutLine = (lPSchOutLine)GetProcAddress(hDll, "JHCSchOutLine");           // [cite: 21]
        BufStart = (lPBufStart)GetProcAddress(hDll, "JHCBufStart");                 // [cite: 23]
        CorrectionSet = (lPCorrectionSet)GetProcAddress(hDll, "JHCCorrectionSet");  // [cite: 24]
        SchLaserOut = (lPSchLaserOut)GetProcAddress(hDll, "JHCSchLaserOut");        // [cite: 27]

        // ---------------------------------------------------------
        // 4. 도형 그리기 함수 매핑 (Line 외)
        // ---------------------------------------------------------
        SchOutRect = (lPSchOutRect)GetProcAddress(hDll, "JHCSchOutRect");           // [cite: 30]
        SchOutCircle = (lPSchOutCircle)GetProcAddress(hDll, "JHCSchOutCircle");     // [cite: 30]
        SchOutArc = (lPSchOutArc)GetProcAddress(hDll, "JHCSchOutArc");              // [cite: 32]
        SchOutEllipse = (lPSchOutEllipse)GetProcAddress(hDll, "JHCSchOutEllipse");  // [cite: 35]
        SchOutEArc = (lPSchOutEArc)GetProcAddress(hDll, "JHCSchOutEArc");           // [cite: 37]
        SchOutPoint = (lPSchOutPoint)GetProcAddress(hDll, "JHCSchOutPoint");        // [cite: 60]

        // ---------------------------------------------------------
        // 5. 프로세스 제어 (실행, 중지, 재개)
        // ---------------------------------------------------------
        StartMarking = (lPStartMarking)GetProcAddress(hDll, "JHCStartMarking");     // [cite: 49]
        Cancel = (lPCancel)GetProcAddress(hDll, "JHCCancel");                       // [cite: 39]
        Pause = (lPPause)GetProcAddress(hDll, "JHCPause");                          // [cite: 40]
        Resume = (lPResume)GetProcAddress(hDll, "JHCResume");                       // [cite: 41]

        // ---------------------------------------------------------
        // 6. 설정 및 상태 조회 함수 매핑
        // ---------------------------------------------------------
        ParameterSet = (lPParameterSet)GetProcAddress(hDll, "JHCParameterSet");           // [cite: 42]
        GalvoParameterSet = (lPGalvoParameterSet)GetProcAddress(hDll, "JHCGalvoParameterSet"); // [cite: 46]
        GetMarkingState = (lPGetMarkingState)GetProcAddress(hDll, "JHCGetMarkingState");  // [cite: 49]
        GetSystemState = (lPGetSystemState)GetProcAddress(hDll, "JHCGetSystemState");     // [cite: 50]

        // ---------------------------------------------------------
        // 7. 외부 기기 제어 (IO, Motor)
        // ---------------------------------------------------------
        IoOut = (lPIoOut)GetProcAddress(hDll, "JHCIoOut");                          // [cite: 53]
        MotorOut = (lPMotorOut)GetProcAddress(hDll, "JHCMotorOut");                 // [cite: 57]
    }
}

JhcLib::~JhcLib(void)
{
    // 소멸자: 로드된 라이브러리 해제
    if (hDll)
    {
        FreeLibrary(hDll);
        hDll = NULL;
    }
}

namespace ScannerUtil
{
    /**
     * @brief 마킹 작업이 완료될 때까지 대기합니다.
     * @param Obj JhcLib 객체 참조
     * @param WaitTick 최대 대기 시간 (ms). INFINITE 사용 시 무한 대기.
     * @return TRUE: 정상 완료, FALSE: 타임아웃
     */
    BOOL WaitFinish(JhcLib& Obj, DWORD64 WaitTick)
    {
        // SDK 매뉴얼 상 JHCGetMarkingState 반환값 정의 [cite: 49]
        // 1: end of sending data (완료/대기 상태)
        // 0: not over (동작 중)
        const int TransferNotYet = 0;
        const int TransferComplete = 1;

        DWORD64 Begin = GetTickCount64();

        // 함수 포인터가 유효한지 먼저 확인 (안전장치)
        if (Obj.GetMarkingState == NULL) return FALSE;

        while (Obj.GetMarkingState() != TransferComplete)
        {
            // 타임아웃 체크 (WaitTick이 INFINITE가 아닐 경우에만)
            if (WaitTick != INFINITE && (GetTickCount64() - Begin) > WaitTick)
            {
                return FALSE; // 타임아웃 발생
            }

            // CPU 점유율을 낮추기 위한 최소 지연
            Sleep(1);
        }

        return TRUE;
    }
};