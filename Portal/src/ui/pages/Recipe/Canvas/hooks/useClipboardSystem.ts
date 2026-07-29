import { useCallback, useRef } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from '../useCanvasStore';

export const useClipboardSystem = (saveHistory: () => void) => {
    const { canvas } = useCanvasStore();
    const clipboard = useRef<fabric.Object | null>(null);

    // [FIX] isHairline/strokeUniform 누락 시 복제본이 '헤어라인 2px/zoom 갱신' 대상에서 빠져
    // 복제 시점의 픽셀 굵기로 동결되는 선 굵기 버그가 발생합니다. 반드시 포함할 것.
    const customProps = ['id', 'name', 'isPaper', 'isGridLine', 'isMeasurement', 'excludeFromExport', 'isGuide', 'isTemp', 'fillEnabled', 'strokeEnabled', 'fillOpacity', 'fillSettings', 'markPointTime', 'isHairline', 'strokeUniform', 'customData'];

    const copy = useCallback(async () => {
        if (!canvas) return;
        const activeObject = canvas.getActiveObject();
        if (activeObject) {
            const cloned = await activeObject.clone(customProps);
            clipboard.current = cloned;
        }
    }, [canvas]);

    const paste = useCallback(async () => {
        if (!canvas || !clipboard.current) return;

        const clonedObj = await clipboard.current.clone(customProps);
        canvas.discardActiveObject();

        clonedObj.set({
            left: clonedObj.left! + 10,
            top: clonedObj.top! + 10,
            evented: true,
        });

        if (clonedObj instanceof fabric.ActiveSelection) {
            clonedObj.canvas = canvas;
            clonedObj.forEachObject((obj) => {
                canvas.add(obj);
            });
            clonedObj.setCoords();
        } else {
            canvas.add(clonedObj);
        }
        canvas.setActiveObject(clonedObj);

        canvas.requestRenderAll();
        saveHistory();
    }, [canvas, saveHistory]);

    const cut = useCallback(async () => {
        if (!canvas) return;
        const activeObject = canvas.getActiveObject();
        if (activeObject) {
            await copy();
            canvas.remove(activeObject);
            canvas.discardActiveObject();
            canvas.requestRenderAll();
            saveHistory();
        }
    }, [canvas, copy, saveHistory]);

    return { copy, paste, cut };
};
