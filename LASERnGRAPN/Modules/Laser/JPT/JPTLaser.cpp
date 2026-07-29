#include "pch.h"
#include "JPTLaser.h"

constexpr uint8_t HEAD = 0x24;
constexpr uint8_t TAIL = 0x2A;
constexpr uint16_t ERR_FORMAT = 0x0045;

static std::vector<uint8_t> Build( JPTCmd Cmd , uint16_t Value )
{
    // 0x24 cmdL cmdH 0x02 valL valH 0x2A
    std::vector<uint8_t> Out;
    Out.reserve(7);

    uint16_t Data = (uint16_t)Cmd;

    Out.push_back( HEAD );
    Out.push_back( (uint8_t)(Data & 0xFF) );
    Out.push_back( (uint8_t)((Data >> 8) & 0xFF));
    Out.push_back( 0x02 );
    Out.push_back( (uint8_t)(Value & 0xFF) );
    Out.push_back( (uint8_t)((Value >> 8) & 0xFF) );
    Out.push_back( TAIL );

    return Out;
}

inline uint16_t ReadU16LE( const uint8_t* p ) noexcept
{
    return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
}

static BOOL IsError45( const std::vector<uint8_t>& Frame )
{
    // parameter = 0x45
    if ( Frame.size() < 7 ) return FALSE;
    if ( Frame[0] != HEAD ) return FALSE;
    if ( Frame.back() != TAIL ) return FALSE;
    if ( Frame[3] != 0x02 ) return FALSE;

    return (ReadU16LE(&Frame[4]) == ERR_FORMAT) ? TRUE : FALSE;
}

static inline uint16_t SetBit( uint16_t v, int bit, BOOL on )
{
    return on ? (v | (1u << bit)) : (v & ~(1u << bit));
}

static uint16_t PackCtrlBits( const JPTCtrlModeBits& b )
{
    uint16_t v = 0;
    v = SetBit( v , 0, b.MO );
    v = SetBit( v , 1, b.PA );
    v = SetBit( v , 2, b.Pulse );
    v = SetBit( v , 3, b.PRR );
    v = SetBit( v , 4, b.Power );
    return (v & 0x1F);
}

static void UnpackCtrlBits( uint16_t raw , JPTCtrlModeBits& out )
{
    raw &= 0x1F;
    out.MO    = (raw & (1u << 0)) ? TRUE : FALSE;
    out.PA    = (raw & (1u << 1)) ? TRUE : FALSE;
    out.Pulse = (raw & (1u << 2)) ? TRUE : FALSE;
    out.PRR   = (raw & (1u << 3)) ? TRUE : FALSE;
    out.Power = (raw & (1u << 4)) ? TRUE : FALSE;
}

JPTLaser::JPTLaser()
{
    InitializeCriticalSectionAndSpinCount( &_cs , 2000 );
}

JPTLaser::~JPTLaser()
{
    Close();

    DeleteCriticalSection( &_cs );
}

BOOL JPTLaser::Open( int COM , DWORD& Error )
{
    CSPtr CS( _cs );

    return m_Serial.OpenPort( COM , 57600 , 8 , ONESTOPBIT , NOPARITY , Error );
}

BOOL JPTLaser::IsOpen()
{
    if ( !m_Serial.IsConnected() ) return FALSE;

    CSPtr CS( _cs );

    // JPT Laser의 상태값을 얻어오는 프로토콜(0x0038) 요청을 통해서
    // COM 포트와 연결 및 통신이 정상인지 확인한다.
    uint16_t Ret = 0;
    return _ReadU16( JPTCmd::READ_LASER_STATUS , Ret , 100 );
}

void JPTLaser::Close()
{
    CSPtr CS( _cs );

    m_Serial.ClosePort();
}

BOOL JPTLaser::SetPower( double Percent )
{
    CSPtr CS( _cs );

    static Encoder encode( 0.0 , 100.0 , 0.0 , 4095.0 );

    return _TxRxU16( JPTCmd::SET_POWER , (uint16_t)encode.Get( Percent ) , NULL , 100 );
}

