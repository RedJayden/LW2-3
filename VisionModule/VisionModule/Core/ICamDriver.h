#pragma once
/**
 * @file ICamDriver.h
 * @brief 카메라 드라이버 Strategy 인터페이스
 */

#include <string>
#include "VisionTypes.h"

 /**
  * @class ICamDriver
  * @brief 카메라 벤더 독립 인터페이스 (Strategy)
  */
class ICamDriver {
public:
    virtual ~ICamDriver() = default;

    /// 디바이스 열거 (성공 시 디바이스 개수 리턴)
    virtual int  EnumCameras() = 0;

    /// 인덱스 기반 디바이스 이름 조회
    virtual bool GetCameraInfo(int index, std::string& name) = 0;

    /// 디바이스 오픈/클로즈
    virtual bool Open(int index) = 0;
    virtual void Close() = 0;

    /// 스트리밍 시작/중지
    virtual bool Start() = 0;
    virtual void Stop() = 0;

    /// 노출/게인 범위/설정
    virtual bool GetExposureRange(double& min_us, double& max_us, double& step_us) = 0;
    virtual bool SetExposure(double exposure_us) = 0;
    virtual bool GetGainRange(double& min, double& max, double& step) = 0;
    virtual bool SetGain(double gain) = 0;

    /// 최신 프레임 조회(복사 없음)
    virtual bool PopLatest(VMFrameView& out) = 0;
};
