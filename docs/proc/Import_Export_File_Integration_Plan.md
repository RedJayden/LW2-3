# 파일 Import/Export 통합 개선 계획서 (통합본)

> **작성일**: 2026-07-21
> **협의**: ① UX/UI 디자이너 · ② 프론트엔드 아키텍트 · ③ 네이티브 통합(CAD/기하 포함) 엔지니어
> **대상 파일**: `Portal/src/ui/pages/Recipe/Toolbar/Toolbar.tsx`, `Portal/src/ui/pages/Recipe/Canvas/canvasImportExport.ts`, `Portal/src/ui/pages/Recipe/Canvas/utils/dxfImport.ts`, `LASERnGRAPN/Core/Communication/PortalRouterHandler.cpp`

---

## 1부. 현황 및 문제 정의

| 현재 버튼 | 실제 동작 | 문제점 |
|---|---|---|
| Image (I) | raster 이미지 → 외곽선 처리 | 3개 버튼이 "캔버스에 파일을 얹는" 동일 목적 |
| Import SVG | 벡터 SVG 로드 | 사용자가 파일 종류를 직접 알고 골라야 함 |
| Export SVG | SVG만 저장 | 포맷 고정. JSON/PNG/DXF 불가 |
| Import DXF | CAD 도면 로드 | 버튼 4개가 좌측 내비 잠식, 확장 시 계속 증가 |

**핵심 진단**: 사용자에게 "파일 종류"라는 구현 세부사항을 떠넘기고 있음. 또한 Import 실패 시 `console.error`만 발생하고 사용자 피드백 전무(GlobalToast 미사용).

### 확인된 코드 사실
- Import: `Toolbar.tsx`에 숨겨진 `<input type=file>` 3개(SVG/DXF/Image) 분리 운용.
- Export: 백엔드 네이티브 저장 다이얼로그(`HandleDialogSaveRecipeFile`, `GetSaveFileName`)가 파일명 확장자(.svg/.json/.lng)를 보고 필터 자동 선택 — 백엔드는 이미 "확장자 기반 판단" 구현됨.
- `exportToJSON`은 함수만 존재하고 UI 미연결. DXF Export는 전무.

---

## 2부. 채택 설계 (3인 협의 결론)

### 2-1. Import File (버튼 1개)
- 기존 Image / Import SVG / Import DXF 3버튼 → **Import File 1버튼** 통합.
- 단일 파일 선택창(모든 지원 형식) → 확장자/MIME 판별 디스패처(`importFile`)가 라우팅:
  - `.svg` → `importFromSVG` (벡터)
  - `.dxf` → `importFromDXF` (CAD)
  - raster(png/jpg/jpeg/bmp/webp/gif) → 기존 외곽선 처리 파이프라인
  - `.tif/.tiff` → **UTIF.js 디코딩** 후 raster 파이프라인 투입
  - 그 외 → Toast "지원하지 않는 형식" 안내
- 성공/실패 모두 **GlobalToast**(`useAppStore.showToast`)로 피드백.
- **디자인 패턴**: Import = *Strategy + Dispatcher*, Export = *Strategy(Registry)*.

### 2-2. Export File (버튼 1개)
- 앱 다이얼로그에서 **형식 선택(SVG/PNG/JPEG/WebP/JSON, 2차 DXF) + 파일명** 입력
  → 선택 포맷으로 직렬화 → `filename.<ext>`로 **네이티브 저장 다이얼로그** 1회 호출
  (위치 선택·덮어쓰기 확인은 OS 담당 — 이중 다이얼로그 방지).
- 백엔드는 넘어온 확장자로 필터 자동 선택(기 구현). PNG 등 신규 확장자 분기만 C++에 추가.

### 2-3. 모던 UX 추가 제안
1. **드래그 앤 드롭** — 캔버스에 파일을 끌어놓으면 동일 디스패처로 로드 (P3).
2. **결과 피드백(Toast)** — 성공 시 "형식·객체 수" 요약, 실패 시 사유 명시 (P1).
3. **최근 파일(Recent)** — Import 드롭다운으로 재로드 (P4, 선택).

---

## 3부. 파일 포맷 지원 분석

### 3-1. Import 지원 매트릭스 (요청 8종)

