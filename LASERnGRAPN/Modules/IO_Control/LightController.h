/**
 * @file LightController.h
 * @brief Light Control Singleton managing LCP1250H HW and Config Persistence.
 */
#pragma once

// [FIX] Windows Headers must be first for BOOL/DWORD
#include <windows.h>

#include "../../Shared/Util/Serial.h"
// [FIX] Relative path for LCP1250H from this folder
#include "LFINE/LCP1250H.h"

#include <map>
#include <memory>
#include <string>
#include <vector>

// [NEW] BitbusAssembly API
#include "../../../BitbusAssembly/BitbusAssembly/Export/API_Bitbus.h"
#pragma comment(lib, "BitbusAssembly.lib")

// Define Light Mode Enums
enum class LightMode {
  SCANNER = 0,
  OBJECT_20 = 1,
  OBJECT_50 = 2,
  UNKNOWN = -1
};

struct LightProfile {
  std::vector<int> channels; // 6 channels, 0-1023
  std::vector<bool> enabled; // 6 channels, On/Off
  LightProfile() : channels(6, 0), enabled(6, false) {}
};

class LightController {
public:
  static LightController &Instance();

  // Lifecycle
  bool Initialize(const std::string &configPath);
  void Shutdown();

  // Control
  bool SetMode(LightMode mode);
  bool SetMode(const std::string &modeStr);
  bool SetChannelValue(LightMode mode, int channel,
                       int value); // Update Config & Apply if active
  bool SetChannelEnabled(LightMode mode, int channel,
                         bool enabled);  // [NEW] Update Config & Apply
  bool SetApply(int channel, int value); // Direct HW Apply

  // Status
  bool IsOpen() const;
  bool CheckPowerStatus(); // Returns true if HW responds

  // Data Access
  LightMode GetCurrentMode() const { return m_currentMode; }
  LightProfile GetProfile(LightMode mode) const;
  std::map<std::string, std::vector<int>> GetAllProfiles() const;

  // Persistence
  bool SaveConfig();
  bool LoadConfig();

private:
  LightController();
  ~LightController();

  void ApplyProfile(const LightProfile &profile);
  void SendCommand(const std::string &cmd);

  // Members
  // Members
  std::string m_configPath;
  LightMode m_currentMode;
  std::map<LightMode, LightProfile> m_profiles;
  bool m_isConnected;

  CSerial m_serial;
  std::unique_ptr<ILCP1250HProtocol> m_protocol;

  // Connection Settings
  int m_port;
  int m_baud;

  // [NEW] Bitbus Handle for MC3
  HBITBUS m_bitbusHandle;
};
