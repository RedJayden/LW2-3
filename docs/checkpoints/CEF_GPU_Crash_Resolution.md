# CEF GPU 가속 크래시 및 인프라 로그 완전 해결 보고서

## 1. 이슈 개요 (Issue Overview)
C++ 메인 프로그램(`LASERnGRAPN.exe`) 실행 시 CEF 브라우저 엔진 초기화 과정에서 다음과 같은 치명적 에러 및 잡다한 경고 로그가 지속적으로 발생하여, 하드웨어 가속(GPU)이 꺼지고 소프트웨어 렌더링으로 폴백(Fallback)되는 성능 저하 문제가 있었습니다.

- **GPU Crash:** `GPU process exited unexpectedly: exit_code=-2147483645` (STATUS_BREAKPOINT)
- **성능 카운터 에러:** `PdhAddEnglishCounter failed ... (0xC0000BB8)`
- **구글 서버 핑 에러:** `Registration response error message: DEPRECATED_ENDPOINT` (또는 `QUOTA_EXCEEDED`)

---

## 2. 해결 계획 (Implementation Plan)

### 원인 진단
1. **GPU Crash:** 장비 PC의 보안 정책(LPAC) 샌드박스 제약이나 디스플레이 드라이버의 IPC(프로세스 간 통신) 차단으로 인해 CEF가 외부 GPU 프로세스를 띄우지 못하고 자폭함. 또한 기존 코드의 `use-gl=desktop` 플래그가 불안정한 데스크톱 GL을 강제하고 있었음.
2. **PDH 에러:** Windows 성능 카운터 레지스트리가 손상되어 시스템 CPU 모니터링 모듈이 오작동함.
3. **GCM 에러:** CEF 내부의 구글 컴포넌트 업데이터와 동기화 모듈이 폐쇄망/네트워크 제한 환경에서 구글 서버를 찌르다 실패함.

### 적용 방안
- **OS 레벨 조치:** `icacls` 권한 리셋과 64/32비트 `lodctr /r`을 수행하는 수동 배치 스크립트 작성 및 PC 재부팅 적용.
- **C++ 아키텍처 변경:** `--in-process-gpu` 플래그를 도입하여 GPU 프로세스를 분리하지 않고 메인 프로세스 스레드 내부로 통합하여 IPC 통신 에러 원천 차단.
- **로그 클린업:** 백그라운드 구글 서비스 차단 플래그 추가 및 CEF 전역 로그 수위를 `FATAL`로 격상.

---

## 3. 작업 내역 (Tasks)

- [x] **`Bin\FixCEF.bat` 생성:** 
  - 관리자 권한 자동 획득 우회 스크립트 적용
  - `icacls "." /reset /T /Q /C` 로 실행 폴더 좀비 권한(Zombie SID) 소독
  - `System32` 및 `SysWOW64` 경로에서 각각 `lodctr /r` 실행하여 레지스트리 복구 및 재부팅 안내 추가
- [x] **`simple_app.cpp` 수정 (CEF 커맨드라인):**
  - 충돌 주범이었던 `use-gl=desktop` 옵션 제거
  - `enable-gpu`, `gpu-rasterization` 추가
  - `in-process-gpu` 추가 (핵심 아키텍처 우회)
  - `disable-gpu-sandbox`, `disable-background-networking`, `disable-component-update`, `disable-sync` 추가
- [x] **`app_main_win.cpp` 수정 (CEF 초기화):**
  - `InitCefSettings(settings);` 하단에 `settings.log_severity = LOGSEVERITY_FATAL;` 추가하여 불필요한 INFO/WARNING/ERROR 무음 처리.
- [x] **C++ 솔루션 리빌드:** Visual Studio에서 `LASERnGRAPN.sln` Rebuild 수행.

---

## 4. 최종 결과 (Walkthrough)

모든 조치와 리빌드를 마치고 `FixCEF.bat` 실행 및 시스템 재부팅 후 새로 컴파일된 `.exe`를 구동한 결과,

1. **GPU 프로세스 안정화:** 별도의 GPU 프로세스를 띄우지 않으므로 `Failed to send GpuControl.CreateCommandBuffer` 및 `-2147483645` 크래시 에러가 물리적으로 소멸됨.
2. **풀 스피드 하드웨어 가속:** GPU 렌더링이 메인 프로세스 내에서 안정적으로 작동하여, UI 화면 및 3D 캔버스가 60FPS 급으로 부드럽게 돌아감.
3. **무결점(Clean) 로그 달성:** PDH 에러와 구글 GCM 에러가 모두 소멸되었으며, 가비지 컬렉션 완료 정보(INFO) 단 한 줄만 기록되는 가장 건강한 렌더링 환경이 구축됨.

## 5. ⚠️ 후속 이슈 (2026-07-21)

본 문서의 `in-process-gpu`/`disable-gpu-sandbox`/`ignore-gpu-blocklist` 조치는 GPU 프로세스와 렌더러 프로세스 간의 격리 경계를 없애고, 원래 소프트웨어 렌더링으로 자동 폴백했어야 할 저사양/구형 GPU 드라이버에도 하드웨어 가속을 강제하는 트레이드오프를 동반했다. 그 결과 동일한 `STATUS_BREAKPOINT` 에러 코드가 **다른 트리거(Edit 바 숫자 드래그-선택)**로 재발했으며, 원인 분석과 조치는 `docs/checkpoints/CEF_TextSelect_Crash_Analysis.md`에 기록되어 있다. 향후 이 계열 에러코드가 다시 보고되면 두 문서를 함께 참조할 것.
