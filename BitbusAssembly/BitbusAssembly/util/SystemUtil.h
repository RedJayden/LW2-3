#pragma once

namespace System
{
	namespace Power
	{
		BOOL PowerOff();
        BOOL Reboot();
	};

	namespace Security
	{
		BOOL HasSecurityToken( LPCTSTR token_name , LUID* out );
		BOOL EnableSecurityToken( LPCTSTR token_name , BOOL enable );
	};
};