import * as fabric from 'fabric';
import { useCanvasStore } from '../ui/pages/Recipe/Canvas/useCanvasStore';
import { useAppStore } from '../store/appStore'; // [NEW] Get machine position
import { MatrixRepeater } from '../ui/pages/Recipe/Canvas/fabric/MatrixRepeater';

export interface MatrixOptions {
    xCount: number;
    yCount: number;
    xSpacing: number; // in mm
    ySpacing: number; // in mm
    useZOffset: boolean;
    zOffset: number; // in mm
    type: 'oneWay' | 'zigzag';
    showLabels: boolean; // [NEW] Show numbering and Z offset info
}

/** @brief 편집(Edit) 모드 진입 시 Cancel 롤백을 위해 저장하는 리피터 속성 스냅숏 */
export interface MatrixSnapshot {
    xCount: number;
    yCount: number;
    xSpacing: number; // px
    ySpacing: number; // px
    zStep: number;
    isZigzag: boolean;
    left: number;
    top: number;
}

/**
 * @brief 오브젝트의 originX/originY(center 등)와 무관한 scene 좌표계 상의 축정렬 경계상자 좌상단을 구한다.
 * @details [Design Pattern: 없음] `obj.left/top`은 origin에 따라 center/left 등으로 의미가
 *          달라지지만, `calcTransformMatrix()`로 로컬 코너(±width/2, ±height/2)를 변환하면
 *          origin·회전·스케일과 무관하게 항상 동일한 scene 좌표계의 좌상단을 얻을 수 있다.
 *          (CanvasTopBar.tsx의 getGroupLogicalSize와 동일한 방식)
 * @param obj 대상 fabric 오브젝트
 * @return scene 좌표계 기준 축정렬 경계상자 좌상단 {x, y}
 */
const getSceneTopLeft = (obj: fabric.Object): { x: number; y: number } => {
    const halfW = (obj.width || 0) / 2;
    const halfH = (obj.height || 0) / 2;
    const corners = [
        new fabric.Point(-halfW, -halfH),
        new fabric.Point(halfW, -halfH),
        new fabric.Point(halfW, halfH),
        new fabric.Point(-halfW, halfH)
    ];
    const matrix = obj.calcTransformMatrix();
    let minX = Infinity, minY = Infinity;
    corners.forEach(p => {
        const t = fabric.util.transformPoint(p, matrix);
        if (t.x < minX) minX = t.x;
        if (t.y < minY) minY = t.y;
    });
    return { x: minX, y: minY };
};

/**
 * [소유권 이동 모델 — MatrixOwnership.md, 2026-07-21 승인]
 * 매트릭스 생성은 원본을 clone(복제)하지 않고 캔버스에서 떼어(remove) 리피터 안으로
 * "이동(move)"시킨다. 도형은 항상 정확히 한 곳(캔버스 또는 리피터 내부)에만 존재하므로,
 * 구 복제 모델의 "은닉 원본 + 사본" 이중 상태에서 비롯된 이중 표시/이중 가공/비동기
 * clone 경쟁(세대 토큰이 방어하던 문제들)이 구조적으로 사라진다. clone이 없어
 * generateMatrix()는 동기 함수가 되었고 세대 토큰도 폐기되었다.
 * Cancel 복원을 위해 이동 시점의 절대 변환을 스냅숏(ISourceRestoreEntry[])으로 리피터의
 * 런타임 전용 필드(__sourceRestore — toObject 직렬화 대상 아님)에 보관한다.
 */
interface ISourceRestoreEntry {
    obj: fabric.Object;
    left: number;      // 이동 전 scene 중심 X (qrDecompose translateX)
    top: number;       // 이동 전 scene 중심 Y (qrDecompose translateY)
    scaleX: number;
    scaleY: number;
    angle: number;
    skewX: number;
    skewY: number;
}

