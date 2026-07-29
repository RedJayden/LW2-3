#include "pch.h"

#include "CalibVision.h"

#include <cmath>
#include <sstream>
#include <thread>
#include <vector>

#include "../VisionBridge/VisionBridge.h"
#include "Core/MachineProfile.h"
#include "Modules/Motor/EqMotionRunPara.h"

/**
 * @file CalibVision.cpp
 * @brief 카메라 스케일 캘리브레이션용 비전 연산 구현 (Phase 1/2/3)
 * @details 디자인 패턴: Facade, Singleton, Strategy (도형별 피팅 알고리즘 분기)
 */

namespace {

constexpr double kPi = 3.14159265358979323846;

/**
 * @brief JSON 문자열 값 이스케이프 (따옴표/역슬래시/제어문자)
 */
std::string JsonEscape(const std::string& s)
{
    std::string out;
    out.reserve(s.size() + 8);
    for (char c : s) {
        switch (c) {
        case '\"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
            if (static_cast<unsigned char>(c) < 0x20) { /* skip control */ }
            else out += c;
        }
    }
    return out;
}

/**
 * @brief 실패 JSON 생성 헬퍼
 */
std::string ErrJson(const std::string& msg)
{
    std::ostringstream oss;
    oss << "{\"ok\":false,\"error\":\"" << JsonEscape(msg) << "\"}";
    return oss.str();
}

/**
 * @brief 각도를 [-45, +45) 범위로 접는다 (90도 대칭 제거).
 * @details 사각형/축 벡터의 방향 모호성을 제거하여 "축 틀어짐" 만 남긴다.
 */
double FoldAngleDeg(double deg)
{
    while (deg >= 45.0)  deg -= 90.0;
    while (deg < -45.0)  deg += 90.0;
    return deg;
}

/**
 * @brief 점-선분 최단 거리
 */
double PointSegDist(const cv::Point2f& p, const cv::Point2f& a, const cv::Point2f& b)
{
    const cv::Point2f ab = b - a;
    const double len2 = ab.dot(ab);
    if (len2 < 1e-12) return cv::norm(p - a);
    double t = (p - a).dot(ab) / len2;
    t = (std::max)(0.0, (std::min)(1.0, t));
    const cv::Point2f proj = a + cv::Point2f(static_cast<float>(ab.x * t),
                                             static_cast<float>(ab.y * t));
    return cv::norm(p - proj);
}

/**
 * @brief 컨투어 → 회전 사각형 피팅 잔차 RMS (px)
 */
double RectFitRms(const std::vector<cv::Point>& contour, const cv::RotatedRect& rr)
{
    cv::Point2f pts[4];
    rr.points(pts);
    double sum = 0.0;
    for (const auto& cp : contour) {
        const cv::Point2f p(static_cast<float>(cp.x), static_cast<float>(cp.y));
        double dmin = 1e9;
        for (int i = 0; i < 4; ++i) {
            dmin = (std::min)(dmin, PointSegDist(p, pts[i], pts[(i + 1) % 4]));
        }
        sum += dmin * dmin;
    }
    return contour.empty() ? 1e9 : std::sqrt(sum / contour.size());
}

/**
 * @brief 컨투어 → 타원 피팅 잔차 RMS (px, 반경 방향 근사)
 */
double EllipseFitRms(const std::vector<cv::Point>& contour, const cv::RotatedRect& el)
{
    const double a = el.size.width * 0.5;
    const double b = el.size.height * 0.5;
    if (a < 1e-6 || b < 1e-6) return 1e9;
    const double th = el.angle * kPi / 180.0;
    const double c = std::cos(th), s = std::sin(th);
    double sum = 0.0;
    for (const auto& cp : contour) {
        // 타원 로컬 좌표로 변환 후 반경 방향 잔차 근사
        const double dx = cp.x - el.center.x;
        const double dy = cp.y - el.center.y;
        const double lx = dx * c + dy * s;
        const double ly = -dx * s + dy * c;
        const double rNorm = std::sqrt((lx * lx) / (a * a) + (ly * ly) / (b * b));
        const double rLocal = std::sqrt(lx * lx + ly * ly);
        const double resid = (rNorm > 1e-9) ? rLocal * (1.0 - 1.0 / rNorm) : 0.0;
        sum += resid * resid;
    }
    return contour.empty() ? 1e9 : std::sqrt(sum / contour.size());
}

/**
 * @brief 타원의 이미지 X/Y 축 방향 외곽 치수 (지름) 계산
 */
void EllipseAxisExtents(const cv::RotatedRect& el, double& extW, double& extH)
{
    const double a = el.size.width * 0.5;
    const double b = el.size.height * 0.5;
    const double th = el.angle * kPi / 180.0;
    const double c = std::cos(th), s = std::sin(th);
    extW = 2.0 * std::sqrt(a * a * c * c + b * b * s * s);
    extH = 2.0 * std::sqrt(a * a * s * s + b * b * c * c);
}

/**
 * @brief 회전 사각형의 폭/높이를 이미지 축에 가깝게 정렬해 반환
 * @details minAreaRect 의 width/height 는 각도에 따라 뒤바뀔 수 있으므로,
 *          각도를 [-45,45) 로 접은 뒤 폭=이미지X방향, 높이=이미지Y방향이 되도록 스왑.
 */
void NormalizeRect(const cv::RotatedRect& rr, double& w, double& h, double& angleDeg)
{
    w = rr.size.width;
    h = rr.size.height;
    angleDeg = rr.angle;
    while (angleDeg >= 45.0) { angleDeg -= 90.0; std::swap(w, h); }
    while (angleDeg < -45.0) { angleDeg += 90.0; std::swap(w, h); }
}

} // namespace

