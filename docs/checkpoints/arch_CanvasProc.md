# Scanner Processing Coordinate Synchronization Architecture & Fixes

이 문서는 스캐너 중심 위치 오류, 가공 도형 좌표 왜곡 및 UI 측정 오버레이 필터링 관련 버그 수정과 구조적 개선 사항을 정리한 내용입니다.

## 1. 개요
* **목표**: Laser Set Center에서 보정한 카메라 뷰포트와 물리적 갈보 레이저의 영점(0,0)을 정확히 일치시키고, 재시작 및 모션 이동 시에도 이 정렬 상태를 완벽히 유지하는 것.
* **주요 문제점**:
    1. 측정 도구(자주색 오버레이) 및 텍스트가 가공 변환 도형에 포함되어 불필요하게 가공됨.
    2. 회전된 선(Line) 가공 시 Fabric.js Bounding Box 계산 오류로 인한 기하학적 왜곡.
    3. 프로그램 재시작 시, 카메라 영상의 미세 캘리브레이션 오프셋(Digital Panning) 정보가 소실되어, UI에 표시된 도형과 실제 가공 위치가 미세하게 어긋나는 현상.
    4. 눈금자(Ruler) 단위가 배율(x20, x50)에 따라 올바르게 표시되지 않거나 스케일이 일치하지 않는 문제.
    5. 도형 숨기기(Hide) 기능이 가공 프로세스와 UI(Layer List) 간에 완벽하게 동기화되지 않는 문제.

## 2. 세부 문제 및 아키텍처 해결 방안

### 2.1 가공 경로 생성 시 UI/측정 도구 오버레이 필터링
* **이슈**: 스캐너(Scanner) 및 오브젝트(Object) 가공 명령을 생성할 때 캔버스에 존재하는 보조 도구(가이드라인, 측정선, 치수 텍스트)가 G-Code/스캐너 명령으로 함께 생성되는 버그.
* **해결 (ScannerGenerator.ts / useGCodeGenerator.ts)**:
    - `isMeasurement`, `isGuide`, `isTemp`, `isCrosshair` 속성이 명시된 모든 객체(및 Group 내부 요소)를 필터링하는 강력한 재귀(Recursive) 필터링 로직 도입.
    - 단순히 `visible` 속성에만 의존하지 않고 객체의 생성 목적(Intent)을 기준으로 가공 대상을 철저히 분리.

### 2.2 선(Line) 기하학적 변환 정확도 개선
* **이슈**: Fabric.js에서 회전이 적용된 Line 객체를 Paper.js 등 가공 라이브러리로 변환할 때, Stroke Width에 의해 부풀려진 Bounding Box 넓이와 높이를 기반으로 수동 계산하여 양 끝점의 위치가 왜곡됨.
* **해결 (FabricToPaperAdapter.ts)**:
    - 수동 Width/Height 뺄셈 연산을 버리고, Fabric.js 내장 함수인 `line.calcLinePoints()`를 사용하여 Stroke와 상관없는 기하학적 원본 좌표를 추출하여 완벽한 수학적 회전 및 스케일을 유지하도록 리팩토링.

### 2.3 레이저 센터 미세 오프셋 동기화 및 영구 보존
* **이슈**: `Laser Set Center` 기능을 통해 카메라 십자선을 레이저 타각점과 완벽히 일치시키면 화면 상으로는 정렬되어 보이나(Digital Panning), 앱 재시작 시 이 상태가 C++ 메모리에서 날아가 캔버스 기준점(0,0)과 실제 하드웨어 0점이 조립 단차만큼 틀어지는 현상.
* **해결 (appStore.ts / LaserSetCenterDialog.tsx / RecipeCanvas.tsx)**:
    - **Single Source of Truth 전환**: 백엔드 C++ 메모리 폴링에 의존하던 렌즈 캘리브레이션 오프셋 로직을 프론트엔드의 영구 설정 파일인 `Bin/Config/RecipeCenter.json`에 직접 기록하고 읽어오도록 아키텍처 대공사.
    - **RecipeCenter 상태 확장**: `appStore.ts`의 `recipeCenter` 객체에 각 렌즈 모드(`scanner`, `object_x20`, `object_x50`) 별로 `pixelX`, `pixelY`, `viewRatio`를 독립적으로 저장.
    - **완벽한 상태 복원**: 앱 실행 시 `RecipeCanvas.tsx`가 `RecipeCenter.json`을 단방향(Reactive)으로 구독하여, 로드되는 즉시 프론트엔드가 자율적으로 렌즈를 디지털 이동(Panning)시킴.
    - **다이얼로그 상태 보존 (LaserSetCenterDialog.tsx)**: 설정 창을 열 때 기존의 카메라 패닝(ROI) 상태가 초기화되어 화면이 튀는 버그를 수정. `active=false` 강제 리셋을 제거하여 사용자가 보던 화면 그대로 설정 시작 가능.
    - **초기 상태 방어(Edge Case)**: 백엔드나 저장소에 데이터가 없는 초기 상태`(0,0)`를 좌측 최상단으로 오인하여 화면이 구석으로 쏠리는 버그를 사전 차단하기 위해, 빈 값일 경우 하드웨어 렌즈의 기하학적 중앙인 `(W/2, H/2)`로 자동 치환하도록 안전 장치 추가.

### 2.4 가공 정밀도 및 하드웨어 가속 최적화 (CIRCLE & Flatten)
* **이슈**: 
    1. 정원(Circle) 가공 시 수많은 직선(Line) 분절로 처리되어 가공 면이 거칠고 데이터량이 방대함.
    2. Arc 도형이 정원으로 잘못 인식되어 가공되는 회귀 버그 발생.
    3. 너무 과도한 정밀도 설정(0.01)으로 인해 한 도형당 2000개 이상의 커맨드가 생성되어 컨트롤러가 멈추는 현상.
* **해결 (ScannerGenerator.ts / FabricToPaperAdapter.ts)**:
    - **네이티브 CIRCLE 명령 도입**: 일정한 스케일의 정원일 경우 `Paper.js`의 분절 과정을 건너뛰고 하드웨어 직결 `CIRCLE` 명령을 방출하여 속도와 품질을 동시에 확보.
    - **Arc/Circle 엄격 구분**: `||` 연산자 버그(endAngle=0이 360으로 오인됨)를 `??`로 수정하고, `% 360` 정규화 로직을 도입하여 0도부터 360도까지의 모든 원호 구간을 정확히 판별.
    - **Flatten 정밀도 최적화**: 허용 오차를 `0.01`에서 `0.1`로 조정. 이는 기존(0.25)보다 2.5배 정밀하면서도, 시스템 멈춤을 유발하던 과도한 세그먼트 생성을 억제하는 황금비율 설정.
    - **디버그 시스템 강화**: `convertLine` 및 `runContiguousLines`에 NaN 검출 및 좌표 추적 로그를 추가하여 간헐적인 가공 누락 문제 추적 기반 마련.

### 2.5 UI 가시성(Show/Hide) 및 눈금자 정밀도 개선 (가공 전후 숨김 상태 유지 포함)
* **이슈**: 배율 전환 시 눈금자의 스케일 불일치 및 가공 중/종료 시 도형 가시성(Hide/Show)과 선택 차단 기능 유실, 그리고 가공이 끝나면 기존에 숨겨두었던 도형까지 강제로 보이고 선택 불가능하게 락인(Lock-in)되는 버그 발생.
* **해결 (Ruler.tsx / useCanvasStore.ts / ScannerPanel.tsx / useGCodeGenerator.ts / RecipeCanvas.tsx / LayerList.tsx)**:
    - **동적 Ruler 스케일링**: 하드코딩된 `PX_PER_MM` 상수를 제거하고 `useCanvasStore`의 현재 배율 정보를 동적으로 구독하도록 수정. 고배율(x20, x50) 시 단위 표시를 `mm`에서 `μm`로 자동 변환하여 정밀한 측정 UI 제공.
    - **Master Visibility Switch 구조화**: `showHiddenObjects`를 `allObjectsHidden`으로 리네이밍하여 직관성을 높이고, "전체 숨김" 모드(체크됨) 시 모든 객체를 화면과 가공 대상에서 제외하는 통합 제어 로직 구축.
    - **가공 필터링 무결성**: Scanner 및 Object 가공 패널 모두에서 `allObjectsHidden` 상태를 최우선적으로 확인하여, 사용자가 의도적으로 숨긴 상태에서는 가공 명령이 생성되지 않도록 안전 장치 강화.
    - **UI 동기화 (Layer List)**: 개별 레이어의 가시성 토글이 마스터 "전체 숨김" 상태와 실시간으로 연동되도록 `LayerList.tsx`의 상태 감지 로직을 개선.
    - **가공 종료/임의 정지 시 상태 복원 및 사용자 의도 보존**: 
      - 가공 중(Scanner Mode)에는 모든 그리기 객체를 숨기고(`visible = false`), Object Mode에서는 읽기 전용 상태(`selectable = false, evented = false`)를 유지하도록 구현했습니다. **(참고: Scanner Mode의 객체 숨김 처리는 진행 상태 파악을 위한 정상적인 예외 규약으로 합의되어 유지됩니다.)**
      - 가공이 완료되거나 가공 중 **임의 정지(Stop)** 버튼을 클릭하여 중단될 경우, `prevIsProcessing` Ref를 활용하여 가공 상태 트랜지션(`true -> false`)을 감지합니다.
      - 상태 복원 시 각 도형 객체의 가공 전 개별 숨김 설정(`userVisible`)을 훼손하지 않고 보존하여 조건부로 가시성 및 편집 속성을 할당합니다:
        ```typescript
        const intentVisible = obj.userVisible !== false;
        obj.visible = intentVisible;
        obj.selectable = intentVisible;
        obj.evented = intentVisible;
        ```
      - 이로써 가공 전에 숨겨두었던 도형들은 가공이 끝나거나 수동으로 정지한 후에도 숨김 상태를 완벽히 유지하고 편집이 차단되며, 노출 상태였던 도형만 정상 편집 가능하게 활성화됩니다.
    - **가시성 토글 시 상호작용 속성 연동**: `LayerList.tsx`의 `toggleVisibility` 및 `toggleLayerVisibility` 동작 시 가시성 여부에 따라 `selectable`과 `evented` 속성이 현재 가공 진행 상태(`isProcessing`)에 연계하여 안전하게 갱신되도록 조치했습니다. (참고: 초기 구현에 존재하던 리뷰 모드 `isReviewMode` 연동은 §2.28에서 기능 폐기와 함께 제거되었습니다.)

### 2.6 줌/패닝 상태의 페이지별 독립성 및 세션 기반 수명주기 관리
* **이슈**:
    1. 각 페이지의 줌 상태가 탭 전환 시 간섭받거나 유실되는 현상.
    2. 새로 마운트되는 페이지에 저장된 줌 상태(작업 영역 핏 등)가 우선 복원되어, 저장된 이력이 없는 최초 진입 페이지들이 기본값인 `Fit to Camera FOV`로 깔끔하게 시작하지 못하고 줌아웃된 채 정체되는 문제.
    3. 뷰 상태가 로컬스토리지에 영구 보존되어 프로그램 종료 후 재기동 시에도 이전 세션의 임의 줌아웃 상태가 억지로 복원되는 최초 기동 정합성 위배 문제.
