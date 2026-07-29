#pragma once
/**
 * @file HikDriver.h
 * @brief Hikrobot MVS 드라이버 Strategy 구현 (CHikCamWrapper 기반)
 */

#include <mutex>
#include <memory>
#include <functional>
#include <opencv2/opencv.hpp>
#include "ICamDriver.h"
#include "VisionTypes.h"
#include "FrameBuffer.h"
#include "DeviceRegistry.h"

class CHikCamWrapper;

class HikDriver final : public ICamDriver {
public:
    explicit HikDriver(const DeviceEntry& dev, std::function<void(const VMFrameView&)> onFrame);
    ~HikDriver() override;

    int  EnumCameras() override;
    bool GetCameraInfo(int index, std::string& name) override;
    bool Open(int index) override;
    void Close() override;
    bool Start() override;
    void Stop() override;

    bool GetExposureRange(double& min_us, double& max_us, double& step_us) override;
    bool SetExposure(double exposure_us) override;
    bool GetGainRange(double& min, double& max, double& step) override;
    bool SetGain(double gain) override;

    bool PopLatest(VMFrameView& out) override;

private:
    void OnBgrFrame(const uint8_t* bgr, int w, int h, int stride,
        uint64_t dev_ts, uint64_t dev_hz);

private:
    std::function<void(const VMFrameView&)> onFrame_;
    DeviceEntry dev_;
    std::unique_ptr<CHikCamWrapper> cam_;
    FrameBuffer fb_;
    std::mutex m_;
    VMFrameView last_{};
    int openedIndex_ = -1;
};
