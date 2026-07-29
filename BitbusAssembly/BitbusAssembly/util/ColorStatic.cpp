// This file was created on March 28th 2001 by Robert Brault.
// I created this Class to be able change the Color of your Static Text.
// This is Derived from CStatic.
//
// There are three functions available Currently:
// SetBkColor(COLORREF crColor)
// SetTextColor(COLORREF crColor)
//
// How To Use:
// Add three files to your project
// ColorStatic.cpp, ColorStatic.h and Color.h
// Color.h has (#define)'s for different colors (add any color you desire).
//
// Add #include "ColorStatic.h" to your Dialogs Header file.
// Declare an instance of CColorStatic for each static text being modified.
// Ex. CColorStatic m_stText;
//
// In your OnInitDialog() add a SubclassDlgItem for each CColorStatic member variable.
// Ex. m_stText.SubclassDlgItem(IDC_ST_TEXT, this);
// In this same function initialize your color for each piece of text unless you want the default.

// ColorStatic.cpp : implementation file
//

#include "stdafx.h"
#include "ColorStatic.h"
//#include "Color.h"
#include "FontManager.h" // 김동현 20180226 : 폰트 관련 기능 추가

#ifdef _DEBUG
#define new DEBUG_NEW
#undef THIS_FILE
static char THIS_FILE[] = __FILE__;
#endif

/////////////////////////////////////////////////////////////////////////////
// CColorStatic

CColorStatic::CColorStatic()
{
	m_crBkColor = ::GetSysColor(COLOR_3DFACE); // Initializing the Background Color to the system face color.
	m_crTextColor = BLACK;						// Initializing the text to Black
	m_brBkgnd.CreateSolidBrush(m_crBkColor); // Create the Brush Color for the Background.
}

CColorStatic::~CColorStatic()
{
}

BEGIN_MESSAGE_MAP(CColorStatic , CStatic)
	//{{AFX_MSG_MAP(CColorStatic)
	ON_MESSAGE(WM_SETTEXT , OnSetText)
	ON_WM_CTLCOLOR_REFLECT()
	//}}AFX_MSG_MAP
END_MESSAGE_MAP()

/////////////////////////////////////////////////////////////////////////////
// CColorStatic message handlers

HBRUSH CColorStatic::CtlColor(CDC* pDC , UINT /*nCtlColor*/)
{
	HBRUSH hbr;

	if ( m_crBkColor == TRANSPARENT )
	{
		pDC->SetBkMode(TRANSPARENT);
		pDC->SetTextColor(m_crTextColor); // Setting the Text Color to the one Passed by the Dialog
		hbr = (HBRUSH)GetStockObject(NULL_BRUSH);
	}
	else
	{
		hbr = (HBRUSH)m_brBkgnd; // Passing a Handle to the Brush
		pDC->SetBkColor(m_crBkColor); // Setting the Color of the Text Background to the one passed by the Dialog
		pDC->SetTextColor(m_crTextColor); // Setting the Text Color to the one Passed by the Dialog
	}

	return hbr;
}

void CColorStatic::SetBkColor(COLORREF crColor)
{
	if ( crColor == TRANSPARENT )
	{
		m_crBkColor = crColor;	// 투명일경우
	}
	else
	{
		m_crBkColor = crColor; // Passing the value passed by the dialog to the member varaible for Backgound Color
		m_brBkgnd.DeleteObject(); // Deleting any Previous Brush Colors if any existed.
		m_brBkgnd.CreateSolidBrush(crColor); // Creating the Brush Color For the Static Text Background
		RedrawWindow();
	}
}

//----------------------------------------------------------------------
// 김동현 20180226 : 폰트 함수 추가
BOOL CColorStatic::SetFontSize(int Size)
{
	CFont* pFont = CFontManager::GetInstance()->GetFont(Size);
	if ( !pFont ) return FALSE;

	SetFont(pFont);
	return TRUE;
}
//----------------------------------------------------------------------

void CColorStatic::SetTextColor(COLORREF crColor)
{
	m_crTextColor = crColor; // Passing the value passed by the dialog to the member varaible for Text Color
	RedrawWindow();
}

LRESULT CColorStatic::OnSetText(WPARAM wParam , LPARAM lParam)
{
	CString Text;
	GetWindowText( Text );

	if ( !Text.Compare( (LPCTSTR)lParam ) ) return 0;

	LRESULT Result = Default();

	if ( m_crBkColor == TRANSPARENT )
	{
		CRect Rect;
		GetWindowRect(&Rect);
		GetParent()->ScreenToClient(&Rect);
		GetParent()->InvalidateRect(&Rect);
		GetParent()->UpdateWindow();
	}

	return Result;
}

void CColorStatic::SetDefaultStyle( int FontSize , COLORREF TextColor , COLORREF BKColor )
{
	SetBkColor(BKColor);
	SetFontSize(FontSize);
	SetTextColor(TextColor);
}
