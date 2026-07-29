#pragma once

#include "UtilCommon.h"
#include "Singleton.h"

class CBitbus_Impl : public CSingleton<CBitbus_Impl>
{
public:
	CBitbus_Impl();
	~CBitbus_Impl();

	// Serial 연결
	void OpenSerial(int Port, DWORD dwBaud, BYTE byData, BYTE byStop, BYTE byParity, DWORD& LastError);
	// Serial 종료
	void CloseSerial();
	// Lock On/Off
	void LockOnOff(bool bFlag);
	// PWM 값 쓰기
	void SetPWM(int PWM1, int PWM2, int PWM3, int PWM4);
	// PWM1 값 읽기
	void ReadPWM(int& PWM1, int& PWM2, int& PWM3, int& PWM4);

private:
	CSerial m_Serial;

};

