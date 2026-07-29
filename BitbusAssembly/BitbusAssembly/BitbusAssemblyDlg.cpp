#include "stdafx.h"
#include "framework.h"
#include "BitbusAssembly.h"
#include "BitbusAssemblyDlg.h"

#ifdef _DEBUG
#define new DEBUG_NEW
#endif

CBitbusAssemblyDlg::CBitbusAssemblyDlg(CWnd* pParent) : CDialog(IDD, pParent) {}

void CBitbusAssemblyDlg::DoDataExchange(CDataExchange* pDX)
{
	CDialog::DoDataExchange(pDX);
}

BEGIN_MESSAGE_MAP(CBitbusAssemblyDlg, CDialog)
    ON_UI_INVOKE()
    ON_BN_CLICKED( IDC_BUTTON_OPEN , &CBitbusAssemblyDlg::OnBnClickedButtonOpen )
    ON_BN_CLICKED( IDC_BUTTON_READ_PWM , &CBitbusAssemblyDlg::OnBnClickedButtonReadPwm )
    ON_BN_CLICKED( IDC_BUTTON_READ_RELAY , &CBitbusAssemblyDlg::OnBnClickedButtonReadRelay )
    ON_BN_CLICKED( IDC_BUTTON_READ_5V , &CBitbusAssemblyDlg::OnBnClickedButtonRead5v )
    ON_BN_CLICKED( IDC_BUTTON_LOCK_ON , &CBitbusAssemblyDlg::OnBnClickedButtonLockOn )
    ON_BN_CLICKED( IDC_BUTTON_LOCK_OFF , &CBitbusAssemblyDlg::OnBnClickedButtonLockOff )
    ON_BN_CLICKED( IDC_BUTTON_WRITE_PWM , &CBitbusAssemblyDlg::OnBnClickedButtonWritePwm )
    ON_BN_CLICKED( IDC_BUTTON_WRITE_RELAY , &CBitbusAssemblyDlg::OnBnClickedButtonWriteRelay )
    ON_BN_CLICKED( IDC_BUTTON_WRITE_5V , &CBitbusAssemblyDlg::OnBnClickedButtonWrite5v )
END_MESSAGE_MAP()

BOOL CBitbusAssemblyDlg::OnInitDialog()
{
	CDialog::OnInitDialog();

    Invoke::Init();

	return TRUE;
}

void CBitbusAssemblyDlg::OnCancel()
{
    Invoke::Release();

    CDialog::OnCancel();
}

void CBitbusAssemblyDlg::OnBnClickedButtonOpen()
{
    int Port = UI::GetInt( this , IDC_EDIT_COM_PORT );

    DWORD LastError = 0;
    // Stop bits 사용자 1은 OpenPort 인자 0 사용.
    // Stop bits 사용자 1.5은 OpenPort 인자 1 사용.
    // Stop bits 사용자 2은 OpenPort 인자 2 사용.
    if (!m_Serial.OpenPort(Port, 38400, 8, 0, 0, LastError))
        RETURN_MSG( STR(_T("개방실패:Code[%d]") , LastError ) );
}

void CBitbusAssemblyDlg::OnBnClickedButtonReadPwm()
{
    if ( !m_Serial.IsConnected() ) RETURN_MSG( _T("연결 필요") );

    WORK_1( [this]()
    {
        BYTE  SendBuf[]   = "S,R,P,E";
        BYTE  RecvBuf[64] = { 0 };

        DWORD SendSize = m_Serial.SendAndRead( SendBuf , _countof(SendBuf) , RecvBuf , _countof(RecvBuf) , 500 );
        if ( SendSize <= 0 ) RETURN_MSG( _T("PWM 요청 시리얼 통신 실패") );

        HighOrderVector<CStringA> Ret = Str::TokenizerA( (char*)RecvBuf , ',' );
        if ( Ret.size() != 8 ) RETURN_MSG( _T("PWM 응답 포맷 오류") );

        int PWM1 = atoi( Ret[3] );
        int PWM2 = atoi( Ret[4] );
        int PWM3 = atoi( Ret[5] );
        int PWM4 = atoi( Ret[6] );

        UI_1( this->m_hWnd , [this,PWM1,PWM2,PWM3,PWM4]()
        {
            UI::SetInt( this , IDC_EDIT_READ_PWM_1 , PWM1 );
            UI::SetInt( this , IDC_EDIT_READ_PWM_2 , PWM2 );
            UI::SetInt( this , IDC_EDIT_READ_PWM_3 , PWM3 );
            UI::SetInt( this , IDC_EDIT_READ_PWM_4 , PWM4 );
        });
    });
}

