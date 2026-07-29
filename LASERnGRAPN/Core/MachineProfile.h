#pragma once
/**
 * @file MachineProfile.h
 * @brief 하드웨어 사양 및 소프트웨어 기능 지원 프로필 싱글톤 관리 클래스
 * @author Antigravity
 * @date 2026-06-09
 * @details 디자인 패턴: Singleton Pattern 적용.
 *          clean code 원칙에 의거하여 작성됨.
 */

#include <Windows.h>
#include <tchar.h>
#include <Shlwapi.h>
#include <string>
#include <vector>
#include <sstream>
#include <algorithm>
#include <cctype>

class MachineProfile {
public:
    /**
     * @brief 싱글톤 인스턴스 반환
     */
    static MachineProfile& Instance() {
        static MachineProfile instance;
        return instance;
    }

    /**
     * @brief machine.ini 파일로부터 장비 설정 정보를 동적으로 로드
     */
    void Load() {
        TCHAR szPath[MAX_PATH] = { 0 };
        ::GetModuleFileName(NULL, szPath, MAX_PATH);
        ::PathRemoveFileSpec(szPath);

        TCHAR iniPath[MAX_PATH] = { 0 };
        _stprintf_s(iniPath, _T("%s\\Config\\machine.ini"), szPath);

        if (!::PathFileExists(iniPath)) {
            // MC1 Standard Fallback
            m_scanner = "SinoGalvo";
            m_motion = "PMAC";
            m_light = "LFINE";
            m_laser = "JPT";
            m_allowedModes = { "SCANNER", "OBJECT" };
            m_allowedLenses = { "X20", "X50" };
            m_lightChannels = 5;
            m_unitMultiplier = 1000.0;
            m_hasLensMotor = true;
            m_hasZeroG = false;

            m_useScanner = true;
            m_useMotion = true;
            m_useLight = true;
            m_useLaser = true;

            m_jogXDir = 1;
            m_jogYDir = 1;
            m_useCanvas = 0;
            m_useProcessDetail = 1;
            m_maxHistorySteps = 100;
            m_stageMinX = -100;
            m_stageMaxX = 100;
            m_stageMinY = -100;
            m_stageMaxY = 100;
            m_rtcVersion = 6;
            m_rtcCardNo = 1;
            m_gpuTier = "HIGH";
            return;
        }

        TCHAR buf[256] = { 0 };
        
        // [MACHINE]
        ::GetPrivateProfileString(_T("MACHINE"), _T("SCANNER"), _T("SinoGalvo"), buf, _countof(buf), iniPath);
        m_scanner = CleanValue(std::string(CT2CA(buf)));

        ::GetPrivateProfileString(_T("MACHINE"), _T("MOTION"), _T("PMAC"), buf, _countof(buf), iniPath);
        m_motion = CleanValue(std::string(CT2CA(buf)));

        ::GetPrivateProfileString(_T("MACHINE"), _T("LIGHT"), _T("LFINE"), buf, _countof(buf), iniPath);
        m_light = CleanValue(std::string(CT2CA(buf)));

        ::GetPrivateProfileString(_T("MACHINE"), _T("LASER"), _T("JPT"), buf, _countof(buf), iniPath);
        m_laser = CleanValue(std::string(CT2CA(buf)));

        // [SUPPORTED_FEATURES]
        ::GetPrivateProfileString(_T("SUPPORTED_FEATURES"), _T("ALLOWED_MODES"), _T("SCANNER,OBJECT"), buf, _countof(buf), iniPath);
        m_allowedModes = ParseCommaSeparated(std::string(CT2CA(buf)));

        ::GetPrivateProfileString(_T("SUPPORTED_FEATURES"), _T("ALLOWED_LENSES"), _T("X20,X50"), buf, _countof(buf), iniPath);
        m_allowedLenses = ParseCommaSeparated(std::string(CT2CA(buf)));

        m_lightChannels = ::GetPrivateProfileInt(_T("SUPPORTED_FEATURES"), _T("LIGHT_CHANNELS"), 5, iniPath);
        
        TCHAR multBuf[32] = { 0 };
        ::GetPrivateProfileString(_T("SUPPORTED_FEATURES"), _T("UNIT_MULTIPLIER"), _T("1000.0"), multBuf, _countof(multBuf), iniPath);
        m_unitMultiplier = _ttof(CA2T(CleanValue(std::string(CT2CA(multBuf))).c_str()));

        m_hasLensMotor = (::GetPrivateProfileInt(_T("SUPPORTED_FEATURES"), _T("HAS_LENS_MOTOR"), 1, iniPath) == 1);
        m_hasZeroG = (::GetPrivateProfileInt(_T("SUPPORTED_FEATURES"), _T("HAS_ZEROG"), 0, iniPath) == 1);

        // HW Module Usage
        m_useScanner = (::GetPrivateProfileInt(_T("MACHINE"), _T("USE_SCANNER"), 1, iniPath) == 1);
        m_useMotion = (::GetPrivateProfileInt(_T("MACHINE"), _T("USE_MOTION"), 1, iniPath) == 1);
        m_useLight = (::GetPrivateProfileInt(_T("MACHINE"), _T("USE_LIGHT"), 1, iniPath) == 1);
        m_useLaser = (::GetPrivateProfileInt(_T("MACHINE"), _T("USE_LASER"), 1, iniPath) == 1);

        // Standard machine options
        m_jogXDir = ::GetPrivateProfileInt(_T("MACHINE"), _T("JOG_X_DIR"), 1, iniPath);
        m_jogYDir = ::GetPrivateProfileInt(_T("MACHINE"), _T("JOG_Y_DIR"), 1, iniPath);
        m_useCanvas = ::GetPrivateProfileInt(_T("MACHINE"), _T("USE_CANVAS"), 0, iniPath);
        m_useProcessDetail = ::GetPrivateProfileInt(_T("MACHINE"), _T("USE_PROCESS_DETAIL"), 1, iniPath);
        m_maxHistorySteps = ::GetPrivateProfileInt(_T("MACHINE"), _T("MAX_HISTORY_STEPS"), 100, iniPath);
        m_stageMinX = ::GetPrivateProfileInt(_T("MACHINE"), _T("STAGE_MIN_X"), -100, iniPath);
        m_stageMaxX = ::GetPrivateProfileInt(_T("MACHINE"), _T("STAGE_MAX_X"), 100, iniPath);
        m_stageMinY = ::GetPrivateProfileInt(_T("MACHINE"), _T("STAGE_MIN_Y"), -100, iniPath);
        m_stageMaxY = ::GetPrivateProfileInt(_T("MACHINE"), _T("STAGE_MAX_Y"), 100, iniPath);
        m_rtcVersion = ::GetPrivateProfileInt(_T("MACHINE"), _T("RTC_VERSION"), 6, iniPath);
        m_rtcCardNo = ::GetPrivateProfileInt(_T("MACHINE"), _T("RTC_CARD_NO"), 1, iniPath);

        // [Phase 3] GPU 하드웨어 등급 (LOW: 저사양 - SwiftShader 소프트웨어 렌더링 강제,
        // HIGH: 고사양 - 기존 D3D11 하드웨어 가속 유지). 기본값 HIGH로 기존 장비 동작 보존.
        ::GetPrivateProfileString(_T("MACHINE"), _T("GPU_TIER"), _T("HIGH"), buf, _countof(buf), iniPath);
        std::string gpuTier = CleanValue(std::string(CT2CA(buf)));
        std::transform(gpuTier.begin(), gpuTier.end(), gpuTier.begin(), ::toupper);
        m_gpuTier = gpuTier;
    }

