#include "pch.h"
#include "AppBootstrap.h"

#include <objbase.h>
#include <Windows.h>
#include <memory>
#include <stdexcept>

// 키 차단
#include "DevtoolsKeyBlocker.h"

// VisionBridge + MJPEG Feeder
#include "Modules/Vision/VisionBridge/VisionBridge.h"
#include "Modules/Vision/VisionBridge/MjpegFeederFromVision.h"

// CEF 스킴 라우터
#include "Native/ui/cef/AppSchemeFactory.h"

namespace
{
    /**
     * @brief COM 초기화/해제 RAII
     * @details
     *  - 디자인 패턴: RAII
     *  - 프로세스 라이프타임으로 유지하기 위해 정적 객체로 사용
     *  - 이미 다른 쓰레딩 모델로 초기화된 경우(RPC_E_CHANGED_MODE)는
     *    "이미 초기화됨"으로 간주하고 성공 처리한다.
     */
    class CoInitRAII
    {
    public:
        CoInitRAII()
        {
            const HRESULT hr = ::CoInitializeEx(nullptr, COINIT_MULTITHREADED);

            if (hr == RPC_E_CHANGED_MODE)
            {
                // 이미 다른 모드로 COM 이 초기화된 상태.
                // WIC/JPEG, 카메라 드라이버는 "COM 활성" 상태면 동작하므로 OK 처리.
                ok_ = true;
                ::OutputDebugStringW(
                    L"[AppBootstrap] CoInitializeEx: RPC_E_CHANGED_MODE "
                    L"(COM already initialized, treated as success).\n");
            }
            else if (SUCCEEDED(hr))
            {
                ok_ = true;
                ::OutputDebugStringW(
                    L"[AppBootstrap] CoInitializeEx Succeeded.\n");
            }
            else
            {
                ok_ = false;
                ::OutputDebugStringW(
                    L"[AppBootstrap] CoInitializeEx failed.\n");
            }
        }

        ~CoInitRAII()
        {
            // RPC_E_CHANGED_MODE 인 경우에는 CoUninitialize 를 호출하면 안 되므로
            // 성공(S_OK/S_FALSE)으로 초기화된 케이스에서만 호출되도록 ok_ 플래그 사용.
            if (ok_)
                ::CoUninitialize();
        }

        /// @brief COM 초기화가 유효한지 여부
        bool ok() const noexcept { return ok_; }

    private:
        bool ok_ = false;
    };

    /**
     * @brief COM 초기화 보장
     * @details
     *  - 정적 CoInitRAII 객체를 통해 한 번만 CoInitializeEx 를 호출
     *  - CEF 가 이미 COM 을 초기화한 경우에도 RPC_E_CHANGED_MODE 를 성공으로 간주
     */
    bool EnsureComInitialized()
    {
        static CoInitRAII s_com; // 최초 1회 생성
        return s_com.ok();
    }

    /// @brief Vision → LatestFrameStore Feeder 전역 인스턴스
    static std::unique_ptr<MjpegFeederFromVision> g_mjpegFeeder;

    /**
     * @brief VisionBridge 초기화
     * @param dllPath VisionModule.dll 경로 (정적 링크 구조에서도 시그니처 호환용)
     * @param camIndex 기본 카메라 인덱스 (현재는 자동 오픈이므로 의미는 작음)
     * @return 성공 여부
     * @details
     *  - 디자인 패턴: Facade(VisionBridge)
     *  - 내부적으로 VisionBridge::Initialize(dllPath, camIndex)를 호출한다.
     */
    bool InitVisionBridge(const std::wstring& dllPath, int camIndex)
    {
        auto& bridge = VisionBridge::Instance();
        if (!bridge.Initialize(dllPath, camIndex))
        {
            ::OutputDebugStringW(
                L"[AppBootstrap] InitVisionBridge: VisionBridge::Initialize failed.\n");
            return false;
        }

        ::OutputDebugStringW(L"[AppBootstrap] VisionBridge initialized.\n");
        return true;
    }

    /**
     * @brief CEF app:// 스킴 등록
     * @details
     *  - 디자인 패턴: Facade(app 네임스페이스에 위임)
     */
    void RegisterScheme()
    {
        app::RegisterAppSchemeHandler();
        ::OutputDebugStringW(L"[AppBootstrap] app:// scheme registered.\n");
    }

    /**
     * @brief CEF app:// 스킴 해제
     */
    void UnregisterScheme()
    {
        app::UnregisterAppSchemeHandler();
        ::OutputDebugStringW(L"[AppBootstrap] app:// scheme unregistered.\n");
    }

