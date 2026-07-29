#pragma once

#include <array>
#include <mutex>
#include <string>

#include <opencv2/opencv.hpp>

// VisionModule 공용 인터페이스 (VM_Handle, VMFrameView, VMPixelFormat 등 선언)
#include "IVisionModule.h"

/**
 * @file VisionBridge.h
 * @brief VisionModule VM_* API 래핑 파사드
 * @details
 *  - 디자인 패턴: Facade, Singleton, RAII
 *  - 역할:
 *    - VM_Handle 수명 관리 (Create/Open/Start/Stop/Close/Destroy)
 *    - 카메라 열거 및 자동 오픈
 *    - 최신 프레임 PopLatest → cv::Mat(BGR) + FPS 반환
 *    - 노출/게인 설정
 *
 *  - JPEG 인코딩 및 LatestFrameStore 업데이트는 별도 클래스
 *    (예: MjpegFeederFromVision) 에서 담당한다.
 */
class VisionBridge
{
public:
    /// @brief 카메라 최대 개수 (필요 시 프로젝트에 맞게 조정)
    static constexpr int MaxCameras = 4;

    /**
     * @brief 싱글톤 인스턴스 반환
     * @return VisionBridge 참조
     * @details
     *  - 디자인 패턴: Singleton (Meyers Singleton)
     */
    static VisionBridge& Instance();

    /**
     * @brief VisionModule 초기화 및 카메라 오픈
     * @param dllPath VisionModule.dll 전체 경로 (정적 링크 구조에서는 사용하지 않음)
     * @param camIndex 기본 카메라 인덱스 (현재 자동 열기 방식에서는 사용하지 않음)
     * @return 성공 여부
     * @details
     *  - 내부적으로 한 번만 실행된다(두 번째 호출부터는 no-op).
     *  - VM_EnumCameras 로 카메라 개수를 구한 뒤,
     *    0 ~ min(camCount, MaxCameras) 범위를 Create/Open/Start 한다.
     */
    bool Initialize(const std::wstring& dllPath, int camIndex);

    /**
     * @brief 자원 해제 및 카메라 닫기
     * @details
     *  - 모든 VM_Handle 에 대해 Stop → Close → Destroy 를 호출한다.
     *  - 여러 번 호출해도 안전하다.
     */
    void Shutdown();

    /**
     * @brief 최신 BGR 프레임 가져오기
     * @param camId   카메라 ID (0 기반)
     * @param[out] bgrOut BGR(8UC3) 이미지
     * @param[out] fps    초당 프레임 수
     * @return 성공 시 true, 프레임 없음/에러 시 false
     * @details
     *  - 내부에서 VM_PopLatest 를 호출하고,
     *    픽셀 포맷(BGR8/MONO8)에 따라 cv::Mat 으로 변환한다.
     */
    bool PopLatest(int camId, cv::Mat& bgrOut, double& fps);

    /**
     * @brief 노출 시간 설정
     * @param camId 카메라 ID
     * @param us    노출 시간 (VisionModule 규격 기준)
     * @return 설정 성공 시 true
     */
    bool SetExposure(int camId, double us);

    /**
     * @brief 게인 설정
     * @param camId 카메라 ID
     * @param gain  게인 값
     * @return 설정 성공 시 true
     */
    bool SetGain(int camId, double gain);

    /**
     * @brief 실제 오픈된 카메라 개수 조회
     * @return VM_Open/Start 에 성공한 카메라 개수
     * @details
     *  - MjpegFeederFromVision 등에서 루프 상한으로 사용 가능.
     */
    int GetCameraCount() const;

    /**
     * @brief 해당 camId 의 카메라가 유효하게 열려 있는지 여부
     * @param camId 카메라 ID (0 기반)
     * @return 유효한 핸들이 존재하면 true, 아니면 false
     */
    bool HasCamera(int camId) const;

    /**
     * @brief Initialize 완료 여부
     * @return 내부 초기화가 완료된 상태면 true
     * @details
     *  - 외부에서 방어적으로 상태를 확인할 때 사용.
     */
    bool IsInitialized() const;

private:
    /**
     * @brief 생성자 (Singleton)
     */
    VisionBridge();

    /**
     * @brief 소멸자 (RAII)
     * @details
     *  - 내부적으로 Shutdown() 을 호출한다.
     */
    ~VisionBridge();

    VisionBridge(const VisionBridge&) = delete;
    VisionBridge& operator=(const VisionBridge&) = delete;

    /**
     * @brief 내부 초기화 보장 (뮤텍스 잠금 상태에서만 호출)
     * @return 이미 초기화되어 있거나 새로 초기화에 성공하면 true
     */
    bool EnsureInitializedLocked();

    /**
     * @brief 카메라 핸들 얻기 (뮤텍스 잠금 상태에서만 호출)
     * @param camId 카메라 ID
     * @return 유효한 VM_Handle 또는 nullptr
     */
    VM_Handle GetHandleLocked(int camId) const;

private:
    /// @brief VM_Handle 배열 (camId → VM_Handle)
    std::array<VM_Handle, MaxCameras> m_handles{};

    /// @brief 초기화 완료 여부
    bool m_initialized = false;

    /// @brief 내부 동시성 보호용 뮤텍스
    mutable std::mutex m_mtx;
};
