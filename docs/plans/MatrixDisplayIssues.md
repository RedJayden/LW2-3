# 매트릭스 표시 3종 이슈 — 원인 분석 및 수정계획서 (2026-07-22)

> 소유권 이동 모델(MatrixOwnership.md) 적용 후 실기에서 매트릭스 **표시/썸네일/Z 라벨** 3종 이슈가 보고됨. 3인 전문가가 분석하고 수정 방향을 확정한다.
> **이 문서는 수정계획서다. 승인 후 구현.**

## 실기 보고 요약

1. **비원점 매트릭스 미표시**: 해마 DXF 로드 후 2×2 매트릭스 생성 시, 스테이지 X/Y가 (0,0)이면 셀 오버레이가 즉시 보이나, **(0,0)이 아닌 위치**(예: X=-5.165)에서 생성하면 **2×2 도형이 캔버스에 안 보인다**. Left Nav의 object들에 마우스 hover하면 그제서야 캔버스에 도형이 나타난다.
2. **Left Nav 썸네일이 점으로 표시**: Matrix Group 및 그 자식 object들의 썸네일이 없거나 모두 **회색 원형 점**으로 표시된다. **도형 모양 썸네일**이 나와야 하고, 다른 도형들도 모두 알맞게 표시되어야 한다.
3. **셀 Z 라벨 실시간 변동**: Z-Axis Cumulative Offset을 설정하고 가공하면, 각 셀 위의 `Z: xx.xxx` 라벨이 **전부 현재 Z축 위치를 실시간 반영해 변한다**(가공 중 Z가 셀마다 이동하므로 모든 라벨이 흔들림). 불합리하다.

---

## 전문가 1 (Fabric 렌더링) — 이슈 1: 비원점 생성 시 미표시

### 근본 원인 (코드 확정)

`MatrixRepeater.drawObject()`는 성능을 위해 **두 단계 최적화**를 쓴다:
- **Flyweight 비트맵 캐시**(`ensureCache()`, `MatrixRepeater.ts:413~`): override 없는 "평범한" 셀은 소스 도형을 오프스크린 캔버스에 1회 래스터화한 `_matrixCellBitmap`을 `ctx.drawImage`로 blit한다.
- **뷰포트 컬링**(`getVisibleLocalBounds()` + 셀 AABB 비교, `:487~`): 화면 밖 셀은 그리지 않는다. 이 판정은 `this.calcTransformMatrix()`(리피터의 left/top 포함 변환)에 의존한다.

**소유권 이동 모델과의 상호작용**: 생성 직후 리피터는 비원점 `topLeft`에 배치되는데, `canvas.add()` 직후의 **첫 렌더 시점에 리피터의 변환행렬/좌표(aCoords)나 셀 비트맵 캐시가 아직 최신이 아니어서**:
- 뷰포트 컬링이 stale 변환으로 로컬 가시영역을 잘못 계산 → **셀 전부가 화면 밖으로 컬링**(원점 근처면 우연히 영역 안이라 보이고, 비원점이면 벗어나 안 보임 → 비원점 의존성 설명), 또는
- 캐시가 비어/어긋난 상태로 blit되어 셀이 빈 채로 그려진다.

**hover가 고치는 이유(결정적 방증)**: Left Nav object에 hover하면 `overrides[cellKey].opacity=0.5`가 설정되고(`LayerList.tsx:741`) `requestRenderAll`이 호출된다. override가 생기면 그 셀은 **캐시 blit 경로를 우회해 정식 fabric 렌더**(`drawObject :465`의 `!hasOverride` 분기 탈락)를 타고, 동시에 재렌더로 변환행렬이 최신화되어 컬링도 정상화된다 → 그래서 hover 후 보인다.

