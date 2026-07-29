#pragma once

class ZeroG
{
public:

	ZeroG() = default;
	~ZeroG();

	BOOL   IsOpen() const;
	BOOL   OpenPort(int nPort);
	void   ClosePort();

	BOOL LaserShutter(BOOL OnOff);

private:

	BOOL SendLEDBrightness( int Value );
	BOOL SendPWM( int Value );
	BOOL SendGuideLaser( BOOL OnOff );
	BOOL Send5V( BOOL OnOff );
	BOOL SendLaserTrigger( BOOL OnOff );
	BOOL SendRelay( BOOL OnOff );
					 
private:

	BOOL   Send(BYTE nCmd, int nValue);

private:

	int m_Brightness = 0;
	CSerial  m_Serial;
};
