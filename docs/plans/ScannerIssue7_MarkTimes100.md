# Scanner 이상 증상 7차 — Mark Times 100회 설정 시 Command Generation Failed (2026-07-23)

> 3인 전문가 관점(아키텍처/데이터 흐름 · 프론트엔드/IPC · 드라이버/하드웨어) 협의 분석과 수정 계획서.
> 선행: `docs/plans/ScannerIssue6_StopScale.md`(P1 Stop 신뢰성·P2-1 필터 적용 완료 상태에서 발생).

---

## 1. 증상

- DXF(단일 색상 레이어, 1패스 약 45,824 명령) + **Mark Times = 100** 설정 후 Process Start.
- 약 28초간 "STEP 1: GENERATING COMMANDS 1%"에서 정체 → `Process Sequence Interrupted: Command Generation Failed` (SYSTEM CONSOLE 19:03:33 ERROR).
- View Commands 버튼은 **4,582,400개**(= 45,824 × 100)를 표시 — 생성 자체는 완료됐고 그 다음 단계에서 실패했음을 시사.

## 2. 원인 분석 (3인 협의 결론)

### 2.1 [전문가 A — 아키텍처] 근본 원인: "반복 횟수"를 **데이터 복제**로 구현

[ScannerGenerator.ts:252-271](../../Portal/src/services/ScannerGenerator.ts#L252-L271)의 `generate()`는 색상 그룹마다
`for (let pass = 0; pass < group.markTimes; pass++) { ... generatePass(...) }` 구조로 **전체 기하 명령을
markTimes번 물리적으로 복제**해 하나의 배열에 쌓는다.

- 45,824 × 100 = **4,582,400개의 JS 객체** (객체당 수백 바이트 → 힙 수백 MB).
- 반복 횟수는 실행 시간이 선형으로 늘어날 뿐인 **실행 파라미터**인데, 메모리·전송량까지 선형으로
  키우는 데이터로 구현된 것이 설계 결함이다. Mark Times를 1000으로 넣으면 4,600만 개가 된다.

### 2.2 [전문가 B — 프론트/IPC] 직접 실패 지점: 단일 JSON 직렬화 한계

실패 시퀀스 ([SinoGalvoProcessPanel.tsx:120-145](../../Portal/src/ui/shell/SinoGalvoProcessPanel.tsx#L120-L145)):

1. `scannerGenerator.generate()` — 4.58M 배열 생성 성공 (수십 초, 진행률 1% 정체 = 대부분 시간이 복제 루프).
2. `setCommands(cmds)` — zustand 상태 반영 성공 (View Commands 4582400 표시의 근거).
3. `hwFacade.generateScannerCommands(cmds)` → [TransportCEF.ts:14](../../Portal/src/core/ipc/TransportCEF.ts#L14)
   `JSON.stringify({ channel, payload })` — **명령당 약 100~120자 × 4.58M ≈ 450~550MB 문자열**.
   V8 최대 문자열 길이(약 512MB)를 초과하면 `RangeError: Invalid string length`, 그 이하라도
   cefQuery 메시지 크기/메모리 한계로 실패 → `catch` → **"Command Generation Failed"** 토스트/로그.
4. (도달 못함) 네이티브 파싱도 4.58M CefDictionary + `std::vector<ScannerCommand>`(~620MB)로 위험.

부가 문제: `handleGenerate`의 사전 경고 임계값(500,000)은 **경고만 하고 진행**해 실패가 예정된
작업을 그대로 시작한다. 실패 메시지도 원인(전송 한계)을 알려주지 않는다.

### 2.3 [전문가 C — 드라이버] 반복은 드라이버가 수행하는 것이 정합적

`SinoGalvoController::Run()`은 이미 청크 단위 (BufStart → 큐잉 → SchLaserOut → StartMarking →
CheckMarkingState) 사이클과 Stop 게이트(6차 P1), 완료-체크포인트 진행률(안 A)을 갖추고 있다.
같은 명령 블록을 N번 실행하는 것은 이 구조에 자연스럽게 얹힌다. 반면 4.58M 명령을 받는 것은
파싱/메모리/버퍼 분할 횟수(이슈 G flush ~45회/패스 → 4,500회) 모두에서 이득이 없다.
6차에 정리한 Pass 경계 규약(반복 사이 DELAY로 flush 강제, `ReturnToCenterPoint` 종점, bit0 완료
판정)도 드라이버 반복 루프에서 그대로 재사용할 수 있다.

### 2.4 요약

| 계층 | 문제 |
|---|---|
| 설계 | Mark Times를 데이터 복제로 구현 → 명령 수 = 기하 × 반복 |
| 프론트 | 4.58M 배열 생성(수십 초) + zustand/뷰어 부하 |
| IPC | 단일 JSON.stringify ≈ 500MB → V8 문자열 한계/CEF 한계에서 실패 (**직접 실패 지점**) |
| 가드 | 50만 개 초과 시에도 경고 후 진행, 실패 메시지 불명확 |

---

## 3. 해결 방안 비교 (협의 결과)

| 안 | 내용 | 장점 | 단점 | 판정 |
|---|---|---|---|---|
| **안 1 (채택)** | **REPEAT 블록 명령 도입** — 프론트는 그룹당 1패스만 생성하고 `REPEAT_BEGIN(count)` / `REPEAT_END` 마커를 감싼다. 드라이버가 블록을 count회 실행 | 명령 수 = 1패스 분량(45,824)로 고정. 색상 그룹별 상이한 Mark Times 지원. Stop/진행률/Pass 경계 규약 재사용 | C++ Run 루프 수정 필요(재빌드) | ✅ |
| 안 2 | `cmd.scanner.run`에 전역 markTimes 파라미터, Run 전체를 N회 반복 | 구현 최소 | 색상 그룹별 Mark Times 불가(현 UI가 색상 프리셋 체계), 그룹 간 Z_MOVE/SET_PARAM 재실행 낭비 | ❌ |
| 안 3 | IPC 청크 분할 전송(10만 개 단위 append) | 전송 한계만 회피 | 4.58M 생성/파싱/메모리 문제 그대로. 생성 수십 초 정체 유지 | ❌ (근본 해결 아님) |

## 4. 수정 계획 (안 1)

### P1 — 프로토콜: REPEAT 블록

| # | 수정 | 위치 |
|---|---|---|
| P1-1 | `ScannerCommandType`에 `REPEAT_BEGIN`(= count 보유) / `REPEAT_END` 추가 (TS + C++ enum + 라우터 파싱) | `ScannerGenerator.ts`, `IScannerController.h`, `PortalRouterHandler.cpp` |
| P1-2 | `generate()`의 pass 루프 제거: 그룹당 `REPEAT_BEGIN{count: group.markTimes}` + 1패스 + `REPEAT_END` 방출. markTimes==1이면 마커 생략. 반복 사이 경계 DELAY(6차 규약)는 드라이버 반복 루프가 담당하므로 프론트에서는 그룹 내 1회만 | `ScannerGenerator.ts:252-271` |
| P1-3 | COMMENT는 `Pass x N` 형식으로 1개만 표시. View Commands 카운트 = 실제 전송 개수(1패스) | `ScannerGenerator.ts`, `SinoGalvoProcessPanel.tsx` |

### P2 — 드라이버: 블록 반복 실행 (`SinoGalvoController::Run`)

| # | 수정 | 내용 |
|---|---|---|
| P2-1 | `REPEAT_BEGIN`: 시작 인덱스·잔여 횟수 기록(중첩 불필요, 단일 레벨). `REPEAT_END`: 현재 버퍼 flush(SchLaserOut→StartMarking→CheckMarkingState, hasDrawn일 때) 후 잔여>1이면 cmdIndex를 시작 인덱스로 되돌리고 잔여-- | [Design Pattern: Interpreter — 명령 스트림 내 제어 마커 해석] |
| P2-2 | 반복 루프마다 `m_stopFlag` 게이트 — Stop 시 잔여 반복 즉시 포기 (6차 P1 소거 일원화 규약 유지) | |
| P2-3 | 진행률: 물리 총량 = Σ(블록 명령 수 × count). emitProgress 분모를 이 값으로, 분자는 완료 반복×블록 크기 + cmdIndex로 산출. 회차 브로드캐스트 `window.__onScannerPass(cur,total)` 추가 → UI "MARK TIMES n/100" 실측 표시 | `useProcessMonitor`/`ProcessDashboard` 연동 |
| P2-4 | Shape Delay > 0이면 반복 사이에 Sleep(기존 DELAY 의미 유지) | |

### P3 — 가드/UX (재발 방어)

| # | 수정 | 내용 |
|---|---|---|
| P3-1 | `handleGenerate` 사전 추정치가 임계(예: 50만) 초과 시 **경고 후 진행 → 차단**으로 변경(토스트+중단). REPEAT 도입 후에는 기하 자체가 거대한 경우만 걸린다 | `SinoGalvoProcessPanel.tsx` |
| P3-2 | `TransportCEF.send`에서 stringify를 try/catch로 감싸 "payload too large (N commands)" 등 **원인이 드러나는 에러 메시지**로 재던짐 | `TransportCEF.ts` |

### P4 — 검증

| 시나리오 | 합격 기준 |
|---|---|
| 문제 DXF + Mark Times 100 | 생성 즉시 완료(1~2초), View Commands ≈ 45,800(1패스), 전송 성공, 가공 100회 반복 |
| 소형 도형 + Mark Times 3 | 물리적으로 3회 가공(레이저음/번 확인), MARK TIMES 표시 1/3→3/3 실측 갱신 |
| Mark Times 100 가공 중 Stop | 1초 내 정지, 잔여 반복 미실행 (6차 P1과 통합 검증) |
| 색상 2그룹(각 markTimes 2/5) | 그룹 A 2회 → 그룹 B 5회 순서로 실행 |
| Mark Times 1 | 마커 미방출, 기존과 동일 동작(회귀 없음) |

### 적용 순서

```
P1(프로토콜) + P2(드라이버) 동시 구현 → vite build → msbuild (LNK1104 주의: exe 종료 후)
 └→ P3 가드 → P4 검증
```

### 구현 현황 (2026-07-23 승인 후 구현 완료)

| 항목 | 상태 | 위치 |
|---|---|---|
| P1-1 REPEAT_BEGIN/END 타입 (TS/C++/라우터 파싱, `repeatCount` 필드) | ✅ | `ScannerGenerator.ts`, `IScannerController.h`(enum 11/12), `PortalRouterHandler.cpp` |
| P1-2 generate() pass 루프 제거 → 그룹당 1패스 + REPEAT 마커, 반복 사이 Shape Delay는 `REPEAT_END.delayTime`으로 전달 | ✅ | `ScannerGenerator.ts` |
| P1-3 COMMENT `Pass xN`, View Commands = 1패스 개수 | ✅ | `ScannerGenerator.ts` |
| P2-1 SinoGalvo Run(): REPEAT_BEGIN(상태 기록, flush 없음) / REPEAT_END(flush→잔여 시 되감기), [Design Pattern: Interpreter] | ✅ | `SinoGalvoController.cpp` |
| P2-2 반복 사이 Stop 게이트(잔여 반복 즉시 포기) | ✅ | 〃 |
| P2-3 진행률: 물리 총량(블록×횟수) 기준 단조 증가(`physicalTotal`/`physicalDoneOffset`). **회차 표시는 별도 브로드캐스트 대신 진행률 분율로 산출**(패스 길이가 균등하므로 ProcessDashboard의 기존 `currentMarkPass` 계산이 정확해짐) + SYSTEM CONSOLE에 "REPEAT pass k/N" 로그 | ✅ (계획 일부 변경) | 〃 |
| P2-4 반복 사이 Shape Delay Sleep | ✅ | 〃 |
| (추가) Scanlab Run()에도 동일 REPEAT 처리(미처리 시 반복이 1회로 퇴화하는 회귀 방지) | ✅ | `ScanlabController.cpp` |
| P3-1 추정 50만 초과 시 경고→**차단**(에러 토스트+중단) | ✅ | `SinoGalvoProcessPanel.tsx` |
| P3-2 TransportCEF stringify 실패를 "IPC payload too large(채널·개수)"로 변환 + handleGenerate가 실패 원인을 토스트/로그에 노출 | ✅ | `TransportCEF.ts`, `SinoGalvoProcessPanel.tsx` |
| 빌드 | ✅ vite build + msbuild Release x64 성공 (`Bin\LASERnGRAPN.exe` 갱신, 프론트/exe 동시 배포 충족) | — |

P4 실기 검증(문제 DXF+100회, 소형 3회, Stop, 색상 2그룹, Mark Times 1 회귀)은 장비에서 수행 대기.

**주의**: C++ `ScannerCommandType`에 값을 추가하므로 프론트/네이티브를 **반드시 같이 배포**해야
한다(구 exe + 신 프론트 조합이면 REPEAT 마커가 무시되어 1회만 가공됨).
