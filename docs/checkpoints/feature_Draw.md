# Draw Feature (Canvas & Shapes) Checkpoint

## 1. 개요 (Overview)
본 문서는 Portal UI(React/Fabric.js 기반) 캔버스에서 도형(Draw)을 처리하고 스캐너(SinoGalvo 등)로 가공 데이터를 전달하는 과정에서 확인된 문제점과 그 해결 과정을 기록합니다. 특히, 스캐너 설정의 실시간 반영, Dot 도형의 시인성 개선 및 매트릭스(배열) 생성 시의 객체 넘버링 등 최신 업데이트 사항을 포함합니다.

## 2. 주요 개선 및 수정 사항

### 2.1 스캐너 실시간 설정 적용 개선 (`PortalRouterHandler.cpp`)
* **이슈**: 사용자가 UI에서 왜곡 보정 계수 및 스캐너 스케일 설정을 변경하여 저장하더라도, C++ 백엔드의 메모리 및 JhcLib 하드웨어 컨트롤러에 즉각 반영되지 않아 재부팅이 필요했습니다.
* **해결**: `HandleConfigSetScanner` 함수 내에서 `gc.SaveConfig()`가 성공했을 때, 스캐너가 열려있는 상태(`IsOpen()`)라면 `SetDefaultCorrectionSet()`와 `SetDefaultParameters()`를 즉시 호출하도록 코드를 추가했습니다. 이를 통해 런타임 중에도 보정값과 마킹/점프 속도가 실시간으로 하드웨어에 반영됩니다.

### 2.2 Dot 도형 캔버스 가시성 최적화 (`useCanvasEvents.ts`)
* **이슈**: Dot 도형의 물리적 크기(0.001mm)를 캔버스 좌표계로 그대로 렌더링할 경우 크기가 너무 작아 줌 아웃 시 화면에서 식별하기 어려운 문제가 있었습니다.
* **해결**: 시인성 극대화를 위해 픽셀 기준 반지름(`visualRadius = 5`)으로 렌더링하고, `customData.isConstantSize: true` 속성 및 `scaleX: 1/zoom`, `scaleY: 1/zoom` 옵션을 부여했습니다. 이로써 줌 레벨을 조작해도 캔버스 상에서 항상 일정한 시각적 크기를 유지하며 명확히 식별할 수 있도록 개선되었습니다.
* **추가 개선**: 이후 사용자 피드백을 반영하여 화면에서의 시인성을 더욱 정교하게 조율했습니다. 점(Dot) 표현은 2px 크기의 심플한 원형으로, 중심 마커는 기존 십자선(+) 대신 X 모양의 3px 선으로 변경하여 다른 도형과의 구분을 명확히 했습니다.

### 2.3 매트릭스 생성 시 네이밍 및 순차 넘버링 자동화 (`useMatrixGenerator.ts`)
* **이슈**: 매트릭스(Matrix Array)로 객체를 대량 복제할 때, 모든 복제본들이 원본과 동일한 이름을 가져 LayerList(객체 트리)에서 개별 객체를 구분하기 어려웠습니다.
* **해결**: 매트릭스 생성 시 원본 도형 이름에 `(Original)` 태그를 부착하고, 복제된 객체들(예: Dot 2, Dot 3...)은 원본 이름의 숫자 접미사를 파싱해 배열 인덱스 순서대로 자동 증가 넘버링을 부여하도록 로직을 수정했습니다.

### 2.4 100x100 이상의 도트 매트릭스 최적화 아키텍처 (2026-07-20 완료 — §4.11 참조)
* **이슈**: 수만 개의 점을 개별 `fabric.Circle` 인스턴스로 생성할 경우 Canvas DOM 렌더링 및 상태 전파 성능이 심각하게 저하됩니다.
* **당초 계획(폐기)**: `fabric.Object`를 상속하는 별도 클래스 `fabric.DotMatrix`를 신설하는 방향을 검토했으나, 이미 존재하던 `MatrixRepeater`(§4.11) 자체에 Flyweight 캐시를 얹는 쪽이 개별 셀 선택/override 기능과의 호환성이 높아 최종적으로 채택되었습니다. 실제 구현 내용은 §4.11에 기록되어 있습니다.

### 2.5 상단 Edit 패널(CanvasTopBar) UI/UX 모던화
* **이슈**: 우측에 위치한 Matrix 기능 버튼이 좌측 패널 확장에 의해 밀려 가려지거나, 불필요한 체인(Link) 아이콘이 공간을 차지하여 전체 텍스트 입력창들의 세로 열(Column)이 깔끔하게 정렬되지 않는 UX 불편함이 있었습니다.
* **해결**: Layout과 Style 섹션을 모두 완벽한 정렬의 CSS Grid 구조로 재작성했습니다. 비율 고정 체인 아이콘을 삭제하여 6컬럼 Grid로 압축하고, Matrix 버튼 및 Fill Settings 옵션을 Style 섹션 바로 우측으로 끌어와 어떠한 창 크기에서도 메뉴가 가려지지 않고 논리적인 시선 흐름으로 배치되도록 레이아웃을 전면 개편했습니다.

### 2.6 가공 속도(Mark Speed) 소수점 세밀 제어 입력 로직 개선
* **이슈**: 우측 스캐너/오브젝트 가공 패널에서 Mark Speed 값을 0.9 등으로 수정하려 할 때, 키보드로 '0'을 누르는 즉시 값이 0.001로 강제 고정되거나 소수점이 삭제되어 세밀한 제어가 불가능했습니다.
* **해결**: `onChange` 이벤트 핸들러에서 이루어지던 즉각적인 최소값(0.001) 검사 및 소수점 자리수 강제 포맷팅 로직을 제거하고, 타이핑 중에는 순수 문자열 기반의 임시 입력만을 허용하도록 수정했습니다. 이후 입력 폼에서 포커스를 잃거나 입력을 완료하는 시점(`onBlur`)에만 보정 및 포맷팅이 실행되도록 React 폼 생명주기를 완벽히 분리하여 입력 간섭 버그를 제거했습니다.

### 2.7 클립보드 복제(Ctrl+C/V) 도형의 선 굵기 증가 버그 수정 (2026-07-17)
* **이슈**: 도형을 복사/붙여넣기하면 복제본의 외곽선이 원본(화면상 2px 헤어라인)보다 굵게 그려지고, 레시피 저장 후 재로드해도 증상이 유지되었습니다.
* **원인**: 도형 외곽선은 `strokeWidth = 2/zoom` + `isHairline` 플래그로 생성되고 줌 변경 시 `isHairline` 객체만 2px로 재계산되는데, `useClipboardSystem.ts`의 clone 속성 목록(`customProps`)에 `isHairline`/`strokeUniform`이 누락되어 복제본이 갱신 대상에서 제외 → 복제 시점(저줌 상태)의 큰 픽셀 굵기로 동결. strokeWidth는 저장/로드 시 충실히 왕복되므로 증상이 영속화되었습니다.
* **해결**:
    1. 클립보드 clone 속성 목록에 `isHairline`, `strokeUniform`, `customData` 추가.
    2. LeftNav 수동 레시피 저장 직렬화 목록에도 누락돼 있던 `isHairline` 추가 (자동저장 목록과 일치화).
    3. 자동저장 로드 후처리(RecipeCanvas)에서 `isHairline` 객체의 strokeWidth를 `2/zoom`으로 즉시 재정규화 → 과거에 굵은 값으로 저장된 레거시 레시피도 로드 시 자가 치유.
* **⚠️ 규약**: fabric 객체를 복제/직렬화하는 새 경로를 추가할 때는 커스텀 속성(`isHairline`, `strokeUniform`, `customData`) 포함 여부를 반드시 확인할 것.

