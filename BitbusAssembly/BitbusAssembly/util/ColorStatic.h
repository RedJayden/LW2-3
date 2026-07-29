// This file was created on March 28th 2001. By Robert Brault
//
//

#if !defined(AFX_COLORSTATIC_H__614C19E7_EA25_42DF_928A_51AC901B813D__INCLUDED_)
#define AFX_COLORSTATIC_H__614C19E7_EA25_42DF_928A_51AC901B813D__INCLUDED_

#if _MSC_VER > 1000
#pragma once
#endif // _MSC_VER > 1000
// ColorStatic.h : header file
//
//#include "color.h"
/////////////////////////////////////////////////////////////////////////////
// CColorStatic window

class CColorStatic : public CStatic
{
	// Construction
public:
	void SetTextColor(COLORREF crColor); // This Function is to set the Color for the Text.
	void SetBkColor(COLORREF crColor); // This Function is to set the BackGround Color for the Text.
	BOOL SetFontSize(int Size); // 김동현 20180226 : 폰트 함수 추가
	CColorStatic();

	// dh.kim 2018-05-10 11:34:43 : 다이얼로그 초기화중에 Static 컨트롤 초기화하는 코드가 중복을 막기 위해서.
	void SetDefaultStyle( int FontSize , COLORREF TextColor = BLACK , COLORREF BKColor = TRANSPARENT );

	// Overrides
		// ClassWizard generated virtual function overrides
		//{{AFX_VIRTUAL(CColorStatic)
		//}}AFX_VIRTUAL

	virtual ~CColorStatic();

	// Generated message map functions
protected:
	//{{AFX_MSG(CColorStatic)

	CBrush m_brBkgnd; // Holds Brush Color for the Static Text
	COLORREF m_crBkColor; // Holds the Background Color for the Text
	COLORREF m_crTextColor; // Holds the Color for the Text

	afx_msg LRESULT OnSetText(WPARAM , LPARAM);

	afx_msg HBRUSH CtlColor(CDC* pDC , UINT nCtlColor);
	//}}AFX_MSG

	DECLARE_MESSAGE_MAP()
};

/////////////////////////////////////////////////////////////////////////////

//{{AFX_INSERT_LOCATION}}
// Microsoft Visual C++ will insert additional declarations immediately before the previous line.

#endif // !defined(AFX_COLORSTATIC_H__614C19E7_EA25_42DF_928A_51AC901B813D__INCLUDED_)
