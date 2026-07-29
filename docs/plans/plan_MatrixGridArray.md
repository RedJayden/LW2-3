# Matrix/Grid Array 가공 시퀀스 재설계 계획서

## Context (배경)

Matrix/Grid Array(도형 배열 복제) 기능을 구현하다가 중단된 상태다. 목표는 100×100(1만 셀) 규모까지 배열 가공을 지원하는 것인데, 기존 방식은 CPU 100% 부하와 UI 멈춤을 유발했다. 또한 재설계 이전에도 두 가지 정확성 버그가 남아있다:

1. **원본 위치 이탈/소실 버그**: 도형을 그리고 Matrix/Grid Array 창을 열면 기본값 2×2 매트릭스가 즉시 생성되는데, 이때 원본 도형이 화면에서 사라지고 매트릭스 생성 위치가 원본 위치에서 벗어난 엉뚱한 곳에서 시작된다.
2. **Cancel 시 기존 매트릭스 삭제 버그**: 매트릭스를 Apply로 확정한 뒤, 도형을 재선택하고 Matrix/Grid Array 창을 다시 열었다가 닫으면(Cancel/X) 이미 확정된 매트릭스가 통째로 삭제된다.

사용자 확인 결과, 이번 계획은 **정확성 버그 수정과 성능 재설계를 함께 다루며**, 성능 문제는 **뷰포트 컬링 + 청크 단위 yield**와 **비트맵 캐싱 아키텍처**를 함께 적용하되, **생성된 매트릭스의 개별 셀은 계속 선택하여 위치/크기를 조정할 수 있어야 한다**. 100×100이 인터랙티브하게 처리 불가능하다면, 구현 후 실측을 통해 안전한 최대 N×N 상한을 정하고 UI에 반영한다.

## 조사 결과 — 근본 원인 (3인 전문가 관점)

### 1) 상태관리/UX 전문가 관점 — 두 정확성 버그의 근본 원인