## 3. 보류된 이슈 분석: 매트릭스 배열 좌표계 축소 현상 (2026-07-20 해결됨 — §6.1/§6.7 참조)
* **이슈 진단 (Tree of Thought 도출)**:
  * 초기에는 Dot 도형 매트릭스가 극심하게 축소되어 마킹되는 현상을 SinoGalvo SDK(`SchOutPoint`)의 0.01mm 스케일 문제로 오인하여 C++ 측에서 `100.0f`를 곱하는 방식으로 수정할 계획이었습니다.
  * 그러나 **다른 도형(Line, Circle 등)은 정상적으로 가공**된다는 사실을 토대로 C++ SDK의 단위 변환에는 이상이 없음이 증명되었습니다.
  * 실제 원인은 프론트엔드(`useMatrixGenerator.ts`)의 **ActiveSelection(다중 선택 상태)** 매트릭스 생성 버그로 밝혀졌습니다. 다중 선택 상태의 객체들을 복제할 때, 그룹 중심 기준의 '상대 좌표'를 전역 캔버스 좌표로 올바르게 재계산(`calcTransformMatrix()`)하지 않고 추가하여 복제된 모든 점들이 캔버스 원점(0,0) 주변에 뭉쳐서 나타나는 수학적 오류였습니다.
* **이후 경과**: 당시에는 보류(Hold) 처리되었으나, 이후 매트릭스 원점 위치 버그(§4.9)와 가공 커맨드 절대 위치 버그(§4.15)가 별도 세션에서 근본적으로 재설계·수정되면서 이 현상 자체가 해소되었습니다. ActiveSelection 상대 좌표 정규화 로직은 `useMatrixGenerator.ts`의 `generateMatrix()`에 여전히 존재하므로, 다중 선택 기반 매트릭스 생성에서 유사 증상이 재발하면 이 절과 §4.9를 함께 참조할 것.

## 4. 추가 버그 수정 및 개선 사항 (최신 업데이트)

### 4.1 원호(ARC) 형상 거울 반사/거대화 왜곡 현상 수정
* **이슈**: ARC 가공 시 Y축이 뒤집힌 것처럼 엉뚱한 사분면에 거대한 원형 궤적(켤레호)으로 찌그러져 가공되는 현상이 발생했습니다.
* **해결**: 하드웨어 제어 보드(`SinoGalvo`)의 `SchOutArc` API가 표준 수학 좌표계의 반시계 방향(CCW)을 따른다는 물리적 특성을 완벽히 파악했습니다. 이전 개발 과정에서 잘못 삽입되었던 +180도 위상차 보정 로직을 전면 제거하고, 캔버스 상의 중간점(Mid Point)이 CCW 궤적에 포함되는지를 검사하여 올바른 시작/종료 각도 방향으로 가공되도록 알고리즘을 최적화했습니다.

### 4.2 원호(ARC) 가공 위치(Offset) 어긋남 현상 완벽 수정
* **이슈**: ARC가 정확한 형상으로 그려짐에도 불구하고, UI 화면의 파란색 점선(바운딩 박스) 위치를 벗어나 엉뚱한 위치로 치우쳐서 가공되었습니다.
* **해결**: `Fabric.js` 엔진이 내부적으로 호(Arc)의 원점 `(0, 0)`을 항상 '온전한 원(Full Circle)'의 정중앙에 고정한다는 아키텍처적 특성을 파악했습니다. 기존 `ScannerGenerator.ts` 코드에서 원점을 '호의 좁은 바운딩 박스의 중심'이라고 착각하여 무리하게 오프셋(`bboxLocalX`, `bboxLocalY`)을 빼버리던 치명적 계산식을 전면 삭제하고 오프셋을 `0`으로 고정하여, 기하학적 중심 좌표를 있는 그대로 물리적 좌표로 직결하도록 수정했습니다.

### 4.3 가공 진행도(Process) 100% 도달 후 멈춤(Hang) 오류 해결
* **이슈**: 스캐너 프로세스가 끝난 뒤에도 UI 화면의 게이지가 100% / RUNNING 상태로 무한정 멈춰있는 현상이 있었습니다.
* **해결**: C++ 백엔드의 `CheckMarkingState()` 루프에서, 하드웨어가 가공을 마치고 Idle 상태(`GetMarkingState() == 1`)를 리턴했음에도 불필요하게 상태 비트 플래그를 이중으로 검사하다가 플래그 타이밍을 놓쳐 무한 대기하는 무결성 결함을 발견했습니다. Idle 상태 확인 시 즉각적으로 무한 루프를 탈출하고 프로세스를 종료시키도록 대기 조건을 완화하여 해결했습니다.

### 4.4 캔버스 상단 치수 편집 창 '0' 입력 오류 수정
* **이슈**: 폭(W) 또는 높이(H) 치수 편집 시, `0.5` 등을 입력하기 위해 첫 글자로 `0`을 누르는 순간 즉각적으로 최소값인 `0.001`로 변형되어 입력이 방해받았습니다.
* **해결**: 최소 제한(Clamping) 하한값을 임시로 `0`까지 열어두도록 `Math.max(0, ...)`으로 완화하여, 중간 타이핑 과정의 `0`이 올바르게 보존되고 매끄러운 텍스트 편집이 가능하도록 UX를 개선했습니다.

### 4.5 프로그램 기동 시 UI 복원 정상화 및 2-Step 안착
*   **이슈**: 이전 세션 종료 시 오브젝트 상태였던 렌즈 모드가 프로그램 재시작 시 서브 타이틀바의 렌더 타이밍 꼬임(경쟁 상태)에 의해 스캐너로 오염되던 UI 크래시 및 오작동 문제.
*   **해결**: `AppShell.tsx` 마운트 즉시 동기식으로 이전 렌즈 설정을 락인하여 렌더링하도록 훅 순서를 개편했고, 기동 직후 백엔드 좌표계와 일치시키는 `syncOnly` 프로토콜을 성공적으로 연동하여 2-Step 핏카메라 안착의 신뢰성을 확보했습니다.

### 4.6 Move to Center 오리지널 좌표 원점 복귀 연동
*   **이슈**: JOG 수동 테스트 도중 원래의 각 렌즈별 원점으로 물리적인 절대 좌표 원클릭 복귀의 필요성.
*   **해결**: 우측 하단의 `Move to Center` 버튼 클릭 시 `forceAbsolute: true` 를 전달받아, 스캐너 오리지널 X, Y 원점을 기준으로 각 오브젝트 배율 오프셋 값을 가감한 절대 합산 좌표로 정확히 강제 이동(`MovAbs`)하도록 제어를 완료했습니다.

### 4.7 상단 Edit 바(Layout) 숫자 입력 오작동 및 렌더러 크래시 수정 (2026-07-17)
* **이슈**: 도형 선택 후 Layout(X/Y/ang/W/H) 입력창에서 전체 선택 → `0.8` 입력 시 `0.001`로 변형되거나 거대한 이상 수치(예: Gr.W 320000)가 표시되고, 드래그 선택/타이핑 중 간헐적으로 웹 UI(CEF)가 크래시하는 현상.
* **원인 (Root Cause)**:
    1. Layout 입력들이 `onChange` **키 입력 한 글자마다** `handleChange`를 통해 Fabric 객체에 즉시 반영되는 구조였음 — §2.6/§2.25에서 확립한 onBlur 생명주기 분리가 우측 가공 패널에만 적용되고 Edit 바에는 미적용.
    2. `0.8` 타이핑의 첫 글자 `'0'`이 즉시 커밋되어 `scaleX = 0`(특이행렬)이 객체에 적용 → 이후 컨트롤드 인풋이 객체 재역산 값과 타이핑 문자열 사이에서 경쟁(re-sync race)하며 수치 오염, NaN/Infinity 전파 시 렌더링 크래시.
