# Scanner 이상 증상 9차 — CIRCLE 프리미티브 완료 비트 미래치(교착 잔존) + MARK TIMES 표시 의미론 (2026-07-23)

> 3인 전문가 관점(드라이버/하드웨어 · 프론트엔드/UX 의미론 · 아키텍처/QA) 협의 분석과 해결 계획서.
> 선행: `docs/plans/ScannerIssue8_MultiGroup_Hang_and_PresetKey.md` — 8차 수정(빈 청크 Cancel 제거,
> Lazy BufStart, flush 센터 종점)은 배포되어 **사각형 단독 3회 반복은 정상화**되었으나, 다색(사각형+원)
> 시나리오의 교착은 재현됨. 이번에는 추정이 아니라 **실기 로그(`Bin\Log\Log_2026-07-23.txt`) 원값**으로
> 원인을 확정한다.

---

## 1. 증상 및 실측 데이터 (2026-07-23 18:07~18:13, 8차 수정 exe)

| # | 구성 | 관측 결과 |
|---|---|---|
| S1 | 사각형(파랑) 단독 **3회** | ✅ 정상 — REPEAT pass 1→2→3, 자동 Completed, MARK TIMES 3/3 |
| S2 | 사각형(파랑) **3회** + 원(빨강) **2회** | ❌ 사각형 3회 ✓ → 원 1회 가공 후 **교착**(105초 후 수동 Stop) |
| S3 | (UI) 사각형 가공 중 MARK TIMES가 **1/2**로 표시 | 사각형 그룹은 3회인데 분모가 2 — 사용자 지적: "불합리하다" → §2.2에서 의미론 분석 |
| S4 | (UI, 추가 보고) 사각형 단독 **10회** — 물리 가공은 10회 정상 | ❌ MARK TIMES가 **6/10에서 멈췄다가** 완료 순간 10/10으로 점프. "어떤 때는 제대로, 어떤 때는 아님" → §2.4에서 원인 확정 |

**교착 구간 로그 원값 (18:11 런— 스모킹 건)**:

```
18:11:04.750  Run: SET_PARAM speed=2.000 (cmd 1/9)          ← scannerControl 초기값 5 → 2로 "속도 변경" 후에도
18:11:04.750  Run: REPEAT block begin, pass 1/3 (cmd 2)        사각형은 정상 완료 (속도 변경은 원인이 아님을 증명)
18:11:12.388  Run: REPEAT pass 2/3                           ← 각 패스 CheckMarkingState 정상 종료:
18:11:20.031  Run: REPEAT pass 3/3                              state=0 (~3.2s) → state=1,bit0=0 (~4.3s) → bit0=1 (7.6s)
18:11:27.668  CheckMarkingState: done after 7562ms           ← 사각형 pass3 완료. 7.6s ≈ 둘레 14.86mm ÷ 2mm/s ✓
18:11:27.668  Run: SET_PARAM speed=5.000 (cmd 5/9)
18:11:27.669  Run: REPEAT block begin, pass 1/2 (cmd 7)      ← 원(CIRCLE) 그룹 pass 1
18:11:28.556  CheckMarkingState: poll#74  GetMarkingState()=1, MarkStatusBit0=0   ← 전송 완료(0.83s)
   ...
18:13:12.952  CheckMarkingState: poll#3897 elapsed=105234ms GetMarkingState()=1, MarkStatusBit0=0
18:13:12.952  Stop called.                                   ← 105초 동안 bit0=0 고정, 수동 Stop
```

원의 물리 마킹은 약 2초에 끝났고(둘레 ≈9.1mm ÷ 5mm/s, 사용자 육안 확인) 이후 **103초 이상
`GetMarkingState()==1 && bit0==0`이 유지**되었다 — 즉 마킹은 끝났는데 완료 비트가 영원히 서지 않는다.

## 2. 3인 전문가 원인 분석

### 2.1 [전문가 A — 드라이버/하드웨어] 확정: **SchOutCircle로 구성된 버퍼는 MarkStatus bit0를 래치하지 않는다**

전 런을 프리미티브별로 대조하면 상관이 100%다:

