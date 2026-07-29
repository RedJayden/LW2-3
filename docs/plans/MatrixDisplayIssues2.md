# 매트릭스 표시 이슈 2차 — 재편집 후 도형·인덱스 라벨 분리 / 확대 시 오버레이 소실 (2026-07-23)

> 실기 보고 2건에 대한 원인 분석 및 수정계획서. **승인 후 구현.**
> 선행: `docs/plans/MatrixDisplayIssues.md`(1차, 2026-07-22), `docs/plans/MatrixOwnership.md`(소유권 이동 모델),
> `docs/checkpoints/feature_Draw.md` §4.11(Flyweight/뷰포트 컬링), `docs/plans/ScannerIssue.md` §K(컬링 stale 캐시 전례).

---

## 1. 보고 증상

| # | 증상 | 재현 경로 |
|---|---|---|
| S1 | 매트릭스 생성 → 가공 → 매트릭스 설정(Edit) 재오픈 → 파라미터 변경 → Apply → 재가공을 반복하면, **셀 도형과 인덱스/Z-info 라벨(`(row,col) Z:xx.xxx`)의 위치가 서로 분리**되어 표시됨 (스크린샷: 라벨 열이 도형 열에서 수 mm 이탈) | 가공 ↔ 재편집 반복 |
| S2 | 배율을 올려 화면을 **확대하다 보면 매트릭스 셀 오버레이가 화면에서 사라짐** (실제로 셀이 화면 안에 있는데도) | S1 이후 줌 인 |

두 증상은 **동일한 근본 원인**(아래 §2)의 두 가지 발현이다.

---

## 2. 근본 원인 (코드 확정)

### 2.1 결함 사슬 요약

> **가공 커맨드 생성기가 매트릭스 `sourceObjects`의 `left/top`을 셀 절대좌표로 임시 이동(`setCoords()` 호출)했다가, 복원할 때는 `set()`만 하고 `setCoords()`를 호출하지 않는다.**
> fabric v7의 `getBoundingRect()`는 캐시된 `aCoords`를 그대로 사용하므로, 가공이 끝난 뒤 소스 도형의 `aCoords`는 **마지막 셀의 절대 scene 좌표에 고착**된다.
> 이후 매트릭스 설정 창을 열거나 파라미터를 변경하면 `updateMatrixInPlace()` → `updateBoundingBox()`가 이 **오염된 `getBoundingRect()`** 로 `_srcMinX/_srcMinY`(셀 로컬 앵커)를 재계산하고, 이 값을 공유하는 **라벨 위치·뷰포트 컬링 AABB·Flyweight 비트맵 앵커**가 일제히 어긋난다.

### 2.2 증거 (파일:라인)

**(a) 임시 이동 후 복원 시 `setCoords()` 누락 — Scanner 모드**
`Portal/src/services/ScannerGenerator.ts` MatrixRepeater 분기:

```ts
// :490-493  셀마다 소스를 절대 scene 좌표로 임시 이동
const curLeft = src.left;
const curTop = src.top;
src.set({ left: curLeft + dx, top: curTop + dy });
src.setCoords();                       // ← aCoords = "이동된(절대) 위치"
...
await this.generatePass([src], subOptions, commands, context, 0);   // :512 (비동기)
...
src.set({ left: curLeft, top: curTop });   // :521 ← 복원. 그러나 setCoords() 없음!
```

마지막 셀 처리 후 `src.left/top`(및 `calcTransformMatrix()`)은 원위치로 돌아오지만, **`aCoords` 캐시는 마지막 셀의 절대좌표에 남는다.**

**(b) 동일 결함 — Object 모드**
`Portal/src/hooks/useGCodeGenerator.ts:1283-1286`(이동+`setCoords`) / `:1315`(복원, `setCoords` 없음).

**(c) fabric v7.2: `set()`은 `aCoords`를 무효화하지 않는다**
`Portal/node_modules/fabric/dist/index.mjs`:

```js
// :6212-6218
getCoords() { ... = this.aCoords || (this.aCoords = this.calcACoords()); }
// :6331-6332
getBoundingRect() { return makeBoundingBoxFromPoints(this.getCoords()); }
// :6452  ← 코드 전체에서 aCoords를 갱신하는 유일한 지점 = setCoords()
this.aCoords = this.calcACoords();
```

즉 `getBoundingRect()`는 마지막 `setCoords()` 시점의 좌표를 반환한다. (1차 계획서 §K에서 리피터 자신의 `left/top` 직접 대입으로 이미 한 번 겪었던 **동일 계열의 stale-캐시 함정**이 이번에는 소스 도형 쪽에서 재발한 것이다.)

**(d) 오염 소비 지점 — `updateBoundingBox()`**
`Portal/src/ui/pages/Recipe/Canvas/fabric/MatrixRepeater.ts:269-283`:

