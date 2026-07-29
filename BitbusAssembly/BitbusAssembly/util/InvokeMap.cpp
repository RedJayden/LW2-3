#include "stdafx.h"
#include "InvokeMap.h"
#include "Invoke.h"

namespace InvokeMap
{
	namespace Private
	{
		SyncMap< std::map<int,Invoke::Entry*> , int , Invoke::Entry* >			   _key_map;
		SyncMap< std::map<DWORD_PTR,Invoke::Entry*> , DWORD_PTR , Invoke::Entry* > _no_key_map;

		CRITICAL_SECTION _cs;
	};
		
	BOOL Init()
	{
		return InitializeCriticalSectionAndSpinCount( &Private::_cs , 3000 );
	}

	void Release()
	{
		Private::_no_key_map.ForEach( []( const std::pair<DWORD_PTR,Invoke::Entry*>& e ) { e.second->ReqFinish(); });
		Private::_key_map.ForEach( []( const std::pair<int,Invoke::Entry*>& e ) { e.second->ReqFinish(); });

		while ( true )
		{
			int NoKeyMapCnt = Private::_no_key_map.Count();
			int KeyMapCnt   = Private::_key_map.Count();

			if ( NoKeyMapCnt == 0 && KeyMapCnt == 0 ) 
                break;

			Sleep( 100 );
		}

		DeleteCriticalSection( &Private::_cs );
	}

	Invoke::Entry* GetEntry( Invoke::AccKey Key )
	{
		CSPtr Obj( Private::_cs );

		if ( Key == Invoke::NO_KEY || !Private::_key_map.Has( Key ) ) return NULL;

		Invoke::Entry* pEntry = Private::_key_map.Get( Key );

		pEntry->IncreaseCnt();

		return pEntry;
	}

	void SetEntry( Invoke::AccKey Key , Invoke::Entry* pEntry )	
	{ 
		CSPtr Obj( Private::_cs );

		pEntry->IncreaseCnt();

		if ( Key == Invoke::NO_KEY ) RETURN( Private::_no_key_map.Set( (DWORD_PTR)pEntry , pEntry ) );

		Private::_key_map.Set( Key , pEntry );
	}

	void CloseEntry( Invoke::AccKey Key )
	{ 
		CSPtr Obj( Private::_cs );

		if ( Key == Invoke::NO_KEY || !Private::_key_map.Has( Key ) ) return;

		Invoke::Entry* pEntry = Private::_key_map.Get( Key );
		if ( pEntry->DecreaseCnt() > 0 ) return;
		
		Private::_key_map.Delete(Key);
		delete pEntry;
	}

	void CloseEntry( const Invoke::Entry* pEntry )
	{		
		CSPtr Obj( Private::_cs );

		if ( pEntry->GetKey() != Invoke::NO_KEY ) RETURN( CloseEntry( pEntry->GetKey() ) );
		
		Invoke::Entry* pObj = (Invoke::Entry*)Private::_no_key_map.Get( (DWORD_PTR)pEntry );
		Private::_no_key_map.Delete( (DWORD_PTR)pEntry );
		delete pObj;
	}

	BOOL WaitForEntry( Invoke::AccKey Key , BOOL FinishReq , DWORD WaitTick )
	{
		Invoke::Entry* p = InvokeMap::GetEntry( Key );
		if ( !p ) return FALSE;
		
		if ( FinishReq ) p->ReqFinish();

		DWORD Ret = WaitForSingleObject( p->GetFinishHandle() , WaitTick );

		InvokeMap::CloseEntry( p );

		return Ret == WAIT_OBJECT_0;
	}
};

