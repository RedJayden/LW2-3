#include "pch.h"
#include "Invoke.h"
#include "..\\MemoryUtil.h"
#include "..\\SyncContainer.h"
#include "..\\Thread.h"
#include "..\\TimeUtil.h"
#include "..\\UtilCommon.h"
#include "InvokeMap.h"
#include "JobEvent.h"
#include <Windows.h>
#include <threadpoolapiset.h>

namespace Invoke
{
	namespace UI
	{
		namespace Private
		{
			SyncList<Invoke::Entry*> _func_list;
			CThread _invoke_ui_thread;

			void _release_ui_job(Invoke::Entry* e)
			{
				SetEvent(e->GetFinishHandle());
				InvokeMap::CloseEntry(e);
			}

			unsigned int __stdcall InvokeUIThreadCaller(void*)
			{
				Sleep(0);

				if (InvokeMap::IsRelease())
					RETURN_F_V(_invoke_ui_thread.Exit(0), 0);

				Private::_func_list.Delete([](const Invoke::Entry* E)
					{
						Invoke::Entry* e = const_cast<Invoke::Entry*>(E);

						if (InvokeMap::IsRelease())
							RETURN_F_V(_release_ui_job(e), TRUE);

						if (GetTickCount() - e->GetLastCallTick() < e->GetIntervalTick())
							return FALSE;

						HWND h = e->GetHWnd();
						if (!::IsWindowVisible(h))
							return FALSE;

						constexpr UINT Flag =
							SMTO_ERRORONEXIT | SMTO_ABORTIFHUNG | SMTO_NOTIMEOUTIFNOTHUNG;

						DWORD_PTR RepeatCall = NULL;
						BOOL IsProcessed = (BOOL)SendMessageTimeout(h, WM_UI_INVOKE_CALL, (WPARAM)e,
							0, Flag, 100, &RepeatCall);
						// UI Invoke의 Job 리소스 해제를 하는 경우
						// 1. SendMessageTimeOut의 호출이 실패 && InvokeMap::IsRelease가 TRUE
						//    SendMessageTimout 실패 이유는 hWnd이 소멸 했거나 100msec 응답이
						//    없을경우. InvokeMap::IsRelease가 TRUE일때는 Invoke::Release가 호출된
						//    시점.(=프로그램 종료)
						if (!IsProcessed)
							RETURN_F_V(_release_ui_job(e), TRUE);

						// 2. RepeatCall이 FALSE || IsFinishReqByCaller이 TRUE
						//    RepeatCall은 재호출의 유무를 의미 (= UI Job 함수에서 return FALSE )
						//    IsFinishReqByCaller은 외부에 의해서 함수 재호출 중지 요청시 TRUE로
						//    설정
						if (IsProcessed && (!RepeatCall || e->IsFinishReqByCaller()))
							RETURN_F_V(_release_ui_job(e), TRUE);

						RETURN_F_V(e->UpdateLastCallTick(), FALSE);
					});

				return 0;
			}
		}; // namespace Private

		BOOL Init()
		{
			return Private::_invoke_ui_thread.Start(Private::InvokeUIThreadCaller, NULL,
				FALSE);
		}

		int GetCount()
		{
			return Private::_func_list.Count();
		}

		JobEvent Once(HWND hDest, Invoke::CallType&& Func)
		{
			if (InvokeMap::IsRelease() || !IsWindow(hDest) || !::IsWindowVisible(hDest))
				return JobEvent();

			Invoke::Entry* pNewEntry = Invoke::Entry::CreateOnce(hDest, std::move(Func));

			HANDLE Copyed = NULL;
			DuplicateHandle(GetCurrentProcess(), pNewEntry->GetFinishHandle(),
				GetCurrentProcess(), &Copyed, 0, FALSE,
				DUPLICATE_SAME_ACCESS);

			Private::_func_list.PushBack(pNewEntry);

			return JobEvent(Copyed, Invoke::NO_KEY);
		}

		JobEvent Repeat(HWND hDest, Invoke::AccKey Key, DWORD Interval,
			Invoke::RecallType&& Func)
		{
			if (InvokeMap::IsRelease() || !IsWindow(hDest))
				return JobEvent();

			Invoke::Entry* pNewEntry =
				Invoke::Entry::CreateRepeat(hDest, Key, Interval, std::move(Func));

			HANDLE Copyed = NULL;
			DuplicateHandle(GetCurrentProcess(), pNewEntry->GetFinishHandle(),
				GetCurrentProcess(), &Copyed, 0, FALSE,
				DUPLICATE_SAME_ACCESS);

			Private::_func_list.PushBack(pNewEntry);

			return JobEvent(Copyed, Key);
		}

