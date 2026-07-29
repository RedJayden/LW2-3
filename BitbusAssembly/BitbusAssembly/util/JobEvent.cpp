#include "stdafx.h"
#include "JobEvent.h"
#include "Invoke.h"

JobEvent::JobEvent( HANDLE hEvent , int Key )  : m_hEvent( hEvent ) , m_Key( Key ) {}
JobEvent::JobEvent( JobEvent&& rhs ) noexcept : m_hEvent( rhs.ResetHandle() ) , m_Key( rhs.ResetKey() ) {}
JobEvent::~JobEvent() { CLOSE_HANDLE( m_hEvent ); }

JobEvent& JobEvent::operator=( JobEvent&& rhs ) noexcept
{
	if ( m_hEvent )
	{
		SetEvent( m_hEvent );
		CloseHandle( m_hEvent );
	}

	m_hEvent = rhs.ResetHandle();
	m_Key	 = rhs.ResetKey();

	return (*this);
}

HANDLE JobEvent::ResetHandle()
{
	HANDLE h = m_hEvent;
	m_hEvent = NULL;
	return h;
}

int JobEvent::ResetKey()
{
	int Key = m_Key;
	m_Key = Invoke::NO_KEY;
	return Key;
}

BOOL JobEvent::Wait( DWORD WaitTick , DWORD* LastError ) const
{
	if ( !m_hEvent ) 
	{
		if ( LastError ) *LastError = ERROR_INVALID_PARAMETER;
		return FALSE;
	}

	DWORD Ret = WaitForSingleObject( m_hEvent , WaitTick );
	if ( LastError ) *LastError = GetLastError();

	return ( Ret == WAIT_OBJECT_0 );
}

BOOL JobEvent::FinishReqAndWait( DWORD WaitTick , DWORD* LastError ) const
{
	if ( m_Key == Invoke::NO_KEY ) return FALSE;

	Invoke::Entry* pEntry = InvokeMap::GetEntry( Invoke::AccKey(m_Key) );
	if ( !pEntry ) return FALSE;

	pEntry->ReqFinish();

	InvokeMap::CloseEntry( Invoke::AccKey(m_Key) );

	return Wait( WaitTick , LastError );
}

BOOL JobEvent::IsDone() const
{
	DWORD LastError = 0;
	Wait( 0 , &LastError );

	return LastError == WAIT_TIMEOUT;
}

namespace Job
{
	BOOL WaitAll( std::initializer_list<JobEventRef> JobList , BOOL AllComplete , DWORD WaitTick , DWORD* LastError )
	{
		DWORD Count = (DWORD)JobList.size();
		if ( Count <= 0 )
		{
			if  ( LastError ) *LastError = ERROR_INVALID_PARAMETER;
			return FALSE;
		}

		std::vector<HANDLE> Handles;
		Handles.reserve( Count );

		std::for_each( JobList.begin() , JobList.end() , [&Handles]( const JobEventRef& rhs ) 
		{
			Handles.push_back( rhs.get().GetHandle() );
		});

		DWORD Ret = WaitForMultipleObjects( Count , Handles.data() , AllComplete , WaitTick );
		if ( LastError ) *LastError = GetLastError();

		return (WAIT_OBJECT_0 <= Ret) && (Ret <= Count - 1);
	}
}