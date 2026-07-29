#pragma once

#include <vector>
#include <unordered_map>
#include <mutex>
#include <shared_mutex>
#include <chrono>

/**
 * @file LatestFrameStore.h
 * @brief 카메라 ID별 최신 JPEG 프레임 보관소
 * @details
 *  - 디자인 패턴: Singleton, Thread-Safe Cache
 *  - VisionBridge 가 업데이트하고, CameraResourceHandler 가 조회한다.
 */
class LatestFrameStore
{
public:
    /// @brief JPEG 바이트 버퍼 타입 별칭
    using ByteBuffer = std::vector<unsigned char>;

    /**
     * @brief 싱글톤 인스턴스 반환
     * @return LatestFrameStore 참조
     */
    static LatestFrameStore& Instance() noexcept;

    /**
     * @brief JPEG 프레임 업데이트 (복사/이동 최적화)
     * @details
     *  - 호출 측에서 std::move(jpeg) 를 넘기면 내부에서 복사 없이 소유권을 이전한다.
     *  - 단, 호출 이후 해당 jpeg 변수는 더 이상 사용하지 않는 것이 안전하다.
     * @param camId 카메라 ID (0, 1, ...)
     * @param jpeg  JPEG 바이트 배열(값 전달)
     * @param fps   현재 FPS
     */
    void UpdateFrame(int camId, ByteBuffer jpeg, double fps) noexcept;

    /**
     * @brief (별칭) UpdateFrame 과 동일한 의미의 래퍼
     * @details
     *  - 이름을 PushFrame 으로 쓰고 싶은 코드에서 사용하기 위함.
     */
    inline void PushFrame(int camId, ByteBuffer jpeg, double fps) noexcept
    {
        UpdateFrame(camId, std::move(jpeg), fps);
    }

    /**
     * @brief 최신 JPEG 프레임 조회
     * @param camId        카메라 ID
     * @param[out] outJpeg JPEG 바이트 배열
     * @param[out] outFps  FPS
     * @return 성공 시 true (프레임 존재 & 비어있지 않음)
     */
    [[nodiscard]]
    bool GetLatestFrame(int camId, ByteBuffer& outJpeg, double& outFps) noexcept;

    /**
     * @brief (레거시 호환) 최신 프레임 조회 - FPS 필요 없는 버전
     * @details
     *  - 기존 코드에서 사용하던 시그니처를 그대로 제공하기 위한 래퍼입니다.
     * @param camId        카메라 ID
     * @param[out] outJpeg JPEG 바이트 배열
     * @return 성공 시 true
     */
    [[nodiscard]]
    bool TryGetLatest(int camId, ByteBuffer& outJpeg) noexcept
    {
        double dummyFps = 0.0;
        return GetLatestFrame(camId, outJpeg, dummyFps);
    }

    /**
     * @brief (레거시 호환) 최신 프레임 조회 - FPS 포함 버전
     * @details
     *  - CameraResourceHandler 에서 사용 중인
     *    `TryGetLatest(camId, jpeg, fps)` 시그니처를 지원합니다.
     * @param camId        카메라 ID
     * @param[out] outJpeg JPEG 바이트 배열
     * @param[out] outFps  FPS
     * @return 성공 시 true
     */
    [[nodiscard]]
    bool TryGetLatest(int camId, ByteBuffer& outJpeg, double& outFps) noexcept
    {
        return GetLatestFrame(camId, outJpeg, outFps);
    }

private:
    LatestFrameStore() = default;
    ~LatestFrameStore() = default;

    LatestFrameStore(const LatestFrameStore&) = delete;
    LatestFrameStore& operator=(const LatestFrameStore&) = delete;

private:
    /**
     * @brief 한 카메라의 최신 프레임/메타 정보
     */
    struct Entry
    {
        ByteBuffer jpeg;   ///< 최신 JPEG 데이터
        double fps = 0.0;  ///< 해당 시점의 FPS
        std::chrono::steady_clock::time_point lastUpdate; ///< 마지막 업데이트 시각
    };

    std::shared_mutex mtx_;                       ///< 동시 접근 보호용 뮤텍스
    std::unordered_map<int, Entry> table_; ///< camId → Entry 맵
};
