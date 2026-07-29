#pragma once

using Second  = int;
using MillSec = ULONGLONG;

enum class CompareResult 
{
    Left,
    Right,
    Equal,
};

namespace Time
{
	CTime		AddSec( const CTime& lhs , int Sec );
	MillSec		Subtract( const ULARGE_INTEGER& lhs ,  const ULARGE_INTEGER& rhs );
	CTimeSpan	Subtract( const CTime& lhs , const CTime& rhs );
	CTimeSpan	SubtractFromNow( const CTime& rhs );
	CTimeSpan   ToTimeSpan( DWORD Tick , int* MilliSec );

	CString GetTimeString( const CTimeSpan& Span , const CString& HourSuffix , const CString& MinSuffix , const CString& SecondSuffix );
    CString GetTimeString( CTime Now = CTime::GetCurrentTime() );
    CString GetMDateTimeString();
    CString GetMDateTimeString( const FILETIME& ft , TCHAR DateStep , TCHAR DateTimeStep , TCHAR TimeStep );

	CString GetFileName( TCHAR DateStep = _T('_') , TCHAR BetweenStep = _T('_') ,TCHAR TimeStep = _T('_') );
	CString GetFileName( const CTime& Time );
	CString GetFileName( const CTime& Time , const CString& Ext );
	CString GetDateTimeString( CTime Now = CTime::GetCurrentTime() );

    ULARGE_INTEGER FileTimeToLargeInt( const FILETIME& st );

    CompareResult Compare( const FILETIME& lhs , const FILETIME& rhs );

	ULARGE_INTEGER GetNowUI();
};

#define NOW() CTime::GetCurrentTime()