```ts
this.sourceObjects.forEach(obj => {
    const bound = obj.getBoundingRect();   // ← stale aCoords 소비
    minX = Math.min(minX, bound.left); ...
});
this._srcMinX = minX; this._srcMinY = minY;   // ← 셀 로컬 앵커 오염
```

호출 트리거: 매트릭스 다이얼로그 오픈/파라미터 변경 시 `MatrixDialog.tsx:129-139` → `useMatrixGenerator.updateMatrixInPlace():352-367` → `updateBoundingBox()`. 셀 오버라이드 편집(`applyOverride`) 경로도 동일.

**(e) 오염된 `_srcMinX/_srcMinY`의 3중 파급 — `drawObject()`**

| 소비처 | 위치 | 발현 증상 |
|---|---|---|
| Z-info 라벨 앵커 | `MatrixRepeater.ts:572` `fillText(..., _srcMinX * zoom, (_srcMinY - 2) * zoom)` | 라벨이 실제 도형에서 "마지막 셀 오프셋"만큼 이탈 → **S1**. (도형 자체는 `obj.render()`가 소스의 실제 변환행렬을 쓰거나, 비트맵이 오염 이전에 캐시된 경우 제 위치에 남음 → 라벨만 따로 노는 그림) |
| 뷰포트 컬링 AABB | `:488-497` `cellMinX = dx + _srcMinX ...` | 컬링 판정 사각형이 실제 셀 위치에서 이탈. **확대할수록 가시영역(local bounds)이 작아져**, 어긋난 AABB가 가시영역과 교차하지 않게 되는 순간 셀 렌더 전체(도형+라벨)가 `continue`로 스킵 → **S2**(축소하면 가시영역이 커져 다시 보임) |
| Flyweight 비트맵 앵커 | `ensureCache():427` `octx.translate(-(_srcMinX - PAD))` + blit `:507` | 재래스터 시 소스가 작은 오프스크린 캔버스 밖에 그려져 **빈 비트맵** → override 없는 셀이 통째로 안 보이는 부수 증상 가능 |

### 2.3 부수 결함 (같은 코드 블록, 함께 수정)

1. **예외 시 복원 누락**: `:493~521` 사이의 `await generatePass(...)`가 예외를 던지면(중단/해칭 오류 등) 복원 코드가 실행되지 않아 `src.left/top`이 **영구적으로 셀 절대좌표에 남는다**(fill/stroke/scale 임시 오버라이드도 동일). try/finally 부재.
2. **비동기 구간 중 공유 상태 노출**: `generatePass`가 `await`하는 동안 캔버스 렌더가 발생하면(특히 Object 모드는 가공 중에도 도형을 표시함 — `feature_Object.md`), 이동된 소스가 그대로 그려지거나 그 순간 `ensureCache()`가 돌면 오염된 비트맵이 캐시될 수 있다.

### 2.4 왜 "가공 후 재편집"에서만 나타나는가

- 가공 직후에는 `aCoords`만 오염된 잠복 상태다 — 렌더링(`obj.render`)은 `calcTransformMatrix()`(비캐시)를 쓰고, `_srcMinX`·비트맵은 가공 전 값 그대로라 화면은 정상.
- **매트릭스 설정 창을 여는 순간** `updateMatrixInPlace()`가 `updateBoundingBox()`를 호출하면서 잠복 오염이 `_srcMinX/_srcMinY`로 실체화되고, 비트맵도 무효화·재생성된다. 편집/Apply/재가공을 반복할수록 "마지막 셀 오프셋"이 회차마다 다른 방향으로 갱신되어 라벨 이탈량이 계속 변한다(실기 관찰과 일치).

---

## 3. 수정 계획

### P1 — 생성기 복원 무결성 (근본 수정, Scanner/Object 대칭)

| # | 파일 | 수정 |
|---|---|---|
| P1-1 | `Portal/src/services/ScannerGenerator.ts` (매트릭스 분기 `:486-522`) | 셀별 임시 변경(위치/fill/stroke/fillSettings/scale)을 **try/finally**로 감싸고, finally에서 원복 후 **`src.setCoords()` 호출**. [Design Pattern: Scoped Guard — 예외 경로 포함 원상 복구 보장] |
| P1-2 | `Portal/src/hooks/useGCodeGenerator.ts` (매트릭스 분기 `:1283-1315`) | 동일 수정 (Scanner/Object 대칭 유지 — 1차 §6.9 재발 교훈) |

### P2 — SSOT 방어선: `updateBoundingBox()`가 stale 캐시에 면역이 되게

| # | 파일 | 수정 |
|---|---|---|
| P2-1 | `Portal/src/ui/pages/Recipe/Canvas/fabric/MatrixRepeater.ts` `updateBoundingBox()` | `getBoundingRect()` 호출 전에 `obj.setCoords()`를 명시 호출(또는 `calcTransformMatrix()` 기반 bbox 직접 계산 — `useMatrixGenerator.getSceneTopLeft`와 동일 방식). sourceObjects는 소수(대개 1개)라 비용 무시 가능. 어떤 외부 코드가 `set()`만 하고 지나가도 앵커 오염이 재발하지 않는 최종 방어선. |

