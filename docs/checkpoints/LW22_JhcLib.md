# 레거시 분석: JhcLib(SinoGalvo CSG9210) 시퀀스 구성 및 진행률 표시

> **대상 프로젝트**: `C:\373.20231122_LaserNGrapn(전남대 통합헤드)` (구 MFC 기반 LW-1000 장비, 현행 INC 프로젝트와 무관한 별개 장비)
> **분석 목적**: 현행 프로젝트의 JhcLib 연동/진행률 설계와 대조하기 위해, 레거시 장비에서 JhcLib API로 마킹 시퀀스를 구성하고 가공 진행 상태를 표시하는 구조를 발굴·기록.
> **작성일**: 2026-07-21

---

## 1. 결론 요약 (TL;DR)

- 이 레거시 프로젝트에서 **JhcLib = `JHCLIB.dll`** 이며, `CScannerSinoGalvo`(SinoGalvo CSG9210 드라이버)가 이를 `LoadLibrary`/`GetProcAddress`로 **런타임 동적 로딩**하여 래핑한다. 함수 접두어는 모두 `JHC*` (예: `JHCOpenDevice`, `JHCStartMarking`, `JHCGetMarkingState`).
- 마킹 시퀀스의 **기본 단위 패턴**은 `BufStart() → SchOut*(도형 등록) → SchLaserOut(파워/타입/모드) → StartMarking()` 4단계이다.
- 실제 레시피 가공은 **명령 큐 방식**으로 동작한다: 도면 객체(`CDrawingObject`)들을 `std::vector<SScannerCommand>`로 **번역(translate)** 한 뒤, 전용 워커 스레드(`CScannerController::ThreadScanner`)가 이 벡터를 순회하며 JhcLib 호출로 소비한다.
- **진행률 표시는 백분율 프로그레스 바가 아니라 "이벤트 + 경과시간" 방식**이다: 워커 스레드가 시작/종료 시 `PostMessage`로 UI에 통지하고, 마킹 다이얼로그(`CDlgMarking`)가 1초 주기 타이머로 **경과 시간(HH:MM:SS)** 을 카운트업하여 표시한다. 완료 판정은 `GetMarkingState()` + `GetSystemState()`의 마킹 상태 비트 조합으로 폴링한다.

---

## 2. 아키텍처 개요 (레이어 및 데이터 흐름)

```
[UI] CDlgMarking / CDlgMain (MFC Dialog)
        │  RequestPatterningStart() 등 Request* 호출 (플래그 set)
        ▼
[Controller] CScannerController  ── 요청 플래그 + CriticalSection ── 워커 스레드
        │  ThreadScanner(): 레시피 → SScannerCommand[] 번역 → 순차 소비
        ▼
[Wrapper] CScannerBase (추상) ─┬─ CScannerSinoGalvo  → JHCLIB.dll   (JhcLib)
                               └─ CScannerScanLab    → RTC6 (ScanLab, 별개 기종)
        ▲
        │  진행/완료 이벤트 PostMessage(UM_START/FINISH_SCANNER_PATTERNING …)
[UI] CDlgMarking(경과 타이머) / CDlgMain(상태 갱신)
```

- **기종 추상화**: `CScannerBase`가 순수 가상 인터페이스를 정의하고, `CScannerSinoGalvo`(JhcLib)와 `CScannerScanLab`(RTC6)이 각각 구현. 컨트롤러는 `EScannerDeviceVersion`(`ESDV_SINOGALVO_CSG9210` / `ESDV_SCANLAB_RTC6_PCIE`)로 런타임 분기.
  - 적용 패턴: **Strategy Pattern**(기종별 가공 전략) + **Bridge/Wrapper**(DLL 래핑).
- **비동기 처리**: UI는 절대 DLL을 직접 호출하지 않는다. 모든 조작은 `CScannerController::RequestXxx()`가 대응 boolean 플래그를 세우고, 단일 워커 스레드가 폴링하여 처리 → UI 프리징 방지.
  - 적용 패턴: **Command/Request-Flag 기반의 Producer-Consumer**.

