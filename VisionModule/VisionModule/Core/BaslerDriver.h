#pragma once
/**
 * @file BaslerDriver.h
 * @brief Basler 드라이버 Strategy 구현 (스텁)
 */

#include "ICamDriver.h"

 /**
  * @class BaslerDriver
  * @brief 아직 미구현: 안전하게 false 반환
  */
class BaslerDriver final : public ICamDriver {
public:
    BaslerDriver() = default;
    ~BaslerDriver() override = default;

    int  EnumCameras() override { return 0; }
    bool GetCameraInfo(int, std::string&) override { return false; }
    bool Open(int) override { return false; }
    void Close() override {}
    bool Start() override { return false; }
    void Stop() override {}

    bool GetExposureRange(double& a, double& b, double& c) override { a = b = c = 0; return false; }
    bool SetExposure(double) override { return false; }
    bool GetGainRange(double& a, double& b, double& c) override { a = b = c = 0; return false; }
    bool SetGain(double) override { return false; }

    bool PopLatest(VMFrameView&) override { return false; }
};
