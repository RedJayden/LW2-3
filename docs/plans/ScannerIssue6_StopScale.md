# Scanner 이상 증상 6차 — Stop 미동작 · 유령 직선 · 리사이즈 중첩 가공 · 오버레이 스케일 불일치 (2026-07-22)

> 3인 전문가 관점(드라이버/동시성 · 커맨드 생성 · 캘리브레이션/광학)으로 분석한 원인 규명과 수정 계획서.
> 참조: `docs/plans/ScannerIssue.md`(1~5차 통합), `docs/checkpoints/feature_Scanner.md`, 메모리 `reference-getmarkingstate-polarity`.

---

## 1. 보고된 증상 요약

| # | 증상 | 관측 근거 |
|---|---|---|
| S1 | DXF 가공 중 **Stop을 눌러도 끝까지 가공됨** | 사용자 보고, 상태바 `CheckMarkingState: poll #700, elapsed=1422ms` (Stop 시점 대부분 CheckMarkingState 내부) |
| S2 | DXF에 **없는 직선**이 가공됨 (수평/대각 장직선) | 실물 사진 3, Generated Commands 덤프에 직선 명령 실존 |
| S3 | 도형 **리사이즈 후 재가공 시 원본 크기로 가공**, Stop 후 카메라 영역 안에 **원본 도형이 축소 영역에 우겨넣어진 듯한 중첩 패턴** | 사용자 보고 + 스크린샷 (Gr.W 12→1.862 변경에도 View Commands 45,824 동일) |
| S4 | (전부 삭제 후 작게 재작화·재가공) **가공 결과와 오버레이가 불일치 — 중심에서 멀수록 오차 증가**. 캘리브레이션은 최근 재수행 | 최신 스크린샷 2장: 가공 패턴이 오버레이보다 균일하게 큼 |

---

## 2. 전문가 A — 스캐너 드라이버/동시성 관점 (S1, S3 중첩)

### 2.1 [확정 원인 A-1] `CheckMarkingState()`가 Stop 플래그를 소거한다 → Run 루프가 Stop을 못 본다

`SinoGalvoController.cpp:740-745`:

```cpp
if (m_stopFlag) {
    m_jhcLib->Cancel();
    m_stopFlag = false;   // ← 원인. 여기서 플래그를 소거해 버린다
    flag = false;
    break;
}
```

