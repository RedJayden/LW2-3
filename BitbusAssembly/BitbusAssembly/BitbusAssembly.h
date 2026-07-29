#pragma once

#ifndef __AFXWIN_H__
	#error "PCH에 대해 이 파일을 포함하기 전에 'pch.h'를 포함합니다."
#endif

#include "resource.h"

#ifdef BITBUSASSEMBLY_APP	// exe 실행 파일 빌드 할 때

class CBitbusAssemblyApp : public CWinApp
{
public:

	CBitbusAssemblyApp();

private:

	virtual BOOL InitInstance();
	DECLARE_MESSAGE_MAP()
};

extern CBitbusAssemblyApp theApp;

#endif