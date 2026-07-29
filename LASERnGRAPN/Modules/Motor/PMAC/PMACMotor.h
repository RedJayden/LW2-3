#pragma once

#include "../Base/MotorBase.h"

class PMAC;
class PMACMotor : public MotorBase
{
public:

	PMACMotor( const CString& Axis , PMAC* pPMAC );
	~PMACMotor() = default;

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
    virtual BOOL SetPos(double mm) override { return FALSE; }
    virtual void SetSpeed(double vel, double accel) override;

    virtual MotorStatus GetStatus() override;
    virtual MotorErrInfo GetLastError() override;

private:

    PMAC*   m_pPMAC = NULL;
	CString m_Axis;

    double m_Velocity = 0.0;
    double m_Accel = 0.0;
};


namespace PMACUtil
{
    void AllHome();
    void AllStop();
};