### 주요 파일
| 파일 | 역할 |
|---|---|
| `HW_Modules/Scanner/ScannerSinoGalvo.h/.cpp` | JhcLib(`JHCLIB.dll`) 동적 로딩 및 래핑 (`CScannerSinoGalvo`) |
| `HW_Modules/Scanner/ScannerBase.h/.cpp` | 기종 독립 추상 인터페이스 및 공용 구조체(`SLaserParameter`, `SJHCStatusDef` 등) |
| `LW-1000/ScannerController.h/.cpp` | 워커 스레드 + 요청 큐 + 레시피→명령 번역 + 시퀀스 소비 |
| `LW-1000/DlgMain.cpp` | 진행/완료 이벤트 수신 및 UI 상태 전이 |
| `LW-1000/DlgMarking.cpp` | 마킹 중 오버레이 다이얼로그, 경과 시간 타이머 표시 |

---

## 3. JhcLib API 표면 (동적 로딩)

`CScannerSinoGalvo::LoadModule()`이 `JHCLIB.dll`을 로드하고 아래 함수 포인터를 바인딩한다. (`ScannerSinoGalvo.cpp:22`, `:40~86`)

| 범주 | JhcLib 함수 | 래퍼 메서드 |
|---|---|---|
| 통신 | `JHCOpenDevice` / `JHCCloseDevice` / `JHCIsOpen` | `Open()` / `Close()` / `IsOpen()` |
| 보정 | `JHCCorrectionSet` | `CorrectionSet()` |
| 레이저/갈보 설정 | `JHCSChSetPWM`, `JHCParameterSet`, `JHCGalvoParameterSet` | `SChSetPWM()`, `ParameterSet()`, `GalvoParameterSet()` |
| 도형 등록 | `JHCSchOutPoint/Line/Rect/Circle/Arc/Ellipse/EArc` | `SchOutPoint()` … `SchOutEArc()` |
| 마킹 실행 | `JHCBufStart`, `JHCSchLaserOut`, `JHCStartMarking`, `JHCCancel`, `JHCPause`, `JHCResume` | `BufStart()`, `SchLaserOut()`, `Start()`, `Stop()`, `Pause()`, `Resume()` |
| **상태 조회** | `JHCGetMarkingState`, `JHCGetSystemState` | `GetMarkingState()`, `GetSystemState()` |
| IO/모터 | `JHCIoOut`, `JHCMotorOut`, `JHCSetPulseWidth` | `IoOut()`, `MotorOut()`, `SetPulseWidth()` |

- DLL 미탑재 시 각 래퍼는 `hModule == NULL` 가드로 무해하게 조기 반환(상태조회는 `-1`). → **Null-Object 성격의 방어 코딩**.
- `JHCSchLaserOut(float Power 0~100, int LaserType, int Mode)`의 Mode는 `ELaserMode`(`LASER_MODE_GUIDE=1`, `LASER_MODE_MARKING=2` 등, `ScannerBase.h:29`).

---

## 4. 시퀀스 구성 (Sequence Composition)

### 4.1 기본 4단계 패턴
가장 단순한 형태는 래퍼의 `OpenMasterOpen()`에서 확인된다 (`ScannerSinoGalvo.cpp:173`):

```cpp
_JHCBufStart();                                 // 1) 버퍼 개시
_JHCSchOutPoint( 0, 0, 0.1f );                  // 2) 도형(포인트) 등록
_JHCSchLaserOut( fPowerEfficiency, iLaserType,  // 3) 레이저 파라미터 지정
                 ELaserMode::LASER_MODE_MARKING );
_JHCStartMarking();                             // 4) 마킹 실행
```

`ReturnToCenterPoint()`, `ReturnToDumpingPosition()`도 동일 패턴에 모드만 `LASER_MODE_GUIDE`로 바꾼 것.

### 4.2 레시피 → 명령 벡터 번역 (Translate)
`ThreadScanner`는 가공 시작 요청을 받으면 도면 객체 리스트를 `SScannerCommand` 벡터로 변환한다 (`ScannerController.cpp:3701~`).

- 대상 선택: 선택 가공(`GetSelectedObjects`) vs 전체(`GetObjects`), 총 객체 수 `nTotalObjectCnt` 산정.
- 각 객체 유형(`EDrawingObjectType`)에 따라 명령 열거값을 push:
  - `SC_PATTERNING_POINT / LINE / CIRCLE / ELLIPSE / CIRCLE_ROTATED / ELLIPSE_ROTATED …`
