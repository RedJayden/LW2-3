# Scanner 이상 증상 8차 — 다색 그룹 가공 종료 실패(교착) + DXF Mark Times 미적용 (2026-07-23)

> **⚠️ 후속 정정 (같은 날, 9차)**: 본 계획서의 교착 원인 가설 "작업 사이 빈 청크 `Cancel()`"은 수정 배포
> 후 실기 재현으로 **반증**되었다. 진짜 원인은 **CIRCLE(SchOutCircle) 버퍼가 완료 비트(bit0)를 래치하지
> 않는 CSG9210 하드웨어 특성**으로, 실기 로그 원값과 함께 `ScannerIssue9_Circle_Bit0_and_MarkTimesUI.md`
> 에서 확정·해결(LINE 테셀레이션)되었다. 본 계획서의 P1(Lazy BufStart/Cancel 제거/flush 센터 종점)은
> 유효한 위생 개선으로 유지, P2(유령 currentLayerColor 수정)는 그대로 유효하다.

> 3인 전문가 관점(드라이버/하드웨어 · 프론트엔드/상태 · 아키텍처/QA) 협의 분석과 해결 계획서.
> 선행: `docs/plans/ScannerIssue7_MarkTimes100.md`(REPEAT 블록 도입 완료),
> `docs/proc/mark_times_progress_display_fix_plan.md`(진행률 전역 수신 — 이번 증상 화면에서 정상 동작 확인됨),
> `docs/checkpoints/feature_Scanner.md` §6.11(bit0 완료 판정 복원), §6.14(SET_PARAM).

---

## 1. 증상 (실기, 2026-07-23)

| # | 구성 | 관측 결과 |
|---|---|---|
| S1 | 사각형(파랑) **1회** + 원(빨강) **2회** | 사각형 1회 → 원 1회 가공 후 **원 2회차 미가공 상태로 교착**. STATUS는 Processing 유지, 경과시간 계속 증가, Stop 강제 필요 |
| S2 | 사각형(파랑) **2회** + 원(빨강) **1회** | 사각형 2회 ✓ → 원 1회 ✓ 가공 후 **종료 처리가 안 되고 교착**. 진행률 44.4% 고정, `CheckMarkingState: poll #2338, elapsed=58578ms…` 폴링 지속, Stop 강제 필요 |
| S3 | 해마 DXF(단일 polyline) **Mark Times 2** | **1회만 가공하고 정상 종료**. View Commands(862)에는 `SET_PARAM Speed1.000 Power1.000` + `/* Pass x1 */`만 있고 REPEAT 마커 없음 — 반면 우측 패널은 Mark Speed 2 / Mark Times 2 표시, 완료 시 "MARK TIMES 2/2" 표시 |

같은 날 오전의 **단일 색상 DXF + Mark Times 10 (30,534 커맨드)** 은 10/10 정상 완료했다 — 이 대조가 원인 특정의 핵심 증거다.

---

## 2. 3인 전문가 원인 분석

### 2.1 [전문가 A — 드라이버/하드웨어] S1·S2: 빈 청크 `Cancel()`이 다음 작업의 완료 핸드셰이크를 오염

