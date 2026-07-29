#pragma once

#include <windows.h>
#include <utility>
#include <list>
#include <map>
#include <vector>
#include <set>
#include <functional>
#include <unordered_map>
#include "MemoryUtil.h"
#include "SyncObject.h"

#define ENTER(X) for ( BOOL EnterFlag = X.Enter() ; EnterFlag ; EnterFlag = X.Leave() )

class BeginCriticalSectionWarp
{
protected:

	inline BeginCriticalSectionWarp() = default;
	inline BeginCriticalSectionWarp(CRITICAL_SECTION* cs) { EnterCriticalSection(cs); }
};

class EndCriticalSectionWarp
{
protected:

	inline EndCriticalSectionWarp() = default;
	inline EndCriticalSectionWarp(CRITICAL_SECTION* cs) { LeaveCriticalSection(cs); }
};

template < typename T ,
	template< typename T, typename ALLOC = std::allocator<T> >
	class CON >
class SyncObject : private BeginCriticalSectionWarp , 
				   private CON<T> , 
				   private EndCriticalSectionWarp
{
public:

	SyncObject()
	{ 
		InitializeCriticalSectionAndSpinCount(&m_NowUse, 3000); 
	}

	~SyncObject()
	{ 
		DeleteCriticalSection(&m_NowUse);
	}

	SyncObject( int Reserve )
	{
		this->reserve( Reserve );
		InitializeCriticalSectionAndSpinCount(&m_NowUse, 3000); 
	}

	template<typename R>
	SyncObject(R&& rhs) : BeginCriticalSectionWarp(&rhs.m_NowUse),
						  CON<T>(std::forward<R>(rhs)) ,
						  EndCriticalSectionWarp(&rhs.m_NowUse)
	{
		InitializeCriticalSectionAndSpinCount(&m_NowUse, 3000);
	}

	SyncObject( std::initializer_list<T> list ) : CON<T>(list)
	{
		InitializeCriticalSectionAndSpinCount(&m_NowUse, 3000);
	}

	template<typename R>
	SyncObject& operator=(R && rhs)
	{
		CSPtr obj(m_NowUse);

		rhs.Enter();
		CON<T>::operator=(std::forward<R>(rhs));
		rhs.Leave();

		return (*this);
	}

	SyncObject& operator=(const CON<T>& rhs)
	{
		CSPtr obj(m_NowUse);
		CON<T>::operator=(rhs);

		return (*this);
	}

	SyncObject& operator=(CON<T> && rhs)
	{
		CSPtr obj(m_NowUse);
		CON<T>::operator=(std::move(rhs));

		return (*this);
	}
	
	template<typename U>
	void PushBack( U&& Data )
	{
		CSPtr obj(m_NowUse);

		this->push_back( std::forward<U>( Data ) );
	}

	void PushArray( const T* Src , int Size )
	{
		CSPtr obj(m_NowUse);

		this->insert( this->end() , Src , Src + Size );
	}

	void PushFront(const T& Data)
	{
		CSPtr obj(m_NowUse);

		this->push_front(Data);
	}

	BOOL PopBack(T& t)
	{
		if ( Count() <= 0 ) return FALSE;

		CSPtr obj(m_NowUse);

		t = Back();
		this->pop_back();

		return TRUE;
	}

	BOOL PopFront(T& t)
	{
		if ( Count() <= 0 ) return FALSE;

		CSPtr obj(m_NowUse);

		t = std::move( Front() );
		this->pop_front();

		return TRUE;
	}

	T& Front()
	{
		CSPtr obj(m_NowUse);

		return this->front();
	}

	T& Back()
	{
		CSPtr obj(m_NowUse);

		return this->back();
	}

	int Count() const
	{
		CSPtr obj(m_NowUse);

		return (int)this->size();
	}

	BOOL FindValue( const T& t )
	{
		return FindByFunc( [&]( T& v ) { return v == t; });
	}

	template< typename F >
	BOOL FindByFunc( F&& f ) const
	{
		CSPtr obj(m_NowUse);

		auto result = std::find_if( this->begin() , this->end() , f );

		return result != this->end();
	}

	void ForEach( std::function<void(const T&)> Function )
	{
		CSPtr obj(m_NowUse);

		std::for_each( this->begin() , this->end() , Function );
	}

	void Delete(const T& t)
	{
		CSPtr obj(m_NowUse);

		remove( t );	
	}

	// 요소 중에서 함수객체 리턴값이 TRUE인 객체들을 삭제
	void Delete( std::function<BOOL(const T&)> Func )
	{
		CSPtr obj(m_NowUse);

		typename CON<T>::iterator cur = this->begin();
		typename CON<T>::iterator end = this->end();

		while ( cur != end )
		{
			Func( (*cur) ) ? cur = this->erase(cur) : ++cur;
		}
	}

	int MoveAll( CON<T>& C )
	{
		CSPtr obj(m_NowUse);

		C = std::move( *this );
		
		return (int)C.size();
	}

	inline CON<T> PopArray( int Size , BOOL Delete ) { return PopArray( 0 , Size - 1 , Delete ); }

	CON<T> PopArray( int FistIndex , int LastIndex , BOOL Delete )
	{
		CSPtr obj(m_NowUse);

		typename CON<T>::iterator Begin = this->begin();
		typename CON<T>::iterator Last  = this->begin();

		std::advance( Begin , FistIndex );
		std::advance( Last , LastIndex + 1 );
		
		CON<T> Ret( Begin , Last );

		if ( Delete ) this->erase( Begin , Last );

		return Ret;
	}

	void RemoveIndex( int Begin , int End )
	{
		CSPtr obj(m_NowUse);

		typename CON<T>::iterator Fist = this->begin();
		typename CON<T>::iterator Last = this->begin();

		std::advance( Fist , Begin );
		std::advance( Last , End + 1 );

		this->erase( Fist , Last );
	}

	inline CON<T>& GetData() noexcept
	{
		return *this;
	}

	BOOL IsEmpty()
	{
		CSPtr obj(m_NowUse);

		return (BOOL)this->empty();
	}

	void Clear()
	{
		CSPtr obj(m_NowUse);

		this->clear();
	}
	
	void Resize( int Count )
	{
		CSPtr obj(m_NowUse);

		this->resize( Count );
	}

	T& operator[]( int Index ) 
	{
		CSPtr obj(m_NowUse);

		return CON<T>::operator[]( Index );
	}

	inline BOOL Enter() { EnterCriticalSection(&m_NowUse);  return TRUE;  }
	inline BOOL Leave() { LeaveCriticalSection(&m_NowUse);  return FALSE; }

	inline typename CON<T>::iterator Begin() { return this->begin(); }
	inline typename CON<T>::iterator End()   { return this->end();   }

private:

	mutable CRITICAL_SECTION m_NowUse;
};