// ======================================================================
// Singleton
// ======================================================================
CalibVision& CalibVision::Instance()
{
    static CalibVision inst;
    return inst;
}

// ======================================================================
// Frame Grab
// ======================================================================
bool CalibVision::GrabGray(int camId, cv::Mat& gray, int timeoutMs)
{
    const DWORD64 start = GetTickCount64();
    cv::Mat bgr;
    double fps = 0.0;
    do {
        if (VisionBridge::Instance().PopLatest(camId, bgr, fps) && !bgr.empty()) {
            if (bgr.channels() == 3)      cv::cvtColor(bgr, gray, cv::COLOR_BGR2GRAY);
            else if (bgr.channels() == 4) cv::cvtColor(bgr, gray, cv::COLOR_BGRA2GRAY);
            else                          gray = bgr.clone();
            return true;
        }
        Sleep(30);
    } while (GetTickCount64() - start < static_cast<DWORD64>(timeoutMs));
    return false;
}

// ======================================================================
// Phase 1 : Auto-Fit
// ======================================================================
std::string CalibVision::AutoFitJson(int camId, double roiX, double roiY,
                                     double roiW, double roiH,
                                     const std::string& shapeHint)
{
    cv::Mat gray;
    if (!GrabGray(camId, gray, 1500)) {
        return ErrJson("Camera frame not available");
    }

    // ---- ROI 클램프 (+10% 마진 확장: 드래그가 다소 어긋나도 검출되도록) ----
    const double marginX = roiW * 0.10;
    const double marginY = roiH * 0.10;
    int x0 = static_cast<int>(std::floor(roiX - marginX));
    int y0 = static_cast<int>(std::floor(roiY - marginY));
    int x1 = static_cast<int>(std::ceil(roiX + roiW + marginX));
    int y1 = static_cast<int>(std::ceil(roiY + roiH + marginY));
    x0 = (std::max)(0, x0);
    y0 = (std::max)(0, y0);
    x1 = (std::min)(gray.cols, x1);
    y1 = (std::min)(gray.rows, y1);
    if (x1 - x0 < 16 || y1 - y0 < 16) {
        return ErrJson("ROI too small");
    }
    const cv::Rect roi(x0, y0, x1 - x0, y1 - y0);
    cv::Mat sub = gray(roi).clone();
    cv::GaussianBlur(sub, sub, cv::Size(5, 5), 0);

    // ---- 이진화(정/역 극성) 후 최적 컨투어 탐색 ----
    // 디자인 패턴: Strategy — 극성/도형별 후보를 모두 평가해 최소 잔차를 채택
    struct Candidate {
        std::vector<cv::Point> contour;
        double area = 0.0;
        bool touchesBorder = false;
    };

    auto collect = [&](int threshMode, std::vector<Candidate>& out) {
        cv::Mat bin;
        cv::threshold(sub, bin, 0, 255, threshMode | cv::THRESH_OTSU);
        std::vector<std::vector<cv::Point>> contours;
        cv::findContours(bin, contours, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_NONE);
        const double minArea = 0.02 * roi.width * roi.height;
        for (auto& c : contours) {
            const double a = cv::contourArea(c);
            if (a < minArea) continue;
            cv::Rect bb = cv::boundingRect(c);
            Candidate cand;
            cand.touchesBorder = (bb.x <= 1 || bb.y <= 1 ||
                                  bb.x + bb.width >= roi.width - 1 ||
                                  bb.y + bb.height >= roi.height - 1);
            cand.contour = std::move(c);
            cand.area = a;
            out.push_back(std::move(cand));
        }
    };

    std::vector<Candidate> cands;
    collect(cv::THRESH_BINARY, cands);
    collect(cv::THRESH_BINARY_INV, cands);
    if (cands.empty()) {
        return ErrJson("No target found in ROI (check focus/lighting)");
    }

    // 경계 비접촉 후보 우선, 그중 최대 면적 선택
    std::sort(cands.begin(), cands.end(), [](const Candidate& a, const Candidate& b) {
        if (a.touchesBorder != b.touchesBorder) return !a.touchesBorder;
        return a.area > b.area;
    });
    const Candidate& best = cands.front();

    // ---- 도형 피팅 (Strategy: rect / circle / auto) ----
    const bool tryRect = (shapeHint == "rect" || shapeHint == "auto");
    const bool tryCircle = (shapeHint == "circle" || shapeHint == "auto");

    double rectRms = 1e9, circRms = 1e9;
    cv::RotatedRect rectFit, circFit;

    if (tryRect) {
        rectFit = cv::minAreaRect(best.contour);
        rectRms = RectFitRms(best.contour, rectFit);
    }
    if (tryCircle && best.contour.size() >= 5) {
        circFit = cv::fitEllipse(best.contour);
        circRms = EllipseFitRms(best.contour, circFit);
    }
    if (rectRms >= 1e9 && circRms >= 1e9) {
        return ErrJson("Shape fitting failed");
    }

    const bool useRect = (shapeHint == "rect") ||
                         (shapeHint == "auto" && rectRms <= circRms);

    std::ostringstream oss;
    oss.setf(std::ios::fixed);
    oss.precision(4);
    if (useRect) {
        double w = 0, h = 0, ang = 0;
        NormalizeRect(rectFit, w, h, ang);
        oss << "{\"ok\":true,\"shape\":\"rect\""
            << ",\"cx\":" << (rectFit.center.x + roi.x)
            << ",\"cy\":" << (rectFit.center.y + roi.y)
            << ",\"widthPx\":" << w
            << ",\"heightPx\":" << h
            << ",\"angleDeg\":" << ang
            << ",\"rmsPx\":" << rectRms
            << "}";
    } else {
        double extW = 0, extH = 0;
        EllipseAxisExtents(circFit, extW, extH);
        oss << "{\"ok\":true,\"shape\":\"circle\""
            << ",\"cx\":" << (circFit.center.x + roi.x)
            << ",\"cy\":" << (circFit.center.y + roi.y)
            << ",\"widthPx\":" << extW
            << ",\"heightPx\":" << extH
            << ",\"angleDeg\":" << FoldAngleDeg(circFit.angle)
            << ",\"rmsPx\":" << circRms
            << "}";
    }
    return oss.str();
}