* **해결 (useCanvasStore.ts / RecipeCanvas.tsx)**:
    - **Scope 공간 분리 및 덮어쓰기 차단**: `viewStates`의 식별 키를 `[Scope]:[Tab]` 형태로 분리하고 `currentZoom !== 1` 가드를 도입하여 뷰 저장 왜곡을 방지합니다.
    - **초기화 및 복원 로직 이원화 (Bifurcated Lifecycle)**:
      - **기 방문 페이지**: 탭 전환(`isScopeSwitch === true`) 시 이전에 해당 탭에서 사용자가 조작하여 저장해 둔 개별 커스텀 줌과 패닝 오프셋을 딜레이 없이 즉시 복원하여 이전 상태 그대로 노출합니다. (순수 모드 체인지 시에만 2단계 시각화 핏 수행)
      - **미방문/최초 진입 페이지**: 저장된 줌 이력이 없을 경우(`!state || state.zoom === 0`)에는 2단계 모션 시뮬레이션을 건너뛰고 **즉시 `Fit to Camera FOV`** (`fitCameraArea(false)`)를 강제 적용하여 카메라 핏 상태에서 즉각 기동되도록 교정하였습니다.
    - **sessionStorage 기반 세션 스토리지 전환**: 뷰포트 임시 상태 저장 매체를 `localStorage`에서 브라우저 세션을 따르는 `sessionStorage`로 전면 교체하였습니다. 이를 통해 프로그램 실행 중에는 개별 줌 메모리가 정상 공유되지만, **프로그램 종료(창 닫기) 시 세션이 자동 만료되어 뷰포트 상태 데이터가 완전 소멸**되며, 다음 최초 실행 시 모든 탭이 깨끗하게 기본 `Fit to Camera FOV` 정렬 상태로 시작하는 아키텍처적 일관성을 확보하였습니다.

### 2.7 캔버스 뷰포트 쉬프트(Shift) 및 `userPan` 상태 꼬임 해결
* **이슈**: `Fit to camera` 또는 `Fit to working` 상태에서 다른 화면(Recipe <-> Main)으로 페이지를 전환하고 돌아오면 비디오 영상이나 캔버스 격자가 정중앙에서 벗어나 한쪽으로 치우치는 현상.
* **해결 (RecipeCanvas.tsx)**: 
    - 뷰포트 피팅(`fitScreen`, `fitCameraArea`) 시 Zustand 스토어의 `userPan` 상태값을 즉시 `{ x: 0, y: 0 }`으로 리셋하는 동기화 로직 추가.
    - 페이지 언마운트 시 오염된 `userPan` 값이 저장되어 재진입 시 화면이 튀는 근본적인 원인을 제거.

### 2.8 Laser Set Center 저장 시 장비 오리지널 파라미터 오염 격리
* **이슈**: `Laser Set Center`에서 계산된 오프셋 값이 하드웨어 INI(`moonsConfig`의 `stage original center`)에 강제로 덮어씌워져 장비 고유의 물리적 원점이 영구 변조되는 치명적 버그.
* **해결 (LaserSetCenterDialog.tsx / appStore.ts)**:
    - 프론트엔드 비즈니스 로직에서 하드웨어 설정을 변경하고 저장하던 통신 블록(`setMoonsConfig` 호출)을 통째로 삭제.
    - 레이저 센터 오프셋을 위한 순수 보정 모션 데이터는 프론트엔드의 `recipeCenter` 상태(개별 키값)에만 저장되도록 수정하여, 가공 명령어 생성 시 보상 용도로만 격리되게 완벽 조치.
    - `initRecipeCenterFromConfig` 초기화 시 캘리브레이션 이력 파일이 존재하면 하드웨어 파라미터로 덮어쓰지 않고 안전하게 보존하도록 수정.

### 2.9 이동 중 화면 떨림(Jittering) 방지 및 락킹(Lock) 구조 이원화
* **이슈**: 
    1. 조그(JOG) 이동 시 화면이 억지로 중앙에 고정되려 할 때 발생하는 추적 떨림(Chasing Jitter) 현상 및 가공 진행 중 시인성 유실 문제.
    2. 사용자 요구사항에 따라 `Fit to Camera` 모드에서는 카메라 뷰가 정중앙에 고정(격자 이동)되어야 하나, 이 정렬 갱신 과정에서 리렌더링 및 Zustand 상태 전파(파일 쓰기 등) 랙으로 인해 화면이 심하게 떨리는 문제.
* **해결 (CanvasBackground.tsx / RecipeCanvas.tsx)**:
    - **락킹 및 자유 이동 이원화 설계**: 
      - `Fit to Camera` 활성화 상태(`isFitCamera === true`): JOG 이동 시 카메라 뷰 영역과 십자선이 캔버스 중앙에 완벽하게 락킹(Lock)됩니다.
      - 수동 줌 조작 등으로 인한 일반 상태(`isFitCamera === false`): 캔버스 그리드는 고정되고 카메라 영상 영역이 JOG 궤적을 지시하며 자유롭게 이동하도록 분리 개선하여 공정 안정성과 시야 가시성을 동시에 확보하였습니다.
    - **Bypass Direct 갱신을 통한 Jittering 제거**: JOG 이동 좌표가 고주파(1초에 60회 이상)로 변하는 동안 무거운 React 상태 갱신 및 저장소 Persist 작업을 바이패스하고, Fabric 캔버스 뷰포트 변환 행렬(`vpt`)과 룰러(`updateRuler`)를 직접 다이렉트 갱신하고 `canvas.requestRenderAll()` 및 `transformed` 이벤트를 수동 방출하도록 구현하여, **60FPS의 미끄러지듯 부드럽고 떨림 없는 카메라 중앙 고정 뷰**를 완성하였습니다.
    - **하드웨어 가속 렌더링**: 영상 이동 시 `transform: translate3d(x, y, 0)` 속성을 사용하여 떨림 없는 부드러운 하드웨어 가속 렌더링을 보장합니다.
    - **도형 Read-Only 처리**: 가공 상태일 때 도형 숨김을 제거하고 이벤트 속성만 차단하여 진행 상황 모니터링을 돕습니다.

### 2.10 캔버스 뷰포트(Zoom/Pan) 조작과 가공 명령어 물리 좌표계 분리
* **이슈**: `Fit to camera` 및 `Fit to working` 혹은 사용자의 수동 화면 조작(Panning/Zooming)에 따라 캔버스의 `viewportTransform`이 변경되면, 가공 원점(`realOrigin`) 계산에 역행렬(`invertTransform`) 연산이 개입하여 가공 데이터 생성 좌표가 물리적으로 왜곡 및 편향되는 문제 (Cyan으로 표시된 실제 도형의 센터가 아닌 자주색 위치로 치우쳐 가공되는 오차 발생).
* **해결 (ScannerPanel.tsx / GCodePanel.tsx)**:
    - **시각적 행렬 의존성 탈피**: 가공 원점(`realOrigin`)을 화면 뷰포트 상태에 기초해 역산하는 방식을 완전히 버리고, 물리 스테이지의 절대 좌표(`positions.X, Y`) 및 배율(`pxPerMm`)만을 기반으로 계산하도록 수정:
      $$realOrigin.x = stageX \times pxPerMm.x$$
      $$realOrigin.y = -stageY \times pxPerMm.y$$
    - **일관된 가공 좌표 유지**: 사용자가 마우스로 화면을 드래그하거나 확대/축소를 하더라도 생성되는 G-Code 및 스캐너 커맨드의 타각 물리 좌표가 전혀 흐트러지지 않으며, 기존에 보정 완료한 `Laser Set Center` 물리 오프셋과 일치하게 동작하게끔 안정성 복구 완료.

### 2.11 캘리브레이션 스테이지 좌표 (mx, my)를 기반으로 한 좌표계 기준 원점 복원 및 이중 보정 오류 수정
* **이슈**:
    1. `Laser Set Center` 당시의 스테이지 좌표인 `(mx, my)` (예: `2.690, -0.383`)가 복원되지 않아, `(0,0)`이 아닌 다른 위치에서 보정을 마친 후 스테이지를 이동시키면 가공 위치 정렬이 물리적 오차만큼 어긋나는 현상.
    2. 가공 명령어 생성 시, 캔버스 렌더링 영역에서 이미 적용된 카메라-레이저 픽셀 오프셋(`computedOffsetMm`)을 스캐너 좌표 오프셋에 다시 한번 중복해서 연산하여 마킹 타각 위치가 약 `X0.648 Y0.314` 만큼 잘못 쉬프트되는 이중 보정(Double Offset) 버그.
* **해결 (useGridSystem.ts / CanvasBackground.tsx / useCrosshair.ts / ScannerPanel.tsx / CanvasTopBar.tsx)**:
    - **캘리브레이션 기준 원점 복원**: 캔버스 뷰포트 이동 변위 및 카메라 배경 이미지 렌더링 위치 연산 시, 캘리브레이션 스테이지 좌표 `(mx, my)`를 차감한 상대 변위 `(positions.X - mx, positions.Y - my)`를 기반으로 렌더링하여 캘리브레이션 당시의 정렬 기준점이 항상 캔버스의 `(0,0)` 원점으로 기능하도록 연산을 통합 복원하였습니다.
    - **가공 수식 교정 및 이중 보정 제거**: 캔버스 상에 정렬된 도형의 픽셀 좌표에는 이미 픽셀 오프셋 보정치가 내포되어 있으므로, 가공 좌표 변환 수식에서 중복 적용되던 픽셀 오프셋(`computedOffsetMm`)을 완전 제거하고 `offsetMm` 매개변수로 `(mx, my)`를 제공하도록 교정하였습니다:
      $$x\_scanner = \frac{p.x}{activePxPerMm.x} - stageX + mx$$
      $$y\_scanner = -\left(\frac{p.y}{activePxPerMm.y} + stageY - my\right)$$
    - **속성창 상대 좌표 표시 복원**: `left`, `top` 표시 및 입력값 역산 시에도 동일하게 `mx`, `my` 오프셋을 차감한 상대 치수를 제공하여 화면 십자선 정렬 기준과 속성창 수치가 정확히 동기화됩니다.

### 2.12 Object Mode 스케일 불일치 및 뷰포트 이동 오류(fit to camera) 완전 수정
* **이슈**: Object 모드에서 `fit to working`은 맞아 보이나 `fit to camera` 실행 시 카메라 뷰어가 화면에서 벗어나 엉뚱한 위치를 보여주는 치명적 버그 발생. (간헐적으로 정상 작동하는 것처럼 보이는 타이밍 동기화 이슈 포함)
* **해결 (CanvasBackground.tsx / RecipeCanvas.tsx / useGridSystem.ts)**:
    - **원인 분석**: Fabric 캔버스 레이어(`fitCameraArea`, 십자선, 그리드 등)는 Object 렌즈의 고배율 스케일(`activePxPerMm`, 예: 5427 px/mm)을 사용하여 픽셀 좌표를 크게 팽창시키는 반면, 백그라운드 영상 렌더링 계층(`CanvasBackground.tsx`)은 항상 Scanner 스케일(`scannerScaleRaw`, 예: 452 px/mm)을 강제로 사용하도록 하드코딩 되어 있어 두 좌표계 간 심각한 불일치(Mismatch)가 존재했습니다.
    - **스케일 체계 단일화(Scale Unification)**: `CanvasBackground.tsx`에서 하드코딩된 Scanner 스케일 강제 로직을 과감히 제거하고, 프론트엔드의 모든 레이어가 현재 활성화된 렌즈의 스케일(`useCanvasStore.getState().pxPerMm`)만을 단일 척도로 사용하도록 완벽히 동기화했습니다.
    - **결과**: 카메라 배경, 십자선, 뷰포트 패닝 범위, 그리드, 스테이지 그림자(`Paper`)가 모두 동일한 배율 공간 위에서 렌더링되게 함으로써, Object 모드에서도 `fit to camera` 실행 시 뷰포트가 실제 물리 좌표계로 줌인됨과 동시에 영상 창이 단 1픽셀의 엇갈림 없이 정중앙에 안착하도록 복원되었습니다.

