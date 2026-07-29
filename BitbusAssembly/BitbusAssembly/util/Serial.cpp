#include "stdafx.h"
#include "Serial.h"

CSerial::CSerial()
{
	InitializeCriticalSectionAndSpinCount( &m_cs , 3000 );
}

CSerial::~CSerial()
{
	ClosePort();

	DeleteCriticalSection( &m_cs );
}

BOOL CSerial::OpenPort( int Port , DWORD dwBaud , BYTE byData , BYTE byStop , BYTE byParity , DWORD& LastError )
{
	CSPtr CS( m_cs );

	ClosePort();

	m_osRead.Offset = 0;
	m_osRead.OffsetHigh = 0;

	m_osWrite.Offset = 0;
	m_osWrite.OffsetHigh = 0;

	if ( !(m_osRead.hEvent = CreateEvent(NULL, TRUE, FALSE, NULL)) )
	{
		LastError = GetLastError();
		ClosePort();

		return FALSE;
	}

	if (! (m_osWrite.hEvent = CreateEvent(NULL, TRUE, FALSE, NULL)))
	{
		LastError = GetLastError();
		ClosePort();

		return FALSE;
	}

	if ( m_hComm != INVALID_HANDLE_VALUE ) ClosePort();

	CString PortName = STR( _T("\\\\.\\COM%d") , Port );

	m_hComm = CreateFile( PortName , GENERIC_READ | GENERIC_WRITE , 0 , NULL ,
						 OPEN_EXISTING , FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OVERLAPPED , NULL);

	if ( m_hComm == INVALID_HANDLE_VALUE )
	{
		LastError = GetLastError();
		ClosePort();

		return FALSE;
	}

	DCB dcb = { 0 , };
	dcb.DCBlength = sizeof(DCB);

	if( !GetCommState( m_hComm , &dcb ) )
	{
		LastError = GetLastError();
		ClosePort();

		return FALSE;
	}

	dcb.BaudRate = dwBaud;
	dcb.ByteSize = byData;
	dcb.Parity   = byParity;
	dcb.StopBits = byStop;

	if( !SetCommState( m_hComm , &dcb ) )
	{
		LastError = GetLastError();
		ClosePort();

		return FALSE;
	}

	if( !SetupComm( m_hComm , MAX_BUFFER_SIZE , MAX_BUFFER_SIZE ) ) return FALSE;

	COMMTIMEOUTS  CommTimeOuts = { 0 , };
	CommTimeOuts.ReadIntervalTimeout		  = 100;
	CommTimeOuts.ReadTotalTimeoutMultiplier   = 0;
	CommTimeOuts.ReadTotalTimeoutConstant	  = 1000;
	CommTimeOuts.WriteTotalTimeoutMultiplier  = 0;
	CommTimeOuts.WriteTotalTimeoutConstant    = 1000;

	if( !SetCommTimeouts( m_hComm , &CommTimeOuts ) )
	{
		LastError = GetLastError();
		ClosePort();

		return FALSE;
	}

	m_ComPort = Port;
	LastError = ERROR_SUCCESS;

	return TRUE;
}

void CSerial::ClosePort()
{
	CSPtr CS( m_cs );

	m_ComPort = INVALID_PORT_NUM;

	if ( m_hComm != INVALID_HANDLE_VALUE )
	{
		SetCommMask( m_hComm, 0);
		PurgeComm( m_hComm,	PURGE_TXABORT | PURGE_TXCLEAR | PURGE_RXABORT | PURGE_RXCLEAR);
		CLOSE_FILE( m_hComm );
	}

	CLOSE_HANDLE( m_osRead.hEvent );
	CLOSE_HANDLE( m_osWrite.hEvent );
}

DWORD CSerial::Send( const BYTE* pBuff , DWORD Size )
{
	if( m_ComPort == INVALID_PORT_NUM ) return 0;

	CSPtr CS( m_cs );

	DWORD dwWritten	= 0;

	if( WriteFile( m_hComm, pBuff, Size, &dwWritten, &m_osWrite) ) return dwWritten;

	if ( GetLastError() != ERROR_IO_PENDING ) return 0;

	while ( !GetOverlappedResult( m_hComm, &m_osWrite, &dwWritten, TRUE ) )
	{
		DWORD dw = GetLastError();

		Sleep( 100 );

		if ( dw != ERROR_IO_INCOMPLETE ) break;
	}

	COMSTAT	comstat		 = { 0 , };
	DWORD	dwErrorFlags = 0;

	ClearCommError( m_hComm, &dwErrorFlags, &comstat);

	return dwWritten;
}

DWORD CSerial::Read(BYTE *pBuff, DWORD nToRead)
{
	if( m_ComPort == INVALID_PORT_NUM ) return 0;

	CSPtr CS( m_cs );

	COMSTAT comstat		 = { 0 , };
	DWORD	dwErrorFlags = 0;

	if ( !ClearCommError( m_hComm , &dwErrorFlags , &comstat ) ) return 0;
	if ( dwErrorFlags != 0 ) return 0;

	DWORD dwRead = 0;

	if ( ReadFile( m_hComm, pBuff, nToRead, &dwRead, &m_osRead) ) return dwRead;

	if ( GetLastError() != ERROR_IO_PENDING ) return 0;

	while ( !GetOverlappedResult( m_hComm, &m_osRead, &dwRead, TRUE) )
	{
		DWORD dw = GetLastError();

		Sleep( 10 );

		if ( dw != ERROR_IO_INCOMPLETE ) break;
	}

	ClearCommError( m_hComm, &dwErrorFlags, &comstat);

	return dwRead;
}

DWORD CSerial::SendAndRead( const BYTE* pSend , DWORD SendSize , BYTE* ResBuffer , DWORD ResBufferSize , DWORD WaitTick )
{
	CSPtr CS( m_cs );

	if ( Send( pSend , SendSize ) <= 0 ) return 0;

	Sleep( WaitTick );

	BYTE Buffer[MAX_BUFFER_SIZE] = { 0 , };
	int ReadSize = Read( Buffer , MAX_BUFFER_SIZE );
	if ( ReadSize <= 0 ) return 0;

	memcpy( ResBuffer , Buffer , ReadSize );

	return ReadSize;
}