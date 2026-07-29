#include "pch.h"
#include "CCamView.h"
#include <atlimage.h>
#include <algorithm>

template <typename T>
static inline T clampv(T v, T lo, T hi) {
    return (v < lo) ? lo : ((v > hi) ? hi : v);
}

IMPLEMENT_DYNAMIC(CCamView, CStatic)

CCamView::CCamView() {}
CCamView::~CCamView() {}

BEGIN_MESSAGE_MAP(CCamView, CStatic)
    ON_WM_PAINT()
    ON_WM_ERASEBKGND()
    ON_WM_LBUTTONDOWN()
    ON_WM_LBUTTONUP()
    ON_WM_MOUSEMOVE()
    ON_WM_MOUSEWHEEL()
    ON_WM_MBUTTONDOWN()
    ON_WM_MBUTTONUP()
    ON_WM_SIZE()
    ON_WM_HSCROLL()
    ON_WM_VSCROLL()
END_MESSAGE_MAP()

/** @brief GDI Object 선택/원복 RAII */
class CGdiAutoSelect {
public:
    explicit CGdiAutoSelect(CDC* dc, CGdiObject* obj) : m_dc(dc) {
        m_old = m_dc->SelectObject(obj);
    }
    ~CGdiAutoSelect() {
        if (m_dc && m_old) m_dc->SelectObject(m_old);
    }
private:
    CDC* m_dc = nullptr;
    CGdiObject* m_old = nullptr;
};

//=== 프레임 입력 ===//
void CCamView::SetImage(const cv::Mat& frame, double fps)
{
    // 유효성: 8UC1 또는 8UC3만 허용 (이외는 무시)
    if (frame.empty() || (frame.type() != CV_8UC1 && frame.type() != CV_8UC3))
        return;

    CSingleLock lock(&m_imgCs, TRUE);

    // 원본 보관 (clone)
    frame.copyTo(m_imgOrig);
    m_fps = fps;

    // 평균 휘도 (HUD 대비용)
    if (m_imgOrig.channels() == 3) {
        auto m = cv::mean(m_imgOrig);
        m_avgLuma = 0.114 * m[0] + 0.587 * m[1] + 0.299 * m[2];
        cv::cvtColor(m_imgOrig, m_imgOrigBGRA, cv::COLOR_BGR2BGRA);
    }
    else {
        m_avgLuma = cv::mean(m_imgOrig)[0];
        cv::cvtColor(m_imgOrig, m_imgOrigBGRA, cv::COLOR_GRAY2BGRA);
    }

    // 스케일 캐시 무효화
    //m_lastScaledSrcW = -1;
    //m_lastScaledSrcH = -1;
    //m_lastScaledScale = -1.0;

    // 다음 프레임에 1회 Fit
    if (m_needFitOnNextImage) {
        m_needFitOnNextImage = false;
        lock.Unlock();      // 교착 방지
        FitToWindow();      // 내부 Invalidate/스크롤/Notify 처리
        return;
    }

    lock.Unlock();
    Invalidate(FALSE);
}

bool CCamView::CopyCurrentImage(cv::Mat& out) const
{
    CSingleLock lock(const_cast<CCriticalSection*>(&m_imgCs), TRUE);
    if (m_imgOrig.empty()) return false;
    out = m_imgOrig.clone();
    return true;
}

void CCamView::SetOverlayOptions(bool grid, bool crosshair, bool hud)
{
    m_showGrid = grid;
    m_showCross = crosshair;
    m_showHUD = hud;
    Invalidate(FALSE);
}

//=== 페인팅 ===//
void CCamView::OnPaint()
{
    CPaintDC dc(this);
    const CRect rcDraw = GetDrawableClientRect();

    CDC mem; mem.CreateCompatibleDC(&dc);
    CBitmap bmp; bmp.CreateCompatibleBitmap(&dc, rcDraw.Width(), rcDraw.Height());
    CBitmap* pOld = mem.SelectObject(&bmp);

    mem.FillSolidRect(0, 0, rcDraw.Width(), rcDraw.Height(), RGB(16, 16, 16));
    PaintToDC(&mem, rcDraw);

    dc.BitBlt(rcDraw.left, rcDraw.top, rcDraw.Width(), rcDraw.Height(), &mem, 0, 0, SRCCOPY);
    mem.SelectObject(pOld);
}

BOOL CCamView::OnEraseBkgnd(CDC* /*pDC*/) { return TRUE; }

