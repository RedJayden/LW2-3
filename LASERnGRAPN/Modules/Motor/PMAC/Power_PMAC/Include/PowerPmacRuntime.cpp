#include <Windows.h>
#include <Tchar.h>
#include "PowerPmacRuntime.h"

DTKPOWERPMACOPEN		DTKPowerPmacOpen;
DTKPOWERPMACCLOSE		DTKPowerPmacClose;
DTKCONNECT				DTKConnect;
DTKDISCONNECT			DTKDisconnect;
DTKISCONNECTED			DTKIsConnected;
DTKSETECHOMODE			DTKSetEchoMode;
DTKGETECHOMODE			DTKGetEchoMode;
DTKSETTIMEOUT			DTKSetTimeout;
DTKGETTIMEOUT			DTKGetTimeout;
DTKGETRESPONSEA			DTKGetResponseA;
DTKGETRESPONSEW			DTKGetResponseW;
DTKSENDCOMMANDA			DTKSendCommandA;
DTKSENDCOMMANDW			DTKSendCommandW;
DTKABORT				DTKAbort;
DTKDOWNLOADA			DTKDownloadA;
DTKDOWNLOADW			DTKDownloadW;
DTKSETRECEIVEA			DTKSetReceiveA;
DTKSETRECEIVEW			DTKSetReceiveW;

DTKGETUSERMEM			DTKGetUserMem;
DTKSETUSERMEM			DTKSetUserMem;
DTKGETUSERMEMCHAR		DTKGetUserMemChar;
DTKSETUSERMEMCHAR		DTKSetUserMemChar;
DTKGETUSERMEMSHORT		DTKGetUserMemShort;
DTKSETUSERMEMSHORT		DTKSetUserMemShort;
DTKGETUSERMEMINTEGER	DTKGetUserMemInteger;
DTKSETUSERMEMINTEGER	DTKSetUserMemInteger;
DTKGETUSERMEMUINTEGER	DTKGetUserMemUInteger;
DTKSETUSERMEMUINTEGER	DTKSetUserMemUInteger;
DTKGETUSERMEMFLOAT		DTKGetUserMemFloat;
DTKSETUSERMEMFLOAT		DTKSetUserMemFloat;
DTKGETUSERMEMDOUBLE		DTKGetUserMemDouble;
DTKSETUSERMEMDOUBLE		DTKSetUserMemDouble;

DTKLOCKGPASCII			DTKLockGpAscii;
DTKUNLOCKGPASCII		DTKUnlockGpAscii;
DTKLOCKUSERMEM			DTKLockUserMem;
DTKUNLOCKUSERMEM		DTKUnlockUserMem;


HINSTANCE				g_hLib = NULL;