* **해결 (CanvasTopBar.tsx)**:
    - **draft 상태 + 커밋 생명주기 분리**: `onChange`는 draft 문자열 보존만 수행(객체 미반영), **onBlur/Enter 시점에만 검증 후 1회 커밋**, Escape는 커밋 없이 원복. 커밋 후 20ms 지연으로 Fabric 실제 상태 기준 표시값 재동기화.
    - **커밋 검증 강화**: `isNaN` 대신 `Number.isFinite` 사용(`1e999` 등 Infinity 유입 차단), W/H 하한을 `0.001mm`로 복원(§4.4의 0 완화는 중간 타이핑 보존용이었으나 커밋 일원화로 불필요해짐).
    - **특이행렬 방어**: `scaleX`/`scaleY` 적용 직전 `Number.isFinite && > 0` 가드를 두어 0/NaN/Infinity 스케일의 객체 유입을 원천 차단 — 해칭 `_renderFill` 등 렌더링 파이프라인의 크래시 방지.

---

### 4.8 그룹(DXF Import) 크기 표시 제곱 버그 및 캔버스 클릭 시 Edit 바 미반영 (2026-07-20)
* **이슈 1 (Gr.W/Gr.H 제곱 표시)**: DXF 임포트로 여러 엔티티가 `fabric.ActiveSelection`으로 묶이면 그룹 자체에 `scaleX/scaleY = pxPerMm`(≈1000)이 걸리는데, `CanvasTopBar.tsx`의 `getGroupLogicalSize()`가 `obj.calcTransformMatrix()`(그룹 변환 포함, 이미 절대 크기)로 계산한 결과에 호출부에서 `selectedObject.scaleX`를 **한 번 더 곱해** 표시값이 제곱되어 실제 ~10mm급 크기가 10,000mm급으로 부풀려 보이던 버그. §4.7에서 고친 onBlur 커밋 분리 문제와는 별개의, 그룹 전용 산식 버그. 중복 곱셈 제거로 수정.
* **이슈 2 (캔버스 클릭 시 미반영)**: Layout 입력창에 값을 입력한 뒤 다른 입력창이 아니라 캔버스(도형)를 클릭하면 `onBlur`가 발생하지 않아 커밋되지 않던 문제(§4.7의 draft/onBlur 분리 자체는 정상 동작하지만, blur 이벤트가 애초에 안 일어남). Fabric.js 캔버스가 선택 유지를 위해 mousedown에서 브라우저 기본 blur를 막는 것이 원인 — 캔버스 mousedown을 capture 단계에서 가로채 포커스된 input을 명시적으로 blur시켜 커밋을 강제하도록 수정.
* **상세**: `docs/checkpoints/process preset.md` §6 참조.

### 4.9 매트릭스 위치 이탈 버그 및 Cancel 시 확정 매트릭스 삭제 버그 수정, 생성/편집 모드 분리 (2026-07-18)
* **이슈 1 (위치 이탈)**: 도형 1개로 매트릭스를 생성하면 원본 위치가 아닌 엉뚱한 곳에서 배열이 시작됨.
* **원인 1**: `useMatrixGenerator.ts`의 `generateMatrix()`가 `MatrixRepeater`를 `left: activeObject.left, top: activeObject.top, originX:'left', originY:'top'`로 배치했는데, 원본 도형은 대부분 `originX/Y='center'`라 **center 좌표를 top-left로 잘못 재해석**해 도형 절반 크기만큼 위치가 어긋났음.
* **해결 1**: `getSceneTopLeft(obj)` 헬퍼(`calcTransformMatrix()`로 로컬 코너를 변환해 origin·회전·스케일과 무관한 scene 좌상단을 구함, `CanvasTopBar.tsx`의 `getGroupLogicalSize`와 동일 기법)를 도입해 리피터 배치 기준으로 사용.
* **이슈 2 (Cancel 삭제)**: Apply로 매트릭스를 확정한 뒤 재선택해 Matrix/Grid Array 창을 다시 열고 Cancel을 누르면 확정된 매트릭스가 통째로 사라짐.
* **원인 2**: `clearMatrix()`가 `all` 플래그로 호출되면 이미 확정된(`isPreview:false`) 매트릭스까지 무조건 삭제. 더구나 확정된 `MatrixRepeater`를 재선택해 다이얼로그를 다시 열면 "편집 모드"가 아예 없어 기존 매트릭스를 새 원본으로 오인해 숨기고, 그 상태에서 Cancel하면 영구 삭제됨(원본 단일 도형은 Apply 시점에 이미 삭제되어 복구 대상도 없음).
* **해결 2**: **생성(Create)/편집(Edit) 모드**를 분리(`MatrixDialog.tsx`) — 선택된 오브젝트가 이미 `MatrixRepeater`면 편집 모드로 진입해 기존 값을 폼에 로드하고 `updateMatrixInPlace()`로 in-place 갱신(새 오브젝트 생성/원본 은닉 없음). `clearMatrix()`는 `isPreview===true`인 오브젝트만 대상으로 스코프를 좁혔고, 편집 모드의 Cancel은 다이얼로그 오픈 시점 스냅숏(`snapshotMatrix`/`restoreMatrixSnapshot`)으로만 되돌림.
* **Cancel 버튼 존치 여부 검토**: "LayerList 선택 후 Del로 삭제 가능하니 Cancel을 없애도 되는가?"라는 질문에 대해, Cancel(세션 내 변경만 되돌림)과 Del(전체 영구 삭제)은 목적이 다르다고 판단해 **Cancel 유지**로 결론. 위 두 버그가 근본 원인이었고 Cancel 자체의 설계 문제는 아니었음.

### 4.10 매트릭스 2개 중복 생성 경쟁 조건(Race Condition) 수정 (2026-07-18)
* **이슈**: 매트릭스 생성 페이지를 열면 Layer List에 그룹이 2개 생성됨.
* **원인**: §4.9의 모드 판별 `useEffect`가 다이얼로그 오픈 시 `setMatrixOptions()`를 추가로 호출해 `matrixOptions` 참조가 연달아 두 번 바뀌었고, `generateMatrix()`는 `clone()` 때문에 비동기라 **두 호출이 겹쳐 실행**되면서 각 호출의 `clearMatrix()`가 서로의 리피터가 아직 캔버스에 추가되기 전에 실행되어 둘 다 살아남는 경쟁 조건이 발생.
* **해결**: `useMatrixGenerator.ts`에 전역 세대(generation) 토큰(`globalGenerationId`)을 도입해, `clone()` 대기 중 더 최신 호출이 시작되면 조용히 중단하도록 함. 다이얼로그 쪽에서도 값이 실제로 달라질 때만 `setMatrixOptions()`를 호출하도록 해 불필요한 중복 트리거 자체를 줄임.

