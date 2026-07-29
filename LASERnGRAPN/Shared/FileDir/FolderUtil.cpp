#include "pch.h"
#include "FolderUtil.h"

namespace FolderUtil
{
	CString GetRootDirectoryPath()
	{// 실행파일의 상위 폴더 경로를 구한다. ROOT 폴더
		TCHAR exe_path[MAX_PATH] = { 0 };
		// 실행 파일의 전체 경로를 가져옵니다.
		::GetModuleFileName(NULL, exe_path, MAX_PATH);

		// 파일명을 제거하여 실행 파일의 디렉터리 경로를 얻습니다. (예: C:\Project\bin)
		PathRemoveFileSpec(exe_path);

		// 다시 한 번 파일명을 제거하여 상위 디렉터리 경로를 얻습니다. (예: C:\Project)
		PathRemoveFileSpec(exe_path);

		return CString(exe_path);
	}

	CString GetFullDirectoryPath(BOOL LastSlash)
	{// 실행파일의 경로를 구한다. bin 폴더 경로
		TCHAR exe_path[MAX_PATH] = { 0 , };
		::GetModuleFileName(NULL, exe_path, MAX_PATH);
		PathRemoveFileSpec(exe_path);

		if (LastSlash) PathAddBackslash(exe_path);

		return CString(exe_path);
	}
	void CreateFolder(const CString& FolderPath)
	{
		SHCreateDirectoryEx(NULL, (LPCTSTR)FolderPath, NULL);
	}

	BOOL ExistFolder(LPCTSTR FolerPath)
	{
		return PathFileExists(FolerPath);
	}

	namespace Private
	{
		int CALLBACK BrowseCallbackProc(HWND hwnd, UINT uMsg, LPARAM lParam, LPARAM lpData)
		{
			if (uMsg == BFFM_INITIALIZED)
				SendMessage(hwnd, BFFM_SETSELECTION, TRUE, lpData);

			return 0;
		}
	};

	CString ShowFolderSelectDialog(HWND Parent, LPCTSTR Title, LPCTSTR FirstFolderPath)
	{
		BROWSEINFO  BrInfo = { 0 , };
		TCHAR pszPathname[MAX_PATH] = { 0 , };
		TCHAR FirstFolderPathBuffer[MAX_PATH] = { 0 , };

		CString FirstFolder;
		if (FirstFolderPath && *FirstFolderPath)
			FirstFolder = CString(FirstFolderPath);
		else
			FirstFolder = FolderUtil::GetFullDirectoryPath(TRUE);

		_tcscpy_s(FirstFolderPathBuffer, MAX_PATH, (LPCTSTR)FirstFolder);

		BrInfo.hwndOwner = Parent;
		BrInfo.pszDisplayName = pszPathname;
		BrInfo.lpszTitle = Title;
		BrInfo.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE;
		BrInfo.lpfn = Private::BrowseCallbackProc;
		BrInfo.lParam = (LPARAM)(LPCTSTR)FirstFolderPathBuffer;

		LPITEMIDLIST pidlBrowse = ::SHBrowseForFolder(&BrInfo);
		if (!pidlBrowse) return _T("");

		TCHAR SelectedPath[MAX_PATH] = { 0 , };
		SHGetPathFromIDList(pidlBrowse, SelectedPath);
		CoTaskMemFree(pidlBrowse);

		return SelectedPath;
	}

	int ShowFileSelectDialog(BOOL SingleSelect, LPCTSTR Filter, CStringArray& SelectedFile)
	{
		CFileDialog dlg(TRUE, NULL, NULL,
			SingleSelect ? OFN_HIDEREADONLY : OFN_HIDEREADONLY | OFN_ALLOWMULTISELECT,
			!Filter ? _T("All Files(*.*)|*.*||") : Filter, NULL, 0, FALSE);

		if (IDOK != dlg.DoModal()) return 0;

		for (POSITION pos = dlg.GetStartPosition(); pos != NULL; )
			SelectedFile.Add(dlg.GetNextPathName(pos));

		return (int)SelectedFile.GetCount();
	}

	int CopyFolderToFolder(CString SrcFolder, CString DestFolder, LPCTSTR Title)
	{
		if (SrcFolder.IsEmpty() || DestFolder.IsEmpty()) return FALSE;

		// SHFileOperation 함수에서 파일 및 폴더를 삭제할때는 파일경로 마지막에 널 문자가 2번 존재해야 한다.
		SrcFolder.AppendChar(_T('\0'));
		DestFolder.AppendChar(_T('\0'));

		SHFILEOPSTRUCT shfo = { 0 , };

		shfo.hwnd = AfxGetMainWnd()->m_hWnd;
		shfo.wFunc = FO_COPY;
		shfo.pTo = DestFolder;
		shfo.pFrom = SrcFolder;
		shfo.fFlags = FOF_NOCONFIRMATION | FOF_NOCONFIRMMKDIR | FOF_RENAMEONCOLLISION;

		shfo.lpszProgressTitle = Title;

		return SHFileOperation(&shfo);  // zero is success
	}

	void CreateFolder(const CString& FolderPath, BOOL FirstDeleteFolder)
	{
		if (FirstDeleteFolder)
			DeleteFolder(FolderPath);

		SHCreateDirectoryEx(NULL, (LPCTSTR)FolderPath, NULL);
	}

	void  DeleteFolder(const CString& FolerPath)
	{
		CFileFind Finder;
		BOOL Working = Finder.FindFile(FolerPath + _T("\\*.*"));
		while (Working)
		{
			Working = Finder.FindNextFile();
			if (Finder.IsDots()) continue;

			CString FilePath = Finder.GetFilePath();
			if (Finder.IsDirectory())  DeleteFolder(FilePath);
			else					   DeleteFile(FilePath);
		}
		Finder.Close();
		RemoveDirectory(FolerPath);
	}

	BOOL Search(CString DirPath, const CString& Ext, SearchFunction Func)
	{
		TCHAR LastCh = DirPath.GetAt(DirPath.GetLength() - 1);
		if (LastCh != _T('\\')) DirPath.AppendChar(_T('\\'));

		if (Ext.IsEmpty()) DirPath += _T("*.*");
		else				 DirPath += _T("*.") + Ext;

		WIN32_FIND_DATA Finder = { 0 , };
		HANDLE hFind = FindFirstFile(DirPath, &Finder);
		DWORD LastError = GetLastError();

		// FindFirstFile 함수는 INVALID_HANDLE_VALUE(-1)를 리턴 하는 경우는 두가지.
		// 1. FindFirstFile 함수 호출 자체의 실패.
		// 2. 찾을려는 파일 없음.
		// 두가지 경우에 대한 분별은 GetLastError 리턴값을 추가적으로 확인 필요.
		// 2번의 경우 GetLastError 함수는 ERROR_FILE_NOT_FOUND(2) 리턴.
		if (hFind == INVALID_HANDLE_VALUE) return FALSE;		// 1번, 1번의 경우 함수 호출 실패
		if (LastError == ERROR_FILE_NOT_FOUND) return TRUE;	// 2번, 2번의 경우 함수 호출 성공

		do
		{
			if (!Func(Finder)) break;

		} while (FindNextFile(hFind, &Finder));

		FindClose(hFind);

		return TRUE;
	}
};