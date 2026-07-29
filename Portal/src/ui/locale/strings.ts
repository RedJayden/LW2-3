export const uiText = {
  common: {
    confirm: "확인",
    cancel: "취소",
  },
  shell: {
    titleBar: {
      appName: "LASERnGRAPN",
      tabs: {
        main: "Main",
        recipe: "Recipe",
        parameter: "Parameter",
        calibration: "Calibration",
      },
      windowControls: {
        minimize: { label: "_", title: "최소화" },
        maximize: { label: "□", title: "최대화/복원" },
        close: { label: "X", title: "닫기" },
      },
    },
    leftNav: {
      toggle: {
        open: "열기",
        close: "접기",
      },
      items: {
        default: [
          { key: "camera", label: "카메라 도구" },
          { key: "tools", label: "측정 도구" },
        ],
        recipe: [
          { key: "recipe-list", label: "레시피 목록" },
          { key: "version", label: "버전" },
          { key: "export", label: "내보내기" },
        ],
      },
      cameraTools: {
        grid: "Show / Hide Grid",
        cross: "Show / Hide Cross",
        saveImage: "Save Image",
        loadImage: "Load Image",
        videoStart: "영상 출력 시작",
        videoStop: "영상 출력 중지",
      },
      measureTools: {
        distance: "Distance",
        circle: "Circle",
        width: "Width",
        height: "Height",
        angle: "Angle",
        polyline: "Polyline",
      },
    },
    rightPanel: {
      tooltipOpen: "패널 열기",
      sectionTitle: {
        position: "Position",
        jog: "JOG",
        lights: "Lights",
        camera: "Camera Settings",
        zoom: "Zoom",
        recipePlaceholder: "레시피 / 파라미터",
      },
      toggles: {
        jogEnable: "사용",
      },
      /** JOG 관련 문자열/툴팁 */
      jog: {
        /** 상태 접미사 */
        stateSuffix: {
          disabled: "(Disabled)",
          collapsed: "(Collapsed)",
        },
        /** 방향 툴팁 */
        tip: {
          moveXPlus: "Move X-",
          moveXMinus: "Move X+",
          moveYPlus: "Move Y+",
          moveYMinus: "Move Y-",
          moveXMinusYPlus: "Move X+ / Y+",
          moveXPlusYPlus: "Move X- / Y+",
          moveXMinusYMinus: "Move X+ / Y-",
          moveXPlusYMinus: "Move X- / Y-",
          moveZPlus: "Move Z+",
          moveZMinus: "Move Z-",
          stop: "Stop motion",
        },
        /** 모드/속도 라벨 + 툴팁 */
        mode: {
          jog: { label: "JOG", tip: "Continuous jog (hold to move)" },
          rel: { label: "REL", tip: "Relative move mode" },
          abs: { label: "ABS", tip: "Absolute move mode" },
        },
        speed: {
          slow: { label: "Slow", tip: "Low speed" },
          mid: { label: "Mid", tip: "Balanced speed" },
          fast: { label: "Fast", tip: "High speed" },
        },
      },
      lights: {
        channelPrefix: "CH",
      },
      cameraFields: {
        cam1Gain: "Cam1 Gain",
        cam1Exposure: "Cam1 Exposure Time",
        cam2Gain: "Cam2 Gain",
        cam2Exposure: "Cam2 Exposure Time",
      },
      recipeMessage:
        "Recipe 또는 Parameter 모드에 필요한 설정을 준비 중입니다.",
    },
  },
} as const;

export type UiText = typeof uiText;
