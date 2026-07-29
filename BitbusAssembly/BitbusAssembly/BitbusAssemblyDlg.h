#pragma once

class CBitbusAssemblyDlg : public CDialog
{
public:

	CBitbusAssemblyDlg(CWnd* pParent = nullptr);

	enum { IDD = IDD_BITBUSEXAMPLE_DIALOG };

private:

    virtual BOOL OnInitDialog();
	virtual void DoDataExchange(CDataExchange* pDX);
    virtual void OnCancel();
    DECLARE_MESSAGE_MAP()
    DECLARE_UI_INVOKE()
    afx_msg void OnBnClickedButtonOpen();
    afx_msg void OnBnClickedButtonReadPwm();
    afx_msg void OnBnClickedButtonReadRelay();
    afx_msg void OnBnClickedButtonRead5v();
    afx_msg void OnBnClickedButtonLockOn();
    afx_msg void OnBnClickedButtonLockOff();
    afx_msg void OnBnClickedButtonWritePwm();
    afx_msg void OnBnClickedButtonWriteRelay();
    afx_msg void OnBnClickedButtonWrite5v();

private:

    CSerial m_Serial;
};
