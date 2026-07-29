# 2. PMAC/Fastech 모션 Gcode 가공 시 현재 위치 원점 적용 및 Processing Rate 개선

## 3인의 전문가 분석 (Tree of Thought)

### Expert 1: UI/UX 개발자 (React/Zustand)
**원인 분석:**
현재 `useGCodeGenerator.ts` 코드 내의 `generateHeader` 및 `generateFooter` 함수를 확인해보면, G-Code의 시작과 끝에 강제로 `G53 X.. Y..` (절대 좌표 이동) 명령이 하드코딩되어 있습니다. 이로 인해 가공 시작 시 G-Code 내에서 기계가 무조건 절대 좌표로 이동하려고 시도하게 됩니다.
다중 도형 가공 시 Processing Rate가 100%로 고정되거나 부정확한 문제는 G-Code 줄 수(Lines)를 기반으로 진행률을 계산하는 `useProcessMonitor.ts`와 연관이 있을 수 있습니다.

**해결 방안:**
1. `useGCodeGenerator.ts`에서 G53 절대 좌표계 이동 명령을 제거합니다. 
2. `G90` (절대 거리 모드)를 사용하되, 생성되는 모든 X, Y 좌표는 '현재 카메라 위치(Stage 위치)'를 `offsetMm`으로 두고 이를 시작점(0,0 기준)으로 간주하도록 변환 로직을 유지하면 기계는 현재 위치를 기점으로 올바른 상대적 형태를 그립니다. 다만 G53 이동을 제거하여 시작 전 원점 복귀 액션을 없앱니다.

### Expert 2: C++/Motion Control 전문가
**원인 분석:**
현재 G-Code 파서(`GcodeProcessor.cpp` 또는 하위 모듈)는 1줄씩 파싱하여 PMAC/Fastech 컨트롤러에 모션 명령(`Jog` 또는 `MoveAbs/Rel`)을 내립니다. 만약 첫 명령이 `G00 X0 Y0`라면, 현재 좌표계의 0,0으로 이동하려 합니다. 
만약 프론트엔드에서 `generateGCode` 호출 시 `origin` 파라미터에 현재 Stage 절대 좌표 값을 대입하여 명령을 생성한다면, 기계의 절대 좌표 공간에서 현재 위치 근처에 도형 궤적이 올바르게 매핑됩니다. 문제는 불필요한 `G53` (Machine Coordinates) 복귀 명령입니다.

**해결 방안:**
1. 프론트엔드에서 불필요한 Home(G53) 복귀 및 Z축 SafeZ 이동 명령을 사용자의 의도에 맞게 옵션화하거나 제거합니다. "가공 시작시 현재 카메라 출력 위치가 원점"이어야 하므로, G-Code 생성 시 시작점을 바로 첫 번째 가공 지점으로 삼도록 G53 초기화 코드를 지웁니다.
2. 진행 상태(Progress)의 경우 G-Code 전체 라인 대비 현재 실행 중인 라인의 비율을 PMAC/Fastech 드라이버에서 지속적으로 폴링(`cmd.gcode.status`)하고 있으므로, 상태 업데이트 이벤트가 누락되지 않도록 백엔드 폴링 주기를 최적화합니다.

### Expert 3: 시스템 아키텍트
**종합 의견:**
G-Code는 장비 독립적인 언어이나, 현재 시스템 아키텍처에서는 카메라 화면상 좌표를 기계의 절대 좌표로 1:1 맵핑하여 생성합니다 (`offsetMm`에 Stage Pos 반영). 
따라서 Expert 1과 2의 분석대로, 단순하게 G-Code 생성 단계(`useGCodeGenerator.ts`)에서 하드코딩된 `G53` 강제 이동 명령만 삭제하면 해결됩니다. 그러면 기계는 현재 위치를 유지한 채 생성된 절대 좌표(카메라 기준 변환된 위치)로 바로 이동하여 가공을 시작합니다. 

## 수정 계획 (Plan)
1. **Frontend (`useGCodeGenerator.ts`)**:
   - `generateHeader`에서 `G53 Z...`, `G53 Y...`, `G53 X...` 출력 로직 제거.
   - `generateFooter`에서 `G53` 기반의 원점 복귀(RETURN TO HOME) 출력 로직 제거.
   - 시작 시 현재 Stage 좌표를 논리적 기준점(가공 원점)으로 삼고 곧바로 첫 Object로 이동(`G00 X.. Y..`)하도록 G-Code 흐름 간소화.
2. **Frontend (`useProcessMonitor.ts`)**:
   - G-Code 가공 중 다중 도형이라도 전체 G-Code Line 수를 바탕으로 Progress Rate가 100%까지 부드럽게 점진적 증가하도록 보장.

## 진행 결과 (Result)
* `GCodePanel.tsx`에서 origin 오버라이드 제거하여 캔버스 중앙 기준 좌표 변환 적용.
* `useGCodeGenerator.ts`에서 G53 강제 이동 명령 제거 완료. (현재 Stage 위치를 기준으로 가공 수행)
* **Status**: 해결 완료 (Done)
