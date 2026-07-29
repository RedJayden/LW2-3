# MachineProfile 기반 데이터 구동형 장비 구성 및 기능 명세

본 문서는 구식 모델 기반 분기 방식(MC1, MC2, MC3 등 모델명 하드코딩)을 탈피하고, **컴포넌트 기반 플러그인 아키텍처(Component-Based Plugin Architecture)** 및 **데이터 구동형 하드웨어 가용성 프로필(Data-Driven Hardware Capability Profile Map)**을 구현한 `MachineProfile` 클래스와 이에 연동되는 UI 구성을 설명합니다.

---

## 1. 아키텍처 개요
시스템은 특정 모델명(`MC1` ~ `MC4`)에 의존해 하드웨어 구동 코드를 제어하지 않습니다. 대신 `machine.ini` 설정 파일에 기술된 하드웨어 벤더 및 세부 기능 성능 프로필을 기반으로 동적으로 시스템이 구축됩니다.
- **백엔드 (Native C++)**: [MachineProfile](file:///d:/000.Git_Project/LW2-3/LASERnGRAPN/Core/MachineProfile.h) 싱글톤 인스턴스가 `machine.ini`를 로드하고, 각 H/W 컴포넌트(모션, 조명, 스캐너, 레이저)의 드라이버를 로드 및 초기화합니다.
- **프론트엔드 (React/TypeScript)**: `cmd.config.getMachineStatus` API를 통해 백엔드로부터 가용성 프로필(`HardwareConfig`, `FeatureConfig`)을 전달받아 전역 스토어([appStore.ts](file:///d:/000.Git_Project/LW2-3/Portal/src/store/appStore.ts))에 바인딩하고, UI 요소를 동적으로 숨김/보임 처리합니다.

---

## 2. machine.ini 설정 명세

장비의 상세 하드웨어 명세는 `Bin\Config\machine.ini`에 정의되며 주요 설정 항목은 아래와 같습니다:

### 2.1. [MACHINE] 섹션 (하드웨어 벤더 및 기동 여부)
- **SCANNER**: 스캐너 드라이버 종류 (예: `SinoGalvo`, `Scanlab`, `Thorlabs`)
- **RTC_VERSION**: 스캔랩 스캐너 연동 시 적용할 보드 및 드라이버 버전 (예: `4`, `5`, `6`)
- **RTC_CARD_NO**: 연동 대상 스캔랩 카드의 하드웨어 인덱스 번호 (기본값: `1`)
- **MOTION**: 스테이지 모션 컨트롤러 종류 (예: `PMAC`, `Fastech`)
- **LIGHT**: 조명 컨트롤러 종류 (예: `LFINE`, `BitBus`, `None`)
- **LASER**: 레이저 광원 종류 (예: `JPT`, `Aurelia`, `None`)
- **USE_SCANNER / USE_MOTION / USE_LIGHT / USE_LASER**: 해당 H/W 모듈의 전원 개방 및 통신 활성화 여부 (0 또는 1)
- **JOG_X_DIR / JOG_Y_DIR**: 조그 제어 시의 축 방향 스케일링 인자 (1 또는 -1)
- **USE_CANVAS**: 가공 그래픽 캔버스 활성화 여부 (0 또는 1)
- **USE_PROCESS_DETAIL**: UI 가공 대시보드 및 상세 가공 프로세스 활성화 여부 (0 또는 1)
- **MAX_HISTORY_STEPS**: UI 조작 실행 취소(Undo) 히스토리 최대 스텝 크기
- **STAGE_MIN_X / STAGE_MAX_X / STAGE_MIN_Y / STAGE_MAX_Y**: 스테이지의 물리적 리밋 범위 (mm)

### 2.2. [SUPPORTED_FEATURES] 섹션 (기능 가용성 프로필)
- **ALLOWED_MODES**: 프론트엔드에서 허용할 가공 모드 리스트 (예: `SCANNER,OBJECT`)
- **ALLOWED_LENSES**: 사용 가능한 Object 렌즈 배율 구성 (예: `X20,X50` 또는 단일 배율 `X50`)
- **LIGHT_CHANNELS**: 조명 하드웨어가 지원하는 가용 채널 개수 (예: `4` 또는 `5`)
- **UNIT_MULTIPLIER**: 모션 축 좌표 환산용 비율 (기본값: `1000.0` [um -> mm 환산])
- **HAS_LENS_MOTOR**: Object 렌즈 자동 동축 보정 모터 탑재 여부 (0 또는 1)
- **HAS_ZEROG**: 모션 Z축 낙하 방지를 위한 ZeroG 보드 제어 기능 탑재 여부 (0 또는 1)

---

## 3. 프론트엔드 UI/UX 동적 렌더링 로직

프론트엔드 UI 컴포넌트들은 `appStore`에 적재된 `hardware` 및 `features` 데이터를 기반으로 스스로 렌더링 여부와 상태를 결정(Strategy Pattern)합니다.

### 3.1. 조명(Light) 제어 UI 은폐 로직
조명 모듈이 존재하지 않거나 사용하지 않는 경우 불필요한 UI 요소를 완전히 소거합니다.
- **적용 조건**: `features.useLight !== false && hardware.light !== "None" && features.lightChannels > 0`
- **적용 영역**:
  - 우측 조작 패널([RightPanel.tsx](file:///d:/000.Git_Project/LW2-3/Portal/src/ui/shell/RightPanel.tsx)) 내의 조명 조절 카드
  - 파라미터 설정 화면 좌측 내비게이션바([LeftNav.tsx](file:///d:/000.Git_Project/LW2-3/Portal/src/ui/shell/LeftNav.tsx))의 `Light` 탭 메뉴

### 3.2. 레이저 셔터(Laser Shutter) UI 상시 노출 로직
레이저 종류가 `None`이거나 `useLaser` 플래그가 비활성화되어 있더라도, 설비 셋업 시 비상 연동 및 PMAC IO 연계 수동 셔터 컨트롤을 유지하기 위해 셔터 제어 카드는 강제 상시 노출합니다.
- **적용 영역**:
  - 우측 조작 패널([RightPanel.tsx](file:///d:/000.Git_Project/LW2-3/Portal/src/ui/shell/RightPanel.tsx)) 내의 `Laser Shutter Control` 카드
  - 설정 화면의 레이저 상세 파라미터 폼([LaserParameterForm.tsx](file:///d:/000.Git_Project/LW2-3/Portal/src/ui/pages/Parameter/LaserParameterForm.tsx)) 내 `Laser Shutter Control (PMAC)` 위젯 카드

### 3.3. 렌즈 제어(Lens/Object) UI 로직
배율 모터나 렌즈 및 카메라가 비활성화된 경우 관련 메뉴가 생략됩니다.
- **렌즈 전환 토글**: `features.allowedLenses` 배열에 명시된 구성에 따라 `X20`, `X50` 버튼이 활성화됩니다.
- **Object 카메라 탭**: `features.allowedModes`에 `OBJECT` 가 포함되지 않은 경우, 내비게이션 바 및 화면 스위칭 탭에서 완전히 은폐됩니다.

---

## 4. 향후 장비 추가 및 유지보수 가이드
1. **신규 장비 사양 셋업**: 기종명이 추가되더라도 소스 코드를 새로 짤 필요 없이 `Bin\Config\machine.ini` 설정 값만 적절히 조정하여 맞춤 기종을 셋업합니다.
2. **백엔드 하드웨어 추가**: 신규 드라이버를 개발할 경우, [MachineProfile](file:///d:/000.Git_Project/LW2-3/LASERnGRAPN/Core/MachineProfile.h)에 새로운 속성 로더를 작성하고 해당 인스턴스를 통해 조건부 팩토리(Factory Pattern) 방식으로 컴포넌트를 연동합니다.
3. **프론트엔드 연동**: 신규 플래그가 필요한 경우, `FeatureConfig`에 새로운 가용 플래그 속성을 정의하여 컴포넌트의 가시성(Visibility)을 제어하도록 클린 코드 설계를 일관되게 유지합니다.

---
최종 수정일: 2026-06-10
담당: Antigravity (AI Coding Assistant)