| flush에 담긴 프리미티브 | bit0 래치 | 사례 |
|---|---|---|
| SchOutLine (RECT=선 4개, DXF polyline, 해마) | ✅ 항상 래치 | 오전 DXF×10, 해마, 사각형 3회×3런, 8차 이전 사각형 패스들 전부 |
| **SchOutCircle (CIRCLE)** | ❌ **한 번도 래치된 적 없음** | 이전 세션 S1(원 pass1 후 교착)·S2(마지막 원 후 교착), 금일 18:08/18:11(원 pass1 후 교착) |

경합 가설들은 이번 로그로 모두 소거되었다:
- **속도 변경(SET_PARAM) 아님**: 18:11 런은 시작 시 `SetMarkSpeed 5.0` → 첫 SET_PARAM으로 2.0 변경 후
  사각형이 정상 완료 — 속도 변경 후에도 LINE 버퍼는 래치된다.
- **빈 청크 Cancel 아님**(8차 가설): Cancel 전부 제거된 exe에서 재현 — 8차 수정은 유효한 위생 개선이지만
  이 교착의 근본 원인은 아니었다.
- **센터 종점 부재 아님**: 8차에서 원 버퍼도 `ReturnToCenterPoint()`(실이동 SchOutPoint) 종점을 갖게
  됐지만 여전히 미래치. (반대로 사각형은 8차 이전 센터 없는 flush에서도 래치됐다.)
- **소프트웨어 상태 오염 아님**: 교착 직전까지 동일 Run 루프가 사각형 3패스를 정상 완주.

**해석**: CSG9210/JHCLIB의 원 그리기 프리미티브는 보드 펌웨어 수준에서 완료 플래그 갱신 경로가
다르거나 누락된 것으로 보인다. 검증된 260602/260619 계열이 이 문제를 겪지 않은 이유는 당시 청크
경계가 Z_MOVE뿐이라 원이 **다른 도형들과 한 버퍼에 섞여** 마킹되었기 때문으로 추정된다(순수 원
버퍼가 생기는 것은 색상 그룹/REPEAT 경계가 도입된 최근 구조). 참고로 `MoveToCenter()`는 이미
"bit0가 갱신되지 않을 수 있다"며 bit0 대기를 회피하도록 작성돼 있었다 — 동일 계열의 하드웨어 특성.

**대응 원칙**: 벤더 DLL/펌웨어는 고칠 수 없으므로, (a) 완료 판정이 증명된 유일한 프리미티브(LINE)로
곡선을 테셀레이션하거나, (b) 다른 완료 신호를 찾아야 한다. `JHCStatusdef`에는 아직 안 쓰는
**`MarkTimes`(보드의 마킹 완료 카운터)** 필드가 있다 — StartMarking 전 값을 캡처하고 증가를 완료로
판정하는 대안 신호 후보(§P1 진단으로 확인).

### 2.2 [전문가 B — 프론트엔드/UX 의미론] MARK TIMES 표시: "도형(색상 그룹)별 n/N"이 논리적으로 옳다

사용자 질문 — "매 도형마다 n/N" vs "전체 도형의 반복 횟수 n/N" 중 어느 것이 논리에 맞는가:

1. **Mark Times는 이제 색상(레이어)별 속성이다** (색상 프리셋 체계, process preset.md). 이번 레시피처럼
   사각형 3회·원 2회이면 "전체 레시피의 반복 횟수"라는 **단일 숫자 N은 정의 자체가 불가능**하다
   (3도, 2도, 합 5도 물리적 의미가 없다 — 전체 시퀀스가 통째로 반복되는 것이 아니라 그룹 A를 다 돌고
   그룹 B로 넘어가는 구조이므로).
2. **전체 진행은 이미 진행바(0~100%)가 담당**한다 — 진행률 분모(physicalTotal)는 그룹×반복을 모두
   계상하므로 "레시피 전체가 얼마나 남았나"는 진행바가 정확히 답한다. MARK TIMES 행의 존재 이유는
   "**지금 가공 중인 레이어가 몇 번째 회차인가**"라는 별개의 질문에 답하는 것.
3. 따라서 **결론: 도형(색상 그룹)별 회차 표시 `pass n / 그 그룹의 N`이 옳다.** 그룹이 바뀌면 카운터가
   1/N'으로 리셋되는 것이 물리 현실과 일치한다 (예: 1/3→2/3→3/3→1/2→2/2).
