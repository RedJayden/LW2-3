import { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from '../useCanvasStore';

/**
 * @hook useDragDuplicate
 * @brief PowerPoint식 Ctrl+드래그 복제: 선택 도형을 Ctrl을 누른 채 드래그하면 원래 위치에
 *        정지 사본이 남고, 드래그 중인 도형이 새 위치로 이동한다.
 * @details [Design Pattern: Memento(위치 스냅숏)]
 *          - mouse:down(Ctrl+좌클릭, 도형 위) 시점에 활성 도형들의 "절대 좌표 사본"을 미리
 *            생성해 둔다. 첫 object:moving 이벤트 시점에는 이미 수 픽셀 이동한 뒤라, 그때
 *            만들면 사본이 원위치에서 어긋난다.
 *          - 첫 object:moving에서 Ctrl이 여전히 눌려 있으면 사본을 캔버스에 배치한다(가공
 *            제스처 1회당 1번). 드래그 없이 mouse:up 되면(=Ctrl+클릭 다중 선택) 사본은 폐기.
 *          - ActiveSelection 자식의 절대 위치는 getCenterPoint()(fabric v6: 그룹 변환 반영)로
 *            확정하고 사본은 center 원점으로 배치한다 — 기존 편집 로직(CanvasTopBar)이
 *            getCenterPoint/setPositionByOrigin 기반이라 원점 변경에 안전하다.
 *          - MatrixRepeater는 clone()이 커스텀 상태(sourceObjects 등)를 보존하지 못하므로
 *            복제 대상에서 제외한다(일반 이동으로 동작).
 */
export const useDragDuplicate = () => {
    const { canvas } = useCanvasStore();

    // useClipboardSystem.customProps와 동일 목록(+Dot/도형 의미 속성). isHairline/strokeUniform
    // 누락 시 복제본이 헤어라인 갱신 대상에서 빠져 선 굵기가 동결되는 버그가 있다 — 반드시 포함.
    const CLONE_PROPS = ['id', 'name', 'isPaper', 'isGridLine', 'isMeasurement', 'excludeFromExport', 'isGuide', 'isTemp', 'fillEnabled', 'strokeEnabled', 'fillOpacity', 'fillSettings', 'markPointTime', 'isHairline', 'strokeUniform', 'customData'];

    const armedRef = useRef(false);      // Ctrl+도형 위 mousedown으로 제스처가 시작됨
    const placedRef = useRef(false);     // 이번 제스처에서 사본을 이미 배치함
    const snapshotRef = useRef<fabric.Object[] | null>(null); // 원위치 정지 사본(미배치 상태)

    useEffect(() => {
        if (!canvas) return;

        /** @brief 복제본 이름 부여: Dot은 'Dot N' 연번, 그 외는 '기존이름 (Copy N)' (RecipeCanvas 매트릭스 분해와 동일 규칙) */
        const assignUniqueName = (cl: any, existing: Set<string>) => {
            if (cl.name && cl.name.startsWith('Dot ')) {
                let i = 1;
                while (existing.has(`Dot ${i}`)) i++;
                cl.name = `Dot ${i}`;
            } else {
                const base = cl.name || 'Object';
                let i = 1;
                while (existing.has(`${base} (Copy ${i})`)) i++;
                cl.name = `${base} (Copy ${i})`;
            }
            existing.add(cl.name);
        };

        const handleMouseDown = (e: any) => {
            armedRef.current = false;
            placedRef.current = false;
            snapshotRef.current = null;

            const evt = e.e as MouseEvent | undefined;
            if (!evt || !(evt.ctrlKey || evt.metaKey) || evt.button !== 0) return;
            if (!e.target) return; // 빈 캔버스: 러버밴드 선택에 양보
            if (useCanvasStore.getState().activeTool !== 'select') return;

            const actives = canvas.getActiveObjects();
            if (actives.length === 0) return;
            // MatrixRepeater는 clone으로 상태 보존이 안 되고, 잠긴 도형은 드래그 자체가 불가
            if (actives.some((o: any) => o.type === 'MatrixRepeater')) return;
            if (actives.some((o: any) => o.lockMovementX || o.lockMovementY)) return;

            armedRef.current = true;

            // 절대 좌표를 mousedown 시점에 확정한 정지 사본을 비동기로 준비
            Promise.all(actives.map(async (src: fabric.Object) => {
                const cl: any = await src.clone(CLONE_PROPS as any);
                const center = src.getCenterPoint(); // v6: 그룹(ActiveSelection) 변환 반영 절대 중심
                cl.set({ originX: 'center', originY: 'center', left: center.x, top: center.y });
                return cl as fabric.Object;
            })).then((clones) => {
                // 제스처가 이미 끝났으면(클릭만 하고 뗌) 폐기
                if (armedRef.current && !placedRef.current) snapshotRef.current = clones;
            }).catch(() => { snapshotRef.current = null; });
        };

        const handleObjectMoving = (e: any) => {
            if (!armedRef.current || placedRef.current) return;
            const evt = e.e as MouseEvent | undefined;
            if (!evt || !(evt.ctrlKey || evt.metaKey)) {
                // 드래그 시작 전에 Ctrl을 뗐으면 일반 이동으로 처리
                armedRef.current = false;
                return;
            }
            const clones = snapshotRef.current;
            if (!clones) return; // 사본이 아직 준비 전(비동기)이면 일반 이동으로 처리

            placedRef.current = true;
            snapshotRef.current = null;

            const existingNames = new Set(canvas.getObjects().map((o: any) => o.name).filter(Boolean) as string[]);
            clones.forEach((cl: any) => {
                assignUniqueName(cl, existingNames);
                canvas.add(cl);
                cl.setCoords();
            });
            canvas.requestRenderAll();
            // Undo 체크포인트는 드래그 종료 시 object:modified의 saveHistory가 남긴다
            // (object:added 경유로도 목록/히스토리 갱신이 전파됨).
        };

        const handleMouseUp = () => {
            armedRef.current = false;
            placedRef.current = false;
            snapshotRef.current = null;
        };

        canvas.on('mouse:down', handleMouseDown);
        canvas.on('object:moving', handleObjectMoving);
        canvas.on('mouse:up', handleMouseUp);
        return () => {
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('object:moving', handleObjectMoving);
            canvas.off('mouse:up', handleMouseUp);
        };
    }, [canvas]);
};