// ======================================================================
// Phase 2 : Pattern Detection
// ======================================================================
std::string CalibVision::DetectPatternJson(int camId, const std::string& pattern,
                                           int cols, int rows, double pitchMm)
{
    if (cols < 2 || rows < 2 || cols > 50 || rows > 50) {
        return ErrJson("Invalid grid size (2~50)");
    }
    if (pitchMm <= 0.0 || pitchMm > 50.0) {
        return ErrJson("Invalid pitch (0~50 mm)");
    }

    cv::Mat gray;
    if (!GrabGray(camId, gray, 1500)) {
        return ErrJson("Camera frame not available");
    }

    const cv::Size grid(cols, rows);
    std::vector<cv::Point2f> imgPts;
    bool found = false;

    if (pattern == "chessboard") {
        // findChessboardCornersSB: 섹터 기반, 서브픽셀 좌표 직접 반환 (OpenCV 4.5.1+)
        found = cv::findChessboardCornersSB(
            gray, grid, imgPts,
            cv::CALIB_CB_EXHAUSTIVE | cv::CALIB_CB_ACCURACY);
        if (!found) {
            cv::Mat eq;
            cv::equalizeHist(gray, eq);
            found = cv::findChessboardCornersSB(
                eq, grid, imgPts,
                cv::CALIB_CB_EXHAUSTIVE | cv::CALIB_CB_ACCURACY);
        }
    } else if (pattern == "circles") {
        // 도트(원) 그리드: blob 검출 파라미터를 넓게 잡고 정/역 극성 모두 시도
        cv::SimpleBlobDetector::Params bp;
        bp.filterByArea = true;
        bp.minArea = 20.0f;
        bp.maxArea = 100000.0f;
        bp.filterByCircularity = false;
        bp.filterByConvexity = false;
        bp.filterByInertia = false;
        cv::Ptr<cv::FeatureDetector> blob = cv::SimpleBlobDetector::create(bp);

        found = cv::findCirclesGrid(gray, grid, imgPts,
                                    cv::CALIB_CB_SYMMETRIC_GRID, blob);
        if (!found) {
            cv::Mat inv;
            cv::bitwise_not(gray, inv);
            found = cv::findCirclesGrid(inv, grid, imgPts,
                                        cv::CALIB_CB_SYMMETRIC_GRID, blob);
        }
    } else {
        return ErrJson("Unknown pattern type");
    }

    if (!found || imgPts.size() != static_cast<size_t>(cols * rows)) {
        return ErrJson("Pattern not detected (check grid size/visibility)");
    }

    // ---- 기지 격자 좌표(mm)와 아핀 피팅: mm = A * px + t ----
    std::vector<cv::Point2f> objPts;
    objPts.reserve(imgPts.size());
    for (int r = 0; r < rows; ++r) {
        for (int c = 0; c < cols; ++c) {
            objPts.emplace_back(static_cast<float>(c * pitchMm),
                                static_cast<float>(r * pitchMm));
        }
    }

    std::vector<uchar> inliers;
    cv::Mat A = cv::estimateAffine2D(imgPts, objPts, inliers,
                                     cv::RANSAC, pitchMm * 0.25);
    if (A.empty()) {
        return ErrJson("Affine fit failed");
    }

    const double a00 = A.at<double>(0, 0), a01 = A.at<double>(0, 1);
    const double a10 = A.at<double>(1, 0), a11 = A.at<double>(1, 1);
    // 이미지 X/Y 축 단위 벡터가 mm 공간에서 갖는 길이 = mm/px 스케일
    const double scaleX = std::hypot(a00, a10);
    const double scaleY = std::hypot(a01, a11);
    if (scaleX < 1e-9 || scaleY < 1e-9) {
        return ErrJson("Degenerate affine solution");
    }
    const double rotationDeg = FoldAngleDeg(std::atan2(a10, a00) * 180.0 / kPi);

    // ---- 잔차 RMS (mm → px 환산) ----
    double sum = 0.0;
    int used = 0;
    for (size_t i = 0; i < imgPts.size(); ++i) {
        if (!inliers.empty() && !inliers[i]) continue;
        const double px = imgPts[i].x, py = imgPts[i].y;
        const double mx = a00 * px + a01 * py + A.at<double>(0, 2);
        const double my = a10 * px + a11 * py + A.at<double>(1, 2);
        const double ex = mx - objPts[i].x;
        const double ey = my - objPts[i].y;
        sum += ex * ex + ey * ey;
        ++used;
    }
    const double rmsMm = used > 0 ? std::sqrt(sum / used) : 0.0;
    const double rmsPx = rmsMm / ((scaleX + scaleY) * 0.5);

    std::ostringstream oss;
    oss.setf(std::ios::fixed);
    oss.precision(8);
    oss << "{\"ok\":true"
        << ",\"scaleX\":" << scaleX
        << ",\"scaleY\":" << scaleY
        << ",\"rotationDeg\":" << rotationDeg
        << ",\"rmsPx\":" << rmsPx
        << ",\"points\":" << used
        << "}";
    return oss.str();
}