export const useMatrixGenerator = () => {
    /**
     * @brief 현재 다이얼로그 세션에서 생성된 "프리뷰" 리피터만 제거한다.
     * @details [소유권 이동 모델] Cancel(isCancelling=true) 시에는 제거되는 프리뷰 리피터의
     *          `__sourceRestore` 스냅숏으로 이동됐던 원본 도형들을 캔버스에 되돌린다
     *          (이동 전 절대 변환으로 복원 — 시각적으로 동일한 위치/크기/회전).
     *          이미 확정된(비-preview) 매트릭스는 Cancel 경로에서 절대 삭제되지 않는다.
     *          구 복제 모델의 은닉 원본 플래그(isMatrixOriginal/isPreviewingOriginal) 복원
     *          루프는 과거 세이브/Undo 상태와의 호환을 위한 무해한 정리로만 유지한다.
     * @param canvas 대상 캔버스
     * @param targetSessionId 지정 시 해당 세션의 프리뷰만 제거 (미지정 시 모든 프리뷰)
     * @param isCancelling true면 이동됐던 원본 도형을 캔버스로 복귀시킨다
     */
    const clearMatrix = (canvas: fabric.Canvas, targetSessionId?: string, isCancelling = false) => {
        const objects = canvas.getObjects();
        const toRemove: MatrixRepeater[] = [];
        objects.forEach(obj => {
            const data = (obj as any).get?.('customData') || (obj as any).customData;
            if (!data || !data.isPreview) return;
            if (targetSessionId && data.matrixSessionId !== targetSessionId) return;
            if (obj instanceof MatrixRepeater) toRemove.push(obj);
        });
        toRemove.forEach(obj => canvas.remove(obj));

        if (isCancelling) {
            // [이동 모델] 제거한 프리뷰 리피터 안에 있던 원본들을 스냅숏 값으로 캔버스에 복귀.
            let lastRestored: fabric.Object | null = null;
            toRemove.forEach(rep => {
                const restore = (rep as any).__sourceRestore as ISourceRestoreEntry[] | undefined;
                if (!restore) return;
                restore.forEach(entry => {
                    entry.obj.set({
                        originX: 'center',
                        originY: 'center',
                        left: entry.left,
                        top: entry.top,
                        scaleX: entry.scaleX,
                        scaleY: entry.scaleY,
                        angle: entry.angle,
                        skewX: entry.skewX,
                        skewY: entry.skewY,
                        visible: true
                    });
                    entry.obj.setCoords();
                    canvas.add(entry.obj);
                    lastRestored = entry.obj;
                });
                (rep as any).__sourceRestore = undefined;
            });
            // 단일 원본이면 복귀 후 다시 선택 상태로 되돌려 UX 연속성을 준다.
            if (lastRestored && toRemove.length === 1) {
                canvas.setActiveObject(lastRestored);
            }

            // [레거시 정리] 구 복제 모델이 남긴 은닉 원본이 있으면 가시성 복원(무해한 호환 처리).
            objects.forEach(obj => {
                const data = (obj as any).customData;
                if (!data || !data.isMatrixOriginal || !data.isPreviewingOriginal) return;
                if (targetSessionId && data.matrixSessionId !== targetSessionId) return;

                obj.visible = true;
                obj.set('excludeFromExport', false);
                const newData = { ...data };
                delete newData.isPreviewingOriginal;
                delete newData.isMatrixOriginal;
                delete newData.matrixSessionId;
                obj.set('customData', newData);
            });
        }

        canvas.requestRenderAll();
    };

    const reverseDirection = (obj: fabric.Object) => {
        if (obj.type === 'line') {
            const line = obj as fabric.Line;
            const x1 = line.x1, y1 = line.y1;
            const x2 = line.x2, y2 = line.y2;
            // [FIX] Physical swap of internal points
            line.set({ x1: x2, y1: y2, x2: x1, y2: y1 });
            line.setCoords();
        } else if (obj.type === 'group' || obj.type === 'activeSelection') {
            // [NEW] Recursive support for Group/Selection
            const group = obj as (fabric.Group | fabric.ActiveSelection);
            const items = group.getObjects();
            items.forEach(child => reverseDirection(child));
        }
    };

    /**
     * @brief 선택된 도형을 원본으로 삼아 새 MatrixRepeater 프리뷰/확정 오브젝트를 생성한다("생성" 모드 전용).
     * @details [Design Pattern: 소유권 이동(move semantics) — MatrixOwnership.md 승인안]
     *          원본을 clone 하지 않고 캔버스에서 떼어(remove) 리피터의 sourceObjects로 "이동"시킨다.
     *          - 도형이 두 곳(은닉 원본 + 사본)에 동시에 존재하지 않으므로 이중 표시/이중 가공이
     *            구조적으로 불가능하다(구 모델의 은닉 플래그·Apply 시 원본 제거 단계 폐기).
     *          - clone이 없어 동기 함수다 — 대형 DXF에서의 비동기 경쟁(세대 토큰)도 함께 소멸.
     *          - 같은 세션의 프리뷰 리피터가 이미 있으면 재생성하지 않고 updateMatrixInPlace()로
     *            옵션만 갱신한다(프리뷰가 매트릭스 크기와 무관하게 O(1)).
     *          - Cancel 복원용으로 이동 시점의 절대 변환을 __sourceRestore(런타임 전용, 직렬화
     *            제외)에 보관한다.
     *          origin(center 등)에 무관한 scene 좌상단(`getSceneTopLeft`)을 리피터 배치 기준으로
     *          사용하고, 각 원본은 qrDecompose로 절대 변환을 분해해 "리피터 좌상단=원점"의 셀
     *          프레임으로 정규화한다(단일/다중 선택 공통 경로 — 단일 DXF 좌상단 이탈 버그의
     *          qrDecompose 해법 유지).
     * @param canvas 대상 캔버스
     * @param options 매트릭스 옵션(X/Y 개수·간격·Z오프셋·타입)
     * @param isPreview true면 미리보기(선택 불가, 세션 종료 시 제거 가능), false면 즉시 확정
     * @param sessionId 이 생성 작업이 속한 다이얼로그 세션 ID (Cancel/Apply 스코프 한정에 사용)
     */
    const generateMatrix = (canvas: fabric.Canvas, options: MatrixOptions, isPreview = false, sessionId?: string) => {
        const { pxPerMm } = useCanvasStore.getState();
        const matrixSessionId = sessionId || `mtx_session_${performance.now()}`;

        // [이동 모델] 같은 세션의 프리뷰 리피터가 이미 있으면(다이얼로그의 옵션 변경 재호출)
        // 원본은 이미 리피터 안에 있으므로 속성만 in-place 갱신하고 끝낸다.
        const existing = canvas.getObjects().find(o =>
            o instanceof MatrixRepeater &&
            (o as any).customData?.isPreview &&
            (o as any).customData?.matrixSessionId === matrixSessionId
        ) as MatrixRepeater | undefined;
        if (existing) {
            updateMatrixInPlace(canvas, existing, options);
            return;
        }

        const activeObject = canvas.getActiveObject();
        if (!activeObject) return;
        // 편집(기존 매트릭스)은 updateMatrixInPlace() 경로가 담당한다 — 여기로 오면 무시.
        if ((activeObject as any).type === 'MatrixRepeater') return;

        const pxSpacingX = options.xSpacing * pxPerMm.x;
        const pxSpacingY = options.ySpacing * pxPerMm.y;

        // [FIX] origin(center 등)과 무관한 scene 좌상단을 리피터 배치 기준으로 사용
        const topLeft = getSceneTopLeft(activeObject);

        // [이동] 원본(단일 또는 다중 선택의 자식들)의 절대 변환을 선택 상태에서 먼저 캡처한 뒤,
        // 선택을 해제하고 캔버스에서 떼어 셀 프레임으로 정규화해 리피터 소유로 옮긴다.
        const items: fabric.Object[] = (activeObject.type || '').toLowerCase() === 'activeselection'
            ? [...(activeObject as fabric.ActiveSelection).getObjects()]
            : [activeObject];
        const absList = items.map(o => fabric.util.qrDecompose(o.calcTransformMatrix()));

        canvas.discardActiveObject();

        const sourceObjects: fabric.Object[] = [];
        const restore: ISourceRestoreEntry[] = [];
        items.forEach((o, i) => {
            const abs = absList[i];
            restore.push({
                obj: o,
                left: abs.translateX,
                top: abs.translateY,
                scaleX: abs.scaleX,
                scaleY: abs.scaleY,
                angle: abs.angle,
                skewX: abs.skewX,
                skewY: abs.skewY
            });

            canvas.remove(o);
            // 셀 프레임 정규화: 리피터 좌상단(topLeft)을 원점으로, 절대 중심 기준(origin center) 배치.
            o.set({
                originX: 'center',
                originY: 'center',
                left: abs.translateX - topLeft.x,
                top: abs.translateY - topLeft.y,
                scaleX: abs.scaleX,
                scaleY: abs.scaleY,
                angle: abs.angle,
                skewX: abs.skewX,
                skewY: abs.skewY,
                visible: true // 리피터 내부 렌더링을 위해 항상 보이게
            });
            o.setCoords();
            sourceObjects.push(o);
        });

        const repeater = new MatrixRepeater({
            sourceObjects: sourceObjects,
            xCount: options.xCount,
            yCount: options.yCount,
            xSpacing: pxSpacingX,
            ySpacing: pxSpacingY,
            zStep: options.useZOffset ? options.zOffset : 0,
            isZigzag: options.type === 'zigzag',
            pxPerMm: pxPerMm,
            showLabels: options.showLabels,
            left: topLeft.x,
            top: topLeft.y,
            originX: 'left',
            originY: 'top'
        });

        const matrixCount = canvas.getObjects().filter(o => o.name?.startsWith('Matrix Group')).length + 1;
        repeater.set('name', `Matrix Group ${matrixCount}`);

        repeater.set('customData', {
            isMatrixChild: true,
            isPreview: isPreview,
            matrixSessionId: matrixSessionId,
            matrixId: `mtx_${performance.now()}`
        });

        // Cancel 복원용 스냅숏(런타임 전용 — toObject 직렬화 대상 아님)
        (repeater as any).__sourceRestore = restore;

        // If it's a preview, we can't select it. If it's applied, we can.
        repeater.set({
            selectable: !isPreview,
            evented: true // must be true so we can catch clicks for sub-targeting
        });

        canvas.add(repeater);
        if (!isPreview) {
            canvas.setActiveObject(repeater);
            (repeater as any).__sourceRestore = undefined; // 즉시 확정 — 복원 스냅숏 불필요
        }

        canvas.requestRenderAll();
    };

    /**
     * @brief 프리뷰로 생성된 MatrixRepeater를 확정(Apply)한다.
     * @details [소유권 이동 모델] 원본은 이미 리피터 내부로 이동되어 있으므로 "원본 제거" 단계가
     *          존재하지 않는다 — 확정은 프리뷰 플래그 해제 + 선택 가능 전환뿐이다(구 복제 모델의
     *          세션 ID 기반 원본 탐색·제거와 그 누수 가능성이 통째로 사라짐). Cancel 복원용
     *          스냅숏(__sourceRestore)은 더 이상 필요 없으므로 폐기한다.
     *          구 복제 모델이 남긴 은닉 원본(isMatrixOriginal)이 과거 세이브/Undo 상태로부터
     *          유입되어 있으면 여기서 함께 정리한다(레거시 호환 안전망).
     *          확정은 의미 있는 단일 변경이므로 object:modified를 발행해 Undo 체크포인트를 남긴다.
     * @param canvas 대상 캔버스
     * @param sessionId 지정 시 해당 세션에 속한 오브젝트만 확정 (미지정 시 전체 프리뷰 대상)
     */
    const commitMatrix = (canvas: fabric.Canvas, sessionId?: string) => {
        const objects = canvas.getObjects();

        // [레거시 정리] 구 복제 모델의 은닉 원본이 남아 있으면 제거(현 모델에서는 생성되지 않음).
        const legacyOriginals = objects.filter(obj => {
            const data = (obj as any).customData;
            return data?.isMatrixOriginal && (!sessionId || data.matrixSessionId === sessionId || data.isPreviewingOriginal);
        });
        legacyOriginals.forEach(obj => canvas.remove(obj));

        // 프리뷰 리피터를 확정(선택 가능 + 비-preview)으로 전환.
        objects.forEach(obj => {
            const data = (obj as any).customData;
            if (data?.isPreview && (!sessionId || data.matrixSessionId === sessionId)) {
                obj.set({
                    selectable: true,
                    evented: true
                });
                obj.set('customData', { ...data, isPreview: false });
                (obj as any).__sourceRestore = undefined; // 확정 — 복원 스냅숏 폐기

                // Set as active object
                canvas.setActiveObject(obj);
            }
        });

        canvas.requestRenderAll();
        // Undo 체크포인트: "매트릭스 생성 확정" 단일 이벤트.
        canvas.fire('object:modified', {} as any);
    };

    /**
     * @brief 이미 확정된 MatrixRepeater의 배열 속성을 새 오브젝트 생성/원본 은닉 없이 즉시 갱신한다("편집" 모드 전용).
     * @details [Design Pattern: 없음] 확정된 매트릭스를 재선택해 다이얼로그를 다시 여는 경우
     *          `generateMatrix()`를 타면 기존 매트릭스가 새 원본으로 오인되어 Cancel 시 삭제되는
     *          버그가 있었다. 이 함수는 기존 인스턴스를 in-place로 수정하므로 그런 위험이 없다.
     * @param canvas 대상 캔버스
     * @param repeater 편집 대상 MatrixRepeater 인스턴스
     * @param options 새 매트릭스 옵션
     */
    const updateMatrixInPlace = (canvas: fabric.Canvas, repeater: MatrixRepeater, options: MatrixOptions) => {
        const { pxPerMm } = useCanvasStore.getState();
        repeater.set({
            // [방어] 어떤 진입점이든 배열 개수는 1~100으로 강제(생성자 클램프와 동일 규약)
            xCount: MatrixRepeater.clampCount(options.xCount),
            yCount: MatrixRepeater.clampCount(options.yCount),
            xSpacing: options.xSpacing * pxPerMm.x,
            ySpacing: options.ySpacing * pxPerMm.y,
            zStep: options.useZOffset ? options.zOffset : 0,
            isZigzag: options.type === 'zigzag',
            showLabels: options.showLabels
        });
        repeater.updateBoundingBox();
        repeater.setCoords();
        canvas.requestRenderAll();
    };

    /** @brief 편집 모드 진입 시점의 리피터 속성을 스냅숏으로 저장한다(Cancel 롤백용). */
    const snapshotMatrix = (repeater: MatrixRepeater): MatrixSnapshot => ({
        xCount: repeater.xCount,
        yCount: repeater.yCount,
        xSpacing: repeater.xSpacing,
        ySpacing: repeater.ySpacing,
        zStep: repeater.zStep,
        isZigzag: repeater.isZigzag,
        left: repeater.left || 0,
        top: repeater.top || 0
    });

    /** @brief 편집 모드 Cancel 시 스냅숏 값으로 리피터 속성을 원복한다. */
    const restoreMatrixSnapshot = (canvas: fabric.Canvas, repeater: MatrixRepeater, snapshot: MatrixSnapshot) => {
        repeater.set({
            xCount: snapshot.xCount,
            yCount: snapshot.yCount,
            xSpacing: snapshot.xSpacing,
            ySpacing: snapshot.ySpacing,
            zStep: snapshot.zStep,
            isZigzag: snapshot.isZigzag,
            left: snapshot.left,
            top: snapshot.top
        });
        repeater.updateBoundingBox();
        repeater.setCoords();
        canvas.requestRenderAll();
    };

    return { generateMatrix, clearMatrix, commitMatrix, updateMatrixInPlace, snapshotMatrix, restoreMatrixSnapshot };
};
