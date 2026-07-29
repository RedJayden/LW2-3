/// @file GCodeService.h
/// @brief G-Code 업로드 및 실행 상태 관리
/// @details
///  - 디자인 패턴: Singleton(서비스), Facade(IMotionController 캡슐화)
#pragma once
#include <atomic>
#include <functional>
#include <mutex>
#include <string>
#include <vector>

class GCode;

/**
 * @brief G-Code Job 정보
 */
struct GCodeJob {
  std::string jobId;              ///< Job ID
  std::string name;               ///< 표시용 이름
  std::vector<std::string> lines; ///< G-Code 라인
};

/**
 * @brief G-Code 실행 상태
 */
enum class GCodeState { Idle, Running, Paused, Completed, Error };

/**
 * @brief G-Code 서비스 (Singleton)
 */
class GCodeService {
public:
  /**
   * @brief 싱글톤 인스턴스 반환
   * @return GCodeService 참조
   */
  static GCodeService &Instance();

  /**
   * @brief G-Code를 모션 컨트롤러 버퍼에 업로드
   * @param job 업로드할 Job 정보
   * @param progressCallback 진행률 콜백 (0~100)
   * @return 성공 여부
   */
  bool WriteJob(const GCodeJob &job,
                std::function<void(int)> progressCallback = nullptr);

  /**
   * @brief G-Code 실행/취소/일시정지/재개 명령 수행
   * @param jobId 실행할 Job ID
   * @param mode 1:Start, 2:Stop, 3:Pause, 4:Resume
   * @param ttlTime TTL 설정시간 (us)
   * @return 성공 여부
   */
  bool RunJob(const std::string &jobId, int mode, int ttlTime = 20);

  /**
   * @brief 현재 G-Code 상태 및 GLN 조회
   * @param jobId 조회할 Job ID
   * @param outState 상태 값
   * @param outCurrentLine GLN 현재 라인 번호
   * @param outTotalLines 전체 GCode 라인 수
   * @return 성공 여부
   */
  bool GetStatus(const std::string &jobId, GCodeState &outState,
                 int &outCurrentLine, int &outTotalLines);

private:
  GCodeService() = default;
  ~GCodeService() = default;

  GCodeService(const GCodeService &) = delete;
  GCodeService &operator=(const GCodeService &) = delete;

private:
  std::mutex m_mtx;
  std::string m_lastJobId;
  GCodeState m_state{GCodeState::Idle};
  int m_lastCompletedLine{0};
  bool m_waitForGlnReset{false};
};
