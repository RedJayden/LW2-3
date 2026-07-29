#pragma once
#include <utility>

#define RELEASE_OBJECT(X)	if ( X ) { delete X; X = NULL; }
#define RELEASE_ARRAY(X)	if ( X ) { delete[] X; X = NULL; }
#define RELEASE_WINDOW_L(X)	if ( X ) { X->DestroyWindow(); delete X; X = NULL; }
#define RELEASE_WINDOW_R(X)	if ( X ) { X->DestroyWindow(); delete X; }
#define RELEASE_HBITMAP(X)  if ( X ) { ::DeleteObject(X); }
#define CLOSE_HANDLE(X)		if ( X ) { CloseHandle(X); X = NULL; }
#define CLOSE_FILE(X)		if ( X != INVALID_HANDLE_VALUE ) { CloseHandle(X); X = INVALID_HANDLE_VALUE; }
#define CLOSE_SOCKET(X)		if ( X != INVALID_SOCKET ) { closesocket(X); X = INVALID_SOCKET; }
#define CLOSE_WORKER(X)     if ( X != NULL ) { CloseThreadpoolWork(X); X = NULL; }
#define FREE_MEMORY(X)      if ( X != NULL ) { free(X); X = NULL; }

template<typename T> struct DummyConstructor { inline void operator()(T) const {} };
template<typename T> struct DummyDeletor { inline void operator()(T) const {} };

struct HandleDeletor { inline void operator()(HANDLE h) const { CloseHandle(h); } };

template<typename T> 
struct ObjectDeletor { inline void operator()(T t) const { delete t; } };

struct ObjectFree { inline void operator()(void* v) const { free(v); } };

template<typename T>
struct ArrayDeletor { inline void operator()(T t) const { delete[] t; } };

struct EventDestory
{
	inline void operator()( HANDLE h ) const 
	{
		if ( !h ) return;

		SetEvent( h );
		CloseHandle( h );
	}
};

struct MonitoringEventDestory
{
    inline void operator()( HANDLE h ) const 
	{
		if ( h == INVALID_HANDLE_VALUE ) return;

		CancelIo( h );
		CloseHandle( h );
	}
};

template<typename T, typename D , typename C = DummyConstructor<T> >
class RAII
{
public:

	RAII() { _t = T(); }

	RAII( RAII&& r ) { _t = r.Reset( T() ); }

	RAII( T rhs ) : _t(rhs) { _c(_t); }

	~RAII() {  _d(_t); }

	T Reset( T&& t )
	{
		T temp = std::forward<T>(_t);
		_t = std::forward<T>(t);

		return temp;
	}

	RAII& operator=( RAII&& rhs )
	{
		_t = rhs.Reset(NULL);

		return (*this);
	}

	inline T operator->() const { return _t; }

	inline T Get() const { return _t; }

	BOOL IsNull() const { return _t == NULL; }

private:

	RAII( const RAII& r ) = delete;
	RAII& operator=( const RAII& rhs ) = delete;

private:

	D _d;
	C _c;
	T _t;
};

template<typename T>  
using ArrayPtr			= RAII<T*,ArrayDeletor<T*>>;
using HandlePtr			= RAII<HANDLE,HandleDeletor>;
using WideCharPtr		= ArrayPtr<WCHAR>;
using CharPtr			= ArrayPtr<CHAR>;
using TCharPtr			= ArrayPtr<TCHAR>;
using BytePtr			= ArrayPtr<BYTE>;
using EventHandlePtr	= RAII<HANDLE,EventDestory>;
using MonitorPtr        = RAII<HANDLE,MonitoringEventDestory>;

template<typename T>
using ObjPtr			= RAII<T*,ObjectDeletor<T*>>;

namespace MemUtil
{
	BytePtr Copy( void* pSrc , int Size , int DestAddSize );
};