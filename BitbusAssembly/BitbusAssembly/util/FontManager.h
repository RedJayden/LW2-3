#pragma once

#include "SyncContainer.h"

typedef SyncMap< std::map<int,CFont*>		  , int     , CFont*     > FontEntry;
typedef SyncMap< std::map<CString,FontEntry*> , CString , FontEntry* > FontTable;

class CFontManager
{
public:

	static CFontManager* GetInstance();
	static void			 ReleaseInstance();

	CFont* GetFont( int Size);
	CFont* GetFont( int Size , const CString& FontName );

private:

	CFontManager();
	~CFontManager();

private:

	static CFontManager* m_p;

	FontTable m_Table; 
};

typedef CFontManager FONT;
