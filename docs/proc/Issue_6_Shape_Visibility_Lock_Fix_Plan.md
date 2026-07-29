# [계획서] 도형 숨김 해제 후 선택/편집 불가 오류 해결 및 가공 후 숨김 상태 보존 계획서

본 계획서는 레이어 리스트(Layer List)에서 특정 도형을 숨겼다가 다시 표시할 때, 해당 도형의 렌더링은 정상적으로 복원되지만 마우스 선택 및 편집(Selectable & Evented)이 불가능해지는 버그를 분석하고, **"가공 전 숨김 처리된 도형은 가공이 끝나더라도 숨겨진 상태를 유지해야 하며, 가공 시작 후 임의 정지 시에도 기존 상태가 보존되어 복원되어야 한다"**는 추가 요구사항을 반영하여 3인 전문가의 협의를 거쳐 도출한 최적의 해결 방안을 기술합니다.

---

## 1. 요구사항 및 문제 분석 (3인 전문가 협의)

### 👤 UI/UX 전문 엔지니어 (Frontend Specialist)
> **분석**:
> 사용자는 공정 상태 전환 시 다음과 같은 도형 가시성 및 편집 기능의 영속성을 요구합니다:
> 1. **가공 중 (Scanner Mode)**: 가공 시작부터 완료(또는 정지) 시까지 모든 도형 오버레이가 화면에서 숨겨져야 합니다 (`visible = false`).
> 2. **가공 완료 및 임의 정지 시 상태 복원**:
>    - 기존 구현은 가공 종료 시점에 무조건 모든 도형의 `userVisible`과 `visible`을 `true`로 덮어씌워 강제로 표시했습니다.
>    - 이로 인해 가공 전 사용자가 필요에 의해 눈모양 아이콘으로 숨겨둔 도형까지 강제로 노출되는 불편함이 발생합니다.
>    - 해결책으로, 가공 전 설정된 각 도형의 개별 숨김/표시 사용자 의도(`userVisible` 상태)는 가공 도중에도 덮어쓰지 않고 유지되어야 하며, 가공 종료/중단 시 기존 `userVisible` 상태를 참조하여 `visible`, `selectable`, `evented` 속성을 복원해야 합니다.

### 👤 Fabric.js 캔버스 아키텍트 (Canvas Architect)
> **분석**:
> `RecipeCanvas.tsx` 내부의 `prevIsProcessing` 감지 `useEffect` 로직을 수정하여, 무조건 `obj.userVisible = true; obj.visible = true;`로 설정하던 강제 복원 로직을 변경합니다.
> 
> * **상태 감지 및 개별 상태 기반 복원 (RecipeCanvas.tsx)**:
>   `isProcessing`이 `true`에서 `false`로 변하는 트랜지션 감지 시:
>   - 루프 내에서 각 도형 객체의 `userVisible !== false` 여부(즉, `intentVisible`)를 확인합니다.
>   - `intentVisible`이 `true`인 도형들만 `visible = true`, `selectable = true`, `evented = true`로 설정합니다.
>   - `userVisible === false`였던(가공 전 숨겨진) 도형들은 가시성 및 클릭 방지를 위해 `visible = false`, `selectable = false`, `evented = false`로 그대로 유지합니다.
>   - 마스터 숨김 상태(`allObjectsHidden`) 역시 무조건 `false`로 바꾸는 것이 아니라, 캔버스 내 그리기 도형 객체 중 하나라도 표시되어 있는지 검사하여 실제 가시성 상태에 맞게 동기화합니다.
> 
> * **가시성 토글 기능과의 동기화 (LayerList.tsx)**:
>   수동 눈 아이콘 제어(`toggleVisibility`, `toggleLayerVisibility`) 시 설정하는 `userVisible` 값에 대응하여, `selectable`과 `evented` 속성 역시 현 캔버스 처리 상태와 동기화되도록 기존 보완 사항을 그대로 유지합니다.

### 👤 QA 리드 (Quality Assurance Lead)
> **분석 및 영향도 평가**:
> * **심각도**: **High (상)**. 공정 전후의 작업 화면 일관성 및 사용자 수동 변경 내역의 보존 여부와 관련된 핵심 품질 항목입니다.
> * **검증 예외 케이스**:
>   - 가공 전에 사각형, 원 도형을 눈모양 아이콘으로 숨김 처리하고 삼각형만 표시한 상태로 가공을 진행합니다.
>   - 가공 진행 중(또는 완료 후/임의 정지 후)에 숨겨놓았던 사각형과 원 도형은 그대로 숨김 상태를 유지하고 편집할 수 없는 상태여야 합니다.
>   - 노출되어 있던 삼각형은 가공 종료 후 정상적으로 활성화되어 선택 및 편집이 가능해야 합니다.
>   - 숨김 상태였던 사각형과 원은 사용자가 수동으로 눈모양 아이콘을 다시 클릭했을 때 비소로 보이고 선택/편집 가능해야 합니다.