void CBitbusAssemblyDlg::OnBnClickedButtonReadRelay()
{
    if ( !m_Serial.IsConnected() ) RETURN_MSG( _T("연결 필요") );

    WORK_1( [this]()
    {
        BYTE  SendBuf[]   = "S,R,R,E";
        BYTE  RecvBuf[64] = { 0 };

        DWORD SendSize = m_Serial.SendAndRead( SendBuf , _countof(SendBuf) , RecvBuf , _countof(RecvBuf) , 500 );
        if ( SendSize <= 0 ) RETURN_MSG( _T("Relay 요청 시리얼 통신 실패") );

        HighOrderVector<CStringA> Ret = Str::TokenizerA( (char*)RecvBuf , ',' );
        if ( Ret.size() != 8 ) RETURN_MSG( _T("Relay 응답 포맷 오류") );

        int Relay1 = atoi( Ret[3] );
        int Relay2 = atoi( Ret[4] );
        int Relay3 = atoi( Ret[5] );
        int Relay4 = atoi( Ret[6] );

        UI_1( this->m_hWnd , [this,Relay1,Relay2,Relay3,Relay4]()
        {
            UI::SetInt( this , IDC_EDIT_READ_RELAY_1 , Relay1 );
            UI::SetInt( this , IDC_EDIT_READ_RELAY_2 , Relay2 );
            UI::SetInt( this , IDC_EDIT_READ_RELAY_3 , Relay3 );
            UI::SetInt( this , IDC_EDIT_READ_RELAY_4 , Relay4 );
        });
    });
}

void CBitbusAssemblyDlg::OnBnClickedButtonRead5v()
{
    if ( !m_Serial.IsConnected() ) RETURN_MSG( _T("연결 필요") );

    WORK_1( [this]()
    {
        BYTE  SendBuf[]   = "S,R,D,E";
        BYTE  RecvBuf[64] = { 0 };

        DWORD SendSize = m_Serial.SendAndRead( SendBuf , _countof(SendBuf) , RecvBuf , _countof(RecvBuf) , 500 );
        if ( SendSize <= 0 ) RETURN_MSG( _T("5V 상태 요청 시리얼 통신 실패") );

        HighOrderVector<CStringA> Ret = Str::TokenizerA( (char*)RecvBuf , ',' );
        if ( Ret.size() != 8 ) RETURN_MSG( _T("5V 상태 응답 포맷 오류") );

        int Ch1_5V = atoi( Ret[3] );
        int Ch2_5V = atoi( Ret[4] );
        int Ch3_5V = atoi( Ret[5] );
        int Ch4_5V = atoi( Ret[6] );

        UI_1( this->m_hWnd , [this,Ch1_5V,Ch2_5V,Ch3_5V,Ch4_5V]()
        {
            UI::SetInt( this , IDC_EDIT_READ_5V_1 , Ch1_5V );
            UI::SetInt( this , IDC_EDIT_READ_5V_2 , Ch2_5V );
            UI::SetInt( this , IDC_EDIT_READ_5V_3 , Ch3_5V );
            UI::SetInt( this , IDC_EDIT_READ_5V_4 , Ch4_5V );
        });
    });
}

void CBitbusAssemblyDlg::OnBnClickedButtonLockOn()
{
    if ( !m_Serial.IsConnected() ) RETURN_MSG( _T("연결 필요") );

    WORK_1( [this]()
    {
        BYTE  SendBuf[]   = "S,LOCK,ON,E";
        BYTE  RecvBuf[64] = { 0 };

        DWORD SendSize = m_Serial.SendAndRead( SendBuf , _countof(SendBuf) , RecvBuf , _countof(RecvBuf) , 500 );
        if ( SendSize <= 0 ) RETURN_MSG( _T("Lock ON 요청 시리얼 통신 실패") );

        //HighOrderVector<CStringA> Ret = Str::TokenizerA( (char*)RecvBuf , ',' );
        //if ( Ret.size() != 1 ) RETURN_MSG( _T("Lock ON 응답 포맷 오류") );

        //UI_1( this->m_hWnd , [ this , OnOff = Ret[2] ]()
        //{
        //    Alert( STR( _T("Lock On 응답 : %s") , OnOff ) );
        //});
    });
}