**버그 1 (위치 이탈 + 원본 소실)** — [`useMatrixGenerator.ts`](../../Portal/src/hooks/useMatrixGenerator.ts):
- [`MatrixDialog.tsx:55-62`](../../Portal/src/ui/components/control/MatrixDialog.tsx#L55-L62)의 `useEffect`가 다이얼로그가 열리자마자(옵션 변경 여부와 무관하게) `generateMatrix(canvas, matrixOptions, true)`를 즉시 실행한다. `matrixOptions`는 전역 store에 저장된 값(기본 2×2, [`useCanvasStore.ts:619-628`](../../Portal/src/ui/pages/Recipe/Canvas/useCanvasStore.ts#L619-L628))이라 열자마자 미리보기가 생성된다.
- `generateMatrix` 내부([`useMatrixGenerator.ts:141-154`](../../Portal/src/hooks/useMatrixGenerator.ts#L141-L154))에서 `MatrixRepeater`를 `left: activeObject.left, top: activeObject.top, originX:'left', originY:'top'`로 배치한다. 그런데 캔버스의 원본 도형(원, 사각형 등)은 대부분 `originX/originY`가 `'center'`다. **원본의 center 좌표를 그대로 가져와 top-left 좌표로 재해석**하면서 정확히 도형 절반 크기만큼 위치가 어긋난다 — 이것이 "쉬프트된 엉뚱한 위치" 버그의 직접 원인이다.
- 동시에 `activeObject.visible = false`([:137](../../Portal/src/hooks/useMatrixGenerator.ts#L137))가 프리뷰 시작과 동시에 실행되어 원본이 즉시 사라진 것처럼 보인다(의도된 프리뷰 동작이지만, 위치 버그와 겹쳐서 "사라짐 + 엉뚱한 위치"로 체감됨).

**버그 2 (Cancel 시 확정 매트릭스 삭제)**:
- `clearMatrix(canvas, all, targetSessionId, isCancelling)`([:20-56](../../Portal/src/hooks/useMatrixGenerator.ts#L20-L56))의 삭제 조건이 `data.isPreview || all`이다. `MatrixDialog.handleClose`(Cancel/X 버튼, [:92-95](../../Portal/src/ui/components/control/MatrixDialog.tsx#L92-L95))는 항상 `clearMatrix(canvas, true, undefined, true)`를 호출한다 — **`all=true`이고 세션 필터도 없어서, 이미 Apply되어 확정된(`isPreview:false`) 매트릭스까지 무조건 전부 제거**된다.
- 더 심각한 것은 재오픈 시나리오: 이미 확정된 `MatrixRepeater`를 재선택하고 다이얼로그를 다시 열면, `generateMatrix`가 이를 "새로 매트릭스화할 원본"으로 취급해 그 `MatrixRepeater` 자체를 숨기고 `isMatrixOriginal`로 표시한다 — **"기존 매트릭스를 편집하는 모드"가 아예 존재하지 않는다.** 이 상태에서 Cancel을 누르면 새로 생성된 프리뷰뿐 아니라 방금 숨겨진 기존 확정 매트릭스까지 `toRemove`에 걸려 영구 삭제된다. Apply 시점(`commitMatrix`, [:182-211](../../Portal/src/hooks/useMatrixGenerator.ts#L182-L211))에 원본 단일 도형은 이미 완전히 삭제되므로 복구할 대상 자체가 없다.

### 2) 렌더링/성능 전문가 관점 — CPU 100%/UI 멈춤의 근본 원인

- [`MatrixRepeater.ts:142-205`](../../Portal/src/ui/pages/Recipe/Canvas/fabric/MatrixRepeater.ts#L142-L205)의 `drawObject()`는 **매 캔버스 리페인트(팬/줌/마우스무브 등 모든 프레임)마다** `xCount × yCount` 전체를 순회하며 각 셀에 대해 실제 fabric `obj.render(ctx)`를 호출한다. `objectCaching = false`가 생성자에서 강제되어 있어([:57](../../Portal/src/ui/pages/Recipe/Canvas/fabric/MatrixRepeater.ts#L57)) Fabric의 비트맵 캐시 이점을 전혀 받지 못한다.
- `isConstantSize`(Dot 마커 등 줌 불변 크기) 소스는 셀마다 `obj.set({scaleX, scaleY}); obj.setCoords();`를 프레임마다 재계산한다([:178-186](../../Portal/src/ui/pages/Recipe/Canvas/fabric/MatrixRepeater.ts#L178-L186)) — 1만 셀 × 매 프레임 `setCoords()`는 매우 비싸다.
- 화면 밖 셀에 대한 컬링(culling)이 전혀 없다 — 주석은 "Native clipping이 처리한다"고 되어 있지만 이는 픽셀 페인트 단계의 클리핑일 뿐, JS 루프 자체는 뷰포트와 무관하게 전체 셀을 순회한다.
- 이 문제는 새로 발견한 것이 아니라 **`docs/checkpoints/feature_Draw.md` §2.4에 이미 "100x100 이상의 도트 매트릭스 최적화 아키텍처 (진행 예정)"으로 기록되어 있고, 단일 `fabric.DotMatrix` 클래스 + 단일 `_render(ctx)` 경로 + `objectCaching:true`/`statefulCache:false` GPU 비트맵 캐시 도입이 계획만 되고 미착수 상태**였다.
- 안전장치로 [`getVirtualObjects()`](../../Portal/src/ui/pages/Recipe/Canvas/fabric/MatrixRepeater.ts#L207-L290)는 `totalCells > 150`이면 빈 배열을 반환한다(:208-211) — 이는 LayerList 패널 표시용 우회일 뿐 캔버스 렌더링 병목은 그대로다.

### 3) 가공 커맨드 생성 전문가 관점 — Scanner 모드 vs Object 모드 비대칭 문제

두 가공 엔진이 완전히 분리되어 있고, **한쪽에만 매트릭스 처리 경로가 정상 존재**하는 심각한 비대칭이 발견됐다. 100×100 목표 달성 전에 반드시 함께 고쳐야 한다.

**Scanner 모드 (`ScannerGenerator.ts`, 시노갈보/Scanlab 커맨드)** — Template Method 구조(`generate()` → `generatePass()`)이며, `MatrixRepeater` 전용 고속 경로가 있다([:242-332](../../Portal/src/services/ScannerGenerator.ts#L242-L332)).
- **Dot 마커 소스**는 셀마다 좌표만 계산해 직접 `POINT` 커맨드를 push하므로(:284-298) 1만 셀도 빠르다.
- **Dot이 아닌 일반 도형 소스**는 셀마다 `generatePass([src], ...)`를 재귀 호출한다(:317-320). 이 재귀 호출 내부에서 `flatObjects.length === 1`이므로 `idx % 5 === 0` 조건이 항상 참이 되어 **셀마다 `await setTimeout(0)`으로 매크로태스크 yield가 발생**한다(:179-181). 1만 셀이면 1만 번의 이벤트 루프 왕복이 발생해 "멈춘 것처럼" 느껴질 정도로 느려진다. 게다가 셀마다 paper.js flatten/해칭 파이프라인 전체를 처음부터 다시 계산하므로 연산량 자체도 O(cells)로 중복 낭비된다.

**Object 모드 (`useGCodeGenerator.ts`, G-Code 변환) — ⚠️ 150셀 초과 시 매트릭스가 통째로 무시되는 치명적 버그**
- `useGCodeGenerator.ts`의 `getAllObjects()`([:48-73](../../Portal/src/hooks/useGCodeGenerator.ts#L48-L73))는 `MatrixRepeater`를 `fabric.Group`으로 판정해(`isGroupType=true`) 평탄화하지 않고 그대로 리스트에 남긴다 — **ScannerGenerator.ts의 `getAllObjects()`처럼 `MatrixRepeater`를 명시적으로 예외 처리하는 전용 고속 경로가 아예 없다.**
- 메인 생성 루프([:1004-1077](../../Portal/src/hooks/useGCodeGenerator.ts#L1004-L1077))에도 `obj.type === 'MatrixRepeater'`를 분기하는 코드가 없다. 따라서 매트릭스 오브젝트는 `isType(obj,'rect')` 등 어떤 primitive 분기에도 걸리지 않고 그대로 `FabricToPaperAdapter.toPaperItem(obj, scope)`([:1072](../../Portal/src/hooks/useGCodeGenerator.ts#L1072))로 넘어간다.
- `FabricToPaperAdapter.toPaperItem`에는 `MatrixRepeater` 전용 분기가 있지만([`FabricToPaperAdapter.ts:91-125`](../../Portal/src/utils/FabricToPaperAdapter.ts#L91-L125)), **`repeater.getVirtualObjects()`를 호출**해 셀들을 얻는다. 그런데 `getVirtualObjects()`는 [`MatrixRepeater.ts:208-211`](../../Portal/src/ui/pages/Recipe/Canvas/fabric/MatrixRepeater.ts#L208-L211)에서 `totalCells > 150`이면 **빈 배열을 반환**한다 — 원래 LayerList UI 표시용으로 만든 안전장치인데, G-Code 변환 경로가 이를 그대로 재사용하고 있다.
- **결과**: 150셀(예: 13×12 이상)을 넘는 매트릭스를 Object 모드로 가공하면, 어떤 오류 메시지도 없이 **빈 `paper.Group`이 생성되어 해당 도형에 대한 G-Code가 한 줄도 나오지 않는다.** 100×100(1만 셀) 목표는 Object 모드에서 현재 구조로는 원천적으로 달성 불가능하다. Scanner 모드는 반대로 정상 동작하지만 위에서 설명한 셀당 yield 병목이 남아있다.

## 수정 계획

### A. 정확성 버그 수정 (P0)

1. **위치 정규화** — `generateMatrix`에서 `activeObject`의 실제 top-left를 `getBoundingRect()`(또는 `originX/Y` 무관 계산)로 구해 `MatrixRepeater`에 전달한다. origin 불일치로 인한 좌표 재해석 오류를 제거한다.
2. **다이얼로그 열림 시 즉시 프리뷰 생성 방지** — Matrix 버튼 클릭 시(`CanvasTopBar.tsx:948`) 선택된 오브젝트를 기준으로 `matrixOptions`를 항상 리셋(최소 1×1 또는 선택 도형 크기 기반 안전값)하거나, 다이얼로그가 열린 "이번 세션"에서 사용자가 값을 한 번이라도 바꾸기 전까지는 프리뷰를 생성하지 않도록 `useEffect` 트리거 조건을 분리한다.
3. **생성(Create) 모드 / 편집(Edit) 모드 분리** — 다이얼로그를 열 때 `canvas.getActiveObject()`가 이미 `MatrixRepeater`이면 **편집 모드**로 진입: 기존 `xCount/yCount/spacing/type/zStep` 값을 폼에 로드하고, `generateMatrix`가 새 원본을 만드는 대신 **기존 리피터 인스턴스의 속성을 in-place로 갱신**한다(새 원본 hide/삭제 사이클을 타지 않음). 일반 도형이면 기존과 동일한 **생성 모드**.
4. **Cancel의 파괴적 삭제 제거** — `clearMatrix`의 `all` 플래그를 "현재 다이얼로그 세션에서 새로 만든 프리뷰만" 대상으로 하도록 좁힌다. 편집 모드의 Cancel은 "다이얼로그를 열었을 때의 스냅숏 값"으로 리피터 속성을 롤백하며, 오브젝트 자체를 제거하지 않는다. 생성 모드의 Cancel만 기존처럼 원본을 복원하고 프리뷰 리피터를 제거한다.

### B. 성능 재설계 — 100×100(1만 셀) 목표, 개별 셀 편집 유지

핵심 설계 패턴: **Flyweight** — 대부분의 셀은 동일한 시각적 표현(intrinsic state)을 공유하므로 1회만 래스터화해 캐시하고, 위치·override(extrinsic state)만 셀마다 적용한다. 사용자가 실제로 수정한(override가 있는) 소수 셀과 현재 활성 셀만 기존처럼 정식 fabric 렌더링을 유지해 개별 선택/위치/크기 조정 기능을 보존한다.

1. **비트맵 캐시 도입** (`MatrixRepeater.ts`): `sourceObjects` + 현재 줌 배율을 키로 하는 오프스크린 `HTMLCanvasElement`(또는 `ImageBitmap`)를 1회 렌더링해 캐시한다. `drawObject()`는 override가 없는 셀에 대해 `ctx.drawImage(cachedBitmap, dx, dy)`만 호출한다 — fabric object render 파이프라인을 타지 않으므로 셀당 비용이 상수 시간으로 줄어든다.
2. **override 셀은 기존 경로 유지** — `overrides` 맵에 있는 셀(사용자가 위치/크기/색상을 바꾼 셀)과 `activeCell`(현재 선택된 셀)만 기존처럼 `obj.render(ctx)`로 개별 렌더링한다. 실사용상 override 셀 수는 극소수이므로 성능에 영향이 없다.
3. **뷰포트 컬링** — `drawObject()` 진입 시 캔버스의 현재 가시 영역(뷰포트 역변환 사각형)을 1회 계산하고, 각 셀의 목적지 사각형이 이 영역과 겹치지 않으면 `drawImage`/`render` 호출 자체를 건너뛴다.
4. **isConstantSize 재계산 제거** — 줌 배율이 바뀔 때만 캐시 비트맵을 해당 줌 배율로 다시 래스터화하고, 프레임마다 `setCoords()`를 호출하지 않는다.
5. **Scanner 모드 커맨드 생성 최적화** (`ScannerGenerator.ts`): 비-Dot 소스에 대해 셀마다 `generatePass` 전체를 재호출하지 않고, **소스 도형의 flatten/해칭 결과를 1회만 계산**한 뒤 좌표 오프셋만 셀마다 적용해 커맨드를 생성한다. `await setTimeout(0)` yield는 셀 단위가 아니라 **청크 단위(예: 200셀마다 1회)**로 변경한다.
6. **Object 모드(G-Code) 매트릭스 처리 신설 — P0** (`useGCodeGenerator.ts`, `FabricToPaperAdapter.ts`): `useGCodeGenerator.ts`의 메인 루프에 `ScannerGenerator.ts`와 동등한 `obj.type === 'MatrixRepeater'` 전용 분기를 추가해, `getVirtualObjects()`(150셀 캡)를 거치지 않고 `xCount × yCount`를 직접 순회하며 셀별로 G-Code를 생성한다. `FabricToPaperAdapter.ts:91-125`의 `MatrixRepeater` 분기는 LayerList/썸네일 등 소규모 UI 표시 전용으로 역할을 한정하고, 대량 G-Code 생성 경로에서는 더 이상 사용하지 않는다. `getVirtualObjects()`의 150셀 캡은 그대로 두되(UI 용도로는 적절), 이름을 `getVirtualObjectsForUI()` 등으로 명확히 하거나 주석으로 "UI 전용, 가공 커맨드 생성에 사용 금지"를 명시한다.
7. **실측 기반 상한 결정** — 위 최적화 적용 후, 개발 서버에서 Chrome DevTools Performance 탭으로 100×100 Dot/비-Dot 매트릭스의 프레임 타임과 Scanner/Object 양쪽 모드의 커맨드 생성 소요시간을 측정한다. 인터랙티브 조작(팬/줌/셀 선택)이 매끄러운 실제 상한이 100×100보다 작다면, `MatrixDialog.tsx:78`의 `Math.min(100, ...)` 클램프 값을 실측 상한으로 낮추고 그 근거를 코드 주석에 남긴다. 100×100을 완전히 지원한다면 현행 상한 유지.

### 영향 파일

- [`Portal/src/hooks/useMatrixGenerator.ts`](../../Portal/src/hooks/useMatrixGenerator.ts) — 생성/편집 모드 분기, 좌표 정규화, clearMatrix 스코프 수정
- [`Portal/src/ui/components/control/MatrixDialog.tsx`](../../Portal/src/ui/components/control/MatrixDialog.tsx) — 열림 시 초기화 로직, 편집 모드 폼 프리필, Cancel/Apply 동작
- [`Portal/src/ui/pages/Recipe/Canvas/fabric/MatrixRepeater.ts`](../../Portal/src/ui/pages/Recipe/Canvas/fabric/MatrixRepeater.ts) — 비트맵 캐시, 컬링, override 예외 렌더링
- [`Portal/src/services/ScannerGenerator.ts`](../../Portal/src/services/ScannerGenerator.ts) — Scanner 모드 매트릭스 커맨드 생성 청크/캐시 최적화
- [`Portal/src/hooks/useGCodeGenerator.ts`](../../Portal/src/hooks/useGCodeGenerator.ts) — **Object 모드 `MatrixRepeater` 전용 분기 신설(현재 없음, 150셀 초과 시 무동작 버그 수정)**
- [`Portal/src/utils/FabricToPaperAdapter.ts`](../../Portal/src/utils/FabricToPaperAdapter.ts) — `MatrixRepeater` 변환 분기를 UI 전용으로 역할 한정
- [`Portal/src/ui/pages/Recipe/PropertyBar/CanvasTopBar.tsx`](../../Portal/src/ui/pages/Recipe/PropertyBar/CanvasTopBar.tsx) — Matrix 버튼 클릭 시 편집/생성 모드 판별 진입점

### 코드 규칙 (기존 프로젝트 규약)

새/변경 함수에는 Doxygen 스타일 주석(`@brief/@details/@param/@return`)을 적용하고, Flyweight/Template Method 등 적용한 디자인 패턴을 `@details`에 `[Design Pattern: ...]`로 명시한다.

## 검증 방법

1. **버그 1 재현 확인**: 원 1개를 그리고 Matrix/Grid Array를 열어, 프리뷰 매트릭스의 첫 셀 위치가 원본 위치와 정확히 일치하는지 확인.
2. **버그 2 재현 확인**: Apply로 매트릭스 확정 → 재선택 → 다이얼로그 재오픈(값 미변경) → Cancel/X → 매트릭스가 그대로 남아있는지 확인. 편집 모드에서 값 변경 후 Cancel 시 원래 값으로 복원되는지도 확인.
3. **개별 셀 편집 유지 확인**: 매트릭스 생성 후 특정 셀을 클릭 선택해 위치(X/Y)와 크기를 개별 조정 → 다른 셀에는 영향 없는지, override가 저장되는지, 그리고 그 override가 Scanner/Object 양쪽 커맨드 생성 결과에 모두 반영되는지 확인.
4. **성능 측정**: 100×100 Dot 매트릭스 및 100×100 비-Dot(원/사각형) 매트릭스를 각각 생성해 Chrome DevTools Performance로 팬/줌 중 프레임 타임 측정. 목표(매끄러운 인터랙션) 미달 시 §B-7에 따라 실측 상한을 코드에 반영.
5. **Scanner 모드 가공 검증 (시노갈보/Scanlab)**: 매트릭스(소규모 및 100×100)를 만든 뒤 Scanner Process 패널에서 Process Start → `Generated Commands` 패널에서 셀 수만큼 `POINT`/`RECT`/`CIRCLE` 등 커맨드가 정확히 생성되는지, 좌표가 그리드 간격과 일치하는지 확인. 실장비 또는 시뮬레이션 가능하면 SinoGalvo/Scanlab 컨트롤러로 실제 전송까지 확인.
6. **Object 모드 가공 검증 (G-Code)**: 동일한 매트릭스를 Object 모드에서 G-Code로 변환해 (a) §3에서 발견한 150셀 캡 버그가 수정되어 150셀을 초과해도 G-Code가 정상 생성되는지, (b) 생성된 G-Code의 좌표/도형 수가 Scanner 모드 결과와 논리적으로 일치하는지, (c) Shape Delay/Mark Times/Z-Offset 옵션이 매트릭스 셀에도 동일하게 적용되는지 확인.
7. `npm run typecheck`로 변경 파일에 새로운 타입 오류가 없는지 확인(기존 부채 오류는 제외).

---
최종 수정일: 2026-07-17
