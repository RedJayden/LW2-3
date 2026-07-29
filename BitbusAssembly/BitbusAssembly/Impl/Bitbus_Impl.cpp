#include "stdafx.h"
#include "Bitbus_Impl.h"


CBitbus_Impl::CBitbus_Impl()
{
}

CBitbus_Impl::~CBitbus_Impl()
{

}

// Serial 연결
void CBitbus_Impl::OpenSerial(int Port, DWORD dwBaud, BYTE byData, BYTE byStop, BYTE byParity, DWORD& LastError)
{
	if (!m_Serial.OpenPort(Port, dwBaud, byData, byStop, byParity, LastError))
		RETURN_MSG(STR(_T("Port Open 실패 : Code[%d]"), LastError));
}

// Serial 종료
void CBitbus_Impl::CloseSerial()
{
	m_Serial.ClosePort();
}

// Lock On/Off
void CBitbus_Impl::LockOnOff(bool bFlag)
{
	//if (!m_Serial.IsConnected()) RETURN_MSG(_T("포트가 연결되지 않았습니다."));
	if (!m_Serial.IsConnected()) return;

	if (bFlag)
	{// ON
		BYTE  SendBuf[] = "S,LOCK,ON,E";
		BYTE  RecvBuf[64] = { 0 };

		DWORD SendSize = m_Serial.SendAndRead(SendBuf, _countof(SendBuf), RecvBuf, _countof(RecvBuf), 500);
		if (SendSize <= 0) RETURN_MSG(_T("Lock ON 요청 시리얼 통신 실패"));
	}
	else
	{// OFF
		BYTE  SendBuf[] = "S,LOCK,OFF,E";
		BYTE  RecvBuf[64] = { 0 };

		DWORD SendSize = m_Serial.SendAndRead(SendBuf, _countof(SendBuf), RecvBuf, _countof(RecvBuf), 500);
		if (SendSize <= 0) RETURN_MSG(_T("Lock Off 요청 시리얼 통신 실패"));
	}
}

// PWM 값 쓰기
void CBitbus_Impl::SetPWM(int PWM1, int PWM2, int PWM3, int PWM4)
{
	//if (!m_Serial.IsConnected()) RETURN_MSG(_T("포트가 연결되지 않았습니다."));
	if (!m_Serial.IsConnected()) return;

	CStringA Req = STR_A("S,T,P,%d,%d,%d,%d,E", PWM1, PWM2, PWM3, PWM4);
	BYTE     Buf[64] = { 0 };

	DWORD SendSize = m_Serial.SendAndRead((BYTE*)(LPCSTR)Req, Req.GetLength(), Buf, _countof(Buf), 500);
	if (SendSize <= 0) RETURN_MSG(_T("PWM 기록 요청 시리얼 통신 실패"));

	HighOrderVector<CStringA> Ret = Str::TokenizerA((char*)Buf, ',');
	if (Ret.size() != 8) RETURN_MSG(_T("PWM 기록 요청 응답 포맷 오류"));
}

// PWM 값 읽기
void CBitbus_Impl::ReadPWM(int& PWM1, int& PWM2, int& PWM3, int& PWM4)
{
	//if (!m_Serial.IsConnected()) RETURN_MSG(_T("포트가 연결되지 않았습니다."));
	if (!m_Serial.IsConnected()) return;

	BYTE  SendBuf[] = "S,R,P,E";
	BYTE  RecvBuf[64] = { 0 };

	DWORD SendSize = m_Serial.SendAndRead(SendBuf, _countof(SendBuf), RecvBuf, _countof(RecvBuf), 500);
	if (SendSize <= 0) RETURN_MSG(_T("PWM 요청 시리얼 통신 실패"));

	HighOrderVector<CStringA> Ret = Str::TokenizerA((char*)RecvBuf, ',');
	if (Ret.size() != 8) RETURN_MSG(_T("PWM 응답 포맷 오류"));

	PWM1 = atoi(Ret[3]);
	PWM2 = atoi(Ret[4]);
	PWM3 = atoi(Ret[5]);
	PWM4 = atoi(Ret[6]);
}