### 2.13 Object Mode 속성 패널(Property Panel) 좌표 일관성 보장 및 0,0 매핑 오류 수정
* **이슈**: Object 모드에서 도형의 Layout X, Y 속성에 `0, 0`을 입력하면 카메라 영상 중심이 아니라 스테이지 기계 원점(Stage Center) 근처로 도형이 이동하고, 정중앙에 위치한 도형의 좌표가 0이 아닌 렌즈 오프셋 수치(예: 14.146)로 표기되는 시각-데이터 불일치 발생.
* **해결 (CanvasTopBar.tsx)**:
    - **원인 분석**: 렌더링 계층(`CanvasBackground`, `useCrosshair` 등)에서는 Object 모드 시 오프셋 차감을 하지 않도록(`isScanner` 필터링) 정상 수정되었으나, UI 계층(`CanvasTopBar.tsx`)의 역산 수식에는 오프셋 차감 로직이 과거 상태 그대로 남아있었습니다.
    - **UI-렌더링 좌표 일관성 원칙 수립**: 화면 렌더링 뿐만 아니라 UI 속성 패널에서의 **Camera Relative 좌표 변환 시에도 반드시 `isScanner` 판별을 거쳐 오프셋(`mx`, `my`) 차감 여부를 결정해야 하는 원칙을 확립**하였습니다. 
    - 이를 통해 Object 모드에서는 하드웨어 중심이동으로 이미 상쇄된 오프셋을 이중으로 빼지 않고, 0,0 입력 시 카메라 정중앙 십자선에 정확히 위치하도록 수식을 교정하였습니다.

### 2.14 패닝 랙(Lag) 완전 제거 및 React 렌더링 최적화
* **이슈**: 사용자가 캔버스를 패닝(마우스 드래그)할 때마다 엄청난 버벅임(Lag)이 발생하며 시간이 지날수록 앱이 멈추는 현상.
* **해결 (RecipeCanvas.tsx / useCanvasEvents.ts)**:
    - `userPan` 상태를 컴포넌트 직접 구독 방식에서 벗어나, Zustand 내부 구독 및 Fabric 뷰포트 직접 조작 방식으로 변경하여 리렌더링 없이 패닝 랙 제거.

### 2.15 스케일 하드코딩(Scanner 1000) 잔재 일괄 제거 및 배율 통합
* **이슈**: Object 모드 등 고해상도 렌즈 사용 시 화면 핏 및 패닝 한계 연산 등이 고정 배율(1000) 상수에 의존하여 발생하는 계산 오류.
* **해결 (RecipeCanvas.tsx / useCanvasEvents.ts / useCanvasSetup.ts)**:
    - **스케일 체계 단일화**: 전 영역에서 고정 배율 `1000` 상수를 완전히 배제하고 현재 렌더링 중인 카메라 스케일(`activePxPerMm`)을 참조하도록 단일화하여 고배율 렌즈 구동 시의 뷰포트 계산 불일치를 차단하였습니다.

### 2.16 하단 조작계 반응형 레이아웃 및 겹침 예방
* **이슈**: 하단 중앙의 줌 배율 조정 뱃지(ZoomControl)와 우측 하단의 `Move to Center` 버튼이 화면 폭이 작아질 때 서로 겹쳐 조작을 차단하는 레이아웃 배치 문제.
* **해결 (RecipeCanvas.tsx)**:
    - **원형 FAB 리디자인**: 기존의 부피가 넓은 Extended FAB 대신 텍스트를 제거하고 아이콘만 표시하는 컴팩트한 원형 FAB으로 재설계하였습니다.
    - **반응형 스택 대피 배치**: 창 너비가 협소해지는 소형 해상도 구간(`xs`)에서는 FAB의 `bottom` 속성을 `80px`로 끌어올리고, 데스크톱 너비(`md`)에서는 `24px`로 밀착시키는 반응형 CSS 스타일을 적용하여 줌 뱃지(bottom: 20px)와의 겹침을 미연에 방지합니다.

### 2.17 줌 컨트롤러 내 핏(Fit) 버튼 단일 토글 병합
* **이슈**: "Fit to Working Area"와 "Fit to Camera FOV" 2개의 개별 버튼이 나열되어 줌 뱃지 너비를 늘리고 화면 하단을 번잡하게 만드는 문제.
* **해결 (ZoomControl.tsx / RecipeCanvas.tsx)**:
    - **토글식 단일 버튼 병합**: 2개의 핏 단추를 단일 버튼으로 통합하고, 현재의 활성화 상태(`isFitCamera`)에 맞춰 버튼의 아이콘(`FitScreenIcon` ↔ `CenterFocusStrongIcon`), 툴팁 문구, 그리고 연결된 콜백 함수가 동적으로 스위칭되도록 리팩토링하여 UI 공간을 획기적으로 정비하였습니다.

### 2.18 다중 선택(ActiveSelection) 시 strokeWidth 제외 논리적 크기 보정 및 일괄 스케일링 교정
* **이슈**: 다중 선택 상태에서 properties panel에 표시되는 크기가 선 두께(`strokeWidth`)가 포함되어 실제 도형 크기(예: 1mm)보다 부풀려져 표시(예: 1.003mm)되고, 이 상태에서 크기를 2mm로 수정할 경우 스케일 팩터가 왜곡되어 개별 도형의 크기가 정확히 2mm가 되지 않는 현상.
* **해결 (CanvasTopBar.tsx)**:
    - `getGroupLogicalSize` 헬퍼 함수를 구현하여, 다중 선택 객체 내부의 자식 도형들 각각의 `calcTransformMatrix()`와 strokeWidth가 제외된 순수 꼭짓점들을 기준으로 그룹 로컬 좌표계 상에서의 논리적 경계 상자(Logical Bounding Box) 크기를 계산하도록 함.
    - 이를 속성 표시(`useEffect`) 및 치수 변경(`handleChange` 내 `width`/`height`) 로직에 적용하여, 다중 선택 중에도 정확히 기하학적 기준인 `1.000mm`로 표기되게 하고, 수정 시 자식 도형의 원래 스케일이 획 두께에 상관없이 목표 크기 비율대로 정수 스케일링되도록 수정함.

### 2.19 레시피 파일 Save/Load 시 좌표 정규화/역정규화 파이프라인 연동을 통한 치수 드리프트 방지
* **이슈**: 캔버스의 실시간 렌더링 픽셀 좌표(raw pixel coordinates)를 그대로 저장하고 로드함으로써, 장비 기종, 모드(Scanner ↔ Object), 혹은 렌즈 캘리브레이션 픽셀 정밀도(`pxPerMm`)의 미세 변경에 따라 레시피를 다시 로드했을 때 도형들의 물리 치수가 미세하게 뒤틀리는(drift) 현상.
* **해결 (LeftNav.tsx)**:
    - 파일 저장(`handleSaveProject`) 시 `normalizeToStandard(json, pxPerMm)`를 호출하여 모든 그래픽 객체의 픽셀 값을 1000 px/mm 표준 해상도로 정규화해 기록함.
    - 파일 불러오기(`handleLoadProjectChange`) 시 로드한 데이터를 `denormalizeFromStandard(rawJson, pxPerMm)`를 통해 현재 활성화된 렌즈의 배율 픽셀 스케일로 역정규화하여 캔버스에 로드함.
    - 이를 통해 저장 및 로드 간의 물리-디지털 척도 일관성을 100% 보증하고, 자동 저장 세션 파일과 수동 저장 파일 간의 포맷 불일치 및 스케일 꼬임 현상을 제거함.

### 2.20 레시피 페이지 외 도형 편집 및 단축키 차단 (Recipe Scope Editing Guard)
* **이슈**: 레시피(Recipe) 페이지 외의 메인(Main) 또는 캘리브레이션(Calibration) 페이지에서 캔버스의 그리기 툴 단축키가 작동하거나, 복사/붙여넣기, 삭제, 되돌리기(Undo/Redo) 등의 편집 단축키를 눌러 캔버스 데이터가 비정상적으로 수정되는 문제.
* **해결 (useCanvasEvents.ts / useCanvasShortcuts.ts)**:
    - **레시피 스코프 한정 편집 활성화**: `useCanvasEvents.ts` 및 `useCanvasShortcuts.ts` 내부에서 `useCanvasStore.getState().currentScope` 값을 감지하여, `currentScope !== 'recipe'`인 경우에는 사각형, 원, 호, 다각형, 텍스트 등의 도형 생성 마우스 조작을 일괄 차단(무시)합니다.
    - **클립보드 및 이력 단축키 가드**: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z, Ctrl+Y 등의 시스템 편집 단축키가 레시피 페이지 외에서는 무시되도록 조치했습니다.
    - **조건부 삭제(Delete) 허용**: Delete 키 입력 시, 레시피 외 페이지에서는 오직 측정선(`isMeasurement === true`) 객체만 선택하여 삭제할 수 있도록 엄격히 제한하고, 설계 그리기 객체는 삭제할 수 없게 차단하여 데이터 오염을 예방했습니다.
    - **측정 도구 접근성 유지**: 화면 전환 중에도 측정 단축키(예: Shift+D, Shift+R 등) 및 팬/줌 스크롤 내비게이션은 모든 스코프에서 항상 사용 가능하도록 열어두어 사용 편의성을 해치지 않았습니다.

### 2.21 재기동 극초기 하드웨어 positions 싱크 감지 및 2-Step 이동 완료 핏투카메라 복구
* **이슈**: 프로그램 재기동 직후, 백엔드로부터 실제 기기 위치(positions)가 정상적으로 전송되기 전에 positions가 기본값 `(0, 0)`으로 오인되어, 실제 기기가 스캐너 중심(0,0)에 정렬된 것으로 판정(`isAtTargetPos = true`). 이에 따라 즉시 `Fit to Camera` 가 강행되고 2-step 이동 완료 대기 플래그(`isPendingAutoCameraFitRef.current`)가 해제되는 현상. 이 상태에서는 기기가 실제로 목적지에 도달해도 핏투카메라가 실행되지 않음.
* **해결 (RecipeCanvas.tsx)**:
    - **최초 싱크 가드 (`isFirstPositionsSynced`) 도입**: 백엔드로부터 최초 positions 갱신이 일어날 때까지(또는 최대 1초 안전 타임아웃 경과 시까지) Restoration 복원 및 초기화 로직의 실행을 명시적으로 대기시키는 가드를 추가.
    - 이를 통해 기동 시 실제 기기 위치 `(13.282, -78.169)`가 정상적으로 동기화된 뒤에 뷰포트 로직이 동작하도록 설계하여, 기기가 타겟 외부에 있을 때 정상적으로 2-step 감지 흐름(`isPendingAutoCameraFitRef.current = true`)을 타도록 동기화 정합성을 확보했습니다.