void CBitbusAssemblyDlg::OnBnClickedButtonLockOff()
{
    if ( !m_Serial.IsConnected() ) RETURN_MSG( _T("연결 필요") );

    WORK_1( [this]()
    {
        BYTE  SendBuf[]   = "S,LOCK,OFF,E";
        BYTE  RecvBuf[64] = { 0 };

        DWORD SendSize = m_Serial.SendAndRead( SendBuf , _countof(SendBuf) , RecvBuf , _countof(RecvBuf) , 500 );
        if ( SendSize <= 0 ) RETURN_MSG( _T("Lock Off 요청 시리얼 통신 실패") );

        //HighOrderVector<CStringA> Ret = Str::TokenizerA( (char*)RecvBuf , ',' );
        //if ( Ret.size() != 8 ) RETURN_MSG( _T("Lock Off 응답 포맷 오류") );

        //UI_1( this->m_hWnd , [ this , OnOff = Ret[2] ]()
        //{
        //    Alert( STR( _T("Lock Off 응답 : %s") , OnOff ) );
        //});
    });
}

void CBitbusAssemblyDlg::OnBnClickedButtonWritePwm()
{
    if ( !m_Serial.IsConnected() ) RETURN_MSG( _T("연결 필요") );

    int PWM1 = UI::GetInt( this , IDC_EDIT_WRITE_PWM_1 );
    int PWM2 = UI::GetInt( this , IDC_EDIT_WRITE_PWM_2 );
    int PWM3 = UI::GetInt( this , IDC_EDIT_WRITE_PWM_3 );
    int PWM4 = UI::GetInt( this , IDC_EDIT_WRITE_PWM_4 );

    WORK_1( [this,PWM1,PWM2,PWM3,PWM4]()
    {
        CStringA Req     = STR_A( "S,T,P,%d,%d,%d,%d,E" , PWM1 , PWM2 , PWM3 , PWM4 );
        BYTE     Buf[64] = { 0 };

        DWORD SendSize = m_Serial.SendAndRead( (BYTE*)(LPCSTR)Req , Req.GetLength() , Buf , _countof(Buf) , 500 );
        if ( SendSize <= 0 ) RETURN_MSG( _T("PWM 기록 요청 시리얼 통신 실패") );

        HighOrderVector<CStringA> Ret = Str::TokenizerA( (char*)Buf , ',' );
        if ( Ret.size() != 8 ) RETURN_MSG( _T("PWM 기록 요청 응답 포맷 오류") );

        int Res1 = atoi( Ret[3] );
        int Res2 = atoi( Ret[4] );
        int Res3 = atoi( Ret[5] );
        int Res4 = atoi( Ret[6] );

        UI_1( this->m_hWnd , [this,Res1,Res2,Res3,Res4]()
        {
            UI::SetInt( this , IDC_EDIT_WRITE_PWM_1 , Res1 );
            UI::SetInt( this , IDC_EDIT_WRITE_PWM_2 , Res2 );
            UI::SetInt( this , IDC_EDIT_WRITE_PWM_3 , Res3 );
            UI::SetInt( this , IDC_EDIT_WRITE_PWM_4 , Res4 );
        });
    });
}

