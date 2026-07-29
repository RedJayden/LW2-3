# 파라미터 화면에서 X20 렌즈 설정 UI 노출 문제 해결을 위한 설계 및 구현 계획서

## 1. 개요 및 원인 분석

### 1.1 현상
- `machine.ini` 파일에 `[SUPPORTED_FEATURES]`의 `ALLOWED_LENSES=X20,X50`으로 설정하였음에도 불구하고, 실제 프론트엔드 프로그램 실행 시 파라미터 설정 화면(`Parameter.tsx` -> `MoonsParameterForm.tsx` 내의 Lens Configuration)에서 X20 렌즈 관련 오프셋 및 Z축 높이 입력 UI가 표시되지 않음 (X50만 표시됨).

### 1.2 원인 분석
1. **백엔드 (C++ Native - `MachineProfile` 클래스)**:
   - `machine.ini` 파일에서 `ALLOWED_LENSES`를 정상적으로 파싱하여 `m_allowedLenses` 멤버 변수에 저장합니다.
   - IPC 통신 핸들러인 `PortalRouterHandler::HandleConfigGetMachineStatus`에서 `allowedLenses` 배열을 JSON 형태로 프론트엔드에 정상 송신합니다.
2. **프론트엔드 (React / Zustand - `appStore.ts` & `MoonsParameterForm.tsx`)**:
   - `MoonsParameterForm.tsx`는 렌더링 여부를 `features.hasObjectX20` 플래그를 기준으로 판단합니다.
   - 그러나 프론트엔드 전역 상태를 관리하는 `appStore.ts` 내의 `FeatureConfig` 인터페이스 정의 및 초기 상태에는 `hasObjectX20` 속성이 정의되어 있지 않습니다.
   - 또한, 백엔드로부터 장비 상태 데이터를 동기화하는 `setMachineStatus` 함수 내에서도 `hasObjectX20`를 세팅하지 않아, 런타임에 `features.hasObjectX20` 값이 `undefined`로 평가되어 조건부 렌더링에 의해 UI가 표시되지 않았습니다.

---

## 2. 3인 전문가 논의 및 대안 비교 (Tree of Thought)

### [Expert A: System Architect / C++ Backend Developer]
> **의견**: 백엔드 IPC 전송 레이어에서 `featuresDict->SetBool("hasObjectX20", ...)` 형태로 플래그를 직접 주입해 주는 것도 가능합니다.
> **평가**: C++ 백엔드를 변경하면 네이티브 실행 파일을 다시 빌드하고 배포해야 하는 물리적 부담이 있습니다. 가능하면 프론트엔드 매핑 단에서 들어오는 `allowedLenses` 데이터를 활용하여 파생 필드를 만드는 것이 유연하고 적합합니다.

### [Expert B: Frontend / State Management Specialist]
> **의견**: Zustand 전역 스토어인 [appStore.ts](file:///c:/LW23_porg/002.INC/LW2-3_INC_260619/Portal/src/store/appStore.ts)의 `FeatureConfig` 인터페이스에 `hasObjectX20`를 추가하고, `setMachineStatus` 액션 호출 시 `status.features.allowedLenses.includes("X20")` 결과를 바탕으로 값을 계산해 주어야 합니다.
> **평가**: **(가장 추천하는 안)** 백엔드 코드를 손대지 않고 기존에 전달되던 데이터(`allowedLenses`)를 기반으로 온프레미스/오프라인 환경에서도 안정적으로 렌더링 상태를 제어할 수 있습니다. 타입 안정성(Type Safety)도 완벽하게 준수됩니다.

### [Expert C: UI/UX & Safety Engineer]
> **의견**: 이 필드가 `undefined`로 유지되면 단순히 UI 미노출뿐만 아니라, `AppShell.tsx`에서 `object_x20` 렌즈의 보정값(Calibration) 파일을 불러오지 못해 캔버스 좌표 매핑 및 계측 상의 안전 문제를 유발할 수 있습니다. 
> **평가**: 스토어 수준에서 확실하게 `hasObjectX20` 값을 정의하여 시스템 전반(`AppShell`, `RecipeCanvas`, `MoonsParameterForm`)의 오동작을 통합 제어하는 것이 옳습니다.

### 최종 솔루션 채택 사유
- **선택한 방안**: **Zustand 전역 스토어 매핑 보완 (Expert B 안)**
- **이유**: `appStore.ts` 한 곳만 수정하여 UI 상태 및 보정치 로딩 관련 논리적 버그를 완벽하게 해소할 수 있으며, C++ 빌드 의존성을 피할 수 있어 수정 및 배포 리스크가 가장 적습니다.

---

## 3. 세부 설계 및 적용 패턴

### 3.1 적용 디자인 패턴
- **State Synchronization / Mapping Pattern**: 백엔드에서 내려온 원시 배열 정보를 기반으로 필요한 파생 상태(`hasObjectX20`)를 스토어 단에서 동기화하여 변환하는 패턴을 적용합니다.
- **Singleton Store Pattern (Zustand)**: 단일 상태 원천(Single Source of Truth)을 활용해 전역 상태를 한 곳에서 일관되게 동기화합니다.

### 3.2 클린 코드 및 구현 원칙
- **TypeScript Type Safety**: `FeatureConfig` 인터페이스에 필드를 명시적으로 명세하여 빌드 타임 오류를 방지합니다.
- **KISS & DRY**: 각 컴포넌트에서 `allowedLenses.includes("X20")`를 반복 호출하는 대신, 스토어의 `hasObjectX20` 필드로 중앙화하여 연산 효율을 도모합니다.

---

## 4. 변경 예정 파일 및 코드 수정 계획

### [Component: Portal / Store]

#### [MODIFY] [appStore.ts](file:///c:/LW23_porg/002.INC/LW2-3_INC_260619/Portal/src/store/appStore.ts)

1. `FeatureConfig` 인터페이스에 `hasObjectX20?: boolean;` 정의 추가
2. 초기 상태(`INITIAL_STATE` 내 `features`)에 `hasObjectX20: true` (기본값) 추가
3. `setMachineStatus` 구현체에 동적 계산 로직 적용:
   ```typescript
   const hasObjectX20 = status.features.allowedLenses.includes("X20");
   ```

---

## 5. 검증 계획

### 5.1 수동 검증 항목
1. **UI 노출 확인**: `machine.ini`에 `ALLOWED_LENSES=X20,X50`이 지정되어 있을 때, **Lens Configuration**에 `Magnification x20`과 `Magnification x50`이 함께 노출되는지 확인합니다.
2. **콘솔 로그 확인**: 브라우저 콘솔 및 로그 패널에 비정상적인 TypeScript 타입 에러나 `undefined` 접근 오류가 발생하지 않는지 감시합니다.
3. **INI 설정 변경 테스트**: `machine.ini`에서 `ALLOWED_LENSES=X50`으로 변경 후 재기동 시, X20 입력 폼이 정상적으로 은폐되는지 확인하여 동적 구성이 완벽한지 교차 검증합니다.