/** @brief 현재 스케일에서 이미지 좌상 origin (센터링 + pan) */
CPoint CCamView::GetDrawOrigin(const CRect& rcClient) const
{
    if (m_imgScaledBGRA.empty()) return { rcClient.left, rcClient.top };

    const int imgW = m_imgScaledBGRA.cols;
    const int imgH = m_imgScaledBGRA.rows;
    const int x = rcClient.left + (rcClient.Width() - imgW) / 2 + m_pan.x;
    const int y = rcClient.top + (rcClient.Height() - imgH) / 2 + m_pan.y;
    return { x, y };
}

CPoint CCamView::GetCenteredOrigin(const CRect& rc, double scale) const
{
    if (m_imgOrig.empty()) return { rc.left, rc.top };
    const int w = (int)std::lround(m_imgOrig.cols * scale);
    const int h = (int)std::lround(m_imgOrig.rows * scale);
    return { rc.left + (rc.Width() - w) / 2, rc.top + (rc.Height() - h) / 2 };
}

void CCamView::PaintToDC(CDC* pDC, const CRect& rcClient)
{
    CRect rc = rcClient;
    cv::Mat bgra;
    CSize imgSize;

    {   // 원본 확보
        CSingleLock lock(&m_imgCs, TRUE);
        if (m_imgOrig.empty() || m_imgOrigBGRA.empty()) return;
        bgra = m_imgOrigBGRA;                // shallow copy
        imgSize = CSize(m_imgOrig.cols, m_imgOrig.rows);
    }

    // 화면에 그려질 이미지 사각형(view 좌표)
    const int drawW = (int)std::lround(imgSize.cx * m_scale);
    const int drawH = (int)std::lround(imgSize.cy * m_scale);
    const CRect drawRc(rc.left + m_pan.x, rc.top + m_pan.y,
        rc.left + m_pan.x + drawW, rc.top + m_pan.y + drawH);

    // 실제 화면과의 교집합(보이는 부분)
    CRect vis;
    if (!vis.IntersectRect(&drawRc, &rc))
        return; // 화면 밖

    // === 화면(DEST) 좌표 ===
    const int destX = vis.left;
    const int destY = vis.top;
    const int destW = vis.Width();
    const int destH = vis.Height();

    // === 원본(SRC) 좌표 ===
    // drawRc.left에 해당하는 원본 x는 0, drawRc.top에 해당하는 원본 y는 0
    // vis 기준으로 역매핑
    const double invS = (m_scale > 1e-12) ? (1.0 / m_scale) : 1.0;

    const int srcX = (int)std::floor((vis.left - drawRc.left) * invS);
    const int srcY = (int)std::floor((vis.top - drawRc.top) * invS);
    const int srcW = (int)std::ceil(vis.Width() * invS);
    const int srcH = (int)std::ceil(vis.Height() * invS);

    // 원본 경계로 클립
    const int srcXc = clampv<int>(srcX, 0, imgSize.cx);
    const int srcYc = clampv<int>(srcY, 0, imgSize.cy);
    const int srcWc = clampv<int>(srcW, 0, imgSize.cx - srcXc);
    const int srcHc = clampv<int>(srcH, 0, imgSize.cy - srcYc);
    if (srcWc <= 0 || srcHc <= 0 || destW <= 0 || destH <= 0) return;

    // DIB 헤더(원본 BGRA, top-down)
    BITMAPINFO bmi = {};
    bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bmi.bmiHeader.biWidth = imgSize.cx;
    bmi.bmiHeader.biHeight = -imgSize.cy;
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 32;
    bmi.bmiHeader.biCompression = BI_RGB;

    // 품질/속도 모드
    ::SetICMMode(pDC->GetSafeHdc(), ICM_OFF);
    // 확대 시 HALFTONE, 속도 원하면 COLORONCOLOR로 변경 가능
    ::SetStretchBltMode(pDC->GetSafeHdc(), HALFTONE);
    ::SetBrushOrgEx(pDC->GetSafeHdc(), 0, 0, nullptr);

    // 핵심: 원본 BGRA에서 "보이는 부분(srcXc,srcYc,srcWc,srcHc)"만
    // 화면의 vis(destX,destY,destW,destH)로 직접 스케일 출력 (대형 임시 버퍼 無)
    ::StretchDIBits(
        pDC->GetSafeHdc(),
        destX, destY, destW, destH,          // DEST
        srcXc, srcYc, srcWc, srcHc,          // SRC (원본)
        bgra.data, &bmi, DIB_RGB_COLORS, SRCCOPY);

    // 오버레이
    if (m_showGrid || m_showCross) DrawGridAndCross(pDC, rcClient);
    DrawROI(pDC);
    if (m_showHUD) {
        CPoint cursor; ::GetCursorPos(&cursor); ScreenToClient(&cursor);
        DrawHUD(pDC, rcClient, cursor);
    }
}

