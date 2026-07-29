# Feature: PMAC 연동 (PMAC Integration) 상세 명세

본 문서는 PMAC(Power PMAC) 모션 컨트롤러 연동 모듈의 최종 구현 상태를 상세히 기록한 문서입니다. 본 모듈은 하드웨어 독립적인 모터 제어 환경을 제공하며, 소프트웨어 인터록을 통한 안전성 확보에 중점을 둡니다.

---

## 1. 기능 개요

**PMAC 연동 모듈**은 Delta Tau 사의 Power PMAC과 이더넷(TCP/IP) 통신을 통해 다축 모션 제어를 수행합니다. 단순히 하드웨어 명령을 전달하는 것을 넘어, 상위 레벨에서 정의된 안전 가이드라인(Software Interlock)을 실시간으로 적용하여 장비의 물리적 충돌을 방지합니다.

### 주요 도메인 로직
- **명령 래핑**: PMAC 전용 명령 문자열을 생성하고 `DTKSendCommand` API를 통해 전송.
- **실시간 인터록**: 이동 명령 시 `EqMotionRunPara`에 설정된 하드웨어 리미트 및 소프트웨어 인터록 범위를 검사.
- **속도 제어 최적화**: 명령 시마다 속도(`Velocity`)와 가속도(`Accel`)를 설정할 수 있으며, 값이 설정되지 않은 경우 설정 파일(INI)의 기본값을 사용.
- **다형성 지원**: 모든 모터 객체는 `MotorBase` 인터페이스를 통해 동일한 방식으로 제어 가능.

---

## 2. 주요 클래스 및 인터페이스

