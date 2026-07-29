// VisionModuleDlg.cpp
#include "pch.h"

#ifdef VISIONMODULE_APP

#include "framework.h"
#include "VisionModule.h"
#include "VisionModuleDlg.h"
#include "afxdialogex.h"

#include "CvDraw.h"
#include "AnsiWide.h"
#include <atlconv.h>

#ifdef _DEBUG
#define new DEBUG_NEW
#endif

CVisionModuleDlg::CVisionModuleDlg(CWnd* pParent /*=nullptr*/)
    : CDialogEx(IDD_VISIONMODULE_DIALOG, pParent) {
    m_hIcon = AfxGetApp()->LoadIcon(IDR_MAINFRAME);
}

CVisionModuleDlg::~CVisionModuleDlg() {}

void CVisionModuleDlg::DoDataExchange(CDataExchange* pDX)
{
    CDialogEx::DoDataExchange(pDX);
    DDX_Control(pDX, IDC_CAMVIEW, m_wndView);
    DDX_Control(pDX, IDC_CMB_CAMERA, m_cmbCamera);
    DDX_Control(pDX, IDC_EDIT_EXPOSURE, m_editExposure);
    DDX_Control(pDX, IDC_EDIT_GAIN, m_editGain);
    DDX_Control(pDX, IDC_STATIC_INFO, m_staticInfo);
    DDX_Control(pDX, IDC_STATIC_ZOOM, m_staticZoom);
}

BEGIN_MESSAGE_MAP(CVisionModuleDlg, CDialogEx)
    ON_WM_PAINT()
    ON_WM_QUERYDRAGICON()
    ON_CBN_SELCHANGE(IDC_CMB_CAMERA, &CVisionModuleDlg::OnCbnSelchangeCmbCamera)
    ON_BN_CLICKED(IDC_BTN_START, &CVisionModuleDlg::OnBnClickedBtnStart)
    ON_BN_CLICKED(IDC_BTN_STOP, &CVisionModuleDlg::OnBnClickedBtnStop)
    ON_BN_CLICKED(IDC_BTN_APPLY, &CVisionModuleDlg::OnBnClickedBtnApply)
    ON_MESSAGE(CHikCamWrapper::WM_HIK_NEWFRAME, &CVisionModuleDlg::OnHikNewFrame)
    ON_WM_DESTROY()
    ON_WM_ERASEBKGND()
    ON_BN_CLICKED(IDC_BTN_SAVE_IMAGE, &CVisionModuleDlg::OnBnClickedBtnSaveImage)
    ON_BN_CLICKED(IDC_BTN_ZOOM_IN, &CVisionModuleDlg::OnBnClickedBtnZoomIn)
    ON_BN_CLICKED(IDC_BTN_ZOOM_OUT, &CVisionModuleDlg::OnBnClickedBtnZoomOut)
    ON_BN_CLICKED(IDC_BTN_FIT, &CVisionModuleDlg::OnBnClickedBtnFit)
    ON_BN_CLICKED(IDC_BTN_TOGGLE_GRID, &CVisionModuleDlg::OnBnClickedBtnToggleGrid)
    ON_BN_CLICKED(IDC_BTN_TOGGLE_CROSS, &CVisionModuleDlg::OnBnClickedBtnToggleCross)
    ON_BN_CLICKED(IDC_BTN_ZOOM100, &CVisionModuleDlg::OnBnClickedBtnZoom100)
    ON_MESSAGE(WM_CAM_SCALE_CHANGED, &CVisionModuleDlg::OnCamScaleChanged)
    ON_WM_TIMER()
END_MESSAGE_MAP()