### 2.22 `updateRuler` 와 뷰포트/백그라운드 투영 간의 오프셋 공식 불일치 및 `userPan` 시프트 버그 제거
* **이슈**: V2 개정본을 통해 `RecipeCanvas.tsx` 와 `CanvasBackground.tsx` 에서는 오프셋 보정 상수를 완전히 배제(`mx = 0, my = 0`)하도록 수식을 일치시켰으나, `useGridSystem.ts` 의 `updateRuler` 내부에서는 여전히 `recipeCenter` 오프셋(`mx = 13.282, my = -78.169`)을 차감 연산하는 불일치가 존재함. 이로 인해 이동 완료 직후 `userPan` 변수가 거대한 시프트 값(약 -30,000 이상)으로 오염되어, 뷰포트와 영상 투영 레이어가 화면 밖으로 날아가 튕기는 뷰 왜곡 현상 발생.
* **해결 (useGridSystem.ts)**:
    - **오프셋 공식의 단일 통일**: `useGridSystem.ts` 내부의 `updateRuler` 수식 역시 오프셋 보정을 완전히 제거(`mx = 0, my = 0`)하도록 변경하여 세 모듈의 기하학 수식을 1:1로 완전 일치시킴.
    - 이로써 `userPan`에 비정상적인 픽셀 오프셋이 가산되어 뷰포트 및 눈금자 좌표계가 이탈하는 현상을 원천 방지하고 핏투카메라 안착의 무결성을 달성했습니다.

### 2.23 다중 객체 그룹화(Group) 및 해제(Ungroup) 기능 도입
* **이슈**: 사용자가 여러 도형을 하나로 묶어 복사, 이동, 스케일링을 한 번에 수행하고자 할 때 그룹화 기능이 부재하여 개별 편집의 불편함이 큼.
* **해결 (RecipeCanvas.tsx / CanvasTopBar.tsx)**:
    - **그룹화(Group)**: 캔버스 상에서 다중 선택(`ActiveSelection`)된 객체들을 `fabric.Group`으로 묶는 `handleGroup` 기능을 구현했습니다. 생성 시 기존 전역 좌표를 보존(`discardActiveObject()`)한 상태에서 그룹화하여 좌표계 왜곡 없이 단일 그룹 객체로 병합합니다.
    - **그룹 해제(Ungroup)**: 선택된 객체가 `Group`일 경우 이를 파괴하고 내부 아이템들을 다시 캔버스 전역 공간으로 방출하는 `handleUngroup` 기능을 구현했습니다. 이때 묶여있던 객체들의 상태 유지를 위해 방출 직후 곧바로 `ActiveSelection`으로 재선택되도록 편의성을 강화했습니다.
    - **안전 장치**: 시스템 핵심 레이어인 `MatrixRepeater` 등 특수 목적의 그룹 객체는 사용자가 임의로 해제할 수 없도록 방어 로직(`type !== 'MatrixRepeater'`)을 추가하여 데이터 정합성을 확보했습니다.

### 2.24 다중 선택/그룹 내부 도형의 Native 가공 커맨드 병합 보존 및 해치(Hatch) 회전 동기화
* **이슈**:
    1. 여러 도형이 다중 선택(ActiveSelection) 되거나 그룹화(Group)될 경우, 기존 시스템에서는 이를 모두 다각형의 `Path`로 강제 병합 및 평탄화(Flatten)하여, 원본이 원형(Circle)이더라도 수많은 짧은 직선(G01, LINE)의 조합으로 분해되어 가공 품질이 저하됨.
    2. 그룹 내부에 속한 도형들의 해치(Hatch/Fill) 선분 생성 시, 부모 그룹의 글로벌 회전 각도(globalAngle)가 상실되어 화면 상의 회전과 무관하게 항상 수평(0도) 해치선으로 출력되는 버그.
    3. 스캐너 엔진(`ScannerGenerator`)과 G-Code 엔진(`useGCodeGenerator`)의 추출 파이프라인이 분리되어 있어, 문제 수정 시 두 엔진 간 일관성을 확보해야 함.
* **해결 (FabricToPaperAdapter.ts / ScannerGenerator.ts / useGCodeGenerator.ts)**:
    - **Native 꼬리표(Metadata) 주입**: Fabric 객체를 Paper.js 객체로 변환할 때, 기존의 기하학적 형태 정보(`isNativeProfile: true`, `nativeType: CIRCLE`)와 글로벌 회전 각도(`globalAngle`)를 Paper.js의 `data` 속성에 스프레드 연산자(`...paperItem.data`)로 주입하여 덮어쓰기를 방지하고 끝까지 유지시켰습니다.
    - **Native 원호(Arc/Circle) 인터셉트 추출**: 양쪽 가공 엔진(Scanner/GCode)의 `generateProfile` 단계에서 이 꼬리표를 감지하면, 일반적인 궤적 추출(`flatten()`) 과정을 건너뛰고, 사용자가 설정한 윤곽선 마진(Margin)을 계산 적용하여 순수 Native 원호 커맨드(`CIRCLE`, `G02/G03`) 단 1줄로 직접 방출하도록 리팩토링했습니다.
    - **해치 회전 동기화 로직 이식**: 해치 라인 스위핑(Sweeping) 연산 전후로 도형을 역회전시킬 때 `fsettings.angle`에 `globalAngle`을 합산 적용하여, 도형의 물리적 회전과 정확히 맞물려 화면에 표시된 빗금 각도 그대로 가공되도록 양쪽 엔진에 공통 패치했습니다.

### 2.25 상단 속성 패널(CanvasTopBar) 레이아웃 및 폼 생명주기(Lifecycle) 분리 개선
* **이슈**:
    1. 상단 Edit 바(CanvasTopBar)의 기능 확장으로 인해 좌측 Layer List를 열 때 우측의 Matrix 버튼이 가려지거나 밀려나는 레이아웃 파단 발생. Layout 섹션 내부의 아이콘들로 인해 입력창들의 세로 열 정렬이 어긋남.
    2. 우측 Process 패널(Scanner, Object)의 Mark Speed 제어 시, `onChange` 이벤트에 바인딩된 최소값(0.001) 검사 로직이 실시간 타이핑 문자열(예: '0', '0.')을 즉시 평가하여 0.001로 강제 변환 및 소수점을 파괴하는 키보드 입력 방해 버그 발생.
* **해결 (CanvasTopBar.tsx / ScanlabProcessPanel.tsx / SinoGalvoProcessPanel.tsx / GCodePanel.tsx / ScannerPanel.tsx)**:
    - **CSS Grid 기반 아키텍처 전환**: 기존 `flex` 기반 패널 블록 요소들을 완벽한 정수 열(Column)로 떨어지는 CSS `Grid` 구조로 전면 전환했습니다. Layout 섹션의 불필요한 링크 체인 아이콘을 제거하고 6컬럼 그리드로 밀착 정렬을 구현했습니다.
    - **버튼 그룹 위치 논리적 재배치**: 기능적 연관성을 고려하여 Fill Settings 아이콘과 Matrix 배열 버튼을 Style 속성 바로 우측으로 전진 배치함으로써, 좌측 사이드바 개폐 여부와 무관하게 모든 버튼이 안전한 가시 영역에 위치하도록 보장했습니다.
    - **입력 폼 생명주기 분리 (onChange vs onBlur)**: React의 제어 컴포넌트(Controlled Input) 갱신 로직을 이원화했습니다.
        - `onChange`: 사용자의 입력 의도(키 타이핑 진행 중인 불완전한 문자열)를 그대로 보존하며 임시 State로만 취급.
        - `onBlur`: 입력 포커스를 잃거나 완료(`handleKeyDown`의 엔터 등)하는 시점에만 문자열을 숫자로 파싱하여 최소/최대값 바운딩 및 소수점 자리수 정규화를 수행.
    - 이를 통해 숫자 입력 시 발생하는 UX 병목을 제거하고 복잡한 소수점 단위 설정도 완벽히 호환되게 개선했습니다.

### 2.26 1D 마진(Margin) 적용 시 외곽선 및 내부 해칭선 위치 동기화 결함 해결
* **이슈**: 
    1. Fill과 Line이 동시 체크된 경우 도형의 외곽 경계선(Top/Bottom 등)이 중복 가공되거나 삐져나가는 오버랩 발생.
    2. 마진 적용 시 UI 상에 그려지는 해칭 오버레이 눈금자(Grid)는 고정되어 있는데 반해, 가공 좌표 엔진은 해칭 눈금자 전체를 이동시켜 버려 실제 마진 바깥으로 선이 빠져나가고 간격(0.5 등)이 어긋나는 현상.
* **해결 (ScannerGenerator.ts)**:
    - **바운더리 스위핑 중복 제거**: 마진이 0일 경우에만 바운더리를 포함하고, 마진이 있을 경우(`skipHatchBoundary`) 명시적으로 첫 번째 경계선 스윕을 건너뛰는 조건 분기(`currentSweepP = marginStartLimit` 등)를 클램핑(Clamping) 방식으로 변경하여 UI 오버레이와 100% 동일한 위치에서만 선이 타각되도록 리팩토링했습니다.
    - **그리드 앵커 유지 및 클램핑 적용**: 해칭을 긋는 가상의 눈금자(Grid Anchor)는 원래의 도형 크기에 고정시키고, 마진 바운더리를 벗어나는 선들만 정확히 마진 제한선(Limit) 위치로 클램핑하여 모아주도록 수정했습니다. 이로써 내부 선들의 간격(예: 0.5)은 칼같이 유지하면서도 UI 오버레이와 가공 궤적이 완벽하게 동기화되었습니다.

### 2.27 One-Way/Two-Way 교차 방향 동기화 및 2~3초 점프(JUMP) 딜레이 해결
* **이슈**:
    1. 세로선(L2R) 해칭 가공 시 첫 번째 선 가공 후 다음 선으로 넘어갈 때마다 2~3초의 멈춤(Delay)이 발생함. 가로선(T2B)일 때는 딜레이가 없었음.
    2. `Optimized Two-Way` 모드가 켜져 있음에도 불구하고 복잡한 도형에서 방향이 교차하지 않거나 Arc(원호) 도형이 거울에 반사된 것처럼 위치가 왜곡되어 가공됨.
