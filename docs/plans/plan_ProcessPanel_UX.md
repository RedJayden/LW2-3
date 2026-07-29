# Process 패널 UX 개선 계획서 (Current Layer / 색상 선택 / 커맨드 뷰어)

## Context (배경)

Recipe 화면 우측 패널(RightPanel)의 Scanner/Object Process 탭에 대해 세 가지 UX 개선 요청이 들어왔다.

1. 프리셋 블록의 레이블 `CurrentLayer` → `Current Layer` (띄어쓰기)
2. 색상 스와치(사이언 사각형 / 빨간 원형 등)를 선택했을 때 **선택 상태가 눈에 잘 안 보임** → 선택 강조 강화
3. Process Start 후 하단에 뜨는 작은 "Generated Commands" 리스트 창을 제거하고, **버튼**으로 대체. 버튼을 누르면 Process 탭 창 **전체**에 커맨드가 표시되고, `X`/`Close` 버튼으로 닫으면 원래 Process 탭 화면으로 복귀.

## 관련 코드 조사 결과

| 요구 | 위치 | 현재 상태 |
|------|------|-----------|
| ① 레이블 | [ColorPresetPanel.tsx:89](../../Portal/src/ui/components/control/ColorPresetPanel.tsx#L89) | `CurrentLayer` 하드코딩 |
| ② 색상 선택 강조 | [ColorPresetPanel.tsx:102-118](../../Portal/src/ui/components/control/ColorPresetPanel.tsx#L102-L118) | 18px 원. 선택 시 `2px solid primary.main`, 비선택 `1px solid divider` — 원 내부가 레이어 색으로 꽉 차 있어 얇은 테두리 색 변화가 거의 구분되지 않음 |
| ③ 커맨드 리스트 | [SinoGalvoProcessPanel.tsx:223-246](../../Portal/src/ui/shell/SinoGalvoProcessPanel.tsx#L223-L246)<br>[ScanlabProcessPanel.tsx:246-269](../../Portal/src/ui/shell/ScanlabProcessPanel.tsx#L246-L269)<br>[GCodePanel.tsx:242-267](../../Portal/src/components/GCodePanel.tsx#L242-L267) | 세 패널이 동일 패턴의 작은 `<textarea>` 미리보기 창을 하단에 표시. `useProcessDetail` 설정으로 게이팅됨 |

세 Process 패널(스캐너-SinoGalvo, 스캐너-Scanlab, 오브젝트-GCode)이 **동일한 "하단 작은 커맨드 미리보기" 패턴을 중복**하고 있으므로, ③은 공유 컴포넌트로 일원화하는 것이 유지보수상 유리하다.

---

## 수정 계획

### ① `CurrentLayer` → `Current Layer`

- **파일**: [ColorPresetPanel.tsx:89](../../Portal/src/ui/components/control/ColorPresetPanel.tsx#L89)
- 표시 텍스트만 `Current Layer`로 변경. (상태 변수명 `currentLayerColor` 등 내부 식별자는 유지 — 표기만 수정)

### ② 색상 스와치 선택 강조 (UX)

- **파일**: [ColorPresetPanel.tsx:102-118](../../Portal/src/ui/components/control/ColorPresetPanel.tsx#L102-L118)
- 문제: 채워진 원 위의 얇은 테두리 색 변화만으로는 선택 구분이 어렵다. 특히 사이언/빨강처럼 채도가 높은 색은 primary 테두리와 뒤섞인다.
- 개선안 (레이어 색과 무관하게 항상 또렷하게 보이도록):
  - 스와치를 **20px**로, 선택 시 `transform: scale(1.15)`로 살짝 확대
  - 선택 시 **이중 링**을 `box-shadow`로 그림 — 안쪽은 패널 배경색 gap, 바깥쪽은 primary 링:
    `boxShadow: '0 0 0 2px <background.paper>, 0 0 0 4px <primary.main>'`
    → 색 위에 곧바로 테두리를 얹지 않고 **간격(gap) 링**을 두어 어떤 채움색에서도 선택이 분명해짐
  - 선택된 스와치 중앙에 흰색 테두리를 가진 **체크(✓) 아이콘** 오버레이(작게)로 명시적 표시
  - 비선택 스와치는 hover 시 `opacity`/`scale` 미세 피드백 추가
  - `transition`으로 부드럽게 처리
- **디자인 패턴**: 표현 상태(선택/비선택)를 스타일 함수로 분기하는 **State 표현 매핑**. 로직 변경 없이 스타일만 조정하므로 기능 회귀 위험 없음.

### ③ 커맨드 미리보기 → 버튼 + 전체 화면 뷰어

#### 신규 공유 컴포넌트: `CommandViewerPanel.tsx`
- **위치**: `Portal/src/ui/components/control/CommandViewerPanel.tsx` (신규)
- **역할**: Process 탭 영역을 꽉 채우는 커맨드 뷰어 오버레이.
- **Props**:
  ```ts
  interface CommandViewerPanelProps {
    title: string;        // 예: "Generated Commands" / "Compiled RTC Commands" / "G-Code"
    count?: number;       // 표시용 커맨드 개수 (옵션)
    text: string;         // 표시할 전체 커맨드 텍스트
    onClose: () => void;  // 닫기 콜백
  }
  ```
- **레이아웃**: 부모(패널 루트)에 대해 `absolute inset-0 z-20`로 패널 전체를 덮음.
  - 헤더: 좌측 제목 + 개수, 우측 `Copy` 버튼과 `X`(Close) 버튼
  - 본문: `flex-1` 전체 높이 `<textarea readOnly>` (기존과 동일한 모노스페이스/그린 텍스트 스타일 유지)
  - 하단: `Close` 버튼(선택적, X와 동일 동작)
- **디자인 패턴**: 3개 패널의 중복 UI를 걷어내는 **공유 프레젠테이션 컴포넌트(Composition)**. 커맨드 텍스트 생성 로직(`commandText`/`gcode`)은 각 패널에 그대로 두고 문자열만 주입 → 관심사 분리.

#### 각 패널 수정 (3곳 동일 패턴)
[SinoGalvoProcessPanel.tsx](../../Portal/src/ui/shell/SinoGalvoProcessPanel.tsx) / [ScanlabProcessPanel.tsx](../../Portal/src/ui/shell/ScanlabProcessPanel.tsx) / [GCodePanel.tsx](../../Portal/src/components/GCodePanel.tsx)

1. 로컬 상태 추가: `const [showCommands, setShowCommands] = useState(false);`
2. 패널 루트 `<div>`에 `relative` 클래스 추가(오버레이 기준점).
3. 기존 하단 `<textarea>` 미리보기 블록(위 표의 라인 범위) 제거 → **버튼**으로 대체:
   - 라벨 예시: `커맨드 보기 (N)` / `View Commands (N)` — 커맨드가 있을 때만 활성.
   - 배치: 기존 미리보기 자리(ProcessDashboard 아래).
4. `showCommands === true`일 때 `<CommandViewerPanel ... onClose={() => setShowCommands(false)} />`를 패널 루트 안에서 렌더 → `absolute inset-0`로 탭 창 전체를 덮음.
5. `X`/`Close` → `setShowCommands(false)` → 오버레이만 사라지고 원래 Process 탭(ProcessDashboard 등)이 그대로 복귀. ProcessDashboard는 언마운트되지 않으므로 진행 상태/스크롤 보존됨.
6. 기존 `useProcessDetail` 게이팅 유지 여부 결정 필요 → **아래 확인 사항 참고**.

각 패널의 title/text 매핑:
- SinoGalvo: title `Generated Commands`, count `commands.filter(c=>c.type!=='COMMENT').length`, text `commandText`
- Scanlab: title `Compiled RTC Commands`, 동일 count, text `commandText`
- GCode: title `G-Code`, text `gcode` (count 없음)

---

## 확인이 필요한 사항

1. **`useProcessDetail` 게이팅**: 현재 하단 미리보기는 이 설정이 켜져 있을 때만 표시된다. 새 "커맨드 보기" 버튼도 동일하게 이 설정에 종속시킬지, 아니면 항상 노출할지?
   - 권장: 기존 동작 유지(설정 ON일 때만 버튼 노출) — 회귀 최소화.
2. **버튼 라벨 언어**: 한국어(`커맨드 보기`) vs 영어(`View Commands`). UI 전반이 영문 위주라 영어를 권장.
3. **오버레이 커버 범위**: 패널 루트 `absolute inset-0` 방식은 패널을 감싸는 부모 `Box`의 `p:2` 패딩 안쪽까지만 덮는다(얇은 프레임 남음). 완전 풀블리드가 필요하면 상태를 RecipePanelContent 레벨로 올려야 함 → 권장은 패널 루트 오버레이(구현 단순, 시각적으로 충분).

---

## 작업 순서

1. `CommandViewerPanel.tsx` 신규 작성 (Doxygen 주석 + 디자인 패턴 명기)
2. SinoGalvoProcessPanel / ScanlabProcessPanel / GCodePanel — 버튼 + 오버레이 교체
3. ColorPresetPanel — 레이블 + 색상 스와치 선택 강조
4. `npm run build`(vite) 및 화면 확인 (스캐너/오브젝트 모드, Scanlab/SinoGalvo 분기)

## 영향 범위 / 리스크

- 순수 프론트엔드(React/MUI/Tailwind) UI 변경. C++ 드라이버·커맨드 생성 로직·스토어 스키마 변경 없음.
- 기능 회귀 위험 낮음: 커맨드 텍스트 생성부(`commandText`/`gcode`)와 ProcessDashboard 로직은 그대로 재사용.
- 세 패널의 중복 미리보기 UI가 공유 컴포넌트로 정리되어 유지보수성 향상.