void CCamView::DrawGridAndCross(CDC* pDC, const CRect& rcClient)
{
    // 실제 영상 사각형(view 좌표): pan 기준
    const CSize draw = GetDrawSize();
    const CRect drawRc(rcClient.left + m_pan.x,
        rcClient.top + m_pan.y,
        rcClient.left + m_pan.x + draw.cx,
        rcClient.top + m_pan.y + draw.cy);

    CRect inter;
    if (!inter.IntersectRect(&drawRc, &rcClient)) return;

    //=== 그리드(빨강, 이미지 50px 간격을 스케일 반영) ===//
    if (m_showGrid) {
        const int imgStep = 50;
        const int stepPx = (std::max)(1, (int)std::lround(imgStep * m_scale));

        CPen penGrid(PS_DOT, 1, RGB(255, 0, 0));
        CGdiAutoSelect selPen(pDC, &penGrid);

        // 수직선
        int x0 = drawRc.left + (((stepPx - ((drawRc.left - m_pan.x) % stepPx)) % stepPx));
        for (int x = x0; x <= drawRc.right; x += stepPx) {
            const int X = clampv<int>(x, inter.left, inter.right);
            pDC->MoveTo(X, inter.top); pDC->LineTo(X, inter.bottom);
        }
        // 수평선
        int y0 = drawRc.top + (((stepPx - ((drawRc.top - m_pan.y) % stepPx)) % stepPx));
        for (int y = y0; y <= drawRc.bottom; y += stepPx) {
            const int Y = clampv<int>(y, inter.top, inter.bottom);
            pDC->MoveTo(inter.left, Y); pDC->LineTo(inter.right, Y);
        }
    }

    //=== 십자선(주황, 영상 중심) ===//
    if (m_showCross) {
        const int cx = drawRc.left + drawRc.Width() / 2;
        const int cy = drawRc.top + drawRc.Height() / 2;

        CPen penCross(PS_SOLID, 1, RGB(255, 140, 0));
        CGdiAutoSelect selPen2(pDC, &penCross);

        const int clampedCx = clampv<int>(cx, inter.left, inter.right);
        const int clampedCy = clampv<int>(cy, inter.top, inter.bottom);

        pDC->MoveTo(clampedCx, inter.top);    pDC->LineTo(clampedCx, inter.bottom);
        pDC->MoveTo(inter.left, clampedCy);   pDC->LineTo(inter.right, clampedCy);
    }
}

void CCamView::DrawROI(CDC* pDC)
{
    if (m_roiState == RoiState::Selecting || m_roiState == RoiState::Selected) {
        CRect rc(m_roiStartView, m_roiEndView); rc.NormalizeRect();
        CPen pen(PS_SOLID, 1, RGB(0, 255, 0));
        CBrush* pNull = CBrush::FromHandle((HBRUSH)GetStockObject(NULL_BRUSH));
        CGdiAutoSelect selPen(pDC, &pen);
        CGdiAutoSelect selBrush(pDC, pNull);
        pDC->Rectangle(rc);
    }
}

void CCamView::DrawHUD(CDC* pDC, const CRect& /*rc*/, const CPoint& /*cursorView*/)
{
    CString text; text.Format(L"FPS: %.1f", m_fps);

    // 커서 픽셀
    if (m_lastPixelValid) {
        const CPoint ipt = ViewToImage(m_lastMousePt);
        text.AppendFormat(L" | X=%d Y=%d  B=%3d G=%3d R=%3d",
            ipt.x, ipt.y, m_lastPixelBGR[0], m_lastPixelBGR[1], m_lastPixelBGR[2]);
    }

    // ROI
    const auto roi = ViewRoiToImageRect();
    if (roi.area() > 0)
        text.AppendFormat(L" | ROI[x=%d y=%d w=%d h=%d]", roi.x, roi.y, roi.width, roi.height);

    COLORREF hudColor = (m_avgLuma < 128.0) ? RGB(240, 240, 240) : RGB(16, 16, 16);
    pDC->SetBkMode(TRANSPARENT);
    pDC->SetTextColor(hudColor);
    pDC->TextOutW(10, 10, text);
}

//=== 좌표 변환 ===//
CPoint CCamView::ViewToImage(const CPoint& vpt) const
{
    const double sx = m_scale, sy = m_scale;
    double x = (vpt.x - m_pan.x) / sx;
    double y = (vpt.y - m_pan.y) / sy;

    CSingleLock lk(const_cast<CCriticalSection*>(&m_imgCs), TRUE);
    if (!m_imgOrig.empty()) {
        x = std::clamp(x, 0.0, (double)m_imgOrig.cols - 1);
        y = std::clamp(y, 0.0, (double)m_imgOrig.rows - 1);
    }
    else {
        x = y = 0.0;
    }
    return { (int)std::lround(x), (int)std::lround(y) };
}

