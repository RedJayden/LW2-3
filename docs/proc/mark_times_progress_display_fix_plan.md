# MARK TIMES 회차 표시(n/10) 미갱신 버그 — 3인 전문가 원인 분석 및 수정 계획서

- **작성일**: 2026-07-23
- **증상**: DXF 로드 → Current Layer의 Mark Times = 10 설정 → Process Start. 가공 내내 STATUS 패널의
  `MARK TIMES`가 **1 / 10에 고정**되어 있다가, 가공이 끝나는 순간에만 **10 / 10**으로 점프.
  각 회차가 끝날 때마다 2/10, 3/10 … 으로 순차 갱신되어야 한다. (진행바 % 역시 동일하게 0% 고정 → 완료 시 100% 점프)
- **장비 프로필**: `Bin\Config\machine.ini` → `SCANNER=SinoGalvo` (CSG9210 / JhcLib) — 즉 실제 마운트 패널은
  `SinoGalvoProcessPanel.tsx`.
- **참조 체크포인트**: `docs/checkpoints/feature_Scanner.md` §6.5(회차 표시 도입), §6.8, §6.11(안 A: 네이티브
  체크포인트 진행률 단일 소스화), §6.13(전역 생명주기 교훈), 7차 Mark Times(REPEAT 블록, 2026-07-23)

---

## 1. 3인 전문가 원인 분석

### 전문가 A — Frontend/React (상태 흐름·컴포넌트 생명주기)

**결론: 근본 원인 확정. `window.__onScannerProgress` 핸들러가 SinoGalvo 패널 경로에는 아무 데도 등록되어 있지 않다.**

1. 회차 표시는 `ProcessDashboard.tsx:39-40`이 전역 진행률에서 **파생 계산**한다:
   ```ts
   const totalMarkTimes = ...preset.markTimes;                                  // = 10
   const currentMarkPass = Math.min(total, Math.floor((localProgress / 100) * total) + 1);
   ```
   즉 `processStates.scanner.progress`가 안 움직이면 회차도 영원히 `floor(0)+1 = 1`이다.

2. 스캐너 진행률의 **유일한 공급원**은 네이티브 브로드캐스트다. §6.11 "안 A" 이후
   `useProcessMonitor.ts:163-166`은 스캐너에 대해 타이머 추정 진행률을 의도적으로 쓰지 않는다
   (`progress: kind === 'gcode' ? nextProgress : status.progress`). 따라서 네이티브 콜백이 유실되면
   진행률을 채워줄 백업 경로가 **전혀 없다**.

3. 그런데 `window.__onScannerProgress` 핸들러 등록처를 전수 조사한 결과:
   | 파일 | 등록 여부 | 실제 마운트 여부 |
   |---|---|---|
   | `components/ScannerPanel.tsx:240` | 등록함 | ❌ **죽은 코드** (§6.5에서 미사용 확정) |
   | `ui/shell/ScanlabProcessPanel.tsx:218` | 등록함 | ❌ Scanlab 장비에서만 마운트 |
   | `ui/shell/SinoGalvoProcessPanel.tsx` | **등록 없음** | ✅ 본 장비에서 마운트되는 패널 |

   `RightPanel.tsx:397-404`가 `hardware.scanner === 'Scanlab'`일 때만 ScanlabProcessPanel을 마운트하므로,
   본 장비(SinoGalvo)에서는 **핸들러가 window에 존재한 적이 없다**.

4. 네이티브 송신부는 `window.__onScannerProgress && window.__onScannerProgress(pct)` 형태라
   핸들러 부재 시 **오류 없이 조용히 무시**된다(silent no-op). 그래서 로그에도 아무 흔적이 없었다.

5. 종료 시 10/10이 되는 이유: `scanner/status: 'idle'` 수신 시 `useProcessMonitor.ts:66` 및
   `SinoGalvoProcessPanel.tsx:227`이 `progress: 100`을 강제 대입 → `floor(100/100×10)+1 = 11 → clamp 10`.
   **증상(1/10 고정 → 완료 시 10/10 점프)과 정확히 일치.**

