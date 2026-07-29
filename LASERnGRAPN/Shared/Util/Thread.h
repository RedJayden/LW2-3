#pragma once
#include <functional>

using ThreadProcType = std::function<DWORD(void* p)>;

enum class ThreadReq
{
	NONE,		 // 초기값
	WORKING,	 // 작업을 요청할때
	SLEEP,		 // Sleep을 요청할때
	TERMINATING, // 종료를 요청할때
};

enum class ThreadRes
{
	NONE,		// 초기값
	WORKING,	// 작업 중일때
	SLEEPING,	// Sleep이 되었을때
	TERMINATED,	// 스레드가 종료 중이거나 종료 되었을때
};

class CThread
{
public:

	CThread() = default;
	virtual ~CThread();

	BOOL Start( ThreadProcType FunctionProc , void* pParm , BOOL Suspend );
	void Exit( DWORD WaitTick );

	void Suspend( DWORD dwSleepTick = INFINITE );
	void Resume();
	
	inline BOOL		 IsValid()		const { return m_hThread != NULL;	}
	inline ThreadRes GetResStatus() const { return m_CurResponse;		}

	inline BOOL IsResStatus( ThreadRes Res ) const { return m_CurResponse == Res; }
	inline BOOL IsReqStatus( ThreadReq Req ) const { return m_CurRequest == Req;  }

	inline HANDLE GetHandle() const { return m_hThread; }

	DWORD GetThreadId() const { return m_ThreadID; }

private:

	static unsigned int __stdcall ThreadFunStub( void* param );
		unsigned int ThreadFun();

	static void __stdcall WakeUpFn( ULONG_PTR ) { /* do nothing */ }

private:

	DWORD m_ThreadID = -1;

	ThreadReq m_CurRequest	= ThreadReq::NONE;  // Thread 에게 요청시에 대입한다.
	ThreadRes m_CurResponse	= ThreadRes::NONE; // Thread 의 현재 상태 값이다.

	HANDLE m_hThread = NULL;	// 스레드 핸들

	ThreadProcType	m_Fun;	        // 호출할 함수 포인터 주소
	void*			m_pParm = NULL;	// 호출할 함수의 추가 파라미터

	DWORD m_dwSleepTick = 0;	// REQUEST_SLEEP 요청을 받았을때 얼마만큼 대기 할것인지를 결정하는 변수
};
