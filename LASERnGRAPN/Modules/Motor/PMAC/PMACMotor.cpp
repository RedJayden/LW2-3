#include "pch.h"
#include "PMACMotor.h"
#include "Power_PMAC\\Include\PMAC.h"
#include "../EqMotionRunPara.h"
#include "../../../Shared/Util/LogManager.h"

#define ON       (1)
#define ON_ING   (10)
#define ON_DONE  (100)

#define OFF      (2)
#define OFF_ING  (20)
#define OFF_DONE (200)

#define ALARM_RESET  (1)
#define ALARM_DONE   (100)

#define CW       (1)
#define CCW      (2)
#define STOP     (3)

#define ABS      (1)
#define REL      (2)

#define SERVO_BIT           0x0001
#define FOL_ERROR_BIT       0x0002
#define AMP_FAULT_BIT       0x0004
#define MOVING_BIT          0x0008
#define HOME_SENSEOR_BIT    0x0010
#define CW_SENSOR_BIT       0x0020
#define CCW_SENSOR_BIT      0x0040
#define HOMING_BIT          0x0080
#define HOME_DONE_BIT       0x0100

PMACMotor::PMACMotor( const CString& Axis , PMAC* pPMAC ) : m_Axis(Axis) , m_pPMAC(pPMAC) {}

BOOL PMACMotor::Connect()
{
    // 모터의 연결은 PMAC객체를 통해 외부 에서 수행된다.
    return TRUE;
}

BOOL PMACMotor::Close()
 {
    // 모터의 연결해제는 PMAC객체를 통해 외부 에서 수행된다.
    return FALSE;
}

BOOL PMACMotor::IsConnect()
{
    return GetStatus().m_PowerOn;
}

BOOL PMACMotor::Servo( BOOL OnOff )
{
    CString Addr = GetAttribute( _T("SERVO") );
    CString Inst = StrC( _T("%s=%d") , Addr , OnOff ? ON : OFF );
    m_pPMAC->Write( Inst );

    return TRUE;
}

BOOL PMACMotor::Homing()
{
    CString Addr = GetAttribute( _T("HOME") );
    CString Inst = StrC( _T("%s=%d") , Addr , ON );
    m_pPMAC->Write( Inst );

	return TRUE;
}

void PMACMotor::SetSpeed(double vel, double accel)
{
    m_Velocity = vel;
    m_Accel = accel;
}

BOOL PMACMotor::MovAbs( double mm )
{
    if (m_Velocity > 0.1) {
        int Speed = (int)m_Velocity;
        CString SpdAddrr = GetAttribute(_T("MOVE_SPEED"));
        CString SpedInst = StrC(_T("%s=%d"), SpdAddrr, Speed);
        m_pPMAC->Write(SpedInst);
    }
    else {
        // Fallback to INI/Old logic if 0
        int     Speed = GetAttribute<int>(_T("SPEED"));
        CString SpdAddrr = GetAttribute(_T("MOVE_SPEED"));
        CString SpedInst = StrC(_T("%s=%d"), SpdAddrr, Speed);
        m_pPMAC->Write(SpedInst);
    }

    // Accel setting can be added here if PMAC variable is known, roughly:
    // if (m_Accel > 0) ... Ta=...

    CString MoveAddr = GetAttribute( _T("TARGET_POS") );
    
    // [Safety] Software Interlock Check
    auto* pParams = EqMotionRunPara::Instance().GetAxis((const char*)CT2A(m_Axis));
    if (pParams && pParams->limit_used) {
        double targetMm = mm / 1000.0;
        if (targetMm < pParams->interlock_min || targetMm > pParams->interlock_max) {
            CString logMsg;
            logMsg.Format(_T("[ALARM] %s Axis MovAbs Blocked! Target: %.3f, Limit: [%.3f, %.3f]"), 
                m_Axis, targetMm, pParams->interlock_min, pParams->interlock_max);
            LogManager::Instance().Write("ALARM", "Motion", (const char*)CT2A(logMsg));
            return FALSE;
        }
    }

    CString MoveInst = StrC( _T("%s=%.3f") , MoveAddr , mm );
    m_pPMAC->Write( MoveInst );

    CString ModeAddr = GetAttribute( _T("MOVE_MODE") );
    CString ModeInst = StrC( _T("%s=%d") , ModeAddr , ABS );
    m_pPMAC->Write( ModeInst );

    return TRUE;
}