### 4.11 100×100 매트릭스 성능 재설계 완료 — Flyweight 비트맵 캐시 + 뷰포트 컬링 (2026-07-18)
* **배경**: §2.4에서 계획만 되어 있던 대량 매트릭스 최적화를 실제로 구현. 별도 `fabric.DotMatrix` 클래스 대신, 기존 `MatrixRepeater`(`Portal/src/ui/pages/Recipe/Canvas/fabric/MatrixRepeater.ts`) 자체에 최적화를 추가하는 방향으로 결정 — 이미 구현되어 있던 개별 셀 클릭/override 기능(§2.3)과의 호환성이 관건이었기 때문.
* **[Design Pattern: Flyweight]**: override(위치/크기/색상)나 활성 선택이 없는 "평범한" 셀들은 동일 외형을 공유하므로, 소스 오브젝트를 오프스크린 캔버스에 **1회만 래스터화**해 캐시(`ensureCache()`)하고, `drawObject()`는 이런 셀에 대해 매 프레임 `ctx.drawImage()`만 호출(정식 fabric object render 생략). override가 있거나 현재 활성 선택된 셀만 기존처럼 개별 fabric 렌더링을 유지해 위치/크기/색상 조정 기능을 그대로 보존.
* **뷰포트 컬링**: `drawObject()` 진입 시 캔버스 가시 영역을 리피터의 로컬 좌표계로 1회 변환하고, 화면 밖 셀은 `drawImage`/렌더 호출 자체를 건너뜀 — 100×100(1만 셀)이어도 실제 그리는 비용은 화면에 보이는 셀 수로만 제한됨.
* **isConstantSize(줌 불변 크기, 예: Dot 마커) 최적화**: 캐시가 유효하면 줌이 바뀔 때만 다시 래스터화하고, override/활성 셀에 한해서만 매 프레임 `scaleX/scaleY` 재계산 + `setCoords()`를 수행 — 이전에는 전체 셀에 대해 매 프레임 수행되어 CPU 100%의 주 원인이었음.
* **커맨드 생성 측 최적화**: `ScannerGenerator.ts`의 MatrixRepeater 전용 생성 경로는 이전에 재귀 호출마다(`generatePass([src], ...)`) 자체 yield를 걸어 1만 셀이면 1만 번의 이벤트 루프 왕복이 발생했음. `suppressYield` 옵션으로 셀 단위 yield를 억제하고, 바깥 셀 루프에서 청크(기본 200셀) 단위로만 `await new Promise(r=>setTimeout(r,0))` 하도록 변경.

### 4.12 개별 매트릭스 셀 선택/편집 통합 및 셀별 Z-Offset·크기 override, Z-info 라벨 (2026-07-19)
* **이슈 1 (LayerList 선택 무반응)**: `getVirtualObjects()`가 LayerList 표시용으로 만드는 개별 셀 항목은 캔버스에 실제로 존재하지 않는 mock 오브젝트라, 이를 선택해 위치/크기를 바꿔도 반영되지 않음(캔버스에서 셀을 직접 클릭했을 때만 동작하던 `activeCellInfo` 기반 편집 경로와 별개의 죽은 경로였음).
* **해결 1**: `LayerList.tsx`의 `handleSelect()`가 매트릭스 개별 셀을 클릭하면 mock 오브젝트 대신 **실제 `MatrixRepeater`를 선택하고 `matrix:cell:selected` 이벤트를 재현**하도록 통일 — 캔버스 직접 클릭과 동일한 편집 경로를 타게 됨.
* **해결 2 (개별 셀 크기 조정)**: `MatrixOverride`에 `scaleX`/`scaleY`(소스 오브젝트 자연 크기 대비 상대 배율)를 추가하고 `MatrixRepeater.drawObject()`의 override 렌더 분기에 적용. `CanvasTopBar.tsx`의 W/H 편집 핸들러에도 `MatrixRepeater + activeCellInfo` 분기를 신설(기존엔 X/Y/Mark Time만 있고 W/H는 없어 전체 리피터를 스케일해버렸음). `ScannerGenerator.ts`/`useGCodeGenerator.ts` 양쪽 가공 커맨드 생성에도 동일 override를 반영해 화면과 실제 가공 크기를 일치시킴.
* **해결 3 (셀별 Z-Offset)**: `MatrixOverride.zOffset`(상대값, 매트릭스 전체의 `zStep × 셀 인덱스` 누적값 위에 추가)을 신설하고, `MatrixRepeater.computeAbsoluteZ(cellIndex, override, liveZ)` 헬퍼로 절대 Z 계산 공식을 단일화 — 캔버스 Z-info 라벨, `CanvasTopBar`의 "Cell Z(절대)" 필드, `ScannerGenerator`/`useGCodeGenerator`의 실제 `Z_MOVE` 커맨드가 모두 이 공식 하나를 공유.
* **해결 4 (Z-info 라벨 실제 구현)**: Matrix 다이얼로그의 "Show numbering & Z-info" 체크박스는 값만 저장될 뿐 캔버스에 아무것도 그리지 않는 미구현 기능이었음. `MatrixRepeater.showLabels`를 실제로 배선하고, `drawObject()`에서 **뷰포트 컬링을 통과한(화면에 보이는) 셀에 한해서만** `(row,col) Z:절대값`을 `ctx.fillText()`로 그리도록 구현 — 전체 셀 순회와 무관하게 화면에 보이는 셀 수로만 비용이 제한됨.
* **CanvasTopBar "Cell Z" 필드 의미 변경**: 도입 당시 상대 오프셋(기본 0)을 그대로 보여줘 "0=Z가 0으로 간다"는 오해 소지가 있었음 → 절대 Z(`현재 모션 Z + zStep 누적 + 셀별 오프셋`)를 표시/입력받고, 저장 시에는 역산해 `override.zOffset`(상대값)으로 변환하도록 수정.

### 4.13 매트릭스 셀 override가 선택 바운딩 박스를 벗어나 표시되던 버그 수정 (2026-07-19)
* **이슈**: 매트릭스의 특정 셀을 위치/크기 override로 명목 그리드 밖까지 옮기면, "Matrix Group" 전체 선택 시 표시되는 파란 선택 테두리 밖으로 그 셀이 튀어나와 보임.
* **원인**: `MatrixRepeater.updateBoundingBox()`가 `xCount × yCount` **명목(override 없는) 그리드 크기**만으로 `this.width/height`를 계산하고 개별 셀 override(`xOffset`/`yOffset`/`scaleX`/`scaleY`)는 전혀 반영하지 않았음. Fabric의 선택 테두리(`hasBorders`)와 히트테스트 모두 이 `width/height` 및 `left/top` 앵커에 의존하므로, override가 명목 범위를 벗어나면 렌더링은 정상인데 바운딩 박스 계산만 못 따라가는 것이었음.
* **해결**: `updateBoundingBox()`가 모든 override를 반영한 실제 확장 범위(`extMinX/Y ~ extMaxX/Y`)로 `width/height`를 넓히되, `left/top`을 함께 보정해 **override 없는 원래 배치의 scene 위치는 그대로 유지**하도록 함. "이전에 적용된 오프셋(`_boundsOffsetX/Y`)을 역산해 원상태를 복원한 뒤 새 오프셋을 다시 적용"하는 방식이라 드래그 이동/스냅숏 복원 등 어떤 경로로 `left/top`이 바뀌었든 항상 멱등(idempotent)하게 동작함. `drawObject()`의 셀 배치 공식과 `getCellSceneOrigin()`(외부에서 셀 scene 좌표를 구할 때 쓰는 공용 헬퍼, `CanvasTopBar`의 X/Y 표시·입력에도 사용)도 이 보정을 반영하도록 일반화됨.