### 수정 방향
- `useMatrixGenerator.generateMatrix()`에서 리피터를 `canvas.add()` 한 직후:
  1. `repeater.setCoords()` + 변환행렬 캐시 무효화(`dirty=true`) + `_matrixCellBitmap=null`(캐시 강제 재생성)로 첫 렌더가 최신 좌표/캐시를 쓰게 한다.
  2. 이동된 sourceObjects가 렌더 준비 상태가 되도록 각 소스에 `setCoords()`/`dirty=true`를 보장(이동 모델은 원본을 `canvas.remove` 후 재배치하므로 dirty/coords 초기화 필요).
  3. `requestRenderAll()`을 **다음 틱**(`requestAnimationFrame` 또는 `setTimeout(0)`)에 한 번 더 호출해, 레이아웃/좌표가 확정된 후의 렌더를 보장(첫 동기 렌더의 staleness 회피).
- 근본적으로는 `drawObject`의 컬링을 좌표 준비 전에는 건너뛰거나(`aCoords` 유효성 확인), `ensureCache`가 소스 미준비 시 캐시를 세우지 않도록 가드. 재현 계측(비원점에서 컬링 판정값·bitmap 유무 로그)으로 컬링 vs 캐시 중 실제 주범을 확정한 뒤 해당 지점을 교정.

---

## 전문가 2 (LayerList/썸네일) — 이슈 2: 점 썸네일

### 근본 원인 (코드 확정)

`ObjectIcon`(`LayerList.tsx:138`)은 `generateEnhancedThumbnail(obj)`가 반환한 dataURL이 비면 **회색 원형 점**(`:213`, `div … borderRadius:'50%'`)을 fallback으로 그린다. 매트릭스 관련 오브젝트에서 dataURL이 비는 이유:

- **Matrix Group 썸네일**: `generateEnhancedThumbnail`이 `obj.clone()`으로 복제하는데(`:41`), `MatrixRepeater`는 커스텀 `drawObject()`로 셀을 그리는 fabric.Group 서브클래스라 **일반 Group으로 복제되면 그리는 로직(drawObject)이 없어** `toDataURL()`이 **빈 이미지**가 된다(sourceObjects/속성을 주입해도 렌더 메서드가 없음). → 점.
- **매트릭스 자식(셀) 썸네일**: LayerList는 `getVirtualObjects()`가 만든 mock을 쓰는데, 이 함수는 circle/rect만 실제 mock을 만들고 **그 외(DXF/path/group)는 `new fabric.Object(commonProps)`**(`MatrixRepeater.ts:642`)라는 **빈 오브젝트**를 만든다 → 렌더 결과 없음 → 점.
- 단일 DXF(해마) 등 일반 도형은 `obj.clone()`이 path/group을 복제·`toDataURL`로 정상 렌더되지만(스크린샷상 단일 Object 1은 아이콘 표시됨), 위 매트릭스 경로만 빈 결과가 된다.

### 수정 방향
- **Matrix Group·자식 썸네일을 sourceObjects[0](실제 도형) 기준으로 생성**: `generateEnhancedThumbnail`에서 `obj.type==='MatrixRepeater'`(또는 자식 mock)일 때, 리피터 클론이 아니라 **sourceObjects[0]을 클론해 toDataURL** 한다(모든 셀은 동일 소스 도형이므로 하나의 썸네일로 충분). getVirtualObjects의 자식 mock도 실제 소스 도형을 표현하도록(clone) 하거나, LayerList가 자식 썸네일에 sourceObject를 직접 사용.
- **fallback 개선(보조)**: 소스 도형 렌더 실패 시 타입 기반 벡터 아이콘(사각/원/경로 등)로 대체해, 점(무의미)이 나오지 않게 한다. `getTypeLabel`이 이미 타입을 판별하므로 재사용.
- 회귀 확인: 단일 도형(circle/rect/path/text/image/dxf/svg) 썸네일이 모두 정상 표시되는지 검증(사용자가 "다른 도형들도 알맞게" 요구).

---

## 전문가 3 (좌표/상태) — 이슈 3: Z 라벨 실시간 변동 + QA