CPoint CCamView::ImageToView(const CPoint& ipt) const
{
    const double sx = m_scale, sy = m_scale;
    return { (int)std::lround(m_pan.x + ipt.x * sx),
             (int)std::lround(m_pan.y + ipt.y * sy) };
}

bool CCamView::GetPixelAtView(const CPoint& vpt, cv::Vec3b& bgr, uchar& gray, bool& isColor, CPoint& ipt) const
{
    CSingleLock lock(const_cast<CCriticalSection*>(&m_imgCs), TRUE);
    if (m_imgOrig.empty()) return false;

    ipt = ViewToImage(vpt);
    if (ipt.x < 0 || ipt.y < 0 || ipt.x >= m_imgOrig.cols || ipt.y >= m_imgOrig.rows)
        return false;

    if (m_imgOrig.channels() == 3) {
        bgr = m_imgOrig.at<cv::Vec3b>(ipt.y, ipt.x);
        isColor = true;
        return true;
    }
    gray = m_imgOrig.at<uchar>(ipt.y, ipt.x);
    isColor = false;
    bgr = cv::Vec3b(gray, gray, gray);
    return true;
}

cv::Rect CCamView::GetImageROI() const
{
    return ViewRoiToImageRect();
}

cv::Rect CCamView::ViewRoiToImageRect() const
{
    if (m_roiState == RoiState::Idle) return {};
    CRect rcV(m_roiStartView, m_roiEndView); rcV.NormalizeRect();
    if (rcV.Width() < 2 || rcV.Height() < 2) return {};

    const CPoint tl = ViewToImage(rcV.TopLeft());
    const CPoint br = ViewToImage(rcV.BottomRight());
    const int x = (std::min)(tl.x, br.x);
    const int y = (std::min)(tl.y, br.y);
    const int w = std::abs(br.x - tl.x);
    const int h = std::abs(br.y - tl.y);

    CSingleLock lock(const_cast<CCriticalSection*>(&m_imgCs), TRUE);
    if (m_imgOrig.empty()) return {};
    return (cv::Rect(x, y, w, h) & cv::Rect(0, 0, m_imgOrig.cols, m_imgOrig.rows));
}

//=== 마우스 입력 ===//
void CCamView::OnLButtonDown(UINT nFlags, CPoint pt)
{
    SetFocus();
    SetCapture();
    m_dragging = true;
    m_dragStart = pt;
    m_roiState = RoiState::Selecting;
    m_roiStartView = m_roiEndView = pt;
    Invalidate(FALSE);
    CStatic::OnLButtonDown(nFlags, pt);
}

void CCamView::OnMouseMove(UINT nFlags, CPoint pt)
{
    // 팬 (휠버튼 누른 상태) — 확대 상태에서만
    if (m_panning && IsZoomedIn())
    {
        const CPoint delta(pt.x - m_panStartPt.x, pt.y - m_panStartPt.y);

        // 드래그 제스처와 스크롤바/뷰포트 관점이 일관됩니다(마우스 ↓ ⇒ 뷰포트 ↓ ⇒ 콘텐츠는 ↑).
        m_pan = CPoint(m_panStartOffset.x + delta.x,
            m_panStartOffset.y - delta.y);

        ClampPanToBounds();
        UpdateScrollThumbOnly();   // pan -> scrollbar
        Invalidate(FALSE);
    }

    // ROI 드래그
    if (m_dragging && m_roiState == RoiState::Selecting) {
        m_roiEndView = pt;
        Invalidate(FALSE);
    }

    // HUD 픽셀
    if (::IsWindow(GetSafeHwnd())) {
        m_lastMousePt = pt;
        CSingleLock lock(&m_imgCs, TRUE);
        if (!m_imgOrig.empty()) {
            const CPoint ip = ViewToImage(pt);
            if (ip.x >= 0 && ip.y >= 0 && ip.x < m_imgOrig.cols && ip.y < m_imgOrig.rows) {
                if (m_imgOrig.channels() == 3) m_lastPixelBGR = m_imgOrig.at<cv::Vec3b>(ip.y, ip.x);
                else {
                    const uchar g = m_imgOrig.at<uchar>(ip.y, ip.x);
                    m_lastPixelBGR = cv::Vec3b(g, g, g);
                }
                m_lastPixelValid = true;
            }
            else m_lastPixelValid = false;
        }
    }

    // HUD 갱신빈도는 페인트와 동일하게 처리 (여기서 추가 Invalidate 생략)
    CStatic::OnMouseMove(nFlags, pt);
}