* **해결 (ScannerGenerator.ts / SinoGalvoController.cpp)**:
    - **JUMP 복귀 모션 지연 원인 파악 및 C++ 드라이버 패치**: 세로선의 2~3초 딜레이는 소프트웨어 버그가 아닌, `One-Way` 상태에서 레이저가 대각선으로 JUMP하여 복귀할 때 `Mark Speed (1 mm/sec)` 등의 매우 느린 설정 속도를 정직하게 따라갔기 때문입니다. 이에 착안하여 `SinoGalvoController.cpp`의 `MovetTo` 함수 내에 비워져 있던 `m_jhcLib->SchOutPoint(X, Y, 0.0f);` 하드웨어 직접 점프 호출을 주석 해제(Uncomment)함으로써 다음 가공 시작 위치로의 JUMP 명령이 정상적이고 신속하게 처리되도록 하드웨어 딜레이를 해소했습니다.
    - **`drawnIdx` 기반 완벽한 지그재그(TwoWay) 교차**: 가공되는 선분의 수학적 배열 인덱스(`idx`) 대신, 실제로 타각되는 실선 세그먼트의 인덱스(`drawnIdx`)를 별도 추적하여 홀/짝수(`% 2 === 1`) 판별을 수행하도록 리팩토링했습니다. 이로써 `Optimized Two-Way` 가공 시 간극(Gap)을 건너뛰거나 복수 도형을 한 번에 가공할 때에도 방향 교차가 절대 꼬이지 않고 UI 오버레이 화살표 방향과 100% 동기화되게 하였습니다.

### 2.28 가공 완료 리뷰 모드(isReviewMode) 및 REVIEW 카드 UI 전면 폐기 (2026-07-15)
* **이슈**: 가공 완료 시 우측 패널(Scanner Process / Object Process)에 나타나던 REVIEW 카드(`shape review` 체크박스 + `Move to Center` 버튼)와 그 상태값 `isReviewMode`가 뷰포트 추적, 객체 잠금(`selectable/evented`), LayerList 가시성 토글 등 캔버스 로직 곳곳에 얽혀 유지보수 복잡도를 높였으며, 사용자 결정에 따라 기능 자체가 폐기됨.
* **해결 (ProcessDashboard.tsx / ProcessPanel.tsx / useCanvasStore.ts / RecipeCanvas.tsx / LayerList.tsx / useCanvasEvents.ts)**:
    - 가공 완료 후 표시되던 REVIEW 카드 UI 블록을 `ProcessDashboard.tsx`(공용 대시보드)와 `ProcessPanel.tsx`에서 완전 제거.
    - `useCanvasStore`의 `isReviewMode` / `setIsReviewMode` 상태 정의를 삭제하고, 이를 참조하던 리뷰 전용 뷰포트 추적 조건(`RecipeCanvas.tsx`), 객체 잠금 및 가시성 연동(`LayerList.tsx`, `useCanvasEvents.ts`)을 일괄 정리.
    - 가공 후 오버레이 가시성/편집성 복원은 `isProcessingLocal` 상태 트랜지션(`true → false`) 단일 기준으로 통일하여 상태 꼬임 여지를 제거.

### 2.29 카메라 뷰 더블클릭 스테이지 이동 모드 (Navigate Mode / Click-to-Move) 신규 도입 (2026-07-16)
* **요구사항**: 우측 하단 원형 FAB 토글 버튼으로 활성화하며, ON 상태에서는 ① 캔버스의 모든 도형 오버레이가 read-only로 전환되고 ② 카메라 영상의 특정 지점을 더블클릭하면 그 지점이 카메라 뷰 센터(크로스헤어)에 오도록 스테이지 X, Y가 이동한다. OFF 시 오버레이는 편집 모드로 복원된다. FAB에 마우스 hover 시 현재 ON/OFF 상태를 툴팁으로 표시한다.
* **구현 (useCanvasStore.ts / RecipeCanvas.tsx / useCanvasEvents.ts / constants.ts)**:
    - **상태 및 자동 해제(Auto-Off) 계약**: `useCanvasStore.isNavigateMode` 플래그를 단일 진실 공급원으로 두고, 모드 충돌을 원천 차단하기 위해 다음 4개 지점에서 자동 해제되도록 설계 — ① `setActiveTool`에서 select 외 도구(그리기/측정) 선택 시, ② `setViewMode`(Scanner↔Object 전환) 시, ③ `setMagnification`(x20↔x50 전환) 시, ④ `RecipeCanvas` 언마운트(페이지 이탈) 시. 또한 호밍(`homingState.active`) 또는 가공(`isProcessingLocal`) 진입 시 강제 OFF되는 안전 가드를 적용.
    - **오버레이 Read-Only 통합**: 기존 가공 잠금 로직(`syncObjectLock`)에 `isNavigateMode`를 통합하여 도형의 `selectable/evented`를 차단하고, 캔버스 `selection`(마퀴 드래그 선택 사각형)과 `skipTargetFind`(도형 경계 hover 시 이동 커서로 변하는 타겟 탐색)를 함께 차단.
    - **고시인성 커서 및 CSS `!important` 단일 공급원**: 가공면(흰색)/비가공면(검정)/다색 도형 어디서든 보이도록 흑색 외곽선 + 백색 심의 이중 윤곽 SVG 크로스헤어 커서(`NAVIGATE_CURSOR`, data URI)를 도입. Fabric.js가 `mouse:up`마다 inline `style.cursor`를 덮어써 커서가 소멸하던 문제(컨텍스트 메뉴 닫기, 더블클릭 직후, 창 최소화 복원 등)를 해결하기 위해, 컨테이너에 `.navigate-mode-cursor` 클래스를 토글하고 `cursor: ... !important` 스타일 시트를 주입하여 **어떤 inline 쓰기에도 지워지지 않는 커서 규칙**을 확립. 아울러 `handleMouseUp` 말미의 "Reinforce" 블록(`defaultCursor='default'; selection=true` 복원)이 Navigate 모드 중에는 스킵되도록 가드.
    - **더블클릭 좌표 역산 (핵심 수학)**: `canvas.getScenePoint(evt)`가 현재 뷰포트 행렬(줌+팬)의 역행렬을 적용하므로 **줌 레벨/패닝 상태와 무관하게** 클릭 지점의 절대 scene 좌표를 얻는다. 목표 스테이지 좌표는 카메라 영상 투영(`CanvasBackground.tsx`)의 정확한 역함수로 산출한다:
      $$targetX = \frac{scene.x}{ppm_{scanner}.x}, \qquad targetY = -\frac{scene.y}{ppm_{scanner}.y}$$
      (여기서 `ppm_scanner = calibrationScales['scanner']` — 영상이 모든 모드에서 scanner 스케일 + `mx=my=0` 기준으로 scene에 배치되기 때문)
    - **이동 중 재클릭 가드**: `isNavigateMovingRef` 플래그 + `positions` 스토어 구독으로 도착(±0.01mm) 판정 시 해제, 10초 타임아웃 및 언마운트 cleanup을 포함하여 이동 중 재더블클릭으로 `moveAbs`가 중첩 발사되는 것을 차단.
    - **진단 로그**: `[NavigateMode] dblclick { scene, target, current, zoom, roi }` 콘솔 로그로 역산 무결성을 실기 검증 — 서로 다른 줌(3.22배/1.65배)에서 두 번의 클릭 모두 `target = current + (클릭 지점의 센터 대비 물리 오프셋)` 역산이 소수 셋째 자리까지 일치함을 확인.
* **⚠️ 오프셋 이중 보정 함정 (사고 사례 기록)**: 초기 구현에서 크로스헤어 수식을 모방해 `recipeCenter`(렌즈 프리셋 스테이지 오프셋, `MoonsConfig.lens.stage_x20_offset` 등으로 폴백됨)를 target에 가산했다가, **Object x20 모드에서 어디를 클릭해도 X가 렌즈 오프셋(~13.5mm)만큼 점프하고 Y는 목표(-159mm)가 소프트 인터락 범위 밖이 되어 백엔드 `MovAbs`가 차단(이동 무반응)되는 오동작**이 발생했다. `CanvasBackground.tsx`의 영상 투영은 "Backend natively moves the stage to make Object camera align with 0,0" 원칙에 따라 오프셋을 배제(`mx=my=0`)하므로, **역함수인 더블클릭 좌표 계산에도 recipeCenter를 절대 가산하면 안 된다** (§4 개발자 경고의 실증 사례).
* **잔여 위치 오차의 최종 원인 규명**: 좌표 역산이 수학적으로 일치함에도 이동 완료 후 클릭 지점이 크로스헤어에서 미세하게 어긋나는 잔여 오차는 코드 결함이 아니라 **스캐너 카메라 캘리브레이션(px/mm 스케일, 약 452.5px/mm)의 부정확**이 원인이었으며, 카메라 재캘리브레이션 후 오차가 소멸함을 실기 확인(2026-07-16). 진단 공식: *"카메라 센터에서 먼 곳을 클릭할수록 오차가 비례해서 커지면 클릭 수학이 아니라 영상 표시 스케일 캘리브레이션 문제"*.

### 2.30 Scanner ↔ Object 모드 전환 시 도형-카메라 상대 위치 유지 아키텍처 확립 (절대 scene + 렌즈 프레임 재배치) (2026-07-16)
* **이슈**: Scanner 모드에서 그린 도형이 Object 모드로 전환하면 이전 Scanner 중심 위치에 남아, 카메라 뷰 중심에서 렌즈 오프셋(약 X13.1/Y-78.0mm)만큼 떨어져 보이는 현상. 도형은 어느 모드에서든 "현재 카메라 뷰 중심 기준 상대 위치"를 유지해야 하며, 워크 에어리어에는 카메라 뷰가 절대 좌표대로(예: 중앙 0,0 → 우측 하단 목표점) 이동하는 과정이 그대로 보여야 함.
* **기각된 접근 (중간 시도 기록)**: scene 원점을 모드별 recipeCenter(Laser Set Center 당시 스테이지 좌표)로 재정의하는 "캘리브레이션 앵커" 모델을 먼저 시도했으나 두 가지 문제로 기각·원복됨. ① 모드 전환 순간 투영식이 바뀌어 스테이지가 이동하기 전 카메라 뷰가 워크 에어리어의 엉뚱한 위치(상단)에서 출발하는 시각적 오류. ② recipeCenter는 캘리브레이션 당시 스테이지 좌표의 스냅숏일 뿐 실제 자동 이동 목표점(moonsConfig 렌즈 오프셋)과 다를 수 있어, 그 차이(실측 0.446/0.223mm)만큼 도형이 카메라 중심에서 어긋남. **카메라-레이저 정렬은 Laser Set Center의 영상 디지털 패닝(pixelX/pixelY)이 담당하므로, recipeCenter의 스테이지 좌표(x,y)를 투영/역산/가공 오프셋에 개입시키면 안 된다.**
* **확립된 아키텍처 (sceneCoords.ts)**:
    1. **절대 scene 투영**: `scene = stage × pxPerMm` (Y 반전). 배경 영상·눈금자·JOG 추적·fitCameraArea·십자선·속성 패널·Navigate 역산이 모두 이 단일 수식(또는 역함수)을 공유. 모드 전환 시 카메라 뷰는 현재 절대 위치에서 렌즈 오프셋 목표점으로 이동하는 과정이 워크 에어리어에 그대로 표시됨.
    2. **렌즈 프레임 재배치 (도형 이동)**: 백엔드(cmd.moons.preset)는 모드 전환 시 `Δ = 렌즈오프셋(신) − s_last_offset(구)`만큼 스테이지를 **상대 이동**시키므로(PortalRouterHandler.cpp), 도형도 같은 Δ만큼 scene 상에서 이동해야 카메라 뷰 기준 상대 위치가 유지됨. 이는 모드 전환마다 도는 기존 저장→재로드 사이클의 정규화 파이프라인에서 수행:
        - **저장(normalizeToStandard)**: 로드 시 적용했던 프레임 변위(`loadedFrameShiftRef`)를 역적용 → 저장 데이터는 항상 **Scanner 프레임 + 1000px/mm 표준** (모드 독립적 포맷).
        - **로드(denormalizeFromStandard)**: 대상 렌즈의 프레임 변위(`getLensFrameShiftMm` = moonsConfig 렌즈 오프셋 − 스캐너 오프셋)를 가산.
        - 수동 레시피 파일 저장/로드(LeftNav) 및 Main 오버레이도 동일 규약 적용 → 레시피 파일이 저장 당시 모드와 무관하게 호환됨.
        - `loadedFrameShiftRef`(loadedScaleRef와 동일 패턴)를 쓰는 이유: 모드 전환 시 스토어가 먼저 새 모드로 갱신된 후 이펙트 클린업(저장)이 돌기 때문에, 저장 시점의 스토어 값이 아니라 **로드 시 실제 적용했던 변위**를 역적용해야 무결함.
    3. **가공 오프셋 통일**: 갈보(ScannerPanel/SinoGalvo/Scanlab) `offsetMm={0,0}` (galvo = scene/ppm − stage), G-Code `offsetMm={0,0}` (machine = scene/ppm). 도형이 이미 현재 렌즈 프레임 위치로 재배치되어 있으므로 recipeCenter 가산은 이중 보정.
    4. **속성 패널/십자선**: 표시값 = scene/ppm − 현재 스테이지 위치 (recipeCenter 차감 제거). 도형이 카메라 뷰 중심에 있으면 Layout X/Y = (0,0).