**교착 지점 확정**: 하단 상태바의 진단 로그가 `CheckMarkingState: poll #2338, elapsed=58578ms…`
— 즉 `SinoGalvoController::CheckMarkingState()`([SinoGalvoController.cpp:879](../../LASERnGRAPN/Modules/Scanner/SinoGalvo/Base/SinoGalvoController.cpp#L879))의
**완료 비트 대기 루프에서 58초 이상 정체**. §6.11 복원으로 이 루프는 `GetMarkingState()==1 && (MarkStatus & 0x01)==1`이
될 때까지 무한 대기한다(안전망은 10분 하드 타임아웃뿐). 물리 가공은 이미 끝났는데(사용자 관측) bit0가 서지 않는 상황.

**명령 스트림 재구성으로 교차 검증** (View Commands (8) 실측과 일치, COMMENT/CENTER는 네이티브에서 제외):

- S2 스트림: `[SET_PARAM][REPEAT_BEGIN(2)][RECT][REPEAT_END][DELAY][SET_PARAM][CIRCLE]` (네이티브 7개)
- 진행률 총량 `physicalTotal = 7 + (2−1)×2 = 9`. 사각형 2회차 REPEAT_END 체크포인트에서
  `emitProgress(1+3, 9) = 44.4%` — **화면에 고정된 44.4%와 정확히 일치**. 그 뒤의 원(CIRCLE) 청크 종료
  flush의 CheckMarkingState에서 교착 → 이후 emitProgress/idle 방송이 없어 UI가 영원히 RUNNING.
- S1 스트림: `[SET_PARAM][RECT][DELAY][SET_PARAM][REPEAT_BEGIN(2)][CIRCLE][REPEAT_END]`.
  원 1회차 REPEAT_END flush의 CheckMarkingState에서 교착 → **되감기(2회차) 자체가 실행되지 못함**
  ("원 2회차 가공 안 함"의 직접 원인).

**교착 유발 조건 — 4개 런의 대조표**:

| 런 | 교착 여부 | 마킹 작업 사이의 빈 청크 `Cancel()` 호출 |
|---|---|---|
| 오전 DXF ×10 (단일 그룹) | 정상 완료 | 없음 (SET_PARAM Cancel은 첫 작업 **이전** 1회뿐) |
| S3 해마 (단일 그룹, 1패스) | 정상 완료 | 없음 (동일 — 첫 작업 이전 1회뿐) |
| S1 (2그룹) | **교착** | 사각형 가공 **후** SET_PARAM 빈 청크 → `Cancel()` 1회 |
| S2 (2그룹) | **교착** | 사각형 가공 **후** DELAY·SET_PARAM 빈 청크 → `Cancel()` 2회 |

`Run()`의 청크 루프는 매 청크 진입 시 `BufStart()`를 **선(先)호출**하고, 경계 명령(DELAY/SET_PARAM/Z_MOVE/REPEAT_END)을
만났을 때 버퍼가 비어 있으면(`hasDrawn == false`) 열어 둔 버퍼를 버리기 위해 `else { m_jhcLib->Cancel(); }`를 호출한다
([:437](../../LASERnGRAPN/Modules/Scanner/SinoGalvo/Base/SinoGalvoController.cpp#L437), [:462](../../LASERnGRAPN/Modules/Scanner/SinoGalvo/Base/SinoGalvoController.cpp#L462), [:497](../../LASERnGRAPN/Modules/Scanner/SinoGalvo/Base/SinoGalvoController.cpp#L497), [:546](../../LASERnGRAPN/Modules/Scanner/SinoGalvo/Base/SinoGalvoController.cpp#L546)).
**완료된 마킹 작업 뒤에 이 Cancel이 끼어들면, 그 다음 StartMarking 작업은 물리적으로는 정상 마킹되지만
완료 비트(MarkStatus bit0)가 다시는 세워지지 않는다** — 이것이 4개 런을 모두 설명하는 유일한 가설이다.

방증: `MoveToCenter()`([:831](../../LASERnGRAPN/Modules/Scanner/SinoGalvo/Base/SinoGalvoController.cpp#L831))는 정확히
`Cancel() → BufStart → … → StartMarking` 순서를 쓰는데, 작성 당시 이미 **"bit0가 갱신되지 않을 수 있으므로"
CheckMarkingState(bit0 대기)를 쓰지 않고** GetMarkingState()==1 + 2초 상한의 바운드 대기만 쓰도록 설계돼 있다 —
Cancel 이후 사이클에서 bit0를 신뢰할 수 없다는 사실을 코드가 이미 알고 있었던 것.

**구조적 배경**: `BufStart 선호출 + 빈 버퍼 Cancel` 패턴은 경계 명령이 Z_MOVE뿐이라 빈 청크가 드물던
260602/260619 구조의 유산이다. 2026-07-22~23에 SET_PARAM·DELAY(그룹 경계 flush 강제)·REPEAT 마커가
추가되면서 **연속 경계 명령으로 인한 빈 청크가 일상화**됐는데, 청크 수명주기는 그대로라 작업 사이 Cancel이
대량 발생하게 됐다. 문제가 다색 그룹에서만 터지는 이유다.

### 2.2 [전문가 B — 프론트엔드/상태] S3: 유령(stale) `currentLayerColor`에 프리셋이 저장됨

S3의 증거 사슬은 "생성 시점에 해마 색상의 프리셋이 존재하지 않았다"를 가리킨다:

1. View Commands 실측: `SET_PARAM Speed1.000mm/s Power1.000%` + `/* Pass x1 */` — 이는
   [ScannerGenerator.ts:187-193](../../Portal/src/services/ScannerGenerator.ts#L187-L193)의 **"프리셋 없는 색상"
   폴백값(markSpeed 1, power 1, markTimes = 폴백 1)** 과 정확히 일치. 프리셋이 있었으면 Speed2.000 + REPEAT 마커였다.
2. 그런데 우측 패널은 Mark Speed 2 / Mark Times 2를 표시하고, 완료 시 MARK TIMES 2/2가 떴다 — 즉
   `getColorPresetOrDefault(currentLayerColor)`가 반환하는 **currentLayerColor 키의 프리셋에는 2/2가 저장돼 있다**.
3. **스크린샷 5의 결정적 단서: 초록 스와치에 선택 표시(✓·링)가 없다.** S1·S2 스크린샷은 항상 선택 스와치에
   ✓가 있다. 즉 해마 로드 시점의 `currentLayerColor`는 초록이 아니라 **직전 테스트(사각형/원)의 색**이었다.

**메커니즘**: [ColorPresetPanel.tsx:62-66](../../Portal/src/ui/components/control/ColorPresetPanel.tsx#L62-L66)의
자동 선택 effect는 `!currentLayerColor`(null)일 때만 첫 레이어를 선택한다. 캔버스 내용이 바뀌어
**기존 색상 레이어가 전부 사라져도 currentLayerColor는 옛 색상으로 남는다**(재검증 없음). 이 상태에서:

- 프리셋 입력 필드는 `setColorPreset(currentLayerColor, …)`([:214](../../Portal/src/ui/components/control/ColorPresetPanel.tsx#L214))로
  **유령 색상 키에 커밋** — 사용자는 해마 레이어를 편집한다고 믿지만 실제로는 화면에 없는 옛 색상의 프리셋을 고치고 있다.
- 가공 생성은 `resolveObjectColorHex(해마) = 초록` 키로 조회([ScannerGenerator.ts:177](../../Portal/src/services/ScannerGenerator.ts#L177)) → 미스 → 폴백 1회/1mm/s.
- `ProcessDashboard`의 MARK TIMES 분모도 유령 키를 읽으므로([ProcessDashboard.tsx:39](../../Portal/src/components/ProcessDashboard.tsx#L39)) "2/2"라는 허위 표시가 나온다.

즉 S3는 드라이버 버그가 아니라 **편집 대상 키와 가공 조회 키의 불일치(유령 키 편집)** 이며, 가공 자체는
"프리셋 없음 → 1회" 규칙대로 정확히 동작한 것이다.

### 2.3 [전문가 C — 아키텍처/QA] 종합: 프로토콜 확장과 수명주기의 불일치 + 무한 대기 설계

1. **명령 프로토콜은 3일간 3번 확장**(SET_PARAM 07-22, REPEAT 07-23, DELAY 그룹 경계 07-20)됐지만,
   드라이버 청크 수명주기(BufStart 선호출/빈 버퍼 Cancel)는 Z_MOVE 시대 설계 그대로다. 경계 명령은
   "버퍼를 여닫는 이벤트"가 아니라 "상태 갱신 이벤트"로 다뤄야 하며, 버퍼는 **기하 명령이 실제로 나올 때만**
   열어야 한다(지연 개방, Lazy Open). 이러면 빈 청크·작업 간 Cancel이 원천 소멸한다.
2. **CheckMarkingState는 정상 탈출 조건이 bit0 하나뿐**(§6.11 260602 복원 — 조기완료 방지를 위해 의도된 설계).
   따라서 bit0 신뢰성을 해치는 어떤 변화(작업 간 Cancel)도 곧바로 "물리 가공은 끝났는데 UI는 영원히 RUNNING"으로
   나타난다. 근본 수정(P1)과 별개로, bit0 대기가 비정상적으로 길어지면 warn 로그로 식별 가능하게 유지한다
   (이미 200ms 스로틀 폴링 로그 있음 — 실기 로그 `Bin\Log\Log_*.txt`에서 `GetMarkingState()`/`MarkStatusBit0` 원값
   확인으로 가설 최종 검증 가능).
3. **UI 신뢰성 관점**: S1/S2에서 진행률 44.4% 고정·경과시간 증가·Stop 필요 등 프론트 표시는 모두
   백엔드 신호에 충실했다(허위 완료를 만들지 않음 — 올바른 fail-safe 방향). 수정 후에도 이 원칙 유지.
4. **회귀 우려 검토**: P1(지연 개방)은 정상 경로에서 BufStart→SetDefaultParameters→기하→flush 순서를
   바꾸지 않는다(여는 "시점"만 첫 기하 명령 직전으로 이동). SET_PARAM의 속도 반영도 "다음 버퍼 개방 시
   SetDefaultParameters(m_markSpeed…)"라는 기존 규약(§6.14) 그대로다.

---

## 3. 해결 계획

### P1 — [C++] `SinoGalvoController::Run()` 청크 버퍼 지연 개방(Lazy Open) 및 작업 간 Cancel 제거

| # | 수정 | 내용 |
|---|---|---|
| P1-1 | **버퍼 지연 개방** | 청크 진입 시 `BufStart()` 선호출 제거. `bufferOpen` 플래그를 두고 **첫 기하 명령 큐잉 직전**에 `BufStart() + SetDefaultParameters(m_markSpeed, m_jumpSpeed)` 실행. 버퍼 한계 분할 재개방(:728)도 동일 패턴 유지 |
| P1-2 | **빈 버퍼 경계 명령의 Cancel 제거** | DELAY/SET_PARAM/Z_MOVE/REPEAT_END의 `else { Cancel(); }` 4곳 삭제 — 버퍼를 열지 않았으므로 버릴 것도 없다. DELAY는 Sleep만, SET_PARAM은 값 갱신만, Z_MOVE는 zMoveCallback만 수행하고 **같은 for 루프에서 continue**(청크 break 불필요 → 빈 청크 사이클 자체가 사라짐) |
| P1-3 | **flush 종점 통일(2차 방어)** | DELAY/SET_PARAM/REPEAT_END의 flush에도 Z_MOVE·청크말단과 동일하게 `ReturnToCenterPoint()`를 넣어 모든 마킹 사이클이 실이동 종점으로 끝나게 함 — §6.11의 260619 독트린("실이동 종점에서 bit0가 신뢰성 있게 세워진다")과 정렬. (P1-1/2로 원인이 제거되어도 bit0 신뢰성 보강으로 유지 가치 있음) |
| P1-4 | **Cancel 사용처 명문화** | Cancel은 Stop/타임아웃 복구 전용임을 주석으로 못박음(영문 ASCII — §6.7 규약). pre-wait/next-chunk-wait 타임아웃 복구 Cancel은 유지 |
| P1-5 | 진단 로그 유지 | CheckMarkingState 폴링 로그(원값 출력) 유지 — P4 실기 검증에서 가설 확증/반증의 근거 |

**빌드**: 반드시 `.sln` 경유 msbuild(§6.14 재확인, `$(SolutionDir)` 문제). exe 실행 중이면 LNK1104 — 종료 후 빌드.

### P2 — [TS] `currentLayerColor` 유령 키 방지 (재검증)

| # | 수정 | 내용 |
|---|---|---|
| P2-1 | **자동 선택 effect 확장** ([ColorPresetPanel.tsx:62](../../Portal/src/ui/components/control/ColorPresetPanel.tsx#L62)) | 조건을 "미선택(null)"에서 "**미선택 또는 현재 레이어 목록에 없는 색상**"으로 확장: `if (layers.length > 0 && (!currentLayerColor \|\| !layers.some(l => l.color === currentLayerColor))) setCurrentLayerColor(layers[0].color);` — 캔버스 교체(도형 삭제/DXF 로드) 시 편집 대상이 항상 실존 레이어를 가리키게 됨 |
| P2-2 | 도형 없음 처리 | `layers.length === 0`이면 `setCurrentLayerColor(null)`로 소거(유령 잔존 차단, "도형이 없습니다" 표시와 일관) |
| P2-3 | 효과 범위 확인 | ProcessDashboard의 MARK TIMES 분모, handleProcessStart의 scannerControl 초기값, Use Default Parameters 캐스케이드가 모두 currentLayerColor를 읽으므로 P2-1 한 곳으로 허위 표시·오적용이 함께 해소됨 (별도 수정 불필요) |

**배포**: TS-only → `vite build` + `Bin\web` robocopy. P1과 달리 exe 재빌드 불필요하나 이번 건은 P1과 함께 배포.

### P3 — 적용 순서

```
P1 (C++ Run 루프) + P2 (프리셋 키 재검증) 구현
 → vite build + Bin\web 배포, .sln msbuild → Bin\LASERnGRAPN.exe 갱신 (동시 배포)
 → P4 실기 검증
```

### P4 — 실기 검증 매트릭스

| # | 시나리오 | 합격 기준 |
|---|---|---|
| T1 | **S1 재현**: 사각형 1회 + 원 2회 | 사각형 1회 → 원 2회 모두 가공, 자동 Completed, MARK TIMES 회차 정상 |
| T2 | **S2 재현**: 사각형 2회 + 원 1회 | 전체 가공 후 자동 Completed (진행률 100%, 교착 없음) |
| T3 | **S3 재현**: 캔버스 비우고 해마 DXF 로드 → Mark Times 2 입력 → 가공 | 입력 시 초록 스와치가 자동 선택(✓ 표시)돼 있고, View Commands에 `Pass x2`/REPEAT 마커, 물리 2회 가공 |
| T4 | 회귀: 단일 색상 DXF ×10 (오전 정상 케이스) | 여전히 10/10 완료, 회차 표시 순차 증가 |
| T5 | 회귀: 색상별 Mark Speed 상이(§6.14 검증 순서 ①②③) | SET_PARAM 값·실속도 전환 정상 |
| T6 | 가공 중 Stop (반복 중간/그룹 경계) | 1초 내 정지, 재시작 정상 (6차 P1 규약 유지) |
| T7 | Shape Delay 2초 + 다색 그룹 | 경계 지연 정상, 교착 없음 |
| T8 | 교착 재현 시(가설 반증 시) | `Bin\Log\Log_*.txt`의 CheckMarkingState 폴링 원값(`GetMarkingState`/`MarkStatusBit0`)을 확보해 재분석 — P1-5가 근거 제공 |

### 위험도

- P1은 가공 사이클의 "언제 버퍼를 여는가"만 바꾸고 여닫는 내용물·순서는 유지 — 위험 중간(실기 T4·T5 회귀 필수).
- P1-3(flush 종점 통일)은 반복 사이 갈보 센터 이동이 추가됨(레이저 OFF 상태의 이동) — 260619 검증 구조와 동일화이므로 수용.
- P2는 표시/키 정합성 수정으로 위험 낮음. 단 "일부러 레이어 밖 색상을 편집"하는 사용례는 없으므로 부작용 없음.

---

## 구현 현황 (2026-07-23 승인 후 구현 완료)

| 항목 | 상태 | 위치 |
|---|---|---|
| P1-1 버퍼 지연 개방 (청크 선두 BufStart 제거, 첫 기하 명령 직전 개방) | ✅ | `SinoGalvoController.cpp` Run() |
| P1-2 빈 버퍼 경계 명령의 `else { Cancel(); }` 4곳 제거 (Z_MOVE/DELAY/SET_PARAM/REPEAT_END) | ✅ | 〃 |
| P1-3 DELAY/SET_PARAM/REPEAT_END flush에 `ReturnToCenterPoint()` 종점 추가 | ✅ | 〃 |
| P1-4 Cancel 용도(Stop/타임아웃 복구 전용) 주석 명문화 (ASCII 영문, §6.7 준수) | ✅ | 〃 |
| P1-5 CheckMarkingState 진단 폴링 로그 유지 | ✅ (무변경) | 〃 |
| (부수) 버퍼 한계 분할 flush 후 즉시 재개방 → 지연 재개방으로 통일 | ✅ | 〃 |
| P2-1/2 currentLayerColor 재검증 (목록에 없으면 첫 레이어 재지정, 도형 없으면 null 소거) | ✅ | `ColorPresetPanel.tsx` |
| 빌드/배포 | ✅ vite build + `Bin\web` 미러, `.sln` msbuild Release x64 → `Bin\LASERnGRAPN.exe` 갱신 (2026-07-23 18:03) | — |

P4 실기 검증(T1~T8)은 장비에서 수행 대기. 체크포인트 기록: `docs/checkpoints/feature_Scanner.md` §6.16.

---
담당: Claude (AI Coding Assistant) — 3-Expert Root Cause Analysis (Driver-HW / Frontend-State / Architecture-QA)