### 4.14 MatrixRepeater 직렬화(저장/복원) 미지원으로 인한 매트릭스 소실 버그 수정 (2026-07-20)
* **이슈**: 매트릭스 생성 후 다른 페이지로 이동했다가 Recipe/Scanner로 복귀하면 매트릭스가 사라짐. 편집창을 다시 열고 Cancel해도 사라짐.
* **원인**: `RecipeCanvas.tsx`(스코프 전환 시 `canvas.toObject()`/`loadFromJSON()`으로 저장·복원)와 `LeftNav.tsx`(수동 저장/불러오기)가 JSON 라운드트립을 쓰는데, `MatrixRepeater`는 커스텀 `toObject()`/`fromObject()`가 전혀 없었음. 생성자가 `super([], options)`로 호출되어 Fabric이 인식하는 실제 그룹 자식은 항상 비어있고(`sourceObjects`는 별도 커스텀 배열), `xCount/yCount/overrides` 등도 커스텀 속성이라 기본 직렬화가 저장하지 못함. 복원 시에는 부모 `fabric.Group`의 정적 `fromObject`가 상속되어 실행되는데, Group은 `new this(objects, options)`(2인자)로 생성자를 호출하는 반면 이 클래스의 생성자는 `constructor(options)` 단일 인자만 받아 완전히 어긋난 인자가 전달되어 `xCount=1, yCount=1, sourceObjects=[]`인 빈 껍데기로 복원됨.
* **해결**: `MatrixRepeater`에 커스텀 `toObject()`(스칼라 속성 + `sourceObjects.map(o=>o.toObject(...))`로 완전 직렬화)와 `static async fromObject()`(`fabric.util.enlivenObjects()`로 `sourceObjects`를 비동기 복원 후 **이 클래스의 실제 생성자 시그니처(단일 options 객체)**에 맞춰 재구성)를 구현.
* **후속 크래시**: 1차 수정 후에도 복원이 실패해 콘솔에 `this.layoutManager.performLayout is not a function`이 발생 — `super.toObject()`(Fabric 기본 `Group.toObject()`)가 함께 내보내는 `layoutManager`(순수 데이터, 실제 인스턴스 아님)를 그대로 생성자에 넘겨 `groupInit()` 내부의 `performLayout()` 호출이 크래시한 것. Fabric 자신의 `Group.fromObject`가 이 필드를 제거하고 생성자 기본값(`new LayoutManager()`)에 맡기는 것과 동일하게, `fromObject()`에서 `layoutManager`/`objects`/`type`을 제거하고 생성자에 넘기도록 수정.
* **한계**: 이 버그가 있던 상태에서 이미 저장된 레시피는 애초에 매트릭스 데이터가 저장되지 않았으므로 소급 복구는 불가능 — 수정 시점 이후 새로 저장하는 매트릭스부터 정상 보존됨.

### 4.15 매트릭스 절대 위치·색상 그룹핑 버그 (Scanner/Object 가공 커맨드 생성) (2026-07-20)
* **이슈**: 매트릭스를 원점에서 떨어진 위치에 두고 가공하면 오버레이 위치가 아닌 엉뚱한(우측 하단 대각선 방향) 위치에 가공됨. Generated Commands 패널에서 매트릭스가 `Color #000000`(검은색)으로 잘못 그룹핑됨.
* **원인 1 (절대 위치)**: `ScannerGenerator.ts`/`useGCodeGenerator.ts`의 MatrixRepeater 전용 생성 경로가 셀 위치를 `col × xSpacing + xOffset`으로만 계산하고 **매트릭스 자체의 실제 scene 위치(`repeater.left/top`)를 빼먹고** 있었음(죽은 변수 `cx = obj.left + dx`만 계산해두고 실제로는 쓰지 않던 코드가 증거로 남아있었음). 셀 간 상대 간격은 맞았지만 매트릭스 전체가 캔버스 원점 근처의 좌표로 가공되던 것.
* **해결 1**: §4.13에서 만든 `MatrixRepeater.getCellSceneOrigin(row, col, override)`(렌더링·`CanvasTopBar` 표시와 공유하는 단일 진실 공급원)로 두 생성기의 셀 위치 계산을 교체.
* **원인 2 (색상 그룹핑)**: `utils/colorUtils.ts`의 `resolveObjectColorHex(obj)`가 `obj.stroke`/`obj.fill`을 직접 읽는데, `MatrixRepeater`에 호출되면 실제 셀을 그리는 `sourceObjects[0]`이 아니라 리피터 자신의 fabric.Group 기본값(검은색)을 반환함. 이 함수는 `useCanvasColorGroups.ts`(우측 CurrentLayer 패널의 레이어 스와치)와 `ScannerGenerator.ts`의 `groupByColorPreset()`(가공 시 색상별 그룹핑) 양쪽에서 쓰이므로, 매트릭스가 두 곳 모두에서 "검은 레이어"로 잘못 분류되고 있었음.
* **해결 2**: `resolveObjectColorHex()`가 `MatrixRepeater`면 `sourceObjects[0]`을 읽도록 단일 지점에서 수정 — 이 함수를 쓰는 모든 소비처가 한 번에 정상화됨.
* **상세**: `docs/checkpoints/feature_Scanner.md` §6.9 참조(가공 커맨드 생성 관점의 상세 기록).

### 4.16 CanvasTopBar Fill/Line 표시 버그 및 불필요한 UI 텍스트 제거 (2026-07-20)
* **이슈**: 매트릭스를 선택하면 상단 Edit 바의 Fill/Line 색상이 실제 셀 색상이 아닌 검은색으로 표시되고 Fill 체크박스가 의도치 않게 켜짐.
* **원인**: `CanvasTopBar.tsx`의 `firstObj` 판별(Fill/Line 편집 필드 및 속성 표시에 쓰는 대표 오브젝트)이 `isGroup`(ActiveSelection/Group)만 고려하고 `MatrixRepeater`는 고려하지 않아, 매트릭스 자신(fabric.Group 기본값)을 그대로 읽고 있었음.
* **해결**: `firstObj` 계산에 `selectedObject.type === 'MatrixRepeater'`분기를 추가해 `sourceObjects[0]`을 읽도록 수정(속성 표시용 useEffect와 Fill Settings 다이얼로그 토글 useEffect 두 곳 모두). 셀 선택 시(§4.12) override의 `fill`/`stroke`도 함께 반영.
* **UI 정리**: Layout 바에 표시되던 "1x·Nmm/s·N%·Z..." 색상 프리셋 요약 텍스트(우측 CurrentLayer 패널과 정보 중복)를 사용자 요청에 따라 제거.

### 4.17 파일 Import/Export 통합 및 포맷 확장 (P1~P4-c 완료, 2026-07-22)
* **배경**: 좌측 툴바에 `Image (I)` / `Import SVG` / `Export SVG` / `Import DXF` 4개 버튼이 파일 **포맷 단위**로 분리되어 있어, 사용자가 자기 파일이 SVG인지 DXF인지 구현 세부를 직접 알고 골라야 했음. 또한 Import 실패 시 `console.error`만 남기고 **사용자 피드백이 전무**했음(`GlobalToast`가 존재하는데 미사용). 3인 전문가(UX/프론트 아키텍트/네이티브) 협의 계획서(`docs/proc/Import_Export_File_Integration_Plan.md`)에 따라 단계적으로 구현.

* **P1 — Import 통합 + TIFF + Toast**:
    * **[Design Pattern: Strategy + Dispatcher]** 4개 버튼 → `Import File (I)` 1개로 통합. 신규 `importFile.ts` 디스패처가 확장자/MIME을 판별해 형식별 전략(`importFromSVG` / `importFromDXF` / `importImage`)으로 위임. 단일 `<input>` `accept=".svg,.dxf,.png,.jpg,.jpeg,.bmp,.tif,.tiff,.webp,.gif"`.
    * **TIFF 지원**: Chromium(CEF)은 TIFF 코덱이 없어 `fabric.Image`로 직접 로드 불가 → `utif` 패키지 도입, 신규 `importImage.ts`에서 TIFF를 UTIF로 RGBA 디코딩 후 PNG dataURL로 변환해 기존 외곽선 처리 파이프라인에 투입. `Toolbar.tsx`에 있던 `processImageForOutline`(~140줄)을 `importImage.ts`로 이동.
    * **Toast 피드백**: 성공 시 "Imported foo.svg (SVG, 3 objects)", 미지원/실패 시 사유 명시(`useAppStore.showToast`). `importFromSVG`/`importFromDXF`는 `Promise<number>`(추가된 객체 수), `exportToSVG`는 `{ok, message}` 반환하도록 시그니처 개선.
    * **포맷 지원 결론**: 요청 8종 중 7종은 기지원, TIFF만 미지원이었고 UTIF 도입으로 8종 완전 커버.

