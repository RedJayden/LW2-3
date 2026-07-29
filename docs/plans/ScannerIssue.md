# Scanner 가공 이상 증상 — 통합 원인 분석 · 수정 내역 · 워크스루 (2026-07-21)

> 이 문서는 스캐너(SinoGalvo/CSG9210) 가공 이상 증상에 대한 **1~4차 분석·수정을 하나로 병합**한 단일 진실 문서다. (이전에 `ScannerIssue2.md`/`ScannerIssue3.md`로 분리돼 있던 내용을 모두 통합함.)
> 참조: `docs/checkpoints/feature_Scanner.md §6.9/§6.11/§6.12`, `docs/checkpoints/LW22_JhcLib.md`(레거시 대조), 메모리 `reference-getmarkingstate-polarity`, 벤더 문서 **CSG9210 SDK Manual V1.0 p.11**, 검증된 정상 버전 `C:\LW23_porg\source\LW2-3_JNU설치 버전_260602`(리팩토링 전 `GalvoController.cpp`).

---

## 0. 최종 확정 상태 (이 절이 최우선 — 충돌 시 이 절을 따른다)

완료 판정 로직은 4개 라운드에 걸쳐 결론이 **세 번 바뀌었다**. 현행(최종) 상태는 다음과 같다.

### 0.1 완료 판정 로직 결론 변천

| 라운드 | `CheckMarkingState()` 완료 조건 | 결과 |
|---|---|---|
| 1차 (260602 복원) | `==1` **AND** `(MarkStatus&0x01)==1`(bit set 대기) | 빠른 마킹(매트릭스 셀/Mark Times 2패스)에서 **무한대기** |
| 2차 | `==1` **단독** (done-bit 게이트 제거) + 2단계 안정 확인 | 전송 완료 시점 **조기 완료**(물리 마킹 중 UI Completed) |
| **3·4차 (현행 적용)** | **`==1` AND `GetSystemState()==TRUE` AND `(MarkStatus&0x01)==0`** + Phase1(150ms busy 진입) | 대부분 정상. 단 매트릭스에서 **조기완료 간헐 재발** ↓ |
| 5차 (계획, **미적용**) | 위 + **Phase A 활성 관측 강제** + `Run()` 말단 **최종 완료 게이트** | §7 참조 — 승인 후 구현 |

### 0.2 최종 진실 (완료 판정) — ⚠️ 5차 정정 (260619 known-good 대조)

> **이전 3·4차의 "bit0==0이 최종 진실"은 오류였다.** 검증된 정상 버전 `inchen/LW2-3_INC_260619`(조기완료 없음)와 대조해 확정한 최종 결론은 아래다.

- `GetMarkingState()` 극성: **`0 = Busy(not over)`, `1 = Idle(end of sending data)`** — SDK 매뉴얼 p.11, 전 라운드 불변.
- `GetMarkingState()==1`은 "전송/큐 소진 완료"일 뿐 물리 마킹 완료가 아니다.
- **완료 판정 = `GetMarkingState()==1 && (MarkStatus & 0x01)==1` (bit0 set = 완료).** 이것이 260619의 판정식이며 조기완료가 없었다.
- **핵심 전제 — `ReturnToCenterPoint()`**: 260619는 **각 마킹 사이클(Z_MOVE 핸들러·end-of-chunk·루프 시작)을 `ReturnToCenterPoint()`(SchOutPoint(0,0))로 마무리**한다. 갈보가 셀 위치→센터로 실제 이동하는 종점이 항상 존재해, 그 종점에서 **`bit0==1`이 신뢰성 있게 세워진다**. 이 센터 이동이 완료 판정의 load-bearing 요소다.
- **3·4차 오판의 경위**: 3차에서 "셀 경계 센터 점프"를 버그로 오인해 `ReturnToCenterPoint`를 제거(hasStart/MovetTo로 대체)했다 → 마킹 사이클 종점이 사라져 `bit0==1` 판정이 불안정(무한대기로 관측) → 이를 "bit0 의미가 반대"로 잘못 결론지어 `bit0==0`으로 변경 → `bit0==0`+센터이동없음이 **마킹 시작 전 idle을 완료로 오판** → 조기완료. 즉 **문제는 bit0 극성이 아니라 `ReturnToCenterPoint` 제거였다.**

### 0.3 현행 `CheckMarkingState()` 구현 요지 (`SinoGalvoController.cpp`, 5차·260619 정렬)

- 완료 조건: **`GetMarkingState()==1 && (MarkStatus & 0x01)==1`** (260619와 동일). Phase1/2·STABLE_POLLS 제거, 단일 루프.
- `Run()`은 **루프 시작 전 + Z_MOVE 핸들러 + end-of-chunk**에서 각각 `ReturnToCenterPoint()`를 호출(260619 복원). 이로써 각 셀이 센터 이동으로 종료 → bit0 전이 신뢰성 확보 + 마지막 도형 후 갈보 센터 복귀(기능1 내재 충족).
- `Sleep(1)` 폴링(Stop 즉시 반응), `HARD_TIMEOUT_MS=600000`(10분)은 260619에 없던 순수 보드 고착 방어 안전망(정상 동작 무관). 진단 로그 `MarkStatusBit0` 200ms 스로틀.
- 버퍼 한계 flush(이슈 G)는 연속 스트림 유지를 위해 센터 이동 생략(>100KB 대형 객체 전용).

