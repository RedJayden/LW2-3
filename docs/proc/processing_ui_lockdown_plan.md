# 가공 중 UI 잠금(Lockdown) 및 Move-to-Center 이동 표시 개선 계획서

- 작성일: 2026-07-22
- 대상: Portal(React) — Recipe 페이지 캔버스/우측 패널, C++ 변경 없음
- 요구사항 출처: 사용자 요청 (스크린샷 2매: 가공 완료 상태 / RUNNING 상태)

---

## 1. 요구사항 요약

| # | 요구사항 | 구분 |
|---|---------|------|
| R1 | Process Start 시 상단 Edit 창(객체 속성 편집 바)을 닫고, 가공 중 다시 열리지 않게 | 수정 |
| R2 | 카메라 뷰 우하단 FAB 3종("Move to Scanner Center", "Click-to-Move", "Move to Center")이 가공 중 disable되는지 확인 | 점검+수정 |
| R3 | Motion 탭의 Home all, 축별 호밍 버튼, Jog 패널을 가공 중 disable | 수정 |
| R4 | "Move to Center"(MyLocation) 아이콘: 항상 사이언 채움 → **클릭 후 이동 중에만** 사이언 채움 | 수정 |
| 공통 | 가공 종료(완료/Stop) 시 모든 요소 자동 재활성화 | 기존 구조 활용 |

---

## 2. 현황 분석 (코드 점검 결과)

### 2.1 가공 상태의 단일 소스 (이미 존재 — 그대로 활용)

- `useCanvasStore.isProcessingLocal` / `hideOverlays` (`Portal/src/ui/pages/Recipe/Canvas/useCanvasStore.ts:238~239, 904~905`)
- Set true: Process Start 클릭 시 (`Portal/src/components/ProcessDashboard.tsx:174~178`) 및 processState running/paused 동기화 effect (`ProcessDashboard.tsx:45~57`)
- Set false: 가공 완료(idle 전환, 2초 유예 포함), Stop 버튼, 생성 실패 시(`SinoGalvoProcessPanel.tsx:170~173`, `ScanlabProcessPanel.tsx:150~151`, `ScannerPanel.tsx:147~148`)
- → **재활성화(공통 요구사항)는 이 상태를 구독하는 것만으로 자동 충족**된다. 신규 상태 추가 불필요.

### 2.2 R1 — 상단 Edit 창 (CanvasTopBar)

- 파일: `Portal/src/ui/pages/Recipe/PropertyBar/CanvasTopBar.tsx`
- 렌더 조건: `if (!isRecipePage || !selectedObject) return null;` (line 995)
- 가공 시작 시 `syncObjectLock()`이 `canvas.discardActiveObject()`를 호출 (`RecipeCanvas.tsx:483~494`) → fabric `selection:cleared` → `setSelectedObject(null)` (`useCanvasSetup.ts:77`) 경로로 닫히는 것이 **의도**이나, fabric 이벤트 경유의 간접 경로라 타이밍/이벤트 미발화 시 바가 남는 케이스가 있음.
- **갭**: CanvasTopBar 자체는 `isProcessingLocal`/`hideOverlays`를 전혀 참조하지 않음 → 방어선 없음.

### 2.3 R2 — 카메라 뷰 우하단 FAB 3종 (RecipeCanvas.tsx 1907~1999)

| 버튼 | 위치 | 가공 중 disable | 판정 |
|------|------|----------------|------|
| Move to Scanner Center (CenterFocusStrong) | line 1934~1948 | `disabled={isHoming \|\| isProcessingLocal}` | ✅ 이미 적용 |
| Click-to-Move (TouchApp) | line 1963~1977 | `disabled={isHoming \|\| isProcessingLocal}` + Navigate 모드 강제 해제(line 646~650) | ✅ 이미 적용 |
| **Move to Center (MyLocation)** | line 1981~1996 | **없음** — `color="primary"` 고정(항상 사이언) | ❌ 미적용 |

### 2.4 R3 — Motion 탭 (RightPanel → PositionControlCard / JogControlCard)

