# Feature Checklist: Scanner 연동 및 가공 프로세스

이 문서는 Scanner(Galvo) 시스템의 연동 및 가공 설정을 위한 핵심 구현 사항과 상태를 기록합니다.

## 1. 기능 개요
Scanner 가공 시스템의 정밀 제어를 위해 보정(Correction) 파라미터와 축 설정(Axis Settings)을 관리하며, 이를 실시간으로 하드웨어에 적용하고 파일로 영속화하는 기능을 제공합니다.
- **주요 로직**:
    - **Basic Correction**: HRatio, VRatio를 통한 스케일 보정 및 Correct Size(WorkSize) 설정.
    - **Distortion Correction**: Barrel, Trapezoidal, Parallelogram 왜곡 보정 알고리즘 적용.
    - **Axis Setting**: XY Swap, X/Y 축 반전(N-Type) 하드웨어 매핑 제어.
    - **Persistence & Isolation**: `Bin\Config\GalvoConfig.json`을 통한 설정 보존 및 `RecipeCenter.json`을 통한 Scanner/Object 렌즈별 오프셋(Offset) 독립 격리.

## 2. 주요 클래스 및 인터페이스

### Backend (Native C++)
- **[IScannerController](file:///d:/000.Git_Project/LW2-3/LASERnGRAPN/Modules/Scanner/IScannerController.h)**: 스캐너 하드웨어 기종 독립적인 공통 제어 인터페이스 (Initialize, LoadCommands, Run, Stop, Get/Set 속도 및 왜곡 보정 API 포함).
- **[SinoGalvoController](file:///d:/000.Git_Project/LW2-3/LASERnGRAPN/Modules/Scanner/SinoGalvo/Base/SinoGalvoController.h)**: 기존의 단일 제어 구조인 `GalvoController`를 인터페이스 다형성 확보를 위해 리팩토링하여 `IScannerController`를 구현하고 SinoGalvo 전용 제어(JhcLib 연동)를 격리 캡슐화한 클래스.
- **[PortalRouterHandler](file:///d:/000.Git_Project/LW2-3/LASERnGRAPN/Core/Communication/PortalRouterHandler.cpp)**: CEF 기반 IPC 통신 핸들러. 내부적으로 물리 기종에 구애받지 않고 다형성 전역 인터페이스 `g_Scanner`를 통해 명령을 전달함.

### Frontend (TypeScript/React)
- **[ScannerParameterForm.tsx](file:///d:/000.Git_Project/LW2-3/Portal/src/ui/pages/Parameter/ScannerParameterForm.tsx)**: 하드웨어 가용성 프로필(`hardware.scanner`) 값에 따라 시노갈보 또는 스캔랩용 UI 위젯을 동적으로 선택 및 마운트하는 팩토리 스위칭 컴포넌트.
- **[SinoGalvoParameterForm.tsx](file:///d:/000.Git_Project/LW2-3/Portal/src/ui/pages/Parameter/SinoGalvoParameterForm.tsx)**: 시노갈보 하드웨어 전용 캘리브레이션(배럴, 사다리꼴, 평행사변형 왜곡 보정) 위젯.
- **[SinoGalvoProcessPanel.tsx](file:///d:/000.Git_Project/LW2-3/Portal/src/ui/shell/SinoGalvoProcessPanel.tsx)**: 시노갈보 가공 개시 및 조작을 담당하는 UI 프로세스 위젯.
- **[HardwareFacade.ts](file:///d:/000.Git_Project/LW2-3/Portal/src/services/HardwareFacade.ts)**: CEF 비동기 통신을 단일 인터페이스로 래핑한 파사드 서비스.

## 3. 적용된 디자인 패턴
- **Strategy & Strategy Pattern (다형성 인터페이스)**: `IScannerController`와 `g_Scanner` 전역 인터페이스를 수립하여 물리 장치 유형(SinoGalvo, Scanlab)에 따른 가공 전략을 런타임에 동적으로 변경 가동 가능.
- **Factory Pattern**: 프론트엔드 파라미터 화면 스위칭 구조 및 C++ 드라이버 클래스 로더(`RtcDriverFactory`)에 적용하여 동적 결합도 완화.
- **Facade Pattern**: `HardwareFacade`를 적용하여 비즈니스 레이어와 백엔드 통신 레이어 격리.

## 4. 의존성 정보
- **JhcLib**: 스캐너 제어 전용 하드웨어 라이브러리(DLL)와 연동.
- **CEF (Chromium Embedded Framework)**: UI-Native 간의 브릿지 및 JSON 파싱/생성을 위해 사용.
- **nlohmann/json** (내부적으로 사용 가능): 설정 파일 영속화.

## 5. 사용법 및 제약 사항
- **정밀도 주의**: 보정값은 미세한 차이로 가공 품질이 결정되므로, 모든 보정 변수는 `double` 타입을 사용하여 처리해야 합니다. (`float` 사용 시 JSON 저장 시 오차 발생 가능).
- **스레드 안전성**: `PortalRouterHandler`에서 CEF Dictionary 객체에 접근할 때는 반드시 UI 스레드에서 값을 미리 추출(Copy)한 후 `WORK_1` 등의 작업 스레드로 넘겨야 합니다. 그렇지 않으면 Access Violation으로 프로그램이 종료됩니다.
- **JSON 경로**: 모든 설정은 `Bin\Config\GalvoConfig.json`에 저장되므로, 배포 시 해당 경로의 쓰기 권한이 확보되어야 합니다.
- **뷰포트 독립적 가공 원점 계산**: 가공 명령(G-Code/Scanner Commands) 생성 시, 캔버스의 시각적 줌 배율이나 수동 스크롤 상태(`viewportTransform`)가 원점 연산에 절대 간섭하지 않아야 합니다. 가공용 `realOrigin`은 반드시 물리 스테이지 위치(`positions`)와 화소 스케일(`pxPerMm`)만을 기반으로 계산하여 좌표계 일치성을 유지해야 합니다.
- **[개정 2026-07-17] 절대 scene 좌표계 및 가공 오프셋 규약**: 캔버스 scene은 절대 기계 좌표(`scene = stage × pxPerMm`, `Portal/src/ui/pages/Recipe/Canvas/utils/sceneCoords.ts`)입니다. 갈보 가공 커맨드는 `galvo = scene/ppm − 현재 스테이지 위치` (ScannerGenerator의 `origin` = 스테이지 위치 × ppm, `offsetMm = {0,0}`)로 생성합니다. **구버전 규약이던 recipeCenter 스테이지 좌표 `(mx, my)`의 offsetMm 가산은 폐기**되었습니다 — 카메라-레이저 정렬은 Laser Set Center의 영상 디지털 패닝(pixelX/pixelY)이 담당하며, 스테이지 좌표 스냅숏을 가공 수식에 개입시키면 이중 보정이 됩니다 (상세: arch_CanvasProc.md §2.30).

## 6. 최근 업데이트 (2026-07-16)

### 6.1 스캐너 가공 시작 지연(10초 딜레이) 완전 해결
*   **이슈**: 가공 시작(Marking) 직전 Z축의 초점 정밀도를 `0.002`mm 이하로 대기시키는 Rtc6/SinoGalvo 루프가 Mechanical Jitter로 인해 무한 대기 또는 심각한 지연을 발생시킴.
*   **해결**: Z축 완료 판정 정밀도를 현실적인 **`0.005`mm 로 완화**하고, 최대 **`1.5`초 하드 타임아웃** 방어 스레드 타이머를 도입하여 정지 신뢰성 확보 즉시 지연 없이 가공이 실행되도록 교정했습니다.

### 6.2 Move to Scanner Center 절대 좌표 복귀 구현
*   **이슈**: 스캐너 모드 운전 및 JOG 수동 테스트 도중 원래의 초기 시작 위치(Stage Original Center)로 안전하게 되돌아오는 강제 복귀 기능의 필요성.
*   **해결**: 하단의 `Move to Center` 버튼 클릭 시 `forceAbsolute: true` 를 백엔드로 전달하여 상대 오프셋 이동 로직을 우회하고, 파라미터 UI에 설정된 절대 오리지널 좌표인 **`StageX_Offset` 과 `StageY_Offset` (Stage Original Center) 위치로 직접 절대 이동(`MovAbs`)**하게 통제했습니다.

### 6.3 Shape Delay 및 Mark Times 가공 제어 추가 (2026-07-16)
*   **기능**:
    - **Shape Delay (sec)**: 가공 시 도형과 도형 사이(첫 도형 가공 시작 전에는 지연을 무시)마다 지정된 초 단위 시간만큼 대기 지연을 수행합니다.
    - **Mark times**: 전체 가공 시퀀스를 처음부터 끝까지 N회 반복 가공하도록 설정합니다 (기본값: 1).
*   **하드웨어 동기화 메커니즘**:
    - 갈보 제어 명령어 목록에 **`DELAY` 명령어**를 추가하여 백엔드로 전송합니다.
    - 백엔드 C++ 드라이버(`SinoGalvoController`, `ScanlabController`) 루프 내에서 `DELAY` 명령어를 파싱하면, 이전까지 적재된 버퍼를 즉시 실행하고 완료될 때까지 대기한 후, 레이저가 꺼진 대기 상태로 `Sleep(delayTime * 1000)` 처리하여 정확한 물리 지연을 보장하도록 구현하였습니다.

### 6.4 갈보 가공 오프셋 규약 통일 (offsetMm = {0,0}) (2026-07-17)
*   **이슈**: 갈보 가공 패널 3종(ScannerPanel, SinoGalvoProcessPanel, ScanlabProcessPanel)이 `offsetMm = recipeCenter[활성모드]`를 전달하고 있었음. 절대 scene + 렌즈 프레임 재배치 아키텍처(arch_CanvasProc.md §2.30) 도입 후 이는 이중 보정이 되며, 특히 오브젝트 모드에서 갈보 구동 시 13mm급 오발사 좌표를 생성할 위험이 있었음.
*   **해결**: 3개 패널 모두 `offsetMm = {x: 0, y: 0}`으로 통일하고 미사용이 된 recipeCenter 구독 코드를 정리. 갈보 좌표는 오직 `scene/ppm − 스테이지 위치`로 산출되어 화면 오버레이 위치 그대로 타각됨 (WYSIWYG). 현재 장비의 `recipeCenter.scanner = (0,0)`이므로 스캐너 모드 실가공 동작에는 변화가 없으나, 향후 임의 위치에서 Laser Set Center를 수행해도 가공 좌표가 오염되지 않음.

### 6.5 Scanner Process 탭 Shape Delay / Mark times 실연결 및 ScannerGenerator 반복 엔진 구현 (2026-07-17)
*   **이슈 (기능 미동작의 진짜 원인 2건)**:
    1. §6.3에서 추가된 Shape Delay/Mark times UI가 실제로는 **어디에서도 import되지 않는 죽은 코드(`components/ScannerPanel.tsx`)**에만 존재했음. 실제 Scanner Process 탭은 `RightPanel.tsx`가 장비 종류에 따라 `SinoGalvoProcessPanel` / `ScanlabProcessPanel`을 마운트하며, 이 두 패널에는 입력 위젯도, `generate()` 옵션 전달도 없었음.
    2. `ScannerGenerator.generate()`에는 `shapeDelay`/`markTimes` **옵션 타입 선언만 있고 반복 루프와 DELAY 삽입 로직이 미구현**이었음 (인수인계 문서와 코드 불일치).
*   **해결**:
    - **[Design Pattern: Template Method] ScannerGenerator 리팩토링**: `generate()`가 전체 골격(N패스 반복 → Z 복원 → CENTER 복귀 1회)을 정의하고, 단일 패스는 `generatePass()`에 위임. 각 도형 처리 전 명령 수를 기억했다가 **실제 명령이 생성된 도형에 한해** 도형 사이 시점(전체 시퀀스 첫 도형 제외)에 `DELAY` 명령을 `finally` 블록에서 splice 삽입. 진행률은 `(패스×도형수+idx)/(총패스×도형수)`로 환산 보고.
    - **MatrixRepeater 재귀 안전화**: 재귀 호출이 `generate()` 대신 `generatePass()`를 직접 사용하도록 변경하여 반복/지연/CENTER의 중복 적용을 차단 (기존에 셀마다 CENTER가 삽입되던 잠복 부작용도 함께 해소).
    - **공용 위젯 신설**: `ui/components/control/MarkRepeatSettings.tsx` (Shape Delay + Mark times 2열 Grid, §2.25 onBlur 생명주기 준수)를 `SinoGalvoProcessPanel`/`ScanlabProcessPanel` 양쪽에 장착하고 `generate()` 호출에 `shapeDelay`/`markTimes` 옵션 전달.
    - **진행률 회차 표시**: 공용 `ProcessDashboard`에서 Mark times > 1이면 진행바 하단 전용 행(구분선 분리)에 **"MARK TIMES n / N"** 표시 (전체 진행률 0~100%를 회차 구간으로 환산).
*   **⚠️ 주의**: `components/ScannerPanel.tsx`는 미사용 죽은 코드로 확인됨(삭제는 비파괴 원칙에 따라 보류). 갈보 가공 UI 기능 추가 시 반드시 `SinoGalvoProcessPanel`/`ScanlabProcessPanel`을 수정할 것.

### 6.6 갈보 드라이버 교착(Hang) 방어 및 Scanlab DELAY 명령 유실 버그 수정 (2026-07-17)
*   **이슈**: Mark times 기능 반영 재빌드 이후 Process Start 시 시노갈보 가공이 시작되지 않고 멈추는 증상 보고. 분석 결과 무한 대기 루프 3곳(타임아웃 부재)과 Scanlab 측 이중 증가 버그를 확인.
*   **해결 (SinoGalvoController.cpp — [Design Pattern: Guarded Wait + Hard Timeout])**:
    1. **시작 전 대기**: `Run()` 진입 직후 `GetMarkingState()==0` 대기 루프에 3초 하드 타임아웃 → 초과 시 `Cancel()`로 보드 상태 복구 후 진행 (이전 런 비정상 종료로 busy 고착 시 가공 미시작 교착 차단).
    2. **완료 대기**: `CheckMarkingState()`에서 Idle(`GetMarkingState()==1`) 확인 후 완료 비트(`MarkStatus & 0x01`)가 2초(20×100ms) 내 미세트면 강제 탈출 — feature_Draw.md §4.3에 문서화되었으나 소스에서 유실돼 있던 픽스를 재적용.
    3. **다음 청크 대기**: 5초 타임아웃 + `Cancel()` 복구.
    4. **진단 로그**: pre-wait 진입/탈출, Shape Delay 실행 시점(`cmd n/m`, 지연 초)을 `OutputDebugStringA`로 출력 — DebugView로 멈춤 지점 실기 추적 가능.
*   **해결 (ScanlabController.cpp)**: DELAY 분기의 `++cmdIndex; continue;`가 for문 증감식과 중복되어 **DELAY 직후 명령(다음 도형의 첫 명령)이 유실**되던 이중 증가(+2) 버그 제거 (Z_MOVE 분기와 동일하게 `continue`만 수행).
*   **참고**: `PortalRouterHandler`는 `CENTER` 타입을 파싱하지 않고 드롭함(`else continue`). 컨트롤러가 `ReturnToCenterPoint()`를 자체 수행하므로 기능 문제는 없으며, 명시 파싱 추가는 보류.

### 6.7 ⚠️ C++ 소스 한글 주석 인코딩 금지 규약 (2026-07-17 사고 사례)
*   **사고**: `SinoGalvoController.cpp`에 한글 주석을 추가하자 C2065(선언되지 않은 식별자) 컴파일 오류 발생.
*   **원인**: 본 프로젝트의 .cpp는 **BOM 없는 UTF-8**인데 MSVC는 `/utf-8` 플래그 없이 **CP949로 해석** → UTF-8 한글 주석의 끝 바이트가 더블바이트 선행바이트로 오인되어 **개행을 삼키고 다음 코드 줄까지 주석 처리**됨 (컴파일 오류 또는 무증상 코드 소실).
*   **규약**: C++ 파일의 신규 주석은 **반드시 ASCII 영문으로만** 작성할 것. (TypeScript/TSX는 UTF-8 정상 처리이므로 한글 무방)

### 6.8 색상별 프리셋(Layer-Default) Mark Times 반복 뭉침 버그 및 진단 로깅 인프라 (2026-07-20)
*   **이슈**: 색상별 가공 프리셋 도입 후, 같은 색상 그룹을 Mark Times>1로 반복해도 물리적으로 1회만 가공됨. §6.6에서 도입한 하드 타임아웃 대기 루프(`GetMarkingState()==0` pre-wait 3s / next-chunk-wait 5s)가 매번 거의 끝까지 소진되는 정황도 함께 발견(가공 시작 전·반복 사이 각 ~3초 지연 보고).
*   **원인 (Mark Times 뭉침)**: Z가 같고 Shape Delay가 0이면 반복 사이에 `Z_MOVE`/`DELAY` 경계 명령이 전혀 없어, N번 반복 도형이 하나의 버퍼 job으로 합쳐짐(§6.3의 DELAY 메커니즘이 반복 경계에는 적용되지 않고 있었음).
*   **해결**: `ScannerGenerator.generate()`에서 Mark Times 반복/색상 그룹 경계마다 `DELAY` 명령을 명시적으로 삽입(전역 Shape Delay 값 사용, 0이어도 플러시만 강제해 즉시 다음 가공). `generatePass()` 내부의 기존 도형-간-지연 삽입과 중복되지 않도록 `IGenerationContext.suppressNextShapeDelay` 가드 추가.
*   **진단 로깅 인프라 신설**: `SinoGalvoController.cpp`에 `DiagLog(msg, level)` 헬퍼 도입 — 기존 대기 루프 3곳(pre-wait/next-chunk-wait/`CheckMarkingState`)에 100ms 간격 폴링 로그(경과시간+`GetMarkingState()` 원값)를 추가하고, `OutputDebugStringA`뿐 아니라 (a) `window.__onNativeLog` 콜백으로 Portal SYSTEM CONSOLE에도 실시간 표시, (b) 기존 `LogManager::Write()`로 `Bin\Log\Log_*.txt`에도 시간순·무압축 저장하도록 3중 출력화. SYSTEM CONSOLE은 기본 숨김이며 로고 5회 클릭(고급 모드)으로만 노출.
*   **3초 지연 근본 원인**: 구버전 참고 프로그램(`GalvoController.cpp`, 동일 대기 조건이지만 타임아웃 없음)에서는 지연이 없었다는 점에서, 정상이라면 대기 루프가 거의 즉시 풀려야 함 — 즉 하드웨어가 실제로 매번 수 초간 busy(0) 상태를 유지하는 것으로 추정되나, 확정을 위해 위 진단 로그로 실기 데이터 확보가 필요(진행 중).
*   **⚠️ 사고**: 진단 로그 추가 중 `DiagLog`의 Doxygen 주석을 한글로 작성했다가 §6.7 규약 위반을 뒤늦게 발견 — 영문으로 재작성함. 이 파일에 남아있는 세션 이전 한글 주석 7줄(§6.7 사고의 실물 증거인 607행 부근 깨진 텍스트 포함)은 이번 범위 밖이라 방치했으니, 다음에 이 파일을 손댈 때 정리할 것.
*   **상세**: `docs/checkpoints/process preset.md` §3, §7 참조 (색상별 프리셋 시스템 전체 아키텍처 및 진단 로그 도입 경위).

### 6.9 매트릭스(Matrix/Grid Array) 가공 커맨드 생성 버그 3건 수정 (2026-07-20)
*   **이슈 1 (절대 위치 오류)**: 매트릭스를 캔버스 원점에서 떨어진 위치에 그리고 가공하면, 화면 오버레이 위치가 아닌 엉뚱한(원점 근처, 우측 하단 대각선 방향) 위치에 실제로 타각됨. 셀 간 상대 간격(X-Spacing/Y-Spacing)만은 정확했음.
*   **원인**: `ScannerGenerator.ts`/`useGCodeGenerator.ts`의 `MatrixRepeater` 전용 고속 생성 경로가 셀 위치를 `col × repeater.xSpacing + override.xOffset`으로만 계산하고, **매트릭스 자체의 실제 scene 위치(`repeater.left/top`)를 더하는 코드가 없었음**. `ScannerGenerator.ts`에는 `const cx = (obj.left||0) + dx;`처럼 올바르게 계산해두고도 실제로는 전혀 사용하지 않는 죽은 코드가 그 증거로 남아있었음.
*   **해결**: `Portal/src/ui/pages/Recipe/Canvas/fabric/MatrixRepeater.ts`에 신설된 `getCellSceneOrigin(row, col, override)`(캔버스 렌더링, `CanvasTopBar`의 X/Y 표시·입력과 공유하는 단일 진실 공급원 — `docs/checkpoints/feature_Draw.md` §4.13 참조)를 두 생성기 모두에서 호출하도록 교체.
*   **이슈 2 (Object 모드 150셀 캡)**: `useGCodeGenerator.ts`에는 Scanner 모드와 달리 `MatrixRepeater` 전용 분기가 아예 없어, 매트릭스가 `FabricToPaperAdapter.ts`의 `MatrixRepeater` 변환 분기(`repeater.getVirtualObjects()` 호출, LayerList 표시 전용으로 150셀 초과 시 빈 배열 반환)로 흘러갔음. 그 결과 150셀(약 13×12)을 넘는 매트릭스를 Object 모드로 가공하면 오류 없이 G-Code가 한 줄도 생성되지 않았음.
*   **해결**: `useGCodeGenerator.ts`에 `ScannerGenerator.ts`와 대칭인 `processMatrixRepeater()`를 신설해 `xCount × yCount`를 직접 순회하도록 하고, 공통 단일 오브젝트 처리 로직은 `processOneObject()`로 추출해 최상위 도형 루프와 매트릭스 셀 루프가 함께 재사용하도록 리팩토링.
*   **이슈 3 (색상 그룹핑 오류)**: Generated Commands 패널에서 매트릭스가 `Color #000000`(검은색)으로 잘못 그룹핑됨(Mark Times/색상별 프리셋이 매트릭스에는 엉뚱하게 적용될 위험).
*   **원인**: `utils/colorUtils.ts`의 `resolveObjectColorHex()`가 `MatrixRepeater` 자신의 `fill/stroke`(Fabric Group 기본값, 검은색)를 읽고 실제 셀을 그리는 `sourceObjects[0]`을 보지 않았음. 이 함수는 `ScannerGenerator.ts`의 `groupByColorPreset()`뿐 아니라 우측 CurrentLayer 패널의 레이어 스와치(`useCanvasColorGroups.ts`)에서도 공유되므로 두 곳 모두 영향을 받았음.
*   **해결**: `resolveObjectColorHex()`가 `MatrixRepeater`면 `sourceObjects[0]`을 읽도록 단일 지점에서 수정 — 상세 근본 원인은 `docs/checkpoints/feature_Draw.md` §4.15/§4.16 참조.

### 6.10 Generated Commands UI 주석(COMMENT) 표시 신설 (하드웨어 미전송 보장) (2026-07-20)
*   **요청**: Object 모드 G-Code 생성기처럼, Scanner 모드 Generated Commands 패널에도 도형 타입·Mark Times 반복 회차·매트릭스 셀 정보를 주석으로 표시하되, 이 주석이 실제 하드웨어 전송 커맨드에는 절대 섞이지 않아야 함.
*   **구현**: `ScannerCommand`에 UI 표시 전용 타입 `'COMMENT'`(`text` 필드 사용)를 추가. `ScannerGenerator.generate()`/`generatePass()`가 `Pass N/M - Color #hex`, `Shape N/M: type`, `Matrix Cell (row,col) [i/N]: type` 주석을 커맨드 배열에 삽입(`suppressShapeComment` 옵션으로 매트릭스 재귀 호출 시 중복 주석 방지). Shape Delay/emittedShapes 집계 로직이 주석 자체를 "실제 발행된 커맨드"로 오인하지 않도록, "도형이 실제 커맨드를 냈는지" 판정 기준점(`cmdCountAfterComment`)을 주석 삽입 **이후**로 별도 분리.
*   **하드웨어 전송 경계에서 이중 필터링**: `HardwareFacade.generateScannerCommands()` 진입점 한 곳에서 항상 `type !== 'COMMENT'`로 필터링 후 IPC 전송 — 어떤 UI 패널에서 호출하든 주석이 네이티브 드라이버(SinoGalvoController 등)로 새어나갈 수 없도록 보장.
*   **UI 렌더링**: `SinoGalvoProcessPanel.tsx`/`ScanlabProcessPanel.tsx`의 Generated Commands 텍스트 뷰에서만 `/* text */` 형식으로 렌더링, 헤더의 커맨드 개수 표시는 주석을 제외한 실제 커맨드 수를 유지.

### 6.11 ⚠️ GetMarkingState() 극성 오반전 사고 및 SDK 매뉴얼 확정 (2026-07-21)
*   **사고 경위**: 이전 세션이 "코드가 0=Busy,1=Idle로 가정했는데 헤더 주석(`JhcLib.h`)은 1=Busy,0=Idle이라 모순"이라 판단해, `SinoGalvoController.cpp` 3곳(pre-wait/next-chunk-wait/`CheckMarkingState`)의 극성을 **헤더 주석에 맞춰 반전**했음. 재빌드 후 실기 테스트에서 (a) 사각형 1개 가공이 완료 판정 안 되고 무한 RUNNING(먹통), (b) 매트릭스 가공 중 조기 완료 오판 + 오버레이 노출, (c) 스캐너 보드 먹통이 발생.
*   **근본 원인 (극성 반전이 오류였음)**: 벤더 공식 문서 **CSG9210 SDK Manual V1.0 p.11 `JHCGetMarkingState`**가 결정적 — 반환값 **`1: end of sending data`(전송 완료/Idle), `0: not over`(동작 중/Busy)**. 즉 **원본 코드의 `0=Busy, 1=Idle`가 정답**이고, `JhcLib.h`의 인라인 typedef 주석(`1:Busy, 0:Idle`)이 오기(誤記)였음. 코드 내 다른 근거도 모두 일치: `JhcLib.cpp` `ScannerUtil::WaitFinish()`가 SDK 매뉴얼을 직접 인용(`[cite: 49]`)해 `0=not over, 1=end of sending data`로 명시, feature_Draw.md §4.3도 `Idle == GetMarkingState()==1`로 서술.
*   **조치**: 3곳 극성을 원본(`0=Busy,1=Idle`)으로 **원복**하고, 각 지점에 SDK 매뉴얼 근거 + "새 하드웨어 증거 없이 재반전 금지" 경고 주석 추가. `JhcLib.h:95` typedef 주석을 `0:Busy/not over, 1:Idle/end of sending data`로 정정하고 `JhcLib.cpp` 참조를 명기. 세션 이전 깨진 한글 주석(§6.7 실물 증거) 및 mojibake도 이번에 ASCII로 정리.
*   **조기완료 오판 근본원인 확정 및 260602 동작 복원 (2026-07-21 추가)**: SDK 매뉴얼상 `GetMarkingState()==1`은 "**데이터 전송 완료**"이지 "물리적 마킹 완료"가 아님(갈보는 ==1 이후에도 계속 마킹 중). 검증된 정상 버전 `C:\LW23_porg\source\LW2-3_JNU설치 버전_260602`의 `GalvoController::CheckMarkingState()`와 직접 비교한 결과, 2026-07-16/17에 추가된 두 "수정"이 조기완료·Stop 지연의 진짜 원인임을 확정:
    1. **`idleConfirmCount>=20` 강제탈출**(feature_Draw.md §4.3, §6.6): ==1은 마킹 진행 중에 도착하므로 done-bit(`MarkStatus & 0x01`)이 정당하게 아직 0인데, 2초(20×100ms) 후 강제로 "완료" 처리 → 진행률 100%·오버레이 show·버튼 Start가 **물리 가공 중에** 발생(사용자 스크린샷의 바로 그 증상).
    2. **`Sleep(100)` 폴링**: Stop 반응이 최대 100ms 지연되고 done-bit 감지도 느려짐. 260602는 `Sleep(1)`(1ms).
    → `CheckMarkingState()`를 260602 동작으로 복원: **강제탈출 제거**(done-bit이 set될 때만 종료), **`Sleep(1)` 폴링 복원**(Stop 즉시 반응 + done-bit 확실 포착). 진단 로그는 1ms 폴링 폭주 방지를 위해 200ms 간격 스로틀. done-bit이 실기에서 확실히 set된다는 근거는 260602가 이 로직으로 정상 동작했다는 사실. `MarkStatus` 주석(`0:Idle,1:Marking`)과의 표면적 모순은 260602부터 동일했고 정상 동작했으므로 실용상 무해.
*   **부수 개선**: `Run()`의 pre-wait(3s)/next-chunk-wait(5s) 대기 루프에 `m_stopFlag` 확인이 없어 Stop이 최대 3~5초 지연되던 문제도 수정(즉시 `Cancel()` 후 탈출). Stop 지연은 이 루프들과 위 `Sleep(100)` 두 곳이 합쳐진 것이었음.

### 6.12 매트릭스 대각선 오가공 재발(§6.9) 및 DXF 리사이즈/매트릭스 버그 수정 (2026-07-21)
*   **매트릭스 대각선 오가공 재발 (Scanner 모드 한정)**: §6.9에서 `getCellSceneOrigin()`(단일 진실 공급원)로 고쳤던 셀 절대위치 계산이, **`Portal/src/services/ScannerGenerator.ts`의 MatrixRepeater 분기에는 반영되지 않은 채** `col*xSpacing + xOffset`(매트릭스 자신의 `left/top` 누락)로 남아 있었음. Object 모드(`useGCodeGenerator.ts:1263`)와 캔버스 렌더/CanvasTopBar는 이미 `getCellSceneOrigin()`을 호출하고 있어 Scanner 모드에서만 재발. → `ScannerGenerator.ts`도 `repeater.getCellSceneOrigin(row,col,override)`를 호출하도록 교체(dot 경로 주석의 "sourceObjects have global left/top" 오해도 정정).
*   **DXF 로드 직후 리사이즈 오작동**: `CanvasTopBar.tsx`의 W/H 커밋에서, 그룹/ActiveSelection은 `getGroupLogicalSize()`가 **그룹 스케일이 이미 반영된 표시 크기**를 반환하는데(§4.8), 이를 목표값으로 나눈 "상대 배율"을 `set('scaleX', ...)`로 **절대값 대입**해 DXF 그룹의 실제 스케일(~pxPerMm)이 통째로 날아갔음. → 그룹 분기를 `scaleX * (목표/표시크기)`로 **기존 스케일에 곱하도록** 수정(단일 도형은 `width`가 스케일 독립이라 기존 공식 유지). 참고: "로드 직후 선택박스가 도형보다 크게 표시"되는 시각 증상은 재선택으로 해소되며, 리사이즈 수식이 스케일을 합성하므로 그 상태에서도 값 입력은 정상 동작(별도 런타임 확인 권장).
*   **DXF를 matrix로 만들 때 선택영역 오표시**: `useMatrixGenerator.ts`의 activeSelection 분기가 자식 좌표를 `cloned.left - activeObject.left`로 계산 — **서로 다른 좌표계 혼용 + 그룹 스케일(pxPerMm) 누락**으로 sourceObjects가 스케일 적용된 xSpacing/ySpacing과 어긋남. → 자식의 절대 변환행렬을 `fabric.util.qrDecompose`로 분해해 그룹 스케일 포함 위치/스케일/회전을 복원하고, 그룹 scene 좌상단(topLeft)을 빼 단일 도형 분기와 동일한 정규화 프레임으로 통일.
*   **확인 완료(수정 불필요)**: text/image/svg/dxf 및 기본 도형의 커맨드 생성은 모두 `FabricToPaperAdapter`의 실측 지오메트리 경로(또는 RECT/POINT 정밀 좌표)를 사용해 크기·좌표가 정확. 과거 "직선 도형이 절반 크기로 변환"되던 버그는 `convertLine()`이 `calcLinePoints()`(전체 양 끝점)+`applyTransform`(스케일)로 이미 수정되어 재현되지 않음.

### 6.13 가공 중 UI 잠금(Lockdown) 전역화 및 Move-to-Center 이동 중 표시 (2026-07-22)
*   **계획서**: `docs/proc/processing_ui_lockdown_plan.md` (요구사항 R1~R4, 현황 분석, 테스트 시나리오 포함). C++ 변경 없음 — `vite build` 후 `Bin\web` robocopy 배포만으로 반영.
*   **요구사항**: Process Start 시 가공에 영향을 줄 수 있는 UI를 모두 잠그고, 가공 종료 시 자동 복원. ① 상단 Edit 창(객체 속성 바) 강제 닫기, ② 카메라 뷰 우하단 FAB 3종 disable, ③ Motion 탭 Home all/축별 호밍/Jog 패널 disable, ④ "Move to Center"(MyLocation) FAB는 항상 사이언이던 것을 **클릭 후 스테이지 이동 중에만** 사이언 점등.
*   **잠금 단일 소스(기존 구조 활용)**: `useCanvasStore.isProcessingLocal`/`hideOverlays`. Process Start 클릭(`ProcessDashboard.tsx`)에서 true, 가공 완료/Stop/생성 실패 롤백 시 false. 모든 신규 잠금이 이 상태 구독 기반이므로 해제 코드 추가 없이 자동 재활성화됨.
*   **구현 내역**:
    1. **Edit 창 (CanvasTopBar.tsx)**: 렌더 가드에 `isProcessingLocal || hideOverlays` 추가. 기존 `syncObjectLock()`의 `discardActiveObject()`(fabric `selection:cleared` 경유)는 1차 방어선으로 유지하고, 이벤트 미발화/타이밍 이슈에도 무조건 닫히는 2차 방어선을 확보.
    2. **FAB 3종 (RecipeCanvas.tsx)**: "Move to Scanner Center"/"Click-to-Move"는 이미 `disabled={isHoming || isProcessingLocal}` 적용돼 있었고(점검 결과 이상 없음), **MyLocation FAB만 잠금이 누락**돼 있어 동일 규칙 + disabled 상태 Tooltip용 span 래퍼를 추가.
    3. **Motion 탭 (RightPanel.tsx / PositionControlCard.tsx)**: RightPanel이 `processingLocked`(= `isProcessingLocal || hideOverlays`)를 구독해 deps로 전달. Jog는 기존 `disabled` prop에 합성(방향키·속도·JOG/REL/ABS·Save/Reload 전체 잠김), `PositionControlCard`에는 `disabled` prop 신설 — 호밍 스피너 표시 로직(`homing.active`)과 의미를 분리하기 위해 합성하지 않고 별도 prop으로 설계.
    4. **Move-to-Center 이동 중 점등 [Design Pattern: Observer — positions 정착(settle) 감시]**: `cmd.moons.preset`은 C++에서 이동을 `WORK_1` 워커에 게시한 직후 `cb->Success()`로 **즉시 응답**하므로(`PortalRouterHandler.cpp`), JS `await`는 접수 시점 resolve일 뿐 이동 완료가 아님. 이에 클릭 시 `isMovingToCenter=true` 점등 후, `useAppStore.positions`(X/Y/Z)를 300ms 간격 폴링해 **연속 2회 delta < 0.005mm + 최소 1초 경과** 시 소등(하드 타임아웃 30초). 백엔드가 "already at target"으로 스킵해도 약 1.3초 점등 후 소등되므로 무한 점등 없음. 이동 중에는 disabled(재클릭 방지)와 사이언 강조가 동시 유지되도록 `&.Mui-disabled` 조건부 오버라이드 적용.
*   **⚠️ 후속 버그 — 잠금 해제가 Process 탭 전환 전까지 지연**: 가공 완료 후 Motion 탭의 버튼들이 enable로 안 돌아오고, Process 탭으로 전환해야 풀리는 증상.
    - **원인**: 완료 신호(`scanner/status: idle`)로 `processStates`를 'idle'로 바꾸는 것은 전역 훅 `useProcessMonitor`(AppShell 상주)인데, 잠금 해제(`setProcessingLocal(false)`)는 **Process 탭 안에서만 마운트되는 `ProcessDashboard`의 effect**에 있었음. Motion 탭을 보는 동안엔 언마운트 상태라 해제가 실행되지 않고, 탭 전환으로 마운트되는 순간 뒤늦게 해제된 것.
    - **해결 (useProcessMonitor.ts)**: 항상 마운트되는 이 훅에 **상태 전이(prev ≠ cur) 기반** 전역 동기화를 추가 — `running/paused` 진입 시 잠금 ON, `idle` 복귀 시 잠금 OFF. 전이 기반이므로 Process Start 직후(백엔드 running 보고 전, state가 아직 idle인 구간)에 잠금을 되돌리지 않아 ProcessDashboard의 기존 2초 유예 로직과 충돌 없음(양쪽 병행 마운트 시에도 동작 일관).
    - **교훈**: 전역 상태(store)의 파생 동작(잠금 등)을 **특정 탭에만 마운트되는 컴포넌트의 effect에 두면 안 됨** — 신호 소스(useProcessMonitor)와 같은 전역 생명주기에 배치할 것.
*   **상세**: 캔버스/UI 아키텍처 관점 정리는 arch_CanvasProc.md §2.34 참조.

### 6.14 색상별 Mark Speed/Power 미반영 버그 — SET_PARAM 커맨드 신설 (2026-07-22)
*   **증상**: 색상 레이어별로 Mark Speed를 다르게 설정(예: 빨강 10, 나머지 1)해도 **전체 도형이 한 속도(10)로 가공**됨. 색상별 Z는 정상(§ 참고: Z_MOVE가 그룹 경계마다 방출됨).
*   **근본 원인 (미구현이 원인)**: Z와 속도의 **전달 경로 비대칭**. Z는 `ScannerGenerator.generate()`가 색상 그룹 경계마다 `Z_MOVE` 커맨드를 방출해 그룹별로 하드웨어에 반영되지만, Mark Speed/Power는 Process Start 시점에 `scannerControl(1, {scannerMarkSpeed})` **1회만** 전송되고(값 = 실행 시점 CurrentLayer 프리셋), 커맨드 스트림에는 속도 전환 명령 자체가 없었음. `SinoGalvoProcessPanel.tsx`/`ScanlabProcessPanel.tsx` 주석에 "색상 그룹별 실시간 전환은 별도 작업(계획서 5단계)"으로 명시돼 있던 미구현 항목(process preset.md §11 Stage 5). 빨간 레이어를 선택한 채 시작했으므로 전체가 10으로 가공된 것.
*   **해결 — `SET_PARAM` 커맨드 (Z_MOVE와 대칭 구조)**:
    1.  **TS 생성기 (`ScannerGenerator.ts`)**: `ScannerCommandType`에 `'SET_PARAM'`(+`markSpeed`/`power` 필드) 추가. `groupByColorPreset()`이 그룹별 `markSpeed`/`power`를 산출(프리셋 없는 색상은 스토어 고정 기본값 1/1 — Right Panel 표시값과 일치). `generate()`가 색상 그룹 경계에서 직전 값과 다를 때만 `SET_PARAM`을 방출(첫 그룹은 항상 방출 → `scannerControl` 시작값 의존 제거). `colorPresets` 미전달(레거시 경로)이면 방출하지 않아 기존 동작 보존.
    2.  **IPC 파싱 (`PortalRouterHandler.cpp`)**: `SET_PARAM` 타입 분기 + `markSpeed`/`power` 필드 파싱(`power`는 `HasKey` 확인 — 키 없으면 -1 유지 = "미변경").
    3.  **SinoGalvo (`SinoGalvoController.cpp` Run)**: DELAY와 동일한 청크 경계 패턴 — `hasDrawn`이면 flush(SchLaserOut→StartMarking→CheckMarkingState) 후 `m_markSpeed`/`m_power` 갱신, 다음 청크의 `BufStart` 직후 `SetDefaultParameters(m_markSpeed, …)`/`SchLaserOut(m_power, …)`가 새 값을 하드웨어에 반영. (기존 구조가 "청크마다 파라미터 재적용"이었기에 값 갱신+청크 분할만으로 충분)
    4.  **Scanlab (`ScanlabController.cpp` Run)**: DELAY 전환과 동일 — 현재 리스트 실행·완료 대기 후 `m_markSpeed` 갱신, 새 리스트를 새 `SetSpeed`로 시작. **파워는 RTC 경로에 개별 API가 없어 보류**(속도만 전환).
*   **Use Default Parameters 의미론 (자연 충족)**: 체크 시 전 도형이 CurrentLayer 색으로 강제(색상 SSOT leaf 캐스케이드, feature_Draw.md §4.19) → 단일 그룹 → 그 프리셋 하나로 가공. 해제 시 색상별 `SET_PARAM`으로 각자 속도/파워/Z/횟수 적용. 별도 코드 불필요.
*   **UI 검증 수단**: View Commands 패널이 `SET_PARAM Speed10.000mm/s Power1.000%` 형식으로 렌더링(SinoGalvo/Scanlab 패널 포매터) — 가공 전 그룹별 속도를 눈으로 확인 가능. `COMMENT`처럼 필터링되지 않고 **실제 하드웨어로 전송되는 커맨드**임에 유의.
*   **빌드 주의(재확인)**: `.vcxproj` 단독 msbuild는 사전 이벤트의 `$(SolutionDir)` 미정의로 실패 — 반드시 `.sln` 경유(feature_Draw.md §4.17 동일 항목).
*   **실기 검증 순서**: ① Generate 후 View Commands에서 그룹 경계 `SET_PARAM` 값 확인 → ② 색상별 실속도 차이 확인 → ③ Use Default Parameters 체크 시 단일 속도 확인.

### 6.15 MARK TIMES 회차 표시(n/N) 미갱신 버그 — __onScannerProgress 수신 경로 전역화 (2026-07-23)
*   **증상**: DXF + Mark Times 10 가공 시 STATUS 패널의 MARK TIMES가 가공 내내 1/10에 고정되다가 완료 순간 10/10으로 점프(진행바도 0% 고정 → 완료 시 100%).
*   **근본 원인**: 네이티브(`SinoGalvoController::Run`의 emitProgress)는 회차/청크 경계마다 `window.__onScannerProgress && ...(pct)`를 정상 방송하고 있었으나, 이 핸들러가 **죽은 코드 `components/ScannerPanel.tsx`(§6.5)와 Scanlab 전용 `ScanlabProcessPanel.tsx`에만 등록**돼 있어 SinoGalvo 장비(`machine.ini: SCANNER=SinoGalvo` → `SinoGalvoProcessPanel` 마운트)에서는 수신자가 아예 없었음. `&&` 가드 탓에 방송이 무오류로 전량 유실 → `processStates.scanner.progress` 0 고정 → 파생 계산(`ProcessDashboard`의 `floor(progress/100×N)+1`)이 1/N 고정. 완료 시 `scanner/status: idle`이 progress=100 강제 대입 → N/N 점프. §6.13과 동일 계열의 안티패턴(전역 신호 소비자를 탭-마운트 컴포넌트에 배치) 재발 사례.
*   **해결 (TS-only, C++ 무변경)**: `__onScannerStatus`와 동일 패턴으로 전역화 — ① `HardwareFacade.ts`가 `__onScannerProgress`를 전역 1회 등록해 `bus.emit("scanner/progress")`(EventMap에 타입 추가), ② 항상 마운트되는 `useProcessMonitor.ts`가 소비(`Math.max` 단조 가드 + 100 클램프), ③ `ScanlabProcessPanel.tsx`의 패널 등록/cleanup `delete` 제거(잔존 시 탭 전환에서 전역 핸들러를 지워버림).
*   **계획서**: `docs/proc/mark_times_progress_display_fix_plan.md` (3인 전문가 분석, 테스트 매트릭스 T1~T7 포함). Stage 2(색상 그룹별 Mark Times 상이 시 정확 회차를 `__onScannerMarkPass`로 직접 방송)는 선택 과제로 보류.

### 6.16 다색 그룹 가공 교착(빈 청크 Cancel 가설) 및 유령 currentLayerColor 프리셋 미적용 수정 (2026-07-23)
> **⚠️ 정정 (같은 날 §6.17)**: 본 절의 교착 "원인 1(빈 청크 Cancel)"은 이후 실기 로그로 **반증**되었다
> — Cancel 전부 제거 후에도 재현되었고, 진짜 원인은 CIRCLE 프리미티브의 bit0 미래치(§6.17)로 확정.
> 본 절의 수정(Lazy BufStart·Cancel 제거·flush 센터 종점)은 유효한 위생/방어 개선으로 유지되며,
> "원인 2(유령 currentLayerColor)"와 그 수정은 §6.17 이후에도 그대로 유효하다.
*   **증상 3건**: ① 사각형1회+원2회 → 원 1회차 후 교착(2회차 미가공, 영구 RUNNING), ② 사각형2회+원1회 → 전부 가공 후 종료 미처리 교착(진행률 44.4% 고정, `CheckMarkingState poll` 지속), ③ 해마 DXF Mark Times 2 설정 → 1회만 가공되고 정상 종료(`SET_PARAM Speed1.000`+`Pass x1` 생성).
*   **원인 1 (①②, 드라이버)**: `Run()`이 청크마다 `BufStart()`를 선호출하고 경계 명령(DELAY/SET_PARAM/Z_MOVE/REPEAT_END)이 빈 버퍼에서 `Cancel()`로 폐기하는 구조(Z_MOVE만 경계이던 260602 유산). SET_PARAM/DELAY/REPEAT 도입(§6.8/6.14/7차)으로 다색 그룹에서 빈 청크가 일상화 → **완료된 마킹 작업 뒤의 Cancel()이 다음 작업의 완료 비트(MarkStatus bit0) 래치를 막아** `CheckMarkingState()`(§6.11: bit0만이 정상 탈출 조건) 무한 대기. 단일 그룹 런(오전 DXF×10, 해마)은 작업 사이 Cancel이 없어 정상 — 4개 런 대조로 확정. 방증: `MoveToCenter()`는 Cancel 직후 사이클에서 bit0를 신뢰하지 않도록 이미 설계돼 있었음.
*   **해결 1 (SinoGalvoController.cpp — Lazy Buffer Open)**: 청크 선두 `BufStart()` 제거, **첫 기하 명령 직전에만** `BufStart()+SetDefaultParameters()` 실행(버퍼 한계 분할 후 재개방도 동일 지연 방식). 빈 버퍼 경계 명령의 `else { Cancel(); }` 4곳 삭제 — Cancel은 Stop/타임아웃 복구 전용으로 명문화. 추가로 DELAY/SET_PARAM/REPEAT_END flush에도 `ReturnToCenterPoint()` 종점을 넣어 모든 마킹 사이클을 260619 독트린(실이동 종점에서 bit0 래치)과 정렬.
*   **원인 2 (③, 프론트)**: `ColorPresetPanel`의 CurrentLayer 자동 선택이 `!currentLayerColor`일 때만 동작해, 캔버스 교체(도형 삭제 후 DXF 로드) 시 **currentLayerColor가 화면에 없는 옛 색상(유령 키)으로 잔존**(스와치 선택 표시 없음이 단서). 프리셋 편집이 유령 키에 저장되고 가공 생성은 실제 도형 색으로 조회 → 미스 → 폴백 1회/1mm/s. 완료 시 "MARK TIMES 2/2"도 유령 키를 읽은 허위 표시.
*   **해결 2 (ColorPresetPanel.tsx)**: 자동 선택 effect를 재검증형으로 확장 — 선택 색상이 레이어 목록에 없으면 첫 레이어로 재지정, 도형이 없으면 `null`로 소거. ProcessDashboard 분모/scannerControl 초기값/Use Default Parameters가 모두 currentLayerColor를 읽으므로 한 곳 수정으로 일괄 해소.
*   **계획서**: `docs/plans/ScannerIssue8_MultiGroup_Hang_and_PresetKey.md` (4개 런 대조표, 명령 스트림 재구성으로 44.4% 고정값까지 일치 검증). 빌드: vite + `.sln` msbuild Release x64 완료(프론트/exe 동시 배포). 실기 검증 T1~T8 대기.

### 6.17 CIRCLE 프리미티브 완료비트 미래치 확정(LINE 테셀레이션) · REPEAT 진행률 off-by-one · MARK TIMES 실측 회차+색상 칩 (2026-07-23)
*   **교착 원인 확정 (실기 로그)**: §6.16 수정(빈 청크 Cancel 제거) 후에도 다색 교착 재현 → `Bin\Log\Log_2026-07-23.txt` 18:11 런 원값으로 확정 — **SchOutCircle로 구성된 버퍼는 물리 마킹이 끝나도 `MarkStatus bit0`가 절대 래치되지 않음**(state=1/bit0=0 105초 지속). SchOutLine 버퍼는 항상 정상 래치(사각형 패스: state=0 3.2s → state=1/bit0=0 4.3s → bit0=1 at 7.6s = 둘레÷속도). 속도 변경(SET_PARAM)·빈 청크 Cancel·센터 종점 부재 가설은 모두 로그로 소거. 260602가 무사했던 이유는 Z_MOVE만 경계라 순수 원 버퍼가 생기지 않았기 때문으로 추정.
*   **해결 (SinoGalvoController.cpp)**: 곡선 4종(CIRCLE 확진, ARC/ELLIPSE/EARC 예방 — 동일 곡선 엔진 계열)을 `emitArcAsLines()` 헬퍼로 **SchOutLine 코드 분할 방출**(코드 오차 0.005mm ≤ 빔 폭, 세그먼트 8~720 clamp, 버퍼 바이트는 LINE 단가로 계상). 완료 판정 경로를 래치가 증명된 프리미티브로 통일. 벤더 증거용으로 CheckMarkingState 폴링 로그에 `MarkStatus=0xNN`·`BoardMarkTimes`(보드 완료 카운터, 향후 대안 판정 후보) 추가.
*   **진행률 off-by-one (S4 "6/10")**: `physicalTotal`은 패스당 `(REPEAT_END−REPEAT_BEGIN)`(내부+1)을 계상하는데 되감기 오프셋은 내부만 가산 → 1명령 블록(사각형×10)에서 진행률이 12/22=54.5%에 수렴해 `6/10` 정체(블록이 클수록 오차↓ — DXF는 정상처럼 보임). 되감기 오프셋에 `+1` 정합.
*   **MARK TIMES 실측 회차+색상 칩**: "매 도형(색상 그룹)별 n/N"이 옳다는 의미론 결론(전체 레시피 N은 정의 불가, 전체 진행은 진행바 소관)에 따라 — 생성기가 **모든 색상 그룹**(반복 1회 포함)을 `REPEAT_BEGIN{repeatCount, color}`로 래핑, 드라이버(SinoGalvo/Scanlab)가 그룹 시작·되감기마다 `__onScannerMarkPass(cur,total,'#hex')` 방송(hex 검증), HardwareFacade→bus→useProcessMonitor→`processStates.scanner.markPass*` 전역 경로로 ProcessDashboard가 **색상 칩 + n/N** 표시. 기존 "선택 스와치 프리셋 × 진행률 환산" 유도 계산 폐기(다색 오표시 "1/2"의 원인). 1회 그룹도 마커 래핑으로 직전 그룹 표시 잔존 차단(1/1 표시).
*   **프로토콜 주의**: 전 그룹 REPEAT 래핑으로 프론트/exe **동시 배포 필수**. Object(G-code) 모드는 회차 방송 소스가 없어 MARK TIMES 행 비표시(후속 과제).
*   **계획서**: `docs/plans/ScannerIssue9_Circle_Bit0_and_MarkTimesUI.md` (프리미티브별 래치 대조표, 6/10 검산, 의미론 분석 §2.2/§2.5). 실기 검증 T1~T9 대기.

### 6.18 Cumulative Z 가공 후 시작 Z 미복귀 — Run 경계 실측 복귀 불변식 (2026-07-23)
*   **증상**: Z-Axis Cumulative Offset 매트릭스 가공 후 Z축이 최초 시작 위치로 복귀하지 않고 마지막 셀 Z에 남음.
*   **원인 — 복귀 명령 부재가 아니라 "기준값 관리" 결함 (3중)**:
    1.  **래칫 드리프트(주원인)**: 복귀가 명령 스트림 맨 끝의 꼬리 Z_MOVE(데이터)로만 존재 → **Stop/실패/타임아웃으로 꼬리에 도달하지 못하면 Z가 그 셀 높이에 잔류**(Z_MOVE 콜백의 `!m_stopFlag` 가드 포함). 다음 런의 `baseZ = 그 시점 폴링 Z` = 드리프트된 잔류 값이라, 이후의 모든 정상 완료 런조차 드리프트 위치로 "충실히" 복귀 — 원래 기준 Z는 어디에도 기록되지 않아 영구 유실. (실증: 18:13 수동 Stop 런 후 18:15 런 로그 `Commands Loaded: 23` 검산 — 꼬리는 존재·실행됐으나 기준 자체가 이미 오염)
    2.  **기준값 취약성**: `baseZ`가 실측이 아닌 **생성 시점의 폴링 스토어 값**(`positions.Z`) — 직전 이동 정착 중/폴링 지연 시 잘못된 목표가 박제됨.
    3.  **(부수) REPEAT × Cumulative 초점 이탈**: 생성 시점 `lastZ` 중복 제거(dedupe)는 선형 실행 전제인데 REPEAT 블록은 되감아 재실행 → 블록 안에 셀 0 Z_MOVE가 없으면 **pass 2부터 첫 셀이 이전 pass 마지막 Z(초점 이탈)에서 가공**.
*   **수정 — "Run 종료 시 Z = Run 시작 시 Z" 불변식을 드라이버 경계 실측으로 강제**:
    *   **P1 (`PortalRouterHandler.cpp` HandleScannerRun)**: zMoveCallback 본문을 `moveZAndSettle` 공용 람다로 추출(DRY) → Run 호출 직전 `startZ = g_Z.GetPos()/unitMultiplier` **실측 캡처** → Run 반환 직후(정상/Stop/예외 공통 단일 지점) 0.005mm 초과 이탈 시 복귀 + `"Z restored to start"` 로그. 라우터 공통 경로라 SinoGalvo/Scanlab 자동 커버. **Stop 시에도 복귀**(래칫 원천 차단). E-Stop 등 모션 비활성 시엔 기존 1.5s 정착 타임아웃으로 자연 탈출.
    *   **P2 (`ScannerGenerator.ts`)**: 꼬리 Z_MOVE 제거 — 복귀 책임을 P1 실측으로 단일화(폴링값→실측값 이중 이동 제거). Object(G-Code) 모드는 스트림 내 복귀(`baseWorkingZ`) 유지.
    *   **P3 (`ScannerGenerator.ts`)**: `IGenerationContext.forceNextZMove` 신설 — `REPEAT_BEGIN`(repeat>1) 방출 직후 세워 블록 내 **첫 Z 요구 지점의 Z_MOVE를 dedupe 우회 강제 방출**(일반 도형 zOffset 분기·매트릭스 셀 분기 양쪽). 각 pass가 자신의 시작 Z를 스스로 복원. ("lastZ=undefined 리셋" 안은 다음 그룹 경계의 `zBefore` 판정을 오염시켜 기각 — §6.17 전 그룹 REPEAT 래핑과 정합)
*   **배포**: 프론트/exe **동시 배포**(신 프론트 + 구 exe 조합은 복귀 공백). `.sln` msbuild + vite build 완료(2026-07-23 19:09 exe).
*   **계획서**: `docs/plans/ScannerIssue10_ZReturn.md`. 실기 검증(정상 완료·Stop 복귀, Stop 섞은 연속 5회 드리프트 0, Mark Times 2+Cumulative pass 2 셀 0 초점, 색상 2그룹, Object 회귀) 대기.

---
최종 수정일: 2026-07-23
담당: Claude (AI Coding Assistant, 이전 항목은 Antigravity)
