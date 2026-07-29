import { useEffect, useMemo, useState } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from '../ui/pages/Recipe/Canvas/useCanvasStore';
import { resolveObjectColorHex } from '../utils/colorUtils';

export interface IColorGroup {
    color: string;
    objs: fabric.Object[];
}

/**
 * @hook useCanvasColorGroups
 * @brief 캔버스의 도형을 색상(레이어)별로 그룹화한 목록을 구독한다.
 * @details LayerList.tsx의 색상 그룹핑과 동일한 판정 기준(resolveObjectColorHex)을 쓰는
 *          경량 훅. Right Panel의 색상 프리셋 블록처럼 LayerList와 독립적으로 canvas 객체
 *          변화를 구독해야 하는 곳에서 재사용한다.
 */
export const useCanvasColorGroups = (): IColorGroup[] => {
    const canvas = useCanvasStore(s => s.canvas);
    const [objects, setObjects] = useState<fabric.Object[]>([]);

    useEffect(() => {
        if (!canvas) return;

        const update = () => {
            const objs = canvas.getObjects().filter((o: any) =>
                !o.isTemp && !o.isGuide && !o.isGridLine && !o.isPaper &&
                !o.isCrosshair && !o.isMeasurement && !o.customData?.isMatrixLabel &&
                !o.isProcessingMarker && o.type !== 'selection' && o.type !== 'activeSelection'
            );
            setObjects(objs);
        };

        update();
        const events = ['object:added', 'object:removed', 'object:modified'] as const;
        events.forEach(evt => canvas.on(evt as any, update));
        return () => { events.forEach(evt => canvas.off(evt as any, update)); };
    }, [canvas]);

    return useMemo(() => {
        const groups: Record<string, fabric.Object[]> = {};
        const order: string[] = [];
        objects.forEach((obj) => {
            const color = resolveObjectColorHex(obj);
            if (!groups[color]) { groups[color] = []; order.push(color); }
            groups[color].push(obj);
        });
        return order.map(color => ({ color, objs: groups[color] }));
    }, [objects]);
};