- `PositionControlCard.tsx`: Home all(line 117) / 축별 호밍(line 171) 모두 `disabled={isHoming}` — **호밍 중에만 잠김. 가공 잠금 없음.** ❌
- `JogControlCard`: `disabled={deps.homing?.active}` (`RightPanel.tsx:544`) — 동일하게 **가공 잠금 없음.** ❌
  - 단, JogControlCard는 `disabled` prop 하나로 방향키·속도(Slow/Mid/Fast)·JOG/REL/ABS·Save/Reload 전체가 잠기는 구조가 이미 완성돼 있음(내부 `isDisabled` 전파 확인). prop만 넘기면 됨.
- RightPanel은 이미 `useCanvasStore`를 import/구독 중(line 663~665)이므로 상태 추가 구독 비용 최소.

### 2.5 R4 — Move to Center "이동 중" 표시

- `hwFacade.moonsPreset()` → C++ `HandleMoonsGetPresets` (`PortalRouterHandler.cpp:2371~2683`)
- **핵심 제약**: C++는 이동 로직을 `WORK_1([...])` 워커 스레드에 게시한 직후 `cb->Success(MakeOk())`(line 2682)로 **즉시 응답**한다. 따라서 JS의 `await moonsPreset()`은 이동 완료 시점이 아니라 **명령 접수 시점**에 resolve됨.
- → "이동 중" 판정은 프론트에서 `useAppStore.positions`(X/Y/Z, 폴링으로 갱신) **정착(settle) 감시**로 구현해야 한다. C++ 수정 불필요.

---

## 3. 수정 계획

### P1. CanvasTopBar 가공 중 강제 닫기 (R1)

- 파일: `CanvasTopBar.tsx`
- 내용: 스토어에서 `isProcessingLocal`, `hideOverlays`를 구독하고 렌더 가드에 추가.

```tsx
const isProcessingLocal = useCanvasStore(s => s.isProcessingLocal);
const hideOverlays = useCanvasStore(s => s.hideOverlays);
...
// [가공 잠금] 가공 중에는 선택 상태와 무관하게 편집 바를 강제로 닫는다(2차 방어선).
if (!isRecipePage || !selectedObject || isProcessingLocal || hideOverlays) return null;
```

- 기존 `discardActiveObject()` 경로(1차)는 유지 — 선택 자체를 해제해 가공 종료 후 바가 저절로 재출현하지 않게 하는 역할.
- 부수효과: 열려 있던 FillSettingsDialog도 selection 해제 effect(line 230~248)로 함께 닫힘.

### P2. Move to Center FAB disable + 이동 중에만 사이언 (R2 잔여 + R4)

- 파일: `RecipeCanvas.tsx`
- 2-a. **disable**: 다른 두 FAB과 동일 규칙 적용. Tooltip도 disabled 시 사유 문구로 전환하고, disabled Fab에서 Tooltip이 뜨도록 `<span>` 래퍼 추가(기존 두 버튼과 동일 패턴).

```tsx
disabled={isHoming || isProcessingLocal || isMovingToCenter}
```

- 2-b. **이동 중 표시** *(Design Pattern: Observer — 스토어 positions 구독 기반 settle 감시)*:

```tsx
/** @brief Move-to-Center 스테이지 이동 진행 여부(사이언 강조 표시용) */
const [isMovingToCenter, setIsMovingToCenter] = useState(false);

const handleMoveToCenter = async () => {
    ...
    setIsMovingToCenter(true);
    await hwFacade.moonsPreset(preset, false, true); // 접수 시점 resolve (이동완료 아님)
};

/**
 * @brief 이동 중 상태 해제 감시자
 * @details cmd.moons.preset은 접수 즉시 응답하므로(PortalRouterHandler.cpp:2682)
 *          positions(X/Y/Z) 폴링 값이 정착하면 이동 종료로 판정한다.
 *  - 최소 표시 1초(백엔드가 "already at target"으로 스킵해도 짧게 점등 후 소등)
 *  - 300ms 간격 비교, 연속 2회 delta < 0.005mm면 정착
 *  - 하드 타임아웃 30초(C++ 각 구간 5초 워치독 * 다단계 이동 고려)
 */
useEffect(() => {
    if (!isMovingToCenter) return;
    const t0 = Date.now();
    let last = { ...useAppStore.getState().positions };
    let stableCount = 0;
    const timer = setInterval(() => {
        const cur = useAppStore.getState().positions;
        const moved = ['X','Y','Z'].some(a => Math.abs((cur[a]??0) - (last[a]??0)) > 0.005);
        stableCount = moved ? 0 : stableCount + 1;
        last = { ...cur };
        const elapsed = Date.now() - t0;
        if ((elapsed > 1000 && stableCount >= 2) || elapsed > 30000) {
            setIsMovingToCenter(false);
        }
    }, 300);
    return () => clearInterval(timer);
}, [isMovingToCenter]);
```

