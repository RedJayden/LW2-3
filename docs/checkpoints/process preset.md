# Feature Checkpoint: 색상별 가공 프리셋(Layer-Default) 시스템 및 SinoGalvo 진단 로그

이 문서는 SinoGalvo 경쟁사(GalvoWin 계열) 프로그램의 "Layer-Default" 패널을 참고하여 도입한 **색상(레이어)별 가공 프리셋 시스템**과, 그 과정에서 함께 진행된 **스캐너 가공 지연(Hang) 진단/로깅 인프라 구축**을 기록합니다. 관련 세부 구현은 `feature_Scanner.md`(SinoGalvo 드라이버/로그), `arch_CanvasProc.md`(캔버스 아키텍처), `feature_Draw.md`(Edit 바 치수 편집)에도 교차 코멘트를 남겼습니다.

## 1. 배경 및 목표

기존에는 Mark Speed/Power/Freq/Mark Times/Shape Delay가 전역(scannerSettings/gcodeSettings) 설정 하나뿐이라, 여러 색상(레이어)의 도형을 서로 다른 파라미터로 가공할 수 없었습니다. 목표는:
- 캔버스 위 도형들을 **색상별로 그룹화**해, 그룹마다 독립적인 Z(원뿔형 3D 마킹), 레이저 파워(AMP), 가공 속도(MarkSpeed), 반복 횟수(Mark Times)를 지정.
- 이름 붙인 프리셋을 **레시피 파일에 내장** + **전역 재사용 라이브러리**로 이중 저장.
- Mark Times는 도형 단위가 아니라 **같은 색상으로 묶인 그룹 단위**로 반복.
- `Use Default Parameters` 체크 시 전체 도형을 CurrentLayer 색상/프리셋으로 일괄 전환(해제 시 원복).
- **스캐너/오브젝트(x20/x50) 모드는 완전히 독립된 프리셋 스코프**를 가져야 함(물리적 Z 위치·용도가 모드마다 다름).

## 2. 데이터 모델

- **`Portal/src/types/cad.ts` — `IColorPreset`**: `{ color, name?, markTimes, markSpeed, power, zOffset }`.
  - `freq` 필드는 도입 초기에 있었으나 **사용하지 않아 전량 삭제**(타입, 스토어 기본값, ColorPresetPanel UI, PresetLibraryDialog/CanvasTopBar 요약 표시 전부).
  - `zOffset`은 "기준 Z 위의 상대 오프셋"이 아니라 **"이 색상이 가공될 절대 Z(mm)"**. 매트릭스 셀별 Z-step/오버라이드는 이 값 위에 추가로 누적된다(원뿔형 3D 마킹).
- **`Portal/src/ui/pages/Recipe/Canvas/useCanvasStore.ts`**:
  - `colorPresets: Record<LensScope, Record<colorHex, IColorPreset>>` — `LensScope = 'scanner' | 'object_x20' | 'object_x50'`. **모드별로 완전히 분리 관리**(§5 참고).
  - `getLensScope()`: `viewMode`/`magnification`으로 현재 스코프 판정.
  - `getColorPresetOrDefault(color)`: 현재 스코프에 프리셋이 없으면 `{markTimes:1, markSpeed:1, power:1, zOffset: 현재 모션 Z축 위치}` 기본값 반환. 이 함수 **하나**를 통해서만 프리셋을 읽도록 통일(컴포넌트들이 `colorPresets[color]` 직접 접근을 안 하게 정리).
  - `presetLibrary: IColorPreset[]` — 프로젝트 무관 재사용 가능한 전역 라이브러리(스코프 분리 없음, `Config\ColorPresetLibrary.json`에 영속화, `cmd.presetLibrary.load/save` IPC).
  - `useDefaultParameters`/`setUseDefaultParameters`: 도형별 `customData.originalColor`/`forcedByDefaultParams` 스냅샷으로 일괄 색상 전환/복원, MatrixRepeater 셀 오버라이드도 캐스케이드, Undo는 단일 체크포인트(`object:modified` 1회 발생).
- **레시피 저장/로드(`LeftNav.tsx`)**: `settings.colorPresets`로 함께 저장. **구버전(스코프 분리 이전) 레시피 마이그레이션**: 최상위 키가 `scanner`/`object_x20`/`object_x50`이 아니면 평면(legacy) 포맷으로 간주해 `scanner` 스코프로 이관.