### P3 — (선택) 비동기 생성 중 공유 소스 노출 완화

- 근본적으로는 소스를 이동하지 않고 **오프셋을 인자로 전달**하거나 셀 변환을 합성한 임시 행렬로 생성하는 것이 맞으나, `generatePass`/`FabricToPaperAdapter` 파이프라인 전반의 시그니처 변경이 필요해 회귀 위험 대비 이득이 작다.
- 이번 라운드는 P1(try/finally + setCoords)로 "종료 시 무결성"만 보장하고, 비동기 구간 중 일시 노출(가공 중 렌더)은 Scanner 모드에서는 오버레이 숨김이 이미 가리고 있으므로 **보류**. Object 모드에서 가공 중 매트릭스가 순간 이동해 보이는 현상이 실기에서 확인되면 별도 라운드로 진행.

### 수정 대상 파일 요약

| 파일 | 항목 |
|---|---|
| `Portal/src/services/ScannerGenerator.ts` | P1-1 |
| `Portal/src/hooks/useGCodeGenerator.ts` | P1-2 |
| `Portal/src/ui/pages/Recipe/Canvas/fabric/MatrixRepeater.ts` | P2-1 |

C++ 변경 없음 → `vite build` 후 `Bin\web` robocopy만으로 배포 가능.

---

## 4. 검증 계획 (리빌드 후 실기)

1. **S1 재현 시나리오**: 도형 1개 → 매트릭스 생성(라벨 ON, Cumulative Z) → Process Start(완주) → 매트릭스 설정 재오픈 → 행/열/간격 변경 → Apply → 재가공 → **라벨이 항상 각 셀 좌상단에 붙어 있는지**(이탈 없음) 확인. 편집↔가공 3회 이상 반복해도 유지.
2. **S2 재현 시나리오**: 위 상태에서 줌을 단계적으로 확대(100%→400%+) → 셀이 화면 안에 있는 한 **도형+라벨이 계속 표시**되는지, 팬으로 화면 밖에 내보내면 정상 컬링되는지 확인.
3. **가공 중단 경로**: 커맨드 생성 도중 실패/Stop 유발(예: 50만 초과 차단) 후 → 매트릭스 표시가 원위치인지(영구 이동 없음), 재편집 시 라벨 정상인지 확인 (P1 try/finally 검증).
4. **가공 좌표 회귀**: 원점에서 떨어진 위치의 매트릭스 가공 → 타각 위치 = 오버레이 위치(§6.9 회귀 없음). Scanner/Object 양쪽 모드에서 View Commands 좌표 확인.
5. **셀 오버라이드 회귀**: 셀 X/Y/Z/크기 오버라이드 편집 → 바운딩 확장·표시·가공 반영(1차 §K 회귀 없음).
6. **성능**: 100×100 매트릭스 팬/줌 인터랙션이 기존과 동일(P2-1의 setCoords는 소스 1개 대상).
7. `npm run typecheck` 신규 오류 0건, `vite build` 성공.

---

## 5. 구현 현황 (2026-07-23 승인 후 구현 완료)

| 항목 | 상태 | 내용 |
|---|---|---|
| P1-1 | ✅ | `ScannerGenerator.ts` 매트릭스 분기: 셀별 임시 변경(위치/스타일/스케일)을 try/finally로 감싸고, finally에서 원복 + **`src.setCoords()`**(aCoords 캐시 원위치 갱신). [Design Pattern: Scoped Guard] |
| P1-2 | ✅ | `useGCodeGenerator.ts` 매트릭스 분기: 동일 수정(Scanner/Object 대칭) |
| P2-1 | ✅ | `MatrixRepeater.updateBoundingBox()`: `getBoundingRect()` 호출 전 `obj.setCoords()` 명시 호출 — 어떤 외부 코드가 캐시를 오염시켜도 `_srcMinX/Y` 앵커가 무너지지 않는 최종 방어선 |
| P3 | 보류 | 계획대로 보류(비동기 생성 중 일시 노출은 Object 모드 실기 확인 시 별도 라운드) |
| 검증 | ✅ 빌드 | `tsc` 오류 총 67건 = 전부 기존 fabric 타이핑 부채(기준 68건, 신규 0건 — 수정 파일의 오류는 라인 이동만 있고 유형 동일). `vite build` 성공, `dist → Bin\web` robocopy 배포 완료. C++ 무변경 |
| 검증 | ⬜ 실기 | §4의 실기 시나리오(편집↔가공 반복 라벨 정합, 줌 인 표시 유지, 중단 경로, 가공 좌표/오버라이드 회귀, 100×100 성능)는 장비에서 수행 대기 |

---
최종 작성일: 2026-07-23 (계획 → 승인 → 구현 완료)
담당: Claude (AI Coding Assistant)