- **매트릭스(배열) 객체** 지원: X/Y 수량만큼 반복 등록하며, 행 단위로 `BufStart` 분할.
- **버퍼 한계 분할**: `SCANNER_DATA_BUFFER_LIMIT`(SinoGalvo 데이터 바이트) / `SCANNER_RTC_LIST_BUFFER_LIMIT`(ScanLab 리스트 명령)를 넘으면 `Add_CMD_StartPatterning()`으로 현재 버퍼를 flush 후 `IniteBufferFlag()`로 재개 → **하드웨어 버퍼 초과 방지**.
- 축 반전/교환(`bXYExchange`, `bXAxisN`, `bYAxisN`)을 좌표 등록 시점에 반영.

생성되는 명령 시퀀스의 논리 구조:
```
SC_BUF_START
  SC_PATTERNING_CIRCLE / LINE / POINT …   (도형 N개)
SC_PATTERNING_START          → SchLaserOut + StartMarking
SC_SEND_START_EVENT          → UI에 "시작" 통지 (최초 1회)
SC_PATTERNING_WAIT           → 완료까지 논블로킹 폴링
  … (버퍼 분할 시 위 블록 반복) …
SC_SEND_FINISH_EVENT         → UI에 "종료" 통지
```

### 4.3 명령 벡터 소비 루프
워커 스레드가 `vecScannerCommand`를 인덱스(`nPatterningCmdIndex`)로 순회하며 JhcLib를 호출한다 (`ScannerController.cpp:1898~2031`):

```cpp
switch ( sScannerCMD.eScannerCommand ) {
case SC_BUF_START:          pScanner->BufStart();                             nPatterningCmdIndex++; break;
case SC_PATTERNING_CIRCLE:  pScanner->SchOutCircle(cx, cy, r);                nPatterningCmdIndex++; break;
case SC_PATTERNING_LINE:    pScanner->SchOutLine(x1,y1,x2,y2);               nPatterningCmdIndex++; break;
case SC_PATTERNING_POINT:   pScanner->SchOutPoint(cx, cy, time);             nPatterningCmdIndex++; break;
case SC_PATTERNING_START:   pScanner->SchLaserOut(power, type, LASER_MODE_MARKING);
                            pScanner->Start();                                nPatterningCmdIndex++; break;
case SC_SET_SPEED:          pScanner->ParameterSet(param /*markSpeed 갱신*/); nPatterningCmdIndex++; break;
case SC_SEND_START_EVENT:   ::SendMessage(hDlgMain, UM_START_SCANNER_PATTERNING, …); nPatterningCmdIndex++; break;
case SC_PATTERNING_WAIT:    /* 아래 4.4 */                                    break;   // 인덱스 증가 조건부
case SC_SEND_FINISH_EVENT:  ::PostMessage(hDlgMain, UM_FINISH_SCANNER_PATTERNING, …);
                            bPatterningIsRunning = FALSE;                     break;
}
```

- 이 루프는 워커 스레드의 **단일 사이클 안에서 가능한 만큼 진행**하되, 대기 지점(`SC_PATTERNING_WAIT`)을 만나면 `bLoop=FALSE`로 스레드에 제어를 돌려주어(양보) UI/정지요청을 처리한 뒤 다음 사이클에 이어서 재개한다. → **협조적(cooperative) 상태 머신**.

### 4.4 논블로킹 완료 대기 (`SC_PATTERNING_WAIT`)
핵심 진행 판정 로직 (`ScannerController.cpp:1962~1972`):

```cpp
case SC_PATTERNING_WAIT:
    if ( pScanner->GetMarkingState() == EDataTransferState::TRANSFER_FINISH ) { // 전송/실행 완료?
        pScanner->GetSystemState( sScannerStatus );
        if ( (sScannerStatus.m_byMarkStatus & 0x01) == 0x01 )  // 마킹 실제 종료 비트
            nPatterningCmdIndex++;      // 다음 블록으로 진행
        else
            bLoop = FALSE;              // 아직 마킹 중 → 스레드 양보 후 재확인
    } else {
        bLoop = FALSE;                 // 전송 미완료 → 스레드 양보 후 재확인
    }
    break;
```