| 포맷 | 디코딩 경로 | 현재 지원 | 비고 |
|---|---|:---:|---|
| .svg | `importFromSVG` (벡터 파싱) | ✅ | |
| .dxf | `dxf-parser` | ⚠️ 부분 | LINE·POLYLINE·CIRCLE·ARC만. ELLIPSE·SPLINE·TEXT 무시 |
| .png / .jpg / .jpeg | Chromium 네이티브 | ✅ | |
| .bmp / .webp | Chromium 네이티브 | ✅ | CEF 실기 1회 검증 권장 |
| .gif | Chromium 네이티브 | ✅ | 정적 첫 프레임만 (각인 용도 무방) |
| .tiff / .tif | — | ❌ **미지원** | Chromium이 TIFF 미디코딩 + 프로젝트에 TIFF 라이브러리 부재 |

**결론**: TIFF만 미지원 → **UTIF.js(순수 JS, ~30KB) 도입**으로 해결 (P1).
TIFF → RGBA → `<canvas>` → dataURL → `fabric.Image` 경로. 백엔드 WIC 변환안은 범위 과대로 기각.

### 3-2. Export 지원 (인코딩은 별개 제약)

| 포맷 | 경로 | 지원 |
|---|---|:---:|
| SVG | `canvas.toSVG` | ✅ |
| PNG / JPEG / WebP | `toDataURL` | ✅ (Chromium) |
| JSON | `exportToJSON` (UI 미연결) | ✅ |
| BMP / GIF / TIFF | 브라우저 인코딩 불가 | ❌ (비권장) |
| DXF | 신규 구현 (4부) | 🔨 P4 |

---

## 4부. DXF Export 구현 설계 (P4 세부)

### 4-1. 핵심 통찰
`useGCodeGenerator.ts`가 이미 **모든 캔버스 객체를 mm 좌표 기하로 변환하는 완성 파이프라인** 보유:
- `toMm()` — px→mm, Y반전, 원점=스테이지 중심 (`useGCodeGenerator.ts:123`)
- 프리미티브 처리기(`processRect/Line/Polyline/Polygon/Triangle/Circle`) + 복잡 도형은 `FabricToPaperAdapter`로 폴리라인 평탄화 (`:1019-1052`)

→ DXF Export는 "출력 문자열을 G-code → DXF 엔티티로 교체"하는 수준. **의존성 무추가**(문자열 직접 생성), 신규 기하 로직 최소.

### 4-2. 포맷 및 엔티티 매핑
- **DXF R12 (AC1009) ASCII** — 최고 호환성. 헤더 `$INSUNITS=4`(mm), `$MEASUREMENT=1`. CRLF 줄바꿈.

| Fabric 객체 | DXF 엔티티 | 비고 |
|---|---|---|
| line | LINE | |
| circle (균일 스케일) | CIRCLE | |
| arc (start/endAngle) | ARC | Y반전 시 각도 부호 반전 |
| rect / triangle | LWPOLYLINE (closed) | |
| polyline / polygon | LWPOLYLINE | closed 플래그 구분 |
| path·ellipse·text·커스텀 fill | LWPOLYLINE (Paper.js 평탄화) | |
| group | 재귀 전개 | |
| image (raster) | skip | 벡터 아님 |

- **라운드트립 보장**: 자체 임포터가 아는 4개 엔티티 위주 출력 → 내보낸 DXF 재Import 시 동일 형상.
- 구조: `dxfExport.ts` 신규 — `DxfBuilder`(골격/group code 직렬화) + `toMm` 공용화 + `emitLine/Circle/Arc/Lwpolyline` + `walk(obj)` 재귀. **패턴: Strategy + Builder.**

### 4-3. 리스크 대응
| 리스크 | 대응 |
|---|---|
| 곡선 평탄화 세그먼트 수 | G-code와 동일 `PRECISION_SCALE`/샘플링 기준 공유 |
| Arc 각도 부호(Y반전) | G-code `invertY` 로직 참조 |
| 폐곡선 판정 | LWPOLYLINE `70` 플래그 정확 세팅 |
| 검증 | ① 자체 Import 라운드트립 ② 외부 CAD 뷰어(LibreCAD 등) 1회 확인 |

---

## 5부. 단계별 실행 계획 (P1~P4)