void CCamView::OnLButtonUp(UINT nFlags, CPoint pt)
{
    if (GetCapture() == this) ReleaseCapture();
    m_dragging = false;

    if (m_roiState == RoiState::Selecting) {
        m_roiEndView = pt;
        m_roiState = RoiState::Selected;
        Invalidate(FALSE);
    }
    CStatic::OnLButtonUp(nFlags, pt);
}

BOOL CCamView::OnMouseWheel(UINT nFlags, short zDelta, CPoint pt)
{
    ScreenToClient(&pt);
    if (zDelta > 0) ZoomIn(pt);
    else            ZoomOut(pt);
    NotifyScaleChanged();
    return TRUE;
}

void CCamView::OnMButtonDown(UINT nFlags, CPoint pt)
{
    SetFocus();
    if (!IsZoomedIn()) { CStatic::OnMButtonDown(nFlags, pt); return; }
    SetCapture();
    m_panning = true;
    m_panStartPt = pt;
    m_panStartOffset = m_pan;
    ::SetCursor(AfxGetApp()->LoadStandardCursor(IDC_SIZEALL));
    CStatic::OnMButtonDown(nFlags, pt);
}

void CCamView::OnMButtonUp(UINT nFlags, CPoint pt)
{
    if (GetCapture() == this) ReleaseCapture();
    m_panning = false;
    ::SetCursor(AfxGetApp()->LoadStandardCursor(IDC_ARROW));
    CStatic::OnMButtonUp(nFlags, pt);
}

//=== 배율/맞춤 ===//
double CCamView::GetFitScale() const
{
    if (m_imgOrig.empty()) return 1.0;
    const CRect rc = GetDrawableClientRect();
    if (rc.Width() <= 0 || rc.Height() <= 0) return 1.0;
    const double sx = (double)rc.Width() / m_imgOrig.cols;
    const double sy = (double)rc.Height() / m_imgOrig.rows;
    return std::min(sx, sy);
}

void CCamView::NotifyScaleChanged()
{
    if (GetSafeHwnd() && ::IsWindow(GetParent()->GetSafeHwnd()))
        GetParent()->PostMessage(WM_CAM_SCALE_CHANGED, 0, 0);
}

/** @brief 커서 기준 줌인(상한 적용) */
void CCamView::ZoomIn(const CPoint& viewPt)
{
    constexpr double kMaxScale = 20.0;   // 메모리 급증 방지 상한
    constexpr double kStep = 1.2;

    const CPoint imgBefore = ViewToImage(viewPt);
    const double newScale = (std::min)(m_scale * kStep, kMaxScale);

    m_pan.x = viewPt.x - (int)std::lround(imgBefore.x * newScale);
    m_pan.y = viewPt.y - (int)std::lround(imgBefore.y * newScale);
    m_scale = newScale;

    ClampPanToBounds();
    UpdateScrollBars();
    Invalidate(FALSE);
}

/** @brief 커서 기준 줌아웃(Fit 이하 금지) */
void CCamView::ZoomOut(const CPoint& viewPt)
{
    const double kMinScale = GetFitScale();
    constexpr double kStep = 1.0 / 1.2;

    const CPoint imgBefore = ViewToImage(viewPt);
    const double newScale = (std::max)(m_scale * kStep, kMinScale);

    m_pan.x = viewPt.x - (int)std::lround(imgBefore.x * newScale);
    m_pan.y = viewPt.y - (int)std::lround(imgBefore.y * newScale);
    m_scale = newScale;

    ClampPanToBounds();
    UpdateScrollBars();
    Invalidate(FALSE);
}

/** @brief 창에 맞춤 + 중앙정렬 */
void CCamView::FitToWindow()
{
    CSingleLock lock(&m_imgCs, TRUE);
    CRect rc; GetClientRect(&rc);
    if (m_imgOrig.empty() || rc.Width() <= 0 || rc.Height() <= 0) return;

    m_scale = GetFitScale();
    const int drawW = (int)std::lround(m_imgOrig.cols * m_scale);
    const int drawH = (int)std::lround(m_imgOrig.rows * m_scale);
    m_pan.x = (rc.Width() - drawW) / 2;
    m_pan.y = (rc.Height() - drawH) / 2;

    ClampPanToBounds();
    UpdateScrollBars();
    Invalidate(FALSE);
    NotifyScaleChanged();
}

void CCamView::ZoomInCenter() { CRect rc; GetClientRect(&rc); ZoomIn(rc.CenterPoint());  NotifyScaleChanged(); }
void CCamView::ZoomOutCenter() { CRect rc; GetClientRect(&rc); ZoomOut(rc.CenterPoint()); NotifyScaleChanged(); }

