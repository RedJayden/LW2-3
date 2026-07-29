#pragma once
/**
 * @file DummyDriver.h
 * @brief 소프트 카메라(시뮬레이터) - Null Object 패턴
 * @details
 *  - 640x480, 30fps, moving grid + timestamp 렌더링
 *  - 디자인 패턴: Null Object, Strategy, RAII
 */

#include <thread>
#include <atomic>
#include <functional>
#include <mutex>
#include <opencv2/opencv.hpp>
#include "ICamDriver.h"
#include "FrameBuffer.h"

class DummyDriver final : public ICamDriver {
public:
    explicit DummyDriver(std::function<void(const VMFrameView&)> onFrame);
    ~DummyDriver() override;

    int  EnumCameras() override { return 1; }
    bool GetCameraInfo(int, std::string& name) override { name = "[Dummy] Synthetic Camera"; return true; }
    bool Open(int) override;
    void Close() override;
    bool Start() override;
    void Stop() override;

    bool GetExposureRange(double& a, double& b, double& c) override { a = 100; b = 200000; c = 100; return true; }
    bool SetExposure(double) override { return true; }
    bool GetGainRange(double& a, double& b, double& c) override { a = 0; b = 24; c = 0.1; return true; }
    bool SetGain(double) override { return true; }

    bool PopLatest(VMFrameView& out) override;

private:
    void ThreadProc();

private:
    std::function<void(const VMFrameView&)> onFrame_;
    std::atomic<bool> opened_{ false };
    std::atomic<bool> running_{ false };
    std::thread th_;
    FrameBuffer fb_;
    std::mutex m_;
    VMFrameView last_{};
};