* **검증 수치**: MoonsConfig.ini INC 기준 x20 오프셋 (13.080, −78.030) = 실측 스테이지 도착 좌표와 일치, x50 (13.046, −78.131) 일치. recipeCenter.object_x20 (13.526, −77.807)과의 차이 (0.446, 0.223)이 기각된 모델에서 관측된 오차와 정확히 일치함을 확인.
* **⚠️ 개발 규약**:
    - 스테이지↔scene 변환은 반드시 `sceneCoords.ts`(stageToScenePx/scenePxToStageMm)를 경유할 것. 개별 파일에서 오프셋을 가산/차감하는 순간 레이어 간 좌표계 분열이 재발한다.
    - 도형의 렌즈 프레임 이동은 오직 정규화 파이프라인(canvasNormalization + loadedFrameShiftRef)에서만 수행할 것. 렌더링/가공 수식에서 렌즈 오프셋을 추가로 만지면 이중 보정이 된다.
    - `canvasScopes`는 인메모리 전용(재시작 시 소멸)이므로 부팅 복원 경로의 이중 이동 문제는 없음. 향후 자동저장을 영속화할 경우 저장 포맷이 Scanner 프레임 표준임을 유지해야 한다.

### 2.31 복제 도형 선 굵기 버그 및 가공 중 뷰포트 발산(353mm 이탈) 해결 (2026-07-17)
* **버그 1 — Ctrl+C/V 복제 도형의 선 굵기 증가 (저장/로드 후에도 유지)**:
    - **원인**: 도형 외곽선은 `strokeWidth = 2/zoom` + `isHairline` 플래그로 생성되고 줌 변경 시 `isHairline` 객체만 2px로 재계산되는데, 클립보드 복제(`useClipboardSystem.ts`)의 clone 속성 목록에 **`isHairline`/`strokeUniform`이 누락**되어 복제본이 갱신 대상에서 제외 → 복제 시점(저줌 상태)의 큰 픽셀 굵기로 동결. strokeWidth는 저장/로드 시 충실히 왕복되므로 증상이 영속화됨.
    - **조치**: ① clone 속성 목록에 `isHairline`, `strokeUniform`, `customData` 추가. ② LeftNav 수동 저장 직렬화 목록에도 누락돼 있던 `isHairline` 추가(자동저장 목록과 일치화). ③ 자동저장 로드 후처리에서 `isHairline` 객체의 strokeWidth를 `2/zoom`으로 즉시 재정규화하여 과거 오염 데이터 자가 치유.
* **버그 2·3 — 오브젝트 가공 시작 시 뷰 이탈 + 가공 중 fit to camera 폭주(눈금자 353mm)**:
    - **원인 (뷰포트 추적 경로 3계통 공존 및 순환 발산)**: 가공 중 (A) RecipeCanvas의 구 변위(lastProcessStartPosition 대비) 추적 이펙트가 userPan을 읽어 vpt를 쓰고, (B) `updateRuler`의 가공 변위 분기가 vpt+변위로 **userPan을 되쓰는** 순환 구조. 매 positions 틱(100ms)마다 `userPan += (변위px×zoom − 30px)` 누적 발산 (30px 상수는 (A)가 눈금자 마진 60/20px를 뺀 중심을, (B)가 포함한 중심을 쓰는 불일치). x50 고배율에서 발산이 격렬해지고, 이 오염된 userPan 위에 fitCameraArea가 절대 투영을 계산하면 353mm급 이탈 발생. (A)(B)는 구 카메라-상대 좌표계 시절의 잔재.
    - **조치 (절대 좌표 단일 추적으로 통합)**:
        1. `updateRuler`의 가공 변위 분기 삭제 → 카메라 절대 분기(`scene = stage×ppm`)로 일원화. userPan 오염원 소멸.
        2. RecipeCanvas 구 변위 추적 이펙트 삭제 (미사용이 된 `lastProcessStartPosition` 구독 정리 포함).
        3. JOG 절대 추적 이펙트 가동 조건을 `isFitCamera || (isProcessingLocal && viewMode==='object')`로 확장 — 스테이지가 곧 카메라이므로 절대 위치 추적이 곧 "마킹 궤적 따라가기". updateRuler와의 조합은 고정점(targetUserPan = userPan)이라 구조적으로 발산 불가.
        4. 가공 시작 전환(false→true) 시 현재 뷰포트를 camera-relative userPan으로 1회 환산 저장 → 사용자가 보던 구도 그대로 추적 시작 (자유 이동 상태에서 userPan이 낡아 있는 경우 대비).
    - **부수 효과**: Scanner 갈보 가공은 스테이지 정지 상태이므로 절대 추적이 뷰를 고정(기존 체감 동일). 가공 중 fit to camera / fit to work area 정상 동작 복원.
* **⚠️ 개발 규약 (추가)**: 뷰포트를 스테이지 위치에 정렬하는 코드는 반드시 "절대 좌표(stageToScenePx) + userPan" 단일 규약을 따를 것. 변위(delta) 기반 추적 경로를 재도입하면 updateRuler와의 순환 발산이 재발한다. 또한 fabric 객체를 복제/직렬화하는 새 경로를 추가할 때는 `isHairline`, `strokeUniform`, `customData` 커스텀 속성 포함 여부를 반드시 확인할 것.

### 2.32 Edit 바 입력 생명주기 분리 확장 및 Mark times/Shape Delay 파이프라인 완성 (2026-07-17)
* **Edit 바(Layout) 입력 안정화**: X/Y/ang/W/H 입력이 키 입력마다 Fabric 객체에 즉시 반영되어 `scaleX=0`(특이행렬) 적용 → 렌더러 크래시, 입력 간섭(0.8→0.001), 수치 오염을 유발하던 문제를 draft 상태 + onBlur/Enter 커밋(Escape 원복)으로 해결. §2.25 생명주기 분리 원칙이 이제 우측 가공 패널과 Edit 바 전체에 일관 적용됨. 커밋 검증은 `Number.isFinite` + W/H 하한 0.001mm + 스케일 0/NaN/Infinity 가드 3중 방어 (상세: feature_Draw.md §4.7).
* **Mark times/Shape Delay 전 구간 완성**: ScannerGenerator를 Template Method 구조(generate=N패스 골격/generatePass=단일 패스)로 리팩토링하여 반복·도형 간 DELAY 삽입을 실구현하고, 실사용 패널(SinoGalvoProcessPanel/ScanlabProcessPanel)에 공용 위젯 `MarkRepeatSettings`를 연결. G-Code에는 `// Shape i/M (Pass n/N)` 회차 주석을 기록하며, 공용 ProcessDashboard가 "MARK TIMES n / N" 회차를 표시 (상세: feature_Scanner.md §6.5, feature_Object.md §5.4).
* **갈보 드라이버 교착 방어**: SinoGalvoController의 무한 대기 루프 3곳에 하드 타임아웃(3s/2s/5s) + Cancel 복구 + DebugView 진단 로그를 적용하고, ScanlabController DELAY 분기의 이중 증가(+2)로 인한 명령 유실 버그를 수정 (상세: feature_Scanner.md §6.6).
* **⚠️ 개발 규약 (추가)**: ① 갈보 가공 UI는 `components/ScannerPanel.tsx`(미사용 죽은 코드)가 아닌 `SinoGalvoProcessPanel`/`ScanlabProcessPanel`을 수정할 것. ② C++ 소스(BOM 없는 UTF-8, MSVC는 CP949로 해석)에 한글 주석을 새로 쓰면 다음 코드 줄이 주석으로 삼켜지므로 **C++ 신규 주석은 ASCII 영문 전용** (상세: feature_Scanner.md §6.7).

### 2.33 색상별 가공 프리셋(Layer-Default) 시스템 및 스캐너/오브젝트 모드 프리셋 격리 (2026-07-20)
* **색상별 프리셋 도입**: `useCanvasStore.colorPresets`에 Mark Speed/Mark Times/Power/Z(절대)를 색상(hex) 단위로 저장하고, `ColorPresetPanel`(Right Panel 공용 컴포넌트) 하나로 CurrentLayer 선택·Use Default Parameters 일괄 전환·프리셋 편집을 일원화. LayerList는 순수 도형 트리로 유지(편집 UI 이중화 방지 — §2.25/§2.32의 생명주기 분리 원칙과 동일하게, 이번엔 "편집 위치"를 단일화하는 방향).
* **Fill=Line 색상 동기화**: `CanvasTopBar.tsx`에서 Fill 색상 개별 지정 UI를 제거하고 항상 Line(stroke) 색상을 따라가도록 변경.
* **모드별 프리셋 격리(LensScope)**: `colorPresets`를 색상 hex 단일 키의 평면 딕셔너리에서 `{ scanner, object_x20, object_x50 }` 3-스코프 딕셔너리로 전환. 같은 색상이라도 Scanner에서 설정한 Mark Speed/Power/Z가 Object x20/x50 모드에 그대로 노출되던 버그(물리적 Z 위치가 모드마다 전혀 다름) 수정. `getLensScope()`가 `viewMode`+`magnification`으로 현재 스코프를 판정하며, `setColorPreset`/`getColorPresetOrDefault`/라이브러리 적용 전부가 이를 경유.
* **Gr.W/Gr.H 그룹 크기 제곱 표시 버그**: DXF 임포트로 생성된 `ActiveSelection`(그룹)의 크기 표시가 `getGroupLogicalSize()`(이미 그룹 스케일 반영된 절대값) 결과에 `selectedObject.scaleX`를 중복 곱해 실제보다 수백~수천 배 부풀려 표시되던 버그 수정(`CanvasTopBar.tsx`). §2.32의 Edit 바 onBlur 커밋 분리와는 별개의, 그룹 전용 산식 버그.
* **캔버스 클릭 시 Layout 입력 미반영**: Fabric.js 캔버스가 선택 유지를 위해 mousedown에서 브라우저 기본 blur를 막아, 값 입력 후 캔버스(도형)를 클릭해도 `onBlur` 커밋이 발생하지 않던 문제. 캔버스 mousedown을 capture 단계에서 가로채 포커스된 input을 명시적으로 blur시켜 커밋을 강제하도록 수정.
* **SinoGalvo Mark Times 반복 뭉침 및 진단 로깅**: `ScannerGenerator`에 반복/색상 그룹 경계 DELAY 삽입, `SinoGalvoController.cpp`에 대기 루프 진단 계측(`DiagLog`) 및 Portal SYSTEM CONSOLE/`Bin\Log` 이중 출력, 콘솔 UX 전면 개편(반복 로그 그룹핑, 레벨 색상 배지, 기본 Debug 숨김, 로고 5회 클릭 고급 모드 게이팅) — 상세는 feature_Scanner.md §6.8.
* **상세**: `docs/checkpoints/process preset.md` 전체 참조.

