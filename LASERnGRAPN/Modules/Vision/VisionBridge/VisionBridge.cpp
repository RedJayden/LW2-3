#include "pch.h"
#include "VisionBridge.h"
#include <fstream>
#include <sstream>
#include <shlwapi.h>
#include "include/cef_parser.h"
#include <algorithm>
#include <cctype>

static inline std::string Trim(std::string s) {
    s.erase(s.begin(), std::find_if(s.begin(), s.end(), [](unsigned char ch) {
        return !std::isspace(ch);
    }));
    s.erase(std::find_if(s.rbegin(), s.rend(), [](unsigned char ch) {
        return !std::isspace(ch);
    }).base(), s.end());
    return s;
}

#pragma comment(lib, "shlwapi.lib")

// 필요하면 여기에서만 using namespace 를 사용하는 것이 좋다.
// using namespace cv;

/**
 * @file VisionBridge.cpp
 * @brief VisionModule VM_* API 래핑 구현
 */

VisionBridge& VisionBridge::Instance()
{
    static VisionBridge inst;
    return inst;
}

VisionBridge::VisionBridge()
{
    // 핸들을 명시적으로 nullptr 로 초기화
    m_handles.fill(nullptr);
}

VisionBridge::~VisionBridge()
{
    Shutdown();
}

bool VisionBridge::Initialize(const std::wstring& dllPath, int camIndex)
{
    (void)dllPath;   // 정적 링크 구조에서는 사용하지 않지만 시그니처 호환용
    (void)camIndex;  // 현재는 camId 자동 오픈 방식을 사용

    std::lock_guard<std::mutex> lk(m_mtx);
    return EnsureInitializedLocked();
}

void VisionBridge::Shutdown()
{
    std::lock_guard<std::mutex> lk(m_mtx);

    if (!m_initialized)
        return;

    for (auto& h : m_handles)
    {
        if (h)
        {
            // Stop → Close → Destroy 순서로 정리
            VM_Stop(h);
            VM_Close(h);
            VM_Destroy(h);
            h = nullptr;
        }
    }

    m_initialized = false;
}