// ======================================================================
// Phase 3 : Stage-Move Calibration
// ======================================================================
bool CalibVision::MeasureDisplacement(int camId, const cv::Mat& tmpl,
                                      const cv::Point& origin,
                                      double& dispX, double& dispY, double& score)
{
    cv::Mat gray;
    if (!GrabGray(camId, gray, 1500)) return false;
    if (gray.cols < tmpl.cols || gray.rows < tmpl.rows) return false;

    cv::Mat result;
    cv::matchTemplate(gray, tmpl, result, cv::TM_CCOEFF_NORMED);

    double minV = 0, maxV = 0;
    cv::Point minL, maxL;
    cv::minMaxLoc(result, &minV, &maxV, &minL, &maxL);
    score = maxV;

    // ---- 서브픽셀 보간 (포물선 피팅) ----
    double subX = maxL.x, subY = maxL.y;
    if (maxL.x > 0 && maxL.x < result.cols - 1) {
        const double l = result.at<float>(maxL.y, maxL.x - 1);
        const double c = result.at<float>(maxL.y, maxL.x);
        const double r = result.at<float>(maxL.y, maxL.x + 1);
        const double den = l - 2.0 * c + r;
        if (std::abs(den) > 1e-12) subX += 0.5 * (l - r) / den;
    }
    if (maxL.y > 0 && maxL.y < result.rows - 1) {
        const double t = result.at<float>(maxL.y - 1, maxL.x);
        const double c = result.at<float>(maxL.y, maxL.x);
        const double b = result.at<float>(maxL.y + 1, maxL.x);
        const double den = t - 2.0 * c + b;
        if (std::abs(den) > 1e-12) subY += 0.5 * (t - b) / den;
    }

    dispX = subX - origin.x;
    dispY = subY - origin.y;
    return true;
}

