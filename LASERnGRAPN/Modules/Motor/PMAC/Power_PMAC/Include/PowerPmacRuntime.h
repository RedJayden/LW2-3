
#ifndef __POWERPMACRUNTIME_H__
#define __POWERPMACRUNTIME_H__

#include "PowerPmacDef.h"

#ifdef __cplusplus
extern "C" {
#endif	//__cplusplus

	typedef UINT	(CALLBACK *DTKPOWERPMACOPEN)(DWORD dwIPAddress, UINT uMode);
	typedef UINT	(CALLBACK *DTKPOWERPMACCLOSE)(UINT uDeviceID);
	typedef UINT	(CALLBACK *DTKCONNECT)(UINT uDeviceID);
	typedef UINT	(CALLBACK *DTKDISCONNECT)(UINT uDeviceID);
	typedef UINT	(CALLBACK *DTKISCONNECTED)(UINT uDeviceID, PBOOL pConnected);
	typedef UINT	(CALLBACK *DTKSETECHOMODE)(UINT uDeviceID, UINT uEchoMode);
	typedef UINT	(CALLBACK *DTKGETECHOMODE)(UINT uDeviceID, PUINT puEchoMode);
	typedef UINT	(CALLBACK *DTKSETTIMEOUT)(UINT uDeviceID, UINT uSendTimeout, UINT uReceiveTimeout);
	typedef UINT	(CALLBACK *DTKGETTIMEOUT)(UINT uDeviceID, PUINT puSendTimeout, PUINT puReceiveTimeout);
	typedef UINT	(CALLBACK *DTKGETRESPONSEA)(UINT uDeviceID, LPSTR lpCommand, LPSTR lpResponse, INT nLength);
	typedef UINT	(CALLBACK *DTKGETRESPONSEW)(UINT uDeviceID, LPWSTR lpwCommand, LPWSTR lpwResponse, INT nLength);
	typedef UINT	(CALLBACK *DTKSENDCOMMANDA)(UINT uDeviceID, LPSTR lpCommand);
	typedef UINT	(CALLBACK *DTKSENDCOMMANDW)(UINT uDeviceID, LPWSTR lpwCommand);
	typedef UINT	(CALLBACK *DTKABORT)(UINT uDeviceID);
	typedef UINT	(CALLBACK *DTKDOWNLOADA)(UINT uDeviceID, LPSTR lpDownload, UINT uDowoload, HWND hDownloadWnd, PDOWNLOAD_PROGRESS lpDownloadProgress, PDOWNLOAD_MESSAGE_A lpDownloadMessage);
	typedef UINT	(CALLBACK *DTKDOWNLOADW)(UINT uDeviceID, LPWSTR lpwDownload, UINT uDowoload, HWND hDownloadWnd, PDOWNLOAD_PROGRESS lpDownloadProgress, PDOWNLOAD_MESSAGE_W lpwDownloadMessage);
	typedef UINT	(CALLBACK *DTKSETRECEIVEA)(UINT uDeviceID, HWND hReceiveWnd, PRECEIVE_PROC_A lpReveiveProc);
	typedef UINT	(CALLBACK *DTKSETRECEIVEW)(UINT uDeviceID, HWND hReceiveWnd, PRECEIVE_PROC_W lpwReveiveProc);
	
	typedef UINT	(CALLBACK *DTKGETUSERMEM)(UINT uDeviceID, UINT uAddress, INT nSize, PVOID pValue);
	typedef UINT	(CALLBACK *DTKSETUSERMEM)(UINT uDeviceID, UINT uAddress, INT nSize, PVOID pValue);
	typedef UINT	(CALLBACK *DTKGETUSERMEMCHAR)(UINT uDeviceID, INT nIndex, PCHAR pchValue);
	typedef UINT	(CALLBACK *DTKSETUSERMEMCHAR)(UINT uDeviceID, INT nIndex, CHAR chValue);
	typedef UINT	(CALLBACK *DTKGETUSERMEMSHORT)(UINT uDeviceID, INT nIndex, PSHORT pnValue);
	typedef UINT	(CALLBACK *DTKSETUSERMEMSHORT)(UINT uDeviceID, INT nIndex, SHORT nValue);
	typedef UINT	(CALLBACK *DTKGETUSERMEMINTEGER)(UINT uDeviceID, INT nIndex, PINT pnValue);
	typedef UINT	(CALLBACK *DTKSETUSERMEMINTEGER)(UINT uDeviceID, INT nIndex, INT nValue);
	typedef UINT	(CALLBACK *DTKGETUSERMEMUINTEGER)(UINT uDeviceID, INT nIndex, PINT pnValue);
	typedef UINT	(CALLBACK *DTKSETUSERMEMUINTEGER)(UINT uDeviceID, INT nIndex, INT nValue);
	typedef UINT	(CALLBACK *DTKGETUSERMEMFLOAT)(UINT uDeviceID, INT nIndex, PFLOAT pfVlaue);
	typedef UINT	(CALLBACK *DTKSETUSERMEMFLOAT)(UINT uDeviceID, INT nIndex, FLOAT fValue);
	typedef UINT	(CALLBACK *DTKGETUSERMEMDOUBLE)(UINT uDeviceID, INT nIndex, PDOUBLE pdValue);
	typedef UINT	(CALLBACK *DTKSETUSERMEMDOUBLE)(UINT uDeviceID, INT nIndex, DOUBLE dValue);

	typedef UINT	(CALLBACK *DTKLOCKGPASCII)(UINT uDeviceID);
	typedef UINT	(CALLBACK *DTKUNLOCKGPASCII)(UINT uDeviceID);
	typedef UINT	(CALLBACK *DTKLOCKUSERMEM)(UINT uDeviceID);
	typedef UINT	(CALLBACK *DTKUNLOCKUSERMEM)(UINT uDeviceID);

	extern DTKPOWERPMACOPEN			DTKPowerPmacOpen;
	extern DTKPOWERPMACCLOSE		DTKPowerPmacClose;
	extern DTKCONNECT				DTKConnect;
	extern DTKDISCONNECT			DTKDisconnect;
	extern DTKISCONNECTED			DTKIsConnected;
	extern DTKSETECHOMODE			DTKSetEchoMode;
	extern DTKGETECHOMODE			DTKGetEchoMode;
	extern DTKSETTIMEOUT			DTKSetTimeout;
	extern DTKGETTIMEOUT			DTKGetTimeout;
	extern DTKGETRESPONSEA			DTKGetResponseA;
	extern DTKGETRESPONSEW			DTKGetResponseW;
	extern DTKSENDCOMMANDA			DTKSendCommandA;
	extern DTKSENDCOMMANDW			DTKSendCommandW;
	extern DTKABORT					DTKAbort;
	extern DTKDOWNLOADA				DTKDownloadA;
	extern DTKDOWNLOADW				DTKDownloadW;
	extern DTKSETRECEIVEA			DTKSetReceiveA;
	extern DTKSETRECEIVEW			DTKSetReceiveW;
	
	extern DTKGETUSERMEM			DTKGetUserMem;
	extern DTKSETUSERMEM			DTKSetUserMem;
	extern DTKGETUSERMEMCHAR		DTKGetUserMemChar;
	extern DTKSETUSERMEMCHAR		DTKSetUserMemChar;
	extern DTKGETUSERMEMSHORT		DTKGetUserMemShort;
	extern DTKSETUSERMEMSHORT		DTKSetUserMemShort;
	extern DTKGETUSERMEMINTEGER		DTKGetUserMemInteger;
	extern DTKSETUSERMEMINTEGER		DTKSetUserMemInteger;
	extern DTKGETUSERMEMUINTEGER	DTKGetUserMemUInteger;
	extern DTKSETUSERMEMUINTEGER	DTKSetUserMemUInteger;
	extern DTKGETUSERMEMFLOAT		DTKGetUserMemFloat;
	extern DTKSETUSERMEMFLOAT		DTKSetUserMemFloat;
	extern DTKGETUSERMEMDOUBLE		DTKGetUserMemDouble;
	extern DTKSETUSERMEMDOUBLE		DTKSetUserMemDouble;

	extern DTKLOCKGPASCII			DTKLockGpAscii;
	extern DTKUNLOCKGPASCII			DTKUnlockGpAscii;
	extern DTKLOCKUSERMEM			DTKLockUserMem;
	extern DTKUNLOCKUSERMEM			DTKUnlockUserMem;

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
	
	HINSTANCE	PowerPmacOpenRuntimeLink();
	VOID		PowerPmacCloseRuntimeLink();

#ifdef __cplusplus
}
#endif	//__cplusplus

#endif	//__POWERPMACRUNTIME_H__