## 3. 생성 엔진 — 색상 그룹별 Mark Times/Z 적용

- **`Portal/src/services/ScannerGenerator.ts`** (Scanner/갈보 모드), **`Portal/src/hooks/useGCodeGenerator.ts`** (Object/G-code 모드).
- `groupByColorPreset()`: 평탄화된 도형을 `resolveObjectColorHex()` 기준으로 색상별 버킷 분리(`customData.colorPresetLinked===false`인 도형은 "색상에서 분리"되어 별도 그룹). 그룹마다 `markTimes`/`targetZ`(절대 Z) 결정.
- `generate()`: [Design Pattern: Template Method] 전체 골격(색상 그룹별 Mark Times 반복 → Z 복원 → CENTER 복귀)을 정의하고, 단일 패스는 `generatePass()`에 위임.
- **버그: Mark Times 반복이 1회로 뭉쳐지는 문제** — SinoGalvo 하드웨어는 `Z_MOVE`/`DELAY` 명령을 만나야 버퍼를 플러시하고 실제 `StartMarking()`을 호출하는데, 같은 색상을 반복(Mark Times>1)할 때 Z가 같고 Shape Delay가 0이면 경계 명령이 전혀 없어 N번 반복 도형이 **하나의 버퍼 job으로 합쳐져 물리적으로 1회만 가공**됨. 콘솔에서 직접 `scannerGenerator.generate()`를 호출해 명령 배열을 검증하며 확인.
  - **해결**: Mark Times 반복/색상 그룹 경계마다 `DELAY` 명령을 명시적으로 삽입(`IGenerationContext.suppressNextShapeDelay`로 `generatePass()` 내부의 기존 도형-간-지연 삽입과 중복되지 않게 가드). delayTime은 **전역 Shape Delay 값**(0이면 대기 없이 플러시만 강제, 즉시 다음 가공)을 사용.
- **전역 Shape Delay 복원**: 처음엔 색상 프리셋 도입 과정에서 전역 필드를 완전히 제거했으나, 반복 가공 경계 딜레이 용도로 반드시 필요하다는 피드백에 따라 `ColorPresetPanel`에 다시 노출(색상별이 아니라 스캐너/오브젝트 모드별 전역 값, `scannerSettings.shapeDelay`/`gcodeSettings.shapeDelay`).

## 4. UI — ColorPresetPanel

- **`Portal/src/ui/components/control/ColorPresetPanel.tsx`**: Scanner Process/Object Process 우측 패널 상단(옛 Mark Speed 자리)에 공통 장착. `mode: 'scanner'|'gcode'` prop으로 Shape Delay가 읽고 쓸 설정 슬롯을 구분.
- 구성: CurrentLayer 색상 팔레트 + Use Default Parameters 체크박스 + 프리셋 미니폼(Mark Speed/Mark Times/Power/Shape Delay가 2열 그리드, Z는 전체 폭) + 프리셋 라이브러리 버튼.
- **UI 반복 개선 이력**:
  - 최초 시도: LayerList 옆에 슬라이드 패널로 편집 UI를 붙였으나 "카메라 뷰가 좁아지고 스크롤이 생겨 비효율적"이라는 피드백으로 **전면 되돌림**. LayerList는 순수 도형 트리로 복귀, 프리셋 편집은 Right Panel의 ColorPresetPanel 하나로 일원화.
  - Fill 색상 개별 지정 제거 → **Fill은 항상 Line(stroke) 색상을 따라감**(`CanvasTopBar.tsx`).
  - Freq 필드 완전 삭제(§2 참고), Power/Shape Delay를 한 줄 배치, 안내 문구는 캡션 대신 Tooltip(hover)으로 전환.
  - `ProcessDashboard.tsx`의 "MARK TIMES n / N" 진행 표시가 전역 `markTimes`(더 이상 편집 안 됨, 항상 1)를 참조하고 있어 사라져 있던 것을 CurrentLayer 프리셋 기준으로 재연결.
  - 입력창 truncate 버그(`36.521` 등 소수점 긴 값이 잘려 보임) → CSS grid `minmax(0,1fr)` + `fullWidth`로 해결, 네이티브 숫자 스핀 화살표 숨김.
  - (2026-07-21) 헤더 레이블 `CurrentLayer`→`Current Layer`, 색상 스와치 선택 강조(간격 링+체크 아이콘) 개선 — §10.1~10.2 참고.
  - (2026-07-23) **Power 입력창 임시 숨김** — 레이저 파워 제어 기능이 아직 미구현이라 사용자 혼동 방지를 위해 UI에서만 감춤. `fields` 배열에서 `power` 항목을 주석 처리(`[TEMP HIDE 2026-07-23]` 마커). 데이터 모델/생성 엔진은 그대로 유지 — 복원 방법과 후속 계획은 §11 참고.
