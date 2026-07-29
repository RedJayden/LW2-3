#pragma once

#include <atomic>
#include <mutex>
#include <string>

#include <opencv2/opencv.hpp>

/**
 * @file CalibVision.h
 * @brief 카메라 스케일 캘리브레이션용 비전 연산 모듈 (Phase 1/2/3)
 * @details
 *  - 디자인 패턴: Facade, Singleton (Meyers), Strategy(도형 피팅 알고리즘 내부 분기)
 *  - 역할:
 *    - Phase 1 (Auto-Fit)     : ROI 내 단일 타겟(사각형/원) 자동 피팅 → px 치수 반환
 *    - Phase 2 (Pattern)      : 체커보드/도트그리드 전자동 검출 → mm/px 스케일·회전각 반환
 *    - Phase 3 (Stage-Move)   : 스테이지 기지 이동 + 템플릿 매칭 → 타겟 없이 스케일 산출
 *  - 프레임 소스: VisionBridge::PopLatest (camId 0=Scanner, 1=Object)
 *  - 모든 공개 메서드는 프론트엔드로 바로 전달 가능한 JSON 문자열을 반환한다.
 *  - Phase 3 는 내부 워커 스레드에서 모션(g_AxisMap)과 연동하여 진행되며,
 *    진행 상태는 StageCalibStatusJson() 폴링으로 조회한다.
 */
class CalibVision
{
public:
    /**
     * @brief 싱글톤 인스턴스 반환
     * @return CalibVision 참조
     * @details 디자인 패턴: Singleton (Meyers Singleton)
     */
    static CalibVision& Instance();

    // ------------------------------------------------------------------
    // Phase 1 : Auto-Fit
    // ------------------------------------------------------------------
    /**
     * @brief ROI 내 단일 타겟 도형을 자동 피팅한다 (Phase 1).
     * @param camId     카메라 ID (0=Scanner, 1=Object)
     * @param roiX      ROI 좌상단 X (카메라 네이티브 px)
     * @param roiY      ROI 좌상단 Y (카메라 네이티브 px)
     * @param roiW      ROI 너비 (px)
     * @param roiH      ROI 높이 (px)
     * @param shapeHint "rect" | "circle" | "auto"
     * @return JSON:
     *  {"ok":true,"shape":"rect","cx":..,"cy":..,"widthPx":..,"heightPx":..,
     *   "angleDeg":..,"rmsPx":..}
     * @details
     *  - 디자인 패턴: Strategy — 사각형은 minAreaRect, 원은 fitEllipse 로 피팅.
     *  - 전처리: GaussianBlur + Otsu 이진화(정/역 극성 모두 시도) → findContours.
     *  - widthPx/heightPx 는 이미지 X/Y 축 기준 외곽 치수이며,
     *    스케일 계산(scale = targetMm / px)에 바로 사용 가능하다.
     */
    std::string AutoFitJson(int camId, double roiX, double roiY,
                            double roiW, double roiH,
                            const std::string& shapeHint);

    // ------------------------------------------------------------------
    // Phase 2 : Pattern Detection
    // ------------------------------------------------------------------
    /**
     * @brief 표준 캘리브레이션 패턴을 전자동 검출한다 (Phase 2).
     * @param camId   카메라 ID
     * @param pattern "chessboard" | "circles"
     * @param cols    내부 코너/원 열 개수
     * @param rows    내부 코너/원 행 개수
     * @param pitchMm 코너/원 중심 간 피치 (mm)
     * @return JSON:
     *  {"ok":true,"scaleX":..,"scaleY":..,"rotationDeg":..,"rmsPx":..,"points":N}
     *  (scaleX/scaleY 단위: mm/px)
     * @details
     *  - 체커보드: cv::findChessboardCornersSB (서브픽셀 직접 반환)
     *  - 도트그리드: cv::findCirclesGrid (SimpleBlobDetector, 역극성 재시도)
     *  - 격자점 ↔ 기지 좌표 아핀 피팅(estimateAffine2D)으로
     *    Scale X/Y + 회전각 + 잔차 RMS 를 동시 산출한다.
     */
    std::string DetectPatternJson(int camId, const std::string& pattern,
                                  int cols, int rows, double pitchMm);

