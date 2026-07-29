#include "stdafx.h"
#include "UtilCommon.h"
#include "Invoke.h"
#include "Thread.h"
#include "MemoryUtil.h"
#include "SyncContainer.h"
#include "TimeUtil.h"
#include "JobEvent.h"
#include "InvokeMap.h"
#include <Windows.h>

namespace Invoke
{
	namespace UI
	{
		namespace Private
		{
			SyncList< Invoke::Entry* > _entry_list;
			CThread	_invoke_ui_thread;

			unsigned int __stdcall InvokeUIThreadCaller(void*)
			{
				Sleep( 1 );

				Private::_entry_list.Delete( []( const Invoke::Entry* E )
				{
					Invoke::Entry* e = const_cast<Invoke::Entry*>( E );

					if ( GetTickCount() - e->GetLastCallTick() < e->GetIntervalTick() ) return FALSE;

					BOOL Repeat = (BOOL)SendMessage( e->GetHWnd() , WM_UI_INVOKE_CALL , (WPARAM)e , 0 );

					if ( !Repeat || e->IsFinishReqByCaller() ) 
					{
						SetEvent( e->GetFinishHandle() );
						RETURN_F_V( InvokeMap::CloseEntry( e ) , TRUE );
					}
					 
					RETURN_F_V( e->UpdateLastCallTick() , FALSE );
				});

				return 0;
			}
		};

		BOOL Init()
		{	
			return Private::_invoke_ui_thread.Start( Private::InvokeUIThreadCaller , NULL , FALSE );
		}

		JobEvent Once( HWND hDest , Invoke::CallType&& Func )
		{
			Invoke::Entry* pNewEntry = Invoke::Entry::CreateOnce( hDest , std::move( Func ) );

			HANDLE Copyed = NULL;
			DuplicateHandle( GetCurrentProcess() , pNewEntry->GetFinishHandle() , 
							 GetCurrentProcess() , &Copyed , 0 , FALSE , DUPLICATE_SAME_ACCESS );

			Private::_entry_list.PushBack( pNewEntry );

			return JobEvent( Copyed , Invoke::NO_KEY );
		}

		JobEvent Repeat( HWND hDest , Invoke::AccKey Key , DWORD Interval , Invoke::RecallType&& Func )
		{
			Invoke::Entry* pNewEntry = Invoke::Entry::CreateRepeat( hDest , Key , Interval , std::move( Func ) );

			HANDLE Copyed = NULL;
			DuplicateHandle( GetCurrentProcess() , pNewEntry->GetFinishHandle() , 
							 GetCurrentProcess() , &Copyed , 0 , FALSE , DUPLICATE_SAME_ACCESS );

			Private::_entry_list.PushBack( pNewEntry );

			return JobEvent( Copyed , Key );
		}

		JobEvent Update( HWND Dest , Invoke::AccKey Key , DWORD Interval , Invoke::RecallType&& Func )
		{
			if ( Key == Invoke::NO_KEY ) return JobEvent();

			Invoke::Entry* p = InvokeMap::GetEntry( Key );
			if ( !p ) return Invoke::UI::Repeat( Dest , Key , Interval , std::move(Func) );
			
			p->SetIntervalTick( Interval );
			p->SetReCallBack( std::move( Func ) );

			HANDLE Copyed = NULL;
			DuplicateHandle( GetCurrentProcess() , p->GetFinishHandle() , 
							 GetCurrentProcess() , &Copyed , 0 , FALSE , DUPLICATE_SAME_ACCESS );

			InvokeMap::CloseEntry( p );

			return JobEvent( Copyed , Key );
		}
	};

	namespace Worker
	{
		namespace Private
		{
			SyncList< Job* > _job_list;

			CThread _work_req_process_thread;

			unsigned int __stdcall WorkRequestProcessFunc( void* p )
			{
				Sleep( 1 );

				_job_list.Delete( []( const Job* pcValue )
				{
					Job*			pJob   = (Job*)pcValue;
					Invoke::Entry*	pEntry = (Invoke::Entry*)pJob;

					if ( pJob->GetReq() == Req::Finish || pEntry->IsFinishReqByCaller() ) 
						RETURN_F_V( InvokeMap::CloseEntry( pEntry ) , TRUE );

					if ( pJob->GetRes() == Res::CallDone ) return FALSE;
						
					DWORD LastCallTick = pEntry->GetLastCallTick();
					DWORD IntervalTick = pEntry->GetIntervalTick();

					if ( GetTickCount() - LastCallTick > IntervalTick )
					{
						pJob->WaitFinish();
						pJob->SetRes( Res::CallDone );
						pJob->Submit();
					}
						
					return FALSE;
				});
				
				return 0;
			}

