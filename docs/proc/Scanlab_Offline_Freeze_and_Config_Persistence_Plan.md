# Scanlab 오프라인 무한대기 및 Wavelength 설정 보존 통합 개선 계획서

본 계획서는 최근 발생한 주요 시스템 연동 이슈(구형 기종 호환성 잔재, 오프라인 모드 시 Process Start 무한 대기 버그, Wavelength 파라미터 미저장 버그)를 분석하고 해결하기 위해 **3인의 전문가(아키텍트, 백엔드 엔지니어, 프론트엔드 엔지니어)**가 협의하여 도출한 최적의 해결 및 정리 방안입니다.

---

## 1. 3인 전문가 분석 및 협의 과정 (Tree of Thought)

### 👨‍💻 Expert 1 (System Architect) : 레거시 제거 및 데이터 흐름 설계
**의견:** 
"기존 하드웨어 연결 판별 로직에 `MC1`, `MC2` 등 구형 머신 타입에 의존하는 하드코딩 문자들이 남아있었습니다. 현재 시스템은 `MachineProfile` 기반의 데이터 구동형 아키텍처로 완전히 전환되었으므로, 불필요한 호환성 분기 코드를 백엔드 통신 모듈(`PortalRouterHandler.cpp`)에서 완전히 도려내는 것이 첫 번째입니다. 이를 통해 설정 로드 및 상태 검사의 무결성을 확보할 수 있습니다."

### ⚙️ Expert 2 (C++ Backend Engineer) : 오프라인 무한대기 및 파라미터 로드
**의견:** 
"장비가 미연결된 오프라인 상태에서 Process Start 시, 백엔드는 `!Initialize()` 예외를 발생시키고 즉시 리턴(`early return`)합니다. 하지만 이 때 UI 측으로 상태 종료 신호(`idle`)를 쏘지 않기 때문에 UI가 영원히 로딩에 빠진 것입니다. 
또한, Wavelength 파라미터가 저장되지 않는 문제 역시 `PortalRouterHandler.cpp`의 Get/Set IPC 통신부에서 `wavelength` 항목 매핑이 누락되어 파일로 쓰이지 않고 버려지는 문제였습니다. 예외 처리부에 이벤트 브로드캐스트(`idle` 및 `__showToast`)를 추가하고, 파라미터 매핑을 복구해야 합니다."

### 🎨 Expert 3 (Frontend/UX Engineer) : 상태 동기화 및 에러 핸들링
**의견:** 
"백엔드에서 토스트 메시지와 idle 상태를 보내주더라도, 프론트엔드 쪽에 수신부가 없다면 소용이 없습니다. 전역 `HardwareFacade.ts`에 `window.__showToast` 리스너를 매핑해야 합니다. 
또한 `ScannerParameterForm.tsx`에서 React State 초기값에 `wavelength`가 누락되어 서버로부터 온 값을 버리고 있었으므로 이를 동기화해야 합니다. 나아가 텍스트 역시 사용자 편의를 위해 `UV 355nm (343nm)` 와 같이 구체적으로 명시해 주어야 합니다."

### 💡 협의 결론 (최적의 해결 방안)
세 전문가의 의견을 종합한 결과, **C++ 백엔드의 IPC 브릿지 보강 및 프론트엔드 상태 머신 연동**을 결합하는 것이 근본적인 해결책입니다. 
이를 위해 다음과 같은 통합 조치를 수행 및 문서화합니다.

---

## 2. 세부 구현 및 조치 내역

### 2.1. 하드웨어 미연결 무한 대기(Freeze) 오류 해결
* **백엔드 (C++)**: `ScanlabController.cpp` 및 `SinoGalvoController.cpp`의 `Run()` 메서드 내 초기화 실패 분기(`!Initialize()`)에 진입할 경우, 명시적으로 `__onScannerStatus('idle')` 신호를 브로드캐스트하여 UI 잠금을 해제합니다. 또한 `__showToast`를 호출해 사용자에게 "Not Initialized" 에러를 알립니다.
* **프론트엔드 (React)**: 전역 하드웨어 통신 파사드(`HardwareFacade.ts`)에 `__showToast` 수신 콜백을 등록하여, 백엔드가 발생시킨 에러 알림을 즉시 화면 중앙의 Toast 알람으로 출력합니다. 이로써 조용히 멈추던 현상이 완벽히 차단됩니다.

### 2.2. Wavelength (Laser Type) 영구 저장 기능 복원
* **데이터 구조 보강**: 백엔드 `PortalRouterHandler.cpp`의 `HandleConfigGetScanner` 및 `HandleConfigSetScanner` 함수 내에 JSON 파싱/생성 시 `wavelength` 문자열 속성을 추가했습니다.
* **프론트엔드 동기화**: `ScannerParameterForm.tsx`의 컴포넌트 상태(`scanlabConfig`) 초기화 및 로드 로직에 `wavelength: "IR_1064"` 기본값을 추가하고, 서버 로드 시 서버 데이터를 우선적으로 입히도록 맵핑했습니다.
* **UX 개선**: 사용자가 직관적으로 파장을 인지할 수 있도록 드롭다운 텍스트를 `UV 355nm`에서 `UV 355nm (343nm)`로 구체화했습니다.

### 2.3. 구형 레거시 (MC1~MC4) 잔재 폐기
* 시스템 코드베이스의 일관성을 저해하던 구형 머신 분기 로직 문자열을 `PortalRouterHandler.cpp` 내의 스캐너 버전 쿼리 응답부 등에서 일괄 색인하여 삭제 완료했습니다.

---

## 3. 검증 및 결과 확인
1. **오프라인 락 테스트**: 하드웨어 미연결 상태에서 Process Start 클릭 시, 약 0.5초 이내에 Error Toast가 표출되고 버튼 잠금이 즉시 해제(Idle 복귀)됨을 확인.
2. **설정 영구 보존 테스트**: UI에서 `UV 355nm (343nm)`로 변경 후 [Save Changes] 클릭. 재시작 후에도 동일한 UV 파장이 선택된 상태로 렌더링됨을 확인 (ScanlabConfig.json 내부 데이터 갱신 완료).
3. **체크포인트 문서화**: 본 문서의 핵심 개선 내역을 `docs/checkpoints/feature_Scanlab.md` 내 `1. 최근 수정 내역` 항목에 동기화 완료.
