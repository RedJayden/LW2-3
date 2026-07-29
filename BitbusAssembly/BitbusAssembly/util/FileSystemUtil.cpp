#include "stdafx.h"
#include "FileSystemUtil.h"

namespace File
{
	DWORD Write( LPCTSTR path , LPBYTE pData , int Size , DWORD* ErrorCode )
	{
		HandlePtr handle = GetHandle( path );
		if ( handle.Get() == INVALID_HANDLE_VALUE )
		{
			if ( ErrorCode ) *ErrorCode = GetLastError();
			return 0;
		}

		return Write( handle.Get() , pData , Size , ErrorCode );
	}

	DWORD Write( HANDLE h , LPBYTE pData , int Size , DWORD* ErrorCode )
	{
		DWORD written_byte = 0;
		if ( !::WriteFile( h , pData , Size , &written_byte , NULL ) )
		{
			if ( ErrorCode ) *ErrorCode = GetLastError();
			return 0;
		}

		return written_byte;
	}

	DWORD WriteLn( LPCTSTR path , LPBYTE pData , int Size , DWORD* ErrorCode )
	{
		HandlePtr handle = GetHandle( path );
		if ( handle.Get() == INVALID_HANDLE_VALUE )
		{
			if ( ErrorCode ) *ErrorCode = GetLastError();
			return 0;
		}

		return WriteLn( handle.Get() , pData , Size , ErrorCode );	
	}

	DWORD WriteLn( HANDLE h , LPBYTE pData , int Size , DWORD* ErrorCode )
	{
		SetFilePointer( h , 0 , NULL , FILE_END );
		DWORD Written = Write( h , pData , Size , ErrorCode );
		if ( Written <= 0 )
		{
			if ( ErrorCode ) *ErrorCode = GetLastError();
			return 0;
		}

		return Written;
	}

	FileBuffer Read( LPCTSTR path , int ReadSize , int AdditionalSize , DWORD* ErrorCode )
	{
		HandlePtr Handle = GetHandle( path );
		if ( Handle.Get() == INVALID_HANDLE_VALUE )
		{
			if ( ErrorCode ) *ErrorCode = GetLastError();
			return FileBuffer( nullptr , 0 );
		}

		return Read( Handle.Get() , ReadSize , AdditionalSize , ErrorCode );
	}

	FileBuffer Read( HANDLE h , int ReadSize , int AdditionalSize , DWORD* ErrorCode )
	{
		if ( ReadSize == READ_ALL ) ReadSize = (int)File::GetSize( h );
		
		int BufferSize = ReadSize + AdditionalSize;
		BytePtr BufferPtr( new BYTE[BufferSize] { 0 } );

		DWORD ReadByte = 0;
		BOOL Ret = ReadFile( h , (LPVOID)BufferPtr.Get() , ReadSize , &ReadByte , NULL );
		if ( ErrorCode ) *ErrorCode = GetLastError();
		
		return Ret ? FileBuffer( std::move(BufferPtr) , ReadByte ) : FileBuffer( nullptr , 0 );
	}

	HandlePtr GetHandle( LPCTSTR path )
	{
		return HandlePtr( CreateFile( path , GENERIC_READ|GENERIC_WRITE , FILE_SHARE_READ|FILE_SHARE_WRITE , NULL , OPEN_ALWAYS , FILE_ATTRIBUTE_NORMAL , NULL ) );
	}

	BOOL Delete( LPCTSTR FilePath )
	{
		return ::DeleteFile( FilePath );
	}

	BOOL  ChageName( LPCTSTR FilePath , LPCTSTR NewFilePath , BOOL DeleteDestPathNewFile )
	{
		if ( DeleteDestPathNewFile )
			Delete( NewFilePath );

		return MoveFile( FilePath , NewFilePath );
	}

	BOOL IsExist( LPCTSTR path , HandlePtr* Result )
	{
		WIN32_FIND_DATA FileInfo = { 0 , };

		HANDLE Searching = FindFirstFile( path , &FileInfo );
		if ( Searching == INVALID_HANDLE_VALUE  ) return FALSE;
	
		FindClose( Searching );

		if ( Result ) *Result = std::move( File::GetHandle( path ) );

		return TRUE;
	}

	FileSize GetSize( LPCTSTR FilePath )
	{
		HandlePtr handle = GetHandle( FilePath );
		if ( handle.Get() == INVALID_HANDLE_VALUE ) return 0;		

		return GetSize( handle.Get() );
	}

	FileSize GetSize( HANDLE h )
	{
		DWORD High = 0;
		DWORD Low  = ::GetFileSize( h , &High );

		FileSize Ret = High;

		return (Ret << 32) | Low;
	}
};

namespace USB
{
	CString GetLastDriverName( DWORD* Error )
	{
		TCHAR Driver[MAX_PATH] = { 0 , };
        if ( GetLogicalDriveStrings( MAX_PATH , Driver ) <= 0 )
        {
            if ( Error ) *Error = GetLastError();
            return CString();
        }

        HighOrderVector<CString> Tokens = Str::Tokenizer( Driver , _T('\0') );
		if ( Tokens.empty() ) return _T("");

        HighOrderVector<CString>::iterator Ret = std::find_if( Tokens.begin() , Tokens.end() , []( const CString& Driver )
        {
            return ( GetDriveType( Driver ) == DRIVE_REMOVABLE );
        });

        return Ret == Tokens.end() ? _T("") : (*Ret);
	}
};