#pragma once
#include <opencv2/opencv.hpp>
#include "MvCameraControl.h"
#include "FrameQueue.h"

#include <string>
#include <vector>
#include <memory>
#include <atomic>
#include <functional>
#include <optional>
#include <chrono>
#include <sstream>


/**
 * @brief Hikrobot 카메라 1대 제어/콜백 기반 프레임 수집 래퍼
 * @details
 *  - 디자인 패턴: Observer(프레임 공급자), RAII(수명 관리), Strategy(픽셀 포맷 변환)
 *  - BGR(8UC3) 또는 Gray(8UC1) 입력을 일관된 BGR(8UC3)로 출력
 */
class CHikCamWrapper {
public:
    /// @brief 파라미터 범위 통합 구조체
    struct Range {
        double min = 0.0;
        double max = 0.0;
        double inc = 0.0;  ///< 부동소수 노드는 0일 수 있음
        double cur = 0.0;
    };

    using FrameCallback = std::function<void(double fps)>;

    CHikCamWrapper();
    ~CHikCamWrapper();

    CHikCamWrapper(const CHikCamWrapper&) = delete;
    CHikCamWrapper& operator=(const CHikCamWrapper&) = delete;
    CHikCamWrapper(CHikCamWrapper&&) noexcept = default;
    CHikCamWrapper& operator=(CHikCamWrapper&&) noexcept = default;

    /// @brief SDK 디바이스 열거
    static bool EnumDevices(MV_CC_DEVICE_INFO_LIST& list);

    /// @brief 디바이스 오픈
    bool Open(const MV_CC_DEVICE_INFO& dev);

    /// @brief 디바이스 클로즈
    void Close();

    /// @brief 스트림 시작/정지
    bool Start();
    void Stop();

    /// @brief 상태 조회
    bool IsOpened()   const { return m_opened; }
    bool IsGrabbing() const { return m_grabbing; }

    /**
     * @brief 단발 그랩(블로킹)
     * @param outBgr BGR(8UC3)
     * @param timeoutMs 타임아웃
     */
    bool GrabOne(cv::Mat& outBgr, int timeoutMs = 1000);

    /// @brief 디바이스 정보 문자열(디버그/UI)
    std::wstring GetDeviceInfoString() const;

    /**
     * @brief 노출/게인 설정 (AutoOff 지원)
     * @param value 설정값 (Exposure: us, Gain: dB 혹은 raw 근사)
     * @param autoOff true면 ExposureAuto/GainAuto 'Off' 시도
     */
    bool SetExposure(double value, bool autoOff = true);
    bool SetGain(double value, bool autoOff = true);

    /// @brief 현재 노출/게인 읽기
    double GetExposureDouble() const;
    double GetGainDouble() const;

    /// @brief 범위 통합 쿼리
    bool GetExposureRange(Range& out);
    bool GetGainRange(Range& out);

    /// @brief 프레임 콜백 옵저버 등록 (옵션)
    void SetOnFrame(FrameCallback cb) { m_cb = std::move(cb); }

    /// @brief HWND 통지(옵션): 새로운 프레임 도착 시 PostMessage
    void SetNotifyHwnd(HWND hwnd);

    /// @brief 최신 프레임(BGR) 하나 꺼내기 (큐에서 최신만 유지)
    bool PopLatest(cv::Mat& outBgr);

    static constexpr UINT WM_HIK_NEWFRAME = WM_APP + 100;

public:
    /// @brief BGR 프레임 콜백 시그니처 (zero-hop 통지)
    using BgrFrameCallback = std::function<void(
        const uint8_t* bgr, int w, int h, int stride,
        uint64_t dev_ts, uint64_t dev_hz)>;

    /// @brief 변환된 BGR 프레임을 즉시 통지받음( 큐 접근 불필요)
    void SetOnFrameBGR(BgrFrameCallback cb) { m_onBgr = std::move(cb); }

private:
    static void __stdcall OnImageCallbackEx2(MV_FRAME_OUT* pstFrame, void* pUser, bool bAutoFree);
    void OnFrameArrived(const MV_FRAME_OUT& f);

    /// @brief SDK 픽셀 → BGR 변환
    bool ConvertToBGR(const unsigned char* pIn, const MV_FRAME_OUT_INFO_EX& info, cv::Mat& outBgr);

    /// @brief 존재 시 enum 노드 문자열 설정 시도 (없으면 false)
    bool TrySetEnumString(const char* node, const char* value) const;

    // 영상 전달 콜백
    BgrFrameCallback m_onBgr;

private:
    void* m_handle = nullptr;
    MV_CC_DEVICE_INFO m_devInfo{};
    std::atomic<bool> m_opened{ false };
    std::atomic<bool> m_grabbing{ false };
    std::atomic<bool> m_shuttingDown{ false };

    std::vector<unsigned char> m_convBuf; // (예비) 변환 버퍼
    FrameQueue m_queue{ 8 };

    HWND m_hNotify = nullptr; // 새 프레임 도착 알림용
    FrameCallback m_cb;

    // FPS 계산
    std::atomic<double> m_fps{ 0.0 };
    std::chrono::steady_clock::time_point m_lastTp{};  ///< Host 시계 fallback

    // Device TS 기반 FPS 계산
    uint64_t m_lastDevTs = 0;      ///< 이전 디바이스 타임스탬프(조합한 64bit)
    uint64_t m_devTickHz = 0;      ///< 디바이스 타임스탬프 tick 주파수(Hz)
};
