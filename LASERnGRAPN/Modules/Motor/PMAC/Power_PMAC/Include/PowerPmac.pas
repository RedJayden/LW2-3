unit ppcomm;

interface

uses
  windows;

const
  DLLName = 'PowerPmac32.dll';

  DM_GPASCII			= 0;
  DM_GETSENDS_0		= 1;
  DM_GETSENDS_1		= 2;
  DM_GETSENDS_2		= 3;
  DM_GETSENDS_3		= 4;
  DM_GETSENDS_4		= 5;
  DM_SECURE_SHELL		= 10;

  DS_Ok	              = 0;
  DS_Exception	  	  = 1;
  DS_TimeOut		  	  = 2;
  DS_Connected	  	  = 3;
  DS_NotConnected		  = 4;
  DS_Failed			      = 5;
  DS_InvalidDevice	  = 11;
  DS_LengthExceeds	  = 21;
  DS_RunningDownload  = 22;
  DS_RunningRead		  = 23;
  DS_ResLengthExceeds	= 24;
  DS_RunningDownload	= 41;
  DS_RunningRead		= 42;
  DS_DATimeOut			= 102;
  DS_DANotConnected		= 104;
  DS_DAFailed			= 105;

  DR_Reset		  	    = 0;
  DR_FullReset		    = 1;

  DM_File_Download		= 0;
  DM_File_DownExec 		= 1;
  DM_File_DownExecDel	= 2;
  DM_File_DirectBuffer	= 6;
  DM_File_DownAuto		= 11;

//Type

//  PDOWNLOAD_PROGRESS = procedure (nPercent : Integer); stdcall;
//  PDOWNLOAD_MESSAGE_A = procedure(lpMessage : LPSTR); stdcall;
//  PDOWNLOAD_MESSAGE_W = procedure(lpwMessage : LPWSTR); stdcall;
//
//  PRECEIVE_PROC_A = procedure(lpReveive : LPSTR); stdcall;
//  PRECEIVE_PROC_W = procedure(lpwReveive : LPWSTR); stdcall;
//
//  PPDOWNLOAD_PROGRESS = ^PDOWNLOAD_PROGRESS;
//  PPDOWNLOAD_MESSAGE_A = ^PDOWNLOAD_MESSAGE_A;
//  PPDOWNLOAD_MESSAGE_W = ^PDOWNLOAD_MESSAGE_W;
//
//  PPRECEIVE_PROC_A = ^PRECEIVE_PROC_A;
//  PPRECEIVE_PROC_W = ^PRECEIVE_PROC_W;

	function DTKPowerPmacOpen(dwIPAddress : DWORD; uMode : UINT ): UINT; stdcall;

	// 라이브리리 클로즈
	function DTKPowerPmacClose(uDeviceID : UINT): UINT; stdcall;

	// 등록된 디바이스 갯수
	function DTKGetDeviceCount(pnDeviceCount : PINT): UINT; stdcall;

	// IP Address 확인
	function DTKGetIPAddress(uDeviceID : UINT; pdwIPAddress : PDWORD): UINT; stdcall;

	// 장치를 연결
	function DTKConnect(uDeviceID : UINT): UINT; stdcall;

	// 장치를 해제
	function DTKDisconnect(uDeviceID : UINT): UINT; stdcall;

	// 장치가 연결되었는지 확인
	function DTKIsConnected(uDeviceID : UINT; pbConnected : PBOOL): UINT; stdcall;

	//	Echo Mode 설정
	function DTKSetEchoMode(uDeviceID : UINT; uEchoMode : UINT): UINT; stdcall;

	//	Echo Mode 확인
	function DTKGetEchoMode(uDeviceID : UINT; puEchoMode : PUINT): UINT; stdcall;

	//	Socket Timeout 설정
	function DTKSetTimeout(uDeviceID : UINT; uSendTimeout : UINT; uReceiveTimeout : UINT): UINT; stdcall;

	//	Socket Timeout 확인
	function DTKGetTimeout(uDeviceID : UINT; puSendTimeout : PUINT; puReceiveTimeout : PUINT): UINT; stdcall;

	// Single Character 형식으로 제어
	function DTKGetResponseA(uDeviceID : UINT; lpCommand : LPSTR; lpResponse : LPSTR; nLength : Integer): UINT; stdcall;

	// Wide Character 형식으로 제어
	function DTKGetResponseW(uDeviceID : UINT; lpwCommand : LPWSTR; lpwResponse : LPWSTR; nLength : Integer): UINT; stdcall;

	// Single Character 형식으로 제어
	function DTKSendCommandA(uDeviceID : UINT; lpCommand : LPSTR): UINT; stdcall;

	// Wide Character 형식으로 제어
	function DTKSendCommandW(uDeviceID : UINT; lpwCommand : LPWSTR): UINT; stdcall;

	function DTKAbort(uDeviceID : UINT): UINT; stdcall;

	// Single Character 형식으로 Download
	function DTKDownloadA(uDeviceID : UINT; lpDownload : LPSTR; uDowoload : UINT; hDownloadWnd : THandle; lpDownloadProgress : {PPDOWNLOAD_PROGRESS}Pointer; lpDownloadMessage : {PPDOWNLOAD_MESSAGE_A}Pointer): UINT; stdcall;

	// Wild Character 형식으로 Download
	function DTKDownloadW(uDeviceID : UINT; lpwDownload : LPWSTR; uDowoload : UINT; hDownloadWnd : THandle; lpDownloadProgress : {PPDOWNLOAD_PROGRESS}Pointer; lpwDownloadMessage : {PPDOWNLOAD_MESSAGE_W}Pointer): UINT; stdcall;

	// Single Character 형식으로 제어
	function DTKSetReceiveA(uDeviceID : UINT; hReceiveWnd : THandle; lpReveiveProc : {PPRECEIVE_PROC_A}Pointer): UINT; stdcall;

	// Wild Character 형식으로 제어
	function DTKSetReceiveW(uDeviceID : UINT; hReceiveWnd : THandle; lpwReveiveProc : {PPRECEIVE_PROC_W}Pointer): UINT; stdcall;

	// 아래의 함수군은 CPU 통신셋업후 사용 가능
	function DTKGetUserMem(uDeviceID : UINT; uAddress : UINT; nSize : INT; pValue : PVOID): UINT; stdcall;
	function DTKSetUserMem(uDeviceID : UINT; uAddress : UINT; INT nSize : INT; pValue :  PVOID): UINT; stdcall;
	function DTKGetUserMemChar(uDeviceID : UINT; nIndex : INT; pchValue : PCHAR): UINT; stdcall;
	function DTKSetUserMemChar(uDeviceID : UINT; nIndex : INT; chValue : CHAR): UINT; stdcall;
	function DTKGetUserMemShort(uDeviceID : UINT; nIndex : INT, pnValue : PSHORT): UINT; stdcall;
	function DTKSetUserMemShort(uDeviceID : UINT; nIndex : INT; nValue : SHORT): UINT; stdcall;
	function DTKGetUserMemInteger(uDeviceID : UINT; nIndex : INT; pnValue : PINT): UINT; stdcall;
	function DTKSetUserMemInteger(uDeviceID : UINT; nIndex : INT; nValue : INT): UINT; stdcall;
	function DTKGetUserMemUInteger(uDeviceID : UINT; nIndex : INT; puValue : PUINT): UINT; stdcall;
	function DTKSetUserMemUInteger(uDeviceID : UINT; nIndex : INT; uValue : UINT): UINT; stdcall;
	function DTKGetUserMemFloat(uDeviceID : UINT; nIndex : INT; pfVlaue : PFLOAT): UINT; stdcall;
	function DTKSetUserMemFloat(uDeviceID : UINT; nIndex : INT; fValue : FLOAT): UINT; stdcall;
	function DTKGetUserMemDouble(uDeviceID : UINT; nIndex : INT; pdValue : PDOUBLE): UINT; stdcall;
	function DTKSetUserMemDouble(uDeviceID : UINT; nIndex : INT; dValue : DOUBLE): UINT; stdcall;

	function DTKLockGpAscii(uDeviceID : UINT): UINT; stdcall;
	function DTKUnlockGpAscii(uDeviceID : UINT): UINT; stdcall;
	function DTKLockUserMem(uDeviceID : UINT): UINT; stdcall;
	function DTKUnlockUserMem(uDeviceID : UINT): UINT; stdcall;