### 2.34 가공 중 UI 잠금 전역화 및 Move-to-Center 이동 표시 (2026-07-22)
* **잠금 커버리지 확장**: 가공(`isProcessingLocal || hideOverlays`) 중 조작 가능하던 UI 3곳을 잠금 체계에 편입 — ① `CanvasTopBar`(상단 Edit 바)에 렌더 가드를 추가해 가공 중 강제 닫힘(기존 `syncObjectLock`의 `discardActiveObject()` fabric 이벤트 경유 1차 경로에 대한 2차 방어선), ② 카메라 뷰 우하단 "Move to Center"(MyLocation) FAB에 누락돼 있던 `disabled` 적용(나머지 FAB 2종은 §2.29에서 기적용 확인), ③ Motion 탭의 Home all/축별 호밍/Jog 패널을 `RightPanel → processingLocked` deps 전달로 잠금(`PositionControlCard`에 `disabled` prop 신설 — 호밍 스피너 상태 `homing.active`와 의미 분리).
* **Move-to-Center 이동 중 점등 [Observer — positions settle 감시]**: MyLocation FAB의 상시 사이언(primary 고정)을 폐기하고, 클릭 후 **스테이지가 실제 이동하는 동안에만** 사이언 점등. `cmd.moons.preset`은 접수 즉시 응답(이동 완료 신호 없음)하므로 `useAppStore.positions`를 300ms 폴링해 연속 2회 delta < 0.005mm + 최소 1초 경과 시 소등(하드 타임아웃 30초). Click-to-Move 토글(§2.29)과 동일한 시각 언어(활성=primary/비활성=paper)로 통일.
* **⚠️ 잠금 해제의 전역 생명주기 이관 (탭 전환 전까지 해제 지연 버그)**: 잠금 해제가 Process 탭 안에서만 마운트되는 `ProcessDashboard`의 effect에 있어, Motion 탭을 보는 동안 가공이 끝나면 해제가 실행되지 않았음. 완료 신호를 처리하는 전역 훅 `useProcessMonitor`(AppShell 상주)에 **processState 전이(prev ≠ cur) 기반** 동기화를 추가해 해결 — running/paused 진입 시 잠금, idle 복귀 시 해제. 전이 기반이라 Process Start 직후(state가 아직 idle) 잠금을 되돌리지 않으며, ProcessDashboard 기존 effect(2초 유예)와 병행해도 일관. **원칙**: 전역 store의 파생 동작은 신호 소스와 같은 전역 생명주기에 배치할 것(탭 종속 컴포넌트의 effect 금지).
* **상세**: feature_Scanner.md §6.13, 계획서 `docs/proc/processing_ui_lockdown_plan.md` 참조.

### 2.35 가공 상태 표시의 "네이티브 실측 방송" 파이프라인 확립 (진행률·MARK TIMES 회차·색상) (2026-07-23)
* **원칙 확립**: 가공 진행 표시(진행률 %, MARK TIMES 회차, 가공 중인 레이어 색상)는 **드라이버가 실측한 값만** 단방향 파이프라인으로 표시한다 — `BroadcastJS(window.__on*)` → `HardwareFacade` 전역 1회 등록 → `bus.emit` → `useProcessMonitor`(AppShell 상주) → `useAppStore.processStates` → 표시 컴포넌트. UI 상태(선택 스와치, 프리셋 조회, 진행률 환산 등)로부터의 **유도 계산은 금지** — 오늘 하루에만 유도 계산발 오표시 3건(1/N 고정, 다색 "1/2", "6/10" 정체)이 이 원칙 위반에서 나왔다.
* **수신 등록 위치 규약(§2.34 원칙의 적용)**: `window.__on*` 전역 콜백을 탭-마운트 패널이 등록/해제하면 안 된다 — `__onScannerProgress`가 Scanlab 전용 패널과 죽은 코드에만 등록돼 있어 SinoGalvo 장비에서 수신자가 아예 없던 것이 진행률 미갱신의 근본 원인이었다. 등록은 `HardwareFacade`(앱 초기화 1회), 소비는 `useProcessMonitor` — `__onScannerStatus`가 원래 쓰던 패턴으로 전 신호를 통일했다(`scanner/progress`, `scanner/markpass`).
* **MARK TIMES 표시 의미론**: 색상 프리셋 체계에서 "전체 레시피의 반복 횟수 N"은 정의 불가(그룹별 N이 다름) → 회차 행은 **현재 가공 중인 색상 그룹의 n/N + 색상 칩**을 표시하고 그룹 전환 시 리셋한다(전체 잔여량은 진행바 소관). 데이터는 `REPEAT_BEGIN{repeatCount, color}` 커맨드(전 그룹 래핑) → 드라이버 `__onScannerMarkPass(cur,total,color)` 방송으로 공급.
* **상세**: feature_Scanner.md §6.15~6.17, process preset.md §13, 계획서 `docs/proc/mark_times_progress_display_fix_plan.md` · `docs/plans/ScannerIssue8_MultiGroup_Hang_and_PresetKey.md` · `docs/plans/ScannerIssue9_Circle_Bit0_and_MarkTimesUI.md` 참조.

---

## 3. 요약 및 기대 효과
이러한 일련의 개편을 통해 시스템은 다음과 같은 안정성을 확보했습니다.
1. 재시작 및 렌즈 전환 시마다 각 렌즈의 독립적인 미세 정렬 데이터가 `RecipeCenter.json`에서 지연 없이 불러와져 시각적 오류를 원천 차단합니다.
2. **가공 품질의 비약적 향상**: 정원은 네이티브 명령으로 매끄럽게 가공되며, 곡선(Arc/DXF)은 최적화된 정밀도로 시스템 부하 없이 정교하게 타각됩니다.
3. 캔버스에 아무리 복잡한 가이드와 측정 텍스트를 남겨도 하드웨어 가공 지시서(명령어)에는 순수 가공 객체만 깨끗하게 전달됩니다.
4. **UI/UX 일관성**: 눈금자 단위와 가시성 토글이 사용자의 현재 작업 맥락(배율, 숨김 모드)에 맞게 완벽하게 동기화되어 직관적인 작업 환경을 제공합니다.
5. C++ 백엔드의 응답이나 메모리 초기화 여부와 상관없이, 프론트엔드가 능동적으로 렌즈 UI 오프셋을 지배하고 방어하는 견고한(Robust) 아키텍처로 탈바꿈했습니다.
6. **완벽한 가공 좌표 일관성 보장**: 시각적 화면 이동(줌, 스크롤) 및 피팅 동작이 실제 가공용 원점 계산식을 간섭하지 않도록 아키텍처적으로 분리하여, 사용자가 보는 그대로 가공되는 고정밀성을 달성했습니다.
7. **캘리브레이션 스테이지 위치 연동 완벽 복원 및 스케일 완전 동기화**: 임의의 스테이지 위치에서 `Laser Set Center`를 수행하더라도, 장비의 물리 오차와 이중 보정이 제거된 정확한 상대 좌표의 가공 명령을 방출하며, 어떠한 배율의 렌즈 모드에서도 캔버스 UI와 물리 카메라 위치가 기하학적으로 완벽히 일치하는 궁극의 좌표 무결성을 확보했습니다.
8. **다중 선택 조작성 및 레시피 보존 치수 무결성 확보**: 도형 다중 선택 및 **그룹(Group) / 해제(Ungroup)** 시에도 선 두께나 로컬 좌표 변환에 왜곡되지 않은 정확한 기하학적 치수로 제어가 가능해졌으며, 저장/로드 간 1000 px/mm 표준 정규화 파이프라인 연동으로 시스템 환경이나 캘리브레이션이 변경되어도 설계 치수가 일관되게 복원됩니다.
9. **재기동 및 이동 완료 핏 신뢰성 극대화**: 기동 극초기 positions 싱크 대기 가드 및 `updateRuler` 의 오프셋 정렬 통일로 인해, 프로그램 재기동 후 첫 이동 시에도 2-Step 피팅 안착이 누수 없이 정상 작동하며, 안착 완료 직후 `userPan` 오염으로 화면이 튕겨 나가는 시각적 결함이 영구적으로 해결되었습니다.
10. **해칭(빗금) 프리뷰 렌더링 물리 밀착 정합 및 수동 Ungroup 완성**:
    - **_renderFill 패치 통합**: 모든 2D 도형이 면을 채울 때 타는 공통 진입점인 `fabric.Object.prototype._renderFill` 을 패치하여, 줌/패닝이 완벽하게 인가된 로컬 `(0,0)` 공간 위에서 직접 빗금을 덧그리도록 하여 **모든 도형(개별/그룹/매트릭스) 해칭 프리뷰 렌더링을 100% 정상화**했습니다.
    - **_restoreObjectsState 복원**: Ungroup 처리 시 Fabric.js 코어 내부 API인 `group._restoreObjectsState()` 를 활용해, 자식들의 원래 originX/Y 정렬 기준과 배율을 한 화소의 미세 떨림도 없이 무결하게 캔버스 제자리에 역산 복원해 ungroup 안정성을 확보했습니다.