HINSTANCE PowerPmacOpenRuntimeLink()
{
	#ifdef WIN64
		g_hLib = LoadLibrary(_T("PowerPmac64.dll"));
	#else
		g_hLib = LoadLibrary(_T("PowerPmac32.dll"));
	#endif


	if (g_hLib)
	{
		INT			i;
		
		for (i = 0; i < 1; i++)
		{
			DTKPowerPmacOpen		= (DTKPOWERPMACOPEN)GetProcAddress(g_hLib, "DTKPowerPmacOpen");
			if (DTKPowerPmacOpen == NULL) break;
			
			DTKPowerPmacClose		= (DTKPOWERPMACCLOSE)GetProcAddress(g_hLib, "DTKPowerPmacClose");
			if (DTKPowerPmacClose == NULL) break;
			
			DTKConnect				= (DTKCONNECT)GetProcAddress(g_hLib, "DTKConnect");
			if (DTKConnect == NULL) break;
			
			DTKDisconnect			= (DTKDISCONNECT)GetProcAddress(g_hLib, "DTKDisconnect");
			if (DTKDisconnect == NULL) break;
			
			DTKIsConnected			= (DTKISCONNECTED)GetProcAddress(g_hLib, "DTKIsConnected");
			if (DTKIsConnected == NULL) break;

			DTKSetEchoMode			= (DTKSETECHOMODE)GetProcAddress(g_hLib, "DTKSetEchoMode");
			if (DTKSetEchoMode == NULL) break;

			DTKSetTimeout			= (DTKSETTIMEOUT)GetProcAddress(g_hLib, "DTKSetTimeout");
			if (DTKSetTimeout == NULL) break;

			DTKGetTimeout			= (DTKGETTIMEOUT)GetProcAddress(g_hLib, "DTKGetTimeout");
			if (DTKGetTimeout == NULL) break;
			
			DTKGetResponseA			= (DTKGETRESPONSEA)GetProcAddress(g_hLib, "DTKGetResponseA");
			if (DTKGetResponseA == NULL) break;
			
			DTKGetResponseW			= (DTKGETRESPONSEW)GetProcAddress(g_hLib, "DTKGetResponseW");
			if (DTKGetResponseW == NULL) break;

			DTKSendCommandA			= (DTKSENDCOMMANDA)GetProcAddress(g_hLib, "DTKSendCommandA");
			if (DTKSendCommandA == NULL) break;
			
			DTKSendCommandW			= (DTKSENDCOMMANDW)GetProcAddress(g_hLib, "DTKSendCommandW");
			if (DTKSendCommandW == NULL) break;
			
			DTKAbort				= (DTKABORT)GetProcAddress(g_hLib, "DTKAbort");
			if (DTKAbort == NULL) break;
			
			DTKDownloadA			= (DTKDOWNLOADA)GetProcAddress(g_hLib, "DTKDownloadA");
			if (DTKDownloadA == NULL) break;
			
			DTKDownloadW			= (DTKDOWNLOADW)GetProcAddress(g_hLib, "DTKDownloadW");
			if (DTKDownloadW == NULL) break;
			
			DTKSetReceiveA			= (DTKSETRECEIVEA)GetProcAddress(g_hLib, "DTKSetReceiveA");
			if (DTKSetReceiveA == NULL) break;
			
			DTKSetReceiveW			= (DTKSETRECEIVEW)GetProcAddress(g_hLib, "DTKSetReceiveW");
			if (DTKSetReceiveW == NULL) break;
			
			DTKGetUserMem			= (DTKGETUSERMEM)GetProcAddress(g_hLib, "DTKGetUserMem");
			if (DTKGetUserMem == NULL) break;
			
			DTKSetUserMem			= (DTKSETUSERMEM)GetProcAddress(g_hLib, "DTKSetUserMem");
			if (DTKSetUserMem == NULL) break;
			
			DTKGetUserMemChar		= (DTKGETUSERMEMCHAR)GetProcAddress(g_hLib, "DTKGetUserMemChar");
			if (DTKGetUserMemChar == NULL) break;
			
			DTKSetUserMemChar		= (DTKSETUSERMEMCHAR)GetProcAddress(g_hLib, "DTKSetUserMemChar");
			if (DTKSetUserMemChar == NULL) break;
			
			DTKGetUserMemShort		= (DTKGETUSERMEMSHORT)GetProcAddress(g_hLib, "DTKGetUserMemShort");
			if (DTKGetUserMemShort == NULL) break;
			
			DTKSetUserMemShort		= (DTKSETUSERMEMSHORT)GetProcAddress(g_hLib, "DTKSetUserMemShort");
			if (DTKSetUserMemShort == NULL) break;
			
			DTKGetUserMemInteger	= (DTKGETUSERMEMINTEGER)GetProcAddress(g_hLib, "DTKGetUserMemInteger");
			if (DTKGetUserMemInteger == NULL) break;
			
			DTKSetUserMemInteger	= (DTKSETUSERMEMINTEGER)GetProcAddress(g_hLib, "DTKSetUserMemInteger");
			if (DTKSetUserMemInteger == NULL) break;

			DTKGetUserMemUInteger	= (DTKGETUSERMEMUINTEGER)GetProcAddress(g_hLib, "DTKGetUserMemUInteger");
			if (DTKGetUserMemInteger == NULL) break;
			
			DTKSetUserMemUInteger	= (DTKSETUSERMEMUINTEGER)GetProcAddress(g_hLib, "DTKSetUserMemUInteger");
			if (DTKSetUserMemInteger == NULL) break;
			
			DTKGetUserMemFloat		= (DTKGETUSERMEMFLOAT)GetProcAddress(g_hLib, "DTKGetUserMemFloat");
			if (DTKGetUserMemFloat == NULL) break;
			
			DTKSetUserMemFloat		= (DTKSETUSERMEMFLOAT)GetProcAddress(g_hLib, "DTKSetUserMemFloat");
			if (DTKSetUserMemFloat == NULL) break;
			
			DTKGetUserMemDouble		= (DTKGETUSERMEMDOUBLE)GetProcAddress(g_hLib, "DTKGetUserMemDouble");
			if (DTKGetUserMemDouble == NULL) break;
			
			DTKSetUserMemDouble		= (DTKSETUSERMEMDOUBLE)GetProcAddress(g_hLib, "DTKSetUserMemDouble");
			if (DTKSetUserMemDouble == NULL) break;

			DTKLockGpAscii			= (DTKLOCKGPASCII)GetProcAddress(g_hLib, "DTKLockGpAscii");
			if (DTKLockGpAscii == NULL) break;

			DTKUnlockGpAscii		= (DTKUNLOCKGPASCII)GetProcAddress(g_hLib, "DTKUnlockGpAscii");
			if (DTKUnlockGpAscii == NULL) break;

			DTKLockUserMem			= (DTKLOCKUSERMEM)GetProcAddress(g_hLib, "DTKLockUserMem");
			if (DTKLockUserMem == NULL) break;

			DTKUnlockUserMem		= (DTKUNLOCKUSERMEM)GetProcAddress(g_hLib, "DTKUnlockUserMem");
			if (DTKUnlockUserMem == NULL) break;
		}
		
		if(i == 0)		// Check validity of procedure addresses
			PowerPmacCloseRuntimeLink();
		
	}
	else
		MessageBox(NULL, _T("Error in loading Power Pmac library."), _T("Power Pmac"), MB_ICONSTOP | MB_OK | MB_TOPMOST);
	
	return g_hLib;
}

VOID PowerPmacCloseRuntimeLink()
{
	if (g_hLib)
	{
		FreeLibrary(g_hLib);
		g_hLib		= NULL;
	}
}