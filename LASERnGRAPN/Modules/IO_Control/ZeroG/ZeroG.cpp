#include "pch.h"
#include "ZeroG.h"

#define STX_1 0xAE
#define STX_2 0xAF
#define ETX_1 0xFA
#define ETX_2 0xEA

ZeroG::~ZeroG()
{
	ClosePort();
}

BOOL ZeroG::IsOpen() const
{
	return m_Serial.IsConnected();
}

BOOL ZeroG::OpenPort(int nPort )
{
	ClosePort();

	DWORD Error = 0;
	return m_Serial.OpenPort( nPort , 115200 , 8 , ONESTOPBIT , NOPARITY , Error);
}

void ZeroG::ClosePort()
{
	m_Serial.ClosePort();
}

BOOL ZeroG::Send(BYTE nCmd, int nValue)
{
	if (!IsOpen()) return FALSE;

	BYTE bData[7];
	bData[0] = STX_1;
	bData[1] = STX_2;
	bData[2] = nCmd;
	bData[3] = (BYTE)( nValue & 0xFF);
	bData[4] = (BYTE)((nValue >> 8) & 0x0F);
	bData[5] = ETX_1;
	bData[6] = ETX_2;

	return (m_Serial.Send(bData, 7) == 7) ? TRUE : FALSE;
}

BOOL ZeroG::LaserShutter(BOOL OnOff)
{
	return SendLaserTrigger(OnOff);
}

BOOL ZeroG::SendLEDBrightness( int Value )
{
	m_Brightness = Value;

	return Send( Value == 0 ? 0 : 1  , Value ); 
}

BOOL ZeroG::SendPWM( int Value )
{
	return Send( Value == 0 ? 0 : 1  , m_Brightness);
}

BOOL ZeroG::SendGuideLaser( BOOL OnOff )
{
	return Send( OnOff ? 0x03 : 0x02  , m_Brightness ); 
}

BOOL ZeroG::Send5V( BOOL OnOff )
{
	return Send( OnOff ? 0x03 : 0x02  , m_Brightness ); 
}

BOOL ZeroG::SendLaserTrigger( BOOL OnOff )
{
	return Send( OnOff ? 0x05 : 0x04  , m_Brightness ); 
}

BOOL ZeroG::SendRelay( BOOL OnOff )
{
	return Send( OnOff ? 0x05 : 0x04  , m_Brightness ); 
}