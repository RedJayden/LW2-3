# 스캐너 가공 치수 왜곡 분석 및 Dot 도형 UI 개선 계획서

본 문서는 스캐너 모드에서 3 x 3 매트릭스 가공 시 발생하는 치수 및 정렬 왜곡의 원인을 규명하고, Dot 도형의 시각적 가시성 개선 및 매트릭스 생성 시 객체 명명(넘버링) 규칙을 자동화하기 위한 상세 수정 계획을 기술합니다.

## User Review Required

> [!IMPORTANT]
> **핵심 원인 분석 요약 (정정)**
> 1. **가공 왜곡 (소프트웨어 단위 오차)**: 
>    제조사 프로그램으로 가공했을 때 정상이라는 피드백을 바탕으로 재분석한 결과, **SinoGalvo SDK(JhcLib)의 좌표계 입력 단위가 `0.01mm (100 = 1mm)` 규격**임에도 불구하고 백엔드 `SinoGalvoController.cpp`에서 mm 단위 좌표를 그대로 전달하고 있었습니다. 이로 인해 가공 치수가 1/100 단위로 축소 및 왜곡된 것입니다. C++ 코드 내에서 JhcLib API에 좌표를 전송할 때 `100.0f`를 곱해주는 스케일링 변환을 적용합니다.
> 2. **실시간 설정 적용 누수**:
>    사용자가 UI(`SinoGalvoParameterForm`)에서 왜곡 및 축 설정을 저장해도 `SinoGalvoController` 메모리 및 SDK에 즉시 반영되지 않고 재부팅해야만 적용되는 문제가 있었습니다. `PortalRouterHandler.cpp` 내에서 설정 저장 후 즉시 인스턴스 업데이트 및 하드웨어 적용 API를 호출하도록 개선합니다.
> 3. **Dot 도형 가시성**: 
>    가공 시에는 중심점만 추출하는 특성을 활용하여 캔버스 상에서는 **고정된 비주얼 반지름(5px)**으로 명확하게 렌더링하고, 줌 상태와 무관하게 고정 크기로 노출되도록 `customData.isConstantSize: true` 속성을 적용합니다.
> 4. **매트릭스 네이밍**: 
>    복제본이 "Dot 1"로 중복 노출되던 문제를 기준 도형 이름 뒤에 `(Original)`을 붙이고 복제본들은 `Dot 2`, `Dot 3`... 과 같이 순차 증가 넘버링되도록 로직을 자동화합니다.

---

## Proposed Changes

### 1. Control & IPC Backend (C++)

#### [MODIFY] [SinoGalvoController.cpp](file:///c:/LW23_porg/002.INC/LW2-3_INC_260619/LASERnGRAPN/Modules/Scanner/SinoGalvo/Base/SinoGalvoController.cpp)
* **목적**: SinoGalvo SDK(JhcLib)에 좌표 및 크기 정보를 주입할 때, mm 단위에서 0.01mm 단위(1mm = 100.0f)로 정확히 스케일링하여 왜곡 및 축소 문제를 해결합니다.
* **수정 계획**:
  * `Run()` 함수 내의 각 `ScannerCommandType` 분기(`POINT`, `LINE`, `CIRCLE`, `RECT`, `ARC`, `ELLIPSE`, `EARC`)에서 JhcLib API(`SchOutPoint`, `SchOutLine`, `SchOutCircle`, `SchOutArc`, `SchOutEArc` 등)를 호출할 때 좌표와 물리 크기 인자에 `100.0f`를 곱합니다.
  * `MovetTo()` 함수 내에서 `m_jhcLib->SchOutPoint` 호출 시에도 인자로 전달된 mm 단위 좌표에 `100.0f`를 곱하도록 수정합니다.
  * 디자인 패턴: 싱글톤 패턴(`Singleton Pattern`)을 적용하여 전역적인 상태 접근을 일관되게 유지합니다.
  * Clean Code 및 Doxygen 스타일 주석을 준수하여 작성합니다.

```diff
- void SinoGalvoController::MovetTo(float X, float Y)
- {
- 	m_jhcLib->SchOutPoint(X, Y, 0.0f);
- }
+ /**
+  * @brief Move scanner to the specified coordinate.
+  * @param X Target X position in mm.
+  * @param Y Target Y position in mm.
+  * @note The JhcLib API requires coordinates in 0.01mm units. (1mm = 100)
+  */
+ void SinoGalvoController::MovetTo(float X, float Y)
+ {
+ 	m_jhcLib->SchOutPoint(X * 100.0f, Y * 100.0f, 0.0f);
+ }
```