* **P2 — Export 포맷 선택**:
    * **[Design Pattern: Strategy Registry]** `Export File` 버튼 → 앱 다이얼로그(파일명 + 포맷 ToggleButton: SVG/DXF/PNG/JPG/WebP/JSON). `canvasImportExport.ts`의 `exportCanvas(canvas, format, filename)`이 포맷별 전략으로 위임. **파일명에 확장자를 직접 입력하면 포맷 자동 선택**(요구사항).
    * raster(PNG/JPEG/WebP)는 신규 `exportToRaster`: 비디자인 객체(Paper/Grid/Guide/측정) 숨김 + Paper 영역 크롭(뷰포트 변환 반영, 긴 변 최대 4096px) → Base64 → `dialogSaveImage`(기존 카메라 스냅샷과 공유). JPEG는 흰 배경, WebP는 fabric 타입 제약으로 오프스크린 캔버스 재인코딩.
    * **왜 앱 다이얼로그 먼저?**: 데이터 직렬화는 네이티브 저장창 호출 **전에** 완료돼야 하므로 포맷을 미리 알아야 함. 파일명·형식만 앱에서 받고 위치/덮어쓰기 확인은 OS 네이티브 창이 담당(이중 다이얼로그 방지).

* **P3 — 드래그 앤 드롭**: `RecipeCanvas.tsx` 컨테이너에 `onDragOver`/`onDrop` 추가, P1 디스패처(`importFile`) 재사용. **다중 파일** 동시 드롭 지원, 파일별 성공/실패 Toast. (→ §4.18에서 Recipe 페이지 한정으로 제한)

* **P4 — DXF Export (신규 구현)**:
    * **[Design Pattern: Strategy + Builder]** 신규 `dxfExport.ts` — DXF는 쓰기 로직이 전무했음(`dxf-parser`는 읽기 전용). `useGCodeGenerator`가 이미 갖춘 좌표·기하 파이프라인을 미러링해 "출력을 G-code → DXF 엔티티로 교체"하는 방식으로 위험 최소화.
    * **포맷**: DXF R12 (AC1009) ASCII, mm 단위(`$INSUNITS=4`), CRLF. `DxfBuilder`가 group code 직렬화 담당.
    * **엔티티 매핑(네이티브 승격, P4-b)**: line→`LINE`, 균일 스케일 원→`CIRCLE`, 호→`ARC`, rect/triangle/polygon→`POLYLINE`(closed). 복잡 도형(path/ellipse/text/group/MatrixRepeater)은 G-code와 동일하게 `FabricToPaperAdapter`로 평탄화(5µm 허용오차) → `POLYLINE`(P4-a). raster 이미지는 벡터가 아니라 skip(통계로 Toast 표기).
    * **⚠️ 설계 변경**: 계획서의 "R12 + LWPOLYLINE"은 모순(LWPOLYLINE은 R14+ 엔티티) → **`POLYLINE`/`VERTEX`/`SEQEND` 시퀀스**로 정정. 자체 임포터(`dxfImport.ts`)가 POLYLINE을 지원하므로 라운드트립 보장.
    * **좌표 규약 확정**: `GCodePanel.tsx` 호출부와 동일 — `origin (0,0)`(스테이지 중심), `pxPerMm`(store), `invertY: true`. DXF는 Y-up이므로 `mmY = -pxY / pxPerMm.y`. ARC 각도는 Y미러 변환(`dxfStart = -(fabricEnd + θ)`).

* **⚠️ DXF Import Y극성 결함 수정 (§4.8 관련)**: `dxfImport.ts`가 DXF(Y-up)를 Fabric 캔버스(Y-down)로 로드하면서 **Y반전을 하지 않던 잠재 결함**을 수정. LINE/POLYLINE/CIRCLE/ARC 임포트 시 Y반전(+ARC `sweepFlag` 1→0) 적용 → dxfExport(`toMm`), G-code(`invertY`)와 극성 일치, 라운드트립·가공 극성 모두 보장. **비대칭 도형의 DXF 임포트 결과가 이전 버전과 상하 반전됨(이전이 오류이므로 재반전 금지).**

* **P2/P4-c — C++ 네이티브 저장 필터 확장 (`PortalRouterHandler.cpp`)**:
    * `HandleDialogSaveRecipeFile` 필터에 `.dxf`(DXF Drawing) 분기 추가.
    * `HandleDialogSaveImage` 필터에 WebP 추가 + 제안 파일명 확장자에 맞춰 기본 필터 인덱스(`nFilterIndex`) 자동 선택.

* **Import 다이얼로그 통합 필터 기본화 (`simple_handler.h/.cpp`, 2026-07-22)**:
    * **이슈**: Import File 클릭 시 뜨는 CEF 기본 파일 다이얼로그가 `<input accept>`를 **확장자별 개별 필터**로 나열하고 첫 항목(SVG)만 기본 선택 → DXF·이미지가 초기 목록에 안 보임.
    * **[Design Pattern: Adapter]** `SimpleHandler`에 `CefDialogHandler` 상속 + `OnFileDialog` 구현. CEF accept 목록을 Win32 `OPENFILENAMEW` 필터로 변환하여 **"All Supported Files (*.svg;*.dxf;*.png;…)"를 1번(기본)** + 개별 필터 + All Files 순으로 제공. **열기 모드 + 필터 2개 이상일 때만** 커스텀 적용(저장/폴더/단일 필터는 CEF 기본 동작 유지), 멀티선택 버퍼 파싱 지원.
    * **⚠️ 빌드 주의**: `LASERnGRAPN.vcxproj`를 단독 빌드하면 `$(SolutionDir)` 미정의로 사전 이벤트 robocopy(`portal\dist`)가 컴파일 전에 실패 → 반드시 **`.sln` 경유** 또는 `/p:SolutionDir=...` 지정. C++ `ClCompile` 타깃 컴파일 통과 확인 완료.

* **검증 상태**: Portal `vite build` + `tsc` 통과(신규/수정 파일 오류 0). C++ 컴파일 통과. **실기 미검증**: `.sln` 재빌드 후 앱 재기동하여 ① Import 다이얼로그 기본 필터 확인 ② TIFF/BMP/WebP 로드 ③ DXF Export → 자체 재Import 라운드트립 + 외부 CAD 뷰어 확인 필요.
* **미착수(P4-d, 선택)**: 레이어/색상(ACI) 매핑, DXF Import 엔티티 확장(ELLIPSE/SPLINE/TEXT), 최근 파일(Recent).
* **신규/수정 파일 요약**: (신규) `Portal/src/ui/pages/Recipe/Canvas/utils/importFile.ts`, `importImage.ts`, `dxfExport.ts`, `Portal/src/types/utif.d.ts` / (수정) `Toolbar.tsx`, `canvasImportExport.ts`, `dxfImport.ts`, `RecipeCanvas.tsx`, `PortalRouterHandler.cpp`, `simple_handler.h`, `simple_handler.cpp`, `package.json`.

### 4.18 드래그 앤 드롭 Import를 Recipe 페이지로 제한 (2026-07-22)
* **이슈**: §4.17 P3의 캔버스 드래그 앤 드롭 파일 로드가 **모든 페이지에서 동작**했음. `RecipeCanvas`는 CameraView를 통해 Main/Recipe/Calibration 페이지에 공유 렌더링되는 컴포넌트이므로, Calibration 등 가공 편집과 무관한 화면에서도 DXF/SVG를 드롭하면 캔버스에 객체가 추가되는 문제. 요구사항: **titlebar 메뉴가 Recipe인 상태에서만** 드롭 임포트 허용.
* **판별 근거**: 별도 라우트 조회 없이 `RecipeCanvas`의 기존 `scope` prop을 재사용. `CameraView.tsx`가 페이지별로 `'recipe'` / `'calibration'` / `'main:scanner'` / `'main:object:xN'`을 전달하므로 scope 접두어(`scope.split(':')[0]`)가 `'recipe'`인지로 페이지를 판별(`isRecipeScope`).
* **해결 [Design Pattern: Guard Clause]** (`RecipeCanvas.tsx`):
    1. `handleFileDrop` 진입부에 가드 추가 — Recipe scope가 아니면 임포트를 수행하지 않고 "File import is only available on the Recipe page" 에러 Toast 표시.
    2. `onDragOver`의 `dataTransfer.dropEffect`를 Recipe면 `'copy'`, 아니면 `'none'`으로 설정 — 드롭 이전 드래그 단계부터 커서로 불가 상태를 피드백.
    3. `handleFileDrop`의 `useCallback` 의존성에 `isRecipeScope` 추가(페이지 전환 시 가드 최신화).
