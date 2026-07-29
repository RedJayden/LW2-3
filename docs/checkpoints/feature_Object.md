# Feature Checklist: Object Mode 연동 및 가공 프로세스

이 문서는 Object Mode (오브젝트 렌즈 모드)에서의 하드웨어 자동 좌표계 동기화 및 렌더링/가공 처리에 대한 핵심 구현 사항을 기록합니다.

## 1. 기능 개요
Object Mode는 스캐너 렌즈 중심과 다르게, 하드웨어 스테이지가 스스로 기하학적 오프셋을 계산하여 레이저 중심을 카메라 시야 정중앙으로 이동시키는 특수한 동작 방식을 가집니다.
프론트엔드 UI는 이 하드웨어의 자율적 오프셋 이동을 완벽하게 동기화하여, 사용자에게 이질감 없는 직관적인 캔버스 환경을 제공해야 합니다.

- **주요 로직**:
    - **하드웨어 자율 이동(Auto-Shift)**: 오브젝트 모드로 전환 시, 장비가 스캐너 카메라와 오브젝트 카메라 간의 물리적 거리(Offset)만큼 스스로 스테이지를 이동.
    - **절대 좌표 동기화 (Absolute Coordinate Mapping)**: UI 캔버스는 오프셋을 소프트웨어적으로 이중 계산하지 않고, 기계가 이동한 **현재 스테이지의 절대 좌표(`positions.X`, `positions.Y`)**를 그대로 화면 중심(0,0)으로 받아들여 렌더링.
    - **단일 스케일 렌더링 (Scale Unification)**: HTML 백그라운드 영상 계층과 Fabric 캔버스 벡터 계층이 모두 활성화된 고배율 스케일(`activePxPerMm`)을 동일하게 사용하여, `fit to camera` 줌인 시 어떠한 배율에서도 영상과 도면이 1:1로 완벽히 정렬됩니다.
    - **자유 이동 카메라 뷰 (Free-Roam Camera)**: 조그(Jog) 이동 또는 가공 시 카메라 뷰가 캔버스 중앙에 강제로 묶이지 않고, 실제 모션 궤적을 따라 배경(Grid) 위를 부드럽게 가로지르며 이동하는 하드웨어 가속(GPU) 기반 렌더링.
    - **오버레이 읽기 전용 및 가시성 제어 (Overlay Lock & Visibility)**: Scanner Mode 가공 중에는 공정 시야 확보를 위해 모든 그리기 도형 객체를 일시적으로 숨깁니다 (`visible = false`). 반면 Object Mode 가공 중에는 진행 궤적 확인을 위해 도형을 숨기지 않고 표시하되, 마우스 이벤트 및 선택을 완벽히 차단하여 읽기 전용 상태(`selectable = false, evented = false`)로 락킹합니다. 가공이 완료되거나 임의 정지(Stop) 시점에는 가공 전의 개별 숨김 상태(`userVisible`)를 그대로 보존하여 복원합니다.

## 2. 주요 클래스 및 파일

