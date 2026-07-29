/**
 * @file AureliaController.cpp
 * @brief Aurelia 레이저 컨트롤러 구현부
 */

#include "pch.h"
#include "AureliaController.h"
#include "../../../Shared/Util/IniFile.h"
#include <sstream>

AureliaController::AureliaController() {
    auto protocol = std::make_unique<AureliaIR50ModbusProtocol>();
    m_laser = std::make_unique<AureliaIR50>(std::move(protocol));
}

AureliaController::~AureliaController() {
    Finalize();
}

BOOL AureliaController::Initialize() {
    // 1. 요청된 절대 경로 시도
    CIniFile ini(_T("C:\\LW23\\Bin\\Config\\AureliaConfig.ini"));

    // 2. 파일이 없으면 상대 경로(..\Bin\Config) 시도
    CFileStatus status;
    if (!ini.GetStatus(status)) {
        ini.SetIniFileName(_T("..\\Bin\\Config\\AureliaConfig.ini"));
    }

    int used = ini.GetInt(_T("CONNECT"), _T("USED"), 1);
    m_used = (used == 1);

    if (!m_used) {
        return TRUE; // 사용 안함으로 설정된 경우 정상 리턴
    }

    int port = ini.GetInt(_T("CONNECT"), _T("COM"), 10);
    int baud = ini.GetInt(_T("CONNECT"), _T("BAUDRATE"), 19200);

    DWORD error = 0;
    if (m_laser->Open(port, baud, error)) {
        m_stopPolling = false;
        m_pollingThread = std::thread(&AureliaController::PollingThreadFunc, this);
        return TRUE;
    }
    return FALSE;
}

BOOL AureliaController::Initialize(int comPort) {
    DWORD error = 0;
    if (m_laser->Open(comPort, 19200, error)) {
        m_stopPolling = false;
        m_pollingThread = std::thread(&AureliaController::PollingThreadFunc, this);
        return TRUE;
    }
    return FALSE;
}

void AureliaController::Finalize() {
    m_stopPolling = true;
    if (m_pollingThread.joinable()) {
        m_pollingThread.join();
    }

    if (m_laser && m_laser->IsOpen()) {
        m_laser->Close();
    }
}

void AureliaController::TurnOn() {
    if (!m_used) return;
    if (m_laser) m_laser->SetPower(true);
}

void AureliaController::TurnOff() {
    if (!m_used) return;
    if (m_laser) m_laser->SetPower(false);
}

void AureliaController::OpenShutter() {
    if (!m_used) return;
    if (m_laser) m_laser->SetShutter(true);
}

void AureliaController::CloseShutter() {
    if (!m_used) return;
    if (m_laser) m_laser->SetShutter(false);
}

void AureliaController::SetFrequency(int khz) {
    if (!m_used) return;
    if (m_laser) m_laser->SetFrequency(khz);
}

void AureliaController::SetPower(float percent) {
    if (!m_used) return;
    if (m_laser) m_laser->SetAmpPower(percent);
}

void AureliaController::SetBurst(int count) {
    if (!m_used) return;
    if (m_laser) m_laser->SetBurst(count);
}

void AureliaController::SetPulseWidth(int fs) {
    if (!m_used) return;
    if (m_laser) m_laser->SetPulseWidth(fs);
}

void AureliaController::SetControlMode(int mode) {
    if (!m_used) return;
    if (m_laser) m_laser->SetControlMode(mode);
}

std::string AureliaController::GetStatusJson() {
    if (!m_used) {
        return "{\"connected\": false, \"used\": false}";
    }

    std::lock_guard<std::mutex> lock(m_cacheMutex);
    if (m_cachedStatusJson.empty()) {
        return "{\"connected\": false, \"used\": true}";
    }
    return m_cachedStatusJson;
}

void AureliaController::PollingThreadFunc() {
    while (!m_stopPolling) {
        if (m_laser && m_laser->IsOpen()) {
            int p_status = m_laser->GetPowerStatus();
            int op_status = m_laser->GetOperatingStatus();
            int shutter_status = m_laser->GetShutterStatus();
            float temp = m_laser->GetTemperature();
            float humi = m_laser->GetHumidity();
            WORD alarm = m_laser->GetAlarmInfo();
            int r_hour = m_laser->GetRunningHours();
            int r_min = m_laser->GetRunningMinutes();
            WORD err_code = m_laser->GetErrorCode();
            float err_data = m_laser->GetErrorData();

            int mode = m_laser->GetMode();
            int prf = m_laser->GetFrequency();
            int burst = m_laser->GetBurstCount();
            float amp = m_laser->GetAmpPower();
            int pw = m_laser->GetPulseWidth();

            std::stringstream ss;
            ss << "{"
               << "\"connected\": true,"
               << "\"used\": true,"
               << "\"power_status\": " << p_status << ","
               << "\"op_status\": " << op_status << ","
               << "\"shutter_status\": " << shutter_status << ","
               << "\"temp\": " << temp << ","
               << "\"humidity\": " << humi << ","
               << "\"alarm\": " << alarm << ","
               << "\"err_code\": " << err_code << ","
               << "\"err_data\": " << err_data << ","
               << "\"r_hour\": " << r_hour << ","
               << "\"r_min\": " << r_min << ","
               << "\"il\": " << ((alarm & 0x01) == 0 ? "true" : "false") << ","
               << "\"ch\": " << ((alarm & 0x02) == 0 ? "true" : "false") << ","
               << "\"ml\": " << ((alarm & 0x04) == 0 ? "true" : "false") << ","
               << "\"t_alarm\": " << ((alarm & 0x08) == 0 ? "true" : "false") << ","
               << "\"ol\": " << ((alarm & 0x10) == 0 ? "true" : "false") << ","
               << "\"mode\": " << mode << ","
               << "\"prf\": " << prf << ","
               << "\"burst\": " << burst << ","
               << "\"amp\": " << amp << ","
               << "\"pw\": " << pw
               << "}";

            {
                std::lock_guard<std::mutex> lock(m_cacheMutex);
                m_cachedStatusJson = ss.str();
            }
        }

        // 1초 주기로 폴링 (명령 간의 100ms 지연은 m_laser 내부 Query에서 처리됨)
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }
}