			void __stdcall CallbackStub( PTP_CALLBACK_INSTANCE Instance , PVOID Context , PTP_WORK Work )
			{
				if ( Invoke::IsReleaseDone() ) return;

				Invoke::Job*	pJob   = (Invoke::Job*)Context;
				Invoke::Entry*	pEntry = (Invoke::Entry*)pJob;

				__try
				{
					if ( !pEntry->Call() ) RETURN( pJob->SetReq( Req::Finish ) );
				}
				__except( EXCEPTION_EXECUTE_HANDLER ) {}

				pJob->SetReq( Req::CallAgin );
				pJob->SetRes( Res::None );
				pEntry->UpdateLastCallTick();
			}

			void __stdcall LongCallbackStub( PTP_CALLBACK_INSTANCE Instance , PVOID Context , PTP_WORK Work )
			{
				if ( Invoke::IsReleaseDone() ) return;

				CallbackMayRunLong( Instance );

				Invoke::Job* pJob = (Invoke::Job*)Context;

				__try
				{
					pJob->Call();
				}
				__except( EXCEPTION_EXECUTE_HANDLER ) {}
				
				pJob->SetReq( Req::Finish );
				pJob->SetRes( Res::None );
			}

			JobEvent CreateThreadPoolCallback( Invoke::AccKey Key , CallbackType Type , void* Callback , DWORD IntervalTick )
			{
				Invoke::Job* pJob = NULL;
				if ( Type == CallbackType::Recall )	
					pJob = Invoke::Job::CreateRepeat( Key , Type , IntervalTick , std::move( *(Invoke::RecallType*)Callback ) );
				else							    
					pJob = Invoke::Job::CreateOnce( Type , std::move( *(Invoke::CallType*)Callback ) );

				HANDLE Copyed = NULL;
				DuplicateHandle( GetCurrentProcess() , pJob->GetFinishHandle() , 
								 GetCurrentProcess() , &Copyed , 0 , FALSE , DUPLICATE_SAME_ACCESS );

				Private::_job_list.PushBack( pJob );

				return JobEvent( Copyed , Key );
			}
		};

		void Init()
		{
			if ( Private::_work_req_process_thread.IsValid() ) return;

			Private::_work_req_process_thread.Start( Private::WorkRequestProcessFunc , NULL , FALSE );
		}

		JobEvent Once( Invoke::CallType&& Func )
		{
			return Private::CreateThreadPoolCallback( Invoke::NO_KEY , CallbackType::Once , &Func , 0 );
		}

		JobEvent LongTerm( Invoke::CallType&& Func )
		{
			return Private::CreateThreadPoolCallback( Invoke::NO_KEY , CallbackType::LongTerm , &Func , 0 );
		}

		JobEvent Repeat( Invoke::AccKey Key , DWORD Interval , Invoke::RecallType&& Func )
		{
			return Private::CreateThreadPoolCallback( Key , CallbackType::Recall , &Func , Interval );
		}

		JobEvent Update( Invoke::AccKey Key , DWORD Interval , Invoke::RecallType&& Func )
		{
			Invoke::Entry* p = InvokeMap::GetEntry( Key );
			if ( !p ) return Private::CreateThreadPoolCallback( Key , CallbackType::Recall , &Func , Interval );

			p->SetIntervalTick( Interval );
			p->SetReCallBack( std::move( Func ) );
			
			HANDLE Copyed = NULL;
			DuplicateHandle( GetCurrentProcess() , p->GetFinishHandle() , 
							 GetCurrentProcess() , &Copyed , 0 , FALSE , DUPLICATE_SAME_ACCESS );

			InvokeMap::CloseEntry( p );

			return JobEvent( Copyed , Key );
		}
	};
};

namespace Invoke
{
	Invoke::Entry* Entry::CreateOnce( HWND hDest , Invoke::CallType&& Callback )
	{
		Invoke::Entry* pEntry = new Invoke::Entry;

        pEntry->m_Dest     = hDest;
		pEntry->m_Callback = std::move(Callback);
		pEntry->m_Finish   = CreateEvent( NULL , TRUE , FALSE , NULL );

		InvokeMap::SetEntry( Invoke::NO_KEY , pEntry );

		return pEntry;
	}