- **`Portal/src/ui/components/control/PresetLibraryDialog.tsx`**: 라이브러리 저장/불러오기/적용. "적용" 아이콘 버튼이 눈에 안 띄어 텍스트 버튼 + 토스트 피드백으로 교체.

## 5. 스캐너/오브젝트 모드 간 프리셋 격리 (LensScope)

- **버그**: Scanner 모드에서 Mark Speed=42/Power=88을 설정하고 Object x20 모드로 전환하면, **같은 색상이면 Scanner에서 입력한 값이 그대로 노출**됨. Z도 스캐너의 실제 Z(예: 36.521mm)가 아니라 Object 모드의 Z(예: 75.571mm)여야 하는데 뒤섞임 — 물리적으로 완전히 다른 위치라 위험할 수 있음.
- **원인**: `colorPresets`가 색상 hex 하나로만 키가 걸린 **단일 평면 딕셔너리**였음(스코프 개념 없음).
- **해결**: `colorPresets`를 `{ scanner, object_x20, object_x50 }` 3-스코프 딕셔너리로 변경(§2). `setColorPreset`/`getColorPresetOrDefault`/`applyLibraryPresetToColor`/`saveColorAsLibraryPreset`가 전부 `getLensScope()`로 현재 스코프에만 읽고 쓰도록 수정. 소비처(`SinoGalvoProcessPanel`/`ScanlabProcessPanel`은 `.scanner` 고정, `GCodePanel`은 `colorPresets[getLensScope()]`)도 함께 수정.
- **검증**: Playwright로 Scanner 모드에서 값 설정 → Object x20 전환 → 같은 색상의 필드가 깨끗한 기본값(Mark Speed 1/Power 1)과 x20 모드의 실제 Z로 표시되는지 확인.

## 6. CanvasTopBar — Edit 바 부수 버그 2건

- **Gr.W/Gr.H(그룹 크기) 제곱 버그**: DXF 임포트로 여러 엔티티가 `fabric.ActiveSelection`으로 묶이면 그룹 자체에 `scaleX = pxPerMm.x`(≈1000)가 걸리는데, `CanvasTopBar.tsx`의 `getGroupLogicalSize()`가 **이미 그룹 스케일이 반영된 절대 크기**를 반환함에도 호출부에서 `selectedObject.scaleX`를 **한 번 더 곱해** 표시값이 제곱(예: 실제 ~10mm → 화면 10413mm)되던 버그. 중복 곱셈 제거로 수정(`feature_Draw.md` §4.7의 onBlur 커밋 분리와는 별개의, 그룹 전용 산식 버그).
- **캔버스 클릭 시 Layout 입력 미반영**: 값을 입력한 뒤 다른 입력창이 아니라 캔버스(도형)를 클릭하면 `onBlur` 커밋이 발생하지 않아 도형이 갱신되지 않던 문제. Fabric.js 캔버스가 선택 유지를 위해 mousedown에서 브라우저 기본 blur를 막는 경우가 있어, 캔버스 mousedown을 capture 단계에서 가로채 포커스된 input을 명시적으로 blur시켜 커밋을 강제하도록 수정.

## 7. SinoGalvo 가공 지연 진단 및 로깅 인프라

### 7.1 증상 및 1차 분석
사용자 보고: Mark Times=3인데 Shape Delay=0임에도 (a) 가공 시작 전 ~3초 지연, (b) 반복(Mark Times) 사이마다 ~3초 지연. `SinoGalvoController.cpp::Run()`에 다음 두 지점의 하드 타임아웃 대기 루프가 원인으로 지목됨(`feature_Scanner.md` §6.6에서 이미 도입된 방어 로직):
- Run() 진입 직후 pre-wait(`while(GetMarkingState()==0)`, 3초 타임아웃)
- 매 청크 경계의 next-chunk wait(5초 타임아웃)

