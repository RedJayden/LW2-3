#pragma once
#include "MemoryUtil.h"
#include <functional>

struct CritialSectionCtor  { inline void operator()(CRITICAL_SECTION& cs) const { EnterCriticalSection(&cs); } };
struct CritialSectionDtor  { inline void operator()(CRITICAL_SECTION& cs) const { LeaveCriticalSection(&cs); } };

struct SRCtor { inline void operator()(SRWLOCK& srw) const { AcquireSRWLockShared( &srw ); } };
struct SRDtor { inline void operator()(SRWLOCK& srw) const { ReleaseSRWLockShared( &srw ); } };
struct SWCtor { inline void operator()(SRWLOCK& srw) const { AcquireSRWLockExclusive( &srw ); } };
struct SWDtor { inline void operator()(SRWLOCK& srw) const { ReleaseSRWLockExclusive( &srw ); } };

using CSPtr = RAII<CRITICAL_SECTION&,CritialSectionDtor,CritialSectionCtor>;
using SRPtr = RAII<SRWLOCK&,SRDtor,SRCtor>;
using SWPtr = RAII<SRWLOCK&,SWDtor,SWCtor>;

class CS
{
public:

    CS()  { InitializeCriticalSectionAndSpinCount( &_cs , 3000 );    }
    ~CS() { DeleteCriticalSection( &_cs ); }

    CSPtr Obj() { return CSPtr( _cs ); }

private:

    CRITICAL_SECTION _cs;
};

class SRW
{
public:

    SRW()  { InitializeSRWLock( &_srw ); }
    ~SRW() = default;

    SRPtr Read()  { return SRPtr( _srw ); }
    SWPtr Write() { return SWPtr( _srw ); }

private:

    // SRWLOCK 는 명시적인 소멸이 필요 없단다.
    SRWLOCK _srw;
};

class ScopeOut
{
public:

    ScopeOut( std::function<void(void)>&& f ) : _f( std::move(f) ) {}
    ~ScopeOut() { if ( _f ) _f(); }

private:

    std::function<void(void)> _f;
};

#define SCOPE_OUT(X) ScopeOut ScopeOutVariable(X)