/// @file GCodeService.cpp
#include "pch.h"
#include "GCodeService.h"

GCodeService &GCodeService::Instance() {
  static GCodeService inst;
  return inst;
}

bool GCodeService::WriteJob(const GCodeJob &job,
                            std::function<void(int)> progressCallback) {
  std::lock_guard<std::mutex> lock(m_mtx);



  // 모션 컨트롤러 버퍼에 G-Code 업로드
  const bool ok = g_GCode.UploadGCode(job.jobId, job.lines, progressCallback);
  if (!ok) {
    m_state = GCodeState::Error;
    return false;
  }

  m_lastJobId = job.jobId;
  m_state = GCodeState::Idle;
  m_lastCompletedLine = 0;
  return true;
}

bool GCodeService::RunJob(const std::string &jobId, int mode, int ttlTime) {
  std::lock_guard<std::mutex> lock(m_mtx);

  // 단일 Job 기준: jobId 불일치 시 에러 처리 (필요 시 확장)
  if (!m_lastJobId.empty() && jobId != m_lastJobId) {
    return false;
  }

  // mode: 1=Start, 2=Stop, 3=Pause, 4=Resume
  const bool ok = g_GCode.CommandGCodeRun(mode, ttlTime);
  if (!ok) {
    m_state = GCodeState::Error;
    return false;
  }

  switch (mode) {
  case 1:                     // Start
    m_waitForGlnReset = true; // Wait for GLN to drop before trusting it
    m_state = GCodeState::Running;
    break;
  case 4: // Resume
    m_state = GCodeState::Running;
    break;
  case 2: // Stop
    m_state = GCodeState::Idle;
    break;
  case 3: // Pause
    m_state = GCodeState::Paused;
    break;
  default:
    break;
  }

  return true;
}

bool GCodeService::GetStatus(const std::string &jobId, GCodeState &outState,
                             int &outCurrentLine, int &outTotalLines) {
  std::lock_guard<std::mutex> lock(m_mtx);

  if (!m_lastJobId.empty() && jobId != m_lastJobId) {
    return false;
  }

  int gln = 0;
  if (!g_GCode.QueryGCodeLine(gln)) {
    m_state = GCodeState::Error;
    return false;
  }

  if (m_state == GCodeState::Idle || m_state == GCodeState::Error) {
    outCurrentLine = 0;
  } else {
    outCurrentLine = gln;
  }

  // Check completion condition
  // Assuming GLN increments until the last line.
  // m_MaxGcodeLine is the total count + 1 (because of 1-based index and
  // post-increment) If gln reaches the last line index, we can consider it
  // completed. However, safest is to assume completed if state IS Running AND
  // gln is high enough. Or if gln resets to 0? (Implementation dependent)

  // For now, let's assume if gln >= g_GCode.m_MaxGcodeLine - 1, it's done.

  int totalLines = g_GCode.m_MaxGcodeLine - 1;
  outTotalLines = totalLines;

  if (m_state == GCodeState::Running) {
    if (m_waitForGlnReset) {
      // Wait until PMAC actually resets GLN from the previous run
      if (gln < totalLines) {
        m_waitForGlnReset = false;
      }
    } else {
      if (totalLines > 0 && gln >= totalLines) {
        m_state = GCodeState::Completed;
        g_GCode.SetLaserSelector(1); // GCode Finish -> Selector = 1
      }
    }
  }

  outState = m_state;

  return true;
}
