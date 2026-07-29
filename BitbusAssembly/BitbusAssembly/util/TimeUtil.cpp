#include "stdafx.h"
#include "TimeUtil.h"
#include <atltime.h>

namespace Time
{
	CTime AddSec( const CTime& Now , int Sec )
	{
		return CTime( Now + CTimeSpan( 0 , 0 , 0 , Sec ) );
	}

	MillSec Subtract( const ULARGE_INTEGER& lhs ,  const ULARGE_INTEGER& rhs )
	{
		return (lhs.QuadPart - rhs.QuadPart) / 10000;
	}

	CTimeSpan Subtract( const CTime& lhs , const CTime& rhs )
	{
		return CTimeSpan( lhs - rhs );
	}

	CTimeSpan SubtractFromNow( const CTime& rhs )
	{
		return Subtract( CTime::GetCurrentTime() , rhs );
	}

	CTimeSpan ToTimeSpan( DWORD Tick , int* MilliSec )
	{
		if ( MilliSec ) *MilliSec = Tick % 1000;

		int TotalSeconds = Tick / 1000;
		int Days		 = TotalSeconds / 86400;
		int Hours		 = (TotalSeconds % 86400) / 3600;
		int Minutes		 = (TotalSeconds % 3600) / 60;
		int Seconds		 = TotalSeconds % 60;

		return CTimeSpan( Days , Hours , Minutes , Seconds );
	}

	CString GetTimeString( const CTimeSpan& Span , const CString& HourSuffix , const CString& MinSuffix , const CString& SecondSuffix )
	{
		int Hours	= Span.GetHours();
		int Minutes = Span.GetMinutes() % 60;
		int Seconds = Span.GetSeconds() % 60;

		return STR( _T("%d%s%d%s%d%s") , Hours , HourSuffix , Minutes , MinSuffix , Seconds , SecondSuffix );
	}

	CString GetNowFileName( TCHAR DateStep , TCHAR BetweenStep ,TCHAR TimeStep )
	{
		SYSTEMTIME st = { 0 , };
		GetLocalTime( &st );
		
		CString DateTimeString;
		DateTimeString.Format( _T("%04d%c%02d%c%02d%c%02d%c%02d%c%02d%c%03d"), 
			st.wYear , DateStep , st.wMonth , DateStep , st.wDay ,
			BetweenStep ,
			st.wHour , TimeStep , st.wMinute , TimeStep , st.wSecond , TimeStep , st.wMilliseconds );

		return DateTimeString;
	}

	CString GetFileName( const CTime& Time )
	{
		return GetFileName( Time , _T("") );
	}

	CString GetFileName( const CTime& Time , const CString& Ext )
	{
		if ( Ext.IsEmpty() ) return Time.Format( _T("%Y_%m_%d_%H_%M_%S") );

		return Time.Format( _T("%Y_%m_%d_%H_%M_%S") ) + _T(".") + Ext;
	}

	CString GetNowTimeString( CTime Now )
	{
		return Now.Format( _T("%H:%M:%S") );
	}

	CString GetNowDateTimeString( CTime Now )
	{
		return Now.Format( _T("%Y-%m-%d %H:%M:%S") );
	}

	ULARGE_INTEGER GetNowUI()
	{
		SYSTEMTIME st = { 0 , };
		FILETIME   ft;

		GetLocalTime( &st );
		SystemTimeToFileTime( &st , &ft );

		ULARGE_INTEGER ret;

		ret.HighPart = ft.dwHighDateTime;
		ret.LowPart  = ft.dwLowDateTime;

		return ret;
	}
};