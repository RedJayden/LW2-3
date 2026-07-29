#include "pch.h"
#include "SystemUtil.h"

namespace System
{
	namespace Power
	{
		BOOL PowerOff()
		{
			if (!Security::EnableSecurityToken(SE_SHUTDOWN_NAME, TRUE)) return FALSE;

			if (!ExitWindowsEx(EWX_SHUTDOWN, SHTDN_REASON_MAJOR_POWER)) return FALSE;

			return TRUE; // maybe can not approach this code.
		}

		BOOL Reboot()
		{
			if (!Security::EnableSecurityToken(SE_SHUTDOWN_NAME, TRUE)) return FALSE;

			if (!ExitWindowsEx(EWX_REBOOT, SHTDN_REASON_MAJOR_APPLICATION)) return FALSE;

			return TRUE; // maybe can not approach this code.
		}
	}

	namespace Security
	{
		BOOL HasSecurityToken(LPCTSTR token_name, LUID* out)
		{
			if (!token_name) return FALSE;

			LUID luid = { 0 , };
			if (!LookupPrivilegeValue(NULL, token_name, &luid)) return FALSE;

			if (out) *out = luid;

			return TRUE;
		}

		BOOL EnableSecurityToken(LPCTSTR token_name, BOOL enable)
		{
			LUID luid = { 0 , };
			if (!HasSecurityToken(token_name, &luid)) return FALSE;

			TOKEN_PRIVILEGES tp = { 0 , };

			tp.PrivilegeCount = 1;
			tp.Privileges[0].Luid = luid;

			if (enable) tp.Privileges[0].Attributes = SE_PRIVILEGE_ENABLED;
			else		  tp.Privileges[0].Attributes = 0;

			HANDLE hToken = NULL;
			if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES, &hToken)) return FALSE;

			BOOL  ret = AdjustTokenPrivileges(hToken, FALSE, &tp, sizeof(TOKEN_PRIVILEGES), NULL, NULL);
			DWORD last_error = GetLastError();

			CloseHandle(hToken);

			SetLastError(last_error);

			return ret;
		}
	};

	namespace CPU
	{
		int LogicalNumOfProcessor()
		{
			SYSTEM_INFO si = { 0 };
			GetSystemInfo(&si);

			return (int)si.dwNumberOfProcessors;
		}
	};
};