    // ------------------------------------------------------------------
    // Phase 3 : Stage-Move Calibration
    // ------------------------------------------------------------------
    /**
     * @brief 스테이지 이동 기반 자동 캘리브레이션을 시작한다 (Phase 3).
     * @param camId     카메라 ID
     * @param stepMm    축당 이동량 (mm). 0.02 ~ 5.0 범위로 클램프.
     * @param speedMode "slow" | "mid" (기본 slow)
     * @return JSON {"ok":true} 또는 {"ok":false,"error":".."}
     * @details
     *  - 시퀀스(워커 스레드):
     *    1. 기준 프레임에서 중앙 템플릿 캡처
     *    2. X축 +step 이동 → 템플릿 매칭으로 픽셀 변위 측정 → -step 복귀
     *    3. Y축 동일 수행
     *    4. scale = stepMm / |변위px|, X/Y 벡터로 회전각·직교도 산출
     *  - 시작/종료 시 시작 좌표를 기록하고 종료 시 MoveAbs 로 원위치를 보정한다.
     *  - 진행 상태는 StageCalibStatusJson() 으로 폴링한다.
     */
    std::string StageCalibStart(int camId, double stepMm,
                                const std::string& speedMode);

    /**
     * @brief Phase 3 진행 상태 조회 (폴링용)
     * @return JSON:
     *  {"ok":true,"running":true,"step":"moveX","progress":45,"message":"..",
     *   "result":{...} | null,"error":".." | null}
     */
    std::string StageCalibStatusJson();

    /**
     * @brief Phase 3 중단 요청. 진행 중 모션을 정지하고 원위치 복귀를 시도한다.
     * @return JSON {"ok":true}
     */
    std::string StageCalibAbort();

private:
    CalibVision() = default;
    ~CalibVision() = default;
    CalibVision(const CalibVision&) = delete;
    CalibVision& operator=(const CalibVision&) = delete;

    /**
     * @brief 최신 프레임을 그레이스케일로 획득 (타임아웃 내 재시도)
     * @param camId     카메라 ID
     * @param[out] gray 8UC1 이미지
     * @param timeoutMs 최대 대기 시간 (ms)
     * @return 성공 여부
     */
    bool GrabGray(int camId, cv::Mat& gray, int timeoutMs);

    /**
     * @brief Phase 3 워커 스레드 본체
     */
    void StageCalibWorker(int camId, double stepMm, std::string speedMode);

    /**
     * @brief Phase 3 상태 갱신 (뮤텍스 보호)
     */
    void SetStageStatus(const std::string& step, double progress,
                        const std::string& message);

    /**
     * @brief 템플릿 매칭으로 기준 대비 픽셀 변위를 측정한다 (서브픽셀 보간 포함).
     * @param camId       카메라 ID
     * @param tmpl        기준 템플릿 (8UC1)
     * @param origin      템플릿의 기준 프레임 내 좌상단 위치
     * @param[out] dispX  X 변위 (px)
     * @param[out] dispY  Y 변위 (px)
     * @param[out] score  매칭 점수 (TM_CCOEFF_NORMED, 1.0 = 완전 일치)
     * @return 성공 여부
     */
    bool MeasureDisplacement(int camId, const cv::Mat& tmpl,
                             const cv::Point& origin,
                             double& dispX, double& dispY, double& score);

private:
    // ---- Phase 3 상태 (폴링용, 뮤텍스 보호) ----
    std::mutex        m_stageMtx;        ///< 상태 보호 뮤텍스
    bool              m_stageRunning = false;  ///< 진행 중 여부
    std::atomic<bool> m_stageAbort{ false };   ///< 중단 요청 플래그
    std::string       m_stageStep;       ///< 현재 단계 식별자
    double            m_stageProgress = 0.0;   ///< 진행률 (0~100)
    std::string       m_stageMessage;    ///< 사용자 표시 메시지
    std::string       m_stageResultJson; ///< 완료 시 결과 JSON (미완료 시 빈 문자열)
    std::string       m_stageError;      ///< 실패 시 에러 메시지
};