### 2.1 추상화 계층 (Abstraction Layer)
- **[MotorBase.h](file:///d:/000.Git_Project/LW2-3/LASERnGRAPN/Modules/Motor/Base/MotorBase.h)**: 
    - 모터의 공통 동작(`Connect`, `Servo`, `MovAbs` 등)을 정의하는 추상 클래스.
    - `m_AttributeMap`: 스레드 안전한 `SyncMap`을 사용하여 "SERVO", "TARGET_POS"와 같은 하드웨어 변수명을 키-값 쌍으로 관리.
- **[Motor.h](file:///d:/000.Git_Project/LW2-3/LASERnGRAPN/Modules/Motor/Base/Motor.h)**: 
    - `MotorBase` 인스턴스를 소유하고 기능을 대리 수행하는 핸들 클래스.
    - `MotorUtil`: 동기/비동기 이동 명령(Home, Move)을 위한 유틸리티 제공.

### 2.2 구현 계층 (Implementation Layer)
- **[PMACMotor.h/cpp](file:///d:/000.Git_Project/LW2-3/LASERnGRAPN/Modules/Motor/PMAC/PMACMotor.h)**: 
    - PMAC 하드웨어 전용 구현체.
    - `GetStatus()`: PMAC 상태 값을 비트 연산하여 `m_Servo`, `m_IsMoving`, `m_PositiveLimit` 등으로 변환.
    - `MovAbs` / `MovRel`: `EqMotionRunPara`를 참조하여 소프트웨어 인터록을 수행한 후 명령 전송.
- **[PMAC.h/cpp](file:///d:/000.Git_Project/LW2-3/LASERnGRAPN/Modules/Motor/PMAC/Power_PMAC/Include/PMAC.h)**: 
    - `GPP SDK`의 `DTKSendCommand`를 래핑한 로우 레벨 통신 클래스.
    - `CRITICAL_SECTION`을 이용한 명령 전송 순차성 보장.
    - `UploadProgram`: GCode 또는 모션 프로그램을 PMAC 내부 버퍼로 업로드하는 특화 기능 포함.

### 2.3 파라미터 관리 (Parameter Management)
- **[EqMotionRunPara.h/cpp](file:///d:/000.Git_Project/LW2-3/LASERnGRAPN/Modules/Motor/EqMotionRunPara.h)**: 
    - 싱글톤 패턴으로 구현된 축 설정 관리 클래스.
    - 각 축의 `ScaleUnit`, `Limit_Min/Max`, `Interlock_Min/Max`, 속도 프로파일(Fast, Normal, Slow) 관리 및 INI 파일 연동.

---

## 3. 적용된 디자인 패턴

| 패턴명 | 적용 이유 및 효과 |
| :--- | :--- |
| **Bridge Pattern** | 모터의 추상화(`Motor`)와 하드웨어 구현(`PMACMotor`)을 분리하여 상의 로직 수정 없이 하드웨어 교체 가능. |
| **Singleton Pattern** | `EqMotionRunPara` 및 `LogManager`에 적용하여 전역 설정 및 로그 시스템의 일관성 보장. |
| **Proxy Pattern** | `Motor` 클래스가 실제 구현체인 `MotorBase*`를 대리하여 사용자에게 안전한 호출 컨텍스트 제공. |
| **Template Method** | `MotorBase`의 `GetAttribute<T>`를 통해 다양한 타입의 속성 값을 자식 클래스에서 쉽게 공통 관리. |

---

## 4. 도메인 로직 상세: 소프트웨어 인터록 (Software Interlock)

`PMACMotor`는 이동 명령 전 다음 로직을 통해 안전을 검증합니다.

### 4.1 MovAbs 검증 (절대 이동)
```cpp
auto* pParams = EqMotionRunPara::Instance().GetAxis(m_Axis);
if (pParams && pParams->limit_used) {
    double targetMm = mm / 1000.0; // mm 단위 변환 (필요 시)
    if (targetMm < pParams->interlock_min || targetMm > pParams->interlock_max) {
        // [ALARM] 호출 및 명령 차단
        return FALSE;
    }
}
```

### 4.2 Jog 검증 (수동 조그)
- **JogCW**: 현재 위치가 `interlock_max` 이상이면 이동 명령을 차단하고 로그 기록.
- **JogCCW**: 현재 위치가 `interlock_min` 이하이면 이동 명령을 차단하고 로그 기록.

---

## 5. 의존성 정보

- **외부 라이브러리**: Delta Tau Power PMAC GPP SDK (`PowerPmac.h`, `Pmac.lib`).
- **프레임워크**: MFC (MFC 기반 `CString`, `CRITICAL_SECTION` 활용).
- **내부 모듈**: 
    - `Shared/Util`: 로깅(`LogManager`), 문자열 유틸(`StrUtil`).
    - `Modules/Motor/UnitConvert`: 좌표/단위 변환 모듈.

---

## 6. 사용법 및 제약 사항

- **초기화**: `Motor` 핸들 생성 후 `SetInstance(new PMACMotor(...))`를 통해 구현체를 바인딩해야 합니다.
- **상태 동기화**: `PMACMotor`의 `Connect()`는 상위 `PMAC` 통신 객체의 상태에 의존합니다. 개별 모터가 `Connect`를 호출해도 실제 통신 포트는 공유됩니다.
- **좌표계 주의**: 하드웨어 리미트와 소프트웨어 인터록 리미트의 단위(User Unit vs Counting Unit)가 보정되었는지 호출 전 확인이 필요합니다. (현재 구현은 `mm` 단위 기반).
- **스레드 안전성**: `PMAC` 클래스 내부에 크리티컬 섹션이 적용되어 있으나, 다축 동시 제어 시 명령 간격(`WaitTick`) 설정이 성능에 영향을 줄 수 있습니다.

## 7. 최근 업데이트 (2026-07-16)

### 7.1 PMAC 단위계(1000배 스케일) 변환 및 프리셋 모션 연동
*   **이슈**: 렌즈 전환 모션 및 Safe Z 복귀 모션 시, 모션 제어 기종이 PMAC 인 경우 위치 카운트 단위가 1000배 스케일링되어야 정밀 이동이 성립함.
*   **해결**: 
    1.  `PortalRouterHandler.cpp` 내의 모든 프리셋 모터 구동 모듈에서 `MachineProfile::Instance().GetMotion() == "PMAC"` 여부를 실시간 파악하여 단위계 멀티플라이어 `pmacMult = 1000.0` (그 외 1.0)을 동적으로 정의했습니다.
    2.  Z축 및 스테이지 XY축의 모든 절대/상대 이동 모션(`g_X.MovAbs`, `g_Y.MovAbs`, `g_Z.MovAbs`) 시 이 멀티플라이어 인자를 정밀 결합하여, PMAC 컨트롤러에서도 리미트 아웃 없이 완벽한 초점 높이 및 오프셋 위치 정렬을 수행하도록 조치했습니다.

### 7.2 호밍(Homing) 중 소프트웨어 인터락 오탐에 의한 호밍 교착(Deadlock) 해결
*   **이슈**: `Home All` 실행 시 축이 물리적 홈 스위치를 찾기 위해 소프트 인터락 범위(`interlock_min/max`)를 **의도적으로** 벗어나 이동하는데, `PortalRouterHandler`의 폴링 루프 내 전역 인터락 감시 로직이 이를 위반으로 판정하여 `PMACUtil::AllStop()`을 호출함. 이로 인해:
    1.  호밍 모션이 시작 직후 강제 정지되고, PMAC 호밍 상태 변수(`ALL_HOME`, 각 축 `HOME`)가 "진행 중(10)" 값에 머물러 프론트엔드 UI가 무한 "Homing..." 표시 상태(교착)에 빠짐.
    2.  사용자 화면에는 `Software Interlock (경계값 인터락)` 팝업이 오탐 표출됨.
*   **해결**:
    1.  **백엔드 (PortalRouterHandler.cpp)**: 폴링 루프에서 호밍 상태 변수 판독(`homingAll/X/Y/Z`)을 인터락 검사보다 **선행**하도록 순서를 재배치하고, 어느 축이든 값이 `10`(호밍 진행 중)이면 인터락 위치 검사와 `AllStop()` 호출을 스킵. 호밍이 종료되어 상태 값이 변하면 다음 폴링 주기부터 인터락 감시가 자동 재개됩니다.
    2.  **프론트엔드 (HardwareFacade.ts)**: `homingState.active` 동안 인터락 팝업 다이얼로그 표출을 억제하는 이중 가드 적용.
    3.  **파라미터 UI 잠금 (MotionParameterForm.tsx / ParameterComponents.tsx)**: 호밍 진행 중에는 Parameter → Motion Main → Axis Information 페이지의 Hardware Limits(Min/Max Limit) 및 Software Interlock(Soft Min/Max) 입력 필드 4종을 `disabled` 처리(반투명 + 안내 문구 "호밍 중에는 수정할 수 없습니다")하고, 호밍 완료 시 자동 재활성화되도록 조치했습니다.
*   **의도된 잔여 동작 (참고)**: 호밍을 **수동 취소(Cancel)**한 직후 현재 위치가 인터락 범위 밖이면 팝업이 발동하는 것은 정상적인 안전 동작입니다 (호밍 플래그가 더 이상 10이 아니므로 감시가 즉시 재개됨).

---
**최종 수정일**: 2026-07-16
**작성자**: Antigravity (Advanced Agentic Coding AI)