// SyncMap은 SyncObject를 상속받아서 구현할수 없는 템플릿 파리미터를 가지고 있다.
template < class MAP , typename KEY , typename VALUE >
class SyncMap :	private BeginCriticalSectionWarp , 
				private MAP ,
				private EndCriticalSectionWarp
{
public:

	SyncMap()
	{
		InitializeCriticalSectionAndSpinCount(&m_NowUse , 3000);
	}

	~SyncMap()
	{
		DeleteCriticalSection( &m_NowUse );

		this->clear();
	}

	template<typename R>
	SyncMap(R&& rhs) : BeginCriticalSectionWarp(&rhs.m_NowUse),
					   MAP(std::forward<R>(rhs)) ,
					   EndCriticalSectionWarp(&rhs.m_NowUse)
	{
		InitializeCriticalSectionAndSpinCount(&m_NowUse, 3000);
	}

	BOOL Has(const KEY& k)
	{
		CSPtr obj(m_NowUse);

		return (this->find( k ) != this->end());
	}

	VALUE& Get(const KEY& k)
	{
		CSPtr obj(m_NowUse);

		typename MAP::iterator result = this->find(k);
		if (result == this->end())
		{
			Set(k, VALUE());
			return operator[](k);
		}

		return result->second;
	}

	void Set( const KEY& k , VALUE&& v )
	{
		CSPtr obj(m_NowUse);

		if ( !Has( k ) ) this->insert( std::make_pair( k , std::forward<VALUE>(v) ) );
		else			 this->operator[]( k ) = v;
	}

	void Set( const KEY& k , const VALUE& v )
	{
		CSPtr obj(m_NowUse);

		if ( !Has( k ) ) this->insert( std::make_pair( k , v ) );
		else			 this->operator[]( k ) = v;
	}

	int Count()
	{
		CSPtr obj(m_NowUse);

		return (int)this->size();
	}

	BOOL Delete(const KEY& k)
	{
		CSPtr obj(m_NowUse);

		typename MAP::iterator result = this->find(k);

		if ( result == this->end() ) return false;

		this->erase( result );

		return true;
	}

	// 요소 중에서 함수객체 리턴값이 TRUE인 객체들을 삭제
	void Delete( std::function<BOOL(const std::pair<KEY,VALUE>& r)> Func )
	{
		CSPtr obj(m_NowUse);

		typename MAP::iterator cur = this->begin();
		typename MAP::iterator end = this->end();

		while ( cur != end )
		{
			Func( (*cur) ) ? cur = this->erase(cur) : ++cur;
		}
	}

	void Clear()
	{
		CSPtr obj(m_NowUse);

		this->clear();
	}

	void ForEach( std::function<void(const std::pair<KEY,VALUE>& r)> Function )
	{
		CSPtr obj(m_NowUse);

		std::for_each( this->begin() , this->end() , Function );
	}

	inline VALUE& operator[]( const KEY& k ) { return Get( k ); }

	inline BOOL Enter() { EnterCriticalSection(&m_NowUse); return TRUE;  }
	inline BOOL Leave() { LeaveCriticalSection(&m_NowUse); return FALSE; }

	inline typename MAP::iterator Begin() { return this->begin(); }
	inline typename MAP::iterator End()   { return this->end();   }

private:

	mutable CRITICAL_SECTION m_NowUse;
};

template<typename T>
using SyncList = SyncObject<T,std::list>;

template<typename T>
using SyncVector = SyncObject<T,std::vector>;

template<typename T>
class Variable
{
public:

	Variable() = default;
	~Variable() = default;

	T& Get( const CString& Key ) noexcept
	{
		if ( !m_Map.Has( Key ) ) 
			m_Map.Set( Key , T() );
			
		return m_Map.Get( Key );
	}

	T Reset( const CString& Key ) noexcept
	{
		if ( !m_Map.Has( Key ) ) return;

		T Ret = m_Map.Get( Key );

		m_Map.Get( Key ) = T();

		return Ret;
	}

	T& operator[]( const CString& Key ) noexcept
	{
		return Get( Key );
	}

private:

	Variable( Variable&& r ) = delete;
	Variable( const Variable& r ) = delete;

private:

	SyncMap< std::map<CString,T> , CString , T > m_Map;
};
