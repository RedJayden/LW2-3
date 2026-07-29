#pragma once

using Second  = int;
using MillSec = ULONGLONG;

namespace Time
{
	CTime		AddSec( const CTime& Now , int Sec );
	MillSec		Subtract( const ULARGE_INTEGER& lhs ,  const ULARGE_INTEGER& rhs );
	CTimeSpan	Subtract( const CTime& lhs , const CTime& rhs );
	CTimeSpan	SubtractFromNow( const CTime& rhs );
	CTimeSpan   ToTimeSpan( DWORD Tick , int* MilliSec );

	CString GetTimeString( const CTimeSpan& Span , const CString& HourSuffix , const CString& MinSuffix , const CString& SecondSuffix );
	CString GetNowFileName( TCHAR DateStep = _T('_') , TCHAR BetweenStep = _T('_') ,TCHAR TimeStep = _T('_') );
	CString GetFileName( const CTime& Time );
	CString GetFileName( const CTime& Time , const CString& Ext );
	CString GetNowTimeString( CTime Now = CTime::GetCurrentTime() );
	CString GetNowDateTimeString( CTime Now = CTime::GetCurrentTime() );

	ULARGE_INTEGER GetNowUI();
};

#define NOW() CTime::GetCurrentTime()