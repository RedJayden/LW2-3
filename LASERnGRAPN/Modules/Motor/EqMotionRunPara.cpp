#include "pch.h"

#include "EqMotionRunPara.h"
#include <Windows.h>
#include <filesystem>
#include <iostream>
#include <sstream>
#include <vector>

// Helper to get double from INI
static double GetIniDouble(const char *section, const char *key, double def,
                           const char *path) {
  char buf[256];
  GetPrivateProfileStringA(section, key, "", buf, 256, path);
  if (strlen(buf) == 0)
    return def;
  return atof(buf);
}

// Helper to write double to INI
static void WriteIniDouble(const char *section, const char *key, double val,
                           const char *path) {
  char buf[256];
  sprintf_s(buf, "%.3f", val); // 3 decimal places as per example
  WritePrivateProfileStringA(section, key, buf, path);
}

// Helper to get bool (0 or 1)
static bool GetIniBool(const char *section, const char *key, bool def,
                       const char *path) {
  int val = GetPrivateProfileIntA(section, key, -1, path);
  if (val == -1)
    return def;
  return (val != 0);
}

// Helper to write bool
static void WriteIniBool(const char *section, const char *key, bool val,
                         const char *path) {
  WritePrivateProfileStringA(section, key, val ? "1" : "0", path);
}

// Helper to get int
static int GetIniInt(const char *section, const char *key, int def,
                     const char *path) {
  return GetPrivateProfileIntA(section, key, def, path);
}

// Helper to write int
static void WriteIniInt(const char *section, const char *key, int val,
                        const char *path) {
  char buf[256];
  sprintf_s(buf, "%d", val);
  WritePrivateProfileStringA(section, key, buf, path);
}

EqMotionRunPara::EqMotionRunPara() {
  // Default config path if Initialize not called
  m_configPath = "Bin\\Config\\EqMotionRunPara.ini";
}

// Helper to get executable directory
static std::string GetExeDirectory() {
    char buffer[MAX_PATH];
    GetModuleFileNameA(NULL, buffer, MAX_PATH);
    std::string::size_type pos = std::string(buffer).find_last_of("\\/");
    return std::string(buffer).substr(0, pos);
}

void EqMotionRunPara::Initialize(const std::string &configPath) {
  // Check if path is absolute
  if (configPath.find(":") != std::string::npos || configPath.front() == '\\' || configPath.front() == '/') {
      m_configPath = configPath;
  } else {
      // Relative path: Resolve against EXE directory
      m_configPath = GetExeDirectory() + "\\" + configPath;
  }

  // Double check initialization
  char buffer[MAX_PATH];
  if (GetFullPathNameA(m_configPath.c_str(), MAX_PATH, buffer, NULL)) {
    m_configPath = buffer;
  }
  
  // Debug output
  OutputDebugStringA(("EqMotionRunPara Config Path: " + m_configPath + "\n").c_str());

  Load();
}

void EqMotionRunPara::Load() {
  m_axes.clear();
  const std::vector<std::string> axisNames = {"X", "Y", "Z"};

  for (const auto &name : axisNames) {
    std::string section = "AXIS_" + name;
    MotionAxisParams axis;
    axis.name = name;

    const char *s = section.c_str();
    const char *p = m_configPath.c_str();

    axis.scale_unit = GetIniDouble(s, "ScaleUnit", 10000.0, p);
    axis.gcode_offset = GetIniDouble(s, "GcodeOffset", 0.0, p);
    axis.home_offset = GetIniDouble(s, "HomeOffset", 0.0, p);

    axis.limit_min = GetIniDouble(s, "Limit_Min", -1000.0, p);
    axis.limit_max = GetIniDouble(s, "Limit_Max", 1000.0, p);
    axis.interlock_min = GetIniDouble(s, "Interlock_Min", 0.0, p);
    axis.interlock_max = GetIniDouble(s, "Interlock_Max", 1000.0, p);
    axis.limit_used = GetIniBool(s, "Limit_Used", true, p);

    axis.default_rel_val = GetIniDouble(s, "Default_REL_Val", 10.0, p);
    axis.default_abs_val = GetIniDouble(s, "Default_ABS_Val", 10.0, p);

    // Profiles
    axis.fast.velocity = GetIniDouble(s, "Fast_Speed", 1000.0, p);
    axis.fast.accel_time = GetIniDouble(s, "Fast_Acc", 100.0, p);

    axis.mid.velocity = GetIniDouble(s, "Normal_Speed", 500.0, p);
    axis.mid.accel_time = GetIniDouble(s, "Normal_Acc", 100.0, p);

    axis.slow.velocity = GetIniDouble(s, "Slow_Speed", 100.0, p);
    axis.slow.accel_time = GetIniDouble(s, "Slow_Acc", 100.0, p);

    m_axes.push_back(axis);
  }
}

void EqMotionRunPara::Save() {
  for (const auto &axis : m_axes) {
    std::string section = "AXIS_" + axis.name;
    const char *s = section.c_str();
    const char *p = m_configPath.c_str();

    WriteIniDouble(s, "ScaleUnit", axis.scale_unit, p);
    WriteIniDouble(s, "GcodeOffset", axis.gcode_offset, p);
    WriteIniDouble(s, "HomeOffset", axis.home_offset, p);

    WriteIniDouble(s, "Limit_Min", axis.limit_min, p);
    WriteIniDouble(s, "Limit_Max", axis.limit_max, p);
    WriteIniDouble(s, "Interlock_Min", axis.interlock_min, p);
    WriteIniDouble(s, "Interlock_Max", axis.interlock_max, p);
    WriteIniBool(s, "Limit_Used", axis.limit_used, p);

    // Keep existing values or defaults for these if they are not in UI?
    // UI doesn't edit them, so we just write back what we have.
    // If they were loaded, they are preserved.
    WriteIniDouble(s, "Default_REL_Val", axis.default_rel_val, p);
    WriteIniDouble(s, "Default_ABS_Val", axis.default_abs_val, p);

    WriteIniDouble(s, "Fast_Speed", axis.fast.velocity, p);
    WriteIniDouble(s, "Fast_Acc", axis.fast.accel_time, p);

    WriteIniDouble(s, "Normal_Speed", axis.mid.velocity, p);
    WriteIniDouble(s, "Normal_Acc", axis.mid.accel_time, p);

    WriteIniDouble(s, "Slow_Speed", axis.slow.velocity, p);
    WriteIniDouble(s, "Slow_Acc", axis.slow.accel_time, p);
  }
}

MotionAxisParams *EqMotionRunPara::GetAxis(const std::string &name) {
  for (auto &axis : m_axes) {
    if (axis.name == name)
      return &axis;
  }
  return nullptr;
}