double JPTLaser::GetPower()
{
    CSPtr CS( _cs );

    uint16_t Ret = 0;
    if ( !_ReadU16( JPTCmd::READ_POWER_PERCENT , Ret , 100 ) ) return 0.0;

    return (double)Ret;
}

BOOL JPTLaser::SetPRR( int Khz )
{
    CSPtr CS( _cs );

    return _TxRxU16( JPTCmd::SET_PRR_KHZ , Khz , NULL , 100 );
}

int JPTLaser::GetPRR()
{
    CSPtr CS( _cs );

    uint16_t Ret = 0;
    if ( !_ReadU16( JPTCmd::READ_PRR_KHZ , Ret , 100 ) ) return 0;

    return (int)Ret;
}

BOOL JPTLaser::SetPulse( int ns )
{
    CSPtr CS( _cs );

    return _TxRxU16( JPTCmd::SET_PULSE_NS , ns , NULL , 100 );
}

int JPTLaser::GetPulse()
{
    CSPtr CS( _cs );

    uint16_t Ret = 0;
    if ( !_ReadU16( JPTCmd::READ_PULSE_NS , Ret , 100 ) ) return 0;

    return (int)Ret;
}

BOOL JPTLaser::LaserOn()
{
    CSPtr CS( _cs );

    // GUI_MO=1
    if ( !_TxRxU16( JPTCmd::SET_GUI_MO , 1 , NULL , 100 ) ) return FALSE;

    // GUI_PA=1
    if ( !_TxRxU16( JPTCmd::SET_GUI_PA , 1 , NULL , 100 ) ) return FALSE;

    return TRUE;
}

BOOL JPTLaser::LaserOff( BOOL EnableMO )
{
    CSPtr CS( _cs );

    // GUI_PA=0
    if ( !_TxRxU16( JPTCmd::SET_GUI_PA , 0 , NULL , 100 ) ) return FALSE; 

    // GUI_MO=0
    if ( !_TxRxU16( JPTCmd::SET_GUI_MO , EnableMO , NULL , 100 ) ) return FALSE; 

    return TRUE;
}

BOOL JPTLaser::RedBeamOn()
{
    CSPtr CS( _cs );

    return _TxRxU16( JPTCmd::SET_RED_BEAM , 1  , NULL , 100 );
}

BOOL JPTLaser::RedBeamOff( BOOL EnableMO )
{
    CSPtr CS( _cs );

    BOOL Ret1 = _TxRxU16( JPTCmd::SET_RED_BEAM , 0  , NULL , 100 );
    BOOL Ret2 = _TxRxU16( JPTCmd::SET_GUI_MO , EnableMO , NULL , 100 );

    return Ret1 && Ret2;
}

BOOL JPTLaser::SetMO( BOOL Enable )
{
    return _TxRxU16( JPTCmd::SET_GUI_MO , Enable , NULL , 100 );
}

BOOL JPTLaser::SetPA( BOOL Enable )
{
    return _TxRxU16( JPTCmd::SET_GUI_PA , Enable , NULL , 100 );
}

JPTStatus JPTLaser::GetStatus()
{
    CSPtr CS( _cs );

    uint16_t raw = 0;
    if ( !_ReadU16( JPTCmd::READ_LASER_STATUS , raw , 100 ) ) return JPTStatus();

    JPTStatus Status;

    Status.PowerON = TRUE;
    Status.PA = (raw & (1u << 0)) ? TRUE : FALSE;
    Status.MO = (raw & (1u << 1)) ? TRUE : FALSE;
    Status.Red = (raw & (1u << 2)) ? TRUE : FALSE;
    Status.Pump = (raw & (1u << 3)) ? TRUE : FALSE;

    Status.D0 = (raw & (1u << 4))  ? TRUE : FALSE;
    Status.D1 = (raw & (1u << 5))  ? TRUE : FALSE;
    Status.D2 = (raw & (1u << 6))  ? TRUE : FALSE;
    Status.D3 = (raw & (1u << 7))  ? TRUE : FALSE;
    Status.D4 = (raw & (1u << 8))  ? TRUE : FALSE;
    Status.D5 = (raw & (1u << 9))  ? TRUE : FALSE;
    Status.D6 = (raw & (1u << 10)) ? TRUE : FALSE;
    Status.D7 = (raw & (1u << 11)) ? TRUE : FALSE;

    return Status;
}

