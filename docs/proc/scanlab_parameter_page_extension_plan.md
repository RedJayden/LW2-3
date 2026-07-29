# [스캔랩] 파라미터 페이지 세부 설정 추가 및 하드웨어 진단 정보 연동 수행 계획서 (최종본)

## 1. 개요 및 계획서 (Plan)

### 1.1 스캔랩 설정 파라미터 연동 확장 및 읽기 전용 보호
- **목표**: `ScanlabConfig.json`에 정의된 `cardNo`, `correctionFile`, `jumpSpeed`, `kFactor`, `laserControl`, `laserMode`, `markSpeed`, `programFile`, `rtcVersion`, `workSize` 설정을 UI 파라미터 설정 화면에 모두 연동하여 Reload/Save가 가능하도록 합니다.
- **제약 사항**: `"correctionFile"`과 `"programFile"` 두 필드는 공장 셋업에 관련된 정보이므로 사용자가 임의로 변경할 수 없도록 UI 상에서 **읽기 전용(Read-Only, disabled)**으로 구성합니다.

### 1.2 실시간 하드웨어 진단 정보(Hardware Diagnostics) 획득 및 연동
- **목표**: 보드 뒷면이나 상세 명세서를 직접 들추지 않고도 스캐너의 실시간 하드웨어 명세를 모니터링할 수 있도록 RTC6 드라이버 DLL을 통해 직접 정보를 획득합니다.
- **제거 및 대체 사항**: 
  - 오동작의 우려가 높은 `System Settings` 카드의 수동 입력창들을 UI에서 완전히 제거합니다. (백엔드 세이브 시에는 상태 데이터를 보존하여 json 파일의 데이터가 소실되지 않도록 보장합니다.)
  - 대신 **[Hardware Diagnostics]** 카드를 우측 하단에 읽기 전용으로 신설하여 `Device`, `DLL Ver.`, `Hex Ver.`, `RTC Ver.`, `Serial Number`를 실시간 출력합니다.

---

## 2. 수정내용 (Modification Content)

### 백엔드 (C++)
- **`IRtcDriver.h`**:
  - `GetDllVersion()`, `GetHexVersion()`, `GetRtcVersionNumber()`, `GetSerialNumber()` 순수 가상 함수를 선언해 하드웨어 진단 규격을 인터페이스에 결합합니다.
- **`Rtc6Driver.h` & `Rtc6Driver.cpp`**:
  - RTC6 DLL API인 `get_dll_version`, `n_get_hex_version`, `n_get_rtc_version` 함수들의 dynamic binding 타입 정의 및 포인터를 구현해 링크하고 널 체크를 완료했습니다.
  - 카드가 성공적으로 오버라이드 로드된 시점에 DLL 함수를 직접 호출해 보드의 펌웨어 및 장치 일련번호 정수값을 취득하도록 구현했습니다.
- **`ScanlabController.h` & `ScanlabController.cpp`**:
  - 백엔드 모듈 및 라우터에서 다이렉트 호출할 수 있도록 게터 래핑 함수를 추가했습니다.
- **`PortalRouterHandler.cpp`**:
  - `HandleConfigGetScanner`: `Scanlab` 분기 시 게터를 통해 읽어온 하드웨어 실시간 명세를 딕셔너리에 추가(`dllVersion`, `hexVersion`, `rtcVersionNo`, `serialNumber`)하여 프론트엔드로 즉각 전송합니다.

### 프론트엔드 (React / TS)
- **`ScannerParameterForm.tsx`**:
  - `ScanlabConfig` 타입 구조에 실시간 하드웨어 진단 4개 변수 정보를 추가하고 로딩 파서 로직을 연결했습니다.
- **`ScanlabParameterForm.tsx`**:
  - 기존 `System Settings` 카드를 UI 코드에서 완전히 제거하여 장비 구동 환경의 오설정을 원천 차단했습니다.
  - 우측 하단에 `Hardware Diagnostics` 카드를 신설하고, RTC6 보드에서 취득한 기종 정보와 버전 및 일련번호 변수들을 `disabled={true}` 텍스트 필드로 연결하여 읽기 전용으로 출력했습니다.

---

## 3. 최종 결론 (Final Conclusion)
본 조치를 통해 스캔랩 스캐너의 고유 정보 및 보드 사양을 백엔드 하드웨어 단으로부터 실시간으로 읽어와 화면에 신뢰도 높은 계측 값으로 표기해 줌과 동시에, 사용자의 오설정 우려가 큰 수동 시스템 필드를 UI에서 제거하고 진단 영역으로 전환함으로써 안전한 장비 운용과 고장 진단 및 유지보수 편의성을 대폭 극대화하였습니다.
