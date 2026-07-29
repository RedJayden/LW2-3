# 카메라 스케일 캘리브레이션 개선 계획서

> **[구현 완료 — 2026-07-22]** Phase 1/2/3 전체 구현 및 빌드 검증 완료.
> - C++: `LASERnGRAPN/Modules/Vision/CalibVision/CalibVision.h/.cpp` (신규),
>   `PortalRouterHandler.cpp` 에 `cmd.vision.autoFit / detectPattern / stageCalibStart / stageCalibStatus / stageCalibAbort` 라우팅 추가
> - Front: `CalibrationDialog.tsx` 전면 재구축(방법 선택 UI: Auto-Fit 기본 + Pattern/Stage),
>   `useCalibrationStore.ts` 확장(3개 방법 상태·시퀀스·폴링), `calibration/calibCoords.ts` (scene↔카메라 px 변환),
>   `HardwareFacade.ts` vision API 5종 추가
> - 저장 스키마: `rotation_deg` 실측값 저장, meta 에 `method`/`rms_px` 기록. 가드레일(비등방성 >1% 경고, 급변 >5% 확인) 적용.
> - 주의: 신규 C++ 소스는 UTF-8 **BOM** 필수 (BOM 없으면 MSVC가 한글 주석을 CP949로 오해석하여 컴파일 실패)

- 작성일: 2026-07-22
- 대상: Calibration Manager (Scanner / Object x20 / Object x50 프로파일)
- 관련 코드:
  - `Portal/src/ui/components/control/CalibrationDialog.tsx` (UI, 수동 오버레이·Calculate Scale)
  - `Portal/src/ui/pages/Calibration/useCalibrationStore.ts` (계산·저장·이력 스토어)
  - `VisionModule/` (C++ 카메라 모듈 — **OpenCV 이미 포함**)
  - `LASERnGRAPN/Modules/Vision/VisionBridge/` (엔진 ↔ VisionModule 브리지)
  - `LASERnGRAPN/Core/Communication/PortalRouterHandler.cpp` (웹 ↔ 엔진 라우팅)

---

## 1. 현재 방식과 문제점

### 1.1 현재 절차
1. 기지수치 타겟(예: 1.5 × 1.5 mm 사각형)을 카메라 시야에 배치
2. `Rectangle` 버튼 → 영상 위에 마우스 드래그로 사각 오버레이 작도
3. Target Width/Height(mm) 입력 → `Calculate Scale`
4. `scale = target_mm / drawn_px` 산출 → `Save Calibration`

### 1.2 문제점
| # | 문제 | 원인 | 영향 |
|---|------|------|------|
| P1 | 사각형 이외 도형(원 등) 타겟 사용 불가 | 측정 도구가 Rectangle 1종 | 현장에서 구할 수 있는 타겟 제한 |
| P2 | 드래그로 대상체 외곽에 정확히 맞추기 어려움 | 육안+마우스 수작업, 스냅 없음 | **±2~3 px 오차 상시 발생**. 스케일 2 µm/px 기준 1.5 mm 타겟에서 ±0.3 % 오차 → 전 좌표계로 전파 |
| P3 | 작업자 숙련도에 따라 결과가 달라짐 (재현성 없음) | 수작업 판독 | 캘리브레이션 이력 간 비교 불가, 품질 추적 곤란 |
| P4 | 회전(rotation) 미보정 | 축정렬 사각형만 가정, `rotation_deg: 0` 고정 저장 | 카메라-스테이지 축 틀어짐 반영 불가 |
| P5 | 검증 수단 부재 | 계산값의 신뢰도/오차 표시 없음 | 잘못된 캘리브레이션을 저장해도 인지 불가 |

---

## 2. 업계 표준 캘리브레이션 방법 조사

### 방법 A — 표준 패턴 타겟 + 자동 코너/원 검출 (머신비전 표준)
반도체·머신비전 장비에서 가장 보편적인 방식. 기지 피치의 반복 패턴 타겟을 놓고 소프트웨어가 **제어점을 전자동 검출**한다.

