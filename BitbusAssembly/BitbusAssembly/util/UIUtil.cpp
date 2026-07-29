#include "stdafx.h"
#include "UIUtil.h"
#include <initializer_list>

namespace UI
{
	float GetFloat( const CWnd* pParent , int ID )
	{
		TCHAR Buffer[64] = { 0 , };
		pParent->GetDlgItemText( ID , Buffer , _countof(Buffer) );
		return (float)_ttof(Buffer);
	}

	double  GetDouble( const CWnd* pParent , int ID )
	{
		TCHAR Buffer[64] = { 0 , };
		pParent->GetDlgItemText( ID , Buffer , _countof(Buffer) );
		return _ttof(Buffer);
	}

	void SetDouble( CWnd* pParent , int ID , double Value , int Point )
	{
		pParent->SetDlgItemText( ID , Str::ToString( Value , Point ) );
	}

	int GetInt( const CWnd* pParent , int ID )
	{
		return (int)pParent->GetDlgItemInt( ID );
	}

	void SetInt( CWnd* pParent , int ID , int Value )
	{
		pParent->SetDlgItemInt( ID , Value );
	}

	CString GetString( const CWnd* pParent , int ID )
	{
		if ( !pParent->GetSafeHwnd() ) return _T("");

		TCHAR Buffer[512] = { 0 , };
		pParent->GetDlgItemText( ID , Buffer , _countof(Buffer) );
		return CString( Buffer );
	}

	void SetString( CWnd* pParent , int ID , const CString& Value )
	{
		pParent->SetDlgItemText( ID , Value );
	}

	BOOL IsCheck( const CWnd* pParent , int ID )
	{
		return ((CButton*)pParent->GetDlgItem( ID ))->GetCheck() == BST_CHECKED;
	}

	void SetCheck( CWnd* pParent , int ID , BOOL Check )
	{
		((CButton*)pParent->GetDlgItem( ID ))->SetCheck( Check ? BST_CHECKED : BST_UNCHECKED );
	}

	void SetCheck( CWnd* pParent , std::initializer_list<int> IDs , BOOL Check )
	{
		typename std::initializer_list<int>::const_iterator cur = IDs.begin();
		typename std::initializer_list<int>::const_iterator end = IDs.end();

		for ( ; cur != end ; ++cur ) UI::SetCheck( pParent , (*cur) , Check );
	}

	void SetEditCursorPos( CWnd* pParent , int ID , int Pos )
	{
		CEdit* pEdit = (CEdit*)pParent->GetDlgItem( ID );
		pEdit->SetSel( Pos , Pos );
	}

	void SetEditCursorLastPos( CWnd* pParent , int ID )
	{
		SetEditCursorPos( pParent , ID , pParent->GetDlgItem( ID )->GetWindowTextLength() );
	}

	void Enable( CWnd* pParent , int ID , BOOL Enable )
	{
		pParent->GetDlgItem( ID )->EnableWindow( Enable );
	}

	void Enable( CWnd* pParent , std::initializer_list<int> IDs , BOOL Enable )
	{
		typename std::initializer_list<int>::const_iterator cur = IDs.begin();
		typename std::initializer_list<int>::const_iterator end = IDs.end();

		for ( ; cur != end ; ++cur ) UI::Enable( pParent , (*cur) , Enable );
	}

	BOOL IsEmpty( const CWnd* pParent, int ID )
	{
		return UI::GetString( pParent , ID ).Trim().IsEmpty();
	}

	BOOL IsEmpty( const CWnd* pParent , std::initializer_list<int> Controls )
	{
		typename std::initializer_list<int>::iterator cur = Controls.begin();
		typename std::initializer_list<int>::iterator end = Controls.end();

		for ( ; cur != end ; ++cur ) 
		{
			if ( IsEmpty( pParent , (*cur) ) ) return TRUE;
		}

		return FALSE;
	}

	CString CompactPrePath( const CWnd* pParent , int ID , const CString& Path )
	{
		CWnd* pWnd = pParent->GetDlgItem(ID);
		CRect Rect = UI::GetClientRect( pParent , ID );

		CDC*	pDC		  = pWnd->GetDC();
		CString strResult = Path;

		CSize size = pDC->GetTextExtent(strResult);
		while ( size.cx > Rect.Width() && strResult.GetLength() > 4 )
		{
			strResult = _T("...") + strResult.Right( strResult.GetLength() - 4 );
			size	  = pDC->GetTextExtent(strResult);
		}

		pWnd->ReleaseDC(pDC);
		return strResult;
	}

	CString CompactMidPath( const CWnd* pParent , int ID , const CString& Path )
	{
		CWnd* pWnd = pParent->GetDlgItem(ID);
		CRect Rect = UI::GetWindowRect( pParent , ID );

		CDC*	pDC		  = pWnd->GetDC();
		CString strResult = Path;

		PathCompactPath( pDC->GetSafeHdc() , strResult.GetBuffer(MAX_PATH) , Rect.Width() );
		strResult.ReleaseBuffer();

		pWnd->ReleaseDC(pDC);
		return strResult;
	}

	CString CompactSuffPath( const CWnd* pParent , int ID , const CString& Path )
	{
		CWnd* pWnd = pParent->GetDlgItem(ID);
		CRect Rect = UI::GetClientRect( pParent , ID );

		CDC*	pDC		  = pWnd->GetDC();
		CString strResult = Path;

		CSize size = pDC->GetTextExtent( _T("A") );
		PathCompactPathEx( strResult.GetBuffer(MAX_PATH) , Path , Rect.Width() / size.cx , 0 );
		strResult.ReleaseBuffer();

		pWnd->ReleaseDC(pDC);
		return strResult;
	}

	CRect GetRelativeRect( const CWnd* pParent , int ChildID )
	{
		CRect ChildRect;

		CWnd* pChildCtrl = pParent->GetDlgItem( ChildID );
		// GetWindowRect 는 자식 CWnd 에서 호출하든 부모 CWnd 에서 호출하든 
		// 모니터상의 절대 좌표(모니터 제일 좌측 상단 0,0)의 위치 에서 부터의 컨트롤 좌표를 리턴한다.
		pChildCtrl->GetWindowRect( &ChildRect );
		pParent->ScreenToClient( &ChildRect );

		return ChildRect;
	}

	CRect GetClientRect( const CWnd* pParent, int ID )
	{
		CRect Rect;
		pParent->GetDlgItem( ID )->GetClientRect( &Rect );

		return Rect;
	}

	CRect GetWindowRect( const CWnd* pParent, int ID )
	{
		CRect Rect;
		pParent->GetDlgItem( ID )->GetWindowRect( &Rect );

		return Rect;
	}
};