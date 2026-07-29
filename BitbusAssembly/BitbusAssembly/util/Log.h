#pragma once

namespace Log
{
	void Init();
	void Release();

	void SetDirectory( LPCTSTR Dir );
	void Write( LPCTSTR Text , ... );
};