| 패턴 | 검출 함수 (OpenCV) | 특징 |
|------|--------------------|------|
| 체커보드 | `findChessboardCornersSB` (v4.5.1+, 서브픽셀 직접 반환) | 코너 다수 → 통계적 정밀도 최고. 전체가 보여야 함 |
| 도트 그리드(원 배열) | `findCirclesGrid` | 원 중심은 blob 중심으로 강건, 적은 프레임으로 충분 |
| ChArUco | `cv::aruco::CharucoDetector` | 부분 가림 허용, ID로 절대 위치 식별 |

- 수백 개 제어점을 한 번에 얻으므로 **Scale X/Y·회전각·렌즈 왜곡까지 한 번의 촬영으로 산출** 가능 (`calibrateCamera` 또는 단순 아핀 피팅).
- 타겟은 크롬-온-글라스 기판으로 서브미크론 정확도 제품이 상용화되어 있음 (Edmund Optics, calib.io, JD Photo Data 등).
- 정밀도: 서브픽셀(0.1 px 이하) — 수동 드래그(±2~3 px) 대비 1/20 이상 개선.

### 방법 B — 스테이지 이동 기반 자동 캘리브레이션 (반도체 장비 표준)
웨이퍼 얼라이너·다이본더·현미경 장비(SerialEM, MBF 등)에서 쓰는 방식. **별도 타겟이 필요 없다.**

1. 시야 내 임의 특징(현재 시편의 아무 무늬)을 템플릿으로 캡처
2. 스테이지를 기지 거리(예: X +0.5 mm) 이동 → 템플릿 매칭으로 픽셀 변위 측정
3. `scale = 스테이지 이동량(mm) / 픽셀 변위(px)`
4. X/Y 각각 수행하면 Scale X/Y + **카메라-스테이지 축 회전각**까지 동시 산출

- 본 장비는 서보 XYZ 스테이지 + Jog 제어가 이미 있으므로 추가 하드웨어 없이 구현 가능.
- 기준이 "스테이지 인코더 정밀도"이므로 타겟 제작 공차와 무관 — 스케일 기준이 실제 가공 좌표계와 동일해지는 장점.
- 여러 스텝(예: ±0.2/0.5/1.0 mm)을 반복해 최소자승 피팅하면 반복정밀도 검증(RMS 오차)도 자동으로 나옴.

### 방법 C — 단일 피처 자동 피팅 (현 방식의 직접 개선)
기존처럼 단일 사각형/원 타겟을 쓰되, 사용자의 드래그를 "대략적 ROI 지정"으로만 쓰고 정밀 외곽은 알고리즘이 잡는다.

- 사각형: ROI 내 `threshold/Canny` → `findContours` → `minAreaRect` (회전 사각형, 서브픽셀 에지 보간)
- 원: `HoughCircles` 또는 컨투어 → `fitEllipse` (타원 피팅으로 원 중심·지름 서브픽셀 산출)
- 클릭 한 번(피처 내부 클릭)만으로 자동 검출 → 오버레이가 스냅되어 표시 → 사용자는 확인만

---

## 3. 개선 방안 (단계별 로드맵)

> 공통 아키텍처: 검출 연산은 **VisionModule(C++/OpenCV)** 에 두고,
> `Portal → PortalRouterHandler → VisionBridge → VisionModule` 경로로 명령/결과를 주고받는다.
> 프론트에서 opencv.js를 새로 도입하지 않는다(번들 비대·중복 방지, 네이티브가 이미 프레임을 보유).

### Phase 1 — Auto-Fit 검출 (P1·P2 해소, 최우선)
현 UI 골격을 유지하면서 "드래그로 정확히 맞추기"를 제거한다.