**부가 지적 (설계 결함)**: 애초에 window 전역 콜백을 **특정 탭에서만 마운트되는 패널**이 등록/해제하는
구조 자체가 §6.13에서 이미 교훈으로 남긴 안티패턴이다("전역 신호 소비자는 전역 생명주기에 둘 것").
Scanlab 장비에서조차 가공 중 Motion 탭으로 전환하면 cleanup의 `delete window.__onScannerProgress`가
실행되어 진행률이 유실된다. 수정은 패널에 복붙 추가가 아니라 **전역 이관**이어야 한다.

### 전문가 B — Native C++/드라이버 (SinoGalvoController)

**결론: 백엔드 송신 신호는 건강하다. 회차별 체크포인트는 이미 정확한 시점·정확한 값으로 방송되고 있다.**

1. `SinoGalvoController.cpp:338-347`의 `emitProgress(done, total)`는 물리 완료 커맨드 수 기준
   단조 증가 진행률을 `BroadcastJS`로 방송한다.
2. 7차 Mark Times(REPEAT 블록) 구조에서 방송 시점을 검증:
   - `REPEAT_END`(`:534-568`): 각 회차 flush(`StartMarking`+`CheckMarkingState` 물리 완료 대기) 직후
     `emitProgress(physicalDoneOffset + cmdIndex, physicalTotal)` 호출(`:548`). 되감기 시
     `physicalDoneOffset += cmdIndex - repeatStartIndex`(`:560`)로 단조성 보정.
   - `physicalTotal`(`:365-377`)은 REPEAT 블록 내부 명령을 `repeatCount`배로 계상 → 10회 반복이면
     회차 경계마다 정확히 ≈ n×10% 가 방송된다. **UI의 `floor(p/100×10)+1` 파생식과 정합.**
   - 대형 DXF(이번 케이스 30,534 커맨드)는 버퍼 한계 분할 flush(`:711-734`)에서도 중간 체크포인트가
     방송되므로 회차 내 진행바도 세분화되어 움직인다.
3. 진단 로그 `"REPEAT pass n/N"`(`:557`)이 이미 회차마다 출력되고 있으므로, 실기 DebugView/SYSTEM
   CONSOLE에서 백엔드가 회차를 정상 순회했음은 교차 확인 가능하다.
4. **따라서 C++ 수정은 필수 아님.** 다만 선택 개선(Stage 2)으로, 파생 계산 대신 **정확한 회차 값을
   직접 방송**(`__onScannerMarkPass(cur, total)`)하면 색상 그룹별 Mark Times가 서로 다른 복합 레시피에서도
   회차 표시가 정확해진다(현 파생식은 CurrentLayer 프리셋 하나의 markTimes만 분모로 쓰는 근사).

### 전문가 C — 아키텍처/QA (신호 경로·회귀 위험)

**결론: 신호 사슬 "생산(C++) → 운반(window 콜백→bus) → 소비(store→UI)" 중 운반 계층이 장비 프로필에
따라 결손되는 구조적 문제. 등록 지점을 `HardwareFacade`(SSOT)로 승격해야 한다.**

1. 유사 콜백 `__onScannerStatus`는 이미 올바른 패턴으로 되어 있다: `HardwareFacade.ts:288-290`이
   앱 초기화 시 1회 등록 → `bus.emit("scanner/status")` → 전역 상주 훅 `useProcessMonitor`가 소비.
   그래서 상태(running/idle)는 어느 탭에서든 안 끊긴다. **진행률만 이 패턴에서 빠져 있었다.**
