# Feature: Fastech 모션 연동 (Fastech Motion Integration) 상세 명세

본 문서는 프로젝트 내 Fastech(Ezi-SERVO / EziMOTIONPlusE) 모션 컨트롤러 연동 모듈의 분석 결과를 기록한 명세서입니다. 본 모듈은 하드웨어 독립적인 모션 제어 인터페이스(`MotorBase`)를 상속받아 구현되었으며, 데이터 구동형 장비 사양 설정(`machine.ini`) 및 전용 설정(`FastechConfig.ini`)에 따라 동적으로 빌드 및 기동됩니다.

---

## 1. 기능 및 하드웨어 사양 개요

**Fastech 모션 연동 모듈**은 Fastech 사의 이더넷 기반 서보 드라이버(Ezi-SERVO II 등)와 TCP/IP 통신을 수행하여 다축(X, Y, Z) 스테이지 모션을 제어합니다.

### 주요 머신 구분 (Backward Compatibility)
`machine.ini`의 `MOTION=Fastech` 설정과 함께 Z축 낙하 방지용 **ZeroG 보드** 탑재 여부에 따라 시스템 타입이 다음과 같이 구분됩니다.
- **MC3**: Fastech 모션 컨트롤러 + ZeroG 제어 보드 탑재 (`HAS_ZEROG=1`)
- **MC4**: Fastech 모션 컨트롤러 + ZeroG 제어 보드 미탑재 (`HAS_ZEROG=0`)

### 주요 특징
- **이더넷 (TCP/IP) 통신**: 각 드라이버 축마다 고유의 IP 주소와 Board ID를 할당하여 통신합니다.
- **드라이버 레벨 mm 단위 수용**: PMAC과 달리 상위 레이어 및 UI와 주고받는 좌표 데이터 단위가 `mm` 기반(Scale Factor = 1.0)으로 처리되며, 하부 드라이버 내부에서 펄스(Pulse) 및 PPS 단위로 환산되어 명령이 전달됩니다.
- **안전한 원점 복귀(Homing) 시퀀스**: 스테이지 충돌 및 기구적 파손을 예방하기 위해, Z축 원점 복귀를 동기(Sync) 방식으로 완전히 수행하여 들어올린 후, X축과 Y축 원점 복귀를 비동기(Async) 방식으로 동시 수행합니다.

---

## 2. 주요 클래스 및 인터페이스

Fastech 모듈은 프로젝트의 하드웨어 추상화 레이어(Bridge 및 Proxy 패턴)를 그대로 준수하여 설계되었습니다.

