#pragma once

#include <list>
#include <vector>
#include <map>
#include <algorithm>
#include <functional>
#include <Windows.h>
#include <initializer_list>
//--------------------------------------------------------------------------------
// swift 언어 에서 컨테이너 클래스에 대해서 고차함수 기능을 C++에 접목해본 클래스들.
// 기능 테스트는 아직 부족한 상태.
//--------------------------------------------------------------------------------
template<typename T ,
		 template<typename TYPE , typename ALLOC = std::allocator<TYPE>> 
		 class CON>
class HighorderContainer : public CON<T>
{
public:

	HighorderContainer() = default;

	HighorderContainer( std::initializer_list<T> init_list ) : CON<T>(init_list) {}

	template<typename ARG>
	HighorderContainer( ARG&& rhs ) : CON<T>( std::forward<ARG>(rhs) ) {}

	template<typename ARG>
	HighorderContainer& operator=( ARG&& rhs )
	{
		CON<T>::operator=( std::forward<ARG>(rhs) );
		return (*this);
	}

	T& operator[]( int Index )
	{
        typename CON<T>::iterator cur = this->begin();
		std::advance( cur , Index );
		return *cur;
	}

	template<typename RETURN_TYPE>
	HighorderContainer<RETURN_TYPE,CON> map( std::function<RETURN_TYPE(T)> f )
	{
		HighorderContainer<RETURN_TYPE,CON> ret;
		std::for_each( this->begin() , this->end() , [&]( typename CON<T>::value_type& rhs )
		{
			ret.push_back( f( rhs ) );
		});

		return ret;
	}

	HighorderContainer filter( std::function<BOOL(const T&)> f )
	{
		HighorderContainer ret;
		std::for_each( this->begin() , this->end() , [&]( typename CON<T>::value_type& rhs )
		{
			if ( !f( rhs ) ) return;

			ret.push_back( rhs );
		});
		return ret;
	}

	HighorderContainer& foreach( std::function<void(const T&)> f )
	{
		std::for_each( this->begin() , this->end() , [f]( typename CON<T>::value_type& rhs ) 
		{
			f( rhs ); 
		});

		return *this;
	}

	HighorderContainer& foreach_i( std::function<void(int,const T&)> f )
	{
		int Index = 0;
		std::for_each( this->begin() , this->end() , [&Index,f]( typename CON<T>::value_type& rhs ) 
		{
			f( Index++ , rhs );
		});

		return *this;
	}

	template<typename RETURN_TYPE>
	RETURN_TYPE reduce( std::function<RETURN_TYPE(const T&)> f )
	{
		RETURN_TYPE ret = RETURN_TYPE();

		std::for_each( this->begin() , this->end() , [&ret,f]( typename CON<T>::value_type& rhs ) 
		{
			ret += f( rhs ); 
		});

		return ret;
	}

	template<typename RETURN_TYPE>
	RETURN_TYPE fold( RETURN_TYPE&& begin_value , std::function<RETURN_TYPE(RETURN_TYPE& ,const T&)> f )
	{
		RETURN_TYPE ret = begin_value;

		std::for_each( this->begin() , this->end() , [&ret,f]( typename CON<T>::value_type& rhs ) 
		{
			ret = f( ret , rhs ); 
		});

		return ret;
	}

	template<typename RETURN_TYPE>
	RETURN_TYPE fold_i( RETURN_TYPE&& begin_value , std::function<RETURN_TYPE(RETURN_TYPE& , int ,const T&)> f )
	{
		RETURN_TYPE ret   = begin_value;
		int		    Index = 0;

		std::for_each( this->begin() , this->end() , [&Index,&ret,f]( typename CON<T>::value_type& rhs ) 
		{
			ret = f( ret , Index , rhs ); 
		});

		return ret;
	}
};

template<typename K , typename V>
class HighOrderMap : public std::map<K,V>
{
public:

	HighOrderMap() = default;

	HighOrderMap( std::initializer_list< std::pair<const K,V> > init_list ) : std::map<K,V>(init_list) {}

	template<typename ARG>
	HighOrderMap( ARG&& rhs ) : std::map<K,V>( std::forward<ARG>(rhs) ) {}

	template<typename ARG>
	HighOrderMap& operator=( ARG&& rhs )
	{
		std::map<K,V>::operator=( std::forward<ARG>(rhs) );
		return (*this);
	}

	template<typename NEW_K,typename NEW_V>
	HighOrderMap<NEW_K,NEW_V> map( std::function<std::pair<NEW_K,NEW_V>(const std::pair<K,V>&)> f )
	{
		HighOrderMap<NEW_K,NEW_V> ret;
		std::for_each( this->begin() , this->end() , [&]( typename std::map<K,V>::value_type& rhs )
		{
			ret.insert( f( rhs ) );
		});
		return ret;
	}

	HighOrderMap filter( std::function<BOOL(const std::pair<K,V>&)> f )
	{
		HighOrderMap ret;
		std::for_each( this->begin() , this->end() , [&]( typename std::map<K,V>::value_type& rhs )
		{
			if ( !f( rhs ) ) return;

			ret[rhs.first] = rhs.second;
		});
		return ret;
	}

	HighOrderMap& foreach( std::function<void(const std::pair<K,V>&)> f )
	{
		std::for_each( this->begin() , this->end() , [f]( typename std::map<K,V>::value_type& rhs ) 
		{ 
			f( rhs ); 
		});

		return *this;
	}

	template<typename RETURN_TYPE>
	RETURN_TYPE reduce( std::function<RETURN_TYPE(const std::pair<K,V>&)> f )
	{
		RETURN_TYPE ret = RETURN_TYPE();

		std::for_each( this->begin() , this->end() , [&ret,f]( typename std::map<K,V>::value_type& rhs ) 
		{
			ret += f( rhs ); 
		});

		return ret;
	}
};

template<typename T>
using HighOrderList = HighorderContainer<T,std::list>;

template<typename T>
using HighOrderVector = HighorderContainer<T,std::vector>;

#define FOREACH  foreach([&] 