void CBitbusAssemblyDlg::OnBnClickedButtonWriteRelay()
{
    if ( !m_Serial.IsConnected() ) RETURN_MSG( _T("연결 필요") );

    BOOL Relay1 = UI::GetInt( this , IDC_EDIT_WRITE_RELAY_1 ) != 0 ? TRUE : FALSE;
    BOOL Relay2 = UI::GetInt( this , IDC_EDIT_WRITE_RELAY_2 ) != 0 ? TRUE : FALSE;
    BOOL Relay3 = UI::GetInt( this , IDC_EDIT_WRITE_RELAY_3 ) != 0 ? TRUE : FALSE;
    BOOL Relay4 = UI::GetInt( this , IDC_EDIT_WRITE_RELAY_4 ) != 0 ? TRUE : FALSE;

    WORK_1( [this,Relay1,Relay2,Relay3,Relay4]()
    {
        CStringA Req     = STR_A( "S,T,R,%d,%d,%d,%d,E" , Relay1 , Relay2 , Relay3 , Relay4 );
        BYTE     Buf[64] = { 0 };

        DWORD SendSize = m_Serial.SendAndRead( (BYTE*)(LPCSTR)Req , Req.GetLength() , Buf , _countof(Buf) , 500 );
        if ( SendSize <= 0 ) RETURN_MSG( _T("Relay 기록 요청 시리얼 통신 실패") );

        HighOrderVector<CStringA> Ret = Str::TokenizerA( (char*)Buf , ',' );
        if ( Ret.size() != 8 ) RETURN_MSG( _T("Relay 기록 요청 응답 포맷 오류") );

        BOOL Res1 = atoi( Ret[3] ) != 0 ? TRUE : FALSE;
        BOOL Res2 = atoi( Ret[4] ) != 0 ? TRUE : FALSE;
        BOOL Res3 = atoi( Ret[5] ) != 0 ? TRUE : FALSE;
        BOOL Res4 = atoi( Ret[6] ) != 0 ? TRUE : FALSE;

        UI_1( this->m_hWnd , [this,Res1,Res2,Res3,Res4]()
        {
            UI::SetInt( this , IDC_EDIT_WRITE_RELAY_1 , Res1 );
            UI::SetInt( this , IDC_EDIT_WRITE_RELAY_2 , Res2 );
            UI::SetInt( this , IDC_EDIT_WRITE_RELAY_3 , Res3 );
            UI::SetInt( this , IDC_EDIT_WRITE_RELAY_4 , Res4 );
        });
    });
}

void CBitbusAssemblyDlg::OnBnClickedButtonWrite5v()
{
    if ( !m_Serial.IsConnected() ) RETURN_MSG( _T("연결 필요") );

    BOOL Ch1_5V = UI::GetInt( this , IDC_EDIT_WRITE_5V_1 ) != 0 ? TRUE : FALSE;
    BOOL Ch2_5V = UI::GetInt( this , IDC_EDIT_WRITE_5V_1 ) != 0 ? TRUE : FALSE;
    BOOL Ch3_5V = UI::GetInt( this , IDC_EDIT_WRITE_5V_1 ) != 0 ? TRUE : FALSE;
    BOOL Ch4_5V = UI::GetInt( this , IDC_EDIT_WRITE_5V_1 ) != 0 ? TRUE : FALSE;

    WORK_1( [this,Ch1_5V,Ch2_5V,Ch3_5V,Ch4_5V]()
    {
        CStringA Req     = STR_A( "S,T,D,%d,%d,%d,%d,E" , Ch1_5V , Ch2_5V , Ch3_5V , Ch4_5V );
        BYTE     Buf[64] = { 0 };

        DWORD SendSize = m_Serial.SendAndRead( (BYTE*)(LPCSTR)Req , Req.GetLength() , Buf , _countof(Buf) , 500 );
        if ( SendSize <= 0 ) RETURN_MSG( _T("5v 기록 요청 시리얼 통신 실패") );

        HighOrderVector<CStringA> Ret = Str::TokenizerA( (char*)Buf , ',' );
        if ( Ret.size() != 8 ) RETURN_MSG( _T("5v 기록 요청 응답 포맷 오류") );

        BOOL Res1 = atoi( Ret[3] ) != 0 ? TRUE : FALSE;
        BOOL Res2 = atoi( Ret[4] ) != 0 ? TRUE : FALSE;
        BOOL Res3 = atoi( Ret[5] ) != 0 ? TRUE : FALSE;
        BOOL Res4 = atoi( Ret[6] ) != 0 ? TRUE : FALSE;

        UI_1( this->m_hWnd , [this,Res1,Res2,Res3,Res4]()
        {
            UI::SetInt( this , IDC_EDIT_WRITE_5V_1 , Res1 );
            UI::SetInt( this , IDC_EDIT_WRITE_5V_2 , Res2 );
            UI::SetInt( this , IDC_EDIT_WRITE_5V_3 , Res3 );
            UI::SetInt( this , IDC_EDIT_WRITE_5V_4 , Res4 );
        });
    });
}
