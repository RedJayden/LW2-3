#pragma once
#include <utility>
#include <minwindef.h>
#include "MemoryUtil.h"

using FileSize   = __int64;
using FileBuffer = std::pair< BytePtr , int >;

#define READ_ALL (0)

namespace File
{
	HandlePtr  GetHandle( LPCTSTR path );

	DWORD	   Write( LPCTSTR path , LPBYTE pData , int Size , DWORD* ErrorCode );
	DWORD	   Write( HANDLE h , LPBYTE pData , int Size , DWORD* ErrorCode );

	DWORD	   WriteLn( LPCTSTR path , LPBYTE pData , int Size , DWORD* ErrorCode );
	DWORD	   WriteLn( HANDLE h , LPBYTE pData , int Size , DWORD* ErrorCode );

	FileBuffer Read( LPCTSTR path , int ReadSize , int AdditionalSize , DWORD* ErrorCode );
	FileBuffer Read( HANDLE h , int ReadSize , int AdditionalSize , DWORD* ErrorCode );

	BOOL	   Delete( LPCTSTR FilePath );
	BOOL	   ChageName( LPCTSTR FilePath , LPCTSTR NewFilePath , BOOL DeleteDestPathNewFile );
	BOOL	   IsExist( LPCTSTR path , HandlePtr* Result );

	FileSize   GetSize( LPCTSTR FilePath );
	FileSize   GetSize( HANDLE h );
};

namespace USB
{
	CString GetLastDriverName( DWORD* Error );
};