		JobEvent Update(HWND Dest, Invoke::AccKey Key, DWORD Interval,
			Invoke::RecallType&& Func)
		{
			if (Key == Invoke::NO_KEY || InvokeMap::IsRelease())
				return JobEvent();

			Invoke::Entry* p = InvokeMap::GetEntry(Key);
			if (!p)
				return Invoke::UI::Repeat(Dest, Key, Interval, std::move(Func));

			p->SetIntervalTick(Interval);
			p->SetReCallBack(std::move(Func));

			HANDLE Copyed = NULL;
			DuplicateHandle(GetCurrentProcess(), p->GetFinishHandle(),
				GetCurrentProcess(), &Copyed, 0, FALSE,
				DUPLICATE_SAME_ACCESS);

			InvokeMap::CloseEntry(p);

			return JobEvent(Copyed, Key);
		}
	}; // namespace UI

	namespace Worker
	{
		namespace Private
		{
			SyncList<Job*> _work_entry_list;

			CThread _work_req_process_thread;

			PTP_POOL _pool = NULL;
			TP_CALLBACK_ENVIRON _env;

			unsigned int __stdcall WorkRequestProcessFunc(void* p)
			{
				Sleep(0);

				if (InvokeMap::IsRelease())
				{
					_work_entry_list.Delete([](const Job* pcValue)
						{
							Job* pJob = (Job*)pcValue;
							Invoke::Entry* pEntry = (Invoke::Entry*)pJob;
							pEntry->ReqFinish();
							return FALSE;
						});

					if (!_work_entry_list.Count())
						RETURN_F_V(_work_req_process_thread.Exit(0), 0);
				}

				_work_entry_list.Delete([](const Job* pcValue)
					{
						Job* pJob = (Job*)pcValue;
						Invoke::Entry* pEntry = (Invoke::Entry*)pJob;

						if (pJob->GetReq() == Req::Finish)
							RETURN_F_V(InvokeMap::CloseEntry(pEntry), TRUE);

						if (pJob->GetRes() == Res::CallDone)
							return FALSE;

						DWORD LastCallTick = pEntry->GetLastCallTick();
						DWORD IntervalTick = pEntry->GetIntervalTick();

						if (GetTickCount() - LastCallTick > IntervalTick)
						{
							pJob->WaitFinish();
							pJob->SetRes(Res::CallDone);
							pJob->Submit();
						}

						return FALSE;
					});

				return 0;
			}

			void __stdcall CallbackStub(PTP_CALLBACK_INSTANCE Instance, PVOID Context,
				PTP_WORK Work)
			{
				Invoke::Job* pJob = (Invoke::Job*)Context;
				Invoke::Entry* pEntry = (Invoke::Entry*)pJob;

				__try
				{
					if (!pEntry->Call())
						RETURN(pJob->SetReq(Req::Finish));
				}
				__except (EXCEPTION_EXECUTE_HANDLER)
				{
				}

				if (pEntry->IsFinishReqByCaller())
					pJob->SetReq(Req::Finish);
				else
					pJob->SetReq(Req::CallAgin);

				pJob->SetRes(Res::None);
				pEntry->UpdateLastCallTick();
			}

			void __stdcall LongCallbackStub(PTP_CALLBACK_INSTANCE Instance, PVOID Context,
				PTP_WORK Work) {
				CallbackMayRunLong(Instance);

				Invoke::Job* pJob = (Invoke::Job*)Context;

				__try
				{
					pJob->Call();
				}
				__except (EXCEPTION_EXECUTE_HANDLER)
				{
				}

				pJob->SetReq(Req::Finish);
				pJob->SetRes(Res::None);
			}

			JobEvent CreateThreadPoolCallback(Invoke::AccKey Key, CallbackType Type,
				void* Callback, DWORD IntervalTick)
			{
				Invoke::Job* pJob = NULL;
				if (Type == CallbackType::Recall)
					pJob = Invoke::Job::CreateRepeat(
						Key, Type, IntervalTick, std::move(*(Invoke::RecallType*)Callback));
				else
					pJob =
					Invoke::Job::CreateOnce(Type, std::move(*(Invoke::CallType*)Callback));

				HANDLE Copyed = NULL;
				DuplicateHandle(GetCurrentProcess(), pJob->GetFinishHandle(),
					GetCurrentProcess(), &Copyed, 0, FALSE,
					DUPLICATE_SAME_ACCESS);

				Private::_work_entry_list.PushBack(pJob);

				return JobEvent(Copyed, Key);
			}
		}; // namespace Private