2. 회귀 위험 평가:
   - Stage 1은 TS-only(vite build + `Bin\web` robocopy)로 C++ 재빌드 불필요 → 배포 위험 낮음.
   - `ScanlabProcessPanel`의 기존 등록을 제거해도 전역 등록이 동일 store 필드를 갱신하므로 동작 등가.
     이중 등록을 남기면 패널 cleanup의 `delete`가 전역 등록을 지워버리므로 **반드시 제거**해야 함.
   - 진행률 대입은 백엔드가 단조 방송하지만, 수비적으로 `Math.max(cur, p)` 가드를 둔다
     (기존 gcode 경로 `useProcessMonitor.ts:24`와 동일 관례).
3. 테스트 매트릭스는 §4 참조. 특히 "가공 중 탭 전환" 시나리오는 §6.13 버그의 재판이므로 필수.

### 3인 합의 — 근본 원인 요약

> **네이티브는 회차마다 진행률을 정확히 방송하고 있으나, SinoGalvo 장비에서 마운트되는 프런트엔드
> 어디에도 `window.__onScannerProgress` 수신 핸들러가 등록되어 있지 않아 방송이 전량 유실된다.**
> 그 결과 `processStates.scanner.progress`가 0에 고정되고, 여기서 파생되는 MARK TIMES 회차 표시가
> 1/10에 머문다. 완료 시 `idle` 이벤트가 progress=100을 강제 대입하면서 10/10으로 점프한다.
> (핸들러가 죽은 코드 `ScannerPanel.tsx`와 Scanlab 전용 패널에만 존재 — §6.5 "죽은 코드 주의"와
> §6.13 "전역 신호는 전역 생명주기에" 교훈이 결합된 재발 사례)

---

## 2. 수정 계획 — Stage 1 (P0, 필수): 진행률 수신 경로 전역화

**원칙**: `__onScannerStatus`와 동일 패턴으로 통일. 패널이 아닌 전역 계층에서 등록/소비.

### 2.1 `Portal/src/services/HardwareFacade.ts`
- `declare global` Window 인터페이스에 `__onScannerProgress?: (percent: number) => void;` 추가 (`:33` 부근).
- `__onScannerStatus` 등록(`:288`) 직후에 등록 추가:
  ```ts
  // Register global callback for Scanner marking progress (native checkpoint)
  window.__onScannerProgress = (percent: number) => {
    bus.emit("scanner/progress", percent);
  };
  ```
- `bus` 이벤트 타입 맵에 `"scanner/progress": number` 추가(이벤트 타입이 명시 선언식일 경우).

### 2.2 `Portal/src/hooks/useProcessMonitor.ts`
- 기존 `offScanner` 아래에 소비자 추가:
  ```ts
  const offScannerProgress = bus.on("scanner/progress", (p: number) => {
    const cur = useAppStore.getState().processStates['scanner'].progress;
    // Native checkpoints are monotonic; guard defensively anyway (same convention as gcode path)
    updateStatus('scanner', { progress: Math.max(cur, Math.min(100, p)) });
  });
  ```
  cleanup에 `offScannerProgress()` 추가.
- 이 훅은 AppShell 상주이므로 탭 전환/패널 언마운트와 무관하게 수신이 유지된다(§6.13 교훈 이행).

### 2.3 `Portal/src/ui/shell/ScanlabProcessPanel.tsx`
- `:218-220`의 `window.__onScannerProgress = ...` 등록과 cleanup `:224`의
  `delete window.__onScannerProgress` **제거** (전역 등록을 지워버리는 부작용 차단).
  스캐너 상태 구독(`bus.on("scanner/status")`) 등 나머지는 유지.

### 2.4 비변경(명시)
- `SinoGalvoProcessPanel.tsx`: 패널 자체에는 등록을 추가하지 않는다(안티패턴 재생산 금지).
- `components/ScannerPanel.tsx`: 죽은 코드 — 비파괴 원칙에 따라 이번에도 미수정(§6.5 주의문 유지).
- C++: Stage 1에서는 무변경 — **재빌드 불필요, `vite build` 후 `Bin\web` robocopy만으로 반영**.

