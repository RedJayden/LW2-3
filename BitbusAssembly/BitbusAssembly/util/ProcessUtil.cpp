#include "stdafx.h"
#include "ProcessUtil.h"

namespace ProcessUtil
{
	namespace Private
	{
		HighOrderList<HWND> _HWNDList;
	};

	HandlePtr Run( LPCTSTR EXEPath , LPCTSTR RunArgument , DWORD* ErrorCode )
	{
		TCHAR Path[MAX_PATH] = { 0 , };
		StringCchCopy( Path , _countof(Path) , (LPCTSTR)STR( _T("%s %s") , EXEPath , RunArgument ) );

		STARTUPINFO si = { 0 , };
		PROCESS_INFORMATION pi = { 0 , };
		si.cb = sizeof(STARTUPINFO);
	
		BOOL  Ret = CreateProcess( NULL , Path , NULL , NULL , FALSE , NORMAL_PRIORITY_CLASS , NULL , NULL , &si , &pi );
		DWORD LastError = GetLastError();
		if ( !Ret )
		{
			if ( ErrorCode ) *ErrorCode = LastError;

			return HandlePtr( NULL );
		}

		CloseHandle( pi.hThread );

		return HandlePtr( std::move( pi.hProcess ) );
	}

	BOOL EnumerateProcess( EnumProcessFunction Func )
	{
		HandlePtr SnapPtr( CreateToolhelp32Snapshot( TH32CS_SNAPPROCESS , 0 ) );
		if ( SnapPtr.Get() == INVALID_HANDLE_VALUE ) return FALSE;

		PROCESSENTRY32 Cur = { 0 , };
		Cur.dwSize = sizeof( PROCESSENTRY32 );
		if ( !Process32First( SnapPtr.Get() , &Cur ) ) return FALSE;

		do
		{
			// 호출자가 넘겨준 함수가 FALSE을 반환할때 까지 프로세스 나열을 계속 한다.
			if ( !Func( Cur ) ) return TRUE;

		} while( Process32Next( SnapPtr.Get() , &Cur ) );

		return TRUE;
	}

	BOOL __stdcall EnumHWNDFunction( HWND h , LPARAM l )
	{
		DWORD lpdwProcessId = 0;
		GetWindowThreadProcessId( h , &lpdwProcessId );
		if( lpdwProcessId == l )
			Private::_HWNDList.push_back( h );

		return TRUE;
	}

	HighOrderList<HWND> PIDToHWNDs( DWORD ProcessID )
	{
		Private::_HWNDList.clear();
		EnumWindows( EnumHWNDFunction , ProcessID );
		return Private::_HWNDList;
	}

};