void CCamView::Zoom100()
{
    m_scale = 1.0;
    CRect rc; GetClientRect(&rc);
    CSingleLock lock(&m_imgCs, TRUE);
    if (!m_imgOrig.empty()) {
        const int drawW = (int)std::lround(m_imgOrig.cols * m_scale);
        const int drawH = (int)std::lround(m_imgOrig.rows * m_scale);
        m_pan.x = (rc.Width() - drawW) / 2;
        m_pan.y = (rc.Height() - drawH) / 2;
    }
    else {
        m_pan = { 0,0 };
    }
    ClampPanToBounds();
    UpdateScrollBars();
    Invalidate(FALSE);
    NotifyScaleChanged();
}

bool CCamView::IsZoomedIn() const
{
    return m_scale > (GetFitScale() + 1e-6);
}

CSize CCamView::GetDrawSize() const
{
    CSingleLock lock(const_cast<CCriticalSection*>(&m_imgCs), TRUE);
    if (m_imgOrig.empty()) return { 0,0 };
    return { (int)std::lround(m_imgOrig.cols * m_scale),
             (int)std::lround(m_imgOrig.rows * m_scale) };
}

void CCamView::ClampPanToBounds()
{
    CRect rc; GetClientRect(&rc);
    const CSize draw = GetDrawSize();

    // X
    if (draw.cx <= rc.Width()) m_pan.x = (rc.Width() - draw.cx) / 2;
    else {
        const int minX = rc.Width() - draw.cx, maxX = 0;
        m_pan.x = (LONG)clampv<int>(m_pan.x, minX, maxX);
    }
    // Y
    if (draw.cy <= rc.Height()) m_pan.y = (rc.Height() - draw.cy) / 2;
    else {
        const int minY = rc.Height() - draw.cy, maxY = 0;
        m_pan.y = (LONG)clampv<int>(m_pan.y, minY, maxY);
    }
}

//=== 스크롤 ===//
void CCamView::PreSubclassWindow()
{
    CStatic::PreSubclassWindow();
    ModifyStyle(0, SS_NOTIFY | WS_CLIPSIBLINGS | WS_CLIPCHILDREN);

    if (!m_hScroll.GetSafeHwnd()) m_hScroll.Create(SBS_HORZ | WS_CHILD, CRect(0, 0, 0, 0), this, 101);
    if (!m_vScroll.GetSafeHwnd()) m_vScroll.Create(SBS_VERT | WS_CHILD, CRect(0, 0, 0, 0), this, 102);

    m_hScroll.ShowWindow(SW_HIDE);
    m_vScroll.ShowWindow(SW_HIDE);

    UpdateScrollBars();
}

void CCamView::OnSize(UINT nType, int cx, int cy)
{
    CStatic::OnSize(nType, cx, cy);
    RelayoutScrollBars();
    UpdateScrollBars();

    if (!::IsWindow(m_hScroll.GetSafeHwnd()) || !::IsWindow(m_vScroll.GetSafeHwnd()))
        return;

    const int sbH = GetSystemMetrics(SM_CYHSCROLL);
    const int sbW = GetSystemMetrics(SM_CXVSCROLL);
    m_hScroll.MoveWindow(0, cy - sbH, cx - (m_scrollVisibleV ? sbW : 0), sbH);
    m_vScroll.MoveWindow(cx - sbW, 0, sbW, cy - (m_scrollVisibleH ? sbH : 0));
}