`CheckMarkingState()`(515행 부근 `// 1 means end of sending data`)로 `GetMarkingState()==1`이 완료/유휴를 의미함을 확인 — 대기 루프 조건 자체는 논리적으로 정상(뒤집힌 버그 아님). 구버전 참고 프로그램(`C:\LW23_porg\source\LW2-3_260410_서울\...\GalvoController.cpp`)은 동일 조건에 **타임아웃이 아예 없는데도** 지연이 없었다는 점에서, 매번 하드 타임아웃을 끝까지 소진하고 있다는 정황(정상이라면 거의 즉시 풀려야 함). `[ProcessMonitor] Learned new SinoGalvo overhead factor` 로그(자기학습 진행률 배율, `useProcessMonitor.ts`)가 실제 가공 시간이 순수 거리/속도 추정치보다 지속적으로 수배 더 걸려왔음을 수치로 뒷받침.
이번 세션의 Mark Times 반복 경계 DELAY 삽입 수정(§3)이, 이전엔 한 번도 안 걸리던 next-chunk wait를 반복마다 걸리게 만든 것도 확인됨 — 근본 원인(하드웨어 busy 판정 지연)은 별개.

### 7.2 진단 로그 계측 (`DiagLog`)
`SinoGalvoController.cpp`에 `static void DiagLog(const std::string& msg, const char* level = "debug")` 헬퍼를 도입해 기존 `OutputDebugStringA` 호출부를 전량 교체:
- 3개 대기 루프(pre-wait/next-chunk-wait/`CheckMarkingState`)에 100ms 간격 폴링 로그(경과 시간 + `GetMarkingState()` 원값) + 진입/종료/타임아웃 로그 추가.
- 메시지 성격별 레벨 지정: 고빈도 폴링=`debug`, 진행 요약("board ready after Xms" 등)=`info`, 타임아웃/강제진행=`warn`, 예외/초기화 실패=`error`.
- **1차 실수**: `DiagLog()` 함수는 정의했지만 실제 호출부 교체를 누락 — 미사용 정적 함수라 MSVC가 통째로 스트립해 문자열조차 바이너리에 없었음. `sed`로 전체 교체 후 바이너리 `strings` 확인으로 재검증.
- **Portal SYSTEM CONSOLE 연동**: `window.__onNativeLog(level, source, message)` 콜백(`HardwareFacade.ts`에서 등록) → `useLogStore.addNativeLog()`(기존 `addLog`와 달리 `hwFacade.writeLog()`로 왕복 전송하지 않음). 로컬 메시지의 `[SinoGalvoController] ` 접두어는 `source` 필드와 중복되므로 전달 전 1회 제거.
- **파일 로깅(`Bin\Log\Log_*.txt`)**: `DiagLog()`가 기존 `LogManager::Instance().Write(level, "SinoGalvoController", body)`도 함께 호출. 화면(SYSTEM CONSOLE)의 반복 로그 압축 표시와 무관하게 **파일에는 호출 즉시·시간순·무압축**으로 전부 남음.

### 7.3 SYSTEM CONSOLE UX 개편 (`LogConsolePanel.tsx`, `logStore.ts`)
- 연속 동일 로그(레벨/출처/메시지 동일)를 `×N회 반복` 형태로 그룹핑해 화면 표시(파일 저장과는 무관, 화면 전용).
- 레벨별 색상 배지 + 좌측 컬러 바 + 아이콘(Error=빨강/Warn=주황/Info=파랑/Debug=회색).
- 고정 44px 1줄 truncate를 없애고 `whitespace-pre-wrap`으로 줄바꿈 허용(가변 높이, react-window 가상 리스트에서 일반 스크롤 div로 단순화).
- "All" 필터가 기본적으로 Debug(고빈도 폴링)는 제외 — 진짜 다 보려면 Debug 탭을 별도 선택.
- **고급(개발자) 모드 게이팅**: `useLogStore.advancedMode`(기본 false, `localStorage` 영속) — false면 SYSTEM CONSOLE 자체가 렌더링되지 않고, 하단 상태바 클릭도 무동작. `TitleBar.tsx` 좌상단 로고를 **1.5초 안에 5회 연속 클릭**하면 토글(토스트로 on/off 확인). 일반 사용자에게는 완전히 숨겨지고, 서비스 기술자만 제스처를 알고 필요 시 켬.

## 8. 핵심 파일

