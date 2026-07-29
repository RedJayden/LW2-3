#pragma once
#include <map>
#include "..\UnitConvert\UnitConvertUtil.h"

// 모터의 가장 기본적인 알람 정보만 보여주는 데이터
struct MotorStatus
{
    BOOL m_PowerOn = FALSE;
    BOOL m_Servo = FALSE;
	BOOL m_FollowingError = FALSE;
	BOOL m_AmplifierFault = FALSE;
    BOOL m_IsMoving = FALSE;
	BOOL m_HomeSensorError = FALSE;
    BOOL m_PositiveLimit = FALSE;
    BOOL m_NegativeLimit = FALSE;
	BOOL m_HomingError = FALSE;
    BOOL m_HomeComplete = FALSE;
    BOOL m_IsAlarm = FALSE;
    BOOL m_IsInposition = FALSE;
};

struct MotorErrInfo
{
    CString   m_Msg;
    DWORD_PTR m_Code = NULL;
    void* m_Param = NULL;
};

class MotorBase
{
public:

    MotorBase() = default;
    virtual ~MotorBase() = default;

    virtual BOOL Connect() = 0;
    virtual BOOL Close() = 0;
    virtual BOOL IsConnect() = 0;

    virtual BOOL Servo(BOOL OnOff) = 0;
    virtual BOOL Homing() = 0;
    virtual BOOL MovAbs(double mm) = 0;
    virtual BOOL MovRel(double mm) = 0;
    virtual BOOL Stop() = 0;
    virtual BOOL AlarmReset() = 0;

    virtual BOOL JogCW() = 0;
    virtual BOOL JogCCW() = 0;

    virtual double        GetPos() = 0;
    virtual BOOL SetPos(double mm) = 0;
    virtual void SetSpeed(double vel, double accel) = 0;

    virtual MotorStatus   GetStatus() = 0;
    virtual MotorErrInfo  GetLastError() = 0;

    template<typename VALUE = CString>
    VALUE GetAttribute(const CString& Key) { return (VALUE)m_AttributeMap.Get(Key); }

    template<>
    double GetAttribute<double>(const CString& Key) { return _ttof(m_AttributeMap.Get(Key)); }

    template<>
    int GetAttribute<int>(const CString& Key) { return _ttoi(m_AttributeMap.Get(Key)); }

    template<typename T>
    void SetAttribute(const CString& Key, const T& Value) { m_AttributeMap.Set(Key, StrUtil::ToString(Value)); }

private:

    SyncMap< std::map<CString, CString>, CString, CString > m_AttributeMap;
};
