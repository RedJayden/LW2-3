#pragma once
#include <opencv2/opencv.hpp>

/**
 * @def WM_CAM_SCALE_CHANGED
 * @brief 현재 줌 배율이 변경되었음을 부모에게 알림 (Observer 패턴)
 */
#ifndef WM_CAM_SCALE_CHANGED
#define WM_CAM_SCALE_CHANGED (WM_APP + 2101)
#endif

 /**
  * @brief Picture Control 기반 카메라 뷰어 (더블버퍼 GDI) with ROI/HUD
  * @details
  * - 기능: FPS/그리드/십자/HUD + ROI 선택/표시 + 커서 픽셀값 표시
  * - 입력: CV_8UC1(그레이) 또는 CV_8UC3(BGR) 권장
  * - 성능: OpenCV Mat 재사용(create), 스케일 상한, 더블버퍼, BGRA 32bpp DIB 출력
  * - 동기화: CCriticalSection으로 SetImage/그리기 보호
  * - 스크롤: Zoom/Fit/100% 전환 시 스크롤바와 pan 동기화
  */
class CCamView : public CStatic
{
    DECLARE_DYNAMIC(CCamView)

public:
    CCamView();
    virtual ~CCamView();

    //=== 프레임 업데이트 ===//
    /**
     * @brief 최신 이미지를 설정하고 뷰 갱신을 요청한다. (스레드 세이프)
     * @param frame CV_8UC1 또는 CV_8UC3 (연속 여부 무관)
     * @param fps   최근 프레임레이트(옵션 표시용)
     */
    void SetImage(const cv::Mat& frame, double fps);

    /**
     * @brief 화면에 표시 중인 최신 프레임을 out으로 복사
     * @param out clone 대상
     * @return 성공 여부
     */
    bool CopyCurrentImage(cv::Mat& out) const;

    //=== ROI ===//
    /**
     * @brief 현재 ROI(이미지 좌표)를 얻는다. ROI가 없으면 empty
     */
    cv::Rect GetImageROI() const;

    //=== 줌/팬 ===//
    /** @brief 커서 기준 줌인 */
    void ZoomIn(const CPoint& viewPt);
    /** @brief 커서 기준 줌아웃 (Fit 배율 이하로는 내려가지 않음) */
    void ZoomOut(const CPoint& viewPt);
    /** @brief 창에 맞춤 보기 (센터링) */
    void FitToWindow();
    /** @brief 100% 배율(1.0) */
    void Zoom100();
    /** @brief 현재 화면 중앙 기준 줌인/줌아웃 */
    void ZoomInCenter();
    void ZoomOutCenter();

    /** @brief 현재가 '확대 상태'(fit보다 큼)인지 */
    bool IsZoomedIn() const;
    /** @brief 현재 배율에서 화면에 그려질 이미지 폭/높이 */
    CSize GetDrawSize() const;
    /** @brief pan을 경계 내로 보정 */
    void ClampPanToBounds();

    //=== 오버레이 ===//
    /** @brief 그리드/십자/HUD 토글 */
    void SetOverlayOptions(bool grid, bool crosshair, bool hud);
    void SetGridEnabled(bool v) { m_showGrid = v; Invalidate(FALSE); }
    void SetCrossEnabled(bool v) { m_showCross = v; Invalidate(FALSE); }
    bool IsGridEnabled()  const { return m_showGrid; }
    bool IsCrossEnabled() const { return m_showCross; }

    //=== 편의/정보 ===//
    /** @brief 현재 스케일(배율, 1.0 == 100%) */
    double GetScale() const { return m_scale; }
    /** @brief 현재 줌 퍼센트 (예: 1.25 -> 125%) */
    int GetZoomPercent() const { return (int)std::lround(m_scale * 100.0); }
    /** @brief 현재 이미지와 클라이언트 기반 "맞춤 보기" 배율 계산 */
    double GetFitScale() const;
    /** @brief 다음 프레임이 들어오면 1회 FitToWindow() 하도록 설정 */
    void StartFitOnNextFrame(bool enable = true);
    /** @brief 평균 휘도(0~255) (HUD 대비 색상 결정에 사용) */
    double GetAvgLuma() const { return m_avgLuma; }

protected:
    DECLARE_MESSAGE_MAP()
    afx_msg void OnPaint();
    afx_msg BOOL OnEraseBkgnd(CDC* pDC);
    afx_msg void OnLButtonDown(UINT nFlags, CPoint pt);
    afx_msg void OnLButtonUp(UINT nFlags, CPoint pt);
    afx_msg void OnMouseMove(UINT nFlags, CPoint pt);
    afx_msg BOOL OnMouseWheel(UINT nFlags, short zDelta, CPoint pt);
    afx_msg void OnMButtonDown(UINT nFlags, CPoint pt);
    afx_msg void OnMButtonUp(UINT nFlags, CPoint pt);
    virtual void PreSubclassWindow() override;
    afx_msg void OnSize(UINT nType, int cx, int cy);
    afx_msg void OnHScroll(UINT nSBCode, UINT nPos, CScrollBar* pScrollBar);
    afx_msg void OnVScroll(UINT nSBCode, UINT nPos, CScrollBar* pScrollBar);

