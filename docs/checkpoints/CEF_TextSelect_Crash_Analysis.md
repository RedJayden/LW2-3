# CEF "Aw, Snap!" (STATUS_BREAKPOINT) 재발 분석 — Edit 바 숫자 드래그-선택 크래시

본 문서는 `CEF_GPU_Crash_Resolution.md`에서 "해결됨"으로 기록된 것과 동일한 에러 코드(`STATUS_BREAKPOINT`, exit_code=-2147483645)가 다른 트리거(Recipe Canvas 상단 Edit 바에서 숫자 값을 마우스로 드래그하여 전체 선택)로 재발한 건에 대한 3인 전문가 원인 분석과 조치 내역을 기록합니다. 저사양 PC에서 더 자주 재현된다는 사용자 보고가 있었습니다.

## 1. 증상
- Recipe Canvas 상단 Edit 바(`CanvasTopBar.tsx`)의 X/Y/W/H/각도 숫자 입력창에서, 값을 바꾸기 위해 마우스로 숫자 전체를 드래그 선택하는 순간 CEF 렌더러가 `STATUS_BREAKPOINT`로 죽으며 "Aw, Snap!" 페이지가 표시됨.
- 저사양 PC(약한 내장 그래픽)에서 재현 빈도가 뚜렷하게 높음.

## 2. 코드 근거
1. `LASERnGRAPN/simple_app.cpp`의 `OnBeforeCommandLineProcessing()`이 `no-sandbox` + `in-process-gpu` + `disable-gpu-sandbox` + `ignore-gpu-blocklist` + `use-angle=d3d11` 강제를 동시에 적용하고 있었음 — GPU를 렌더러와 같은 프로세스에 통합하고, Chromium 자체 블록리스트도 무시한 채 위험군 하드웨어에도 가속을 강제하는 조합.
2. `LASERnGRAPN/simple_handler.h/.cpp`가 `CefRequestHandler`를 구현하지만 `OnRenderProcessTerminated`를 오버라이드하지 않아, 렌더러 종료 시 CEF 기본 크래시 페이지에서 자동 복구가 전혀 없었음.
3. `LASERnGRAPN/app_main_win.cpp`가 `settings.log_severity = LOGSEVERITY_FATAL`로 GPU 프로세스 종료 사유 로그를 대부분 억제하고 있어, 지금까지 정확한 크래시 스택을 확인할 수 없었음.
4. `Portal/src/ui/pages/Recipe/PropertyBar/CanvasTopBar.tsx`의 Layout 입력 필드는 이미 draft/onBlur 커밋 분리 + `Number.isFinite` 가드가 적용된 상태(§4.7)라, 타이핑으로 인한 특이행렬/NaN 크래시 경로는 재현되기 어려움 — 즉 이번 트리거는 "입력값 오염"이 아니라 **텍스트 드래그-선택 자체가 유발하는 GPU 컴포지팅 문제**로 판단.

## 3. 3인 전문가 원인 분석

### 전문가 1 — CEF/Chromium 그래픽스 파이프라인
`STATUS_BREAKPOINT`(0x80000003)는 메모리 손상이 아니라 Chromium이 내부 불변식 위반(`CHECK`/`DCHECK`) 시 의도적으로 `int3`를 실행해 자폭하는 코드다. GPU 프로세스가 분리되어 있었다면 이런 자폭은 GPU 프로세스만 죽이고 브라우저가 투명하게 재시작시켜 사용자는 화면이 잠깐 깜빡이는 정도로 끝난다. `in-process-gpu`로 GPU를 메인 프로세스에 합친 상태에서는 GPU 쪽 CHECK 실패가 **프로세스 전체 다운**으로 직결된다. 여기에 `ignore-gpu-blocklist`가 겹쳐, 원래대로라면 소프트웨어 렌더링으로 자동 폴백했을 저사양/구형 드라이버에도 가속을 강제하고 있었다. 즉 이전 조치는 "크래시를 없앤 것"이 아니라 "격리막을 걷어내고 위험군 하드웨어에 가속을 강제해, 드물지만 나면 반드시 전체 다운되는 형태로 바꾼 것"이었다.

### 전문가 2 — 프론트엔드(React/Fabric.js) 렌더링
Edit 바는 60FPS 자유 카메라·`requestRenderAll` 등 상시 GPU 가속 렌더링을 도는 Recipe Canvas 바로 위에 겹쳐진 오버레이다. 브라우저의 네이티브 텍스트 드래그-선택 처리는 선택 하이라이트를 위한 컴포지터 레이어 무효화/리페인트를 연속적으로 발생시킨다. 이미 GPU 부하가 걸려있는 캔버스 컴포지팅과 이 리페인트가 동시에 일어나면서, 저사양 GPU에서 커맨드 버퍼/래스터 스케줄링 쪽 내부 CHECK를 건드릴 개연성이 크다. "타이핑"이 아니라 "드래그 선택"이 트리거라는 점이 이 설명과 일치한다.

### 전문가 3 — 저사양 PC/드라이버 호환성
저사양 PC(구형 Intel 계열 iGPU 등)는 커맨드 큐/VRAM이 작고, Chromium 블록리스트가 원래 보호하려던 하드웨어군이다. `ignore-gpu-blocklist`로 이 보호가 꺼져 있고, `use-angle=d3d11`도 이런 GPU에서 드라이버 지원이 불완전해 컨텍스트 유실을 일으키기 쉽다. `in-process-gpu`로 GPU 작업이 렌더러 메인 스레드와 프로세스 경쟁을 하게 되므로, CPU가 느릴수록 GPU 커맨드 제출 지연 → 워치독/내부 CHECK 조우 확률이 올라간다. "저사양일수록 더 자주"라는 관찰과 정확히 부합한다.

