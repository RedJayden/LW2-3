/**
 * @file LightController.cpp
 */
#include "pch.h"
#include "LightController.h"

#include "../../Core/MachineType.h"
#include "../../Core/MachineProfile.h"
#include <fstream>
#include <iostream>
#include <sstream>
#include <windows.h>


LightController &LightController::Instance() {
  static LightController instance;
  return instance;
}

LightController::LightController()
    : m_currentMode(LightMode::SCANNER), m_port(0), m_baud(9600),
      m_isConnected(false), m_bitbusHandle(nullptr) {
  m_protocol = std::make_unique<LCP1250HAsciiProtocol>();
}

LightController::~LightController() { Shutdown(); }

bool LightController::Initialize(const std::string &configPath) {
  char buffer[MAX_PATH];
  GetCurrentDirectoryA(MAX_PATH, buffer);
  std::string currentDir(buffer);

  std::string actualConfigPath = configPath;
  if (!MachineProfile::Instance().UseLight() || MachineProfile::Instance().GetLight() == "None") {
    m_isConnected = false;
    return true;
  }

  if (MachineProfile::Instance().GetLight() == "BitBus") {
    actualConfigPath = "Config\\LightBitBusConfig.ini";
  }

  if (actualConfigPath.find(":") == std::string::npos) {
    if (currentDir.back() != '\\')
      currentDir += "\\";
    m_configPath = currentDir + actualConfigPath;
  } else {
    m_configPath = actualConfigPath;
  }

  if (!LoadConfig()) {
    m_port = 2;
    m_baud = 9600;
  }

  DWORD lastError = 0;
  if (MachineProfile::Instance().GetLight() == "BitBus") {
    m_bitbusHandle = CreateBitbus();
    if (m_bitbusHandle) {
      char portName[32];
      sprintf_s(portName, "\\\\.\\COM%d", m_port);
      HANDLE hPort = CreateFileA(portName, GENERIC_READ | GENERIC_WRITE, 0,
                                 NULL, OPEN_EXISTING, 0, NULL);

      if (hPort != INVALID_HANDLE_VALUE) {
        CloseHandle(hPort);
        OpenSerialPort(m_bitbusHandle, m_port, m_baud, 8, ONESTOPBIT, NOPARITY,
                       &lastError);
        LockOnOff(m_bitbusHandle, false);
        m_isConnected = true;
      } else {
        m_isConnected = false;
      }
    }
  } else if (MachineProfile::Instance().GetLight() == "LFINE") {
    if (!m_serial.OpenPort(m_port, m_baud, 8, ONESTOPBIT, NOPARITY,
                           lastError)) {
      // Proceed anyway
    }
    CheckPowerStatus();
  }

  ApplyProfile(m_profiles[m_currentMode]);

  return true;
}

void LightController::Shutdown() {
  int channels = MachineProfile::Instance().GetLightChannels();
  if (MachineProfile::Instance().GetLight() == "BitBus") {
    for (int i = 1; i <= channels; ++i) {
      SetApply(i, 0);
    }
    if (m_bitbusHandle) {
      CloseSerialPort(m_bitbusHandle);
      DestroyBitbus(m_bitbusHandle);
      m_bitbusHandle = nullptr;
    }
  } else if (MachineProfile::Instance().GetLight() == "LFINE") {
    for (int i = 1; i <= channels; ++i) {
      SetApply(i, 0);
    }
    m_serial.ClosePort();
  }
}

bool LightController::SetMode(LightMode mode) {
  if (mode == LightMode::UNKNOWN)
    return false;
  m_currentMode = mode;
  ApplyProfile(m_profiles[m_currentMode]);
  return true;
}

bool LightController::SetMode(const std::string &modeStr) {
  LightMode mode = LightMode::UNKNOWN;
  if (modeStr == "scanner")
    mode = LightMode::SCANNER;
  else if (modeStr == "object20" || modeStr == "object_x20")
    mode = LightMode::OBJECT_20;
  else if (modeStr == "object50" || modeStr == "object_x50")
    mode = LightMode::OBJECT_50;

  return SetMode(mode);
}