BOOL CVisionModuleDlg::OnInitDialog()
{
    CDialogEx::OnInitDialog();

    SetIcon(m_hIcon, TRUE);
    SetIcon(m_hIcon, FALSE);

    // MVS SDK 초기화 (프로세스 내 최초 1회)
    MV_CC_Initialize();

    EnumAndFillCameras();

    if (m_cmbCamera.GetCount() > 0) {
        m_cmbCamera.SetCurSel(0);
        OnCbnSelchangeCmbCamera();
    }

    // CStatic이 마우스 통지를 받도록
    m_wndView.ModifyStyle(0, SS_NOTIFY);

    UpdateZoomStatic();   // zoom 초기 표시

    return TRUE;
}

void CVisionModuleDlg::EnumAndFillCameras()
{
    m_cmbCamera.ResetContent();

    // 모든 GigE 디바이스 검색
    MV_GIGE_SetDiscoveryMode(0 /* MV_GIGE_DISCOVERY_ALL */);

    MV_CC_DEVICE_INFO_LIST list{};
    if (MV_OK != MV_CC_EnumDevices(MV_GIGE_DEVICE | MV_USB_DEVICE, &list) || list.nDeviceNum == 0) {
        m_staticInfo.SetWindowTextW(L"No camera found.");
        m_selIdx = -1;
        return;
    }

    for (UINT i = 0; i < list.nDeviceNum; ++i) {
        const MV_CC_DEVICE_INFO* p = list.pDeviceInfo[i];
        CString item;

        if (p->nTLayerType == MV_GIGE_DEVICE) {
            const auto& g = p->SpecialInfo.stGigEInfo;
            const int ip1 = (g.nCurrentIp >> 24) & 0xFF;
            const int ip2 = (g.nCurrentIp >> 16) & 0xFF;
            const int ip3 = (g.nCurrentIp >> 8) & 0xFF;
            const int ip4 = (g.nCurrentIp) & 0xFF;
            CString model = AnsiToWide((const char*)g.chModelName).c_str();
            CString manuf = AnsiToWide((const char*)g.chManufacturerName).c_str();
            item.Format(L"[%u] %s / %s (%d.%d.%d.%d)", i, manuf.GetString(), model.GetString(), ip1, ip2, ip3, ip4);
        }
        else if (p->nTLayerType == MV_USB_DEVICE) {
            const auto& u = p->SpecialInfo.stUsb3VInfo;
            CString model = AnsiToWide((const char*)u.chModelName).c_str();
            CString manuf = AnsiToWide((const char*)u.chManufacturerName).c_str();
            item.Format(L"[%u] %s / %s (USB3)", i, manuf.GetString(), model.GetString());
        }
        else {
            item.Format(L"[%u] (Unknown)", i);
        }

        const int idx = m_cmbCamera.AddString(item);
        m_cmbCamera.SetItemData(idx, (DWORD_PTR)i);

        // 슬롯 생성 및 devinfo 복사 저장
        auto& slot = m_slots[(int)i];
        if (!slot) slot = std::make_unique<CamSlot>();
        slot->cam = std::make_unique<CHikCamWrapper>();
        slot->dev = *p;   // 깊은 복사
        slot->hasDev = true;
    }
}

bool CVisionModuleDlg::OpenIfNeeded(int camIdx)
{
    auto it = m_slots.find(camIdx);
    if (it == m_slots.end() || !it->second || !it->second->hasDev) return false;

    auto& slot = it->second;
    if (!slot->cam->IsOpened()) {
        if (!slot->cam->Open(slot->dev)) return false;
    }
    return true;
}

void CVisionModuleDlg::UpdateInfoPanel(int camIdx)
{
    auto it = m_slots.find(camIdx);
    if (it == m_slots.end()) return;
    const auto& slot = it->second;
    std::wstring info = slot->cam->GetDeviceInfoString();
    m_staticInfo.SetWindowTextW(info.c_str());
}