- **2단 확인**: `GetMarkingState()`(데이터 전송/큐 상태) **와** `GetSystemState().m_byMarkStatus & 0x01`(실제 마킹 종료)를 **둘 다** 만족해야 완료로 간주.
- `WaitToFinishDataTransfer()` 매크로도 동일하게 `GetMarkingState()==TRANSFER_NOT_OVER` 동안 `Sleep` 폴링(단, 이쪽은 블로킹). 도형 등록/속도 변경 후 전송 완료를 보장하는 용도(`USE_TRANSFER_DELAY` 빌드 옵션).

> ### ⚠️ GetMarkingState 반환값 의미 (극성) — 현행 프로젝트와 대조 필수
> 이 레거시 코드는 `GetMarkingState()` 반환을 **`EDataTransferState`** 로 해석한다 (`ScannerBase.h:37`):
> - `TRANSFER_NOT_OVER = 0` (진행/전송 중)
> - `TRANSFER_FINISH   = 1` (완료)
>
> 즉 **0 = 진행중(Busy), 1 = 완료(Idle)** 로, 현행 INC 프로젝트 메모리의 확정 결론(`0=Busy, 1=Idle`, SDK 매뉴얼 p.11 기준)과 **의미가 일치**한다. 단, 레거시는 이를 단독 신뢰하지 않고 반드시 `m_byMarkStatus` 비트와 AND 조건으로 이중 확인한다는 점이 설계상 차이. → 현행 구현에서 완료 판정이 불안정하면 이 이중 확인 패턴을 참고할 수 있음. (관련: `reference-getmarkingstate-polarity`)

### 4.5 일시정지/정지/센터복귀
- `Pause()`→`JHCPause`, `Resume()`→`JHCResume`, `Stop()`→`JHCCancel`.
- 정지 계열은 `USE_STOP_SAFE_DELAY` 빌드 시 `Stop → STOP_SAFETY_DELAY → ReturnToCenterPoint → Stop` 순서의 **안전 정지 시퀀스**를 사용(갈보 급정지 보호).
- `SJHCStatusDef`(`ScannerBase.h:224`)에는 마킹 상태 외에도 `m_nMarkTime`(마킹 시간), `m_nFreeSpace`(버퍼 여유), `m_nBeltSpeed`, `m_byLaserStatus` 등 진행 관련 원천 데이터가 포함됨.

---

## 5. 진행률(Progress) 표시 방식

레거시는 **"몇 %"의 정량 프로그레스 바가 없다.** 대신 세 가지 채널로 진행 상태를 사용자에게 노출한다.

### 5.1 이벤트 기반 상태 통지 (Start/Finish)
워커 스레드가 마킹 시퀀스의 경계에서 UI로 사용자 정의 메시지를 보낸다.

| 이벤트 | 발신 위치 | UI 핸들러(`DlgMain.cpp`) | 동작 |
|---|---|---|---|
| `UM_START_SCANNER_PATTERNING` | `SC_SEND_START_EVENT` (`:1959`) | `OnStartScannerPatterning` (`:8860`) | 컨트롤 비활성화, **경과 타이머 시작**, 매크로뷰 드로잉 차단 |
| `UM_FINISH_SCANNER_PATTERNING` | `SC_SEND_FINISH_EVENT` (`:2018`) | `OnFinishScannerPatterning` (`:8875`) | 셔터 정리, 연속(Continuous)/멀티 모드면 다음 가공 자동 재요청 |
| `UM_STOP_SCANNER` | 정지 요청 처리 (`:1894`) | `OnStopScanner` (`:8915`) | 컨트롤 복귀, 마킹 다이얼로그 숨김 |

- 포인트/캘리브레이션/RTR 등 특수 가공도 각각 `UM_START/FINISH_SCANNER_*_PATTERNING` 쌍을 가짐(매크로 `StartXxxPatterning()` / `CheckXxxPatterningIsFinished()`).
- 적용 패턴: **Observer(Windows 메시지 기반 이벤트 통지)** — 스레드-UI 간 안전한 단방향 통지(`PostMessage`).

### 5.2 경과 시간 타이머 (실질적 "진행 표시")
마킹 중 오버레이 다이얼로그 `CDlgMarking`이 1초 주기로 경과 시간을 표시한다 (`DlgMarking.cpp:66`, `:400`):