BOOL PMACMotor::MovRel( double mm )
{
    if (m_Velocity > 0.1) {
        int Speed = (int)m_Velocity;
        CString SpdAddrr = GetAttribute(_T("MOVE_SPEED"));
        CString SpedInst = StrC(_T("%s=%d"), SpdAddrr, Speed);
        m_pPMAC->Write(SpedInst);
    }
    else {
        int     Speed = GetAttribute<int>(_T("SPEED"));
        CString SpdAddrr = GetAttribute(_T("MOVE_SPEED"));
        CString SpedInst = StrC(_T("%s=%d"), SpdAddrr, Speed);
        m_pPMAC->Write(SpedInst);
    }

    CString MoveAddr = GetAttribute( _T("TARGET_POS") );

    // [Safety] Software Interlock Check
    auto* pParams = EqMotionRunPara::Instance().GetAxis((const char*)CT2A(m_Axis));
    if (pParams && pParams->limit_used) {
        double currentMm = GetPos() / 1000.0;
        double targetMm = currentMm + (mm / 1000.0);
        if (targetMm < pParams->interlock_min || targetMm > pParams->interlock_max) {
            CString logMsg;
            logMsg.Format(_T("[ALARM] %s Axis MovRel Blocked! Current: %.3f, Target: %.3f, Limit: [%.3f, %.3f]"), 
                m_Axis, currentMm, targetMm, pParams->interlock_min, pParams->interlock_max);
            LogManager::Instance().Write("ALARM", "Motion", (const char*)CT2A(logMsg));
            return FALSE;
        }
    }

    CString MoveInst = StrC( _T("%s=%.3f") , MoveAddr , mm );
    m_pPMAC->Write( MoveInst );

    CString ModeAddr = GetAttribute( _T("MOVE_MODE") );
    CString ModeInst = StrC( _T("%s=%d") , ModeAddr , REL );
    m_pPMAC->Write( ModeInst );

    return TRUE;
}

BOOL PMACMotor::Stop()
{
    CString JogAddr = GetAttribute( _T("JOG_MODE") );
    CString JogStopInst = StrC( _T("%s=%d") , JogAddr , STOP );
    m_pPMAC->Write( JogStopInst );

    CString Addr = GetAttribute( _T("STOP") );
    CString Inst = StrC( _T("%s=%d") , Addr , STOP );

    return m_pPMAC->Write( Inst );
}

BOOL PMACMotor::AlarmReset()
{
    CString Addr = GetAttribute( _T("ALARM_RESET") );
    CString Inst = StrC( _T("%s=%d") , Addr , ALARM_RESET );

    return m_pPMAC->Write(Inst);
}

BOOL PMACMotor::JogCW()
{
    if (m_Velocity > 0.1) {
        int Speed = (int)m_Velocity;
        CString SpdAddrr = GetAttribute(_T("JOG_SPEED"));
        CString SpedInst = StrC(_T("%s=%d"), SpdAddrr, Speed);
        m_pPMAC->Write(SpedInst);
    }
    else {
        int     Speed = GetAttribute<int>(_T("SPEED"));
        CString SpdAddrr = GetAttribute(_T("JOG_SPEED"));
        CString SpedInst = StrC(_T("%s=%d"), SpdAddrr, Speed);
        m_pPMAC->Write(SpedInst);
    }

    // [Safety] Software Interlock Check (CW = Positive direction)
    auto* pParams = EqMotionRunPara::Instance().GetAxis((const char*)CT2A(m_Axis));
    if (pParams && pParams->limit_used) {
        double currentMm = GetPos() / 1000.0;
        if (currentMm >= pParams->interlock_max) {
            CString logMsg;
            logMsg.Format(_T("[ALARM] %s Axis JogCW Blocked! Current: %.3f exceeds Max: %.3f"), 
                m_Axis, currentMm, pParams->interlock_max);
            LogManager::Instance().Write("ALARM", "Motion", (const char*)CT2A(logMsg));
            return FALSE;
        }
    }

    CString JogAddr = GetAttribute( _T("JOG_MODE") );
    CString JogInst = StrC( _T("%s=%d") , JogAddr , CW );
    m_pPMAC->Write( JogInst );

    return TRUE;
}

