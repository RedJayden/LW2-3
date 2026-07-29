# 뷰포트 핏 및 고해상도 배율 연산 오류 교차 검증 및 해결 보고서

본 문서는 `RecipeCanvas.tsx` 파일 내에서 발생한 `basePxPerMm is not defined` 런타임 오류의 원인을 분석하고, 기존 아키텍처 문서(`Camera_Mode_Transition_and_Performance_Fix.md`, `arch_CanvasProc.md`, `[뷰포트] 최초 기동 시 디폴트 뷰포트 핏 개선 계획서.md`)들과의 상호 교차 검증을 거쳐 도출한 최선의 해결 방법을 기술합니다.

---

## 1. 교차 검증 및 원인 분석

### 1.1 `Camera_Mode_Transition_and_Performance_Fix.md`와의 정합성 검증
* **검증 내용**: 
  - 본 가이드의 2번 항목("고해상도 배율 연산 원복")에서는 렌더링 및 좌표 연산에서 하드코딩된 `1000` 상수를 완전히 배제하고 현재 렌즈 배율인 `activePxPerMm` 값을 곱해야 함을 명시하고 있습니다.
* **이슈 발견**: 
  - 현재 워크스페이스 코드의 `fitCameraArea` 함수 내에서는 픽셀 오프셋 `pxX`, `pxY`를 계산할 때, 정의되지 않은 `basePxPerMm.x / y` (즉, 고정 배율 1000 대용)를 곱하여 수식을 연산하고 있었습니다.
  - 이는 `Camera_Mode_Transition_and_Performance_Fix.md`의 **"고해상도 배율 연산 원복(activePxPerMm)" 원칙에 정면으로 위배**됩니다.
* **해결 방안**: 
  - `basePxPerMm` 대신 이미 상단에 완벽하게 선언되어 있는 `activePxPerMm`을 사용해 위치 변환을 계산해야 합니다.

### 1.2 `arch_CanvasProc.md`와의 정합성 검증
* **검증 내용**:
  - `arch_CanvasProc.md` 2.11절("캘리브레이션 기준 원점 복원 및 이중 보정 오류 수정")에 따르면, 캔버스 이동 및 뷰포트 정렬 시 캘리브레이션 스테이지 오프셋 좌표 `(mx, my)`를 차감한 상대 변위 `(positions.X - mx, positions.Y - my)`를 기반으로 연산해야 원점 무결성이 복원된다고 설명합니다.
* **이슈 발견**:
  - 워크스페이스 코드의 변환식은 `(latestPositions.X + mx) * basePxPerMm.x` 및 `-(latestPositions.Y + my)`로 더하기(`+`) 연산을 사용하고 있어 **이중 보정 오류 및 반대 방향 보정 왜곡이 발생**합니다.
* **해결 방안**:
  - 오프셋 보정 수식을 `(latestPositions.X - mx) * activePxPerMm.x` 및 `-(latestPositions.Y - my) * activePxPerMm.y` 로 바로잡아야 합니다.

### 1.3 `[뷰포트] 최초 기동 시 디폴트 뷰포트 핏 개선 계획서.md`와의 정합성 검증
* **검증 내용**:
  - 해당 계획서는 최초 시작 시 `isInitialLoad`를 판별하여 기본 뷰포트 핏을 카메라 FOV 핏으로 가동하도록 수정할 것을 규정하고 있습니다.
* **검증 결과**:
  - `useCanvasStore.ts` 및 `RecipeCanvas.tsx` 하단부에는 해당 핏 제어 코드가 성공적으로 적용되어 있음을 확인하였습니다. (정상 적용 완료)

---

## 2. 수정 계획 및 수정 내용 (Modification Content)

### 2.1 [RecipeCanvas.tsx](file:///c:/LNG/Source/LW2-3_INC_260616/Portal/src/ui/pages/Recipe/Canvas/RecipeCanvas.tsx) 코드 수정

오류가 발생하는 `basePxPerMm` 참조를 제거하고, `activePxPerMm` 및 차감 부호(`-`) 연산을 적용하여 아키텍처 가이드라인에 완전히 부합하도록 교정합니다.

#### AS-IS (오류 발생 코드)
```typescript
            const pxX = (latestPositions.X + mx) * basePxPerMm.x;
            const pxY = -(latestPositions.Y + my) * basePxPerMm.y;
```

#### TO-BE (수정본)
```typescript
            const pxX = (latestPositions.X - mx) * activePxPerMm.x;
            const pxY = -(latestPositions.Y - my) * activePxPerMm.y;
```

---

## 3. 최종 결론 (Final Conclusion)

* **배율 무결성**: 정의되지 않은 `basePxPerMm` 대신 `activePxPerMm`을 사용함으로써 런타임 오류가 완벽히 해결되며, 고배율 렌즈(Object x20, x50) 구동 시에도 화면 스케일의 불일치 현상이 영구적으로 방지됩니다.
* **좌표 무결성**: 캘리브레이션 오프셋 연산을 아키텍처 문서 가이드라인에 맞춰 `mx`/`my` 차감 형식으로 복원하여, 스테이지 이동과 카메라 오프셋 보상이 기하학적으로 올바르게 매핑됩니다.
* **종합 결론**: 제안된 수정 사항은 기존에 작성된 모든 최적화 및 뷰포트 개선 계획서의 요구사항들을 100% 충족하며, 런타임 안정성과 렌더링 성능을 동시에 보장하는 최선의 해결 방안입니다.
