#include "stdafx.h"

#ifdef BITBUSASSEMBLY_APP	// exe 실행 파일 빌드 할 때

#include "framework.h"
#include "BitbusAssembly.h"
#include "BitbusAssemblyDlg.h"

#ifdef _DEBUG
#define new DEBUG_NEW
#endif

BEGIN_MESSAGE_MAP(CBitbusAssemblyApp, CWinApp)
END_MESSAGE_MAP()

CBitbusAssemblyApp::CBitbusAssemblyApp() {}

CBitbusAssemblyApp theApp;

BOOL CBitbusAssemblyApp::InitInstance()
{
	CWinApp::InitInstance();

	CBitbusAssemblyDlg dlg;
	m_pMainWnd = &dlg;
	dlg.DoModal();

	return FALSE;
}

#endif