### 근본 원인 (코드 확정)
`drawObject()`가 셀 Z 라벨을 그릴 때 base Z로 **실시간 모션 Z**를 읽는다:
```ts
// MatrixRepeater.ts:462
const liveZ = this.showLabels ? useAppStore.getState().positions.Z : 0;
// :565
const absoluteZ = this.computeAbsoluteZ(cellIndex, override, liveZ); // = liveZ + zStep*i + override
```
가공 중에는 시퀀스가 셀마다 Z축을 이동시켜 `positions.Z`가 변하고, 그때마다 **모든 셀 라벨이 `liveZ + zStep*i`로 재계산되어 흔들린다**. (설계 시점엔 liveZ=현재 스테이지 Z라 라벨이 의미 있었지만, 가공 중엔 부적절.)

### 수정 방향
- **가공 중에는 base Z를 고정(freeze)한다**: 프로세스 시작 시점의 Z를 스냅숏(`processStartZ`)으로 저장하고, `drawObject`의 라벨 base Z를 `isProcessing ? processStartZ : positions.Z`로 사용. 설계 시점의 라이브 갱신은 보존하고 가공 중 흔들림만 제거.
  - 구현: `appStore`에 `processStartZ`(가공 시작 시 `positions.Z` 저장; `SinoGalvoProcessPanel.handleProcessStart`에서 `setLastProcessStartPosition`에 Z 추가) + 가공 상태 플래그. `drawObject`가 이를 읽어 base Z 선택.
- (대안·논의) 라벨을 아예 **설계 기준 Z(색상 프리셋 Z / Current Layer의 Z 필드)** 로 항상 고정하는 방법도 있으나, 사용자가 Z를 조그해 재설계할 때 라벨이 안 따라오는 단점 → **가공 중에만 freeze** 권장.

### 우선순위·리스크·검증
- **우선순위**: [P1] 이슈 1(핵심, 매트릭스가 안 보임) → [P1] 이슈 3(오해 소지, 저위험) → [P2] 이슈 2(썸네일, 사용성).
- **리스크**: 이슈 1은 렌더 최적화(캐시/컬링) 영역이라, 강제 재렌더/캐시 무효화가 대량 매트릭스(100×100) 성능에 영향 없도록 "생성 직후 1회"로 한정. 이슈 2는 썸네일 생성 비용이 소스 도형 1회로 오히려 감소. 이슈 3은 표시 전용이라 가공 로직 무관.
- **검증(리빌드 후)**:
  1. 비원점(X≠0)에서 2×2/큰 매트릭스 생성 → **hover 없이 즉시** 셀 표시. 원점에서도 정상 유지.
  2. Matrix Group·자식·단일 DXF/SVG/Image/기본도형 썸네일이 **도형 모양**으로 표시(점 없음).
  3. Cumulative Z 매트릭스 가공 중 셀 Z 라벨이 **고정**(설계값 유지), 가공 후에도 정상. 설계 시 Z 조그하면 라벨 갱신(freeze 아님).

### 수정 대상 파일 (예정)
| 파일 | 이슈 | 변경 |
|---|---|---|
| `Portal/src/hooks/useMatrixGenerator.ts` | 1 | 생성 직후 setCoords/캐시 무효화/다음 틱 재렌더, 소스 dirty/coords 보장 |
| `Portal/src/ui/pages/Recipe/Canvas/fabric/MatrixRepeater.ts` | 1,2 | 컬링/캐시 준비 가드(재현 계측 후), `getVirtualObjects` 자식 mock을 실제 소스 표현으로 |
| `Portal/src/ui/pages/Recipe/LayerList/LayerList.tsx` | 2 | `generateEnhancedThumbnail`이 MatrixRepeater/자식은 sourceObjects[0] 기준 렌더, fallback 타입 아이콘 |
| `Portal/src/ui/pages/Recipe/Canvas/fabric/MatrixRepeater.ts` + `appStore`/`SinoGalvoProcessPanel` | 3 | 라벨 base Z를 가공 중 `processStartZ`로 freeze |

---
최종 작성일: 2026-07-22
담당: Claude (AI Coding Assistant) — 수정계획서, 승인 후 구현
