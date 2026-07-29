#include "pch.h"
#include "MoonsMotor.h"
#include "./include/SCLLibHelper.h"

MoonsMotor::MoonsMotor(SCLLibHelper* pHelper) : _p(pHelper)
{
    InitializeCriticalSectionAndSpinCount(&_cs, 2000);
}

MoonsMotor::~MoonsMotor()
{
    DeleteCriticalSection(&_cs);
}

BOOL MoonsMotor::Connect()
{
    CSPtr CS(_cs);

    if (!IsConnect())
    {
        int COM = GetAttribute<int>(_T("COM"));
        int Baudrate = GetAttribute<int>(_T("BAUDRATE"));

        if (!_p->Open(COM, Baudrate)) return FALSE;
    }

    int ID = GetAttribute<int>(_T("ID"));

    if (!_p->SetCommParam(ID, FALSE)) return FALSE;

    // 시리얼 통신 과정에서 지정된 시간 이상의 동작이 없을경우 실패 판단을 하는데,
    // 초기값이 50msec여서 함수 호출이 실패 하는 현상이 있었음. 1초로 늘림.
    _p->SetExecuteTimeOut(1000);

    return TRUE;
}

BOOL MoonsMotor::Close()
{
    CSPtr CS(_cs);

    return Stop();
}

BOOL MoonsMotor::IsConnect()
{
    CSPtr CS(_cs);

    return _p->IsOpen();
}

BOOL MoonsMotor::Servo(BOOL OnOff)
{
    //  dhkim 코드 수정
    CSPtr CS(_cs);

    AlarmReset();

    Sleep(10);

    BYTE ID = (BYTE)GetAttribute<int>(_T("ID"));

    return _p->DriveEnable(ID, OnOff);
}

BOOL MoonsMotor::Homing()
{
    CSPtr CS(_cs);

    BYTE ID = (BYTE)GetAttribute<int>(_T("ID"));

    double Vel = GetAttribute<double>(_T("HOME_VEL"));
    double Acc = GetAttribute<double>(_T("HOME_ACC"));
    double Dec = GetAttribute<double>(_T("HOME_DEC"));

    // WriteFindHome 함수 호출 이전에 홈잉 과정의 가감속과 등속을 설정
    _p->WriteHomingVelocity(ID, 0, Vel);
    _p->WriteHomingAcceleration(ID, 0, Acc);
    _p->WriteHomingDeceleration(ID, 0,Dec);

    if (!_p->WriteFindHome(ID, 2) ) RETURN_F_V(m_HomeComplete = FALSE, FALSE);
    // if (!_p->SeekHome(ID, 1, 'L', &Vel, &Acc, &Dec)) RETURN_F_V(m_HomeComplete = FALSE, FALSE);

    WORK_1([this]()
        {
            while (1)
            {
                Sleep(1000);

                MotorStatus s = GetStatus();

                if (!s.m_PowerOn || !s.m_Servo)RETURN(m_HomeComplete = FALSE);

                if (s.m_IsInposition && !s.m_IsMoving) RETURN(m_HomeComplete = TRUE);
            }
        });

    return TRUE;
}

BOOL MoonsMotor::MovAbs(double mm)
{
    CSPtr CS(_cs);

    AlarmReset();

    BYTE ID = (BYTE)GetAttribute<int>(_T("ID"));

    double Vel = GetAttribute<double>(_T("MOVE_VEL"));
    double Acc = GetAttribute<double>(_T("MOVE_ACC"));
    double Dec = GetAttribute<double>(_T("MOVE_DEC"));

    double Lead = GetAttribute<double>(_T("LEAD"));
    int Pluse = GetAttribute<int>(_T("PLUSE"));

    int PPS = UnitCvrt::Pos::mm_to_pulse(mm, Lead, Pluse);
    return _p->AbsMove(ID, PPS, &Vel, &Acc, &Dec);
}

BOOL MoonsMotor::MovRel(double mm)
{
    CSPtr CS(_cs);

    AlarmReset();

    BYTE ID = (BYTE)GetAttribute<int>(_T("ID"));

    double Vel = GetAttribute<double>(_T("MOVE_VEL"));
    double Acc = GetAttribute<double>(_T("MOVE_ACC"));
    double Dec = GetAttribute<double>(_T("MOVE_DEC"));

    double Lead = GetAttribute<double>(_T("LEAD"));
    int Pluse = GetAttribute<int>(_T("PLUSE"));

    int PPS = UnitCvrt::Pos::mm_to_pulse(mm, Lead, Pluse);

    return _p->RelMove(ID, PPS, &Vel, &Acc, &Dec);
}

BOOL MoonsMotor::Stop()
{
    CSPtr CS(_cs);

    BYTE ID = (BYTE)GetAttribute<int>(_T("ID"));
    return _p->WriteStopAndKill(ID, 1);
}

BOOL MoonsMotor::AlarmReset()
{
    CSPtr CS(_cs);

    BYTE ID = (BYTE)GetAttribute<int>(_T("ID"));
    return _p->WriteAlarmReset(ID, TRUE);
}

BOOL MoonsMotor::JogCW()
{
    CSPtr CS(_cs);

    BYTE ID = (BYTE)GetAttribute<int>(_T("ID"));
    if (_p->IsJogging(ID)) return TRUE;

    AlarmReset();

    double Vel = GetAttribute<double>(_T("JOG_VEL"));
    double Acc = GetAttribute<double>(_T("JOG_ACC"));
    double Dec = GetAttribute<double>(_T("JOG_DEC"));

    BOOL Ret1 = _p->WriteDistanceOrPosition(ID, 1);
    BOOL Ret2 = _p->SetJogProfile(ID, &Vel, &Acc, &Dec);
    BOOL Ret3 = _p->WriteCommenceJogging(ID);

    return Ret1 && Ret2 && Ret3;
}

