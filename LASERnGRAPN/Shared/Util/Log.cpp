#include "pch.h"
#include "Log.h"
#include "..\FileDir\FolderUtil.h"

#ifdef _DEBUG
#define new DEBUG_NEW
#undef THIS_FILE
static char THIS_FILE[]=__FILE__;
#endif

namespace Log
{
	const int MAX_BUF_SIZE = 4096;
	const int HOUR = 60*60;
	const int DAY  = HOUR * 24;

	static CString _carrige_return		 = _T("\r\n");
	static CString _log_file_name_format = _T("%Y-%m-%d.txt");
	static CString _log_time_format		 = _T("[%Y-%m-%d %H:%M:%S] ");

	namespace
	{
		CString _loot_dir;
		CRITICAL_SECTION cs_;
		CTime _last_clean;

		BOOL _Use = FALSE;
	};

	void Init()
	{
		InitializeCriticalSectionAndSpinCount( &cs_ , 3000 );
		SetDirectory( FolderUtil::GetFullDirectoryPath() + _T("Logs\\") );

		_Use = TRUE;
	}

	void Release()
	{
		_Use = FALSE;
		DeleteCriticalSection( &cs_ );
	}

	void SetDirectory( LPCTSTR Dir )
	{
		CSPtr RAII( cs_ );

		if ( !FolderUtil::ExistFolder( Dir ) )
			FolderUtil::CreateFolder( Dir , FALSE );

		_loot_dir = Dir;

		TCHAR last_ch = _loot_dir.GetAt( _loot_dir.GetLength() - 1 );
		if ( last_ch != _T('\\') ) _loot_dir.AppendChar( _T('\\') );
	}

	void CleanLogFile( int MaintainDay )
	{
		Second Gap = (Second)Time::SubtractFromNow( _last_clean ).GetTotalSeconds();

		if ( Gap <= (HOUR*24) ) return;

		CTime BeforeDay = Time::AddSec( CTime::GetCurrentTime() , -(DAY * MaintainDay) );

		FolderUtil::Search( _loot_dir , _T("txt") , [&]( const WIN32_FIND_DATA& Info )
		{
			if ( Info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY ) return TRUE;

			CTime LastWriteFileTime = CTime(Info.ftLastWriteTime);

			if ( BeforeDay > LastWriteFileTime )
				File::Delete( _loot_dir + Info.cFileName );

			return TRUE;
		});

		_last_clean = CTime::GetCurrentTime();
	}

	void Log( LPCTSTR LogText , va_list ap )
	{
		CSPtr RAII( cs_ );

		CTime Now = CTime::GetCurrentTime();

		CleanLogFile( 30 );

		TCHAR buffer[MAX_BUF_SIZE] = { 0 , };
		_vstprintf_s( buffer , LogText , ap );

		CString LogTime  = Now.Format( _log_time_format );
		CString FileName = Now.Format( _log_file_name_format );
		CString LogFullPath = _loot_dir + FileName;

		FolderUtil::CreateFolder( _loot_dir , FALSE );

		HandlePtr Handle = File::GetHandle( LogFullPath );

		CStringA Log;
		Log.Format( "%s%s\r\n" , (CStringA)LogTime , (CStringA)buffer  );

		// TRACE(Log);

		File::WriteLn( Handle.Get() , (LPBYTE)(LPCSTR)Log , Log.GetLength() , NULL );
	}

	void Write( LPCTSTR Text , ... )
	{
		if ( !_Use ) return;

		va_list ap = NULL;
		va_start( ap , Text );

		Log( Text , ap );

		va_end( ap );
	}
};
