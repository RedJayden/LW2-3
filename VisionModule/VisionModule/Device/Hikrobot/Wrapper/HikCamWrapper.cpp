#include "pch.h"

#include "HikCamWrapper.h"
#include "AnsiWide.h"

#include <cstring>
#include <sstream>

/** ********************************************
 * RAII/생명주기
 * ********************************************/

CHikCamWrapper::CHikCamWrapper() {}
CHikCamWrapper::~CHikCamWrapper()
{
    Stop();
    Close();
}

/** ********************************************
 * 디바이스 열고 닫기
 * ********************************************/

bool CHikCamWrapper::EnumDevices(MV_CC_DEVICE_INFO_LIST& list)
{
    memset(&list, 0, sizeof(list));
    if (MV_OK != MV_CC_EnumDevices(MV_GIGE_DEVICE | MV_USB_DEVICE, &list))
        return false;
    return list.nDeviceNum > 0;
}

bool CHikCamWrapper::Open(const MV_CC_DEVICE_INFO& dev)
{
    if (m_opened) return true;
    m_devInfo = dev;

    if (MV_OK != MV_CC_CreateHandle(&m_handle, &m_devInfo)) return false;
    if (MV_OK != MV_CC_OpenDevice(m_handle)) {
        MV_CC_DestroyHandle(m_handle);
        m_handle = nullptr;
        return false;
    }

    // GigE 일 때 패킷 사이즈 최적화 (GenTL GigE 및 가상 GigE 포함)
    if (m_devInfo.nTLayerType == MV_GIGE_DEVICE || 
        m_devInfo.nTLayerType == MV_GENTL_GIGE_DEVICE || 
        m_devInfo.nTLayerType == MV_VIR_GIGE_DEVICE) {
        int size = MV_CC_GetOptimalPacketSize(m_handle);
        if (size > 0) MV_CC_SetIntValue(m_handle, "GevSCPSPacketSize", size);
    }

    // 트리거 Off
    MV_CC_SetEnumValue(m_handle, "TriggerMode", 0);

    // 일부 모델: GainSelector 우선 설정
    MV_CC_SetEnumValueByString(m_handle, "GainSelector", "All");

    // 콜백 등록
    if (MV_OK != MV_CC_RegisterImageCallBackEx2(m_handle, &CHikCamWrapper::OnImageCallbackEx2, this, true))
        return false;

    m_opened = true;

    // --- Device Timestamp Frequency 조회 (있으면 Dev TS 기반 FPS 가능) ---
    m_devTickHz = 0;
    // SFNC 2.x 표준 노드 후보들
    MVCC_INTVALUE_EX iv{};
    if (MV_OK == MV_CC_GetIntValueEx(m_handle, "GevTimestampTickFrequency", &iv)) {
        m_devTickHz = static_cast<uint64_t>(iv.nCurValue);
    }
    else if (MV_OK == MV_CC_GetIntValueEx(m_handle, "TimestampFrequency", &iv)) {
        m_devTickHz = static_cast<uint64_t>(iv.nCurValue);
    }
    else if (MV_OK == MV_CC_GetIntValueEx(m_handle, "DeviceClockFrequency", &iv)) {
        m_devTickHz = static_cast<uint64_t>(iv.nCurValue);
    }
    m_lastDevTs = 0;
    m_lastTp = std::chrono::steady_clock::time_point{}; // 초기화
    // --------------------------------------------------------------

    return true;
}

void CHikCamWrapper::Close()
{
    if (!m_opened) return;

    // 콜백 쪽 정지 신호
    m_shuttingDown = true;

    // 1) 스트림 정지
    //if (m_grabbing) {
    //    MV_CC_StopGrabbing(m_handle);
    //    m_grabbing = false;
    //}

    // 스트림 정지
    Stop();

    // 2) 콜백 해제(Ex2는 nullptr 재등록 관례)
    MV_CC_RegisterImageCallBackEx2(m_handle, nullptr, nullptr, true);

    // 3) 내부 버퍼 정리
    MV_CC_ClearImageBuffer(m_handle);

    // 4) 디바이스/핸들 닫기
    MV_CC_CloseDevice(m_handle);
    MV_CC_DestroyHandle(m_handle);
    m_handle = nullptr;

    // 5) 버퍼 완전 정리
    m_queue.clear();
    m_convBuf.clear();
    m_hNotify = nullptr;
    ZeroMemory(&m_devInfo, sizeof(m_devInfo));

    m_opened = false;
}

