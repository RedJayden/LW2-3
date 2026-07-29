#pragma once
/**
 * @file VisionModuleImpl.h
 * @brief VisionModule DLL 내부 Facade 구현
 * @details
 *  - Factory로 드라이버 지연 생성(Open 시점)
 *  - FPS 측정, Snapshot 저장, LastError 보관
 */

#include <memory>
#include <mutex>
#include <atomic>
#include <chrono>
#include <string>
#include "VisionTypes.h"
#include "ICamDriver.h"
#include "DeviceRegistry.h"

class VisionModuleImpl {
public:
    using LogCB = void(*)(int, const char*);
    using FrameCB = void(*)(int, const VMFrameView*, void*);

    VisionModuleImpl();
    ~VisionModuleImpl();

    const char* GetVersion() const noexcept;
    void SetLogCallback(LogCB cb);
    void SetFrameCallback(FrameCB cb, void* user);

    int  EnumCameras();
    bool GetCameraInfo(int index, char* outName, int nameCap);
    bool Open(int index);
    bool OpenBySerial(const std::string& serial);
    void Close();
    bool Start(bool enableStreaming = true);
    void Stop();

    bool GetExposureRange(double& min_us, double& max_us, double& step_us);
    bool SetExposure(double exposure_us);
    bool GetGainRange(double& min, double& max, double& step);
    bool SetGain(double gain);

    bool PopLatest(VMFrameView& out);
    bool GetFps(double& outFps);
    bool Snapshot(const wchar_t* filePath);
    const wchar_t* LastError() const noexcept;

private:
    void OnDriverFrame(const VMFrameView& f);
    void SetError(const std::wstring& msg);

private:
    std::unique_ptr<ICamDriver> driver_;
    std::mutex last_mtx_;
    VMFrameView last_{};

    LogCB   log_{ nullptr };
    FrameCB frame_{ nullptr };
    void* frame_user_{ nullptr };

    std::atomic<int>  camId_{ 0 };       ///< 통합 인덱스
    std::atomic<bool> streaming_{ false };

    std::atomic<int> frameCount_{ 0 };
    std::chrono::steady_clock::time_point lastFpsTime_{};
    double lastFps_{ 0.0 };

    mutable std::mutex err_mtx_;
    std::wstring lastErr_;
};