    // Getters
    const std::string& GetScanner() const { return m_scanner; }
    const std::string& GetMotion() const { return m_motion; }
    const std::string& GetLight() const { return m_light; }
    const std::string& GetLaser() const { return m_laser; }
    const std::vector<std::string>& GetAllowedModes() const { return m_allowedModes; }
    const std::vector<std::string>& GetAllowedLenses() const { return m_allowedLenses; }
    int GetLightChannels() const { return m_lightChannels; }
    double GetUnitMultiplier() const { return m_unitMultiplier; }
    bool HasLensMotor() const { return m_hasLensMotor; }
    bool HasZeroG() const { return m_hasZeroG; }

    bool UseScanner() const { return m_useScanner; }
    bool UseMotion() const { return m_useMotion; }
    bool UseLight() const { return m_useLight; }
    bool UseLaser() const { return m_useLaser; }

    int GetJogXDir() const { return m_jogXDir; }
    int GetJogYDir() const { return m_jogYDir; }
    int GetUseCanvas() const { return m_useCanvas; }
    int GetUseProcessDetail() const { return m_useProcessDetail; }
    int GetMaxHistorySteps() const { return m_maxHistorySteps; }
    int GetStageMinX() const { return m_stageMinX; }
    int GetStageMaxX() const { return m_stageMaxX; }
    int GetStageMinY() const { return m_stageMinY; }
    int GetStageMaxY() const { return m_stageMaxY; }
    int GetRtcVersion() const { return m_rtcVersion; }
    int GetRtcCardNo() const { return m_rtcCardNo; }

