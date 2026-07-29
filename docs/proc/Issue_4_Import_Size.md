# 4. Image, SVG, DXF 파일 Load 시 화면 스케일(Scale) 오차 해결

## 3인의 전문가 분석 (Tree of Thought)

### Expert 1: UI/UX 개발자 (React/Fabric.js)
**원인 분석:**
외부 에셋(Image, SVG, DXF)을 Canvas에 Import할 때 파일들은 내재된 픽셀(Pixel) 값이나 도면 단위(Units)를 가집니다. 현재 시스템은 캔버스 내부 논리 픽셀과 실제 밀리미터(mm) 간의 환산 비율(`pxPerMm`)을 사용 중입니다. 
하지만 Import 로직(`fabric.loadSVGFromURL`, `fabric.Image.fromURL` 등)에서 새로 생성된 객체의 `scaleX`, `scaleY`를 화면의 `pxPerMm` 스케일에 맞게 변환 적용해주지 않아 파일이 원본 대비 아주 작거나 크게 (주로 1px = 1mm로 간주되어 작게) 표시되는 것입니다.

**해결 방안:**
Import 후 객체를 캔버스에 추가하기 전에 `pxPerMm` (예: 1mm당 1000px 등) 비율을 곱해주어 스케일업(Scale-Up) 처리를 수행합니다.

### Expert 2: CAD/CAM 데이터 파싱 전문가
**원인 분석:**
특히 DXF 파일과 SVG 파일은 내부에 저장된 Unit(단위)가 있습니다(SVG는 `viewBox`나 `width/height` 속성에 pt, mm, px 명시. DXF는 Header에 $INSUNITS 값 존재).
단순히 `pxPerMm` 비율만 곱하면 원본 설계자가 mm 단위로 작업했는지, inch로 작업했는지에 따라 오차가 생길 수 있습니다. 현재 로드된 객체들이 엄청 작게 나온다는 것은 1 Unit을 1 Pixel로 그대로 캔버스에 맵핑했기 때문일 확률이 매우 높습니다 (실제 물리 캔버스는 1mm당 수천 px를 가질 수 있음).

**해결 방안:**
SVG/DXF Import 유틸리티 파일(`ImportSVG.ts`, `ImportDXF.ts` 등)에서 파일을 파싱하여 Fabric 객체 그룹(Group)으로 반환할 때, `useAppStore`나 현재 활성화된 화면의 `pxPerMm.x`, `pxPerMm.y` 값을 가져와 전체 그룹 객체에 `.scale(pxPerMm.x)` 처리를 해줍니다. 이미지(Image)의 경우도 사용자가 지정한 물리적 크기나 기본 해상도(DPI)에 따른 mm 변환 팩터를 적용해야 합니다.

### Expert 3: 시스템 아키텍트
**종합 의견:**
Expert 2의 지적대로 "원래 저장된 사이즈(설계도 크기)"로 보이려면, 도면 데이터의 1단위(일반적으로 1mm)가 우리 캔버스 뷰어 상에서 몇 픽셀로 표현되어야 하는지(`pxPerMm`) 매칭 시켜주는 파이프라인 정립이 필요합니다. 
현재 Canvas 시스템의 좌표계 아키텍처에 맞추어 모든 외부 파일 로더 후처리(Post-processing) 단계에서 `객체 스케일 = 원본 스케일 * pxPerMm` 로직을 공통으로 적용하는 모듈화된 스케일링 함수를 도입하는 것이 시스템 안정성을 위해 좋습니다.

## 수정 계획 (Plan)
1. **Frontend (Import 로직 수정)**:
   - `Canvas`의 Import 핸들러(SVG, DXF, Image Load 함수들) 내에서 파일 로드 직후 캔버스에 추가(`canvas.add()`)하기 전에 현재 뷰의 `pxPerMm` 값을 구합니다.
   - 로드된 객체 혹은 그룹에 대해 `obj.scaleX = pxPerMm.x`, `obj.scaleY = pxPerMm.y`를 설정하여 캔버스 상에서 물리적 크기(mm)가 원래 도면의 mm 크기와 1:1 매칭되도록 뷰잉 사이즈를 키워줍니다.
   - 캔버스 정중앙 렌더링 후 `canvas.renderAll()` 호출.

## 진행 결과 (Result)
* `canvasImportExport.ts`와 `dxfImport.ts`에서 Import된 객체를 캔버스에 추가할 때 `scaleX` 및 `scaleY`에 현재 뷰의 `pxPerMm` 값을 대입하여 화면상 1단위가 실제 1mm가 되도록 스케일업(Scale-Up) 완료.
* 이미지 파일 로드(`Toolbar.tsx`) 시 기본 크기를 10mm 기준으로 로드되도록 `pxPerMm` 스케일 보정 추가.
* **Status**: 해결 완료 (Done)