```cpp
// StartPatterningTimer()
SetTimer( TIMER_SCANNER_PATTERNING_TIME_ID, 1000 /*ms*/, NULL );
m_nTimerCnt = 0;
m_stcMarkingTime.SetWindowText( STR_TIMER_COUNTING_ZERO );  // "00:00:00"

// OnTimer()
m_nTimerCnt++;
strTime.Format( STR_TIMER_COUNTING_FORMAT,
                m_nTimerCnt / 3600,          // 시
                (m_nTimerCnt / 60 % 60),     // 분
                (m_nTimerCnt % 60) );        // 초
m_stcMarkingTime.SetWindowText( strTime );
```

- 즉 진행 표시는 **경과 시간 카운트업(HH:MM:SS)** 이며, 종료 이벤트 수신 시 타이머를 멈추고 다이얼로그를 닫는 방식. 남은 시간/백분율 추정은 하지 않는다.
- 연속 가공(`PatterningContinuous`)이나 수동 초점 모드에서는 타이머를 시작하지 않음(`OnStartScannerPatterning` 조건부).

### 5.3 객체 카운트 (내부 진행 지표)
번역/실행 단계에서 `nTotalObjectCnt`(총 객체) 대비 `nCheckedObjectCnt`(처리 객체)를 관리한다 (`ScannerController.cpp:1323`, `:3705`, `:3721`). 이는 매트릭스 마지막 객체에서 센터복귀/최종 시작을 결정하는 `Add_CMD_FinishCenterPointCheckOrDoStartPatterning()` 분기의 근거로 쓰이며, **백분율 계산에 직접 표출되지는 않는다.** (→ 현행 프로젝트에서 정량 진행률이 필요하면 이 카운터를 UI로 끌어올리는 것이 가장 저비용 확장 지점.)

### 5.4 폴링 방식 상태 조회 (요청형)
`RequestGetPatterningState()` / `RequestGetSystemState()` (`ScannerController.h:150`)로 UI가 필요 시 상태를 능동 요청하면, 워커가 `GetMarkingState()`/`GetSystemState()`를 호출해 결과를 `g_systemStatus`에 반영하고 갱신 메시지를 보낸다. 실시간 상태등/버튼 활성화 근거로 사용.

---

## 6. 현행(INC) 프로젝트로의 시사점

1. **완료 판정 이중화**: 레거시는 `GetMarkingState()` 단독이 아니라 `GetSystemState().m_byMarkStatus & 0x01`과 AND로 완료를 확정한다. 현행에서 마킹 종료 오검출/조기 종료가 있다면 이 이중 확인이 방어책이 된다.
2. **극성 일관성**: `GetMarkingState` 0=Busy/1=Idle 해석은 레거시·현행 동일. (JhcLib.h 주석의 오기와 무관하게 코드 동작은 일치 — `reference-getmarkingstate-polarity` 참조.)
3. **버퍼 한계 분할**: 대형/매트릭스 가공은 하드웨어 버퍼 한계로 `BufStart`를 여러 번 나눠 flush해야 한다. 현행 ScannerGenerator가 단일 패스로 전량 전송한다면 대형 레시피에서 버퍼 오버플로 위험 검토 필요.
4. **진행률 고도화 여지**: 레거시의 "경과시간만 표시" 대비, 현행은 `nTotalObjectCnt/nCheckedObjectCnt` 또는 명령 인덱스(`nPatterningCmdIndex/nPatterningCmdSize`)를 활용해 **정량 백분율 진행률**을 제공할 수 있다.
5. **비동기 격리**: UI→요청플래그→단일 워커 스레드→DLL 호출→이벤트 통지의 단방향 구조는 현행 CEF/`g_Scanner` 파사드 설계와 목적이 동일(스레드 안전·UI 프리징 방지). (관련: `project-marktimes-shapedelay-state`)

---

## 7. 참고 코드 위치 (레거시)
- 4단계 패턴: `HW_Modules/Scanner/ScannerSinoGalvo.cpp:173` (`OpenMasterOpen`)
- DLL 로딩/바인딩: `HW_Modules/Scanner/ScannerSinoGalvo.cpp:40`
- 명령 소비 루프: `LW-1000/ScannerController.cpp:1898`
- 완료 폴링(`SC_PATTERNING_WAIT`): `LW-1000/ScannerController.cpp:1962`
- 레시피→명령 번역: `LW-1000/ScannerController.cpp:3701`
- 진행 이벤트 핸들러: `LW-1000/DlgMain.cpp:8860`, `:8875`
- 경과 타이머: `LW-1000/DlgMarking.cpp:66`, `:400`
- 상태 구조체 `SJHCStatusDef`: `HW_Modules/Scanner/ScannerBase.h:224`
- 전송상태 enum `EDataTransferState`: `HW_Modules/Scanner/ScannerBase.h:37`