bool LightController::SetChannelValue(LightMode mode, int channel, int value) {
  if (channel < 1 || channel > 6)
    return false;

  // Update Profile
  if (m_profiles.find(mode) == m_profiles.end()) {
    m_profiles[mode] = LightProfile();
  }
  m_profiles[mode].channels[channel - 1] = value;

  // If setting active mode, apply immediately ONLY IF ENABLED
  if (mode == m_currentMode) {
    if (m_profiles[mode].enabled[channel - 1]) {
      SetApply(channel, value);
    } else {
      // If disabled, do not apply value (keep it 0/Off)
      // Or should we ensure it is off? Yes.
      // SetApply(channel, 0); // Implicitly off
    }
  }
  return true;
}

bool LightController::SetChannelEnabled(LightMode mode, int channel,
                                        bool enabled) {
  if (channel < 1 || channel > 6)
    return false;

  if (m_profiles.find(mode) == m_profiles.end()) {
    m_profiles[mode] = LightProfile();
  }
  m_profiles[mode].enabled[channel - 1] = enabled;

  if (mode == m_currentMode) {
    int value = enabled ? m_profiles[mode].channels[channel - 1] : 0;
    SetApply(channel, value);
  }
  return true;
}

bool LightController::SetApply(int channel, int value) {
  if (MachineProfile::Instance().GetLight() == "BitBus") {
    if (!m_bitbusHandle)
      return false;
    int channels = MachineProfile::Instance().GetLightChannels();
    if (channel >= 1 && channel <= channels) {
      int p1 = 0, p2 = 0, p3 = 0, p4 = 0;
      ReadPWM(m_bitbusHandle, &p1, &p2, &p3, &p4);
      if (channel == 1)
        p1 = value;
      else if (channel == 2)
        p2 = value;
      else if (channel == 3)
        p3 = value;
      else if (channel == 4)
        p4 = value;
      SetPWM(m_bitbusHandle, p1, p2, p3, p4);
    }
    return true;
  }

  if (!m_protocol)
    return false;
  std::string cmd = m_protocol->MakeBrightness(channel, value);
  SendCommand(cmd);
  return true;
}

void LightController::SendCommand(const std::string &cmd) {
  if (cmd.empty())
    return;
  m_serial.Send((const BYTE *)cmd.c_str(), (DWORD)cmd.length());
}

LightProfile LightController::GetProfile(LightMode mode) const {
  auto it = m_profiles.find(mode);
  if (it != m_profiles.end())
    return it->second;
  return LightProfile();
}

std::map<std::string, std::vector<int>>
LightController::GetAllProfiles() const {
  std::map<std::string, std::vector<int>> result;
  result["scanner"] = GetProfile(LightMode::SCANNER).channels;
  result["object20"] = GetProfile(LightMode::OBJECT_20).channels;
  result["object50"] = GetProfile(LightMode::OBJECT_50).channels;
  return result;
}

void LightController::ApplyProfile(const LightProfile &profile) {
  int channels = MachineProfile::Instance().GetLightChannels();
  for (int i = 0; i < channels; ++i) {
    int value = profile.enabled[i] ? profile.channels[i] : 0;
    SetApply(i + 1, value);
    Sleep(10); // Small delay between commands
  }
}

// [NEW] Check Power Status
bool LightController::CheckPowerStatus() {
  if (MachineProfile::Instance().GetLight() == "BitBus") {
    return m_isConnected;
  }

  if (!m_serial.IsConnected()) {
    m_isConnected = false;
    return false;
  }

  // Send Read Command (Ping) - Read Channel 1
  // Protocol: STX(0x02) + "0r" + ETX(0x03) for Channel 1
  std::string cmd =
      m_protocol->MakeReadBrightness(1); // 1-based index 1 -> 0-based 0

  BYTE resBuffer[256] = {0};

  // Timeout 250ms
  // Note: CSerial::SendAndRead signature might vary, checking usage in
  // LCP1250H.cpp LCP1250H: SendAndRead(cmd, len, buf, size, timeout)
  DWORD readSize =
      m_serial.SendAndRead(reinterpret_cast<const BYTE *>(cmd.c_str()),
                           static_cast<DWORD>(cmd.length()), resBuffer, 256,
                           250 // Timeout ms
      );

  if (readSize > 0) {
    // Received response -> Power ON
    m_isConnected = true;
  } else {
    // Timeout -> Power OFF
    m_isConnected = false;
  }
  return m_isConnected;
}