4. **현행 구현은 두 의미 모두에 어긋난다**: 분모 N = "현재 선택된 스와치 색상의 프리셋 markTimes"
   (순수 UI 상태 — 가공과 무관), 분자 n = 전체 진행률의 비례 환산. 그래서 사각형(3회) 가공 중인데
   빨강 스와치가 선택돼 있으면 1/2가 표시된 것(S3). 단일 그룹 레시피에서만 우연히 맞는 근사였다.
5. **구현 방식**: 드라이버는 이미 REPEAT pass를 정확히 알고 로그로 찍고 있다(`REPEAT pass k/N`).
   이 실측값을 `window.__onScannerMarkPass(cur, total)`로 방송해 UI가 그대로 표시하는 것이 유일하게
   정직한 구조다(진행률 환산·프리셋 조회 등 유도 계산 전면 폐기). N=1 그룹은 행을 숨긴다(현행 규칙 유지).

### 2.4 [전문가 A 추가 — 드라이버] S4 확정: REPEAT 진행률 회계의 패스당 off-by-one

S4("6/10 정체 후 완료 시 10/10")는 `Run()`의 진행률 회계 불일치로 **수치까지 정확히 재현**된다:

- 총량: [SinoGalvoController.cpp:373](../../LASERnGRAPN/Modules/Scanner/SinoGalvo/Base/SinoGalvoController.cpp#L373)
  `physicalTotal += (rc−1) × (i − rb)` — 패스당 **`REPEAT_END−REPEAT_BEGIN` = 블록 내부 + 1개**를 계상.
- 완료분: 되감기 시 `physicalDoneOffset += cmdIndex − repeatStartIndex` — 패스당 **블록 내부 개수만** 가산
  (repeatStartIndex = REPEAT_BEGIN+1이므로 총량보다 매 패스 1개 부족).

**사각형 10회 검산**: 네이티브 스트림 `[SET_PARAM(0)][REPEAT_BEGIN(1)][RECT(2)][REPEAT_END(3)]` →
physicalTotal = 4 + 9×(3−1) = **22**. 패스 k 종료 체크포인트의 done = (k−1)×1 + 3 = k+2 →
**패스 10에서 12/22 = 54.5%** → 표시 `floor(0.545×10)+1 = 6` → **"6/10"** — 보고 수치와 정확히 일치.
완료 시 idle 이벤트가 progress=100을 대입해 10/10으로 점프.

**"어떤 때는 제대로"의 정체**: 오차율은 블록 크기에 반비례한다. 블록 내부가 858개인 DXF ×10은
패스당 858/859만 진행해 사실상 정확(만분율 오차)하지만, 내부가 1개인 단순 사각형은 패스당 1/2만
진행해 절반에서 멈춘다. **재현 조건이 "블록 내 명령 수"였던 것** — 우연이 아니라 결정론적 버그.

→ 수정은 한 줄: 되감기 오프셋에 REPEAT_END 마커 몫 +1을 포함해 총량 계상과 일치시킨다 (§P0).
(P3의 실측 회차 방송이 도입되어도 **진행바 %** 자체가 이 회계를 쓰므로 P0는 독립적으로 필요.)

### 2.5 [전문가 B 추가 — UX] 회차 표시에 현재 진행 색상(레이어) 명시 (사용자 추가 요구)

다색 레시피에서 "1/3→…→1/2" 리셋이 일어나면 **어느 레이어의 회차인지**가 표시에 없으면 모호하다.
사용자 요구대로 n/N 앞에 **현재 가공 중인 색상 그룹의 스와치(색상 칩)** 를 표시한다. 원칙:

- 색상 정보의 출처도 실측이어야 한다 — UI가 "선택된 스와치"를 보여주면 S3 버그의 재판이 된다.
  생성기가 REPEAT_BEGIN 커맨드에 그룹 색상(hex)을 실어 보내고, 드라이버가 회차 방송에 색상을 포함
  (`__onScannerMarkPass(cur, total, '#RRGGBB')`)해 **커맨드 스트림 → 드라이버 → UI 단방향**으로 흐른다.
- **모든 색상 그룹을 REPEAT 마커로 감싼다(반복 1회 그룹 포함)**: 기존에는 markTimes>1일 때만 마커를
  방출해, 반복 없는 그룹이 진행되는 동안 직전 그룹의 "3/3 파랑" 표시가 잔존하는 문제가 생긴다.
  1회 그룹도 `REPEAT_BEGIN{count:1}`을 방출하면 그룹 시작마다 (1, N, color)가 갱신되어 표시가 항상
  현재 그룹을 가리킨다. 드라이버는 count=1을 이미 자연 처리(되감기 없음)하며, 그룹 종료 flush가
  기존 DELAY/청크말단 대신 REPEAT_END에서 일어나는 것뿐이라 물리 동작 등가(뒤따르는 DELAY는 빈
  버퍼 no-op). 표시 규칙: N=1 그룹은 "1/1" 대신 색상 칩 + 회차 행을 유지할지/숨길지 선택 — 현재
  가공 레이어를 항상 보여주는 것이 정보량이 많으므로 **행은 항상 표시, N=1이면 칩+`1/1`** 로 한다.

### 2.6 [전문가 C — 아키텍처/QA] 판정 전략과 검증 설계

1. **완료 판정의 신뢰 기반을 "프리미티브 실행 엔진"에서 분리**: bit0 래치가 프리미티브 종류에 의존한다는
   것이 확인된 이상, 완료 판정이 걸린 경로에는 **래치가 증명된 LINE만 사용**하는 것이 결정론적이다.
   곡선 4종(CIRCLE/ARC/ELLIPSE/EARC)은 같은 곡선 실행 엔진 계열이므로 CIRCLE만 확진이지만 동일
   테셀레이션으로 예방하는 것이 타당(ARC 등에서 같은 장애가 현장 재발하는 것을 방지).
2. **품질 영향**: 코드 허용 오차(chord error) 0.005mm로 분할하면 세그먼트당 편차가 빔 폭(수십 µm)
   이하 — 시각/가공 품질 차이는 사실상 없다. 세그먼트 수는 반지름에 따라 자동 산출(clamp 상하한).
   버퍼 바이트 추정(`CommandBufferBytes`)은 LINE 개수 기준으로 자연 반영된다.
3. **진단 병행**: 테셀레이션으로 우회하더라도, 곡선 프리미티브의 진짜 완료 신호(전체 MarkStatus 바이트,
   보드 `MarkTimes` 카운터)를 폴링 로그에 추가해 후속 판단 근거를 축적한다 — 벤더 문의 시 증거로도 사용.
4. **UI 신뢰성**: §2.2 방송 구조는 "네이티브 실측만 표시"라는 안 A(§6.11)·진행률 전역화(금일 오전 수정)와
   동일한 원칙의 확장이다.

---

## 3. 해결 계획

### P0 — [C++] REPEAT 진행률 회계 off-by-one 수정 (S4)

| # | 수정 | 내용 |
|---|---|---|
| P0-1 | 되감기 오프셋을 총량 계상과 일치 | `physicalDoneOffset += cmdIndex - repeatStartIndex;` → `+ ... + 1` (REPEAT_END 마커 몫 포함, = `REPEAT_END − REPEAT_BEGIN`). 검산: 사각형 10회 → 패스 10 진행률 21/22 = 95.5% → 회차 파생식도 10/10 (idle 전 이미 정확) |

### P1 — [C++ 진단] CheckMarkingState 폴링 로그 확장 (원인 증거 축적)

| # | 수정 | 내용 |
|---|---|---|
| P1-1 | 폴링 로그에 **전체 `MarkStatus` 바이트(hex)** 와 **보드 `MarkTimes` 카운터** 추가 | `CheckMarkingState()` — state==1 구간에서 `GetSystemState` 결과의 두 필드를 함께 출력. 곡선 버퍼에서 bit0 외 다른 비트/카운터가 움직이는지 확인 → 향후 완료 판정 대안(P3 후보) 및 벤더 문의 증거 |

### P2 — [C++ 본수정] 곡선 프리미티브의 LINE 테셀레이션 (Design Pattern: Adapter)

| # | 수정 | 내용 |
|---|---|---|
| P2-1 | `CIRCLE` 케이스를 SchOutCircle 대신 **SchOutLine 체인**으로 방출 | 시작점 `(cx+r, cy)`에서 코드 오차 0.005mm 기준 세그먼트 수 산출(`theta = 2·acos(1-eps/r)`, clamp 24~720), MovetTo(시작점) 후 순차 SchOutLine. 완료 판정이 증명된 LINE 경로로 통일 |
| P2-2 | `ARC`/`ELLIPSE`/`EARC`도 동일 헬퍼로 테셀레이션 (예방적) | 공용 헬퍼 `TessellateEllipticalArc(cx, cy, rx, ry, startDeg, endDeg)` 하나로 4종 처리(원=rx=ry 완전 원호, 기존 각도 정규화 로직 유지). SchOutCircle/SchOutArc/SchOutEllipse/SchOutEArc 호출 제거(코드는 보존, 사용만 중단 — 주석에 근거 명기) |
| P2-3 | 버퍼 분할 계상 | 테셀레이션된 LINE 수만큼 `bufferedBytes` 누적(기존 `CommandBufferBytes(LINE)` 재사용) — 대반지름 원이 한 버퍼 한계를 넘으면 기존 buffer-limit flush가 자연 분할 |

### P3 — [TS+C++] MARK TIMES 도형(그룹)별 실측 회차 + 색상 칩 방송·표시 (§2.2·§2.5 결론 구현)

| # | 수정 | 내용 |
|---|---|---|
| P3-1 | 생성기: 전 그룹 REPEAT 래핑 + 색상 탑재 | `ScannerGenerator.generate()` — markTimes와 무관하게 **모든 색상 그룹**을 `REPEAT_BEGIN{repeatCount: N(≥1), color: group.color}` ~ `REPEAT_END`로 감싼다(§2.5 근거: 1회 그룹 진행 중 직전 그룹 표시 잔존 방지). `ScannerCommand`에 `color?: string` 추가 |
| P3-2 | IPC 파싱 | `PortalRouterHandler.cpp` — REPEAT_BEGIN의 `color` 문자열 파싱, C++ `ScannerCommand` 구조체에 색상 필드 추가(`IScannerController.h`) |
| P3-3 | 드라이버 방송 | `Run()` REPEAT_BEGIN(pass 1 시작)과 각 되감기 시점에 `window.__onScannerMarkPass && window.__onScannerMarkPass(cur, total, '#RRGGBB');` BroadcastJS (기존 `REPEAT pass k/N` 로그와 같은 지점). 색상 문자열은 `^#[0-9A-Fa-f]{3,8}$` 검증 후 삽입(JS 주입 방어), 불일치 시 빈 문자열. Run 종료 시 상태 소거는 프론트 reset이 담당 |
| P3-4 | 브리지/스토어 | `HardwareFacade`에 `__onScannerMarkPass` 전역 등록 → `bus.emit("scanner/markpass", {cur, total, color})` (EventMap 타입 추가) → `useProcessMonitor`(전역 상주)가 `processStates.scanner.markPass/markPassTotal/markPassColor`에 저장(appStore 필드 신설, `resetProcessStatus`에서 소거) — 진행률 전역화(금일 오전)와 동일 패턴 |
| P3-5 | 표시 | `ProcessDashboard`의 기존 유도 계산(선택 스와치 프리셋 분모 × 진행률 환산 분자) **삭제** → 방송값이 있으면 "[색상 칩] MARK TIMES markPass / markPassTotal" 표시(칩은 `markPassColor` 원형 스와치). 그룹 전환 시 1/N' 리셋이 정상 동작. N=1 그룹도 행 유지(`1/1` + 칩)로 현재 가공 레이어를 항상 명시 |

### P4 — 적용 순서 및 검증

```
P0+P1+P2+P3(C++) / P3(TS) 구현 → vite build + Bin\web 미러 → .sln msbuild (exe 종료 확인) → 실기 검증
```
**동시 배포 필수**: P3-1이 REPEAT 마커 방출 조건을 바꾸므로(전 그룹 래핑) 프론트/exe를 반드시 함께 배포
(7차와 동일한 프로토콜 결합 — 구 exe + 신 프론트 조합 금지).

| # | 시나리오 | 합격 기준 |
|---|---|---|
| T1 | **원 단독 1회** (판별 실험) | 교착 없이 자동 Completed — 테셀레이션 효과 직접 확인. 마킹 품질(원 진원도) 육안 확인 |
| T2 | 사각형 3회 + 원 2회 (금일 재현 케이스) | 전 구간 자동 완료. 표시 [파랑]1/3→2/3→3/3→[빨강]1/2→2/2 (색상 칩 포함 실측 표시) |
| T3 | 사각형 단독 3회 (회귀) | 8차와 동일하게 정상, 표시 1/3→3/3 |
| T4 | **사각형 단독 10회 (S4 재현)** | 진행바가 패스마다 ~9.5%씩 전진(95.5%까지), 표시 1/10→…→10/10 순차 (6/10 정체 소멸) |
| T5 | DXF ×10 (회귀) | 10패스 완료, 표시 1/10→10/10 |
| T6 | 타원/원호 도형 포함 레시피 | 교착 없음(예방 테셀레이션 검증), 형상 품질 확인 |
| T7 | 반복 1회 다색 레시피 (예: 파랑 1회 + 빨강 1회) | 그룹 전환 시 색상 칩·1/1 갱신, 직전 그룹 표시 잔존 없음 (§2.5) |
| T8 | 가공 중 Stop / Shape Delay 조합 | 즉시 정지·지연 정상 (기존 규약 유지) |
| T9 | P1 로그 확인 | 곡선 버퍼 가공 로그에서 MarkStatus 전체 바이트·보드 MarkTimes 카운터 거동 확보(향후 판단 자료) |

### 위험도

- P0은 한 줄 산술 수정 — 검산으로 정합 확인(T4에서 실증). 위험 극소.
- P2는 곡선 렌더링 방식 변경 — **형상 품질을 T1/T6에서 반드시 육안 검증**(코드 오차 0.005mm는 빔 폭
  이하라 차이가 없어야 정상). 문제 시 eps만 조정하면 됨.
- P3는 프로토콜 변경(전 그룹 REPEAT 래핑) 포함 — 프론트/exe **동시 배포 필수**. 1회 그룹의 flush 지점이
  DELAY/청크말단에서 REPEAT_END로 이동하나 flush 내용(center+SchLaserOut+StartMarking+bit0 대기)은
  동일해 물리 등가. 표시 로직은 유도 계산 삭제로 오히려 단순화.
- P1은 로그 추가만 — 무위험.

---

## 구현 현황 (2026-07-23 승인 후 구현 완료)

| 항목 | 상태 | 위치 |
|---|---|---|
| P0 되감기 오프셋 +1 (REPEAT_END 마커 몫 포함 — 총량 계상과 정합) | ✅ | `SinoGalvoController.cpp` Run() |
| P1 CheckMarkingState 폴링 로그에 `MarkStatus=0xNN` + `BoardMarkTimes` 추가 | ✅ | 〃 |
| P2 곡선 4종(CIRCLE 확진/ARC·ELLIPSE·EARC 예방) → `emitArcAsLines` LINE 테셀레이션 (코드 오차 0.005mm, 세그먼트 8~720 clamp, 버퍼 바이트 LINE 단가 계상) | ✅ | 〃 |
| P3-1 생성기: 전 그룹 REPEAT 래핑(repeat≥1) + REPEAT_BEGIN에 `color` 탑재 | ✅ | `ScannerGenerator.ts` |
| P3-2 IPC: REPEAT_BEGIN `color` 파싱, `ScannerCommand::color`(std::string) 신설 | ✅ | `PortalRouterHandler.cpp`, `IScannerController.h` |
| P3-3 드라이버 방송: `__onScannerMarkPass(cur,total,'#hex')` — REPEAT 시작·되감기 지점, hex 검증(JS 주입 방어). SinoGalvo/Scanlab 양쪽 | ✅ | `SinoGalvoController.cpp`, `ScanlabController.cpp` |
| P3-4 브리지/스토어: HardwareFacade 전역 등록 → bus `scanner/markpass` → useProcessMonitor → `processStates.scanner.markPass/markPassTotal/markPassColor` (reset 시 소거) | ✅ | `HardwareFacade.ts`, `events.ts`, `appStore.ts`, `useProcessMonitor.ts` |
| P3-5 표시: 유도 계산 삭제 → 방송값 표시(색상 칩 + n/N, N=1 그룹은 1/1) | ✅ | `ProcessDashboard.tsx` |
| 빌드/배포 | ✅ vite build + `Bin\web` 미러, `.sln` msbuild Release x64 → `Bin\LASERnGRAPN.exe` 갱신 (2026-07-23 18:59, 프론트/exe 동시 배포 충족) | — |

참고: Object(G-code) 모드는 회차 방송 소스가 없어 MARK TIMES 행이 비표시된다(기존 유도 표시도
오표시였음). G-code 실행기에 회차 방송을 붙이는 것은 후속 과제.

P4 실기 검증(T1~T9)은 장비에서 수행 대기.

---
담당: Claude (AI Coding Assistant) — 3-Expert Root Cause Analysis (Driver-HW / Frontend-UX / Architecture-QA)
