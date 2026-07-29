#pragma once

#include <map>
#include <string>
#include <vector>


// Speed Profile Structure
struct MotionSpeedProfile {
  double velocity = 0.0;
  double accel_time = 0.0;
};

// Axis Configuration Structure
struct MotionAxisParams {
  std::string name;

  // Calibration & Offset
  double scale_unit = 10000.0;
  double gcode_offset = 0.0;
  double home_offset = 0.0;

  // Limits & Safety
  bool limit_used = true;
  double limit_min = 0.0;
  double limit_max = 0.0;
  double interlock_min = 0.0;
  double interlock_max = 0.0;

  // Defaults (Not currently used in UI Config but exist in INI)
  double default_rel_val = 0.0;
  double default_abs_val = 0.0;

  // Speed Profiles
  MotionSpeedProfile slow;
  MotionSpeedProfile mid; // Normal
  MotionSpeedProfile fast;
};

class EqMotionRunPara {
public:
  static EqMotionRunPara &Instance() {
    static EqMotionRunPara instance;
    return instance;
  }

  EqMotionRunPara(const EqMotionRunPara &) = delete;
  EqMotionRunPara &operator=(const EqMotionRunPara &) = delete;

  void Initialize(const std::string &configPath);
  void Load();
  void Save();

  // Accessors
  std::vector<MotionAxisParams> &GetAxes() { return m_axes; }
  MotionAxisParams *GetAxis(const std::string &name);

private:
  EqMotionRunPara();
  ~EqMotionRunPara() = default;

  std::string m_configPath;
  std::vector<MotionAxisParams> m_axes;
};
