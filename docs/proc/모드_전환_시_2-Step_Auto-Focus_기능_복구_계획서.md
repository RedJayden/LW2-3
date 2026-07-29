# 모드 전환 시 2-Step Auto-Focus (Fit to Workarea -> Fit to Camera) 기능 복구 계획서

## 1. 개요 및 원인 분석

### 1.1 현상
- 스캐너 모드와 오브젝트 모드를 전환할 때, 스테이지가 이동하는 도중에는 화면 전체(Fit to Workarea)를 보여주다가, 목표 좌표에 도착하면 카메라 뷰(Fit to Camera)로 줌인되는 "2-Step Auto-Focus" 기능이 작동하지 않고 즉시 Fit to Camera 상태가 되는 문제가 발생했습니다.

### 1.2 원인 분석 (상태 초기화 로직의 충돌)
- 최근 추가된 `[V13 NEW]` 업데이트로 인해, `LeftNav.tsx`와 `SubTitleBar.tsx`에서 모드 전환 시 이전 화면 상태(Zoom/Pan)를 초기화하기 위해 강제로 `zoom = 0` 값을 저장(`updateViewState`)하고 있습니다.
- `RecipeCanvas.tsx`의 화면 복구 로직에서는 `hasSavedState` (저장된 화면 상태가 있는지 여부)를 검사하여 동작을 결정합니다.
- 저장된 상태가 있을 경우(`hasSavedState === true`)에는 정상적으로 모드 전환(isModeSwitch)을 감지하여 2-Step 시퀀스(이동 중 Workarea -> 도착 시 Camera)를 예약합니다.
- **하지만 상태가 강제로 초기화되어 `hasSavedState === false`가 되면서**, 캔버스는 이를 "최초 진입"으로 오인하고 이동 상태와 관계없이 **"즉시 Fit to Camera를 강제 적용(Forcing default Fit to Camera immediately)"**하게 되어 2-Step 기능이 무시되었습니다.

---

## 2. 3인 전문가 논의 및 대안 비교 (Tree of Thought)

### [Expert A: System Architect / Backend Engineer]
> **의견**: 모드 전환 이벤트 자체는 정상적으로 프론트엔드 상태에 전달되고 있으며, 위치 추적 훅(`useEffect` for `isAtTarget`) 역시 스테이지의 기계적 위치를 잘 감시하고 있습니다. `LeftNav`에서 명시적으로 상태를 지운 행위 자체는 뷰포트 초기화를 위한 기획적 의도이므로 유지하는 것이 좋습니다.
> **평가**: 동의합니다. 네비게이션 단의 초기화 의도는 존중해야 합니다.

### [Expert B: Frontend / Canvas Rendering Specialist]
> **의견**: `RecipeCanvas.tsx`의 `useEffect` 내 분기 조건을 약간 수정하면 됩니다. 기존에는 `if (isInitialLoad || isScopeSwitch || !hasSavedState)`일 때 즉시 핏을 적용했는데, 이를 `if (isInitialLoad || isScopeSwitch || (!hasSavedState && !isModeSwitch))`로 변경하여, **"저장된 상태가 없더라도 현재 동작이 모드 전환(isModeSwitch)이라면 2-Step 시퀀스로 진입"**하도록 예외 처리해야 합니다.
> **평가**: **(가장 추천하는 안)** 캔버스의 라이프사이클을 해치지 않고, 단 한 줄의 조건문 수정만으로 모드 전환 시의 Tracking 애니메이션을 완벽히 복구할 수 있습니다.

### [Expert C: UI/UX & QA Engineer]
> **의견**: 이 2-Step 시퀀스는 사용자가 스테이지 이동 상황을 인지하게 해주는 매우 중요한 UX 요소입니다. 이번 수정을 통해 어떠한 경로(좌측 네비게이션, 상단 타이틀바 등)로 모드를 전환하든 2-Step 애니메이션이 보장되도록 확실한 픽스가 되어야 합니다.
> **평가**: 훌륭한 관점입니다. 제안된 수정안을 적용하면 모드 전환 시에는 예외 없이 Workarea 뷰가 먼저 표출됩니다.

---

## 3. 제안하는 수정 사항 (Proposed Changes)

### 3.1 `Portal/src/ui/pages/Recipe/Canvas/RecipeCanvas.tsx`

`RecipeCanvas.tsx`의 뷰 복구 `useEffect` 분기 로직(약 1209행)을 다음과 같이 수정합니다.

#### [MODIFY] `RecipeCanvas.tsx`
```typescript
// 변경 전
if (isCameraMode) {
    if (isInitialLoad || isScopeSwitch || !hasSavedState) {
        console.log('[RecipeCanvas] Forcing default Fit to Camera immediately.');
        useCanvasStore.getState().setIsFitCamera(true);
        fitCameraAreaRef.current(false);
    } else {
        console.log('[RecipeCanvas] Executing Fit to Workarea for mode switch tracking.');
        ...
    }
}

// 변경 후
if (isCameraMode) {
    // [FIX] 모드 전환 시(isModeSwitch) LeftNav/SubTitleBar에서 상태를 초기화(!hasSavedState)하더라도 
    // 2-Step Tracking(Fit to Workarea -> Fit to Camera)이 무시되지 않도록 보장합니다.
    if (isInitialLoad || isScopeSwitch || (!hasSavedState && !isModeSwitch)) {
        console.log('[RecipeCanvas] Forcing default Fit to Camera immediately.');
        useCanvasStore.getState().setIsFitCamera(true);
        fitCameraAreaRef.current(false);
    } else {
        console.log('[RecipeCanvas] Executing Fit to Workarea for mode switch tracking.');
        ...
    }
}
```