---

## 8. [현행 INC 실기 확정 2026-07-23] CSG9210 하드웨어 특성: SchOutCircle 버퍼는 완료 비트(bit0)를 래치하지 않음

> 현행 INC 장비의 실기 로그(`Bin\Log\Log_2026-07-23.txt`, 18:11 런)로 확정된 **JhcLib/CSG9210 지식**.
> 상세 분석: `docs/plans/ScannerIssue9_Circle_Bit0_and_MarkTimesUI.md`, 적용: `feature_Scanner.md` §6.17.

### 8.1 확정 사실 (프리미티브별 완료 핸드셰이크 거동)
| 버퍼 구성 | `GetMarkingState()` | `MarkStatus & 0x01` (bit0) |
|---|---|---|
| `SchOutLine` 계열 (직선/사각형/폴리라인) | 0→1 정상 전이 | **마킹 물리 종료 시점에 신뢰성 있게 래치** (예: 둘레 14.86mm ÷ 2mm/s = 7.4s ≈ 실측 7.6s) |
| **`SchOutCircle`** (원) | 0→1 정상 전이 (전송 완료) | **절대 래치되지 않음** — 물리 마킹 종료 후 105초 이상 bit0=0 유지 관측 |

- §6(시사점 1)의 "완료 판정 이중화(state==1 AND bit0==1)"는 여전히 유효하지만, **이 이중 판정은
  버퍼가 SchOutLine 계열일 때만 성립**한다. 원 프리미티브가 단독 버퍼로 flush되면 완료 판정이 영구
  대기(교착)한다.
- 경합 요인은 실기 로그로 소거됨: 속도 변경(SetDefaultParameters 값 변경) 후에도 LINE 버퍼는 정상
  래치, 작업 사이 `Cancel()` 전무한 상태에서도 원 버퍼는 미래치, 버퍼 종점 `SchOutPoint(0,0)`(센터
  실이동)를 붙여도 미래치.
- 레거시(LW-1000)·구 INC(260602)에서 이 문제가 드러나지 않은 이유: 청크 경계가 Z_MOVE뿐이라 원이
  항상 다른 도형과 **한 버퍼에 섞여** 마킹되었고, 순수 원 버퍼는 색상 그룹/REPEAT 경계가 도입된
  2026-07-22 이후 구조에서만 발생.

### 8.2 현행 대응 (2026-07-23 적용)
- **곡선 4종(CIRCLE/ARC/ELLIPSE/EARC)을 SchOutLine 코드 분할(테셀레이션)로 방출** — CIRCLE은 확진,
  나머지는 동일 곡선 엔진 계열의 예방 조치. 코드 오차 0.005mm(빔 폭 이하), 세그먼트 8~720 clamp.
  `SinoGalvoController::Run()`의 `emitArcAsLines()` 참조. SchOutCircle/SchOutArc/SchOutEllipse/
  SchOutEArc 바인딩은 보존하되 마킹 경로에서 사용 중단.
- **진단 채널**: `CheckMarkingState()` 폴링 로그에 `MarkStatus` 전체 바이트(hex)와 보드
  `MarkTimes`(완료 카운터, `JHCStatusdef.MarkTimes` — §4.5의 `m_nMarkTime` 대응) 출력 추가.
  곡선 버퍼에서 bit0 외 다른 완료 신호가 움직이는지 확인용이며, 벤더(JHC) 문의 증거로도 사용.
  보드 MarkTimes 카운터 증가를 완료 판정 대안으로 쓰는 방안은 로그 축적 후 판단.

### 8.3 재발 방지 원칙
- **완료 판정(bit0)이 걸린 flush 버퍼에는 검증된 프리미티브(LINE/POINT)만 사용한다.** 새 SchOut*
  프리미티브를 마킹 경로에 추가할 때는 반드시 "단독 버퍼 + CheckMarkingState 완주" 실기 테스트로
  bit0 래치 여부를 먼저 확인할 것.