## 4. 적용한 조치

### Phase 1 — 크래시 복구 안전망 (적용 완료)
- `simple_handler.h/.cpp`에 `OnRenderProcessTerminated` 오버라이드 추가: 렌더러(GPU 포함) 종료 감지 시 `OutputDebugStringW`로 종료 사유(status/error_code)를 로깅하고, 현재 메인 프레임 URL을 즉시 `LoadURL()` 재로드하여 "Aw, Snap!" 화면에 사용자가 갇히지 않도록 함.

### Phase 2 — GPU 격리 복원 (적용 완료)
- `simple_app.cpp`에서 `in-process-gpu`, `disable-gpu-sandbox`, `ignore-gpu-blocklist` 스위치를 비활성화(주석 처리, 근거 주석 추가). GPU를 다시 별도 프로세스로 분리하고, Chromium 자체 블록리스트 판단을 되살림. 원래 크래시 원인으로 지목되었던 `use-gl=desktop`은 이미 제거된 상태이므로 GPU 프로세스 재분리로 인한 원래 증상 재발 가능성은 낮다고 판단하나, 회귀 확인이 필요함(§5).

### Phase 3 — 하드웨어 등급별 조건부 GPU 구성 (적용 완료)
`MachineType.md`의 데이터 구동형 하드웨어 프로필 패턴(`machine.ini` → `MachineProfile`)을 재사용해, 신규 하드웨어 추가 시 소스 재작성 없이 설정값만 조정한다는 기존 아키텍처 원칙과 일관되게 구현:
- **`Core/MachineProfile.h`**: `GPU_TIER`(`LOW`/`HIGH`) 필드 추가. `GetGpuTier()`, `IsGpuTierLow()` 게터 추가. ini 파일 부재 폴백 및 필드 누락 시 기본값은 `HIGH`(기존 배포 장비의 동작을 그대로 보존하기 위함).
- **`simple_app.cpp`**: `MachineProfile::Instance().IsGpuTierLow()`로 GPU 가속 스위치를 분기.
  - `LOW`: `use-gl=swiftshader` + `use-angle=swiftshader`로 소프트웨어 렌더링을 강제 — 안정성을 우선하며, 화면은 다소 무거워질 수 있음.
  - `HIGH`(기본값): 기존과 동일하게 `enable-gpu-rasterization` / `enable-accelerated-2d-canvas` / `enable-zero-copy` / `use-angle=d3d11` 하드웨어 가속 유지.
- **`Bin\Config\machine.ini`**(활성본), **`Bin\Config\INC\machine.ini`**, **`Bin\Config\office\machine.ini`**(배포 템플릿)에 `GPU_TIER=LOW` 설정 및 설명 주석 추가. `Bin\Config\JNU\machine.ini`는 구버전 포맷(`TYPE=MC3`, 현재 스키마와 무관한 레거시 파일)이라 범위에서 제외.
- Release|x64 재빌드로 컴파일 검증 완료(0 error).

## 5. 검증 방법 (사용자 확인 필요)
1. 저사양 PC에서 Edit 바 숫자 드래그-선택을 반복 재현 — 크래시가 나더라도 자동 재로드로 복귀하는지 확인.
2. 동일 반복 재현으로 크래시 발생률 자체가 Phase 2/3 적용 전/후 비교해 감소하는지 확인.
3. GPU 프로세스 재분리로 인해 `CEF_GPU_Crash_Resolution.md`가 원래 잡았던 증상(빈번한 GPU 크래시/성능 저하, PDH/GCM 로그 등)이 재발하지 않는지 회귀 확인.
4. 원인을 더 정확히 특정해야 할 경우, `app_main_win.cpp`의 `settings.log_severity = LOGSEVERITY_FATAL`을 한시적으로 `LOGSEVERITY_WARNING`으로 낮춰 재빌드 후 재현 → `Bin\Log\Log_*.txt`에서 실제 GPU 프로세스 종료 사유 문자열을 채집 → 확인 후 반드시 `FATAL`로 원복(§7.2 무결점 로그 목표와 상충되므로 진단 목적 외 상시 적용 금지). 이번 세션에서는 미적용(항상 FATAL 유지).
5. **현재 상태**: Phase 3 적용 시점 기준 이 장비 PC에서는 증상이 재현되지 않고 있었음. `GPU_TIER=LOW`(소프트웨어 렌더링)로 전환한 채 계속 사용하면서 (a) 크래시 재발 여부, (b) 캔버스/카메라 화면 반응성 체감을 모니터링 중. 화면이 지나치게 무겁다고 판단되면 `machine.ini`의 `GPU_TIER=HIGH`로 값만 바꾸고 재시작하면 기존 D3D11 하드웨어 가속으로 즉시 복귀 가능(재빌드 불필요). 실제 저사양 PC에서 재현 테스트가 가능해지면 Phase 2만 적용된 상태 대비 Phase 3(SwiftShader 강제)의 추가 효과 비교 검증을 권장.

---
최종 수정일: 2026-07-21
담당: Claude (AI Coding Assistant)
