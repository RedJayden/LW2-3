# 모든 모드 전환 시 2-Step Auto-Focus (Fit to Workarea -> Fit to Camera) 완벽 복구 계획서

## 1. 개요 및 원인 분석

### 1.1 현상
- 스캐너 <-> 오브젝트(x20) 간의 전환뿐만 아니라, **오브젝트 x20 <-> 오브젝트 x50 간의 배율 전환 시에도** 스테이지 이동 중에는 Fit to Workarea, 도착 후에는 Fit to Camera로 동작해야 하지만 현재 정상 작동하지 않습니다.

### 1.2 원인 분석
1. **리렌더링에 의한 트래킹 취소 (Restoration Override 버그)**
   - x20 <-> x50 전환 시, 배율(`magnification`)이 변경됨에 따라 픽셀 스케일(`pxPerMm`)이 비동기적으로 다시 계산되며 캔버스가 여러 번 리렌더링됩니다.
   - 첫 번째 렌더링에서 2-Step Tracking을 정상적으로 시작(`isPendingAutoCameraFitRef = true`)하더라도, 바로 이어서 발생하는 두 번째 렌더링에서는 더 이상 `isModeSwitch`가 `true`가 아니게 되므로 캔버스가 이를 "사용자가 줌/팬 상태를 잃어버린 상황"으로 오인하고 **즉시 Fit to Camera를 강제 실행**해버립니다. 이로 인해 이동 중에 워크에어리어를 보여주는 2-Step 동작이 취소됩니다.
2. **미세 떨림에 의한 무한 대기 (Debounce Trap 버그)**
   - 목표 좌표 도달 여부를 감시하는 `useEffect` 내부에서, 좌표(`positions`)가 업데이트될 때마다 이전 타이머를 무조건 초기화(`clearTimeout`)하고 있습니다.
   - 장비 스테이지가 목표 좌표에 도착한 후 유지보수(Holding) 중 미세한 엔코더 노이즈(Jitter)로 인해 좌표값이 `13.286` -> `13.287` 등으로 흔들리면, 500ms 대기 타이머가 계속 초기화되어 영원히 Fit to Camera로 전환되지 않는 문제가 내재되어 있습니다.

---

## 2. 3인 전문가 논의 및 대안 비교 (Tree of Thought)

### [Expert A: System Architect / Backend Engineer]
> **의견**: 하드웨어 스테이지는 목표 위치에 도달하더라도 서보 모터 특성상 미세한 헌팅(Hunting)이나 진동이 발생할 수 있습니다. 프론트엔드의 트래킹 로직이 이 미세 진동마다 타이머를 리셋한다면 설계 결함입니다. 타이머 로직의 디바운스(Debounce) 처리가 반드시 개선되어야 합니다.

### [Expert B: Frontend / Canvas Rendering Specialist]
> **의견**: 캔버스의 `useEffect`는 React 상태 변화에 매우 민감합니다. 2-Step Tracking이 한 번 시작되었다면(`isPendingAutoCameraFitRef === true`), 해당 트래킹이 완료되기 전까지는 `pxPerMm` 등의 갱신으로 인한 뷰포트 강제 초기화 로직을 무시(`return`)하도록 방어 코드를 넣어야 합니다.

### [Expert C: UI/UX & QA Engineer]
> **의견**: 사용자가 Scanner, Object x20, Object x50 어떤 모드 버튼을 누르든 일관된 UX(이동 중 줌아웃 -> 도착 후 줌인)가 제공되어야 합니다. 두 전문가의 의견을 종합하여, 상태 덮어쓰기 방지와 디바운스 방어를 모두 적용하는 것이 최적의 솔루션입니다.
> **평가**: **(가장 추천하는 안)** 두 가지 잠재적 버그를 모두 원천 차단하는 완벽한 수정안입니다.

---

## 3. 제안하는 수정 사항 (Proposed Changes)

### 3.1 `Portal/src/ui/pages/Recipe/Canvas/RecipeCanvas.tsx`

#### [MODIFY] `RecipeCanvas.tsx` - 리렌더링에 의한 트래킹 취소 방어 (약 1208행 부근)
```typescript
if (isCameraMode) {
    // [FIX] 2-Step Tracking 중에는 다른 의존성(pxPerMm 등) 업데이트로 인한 리렌더링이
    // 강제로 Fit to Camera를 발생시켜 Tracking을 취소하지 않도록 방어합니다.
    if (isPendingAutoCameraFitRef.current) {
        console.log('[RecipeCanvas] 2-Step tracking is in progress. Skipping view restoration override.');
        return;
    }

    if (isInitialLoad || isScopeSwitch || (!hasSavedState && !isModeSwitch)) {
        // ... 기존 로직
```

#### [MODIFY] `RecipeCanvas.tsx` - Debounce Trap 방지 (약 1107행 부근)
```typescript
// [FIX] Debounce Trap 방지: 이미 타이머가 돌고 있다면 다시 리셋하지 않음 (Jitter 방어)
if (!stableTimerRef.current) {
    stableTimerRef.current = setTimeout(() => {
        if (!isPendingAutoCameraFitRef.current) return;
        isPendingAutoCameraFitRef.current = false;
        useCanvasStore.getState().setIsFitCamera(true);
        fitCameraAreaRef.current(false);
        stableTimerRef.current = null; // 타이머 종료 시 null 초기화
    }, 500);
}

// 매 리렌더링마다 타이머가 리셋되는 현상 방지를 위해 기존의 return () => clearTimeout(...) 제거
```

#### [NEW] `RecipeCanvas.tsx` - 메모리 누수 방지를 위한 언마운트 전용 정리 함수 추가
```typescript
// Unmount 시에만 타이머 정리
useEffect(() => {
    return () => {
        if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
    };
}, []);
```