```diff
// Run 함수 내부 그리기 명령 호출 부분 예시
case ScannerCommandType::POINT:
	if (m_jhcLib->SchOutPoint) {
		MovetTo(valX, valY);
-		m_jhcLib->SchOutPoint(valX, valY, valPointTime);
+		m_jhcLib->SchOutPoint(valX * 100.0f, valY * 100.0f, valPointTime);
	}
	break;
```

#### [MODIFY] [PortalRouterHandler.cpp](file:///c:/LW23_porg/002.INC/LW2-3_INC_260619/LASERnGRAPN/Core/Communication/PortalRouterHandler.cpp)
* **목적**: 사용자가 UI에서 SinoGalvo 설정을 저장할 때 파일 저장과 더불어 실시간으로 런타임 메모리 및 하드웨어 보정 값을 업데이트합니다.
* **수정 계획**:
  * `HandleConfigSetScanner` 함수 내의 `SinoGalvo` 분기에서 `SaveConfig()`가 성공적으로 리턴되면, 현재 장치 상태가 Open일 때 `SetDefaultCorrectionSet()`와 `SetDefaultParameters()`를 즉시 호출하도록 코드를 수정합니다.

```diff
      bool ok = gc.SaveConfig();
+     if (ok && gc.IsOpen()) {
+         gc.SetDefaultCorrectionSet();
+         gc.SetDefaultParameters(gc.GetMarkSpeed(), gc.GetJumpSpeed());
+     }
      cb->Success(ok ? MakeOk() : MakeErr("Failed to save GalvoConfig.json"));
```

---

### 2. Canvas & UI (Portal)

#### [MODIFY] [useCanvasEvents.ts](file:///c:/LW23_porg/002.INC/LW2-3_INC_260619/Portal/src/ui/pages/Recipe/Canvas/hooks/useCanvasEvents.ts)
* **목적**: Dot 도형 생성 시 가시성 대폭 향상 및 줌 스케일 영향 배제.
* **수정 계획**:
  * 0.001mm 물리 단위 반지름 계산을 제거하고, 캔버스 상에서 선명하게 보일 수 있도록 **반지름 5 픽셀**로 고정합니다.
  * 줌이 변경되어도 항상 일정한 시각적 크기를 유지할 수 있도록 `customData.isConstantSize: true` 속성을 추가하고 `scaleX`, `scaleY`에 `1 / zoom`을 적용합니다.

```typescript
            } else if (activeTool === 'dot') {
                const pointer = canvas.getScenePoint(evt);
                const { pxPerMm, viewMode } = useCanvasStore.getState();

                // [FIX] 시인성 극대화를 위해 픽셀 기준 반지름 5px로 변경하고 줌 불변 속성 추가
                const visualRadius = 5;
                const zoom = canvas.getZoom();

                // Naming Logic: Count existing 'Dot N'
                const objects = canvas.getObjects();
                const dotCount = objects.filter((o: any) => o.name && o.name.startsWith('Dot ')).length;
                const newName = `Dot ${dotCount + 1}`;

                // Mark Time Logic: Scanner view -> 0.2, Object view -> 1.0
                const defaultMarkTime = viewMode === 'scanner' ? 0.2 : 1.0;

                // Center Circle (Cyan Filled + Cyan Stroke)
                const circle = new fabric.Circle({
                    left: pointer.x,
                    top: pointer.y,
                    radius: visualRadius,
                    scaleX: 1 / zoom,
                    scaleY: 1 / zoom,
                    fill: '#00BEFF',
                    stroke: '#00BEFF',
                    strokeWidth: 1, // 1px 일정한 테두리
                    originX: 'center',
                    originY: 'center',
                    selectable: true,
                    evented: true,
                    objectCaching: false,
                    id: 'dot_marker',
                    name: newName,
                    markPointTime: defaultMarkTime,
                    strokeUniform: true,
                    customData: {
                        isConstantSize: true // [FIX] 줌 조작 시 크기 보존 플래그 연동
                    }
                });
```

#### [MODIFY] [useMatrixGenerator.ts](file:///c:/LW23_porg/002.INC/LW2-3_INC_260619/Portal/src/hooks/useMatrixGenerator.ts)
* **목적**: 매트릭스 복제 대상의 순차 넘버링 규칙 적용 및 원본 표시 자동화.
* **수정 계획**:
  * 매트릭스 생성 전, 선택된 원본 객체의 이름(예: `Dot 1`)에서 문자열 접두사(Prefix)와 마지막 숫자를 분리하여 추출합니다.
  * 1번째(row=0, col=0) 원본 객체에는 접미사 `(Original)`을 부여합니다 (예: `Dot 1 (Original)`).
  * 2번째 이상의 복제 객체들에는 `Dot 2`, `Dot 3`... 과 같이 숫자를 순차적으로 증가시키며 이름을 대입합니다.

