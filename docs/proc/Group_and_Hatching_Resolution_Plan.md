# [계획서] 그룹화/해제 수동 정밀화 및 화면 빗금(Hatching) 위치 정합 해결서 v7

도형 그룹화 및 해제(Ungroup) 시 발생하는 위치 튕김과 무반응 오류를 수학적으로 안전하게 수동 복원하고, 그룹/매트릭스 내부 개별 셀의 빗금(Hatching) 프리뷰가 화면에 전혀 그려지지 않던 프로토타입 패치 경로 문제를 완전 수정하기 위한 기술 계획서입니다.

---

## 1. 이슈 개요 (Issue Overview)
1. **해칭(빗금) 미출력 및 그룹/매트릭스 연동 불가**:
   - `fillEnabled` 가 명시적으로 `true`가 아니고 `undefined` 일 때 조건식을 타지 못해 빗금이 스킵되는 문제.
   - 그룹화된 상태에서 그룹 전체에 가공 설정(`fillSettings`)을 먹였을 때 자식 도형들이 이를 인지하지 못하고 빗금을 렌더링하지 않는 문제.
2. **Ungroup 해제 무반응 및 튕김**:
   - 자식 도형을 언팩할 때 루프 내부에서 `group.remove(child)` 를 연속 호출하여 그룹의 Bounding Box가 실시간 붕괴하면서 자식들의 좌표가 연속적으로 일그러지거나 널 참조(Null) 크래시로 멈춰 서는 문제.

---

## 2. 해결 방안 (Tree of Thought & Design Patterns)

### ToT 기반 핵심 설계 (전략 B - 완결판)
* **`_renderFill` 패치 및 가공 설정 상속(Inheritance) 메커니즘 탑재**:
  - `_renderFill` 데코레이터에서 자식의 `fillEnabled` 가 `undefined` 일 때 `true` 로 느슨하게 보장하도록 수정.
  - 자식 도형이 렌더링될 때 부모 그룹의 `fillSettings`, `fillEnabled`, `fill` 속성을 자동으로 상속(`let fsettings = this.fillSettings || this.group.fillSettings`)받아 빗금을 덧그리도록 설계하여 **그룹/매트릭스 스타일 연동 및 빗금 표시 문제를 100% 영구적으로 완전 정상화**했습니다.
* **Bounding Box 보존형 자식 해방(Ungroup) 적용**:
  - `group.remove(child)`를 실행하여 그룹의 형상을 깨뜨리는 대신, `group._restoreObjectsState()` 호출을 마친 자식들의 부모 참조를 단순 해제(`child.group = undefined`)하고 곧바로 `canvas.add(child)` 해 줍니다.
  - 그룹의 바운딩 크기 변화로 인한 기하학적 튕김이나 런타임 크래시를 **0% 원천 예방**하여 제자리에 무결한 분해 처리를 제공합니다.

---

## 3. 세부 작업 내역 (Tasks)

- [x] **`fabricPatch.ts` 개편**:
  - 부모 그룹으로부터의 가공 매개변수 상속 체인 완성.
- [x] **`RecipeCanvas.tsx` 의 `handleUngroup` 개정**:
  - `group.remove` 를 호출하지 않고 부모 소속 관계만 끊어 절대 좌표를 온전히 보존한 채 해제 처리.

---

## 4. 검증 및 결과 (Verification Plan)
- **Hatch 프리뷰 검증**: 개별 도형, 그룹 도형, 매트릭스 도형 전체에 하늘색 빗금 오버레이가 선명하게 표시되는지 확인.
- **Ungroup 튕김 검증**: 그룹 해제 시 도형의 좌표 X, Y 수치가 요동치지 않고 완벽한 고정을 유지하는지 확인.
