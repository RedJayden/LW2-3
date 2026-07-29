# Antigravity 시스템 최적화 및 룰 적용 계획서 (Tree of Thought)

본 문서는 사용자의 피드백("스캐너 가공 시작하면 도형 객체 숨기고 가공 끝나면 보여주게 구성된 규약 유지")을 수용하고, 아직 코드베이스에 미적용된 2가지 핵심 최적화 요소를 구현하기 위해 3인의 전문가가 협의하여 도출한 최종 계획서입니다.

---

## 💡 Tree of Thought (3인 전문가 협의 프로세스)

### 1. 전문가 A (그래픽스 및 Fabric.js 아키텍트)
**주제: 대량 도트 매트릭스 렌더링 최적화 (`fabric.DotMatrix`)**
- **문제 인식**: 현재 수만 개의 점을 `fabric.Circle` 인스턴스로 각각 생성하면 DOM/Canvas 렌더링 병목 및 객체 관리 비용이 기하급수적으로 증가합니다.
- **해결 전략**: `fabric.Object`를 상속받는 커스텀 `fabric.DotMatrix` 클래스를 설계해야 합니다.
  - 내부 `_render(ctx)` 루프에서 단일 Canvas 2D 컨텍스트 경로(`ctx.beginPath() ... ctx.arc()`)로 모든 점을 일괄 드로잉합니다.
  - 마우스로 전체 매트릭스를 이동하거나 크기를 조절할 때 매 프레임 재계산되는 것을 막기 위해 `objectCaching: true`, `statefullCache: false`를 강제합니다. GPU 가속 비트맵 캐시가 동작하여 60FPS를 달성할 수 있습니다.

### 2. 전문가 B (C++ 시스템 및 동시성 엔지니어)
**주제: 카메라 영상 폴링 채터링 방지 (`std::shared_mutex`)**
- **문제 인식**: `LatestFrameStore`에서 다수의 읽기(웹 UI 스트리밍)와 쓰기(카메라 프레임 획득)가 동시에 발생할 때 일반 `std::mutex`를 사용하면 읽기 스레드 간에도 블로킹이 발생하여 영상이 끊깁니다.
- **해결 전략**: C++17의 `std::shared_mutex` 기반 읽기-쓰기 락(Read-Write Lock) 패턴을 도입합니다.
  - `GetLatestFrame` (읽기): `std::shared_lock<std::shared_mutex>`를 사용하여 UI 영상 요청 간 동시 다발적 읽기를 허용(Non-blocking)합니다.
  - `UpdateFrame` (쓰기): `std::unique_lock<std::shared_mutex>`를 사용하여 프레임 데이터 덮어쓰기 순간에만 상호 배제를 보장합니다. `std::move`와 결합하면 락 유지 시간이 극도로 짧아집니다.

### 3. 전문가 C (React/Zustand 상태 관리자)
**주제: 상태 전파 및 예외 규약(Scanner 가공 숨김) 유지**
- **문제 인식**: 사용자 요구에 따라 Scanner 가공 시에는 가시성 확보를 위해 객체를 숨기는 기존 동작이 올바른 규약입니다. 
- **해결 전략**: 
  - `RecipeCanvas.tsx` 내의 `visible = false` 로직은 건드리지 않고 그대로 보존합니다.
  - 대신, 새로 추가될 `fabric.DotMatrix` 조작 시 React 리렌더링 폭주를 막기 위해, 드래그 중(`object:moving`)에는 Zustand 업데이트를 차단하고 드롭 완료 시(`object:modified`)에만 상태를 단방향으로 전파하는 "Transient Update" 규칙이 잘 지켜지도록 모니터링 및 방어 코드를 적용합니다.

---

## 🚀 최종 수정 계획 (Implementation Plan)

### 1. `LatestFrameStore` 락(Lock) 구조 전면 개편 (C++)
- **대상 파일**: `LASERnGRAPN\Native\ui\cef\LatestFrameStore.h` 및 `LatestFrameStore.cpp`
- **수정 내용**:
  - `<shared_mutex>` 헤더 추가
  - `std::mutex mtx_;` 👉 `std::shared_mutex mtx_;` 로 타입 변경
  - 읽기 로직: `std::shared_lock<std::shared_mutex> lock(mtx_);` 로 다중 접속 허용
  - 쓰기 로직: `std::unique_lock<std::shared_mutex> lock(mtx_);` 로 단독 점유 쓰기

### 2. `fabric.DotMatrix` 커스텀 클래스 신규 개발 (TypeScript)
- **대상 파일**: `Portal\src\ui\pages\Recipe\Canvas\fabric\DotMatrix.ts` (신규 생성) 및 관련 Generator 모듈.
- **수정 내용**:
  - 좌표 배열(Point Array)을 입력받아 단일 컨텍스트로 점배열을 드로잉하는 Fabric 객체 구현.
  - 캐싱 속성(`objectCaching: true`) 활성화 및 Bounding Box 계산 로직 구현.
  - 생성 툴 및 속성창 연동 파이프라인 정비 (필요시 C++ 가공 커맨드 변환기인 `FabricToPaperAdapter` 등에도 Matrix 인식 로직 추가 여부 검토).

### 3. 예외 규약 보존 (Scanner Mode Hide)
- **대상 파일**: `RecipeCanvas.tsx`
- **수정 내용**: 사용자의 피드백을 수용하여 해당 파일의 가시성 로직은 수정하지 않고 현재의 안정적인 상태를 유지합니다.