### 0.4 라운드 이력 개요

- **1차**: GetMarkingState 극성 원복 / 매트릭스 대각선(Scanner) / DXF 리사이즈 / DXF+매트릭스 정규화 / 완료·Stop 로직 260602 복원(→ 재정정) / Stop 즉시탈출.
- **2차**: 명령 큐 버퍼 분할(이슈 G) + 진행률 안 A(네이티브 체크포인트) → 이후 스캐너 진행률은 **부정형 로딩 표시**로 전환. 완료 판정 `==1` 단독화(→ 재정정).
- **3차**: 완료 판정 최종 확정(`bit0==0`) / 색상 그룹 `Z_MOVE` 방출 / `Z_MOVE` (0,0) 점프 제거(`hasStart`) / 매트릭스 색상·스타일 표시 정합 + Fill 편집 숨김 / 셀 오버라이드 영역 확장(`applyOverride`).
- **4차**: 매트릭스 원본 잔존/이중생성 다층 방어.
- **5차 (적용 완료)**: 매트릭스 조기완료 **재발**을 260619 known-good 대조로 규명 — 진짜 원인은 3·4차의 `ReturnToCenterPoint` 제거였다(위 0.2 정정). **260619 정렬 복원**: `CheckMarkingState()` = `bit0==1` 완료 / Z_MOVE·루프시작 `ReturnToCenterPoint()` 복원(→ 기능1 마지막 도형 센터 복귀 내재 충족) / 기능2 갈보 센터 버튼 신설(`MoveToCenter()` + IPC `cmd.scanner.center` + `RecipeCanvas` FAB). 변경 파일: `SinoGalvoController.cpp/.h`, `IScannerController.h`, `PortalRouterHandler.cpp`, `HardwareFacade.ts`, `RecipeCanvas.tsx`.

### 0.5 포맷 규약 (§6.7 해소)

`SinoGalvoController.cpp`가 UTF-8 BOM을 잃어 §6.7이 신규 주석을 ASCII로 강제했던 것 → **BOM 복원(CRLF 보존)** 으로 해소. 현재 이 파일 및 3차에서 손댄 `IScannerController.h`/`PortalRouterHandler.cpp`는 한글 주석 사용 가능.

---

## 1. 증상 요약 (전 라운드 실기 보고)

**1차 (초기 보고)**
1. **극성 먹통**: 사각형 하나 가공 시 스캐너가 가공 안 하거나, 완료 판정이 안 되어 무한 RUNNING → 보드 먹통(재부팅 필요).
2. **매트릭스 대각선 오가공(재발)**: 매트릭스가 화면 위치가 아닌 우측 하단 대각선 방향에 타각(§6.9 재발).
3. **DXF 리사이즈 오작동**: DXF 로드 직후 리사이즈 시 선택 영역이 도형보다 크게 표시되고 엉뚱한 값 입력. 재선택하면 정상화.
4. **DXF+매트릭스 선택영역 오표시**: DXF를 matrix로 만들면 셀 오버레이가 엉뚱한 곳에 표시.
5. **조기 완료 오판**: 물리 가공 중인데 진행률 100%, hide 오버레이 show, 버튼 Start.
6. **Stop 지연**: Stop을 눌러도 즉시 안 멈추고 몇 라인 더 진행 후 멈춤.

**2차 (레거시 대조로 발굴)**
7. **명령 큐 버퍼 한계 미처리**: 대형 레시피에서 하드웨어 버퍼 오버플로 위험.
8. **진행률 부정확**: 타이머 기반 가짜 추정이 네이티브 실측 신호를 덮어씀.

**3차 (2차 적용 빌드 실기)**
9. **조기 완료 재발(새 형태)**: `==1` 단독 판정으로 첫 도형 물리 마킹 중 Completed 전환.
10. **색상별 Z 미적용**: 색상별 Z(36.521/36.621) 설정해도 Z축 안 움직임.
11. **DXF 매트릭스 복합 이상**: ① Current Layer 검은색 + 편집바 Fill/Line 오표시 ② 드래그 시 숨은 원본 노출 ③ 셀 경계마다 (0,0) 점프 후 복귀 ④ 이후 보드 먹통.
12. **매트릭스 Fill 편집 정책**: 매트릭스 선택 시 Fill 항목 숨김 (Fill은 생성 전 원본에 적용).
13. **셀 오버라이드 영역 확장 실패**: 셀을 원 영역 밖으로 이동하면 도형이 안 보임.
14. **색상/레이어 순서**: Layer List 순서대로 순차 가공 + Current Layer 스와치 순서 동기화.

