#pragma once
#include <Windows.h>

class JobEvent
{
public:

	JobEvent() = default;
	explicit JobEvent( HANDLE hEvent , int Key );
	JobEvent( JobEvent&& rhs ) noexcept;
	~JobEvent();

	JobEvent& operator=( JobEvent&& rhs ) noexcept;

	BOOL Wait( DWORD WaitTick , DWORD* LastError = NULL ) const;
	BOOL FinishReqAndWait( DWORD WaitTick , DWORD* LastError = NULL ) const;
	BOOL IsDone() const;

	HANDLE GetHandle() const { return m_hEvent;   }
	int    GetKey() const { return m_Key; }

	inline void SetResult( DWORD_PTR Result ) { m_pResult = Result; }
	DWORD_PTR GetResult() const { return m_pResult; }

private:
	
	HANDLE ResetHandle();
	int    ResetKey();

	JobEvent( const JobEvent& rhs )			   = delete;
	JobEvent& operator=( const JobEvent& rhs ) = delete;

private:

	DWORD_PTR	 m_pResult = NULL;

	HANDLE m_hEvent	= NULL;
	int    m_Key	= -1; // NO used Key
};

using JobEventRef = std::reference_wrapper<JobEvent>;

namespace Job
{
	BOOL WaitAll( std::initializer_list<JobEventRef> JobList , BOOL AllComplete , DWORD WaitTick , DWORD* LastError = NULL );
};