void CCamView::UpdateScrollBars()
{
    if (!::IsWindow(m_hScroll.GetSafeHwnd()) || !::IsWindow(m_vScroll.GetSafeHwnd())) return;

    CRect rc; GetClientRect(&rc);
    const int sbH = GetSystemMetrics(SM_CYHSCROLL);
    const int sbW = GetSystemMetrics(SM_CXVSCROLL);

    auto calcNeed = [&](bool assumeH, bool assumeV) {
        CRect r = rc;
        if (assumeH) r.bottom -= sbH;
        if (assumeV) r.right -= sbW;
        const CSize draw = GetDrawSize();
        return std::pair<bool, bool>(draw.cx > r.Width(), draw.cy > r.Height());
        };

    auto need = calcNeed(m_scrollVisibleH, m_scrollVisibleV);
    auto need2 = calcNeed(need.first, need.second);

    const bool showH = need2.first;
    const bool showV = need2.second;

    if (showH != m_scrollVisibleH) { m_scrollVisibleH = showH; m_hScroll.ShowWindow(showH ? SW_SHOW : SW_HIDE); }
    if (showV != m_scrollVisibleV) { m_scrollVisibleV = showV; m_vScroll.ShowWindow(showV ? SW_SHOW : SW_HIDE); }

    CRect r = rc;
    if (m_scrollVisibleH) r.bottom -= sbH;
    if (m_scrollVisibleV) r.right -= sbW;

    const CSize draw = GetDrawSize();
    const int pageW = r.Width(), contentW = draw.cx;
    const int pageH = r.Height(), contentH = draw.cy;

    auto setBar = [&](CScrollBar& bar, bool vis, int page, int content, int panPos) {
        if (!vis) return;
        SCROLLINFO si{ sizeof(si) };
        si.fMask = SIF_PAGE | SIF_RANGE | SIF_POS;
        si.nMin = 0;
        si.nMax = std::max(0, content - 1);
        si.nPage = (UINT)std::clamp(page, 0, content);
        si.nPos = std::clamp(panPos, 0, std::max(0, content - page));
        bar.SetScrollInfo(&si, TRUE);
        };

    setBar(m_hScroll, m_scrollVisibleH, pageW, contentW, -m_pan.x);
    setBar(m_vScroll, m_scrollVisibleV, pageH, contentH, -m_pan.y);

    RelayoutScrollBars();
}

/** @brief (드래그 중 전용) 스크롤바 범위/표시 여부는 건드리지 않고 thumb 위치만 pan에서 동기화. */
void CCamView::UpdateScrollThumbOnly()
{
    if (m_scrollVisibleH && ::IsWindow(m_hScroll.GetSafeHwnd()))
    {
        SCROLLINFO si{ sizeof(si), SIF_ALL };
        m_hScroll.GetScrollInfo(&si);
        const int maxPos = (std::max)(0, si.nMax - (int)si.nPage);
        const int pos = clampv<int>(-m_pan.x, 0, maxPos);
        si.fMask = SIF_POS;
        si.nPos = pos;
        m_hScroll.SetScrollInfo(&si, TRUE);
    }
    if (m_scrollVisibleV && ::IsWindow(m_vScroll.GetSafeHwnd()))
    {
        SCROLLINFO si{ sizeof(si), SIF_ALL };
        m_vScroll.GetScrollInfo(&si);
        const int maxPos = (std::max)(0, si.nMax - (int)si.nPage);
        const int pos = clampv<int>(-m_pan.y, 0, maxPos);
        si.fMask = SIF_POS;
        si.nPos = pos;
        m_vScroll.SetScrollInfo(&si, TRUE);
    }
}

void CCamView::SyncPanFromScroll()
{
    if (m_scrollVisibleH) {
        SCROLLINFO si = { sizeof(si), SIF_POS };
        m_hScroll.GetScrollInfo(&si);
        m_pan.x = -si.nPos;
    }
    if (m_scrollVisibleV) {
        SCROLLINFO si = { sizeof(si), SIF_POS };
        m_vScroll.GetScrollInfo(&si);
        m_pan.y = -si.nPos;
    }
    ClampPanToBounds();
    Invalidate(FALSE);
}

void CCamView::OnHScroll(UINT nSBCode, UINT nPos, CScrollBar* pScrollBar)
{
    if (pScrollBar == &m_hScroll) {
        SCROLLINFO si = { sizeof(si), SIF_ALL };
        pScrollBar->GetScrollInfo(&si);
        int pos = si.nPos;

        switch (nSBCode) {
        case SB_LINELEFT:   pos -= 30;           break;
        case SB_LINERIGHT:  pos += 30;           break;
        case SB_PAGELEFT:   pos -= (int)si.nPage; break;
        case SB_PAGERIGHT:  pos += (int)si.nPage; break;
        case SB_THUMBTRACK: pos = (int)nPos;    break;
        default: break;
        }
        pos = clampv<int>(pos, si.nMin, si.nMax - (int)si.nPage);
        si.nPos = pos;
        pScrollBar->SetScrollInfo(&si, TRUE);
        SyncPanFromScroll();
        return;
    }
    CStatic::OnHScroll(nSBCode, nPos, pScrollBar);
}