bool CHikCamWrapper::Start()
{
    if (!m_opened || m_grabbing) return false;
    m_shuttingDown = false;
    int Ret = MV_CC_StartGrabbing(m_handle);
    if (MV_OK != Ret ) return false;
    m_grabbing = true;
    return true;
}

void CHikCamWrapper::Stop()
{
    if (!m_grabbing) return;
    m_shuttingDown = true; // 콜백 내 처리 차단용
    MV_CC_StopGrabbing(m_handle);
    MV_CC_ClearImageBuffer(m_handle);
    m_grabbing = false;
    m_queue.clear();            // 프레임 버퍼 즉시 해제
}

/** ********************************************
 * 정보/헬퍼
 * ********************************************/

std::wstring CHikCamWrapper::GetDeviceInfoString() const
{
    std::wstringstream ss;
    if (m_devInfo.nTLayerType == MV_GIGE_DEVICE || 
        m_devInfo.nTLayerType == MV_GENTL_GIGE_DEVICE || 
        m_devInfo.nTLayerType == MV_VIR_GIGE_DEVICE) {
        const auto& g = m_devInfo.SpecialInfo.stGigEInfo;
        int ip1 = (g.nCurrentIp >> 24) & 0xFF, ip2 = (g.nCurrentIp >> 16) & 0xFF;
        int ip3 = (g.nCurrentIp >> 8) & 0xFF, ip4 = (g.nCurrentIp) & 0xFF;
        ss << L"[GigE]\nIP: " << ip1 << L'.' << ip2 << L'.' << ip3 << L'.' << ip4
            << L"\nModel: " << AnsiToWide((const char*)g.chModelName)
            << L"\nName: " << AnsiToWide((const char*)g.chUserDefinedName)
            << L"\nSN: " << AnsiToWide((const char*)g.chSerialNumber);
    }
    else if (m_devInfo.nTLayerType == MV_USB_DEVICE || 
             m_devInfo.nTLayerType == MV_VIR_USB_DEVICE) {
        const auto& u = m_devInfo.SpecialInfo.stUsb3VInfo;
        ss << L"[USB3]\nModel: " << AnsiToWide((const char*)u.chModelName)
            << L"\nName: " << AnsiToWide((const char*)u.chUserDefinedName)
            << L"\nSN: " << AnsiToWide((const char*)u.chSerialNumber);
    }
    return ss.str();
}

/** ********************************************
 * 노출/게인 설정/조회 (Range 통합)
 * ********************************************/


bool CHikCamWrapper::TrySetEnumString(const char* node, const char* value) const
{
    if (!m_handle) return false;
    // 존재하지 않는 노드면 실패 (무시)
    return MV_OK == MV_CC_SetEnumValueByString(m_handle, node, value);
}

bool CHikCamWrapper::SetExposure(double value, bool autoOff)
{
    if (!m_handle) return false;

    // Auto Off 시도 (노드가 없으면 무시)
    if (autoOff) {
        TrySetEnumString("ExposureAuto", "Off");          // SFNC
        TrySetEnumString("ExposureMode", "Timed");        // 필요한 경우
    }

    // 표준: ExposureTime (us)
    if (MV_OK == MV_CC_SetFloatValue(m_handle, "ExposureTime", static_cast<float>(value)))
        return true;

    // 호환: ExposureTimeAbs
    if (MV_OK == MV_CC_SetFloatValue(m_handle, "ExposureTimeAbs", static_cast<float>(value)))
        return true;

    return false;
}

bool CHikCamWrapper::SetGain(double value, bool autoOff)
{
    if (!m_handle) return false;

    if (autoOff) {
        TrySetEnumString("GainAuto", "Off");  // 없으면 무시
    }

    // 1) 표준 SFNC: Gain (float)
    if (MV_OK == MV_CC_SetFloatValue(m_handle, "Gain", static_cast<float>(value)))
        return true;

    // 2) 제조사 확장: AnalogGain (float)
    if (MV_OK == MV_CC_SetFloatValue(m_handle, "AnalogGain", static_cast<float>(value)))
        return true;

    // 3) Raw 정수 노드
    MVCC_INTVALUE_EX iv{};
    if (MV_OK == MV_CC_GetIntValueEx(m_handle, "GainRaw", &iv)) {
        long long raw = std::llround(std::clamp(value, (double)iv.nMin, (double)iv.nMax));
        if (MV_OK == MV_CC_SetIntValueEx(m_handle, "GainRaw", raw))
            return true;
    }
    return false;
}

