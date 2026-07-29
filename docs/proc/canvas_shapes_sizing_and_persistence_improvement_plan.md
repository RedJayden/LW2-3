# Canvas 도형 다중 선택 치수 오차 및 레시피 저장/로드 크기 드리프트 개선 계획서

본 계획서는 사각형, 수직선, 수평선 등의 도형을 다중 선택했을 때 치수가 원래 설계한 1mm와 다르게 미세하게 어긋나서 표시(예: 1.003mm, 1.009mm)되고, 이를 2mm로 변경 시 개별 도형의 크기가 정확히 2mm가 되지 않는 현상 및 레시피 저장 후 로드했을 때 치수가 소수점 단위로 흔들리는 문제를 해결하기 위한 개선 방안을 담고 있습니다.

---

## 1. 3인의 전문가 분석 및 협의 결과 (Expert Collaboration)

### 👨‍💻 Expert 1: UI/UX 전문가 (User Experience & Interface Design)
* **문제 진단**: 사용자가 모든 도형(사각형, 수직선, 수평선)을 1mm로 정확히 그렸음에도 불구하고, 다중 선택(`Gr.W`, `Gr.H`) 시 `1.003`, `1.009`와 같이 정수가 아닌 값이 표시되는 것은 사용자에게 직관적이지 못하며 인지 부조화를 유발합니다. 또한 2mm를 입력해 일괄 수정한 결과가 개별 도형에 정확히 2mm로 반영되지 않는 현상은 치수를 신뢰해야 하는 장비 제어 UI로서 심각한 신뢰도 저하를 낳습니다.
* **해결 방안**: 다중 선택(ActiveSelection) 상태일 때 노출되는 `Gr.W` 및 `Gr.H` 역시 선 두께(Stroke Width)를 완전히 배제한 **순수 기하학적 크기(Logical Size)**를 기준으로 보여주어야 합니다. 또한 사용자가 크기를 수정했을 때 각각의 자식 도형이 정확히 입력한 목표값(2mm)으로 비율이 계산되도록 스케일링을 수행하여 UX 일관성을 달성해야 합니다.

### 📐 Expert 2: Canvas & Fabric.js 그래픽스 전문가 (Graphics Engine)
* **문제 진단**: Fabric.js의 기본 메커니즘에서 다중 선택 영역인 `ActiveSelection`의 너비와 높이는 자식 객체들의 visual bounding box(선 두께 `strokeWidth` 포함)의 합으로 계산됩니다. 이로 인해 기하학적 크기가 1mm인 도형들이라도 획 두께가 더해져 `1.003mm` 등으로 과장되어 표기됩니다.
* 이 상태에서 사용자가 `Gr.W` 값을 `2`로 수정하면, 스케일링 비율은 `2.0 / 1.003 = 1.994`배로 계산되어 그룹의 `scaleX`에 세팅되며, 최종적으로 자식 도형의 크기는 `1.0 * 1.994 = 1.994mm`가 되는 수학적 오류가 발생합니다.
* **해결 방안**: 자식 객체들의 원래 변환 행렬(`calcTransformMatrix`)과 strokeWidth를 제외한 순수 로컬 크기(`width/2`, `height/2`)를 활용하여 다중 선택 그룹 내의 **논리적 경계 상자(Logical Bounding Box)**를 구하는 헬퍼 함수 `getGroupLogicalSize`를 구현합니다. properties 갱신 및 입력 제어 시 이 논리적 크기를 기준으로 스케일을 계산하도록 `CanvasTopBar.tsx`를 수정합니다.

### ⚙️ Expert 3: Laser 및 Motion 제어 전문가 (Laser/Motion System Coordinator)
* **문제 진단**: 레이저 가공 경로는 그래픽 UI상의 획 두께와 무관하게 설계상 기하학적 치수를 추종해야 합니다. 또한, 사용자가 그린 레시피를 파일로 저장하고 불러올 때 치수가 미세하게 흔들리는(drift) 현상은 저장 시점에 캔버스의 로컬 픽셀(raw pixel) 좌표를 그대로 저장하고, 불러올 때도 현재 장비의 배율(`pxPerMm`)과 동기화하지 않은 채 픽셀 값을 1:1로 로드하기 때문입니다. 렌즈 캘리브레이션 픽셀 정밀도가 변동되거나 기종/모드가 달라지면 픽셀 좌표가 다르게 해석되어 치수 변화가 발생합니다.
* **해결 방안**: 레시피를 저장하거나 불러올 때 데이터를 항상 **1000 px/mm 표준 해상도로 정규화/역정규화**하는 파이프라인을 거쳐야 합니다. 다행히 시스템에는 이를 위한 `canvasNormalization.ts` 모듈이 기 구현되어 있으므로, 파일 저장 및 불러오기 핸들러가 포함된 `LeftNav.tsx`에 이를 접목하여 데이터 영속성 상의 치수 무결성을 확보합니다.