void CVisionModuleDlg::LoadCurrentAEToEdits(int camIdx)
{
    auto it = m_slots.find(camIdx);
    if (it == m_slots.end()) return;
    auto& cam = it->second->cam;

    // 현재값
    const double expUs = cam->GetExposureDouble();
    const double gain = cam->GetGainDouble();

    CString s;
    s.Format(L"%.3f", expUs); m_editExposure.SetWindowTextW(s);
    s.Format(L"%.3f", gain);  m_editGain.SetWindowTextW(s);

    // (선택) min/max/cur 라벨을 별도 Static에 표시하고 싶다면 여기서 Range 조회
    // CHikCamWrapper::Range re{}, rg{};
    // if (cam->GetExposureRange(re) && cam->GetGainRange(rg)) { ... }
}

void CVisionModuleDlg::OnCbnSelchangeCmbCamera()
{
    const int cur = m_cmbCamera.GetCurSel();
    if (cur < 0) return;

    const int camIdx = (int)m_cmbCamera.GetItemData(cur);
    m_selIdx = camIdx;

    if (!OpenIfNeeded(camIdx)) {
        m_staticInfo.SetWindowTextW(L"Open camera failed.");
        return;
    }

    // 다음 프레임 들어오면 Fit
    m_wndView.StartFitOnNextFrame(true);

    UpdateInfoPanel(camIdx);
    LoadCurrentAEToEdits(camIdx);
}

LRESULT CVisionModuleDlg::OnHikNewFrame(WPARAM, LPARAM)
{
    if (m_selIdx < 0) return 0;
    auto it = m_slots.find(m_selIdx);
    if (it == m_slots.end() || !it->second || !it->second->cam) return 0;

    cv::Mat bgr;
    if (it->second->cam->PopLatest(bgr) && !bgr.empty()) {
        // FPS는 Observer 콜백으로 최신 값을 유지한다.
        m_wndView.SetImage(bgr, m_lastFps);
    }
    return 0;
}

void CVisionModuleDlg::OnPaint()
{
    CPaintDC dc(this);
}

HCURSOR CVisionModuleDlg::OnQueryDragIcon()
{
    return static_cast<HCURSOR>(m_hIcon);
}

void CVisionModuleDlg::OnBnClickedBtnStart()
{
    if (m_selIdx < 0) return;
    auto& slot = m_slots[m_selIdx];

    if (!OpenIfNeeded(m_selIdx)) {
        AfxMessageBox(L"Open camera failed");
        return;
    }

    // 1) FPS 수신(Observer)
    slot->cam->SetOnFrame([this](double fps) {
        // 콜백 스레드 문맥 → 단순 값 기록만 (UI 접근 금지)
        m_lastFps = fps;
        });

    // 2) 새 프레임 HWND 통지 설정(화면 갱신)
    //slot->cam->SetNotifyHwnd(m_hWnd); // UI 통지 비사용

    // 3) 스트리밍 시작
    if (!slot->cam->IsGrabbing()) {
        if (!slot->cam->Start())
            AfxMessageBox(L"Start grabbing failed");
    }


    // 60Hz 미만 주기로 화면 갱신 (필요시 16ms~33ms 사이에서 선택)
    SetTimer(1001, 16, nullptr);

    // 다음 프레임 들어오면 Fit
    m_wndView.StartFitOnNextFrame(true);

#ifdef _DEBUG
    //_CrtMemCheckpoint(&m_memStart);
#endif
}

void CVisionModuleDlg::OnBnClickedBtnStop()
{
    if (m_selIdx < 0) return;
    auto& slot = m_slots[m_selIdx];
    if (!slot || !slot->cam) return;

    KillTimer(1001);

    slot->cam->Stop();
    slot->cam->SetNotifyHwnd(nullptr);
    slot->cam->SetOnFrame(nullptr); // 옵저버 해제
}