		void Init()
		{
			if (Private::_work_req_process_thread.IsValid())
				return;

			Worker::Private::_pool = CreateThreadpool(NULL);

			int Cnt = System::CPU::LogicalNumOfProcessor();
			SetThreadpoolThreadMinimum(Worker::Private::_pool, Cnt);
			SetThreadpoolThreadMaximum(Worker::Private::_pool, Cnt * 16);

			InitializeThreadpoolEnvironment(&Worker::Private::_env);
			SetThreadpoolCallbackPool(&Worker::Private::_env, Worker::Private::_pool);

			Private::_work_req_process_thread.Start(Private::WorkRequestProcessFunc, NULL,
				FALSE);
		}

		int GetCount()
		{
			return Private::_work_entry_list.Count();
		}

		JobEvent Once(Invoke::CallType&& Func)
		{
			if (InvokeMap::IsRelease())
				return JobEvent();

			return Private::CreateThreadPoolCallback(Invoke::NO_KEY, CallbackType::Once,
				&Func, 0);
		}

		JobEvent LongTerm(Invoke::CallType&& Func)
		{
			if (InvokeMap::IsRelease())
				return JobEvent();

			return Private::CreateThreadPoolCallback(Invoke::NO_KEY,
				CallbackType::LongTerm, &Func, 0);
		}

		JobEvent Repeat(Invoke::AccKey Key, DWORD Interval, Invoke::RecallType&& Func)
		{
			if (InvokeMap::IsRelease())
				return JobEvent();

			return Private::CreateThreadPoolCallback(Key, CallbackType::Recall, &Func,
				Interval);
		}

		JobEvent Update(Invoke::AccKey Key, DWORD Interval, Invoke::RecallType&& Func)
		{
			if (InvokeMap::IsRelease())
				return JobEvent();

			Invoke::Entry* p = InvokeMap::GetEntry(Key);
			if (!p)
				return Repeat(Invoke::NO_KEY, Interval, std::move(Func));

			SCOPE_OUT([p]() { InvokeMap::CloseEntry(p); });

			p->SetIntervalTick(Interval);
			p->SetReCallBack(std::move(Func));

			HANDLE Copyed = NULL;
			DuplicateHandle(GetCurrentProcess(), p->GetFinishHandle(),
				GetCurrentProcess(), &Copyed, 0, FALSE,
				DUPLICATE_SAME_ACCESS);

			return JobEvent(Copyed, Key);
		}
	}; // namespace Worker
}; // namespace Invoke

namespace Invoke
{
	Invoke::Entry* Entry::CreateOnce(HWND hDest, Invoke::CallType&& Callback)
	{
		Invoke::Entry* pEntry = new Invoke::Entry;

		pEntry->m_Dest = hDest;
		pEntry->m_Callback = std::move(Callback);
		pEntry->m_Finish = CreateEvent(NULL, TRUE, FALSE, NULL);

		InvokeMap::SetEntry(Invoke::NO_KEY, pEntry);

		return pEntry;
	}

	Invoke::Entry* Entry::CreateRepeat(HWND hDest, Invoke::AccKey Key,
		DWORD Interval,
		Invoke::RecallType&& Callback)
	{
		Invoke::Entry* pEntry = new Invoke::Entry;

		pEntry->m_Dest = hDest;
		pEntry->m_IntervalTick = Interval;
		pEntry->m_IsRecall = TRUE;
		pEntry->m_Recallback = std::move(Callback);
		pEntry->m_Finish = CreateEvent(NULL, TRUE, FALSE, NULL);
		pEntry->m_Key = Key;

		InvokeMap::SetEntry(Key, pEntry);

		return pEntry;
	}

	Entry::Entry()
	{
		InitializeCriticalSectionAndSpinCount(&_call, 3000);
	}

	Entry::~Entry()
	{
		SetEvent(m_Finish);
		CLOSE_HANDLE(m_Finish);
		DeleteCriticalSection(&_call);
	}

	BOOL Entry::Call()
	{
		CSPtr CS(_call);

		if (m_IsRecall)
			RETURN_V(m_Recallback());

		RETURN_F_V(m_Callback(), FALSE);
	}

	void Entry::SetReCallBack(RecallType&& Func)
	{
		CSPtr CS(_call);

		m_Recallback = std::move(Func);
		m_IsRecall = TRUE;
	}