* **검증**: Portal `vite build` 통과. `tsc --noEmit`의 기존 fabric 타입 오류들은 본 변경과 무관(변경 라인 오류 0). **배포 주의**: `Portal/dist`까지만 빌드된 상태 — 실행 파일이 사용하는 `Bin\web` 반영은 `.sln` msbuild(robocopy 사전 이벤트) 필요.

### 4.19 Dot UI 정리 및 색상 SSOT/대표색 단일 경로 확립 (P1~P4 + F1~F4, 2026-07-22)
* **배경 이슈 4건**: ① Layer List에 Dot 하부 렌더 프리미티브(Object 0/1/2 = 원+X 2선)가 트리로 노출, ② Dot 편집 바에 Fill만 우연히 체크됨(Line 무의미), ③ Fill 색상 팔레트가 안 열림(Line 해제 도형·Dot에서 색상 변경 불가 데드엔드), ④ Right Panel Current Layer 스와치가 Dot을 검은 원으로 오표시.
* **P1 — 색상 판정 SSOT 버그 수정 (`colorUtils.ts`) — 기능 버그였음**:
    * `getColorHex(null/undefined)`가 `'#000000'`을 반환해, stroke 없는 leaf(Dot의 원 등)에서 `resolveObjectColorHex()`의 fill 폴백이 영원히 실행되지 않고 **검정 레이어로 오분류**. 이 함수는 LayerList 그룹핑·Current Layer 스와치·`ScannerGenerator.groupByColorPreset`·`useGCodeGenerator`·프리셋 재색상 5곳의 SSOT이므로 **가공 파라미터 그룹핑까지 틀어지는** 문제였음.
    * 수정: 변환 전 raw 값으로 stroke → fill → `customData.originalStroke` → `originalFill` 순 폴백(마지막 폴백으로 Fill/Line 모두 해제된 도형도 레이어 정체성 유지). 한 곳 수정으로 5개 소비처 동시 정상화.
* **P2 — Dot 원자화 (`LayerList.tsx`)**: `id==='dot_marker'` 그룹은 leaf 취급(`hasChildren` 제외) — 자식 미노출·확장 화살표 제거. **원칙: 시인성용 렌더 프리미티브는 도메인 오브젝트가 아니다.**
* **P3 — 색상 편집 데드엔드 제거 (`CanvasTopBar.tsx`) [Design Pattern: Facade]**:
    * **정책 확립**: "색상 = 가공 레이어 색상(파라미터 키)"이며 Fill/Line 체크는 가공 방식(해칭/외곽선) 토글일 뿐 — **색상 스와치는 체크 상태와 무관하게 항상 클릭 가능**해야 한다. "Fill 색상 = Line 색상" 정책은 유지.
    * `handleChange('representativeColor')` 단일 적용 경로 신설: 컨테이너(Dot 그룹/DXF 그룹/MatrixRepeater)를 leaf까지 내려가 stroke·fill(알파 보존)·`originalStroke/Fill`을 일괄 갱신, 매트릭스 셀 override도 캐스케이드. Fill/Line 스와치 클릭이 모두 이 경로로 통일(이미지 스와치만 이진화 미리보기 재처리를 위해 기존 `'stroke'` 경로 유지).
    * Dot 선택 시 Fill/Line 행 숨김 → **Color 스와치 + hex + Mark Time만** 노출.
* **F1~F4 — Use Default Parameters 일괄 강제 재색상 leaf 캐스케이드 (`useCanvasStore.ts`)**:
    * 기존 `applyForcedColor`는 **컨테이너 자신**의 fill/stroke만 변경 — 그룹류(Ctrl+G 그룹/Dot/DXF/매트릭스 소스)는 시각 변화도, 레이어 재분류도 없는 무효 동작이었음.
    * 공용 유틸 승격(F1): `collectStyleLeafObjects()`(leaf 전부 수집 — `resolveStyleSourceObject`와 하강 규칙 동일, 판정-적용 대칭)·`replaceColorKeepAlpha()`를 `colorUtils.ts`로 이동, CanvasTopBar도 이를 사용(F2).
    * `forceColorOnLeaves`(F3): 가드("이미 target 색이면 스킵")를 **leaf 단위**로 내려 **혼합 색상 사용자 그룹**의 각 leaf가 자기 원색 스냅샷(`customData.originalColor`)을 갖고 해제 시 각자 복원. 해제는 `[컨테이너, ...leaf]` 이중 경로(구버전 컨테이너 레벨 강제 상태가 레시피/Undo에서 로드된 경우 마이그레이션). 스냅샷은 레시피 저장(LeftNav `toObject('customData')`)·Undo(useHistorySystem)에 직렬화되어 왕복 보존.
    * 강제 상태에서 Color 스와치로 명시 변경 시 `originalColor` 스냅샷도 새 색으로 갱신 — 해제 시 사용자의 명시적 선택이 소실되지 않음(사용자 의도 우선).
* **검증**: `tsc` 오류 총계 기준선(68, 전부 기존) 동일 — 신규 오류 0. `vite build` + `Bin\web` 배포 완료. C++ 변경 없음(이 항목 한정).

### 4.20 PowerPoint식 다중 선택/Ctrl+드래그 복제 및 Current Layer 스와치 선택 연동 (2026-07-22)
* **Ctrl(+Shift)+클릭 다중 선택 (`useCanvasSetup.ts`)**: fabric canvas 옵션 `selectionKey: ['ctrlKey','shiftKey']` — 수정키+클릭으로 선택에 추가, 이미 선택된 도형을 수정키+클릭하면 제외(토글). "Ctrl+Shift+클릭 제외" 요구는 토글 규칙의 부분집합으로 충족.
* **Ctrl+드래그 복제 (신규 `useDragDuplicate.ts`) [Design Pattern: Memento(위치 스냅숏)]**:
    * `mouse:down`(Ctrl+좌클릭, 도형 위) 시점에 활성 도형들의 **절대 좌표 사본을 미리 clone**(첫 `object:moving`은 이미 수 픽셀 이동한 뒤라 그때 만들면 원위치가 어긋남). 첫 `object:moving`에서 Ctrl 유지 시 사본을 원위치에 배치(제스처당 1회), 드래그 없이 mouse:up이면(=Ctrl+클릭 선택) 사본 폐기.
    * ActiveSelection 자식의 절대 위치는 `getCenterPoint()`(fabric v6: 그룹 변환 반영)로 확정, 사본은 center 원점 배치(기존 편집 로직이 `getCenterPoint`/`setPositionByOrigin` 기반이라 원점 변경에 안전). clone 속성 목록은 `useClipboardSystem.customProps`와 동일(+`isHairline`/`strokeUniform` 필수 — §2.31 선 굵기 동결 버그 예방).
    * 이름 규칙은 매트릭스 분해와 동일(`Dot N` 연번 / `이름 (Copy N)`). **MatrixRepeater는 clone이 커스텀 상태(sourceObjects 등)를 보존하지 못해 복제 제외**(일반 이동으로 동작, §4.14 직렬화 경고와 동일 근원).