| 항목 | 내용 |
|------|------|
| 도형 지원 | Rectangle + **Circle** 측정 모드 추가 (ToggleButton 확장) |
| 조작 | ① 대상 위를 대략 드래그(느슨한 ROI) 또는 ② 대상 내부 원클릭 → `vision.autoFit` 요청 |
| 네이티브 | `VisionModule`에 `AutoFitShape(roi, shapeHint)` API 추가 — 사각형: `minAreaRect`, 원: `fitEllipse`, 에지 서브픽셀 보간 |
| 결과 | 검출된 도형(px 치수, 중심, 회전각, 피팅 RMS)을 반환 → fabric 오버레이가 결과에 스냅 |
| 폴백 | 검출 실패 시 기존 수동 오버레이 + 핸들 미세조정 유지 |
| 계산 | 원 타겟: `scale = target_diameter_mm / detected_diameter_px` (X/Y는 타원 장·단축으로 개별 산출) |
| 디자인 패턴 | **Strategy** — `IShapeFitStrategy` (RectFit / CircleFit) 교체 가능 구조, Doxygen 주석 |

### Phase 2 — 표준 패턴 원클릭 캘리브레이션 (정밀도·재현성 확보)
| 항목 | 내용 |
|------|------|
| 타겟 | 체커보드 또는 도트 그리드 (피치 기지, 예: 0.5 mm) — 크롬-온-글라스 권장 |
| 조작 | 패턴 종류·피치 선택 → **버튼 1회** → 전자동 검출·계산 |
| 네이티브 | `findChessboardCornersSB` / `findCirclesGrid` → 격자점 대응으로 아핀 피팅 → Scale X/Y + **rotation_deg** + RMS 오차 |
| 저장 | 기존 `calibration.rotation_deg`(현재 0 고정)에 실측 회전각 저장 — 스키마 변경 불필요 |
| 확장 | 격자점 잔차로 렌즈 왜곡 맵 산출 가능 → 기존 문서 `[보정 왜곡] 카메라 영상 외곽 영역…계획서.md`의 왜곡 보정 과제와 연계 |

### Phase 3 (선택) — 스테이지 이동 자동 캘리브레이션 (타겟 프리)
| 항목 | 내용 |
|------|------|
| 조작 | "Auto Calibrate (Stage)" 버튼 1회 — 시편 교체·타겟 불필요 |
| 시퀀스 | 템플릿 캡처 → X축 ±스텝 이동·매칭 → Y축 반복 → 원위치 복귀 → 최소자승 피팅 |
| 네이티브 | `matchTemplate`(+ 서브픽셀 보간) — VisionModule에 이미 OpenCV 존재 |
| 안전 | 이동 범위 소프트리밋 내 제한, E-Stop 연동, 이동 전 확인 다이얼로그 |
| 부가 효과 | 카메라-스테이지 축 회전각 실측, Object/Scanner 프로파일별 반복 실행으로 교차 검증 |

권장 순서: **Phase 1 → 2**는 필수, Phase 3는 운영 편의성 요구 시. Phase 1만으로도 P1·P2가 즉시 해소된다.

---

## 4. UI/UX 개선안 (모던 관점)

### 4.1 워크플로: 위저드(Stepper)화
현재는 버튼·입력이 한 패널에 평면 나열되어 순서를 외워야 한다. 4단계 스테퍼로 재구성:

```
[1] Target 선택 ─ [2] Detect ─ [3] Review ─ [4] Save
 도형/패턴·치수      자동 검출      결과 확인      저장·이력
 (프리셋 칩:         (원클릭,       (신·구 비교,
  1.5mm □, Ø1.0 …)   진행 표시)     오차 표시)
```

- 각 단계 완료 조건이 명확해 P3(작업자 편차)를 절차적으로도 억제.
- 프리셋 칩(예: `1.5 × 1.5 □`, `Ø 1.0`) + 최근 사용값 기억 → Target 치수 반복 입력 제거.

