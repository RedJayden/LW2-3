#pragma once

#include <afxbutton.h>

class CMFCCheckButton : public CMFCButton
{
public:

	CMFCCheckButton() : m_bChecked(FALSE) {}
	
	void SetCheck( BOOL Check )
	{
		SetFaceColor( Check ? BtnColor::Check : BtnColor::Uncheck );
		m_bChecked = Check;
	}

	inline void Toggle() { SetCheck( !IsChecked() ); }

	inline BOOL IsChecked() const { return m_bChecked; }

private:

	BOOL m_bChecked;
};

