# [하드웨어 프로필] Fastech 모션 연동 및 기종 하드코딩 제거 완료 보고서

## 1. 개요 (Overview)

### 1.1 배경 및 목적
기존의 제어 솔루션에서는 모션 컨트롤러 종류 및 하드웨어 구성의 차이를 `MC1`, `MC2`, `MC3`, `MC4`와 같은 구체적인 특정 머신 기종명으로 직접 매핑하여 UI 및 백엔드 비즈니스 로직 상에서 하드코딩된 분기 처리를 해왔습니다.
- **Fastech 모션 및 알람 리셋 UI 지원**: Fastech 모션 환경에서 전용의 알람 리셋(Alarm Reset) 기능이 동작할 수 있는 UI 구현이 필요했습니다.
- **기종 하드코딩 의존성 제거**: 기종 단위의 정적 예외 처리가 가독성과 유지보수성을 악화시키고 신규 하드웨어의 유연한 도입을 방해함에 따라, 시스템을 하드웨어 프로필(`MachineProfile`) 및 기능 역량(Capability/Feature) 기반의 데이터 구동 아키텍처로 전면 수정하였습니다.

---

## 2. 수행 계획서 요약 (Implementation Plan Summary)

- **프론트엔드 (UI)**
  - UI 렌더링을 제어하던 `machineType`에 대한 의존을 끊고, 전역 스토어(`appStore`)에 동기화된 백엔드 프로필 속성(`hardware.motion`, `features.lightChannels`, `features`)을 직접 활용하여 분기 및 슬라이싱을 수행합니다.
- **백엔드 (Core - C++)**
  - `MachineTypeUtil::IsMCx()`와 같은 정형화된 머신 타입 분기 코드를 폐기하고, 공통 `MachineProfile::Instance()` 싱글톤 객체로부터 지원되는 물리 속성 및 벤더 값을 비교 판별하도록 수정합니다.
- **하위 호환성 및 경고**
  - 기존 구형 API 사용에 대하여 `[[deprecated]]` 지시자를 적용하여 점진적 이주를 권장합니다.

---

## 3. 상세 수정 적용 내용 (Applied Changes)

### 3.1 프론트엔드 (React / TS)

#### ① [MotionParameterForm.tsx](file:///c:/LNG/Source/LW2-3/Portal/src/ui/pages/Parameter/MotionParameterForm.tsx)
- **Fastech 전용 알람 리셋 지원**
  - 모션 축 제어 폼 내 알람 리셋 렌더링 로직을 `machineType === 'MC3'`에서 `hardware.motion === 'Fastech'`로 수정하였습니다.
  - 이를 통해 Fastech 모션 장비일 때에만 UI 상에 1개의 공통 `Alarm Reset` 버튼이 활성화되도록 구조를 분리했습니다.

#### ② [RightPanel.tsx](file:///c:/LNG/Source/LW2-3/Portal/src/ui/shell/RightPanel.tsx)
- **조명 제어 채널 동적 할당**
  - 기존 조명 UI 채널을 자르던 로직 (`machineType === 'MC3' ? lightsState.slice(0, 4) : lightsState`)을 `features.lightChannels` 기반으로 동적 판별하게 수정했습니다.
  ```typescript
  const activeLights = lightsState.slice(0, features.lightChannels || lightsState.length);
  ```
  - `machineType`을 관측하지 않도록 종속성을 정리했습니다.

#### ③ [CanvasBackground.tsx](file:///c:/LNG/Source/LW2-3/Portal/src/ui/pages/Recipe/Canvas/CanvasBackground.tsx) 및 [RecipeCanvas.tsx](file:///c:/LNG/Source/LW2-3/Portal/src/ui/pages/Recipe/Canvas/RecipeCanvas.tsx)
- **정적 기능 매핑 제거 및 동적 피처 적용**
  - `MACHINE_FEATURES[machineType]`와 같이 소스코드 상의 기종 정형 객체에 맵핑하던 레거시 로직을 완전히 제거했습니다.
  - 대신 전역 스토어 상태인 `useAppStore.getState().features`로 대체하여 백엔드의 실제 기능 활성화 여부를 즉시 동기화하도록 유도했습니다.

#### ④ [SubTitleBar.tsx](file:///c:/LNG/Source/LW2-3/Portal/src/ui/shell/SubTitleBar.tsx)
- 미사용 코드로 판명된 `const machineType = useAppStore((s) => s.machineType);` 변수를 제거하여 코드를 최적화했습니다.

---

### 3.2 백엔드 (Core - C++)

#### ① [PortalRouterHandler.cpp](file:///c:/LNG/Source/LW2-3/LASERnGRAPN/Core/Communication/PortalRouterHandler.cpp)
- **픽셀 보정 좌표 스케일링 로직 개선 (픽 센터)**
  - `if (MachineTypeUtil::IsMC1() || MachineTypeUtil::IsMC2())` -> `if (MachineProfile::Instance().GetMotion() == "PMAC")`
  - PMAC 모션 장비에만 적용되는 픽셀 단위(/1000.0) 단위 스케일 변경 조건을 직관적인 모션 컨트롤러 구분형으로 대체하였습니다.
- **Aurelia Laser Shutter 제어 로직 개선**
  - `if (MachineTypeUtil::IsMC1() || MachineTypeUtil::IsMC2())` -> `if (MachineProfile::Instance().GetMotion() == "PMAC")` (PMAC용 IO 기반 셔터 동작)
  - `else if (MachineTypeUtil::IsMC3())` -> `else if (MachineProfile::Instance().HasZeroG())` (ZeroG IO 카드 사용 조건으로 제어)

#### ② [MachineType.h](file:///c:/LNG/Source/LW2-3/LASERnGRAPN/Core/MachineType.h)
- 기존의 `IsMC1()`, `IsMC2()`, `IsMC3()`, `IsMC4()`, `Get()` 함수 사용을 제한하기 위해 C++ `[[deprecated("Use MachineProfile::Instance() instead")]]` 특성을 코드 전체에 선언하여 경고 처리를 유도하였습니다.

---

## 4. 아키텍처 개선 효과 (Architecture Benefits)

1. **기기 독립성 확보**: 새로운 모델 명칭(`MC5` 등)이 지속해서 출시되더라도 React 프론트엔드나 C++ 코어의 내부 로직 수정(예외 분기문 추가) 없이 `machine.ini` 설정 변경만으로 모든 피처가 즉각 동적으로 결정됩니다.
2. **비즈니스 로직의 명확성**: `IsMC3()`가 무엇을 뜻하는지 파악할 필요 없이 `HasZeroG()`, `GetMotion() == "Fastech"`와 같이 직관적으로 코드가 의미하는 실제 하드웨어 역량을 파악할 수 있어 디버깅 효율이 급증합니다.
3. **점진적 코드 리팩토링 유도**: 하위 호환성용 구형 함수에 `deprecated` 경고를 줌으로써, 이후 유지보수 작업에서 자연스럽게 기능 위주 코드로 전환되도록 설계의 안전장치를 마련했습니다.
