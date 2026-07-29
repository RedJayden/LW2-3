#include "pch.h"
#include "Motor.h"

Motor::~Motor() = default;

void Motor::SetInstance(std::unique_ptr<MotorBase> pBaseInstance)
{
    m_pBaseInstance = std::move(pBaseInstance);
}

BOOL Motor::Connect()
{
    if (!m_pBaseInstance) return FALSE;

    return m_pBaseInstance->Connect();
}

BOOL Motor::Close()
{
    if (!m_pBaseInstance) return FALSE;

    return m_pBaseInstance->Close();
}

BOOL Motor::IsConnect()
{
    if (!m_pBaseInstance) return FALSE;

    return m_pBaseInstance->IsConnect();
}

BOOL Motor::Servo(BOOL OnOff)
{
    if (!m_pBaseInstance) return FALSE;

    return m_pBaseInstance->Servo(OnOff);
}

BOOL Motor::Homing()
{
    if (!m_pBaseInstance) return FALSE;

    return m_pBaseInstance->Homing();
}

BOOL Motor::MovAbs(double mm)
{
    if (!m_pBaseInstance) return FALSE;

    return m_pBaseInstance->MovAbs(mm);
}

BOOL Motor::MovRel(double mm)
{
    if (!m_pBaseInstance) return FALSE;

    return m_pBaseInstance->MovRel(mm);
}

BOOL Motor::Stop()
{
    if (!m_pBaseInstance) return FALSE;

    return m_pBaseInstance->Stop();
}

BOOL Motor::AlarmReset()
{
    if (!m_pBaseInstance) return FALSE;

    return m_pBaseInstance->AlarmReset();
}

BOOL Motor::JogCW()
{
    if (!m_pBaseInstance) return FALSE;

    return m_pBaseInstance->JogCW();
}

BOOL Motor::JogCCW()
{
    if (!m_pBaseInstance) return FALSE;

    return m_pBaseInstance->JogCCW();
}

double Motor::GetPos()
{
    if (!m_pBaseInstance) return 0.0;

    return m_pBaseInstance->GetPos();
}

BOOL Motor::SetPos(double mm)
{
    if (!m_pBaseInstance) return FALSE;

    return m_pBaseInstance->SetPos(mm);
}

void Motor::SetSpeed(double vel, double accel)
{
    if (!m_pBaseInstance) return;

    m_pBaseInstance->SetSpeed(vel, accel);
}

MotorStatus Motor::GetStatus()
{
    if (!m_pBaseInstance) return MotorStatus();

    return m_pBaseInstance->GetStatus();
}

MotorErrInfo  Motor::GetLastError()
{
    if (!m_pBaseInstance) return MotorErrInfo();

    return m_pBaseInstance->GetLastError();
}

namespace MotorUtil
{
    namespace Sync
    {
        BOOL Home(Motor* p, DWORD64 WaitTick)
        {
            if (!p->Homing()) return FALSE;

            DWORD64 Start = GetTickCount64();

            do
            {
                Sleep(100);

                MotorStatus s = p->GetStatus();

                if (!s.m_PowerOn || !s.m_Servo) return FALSE;

                if (s.m_HomeComplete)
                {
                    Sleep(5000);
                    RETURN_F_V(p->SetPos(0.0), TRUE);
                }

                if (WaitTick == INFINITE) continue;

            } while (GetTickCount64() - Start <= WaitTick);

            return FALSE;
        }

        BOOL MoveAbs(Motor* p, double Pos, DWORD64 WaitTick)
        {
            if (!p->MovAbs(Pos)) return FALSE;

            DWORD64 Start = GetTickCount64();

            do
            {
                Sleep(10);

                double Now = p->GetPos();

                if (std::abs(Now - Pos) <= 0.01) return TRUE;

                if (WaitTick == INFINITE) continue;

            } while (GetTickCount64() - Start <= WaitTick);

            return FALSE;
        }

        BOOL MoveRel(Motor* p, double Pos, DWORD64 WaitTick)
        {
            double Dest = p->GetPos() + Pos;

            if (!p->MovRel(Pos)) return FALSE;

            DWORD64 Start = GetTickCount64();

            do
            {
                Sleep(10);

                double Now = p->GetPos();

                if (std::abs(Now - Dest) <= 0.01) return TRUE;

                if (WaitTick == INFINITE) continue;

            } while (GetTickCount64() - Start <= WaitTick);

            return FALSE;
        }
    };
};


namespace MotorUtil
{
    namespace Async
    {
        JobEvent Home(Motor* p, DWORD64 WaitTick)
        {
            return WORK_1([=]()
                {
                    MotorUtil::Sync::Home(p, WaitTick);
                });
        }

        JobEvent MoveAbs(Motor* p, double Pos, DWORD64 WaitTick)
        {
            return WORK_1([=]()
                {
                    MotorUtil::Sync::MoveAbs(p, Pos, WaitTick);
                });
        }

        JobEvent MoveRel(Motor* p, double Pos, DWORD64 WaitTick)
        {
            return WORK_1([=]()
                {
                    MotorUtil::Sync::MoveRel(p, Pos, WaitTick);
                });
        }
    };
};