bool VisionBridge::EnsureInitializedLocked()
{
    if (m_initialized)
        return true;

    // CameraPara.json 로드 시도
    std::string jsonContent;
    {
        TCHAR path[MAX_PATH];
        GetModuleFileName(NULL, path, MAX_PATH);
        PathRemoveFileSpec(path);
        PathAppend(path, _T("Config\\CameraPara.json"));
        
        std::ifstream file(path);
        if (file.is_open()) {
            std::stringstream ss;
            ss << file.rdbuf();
            jsonContent = ss.str();
        }
    }

    // JSON 파싱 (CEF 빌트인 JSON 파서 사용)
    bool hasScannerUsed = true;
    bool hasObjectUsed = true;
    std::string scannerSn = "";
    std::string objectSn = "";

    if (!jsonContent.empty()) {
        auto val = CefParseJSON(jsonContent, JSON_PARSER_RFC);
        if (val.get() && val->GetType() == VTYPE_DICTIONARY) {
            auto dict = val->GetDictionary();
            if (dict->HasKey("data")) {
                auto dataDict = dict->GetDictionary("data");
                if (dataDict.get() && dataDict->HasKey("cameras")) {
                    auto camerasList = dataDict->GetList("cameras");
                    if (camerasList.get()) {
                        for (size_t i = 0; i < camerasList->GetSize(); ++i) {
                            auto camVal = camerasList->GetValue(i);
                            if (camVal.get() && camVal->GetType() == VTYPE_DICTIONARY) {
                                auto camDict = camVal->GetDictionary();
                                std::string name = camDict->GetString("name").ToString();
                                std::string deviceId = camDict->GetString("device_id").ToString();
                                bool used = true;
                                if (camDict->HasKey("used")) {
                                    used = camDict->GetBool("used");
                                }
                                if (name == "Scanner") {
                                    scannerSn = Trim(deviceId);
                                    hasScannerUsed = used;
                                } else if (name == "Object") {
                                    objectSn = Trim(deviceId);
                                    hasObjectUsed = used;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 1) 카메라 개수 파악용 임시 핸들
    VM_Handle tmp = VM_Create();
    if (!tmp)
    {
        ::OutputDebugStringW(L"[VisionBridge] VM_Create (tmp) failed.\n");
        return false;
    }

    const int camCount = VM_EnumCameras(tmp);
    VM_Destroy(tmp);

    // 2) camId 별로 Open/Start (Serial 번호 매칭 시도)
    const int logicalCamCount = 2; // Scanner(0), Object(1)
    std::array<std::string, 2> camNames = { "Scanner", "Object" };
    std::array<bool, 2> camUsed = { hasScannerUsed, hasObjectUsed };
    std::array<std::string, 2> camSerials = { scannerSn, objectSn };

    for (int camId = 0; camId < logicalCamCount; ++camId)
    {
        // 1) used 필드가 false면 초기화 단계에서 건너뜀
        if (!camUsed[camId]) {
            ::OutputDebugStringA(("[VisionBridge] Camera " + camNames[camId] + " is marked 'unused'. Skipping initialization.\n").c_str());
            continue;
        }

        std::string sn = camSerials[camId];
        
        VM_Handle h = VM_Create();
        if (!h) continue;

        bool opened = false;
        if (!sn.empty()) {
            // 시리얼 번호가 설정된 경우 반드시 시리얼 번호로만 오픈을 시도하고 인덱스 폴백 제외
            opened = VM_OpenBySerial(h, sn.c_str());
            if (!opened) {
                ::OutputDebugStringA(("[VisionBridge] OpenBySerial failed for " + camNames[camId] + " (SN: " + sn + "). Skipped.\n").c_str());
            }
        }
        else {
            // 시리얼 번호가 설정되지 않은 경우에만 인덱스 기반으로 폴백 오픈
            opened = VM_Open(h, camId);
            if (!opened) {
                ::OutputDebugStringA(("[VisionBridge] Open failed by index for " + camNames[camId] + ".\n").c_str());
            }
        }

        if (opened)
        {
            if (VM_Start(h, true)) {
                m_handles[camId] = h;
                ::OutputDebugStringA(("[VisionBridge] Camera " + camNames[camId] + " started successfully.\n").c_str());
            } else {
                ::OutputDebugStringA(("[VisionBridge] VM_Start failed for " + camNames[camId] + ".\n").c_str());
                VM_Close(h);
                VM_Destroy(h);
            }
        } else {
            VM_Destroy(h);
        }
    }

    m_initialized = true;
    return true;
}

VM_Handle VisionBridge::GetHandleLocked(int camId) const
{
    if (camId < 0 || camId >= MaxCameras)
        return nullptr;

    return m_handles[camId];
}

bool VisionBridge::PopLatest(int camId, cv::Mat& bgrOut, double& fps)
{
    std::lock_guard<std::mutex> lk(m_mtx);

    if (!EnsureInitializedLocked())
        return false;

    VM_Handle h = GetHandleLocked(camId);
    if (!h)
    {
        // [Virtual Camera Fallback]
        // 카메라가 없거나 핸들이 유효하지 않은 경우 더미 영상 생성
        bgrOut = cv::Mat::zeros(cv::Size(640, 480), CV_8UC3);

        // 배경 (Visual indicator that app is running)
        bgrOut.setTo(cv::Scalar(50, 50, 50));

        // 텍스트 표시 (Overlay로 이동함)
        // cv::putText(bgrOut, "NO CAMERA DETECTED", ...);

        // 움직이는 원 (삭제됨)
        // cv::circle(...);

        fps = 30.0;
        return true;
    }

    VMFrameView view{};
    if (!VM_PopLatest(h, &view))
        return false;

    const VMFrameDesc& desc = view.desc;

    const uint8_t* data = view.data;
    const int      width = desc.width;
    const int      height = desc.height;
    const int      stride = desc.stride;

    if (!data || width <= 0 || height <= 0 || stride <= 0)
        return false;

    // 1) 픽셀 포맷 → BGR Mat 변환
    switch (desc.pixelType)
    {
    case VMPixelFormat::BGR8:
    {
        cv::Mat tmp(height, width, CV_8UC3,
            const_cast<uint8_t*>(data), stride);
        tmp.copyTo(bgrOut);
        break;
    }
    case VMPixelFormat::MONO8:
    {
        cv::Mat gray(height, width, CV_8UC1,
            const_cast<uint8_t*>(data), stride);
        cv::cvtColor(gray, bgrOut, cv::COLOR_GRAY2BGR);
        break;
    }
    default:
        // 지원하지 않는 포맷
        return false;
    }

    // 2) FPS 조회
    double curFps = 0.0;
    if (VM_GetFps(h, &curFps))
        fps = curFps;
    else
        fps = 0.0;

    return true;
}

bool VisionBridge::SetExposure(int camId, double us)
{
    std::lock_guard<std::mutex> lk(m_mtx);

    if (!EnsureInitializedLocked())
        return false;

    VM_Handle h = GetHandleLocked(camId);
    if (!h)
        return false;

    return VM_SetExposure(h, us);
}

bool VisionBridge::SetGain(int camId, double gain)
{
    std::lock_guard<std::mutex> lk(m_mtx);

    if (!EnsureInitializedLocked())
        return false;

    VM_Handle h = GetHandleLocked(camId);
    if (!h)
        return false;

    return VM_SetGain(h, gain);
}

int VisionBridge::GetCameraCount() const
{
    std::lock_guard<std::mutex> lk(m_mtx);
    int cnt = 0;
    for (auto h : m_handles)
        if (h) ++cnt;
    return cnt;
}

bool VisionBridge::HasCamera(int camId) const
{
    std::lock_guard<std::mutex> lk(m_mtx);
    return GetHandleLocked(camId) != nullptr;
}

bool VisionBridge::IsInitialized() const
{
    std::lock_guard<std::mutex> lk(m_mtx);
    return m_initialized;
}