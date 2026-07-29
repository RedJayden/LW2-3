#include "pch.h"
#include "FastechMotor.h"
#include "lib\FAS_EziMOTIONPlusE.h"

#define MOTION_DIR 25

constexpr DWORD ErrBitMask = 0x00008FFF;

FastechMotor::FastechMotor(const CString& Axis) : m_Axis(Axis)
{
    InitializeCriticalSectionAndSpinCount( &_cs , 2000 );
}

FastechMotor::~FastechMotor()
{
    DeleteCriticalSection( &_cs );
}

BOOL FastechMotor::Connect()
{
    CSPtr CS( _cs );

    auto IP = StrUtil::Tokenizer( GetAttribute( _T("IP") ) , _T('.') ).map<int>( []( const CString& Part ) {
        return _ttoi( Part );
    });

    int ID = GetAttribute<int>( _T("ID") );

    return PE::FAS_ConnectTCP(IP[0], IP[1], IP[2], IP[3], ID);
}

BOOL FastechMotor::Close()
{
    CSPtr CS( _cs );

    int ID = GetAttribute<int>( _T("ID") );
    PE::FAS_Close( ID );

    return TRUE;
}

BOOL FastechMotor::IsConnect()
{
    CSPtr CS( _cs );

    auto IP = StrUtil::Tokenizer( GetAttribute( _T("IP") ) , _T('.') ).map<int>( []( const CString& Part ) {
        return _ttoi( Part );
    });

    int ID = GetAttribute<int>( _T("ID") );
    return PE::FAS_IsIPAddressExist( IP[0] , IP[1] , IP[2] , IP[3] , &ID );
}

BOOL FastechMotor::Servo( BOOL OnOff )
{
    CSPtr CS( _cs );

    int ID = GetAttribute<int>( _T("ID") );

    FMM_ERROR Ret = (FMM_ERROR)PE::FAS_ServoEnable( ID , OnOff );
    return ( Ret == FMM_ERROR::FMM_OK );
}

BOOL FastechMotor::Homing()
{
    CSPtr CS( _cs );

    int ID = GetAttribute<int>( _T("ID") );

	return FMM_ERROR::FMM_OK == (FMM_ERROR)PE::FAS_MoveOriginSingleAxis( ID );
}

BOOL FastechMotor::MovAbs( double mm )
{
    CSPtr CS( _cs );

    int ID = GetAttribute<int>( _T("ID") );
    double Lead = GetAttribute<double>( _T("LEAD") );
    int Pulse = GetAttribute<int>( _T("PULSE") );

	DWORD Vel = (DWORD)UnitCvrt::Vel::mm_per_sec_to_pps( GetAttribute<double>( _T("MOVE_VEL") ) , Lead , Pulse );
    int PPS = UnitCvrt::Pos::mm_to_pulse( mm , Lead , Pulse );

	FMM_ERROR Ret = (FMM_ERROR)PE::FAS_MoveSingleAxisAbsPos( ID , PPS , Vel );
	return ( Ret == FMM_ERROR::FMM_OK );
}

BOOL FastechMotor::MovRel( double mm )
{
    CSPtr CS( _cs );

    int ID = GetAttribute<int>( _T("ID") );
    double Lead = GetAttribute<double>( _T("LEAD") );
    int Pulse = GetAttribute<int>( _T("PULSE") );

    int PPS = UnitCvrt::Pos::mm_to_pulse( mm , Lead , Pulse );
    DWORD Vel = (DWORD)UnitCvrt::Vel::mm_per_sec_to_pps( GetAttribute<double>( _T("MOVE_VEL") ) , Lead , Pulse );

	FMM_ERROR Ret = (FMM_ERROR)PE::FAS_MoveSingleAxisIncPos( ID , PPS , Vel );
	return ( Ret == FMM_ERROR::FMM_OK );
}

