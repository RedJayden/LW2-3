# 오브젝트 모드 전환 시 Fit to Camera 화면 오류 해결 계획서

## 1. 개요 및 원인 분석

### 1.1 현상
- 스캐너 모드에서 정상적으로 표시되는 Fit to Camera 기능이 오브젝트(Object) 모드로 전환 후 작동 시, 검은 빈 화면(엉뚱한 좌표)을 표시하는 문제가 지속적으로 발생하고 있습니다.
- 정상적인 상태라면 첨부된 3번 이미지와 같이 카메라 뷰가 화면에 꽉 차게 들어와야 합니다. 

### 1.2 원인 분석 (CanvasBackground.tsx vs RecipeCanvas.tsx 불일치)
- **카메라 배경 렌더링 (`CanvasBackground.tsx`)**: 해당 파일에서는 백엔드가 오브젝트 카메라를 (0,0)에 일치하도록 스테이지를 물리적으로 이미 이동시켰음을 전제로 합니다. 따라서 오브젝트 모드일 때는 렌더링 시 카메라 오프셋(`mx`, `my`)을 `0`으로 처리하여 현재 스테이지 좌표(`pos.X`, `pos.Y`) 자체에 카메라 영상을 올바르게 매핑합니다.
- **뷰포트 화면 이동 로직 (`RecipeCanvas.tsx`)**: 반면 `fitCameraArea` 함수와 실시간 JOG 뷰포트 이동 함수 내에서는 오브젝트 모드임에도 불구하고 무조건 `mx`, `my`를 뺀 좌표(`pos.X - mx`, `pos.Y - my`)로 화면을 이동(Pan)시킵니다. 
- **결과**: 배경 이미지(카메라 영상)가 그려진 위치와, 사용자가 바라보는 캔버스의 화면 좌표(Viewport)가 서로 엇갈리게 되어 아무것도 없는 빈 공간이 표시됩니다.

---

## 2. 3인 전문가 논의 및 대안 비교 (Tree of Thought)

### [Expert A: System Architect / Backend Engineer]
> **의견**: 백엔드에서 오브젝트 렌즈의 오프셋을 처리하는 방식은 이미 "기계적으로 보정하여 이동시키는 방식"으로 확정되어 있습니다. 즉, 프론트엔드가 오브젝트 렌즈로 전환을 지시하면 스테이지가 알아서 이동하므로 프론트엔드단에서 좌표를 이중 계산해서는 안 됩니다.
> **평가**: 백엔드의 기계적 오프셋 처리 철학과 완벽히 일치합니다. 프론트엔드는 스테이지의 현재 위치(`positions.X`, `positions.Y`)를 그대로 중심 좌표로 신뢰해야 합니다.

### [Expert B: Frontend / Canvas Rendering Specialist]
> **의견**: 현재 `CanvasBackground.tsx`에는 `const mx = isScanner ? (currentCameraOffset?.x ?? 0) : 0;` 코드가 정상적으로 방어하고 있습니다. 이 방어 로직을 `RecipeCanvas.tsx`의 뷰포트 이동 로직 두 곳( `fitCameraArea`, 실시간 JOG 이동부)에 동일하게 이식해야 합니다.
> **평가**: **(가장 추천하는 안)** 두 모듈 간의 카메라 투영(Projection) 논리를 완벽히 일치시켜 동일한 렌더링 파이프라인을 구축하게 되므로 재발을 원천 차단할 수 있습니다.

### [Expert C: UI/UX & QA Engineer]
> **의견**: 이전에 수정을 거쳤으나 다른 작업을 하다 코드가 덮어씌워졌거나 리팩토링 중 실수로 누락된 것으로 보입니다. 이번에 수정할 때는 해당 부분에 주석을 명시적으로 추가하여 이후 AI나 개발자가 이 부분을 무심코 변경하지 않도록 방어선(Guard)을 쳐야 합니다.
> **평가**: 유지보수성 측면에서 반드시 병행되어야 하는 훌륭한 제안입니다. 

---

## 3. 제안하는 수정 사항 (Proposed Changes)

### 3.1 `Portal/src/ui/pages/Recipe/Canvas/RecipeCanvas.tsx`

`fitCameraArea` 내부 (약 856행) 및 JOG 실시간 뷰포트 정렬부 (약 1257행)의 코드를 다음과 같이 수정합니다.

#### [MODIFY] `RecipeCanvas.tsx`
```typescript
// 변경 전
const mx = currentCameraOffset.x ?? 0;
const my = currentCameraOffset.y ?? 0;

// 변경 후
const isScanner = viewMode === 'scanner';
// [FIX] 백엔드에서 Object 카메라를 위해 스테이지를 이동시키므로, Object 모드에서는 오프셋을 이중 적용하지 않습니다.
// (CanvasBackground.tsx 와 Projection 기준점 일치)
const mx = isScanner ? (currentCameraOffset.x ?? 0) : 0;
const my = isScanner ? (currentCameraOffset.y ?? 0) : 0;
```