`CheckMarkingState()`는 버퍼 분할 flush(`:573`), Z_MOVE/DELAY flush(`:376`, `:401`), 청크 종료 flush(`:608`)마다 호출되어 **가공 시간의 대부분을 점유**한다(상태바 poll #700 증거). 사용자가 Stop을 누르면:

1. `Stop()`(`:781`)이 `m_stopFlag = true` 설정 + `Cancel()` → 현재 물리 마킹만 취소.
2. `CheckMarkingState()`가 플래그를 감지하고 **`m_stopFlag = false`로 소거** 후 반환.
3. 반환 직후 `Run()`의 모든 Stop 게이트(`:327`, `:344`, `:565`, `:580`, `:597`, `:625`)는 이미 `false`가 된 플래그를 보고 **통과** → 다음 명령/청크를 계속 큐잉·마킹.

**결과: Stop = "현재 버퍼 1개 취소 + 나머지 전부 계속 가공"** — S1과 정확히 일치한다. 정상 완료 경로에도 소거가 있고(`:755`), Run 말단에도 있어(`:664`) 소거 지점이 3곳으로 분산된 것이 구조적 원인이다.

### 2.2 [확정 원인 A-2] `Stop()`이 실행 중인 버퍼에 명령을 주입한다

`SinoGalvoController.cpp:781-788`:

```cpp
void SinoGalvoController::Stop() {
    ...
    m_jhcLib->Cancel();
    ReturnToCenterPoint();   // ← SchOutPoint(0,0,0)를 라우터 스레드에서 버퍼링
}
```

`Stop()`은 CEF 라우터 스레드에서 호출되는데, Run 워커 스레드가 `BufStart()`로 열어 둔 보드 버퍼에 **비동기적으로 `SchOutPoint(0,0)`을 끼워 넣는다**. 버퍼 스트림 오염 + (0,0) 방향 잡선/잡점의 소지이며 스레드 안전성이 없다. Cancel만 해야 한다.

### 2.3 [확정 원인 A-3] Run 재진입 가드 부재 + `LoadCommands()` 무락(lock-free) 교체 → 중첩 가공 (S3의 "우겨넣은 패턴")

- `PortalRouterHandler.cpp:1854` `HandleScannerRun`은 `WORK_1`으로 `g_Scanner->Run()`을 던질 뿐 **이미 실행 중인지 확인하지 않는다**.
- `PortalRouterHandler.cpp:1818` `HandleScannerGenerate` → `LoadCommands()`(`SinoGalvoController.cpp:195-201`)는 Run 스레드가 순회 중인 `m_commands`(std::vector)를 **뮤텍스 없이 통째로 교체**한다.

A-1 때문에 Stop이 실제로는 안 멈춘 상태에서 사용자가 리사이즈 후 Process Start를 다시 누르면:

1. 기존 Run #1이 아직 옛(원본 크기) 커맨드를 순회 중.
2. `LoadCommands`가 벡터를 새(축소) 커맨드로 교체 — 순회 중 재할당은 미정의 동작이며, 인덱스 기반 접근이 **옛/새 커맨드를 뒤섞어 읽는다**.
3. Run #2가 병렬로 기동 — 두 스레드가 같은 보드에 BufStart/StartMarking을 교차 발행.

**결과: 원본 크기 좌표와 축소 좌표가 뒤섞인 스트림이 마킹됨** — "축소 영역에 원본 도형을 우겨넣은 느낌"(S3)과 정확히 일치. "이전 정보가 남아서 발생한 것인가?"라는 사용자 추정은 **맞다** — 남은 곳은 프론트가 아니라 **네이티브에서 아직 돌고 있던 이전 Run**이다.

---

## 3. 전문가 B — 커맨드 생성(CAD→Scanner) 관점 (S2, S3 리사이즈)

### 3.1 [확정 원인 B-1] 유령 직선은 **DXF 파일 안에 실제로 존재**한다 (2026-07-22 원본 DXF 파싱으로 확정)

`Bin\Image\dxf\final_auxetic_sma_pattern (1).dxf`(=`11.dxf`)를 직접 파싱한 결과:

- **레이어 `0`에 마커 엔티티 2개**가 존재한다: #0 = 2정점 대각선 `(-0.5,-0.5)→(0.5,0.5)`, #1 = 3정점 소형 삼각형(원점 표식으로 추정). CAD 뷰어에서 레이어를 껐거나 눈에 띄지 않았을 뿐, 임포터는 전 레이어를 가져와 **함께 가공**한다.
- 패턴 본체는 `CUT_OUTER` 1개(1,012정점, bbox 12×22 — **12mm 하단 직선 변 포함**) + `CUT_HOLE` 19개. #3/#4/#15/#16에는 **5.000mm 수평 직선 변**이 실제로 들어 있다(예: `(0.5,20)→(5.5,20)`) — 커맨드 덤프의 `LINE SX-2.150 SY1.756 X2.850 Y1.756`(5.0mm)과 일치. 즉 사진의 수평선/외곽 직선은 도면 데이터 그대로다.
- **폐합 chord 가설은 기각**: `dxfImport.ts convertPolyline`은 closed 플래그를 무시하고 항상 열린 Polyline으로 임포트하며(`isClosed` 계산 후 미사용), FabricToPaperAdapter도 Polyline을 `closed:false`로 변환하므로 자동 폐합 직선은 생기지 않는다. (부작용: 진짜 닫힌 폴리라인의 마지막 변이 생략되나 이 DXF는 끝점 간격 0.002~0.06mm라 영향 미미)
- 남는 대각선 후보: 레이어 0 마커(#0) + 점프 경로 선단 마킹(`OpenDelay=-100`, `SinoGalvoController.cpp` SetDefaultParameters) — 후자는 실기 시험으로 판별.

**대응**: DXF 임포트 시 레이어 목록을 보여주고 선택 임포트(또는 최소한 레이어 `0` 등 비가공 레이어 경고)하는 기능을 후속 작업으로 제안. 임시 대응은 CAD에서 레이어 0 엔티티 삭제 후 재저장.

### 3.1b [참고] 생성 경로 자체의 유령 직선 후보 (원래 가설, 대부분 기각/보류)

사용자가 첨부한 Generated Commands 덤프 자체에 도면에 없는 장직선이 들어 있다. 예:

```
LINE SX-2.150 SY1.756 X2.850 Y1.756   ← 5.0mm 수평 직선 (실물 사진의 중앙 수평선과 일치)
LINE SX-6.115 SY-11.121 X5.885 Y-11.121 ← 12mm 외곽 직선
```

즉 S2는 하드웨어/딜레이 문제가 아니라 **ScannerGenerator/dxfImport의 기하 생성 버그**다. 유력 발생 지점:

- **폐합 chord**: `ScannerGenerator.ts:1028` `if (path.closed) points.push(points[0])` — dxfImport가 열린 POLYLINE을 closed로 잘못 판정하면 시작↔끝을 잇는 직선 chord가 생긴다. (DXF POLYLINE의 70번 그룹코드 closed 비트만 폐합으로 취급해야 함)
- **해치 연결선**: OptimizedTwoWay/Bow 경로(`ScannerGenerator.ts:996-1009`)는 `pointsForConnect`를 **하나의 연속 폴리라인으로** 마킹해 세그먼트 사이 연결선이 실선으로 가공된다. Fill 미사용 설정에서도 경계선 분기(`:934-953`)가 타면 외곽 직선이 추가된다.
- (부차) `SetDefaultParameters`의 `OpenDelay = -100`(`SinoGalvoController.cpp:158`) — 레이저 선개방으로 점프 경로 선단이 마킹될 수 있으나, 위 덤프 증거상 주원인은 아님.

### 3.2 [확정 원인 B-2] 제로 길이 LINE 스팸 — DXF 중복 정점 + 필터 부재 (원본 파싱으로 확정)

원본 DXF 파싱 결과, **엔티티당 970~1,936개의 정점이 직전 정점과 0.5µm 이내**다(총 약 2만 개 — 전체 정점 약 4.4만 개의 절반). 이것이 커맨드 45,824개 부풀림과 `LINE SX1.755 SY0.693 X1.755 Y0.693` 스팸의 직접 출처다.

덤프에 `LINE SX1.755 SY0.693 X1.755 Y0.693`(시작=끝, 길이 0) 이 **수백 개 연속**으로 존재한다. `runContiguousLines()`(`ScannerGenerator.ts:1032-1061`)에는 최소 길이/중복점 필터가 없다. 영향:

- 갈보가 한 점에 체류하며 레이저 발진 → **번(burn) 점** (사진의 진한 점 얼룩).
- 명령 수 부풀림(45,824개) → 버퍼 분할(이슈 G) 빈발 → flush 대기 증가.
- 각 LINE마다 `MovetTo` 12바이트 + 16바이트를 낭비.

### 3.3 [진단 필요 B-3] 리사이즈가 가공에 반영되지 않은 경로

`SinoGalvoProcessPanel.tsx:148-150`에 따라 커맨드는 **Process Start마다 캔버스 객체로부터 재생성**된다. 그런데도 원본 크기로 가공됐다면 두 갈래뿐이다:

| 가설 | 판별법 |
|---|---|
| (a) 생성기가 그룹/선택 scale 변환을 좌표에 미적용 (fabric group transform 미반영) | 리사이즈 직후 Process Start → **View Commands에서 좌표 범위 확인**. 여전히 ±6/±11이면 (a) 확정 |
| (b) IPC(`cmd.scanner.generate`) 대용량(45,824개) 전송 실패로 네이티브가 이전 `m_commands` 유지 | 좌표 범위가 축소돼 있는데도 원본 크기로 가공되면 (b). `Commands Loaded: N` 로그(`SinoGalvoController.cpp:198`)와 프론트 개수 대조 |

단, S3 당시에는 A-3(옛 Run 잔존 + 벡터 무락 교체)만으로도 증상이 전부 설명되므로, A-1/A-3 수정 후 재현 시험으로 B-3을 판별한다.

---

## 4. 전문가 C — 캘리브레이션/광학 관점 (S4)

### 4.1 증상의 성격 규정

"중심에서 멀수록 오버레이-가공 오차가 커진다" = **순수 스케일(배율) 오차**다. (오프셋이면 전체가 같은 양으로 밀리고, 회전이면 접선 방향으로 어긋난다. 스크린샷도 가공 패턴이 오버레이보다 균일하게 큼을 보여준다.) **캘리브레이션 문제가 맞을 개연성이 높다** — 단, "어느 캘리브레이션인가"를 갈라야 한다.

### 4.2 스케일이 개입하는 3계통

| 계통 | 관련 값/코드 | 오차 시 증상 |
|---|---|---|
| ① 갈보 필드 보정 | `GalvoConfig.json`의 `hRatio/vRatio/workSize` → `CorrectionSet`(`SinoGalvoController.cpp:136-148`), `PARAMETER.WorkSize`(`:153`) | **실제 마킹 크기 자체가 명령 mm와 다름** (버니어 실측으로 검출) |
| ② 카메라 스케일 | 카메라 캘리브레이션의 pxPerMm | 마킹은 정확하나 **화면 오버레이/카메라 영상 배율이 틀림** |
| ③ 왜곡 보정 | barrel/trapezoid/parallelogram 계수 | 주변부 비선형 왜곡(스케일과 달리 방향별 비대칭) |

최근 캘리브레이션을 재수행했다면, **①과 ②가 서로 다른 기준으로 갱신되어 상대 배율이 어긋났을 가능성**이 가장 크다 (예: 카메라 캘리브레이션만 다시 해서 오버레이 기준이 바뀌었는데 hRatio/vRatio는 이전 값).

### 4.3 판별 시험 (10분, 이분법)

1. 10.000mm 정사각형 1개를 그려 가공.
2. 가공물 실측(버니어/도구현미경):
   - **실측 ≠ 10mm** → ① 갈보 스케일 문제. `hRatio/vRatio`(또는 workSize)를 `10/실측` 비율로 재산출.
   - **실측 = 10mm인데 화면 오버레이와 불일치** → ② 카메라 캘리브레이션/카메라-스캐너 매핑 문제. 카메라 캘리브레이션 재수행 또는 pxPerMm 검증.
3. X/Y 실측값이 서로 다르면 h/v 개별 보정, 변끼리 평행이 아니면 ③ 왜곡 계수 점검.

참고: 현재 Z 설정 36.621 vs 실좌표 36.520(0.101mm 차이)은 스팟 크기(선폭)에만 영향을 주고 배율 오차의 주원인은 아니다. 다만 선폭이 굵어지면 시각적으로 "커 보이는" 효과가 있으므로 시험 시 Z를 일치시킨다.

---

## 5. 수정 계획

### P1 — Stop 신뢰성 (안전 이슈, 최우선) — `SinoGalvoController.cpp`

| # | 수정 | 위치 |
|---|---|---|
| P1-1 | `CheckMarkingState()`에서 `m_stopFlag = false` 소거 **제거** (Stop 감지 시 Cancel + break만). 소거는 `Run()` 말단(`:664`) **한 곳**으로 일원화 | `:742`, `:755` |
| P1-2 | `Stop()`에서 `ReturnToCenterPoint()` 호출 제거 — Cancel만 수행 | `:786` |
| P1-3 | **재진입 가드**: `std::atomic<bool> m_isRunning` 추가. `Run()` 진입 시 이미 true면 즉시 반환+경고 로그, 종료 시(스코프 가드) false. `LoadCommands()`는 `m_isRunning`이면 거부(에러 응답) 또는 정지 후 반영 | `Run()` 진입부, `LoadCommands()` |
| P1-4 | `m_commands` 접근 뮤텍스(또는 P1-3 거부 정책으로 갈음) | `LoadCommands`/`Run` |
| P1-5 | (UI) status가 `running`인 동안 Process Start 버튼 비활성 + Stop 버튼만 노출 | `ProcessDashboard.tsx` |

- Doxygen: P1-1/P1-3에 `[Design Pattern: Guarded Suspension]`(정지 요청의 단일 소비 지점), 재진입 가드에 `[Design Pattern: Balking]` 명기.
- 검증: 대형 DXF 가공 중 Stop → **1초 이내 물리 정지 + status idle** 확인, 직후 Process Start 재시작 정상.

### P2 — 커맨드 품질 (유령 직선/스팸) — `Portal/src`

| # | 수정 | 위치 |
|---|---|---|
| P2-1 | `runContiguousLines()`에 ε(예: 1µm) 미만 세그먼트 스킵 + 연속 중복점 병합 | `ScannerGenerator.ts:1047-1056` |
| P2-2 | dxfImport의 폐합 판정 검증: POLYLINE/LWPOLYLINE `70` 플래그 closed 비트가 설정된 엔티티만 `path.closed=true`. 열린 폴리라인 auto-close 금지 | `dxfImport.ts` |
| P2-3 | 문제 DXF로 재현: View Commands의 장직선(예: `SX-2.150 SY1.756 → X2.850`)이 어느 엔티티/분기(폐합 chord vs 해치 연결선 vs 경계선)에서 나오는지 역추적 후 해당 분기 수정 | `ScannerGenerator.ts:934-953, 996-1029` |
| P2-4 | B-3 판별: 리사이즈→Start 후 View Commands 좌표 범위 로그. (a)면 그룹 변환(calcTransformMatrix) 적용 수정, (b)면 `cmd.scanner.generate` 응답 검증 + `Commands Loaded` 개수 대조·불일치 시 Start 중단 | `SinoGalvoProcessPanel.tsx`, `PortalRouterHandler.cpp:1732` |

- 검증: 동일 DXF 재생성 시 명령 수 감소(제로길이 제거분) + 유령 직선 소멸(View Commands 오버레이 및 실가공), 리사이즈 반영 확인.

### P3 — 스케일 캘리브레이션 진단·보정 (S4)

1. §4.3 판별 시험 수행(10mm 정사각형, Z 일치).
2. ① 판정 시: `GalvoConfig.json` `hRatio/vRatio` 재산출(`10/실측`), 필요 시 workSize 재확인 → 재마킹으로 수렴 확인(2회 반복).
3. ② 판정 시: 카메라 캘리브레이션 재수행, 오버레이 pxPerMm 산출 경로 검증.
4. 결과를 `docs/checkpoints/feature_Scanner.md`에 기록(캘리브레이션 이력·기준값 명시)하여 이후 "어느 쪽을 다시 했는지" 추적 가능하게 함.

### P4 — 통합 검증 시나리오

| 시나리오 | 합격 기준 |
|---|---|
| 대형 DXF 가공 중 Stop | 1초 이내 정지, 재시작 정상, 잔여 가공 없음 |
| 가공 중 Process Start 연타 | 두 번째 요청 거부(토스트), 중첩 가공 없음 |
| 리사이즈 → 재가공 | 가공 크기 = 캔버스 크기, View Commands 좌표 범위 일치 |
| 문제 DXF 전체 가공 | 도면에 없는 직선/번 점 없음 |
| 10mm 정사각형 | 실측 10.00±0.02mm, 오버레이와 전역 일치(주변부 포함) |

### 구현 현황 (2026-07-22 승인 후 1차 구현)

| 항목 | 상태 | 위치 |
|---|---|---|
| P1-1 `CheckMarkingState` 플래그 소거 제거 (소거는 Run 진입/말단으로 일원화) | ✅ 적용 | `SinoGalvoController.cpp` |
| P1-2 `Stop()` ReturnToCenterPoint 제거 | ✅ 적용 | `SinoGalvoController.cpp` |
| P1-3 `Run()` 재진입 가드(`m_isRunning`, Balking+RAII) + `LoadCommands`/`MoveToCenter` 실행 중 거부 + `IScannerController::IsRunning()` | ✅ 적용 | `SinoGalvoController.h/.cpp`, `IScannerController.h` |
| P1-3 라우터 busy 선거부 (`HandleScannerGenerate`/`HandleScannerRun`) | ✅ 적용 | `PortalRouterHandler.cpp` |
| P1-5 UI: Stop 클릭 시 선점적 idle 전환 제거(중첩 가공 입구 차단), Stopping… 표시, idle은 네이티브 브로드캐스트로만 | ✅ 적용 | `ProcessDashboard.tsx`, `ProcessPanel.tsx` |
| P2-1 `runContiguousLines` 1µm 미만 세그먼트 병합 필터 | ✅ 적용 | `ScannerGenerator.ts` |
| P2-2 폐합 판정 | ✅ 검증 완료 — 자동 폐합 없음(§3.1), 코드 수정 불필요 | — |
| P2-3 유령 직선 역추적 | ✅ 원인 확정 — DXF 내 실존(§3.1). 레이어 선택 임포트는 후속 | — |
| P2-4 리사이즈 미반영 판별 로그 | ⏳ 미적용 — P1 수정 후 재현 시험으로 판별 예정 | — |
| 빌드 | ✅ vite build + msbuild Release x64 성공 (Bin\LASERnGRAPN.exe 갱신) | — |

### 적용 순서와 의존성

```
P1 (Stop/재진입 — C++ 재빌드 필요, LNK1104 주의: exe 종료 후 빌드)
 └→ P2 (P1 후 재현 시험으로 B-3 판별 → 해당 분기 수정, vite build → msbuild 순)
     └→ P3 (기하 버그 제거 후에 캘리브레이션 판별 — 유령선/중첩이 남아 있으면 실측이 오염됨)
         └→ P4 통합 검증
```

**P3를 P2보다 뒤에 두는 이유**: 현재 가공물에는 S1~S3 버그로 인한 잡선·중첩이 섞여 있어, 이 상태에서 캘리브레이션을 만지면 오염된 실측으로 보정값을 틀리게 잡을 위험이 있다. 캘리브레이션은 "깨끗한 단일 도형 가공"이 가능해진 뒤 판별·보정한다.