BOOL JPTLaser::_TxRxU16( JPTCmd Cmd , uint16_t TxValue , uint16_t* pRxValue , DWORD WaitTick )
{
    if ( !_SendU16( Cmd , TxValue ) ) return FALSE;

    std::vector<uint8_t> rx;
    if ( !_ReadFrameUntilTail( rx , WaitTick ) ) return FALSE;

    uint16_t Data = (uint16_t)Cmd;

    // echo cmd check
    if ( rx[1] != (uint8_t)(Data & 0xFF) ) return FALSE;
    if ( rx[2] != (uint8_t)((Data >> 8) & 0xFF) ) return FALSE;

    if ( IsError45(rx) ) return FALSE;
    if ( rx[3] != 0x02 ) return FALSE;

    if ( pRxValue ) 
        *pRxValue = ReadU16LE( &rx[4] );

    return TRUE;
}

BOOL JPTLaser::_SendU16( JPTCmd Cmd , uint16_t Value )
{
    if ( !m_Serial.IsConnected() ) return FALSE;

    std::vector<uint8_t> tx = Build( Cmd , Value );

    return (m_Serial.Send( tx.data(), (DWORD)tx.size() ) == tx.size()) ? TRUE : FALSE;
}

BOOL JPTLaser::_ReadU16( JPTCmd Cmd , uint16_t& OutValue , DWORD WaitTick )
{
    return _TxRxU16( Cmd , 0x0000 , &OutValue , WaitTick );
}

BOOL JPTLaser::_ReadFrameUntilTail( std::vector<uint8_t>& OutFrame , DWORD WaitTick )
{
    if ( !m_Serial.IsConnected() ) return FALSE;

    DWORD t0 = GetTickCount();
    while ( GetTickCount() - t0 < WaitTick )
    {
        BYTE buf[256] = {0};
        DWORD got = m_Serial.Read( buf, (DWORD)sizeof(buf) );

        if ( got == 0 ) CONTINUE( Sleep( 0 ) );
        
        OutFrame.insert( OutFrame.end() , buf , buf + got );

        // TAIL(0x2A) 나올 때까지 누적
        auto it = std::find( OutFrame.begin() , OutFrame.end() , TAIL );

        // 첫 TAIL까지만 프레임으로 사용 (뒤에 붙은 데이터는 여기선 무시)
        if ( it != OutFrame.end() ) BREAK( OutFrame.erase( it + 1, OutFrame.end() ) )
        
        if ( OutFrame.size() > 1024 ) return FALSE;
    }

    if ( OutFrame.size() < 5 ) return FALSE;
    if ( OutFrame.front() != HEAD ) return FALSE;
    if ( OutFrame.back()  != TAIL ) return FALSE;

    // head+cmd2+len+payload+tail
    const uint8_t len = OutFrame[3];
    return ( OutFrame.size() == (size_t)(5 + len) );
}

BOOL JPTLaser::_SetControlMode( uint16_t Mask0_31 )
{
    return _TxRxU16( JPTCmd::SET_CONTROL_MODE , Mask0_31 , NULL , 100 );
}

BOOL JPTLaser::_GetControlMode( uint16_t& OutMask0_31 )
{
    return _ReadU16( JPTCmd::READ_CONTROL_MODE , OutMask0_31 , 100 );
}

BOOL JPTLaser::SetControlModeBits( const JPTCtrlModeBits& Bits )
{
    CSPtr CS( _cs );

    return _SetControlMode( PackCtrlBits( Bits ) );
}

JPTCtrlModeBits JPTLaser::GetControlModeBits()
{
    CSPtr CS( _cs );

    uint16_t raw = 0;
    if ( !_GetControlMode( raw ) ) return JPTCtrlModeBits();

    JPTCtrlModeBits Ret;
    UnpackCtrlBits( raw, Ret );

    return Ret;
}