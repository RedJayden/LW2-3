
// VisionModuleDlg.h: 헤더 파일

#pragma once

#include <vector>
#include <memory>
#include <map>
#include <opencv2/opencv.hpp>
#include "HikCamWrapper.h"
#include "CCamView.h"

#include <crtdbg.h>

/**
 * @brief 카메라 열거/연결 및 실시간 표시, AE UI를 포함한 메인 다이얼로그
 * @details
 *  - 디자인 패턴: Observer(Wrapper→Dlg FPS 통지), MVC(Dlg-Wrapper-View)
 *  - CHikCamWrapper::Range 를 이용해 카메라별 노출/게인 범위 일원화
 */
class CVisionModuleDlg : public CDialogEx
{
// 생성/소멸
public:
	CVisionModuleDlg(CWnd* pParent = nullptr);	// 표준 생성자입니다.
	virtual ~CVisionModuleDlg();

// 대화 상자 데이터입니다.
#ifdef AFX_DESIGN_TIME
	enum { IDD = IDD_VISIONMODULE_DIALOG };
#endif

protected:
	virtual void DoDataExchange(CDataExchange* pDX);	// DDX/DDV 지원입니다.


// 구현입니다.
protected:
    HICON m_hIcon;

    // 메시지 맵
    virtual BOOL OnInitDialog();
    afx_msg void OnPaint();
    afx_msg HCURSOR OnQueryDragIcon();
    virtual BOOL PreTranslateMessage(MSG* pMsg) override;
    afx_msg void OnSysCommand(UINT nID, LPARAM lParam);
    afx_msg void OnTimer(UINT_PTR nIDEvent);
    DECLARE_MESSAGE_MAP()

private:
    /** @brief 1 카메라 단위 슬롯 */
    struct CamSlot {
        std::unique_ptr<CHikCamWrapper> cam;
        MV_CC_DEVICE_INFO dev{};   ///< 열거 당시 devinfo 보관
        bool hasDev = false;
    };

    /// @brief 콤보/슬롯 채우기(열거)
    void EnumAndFillCameras();

    /// @brief 선택 인덱스의 카메라를 필요 시 Open
    bool OpenIfNeeded(int camIdx);

    /// @brief 정보 패널(Static)에 장치 정보 표시
    void UpdateInfoPanel(int camIdx);

    /// @brief 현재 노출/게인 값을 Edit에 표시 (+ min/max/cur 라벨)
    void LoadCurrentAEToEdits(int camIdx);

    void UpdateZoomStatic();  ///< 배율 Static 업데이트

private:
    CCamView m_wndView;           ///< Picture Control 기반 뷰어

    CComboBox m_cmbCamera;
    CEdit     m_editExposure;
    CEdit     m_editGain;
    CStatic   m_staticInfo;

    // 시스템 전체 카메라 슬롯 (EnumDevices 순서대로 인덱싱)
    std::map<int, std::unique_ptr<CamSlot>> m_slots;

    int   m_selIdx = -1;          ///< 현재 선택 슬롯 인덱스
    bool  m_fit = true;        ///< 맞춤 보기 플래그

    double m_lastFps = 0.0;       ///< 마지막 FPS (Observer로 갱신)

    CStatic m_staticZoom;  // 줌 배율 표시


#ifdef _DEBUG
    _CrtMemState m_memStart{};    ///< 메모리 스냅샷(디버그)
#endif

protected:
    // UI 핸들러
    afx_msg void OnBnClickedBtnStart();
    afx_msg void OnBnClickedBtnStop();
    afx_msg void OnCbnSelchangeCmbCamera();
    afx_msg void OnBnClickedBtnApply();

    // 새 프레임 알림
    afx_msg LRESULT OnHikNewFrame(WPARAM, LPARAM);

    afx_msg void OnDestroy();
public:
    afx_msg BOOL OnEraseBkgnd(CDC* pDC);
    afx_msg void OnBnClickedBtnSaveImage();
    afx_msg void OnBnClickedBtnZoomIn();
    afx_msg void OnBnClickedBtnZoomOut();
    afx_msg void OnBnClickedBtnFit();
    afx_msg void OnBnClickedBtnToggleGrid();
    afx_msg void OnBnClickedBtnToggleCross();
    afx_msg void OnBnClickedBtnZoom100();
    afx_msg LRESULT OnCamScaleChanged(WPARAM, LPARAM);
};