---

## 2. 구체적인 Proposed Changes (제안된 변경 사항)

### [Component 1] UI Properties 제어 계층 (`PropertyBar`)

#### [MODIFY] [CanvasTopBar.tsx](file:///c:/LNG/Source/LW2-3_INC_260616/Portal/src/ui/pages/Recipe/PropertyBar/CanvasTopBar.tsx)
1. **`getGroupLogicalSize` 헬퍼 함수 추가**:
   - `ActiveSelection`에 속한 모든 자식 객체를 순회하며, 각 자식 객체의 strokeWidth를 무시한 순수 꼭짓점들을 구합니다.
   - 자식 객체의 로컬 꼭짓점 `(-halfW, -halfH)` ~ `(halfW, halfH)`을 `obj.calcTransformMatrix()`를 사용하여 그룹 로컬 좌표계로 투영한 뒤, 전체 꼭짓점을 아우르는 최솟값/최댓값 범위를 산출하여 그룹의 논리적 너비와 높이를 구합니다.
2. **Properties 화면 표시 로직 갱신**:
   - `isGroup`이 true인 경우, `selectedObject`의 width/height 대신 `getGroupLogicalSize`로 구한 언스케일드 논리적 크기에 `selectedObject.scaleX` / `selectedObject.scaleY`를 곱한 값을 사용하여 mm 치수를 화면에 바인딩합니다.
3. **Properties 수동 입력 수정 로직 갱신**:
   - 사용자가 `width` 또는 `height`를 입력했을 때, `isGroup`이 참이라면 `getGroupLogicalSize`로 구한 논리적 크기를 기준으로 스케일 비율을 산출하여 그룹의 `scaleX`/`scaleY`를 업데이트합니다.

---

### [Component 2] 파일 입출력 및 데이터 영속성 계층 (`LeftNav`)

#### [MODIFY] [LeftNav.tsx](file:///c:/LNG/Source/LW2-3_INC_260616/Portal/src/ui/shell/LeftNav.tsx)
1. **좌표계 정규화 모듈 연동**:
   - `canvasNormalization.ts`로부터 `normalizeToStandard`, `denormalizeFromStandard` 함수를 가져옵니다.
2. **프로젝트 저장 (`handleSaveProject`) 개선**:
   - `canvas.toObject(...)`를 통해 추출한 raw JSON 데이터에 `normalizeToStandard(json, pxPerMm)`를 적용하여 표준 스케일(1000 px/mm)로 정규화한 뒤 백엔드 저장 API를 호출합니다.
3. **프로젝트 로드 (`handleLoadProjectChange`) 개선**:
   - 로드한 raw JSON 데이터를 파싱한 후, `denormalizeFromStandard(rawJson, pxPerMm)`를 적용하여 현재의 `pxPerMm` 배율에 맞는 로컬 픽셀 공간으로 역변환한 뒤 `canvas.loadFromJSON`에 주입합니다.

---

## 3. Verification Plan (검증 방안)

### 3.1. 수동 및 기능 검증 (Manual Verification)
1. **다중 선택 영역 치수 표시 검증**:
   - 사각형(1mm), 수직선(1mm), 수평선(1mm)을 그린 뒤 세 도형을 모두 드래그하여 선택하고 `Gr.W`와 `Gr.H` 치수가 정확히 `1.000mm`로 나오는지 확인합니다.
2. **다중 선택 영역 치수 변경 검증**:
   - 다중 선택된 상태에서 `Gr.W` 값을 `2`로 변경하여 일괄 수정을 진행합니다.
   - 이후 개별 도형들을 각각 클릭하여 단독 선택했을 때 치수가 정확히 `2.000mm`로 설정되는지 검증합니다.
3. **레시피 파일 저장 및 로드 치수 일관성 검증**:
   - 다양한 크기의 도형(사각형, 원, 선 등)을 다수 그린 뒤 레시피 파일로 수동 저장합니다.
   - 프로그램을 재시작하거나 다른 렌즈 모드(예: Scanner ↔ Object)로 전환한 후 저장된 레시피를 불러옵니다.
   - 다시 로드된 도형들의 치수가 단 1㎛의 오차도 없이 원래 그린 치수 그대로 완벽하게 보존되는지 확인합니다.