BOOL FastechMotor::Stop() 
{
    CSPtr CS( _cs );

    int ID = GetAttribute<int>( _T("ID") );

	FMM_ERROR Ret = (FMM_ERROR)PE::FAS_MoveStop( ID );;
	return ( Ret == FMM_ERROR::FMM_OK ); 
}

BOOL FastechMotor::AlarmReset() 
{
    CSPtr CS( _cs );

    MotorStatus s = GetStatus();
    if (!s.m_IsAlarm) return TRUE;

    int ID = GetAttribute<int>( _T("ID") );

    Servo(FALSE);

    FMM_ERROR Ret1 = (FMM_ERROR)PE::FAS_ServoAlarmReset( ID );
    FMM_ERROR Ret2 = (FMM_ERROR)PE::FAS_StepAlarmReset( ID , TRUE );

    if ( s.m_Servo )
        Servo(TRUE);

	return ( Ret1 == FMM_ERROR::FMM_OK ) || ( Ret2 == FMM_ERROR::FMM_OK );
}

BOOL FastechMotor::JogCW()
{
    CSPtr CS( _cs );

    if ( GetStatus().m_IsMoving ) return TRUE;

    int ID = GetAttribute<int>( _T("ID") );
    double Lead = GetAttribute<double>( _T("LEAD") );
    int Pulse = GetAttribute<int>( _T("PULSE") );

    DWORD Vel = (DWORD)UnitCvrt::Vel::mm_per_sec_to_pps( GetAttribute<double>( _T("JOG_VEL") ) , Lead , Pulse );
	return ( PE::FAS_MoveVelocity( ID , Vel , 1 ) == FMM_ERROR::FMM_OK );
}

BOOL FastechMotor::JogCCW()
{
    CSPtr CS( _cs );

    if ( GetStatus().m_IsMoving ) return TRUE;

    int ID = GetAttribute<int>( _T("ID") );
    double Lead = GetAttribute<double>( _T("LEAD") );
    int Pulse = GetAttribute<int>( _T("PULSE") );

    DWORD Vel = (DWORD)UnitCvrt::Vel::mm_per_sec_to_pps( GetAttribute<double>( _T("JOG_VEL") ) , Lead , Pulse );
	return ( PE::FAS_MoveVelocity( ID , Vel , 0 ) == FMM_ERROR::FMM_OK );
}

double FastechMotor::GetPos()
{
    CSPtr CS( _cs );

    int ID = GetAttribute<int>( _T("ID") );
    double Lead = GetAttribute<double>( _T("LEAD") );
    int Pulse = GetAttribute<int>( _T("PULSE") );

	LONG PPS = 0;
	if ( FMM_ERROR::FMM_OK != (FMM_ERROR)PE::FAS_GetActualPos( ID , &PPS ) ) return 0.0;

	return UnitCvrt::Pos::pulse_to_mm( PPS , Lead , Pulse );
}

BOOL FastechMotor::SetPos( double mm )
{
    CSPtr CS( _cs );

    int ID = GetAttribute<int>( _T("ID") );
    double Lead = GetAttribute<double>( _T("LEAD") );
    int Pulse = GetAttribute<int>( _T("PULSE") );

    return FMM_ERROR::FMM_OK != (FMM_ERROR)PE::FAS_SetActualPos( ID , UnitCvrt::Pos::mm_to_pulse( mm , Lead , Pulse ) );
}

void FastechMotor::SetSpeed(double vel, double accel)
{
    INI_FASTECH.WriteNumber(m_Axis, _T("MOVE_VEL"), vel); 
    INI_FASTECH.WriteNumber(m_Axis, _T("MOVE_ACC"), accel);
    INI_FASTECH.WriteNumber(m_Axis, _T("MOVE_DEC"), accel);

    INI_FASTECH.WriteNumber(m_Axis, _T("JOG_VEL"), vel);
    INI_FASTECH.WriteNumber(m_Axis, _T("JOG_ACC"), accel);
    INI_FASTECH.WriteNumber(m_Axis, _T("JOG_DEC"), accel);

    SetAttribute(_T("MOVE_VEL"), vel);
    SetAttribute(_T("MOVE_ACC"), accel);
    SetAttribute(_T("MOVE_DEC"), accel);

    SetAttribute(_T("JOG_VEL"), vel);
    SetAttribute(_T("JOG_ACC"), accel);
    SetAttribute(_T("JOG_DEC"), accel);
}

