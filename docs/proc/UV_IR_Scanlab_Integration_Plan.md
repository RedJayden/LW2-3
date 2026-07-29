# Scanlab UI/UX 레이아웃 개선 및 동작 원리 계획서

사용자님의 요구사항에 따라 중요도가 높은 하드웨어 진단 및 펌웨어 설정을 상단으로 올리고, 과거 방식의 잔재 파라미터들을 과감히 삭제하여 직관적인 UX를 제공하기 위한 개선 계획입니다. 

## 1. 속도 제어 공식과 K-Factor에 대한 오해 바로잡기

### 1.1. "K-Factor를 안 쓰기로 한 것 아닌가요?"
정확히 말씀드리면, **"사용자가 짐작해서 수동으로 입력하던 K-Factor(수동 Override)"를 사용하지 않기로 한 것**입니다. 스캐너 하드웨어(RTC) 자체가 mm 단위를 모르고 bit 단위만 알기 때문에, 속도든 위치든 하드웨어 내부적으로는 반드시 K-Factor(1mm당 bit 수) 연산이 필요합니다.

현재 바뀐 시스템의 핵심은 다음과 같습니다:
1. 사용자가 파장(Wavelength)을 선택하면 알맞은 `.ct5` 정품 보정 파일이 로드됩니다.
2. `.ct5` 파일 안에는 렌즈와 스캐너에 맞는 **정확한 고유 K-Factor 값**이 내장되어 있습니다.
3. 백엔드(C++)는 보정 파일 로드 직후 `get_head_para(1, 1)` 함수를 호출해 **이 고유 K-Factor 값을 자동으로 읽어옵니다.**
4. 즉, `RTC6 Speed (Bits/ms) = (Target Speed (mm/s) * K-Factor) / 1000` 공식에서 쓰이는 K-Factor는, 예전처럼 사용자가 임의로 넣은 값이 아니라 **시스템이 .ct5 파일에서 읽어온 정확한 자동 값**이 대입되어 완벽하게 동작합니다.

### 1.2. Mark Speed와 Jump Speed의 사용 방식
*   **Mark Speed (가공 속도)**:
    *   파라미터 창에 입력된 값은 장비의 **"기본 가공 속도"**로 저장됩니다.
    *   하지만 실제 가공(Process Start)을 누를 때, **Recipe 패널의 Mark Speed 값이 우선순위를 가지며 C++ 코어의 값을 실시간으로 덮어씁니다(Override)**. 
    *   즉, 평상시에는 Recipe 값을 따르지만, 단독 테스트나 직접 API를 호출할 때는 파라미터의 기본값이 사용됩니다.
*   **Jump Speed (이동 속도)**:
    *   현재 Recipe 패널(우측)에는 Jump Speed를 제어하는 UI가 없습니다.
    *   따라서 **레이저가 꺼진 상태에서 다음 가공 지점으로 이동하는 속도는 전적으로 Parameter 창에서 설정한 `Jump Speed` 값에 의존**합니다.
    *   이동 시간(비가공 시간) 단축에 매우 중요한 파라미터이므로 반드시 유지해야 합니다.

## 2. UI 레이아웃 재배치 (Grid Layout Optimization)

현재 2열(Grid) 구조 내에서 스택(Stack)의 순서를 조정하여, 시선이 가장 먼저 닿는 상단에 핵심 정보를 배치하고, 설정이 자주 변경되지 않는 항목들은 하단으로 내립니다.

### **좌측 열 (Left Column)**
1. **[NEW TOP] Hardware Diagnostics (하드웨어 진단)**
   - 가장 중요한 통신 상태(CONNECTED/DISCONNECTED), Init RTC Card 버튼, 진단 에러 로그 및 보드 정보 표시.
2. **[BOTTOM] Basic Settings (기본 설정)**
   - Mark Speed, Jump Speed, H Ratio, V Ratio 배치.

### **우측 열 (Right Column)**
1. **[NEW TOP] Firmware & Correction (펌웨어 및 보정)**
   - 스캐너 동작의 핵심인 파장(Wavelength) 선택, 프로그램 파일, 보정 파일 경로 등 렌즈/광학계 세팅 정보 표시.
   - **[NEW] Active K-Factor 표시**: 보정 파일로부터 추출된 현재 하드웨어의 K-Factor 값을 읽기 전용으로 표시하며, 툴팁으로 연산 공식을 안내합니다.
2. **[BOTTOM] Axis Setting (축 설정)**
   - 한 번 세팅 후엔 거의 바꾸지 않는 X/Y Swap, Invert 설정.

## 3. 잔재 파라미터 삭제 및 읽기 전용 표시

SinoGalvo 방식에서 넘어온 잔재이거나 더 이상 수동 입력이 불필요해진 항목들을 제거하고, 정보성 데이터는 읽기 전용으로 전환합니다.

### ❌ 삭제 대상 (제거)
- **`Correct Size` (가공 영역 크기)**
   - 이전에는 이 값을 통해 K-Factor를 역산(Fallback)했으나, 현재는 정품 `.ct5` 파일에서 K-Factor를 직접 추출하므로 사용자 입력의 의미가 퇴색되었습니다.
- **`K-Factor Override` (입력 창)**
   - 과거에 강제로 배율을 맞추기 위해 사용하던 입력 항목입니다. 현재는 `.ct5` 고유값을 사용하며 실측 오차는 `H Ratio`와 `V Ratio`를 통해 직관적으로 보정하므로 입력 창은 삭제합니다.

### ✅ 유지 및 변경 대상
- **`Mark Speed` (가공 속도)**: Recipe 패널 입력값이 없을 때의 기본값 역할 수행.
- **`Jump Speed` (이동 속도)**: 비가공 구간의 이동 속도를 결정하는 핵심 파라미터.
- **`H Ratio (Scale X)` / `V Ratio (Scale Y)`**: 가공 실측 후 직관적인 오차 보정용 배율 입력칸.
- **[NEW] `Active K-Factor` (읽기 전용)**
   - 하드웨어 칩셋에 등록된 실제 K-Factor 값(예: 9532.5)을 표시.
   - **[툴팁 추가 안내]** 마우스 오버 시 아래의 연산 공식 안내:
     - 🚀 **속도 연산**: `RTC6 Speed(Bits/ms) = (Target(mm/s) × K-Factor) ÷ 1000`
     - 🎯 **좌표 연산(X)**: `Target Bits = Coord_X(mm) × K-Factor × H Ratio`
     - 🎯 **좌표 연산(Y)**: `Target Bits = Coord_Y(mm) × K-Factor × V Ratio`

---

> [!NOTE]
> 위 계획에 동의하시면 승인해 주십시오. 즉시 백엔드에서 K-Factor Override 관련 로직을 지우고, React UI(`ScanlabParameterForm.tsx`) 소스 코드를 수정하여 새로운 레이아웃을 적용하겠습니다!