void CVisionModuleDlg::OnBnClickedBtnApply()
{
    if (m_selIdx < 0) return;
    auto& slot = m_slots[m_selIdx];
    if (!slot || !slot->cam) return;

    CString s;
    m_editExposure.GetWindowTextW(s);
    double expUs = _wtof(s);
    m_editGain.GetWindowTextW(s);
    double gain = _wtof(s);

    // 범위 조회 (통합 Range)
    CHikCamWrapper::Range re{}, rg{};
    slot->cam->GetExposureRange(re);
    slot->cam->GetGainRange(rg);

    // 범위 보정
    expUs = std::clamp(expUs, re.min, re.max);
    gain = std::clamp(gain, rg.min, rg.max);

    // 적용 (autoOff = true 로 수동 모드 전환 시도)
    slot->cam->SetExposure(expUs, /*autoOff=*/true);
    slot->cam->SetGain(gain,      /*autoOff=*/true);

    // 최신값 다시 반영
    LoadCurrentAEToEdits(m_selIdx);
}

void CVisionModuleDlg::OnDestroy()
{
    // 모든 슬롯 종료/정리
    for (auto& kv : m_slots) {
        if (!kv.second || !kv.second->cam) continue;
        kv.second->cam->Stop();
        kv.second->cam->SetNotifyHwnd(nullptr);
        kv.second->cam->SetOnFrame(nullptr);
        kv.second->cam->Close();
        kv.second->cam.reset();
    }
    m_slots.clear();

    // SDK 종료
    MV_CC_Finalize();

    CDialogEx::OnDestroy();
}

BOOL CVisionModuleDlg::OnEraseBkgnd(CDC* pDC)
{
    if (::IsWindow(m_wndView.GetSafeHwnd())) {
        CRect rc; m_wndView.GetWindowRect(&rc); ScreenToClient(&rc);
        pDC->ExcludeClipRect(&rc);
        return TRUE;
    }
    return CDialogEx::OnEraseBkgnd(pDC);
}

void CVisionModuleDlg::OnBnClickedBtnSaveImage()
{
    cv::Mat img;
    // 1) 화면에 표시 중인 프레임을 최우선으로 사용
    if (!m_wndView.CopyCurrentImage(img) || img.empty()) {
        // 2) (보조) 아직 표시된 게 없다면 카메라 큐에서 한 번 더 시도
        if (m_selIdx >= 0) {
            auto it = m_slots.find(m_selIdx);
            if (it != m_slots.end() && it->second && it->second->cam) {
                it->second->cam->PopLatest(img);
            }
        }
    }

    if (img.empty()) {
        AfxMessageBox(L"저장할 프레임이 없습니다.");
        return;
    }

    CFileDialog dlg(FALSE, L"png", nullptr,
        OFN_HIDEREADONLY | OFN_OVERWRITEPROMPT,
        L"PNG 파일 (*.png)|*.png|JPEG 파일 (*.jpg;*.jpeg)|*.jpg;*.jpeg|BMP 파일 (*.bmp)|*.bmp||",
        this);
    if (dlg.DoModal() != IDOK) return;

    CString path = dlg.GetPathName();
    CString ext = dlg.GetFileExt(); ext.MakeLower();

    std::vector<int> params;
    if (ext == L"jpg" || ext == L"jpeg")      params = { cv::IMWRITE_JPEG_QUALITY, 95 };
    else if (ext == L"png")                   params = { cv::IMWRITE_PNG_COMPRESSION, 3 };

    try {
        std::string spath = std::string(CW2A(path, CP_UTF8));
        if (!cv::imwrite(spath, img, params)) throw std::runtime_error("imwrite failed");
    }
    catch (...) {
        AfxMessageBox(L"이미지 저장 실패.");
        return;
    }
}

void CVisionModuleDlg::OnBnClickedBtnZoomIn()
{
    m_wndView.ZoomInCenter();
}

void CVisionModuleDlg::OnBnClickedBtnZoomOut()
{
    m_wndView.ZoomOutCenter();
}

void CVisionModuleDlg::OnBnClickedBtnFit()
{
    m_wndView.FitToWindow();
}