MotorStatus FastechMotor::GetStatus()
{
    CSPtr CS( _cs );

    int ID = GetAttribute<int>( _T("ID") );

    EZISERVO_AXISSTATUS Status;
    if ( FMM_ERROR::FMM_OK != PE::FAS_GetAxisStatus( ID , &Status.dwValue ) ) return MotorStatus();

    MotorStatus Ret;
    Ret.m_HomeComplete = (Status.FFLAG_ORIGINRETOK) != 0;
    Ret.m_IsAlarm = (Status.dwValue & ErrBitMask) != 0;
    Ret.m_IsInposition = (Status.FFLAG_INPOSITION) != 0;
    Ret.m_IsMoving = (Status.FFLAG_MOTIONING) != 0;
    Ret.m_NegativeLimit = (Status.FFLAG_HWNEGALMT) != 0;
    Ret.m_PositiveLimit = (Status.FFLAG_HWPOSILMT) != 0;
    Ret.m_PowerOn = TRUE;
    Ret.m_Servo = (Status.FFLAG_SERVOON) != 0;

    return Ret;
}

MotorErrInfo  FastechMotor::GetLastError()
{
    CSPtr CS( _cs );

    int ID = GetAttribute<int>( _T("ID") );

    EZISERVO_AXISSTATUS Status;
    if ( FMM_ERROR::FMM_OK != PE::FAS_GetAxisStatus( ID , &Status.dwValue ) ) return MotorErrInfo();

    return MotorErrInfo{ _T("") , Status.dwValue & ErrBitMask , NULL  };
}


namespace FastechUtil
{
    void SetParameter(const CString& Axis, Motor& m)
    {
        m.SetAttribute( _T("IP") , INI_FASTECH.GetString( Axis , _T("IP") ) );
        m.SetAttribute( _T("ID") , INI_FASTECH.GetInt( Axis , _T("ID") ) );
        m.SetAttribute( _T("LEAD") , INI_FASTECH.GetInt( Axis , _T("LEAD") ) );
        m.SetAttribute( _T("PULSE") , INI_FASTECH.GetInt( Axis , _T("PULSE") ) );

        m.SetAttribute( _T("HOME_VEL") , INI_FASTECH.GetDouble( Axis , _T("HOME_VEL") ) );
        m.SetAttribute( _T("HOME_ACC") , INI_FASTECH.GetDouble( Axis , _T("HOME_ACC") ) );
        m.SetAttribute( _T("HOME_DEC") , INI_FASTECH.GetDouble( Axis , _T("HOME_DEC") ) );

        m.SetAttribute( _T("MOVE_VEL") , INI_FASTECH.GetDouble( Axis , _T("MOVE_VEL") ) );
        m.SetAttribute( _T("MOVE_ACC") , INI_FASTECH.GetDouble( Axis , _T("MOVE_ACC") ) );
        m.SetAttribute( _T("MOVE_DEC") , INI_FASTECH.GetDouble( Axis , _T("MOVE_DEC") ) );

        m.SetAttribute( _T("JOG_VEL") , INI_FASTECH.GetDouble( Axis , _T("JOG_VEL") ) );
        m.SetAttribute( _T("JOG_ACC") , INI_FASTECH.GetDouble( Axis , _T("JOG_ACC") ) );
        m.SetAttribute( _T("JOG_DEC") , INI_FASTECH.GetDouble( Axis , _T("JOG_DEC") ) );
    }
};