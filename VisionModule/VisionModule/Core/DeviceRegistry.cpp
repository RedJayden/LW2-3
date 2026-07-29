#include "pch.h"
#include "DeviceRegistry.h"
#include <algorithm>
#include <cctype>

// Hik 열거용
#include "HikCamWrapper.h"

static inline std::string Trim(std::string s) {
    s.erase(s.begin(), std::find_if(s.begin(), s.end(), [](unsigned char ch) {
        return !std::isspace(ch);
    }));
    s.erase(std::find_if(s.rbegin(), s.rend(), [](unsigned char ch) {
        return !std::isspace(ch);
    }).base(), s.end());
    return s;
}

// Basler는 아직 스텁이므로 이름만 구성
// Dummy는 항상 1개(필요 시 0개로 바꿀 수 있음)

static std::string MakeHikFriendlyName(const MV_CC_DEVICE_INFO& di) {
    std::ostringstream ss;
    if (di.nTLayerType == MV_GIGE_DEVICE) {
        const auto& g = di.SpecialInfo.stGigEInfo;
        int ip1 = (g.nCurrentIp >> 24) & 0xFF, ip2 = (g.nCurrentIp >> 16) & 0xFF, ip3 = (g.nCurrentIp >> 8) & 0xFF, ip4 = (g.nCurrentIp) & 0xFF;
        ss << "[GigE] " << (g.chModelName ? (const char*)g.chModelName : "Hik")
            << " @ " << ip1 << "." << ip2 << "." << ip3 << "." << ip4;
    }
    else if (di.nTLayerType == MV_USB_DEVICE) {
        const auto& u = di.SpecialInfo.stUsb3VInfo;
        ss << "[USB3] " << (u.chModelName ? (const char*)u.chModelName : "Hik USB3");
    }
    else {
        ss << "[Hik] Camera";
    }
    return ss.str();
}

DeviceRegistry& DeviceRegistry::Instance() {
    static DeviceRegistry g;
    return g;
}

std::vector<DeviceEntry> DeviceRegistry::Refresh() {
    std::lock_guard<std::mutex> lk(mtx_);
    list_.clear();

    // 2) Hikrobot 스캔
    {
        MV_CC_DEVICE_INFO_LIST l{};
        if (CHikCamWrapper::EnumDevices(l)) {
            for (int i = 0; i < static_cast<int>(l.nDeviceNum); ++i) {
                DeviceEntry e;
                e.vendor = VMVendor::Hikrobot;
                e.vendorIndex = i;

                const MV_CC_DEVICE_INFO& di = *l.pDeviceInfo[i];
                e.name = MakeHikFriendlyName(di);

                // Serial Number 추출
                if (di.nTLayerType == MV_GIGE_DEVICE || 
                    di.nTLayerType == MV_GENTL_GIGE_DEVICE || 
                    di.nTLayerType == MV_VIR_GIGE_DEVICE) {
                    e.serialNumber = (const char*)di.SpecialInfo.stGigEInfo.chSerialNumber;
                }
                else if (di.nTLayerType == MV_USB_DEVICE || 
                         di.nTLayerType == MV_VIR_USB_DEVICE) {
                    e.serialNumber = (const char*)di.SpecialInfo.stUsb3VInfo.chSerialNumber;
                }

                list_.push_back(e);
            }
        }
    }

    // 3) Basler 스캔 (현재 스텁: 0대 가정 / 필요 시 Pylon SDK로 채우기)
    // 예) Pylon 열거 후 push_back

    return list_;
}

const DeviceEntry* DeviceRegistry::GetByUnifiedIndex(int idx) const {
    std::lock_guard<std::mutex> lk(mtx_);
    if (idx < 0 || idx >= static_cast<int>(list_.size())) return nullptr;
    return &list_[idx];
}

const DeviceEntry* DeviceRegistry::GetBySerialNumber(const std::string& sn) const {
    std::lock_guard<std::mutex> lk(mtx_);
    std::string cleanSn = Trim(sn);
    for (const auto& e : list_) {
        // 시리얼 번호가 비어있지 않고 일치할 경우 반환 (Trim 처리하여 공백 무관 매칭)
        if (!e.serialNumber.empty() && Trim(e.serialNumber) == cleanSn) {
            return &e;
        }
    }
    return nullptr;
}

std::vector<DeviceEntry> DeviceRegistry::Snapshot() const {
    std::lock_guard<std::mutex> lk(mtx_);
    return list_;
}
