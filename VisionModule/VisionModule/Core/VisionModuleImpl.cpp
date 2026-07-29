#include "pch.h"
#include "VisionModuleImpl.h"
#include "DriverFactory.h"
#include "VM_Logger.h"
#include <cstring>
#include <opencv2/opencv.hpp>
#include <codecvt>
#include <locale>

VisionModuleImpl::VisionModuleImpl() {
    lastFpsTime_ = std::chrono::steady_clock::now();
}
VisionModuleImpl::~VisionModuleImpl() { Stop(); Close(); }

const char* VisionModuleImpl::GetVersion() const noexcept { return "VisionModule 1.0.1"; }
void VisionModuleImpl::SetLogCallback(LogCB cb) { log_ = cb; VM_Logger::Instance().SetCallback(cb); }
void VisionModuleImpl::SetFrameCallback(FrameCB cb, void* user) { frame_ = cb; frame_user_ = user; }

int  VisionModuleImpl::EnumCameras() {
    DeviceRegistry::Instance().Refresh();
    return static_cast<int>(DeviceRegistry::Instance().Snapshot().size());
}

bool VisionModuleImpl::GetCameraInfo(int index, char* outName, int cap) {
    auto snap = DeviceRegistry::Instance().Snapshot();
    if (index < 0 || index >= static_cast<int>(snap.size())) return false;
    if (!outName || cap <= 0) return false;
    const auto& s = snap[index].name;
    return ::strncpy_s(outName, cap, s.c_str(), _TRUNCATE) == 0;
}

bool VisionModuleImpl::Open(int idx) {
    // NOTE: Refresh()는 EnumCameras()에서 이미 호출됨.
    //       Open()에서 재호출하면 동일 벤더 카메라(MC2: HikRobot x2)의
    //       열거 순서가 변동되어 같은 카메라를 이중 오픈하는 문제 발생.
    const DeviceEntry* dev = DeviceRegistry::Instance().GetByUnifiedIndex(idx);
    if (!dev) { SetError(L"Invalid camera index"); return false; }

    driver_ = CreateDriver(*dev, [this](const VMFrameView& f) { OnDriverFrame(f); });
    if (!driver_) { SetError(L"Driver create failed"); return false; }

    camId_ = idx;
    if (!driver_->Open(dev->vendorIndex)) { SetError(L"Driver open failed"); return false; }
    return true;
}

bool VisionModuleImpl::OpenBySerial(const std::string& serial) {
    const DeviceEntry* dev = DeviceRegistry::Instance().GetBySerialNumber(serial);
    if (!dev) { SetError(L"Camera not found by serial number"); return false; }

    driver_ = CreateDriver(*dev, [this](const VMFrameView& f) { OnDriverFrame(f); });
    if (!driver_) { SetError(L"Driver create failed"); return false; }

    // 시리얼 번호로 오픈 성공 시 camId_는 내부적으로 일련번호 할당 가능(현재는 0 고정 대행 또는 무시)
    if (!driver_->Open(dev->vendorIndex)) { SetError(L"Driver open failed"); return false; }
    return true;
}

void VisionModuleImpl::Close() {
    if (driver_) driver_->Close();
}

bool VisionModuleImpl::Start(bool enableStreaming) {
    streaming_ = enableStreaming;
    frameCount_ = 0; lastFps_ = 0.0; lastFpsTime_ = std::chrono::steady_clock::now();
    return driver_ && driver_->Start();
}

void VisionModuleImpl::Stop() {
    streaming_ = false;
    if (driver_) driver_->Stop();
}

bool VisionModuleImpl::GetExposureRange(double& a, double& b, double& c) {
    return driver_ && driver_->GetExposureRange(a, b, c);
}
bool VisionModuleImpl::SetExposure(double v) { return driver_ && driver_->SetExposure(v); }
bool VisionModuleImpl::GetGainRange(double& a, double& b, double& c) { return driver_ && driver_->GetGainRange(a, b, c); }
bool VisionModuleImpl::SetGain(double v) { return driver_ && driver_->SetGain(v); }

bool VisionModuleImpl::PopLatest(VMFrameView& out) {
    std::lock_guard<std::mutex> lk(last_mtx_);
    out = last_;
    return (out.data != nullptr);
}

bool VisionModuleImpl::GetFps(double& outFps) {
    outFps = lastFps_;
    return streaming_;
}

bool VisionModuleImpl::Snapshot(const wchar_t* filePath)
{
    std::lock_guard<std::mutex> lk(last_mtx_);
    if (!last_.data) return false;

    try {
        const int w = static_cast<int>(last_.desc.width);
        const int h = static_cast<int>(last_.desc.height);
        const size_t step = static_cast<size_t>(last_.desc.stride);
        uint8_t* data = const_cast<uint8_t*>(last_.data);

        cv::Mat img; // 최종 저장용

        switch (last_.desc.pixelType)
        {
        case VMPixelFormat::BGR8:
        {
            cv::Mat bgr(h, w, CV_8UC3, data, step);
            img = bgr.clone(); // 복사본 생성 (출력 시 원본 메모리 접근 방지)
            break;
        }

        case VMPixelFormat::MONO8:
        {
            cv::Mat gray(h, w, CV_8UC1, data, step);
            cv::cvtColor(gray, img, cv::COLOR_GRAY2BGR); // 회색 이미지를 컬러로 저장
            break;
        }

		// 16비트 그레이는 미지원
        //case VMPixelFormat::MONO16:
        //{
        //    cv::Mat mono16(h, w, CV_16UC1, data, step);
        //    mono16.convertTo(img, CV_8UC1, 1.0 / 256.0); // 16비트 → 8비트 다운스케일
        //    cv::cvtColor(img, img, cv::COLOR_GRAY2BGR);
        //    break;
        //}

        default:
            SetError(L"Unsupported pixel format for Snapshot()");
            return false;
        }

        const std::string utf8path = std::wstring_convert<std::codecvt_utf8<wchar_t>>().to_bytes(filePath);
        if (!cv::imwrite(utf8path, img)) {
            SetError(L"imwrite() failed to save image.");
            return false;
        }

        return true;
    }
    catch (const cv::Exception& e)
    {
        SetError(L"Snapshot failed: " +
            std::wstring_convert<std::codecvt_utf8<wchar_t>>().from_bytes(e.what()));
        return false;
    }
}

const wchar_t* VisionModuleImpl::LastError() const noexcept {
    std::lock_guard<std::mutex> lk(err_mtx_);
    return lastErr_.c_str();
}

void VisionModuleImpl::OnDriverFrame(const VMFrameView& f) {
    { std::lock_guard<std::mutex> lk(last_mtx_); last_ = f; }

    // FPS
    frameCount_++;
    auto now = std::chrono::steady_clock::now();
    auto dtMs = std::chrono::duration_cast<std::chrono::milliseconds>(now - lastFpsTime_).count();
    if (dtMs >= 1000) {
        lastFps_ = frameCount_ * 1000.0 / dtMs;
        frameCount_ = 0;
        lastFpsTime_ = now;
    }

    if (frame_ && streaming_) frame_(camId_.load(), &f, frame_user_);
}

void VisionModuleImpl::SetError(const std::wstring& msg) {
    std::lock_guard<std::mutex> lk(err_mtx_);
    lastErr_ = msg;

    if (log_) {
        // 안전한 wchar_t → UTF-8 변환
        std::wstring_convert<std::codecvt_utf8<wchar_t>> conv;
        std::string utf8msg = conv.to_bytes(msg);

        log_(-1, utf8msg.c_str());
    }
}
