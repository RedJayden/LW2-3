#include "pch.h"
#include "TimeUtil.h"
#include <atltime.h>

namespace Time
{
	CTime AddSec( const CTime& lhs , int Sec )
	{
		return CTime( lhs + CTimeSpan( 0 , 0 , 0 , Sec ) );
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

		return StrC( _T("%d%s%d%s%d%s") , Hours , HourSuffix , Minutes , MinSuffix , Seconds , SecondSuffix );
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

	CString GetTimeString( CTime Time )
	{
		return Time.Format( _T("%H:%M:%S") );
	}

    CString GetMDateTimeString()
    {
        SYSTEMTIME st = { 0 };
        GetSystemTime( &st );
        GetLocalTime( &st );

        return StrC( _T("%d-%02d-%02d %02d:%02d:%02d:%03d") , st.wYear , st.wMonth , st.wDay ,
                                                 st.wHour , st.wMinute , st.wSecond , st.wMilliseconds );
    }

    CString GetMDateTimeString( const FILETIME& ft , TCHAR DateStep , TCHAR DateTimeStep , TCHAR TimeStep )
    {
        SYSTEMTIME st = { 0 };
        FileTimeToSystemTime( &ft , &st );

        return StrC( _T("%d%c%d%c%d%c%d%c%d%c%d%c%d") ,  st.wYear , DateStep , st.wMonth , DateStep , st.wDay ,
                                                        DateTimeStep ,
                                                        st.wHour , TimeStep , st.wMinute , TimeStep , st.wSecond , TimeStep , st.wMilliseconds );
    }

	CString GetDateTimeString( CTime Time )
	{
		return Time.Format( _T("%Y-%m-%d %H:%M:%S") );
	}

    ULARGE_INTEGER FileTimeToLargeInt( const FILETIME& ft )
    {        
        ULARGE_INTEGER Ret;
        Ret.HighPart = ft.dwHighDateTime;
        Ret.LowPart  = ft.dwLowDateTime;

        return Ret;
    }

    CompareResult Compare( const FILETIME& lhs , const FILETIME& rhs )
    {
        ULARGE_INTEGER Left  { lhs.dwLowDateTime , lhs.dwHighDateTime };
        ULARGE_INTEGER Right { rhs.dwLowDateTime , rhs.dwHighDateTime };

        if ( Left.QuadPart > Right.QuadPart ) return CompareResult::Left;
        if ( Left.QuadPart < Right.QuadPart ) return CompareResult::Right;

        return CompareResult::Equal;
    }

	ULARGE_INTEGER GetUI()
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