implementation
  function DTKPowerPmacOpen; external DLLName;
	function DTKPowerPmacClose; external DLLName;
	function DTKGetDeviceCount; external DLLName;
	function DTKGetIPAddress; external DLLName;
	function DTKConnect; external DLLName;
	function DTKDisconnect; external DLLName;
	function DTKIsConnected; external DLLName;
	function DTKGetResponseA; external DLLName;
	function DTKGetResponseW; external DLLName;
	function DTKSendCommandA; external DLLName;
	function DTKSendCommandW; external DLLName;
	function DTKAbort; external DLLName;
	function DTKDownloadA; external DLLName;
	function DTKDownloadW; external DLLName;
	function DTKSetReceiveA; external DLLName;
	function DTKSetReceiveW; external DLLName;
	
	function DTKGetUserMem; external DLLName;
	function DTKSetUserMem; external DLLName;
	function DTKGetUserMemChar; external DLLName;
	function DTKSetUserMemChar; external DLLName;
	function DTKGetUserMemShort; external DLLName;
	function DTKSetUserMemShort; external DLLName;
	function DTKGetUserMemInteger; external DLLName;
	function DTKSetUserMemInteger; external DLLName;
	function DTKGetUserMemUInteger; external DLLName;
	function DTKSetUserMemUInteger; external DLLName;
	function DTKGetUserMemFloat; external DLLName;
	function DTKGetUserMemFloat; external DLLName;
	function DTKGetUserMemDouble; external DLLName;
	function DTKGetUserMemDouble; external DLLName;

	function DTKLockGpAscii; external DLLName;
	function DTKUnlockGpAscii; external DLLName;
	function DTKLockUserMem; external DLLName;
	function DTKUnlockUserMem; external DLLName;
end.

