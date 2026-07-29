# [스캐너/아키텍처] 설정 동기화, 기종 하드코딩 제거 및 TypeError 수정 수행 계획서

## 1. 개요 및 계획서 (Plan)

### 1.1 Scanlab 설정 저장/불러오기 경로 불일치 수정
- **문제점**: `ScanlabController` 백엔드가 설정 파일을 저장하고 불러올 때 `Bin\ScanlabConfig.json`을 타깃으로 하는 반면, 실제 프로젝트 및 프론트엔드에서는 `Bin\Config\ScanlabConfig.json` 경로를 참조하고 있어 상호 설정 값이 동기화되지 않고 있었습니다.
- **해결책**: 백엔드 C++ 코드 내 `ScanlabConfig.json` 경로를 `Config\ScanlabConfig.json`으로 수정하여 SinoGalvo와 동일한 폴더 구조로 관리하게 통일합니다.

### 1.2 `MC#` 머신 타입 하드코딩 제거 (지금 방식 적용)
- **문제점**: `[MachineConfig] Type set to: MC4` 등의 구형 머신 코드 분류가 콘솔 로그 및 일부 맵핑 로직에 여전히 잔존하고 있습니다.
- **해결책**: 프론트엔드 `machineConfig.ts`에서 하드코딩된 머신 분류(`MC1`~`MC4`) 의존성을 완전히 제거하고, 백엔드로부터 전송받은 실제 `hardware` 및 `features` 사양 데이터(예: `motion === "PMAC"`)를 참조해 카메라 슬롯 활성화 여부를 동적으로 반환하는 로직으로 개편합니다. 레거시 기종명 출력 콘솔 로그는 실제 하드웨어 동기화 완료 로그로 교체합니다.

### 1.3 `Uncaught TypeError: C.setWidth is not a function` 예외 조치
- **문제점**: 화면 전환이나 컴포넌트 소멸(unmount) 과정에서 ResizeObserver 이벤트가 비동기적으로 잔존하여, 소멸 중인 canvas 객체에 대해 `setWidth`를 호출하면서 스크립트 런타임 예외가 발생했습니다.
- **해결책**: `RecipeCanvas.tsx` 내의 resize 이벤트 콜백 함수에 `canvas` 유효성 및 메서드 탑재 여부를 검증하는 안전한 방어 코드(`typeof canvas.setWidth === 'function'`)를 주입하여 예외를 예방합니다.

---

## 2. 수정내용 (Modification Content)

### 백엔드 (C++)
- **`ScanlabController.cpp`**:
  - `LoadConfig()` 및 `SaveConfig()` 함수 내부의 설정 파일 물리적 경로 문자열을 `Config\\ScanlabConfig.json`으로 수정합니다.

### 프론트엔드 (React / TS)
- **`machineConfig.ts`**:
  - static `MACHINE_FEATURES` 의존성을 제거합니다.
  - `getEnabledCameras()`, `getMachineFeatures()` 함수가 `useAppStore`에 저장된 실시간 `hardware.motion` 벤더 정보를 보고 동적으로 슬롯 활성화 여부를 리턴하도록 수정합니다.
  - `console.log`로 `Type set to: MC#`를 찍는 부분을 완전히 삭제하거나 실제 활성화 사양 로그로 대체합니다.
- **`appStore.ts`**:
  - `setMachineStatus` 내의 타입 캐스팅 시에도 불필요한 콘솔 출력이 제거되도록 조정합니다.
- **`RecipeCanvas.tsx`**:
  - `onResizeRef.current` 내부의 `canvas.setWidth` 호출 이전에 방어 조건을 추가합니다.
    ```typescript
    if (!canvas || (canvas as any)._isDisposed || typeof canvas.setWidth !== 'function') return;
    ```

---

## 3. 최종 결론 (Final Conclusion)
본 조치들을 통해 설정 경로의 불일치가 완전히 해소되어 스캔랩 제어값의 실시간 세이브 및 릴로드가 정상 작동하게 되며, 레거시 기종 하드코딩(`MC#`)을 프론트엔드 아키텍처 상에서 완전히 몰아내어 데이터 중심의 확장성을 확보하게 됩니다. 또한 Resize 관련 예외 에러를 차단함으로써 시스템 전반의 프론트엔드 구동 안정성이 향상됩니다.