BOOL PMACMotor::JogCCW()
{
    // [FIX] Use m_Velocity if set
    if (m_Velocity > 0.1) {
        int Speed = (int)m_Velocity;
        CString SpdAddrr = GetAttribute(_T("JOG_SPEED"));
        CString SpedInst = StrC(_T("%s=%d"), SpdAddrr, Speed);
        m_pPMAC->Write(SpedInst);
    }
    else {
        int     Speed = GetAttribute<int>(_T("SPEED"));
        CString SpdAddrr = GetAttribute(_T("JOG_SPEED"));
        CString SpedInst = StrC(_T("%s=%d"), SpdAddrr, Speed);
        m_pPMAC->Write(SpedInst);
    }

    // [Safety] Software Interlock Check (CCW = Negative direction)
    auto* pParams = EqMotionRunPara::Instance().GetAxis((const char*)CT2A(m_Axis));
    if (pParams && pParams->limit_used) {
        double currentMm = GetPos() / 1000.0;
        if (currentMm <= pParams->interlock_min) {
            CString logMsg;
            logMsg.Format(_T("[ALARM] %s Axis JogCCW Blocked! Current: %.3f exceeds Min: %.3f"), 
                m_Axis, currentMm, pParams->interlock_min);
            LogManager::Instance().Write("ALARM", "Motion", (const char*)CT2A(logMsg));
            return FALSE;
        }
    }

    CString JogAddr = GetAttribute( _T("JOG_MODE") );
    CString JogInst = StrC( _T("%s=%d") , JogAddr , CCW );
    m_pPMAC->Write( JogInst );

    return TRUE;
}

double PMACMotor::GetPos()
{
    CString Addr = GetAttribute( _T("NOW_POS") );

    CString Ret;
    if (!m_pPMAC->Read(Addr, Ret)) return 0.0;

    return _ttof(Ret);
}

MotorStatus PMACMotor::GetStatus()
{
    CString Addr = GetAttribute( _T("STATUS") );

    CString Ret;
    if ( !m_pPMAC->Read(Addr, Ret) ) return MotorStatus();

    int Value = _ttoi( Ret );

    MotorStatus Stat;
    Stat.m_PowerOn = TRUE;
    Stat.m_Servo = ( Value & SERVO_BIT ) != 0;
	Stat.m_FollowingError = (Value & FOL_ERROR_BIT) != 0;
	Stat.m_AmplifierFault = (Value & AMP_FAULT_BIT) != 0;
    Stat.m_IsAlarm = ( Value & AMP_FAULT_BIT || Value & FOL_ERROR_BIT ) != 0;
    Stat.m_IsMoving = ( Value & MOVING_BIT ) != 0;
	Stat.m_HomeSensorError = (Value & HOME_SENSEOR_BIT) != 0;
    Stat.m_PositiveLimit = ( Value & CW_SENSOR_BIT ) != 0;
    Stat.m_NegativeLimit = ( Value & CCW_SENSOR_BIT ) != 0;
	Stat.m_HomingError = (Value & HOMING_BIT) != 0;
    Stat.m_HomeComplete = (Value & HOME_DONE_BIT) != 0;
    Stat.m_IsInposition  = Stat.m_Servo && !Stat.m_IsMoving && Stat.m_HomeComplete;

    return Stat;
}

MotorErrInfo PMACMotor::GetLastError()
{
    return MotorErrInfo();
}


namespace PMACUtil
{
    void AllHome()
    {
        g_PMAC.Write( StrC( _T("All_Homing=1") ) );
    }

    void AllStop()
    {
        g_PMAC.Write( StrC( _T("AllStop=1") ) );
    }
};