```typescript
        // [FIX] 원본 이름 파싱 및 순차 넘버링 접두사 정의
        const rawName = ((activeObject as any).name || 'Object').replace(' (Original)', '');
        const match = rawName.match(/^(.*?)\s*(\d+)$/);
        let namePrefix = rawName + ' ';
        let startNum = 1;
        if (match) {
            namePrefix = match[1] + ' ';
            startNum = parseInt(match[2]);
        }

        try {
            for (let row = 0; row < options.yCount; row++) {
                const isZigzagDir = options.type === 'zigzag' && (row % 2 !== 0);

                for (let col = 0; col < options.xCount; col++) {
                    const isFirst = (row === 0 && col === 0);
                    const colIndex = isZigzagDir ? (options.xCount - 1 - col) : col;
                    const matrixId = `mtx_${performance.now()}_r${row}_c${col}_${Math.random().toString(36).substring(2, 6)}`;
                    const clonedOffsetX = colIndex * pxSpacingX;
                    const clonedOffsetY = row * pxSpacingY;

                    let targetObj: fabric.Object = activeObject;
                    if (!isFirst) {
                        const cloned = await activeObject.clone(['id', 'markPointTime', 'name', 'customData', 'selectable', 'evented']);
                        
                        if ((activeObject as any).id) (cloned as any).id = (activeObject as any).id;
                        if ((activeObject as any).markPointTime !== undefined) (cloned as any).markPointTime = (activeObject as any).markPointTime;

                        // [FIX] 복제본 순차 넘버링 적용 (예: Dot 2, Dot 3...)
                        const itemIndex = row * options.xCount + col;
                        (cloned as any).name = `${namePrefix}${startNum + itemIndex}`;

                        cloned.set({
                            left: originalLeft + clonedOffsetX,
                            top: originalTop + clonedOffsetY,
                            selectable: !isPreview,
                            evented: !isPreview
                        });

                        if (isZigzagDir) {
                            const curLeft = cloned.left;
                            const curTop = cloned.top;
                            reverseDirection(cloned);
                            cloned.set({ left: curLeft, top: curTop });
                        }
                        
                        cloned.setCoords();

                        const clonedData = { 
                            ...(cloned as any).get?.('customData') || (cloned as any).customData || {},
                            isMatrixChild: true,
                            isPreview: isPreview,
                            isMatrixOriginal: false,
                            matrixId: matrixId,
                            matrixSessionId: matrixSessionId,
                            offsetX: clonedOffsetX,
                            offsetY: clonedOffsetY,
                            zOffset: options.useZOffset ? options.zOffset * zStepIndex : 0
                        };
                        cloned.set('customData', clonedData);
                        cloned.set('excludeFromExport', false);
                        newObjects.push(cloned);
                        targetObj = cloned;
                    } else {
                        // isFirst: current object becomes the first matrix item
                        // [FIX] 원본 도형에 (Original) 라벨 추가
                        (activeObject as any).name = `${namePrefix}${startNum} (Original)`;

                        const baseData = (activeObject as any).get?.('customData') || (activeObject as any).customData || {};
                        activeObject.set('customData', { 
                            ...baseData, 
                            matrixId, 
                            matrixSessionId,
                            offsetX: 0,
                            offsetY: 0,
                            zOffset: 0
                        });
                        targetObj = activeObject;
                    }
```

---

## Verification Plan

### Automated Tests
- C++ 프로젝트 컴파일 테스트
- Portal UI 프로젝트 컴파일 테스트 (`npx tsc --noEmit`)

### Manual Verification
1. **가공 정밀도 및 치수 확인**:
   * 레시피 캔버스에서 `3 x 3` Dot 매트릭스(간격 0.1mm)를 설정하고 가공 명령을 실행합니다.
   * 실물 자재 또는 분석 장비를 통해 가공된 결과물이 정밀하게 **0.1mm 수평/수직 정렬**을 만족하며 정상 가공되는지 검증합니다.
2. **실시간 설정 적용 확인**:
   * `SinoGalvo` 캘리브레이션 폼에서 보정 계수 및 스케일 비율을 수정한 뒤 'Save Changes' 버튼을 누릅니다.
   * 프로그램을 재부팅하지 않고 바로 이어서 가공을 수행하여 변경된 보정 값이 즉시 적용되는지 테스트합니다.
3. **Dot 도형 가시성 확인**:
   * 캔버스에 생성된 Dot 마커가 화면 줌아웃 상태에서도 **반지름 5px**의 파란색 점으로 선명하게 노출되는지 확인합니다.
4. **매트릭스 네이밍 및 넘버링 확인**:
   * 매트릭스 생성 시 기준이 된 객체는 **`Dot 1 (Original)`**로 명명되고, 복제된 나머지 객체는 **`Dot 2`부터 `Dot 9`**까지 순차적으로 증가하며 넘버링되는지 확인합니다.
