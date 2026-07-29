#pragma once
#include "..\Base\MotorBase.h"

class TestMotor : public MotorBase
{
public:

    TestMotor() = default;
    virtual ~TestMotor() = default;

private:

    virtual BOOL Connect() override
    {
        return TRUE;
    }

    virtual BOOL Close() override
    {
        return TRUE;
    }

    virtual BOOL IsConnect() override
    {
        return TRUE;
    }

    virtual BOOL Servo(BOOL OnOff) override
    {
        return TRUE;
    }

    virtual BOOL Homing() override
    {
        return TRUE;
    }

    virtual BOOL MovAbs(double mm) override
    {
        return TRUE;
    }

    virtual BOOL MovRel(double mm) override
    {
        return TRUE;
    }

    virtual BOOL Stop() override
    {
        return TRUE;
    }

    virtual BOOL AlarmReset() override
    {
        return TRUE;
    }

    virtual BOOL JogCW() override
    {
        return TRUE;
    }
    virtual BOOL JogCCW() override
    {
        return TRUE;
    }

    virtual double GetPos() override
    {
        return 0.0;
    }
    virtual BOOL SetPos(double mm) override
    {
        return TRUE;
    }

    virtual void SetSpeed(double vel, double accel) override
    {
    }

    virtual MotorStatus   GetStatus() override
    {
        MotorStatus Ret;
        Ret.m_HomeComplete = TRUE;

        return Ret;
    }
    virtual MotorErrInfo  GetLastError() override
    {
        return MotorErrInfo();
    }
};