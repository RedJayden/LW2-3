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
	void			Release();
	Invoke::Entry*	GetEntry( Invoke::AccKey Key );
	void			SetEntry( Invoke::AccKey Key , Invoke::Entry* pEntry );
	void			CloseEntry( Invoke::AccKey Key );
	void			CloseEntry( const Invoke::Entry* pEntry );

	BOOL			WaitForEntry( Invoke::AccKey Key , BOOL FinishReq , DWORD WaitTick );
};