	Invoke::Entry* Entry::CreateRepeat( HWND hDest , Invoke::AccKey Key , DWORD Interval , Invoke::RecallType&& Callback )
	{
		Invoke::Entry* pEntry = new Invoke::Entry;

        pEntry->m_Dest         = hDest;
		pEntry->m_IntervalTick = Interval;
		pEntry->m_IsRecall     = TRUE;
		pEntry->m_Recallback   = std::move(Callback);
		pEntry->m_Finish       = CreateEvent( NULL , TRUE , FALSE , NULL );
		pEntry->m_Key	       = Key;

		InvokeMap::SetEntry( Key , pEntry );

		return pEntry;
	}

	Entry::Entry() 
	{ 
		InitializeCriticalSectionAndSpinCount( &_call , 3000 ); 
	}

	Entry::~Entry() 
	{ 
		SetEvent( m_Finish );
		CLOSE_HANDLE( m_Finish );
		DeleteCriticalSection( &_call );
	}

	BOOL Entry::Call()
	{
		CSPtr CS( _call );

		if ( m_IsRecall ) RETURN_V( m_Recallback() );

		RETURN_F_V( m_Callback() , FALSE );
	}

	void Entry::SetReCallBack( RecallType&& Func )
	{
		CSPtr CS( _call );

		m_Recallback = std::move(Func);
		m_IsRecall   = TRUE;
	}

	void Entry::SetCallBack( CallType&& Func )
	{
		CSPtr CS( _call );

		m_Callback = std::move(Func);
		m_IsRecall = FALSE;
	}
};

namespace Invoke
{
	Invoke::Job* Job::CreateOnce( CallbackType Type , Invoke::CallType&& Callback )
	{
		Invoke::Job* pJob = new Invoke::Job;

		pJob->m_Callback = std::move(Callback);
		pJob->m_Finish   = CreateEvent( NULL , TRUE , FALSE , NULL );

        PTP_WORK_CALLBACK Callbackfn = NULL;

        if ( Type == CallbackType::LongTerm ) Callbackfn = Invoke::Worker::Private::LongCallbackStub;
		else								  Callbackfn = Invoke::Worker::Private::CallbackStub;

        pJob->_work = CreateThreadpoolWork( Callbackfn , pJob , NULL );

		InvokeMap::SetEntry( Invoke::NO_KEY , pJob );

		return pJob;
	}

	Invoke::Job* Job::CreateRepeat( Invoke::AccKey Key , CallbackType Type , DWORD Interval , Invoke::RecallType&& Callback )
	{
		Invoke::Job* pJob = new Invoke::Job;

		pJob->m_IntervalTick = Interval;
		pJob->m_IsRecall     = TRUE;
		pJob->m_Recallback   = std::move(Callback);
		pJob->m_Finish       = CreateEvent( NULL , TRUE , FALSE , NULL );
		pJob->m_Key	         = Key;

        PTP_WORK_CALLBACK Callbackfn = NULL;

		if ( Type == CallbackType::LongTerm ) Callbackfn = Invoke::Worker::Private::LongCallbackStub;
		else								  Callbackfn = Invoke::Worker::Private::CallbackStub;

        pJob->_work = CreateThreadpoolWork( Callbackfn , pJob , NULL );

		InvokeMap::SetEntry( Key , pJob );

		return pJob;
	}
};

namespace Invoke
{
	namespace Private
	{
		CThread _clear_invoke;

		unsigned int __stdcall ClearInvokeThreadFunc( void* p )
		{
			InvokeMap::Release();

			_clear_invoke.Exit(0);

			return 0;
		}
	};

	void Init()
	{
		InvokeMap::Init();
		Invoke::UI::Init();
		Invoke::Worker::Init();

		Invoke::Private::_clear_invoke.Start( Private::ClearInvokeThreadFunc , NULL , TRUE );
	}

	void Release()
	{
		Invoke::Private::_clear_invoke.Resume();
		
        ULONG64 Cur = GetTickCount64();

        while( !IsReleaseDone() && GetTickCount() - Cur < 10000 )
        {
            MSG msg = { 0 };
            GetMessage( &msg , NULL , 0 , 0 );
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }
	}

	BOOL IsReleaseDone()
	{
		return !Private::_clear_invoke.IsValid();
	}
};