    /** @brief GPU 하드웨어 등급 문자열("LOW"/"HIGH") 반환 */
    const std::string& GetGpuTier() const { return m_gpuTier; }
    /** @brief GPU_TIER=LOW(저사양) 여부. LOW면 소프트웨어 렌더링으로 보수적 구동해야 함 */
    bool IsGpuTierLow() const { return m_gpuTier == "LOW"; }

    bool HasMode(const std::string& mode) const {
        return std::find(m_allowedModes.begin(), m_allowedModes.end(), mode) != m_allowedModes.end();
    }

    bool HasLens(const std::string& lens) const {
        return std::find(m_allowedLenses.begin(), m_allowedLenses.end(), lens) != m_allowedLenses.end();
    }

private:
    MachineProfile() { Load(); }
    ~MachineProfile() = default;
    MachineProfile(const MachineProfile&) = delete;
    MachineProfile& operator=(const MachineProfile&) = delete;

    std::string CleanValue(const std::string& val) {
        std::string s = val;
        size_t semi = s.find(';');
        if (semi != std::string::npos) {
            s = s.substr(0, semi);
        }
        s.erase(s.begin(), std::find_if(s.begin(), s.end(), [](unsigned char ch) { return !std::isspace(ch); }));
        s.erase(std::find_if(s.rbegin(), s.rend(), [](unsigned char ch) { return !std::isspace(ch); }).base(), s.end());
        return s;
    }

    std::vector<std::string> ParseCommaSeparated(const std::string& str) {
        std::vector<std::string> tokens;
        std::string token;
        std::istringstream tokenStream(str);
        while (std::getline(tokenStream, token, ',')) {
            token = CleanValue(token);
            if (!token.empty()) tokens.push_back(token);
        }
        return tokens;
    }

    std::string m_scanner;
    std::string m_motion;
    std::string m_light;
    std::string m_laser;
    std::vector<std::string> m_allowedModes;
    std::vector<std::string> m_allowedLenses;
    int m_lightChannels;
    double m_unitMultiplier;
    bool m_hasLensMotor;
    bool m_hasZeroG;

    bool m_useScanner;
    bool m_useMotion;
    bool m_useLight;
    bool m_useLaser;

    int m_jogXDir;
    int m_jogYDir;
    int m_useCanvas;
    int m_useProcessDetail;
    int m_maxHistorySteps;
    int m_stageMinX;
    int m_stageMaxX;
    int m_stageMinY;
    int m_stageMaxY;
    int m_rtcVersion;
    int m_rtcCardNo;
    std::string m_gpuTier;
};