double CHikCamWrapper::GetExposureDouble() const
{
    MVCC_FLOATVALUE val{};
    if (MV_OK == MV_CC_GetFloatValue(m_handle, "ExposureTime", &val))
        return val.fCurValue;
    if (MV_OK == MV_CC_GetFloatValue(m_handle, "ExposureTimeAbs", &val))
        return val.fCurValue;
    return 0.0;
}

double CHikCamWrapper::GetGainDouble() const
{
    MVCC_FLOATVALUE fv{};
    if (MV_OK == MV_CC_GetFloatValue(m_handle, "Gain", &fv))
        return fv.fCurValue;
    if (MV_OK == MV_CC_GetFloatValue(m_handle, "AnalogGain", &fv))
        return fv.fCurValue;

    MVCC_INTVALUE_EX iv{};
    if (MV_OK == MV_CC_GetIntValueEx(m_handle, "GainRaw", &iv))
        return static_cast<double>(iv.nCurValue);

    return 0.0;
}

bool CHikCamWrapper::GetExposureRange(Range& out)
{
    if (!m_handle) return false;
    MVCC_FLOATVALUE val{};
    if (MV_OK == MV_CC_GetFloatValue(m_handle, "ExposureTime", &val) ||
        MV_OK == MV_CC_GetFloatValue(m_handle, "ExposureTimeAbs", &val)) {
        out.min = val.fMin;
        out.max = val.fMax;
        out.cur = val.fCurValue;
        out.inc = 0.0; // SDK에서 float 증분 미제공인 경우가 많음
        return true;
    }
    return false;
}

bool CHikCamWrapper::GetGainRange(Range& out)
{
    if (!m_handle) return false;

    MVCC_FLOATVALUE fv{};
    if (MV_OK == MV_CC_GetFloatValue(m_handle, "Gain", &fv) ||
        MV_OK == MV_CC_GetFloatValue(m_handle, "AnalogGain", &fv)) {
        out.min = fv.fMin;
        out.max = fv.fMax;
        out.cur = fv.fCurValue;
        out.inc = 0.0;
        return true;
    }

    MVCC_INTVALUE_EX iv{};
    if (MV_OK == MV_CC_GetIntValueEx(m_handle, "GainRaw", &iv)) {
        out.min = static_cast<double>(iv.nMin);
        out.max = static_cast<double>(iv.nMax);
        out.cur = static_cast<double>(iv.nCurValue);
        out.inc = static_cast<double>(iv.nInc);
        return true;
    }
    return false;
}

/** ********************************************
 * 단발 그랩
 * ********************************************/

bool CHikCamWrapper::GrabOne(cv::Mat& outBgr, int timeoutMs)
{
    if (!m_opened) return false;

    MV_FRAME_OUT f{};
    auto ret = MV_CC_GetImageBuffer(m_handle, &f, timeoutMs);
    if (ret != MV_OK) return false;

    bool ok = ConvertToBGR(static_cast<unsigned char*>(f.pBufAddr), f.stFrameInfo, outBgr);
    MV_CC_FreeImageBuffer(m_handle, &f);
    return ok;
}

/** ********************************************
 * 프레임 콜백/큐/통지
 * ********************************************/

void CHikCamWrapper::SetNotifyHwnd(HWND hwnd)
{
    m_hNotify = hwnd;
}

bool CHikCamWrapper::PopLatest(cv::Mat& outBgr)
{
    return m_queue.pop_latest(outBgr);
}

void __stdcall CHikCamWrapper::OnImageCallbackEx2(MV_FRAME_OUT* pstFrame, void* pUser, bool /*bAutoFree*/)
{
    auto* self = reinterpret_cast<CHikCamWrapper*>(pUser);
    if (!self || self->m_shuttingDown.load()) return;
    if (!pstFrame || !pstFrame->pBufAddr) return;
    self->OnFrameArrived(*pstFrame);
}

