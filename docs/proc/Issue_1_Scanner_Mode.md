# 1. Scanner 모드에서 Scanlab, SinoGalvo 모드 구분 및 Processing Rate 개선

## 3인의 전문가 분석 (Tree of Thought)

### Expert 1: UI/UX 개발자 (React/Zustand)
**원인 분석:**
SinoGalvo 사용 시 필요 없는 `Buffer Status`가 표시되는 이유는 `SinoGalvoProcessPanel.tsx` UI 컴포넌트 내에 `Scanlab`과 동일하게 상태를 렌더링하는 코드가 남아있기 때문입니다. 
Processing Rate가 첫 도형 이후 무조건 100%로 표시되는 현상은 `useProcessMonitor.ts`의 타이머 기반 추정 로직이 개입하거나, 백엔드로부터 `scanner/status` 이벤트의 `idle`이 첫 도형 가공 직후 조기에 전달되어 상태를 강제로 100%로 덮어쓰기 때문입니다.

**해결 방안:**
1. `SinoGalvoProcessPanel.tsx`에서 `Buffer Status` 렌더링 부분을 조건부로 제거합니다.
2. `useProcessMonitor.ts`에서 SinoGalvo의 경우 타이머 기반 진행률 덮어쓰기를 비활성화하고, C++ 백엔드에서 전달되는 순수 `progress` 이벤트를 신뢰하도록 수정합니다.

### Expert 2: C++ 백엔드 엔지니어 (Scanner Control)
**원인 분석:**
`SinoGalvoController.cpp` 및 `ScanlabController.cpp` 내부를 확인해보면, 둘 다 전체 명령(`m_commands`)의 인덱스(`cmdIndex`)를 기반으로 진행률을 계산하여 `window.__onScannerProgress`를 프론트엔드로 전송하고 있습니다. 
하지만 프론트엔드(`useProcessMonitor.ts`)에서 이 정확한 이벤트 기반 진행률을 사용하지 않고, 자체적으로 산출한 `estimatedTotalSeconds`를 이용한 타이머 기반 추정 로직으로 진행률(Process Rate)을 덮어쓰고 있었습니다. 이로 인해 다중 도형 처리 시 진행률이 실제와 맞지 않거나 조기에 100%로 튀는 문제가 발생한 것입니다.

**해결 방안:**
1. C++ 백엔드의 진행률 계산 방식은 이미 Scanlab과 SinoGalvo 모두 `cmdIndex` 기반으로 되어 있으므로 이 로직을 신뢰합니다. 다만 여러 도형을 묶음 처리할 때 `StartMarking()`(SinoGalvo) 또는 `ExecuteList()`(Scanlab) 완료 대기 지점과 프로그레스 전송 주기가 잘 맞아떨어지도록 동기화를 점검합니다.
2. 프론트엔드에서 `window.__onScannerProgress` 이벤트 수신 시 단순히 UI의 Buffer Status만 업데이트하는 것이 아니라, 전역 스토어의 Process Rate(`scanner` progress)를 직접 업데이트하도록 파이프라인을 수정합니다.

### Expert 3: 시스템 아키텍트
**종합 의견:**
Scanlab 역시 C++ 백엔드에서 `cmdIndex` 기반의 진행률 전송을 지원하고 있으므로, 부정확한 타이머 기반 진행률 추정 로직을 전면 폐기하는 것이 타당합니다. 두 모드 모두 프론트엔드 타이머 의존성을 제거하고 백엔드가 전송하는 실시간 진행률(`__onScannerProgress`)을 전역 `ProcessDashboard`에 직접 연동하는 통합 방식으로 구조를 개선합니다. 아울러 불필요해진 SinoGalvo의 Buffer Status UI는 제거합니다.

## 수정 계획 (Plan)
1. **Frontend (`SinoGalvoProcessPanel.tsx` & `ScanlabProcessPanel.tsx`)**: 
   - `window.__onScannerProgress` 콜백에서 전역 스토어(`updateProcessStatus('scanner', { progress: v })`)를 직접 업데이트하도록 변경.
   - `SinoGalvoProcessPanel`에서 불필요한 `Buffer Status` 게이지 UI 요소 삭제.
2. **Frontend (`useProcessMonitor.ts`)**: 
   - 부정확한 타이머 기반 진행률(Progress Rate) 추정 로직(`estimatedTotalSeconds` 기반 덮어쓰기)을 완전히 제거.
3. **Backend (`SinoGalvoController.cpp` & `ScanlabController.cpp`)**: 
   - `__onScannerStatus('idle')` 전송 시점을 모든 도형(Commands) 처리가 완전히 종료된 시점 최하단으로 확실히 고정.
   - `__onScannerProgress`가 도형별/버퍼별 처리 단위에 맞게 정확히 100분율 변환되어 전송되도록 보장 (기존 로직 유지 및 세부 튜닝).

## 진행 결과 (Result)
* `SinoGalvoProcessPanel` 및 `ScanlabProcessPanel` 수정 완료 (전역 Progress 연동 및 UI 제거)
* `useProcessMonitor.ts` 수정 완료 (타이머 기반 가짜 진행률 폐기)
* **Status**: 해결 완료 (Done)