---

## 3. 수정 계획 — Stage 2 (P1, 선택): 정확한 회차 직접 방송

파생식(진행률→회차 환산)은 "색상 그룹이 1개이고 그 그룹의 markTimes가 곧 전체"일 때 정확하다.
색상 그룹별 Mark Times가 서로 다른 복합 레시피까지 정확히 하려면 회차 값을 직접 전달한다.

1. **C++ (`SinoGalvoController.cpp`)**: `REPEAT_BEGIN` 처리부(`:518`)와 `REPEAT_END` 되감기 지점(`:557`
   진단 로그 옆)에서 `window.__onScannerMarkPass && window.__onScannerMarkPass(cur, total);` BroadcastJS 추가.
   (주석은 §6.7 규약대로 ASCII 영문로만 작성)
2. **`ScanlabController.cpp`**: 동일 지점(REPEAT 처리부 `:394-`, `:400-`)에 대칭 적용.
3. **TS**: HardwareFacade에 `__onScannerMarkPass` 등록 → `bus.emit("scanner/markpass", {cur,total})` →
   `useProcessMonitor`가 `processStates.scanner.markPass/markTotal`(appStore 필드 신설)에 저장 →
   `ProcessDashboard`는 markPass가 있으면 그것을 우선 표시, 없으면(레거시/타 드라이버) 기존 파생식 fallback.
4. **빌드 주의**: `.vcxproj` 단독 msbuild 금지 — 반드시 `.sln` 경유(feature_Scanner.md §6.14 재확인 사항).

Stage 1만으로 이번 증상(단일 색상 DXF, 10회 반복)은 완전 해결되므로, Stage 2는 실기 검증 후 별도 커밋을 권장.

---

## 4. 검증 계획 (실기 테스트 시나리오)

| # | 시나리오 | 기대 결과 |
|---|---|---|
| T1 | DXF 로드, Mark Times 10, Process Start | 각 회차 완료마다 MARK TIMES 1/10→2/10→…→10/10 순차 증가, 진행바 ≈10%씩 전진 (버퍼 분할 flush 덕분에 회차 내에서도 세분 전진) |
| T2 | T1 도중 Motion 탭 ↔ Scanner Process 탭 전환 | 탭을 오가도 회차/진행률 갱신 지속 (전역 수신 확인 — §6.13 회귀 방지) |
| T3 | T1 도중 Stop | 즉시 정지, 재시작 시 0%/1-회차부터 정상 재개 |
| T4 | Mark Times 1 | MARK TIMES 행 자체가 비표시(기존 조건 유지), 진행바만 전진 |
| T5 | Shape Delay 2초 + Mark Times 3 | 회차 사이 2초 대기 포함, 회차 표시는 flush 완료 시점에 증가 |
| T6 | (Scanlab 장비 회귀) 동일 가공 | 패널 등록 제거 후에도 전역 경로로 진행률/회차 정상 동작 |
| T7 | 가공 완료 | idle 수신 → 100% / 10/10 / Completed — 기존 완료 동작 무변화 |

**교차 확인 수단**: SYSTEM CONSOLE(로고 5회 클릭) 또는 DebugView에서
`[SinoGalvoController] Run: REPEAT pass n/N` 로그와 UI 회차 표시의 동기 여부를 대조.

## 5. 위험도 및 롤백

- Stage 1은 프런트 3파일 수정, 신호 생산부(C++) 무변경 → 위험 낮음. 문제 시 `Bin\web` 이전 빌드로 즉시 롤백.
- 유의: 이중 등록 잔존 금지(§2.3). ScanlabProcessPanel의 cleanup `delete`가 남으면 탭 전환 시 전역
  핸들러가 삭제되어 이번 버그가 Scanlab 쪽에서 재발한다.

---
담당: Claude (AI Coding Assistant) — 3-Expert Root Cause Analysis (Frontend / Native Driver / Architecture-QA)