**4차 (3차 적용 빌드 실기)**
15. **매트릭스 원본 잔존/이중생성**: 매트릭스 생성 시 원본과 매트릭스가 함께 남음. LayerList에 #000000 레이어.

---

## 2. 근본 원인 분석 (문제 영역별)

### §A. 완료 판정 — 조기완료/무한대기/보드 먹통의 공통 뿌리 (증상 1·5·6·9·11-④)

정상 버전 260602의 `GalvoController::CheckMarkingState()`와 현행을 비교하고, 3회 실기 증거를 종합해 **완료 판정 = `==1 AND GetSystemState==TRUE AND bit0==0`** 로 최종 확정(§0 참조).

| 실측 | 관찰 | 증거 |
|---|---|---|
| (A) done-bit(bit set) 대기 | 빠른 마킹 무한대기 | `CheckMarkingState: poll #2472, elapsed=20312ms` (폴당 ~8ms = `GetSystemState` 매 폴 호출 = `==1` & bit0==0 로 20초+ 지속) |
| (B) `==1` 단독 | 물리 마킹 중 조기 Completed | 첫 원 가공 중 Completed 표시, 스캐너는 이후에도 동작 |
| (C) 260602 레거시 | bit set 대기로 정상 운용 | 사용자 증언 |

부수적으로, 1차에서 확인된 **Stop 지연**의 소프트웨어 원인도 유효: 구 `CheckMarkingState`의 `Sleep(100)` 폴링(반응 최대 100ms 지연) + `Run()`의 pre-wait(3s)/next-chunk-wait(5s) 대기 루프가 `m_stopFlag`를 확인하지 않던 것. → `Sleep(1)` 복원 + 대기 루프 즉시 탈출로 해소.

### §B. GetMarkingState() 극성 (증상 1)

이전 세션이 `JhcLib.h:95`의 인라인 주석(`1:Busy, 0:Idle`)만 근거로 극성 3곳을 반전 → 오판. **SDK Manual p.11**(`1:end of sending data, 0:not over`), `JhcLib.cpp ScannerUtil::WaitFinish()`(SDK 인용 `[cite:49]`), `feature_Draw.md §4.3`가 모두 **`0=Busy, 1=Idle`** 로 일치. 헤더 인라인 주석이 오기였고, 원본 코드가 정답. → 3곳 원복 + 헤더 주석 정정.

### §C. 매트릭스 대각선 오가공 — Scanner 모드 한정 (증상 2)

§6.9에서 `MatrixRepeater.getCellSceneOrigin()`(단일 진실)로 통일했으나 **`ScannerGenerator.ts`의 MatrixRepeater 분기에만 이 호출이 누락**되어 `col*xSpacing + xOffset`(매트릭스 `left/top` 누락)로 남음. Object 모드(`useGCodeGenerator.ts:1263`)·렌더러·CanvasTopBar는 이미 호출 → Scanner 모드에서만 재발. → `getCellSceneOrigin()` 호출로 교체.

### §D. DXF 로드 직후 리사이즈 오작동 (증상 3)

DXF는 여러 엔티티를 `ActiveSelection`으로 묶고 `scaleX/scaleY=pxPerMm(~1000)`을 적용(`dxfImport.ts:71-86`). `CanvasTopBar.tsx`의 W/H 커밋에서 그룹 기준 크기를 `getGroupLogicalSize()`(그룹 변환 포함 = **표시 크기**)로 구한 뒤 `nextScale=목표/표시크기`(상대 배율)를 `set('scaleX', ...)`로 **절대값 대입** → 실제 스케일(~1000)이 날아감. 단일 도형은 `width`가 스케일 독립이라 우연히 정상. → 그룹 경로를 `scaleX * (목표/표시크기)`로 **합성**하도록 수정.

### §E. DXF 매트릭스 위치 이탈 (증상 4·11)

`useMatrixGenerator.ts`의 소스 정규화 두 갈래:
- **다중 엔티티(activeSelection)**: `cloned.left - activeObject.left`로 계산 — 좌표계 혼용 + 그룹 스케일 누락. → `qrDecompose(child.calcTransformMatrix())`로 그룹 스케일 포함 절대 성분 복원 + 그룹 좌상단(topLeft) 기준 정규화.
- **단일 객체(else, 해마처럼 단일 DXF 그룹)**: `left:0, top:0`로만 정규화 → DXF 내부 그룹 변환/콘텐츠 오프셋 때문에 콘텐츠가 bbox 원점에 정렬 안 됨 → 셀이 좌상단 이탈. → 단일 group/DXF도 ActiveSelection과 동일한 `qrDecompose` 방식으로 통일(순수 기본 도형은 기존 경로 유지).

### §F. 명령 큐 하드웨어 버퍼 한계 미처리 (증상 7)