BOOL MoonsMotor::JogCCW()
{
    CSPtr CS(_cs);

    BYTE ID = (BYTE)GetAttribute<int>(_T("ID"));
    if (_p->IsJogging(ID)) return TRUE;

    AlarmReset();

    double Vel = GetAttribute<double>(_T("JOG_VEL"));
    double Acc = GetAttribute<double>(_T("JOG_ACC"));
    double Dec = GetAttribute<double>(_T("JOG_DEC"));

    BOOL Ret1 = _p->WriteDistanceOrPosition(ID, -1);
    BOOL Ret2 = _p->SetJogProfile(ID, &Vel, &Acc, &Dec);
    BOOL Ret3 = _p->WriteCommenceJogging(ID);

    return Ret1 && Ret2 && Ret3;
}

double MoonsMotor::GetPos()
{
    CSPtr CS(_cs);

    BYTE ID = (BYTE)GetAttribute<int>(_T("ID"));
    int  PPS = 0;
    if (!_p->ReadImmediateEncoder(ID, &PPS)) return 0.0;

    double Lead = GetAttribute<double>(_T("LEAD"));
    int Pluse = GetAttribute<int>(_T("PLUSE"));

    return UnitCvrt::Pos::pulse_to_mm(PPS, Lead, Pluse);
}

BOOL MoonsMotor::SetPos(double mm)
{
    CSPtr CS(_cs);

    int ID = GetAttribute<int>(_T("ID"));

    double Lead = GetAttribute<double>(_T("LEAD"));
    int Pluse = GetAttribute<int>(_T("PLUSE"));

    pps_t PPS = UnitCvrt::Pos::mm_to_pulse(mm, Lead, Pluse);

    BOOL Ret1 = _p->WriteSetPosition(ID, PPS);
    BOOL Ret2 = _p->WriteEncoderPosition(ID, PPS);

    return Ret1 && Ret2;
}

MotorStatus MoonsMotor::GetStatus()
{
    CSPtr CS(_cs);

    MotorStatus Status;
    if (!IsConnect()) return Status;

    BYTE ID = (BYTE)GetAttribute<int>(_T("ID"));

    Status.m_PowerOn = TRUE;
    Status.m_HomeComplete = m_HomeComplete;
    Status.m_IsAlarm = _p->IsInAlarm(ID);
    Status.m_IsInposition = _p->IsInPosition(ID);
    Status.m_IsMoving = _p->IsMoving(ID) || _p->IsJogging(ID) || _p->IsHoming(ID);
    Status.m_NegativeLimit = _p->IsInAlarmCCWLimit(ID);
    Status.m_PositiveLimit = _p->IsInAlarmCWLimit(ID);
    Status.m_Servo = _p->IsMotorEnabled(ID);

    return Status;
}

MotorErrInfo MoonsMotor::GetLastError()
{
    CSPtr CS(_cs);

    ERROR_INFO Info;
    _p->GetLastErrorInfo(&Info);

    return MotorErrInfo{ (CString)Info.ErrorMessage , (DWORD_PTR)Info.ErrorCode , NULL };
}

namespace MoonsUtil
{
    void SetParameter(const CString& Axis, Motor& m)
    {
        m.SetAttribute(_T("COM"), INI_MOONS.GetInt(_T("CONNECT"), _T("COM")));
        m.SetAttribute(_T("BAUDRATE"), INI_MOONS.GetInt(_T("CONNECT"), _T("BAUDRATE")));

        m.SetAttribute(_T("ID"), INI_MOONS.GetInt(Axis, _T("ID")));

        m.SetAttribute(_T("LEAD"), INI_MOONS.GetDouble(Axis, _T("LEAD")));
        m.SetAttribute(_T("PLUSE"), INI_MOONS.GetInt(Axis, _T("PLUSE")));

        m.SetAttribute(_T("HOME_VEL"), INI_MOONS.GetDouble(Axis, _T("HOME_VEL")));
        m.SetAttribute(_T("HOME_ACC"), INI_MOONS.GetDouble(Axis, _T("HOME_ACC")));
        m.SetAttribute(_T("HOME_DEC"), INI_MOONS.GetDouble(Axis, _T("HOME_DEC")));

        m.SetAttribute(_T("MOVE_VEL"), INI_MOONS.GetDouble(Axis, _T("MOVE_VEL")));
        m.SetAttribute(_T("MOVE_ACC"), INI_MOONS.GetDouble(Axis, _T("MOVE_ACC")));
        m.SetAttribute(_T("MOVE_DEC"), INI_MOONS.GetDouble(Axis, _T("MOVE_DEC")));

        m.SetAttribute(_T("JOG_VEL"), INI_MOONS.GetDouble(Axis, _T("JOG_VEL")));
        m.SetAttribute(_T("JOG_ACC"), INI_MOONS.GetDouble(Axis, _T("JOG_ACC")));
        m.SetAttribute(_T("JOG_DEC"), INI_MOONS.GetDouble(Axis, _T("JOG_DEC")));
    }

    BOOL TryMirrorInitialze(Motor& m, PMAC& p, int TryCount)
    {
        for (int i = 0; i < TryCount; ++i)
        {
            p.Write(_T("MtrMirror_OnOff=1"));
            p.Write(_T("MtrObject_OnOff=1"));

            Sleep(10);

            m.Connect();

            Sleep(10);

            if (m.Servo(TRUE)) return TRUE;
        }

        return FALSE;
    }

}