| 파일 | 역할 |
|---|---|
| `Portal/src/types/cad.ts` | `IColorPreset` 타입 |
| `Portal/src/ui/pages/Recipe/Canvas/useCanvasStore.ts` | `colorPresets`(스코프별) 스토어 슬라이스, `getLensScope`, 라이브러리 |
| `Portal/src/ui/components/control/ColorPresetPanel.tsx` | 프리셋 편집 UI(공용), Current Layer 레이블·색상 스와치 선택 강조(§10.1~10.2) |
| `Portal/src/ui/components/control/CommandViewerPanel.tsx` | (신규) 커맨드/G-Code 전체 화면 뷰어 오버레이 — 라인 넘버·구문 색상·넘버링 모드(§10.3~10.4) |
| `Portal/src/ui/components/control/PresetLibraryDialog.tsx` | 전역 라이브러리 관리 |
| `Portal/src/ui/components/control/MatrixDialog.tsx` | 매트릭스 Z 합산 미리보기(그룹 프리셋 Z 참조) |
| `Portal/src/ui/pages/Recipe/PropertyBar/CanvasTopBar.tsx` | Fill=Line 동기화, 프리셋 요약, Gr.W/H 버그 수정, 캔버스클릭 blur 강제 |
| `Portal/src/services/ScannerGenerator.ts` | 색상 그룹별 Mark Times/Z, Shape Delay 경계 삽입 |
| `Portal/src/hooks/useGCodeGenerator.ts` | Object 모드 동일 로직 |
| `Portal/src/ui/shell/SinoGalvoProcessPanel.tsx`, `ScanlabProcessPanel.tsx`, `Portal/src/components/GCodePanel.tsx` | 각 모드 Process 패널, colorPresets 스코프 연결, 하단 미리보기→View 버튼+CommandViewerPanel 오버레이(§10.3) |
| `Portal/src/components/ProcessDashboard.tsx` | Mark Times n/N 진행 표시 |
| `LASERnGRAPN/Modules/Scanner/SinoGalvo/Base/SinoGalvoController.cpp` | `DiagLog`, 대기 루프 진단 계측, DELAY 처리 |
| `LASERnGRAPN/Shared/Util/LogManager.h/.cpp` | 파일 로거(`Bin\Log\Log_*.txt`) |
| `LASERnGRAPN/Core/Communication/PortalRouterHandler.cpp` | `cmd.presetLibrary.load/save` 등 IPC |
| `Portal/src/store/logStore.ts`, `Portal/src/ui/shell/LogConsolePanel/LogConsolePanel.tsx`, `Portal/src/ui/shell/TitleBar.tsx` | SYSTEM CONSOLE, 고급 모드 게이팅 |

## 9. 적용된 디자인 패턴
- **Template Method**: `ScannerGenerator.generate()`(골격) / `generatePass()`(단일 패스 위임).
- **Facade**: `HardwareFacade`가 IPC 세부사항을 감춤.
- **Strategy(암묵)**: 스캐너 기종(SinoGalvo/Scanlab)별 Process 패널 분기.
- **Composition(공유 프레젠테이션 컴포넌트)**: 세 Process 패널의 중복 커맨드 미리보기를 `CommandViewerPanel` 하나로 일원화(§10.3).
- **Derived State**: `CommandViewerPanel`이 원본 `text`를 `useMemo`로 라인/번호/주석여부로 파생(§10.4).

## 10. Process 패널 표시 UX 개선 — 커맨드 뷰어 / 색상 스와치 / Current Layer (2026-07-21)

계획서: `docs/plans/plan_ProcessPanel_UX.md`. 순수 프론트엔드(React/MUI/Tailwind) 표시 UX 개선으로, 커맨드 생성 로직·스토어 스키마·C++ 드라이버 변경은 없음. 검증은 `vite build` 통과(3936 모듈).

### 10.1 `Current Layer` 레이블
- `ColorPresetPanel.tsx` 팔레트 헤더 표기 `CurrentLayer` → `Current Layer`(내부 식별자 `currentLayerColor` 등은 유지, 표기만 변경).