    /** @brief 배율 변경 알림(Observer) */
    void NotifyScaleChanged();

private:
    enum class RoiState { Idle, Selecting, Selected };

    //=== 이미지 & 동기화 ===//
    mutable CCriticalSection m_imgCs;
    cv::Mat m_imgOrig;          ///< 입력 원본 (8UC1 또는 8UC3)
    cv::Mat m_imgScaled;        ///< 스케일 결과 (8UC1 또는 8UC3)
    cv::Mat m_imgScaledBGRA;    ///< 32bpp BGRA (GDI 전송용, 4바이트 정렬)
    cv::Mat m_imgOrigBGRA;   ///< 원본을 BGRA로 1회 변환해 캐시 (항상 원본 크기)

    //=== 스케일 캐시 ===//
    int    m_lastScaledSrcW = -1;
    int    m_lastScaledSrcH = -1;
    double m_lastScaledScale = -1.0;

    //=== 뷰 상태 ===//
    double  m_fps = 0.0;
    double  m_scale = 1.0;          ///< 현재 배율(1.0=100%)
    CPoint  m_pan = { 0,0 };        ///< 패닝 오프셋(view px, 좌상단 기준)
    bool    m_needFitOnNextImage = true;

    //=== ROI ===//
    RoiState m_roiState = RoiState::Idle;
    CPoint   m_roiStartView{ 0,0 };
    CPoint   m_roiEndView{ 0,0 };

    //=== 오버레이 ===//
    bool   m_showGrid = true;
    bool   m_showCross = true;
    bool   m_showHUD = true;
    double m_avgLuma = 0.0;

    //=== 드래그/팬 ===//
    bool   m_dragging = false;
    CPoint m_dragStart{};
    bool   m_panning = false;
    CPoint m_panStartPt{};
    CPoint m_panStartOffset{};

    //=== HUD 픽셀 ===//
    cv::Vec3b m_lastPixelBGR{ 0,0,0 };
    bool      m_lastPixelValid = false;
    CPoint    m_lastMousePt{};

    //=== 스크롤바 ===//
    CScrollBar m_hScroll;
    CScrollBar m_vScroll;
    bool m_scrollVisibleH = false;
    bool m_scrollVisibleV = false;

private:
    //=== 레이아웃/좌표 ===//
    CRect  GetDrawableClientRect() const;
    void   RelayoutScrollBars();
    void   UpdateScrollBars();
    /** @brief (드래그 중 전용) 스크롤바 범위/표시 여부는 건드리지 않고 thumb 위치만 pan에서 동기화. */
    void   UpdateScrollThumbOnly();
    void   SyncPanFromScroll();
    CPoint GetDrawOrigin(const CRect& rcClient) const;
    CPoint GetCenteredOrigin(const CRect& rcClient, double scale) const;
    double GetCurrentScale() const;

    //=== 버퍼 준비 ===//
    /**
     * @brief 스케일된 이미지(BGR/Gray)와 BGRA 변환 버퍼를 준비(필요 시에만).
     * @details Mat::create를 사용해 재할당 최소화. dst 크기/스케일이 이전과 동일하면 재계산 생략.
     */
    void EnsureScaled();

    //=== 좌표 변환 ===//
    CPoint ViewToImage(const CPoint& vpt) const;
    CPoint ImageToView(const CPoint& ipt) const;

    //=== 픽셀/HUD ===//
    bool GetPixelAtView(const CPoint& vpt, cv::Vec3b& bgr, uchar& gray, bool& isColor, CPoint& imgPt) const;

    //=== ROI/HUD/GRID ===//
    cv::Rect ViewRoiToImageRect() const;
    void     PaintToDC(CDC* pDC, const CRect& rcClient);
    void     DrawHUD(CDC* pDC, const CRect& rcClient, const CPoint& cursorView);
    void     DrawROI(CDC* pDC);
    void     DrawGridAndCross(CDC* pDC, const CRect& rcClient);
};
