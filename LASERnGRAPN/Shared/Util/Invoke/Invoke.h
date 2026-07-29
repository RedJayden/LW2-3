#pragma once
#include <functional>
#include "..\\MemoryUtil.h"
#include "JobEvent.h"
#include "InvokeMap.h"

constexpr DWORD64 INFINITE64 = 0xFFFFFFFFFFFFFFFF;

namespace Invoke
{
	class AccKey
	{
	public:

		AccKey() = default;
		explicit AccKey( int Key ) : m_Key(Key) {}

		inline operator int() const { return m_Key; }

	private:

		int m_Key = -1; // NO used Key
	};

    static const AccKey NO_KEY( -1 );
};

// UI 또는 다른 스레드(스레드풀) 에게 작업을 위임할때 사용하는 기능
namespace Invoke
{
	using RecallType = std::function<BOOL()>;
	using CallType   = std::function<void()>;

	class Job;
	class Entry
	{
	public:

		Entry();
		virtual ~Entry();

		static Invoke::Entry*	CreateOnce( HWND hDest , Invoke::CallType&& Callback );
		static Invoke::Entry*	CreateRepeat( HWND hDest , Invoke::AccKey Key , DWORD Interval , Invoke::RecallType&& Callback );

		BOOL Call();

		void SetReCallBack( RecallType&& Func );
		void SetCallBack( CallType&& Func );

		inline Invoke::AccKey GetKey() const { return Invoke::AccKey(m_Key); }

		int IncreaseCnt() { return InterlockedIncrement( &m_RefCnt ); }
		int DecreaseCnt() { return InterlockedDecrement( &m_RefCnt ); }
		int GetRefCnt() const { return m_RefCnt; }

		inline DWORD GetIntervalTick() const		{ return m_IntervalTick; }
		inline void  SetIntervalTick( DWORD Tick )	{ m_IntervalTick = Tick; }

		inline DWORD GetLastCallTick() const { return m_LastCallTick; }
		inline void  UpdateLastCallTick()    { m_LastCallTick = GetTickCount(); }

		inline void ReqFinish()					{ m_FinishReqByCaller = TRUE; }
		inline BOOL IsFinishReqByCaller() const { return m_FinishReqByCaller; }

		HANDLE	GetFinishHandle() const { return m_Finish;   }
		BOOL    IsRecallable()    const { return m_IsRecall; }

        HWND    GetHWnd() const   { return m_Dest; }

	private:

        HWND    m_Dest = NULL;

		DWORD	m_IntervalTick = 0;
		DWORD	m_LastCallTick = 0;

		BOOL	m_IsRecall		    = FALSE;
		BOOL	m_FinishReqByCaller = FALSE;

		HANDLE	m_Finish = NULL;
		int		m_Key    = -1; // NO used Key
		LONG    m_RefCnt = 0;

		Invoke::CallType	m_Callback;
		Invoke::RecallType	m_Recallback;

		CRITICAL_SECTION _call;

		friend class Job;
	};
}

namespace Invoke
{
	enum class Req
	{
		CallAgin,	 // 호출 요청
		Finish,	 // 호출끝남을 알림
	};

	enum class Res
	{
		None,		// 초기값
		CallDone,	// Req::CallAgin 응답
	};

	enum class CallbackType
	{
		Once,		// 1회성 호출
		Recall,		// 콜백 함수에서의 리턴값에 따라서 재호출
		LongTerm,	// 콜백을 호출한 스레드 폴의 스레드를 오래동안 선점
	};

	class Job : public Invoke::Entry
	{
	public:

		static Invoke::Job* CreateOnce( CallbackType Type , Invoke::CallType&& Callback );
		static Invoke::Job* CreateRepeat( Invoke::AccKey Key , CallbackType Type , DWORD Interval , Invoke::RecallType&& Callback );

		Job() = default;
		virtual ~Job() { CLOSE_WORKER( _work ); }

		Req GetReq() const { return _req; }
		Res GetRes() const { return _res; }

		void SetReq( Req req ) { _req = req; }
		void SetRes( Res res ) { _res = res; }

		void Submit() const			{ SubmitThreadpoolWork( _work ); }
		void WaitFinish() const	{ WaitForThreadpoolWorkCallbacks( _work , TRUE ); }

	private:

		Req _req = Req::CallAgin;
		Res _res = Res::None;

		PTP_WORK _work = NULL;
	};
};

namespace Invoke
{
	namespace UI
	{
		JobEvent Once( HWND hDest , Invoke::CallType&& Func );
		JobEvent Repeat( HWND hDest , Invoke::AccKey Key , DWORD Interval , Invoke::RecallType&& Func );
		JobEvent Update( HWND hDest , Invoke::AccKey Key , DWORD Interval , Invoke::RecallType&& Func );

        int GetCount();
	};

	namespace Worker
	{
		JobEvent Once( Invoke::CallType&& Func );
		JobEvent LongTerm( Invoke::CallType&& Func );

		JobEvent Repeat( Invoke::AccKey Key , DWORD Interval , Invoke::RecallType&& Func );
		JobEvent Update( Invoke::AccKey Key , DWORD Interval , Invoke::RecallType&& Func );

        int GetCount();
	};
};

namespace Invoke
{
	void Init();
	BOOL Release( DWORD64 WaitTick );

	BOOL IsReleaseDone();
};

template<typename T>
struct CWndWarrper
{
	CWndWarrper( T* pThis ) : m_pThis(pThis) {}
	~CWndWarrper()
	{
		m_pThis = NULL;
	}

	T* GetThis() const
	{
		if ( !m_pThis ) return NULL;

		return IsWindow( m_pThis->m_hWnd ) ? m_pThis : NULL;
	}

	HWND Handle() const
	{
		T* pRet = GetThis();
		if ( !pRet ) return NULL;

		return pRet ? m_pThis->m_hWnd : NULL;
	}

	T* m_pThis;
};

#define DECLARE_UI_INVOKE(TYPE) LRESULT OnUIInvoke(WPARAM W,LPARAM){\
												__try {\
													Invoke::Entry* pEntry = (Invoke::Entry*)W;\
													return pEntry->Call();\
												}__except( EXCEPTION_EXECUTE_HANDLER ){}\
													return (LRESULT)FALSE;}\
												CWndWarrper<TYPE> m_This = this;\

#define _THIS()	m_This.GetThis()
#define _HWND()	m_This.Handle()

#define WM_UI_INVOKE_CALL		(WM_USER+7182) // 7182는 그냥 임의에 숫자임. 다른 의미는 없음.
#define ON_UI_INVOKE()				ON_MESSAGE(WM_UI_INVOKE_CALL,OnUIInvoke)\

#define WORK_1		Invoke::Worker::Once
#define WORK_N		Invoke::Worker::Repeat
#define WORK_UPDATE Invoke::Worker::Update
#define WORK_LONG   Invoke::Worker::LongTerm

#define UI_1		Invoke::UI::Once
#define UI_N		Invoke::UI::Repeat
#define UI_UPDATE   Invoke::UI::Update