### 10.2 색상 스와치 선택 강조
- **문제**: 스와치(18px 원)가 레이어 색으로 꽉 차 있어, 선택 시 얇은 테두리(2px primary) 변화만으로는 선택 여부가 거의 구분되지 않음(특히 사이언/빨강 등 고채도 색).
- **개선** [State 표현 매핑]: 스와치 20px로 확대. 선택 시 ① 이중 `box-shadow`(안쪽 `background.paper` gap 링 + 바깥 `primary.main` 링)으로 **채움색과 무관하게 또렷한 간격(gap) 링**, ② `scale(1.15)` 확대, ③ 중앙 흰색 체크(✓) 아이콘(검은 `drop-shadow`로 밝은 색 위에서도 가시). 비선택 스와치는 hover 시 미세 scale/opacity 피드백.

### 10.3 커맨드 미리보기 → 버튼 + 전체 화면 뷰어 (신규 `CommandViewerPanel`)
- **문제**: Process Start 후 하단에 뜨는 작은 `textarea` 미리보기가 세 Process 패널(SinoGalvo/Scanlab/GCode)에 **중복**되어 있고, 창이 작아 커맨드 확인이 불편함.
- **해결** [Composition — 공유 프레젠테이션 컴포넌트]: 신규 `Portal/src/ui/components/control/CommandViewerPanel.tsx`로 일원화.
  - 각 패널의 하단 미리보기 제거 → `View Commands (N)`/`View G-Code` 버튼으로 대체. 커맨드가 있으면 `useProcessDetail` 설정과 **무관하게 항상 노출**(사용자 요청). 부수로 각 패널에서 unused가 된 `useProcessDetail` 셀렉터 제거, 패널 루트 div에 `relative` 추가.
  - 버튼 클릭 시 패널 루트(`position:relative`) 기준 `absolute inset-0` 오버레이로 **Process 탭 창 전체**에 커맨드 표시. `Close`로 닫으면 오버레이만 사라지고 `ProcessDashboard` 등 원래 화면 복귀(언마운트 없이 토글 → 진행 상태/스크롤 보존).
  - title/text 매핑: SinoGalvo=`Generated Commands`/`commandText`, Scanlab=`Compiled RTC Commands`/`commandText`, GCode=`G-Code`/`gcode`. 세 패널의 `CommandViewerPanelProps` 인터페이스가 동일해 커맨드 텍스트 생성 로직은 각 패널에 그대로 유지(관심사 분리).

### 10.4 커맨드 뷰어 2차 개선 — 가독성(라인 넘버 / 구문 색상)
- 상단 `X` 버튼 삭제(닫기는 하단 `Close`로 일원화).
- `textarea` → **줄 단위 렌더링**으로 리팩터링(줄별 색상·라인 넘버는 textarea로 불가) [Derived State — 원본 `text`를 `useMemo`로 라인 배열 파생].
  - **주석/커맨드 색 구분**: `isCommentLine()`(`/*`·`//`·`;` 시작)으로 판별해 주석은 amber 이탤릭, 커맨드는 green. 스캐너 블록 주석과 G-Code 라인 주석 모두 인식.
  - **좌측 라인 넘버 거터**: 우측 정렬, 최대 번호 자릿수로 폭 자동 계산. `sticky left-0`로 **가로 스크롤 시 좌측 고정**(배경색으로 코드가 밑을 지나가도 가림).
  - **넘버링 모드 체크박스**(거터 상단 툴바) `Commands only`: 해제(기본)=주석+커맨드 전체 넘버링, 체크=주석 제외 커맨드만 넘버링.

