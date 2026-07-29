#pragma once
#include "../Base/MotorBase.h"

class SCLLibHelper;
class MoonsMotor : public MotorBase
{
public:

    MoonsMotor(SCLLibHelper* pHelper);
    virtual ~MoonsMotor();

private:

    //---------------------------------------------
    // MotorBase 가상 함수 재정의
    virtual BOOL Connect() override;
    virtual BOOL Close() override;
    virtual BOOL IsConnect() override;

    virtual BOOL Servo(BOOL OnOff) override;
    virtual BOOL Homing() override;
    virtual BOOL MovAbs(double mm) override;
    virtual BOOL MovRel(double mm) override;
    virtual BOOL Stop() override;
    virtual BOOL AlarmReset() override;

    virtual BOOL JogCW() override;
    virtual BOOL JogCCW() override;

    virtual double       GetPos()       override;
    virtual BOOL SetPos(double mm) override;
    virtual MotorStatus  GetStatus()    override;
    virtual MotorErrInfo GetLastError() override;

    virtual void SetSpeed(double vel, double accel) override {}
    //---------------------------------------------

private:

    CRITICAL_SECTION _cs;

    BOOL m_HomeComplete = FALSE;

    SCLLibHelper* _p = NULL;
};

class PMAC;
namespace MoonsUtil
{
    void SetParameter(const CString& Axis, Motor& m);
    BOOL TryMirrorInitialze(Motor& m, PMAC& p,int TryCount);
};