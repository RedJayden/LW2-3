#pragma once
#include "..\Base\MotorBase.h"

class FastechMotor : public MotorBase
{
public:

    FastechMotor(const CString& Axis);
    virtual ~FastechMotor();

private:

    virtual BOOL Connect() override;
    virtual BOOL Close() override;
    virtual BOOL IsConnect() override;

    virtual BOOL Servo( BOOL OnOff ) override;
    virtual BOOL Homing() override;
    virtual BOOL MovAbs( double mm ) override;
    virtual BOOL MovRel( double mm ) override;
    virtual BOOL Stop() override;
    virtual BOOL AlarmReset() override;

    virtual BOOL JogCW() override;
    virtual BOOL JogCCW() override;

    virtual double GetPos() override;
    virtual BOOL SetPos( double mm ) override;

    virtual void SetSpeed(double vel, double accel) override;

    virtual MotorStatus   GetStatus() override;
    virtual MotorErrInfo  GetLastError() override;

private:

    CString m_Axis;
    CRITICAL_SECTION _cs;
};

namespace FastechUtil
{
    void SetParameter(const CString& Axis, Motor& m);
};