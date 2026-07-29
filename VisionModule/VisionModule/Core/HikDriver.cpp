#include "pch.h"
#include "HikDriver.h"
#include "VM_Logger.h"
#include "HikCamWrapper.h"
#include <sstream>
#include <chrono>
#include <algorithm>
#include <cctype>

static std::string MakeFriendlyName(const MV_CC_DEVICE_INFO& di) {
    std::ostringstream ss;
    if (di.nTLayerType == MV_GIGE_DEVICE) {
        const auto& g = di.SpecialInfo.stGigEInfo;
        int ip1 = (g.nCurrentIp >> 24) & 0xFF, ip2 = (g.nCurrentIp >> 16) & 0xFF, ip3 = (g.nCurrentIp >> 8) & 0xFF, ip4 = (g.nCurrentIp) & 0xFF;
        ss << "[GigE] " << (g.chModelName ? (const char*)g.chModelName : "Model")
            << " @ " << ip1 << "." << ip2 << "." << ip3 << "." << ip4;
    }
    else if (di.nTLayerType == MV_USB_DEVICE) {
        const auto& u = di.SpecialInfo.stUsb3VInfo;
        ss << "[USB3] " << (u.chModelName ? (const char*)u.chModelName : "Model");
    }
    else {
        ss << "[Hik] Camera";
    }
    return ss.str();
}

HikDriver::HikDriver(const DeviceEntry& dev, std::function<void(const VMFrameView&)> onFrame)
    : onFrame_(std::move(onFrame)), dev_(dev), cam_(std::make_unique<CHikCamWrapper>()) {
}

HikDriver::~HikDriver() { Stop(); Close(); }

int HikDriver::EnumCameras() {
    MV_CC_DEVICE_INFO_LIST list{};
    if (!CHikCamWrapper::EnumDevices(list)) return 0;
    return static_cast<int>(list.nDeviceNum);
}

bool HikDriver::GetCameraInfo(int index, std::string& name) {
    MV_CC_DEVICE_INFO_LIST list{};
    if (!CHikCamWrapper::EnumDevices(list)) return false;
    if (index < 0 || index >= static_cast<int>(list.nDeviceNum)) return false;
    name = MakeFriendlyName(*list.pDeviceInfo[index]);
    return true;
}

static inline std::string TrimString(std::string s) {
    s.erase(s.begin(), std::find_if(s.begin(), s.end(), [](unsigned char ch) {
        return !std::isspace(ch);
    }));
    s.erase(std::find_if(s.rbegin(), s.rend(), [](unsigned char ch) {
        return !std::isspace(ch);
    }).base(), s.end());
    return s;
}

bool HikDriver::Open(int index) {
    MV_CC_DEVICE_INFO_LIST list{};
    if (!CHikCamWrapper::EnumDevices(list)) return false;

    int finalIndex = -1;
    std::string targetSn = TrimString(dev_.serialNumber);

    if (!targetSn.empty()) {
        for (int i = 0; i < static_cast<int>(list.nDeviceNum); ++i) {
            std::string curSn = "";
            const MV_CC_DEVICE_INFO& di = *list.pDeviceInfo[i];
            if (di.nTLayerType == MV_GIGE_DEVICE || 
                di.nTLayerType == MV_GENTL_GIGE_DEVICE || 
                di.nTLayerType == MV_VIR_GIGE_DEVICE) {
                curSn = (const char*)di.SpecialInfo.stGigEInfo.chSerialNumber;
            }
            else if (di.nTLayerType == MV_USB_DEVICE || 
                     di.nTLayerType == MV_VIR_USB_DEVICE) {
                curSn = (const char*)di.SpecialInfo.stUsb3VInfo.chSerialNumber;
            }

            if (TrimString(curSn) == targetSn) {
                finalIndex = i;
                break;
            }
        }
    }

    if (finalIndex == -1) {
        finalIndex = index;
    }

    if (finalIndex < 0 || finalIndex >= static_cast<int>(list.nDeviceNum)) return false;

    if (!cam_->Open(*list.pDeviceInfo[finalIndex])) return false;
    openedIndex_ = finalIndex;
    VM_Logger::Instance().Log(1, "HikDriver: Open success");
    return true;
}

void HikDriver::Close() {
    if (cam_) cam_->Close();
    openedIndex_ = -1;
    fb_.Clear();
    std::lock_guard<std::mutex> lk(m_);
    last_ = {};
}

bool HikDriver::Start() {
    if (!cam_ || !cam_->IsOpened()) return false;

    // 변환완료 BGR 콜백만 사용(중복 콜백 제거)
    cam_->SetOnFrameBGR([this](const uint8_t* bgr, int w, int h, int stride,
        uint64_t dev_ts, uint64_t dev_hz) {
            this->OnBgrFrame(bgr, w, h, stride, dev_ts, dev_hz);
        });

    if (!cam_->Start()) return false;
    VM_Logger::Instance().Log(1, "HikDriver: Start grabbing");
    return true;
}

void HikDriver::Stop() {
    if (cam_) cam_->Stop();
    VM_Logger::Instance().Log(1, "HikDriver: Stop grabbing");
}

bool HikDriver::GetExposureRange(double& min_us, double& max_us, double& step_us) {
    if (!cam_) return false;
    CHikCamWrapper::Range r{};
    if (!cam_->GetExposureRange(r)) return false;
    min_us = r.min; max_us = r.max; step_us = (r.inc > 0.0 ? r.inc : 0.0);
    return true;
}
bool HikDriver::SetExposure(double exposure_us) { return cam_ && cam_->SetExposure(exposure_us, true); }

bool HikDriver::GetGainRange(double& min, double& max, double& step) {
    if (!cam_) return false;
    CHikCamWrapper::Range r{};
    if (!cam_->GetGainRange(r)) return false;
    min = r.min; max = r.max; step = (r.inc > 0.0 ? r.inc : 0.0);
    return true;
}
bool HikDriver::SetGain(double gain) { return cam_ && cam_->SetGain(gain, true); }

bool HikDriver::PopLatest(VMFrameView& out) {
    std::lock_guard<std::mutex> lk(m_);
    out = last_;
    return (out.data != nullptr);
}

void HikDriver::OnBgrFrame(const uint8_t* bgr, int w, int h, int stride,
    uint64_t dev_ts, uint64_t dev_hz) {
    VMFrameDesc d{};
    d.width = static_cast<uint32_t>(w);
    d.height = static_cast<uint32_t>(h);
    d.stride = static_cast<uint32_t>(stride); // 장치 stride 그대로 사용
    d.pixelType = VMPixelFormat::BGR8;

    if (dev_hz > 0) {
        d.timestamp_us = static_cast<uint64_t>((static_cast<long double>(dev_ts) * 1000000.0L) / dev_hz);
    }
    else {
        const auto now = std::chrono::steady_clock::now().time_since_epoch();
        d.timestamp_us = static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::microseconds>(now).count());
    }

    fb_.Push(bgr, d);

    VMFrameView vw{};
    if (fb_.Pop(vw)) {             // 소비는 내부에서만 → last_ 캐시 유지
        std::lock_guard<std::mutex> lk(m_);
        last_ = vw;
        if (onFrame_) onFrame_(vw);
    }
}
