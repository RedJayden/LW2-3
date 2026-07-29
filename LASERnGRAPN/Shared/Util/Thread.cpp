#include "pch.h"
#include "Thread.h"
#include <process.h>
#include <dbghelp.h>
#include "MemoryUtil.h"

CThread::~CThread()
{
	try
	{
		Exit( INFINITE );
	}
	catch(...) { /*Do Noting*/ }
}

unsigned int __stdcall CThread::ThreadFunStub( void* param )
{
	CThread* this_ = (CThread*)param;
	return this_->ThreadFun();
}

unsigned int CThread::ThreadFun()
{
	if ( !m_Fun ) return -1;

	while ( m_CurRequest != ThreadReq::TERMINATING )
	{
		if ( m_CurRequest == ThreadReq::SLEEP )
		{
			m_CurResponse = ThreadRes::SLEEPING;
			SleepEx( m_dwSleepTick , TRUE );
		}
		
		if ( m_CurRequest == ThreadReq::WORKING )
		{
			m_CurResponse = ThreadRes::WORKING;
			m_Fun( m_pParm );
		}
	}

	m_CurResponse = ThreadRes::TERMINATED;

	return 0;
}

BOOL CThread::Start( ThreadProcType FunctionProc , void* pParm , BOOL Suspend )
{
	if ( !FunctionProc ) return FALSE;

	Exit( INFINITE );

	m_Fun   = std::move( FunctionProc );
	m_pParm = pParm;
	
	if ( Suspend )
	{
		m_CurRequest = ThreadReq::SLEEP;
		m_dwSleepTick = INFINITE;
	}
	else
	{
		m_CurRequest = ThreadReq::WORKING;
	}

	m_hThread = (HANDLE)_beginthreadex( NULL , 0 , ThreadFunStub , this , 0 , (unsigned int*)&m_ThreadID );

	return m_hThread != NULL;
}

void CThread::Exit( DWORD WaitTick )
{
	if ( !m_hThread ) return;

	m_CurRequest = ThreadReq::TERMINATING;
	QueueUserAPC( CThread::WakeUpFn , m_hThread ,  NULL );

	WaitForSingleObject( m_hThread , WaitTick );

	CLOSE_HANDLE( m_hThread );
	m_Fun = NULL;
	m_pParm = NULL;
}

void CThread::Suspend( DWORD dwSleepTick )
{
    // dh.kim 2019-03-12 11:34:52 : 이미 Req::Terminating 요청이 있었다면 무시한다.
    if ( m_CurRequest == ThreadReq::TERMINATING ) return;

	m_CurRequest  = ThreadReq::SLEEP;
	m_dwSleepTick = dwSleepTick;
}

void CThread::Resume()
{
    // dh.kim 2019-03-12 11:34:52 : 이미 Req::Terminating 요청이 있었다면 무시한다.
    if ( m_CurRequest == ThreadReq::TERMINATING || !m_hThread ) return;

	m_CurRequest  = ThreadReq::WORKING;
	m_dwSleepTick = 0;

	QueueUserAPC( CThread::WakeUpFn , m_hThread ,  NULL );
}