`Run()`의 청크 경계는 **오직 `Z_MOVE`/`DELAY`에서만** 발생(`:313, 340`). 두 경계 사이 모든 도형 커맨드가 단일 `BufStart` 버퍼에 무제한 누적. 레거시는 `Is_Accumulated_Buffer_Over()`로 강제 flush(`LW22_JhcLib.md §4.2`). `JHCStatusdef.freeSpace` 필드가 존재하나 미사용 → 버퍼 관리 부재. 위험: Z_MOVE/DELAY 없는 대형 레시피(수천 엔티티 DXF/대형 매트릭스/촘촘한 해칭)에서 오버플로 → 커맨드 유실/먹통. → 누적 바이트 기반 인라인 flush 도입.

### §G. 진행률 부정확 (증상 8)

두 신호 충돌: (진실) 네이티브 `__onScannerProgress(cmdIndex/total)` vs (가짜) `useProcessMonitor.ts`의 1초 타이머가 `elapsed/estimatedTotalSeconds`로 매초 덮어씀(EMA overhead 보정 + Zeno's Cap 점근까지). JhcLib에 실시간 진행 API 부재. → 안 A(네이티브 체크포인트) 채택 후, 스캐너 모드는 최종적으로 **부정형 로딩 표시**로 전환(단일 청크 소형 레시피는 실측 체크포인트가 0/100뿐이라 %가 무의미).

### §H. 색상별 Z 미적용 (증상 10)

`ScannerGenerator.generate()`가 그룹마다 `currentZ`만 바꿔 전달할 뿐 **그룹 시작 시 `Z_MOVE`를 방출하지 않음**. `generatePass()`의 Z_MOVE는 ①도형 `customData.zOffset` ②매트릭스 셀 zStep 뿐 → 일반 도형은 Z 안 움직임(실측 일치). 프리셋 zOffset 값 자체는 `groupByColorPreset`이 `targetZ`로 정확히 읽음(값이 버려질 뿐). → 그룹 경계에서 `targetZ != lastZ`면 `Z_MOVE` 방출.

### §I. Z_MOVE (0,0) 점프 (증상 11-③)

매트릭스 분기가 `{type:'Z_MOVE', x:0, y:0, z}`만 push하고 startX/startY 미포함(`:389`). `Run()`의 Z_MOVE 분기는 `MovetTo(cmd.startX, cmd.startY)` = **`MovetTo(0,0)`** → 셀 경계마다 (0,0) 센터로 점프 후 복귀. → `ScannerCommand`에 `hasStart` 추가, Z_MOVE에 다음 셀 원점(`transformPoint(cellOrigin)`)을 실어 보내고 `hasStart`일 때만 `MovetTo`.

### §J. 매트릭스 색상/스타일/Fill 표시 정합 (증상 11-①·12)

- **Current Layer/LayerList 검은색**: `resolveObjectColorHex`가 MatrixRepeater→`sourceObjects[0]`까지만 위임. 단일 DXF는 `sourceObjects[0]`이 `fabric.Group`이고 Group 자신 stroke/fill은 null(검정), 실제 녹색은 자식 leaf에 있음 → 위임 한 단계 부족. → **leaf까지 재귀 하강**(`resolveStyleSourceObject`).
- **편집바 Fill/Line 오표시**: CanvasTopBar가 리피터 자신(Group 기본값)의 플래그를 읽음. → 표시를 `sourceObjects` leaf 기준으로 라우팅 + **매트릭스 선택 시 Fill 항목 숨김**(Fill은 생성 전 원본에 적용, 셀이 `CLONE_PROPS`로 상속).

### §K. 셀 오버라이드 영역 확장 실패 (증상 13)

`updateBoundingBox()`가 `this.left/top`을 **직접 대입**해 Fabric 변환행렬 캐시(ownMatrixCache)가 무효화되지 않음 → `calcTransformMatrix()`가 옛 값 반환 → `drawObject()`의 뷰포트 컬링이 옛 프레임 기준 판정 → 확장 영역 셀이 컬링(사라짐). → `this.set()`으로 변경(캐시 무효화) + `setCoords()`, 그리고 모든 override 경로를 `applyOverride()` 헬퍼로 일원화.

### §L. 매트릭스 원본 잔존/이중생성 (증상 15)

"프리뷰 중 은닉(`visible=false`) → Apply 시 `commitMatrix()`가 원본 제거" 상태머신에 구멍: ① `commitMatrix`/`clearMatrix(Cancel)`가 세대 토큰을 안 올려 in-flight `generateMatrix`(clone 대기 중)가 뒤늦게 깨어나 상태 오염 ② 세션 ID 불일치 시 누수 ③ 은닉 원본이 LayerList 노출 ④ 가공 생성기에 최종 가드 부재. + `LayerList.tsx` 색상 그룹핑이 `resolveObjectColorHex` 아닌 자체 raw 로직 사용(#000000 레이어). → 다층 방어(세대 토큰 + 최종 가드 + leaf 그룹핑 + 은닉 원본 비노출).

### §M. 색상/레이어 순서 (증상 14)

LayerList·`useCanvasColorGroups`·`ScannerGenerator`가 모두 `canvas.getObjects()` 순서 사용 → 순서 소스는 이미 canvas z-order로 단일화됨. 다만 재정렬 핸들러가 `object:modified`를 발생시키지 않아 스와치/가공 순서 미연동. → 재정렬 시 이벤트 fire.

### §N. 커맨드 시퀀스 감사 — 수정 불필요 (증상 확인)

- 기본 도형·text·image·svg·dxf 커맨드 생성은 `FabricToPaperAdapter` 실측 지오메트리/정밀 좌표 사용 → 정확.
- 과거 "직선 도형이 실제 크기의 절반만 변환"되던 버그는 `convertLine()`이 `calcLinePoints()`(전체 양 끝점)+`applyTransform`으로 **이미 수정**되어 재현 안 됨.
- SVG/Image 매트릭스는 §E의 qrDecompose 통일이 등가라 정상 유지(회귀 검증 항목 포함).

---

## 3. 적용 완료 내역

### 3.1 네이티브 — `SinoGalvoController.cpp` (+ `IScannerController.h`, `PortalRouterHandler.cpp`, `JhcLib.h`)

- **극성 3곳 원복**(`0=Busy, 1=Idle`): pre-wait/next-chunk-wait(`==0` 대기), CheckMarkingState. 근거 주석 + "재반전 금지" 경고. `JhcLib.h:95` 주석 정정.
- **완료 판정 최종 확정**(§0.3): Phase1(busy 진입 150ms) + Phase2(`==1 && GetSystemState==TRUE && bit0==0`, STABLE_POLLS=3) + 10분 타임아웃 + `Sleep(1)` + `MarkStatusBit0` 로그.
- **Stop 즉시 반응**: pre-wait/next-chunk-wait 대기 루프에 `m_stopFlag` 확인 추가(즉시 `Cancel()` 후 탈출).
- **버퍼 분할(이슈 G)**: `SCANNER_DATA_BUFFER_LIMIT = 100000`(레거시 값) + `CommandBufferBytes()`(LINE=12+16, POINT/CIRCLE=12+12, RECT=12+16×4, ARC=12+20, ELLIPSE=12+16, EARC=12+24; 각 도형 앞 MovetTo 12B 포함). `Run()` 버퍼링 루프에 `bufferedBytes` 누적기(BufStart마다 리셋), 한계 도달 && 비-마지막이면 **인라인 flush**(`SchLaserOut→StartMarking→CheckMarkingState`) 후 `BufStart`+`SetDefaultParameters` 재개(인라인 flush는 `ReturnToCenterPoint` 미호출).
- **진행률 안 A(이슈 H)**: 청크 시작부 방송 제거, `emitProgress(done,total)`를 **각 CheckMarkingState 완료 직후**(Z_MOVE/DELAY/버퍼분할/청크종료 4곳)에 방송(단조 증가).
- **Z_MOVE (0,0) 점프 제거**: `ScannerCommand`에 `bool hasStart` 추가, IPC 파서가 startX/startY 존재 시에만 채우고 세움, `Run()`의 Z_MOVE flush는 `hasStart`일 때만 `MovetTo`.
- **포맷**: `SinoGalvoController.cpp`·`IScannerController.h`·`PortalRouterHandler.cpp`에 UTF-8 BOM 복원(CRLF 보존) → 한글 주석 사용.

### 3.2 프론트엔드

| 파일 | 변경 |
|---|---|
| `services/ScannerGenerator.ts` | §C 매트릭스 `getCellSceneOrigin()` 호출 / §H 그룹 경계 `Z_MOVE(targetZ)` 방출 + lastZ 추적 / §I 매트릭스·꼬리 Z_MOVE에 startX/Y 채움 / §L `getAllObjects()` 최종 가드(`isMatrixOriginal` 도형·`isPreview` 리피터 가공 제외) |
| `ui/pages/Recipe/PropertyBar/CanvasTopBar.tsx` | §D DXF 리사이즈 스케일 합성 / §J 스타일 표시를 `resolveStyleSourceObject`(leaf) 기준 + 매트릭스 선택 시 Fill 항목 숨김 / §K 셀 X/Y/W/H 편집을 `applyOverride()` 경유 |
| `hooks/useMatrixGenerator.ts` | §E 단일·다중 DXF 소스 `qrDecompose` 정규화 통일 / §L `commitMatrix`·`clearMatrix(Cancel)` 세대 토큰 증가 + 잔존 원본 정리 + clone 후 "원본 제거됨이면 중단" 가드 |
| `utils/colorUtils.ts` | §J `resolveStyleSourceObject()` 신설(MatrixRepeater→sourceObjects[0]→leaf 재귀, guard 16), `resolveObjectColorHex`가 사용 |
| `ui/pages/Recipe/Canvas/fabric/MatrixRepeater.ts` | §K `updateBoundingBox()` `this.set()`+`setCoords()`(캐시 무효화) / `applyOverride(cellKey, patch)` 헬퍼 신설(override→updateBoundingBox→dirty→`object:modified` fire→render 일괄) |
| `components/ProcessDashboard.tsx` | §G 스캐너 모드 % 제거 → 부정형 로딩 바(경과시간·Mark Times 회차 유지). Object(G-Code) 모드는 % 유지 |
| `hooks/useProcessMonitor.ts` | §G SinoGalvo 가짜-타이머 분기 + EMA overhead self-learning + `OVERHEAD_FACTOR_SinoGalvo` 제거(스캐너는 네이티브 status 사용, Elapsed 유지) |
| `ui/.../LayerList.tsx` | §M 재정렬 핸들러가 `object:modified` fire / §L 색상 그룹핑을 `resolveObjectColorHex`(leaf)로 교체 + 목록 필터에 `!isMatrixOriginal`(은닉 원본 비노출) |

---

## 4. 워크스루 — 핵심 흐름

### 4.1 가공 완료 판정 (현행 최종)

```
Run()
 ├─ pre-wait: while(GetMarkingState()==0){ if(Stop) Cancel/break; ... 3s timeout }   ← 보드 준비 대기
 └─ while(cmdIndex): 청크 단위
      ├─ BufStart → 도형 버퍼링(SchOutLine/Rect/Circle...) → [버퍼 100KB 도달 시 인라인 flush]
      ├─ SchLaserOut → StartMarking()                        ← 데이터 전송 시작
      ├─ CheckMarkingState():
      │    [Phase1] while(GetMarkingState()==1 && elapsed<150ms){ if(Stop) return; }   ← 잔여 idle 조기완료 방지
      │    [Phase2] while(flag){ Sleep(1);
      │        if(Stop) Cancel;                                            ← 1ms 반응
      │        if(GetMarkingState()==1 && GetSystemState()==TRUE):
      │            if((MarkStatus&0x01)==0){ if(++idleStreak>=3) flag=false; }  ← bit0==0(물리 Idle) 3연속 → 완료
      │            else idleStreak=0;                                      ← bit0==1: 꼬리 마킹 중 → 대기
      │        if(elapsed>10min) flag=false; }                            ← 고착 방어 상한
      ├─ emitProgress(cmdIndex, total)                        ← 물리 완료 체크포인트(단조 증가)
      └─ next-chunk-wait: while(GetMarkingState()==0){ if(Stop) Cancel/break; ... 5s timeout }
 → 전 청크 완료 후 __onScannerStatus('idle')
   → 프론트: 오버레이 복원 + 버튼 Start (물리 완료 후에만). 진행률은 스캐너 모드 부정형 로딩.
```

핵심: `==1`(전송 완료)만으로 완료 처리하지 않고 **`MarkStatus` bit0가 0(Idle)** 이 될 때까지(꼬리 물리 마킹 종료까지) 대기.

### 4.2 매트릭스 셀 좌표 단일 진실 공급원

```
MatrixRepeater.getCellSceneOrigin(row, col, override)
  nominalLeft = this.left - _boundsOffsetX
  → { x: nominalLeft + col*xSpacing + xOffset, y: nominalTop + row*ySpacing + yOffset }  (절대 scene)
호출부(모두 동일): drawObject() / ScannerGenerator.ts / useGCodeGenerator.ts:1263 / CanvasTopBar.tsx
```

### 4.3 DXF → 매트릭스 소스 정규화

```
자식 o (그룹 로컬, 스케일 미반영)
 → abs = qrDecompose(o.calcTransformMatrix())     // 그룹 스케일 포함 절대 성분
 → clone.set({ left: abs.translateX - topLeft.x, top: abs.translateY - topLeft.y,
               scaleX: abs.scaleX, scaleY: abs.scaleY, angle, ... })  // 그룹 좌상단=원점
 → 단일/다중 동일 프레임 → 셀 간격·오버레이·가공 좌표 정합
```

### 4.4 매트릭스 스타일/색상 leaf 해석

```
resolveStyleSourceObject(obj): MatrixRepeater → sourceObjects[0] → (Group이면) 첫 leaf 자식 (재귀, guard 16)
 → resolveObjectColorHex / CanvasTopBar 표시 / LayerList·Current Layer 그룹핑 모두 leaf 색 기준
```

---

## 5. 검증 계획 (리빌드 후 실기)

빌드: `Portal`에서 `vite build` → msbuild(exe 실행 중이면 종료 후) 리빌드. 세 C++ 파일 BOM·CRLF 무결성 확인.

1. **완료 판정**: 원 2개(사이언 Z=36.521 / 레드 Z=36.621) → **물리 마킹 완전 종료 시점에만** FINISH 전환(중간 Completed 없음), 두 그룹 사이 Z 36.521→36.621 실제 이동, 완료 후 baseZ 복원.
2. **Mark Times=2**: Stop 없이 2회 연속 자동 가공 후 완료, 무한대기 없음(구 (A) 케이스 재검), 회차 1/2→2/2.
3. **매트릭스(Cumulative Z on)**: 셀 경계 (0,0) 점프 없음, 셀마다 Z 스텝, 마지막 셀 물리 완료 시 FINISH.
4. **매트릭스 위치**: 원점에서 떨어진 곳 매트릭스 → 화면 오버레이 위치 그대로 타각(대각선 이탈 없음).
5. **Stop**: 가공 중 Stop → 몇 라인 더 진행 없이 즉시 정지.
6. **진행률 UX**: 스캐너 가공 중 % 대신 흐르는 로딩, 완료 시 종료. Object 모드는 % 유지.
7. **DXF 매트릭스**: Current Layer/LayerList에 검은 레이어 없음(녹색 유지), 편집바 Line 체크(원본 동일)·Fill 미표시, 해마가 원 도형 위치/선택 박스 내 정렬. 원본에 Fill 적용 → 셀 상속 가공.
8. **DXF 리사이즈**: DXF 로드 직후 바로 W/H 입력 → 정상 크기 적용.
9. **셀 오버라이드 확장**: 셀 X/Y를 원 영역 밖(좌/상·우/하)으로 크게 이동 → 도형 안 잘리고 표시, 선택 테두리 확장 포함, 가공 위치 = 화면 표시. 원위치 복귀 시 바운딩 원복.
10. **매트릭스 원본**: Apply 후 원본이 캔버스·LayerList에서 사라지고 View Commands가 셀만 포함(원본 미포함), Cancel 시 원본 복원.
11. **버퍼 분할**: Z_MOVE/DELAY 없는 대형 DXF(수천 엔티티) → 먹통 없이 완주, 로그에 buffer-limit flush 출현. 소형 단일 도형은 flush 0회.
12. **색상/레이어 순서**: Layer List 순서대로 순차 가공, 재정렬 시 Current Layer 스와치·가공 순서 즉시 연동. Use Default Parameters ON→전체 통일, OFF→개별 복원.
13. **SVG/Image 매트릭스 회귀**: 정상 위치 유지.
14. **연속 세션**: 위 가공 반복 후 보드 먹통 없음.
15. **로그**: `CheckMarkingState`의 `MarkStatusBit0` 추이가 "마킹 중 1 → 완료 0"인지 확인(의미론 실증).

---

## 7. 미적용 계획 (5차, 2026-07-22 — 승인 후 구현)

> DXF 4셀 매트릭스(Cumulative Z, 셀당 Z 36.521→…→36.821) 가공 시 **2번째 셀 무렵 UI가 Completed로 전환(오버레이 show, 버튼 Start)되지만 스캐너는 3·4셀을 끝까지 물리 가공**하는 조기완료가 **재발**. 3·4차 검증 땐 `zMoveCallback`의 1.5초 블로킹이 가려 통과했으나 간헐 재현. **아직 미적용 — 완료 판정은 5회 결론이 바뀐 민감 영역이라 검토 후 진행.**

### 7.1 근본 원인 — `CheckMarkingState()` Phase 1이 "마킹 시작 관측"을 건너뜀

현행 Phase 1은 `GetMarkingState()`가 busy(0)로 떨어지는 것을 150ms만 기다린다. 그러나 `StartMarking()` 직후 이 보드에서 마킹 활성이 `==0`으로 **반드시 나타나지 않을 수 있다**(전송이 빨라 `==1` 유지, 또는 활성이 `bit0==1`로만 나타남). 그러면 Phase 1이 150ms 헛기다린 뒤 탈출하고 Phase 2가 즉시 `==1 && bit0==0`을 만족 → **물리 마킹이 시작되기도 전에 완료 판정**. 조기 반환한 셀만큼 `Run()`이 다음 셀 StartMarking을 보드 버퍼(깊이 ≈2)에 밀어넣고 idle을 방송 → "2셀 앞서 완료"와 일치. 부작용: 셀 N 마킹이 Z가 N+2 높이로 이동한 뒤 실행되어 **초점(Z) 어긋난 마킹** 가능.

### 7.2 수정 방향 (이중 방어, bit0 의미론 `0=Idle,1=Marking`은 유지)

1. **`CheckMarkingState()` 재설계 — "활성 관측 → 완료 대기"**:
   - **Phase A(활성 관측)**: 보드가 실제 일하는 것을 최소 1회 관측할 때까지 대기 — `(GetSystemState()==TRUE && bit0==1)` 또는 `(GetMarkingState()==0)`. 상한 `ACTIVE_OBSERVE_MS`(전송 여유 감안 넉넉히, 예 1~2초) 내 미관측이면 "내용 없음/즉시 완료"로 반환(빈 마킹 무한대기 방지). 내용 있는 마킹(해마=수초)은 반드시 관측되어 조기완료 원천 차단.
   - **Phase B(완료 대기)**: 기존과 동일(`==1 && GetSystemState==TRUE && bit0==0` 3연속). 10분 타임아웃·Stop·진단 로그 유지.
2. **`Run()` 최말단 최종 완료 게이트**: idle 방송 직전(`:660`)에 보드가 완전히 idle이 될 때까지(`==1 && bit0==0` 안정, Stop·타임아웃 포함) 대기 → 셀별 판정이 앞서더라도 **UI 완료 신호는 보드 버퍼 소진·물리 완료 후에만** 방송(직접 방어선).

### 7.3 기능 요청 2건

- **마지막 도형 후 갈보 센터 복귀**: `ScannerGenerator`가 방출하는 `{type:'CENTER'}`는 **C++ enum에 없어 IPC 파서가 버린다**. 또 `ReturnToCenterPoint()`(`:668`)는 `SchOutPoint(0,0,0)`뿐이라 단독으론 갈보가 안 움직인다(BufStart/StartMarking 사이클 밖). → `SinoGalvoController`에 실제 이동 메서드 `MoveToCenter()` 신설(`BufStart→SchOutPoint(0,0)→SchLaserOut(0파워/GUIDE)→StartMarking→Phase B 완료 대기`), `IScannerController`에 추가, `Run()` 최말단(최종 게이트 직후)에서 호출.
- **"Move to Scanner Center (galvo)" 버튼**: 카메라뷰 우하단 `TouchApp` FAB **위에** 동일 스타일 원형 FAB 추가(scanner 모드 한정, 예 `CenterFocusStrong` 아이콘). 클릭 시 `hwFacade.scannerMoveToCenter()` → 신규 IPC `cmd.scanner.center` → `g_Scanner->MoveToCenter()`. 기존 하단 `MyLocation` 버튼(=스테이지 X/Y 센터 이동)은 툴팁을 "Move Stage to Center"로 명확화(갈보 센터와 혼동 제거). 가공 중 비활성.

### 7.4 5차 검증 계획 (구현 후)

1. 4셀 DXF 매트릭스(Cumulative Z): **마지막 셀 물리 완료 시점에만** Completed 전환(2셀 앞서 완료 없음), 셀별 Z 초점 정상.
2. 단일/일반 다중/Mark Times≥2: 조기완료·무한대기 없음.
3. 로그: 각 셀 `MarkStatusBit0`가 `…1…1…0`(활성 관측 후 완료) 추이.
4. 마지막 도형 후 갈보 (0,0) 중앙 복귀(육안/카메라).
5. 신규 버튼: TouchApp 위 표시, 갈보만 센터(스테이지 불변), 툴팁, 가공 중 비활성, 기존 스테이지 센터 버튼과 구분.

### 7.5 5차 수정 대상 파일 (예정)

| 파일 | 항목 | 변경 |
|---|---|---|
| `SinoGalvo/Base/SinoGalvoController.cpp/.h` | 조기완료, 기능1 | `CheckMarkingState()` 재설계(Phase A/B), `Run()` 말단 최종 게이트, `MoveToCenter()` 신설 |
| `Modules/Scanner/IScannerController.h` | 기능1·2 | `MoveToCenter()` 인터페이스 |
| `Core/Communication/PortalRouterHandler.cpp` | 기능2 | `cmd.scanner.center` 핸들러(WORK_1) |
| `Portal/src/services/HardwareFacade.ts` (+Channels/gen-ipc) | 기능2 | `scannerMoveToCenter()` |
| `Portal/src/ui/pages/Recipe/Canvas/RecipeCanvas.tsx` | 기능2 | 갈보 센터 FAB 추가 + 기존 스테이지 센터 툴팁 명확화 |

---

## 8. 미결/후속 (Follow-up)

- **매트릭스 원본 보관 방식 정리(증상 11-②)**: 은닉 원본을 리피터 내부(직렬화 속성)에만 보존하도록 정리 — 회귀 위험 관리 위해 별도 라운드.
- **버퍼 임계치 튜닝**: `SCANNER_DATA_BUFFER_LIMIT`(현 100000)/flush 빈도를 대형 레시피 실기로 최적화(최소 flush로 오버플로만 방지). 가능 시 `freeSpace` 실측 기반으로 고도화.
- **DXF 로드 직후 "선택박스가 도형보다 크게 표시"되는 시각 잔상**: 리사이즈 수식(§D)은 이 상태에서도 정상 동작. 순수 시각 잔상 근본 제거는 별도 런타임(DevTools) 확인 필요.
- **§6.8 잔여 한글 주석**: BOM 복원으로 §6.7 위험 해소되어 정상 컴파일. ASCII 강제 정리는 선택 사항.

---
최종 작성일: 2026-07-21 (1~4차 통합 병합 — 완료 판정 최종 확정 반영)
담당: Claude (AI Coding Assistant)