	void Entry::SetCallBack(CallType&& Func)
	{
		CSPtr CS(_call);

		m_Callback = std::move(Func);
		m_IsRecall = FALSE;
	}
}; // namespace Invoke

namespace Invoke
{
	Invoke::Job* Job::CreateOnce(CallbackType Type, Invoke::CallType&& Callback)
	{
		Invoke::Job* pJob = new Invoke::Job;
		InvokeMap::SetEntry(Invoke::NO_KEY, pJob);

		pJob->m_Callback = std::move(Callback);
		pJob->m_Finish = CreateEvent(NULL, TRUE, FALSE, NULL);

		if (Type == CallbackType::LongTerm)
			pJob->_work =
			CreateThreadpoolWork(Invoke::Worker::Private::LongCallbackStub, pJob,
				&Worker::Private::_env);
		else
			pJob->_work = CreateThreadpoolWork(Invoke::Worker::Private::CallbackStub,
				pJob, &Worker::Private::_env);

		return pJob;
	}

	Invoke::Job* Job::CreateRepeat(Invoke::AccKey Key, CallbackType Type,
		DWORD Interval, Invoke::RecallType&& Callback)
	{
		Invoke::Job* pJob = new Invoke::Job;
		InvokeMap::SetEntry(Key, pJob);

		pJob->m_IntervalTick = Interval;
		pJob->m_IsRecall = TRUE;
		pJob->m_Recallback = std::move(Callback);
		pJob->m_Finish = CreateEvent(NULL, TRUE, FALSE, NULL);
		pJob->m_Key = Key;

		if (Type == CallbackType::LongTerm)
			pJob->_work =
			CreateThreadpoolWork(Invoke::Worker::Private::LongCallbackStub, pJob,
				&Worker::Private::_env);
		else
			pJob->_work = CreateThreadpoolWork(Invoke::Worker::Private::CallbackStub,
				pJob, &Worker::Private::_env);

		return pJob;
	}
}; // namespace Invoke

namespace Invoke
{
	namespace Private
	{
		CThread m_ClearThread;
		BOOL m_Init = FALSE;

		unsigned int __stdcall ClearInvokeThreadFunc(void* p)
		{
			DWORD64 WaitTick = reinterpret_cast<DWORD64>(p);
			InvokeMap::Release(WaitTick);
			m_ClearThread.Exit(0);

			return 0;
		}
	}; // namespace Private

	void Init()
	{
		if (Private::m_Init)
			return;

		InvokeMap::Init();
		Invoke::UI::Init();
		Invoke::Worker::Init();

		Private::m_Init = TRUE;
	}

	BOOL Release(DWORD64 WaitTick)
	{
		if (!Private::m_Init)
			return FALSE;

		Invoke::Private::m_ClearThread.Start(Private::ClearInvokeThreadFunc,
			(void*)WaitTick, FALSE);

		SCOPE_OUT([]()
			{
				DestroyThreadpoolEnvironment(&Worker::Private::_env);
				CloseThreadpool(Worker::Private::_pool);
				Worker::Private::_pool = NULL;
			});

		DWORD64 Start = GetTickCount64();
		HANDLE h = Invoke::Private::m_ClearThread.GetHandle();

		while (true) {
			DWORD timeout = 0;
			if (WaitTick == INFINITE)
			{
				timeout = 100; // Check messages every 100ms even if infinite
			}
			else
			{
				DWORD64 elapsed = GetTickCount64() - Start;
				if (elapsed >= WaitTick)
					return FALSE; // Timeout exceeded
				timeout = (DWORD)std::min<DWORD64>(100, WaitTick - elapsed);
			}

			DWORD result =
				MsgWaitForMultipleObjects(1, &h, FALSE, timeout, QS_ALLINPUT);

			if (result == WAIT_OBJECT_0)
			{
				return TRUE; // Thread finished
			}
			else if (result == WAIT_OBJECT_0 + 1)
			{
				// Message available
				MSG msg;
				while (PeekMessage(&msg, NULL, 0, 0, PM_REMOVE))
				{
					if (msg.message == WM_QUIT)
						return TRUE;
					TranslateMessage(&msg);
					DispatchMessage(&msg);
				}
			}
			else if (result == WAIT_TIMEOUT)
			{
				if (WaitTick != INFINITE && (GetTickCount64() - Start >= WaitTick))
					return FALSE;
			}
			else
			{
				return TRUE; // Error or other
			}
		}

		return FALSE;
	}

	BOOL IsReleaseDone()
	{
		return !Private::m_ClearThread.IsValid();
	}
}; // namespace Invoke
