#ifndef JHCLIB_H
#define JHCLIB_H
#include "pch.h" // [NEW] Added for Native C++ global rule

#include <windows.h> // WINAPI, BOOL, BYTE 등을 위해 필요
#include "../IScannerController.h"


/**
 * @brief 지원하는 레이저 소스 타입
 */
enum LaserType
{
	Co2,
	YAG,
	Fiber1, // IPG 등 일반 파이버
	SPI,    // SPI 사 파이버
	Fiber2
};

// ----------------------------------------------------------------------------
// DLL 함수 포인터 정의 (Dynamic Linking)
// ----------------------------------------------------------------------------

typedef BOOL(WINAPI* lPOpenDevice)(void);     // USB 장치 연결 (Open)
typedef void (WINAPI* lPCloseDevice)(void);    // USB 장치 연결 해제 (Close)
typedef BOOL(WINAPI* lPIsOpen)(void);         // USB 연결 상태 확인
typedef void (WINAPI* lPSChSetPWM)(UINT, BYTE, BOOL); // 레이저 PWM 설정 (주파수, 듀티비, 반전여부)

/**
 * @brief 직선 그리기 명령
 * @param x1, y1 시작 좌표
 * @param x2, y2 종료 좌표
 * @note 단위: 0.01mm (100 = 1mm)
 */
typedef void (WINAPI* lPSchOutLine)(float, float, float, float);

typedef void (WINAPI* lPBufStart)(void);       // 데이터 버퍼링 시작 (이후 명령은 큐에 쌓임)
typedef void (WINAPI* lPStartMarking)();       // 버퍼에 쌓인 명령 실행 (마킹 시작)

/**
 * @brief 캘리브레이션(보정) 값 설정
 * @note 왜곡 보정 계수 등 8개 파라미터 전달
 */
typedef void (WINAPI* lPCorrectionSet)(float, float, float, float,
	float, float, float, float);

typedef void (WINAPI* lPSchLaserOut)(float, int, int); // 레이저 파워 및 모드 설정

/**
 * @brief 직사각형 그리기
 * @param x1, y1 좌상단 좌표
 * @param x2, y2 우하단 좌표
 * @note 단위: 0.01mm
 */
typedef void (WINAPI* lPSchOutRect)(float, float, float, float);

/**
 * @brief 원 그리기
 * @param x, y 중심 좌표
 * @param r 반지름
 * @note 단위: 0.01mm
 */
typedef void (WINAPI* lPSchOutCircle)(float, float, float);

/**
 * @brief 원호(Arc) 그리기
 * @param x, y 중심 좌표
 * @param r 반지름
 * @param startAngle 시작 각도
 * @param endAngle 종료 각도
 */
typedef void (WINAPI* lPSchOutArc)(float, float, float, float, float);

/**
 * @brief 타원 그리기
 * @param x, y 중심 좌표
 * @param rx X축 반지름
 * @param ry Y축 반지름
 * @note 단위: 0.01mm
 */
typedef void (WINAPI* lPSchOutEllipse)(float, float, float, float);

/**
 * @brief 타원호 그리기
 * @note 타원의 중심, 반지름(X,Y), 시작/종료 각도
 */
typedef void (WINAPI* lPSchOutEArc)(float, float, float, float, float, float);

typedef void (WINAPI* lPCancel)();             // 마킹 중지 (Stop)
typedef void (WINAPI* lPPause)();              // 일시 정지 (Pause)
typedef void (WINAPI* lPResume)();             // 다시 시작 (Resume)
typedef void (WINAPI* lPParameterSet)(PARAMETER); // 파라미터 구조체 적용
typedef void (WINAPI* lPGalvoParameterSet)(GALVOPARAM); // 갈보 파라미터 구조체 적용
typedef int (WINAPI* lPGetMarkingState)(void); // 현재 마킹 상태 확인 (0:Busy/not over, 1:Idle/end of sending data - see JhcLib.cpp ScannerUtil::WaitFinish [cite: 49])
typedef int (WINAPI* lPGetSystemState)(JHCStatusdef&, BOOL); // 전체 시스템 상태 조회
typedef int (WINAPI* lPIoOut)(byte, byte, unsigned short); // 디지털 IO 출력 제어

/**
 * @brief 외부 모터(축) 제어
 * @param ID 축 번호
 * @param dist 이동 거리
 * @param speed 속도 등...
 */
typedef int (WINAPI* lPMotorOut)(BYTE, float, float, float, BYTE, float, float);

/**
 * @brief 점(Point) 찍기
 * @param x, y 좌표 (단위: 0.01mm)
 * @param t 레이저 체류 시간 (단위: ms)
 */
typedef void (WINAPI* lPSchOutPoint)(float, float, float);

// ----------------------------------------------------------------------------
// 라이브러리 래퍼 클래스 정의
// ----------------------------------------------------------------------------
class JhcLib
{
public:
	JhcLib(void);
	~JhcLib(void);

public:
	// 멤버 변수로 함수 포인터를 가짐 (LoadLibrary 후 GetProcAddress로 연결 필요)
	lPOpenDevice OpenDevice;              // 장치 연결
	lPCloseDevice CloseDevice;            // 장치 해제
	lPIsOpen      IsOpen;                 // 연결 확인
	lPSChSetPWM SChSetPWM;                // PWM 설정
	lPSchOutLine SchOutLine;              // 직선 그리기 (단위: 0.01mm)
	lPBufStart BufStart;                  // 버퍼 시작
	lPStartMarking StartMarking;          // 마킹 시작
	lPCorrectionSet CorrectionSet;        // 보정 값 설정
	lPSchLaserOut SchLaserOut;            // 레이저 파워/모드 설정
	lPSchOutRect SchOutRect;              // 사각형 그리기
	lPSchOutCircle SchOutCircle;          // 원 그리기
	lPSchOutArc SchOutArc;                // 원호 그리기
	lPSchOutEllipse SchOutEllipse;        // 타원 그리기
	lPSchOutEArc SchOutEArc;              // 타원호 그리기
	lPCancel Cancel;                      // 마킹 취소
	lPPause Pause;                        // 일시 정지
	lPResume Resume;                      // 재개
	lPParameterSet ParameterSet;          // 파라미터 설정
	lPGalvoParameterSet GalvoParameterSet;// 갈보 설정
	lPGetMarkingState GetMarkingState;    // 마킹 상태 확인
	lPGetSystemState GetSystemState;      // 시스템 상태 확인
	lPIoOut IoOut;                       // IO 출력
	lPMotorOut MotorOut;                  // 모터 제어
	lPSchOutPoint SchOutPoint;            // 점 찍기
};

#endif // JHCLASERCONTROL_H