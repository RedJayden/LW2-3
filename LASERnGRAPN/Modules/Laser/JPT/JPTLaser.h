#pragma once

// 제조사 UI의 체크박스 1:1 대응
// TRUE = Internal(GUI/RS232)
// FALSE = External(DB25)
struct JPTCtrlModeBits
{
    BOOL Power = FALSE;
    BOOL PRR = FALSE;
    BOOL Pulse = FALSE;
    BOOL PA = FALSE;
    BOOL MO = FALSE;

    static JPTCtrlModeBits CtrlFree()
    {
        JPTCtrlModeBits Ret;

        Ret.Power = TRUE;
        Ret.PRR = TRUE;
        Ret.Pulse = TRUE;
        Ret.PA = FALSE;
        Ret.MO = TRUE;

        return Ret;
    }

    static JPTCtrlModeBits CtrlGUI()
    {
        JPTCtrlModeBits Ret;

        Ret.Power = TRUE;
        Ret.PRR = TRUE;
        Ret.Pulse = TRUE;
        Ret.PA = TRUE;
        Ret.MO = TRUE;

        return Ret;
    }
};

struct JPTStatus
{
    BOOL PowerON = FALSE;

    BOOL PA = FALSE;  // bit0
    BOOL MO = FALSE;  // bit1
    BOOL Red = FALSE;  // bit2
    BOOL Pump  = FALSE;  // bit3

    BOOL D0 = FALSE;    // bit4
    BOOL D1 = FALSE;    // bit5
    BOOL D2 = FALSE;    // bit6
    BOOL D3 = FALSE;    // bit7
    BOOL D4 = FALSE;    // bit8
    BOOL D5 = FALSE;    // bit9
    BOOL D6 = FALSE;    // bit10
    BOOL D7 = FALSE;    // bit11
};

enum class JPTCmd : uint16_t
{
    // ---------------- SET ----------------
    SET_POWER = 0x0001, // Power (0~4095)
    SET_PRR_KHZ = 0x0002, // PRR / Frequency (kHz)
    SET_PULSE_NS = 0x0003, // Pulse width (ns)
    SET_SIMMER = 0x0004,
    SET_DEFAULT_PULSE_NS = 0x0005,
    SET_FREQ_LOCK_KHZ = 0x0006,

    SET_SELECT_PARAM = 0x0007,
    SET_CONTROL_MODE = 0x0008,

    SET_GUI_PA = 0x0009,
    SET_GUI_MO = 0x000A,
    SET_RED_BEAM = 0x000B,

    SET_POWER_LOCK = 0x0017,
    SET_RED_BEAM_POWER = 0x0018,
    SET_LOCK_PARAM_SEL = 0x0019,

    SET_PRIORITY_MODE = 0x001E,

    // ---------------- READ ----------------
    READ_SELECT_PARAM = 0x0035,
    READ_CONTROL_MODE = 0x0036,

    READ_LASER_STATUS = 0x0038,
    READ_POWER_PERCENT = 0x0039,
    READ_PULSE_NS = 0x003A,
    READ_PRR_KHZ = 0x003B,

    READ_MONITORING = 0x003C,
    READ_MCU_VERSION = 0x003D,
    READ_FPGA_VERSION = 0x003E,
    READ_SERIAL_NUMBER = 0x003F,

    READ_ALARM_STATUS = 0x0040,
    READ_ALARM_MASK = 0x0041,
    READ_ALARM_TIMES = 0x0042,

    READ_POWER_LOCK = 0x0047,
    READ_RED_BEAM_POWER = 0x0048,
    READ_LOCK_PARAM_SEL = 0x0049,

    READ_CUT_FREQ_1_9 = 0x0043,
    READ_CUT_FREQ_10_20 = 0x0053,
};

class JPTLaser
{
public:

    JPTLaser();
    ~JPTLaser();

    BOOL Open( int COM , DWORD& Error );
    BOOL IsOpen();
    void Close();

    BOOL SetPower( double Percent );
    double GetPower();

    BOOL SetPRR( int Khz );
    int GetPRR( );

    BOOL SetPulse( int ns );
    int GetPulse(); 

    BOOL LaserOn();
    BOOL LaserOff( BOOL EnableMO );

    BOOL RedBeamOn();
    BOOL RedBeamOff( BOOL EnableMO );

    BOOL SetMO( BOOL Enable );
    BOOL SetPA( BOOL Enable );

    BOOL SetControlModeBits( const JPTCtrlModeBits& Bits );
    JPTCtrlModeBits GetControlModeBits();

    JPTStatus GetStatus();

private:

    BOOL _TxRxU16( JPTCmd Cmd , uint16_t TxValue , uint16_t* pRxValue , DWORD WaitTick );
    BOOL _SendU16( JPTCmd Cmd , uint16_t Value );
    BOOL _ReadU16( JPTCmd Cmd, uint16_t& OutValue, DWORD WaitTick );
    BOOL _ReadFrameUntilTail( std::vector<uint8_t>& OutFrame , DWORD WaitTick );

    BOOL _SetControlMode( uint16_t Mask0_31 );
    BOOL _GetControlMode( uint16_t& OutMask0_31 );

private:

    CRITICAL_SECTION _cs;
    CSerial m_Serial;
};