- 2-c. **스타일**: Click-to-Move 토글과 동일한 시각 언어로 통일.

```tsx
<Fab
    size="medium"
    disabled={isHoming || isProcessingLocal || isMovingToCenter}
    onClick={handleMoveToCenter}
    sx={{
        ...,
        bgcolor: isMovingToCenter ? theme.palette.primary.main : theme.palette.background.paper,
        color:   isMovingToCenter ? '#fff' : theme.palette.text.secondary,
        border:  isMovingToCenter ? 'none' : `1px solid ${theme.palette.divider}`,
    }}
>
```

  - `color="primary"` prop 제거(sx bgcolor와 충돌 방지).
  - 이동 중에는 disabled + 사이언을 동시에 원하므로, disabled 시 MUI 기본 회색이 사이언을 덮지 않도록 `'&.Mui-disabled'`에 조건부 사이언 배경을 함께 지정한다(이동 중일 때만).

### P3. Motion 탭 잠금 (R3)

- 파일: `RightPanel.tsx`, `PositionControlCard.tsx`
- 3-a. RightPanel에서 가공 상태 구독 후 deps로 전달:

```tsx
const isProcessingLocal = useCanvasStore((s) => s.isProcessingLocal);
const hideOverlays = useCanvasStore((s) => s.hideOverlays);
const processingLocked = isProcessingLocal || hideOverlays;
```

  - `SectionDependencies`에 `processingLocked: boolean` 추가.
- 3-b. Jog: `JogControlCard`의 기존 `disabled` prop 재사용(내부 전파 완비) —

```tsx
disabled={deps.homing?.active || deps.processingLocked}   // RightPanel.tsx:544
```

- 3-c. Home all / 축별 호밍: `PositionControlCard`에 명시적 `disabled?: boolean` prop 신설(호밍 중 "Homing..." 스피너 표시 로직과 분리하기 위해 `homing.active`에 합성하지 않음).

```tsx
// PositionControlCard.tsx
export type PositionControlCardProps = {
    ...
    /** @brief 외부 잠금(가공 중 등) — 호밍 진행 표시와 무관하게 버튼만 비활성화 */
    disabled?: boolean;
};
const locked = disabled || isHoming;
// Home all 버튼:  disabled={locked}
// 축별 호밍 버튼: disabled={locked}
```

  - RightPanel 전달: `<PositionControlCard ... disabled={deps.processingLocked} />`
- 참고: Lights/Camera/Laser Shutter 카드는 이번 요구 범위 밖 — 변경하지 않음.

### P4. 재활성화 (공통)

- 신규 코드 없음. P1~P3 모두 `isProcessingLocal`/`hideOverlays` 구독 기반이므로, 기존 해제 경로(가공 완료 idle 전환·Stop·생성 실패 롤백)가 실행되면 자동으로 원복된다.

---

## 4. 변경 파일 목록

| 파일 | 변경 | 항목 |
|------|------|------|
| `Portal/src/ui/pages/Recipe/PropertyBar/CanvasTopBar.tsx` | 렌더 가드 추가 | P1 |
| `Portal/src/ui/pages/Recipe/Canvas/RecipeCanvas.tsx` | MyLocation FAB disable/스타일, settle 감시 effect | P2 |
| `Portal/src/ui/shell/RightPanel.tsx` | 가공 상태 구독, deps 전달, Jog/Position에 disabled 전달 | P3 |
| `Portal/src/ui/components/control/PositionControlCard.tsx` | `disabled` prop 신설 | P3 |

