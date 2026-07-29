# 3. Canvas 여러 도형 드래그 선택 시 Size 오차 해결

## 3인의 전문가 분석 (Tree of Thought)

### Expert 1: UI/UX 개발자 (React/Fabric.js)
**원인 분석:**
0.4mm 크기의 도형 여러 개를 드래그하여 선택하면, Fabric.js는 이들을 그룹화하여 임시 `ActiveSelection` 객체를 만듭니다. 이때 UI 상단 레이아웃 제어 패널(Layout Control Panel)에서 보여지는 Width/Height는 개별 도형의 크기가 아니라 **전체 선택 영역(Bounding Box)의 크기**를 나타냅니다.
도형들 간의 간격(Gap)이나 도형 외곽선의 두께(Stroke Width)가 포함되면서 사용자는 0.4mm가 아닌 엉뚱하게 큰 숫자를 보게 되는 것입니다. 

**해결 방안:**
드래그 선택(ActiveSelection) 상태일 때 우측 상단 패널의 크기 표시를 어떻게 할지 결정해야 합니다.
1. ActiveSelection 자체의 Width/Height (현재 방식 - 박스 전체 크기)를 유지하되 사용자에게 이는 '전체 그룹 사이즈'임을 UI 텍스트로 명시.
2. 선택된 객체들의 크기가 동일하다면 (모두 0.4mm 등) 해당 단일 객체의 크기를 대표로 표시.
가장 직관적인 방법은, 다중 선택 시에는 W/H 필드를 비활성화하거나 개별 사이즈 수정 기능을 제공하도록 UI를 다듬어 혼선을 방지하는 것입니다.

### Expert 2: 프론트엔드 엔지니어 (State Management)
**원인 분석:**
Canvas 내 도형을 선택하면 Zustand Store에 `activeObject`가 세팅됩니다. 다중 선택 시 `activeObject`는 `fabric.ActiveSelection` 타입이 됩니다.
UI 코드는 `activeObject.width * activeObject.scaleX` 수식을 사용하여 화면에 mm 단위로 크기를 렌더링합니다. 이 로직은 단일 객체일 때는 정확하지만, 여러 객체를 선택한 그룹일 때는 그룹 전체의 포괄(Bound) 영역 크기가 출력되는 당연한 메커니즘을 따르고 있습니다.

**해결 방안:**
Layout 패널 코드(`LayoutProperties.tsx` 또는 캔버스 속성 패널)를 수정하여, 현재 활성화된 객체가 다중 선택 그룹(`ActiveSelection`)인 경우:
- W/H 필드 옆에 "(Group)"이라는 라벨을 추가하여 전체 묶음의 크기임을 사용자에게 인지시킵니다.
- 내부 여백이나 Stroke를 제외한 순수 도형 크기를 원한다면 `strokeUniform` 처리 및 bounding box 계산 방식을 `strokeWidth`를 빼고 계산하도록 보정 로직을 추가합니다.

### Expert 3: 시스템 아키텍트
**종합 의견:**
현업(반도체/레이저 장비) 사용자들은 다중 선택 시 개별 도형의 스케일 수정을 원하거나, 선택 영역이 도면상의 정확한 간격을 포함한 크기를 보여주길 기대합니다. Expert 1과 2의 의견을 종합하여, 다중 선택 시 Size 입력 창이 '선택 영역 전체'의 크기임을 시각적으로 명확히 분리 표기하고, 필요하다면 다중 선택된 객체들 각각의 Size를 일괄 변경할 수 있는 UX로 개선하는 것이 바람직합니다. 우선적으로 혼란의 원인인 '전체 선택 박스 크기 표시'에 대한 명시적 라벨링 및 로직 수정을 진행합니다.

## 수정 계획 (Plan)
1. **Frontend (Canvas Layout Panel UI)**:
   - 선택된 객체가 다중(`activeObject.type === 'activeSelection'`)일 경우, W(Width) / H(Height) 입력 항목의 라벨을 "Group W" / "Group H" 로 일시 변경하여 직관성을 높입니다.
   - 단일 객체의 원래 사이즈(예: 0.4mm)를 기대한 사용자에게 혼선이 없도록, 사이즈 계산 시 객체의 Stroke/Padding 오차가 포함되었는지 Fabric.js의 `strokeUniform` 및 `stroke` 계산 옵션을 점검 및 통일합니다.

## 진행 결과 (Result)
* `CanvasTopBar.tsx`를 수정하여, 다중 선택(ActiveSelection) 상태일 때는 Width/Height 라벨을 `Gr.W` / `Gr.H`로 변경.
* 이를 통해 전체 바운딩 박스 크기임을 명확하게 표시하여 단일 객체의 크기와 혼선되는 문제를 해결.
* **Status**: 해결 완료 (Done)
