// Modules/Vision/VisionBridge/MjpegFeederFromVision.h
#pragma once

#include <atomic>
#include <thread>
#include <vector>

#include <opencv2/opencv.hpp>

#include "Modules/Vision/VisionBridge/VisionBridge.h"
#include "Native/ui/cef/LatestFrameStore.h"

/**
 * @file MjpegFeederFromVision.h
 * @brief VisionBridge → LatestFrameStore 로 JPEG 프레임을 공급하는 백그라운드 워커
 * @details
 *  - 디자인 패턴: Background Worker, Producer
 *  - camId 0,1 에 대해 VisionBridge::PopLatest() 호출
 *  - BGR Mat 을 JPEG 로 인코딩 후 LatestFrameStore::UpdateFrame(camId, jpeg, fps)
 */
class MjpegFeederFromVision
{
public:
    MjpegFeederFromVision() = default;
    ~MjpegFeederFromVision() { Stop(); }

    /// @brief 백그라운드 쓰레드 시작 (이미 실행 중이면 아무 것도 안 함)
    void Start();

    /// @brief 백그라운드 쓰레드 종료 (idempotent)
    void Stop();

private:
    /// @brief 실질적인 Worker 루프
    void ThreadLoop();

private:
    std::atomic<bool> running_{ false };
    std::thread       worker_;
};
