#pragma once
#include "..\Util\HighOrderContainer.h"
#include "..\pch.h"

namespace NetUtil
{
	BOOL SocketInit();
	void SocketRelease();

	HighOrderVector<CStringA> GetIPAddress( int* ErrorCode = NULL );
    BOOL Ping( const CStringA& IP );
};