11. **그룹 내 Native 도형 가공 품질 유지 및 다중 엔진(Scanner/GCode) 일관성 확보**: 도형이 묶이거나 중첩되더라도 고유의 원호 정보(CIRCLE/ARC)와 회전 각도를 가공 엔진 끝단까지 운반하여 단일 최적화 명령(`G02` 등)으로 방출함으로써 CNC 파서 부하를 줄이고 렌더링 화면과 완벽하게 일치하는 고품질 타각(Hatching 및 Profile) 결과를 달성했습니다.
12. **UI/UX 정합성 및 제어 컴포넌트 안전성 확보**: 속성 패널을 CSS Grid로 재설계하여 어떠한 환경에서도 정렬이 무너지지 않으며, 소수점 입력 제어의 Lifecycle을 철저히 분리(onChange ↔ onBlur)하여 React State 기반의 제어 폼(Controlled Input) 입력 방해 버그를 영구적으로 제거했습니다.
13. **텍스트 도형 단어별 해칭(Hatching) 최적화 및 좌표 무결성 달성**: 가공 시 텍스트 전체를 한 번에 채우면서 발생하던 비효율적인 점프 현상을 제거하고, 글자(단어)별 순차 가공으로 롤백(Rollback)하면서도 외곽선-채우기 간의 이탈 현상을 방지할 수 있도록 하드웨어 오프셋(`offsetMm`)과 원점 기하학 좌표(`getCenterPoint()`) 수학을 완벽히 동기화하였습니다.
14. **가공 중 렌더링 가시성 차단 필터링 및 측정 도구 은닉화**: `isProcessingLocal` 상태 진입 시 사용자 도형뿐만 아니라 측정 모듈(`isMeasurement`)까지 완벽하게 가려지도록(hide) 필터링 예외 조항을 제거하여 사용자 시야 간섭을 차단하고, 가공 완료 시 원래 설정된 가시성(`userVisible`)에 맞추어 상태를 즉시 복원합니다.
15. **해칭(Hatch Overlay) 절대 좌표 추적 및 패닝(Panning) 갱신 지연 완벽 해결**: 해칭을 렌더링하는 영역이 구버전의 강제 변환 매트릭스(`objMatrixOpt`)에 갇혀, 가공 완료 후 도형을 드래그하여 패닝할 때 해칭이 즉시 따라오지 않던 고질적 버그를 수정했습니다. 단일/그룹 도형 상관없이 Fabric.js V6의 강력한 기하학 추적기(`obj.calcTransformMatrix()`, `obj.getCoords()`, `obj.getCenterPoint()`)만을 참조하도록 렌더링 파이프라인을 간소화하여 어떤 상호작용에서도 즉각적으로 1프레임 딜레이 없이 해칭이 추적 및 동기화됩니다.
16. **해칭 바운더리 클램핑(Clamping) 및 그리드 앵커 일치화**: 마진(Margin) 적용 시 가상의 해칭 눈금자를 이동시키지 않고 바운더리 바깥 선분들만 제한선(Limit)에 클램핑함으로써, 내부 간격은 엄격히 유지하고 UI 오버레이와 가공 궤적을 픽셀 단위로 100% 동기화했습니다.
17. **JUMP 딜레이 하드웨어 억제 및 방향 무결성(Two-Way) 확보**: C++ 갈보 컨트롤러 단의 `MovetTo` 점프 함수를 정상화하여 느린 설정 속도에서도 JUMP 복귀 시의 2~3초 딜레이를 물리적으로 제거하였고, 프론트엔드의 `drawnIdx` 트래킹을 통해 복잡한 다중 도형에서의 해칭 왕복(지그재그) 처리리가 꼬이지 않는 무결성을 달성했습니다.
18. **ARC 객체 켤레호(Conjugate Arc) 거울 왜곡 차단 및 CCW 동기화**: `SinoGalvo` 스캐너가 하드웨어적으로 수학적 표준 반시계 방향(CCW) 각도를 따른다는 특성에 맞춰, 기존에 강제로 도입되었던 잘못된 +180도 위상 변환 오프셋을 전면 제거하고 캔버스의 Mid Point 포함 여부 판별식으로 가공 방향의 무결성을 확보했습니다.
19. **원호(ARC) 오프셋 오류 및 렌더러 원점 무결성 수립**: `Fabric.js` 엔진이 호의 원점 좌표를 '온전한 원의 중심'으로 고정한다는 아키텍처를 정확히 반영하여, 구버전 코드에 잔존했던 '타이트한 바운딩 박스 중심'을 찾으려던 무리한 보정치(`bboxLocalX, bboxLocalY`)를 `0`으로 완전 삭제함으로써 G-code 변환 시 궤적이 화면에서 엉뚱하게 치우치는 버그를 근본적으로 제거했습니다.
20. **프로세스 무한 대기(Hang) 상태 이중 검사 완화**: C++ 모듈(`SinoGalvoController.cpp`)에서 스캐너가 실질적 처리를 마쳤음에도 불구하고 단독 형상 등에 대한 플래그 확인 누락으로 100% 진행에서 영원히 루프에 갇힌 교착 상태를 완화 및 최적화하여 깔끔한 `IDLE` 전환을 구현했습니다.
21. **UX 제어권 강화를 위한 입력 검사 시점 분리 (Lifecycle Split)**: 캔버스 상단 UI에서 가공 치수 등의 '0' 입력 시 즉각적으로 최소 하한선 `0.001`로 변환되어 입력을 간섭하던 문제를 해결하기 위해, 중간 타이핑 임시 상태(`0`)를 허용하고 검사 포맷팅 시점을 `onBlur` 생명주기로 완벽히 분리했습니다.
22. **프로그램 기동 시 비동기 레이스 컨디션 해결 및 동기식 렌즈 상태 복원**: `AppShell.tsx` 마운트 즉시 `localStorage`로부터 이전 렌즈 상태(예: `object_x20`)를 동기적으로 로드하여 글로벌 스토어에 바인딩함으로써, 자식 컴포넌트 마운트 시점에 UI 상태가 스캐너 모드로 덮어씌워지는 경쟁 상태를 차단했습니다.
23. **Home All 완료 시 기본 스캐너 UI 자동 리셋**: 우측 패널에서 홈 호밍 완료 감지 시 자동으로 UI 상태를 디폴트 상태인 `scanner` 모드로 강제 리셋하여 장비 홈 좌표와 UI의 동기화를 일치시킵니다.
24. **기동 오프셋 싱크 전용 모드 및 최초 정렬 복귀 무결성**: 부팅 시 Z축 모션을 트리거하지 않고 오프셋 상태만 맞추는 `syncOnly` 모션 프로토콜 및 기동 후 최초 스캐너 전환 또는 `Move to Center` 클릭 시 상대 오프셋 편차 계산을 일시 배제하고 절대 오리지널 오프셋 원점으로 직접 강제 이동(`MovAbs`)하는 기구 복귀 시스템을 수립했습니다.
25. **가공 완료 리뷰 모드 전면 폐기 및 상태 단일화**: REVIEW 카드 UI(`shape review`, `Move to Center`)와 `isReviewMode` 상태를 시스템 전역에서 제거하고, 가공 후 오버레이 복원을 `isProcessingLocal` 트랜지션 단일 기준으로 통일하여 캔버스 잠금/가시성 상태 머신을 단순화했습니다.
26. **Navigate Mode(더블클릭 스테이지 이동) 확립**: 카메라 영상 투영의 정확한 역함수 기반 좌표 역산(줌/패닝 독립), 4중 자동 해제(도구/모드/배율/언마운트) + 호밍·가공 안전 가드, CSS `!important` 기반 소멸 불가 크로스헤어 커서, 이동 중 재클릭 차단을 갖춘 정밀 위치 지정 UX를 완성했으며, 잔여 오차는 카메라 스케일 캘리브레이션 품질에 귀속됨을 규명했습니다.
27. **절대 scene + 렌즈 프레임 재배치 아키텍처 확립 (§2.30)**: 스테이지↔scene 변환을 `sceneCoords.ts` 단일 모듈(절대 투영 `scene = stage × ppm`)로 통합하고, 모드(Scanner/x20/x50) 전환 시 백엔드의 스테이지 상대 이동량(moonsConfig 렌즈 오프셋 차이)만큼 도형을 저장/로드 정규화 파이프라인에서 재배치함으로써, 어느 모드에서든 도형이 카메라 뷰 중심 기준 동일한 상대 위치를 유지하고 워크 에어리어에는 카메라 이동 과정이 절대 좌표 그대로 표시되는 WYSIWYG 무결성을 달성했습니다. 저장 포맷은 Scanner 프레임 + 1000px/mm 표준으로 모드 독립적입니다.
28. **가공 오프셋 규약 통일 (§2.30)**: 갈보(ScannerPanel/SinoGalvo/Scanlab) 및 G-Code 가공 커맨드 생성의 `offsetMm`을 전부 `{0,0}`으로 통일했습니다 (갈보 = scene/ppm − 스테이지 위치, G-Code = scene/ppm). 카메라-레이저 정렬은 Laser Set Center의 영상 디지털 패닝(pixelX/pixelY)이 담당하며, recipeCenter의 스테이지 좌표 스냅숏(x,y)은 투영·표시·가공 어디에도 개입하지 않습니다.
29. **가공 중 뷰포트 추적 절대 좌표 단일화 및 발산 차단 (§2.31)**: 구 변위(lastProcessStartPosition) 기반 추적 2계통의 순환 발산(틱당 userPan 누적, fit to camera 353mm 이탈)을 제거하고, 검증된 JOG 절대 추적 이펙트를 오브젝트 가공 중에도 가동하도록 확장하여 "가공 추적 = 카메라 절대 위치 추적" 단일 수식(고정점, 발산 불가)으로 통합했습니다. 가공 시작 시 사용자의 현재 구도를 camera-relative userPan으로 1회 환산 보존합니다.
30. **복제/직렬화 커스텀 속성 무결성 (§2.31)**: 클립보드 복제 및 수동 저장 경로에 누락돼 있던 `isHairline`/`strokeUniform`을 보강하고 로드 시 헤어라인 굵기를 `2/zoom`으로 재정규화하여, 복제 도형의 선 굵기 동결 버그와 오염 저장 데이터를 자가 치유하도록 조치했습니다.
31. **Edit 바 입력 무결성 및 반복 가공 파이프라인 완성 (§2.32)**: Layout 입력의 draft/onBlur 커밋 분리와 특이행렬 3중 가드로 숫자 입력 오작동 및 CEF 렌더러 크래시를 원천 차단했고, Mark times/Shape Delay 기능을 UI(실사용 패널) → 생성 엔진(Template Method) → C++ 드라이버(교착 방어 타임아웃)까지 전 구간 유기적으로 완성했습니다.
32. **색상별 가공 프리셋 시스템 및 모드별 격리 확립 (§2.33)**: 도형을 색상 단위로 그룹화해 Mark Speed/Mark Times/Power/절대Z를 독립 지정하는 프리셋 체계를 구축하고, 스캐너/오브젝트(x20/x50) 모드별로 프리셋을 완전히 격리(LensScope)해 물리적으로 다른 Z 위치 값이 모드 간 혼선되지 않도록 했습니다. 부수적으로 DXF 그룹 크기 표시 제곱 버그와 캔버스 클릭 시 Edit 바 미반영 버그를 함께 해결했습니다.

---

## 4. ⚠️ 렌더링-가공 엔진 동기화 간 개발자 주의 사항 (Developer Warning)
* **기존 동작 코드 보존의 원칙 (Principle of Non-Destructive Fixing)**:
  * 신규 버그(특히 좌표 및 치수 등 기하학적 요소)가 발견되었을 때, 기존의 잘 동작하던 코드를 덮어쓰거나 무리하게 구조를 뜯어고쳐 새로운 오프셋이나 하드코딩된 상수(`+180`, `bboxLocalX` 등)를 억지로 끼워 넣는 경향을 주의해야 합니다.
  * 새로운 이슈가 발생하면 "코드를 당장 수정하는 것"이 아니라, **`Fabric.js`나 하드웨어 SDK가 해당 객체를 어떻게 해석하고 바운딩 박스를 구성하는지 근본적인 설계(Root Cause)부터 먼저 파악**하십시오.
  * 기존 구조를 무시한 땜질식 코드 변경은 다른 도형이나 특정 스케일/조작에서 연쇄적인 회귀 버그(Regression)를 유발할 확률이 매우 높습니다. 수정 시 항상 부작용이 없는 최적의 경로인지 면밀히 검토할 것!