## 11. 남은 이슈 / 후속 과제
- **Stage 5 → 부분 해소 (2026-07-22, §12 참조)**: 색상 그룹별 **Mark Speed/Power 전환은 `SET_PARAM` 커맨드로 구현 완료**(SinoGalvo: 속도+파워 / Scanlab: 속도만 — RTC 파워 개별 API 부재). 원래 계획의 **레이저 소스단 AMP/PRF 세그먼트 전환 + 전환 후 검증(실패 시 알람+중단)** 은 여전히 미착수(하드웨어 엔지니어 확인 대기).
- **Stage 6 (미착수)**: Object 모드에서 색상 그룹별 서브잡 분할 실행(G-code 업로드→실행→검증 반복).
- **⚠️ C++ 한글 주석 인코딩 위반 발견 및 조치**: 이번 세션 중 `SinoGalvoController.cpp`의 `DiagLog` Doxygen 주석을 한글로 작성했다가 `feature_Scanner.md` §6.7 규약(신규 주석 ASCII 전용) 위반을 뒤늦게 발견해 영문으로 재작성함. **파일 내 기존(세션 이전) 한글 주석 7줄(118~134행 부근, `OpenDelay`/`JumpSpeed` 설명 및 495/545/607행의 "그리기 시작/종료" 등, 607행은 이미 CP949 오염으로 깨진 상태)은 이번 범위 밖이라 수정하지 않고 남겨둠** — 향후 이 파일을 다시 손댈 때 우선 정리 권장.
- `CanvasTopBar.tsx`의 프리셋 요약 블록에 남아있는 "Layer List에서 편집" 안내 문구는 편집 위치가 Right Panel로 이동한 뒤로 stale 상태(사용자 미요청, 미수정).
- `components/ScannerPanel.tsx`는 여전히 미사용 죽은 코드(`feature_Scanner.md` §6.5 참고, 삭제 보류).
- **⏸️ Power 입력창 임시 숨김 (2026-07-23, 추후 기능 구현 예정)**: 레이저 파워 제어 기능이 아직 실제로 동작하지 않아, Scanner/Object Process 우측 패널(`ColorPresetPanel.tsx`)의 Power 입력창을 **UI에서만 임시 숨김** 처리함(`fields` 배열의 `{ key: 'power', label: 'Power', unit: '%' }` 항목 주석 처리, `[TEMP HIDE 2026-07-23]` 마커로 검색 가능).
  - **숨긴 것은 UI뿐**: `IColorPreset.power` 필드, `getColorPresetOrDefault`의 기본값(power: 1), `SET_PARAM` 커맨드의 Power 방출(§12), 레시피 저장/로드, PresetLibraryDialog 등 데이터 경로는 전부 그대로 유지됨. 기존 레시피에 저장된 power 값도 보존된다(기본값 1%로 방출).
  - **복원 방법**: 파워 제어 기능(레이저 소스단 AMP 전환 + 검증, §11 Stage 5 잔여분) 구현 시 `ColorPresetPanel.tsx`의 해당 주석 한 줄만 되살리면 됨. 숨김 상태의 그리드는 Mark Speed | Mark Times / Shape Delay 순으로 배치됨.

## 12. 색상별 Mark Speed/Power 실반영 — SET_PARAM 커맨드 및 UDP 의미론 확립 (2026-07-22)
- **증상/원인**: 색상별 Mark Speed를 다르게 설정해도 전체가 한 속도로 가공. Z는 `Z_MOVE`로 그룹별 반영되지만 속도/파워는 Process Start 시 `scannerControl()` 1회(CurrentLayer 프리셋)만 전송되던 §11 Stage 5 미구현이 원인. **상세 워크스루는 `feature_Scanner.md` §6.14 참조.**
- **구조 요약**: `ScannerGenerator.generate()`가 색상 그룹 경계에서 `SET_PARAM {markSpeed, power}` 방출(직전 값과 같으면 생략, 첫 그룹은 항상, 프리셋 없는 색상은 기본값 1/1 = `getColorPresetOrDefault`와 일치) → 드라이버(SinoGalvo/Scanlab)가 DELAY와 동일한 청크 경계 패턴으로 flush 후 내부 속도/파워 갱신. `scannerControl()`은 첫 SET_PARAM 이전 구간·레거시(프리셋 미전달) 경로용 초기 기준값으로 강등.
- **Use Default Parameters 의미론**: 체크 = 전 도형을 CurrentLayer 색으로 강제(leaf 캐스케이드, `feature_Draw.md` §4.19) → 단일 그룹 → **프리셋 하나로 전체 가공**. 해제 = 색상별 SET_PARAM으로 각자 파라미터. UDP 강제 재색상은 `forceColorOnLeaves`로 그룹류(Ctrl+G/Dot/DXF/매트릭스 소스)까지 실반영되며, 혼합 색상 그룹도 leaf별 원색 스냅샷으로 해제 시 각자 복원.
- **UI**: View Commands에 `SET_PARAM Speed…mm/s Power…%` 표시(가공 전 검증 수단). Current Layer 스와치 클릭 시 해당 색상 도형이 캔버스에 선택 표시(`ColorPresetPanel.handleSwatchClick`).
- **검증**: `vite build`+`Bin\web` 배포, `.sln` msbuild 성공(exe 갱신). 실기: 색상별 실속도 차이·UDP 단일 속도 확인 필요.

## 13. 유령 currentLayerColor 수정 · MARK TIMES 실측 회차(색상 칩) 표시 · 전 그룹 REPEAT 래핑 (2026-07-23)