void CalibVision::SetStageStatus(const std::string& step, double progress,
                                 const std::string& message)
{
    std::lock_guard<std::mutex> lock(m_stageMtx);
    m_stageStep = step;
    m_stageProgress = progress;
    m_stageMessage = message;
}

std::string CalibVision::StageCalibStart(int camId, double stepMm,
                                         const std::string& speedMode)
{
    {
        std::lock_guard<std::mutex> lock(m_stageMtx);
        if (m_stageRunning) {
            return ErrJson("Stage calibration already running");
        }
        m_stageRunning = true;
        m_stageResultJson.clear();
        m_stageError.clear();
        m_stageStep = "init";
        m_stageProgress = 0.0;
        m_stageMessage = "Initializing";
    }
    m_stageAbort = false;

    // 이동량 안전 클램프 (0.02 ~ 5.0 mm)
    stepMm = (std::max)(0.02, (std::min)(5.0, stepMm));

    std::thread(&CalibVision::StageCalibWorker, this, camId, stepMm,
                speedMode.empty() ? std::string("slow") : speedMode)
        .detach();
    return "{\"ok\":true}";
}

std::string CalibVision::StageCalibAbort()
{
    m_stageAbort = true;
    // 진행 중 축 정지 (블로킹 이동 루프 탈출 유도)
    try {
        if (g_AxisMap.count(_T("X"))) g_AxisMap[_T("X")]->Stop();
        if (g_AxisMap.count(_T("Y"))) g_AxisMap[_T("Y")]->Stop();
    } catch (...) {
    }
    return "{\"ok\":true}";
}

std::string CalibVision::StageCalibStatusJson()
{
    std::lock_guard<std::mutex> lock(m_stageMtx);
    std::ostringstream oss;
    oss.setf(std::ios::fixed);
    oss.precision(2);
    oss << "{\"ok\":true"
        << ",\"running\":" << (m_stageRunning ? "true" : "false")
        << ",\"step\":\"" << JsonEscape(m_stageStep) << "\""
        << ",\"progress\":" << m_stageProgress
        << ",\"message\":\"" << JsonEscape(m_stageMessage) << "\"";
    if (!m_stageResultJson.empty()) {
        oss << ",\"result\":" << m_stageResultJson;
    } else {
        oss << ",\"result\":null";
    }
    if (!m_stageError.empty()) {
        oss << ",\"error\":\"" << JsonEscape(m_stageError) << "\"";
    } else {
        oss << ",\"error\":null";
    }
    oss << "}";
    return oss.str();
}