void CVisionModuleDlg::OnBnClickedBtnZoom100()
{
    m_wndView.Zoom100();
}

void CVisionModuleDlg::OnBnClickedBtnToggleGrid()
{
    const bool newState = !m_wndView.IsGridEnabled();
    m_wndView.SetGridEnabled(newState);
    // 버튼 텍스트 토글 (선택사항)
    CButton* btn = (CButton*)GetDlgItem(IDC_BTN_TOGGLE_GRID);
    if (btn) btn->SetWindowTextW(newState ? L"Hide Grid" : L"Show Grid");
}

void CVisionModuleDlg::OnBnClickedBtnToggleCross()
{
    const bool newState = !m_wndView.IsCrossEnabled();
    m_wndView.SetCrossEnabled(newState);
    CButton* btn = (CButton*)GetDlgItem(IDC_BTN_TOGGLE_CROSS);
    if (btn) btn->SetWindowTextW(newState ? L"Hide Cross" : L"Show Cross");
}

LRESULT CVisionModuleDlg::OnCamScaleChanged(WPARAM, LPARAM)
{
    UpdateZoomStatic();
    return 0;
}

void CVisionModuleDlg::UpdateZoomStatic()
{
    // 현재 배율과 화면맞춤 배율을 함께 표시(예: "줌: 135%  (Fit 92%)")
    const int percent = m_wndView.GetZoomPercent();

    // Fit은 소수점 반올림해도 되고, 필요없으면 제거
    const int fitPercent = (int)std::lround(m_wndView.GetFitScale() * 100.0);

    CString s;
    //s.Format(L"줌: %d%%  (Fit %d%%)", percent, fitPercent);
    s.Format(L"줌: %d%%", percent);

    if (::IsWindow(m_staticZoom.GetSafeHwnd()))
        m_staticZoom.SetWindowTextW(s);
}

BOOL CVisionModuleDlg::PreTranslateMessage(MSG* pMsg)
{
    // 1) Alt+F4, Enter, Esc 차단
    if (pMsg->message == WM_SYSKEYDOWN) {
        if (pMsg->wParam == VK_F4) return TRUE; // Alt+F4
    }
    if (pMsg->message == WM_KEYDOWN) {
        if (pMsg->wParam == VK_RETURN || pMsg->wParam == VK_ESCAPE) return TRUE;
    }

    // 2) 휠을 뷰로 포워딩 (커서가 뷰 위에 있으면)
    if (pMsg->message == WM_MOUSEWHEEL) {
        CPoint scr(GET_X_LPARAM(pMsg->lParam), GET_Y_LPARAM(pMsg->lParam));
        CWnd* pHit = WindowFromPoint(scr);
        if (pHit == &m_wndView || m_wndView.IsChild(pHit)) {
            m_wndView.SetFocus();
            m_wndView.SendMessage(WM_MOUSEWHEEL, pMsg->wParam, pMsg->lParam);
            return TRUE;
        }
    }
    return CDialogEx::PreTranslateMessage(pMsg);
}

void CVisionModuleDlg::OnSysCommand(UINT nID, LPARAM lParam)
{
    if ((nID & 0xFFF0) == SC_CLOSE) {
        // Alt+F4 및 닫기 버튼 차단
        return;
    }
    CDialogEx::OnSysCommand(nID, lParam);
}



void CVisionModuleDlg::OnTimer(UINT_PTR id)
{
    if (id == 1001) {
        if (m_selIdx < 0) return;
        auto it = m_slots.find(m_selIdx);
        if (it == m_slots.end() || !it->second || !it->second->cam) return;

        cv::Mat bgr;
        if (it->second->cam->PopLatest(bgr) && !bgr.empty()) {
            m_wndView.SetImage(bgr, m_lastFps);
        }
    }
    else {
        CDialogEx::OnTimer(id);
    }
}


#endif // VISIONMODULE_APP