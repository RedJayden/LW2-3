#pragma once
#include "MemoryUtil.h"
#include <functional>

struct CritialSectionCtor { inline void operator()(CRITICAL_SECTION& cs) const { EnterCriticalSection(&cs); } };
struct CritialSectionDtor { inline void operator()(CRITICAL_SECTION& cs) const { LeaveCriticalSection(&cs); } };

struct SRCtor { inline void operator()(SRWLOCK& srw) const { AcquireSRWLockShared(&srw); } };
struct SRDtor { inline void operator()(SRWLOCK& srw) const { ReleaseSRWLockShared(&srw); } };
struct SWCtor { inline void operator()(SRWLOCK& srw) const { AcquireSRWLockExclusive(&srw); } };
struct SWDtor { inline void operator()(SRWLOCK& srw) const { ReleaseSRWLockExclusive(&srw); } };

using CSPtr = RAII<CRITICAL_SECTION&, CritialSectionDtor, CritialSectionCtor>;
using SharedPtr = RAII<SRWLOCK&, SRDtor, SRCtor>;
using ExclusivePtr = RAII<SRWLOCK&, SWDtor, SWCtor>;

class CS
{
public:

	CS(int SpinCount = 3000) { InitializeCriticalSectionAndSpinCount(&_cs, SpinCount); }
	~CS() { DeleteCriticalSection(&_cs); }

	CSPtr Obj() { return CSPtr(_cs); }

private:

	CRITICAL_SECTION _cs;
};

class SRW
{
public:

	SRW() { InitializeSRWLock(&_srw); }
	~SRW() = default;

	SharedPtr    Shared() { return SharedPtr(_srw); }
	ExclusivePtr Exclusive() { return ExclusivePtr(_srw); }

private:

	// SRWLOCK 는 명시적인 소멸이 필요 없단다.
	SRWLOCK _srw;
};

// 해당 객체의 Scope에서 벗어나게 되면 람다가 수행되게 하는 클래스
class ScopeOut
{
public:

	ScopeOut(std::function<void(void)>&& f) : _f(std::move(f)) {}
	~ScopeOut() { if (_f) _f(); }

private:

	std::function<void(void)> _f;
};

#define CONCAT(a, b)      a##b
#define CONCAT2(a, b)     CONCAT(a, b) // __LINE__ 같은 컴파일 전처리 변수의 경우 2번의 전처리를 거쳐야
// 실제 문자열로 확장된다고 함.
// 그러니까, CONCAT2를 사용하지 않고 CONCAT(FileLine,__LINE__) 사용시
// FileLine__LINE__ 이라는 문자값으로 확장됨.
// CONCAT2은 내부적으로 한번더 전처리 확장이 되면서
// FileLine30 같은 실제 값으로 치환. by GPT

#define SCOPE_OUT(X) ScopeOut CONCAT2(SCOPE,__LINE__)(X)