#pragma once
#include "MotorBase.h"
#include <memory>

class Motor
{
public:

    void SetInstance(std::unique_ptr<MotorBase> pBaseInstance);

    Motor() = default;
    ~Motor();

    BOOL Connect();
    BOOL Close();
    BOOL IsConnect();

    BOOL Servo(BOOL OnOff);
    BOOL Homing();
    BOOL MovAbs(double mm);
    BOOL MovRel(double mm);
    BOOL Stop();
    BOOL AlarmReset();

    BOOL JogCW();
    BOOL JogCCW();

    double GetPos();
    BOOL SetPos(double mm);
    void SetSpeed(double vel, double accel);

    MotorStatus   GetStatus();
    MotorErrInfo  GetLastError();

    template<typename VALUE>
    VALUE GetAttribute(const CString& Key) { return (VALUE)m_pBaseInstance->GetAttribute(Key); }

    template<>
    double GetAttribute<double>(const CString& Key) { return m_pBaseInstance->GetAttribute<double>(Key); }

    template<>
    int GetAttribute<int>(const CString& Key) { return m_pBaseInstance->GetAttribute<int>(Key); }

    template<typename T>
    void SetAttribute(const CString& Key, const T& Value) { m_pBaseInstance->SetAttribute(Key, Value); }

private:

    std::unique_ptr<MotorBase> m_pBaseInstance;
};

namespace MotorUtil
{
    namespace Sync
    {
        BOOL Home(Motor* p, DWORD64 WaitTick);
        BOOL MoveAbs(Motor* p, double Pos, DWORD64 WaitTick);
        BOOL MoveRel(Motor* p, double Pos, DWORD64 WaitTick);
    };
};

namespace MotorUtil
{
    namespace Async
    {
        JobEvent Home(Motor* p, DWORD64 WaitTick);
        JobEvent MoveAbs(Motor* p, double Pos, DWORD64 WaitTick);
        JobEvent MoveRel(Motor* p, double Pos, DWORD64 WaitTick);
    };
};