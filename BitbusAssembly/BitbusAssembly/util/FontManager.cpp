#include "stdafx.h"
#include "Fontmanager.h"

struct ReleaseFontEntry
{
	inline void operator()( const std::pair< const CString , FontEntry* >& Entry ) const
	{
		typename std::map< int , CFont* >::iterator cur = Entry.second->Begin();
		typename std::map< int , CFont* >::iterator end = Entry.second->End();

		for ( ; cur != end ; ++cur ) 
			delete (*cur).second;

		delete Entry.second;
	}
};

static CFont* _MakeFont( int Size , const CString& FontName )
{
	CFont* pFont = new CFont();
	if ( !pFont ) return NULL;

	if ( !pFont->CreatePointFont(Size , FontName) )
	{
		delete pFont;
		return NULL;
	}

	return pFont;
}

CFontManager* CFontManager::m_p = NULL;

CFontManager::CFontManager() {}
CFontManager::~CFontManager()
{
	try
	{
		m_Table.Enter();

		std::for_each( m_Table.Begin() , m_Table.End() , ReleaseFontEntry() );

		m_Table.Leave();
	}
	catch ( ... )
	{
		m_Table.Leave();
	}
}

CFontManager* CFontManager::GetInstance()
{
	if ( m_p ) return m_p;

	return (m_p = new CFontManager());
}

void CFontManager::ReleaseInstance()
{
	if ( !m_p ) return;

	delete m_p;
	m_p = NULL;
}

CFont* CFontManager::GetFont( int Size , const CString& FontName )
{
	if ( Size <= 0 ) return NULL;

	if ( m_Table.Has( FontName ) ) // 폰트 테이블에 폰트명이 존재할 경우
	{
		FontEntry* Entry = m_Table.Get( FontName );
		
		if ( Entry->Has( Size ) ) 
			return Entry->Get( Size );

		CFont* pFont = _MakeFont( Size , FontName );
		if ( pFont ) 
		{
			Entry->Set( Size , pFont );
			m_Table.Set( FontName , Entry );
		}
		
		return pFont;
	}
	else // 폰트 테이블에 폰트명이 존재하지 않는 경우
	{
		CFont* pFont = _MakeFont( Size , FontName );
		if ( !pFont ) return NULL;

		FontEntry* Entry = new FontEntry;
		Entry->Set( Size , pFont );

		m_Table.Set( FontName , Entry );
	
		return pFont;
	}
}

CFont* CFontManager::GetFont(int Size)
{
	return GetFont( Size , _T("MS Shell Dlg") );
}