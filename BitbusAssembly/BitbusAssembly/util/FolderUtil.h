#pragma once

#include <functional>

// SearchFunction 함수가 TRUE 리턴 하면 파일 찾기를 계속 수행하며, FALSE 리턴하면 중단된다.
using SearchFunction = std::function<BOOL(const WIN32_FIND_DATA&)>;

namespace FolderUtil
{
	CString GetFullDirectoryPath( BOOL LastSlash = TRUE );
	void    CreateFolder( const CString& FolderPath , BOOL FirstDeleteFolder );
	BOOL	ExistFolder( LPCTSTR FolerPath );

	CString ShowFolderSelectDialog( HWND Parent , LPCTSTR Title , LPCTSTR FirstFolderPath = NULL );
	int		ShowFileSelectDialog( BOOL SingleSelect , LPCTSTR Filter , CStringArray& SelectedFile );
	int     CopyFolderToFolder( CString SrcFolder , CString DestFolder , LPCTSTR Title );
	void    CreateFolder( const CString& FolderPath , BOOL FirstDeleteFolder );
	void    DeleteFolder( const CString& FolerPath);

	BOOL Search( CString DirPath , const CString& Ext , SearchFunction Func );

	BOOL OpenExplorerAndSelect( const CString& FolderPath , const std::list<CString>& FilePath );
};