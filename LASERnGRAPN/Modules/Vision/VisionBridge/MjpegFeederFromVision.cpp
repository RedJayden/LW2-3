// Modules/Vision/VisionBridge/MjpegFeederFromVision.cpp
#include "pch.h"
#include "MjpegFeederFromVision.h"

#include <chrono>
#include <thread>

using namespace std::chrono_literals;

void MjpegFeederFromVision::Start()
{
    bool expected = false;
    if (!running_.compare_exchange_strong(expected, true))
        return; // 이미 실행 중

    worker_ = std::thread([this]() { this->ThreadLoop(); });
}

void MjpegFeederFromVision::Stop()
{
    bool expected = true;
    if (!running_.compare_exchange_strong(expected, false))
        return; // 이미 멈춰 있음

    if (worker_.joinable())
        worker_.join();
}

void MjpegFeederFromVision::ThreadLoop()
{
    cv::Mat frame;
    double fps = 0.0;

    // 카메라 개수를 VisionBridge에서 동적으로 가져옴 (하드코딩 제거)
    const int camCount = VisionBridge::Instance().GetCameraCount();

    // JPEG 인코딩 옵션 (품질 80)
    std::vector<int> jpegParams = {
        cv::IMWRITE_JPEG_QUALITY, 80
    };

    while (running_)
    {
        for (int camId = 0; camId < camCount; ++camId)
        {
            if (!VisionBridge::Instance().HasCamera(camId)) continue;

            frame.release();
            fps = 0.0;

            // VisionBridge 에서 최신 프레임 획득
            if (VisionBridge::Instance().PopLatest(camId, frame, fps))
            {
                if (!frame.empty())
                {
                    std::vector<unsigned char> jpeg;
                    try
                    {
                        if (cv::imencode(".jpg", frame, jpeg, jpegParams))
                        {
                            LatestFrameStore::Instance().UpdateFrame(camId, jpeg, fps);
                        }
                    }
                    catch (...)
                    {
                        // 필요시 LOG
                    }
                }
            }
        }

        // 너무 바쁘지 않게 약간 쉼 (5~10ms)
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
}