| 단계 | 작업 | 파일 | 리스크 | 상태 |
|---|---|---|---|:---:|
| **P1** | `importFile()` 디스패처 + 단일 input(8종 accept) + Import 버튼 통합 | `Toolbar.tsx`, `importFile.ts`(신규), `importImage.ts`(신규) | 낮음 | ✅ 완료 |
| **P1** | Import/Export Toast 연결(미지원 포맷 명시 안내 포함) | `Toolbar.tsx` + GlobalToast | 낮음 | ✅ 완료 |
| **P1** | UTIF.js 도입 → TIFF 디코딩 (8종 완전 커버) | `package.json`, `importImage.ts` | 중 | ✅ 완료 |
| **P1** | 실기(CEF) BMP/WebP/GIF/TIFF 로드 1회 검증 | (테스트) | 낮음 | ⬜ 실기 필요 |
| **P2** | Export 포맷 선택 다이얼로그(SVG/DXF/PNG/JPEG/WebP/JSON) + 전략 레지스트리 `exportCanvas` | `Toolbar.tsx`, `canvasImportExport.ts` | 중 | ✅ 완료 |
| **P2** | C++ saveImage 필터 WebP 추가 + 확장자별 기본 필터 선택 | `PortalRouterHandler.cpp` | 낮음 | ✅ 완료 |
| **P3** | 캔버스 드래그 앤 드롭 로드(동일 디스패처 재사용, 다중 파일 지원) | `RecipeCanvas.tsx` | 중 | ✅ 완료 |
| **P4-a** | `dxfExport.ts` 골격(DxfBuilder) + 복잡 도형 Paper.js 평탄화 → POLYLINE | `dxfExport.ts`(신규) | 중 | ✅ 완료 |
| **P4-b** | 네이티브 엔티티 승격(LINE/CIRCLE/ARC/POLYLINE-closed) | `dxfExport.ts` | 중 | ✅ 완료 |
| **P4-c** | C++ `.dxf` 필터 분기 + Export 다이얼로그 DXF 옵션 노출 | `PortalRouterHandler.cpp`, `Toolbar.tsx` | 낮음 | ✅ 완료 |
| **P4-d** | (선택) 레이어/색상(ACI) 매핑, DXF Import 엔티티 확장, 최근 파일 | 다수 | 중~높음 | ⬜ 미착수 |

### 구현 시 확정된 설계 변경 (2026-07-21)
1. **LWPOLYLINE → POLYLINE/VERTEX/SEQEND**: LWPOLYLINE은 R14+ 엔티티이므로 R12(AC1009) 정합성을 위해
   POLYLINE 시퀀스를 사용. 자체 임포터(`dxfImport.ts`)가 POLYLINE을 지원하므로 라운드트립 유지.
2. **DXF Import Y극성 결함 수정**: DXF(Y-up)를 무반전 로드하던 기존 결함을 수정 —
   LINE/POLYLINE/CIRCLE/ARC 임포트 시 Y반전(+ARC sweep 반전) 적용. dxfExport(toMm: mmY=-pxY/ppm),
   G-code(invertY)와 극성 일치 → 라운드트립·가공 극성 모두 보장.
   ⚠ 비대칭 도형의 DXF 임포트 결과가 이전 버전과 상하 반전됨(이전이 오류).
3. **raster export 저장 경로**: PNG/JPEG/WebP는 `dialogSaveImage`(Base64 디코딩 경로) 사용.
   WebP는 fabric 타입 제약으로 오프스크린 캔버스 재인코딩으로 생성.
4. **좌표 규약 확정**: GCodePanel과 동일 — `origin (0,0)`(스테이지 중심), `pxPerMm`(store), `invertY: true`.
5. **(2026-07-22 추가) Import 다이얼로그 통합 필터 기본화**: CEF 기본 파일 다이얼로그는
   `<input accept>`를 확장자별 개별 필터로 나열하고 첫 항목(SVG)을 기본 선택 → 다른 형식이
   목록에서 안 보이는 문제. `SimpleHandler`에 `CefDialogHandler::OnFileDialog` 구현(Adapter 패턴,
   `simple_handler.h/.cpp`)으로 Win32 열기 다이얼로그를 직접 띄워
   **"All Supported Files (*.svg;*.dxf;…)" 통합 필터를 1번(기본)** + 개별 필터 + All Files 순으로
   제공. 열기 모드 전용(저장/폴더/단일 필터는 CEF 기본 동작 유지), 멀티선택 지원.

### 좌측 내비 최종 형태
```
 변경 전                    변경 후
 🖼 Image (I)              📥 Import File  (드래그앤드롭 P3)
 📂 Import SVG             📤 Export File  (P2에서 포맷 선택)
 💾 Export SVG
 📂 Import DXF
```

---

## 6부. 종합 요약
1. 요청 8종 중 7종 기지원, **TIFF만 UTIF.js로 추가** → P1에서 8종 완전 지원.
2. Import 3버튼 → 1버튼(디스패처), Export 1버튼(포맷 선택 다이얼로그 → 네이티브 저장창 1회).
3. **무피드백 결함**을 Toast로 해소 (P1 필수 포함).
4. DXF Export는 기존 G-code 기하 파이프라인 재사용으로 위험 최소화, R12 + 4엔티티로 라운드트립 보장.
