
#ifndef __POWERPMAC_H__
#define __POWERPMAC_H__

#ifndef __ATLBASE_H__
	#include <windows.h>
#endif

#include "PowerPmacDef.h"


#ifdef __cplusplus
extern "C" {
#endif	//__cplusplus

	// 라이브러리 오픈
	// 인자를 NULL로 할 경우 DTKDeviceSelect 함수를 사용하여 장치를 연결해야 한다.
	UINT	WINAPI DTKPowerPmacOpen(DWORD dwIPAddress, UINT uMode);

	// 라이브리리 클로즈
	UINT	WINAPI DTKPowerPmacClose(UINT uDeviceID);

	// 등록된 디바이스 갯수
	UINT	WINAPI DTKGetDeviceCount(PINT pnDeviceCount);

	// IP Address 확인
	UINT	WINAPI DTKGetIPAddress(UINT uDeviceID, PDWORD pdwIPAddress);
	
	// 장치를 연결
	UINT	WINAPI DTKConnect(UINT uDeviceID);

	// 장치를 해제
	UINT	WINAPI DTKDisconnect(UINT uDeviceID);

	// 장치가 연결되었는지 확인
	UINT	WINAPI DTKIsConnected(UINT uDeviceID, PBOOL pbConnected);

	//	Echo Mode 설정
	UINT	WINAPI DTKSetEchoMode(UINT uDeviceID, UINT uEchoMode);

	//	Echo Mode 확인
	UINT	WINAPI DTKGetEchoMode(UINT uDeviceID, PUINT puEchoMode);

	//	Socket Timeout 설정
	UINT	WINAPI DTKSetTimeout(UINT uDeviceID, UINT uSendTimeout, UINT uReceiveTimeout);

	//	Socket Timeout 확인
	UINT	WINAPI DTKGetTimeout(UINT uDeviceID, PUINT puSendTimeout, PUINT puReceiveTimeout);

	// Single Character 형식으로 제어
	UINT	WINAPI DTKGetResponseA(UINT uDeviceID, LPSTR lpCommand, LPSTR lpResponse, INT nLength);

	// Wild Character 형식으로 제어
	UINT	WINAPI DTKGetResponseW(UINT uDeviceID, LPWSTR lpwCommand, LPWSTR lpwResponse, INT nLength);

	// Single Character 형식으로 제어
	UINT	WINAPI DTKSendCommandA(UINT uDeviceID, LPSTR lpCommand);

	// Wild Character 형식으로 제어
	UINT	WINAPI DTKSendCommandW(UINT uDeviceID, LPWSTR lpwCommand);

	UINT	WINAPI DTKAbort(UINT uDeviceID);

	// Single Character 형식으로 Download
	// Callback 방식은 lpDownloadProgress, lpDownloadMessage 변수 연결하고 hDownloadWnd는 NULL 입력
	// Message 방식은 hDownloadWnd에 변수 연결하고 lpDownloadProgress, lpDownloadMessage는 NULL 입력
	UINT	WINAPI DTKDownloadA(UINT uDeviceID, LPSTR lpDownload, UINT uDowoload, HWND hDownloadWnd, PDOWNLOAD_PROGRESS lpDownloadProgress, PDOWNLOAD_MESSAGE_A lpDownloadMessage);

	// Wild Character 형식으로 Download
	// Callback 방식은 lpwDownloadProgress, lpwDownloadMessage 변수 연결하고 hDownloadWnd는 NULL 입력
	// Message 방식은 hDownloadWnd에 변수 연결하고 lpwDownloadProgress, lpwDownloadMessage는 NULL 입력
	UINT	WINAPI DTKDownloadW(UINT uDeviceID, LPWSTR lpwDownload, UINT uDowoload, HWND hDownloadWnd, PDOWNLOAD_PROGRESS lpDownloadProgress, PDOWNLOAD_MESSAGE_W lpwDownloadMessage);

	// Single Character 형식으로 제어
	// Callback 방식은 lpReveiveProc 변수 연결하고 hReceiveWnd는 NULL 입력
	// Message 방식은 hReceiveWnd에 변수 연결하고 lpReveiveProc는 NULL 입력
	UINT	WINAPI DTKSetReceiveA(UINT uDeviceID, HWND hReceiveWnd, PRECEIVE_PROC_A lpReveiveProc);

	// Wild Character 형식으로 제어
	// Callback 방식은 lpwReveiveProc 변수 연결하고 hReceiveWnd는 NULL 입력
	// Message 방식은 hReceiveWnd에 변수 연결하고 lpwReveiveProc는 NULL 입력
	UINT	WINAPI DTKSetReceiveW(UINT uDeviceID, HWND hReceiveWnd, PRECEIVE_PROC_W lpwReveiveProc);


	// 아래의 함수군은 CPU 통신셋업후 사용 가능
	UINT	WINAPI DTKGetUserMem(UINT uDeviceID, UINT uAddress, INT nSize, PVOID pValue);
	UINT	WINAPI DTKSetUserMem(UINT uDeviceID, UINT uAddress, INT nSize, PVOID pValue);
	UINT	WINAPI DTKGetUserMemChar(UINT uDeviceID, INT nIndex, PCHAR pchValue);
	UINT	WINAPI DTKSetUserMemChar(UINT uDeviceID, INT nIndex, CHAR chValue);
	UINT	WINAPI DTKGetUserMemShort(UINT uDeviceID, INT nIndex, PSHORT pnValue);
	UINT	WINAPI DTKSetUserMemShort(UINT uDeviceID, INT nIndex, SHORT nValue);
	UINT	WINAPI DTKGetUserMemInteger(UINT uDeviceID, INT nIndex, PINT pnValue);
	UINT	WINAPI DTKSetUserMemInteger(UINT uDeviceID, INT nIndex, INT nValue);
	UINT	WINAPI DTKGetUserMemUInteger(UINT uDeviceID, INT nIndex, PUINT puValue);
	UINT	WINAPI DTKSetUserMemUInteger(UINT uDeviceID, INT nIndex, UINT uValue);
	UINT	WINAPI DTKGetUserMemFloat(UINT uDeviceID, INT nIndex, PFLOAT pfVlaue);
	UINT	WINAPI DTKSetUserMemFloat(UINT uDeviceID, INT nIndex, FLOAT fValue);
	UINT	WINAPI DTKGetUserMemDouble(UINT uDeviceID, INT nIndex, PDOUBLE pdValue);
	UINT	WINAPI DTKSetUserMemDouble(UINT uDeviceID, INT nIndex, DOUBLE dValue);

	UINT	WINAPI DTKLockGpAscii(UINT uDeviceID);
	UINT	WINAPI DTKUnlockGpAscii(UINT uDeviceID);
	UINT	WINAPI DTKLockUserMem(UINT uDeviceID);
	UINT	WINAPI DTKUnlockUserMem(UINT uDeviceID);

#ifdef UNICODE
	#define DTKGetResponse			DTKGetResponseW
	#define DTKSendCommand			DTKSendCommandW
	#define DTKDownload				DTKDownloadW
	#define DTKSetReceive			DTKSetReceiveW
#else
	#define DTKGetResponse			DTKGetResponseA
	#define DTKSendCommand			DTKSendCommandA
	#define DTKDownload				DTKDownloadA
	#define DTKSetReceive			DTKSetReceiveA
#endif

#ifdef __cplusplus
}
#endif	//__cplusplus


#endif	//__POWERPMAC_H__