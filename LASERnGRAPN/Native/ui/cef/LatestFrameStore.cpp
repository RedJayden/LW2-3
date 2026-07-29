#include "pch.h"
#include "LatestFrameStore.h"

/**
 * @file LatestFrameStore.cpp
 * @brief LatestFrameStore 구현부
 */

LatestFrameStore& LatestFrameStore::Instance() noexcept
{
    static LatestFrameStore inst;
    return inst;
}

void LatestFrameStore::UpdateFrame(int camId,
    ByteBuffer jpeg,
    double fps) noexcept
{
    // 멀티스레드 대비 (쓰기 전용 락)
    std::unique_lock<std::shared_mutex> lock(mtx_);

    // camId 에 해당하는 엔트리를 얻고, JPEG/ FPS / 타임스탬프 갱신
    auto& entry = table_[camId];
    entry.jpeg = std::move(jpeg);  // 값 전달 + move 로 복사 최소화
    entry.fps = fps;
    entry.lastUpdate = std::chrono::steady_clock::now();
}

bool LatestFrameStore::GetLatestFrame(int camId,
    ByteBuffer& outJpeg,
    double& outFps) noexcept
{
    // 여러 쓰레드 동시 읽기 허용
    std::shared_lock<std::shared_mutex> lock(mtx_);

    const auto it = table_.find(camId);
    if (it == table_.end())
    {
        outJpeg.clear();
        outFps = 0.0;
        return false;
    }

    const Entry& e = it->second;
    if (e.jpeg.empty())
    {
        outJpeg.clear();
        outFps = 0.0;
        return false;
    }

    outJpeg = e.jpeg;  // 조회 측에서 수정해도 원본은 유지 (복사)
    outFps = e.fps;
    return true;
}
