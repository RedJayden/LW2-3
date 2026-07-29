#pragma once

enum BtnColor { Uncheck = RGB(240,240,240) , Check = RGB(10,240,10) };

namespace UI
{
	float	GetFloat( const CWnd* pParent , int ID );

	double  GetDouble( const CWnd* pParent , int ID );
	void	SetDouble( CWnd* pParent , int ID , double Value , int Point );

	CString GetString( const CWnd* pParent , int ID );
	void    SetString( CWnd* pParent , int ID , const CString& Value );

	int		GetInt( const CWnd* pParent , int ID );
	void    SetInt( CWnd* pParent , int ID , int Value );

	void	SetEditCursorPos( const CWnd* pParent , int ID , int Pos );
	void	SetEditCursorLastPos( CWnd* pParent , int ID );

	BOOL IsCheck( const CWnd* pParent , int ID );
	void SetCheck( CWnd* pParent , int ID , BOOL Check );
	void SetCheck( CWnd* pParent , std::initializer_list<int> IDs , BOOL Check );

	void Enable( CWnd* pParent, int ID , BOOL Enable );
	void Enable( CWnd* pParent, std::initializer_list<int> IDs , BOOL Enable );
	
	BOOL IsEmpty( const CWnd* pParent, int ID );
	BOOL IsEmpty( const CWnd* pParent , std::initializer_list<int> Controls );

	CString CompactPrePath( const CWnd* pParent , int ID , const CString& Path );
	CString CompactMidPath( const CWnd* pParent , int ID , const CString& Path );
	CString CompactSuffPath( const CWnd* pParent , int ID , const CString& Path );

	// 자식 컨트롤 Rect값을 부모의 창을 기준으로(=부모창이 0,0) 상대 Rect값으로 변환해서 리턴
	CRect GetRelativeRect( const CWnd* pParent , int ChildID );

	CRect GetClientRect( const CWnd* pParent , int ID );
	CRect GetWindowRect( const CWnd* pParent , int ID );
};