### 4.2 검출·확인 단계
- **오버레이 자동 스냅**: 검출 결과에 오버레이가 애니메이션으로 스냅, 검출 신뢰도(피팅 RMS px)를 배지로 표시.
- **돋보기(Loupe)**: 수동 미세조정 시 커서 주변 확대 렌즈 표시 — 드래그 정밀도 보조(폴백 경로 UX).
- **핸들 키보드 미세조정**: 화살표 키 1 px / Shift+화살표 0.1 px 이동.

### 4.3 결과 검증(가드레일) — P5 해소
- Scale X/Y 편차가 임계(예: 1 %) 초과 시 경고 배지("비등방성 감지 — 타겟 기울어짐 또는 광학계 확인").
- 직전 저장값 대비 변화율 표시(예: `Scale X: 0.002108 → 0.002121 (+0.6 %)`), 급변(예: >5 %) 시 저장 전 확인 요구.
- History 항목에 스케일 값·검출 방법·RMS를 함께 표기(현재는 시각·작업자만 표시).

### 4.4 소소한 정리
- `Overlay Width/Height (px)` 수동 입력란은 Advanced 접힘 영역으로 이동(자동 검출 도입 후 주 경로에서 제외).
- Calculated Scale은 µm/px 병기 표시(0.0021 mm/px보다 2.1 µm/px가 판독 용이).
- Save 성공 시 토스트 + History 자동 하이라이트(현재 스크롤·구분 약함).

---

## 5. 구현 작업 목록 (Phase 1 기준)

| # | 작업 | 위치 | 규모 |
|---|------|------|------|
| 1 | `AutoFitShape` API (Strategy 패턴, Doxygen) | `VisionModule` | 중 |
| 2 | VisionBridge·PortalRouterHandler 명령 라우팅 (`vision.autoFit`) | `LASERnGRAPN` | 소 |
| 3 | Circle 측정 모드 + 원클릭 검출 UX | `CalibrationDialog.tsx`, `useCanvasEvents.ts` | 중 |
| 4 | 오버레이 스냅·RMS 배지·가드레일(4.3) | `CalibrationDialog.tsx`, `useCalibrationStore.ts` | 중 |
| 5 | 프리셋 칩·최근값 기억 | `useCalibrationStore.ts` | 소 |
| 6 | C++ 리빌드 → `Bin` 배포, vite build → `Bin/web` robocopy | 빌드 파이프라인 | — |

리스크: ① 조명·초점 불량 시 검출 실패 → 폴백(수동+Loupe) 경로 필수 유지, ② 자동 검출 결과를 무조건 신뢰하지 않도록 Review 단계에서 오버레이 육안 확인을 강제.

---

## 6. 참고 자료
- [OpenCV Camera Calibration 튜토리얼](https://docs.opencv.org/4.13.0/dc/dbb/tutorial_py_calibration.html) / [calib3d 모듈](https://docs.opencv.org/4.13.0/d9/d0c/group__calib3d.html) — `findChessboardCornersSB`, `findCirclesGrid`, 서브픽셀 정확도
- [MATLAB Calibration Patterns 가이드](https://www.mathworks.com/help/vision/ug/calibration-patterns.html) — 패턴별 특성 비교
- [calib.io 체커보드 타겟](https://calib.io/products/checkerboard), [Edmund Optics 체커보드 타겟](https://www.edmundoptics.com/f/checkerboard-calibration-targets/39496/), [JD Photo Data 정밀 타겟](https://jd-photodata.co.uk/vision-calibration-charts/calibration-targets.html) — 상용 크롬-온-글라스 타겟
- [SerialEM Calibration 명령](https://bio3d.colorado.edu/SerialEM/hlp/html/menu_calibration.htm), [MBF Camera-Stage Alignment](https://www.mbfbioscience.com/help/neurolucida/Content/File/Calibration/camStageAlign.htm) — 스테이지 이동 기반 캘리브레이션 실례
- [LearnOpenCV: Camera Calibration](https://learnopencv.com/camera-calibration-using-opencv/)
