#pragma once
#include "Invoke.h"

namespace Invoke
{
	class Entry;
	class AccKey;
};

namespace InvokeMap
{
	BOOL			Init();
	void			Release( DWORD64 WaitTick );
    BOOL            IsRelease();
	Invoke::Entry*	GetEntry( Invoke::AccKey Key );
	void			SetEntry( Invoke::AccKey Key , Invoke::Entry* pEntry );
    int             GetCountEntry();
	void			CloseEntry( Invoke::AccKey Key );
	void			CloseEntry( const Invoke::Entry* pEntry );

	BOOL			WaitForEntry( Invoke::AccKey Key , BOOL FinishReq , DWORD WaitTick );
};