### 2.1 추상화 계층 (Abstraction Layer)
- **[MotorBase.h](file:///c:/LNG/Source/LW2-3/LASERnGRAPN/Modules/Motor/Base/MotorBase.h)**: 
  - 모든 모터 드라이버의 공통 행위(`Connect`, `Servo`, `MovAbs`, `MovRel`, `Homing`, `GetPos`, `SetSpeed` 등)를 순수 가상 함수로 선언한 추상 베이스 클래스입니다.
- **[Motor.h](file:///c:/LNG/Source/LW2-3/LASERnGRAPN/Modules/Motor/Base/Motor.h)**:
  - `MotorBase` 포인터를 소유하고 실제 구현체에 동작을 대리 위임하는 프록시(Proxy) 클래스입니다.
  - 상위 비즈니스 로직 및 UI 핸들러는 개별 드라이버 구현체에 직접 접근하지 않고 이 `Motor` 인터페이스를 통해 일관되게 제어합니다.

### 2.2 구현 계층 (Implementation Layer)
- **[FastechMotor.h/cpp](file:///c:/LNG/Source/LW2-3/LASERnGRAPN/Modules/Motor/Fastech/FastechMotor.h)**:
  - Fastech 드라이버를 제어하기 위한 실질적인 구현 클래스입니다.
  - 외부 SDK DLL API인 `FAS_EziMOTIONPlusE` 라이브러리를 `PE` 네임스페이스를 통해 호출합니다.
  - 다중 스레드 호출 환경에서의 안전성을 확보하기 위해 내부 멤버 크리티컬 섹션 `CRITICAL_SECTION _cs`을 활용하여 하드웨어 제어 명령 송수신을 동기화합니다.
- **[FastechUtil](file:///c:/LNG/Source/LW2-3/LASERnGRAPN/Modules/Motor/Fastech/FastechMotor.h#L41-L44)**:
  - `SetParameter(const CString& Axis, Motor& m)`: 전역 파일 객체 `INI_FASTECH`로부터 읽은 특정 축의 IP, ID, LEAD screw, PULSE 수 및 이동/Jog 속도 프로파일 정보를 해당 모터 객체의 `m_AttributeMap` 속성 데이터로 적재하는 유틸리티 네임스페이스입니다.

---

## 3. 설정 파일 (Configuration Spec)

Fastech 구동에 관여하는 설정 파일은 크게 두 가지로 나뉩니다.

### 3.1. [machine.ini](file:///c:/LNG/Source/LW2-3/Bin/Config/machine.ini)
장비 기종 정의 및 하드웨어 가용성을 정의합니다.
- **`[MACHINE]` 섹션**:
  - `MOTION=Fastech`: 액티브 모션 시스템을 Fastech로 선언합니다.
  - `USE_MOTION=1`: 모션 제어 모듈 기동 및 포트 개방 활성화를 의미합니다.
- **`[SUPPORTED_FEATURES]` 섹션**:
  - `UNIT_MULTIPLIER=1.0`: **Fastech 구동 시 필수 설정값**입니다. Fastech 드라이버 레벨에서 `mm` 좌표계를 직접 사용하므로 스케일 인자를 `1.0`으로 지정하여 UI/C++ 코어 사이의 불필요한 스케일 연산을 차단합니다.
  - `HAS_ZEROG=1` (MC3의 경우): Z축 낙하 방지를 위한 ZeroG 보드 통신 포트(`COM5`)를 개방합니다.

### 3.2. [FastechConfig.ini](file:///c:/LNG/Source/LW2-3/Bin/Config/FastechConfig.ini)
X, Y, Z 개별 축에 특화된 하드웨어 사양 및 모션 프로파일 정보를 기록합니다.
- **하드웨어 셋업 정보**:
  - `IP`: 서보 드라이버의 이더넷 통신 IP 주소 (예: X=`192.168.0.2`, Y=`192.168.0.3`, Z=`192.168.0.4`)
  - `ID`: 각 축의 Board ID 번호 (예: X=`2`, Y=`3`, Z=`4`)
  - `LEAD`: 볼 스크류의 리드 피치(한 바퀴 회전 시 이동 거리, 단위: `mm`, 예: `2.000000`)
  - `PULSE`: 엔코더 해상도(한 바퀴 회전당 필요 펄스 수, 예: `10000`)
- **속도 및 가감속 프로파일**:
  - 원점 복귀 파라미터: `HOME_VEL`, `HOME_ACC`, `HOME_DEC`
  - 절대/상대 이동 파라미터: `MOVE_VEL`, `MOVE_ACC`, `MOVE_DEC`
  - 수동 조그 구동 파라미터: `JOG_VEL`, `JOG_ACC`, `JOG_DEC`

---

## 4. 핵심 도메인 로직 및 구현 상세

### 4.1. 단위 변환 (Unit Conversion)
Fastech 라이브러리는 위치 명령으로 펄스(Pulse) 수를, 속도로 PPS(Pulse Per Second) 단위를 요구하므로 `UnitConvertUtil.h`를 통해 연산을 처리합니다.
- **위치 ➡ 펄스 변환 (`mm_to_pulse`)**:
  $$\text{Pulse} = \left(\frac{\text{Target Location (mm)}}{\text{LEAD Pitch (mm/rev)}}\right) \times \text{PULSE resolution (pulse/rev)}$$
- **속도 ➡ PPS 변환 (`mm_per_sec_to_pps`)**:
  $$\text{PPS} = \left(\frac{\text{Target Velocity (mm/sec)}}{\text{LEAD Pitch (mm/rev)}}\right) \times \text{PULSE resolution (pulse/rev)}$$

### 4.2. 알람 초기화 로직 (`AlarmReset`)
Fastech 모션 알람 발생 시 단순 초기화를 넘어 안전한 재기동을 위한 시퀀스를 거칩니다.
1. 현재 서보 전원이 켜져 있다면, 안전을 위해 일시적으로 Servo를 Off합니다.
2. `PE::FAS_ServoAlarmReset` 및 `PE::FAS_StepAlarmReset` API를 동시 호출하여 드라이버 및 드라이브 스텝 오류를 각각 제거합니다.
3. 알람 해제 작업이 완료되면, 서보 상태를 기존 상태(Servo On)로 자동 복원합니다.

### 4.3. 레이저 셔터(Laser Shutter) 연계 (MC3 시스템 한정)
Fastech 기반 MC3 장비에서는 물리 셔터를 PMAC IO 레지스터 대신 시리얼 통신 기반의 **ZeroG 보드**를 사용하여 온오프 제어합니다.
- **제어 코드 (PortalRouterHandler.cpp)**:
  ```cpp
  } else if (MachineTypeUtil::IsMC3()) {
      BOOL OnOff = (shutterVal == 1) ? TRUE : FALSE;
      g_ZeroG.LaserShutter(OnOff); // RS-232를 통한 셔터 트리거 송신
  }
  ```
  > [!NOTE]
  > ZeroG 보드가 탑재되지 않은 Fastech MC4 장비 구성의 경우, 소프트웨어 레이저 셔터 제어 시퀀스가 수행되지 않거나 지원되지 않으므로 주의가 필요합니다.

---

## 5. 의존 라이브러리 및 하드웨어 인터페이스

- **SDK 라이브러리**: Fastech EziMOTIONPlusE 라이브러리 패키지 (`FAS_EziMOTIONPlusE.h`, `EziMOTIONPlusE.lib`, `EziMOTIONPlusE.dll`)
- **통신 방식**: TCP/IP 소켓 통신 (`FAS_ConnectTCP` API 사용)
- **보조 제어 인터페이스**: ZeroG 보드 연동 시 시리얼 통신 라이브러리(`CSerial` 클래스) 사용 (Baud rate: `115200`, Data bit: `8`, Stop bit: `1`, Parity: `None`)

---

## 6. PMAC 연동 모듈과의 핵심 차이점 및 제약 사항

Fastech 모션 엔진을 사용 시 PMAC 연동 체계와 비교하여 몇 가지 큰 아키텍처적 차이점 및 제약이 존재합니다.

| 분류 | Power PMAC | Fastech (Ezi-SERVO) |
| :--- | :--- | :--- |
| **기본 연동 단위** | Micron 단위 환산 필요 (`UNIT_MULTIPLIER=1000.0`) | mm 단위 직접 수용 (`UNIT_MULTIPLIER=1.0`) |
| **드라이버 통신** | 단일 TCP 소켓 세션을 공유하여 다축 동시 제어 | 축(Axis)별 개별 고유 IP 및 포트로 TCP 커넥션 수립 |
| **원점 복귀 (Homing)** | PMAC 매크로 명령 호출 (`All_Homing=1`) | Z축 동기 완료 후 X/Y축 비동기 시퀀스 개별 구동 |
| **소프트웨어 인터록** | 드라이버 코드 내 및 폴링 루프에서 소프트 리밋 실시간 감시 및 차단 | **C++ 소프트웨어 계층의 인터록 체크 부재** (하단 경고 참조) |
| **레이저 셔터 제어** | PMAC IO 레지스터 쓰기 제어 | ZeroG 제어 보드 Serial 통신 패킷 송신 (MC3 한정) |

> [!WARNING]
> ### 🚨 소프트웨어 인터록(Software Interlock) 미지원 제약
> `PMACMotor`와 달리 `FastechMotor` 및 Fastech 상태 폴링 함수인 `PollingLoopMachineType3` 내부에는 `EqMotionRunPara`에 기록된 소프트웨어 리밋 범위(`interlock_min`, `interlock_max`, `limit_used`)를 검증하고 차단하는 실시간 소프트웨어 인터록 로직이 **구현되어 있지 않습니다.**
>따라서 Fastech 구동 시에는 드라이버 하부 파라미터(EziMOTION 툴을 통한 내부 파라미터 기록) 혹은 물리 리밋 센서 활성화 조치를 철저히 설정하여 물리 충돌을 방지해야 합니다.

---
**최종 수정일**: 2026-06-12  
**작성자**: Antigravity (Advanced Agentic Coding AI Assistant)