---

## 2. 해결 방안 및 Proposed Changes

### [Component: Recipe Canvas]

#### [MODIFY] [RecipeCanvas.tsx](file:///c:/LNG/Source/LW2-3_INC_260618/Portal/src/ui/pages/Recipe/Canvas/RecipeCanvas.tsx)
- `isProcessing`이 `true`에서 `false`로 전환될 때 도형들의 가시성 및 편집 속성을 복원할 때, 가공 전의 수동 숨김 상태(`userVisible`)를 보존하여 조건부 복원하도록 로직을 변경합니다.

```typescript
const prevIsProcessing = useRef(false);
const isProcessing = hideOverlays || isProcessingLocal;

useEffect(() => {
    if (prevIsProcessing.current && !isProcessing) {
        // 가공 완료 또는 임의 정지 시점에 기존 userVisible 설정 상태를 보존하여 복원
        const objs = canvas?.getObjects();
        if (objs) {
            objs.forEach((obj: any) => {
                if (obj.isPaper || obj.isGridLine || obj.isCrosshair || obj.isProcessingMarker || obj.isTemp) return;
                
                // 가공 전 숨겨진 상태가 아니었던 도형만 표시 및 편집 활성화
                const intentVisible = obj.userVisible !== false;
                obj.visible = intentVisible;
                obj.selectable = intentVisible;
                obj.evented = intentVisible;
                obj.setCoords();
            });
            canvas?.requestRenderAll();
            
            // 모든 그리기 도형 객체들이 숨김 상태인지 판단하여 글로벌 마스터 숨김 상태 동기화
            const drawingObjects = objs.filter((obj: any) => 
                !obj.isPaper && !obj.isGridLine && !obj.isCrosshair && !obj.isProcessingMarker && !obj.isTemp && !obj.isMeasurement
            );
            const allHidden = drawingObjects.length > 0 && drawingObjects.every((o: any) => o.userVisible === false);
            useCanvasStore.getState().setAllObjectsHiddenOnly(allHidden);
        }
    }
    prevIsProcessing.current = isProcessing;
}, [isProcessing, canvas]);
```

### [Component: Layer List]

#### [MODIFY] [LayerList.tsx](file:///c:/LNG/Source/LW2-3_INC_260618/Portal/src/ui/pages/Recipe/LayerList/LayerList.tsx)
- 개별 가시성 토글 핸들러(`toggleVisibility`, `toggleLayerVisibility`)에서 수동으로 보이는 상태 변경 시, 현재 공정 실행 상태(`isProcessing` 또는 `isReviewMode`)에 알맞게 `selectable` 및 `evented` 속성을 안정적으로 할당하도록 처리합니다.

---

## 3. 검증 계획 (Verification Plan)

### 수동 검증 시나리오
1. **도형 개별 숨김 상태 보존 검증 (가공 완료)**:
   - 캔버스에 사각형, 원, 삼각형을 생성합니다.
   - 레이어 리스트에서 사각형과 원을 눈모양 아이콘으로 클릭하여 숨김 처리합니다(삼각형만 표시 상태).
   - **가공 시작(Process Start)**을 실행합니다.
   - 가공 완료(정상 종료) 후, 화면에 여전히 삼각형만 표시되고 사각형과 원은 숨겨진 상태로 유지되는지 확인합니다.
   - 표시된 삼각형을 마우스로 선택하고 움직여 편집이 원활한지 확인합니다.
   - 레이어 리스트에서 숨겨진 사각형과 원의 눈모양 아이콘을 다시 클릭하여 노출시켰을 때, 정상적으로 표시되고 마우스로 선택/편집이 가능한지 확인합니다.

2. **도형 개별 숨김 상태 보존 검증 (임의 정지)**:
   - 사각형과 원을 숨겨둔 상태에서 가공을 시작합니다.
   - 가공 도중 **임의 정지(Stop)** 버튼을 클릭하여 공정을 중단시킵니다.
   - 공정이 중단된 직후, 가공 전 숨겨두었던 사각형과 원이 계속 숨겨진 상태로 유지되는지 검증합니다.
   - 노출된 상태였던 삼각형만 정상 복구되어 편집 가능하게 활성화되는지 확인합니다.

3. **마스터 눈모양 아이콘 연동성 검증**:
   - 가공 종료/중단 후, 일부만 숨겨진 상태인 경우 전체 레이어 마스터 토글(`allObjectsHidden` 상태)이 올바른 상태(전부 숨겨진 게 아니므로 켜진 상태)로 유지되는지 점검합니다.
