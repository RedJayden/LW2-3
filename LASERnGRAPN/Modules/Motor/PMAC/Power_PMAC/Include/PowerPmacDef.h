
#ifndef __POWERPMACDEF_H__
#define __POWERPMACDEF_H__

typedef enum _DTK_MODE_TYPE
{
	DM_GPASCII			= 0,
	DM_GETSENDS_0		= 1,
	DM_GETSENDS_1		= 2,
	DM_GETSENDS_2		= 3,
	DM_GETSENDS_3		= 4,
	DM_GETSENDS_4		= 5,
	DM_GETSENDS_5		= 6,
	DM_GETSENDS_6		= 7,
	DM_GETSENDS_7		= 8,
	DM_SECURE_SHELL		= 10
} DTK_MODE_TYPE;

typedef enum _DTK_STATUS
{
	DS_Ok					= 0,
	DS_Exception			= 1,
	DS_TimeOut				= 2,
	DS_Connected			= 3,
	DS_NotConnected			= 4,
	DS_Failed				= 5,
	DS_GetSendMode			= 6,
	DS_NotGetSendMode		= 7,
	DS_InvalidDevice		= 11,
	DS_InvalidCommand		= 12,
	DS_InvalidResponse		= 13,
	DS_DataRemains			= 21,
	DS_CmdLengthExceeds		= 23,
	DS_ResLengthExceeds		= 24,
	DS_RunningDownload		= 41,
	DS_RunningRead			= 42,
	DS_DATimeOut			= 102,
	DS_DANotConnected		= 104,
	DS_DAFailed				= 105,
	DS_DASizeExceeds		= 123,
} DTK_STATUS;

typedef enum _DTK_RESET_TYPE
{
	DR_Reset			= 0,
	DR_FullReset		= 1
} DTK_RESET_TYPE;

typedef enum _DTK_DOWNLOAD_TYPE
{
	DT_Progress			= 0,
	DT_StringA			= 1,
	DT_StringW			= 2
} DTK_DOWNLOAD_TYPE;

typedef enum _DTK_DOWNLOAD_MODE
{
	DM_File_Download		= 0,
	DM_File_DownExec		= 1,
	DM_File_DownExecDel		= 2,
	DM_File_DirectBuffer	= 6,
	DM_File_DownAuto		= 11,
} DTK_DOWNLOAD_MODE;

typedef VOID (WINAPI *PDOWNLOAD_PROGRESS)(INT nPercent);
typedef VOID (WINAPI *PDOWNLOAD_MESSAGE_A)(LPSTR lpMessage);
typedef VOID (WINAPI *PDOWNLOAD_MESSAGE_W)(LPWSTR lpwMessage);
typedef VOID (WINAPI *PDOWNLOAD_MESSAGE)(LPTSTR lptMessage);

typedef VOID (WINAPI *PRECEIVE_PROC_A)(LPSTR lpReceive);
typedef VOID (WINAPI *PRECEIVE_PROC_W)(LPWSTR lpwReceive);
typedef VOID (WINAPI *PRECEIVE_PROC)(LPTSTR lptReceive);

#ifndef DOUBLE
typedef double               DOUBLE;
#endif

#ifndef PDOUBLE
typedef double               *PDOUBLE;
#endif

#define WM_MESSAGE_DOWNLOAD		0x1216
#define WM_MESSAGE_RECEIVE		0x1217


#endif	//__POWERPMAC_H__