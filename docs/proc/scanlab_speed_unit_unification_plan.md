# [스캔랩] 가공 속도 단위 mm/s 통일화 및 물리 속도 동기화 수행 계획서

## 1. 개요 및 계획서 (Plan)
현재 장비에서 SCANNER=Scanlab (RTC6 시스템)과 SinoGalvo 두 가지 스캐너 기종을 선택하여 사용할 수 있습니다.
- **SinoGalvo**: UI에서 `mm/s` 단위를 직접 입력받아 물리 속도를 제어합니다.
- **Scanlab**: RTC6 카드는 내부 속도 함수로 `Bits/ms` (밀리초당 비트 카운트) 단위를 요구합니다.
- **문제점**: 현재 스캔랩 제어부(`ScanlabController`)가 UI에서 넘어온 `mm/s` 단위를 드라이버 함수에 물리적 변환 없이 그대로 넘겨줌으로써, 스캐너 캘리브레이션 렌즈 정보인 `K-Factor`에 따른 가공 속도가 SinoGalvo와 물리적으로 일치하지 않거나 렌즈 변경 시 비정상적인 속도로 가공되는 문제가 있습니다.

### 해결 방안
UI와 설정 데이터(`ScanlabConfig.json`)는 두 기종 모두 동일하게 `mm/s` 단위를 표준으로 입력받고 유지합니다.
스캔랩 드라이버에 전달되기 직전에 캘리브레이션 `K-Factor` 값을 결합하여 실시간으로 `Bits/ms`로 변환해 하드웨어 카드로 전송하도록 구현합니다.

**속도 변환 공식:**
$$\text{RTC6 Speed (Bits/ms)} = \frac{\text{UI Speed (mm/s)} \times \text{K-Factor (Bits/mm)}}{1000}$$

---

## 2. 수정내용 (Modification Content)

### 백엔드 (C++) 수정 내용
- **`ScanlabController.h` 수정**:
  - `mm/s` 단위를 `Bits/ms` 단위로 변환해 주는 헬퍼 함수 `ConvertSpeedToBitsPerMs(double speedMmPerSec)`를 추가합니다.
- **`ScanlabController.cpp` 수정**:
  - `ConvertSpeedToBitsPerMs` 함수를 구현합니다. (RTC6 카드의 `m_dCalibrationFactorK`를 참조하되, 유효하지 않은 경우 안전을 위한 Fallback 처리를 내장합니다.)
  - 드라이버의 속도 조절 함수 `m_rtcDriver->SetSpeed(...)`를 호출하는 총 3개 지점을 찾아 변환 로직을 적용합니다.
    1. `Initialize()` 초기화 시 속도 설정 지점 (Line 185)
    2. `Run()` 마킹 시작 전 속도 설정 지점 (Line 261)
    3. `Run()` 내부 Z축 레이어 이동(`Z_MOVE`)에 따른 청크 전환 시 속도 설정 지점 (Line 300)

---

## 3. 최종 결론 (Final Conclusion)
본 개선 사항을 통해 UI 단에서는 장비의 하드웨어 기종(SinoGalvo/Scanlab)에 무관하게 동일한 물리적 기준의 속도(`mm/s`)를 입력받아 관리할 수 있게 됩니다.
결과적으로 가공 레시피(파라미터)를 장비 기종 간에 정합성 있게 공유할 수 있게 되며, 스캔랩 장비의 K-Factor 정보가 달라지더라도 실제 물리 속도가 왜곡되는 현상을 원천 차단하여 가공 신뢰성을 확보하게 됩니다.