    /**
     * @brief MJPEG Feeder 시작
     * @details
     *  - 디자인 패턴: Facade(MjpegFeederFromVision), Producer-Consumer
     *  - VisionBridge가 먼저 Initialize 된 이후에 호출되어야 한다.
     */
    void StartMjpegFeeder()
    {
        if (!g_mjpegFeeder)
            g_mjpegFeeder = std::make_unique<MjpegFeederFromVision>();

        g_mjpegFeeder->Start();
        ::OutputDebugStringW(
            L"[AppBootstrap] MjpegFeederFromVision started.\n");
    }

    /**
     * @brief MJPEG Feeder 정지
     */
    void StopMjpegFeeder()
    {
        if (g_mjpegFeeder)
        {
            g_mjpegFeeder->Stop();
            g_mjpegFeeder.reset();
            ::OutputDebugStringW(
                L"[AppBootstrap] MjpegFeederFromVision stopped.\n");
        }
    }

} // anonymous namespace

//======================================================================
//  Public API (namespace AppBootstrap)
//======================================================================

/**
 * @brief CEF 초기화 이후 호출 : COM → VisionBridge → Scheme → MJPEG Feeder
 * @details
 *  - COM(CoInitializeEx) → VisionBridge::Initialize()
 *  - CEF app:// 스킴 등록(app::RegisterAppSchemeHandler)
 *  - MjpegFeederFromVision 을 시작해서 LatestFrameStore 를 채운다.
 */
bool AppBootstrap::InitVisionAndScheme(const std::wstring& dllPath,
    int camIndex)
{
    try
    {
        // 0) COM
        if (!EnsureComInitialized())
        {
            // JPEG/WIC, 일부 드라이버가 COM 종속 → 보수적으로 실패 처리
            ::OutputDebugStringW(
                L"[AppBootstrap] InitVisionAndScheme: COM init failed.\n");
            return false;
        }

        // 1) VisionBridge 준비 (VisionModule VM_* API 초기화)
        if (!InitVisionBridge(dllPath, camIndex))
        {
            ::OutputDebugStringW(
                L"[AppBootstrap] InitVisionAndScheme: InitVisionBridge failed.\n");
            return false;
        }

        // 2) CEF app:// 스킴 등록
        RegisterScheme();

        // 3) Vision → LatestFrameStore Feeder 시작
        StartMjpegFeeder();

        ::OutputDebugStringW(
            L"[AppBootstrap] InitVisionAndScheme OK.\n");
        return true;
    }
    catch (const std::exception& e)
    {
        ::OutputDebugStringA(
            ("[AppBootstrap] InitVisionAndScheme exception: " +
                std::string(e.what()) + "\n")
            .c_str());
        return false;
    }
    catch (...)
    {
        ::OutputDebugStringW(
            L"[AppBootstrap] InitVisionAndScheme unknown exception.\n");
        return false;
    }
}

/**
 * @brief Vision/CEF 스킴/COM 해제
 * @details
 *  - MJPEG Feeder 정지
 *  - VisionBridge::Shutdown() 으로 VM_* 핸들 정리
 *  - app::UnregisterAppSchemeHandler() 로 스킴 해제
 *  - CoUninitialize()는 CoInitRAII 소멸 시점에 자동 실행
 */
void AppBootstrap::ShutdownVision()
{
    try
    {
        // 1) MJPEG Feeder 정지 (VisionBridge 사용 중인 스레드를 먼저 멈춘다)
        StopMjpegFeeder();

        // 2) VisionBridge 종료 (VM_Handle Stop/Close/Destroy)
        VisionBridge::Instance().Shutdown();

        // 3) 스킴 해제 (idempotent)
        UnregisterScheme();

        ::OutputDebugStringW(
            L"[AppBootstrap] ShutdownVision done.\n");
    }
    catch (const std::exception& e)
    {
        ::OutputDebugStringA(
            ("[AppBootstrap] ShutdownVision exception: " +
                std::string(e.what()) + "\n")
            .c_str());
    }
    catch (...)
    {
        ::OutputDebugStringW(
            L"[AppBootstrap] ShutdownVision unknown exception.\n");
    }
}

/**
 * @brief 특수키 글로벌 차단 시작
 */
void AppBootstrap::InstallGlobalKeyBlockerSafe()
{
    try
    {
        InstallGlobalKeyBlocker();
    }
    catch (const std::exception& e)
    {
        ::OutputDebugStringA(
            ("[AppBootstrap] InstallGlobalKeyBlockerSafe: " +
                std::string(e.what()) + "\n")
            .c_str());
    }
}

/**
 * @brief 특수키 글로벌 차단 해제
 */
void AppBootstrap::UninstallGlobalKeyBlockerSafe()
{
    try
    {
        UninstallGlobalKeyBlocker();
    }
    catch (const std::exception& e)
    {
        ::OutputDebugStringA(
            ("[AppBootstrap] UninstallGlobalKeyBlockerSafe: " +
                std::string(e.what()) + "\n")
            .c_str());
    }
}