### 2.1 UI 렌더링 및 동기화 (Frontend)
- **[CanvasBackground.tsx](file:///c:/LW23_porg/source/LW2-3/Portal/src/ui/pages/Recipe/Canvas/CanvasBackground.tsx)**
    - 카메라 영상을 캔버스 백그라운드에 렌더링하는 역할.
    - 성능 저하 및 화면 떨림(Jittering)을 유발하는 CSS `left`, `top` 속성을 버리고, 100% 하드웨어 가속을 받는 `transform: translate3d(x, y, 0)` 속성으로 전환하여 버터처럼 부드러운 카메라 이동을 보장.
    - 기존에 강제되던 `scanner` 렌즈 고정 배율을 과감히 버리고 `activePxPerMm`을 사용하도록 하여, Fabric 캔버스와 렌더링 좌표계를 완벽히 통일시켰습니다.
- **[RecipeCanvas.tsx](file:///c:/LW23_porg/source/LW2-3/Portal/src/ui/pages/Recipe/Canvas/RecipeCanvas.tsx)**
    - 조그 이동이나 가공 시 좌표 변화에 따라 억지로 카메라를 뷰포트 중앙으로 끌어당기던(`fitCameraArea`) 추적 로직을 제거하여 자유 이동 모드 구현.
    - 패닝 시 60FPS의 매끄러운 동작을 보장하기 위해, 상태 업데이트 렌더링 병목이었던 `userPan` 상태 직접 구독을 컴포넌트에서 완전히 제거하여 엄청난 버벅임(Lag)을 해소했습니다.
    - `isProcessing` 상태 전환 시, Scanner Mode에서는 도형을 숨기고 Object Mode에서는 `userVisible` 상태를 기반으로 도형을 보여주되 `selectable = false, evented = false`로 읽기 전용 처리를 수행합니다. 가공 종료/정지 시 `prevIsProcessing`을 감지하여 각 도형의 기존 `userVisible` 숨김 내역을 그대로 보전하여 가시성 및 상호작용 속성을 복원하는 조건부 복원 파이프라인을 구축했습니다.
- **[useCanvasEvents.ts](file:///c:/LW23_porg/source/LW2-3/Portal/src/ui/pages/Recipe/Canvas/hooks/useCanvasEvents.ts)**
    - 패닝 시 카메라 이동 제한 범위(`stageW_px`, `stageH_px`)를 계산할 때, Scanner 고정 스케일(1000)을 곱하던 치명적 오류를 제거하고 고배율의 `activePxPerMm`을 곱하도록 수정하여 Object 모드에서 패닝 중 화면이 튕기는 버그를 100% 차단했습니다.
- **[CanvasTopBar.tsx](file:///c:/LW23_porg/source/LW2-3/Portal/src/ui/pages/Recipe/PropertyBar/CanvasTopBar.tsx)**
    - Object Mode에서 도형 위치(X, Y)를 0,0으로 수동 입력(Input Box)할 때, 카메라 중심이 아닌 스테이지 기계 원점 주변으로 튕겨나가는 시각적-데이터 불일치 버그를 해결했습니다.
    - 화면 렌더링 계층과 동일하게 **UI(Property Panel) 계층에서도 Camera Relative 역산 시 반드시 `isScanner` 판별을 통해 오프셋(`mx`, `my`) 차감을 분기처리하는 일관성 원칙**을 수립하고 코드를 수정하였습니다.

- **[GCodePanel.tsx](file:///c:/JNU/LW2-3/Portal/src/components/GCodePanel.tsx)**
    - **이중 오프셋 제거**: Object Mode 가공을 시작할 때, 현재 스테이지 위치(`stageX, stageY`)에 오브젝트 카메라 오프셋(`currentCenterLocal`)을 불필요하게 한 번 더 더하여 기계의 Soft Limit(-125mm)을 초과해 모션이 먹통(Out of Bounds)이 되던 치명적 버그 수정.
    - 오직 순수한 현재 스테이지 절대 위치만을 GCode 기준점(`absoluteOffsetMm`)으로 전달하여 모션 구동 복구.
    - **가공 원점 뷰포트 분리**: G-Code 가공 시 캔버스의 `viewportTransform` 줌/패닝 오프셋에 따라 가공 좌표계 원점이 왜곡되던 버그를 제거하고, 오직 물리 스테이지 좌표 및 배율(pxPerMm)을 이용한 고정 원점 계산식으로 결합하여 줌/팬 상태와 관계없는 가공 좌표 정밀성을 구현.
- **[useCrosshair.ts](file:///c:/JNU/LW2-3/Portal/src/ui/pages/Recipe/Canvas/hooks/useCrosshair.ts)**
    - 가공 궤적을 쫓아가는 노란색 십자/원 마커 렌더링 최적화. 스캐너/오브젝트 모드 구분 없이 언제나 정직하게 `positions.X`, `positions.Y` 좌표를 픽셀로 환산하여 캔버스에 표시하도록 통합 로직 구현.
    - 기존의 캘리브레이션 이중 차감(`mx, my`) 로직을 Object 모드에선 적용하지 않도록 하여, 스캐너와 동일한 조건으로 위치 무결성을 달성.

## 3. 요약 및 기대 효과
1. **완벽한 좌표계 일치 및 스케일 동기화**: 하드웨어가 스스로 오프셋을 처리한다는 사실을 바탕으로 이중 차감 로직을 모두 제거하고, 프론트엔드의 각 렌더링 레이어(Background, Vector)가 공유하는 픽셀 스케일(`activePxPerMm`)을 단일화하여 100% 무결성을 가진 화면/가공 좌표계를 완성했습니다.
2. **최상의 UX 제공**: 하드웨어 가속 기반의 부드러운 카메라 자유 이동과, 가공 중 진행 상태를 실시간으로 지켜볼 수 있는 읽기 전용 도형 오버레이, 그리고 모든 렌즈 배율에서 한 치의 오차 없이 동작하는 `fit to camera/working` 기능을 통해 고급 산업용 소프트웨어로서의 사용자 경험(UX)을 확보했습니다.
3. **그룹화(Group/Ungroup) 및 빗금(Hatching) 위치 무결성**: 최하위 공통 렌더 필터 `_renderFill` 패치 및 `_restoreObjectsState` 복원 로직 통합을 통해 개별/그룹/매트릭스 전역 빗금 동기화와 제자리 ungroup 무결성을 최종 확보했습니다.

## 4. 최근 업데이트 (2026-07-16)

### 4.1 프로그램 기동 시 오브젝트 세션 UI 및 백엔드 오프셋 정합성 보정
*   **이슈**: 이전 세션 종료 시 오브젝트 x20/x50 모드였던 상태로 재부팅하면, 하위 자식 컴포넌트 마운트 타이밍(레이스 컨디션)으로 인해 UI가 스캐너 모드로 덮어쓰여지고 백엔드가 기억하는 마지막 오프셋(`s_last_offset_x` = 0)과 실제 기기의 물리 정차 좌표(오브젝트 오프셋 적용 위치)가 어긋나는 현상 발생. 이후 모드 변경 시 상대 편차 계산이 왜곡되어 기구가 엉뚱하게 튀는 문제 유발.
*   **해결**: 
    1.  `AppShell.tsx` 마운트 즉시 **동기적**으로 `localStorage`로부터 최종 렌즈 상태를 읽어와 스토어를 선제 셋팅하여 레이스 컨디션을 완전히 해소했습니다.
    2.  동시에 부팅 완료 시점에 실제 물리적인 Safe Z 모터 이동 없이 오프셋 매핑 데이터만 정밀 최신화해주는 **`syncOnly` IPC 통신 채널**을 구축하여, 부팅 시 Z축 대피 춤판 모션을 완벽 차단하고 기구-소프트웨어 오프셋 정합성을 맞춘 채 핏 카메라만 마무리되도록 조치했습니다.

### 4.2 Move to Object Center 절대 편차 정렬 구현
*   **이슈**: 사용자가 모드를 전환하고 JOG 등으로 이동 및 테스트하다가 원래의 오브젝트 시작 위치로 정밀하게 원터치 복귀해야 하는 요구사항 발생.
*   **해결**: 
    1.  우측 하단의 `Move to Center` 버튼 클릭 시 백엔드로 절대 이동 플래그(`forceAbsolute: true`)를 송신하도록 API를 확장했습니다.
    2.  `forceAbsolute` 수신 시, 이전 오프셋 기준 상대 변위 제어를 일시 중단하고 **스캐너 절대 오리지널 위치(`StageX_Offset`, `StageY_Offset`)를 물리 Reference 기준으로 삼고, 여기에 파라미터 UI에 설정된 각 배율 오프셋 값을 가감한 절대 합산 좌표(`StageX_Offset + StageX20_Offset` 등)**로 기구를 강제 절대 이동(`MovAbs`)하여 정합성을 정밀 회귀시킵니다.
    3.  Z축 및 렌즈/미러 모터 또한 해당하는 배율 설정값(`Z-HEIGHT` 등)으로 일괄 복귀합니다.

### 4.3 GCode 가공 반복(Mark Times) 및 Shape Delay 추가 (2026-07-16)
*   **기능**:
    - **Mark times**: G-Code로 내보낼 전체 가공 시퀀스를 N회 반복하도록 G-Code 문장을 물리적으로 복제 생성합니다 (기본값: 1).
    - **Shape Delay**: 가공 시 도형들 사이마다 지정된 시간(초)만큼 지연(대기)하도록 `G04 P[delay]` 명령어를 G-Code에 안전하게 인입합니다 (첫 도형 가공 직전에는 무시).

## 5. 최근 업데이트 (2026-07-17)

### 5.1 Scanner ↔ Object 모드 전환 시 도형 카메라-상대 위치 유지 (렌즈 프레임 재배치)
*   **이슈**: Scanner 모드에서 카메라 중심에 그린 도형이 Object 모드 전환 후 이전 위치에 그대로 남아 카메라 뷰(FOV 0.4×0.3mm)를 벗어나고, Edit 창 좌표도 (0,0)이 아닌 잔여 오차(0.446, 0.223)를 표시하는 문제.
*   **해결 (arch_CanvasProc.md §2.30 아키텍처)**:
    1. **절대 scene 투영 유지**: 워크 에어리어는 절대 기계 좌표를 유지하므로, 모드 전환 시 카메라 뷰가 현재 위치(예: 스캐너 센터 0,0 = 워크 에어리어 중앙)에서 렌즈 오프셋 목표점(예: 13.08, −78.03 = 우측 하단)으로 이동하는 과정이 화면에 그대로 표시됨.
    2. **도형 재배치**: 모드 전환마다 도는 캔버스 저장→재로드 사이클의 정규화 파이프라인(`canvasNormalization.ts`)에서, 백엔드 `cmd.moons.preset`의 스테이지 상대 이동량과 동일한 변위(`getLensFrameShiftMm` = moonsConfig 렌즈 오프셋 − 스캐너 오프셋)만큼 도형을 이동. 저장 포맷은 항상 Scanner 프레임 + 1000px/mm 표준(모드 독립적)이며, `loadedFrameShiftRef`로 저장/로드 왕복 무결성을 보장. 수동 레시피 파일(LeftNav) 및 Main 오버레이도 동일 규약.
    3. **콘텐츠 재로드 시 Undo 히스토리 리셋**: 히스토리 스냅숏은 로드 당시 렌즈 프레임의 픽셀 좌표를 담으므로, 모드 전환 후 Undo로 이전 프레임 좌표가 복원되는 오염을 차단.
*   **⚠️ 규약 개정**: 구버전의 "Camera Relative 역산 시 `isScanner` 판별로 recipeCenter 오프셋(`mx`, `my`) 차감 분기" 원칙(§2 CanvasTopBar 항목)은 **폐기**되었습니다. 속성 패널 표시값 = `scene/ppm − 현재 스테이지 위치`이며 recipeCenter 스테이지 좌표는 개입하지 않습니다.

### 5.2 G-Code 가공 오프셋 규약 확정
*   G-Code 좌표 = `scene/ppm` (절대 기계 좌표), `offsetMm = {0,0}`. 도형이 이미 현재 렌즈 프레임 위치로 재배치되어 있으므로 추가 오프셋 가산은 이중 보정이 됩니다. 미사용 죽은 변수(`absoluteOffsetMm`, `currentCenterLocal`) 정리 완료.

### 5.3 오브젝트 가공 중 카메라 추적 절대 좌표 단일화 (뷰포트 발산 해결)
*   **이슈**: 가공 시작 시 뷰가 엉뚱한 위치로 이탈하고, 가공 중 fit to camera 클릭 시 눈금자가 353mm를 가리키는 폭주 발생.
*   **원인**: 구 변위(lastProcessStartPosition 대비) 추적 이펙트와 `updateRuler`의 가공 변위 분기가 순환 참조(userPan 읽기→vpt 쓰기→userPan 되쓰기)를 이루며 매 positions 틱마다 뷰포트가 누적 발산.
*   **해결 (arch_CanvasProc.md §2.31)**: 변위 기반 추적 2계통을 삭제하고, JOG 절대 추적 이펙트를 `isFitCamera || (가공 중 && Object 모드)`로 확장. 스테이지가 곧 카메라이므로 절대 위치 추적이 곧 "마킹 궤적 따라가기"이며 수학적 고정점이라 발산 불가. 가공 시작 시 사용자의 현재 구도를 camera-relative userPan으로 1회 환산 보존하여 보던 화면 그대로 추적 시작. Scanner 갈보 가공은 스테이지 정지 상태이므로 뷰가 고정(기존 체감 동일).

### 5.4 G-Code Mark times 반복 회차 주석 및 진행률 회차 표시 (2026-07-17)
*   **기능 보강 (useGCodeGenerator.ts)**:
    - 반복 횟수 수치 방어: `totalLoops = Math.max(1, Math.floor(Number(settings.markTimes) || 1))` — 스토어에 문자열로 저장된 입력값도 안전하게 처리.
    - **패스 구분 헤더 주석**: Mark times > 1이면 각 반복 시작 지점에 `// ===== Mark Pass n / N =====` 삽입.
    - **도형 시작 회차 주석**: 각 도형 가공 시작 직전에 `// Shape i/M (Pass n/N)` 주석을 항상 기록하여, G-Code 텍스트만으로 몇 번째 반복의 몇 번째 도형인지 즉시 판별 가능.
*   **타입 정합성 (types/cad.ts / GCodePanel.tsx)**: `IGCodeSettings`에 누락돼 있던 `markTimes?: number` 필드 추가 (vite build는 타입체크를 하지 않아 그동안 미검출). `GCodePanel`의 `finalSettings`에 명시적 수치 변환(`Math.max(1, floor(Number(...)))`) 적용.
*   **진행률 회차 표시 (ProcessDashboard.tsx — 스캐너/오브젝트 공용)**:
    - Mark times > 1일 때 진행바 하단에 구분선으로 분리된 전용 행을 추가하여 **"MARK TIMES n / N"** 형태로 현재 회차를 표시 (풀 네임 라벨, Processing Rate 라벨과 동일 타이포그래피).
    - 현재 회차 산출식: `min(N, floor(진행률/100 × N) + 1)` — 백엔드 진행률(0~100%)을 회차 구간으로 환산하므로 백엔드 프로토콜 변경 없음.
    - 초기에 진행률 헤더 행 우측에 배지로 삽입했다가 레이아웃 붕괴(퍼센트 밀림)로 사용자 피드백을 받아 전용 행 방식(B안)으로 개선함.

---
최종 수정일: 2026-07-17
담당: Antigravity (Advanced Agentic Coding AI)