bool LightController::IsOpen() const {
  if (MachineProfile::Instance().GetLight() == "BitBus") {
    return m_bitbusHandle != nullptr && m_isConnected;
  }
  return m_serial.IsConnected() && m_isConnected;
}

// INI Helper
// Using GetPrivateProfileString / WritePrivateProfileString
bool LightController::SaveConfig() {
  // [CONNECT]
  WritePrivateProfileStringA("CONNECT", "COM", std::to_string(m_port).c_str(),
                             m_configPath.c_str());
  WritePrivateProfileStringA("CONNECT", "BAUDRATE",
                             std::to_string(m_baud).c_str(),
                             m_configPath.c_str());

  // [SCANNER]
  auto saveProfile = [&](const char *section, LightMode mode) {
    const auto &prof = m_profiles[mode];
    for (int i = 0; i < 6; ++i) {
      std::string key = "CH" + std::to_string(i + 1);
      // Convert 0-1023 -> 0-100% for UI ? No, prompt said:
      // "LightConfig.ini contents ... CH1=50 ... CH1=60 ..."
      // "UI 에서는 퍼센테이지 (0~100 %) 표시 한다."
      // "조명 채널의 값은 0 ~ 1023 까지 이다."

      // I will store as PERCENT in INI to match user example.
      // Internal logic will keep 0-1023 for precision if needed, or 0-100?
      // Better to match INI = 0-100.
      // But HW needs 0-1023.
      // So: INI(50) -> Load -> 50 -> * 10.23 -> 511 -> HW.
      // Save: 511 -> / 10.23 -> 50 -> INI.

      int pct = (int)round((prof.channels[i] / 1023.0) * 100);
      WritePrivateProfileStringA(section, key.c_str(),
                                 std::to_string(pct).c_str(),
                                 m_configPath.c_str());

      // [NEW] Save Enabled State
      std::string keyOn = "CH" + std::to_string(i + 1) + "_ON";
      WritePrivateProfileStringA(section, keyOn.c_str(),
                                 prof.enabled[i] ? "1" : "0",
                                 m_configPath.c_str());
    }
  };

  saveProfile("SCANNER", LightMode::SCANNER);
  saveProfile("OBJECT20", LightMode::OBJECT_20);
  saveProfile("OBJECT50", LightMode::OBJECT_50);

  return true;
}

bool LightController::LoadConfig() {

  // [CONNECT]
  m_port = GetPrivateProfileIntA("CONNECT", "COM", 2, m_configPath.c_str());
  m_baud =
      GetPrivateProfileIntA("CONNECT", "BAUDRATE", 9600, m_configPath.c_str());

  // Helper
  auto loadProfile = [&](const char *section, LightMode mode) {
    m_profiles[mode] = LightProfile();
    for (int i = 0; i < 6; ++i) {
      std::string key = "CH" + std::to_string(i + 1);
      int pct =
          GetPrivateProfileIntA(section, key.c_str(), 0, m_configPath.c_str());
      // Convert Percent to 0-1023
      int val = (int)round((pct / 100.0) * 1023.0);
      if (val > 1023)
        val = 1023;
      m_profiles[mode].channels[i] = val;

      // [NEW] Load Enabled State
      std::string keyOn = "CH" + std::to_string(i + 1) + "_ON";
      int on = GetPrivateProfileIntA(section, keyOn.c_str(), 0,
                                     m_configPath.c_str());
      m_profiles[mode].enabled[i] = (on == 1);
    }
  };

  loadProfile("SCANNER", LightMode::SCANNER);
  loadProfile("OBJECT20", LightMode::OBJECT_20);
  loadProfile("OBJECT50", LightMode::OBJECT_50);

  return true;
}