void CCamView::OnVScroll(UINT nSBCode, UINT nPos, CScrollBar* pScrollBar)
{
    if (pScrollBar == &m_vScroll) {
        SCROLLINFO si = { sizeof(si), SIF_ALL };
        pScrollBar->GetScrollInfo(&si);
        int pos = si.nPos;

        switch (nSBCode) {
        case SB_LINEUP:     pos -= 30;           break;
        case SB_LINEDOWN:   pos += 30;           break;
        case SB_PAGEUP:     pos -= (int)si.nPage; break;
        case SB_PAGEDOWN:   pos += (int)si.nPage; break;
        case SB_THUMBTRACK: pos = (int)nPos;    break;
        default: break;
        }
        pos = clampv<int>(pos, si.nMin, si.nMax - (int)si.nPage);
        si.nPos = pos;
        pScrollBar->SetScrollInfo(&si, TRUE);
        SyncPanFromScroll();
        return;
    }
    CStatic::OnVScroll(nSBCode, nPos, pScrollBar);
}

CRect CCamView::GetDrawableClientRect() const
{
    CRect rc; GetClientRect(&rc);
    if (m_scrollVisibleH) rc.bottom -= GetSystemMetrics(SM_CYHSCROLL);
    if (m_scrollVisibleV) rc.right -= GetSystemMetrics(SM_CXVSCROLL);
    return rc;
}

void CCamView::RelayoutScrollBars()
{
    if (!::IsWindow(m_hScroll.GetSafeHwnd()) || !::IsWindow(m_vScroll.GetSafeHwnd()))
        return;

    CRect rc; GetClientRect(&rc);
    const int sbH = GetSystemMetrics(SM_CYHSCROLL);
    const int sbW = GetSystemMetrics(SM_CXVSCROLL);

    if (m_scrollVisibleH)
        m_hScroll.MoveWindow(0, rc.bottom - sbH, rc.Width() - (m_scrollVisibleV ? sbW : 0), sbH);
    if (m_scrollVisibleV)
        m_vScroll.MoveWindow(rc.right - sbW, 0, sbW, rc.Height() - (m_scrollVisibleH ? sbH : 0));

    if (m_scrollVisibleH) m_hScroll.BringWindowToTop();
    if (m_scrollVisibleV) m_vScroll.BringWindowToTop();
}

void CCamView::StartFitOnNextFrame(bool enable /*=true*/)
{
    m_needFitOnNextImage = enable;
}

double CCamView::GetCurrentScale() const
{
    if (!m_imgOrig.empty() && m_scale > 0.0) return m_scale;
    CRect rc; GetClientRect(&rc);
    if (m_imgOrig.empty() || rc.Width() <= 0 || rc.Height() <= 0) return 1.0;
    const double sx = (double)rc.Width() / m_imgOrig.cols;
    const double sy = (double)rc.Height() / m_imgOrig.rows;
    return std::min(sx, sy);
}

//=== 버퍼 준비(핵심 최적화) ===//
void CCamView::EnsureScaled()
{
    if (m_imgOrig.empty()) {
        m_imgScaled.release();
        m_imgScaledBGRA.release();
        return;
    }

    // 목표 크기 계산
    const int dstW = (std::max)(1, (int)std::lround(m_imgOrig.cols * m_scale));
    const int dstH = (std::max)(1, (int)std::lround(m_imgOrig.rows * m_scale));

    // 캐시 히트: 원본 크기&스케일 동일 + BGRA 존재 → 재계산 생략
    if (m_lastScaledSrcW == m_imgOrig.cols &&
        m_lastScaledSrcH == m_imgOrig.rows &&
        std::abs(m_lastScaledScale - m_scale) < 1e-12 &&
        !m_imgScaledBGRA.empty() &&
        m_imgScaledBGRA.cols == dstW &&
        m_imgScaledBGRA.rows == dstH)
    {
        return;
    }

    const int interp = (m_scale < 1.0) ? cv::INTER_AREA : cv::INTER_LINEAR;

    // 1) 스케일 버퍼 확보(create: 재할당 최소화)
    if (m_imgOrig.channels() == 3) {
        m_imgScaled.create(dstH, dstW, CV_8UC3);
        cv::resize(m_imgOrig, m_imgScaled, m_imgScaled.size(), 0, 0, interp);
    }
    else {
        m_imgScaled.create(dstH, dstW, CV_8UC1);
        cv::resize(m_imgOrig, m_imgScaled, m_imgScaled.size(), 0, 0, interp);
    }

    // 2) BGRA 변환(create 재사용)
    m_imgScaledBGRA.create(dstH, dstW, CV_8UC4);
    if (m_imgScaled.channels() == 3)
        cv::cvtColor(m_imgScaled, m_imgScaledBGRA, cv::COLOR_BGR2BGRA);
    else
        cv::cvtColor(m_imgScaled, m_imgScaledBGRA, cv::COLOR_GRAY2BGRA);

    // 캐시 키 갱신
    m_lastScaledSrcW = m_imgOrig.cols;
    m_lastScaledSrcH = m_imgOrig.rows;
    m_lastScaledScale = m_scale;
}