C++ 변경 없음 → `vite build` 후 msbuild(robocopy → Bin\web) 배포만 필요.

---

## 5. 테스트 계획

1. **R1**: 객체 선택(Edit 바 표시) → Process Start → 바 즉시 닫힘 확인, 가공 중 캔버스 클릭으로 재출현 불가 확인. 가공 완료 후 객체 재선택 시 정상 표시.
2. **R2**: 가공 중(RUNNING) FAB 3종 모두 회색 disable + Tooltip 사유 문구 확인. 완료/Stop 후 재활성.
3. **R3**: 가공 중 Motion 탭 진입 → Home all·X/Y/Z 홈 아이콘·Jog 방향키/속도/REL/ABS/Save/Reload 전부 disable. 완료 후 복원. 호밍 중 잠금(기존 동작) 회귀 없음 확인.
4. **R4**:
   - 평상시: MyLocation FAB가 흰 배경(비강조)인지 확인.
   - 클릭 → 스테이지 이동 동안 사이언 채움, 정지 후 1초 내 소등.
   - 이미 센터에 있어 백엔드가 이동을 스킵하는 경우: 약 1.3초 점등 후 소등(무한 점등 없음).
   - 이동 중 재클릭 불가(disabled) 확인.
5. **회귀**: Object 모드(x20/x50)에서도 FAB 동작 동일 확인, Pause 상태(gcode)에서 잠금 유지 확인.

---

## 6. 리스크 및 대응

| 리스크 | 대응 |
|--------|------|
| positions 폴링 주기가 300ms보다 느리면 settle 오판 가능 | 연속 2회 + 최소 1초 조건으로 완화, 30초 하드 타임아웃 |
| disabled + 사이언 동시 표시 시 MUI 기본 disabled 스타일과 충돌 | `&.Mui-disabled` 조건부 오버라이드로 이동 중에만 사이언 유지 |
| discardActiveObject의 fabric 이벤트 미발화 케이스 | P1 렌더 가드가 2차 방어선으로 무조건 닫음 |

---

## 7. 구현 결과 (2026-07-22 완료)

- **P1~P4 전부 계획대로 구현 완료.** P4는 "Move Stage to Scanner Center 클릭 → 스테이지 동작 수행 동안 ON, 완료 시 OFF"로 확정 반영.
- `vite build` 성공, `tsc` 에러 0건(전체 68건은 모두 기존 코드의 fabric v6 타이핑 등 사전 존재 에러 — 라인 번호 대조로 확인). `dist → Bin\web` robocopy 배포 완료.

### 7.1 후속 버그: 잠금 해제가 Process 탭 전환 전까지 지연 (수정 완료)

- **증상**: 가공 완료 후 Motion 탭의 Home all/개별 호밍/Jog가 enable로 복원되지 않고, Process 탭으로 전환해야 풀림.
- **원인**: 완료 신호(`scanner/status: idle`)로 `processStates`를 갱신하는 것은 전역 훅 `useProcessMonitor`(AppShell 상주)인데, 잠금 해제(`setProcessingLocal(false)`/`setHideOverlays(false)`)는 Process 탭 내부에만 마운트되는 `ProcessDashboard`의 effect에 있었음 → Motion 탭 표시 중에는 언마운트라 실행 안 됨.
- **수정**: `useProcessMonitor.ts`에 processState **전이(prev ≠ cur) 기반** 전역 동기화 추가(running/paused → 잠금 ON, idle → OFF). 전이 기반이라 Process Start 직후(백엔드 running 보고 전) 잠금을 되돌리지 않아 ProcessDashboard의 2초 유예 로직과 충돌 없음.
- **체크포인트 반영**: feature_Scanner.md §6.13, arch_CanvasProc.md §2.34.
