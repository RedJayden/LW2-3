#pragma once
/**
 * @file DeviceRegistry.h
 * @brief Hik/Basler/Dummy 장치를 통합 인덱스로 열거/조회하는 레지스트리
 * @details
 *  - 디자인 패턴: Facade(열거 창구), Adapter(벤더별 → 공통 엔트리)
 *  - Thread-safe: 내부 뮤텍스 보호
 */

#include <vector>
#include <string>
#include <mutex>
#include "VisionEnums.h"   // VMVendor
#include "VisionTypes.h"   // MV_CC_DEVICE_INFO 전방 필요 시 포함

 /// @brief 통합 장치 엔트리
struct DeviceEntry {
    VMVendor     vendor;       ///< Hikrobot, Basler, Dummy
    int          vendorIndex;  ///< 해당 벤더 내 로컬 인덱스(USB/GigE 리스트 인덱스)
    std::string  name;         ///< UI 표시용 Friendly name
    std::string  serialNumber; ///< 장치 고유 시리얼 번호
};

class DeviceRegistry {
public:
    /// @brief 싱글톤 인스턴스
    static DeviceRegistry& Instance();

    /**
     * @brief 장치 목록 갱신(Hik + Basler + Dummy 포함)
     * @return 통합 리스트 사본
     */
    std::vector<DeviceEntry> Refresh();

    /**
     * @brief 통합 인덱스로 장치 조회
     * @param idx 통합 인덱스
     * @return 엔트리 포인터(없으면 nullptr)
     */
    const DeviceEntry* GetByUnifiedIndex(int idx) const;
    const DeviceEntry* GetBySerialNumber(const std::string& sn) const;

    /// @brief 현재 목록 스냅샷 반환
    std::vector<DeviceEntry> Snapshot() const;

private:
    DeviceRegistry() = default;
    DeviceRegistry(const DeviceRegistry&) = delete;
    DeviceRegistry& operator=(const DeviceRegistry&) = delete;

private:
    mutable std::mutex mtx_;
    std::vector<DeviceEntry> list_;
};