* **Current Layer 스와치 클릭 → 캔버스 선택 표시 (`ColorPresetPanel.tsx`)**: 스와치 클릭 시 CurrentLayer 지정 + 해당 색상 도형들을 LayerList의 레이어 클릭과 동일 규칙(잠금 도형 포함 시 이동/변형 잠금 ActiveSelection)으로 선택 표시. 가공 중(`isProcessingLocal`/`hideOverlays`)에는 선택 시도 안 함.

### 4.21 매트릭스 재편집 후 도형·인덱스 라벨 분리 / 확대 시 오버레이 소실 — stale aCoords 오염 수정 (2026-07-23, 실기 검증 완료)
* **증상**: 매트릭스 생성 → 가공 → 설정(Edit) 재오픈 → 파라미터 변경 → Apply → 재가공 반복 시 ① 셀 도형과 `(row,col) Z:xx.xxx` 라벨 위치가 서로 분리, ② 줌 확대 중 셀이 화면 안에 있는데도 오버레이가 통째로 사라짐.
* **근본 원인 (fabric v7 캐시 규약)**: 가공 커맨드 생성기(`ScannerGenerator.ts` 매트릭스 분기, `useGCodeGenerator.ts` 동일)가 셀마다 `sourceObjects`의 `left/top`을 셀 절대좌표로 임시 이동(`setCoords()` 호출)했다가 **복원 시에는 `set()`만 하고 `setCoords()`를 누락** → fabric v7의 `getBoundingRect()`는 캐시된 `aCoords`를 그대로 사용하므로(`set()`은 캐시를 무효화하지 않음, `index.mjs:6212/6452`) 가공 후 소스의 aCoords가 **마지막 셀 절대좌표에 고착**. 이후 매트릭스 다이얼로그의 `updateMatrixInPlace()` → `updateBoundingBox()`가 오염된 bbox로 `_srcMinX/Y`(라벨 앵커·뷰포트 컬링 AABB·Flyweight 비트맵 앵커의 공통 기준)를 재계산 → 라벨 이탈(①) + 확대 시 어긋난 컬링 AABB가 가시영역과 교차하지 않아 셀 렌더 스킵(②) + 빈 비트맵 가능. §4.13(리피터 자신의 left/top 직접 대입) 사고와 동일 계열의 stale-캐시 함정이 소스 도형 쪽에서 재발한 사례.
* **수정**: ① 양 생성기의 셀별 임시 변경(위치/fill/stroke/fillSettings/scale)을 **try/finally**로 감싸고 finally에서 원복 + `setCoords()` — 예외/Stop 경로 포함 원상 복구 보장 [Design Pattern: Scoped Guard]. ② `MatrixRepeater.updateBoundingBox()`가 `getBoundingRect()` 호출 전 `obj.setCoords()`를 명시 호출 — 어떤 외부 코드가 캐시를 오염시켜도 앵커가 무너지지 않는 최종 방어선(SSOT 자체 면역).
* **계획서**: `docs/plans/MatrixDisplayIssues2.md` (fabric 소스 근거·오염 사슬·검증 시나리오). 실기 검증 완료(편집↔가공 반복 라벨 정합·확대 표시 유지).

### 4.22 매트릭스 셀 라벨 가독성 개선 — 클램프 줌 추종 + 고대비 칩 + LOD (2026-07-23)
* **문제**: 라벨이 화면 고정 11px + 레이어색 단색 텍스트라 ① 확대 시 도형 선은 커지는데 라벨만 상대적으로 극소(622% 실기 보고), ② 카메라 영상 밝은 영역·동색 도형 선 위에서 대비 붕괴, ③ 대형 매트릭스 축소 시 라벨 전량 겹침, ④ 활성 셀 무강조, ⑤ 상단 행 라벨 화면 밖 잘림.
* **개선 (`MatrixRepeater.drawCellLabel()` 신설 — 표시 계층 전용, 위치 앵커·Z 수식 SSOT 무변경)**:
    * **클램프형 줌 추종 크기**: `fontScreenPx = clamp(11, 11×zoom, 22)` — 확대 시 도형과 함께 커지다 상한 고정, 축소 시 하한 미달 없음(과거 "축소 시 라벨 소멸" 버그 회귀 없음). CAD류 주석 관례.
    * **고대비 칩**: 반투명 다크 라운드 칩(`traceRoundRect` — 구형 CEF 호환 arcTo 구성) + 근백색 텍스트 + 레이어색 색점(`resolveObjectColorHex` leaf 해석을 `_labelAccentColor`로 캐시). Figma 측정 라벨 관례.
    * **LOD**: 화면상 셀 피치(`min(xSpacing,ySpacing)×zoom`, 개수 1인 축 제외) < 32px이면 일반 라벨 생략·(0,0)만 유지, 프레임당 300개 상한. 지도 엔진 라벨링 관례.
    * **활성 셀 강조**: LOD 무관 항상 표시 + 액센트색 칩/다크 텍스트 반전(+2px). **클리핑 회피**: 화면 상단 밖이면 셀 아래로 플립, 좌측은 클램프. `measureText`는 `_labelMetricsCache`(상한 512)로 캐시.
* **계획서**: `docs/plans/MatrixLabelUX.md` (업계 레퍼런스·기각 대안 포함).

## 5. ⚠️ 개발자 주의 사항 (Developer Warning)
* **기존 코드 무결성 보존**: 추가적인 이슈나 신규 버그를 해결할 때, **기존에 잘 동작하던 코드를 성급히 덮어쓰거나 무리하게 구조를 변경하는 경향**이 발견되었습니다. 
* 신규 문제 발생 시, 즉각적인 코드 수정(특히 오프셋을 임의로 더하거나 빼는 하드코딩 방식)에 돌입하기 전에 **왜 기존 코드가 그렇게 작성되었는지, 하드웨어 렌더링 엔진(Fabric/Paper)의 기본 좌표계 특성이 무엇인지 기저 원인(Root Cause)을 정확히 분석**해야 합니다.
* 문제 해결 과정에서 관계없는 정상 로직까지 건드려 회귀 버그(Regression Bug)를 유발하지 않도록 각별히 유의하십시오.
* **Fabric.js 커스텀 클래스는 직렬화를 별도로 구현해야 함(§4.14)**: `fabric.Group`을 상속하되 실제 자식을 빈 배열로 넘기고 별도 데이터 모델(예: `sourceObjects`, `overrides`)을 쓰는 클래스(`MatrixRepeater` 등)는 커스텀 `toObject()`/`fromObject()`를 구현하지 않으면 저장/불러오기·페이지 전환 시 데이터가 조용히 소실된다. 새로운 커스텀 fabric 클래스를 추가할 때는 반드시 직렬화 왕복(저장 → 새로고침/페이지 이동 → 복원)을 검증할 것.
* **fabric v7 `aCoords` 캐시 규약(§4.13·§4.21)**: `obj.set({left/top/...})`은 **`aCoords` 캐시를 무효화하지 않으며**, `getBoundingRect()`/`getCoords()`는 캐시를 그대로 반환한다 — 캐시를 갱신하는 유일한 지점은 `setCoords()`다. 오브젝트 좌표를 임시 변경했다가 되돌리는 코드(가공 커맨드 생성기 등)는 **복원 후 반드시 `setCoords()`까지 호출**하고, 임시 변경 블록은 try/finally로 감싸 예외/중단 경로에서도 원복을 보장할 것. 이 규약 위반이 §4.13(컬링 셀 소실)과 §4.21(라벨 분리/확대 시 오버레이 소실) 두 사고의 공통 뿌리였다.

---
최종 수정일: 2026-07-23
담당: Claude (AI Coding Assistant, 이전 항목은 Antigravity)