void CHikCamWrapper::OnFrameArrived(const MV_FRAME_OUT& f)
{
    cv::Mat bgr;
    if (!ConvertToBGR(static_cast<unsigned char*>(f.pBufAddr), f.stFrameInfo, bgr))
        return;

    // 이미지 변환 직후 zero-hop 통지. PopLatest() 사용하지 않고 실시간 전달 용
    if (m_onBgr)
    {
        const auto& info = f.stFrameInfo;
        const uint64_t devTs = (static_cast<uint64_t>(info.nDevTimeStampHigh) << 32)
            | static_cast<uint64_t>(info.nDevTimeStampLow);
        m_onBgr(bgr.data, bgr.cols, bgr.rows, static_cast<int>(bgr.step),
            devTs, m_devTickHz);
    }

    // 최신만 유지 (move push)
    m_queue.push(std::move(bgr));

    // ------------------ FPS 계산 ------------------
    double fpsNow = 0.0;

    // 1) Device TS 기반 시도
    const auto& info = f.stFrameInfo;
    uint64_t devTs = (static_cast<uint64_t>(info.nDevTimeStampHigh) << 32)
        | (static_cast<uint64_t>(info.nDevTimeStampLow) & 0xFFFFFFFFull);

    if (m_devTickHz > 0 && devTs != 0) {
        if (m_lastDevTs != 0 && devTs > m_lastDevTs) {
            const double dt = static_cast<double>(devTs - m_lastDevTs) / static_cast<double>(m_devTickHz);
            if (dt > 0.0) {
                const double inst = 1.0 / dt;
                double prev = m_fps.load(std::memory_order_relaxed);
                m_fps.store(prev <= 0.0 ? inst : prev * 0.9 + inst * 0.1, std::memory_order_relaxed);
            }
        }
        m_lastDevTs = devTs;
    }
    else {
        // 2) Host steady_clock fallback
        using clock = std::chrono::steady_clock;
        auto now = clock::now();
        if (m_lastTp.time_since_epoch().count() != 0) {
            const double dt = std::chrono::duration<double>(now - m_lastTp).count();
            if (dt > 0.0) {
                const double inst = 1.0 / dt;
                double prev = m_fps.load(std::memory_order_relaxed);
                m_fps.store(prev <= 0.0 ? inst : prev * 0.9 + inst * 0.1, std::memory_order_relaxed);
            }
        }
        m_lastTp = now;
    }

    fpsNow = m_fps.load(std::memory_order_relaxed);
    // ------------------------------------------------

    // 옵저버 통지 (FPS 전달)
    if (m_cb) m_cb(fpsNow);

    // HWND 통지(옵션)
    if (m_hNotify) ::PostMessage(m_hNotify, WM_HIK_NEWFRAME, 0, 0);
}

/** ********************************************
 * 픽셀 변환 (to BGR)
 * ********************************************/

bool CHikCamWrapper::ConvertToBGR(const unsigned char* pIn,
    const MV_FRAME_OUT_INFO_EX& info,
    cv::Mat& outBgr)
{
    if (!pIn || info.nWidth == 0 || info.nHeight == 0) return false;

    // 빠른 경로: Mono8 → BGR
    if (info.enPixelType == PixelType_Gvsp_Mono8) {
        cv::Mat mono(info.nHeight, info.nWidth, CV_8UC1, const_cast<unsigned char*>(pIn));
        cv::cvtColor(mono, outBgr, cv::COLOR_GRAY2BGR);
        return true;
    }

    // 빠른 경로: RGB8_Packed → BGR
    if (info.enPixelType == PixelType_Gvsp_RGB8_Packed) {
        outBgr.create(info.nHeight, info.nWidth, CV_8UC3);
        const int w3 = info.nWidth * 3;
        for (int y = 0; y < (int)info.nHeight; ++y) {
            const unsigned char* src = pIn + y * w3;
            unsigned char* dst = outBgr.ptr(y);
            for (int x = 0; x < (int)info.nWidth; ++x) {
                dst[x * 3 + 0] = src[x * 3 + 2];
                dst[x * 3 + 1] = src[x * 3 + 1];
                dst[x * 3 + 2] = src[x * 3 + 0];
            }
        }
        return true;
    }

    // 일반 경로: SDK 변환 사용 → BGR8_Packed
    MV_CC_PIXEL_CONVERT_PARAM_EX conv{};
    conv.nWidth = info.nWidth;
    conv.nHeight = info.nHeight;
    conv.pSrcData = const_cast<unsigned char*>(pIn);
    conv.nSrcDataLen = info.nFrameLen;
    conv.enSrcPixelType = info.enPixelType;
    conv.enDstPixelType = PixelType_Gvsp_BGR8_Packed;

    outBgr.create(info.nHeight, info.nWidth, CV_8UC3);
    conv.pDstBuffer = outBgr.data;
    conv.nDstBufferSize = static_cast<unsigned>(outBgr.total() * outBgr.elemSize());

    if (MV_OK != MV_CC_ConvertPixelTypeEx(m_handle, &conv)) {
        outBgr.release();
        return false;
    }
    return true;
}