### 13.1 유령(stale) `currentLayerColor` — 프리셋이 화면에 없는 색상 키에 저장되던 버그
- **증상**: 캔버스를 교체(도형 삭제 후 DXF 로드)한 뒤 Current Layer 값을 편집하면 설정이 가공에 반영되지 않음(해마 DXF Mark Times 2 설정 → 1회만 가공, `SET_PARAM Speed1.000` + `Pass x1` 생성). 스와치에 선택 표시(✓)가 없는 것이 단서.
- **원인**: `ColorPresetPanel`의 CurrentLayer 자동 선택이 `!currentLayerColor`(null)일 때만 동작 → 캔버스 내용이 바뀌어도 옛 색상 키가 잔존. 편집은 유령 키에 커밋되고, 가공 생성(`groupByColorPreset`)은 실제 도형 색으로 조회해 미스 → 폴백(1회/1mm/s). ProcessDashboard의 (구)MARK TIMES 분모도 유령 키를 읽어 "2/2" 허위 표시.
- **해결 (`ColorPresetPanel.tsx`)**: 자동 선택 effect를 **재검증형**으로 확장 — 선택 색상이 레이어 목록에 없으면 첫 레이어로 재지정, 도형이 없으면 `null` 소거. 상세: `docs/plans/ScannerIssue8_MultiGroup_Hang_and_PresetKey.md` §2.2.

### 13.2 MARK TIMES 표시 의미론 확정 — "색상 그룹별 n/N + 색상 칩" (실측 방송)
- **결론**: Mark Times는 색상 레이어별 속성이므로 "전체 레시피의 N"은 정의 불가. MARK TIMES 행은 **지금 가공 중인 그룹의 회차**를 표시해야 하며(전체 진행은 진행바 소관), 그룹 전환 시 1/N'으로 리셋되는 것이 물리 현실과 일치 (예: [파랑]1/3→2/3→3/3→[빨강]1/2→2/2). 의미론 분석: `docs/plans/ScannerIssue9_Circle_Bit0_and_MarkTimesUI.md` §2.2·§2.5.
- **구(舊) 방식 폐기**: "선택 스와치 프리셋 분모 × 전체 진행률 환산 분자" 유도 계산은 (a) 다색에서 가공 그룹이 아닌 선택 스와치 기준 오표시("1/2"), (b) 진행률 회계 off-by-one과 결합한 "6/10" 정체의 원인이라 삭제.
- **신규 데이터 흐름 (실측 단방향)**: `ScannerGenerator`가 `REPEAT_BEGIN{repeatCount, color}`에 그룹 색상 탑재 → 드라이버(SinoGalvo/Scanlab)가 그룹 시작·되감기마다 `__onScannerMarkPass(cur, total, '#hex')` 방송(hex 검증, JS 주입 방어) → `HardwareFacade` 전역 등록 → bus `scanner/markpass` → `useProcessMonitor` → `processStates.scanner.markPass/markPassTotal/markPassColor` → `ProcessDashboard`가 **색상 칩 + n/N** 렌더링(reset 시 소거).
- **Object(G-code) 모드**: 회차 방송 소스가 없어 MARK TIMES 행 비표시(기존 유도 표시도 오표시였음) — G-code 실행기 회차 방송은 후속 과제.

### 13.3 전 그룹 REPEAT 래핑 (프로토콜 변경)
- 반복 1회 그룹도 `REPEAT_BEGIN{count:1}`~`REPEAT_END`로 감싼다 — 1회 그룹 진행 중 직전 그룹의 n/N·색상 잔존 방지(그룹 시작마다 (1, N, color) 방송). 드라이버는 count=1을 되감기 없이 자연 처리, 그룹 종료 flush 지점이 REPEAT_END로 이동할 뿐 물리 동작 등가.
- **⚠️ 프론트/exe 동시 배포 필수** (7차 REPEAT 도입과 동일한 결합).

### 13.4 관련 드라이버 수정 (상세는 feature_Scanner.md)
- 다색 그룹 교착 2건의 근본 원인·수정(빈 청크 Cancel 제거 → CIRCLE bit0 미래치 확정 → LINE 테셀레이션)과 REPEAT 진행률 off-by-one 수정은 `feature_Scanner.md` §6.16~6.17 참조.

---
최종 수정일: 2026-07-23
담당: Claude (AI Coding Assistant)