void CalibVision::StageCalibWorker(int camId, double stepMm, std::string speedMode)
{
    auto finish = [this](const std::string& err, const std::string& resultJson) {
        std::lock_guard<std::mutex> lock(m_stageMtx);
        m_stageRunning = false;
        m_stageError = err;
        m_stageResultJson = resultJson;
        m_stageProgress = err.empty() ? 100.0 : m_stageProgress;
        m_stageStep = err.empty() ? "done" : "error";
        m_stageMessage = err.empty() ? "Completed" : err;
    };

    const double unit = MachineProfile::Instance().GetUnitMultiplier();
    const double stepDev = stepMm * unit;

    // ---- 축 유효성 / 상태 점검 ----
    Motor* axX = g_AxisMap.count(_T("X")) ? g_AxisMap[_T("X")] : nullptr;
    Motor* axY = g_AxisMap.count(_T("Y")) ? g_AxisMap[_T("Y")] : nullptr;
    if (!axX || !axY) {
        finish("X/Y axis not available", "");
        return;
    }
    try {
        const MotorStatus sx = axX->GetStatus();
        const MotorStatus sy = axY->GetStatus();
        if (!sx.m_Servo || !sy.m_Servo) {
            finish("Servo is OFF (turn on X/Y servo first)", "");
            return;
        }
        if (sx.m_IsAlarm || sy.m_IsAlarm) {
            finish("Axis alarm active", "");
            return;
        }
    } catch (...) {
        finish("Failed to read axis status", "");
        return;
    }

    // ---- 저속 프로파일 적용 (HandleMotionMoveRel 과 동일 규칙) ----
    auto applySpeed = [&](Motor* m, const char* axisName) {
        auto* pp = EqMotionRunPara::Instance().GetAxis(axisName);
        if (!pp) return;
        double vel = pp->slow.velocity;
        double acc = pp->slow.accel_time;
        if (speedMode == "mid") {
            vel = pp->mid.velocity;
            acc = pp->mid.accel_time;
        }
        if (unit == 1.0) {
            vel /= 1000.0;
            acc /= 1000.0;
        }
        m->SetSpeed(vel, acc);
    };

    // ---- 시작 좌표 기록 (종료 시 원위치 보정용) ----
    double startX = 0.0, startY = 0.0;
    try {
        startX = axX->GetPos();
        startY = axY->GetPos();
    } catch (...) {
        finish("Failed to read start position", "");
        return;
    }

    // 스텝당 넉넉한 이동 타임아웃 (저속 대비)
    const DWORD64 kMoveWaitMs = 20000;
    const int kSettleMs = 400; // 정지 후 진동 안정화 대기

    // ---- 기준 프레임 + 중앙 템플릿 캡처 ----
    SetStageStatus("capture", 5.0, "Capturing reference template");
    cv::Mat gray0;
    if (!GrabGray(camId, gray0, 2000)) {
        finish("Camera frame not available", "");
        return;
    }
    int tw = gray0.cols / 4;
    int th = gray0.rows / 4;
    tw = (std::max)(64, (std::min)(512, tw));
    th = (std::max)(64, (std::min)(512, th));
    const cv::Point tOrigin((gray0.cols - tw) / 2, (gray0.rows - th) / 2);
    const cv::Mat tmpl = gray0(cv::Rect(tOrigin.x, tOrigin.y, tw, th)).clone();

    // 템플릿 특징량(분산) 점검 — 민무늬 시편이면 매칭 불가
    cv::Scalar mean, stddev;
    cv::meanStdDev(tmpl, mean, stddev);
    if (stddev[0] < 3.0) {
        finish("Not enough texture in view (move to a patterned area)", "");
        return;
    }

    // ---- 축별 측정 시퀀스 ----
    struct AxisResult {
        double dx = 0.0, dy = 0.0;   ///< +step 이동 시 픽셀 변위
        double score = 0.0;          ///< 매칭 점수
        double backlashPx = 0.0;     ///< 복귀 후 잔류 변위 (백래시 지표)
    };
    AxisResult resX, resY;

    auto runAxis = [&](Motor* motor, const char* name, AxisResult& out,
                       double progBase) -> bool {
        if (m_stageAbort) return false;

        std::ostringstream msg;
        msg << "Moving " << name << " +" << stepMm << " mm";
        SetStageStatus(std::string("move") + name, progBase, msg.str());

        applySpeed(motor, name);
        if (!MotorUtil::Sync::MoveRel(motor, +stepDev, kMoveWaitMs)) {
            return false;
        }
        Sleep(kSettleMs);
        if (m_stageAbort) return false;

        SetStageStatus(std::string("measure") + name, progBase + 15.0,
                       "Measuring displacement");
        if (!MeasureDisplacement(camId, tmpl, tOrigin, out.dx, out.dy, out.score)) {
            return false;
        }

        SetStageStatus(std::string("return") + name, progBase + 25.0,
                       "Returning to origin");
        applySpeed(motor, name);
        if (!MotorUtil::Sync::MoveRel(motor, -stepDev, kMoveWaitMs)) {
            return false;
        }
        Sleep(kSettleMs);

        double rx = 0.0, ry = 0.0, rs = 0.0;
        if (MeasureDisplacement(camId, tmpl, tOrigin, rx, ry, rs)) {
            out.backlashPx = std::hypot(rx, ry);
        }
        return true;
    };

    bool ok = runAxis(axX, "X", resX, 10.0);
    if (ok && !m_stageAbort) {
        ok = runAxis(axY, "Y", resY, 50.0);
    }

    // ---- 원위치 보정 (성공/실패 공통) ----
    SetStageStatus("restore", 90.0, "Restoring start position");
    try {
        applySpeed(axX, "X");
        MotorUtil::Sync::MoveAbs(axX, startX, kMoveWaitMs);
        applySpeed(axY, "Y");
        MotorUtil::Sync::MoveAbs(axY, startY, kMoveWaitMs);
    } catch (...) {
    }

    if (m_stageAbort) {
        finish("Aborted by user", "");
        return;
    }
    if (!ok) {
        finish("Move/measure sequence failed", "");
        return;
    }

    // ---- 검증 ----
    const double nX = std::hypot(resX.dx, resX.dy);
    const double nY = std::hypot(resY.dx, resY.dy);
    if (resX.score < 0.4 || resY.score < 0.4) {
        finish("Template match score too low (image changed too much)", "");
        return;
    }
    if (nX < 5.0 || nY < 5.0) {
        finish("Displacement too small (increase step size)", "");
        return;
    }

    // ---- 스케일/회전 산출 ----
    const double scaleX = stepMm / nX; // mm/px
    const double scaleY = stepMm / nY;
    const double rotX = FoldAngleDeg(std::atan2(resX.dy, resX.dx) * 180.0 / kPi);
    const double rotY = FoldAngleDeg((std::atan2(resY.dy, resY.dx) * 180.0 / kPi) - 90.0);
    const double rotationDeg = rotX;
    // 직교도: X/Y 변위 벡터 사잇각의 90도 대비 편차
    const double angBetween =
        std::abs(FoldAngleDeg((std::atan2(resY.dy, resY.dx) -
                               std::atan2(resX.dy, resX.dx)) * 180.0 / kPi - 90.0));

    std::ostringstream res;
    res.setf(std::ios::fixed);
    res.precision(8);
    res << "{\"scaleX\":" << scaleX
        << ",\"scaleY\":" << scaleY
        << ",\"rotationDeg\":" << rotationDeg
        << ",\"orthoDeg\":" << angBetween
        << ",\"stepMm\":" << stepMm
        << ",\"dispXPx\":" << nX
        << ",\"dispYPx\":" << nY
        << ",\"scoreX\":" << resX.score
        << ",\"scoreY\":" << resY.score
        << ",\"backlashXPx\":" << resX.backlashPx
        << ",\"backlashYPx\":" << resY.backlashPx
        << ",\"rotYDeg\":" << rotY
        << "}";

    finish("", res.str());
}
