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

    // 파일의 정보를 접근하기 위한 권한만 가진 핸들을 열때
    HandlePtr  GetFileAttributeHandle( LPCTSTR path , DWORD* Err );

    // 파일의 내용을 읽기 위한 권한만 가진 핸들을 열때
    HandlePtr GetReadableHandle( LPCTSTR path , DWORD* Err );

	DWORD	   Write( LPCTSTR path , LPBYTE pData , int Size , DWORD* ErrorCode );
	DWORD	   Write( HANDLE h , LPBYTE pData , int Size , DWORD* ErrorCode );

	DWORD	   WriteLn( LPCTSTR path , LPBYTE pData , int Size , DWORD* ErrorCode );
	DWORD	   WriteLn( HANDLE h , LPBYTE pData , int Size , DWORD* ErrorCode );

	FileBuffer Read( LPCTSTR path , int ReadSize , int AdditionalSize , DWORD* ErrorCode );
	FileBuffer Read( HANDLE h , int ReadSize , int AdditionalSize , DWORD* ErrorCode );

	BOOL	   Delete( LPCTSTR FilePath );
	BOOL	   ChageName( LPCTSTR FilePath , LPCTSTR NewFilePath , BOOL DeleteDestPathNewFile );
	BOOL	   IsExist( LPCTSTR path , HandlePtr* Result );

	FileSize   GetSize( LPCTSTR FilePath , DWORD* Err );
	FileSize   GetSize( HANDLE h , DWORD* Err );
};

namespace USB
{
	CString GetLastDriverName( DWORD* Error );
};