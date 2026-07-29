#include "stdafx.h"
#include "Log.h"
#include <atlstr.h>

namespace Log
{
	const int MAX_BUF_SIZE = 4096;
	const int HOUR = 60*60;
	const int DAY  = HOUR * 24;

	static CString _carrige_return		 = _T("\r\n");
	static CString _log_file_name_format = _T("%Y-%m-%d.txt");
	static CString _log_time_format		 = _T("[%Y-%m-%d %H:%M:%S] ");

	namespace Private
	{
		CString _loot_dir;
		CRITICAL_SECTION cs_;
		CTime _last_clean;

		LONG _init_count = 0;
	};

	void Init() 
	{ 
		InitializeCriticalSectionAndSpinCount( &Private::cs_ , 3000 ); 
		SetDirectory( FolderUtil::GetFullDirectoryPath() + _T("Log\\") );

		InterlockedIncrement( &Private::_init_count );
	}

	void Release() 
	{ 
		DeleteCriticalSection( &Private::cs_ ); 

		InterlockedDecrement( &Private::_init_count );
	}

	void SetDirectory( LPCTSTR Dir ) 
	{ 
		CSPtr RAII( Private::cs_ );

		if ( !FolderUtil::ExistFolder( Dir ) )
			FolderUtil::CreateFolder( Dir , FALSE );

		Private::_loot_dir = Dir; 

		TCHAR last_ch = Private::_loot_dir.GetAt( Private::_loot_dir.GetLength() - 1 );
		if ( last_ch != _T('\\') ) Private::_loot_dir.AppendChar( _T('\\') );
	}

	void CleanLogFile( int MaintainDay )
	{
		Second Gap = (Second)Time::SubtractFromNow( Private::_last_clean ).GetTotalSeconds();

		if ( Gap <= (HOUR*24) ) return;

		CTime BeforeDay = Time::AddSec( CTime::GetCurrentTime() , -(DAY * MaintainDay) );
		
		FolderUtil::Search( Private::_loot_dir , _T("txt") , [&]( const WIN32_FIND_DATA& Info )
		{
			if ( Info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY ) return TRUE;

			CTime LastWriteFileTime = CTime(Info.ftLastWriteTime);

			if ( BeforeDay > LastWriteFileTime )
				File::Delete( Private::_loot_dir + Info.cFileName );

			return TRUE;
		});

		Private::_last_clean = CTime::GetCurrentTime();
	}

	void Log( LPCTSTR LogText , va_list ap )
	{
		if ( Private::_init_count <=0 ) return;

		CSPtr RAII( Private::cs_ );
		
		CTime Now = CTime::GetCurrentTime();

		CleanLogFile( 30 );

		TCHAR buffer[MAX_BUF_SIZE] = { 0 , };
		_vstprintf_s( buffer , LogText , ap );

		CString LogTime     = Now.Format( _log_time_format );
		CString FileName    = Now.Format( _log_file_name_format );
		CString LogFullPath = Private::_loot_dir + FileName;

		HandlePtr Handle = File::GetHandle( LogFullPath );

		CStringA Log;
		Log.Format( "%s%s\r\n" , (CStringA)LogTime , (CStringA)buffer  );

		File::WriteLn( Handle.Get() , (LPBYTE)(LPCSTR)Log , Log.GetLength() , NULL );
	}

	void Write( LPCTSTR Text , ... )
	{
		va_list ap = NULL;
		va_start( ap , Text );

		Log( Text , ap );
	}
};
