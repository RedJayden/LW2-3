import { useEffect, useCallback } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from '../useCanvasStore';
import useAppStore from '@/store/appStore';
import { stageToScenePx } from '../utils/sceneCoords';

export const useCrosshair = (enableCameraCrosshair: boolean) => {
    const { canvas, showCross, zoom, viewMode, pxPerMm } = useCanvasStore();

    const drawWorldCross = useCallback(() => {
        if (!canvas) return;

        // 1. Check State & Prop
        const { showCross, crosshairOffset } = useCanvasStore.getState();

        const objects = canvas.getObjects();
        const existingCrosses = objects.filter(obj => (obj as any).isCrosshair);

        // If disabled or not permitted, stop here (after cleanup)
        if (!showCross || !enableCameraCrosshair) {
            if (existingCrosses.length > 0) {
                existingCrosses.forEach(obj => canvas.remove(obj));
                canvas.requestRenderAll();
            }
            return;
        }

        const vpt = canvas.viewportTransform;
        if (!vpt) return;

        const zoom = canvas.getZoom();
        const width = canvas.width!;
        const height = canvas.height!;

        // Calculate visible world bounds
        const visibleLeft = -vpt[4] / zoom;
        const visibleTop = -vpt[5] / zoom;
        const visibleRight = (width - vpt[4]) / zoom;
        const visibleBottom = (height - vpt[5]) / zoom;

        const pad = 1000 / zoom;
        const left = visibleLeft - pad;
        const right = visibleRight + pad;
        const top = visibleTop - pad;
        const bottom = visibleBottom + pad;

        const thickness = 1 / zoom;

        // Offset
        let ox = crosshairOffset.x;
        let oy = crosshairOffset.y;

        // [FIX] In ALL modes (Canvas, Scanner, Object), the crosshair must track the physical machine position!
        // The camera video is drawn at the physical stage coordinates, so the crosshair must be there too.
        const positions = useAppStore.getState().positions;
        const { pxPerMm } = useCanvasStore.getState();
        const scenePos = stageToScenePx(positions.X, positions.Y, pxPerMm);
        ox = scenePos.x;
        oy = scenePos.y;

        const hLine = existingCrosses.find(obj => obj.type === 'line' && (obj as fabric.Line).y1 === (obj as fabric.Line).y2) as fabric.Line | undefined;
        const vLine = existingCrosses.find(obj => obj.type === 'line' && (obj as fabric.Line).x1 === (obj as fabric.Line).x2) as fabric.Line | undefined;
        const circle = existingCrosses.find(obj => obj.type === 'circle') as fabric.Circle | undefined;
        const coordText = existingCrosses.find(obj => obj.type === 'text') as fabric.Text | undefined;

        if (hLine && vLine && circle) {
            // [FIX] Update existing objects instead of recreating them to eliminate memory leak
            hLine.set({ x1: left, y1: oy, x2: right, y2: oy, strokeWidth: thickness * 2 });
            vLine.set({ x1: ox, y1: top, x2: ox, y2: bottom, strokeWidth: thickness * 2 });
            circle.set({ left: ox, top: oy, strokeWidth: thickness * 2 });

            hLine.setCoords();
            vLine.setCoords();
            circle.setCoords();

            const positions = useAppStore.getState().positions;
            const textStr = `X: ${positions.X.toFixed(3)}\nY: ${positions.Y.toFixed(3)}`;
            if (coordText) {
                coordText.set({ text: textStr, left: ox + 25 / zoom, top: oy + 25 / zoom, fontSize: 14 / zoom });
                if (coordText.shadow) {
                    (coordText.shadow as fabric.Shadow).blur = 2 / zoom;
                    (coordText.shadow as fabric.Shadow).offsetX = 1 / zoom;
                    (coordText.shadow as fabric.Shadow).offsetY = 1 / zoom;
                }
                coordText.setCoords();
            } else {
                const newText = new fabric.Text(textStr, {
                    left: ox + 25 / zoom,
                    top: oy + 25 / zoom,
                    fontSize: 14 / zoom,
                    fill: '#FFD700',
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    selectable: false,
                    evented: false,
                    excludeFromExport: true,
                    shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.8)', blur: 2 / zoom, offsetX: 1 / zoom, offsetY: 1 / zoom })
                });
                (newText as any).isCrosshair = true;
                canvas.add(newText);
            }
        } else {
            // Re-create from scratch if not all parts exist
            existingCrosses.forEach(obj => canvas.remove(obj));

            // H-Line at Y=oy
            const newHLine = new fabric.Line(
                [left, oy, right, oy],
                { stroke: 'orange', strokeWidth: thickness * 2, selectable: false, evented: false, excludeFromExport: true, opacity: 0.8 }
            );
            (newHLine as any).isCrosshair = true;

            // V-Line at X=ox
            const newVLine = new fabric.Line(
                [ox, top, ox, bottom],
                { stroke: 'orange', strokeWidth: thickness * 2, selectable: false, evented: false, excludeFromExport: true, opacity: 0.8 }
            );
            (newVLine as any).isCrosshair = true;

            // Circle at (ox, oy)
            const newCircle = new fabric.Circle({
                left: ox, top: oy, radius: 50, stroke: 'orange', strokeWidth: thickness * 2, fill: 'transparent',
                originX: 'center', originY: 'center', selectable: false, evented: false, excludeFromExport: true, opacity: 0.8
            });
            (newCircle as any).isCrosshair = true;

            canvas.add(newHLine);
            canvas.add(newVLine);
            canvas.add(newCircle);

            const positions = useAppStore.getState().positions;
            const newText = new fabric.Text(`X: ${positions.X.toFixed(3)}\nY: ${positions.Y.toFixed(3)}`, {
                left: ox + 25 / zoom, top: oy + 25 / zoom, fontSize: 14 / zoom, fill: '#FFD700', fontFamily: 'monospace',
                fontWeight: 'bold', selectable: false, evented: false, excludeFromExport: true,
                shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.8)', blur: 2 / zoom, offsetX: 1 / zoom, offsetY: 1 / zoom })
            });
            (newText as any).isCrosshair = true;
            canvas.add(newText);
        }
    }, [canvas, enableCameraCrosshair]);

    useEffect(() => {
        if (!canvas) return;

        // Initial Draw (handles enable/disable logic internally)
        drawWorldCross();

        const updateHandler = () => {
            // Viewport change? just redraw (checks state internally)
            drawWorldCross();
        };

        canvas.on('viewport:transform' as any, updateHandler);

        return () => {
            canvas.off('viewport:transform' as any, updateHandler);
            const objects = canvas.getObjects();
            const crosses = objects.filter(obj => (obj as any).isCrosshair);
            crosses.forEach(obj => canvas.remove(obj));
        };
    }, [canvas, showCross, zoom, viewMode, enableCameraCrosshair, drawWorldCross, pxPerMm]);

    // [NEW] v7.7: Internal Laser Marker for Processing State
    useEffect(() => {
        if (!canvas) return;

        const syncProcessingMarker = () => {
            const { isProcessingLocal, crosshairOffset, viewMode } = useCanvasStore.getState();
            
            if (!isProcessingLocal) {
                // Cleanup existing processing markers when not processing
                const existing = canvas.getObjects().filter(obj => (obj as any).isProcessingMarker);
                existing.forEach(obj => canvas.remove(obj));
                canvas.requestRenderAll();
                return;
            }

            const zoom = canvas.getZoom();
            const thickness = 1.5 / zoom;
            
            let ox = crosshairOffset.x;
            let oy = crosshairOffset.y;

            // [FIX] The canvas coordinates natively represent the absolute machine coordinates.
            // Therefore, the laser processing marker is always exactly at the current stage position,
            // regardless of whether we are in scanner or object mode.
            const positions = useAppStore.getState().positions;
            const { pxPerMm } = useCanvasStore.getState();
            const markerScenePos = stageToScenePx(positions.X, positions.Y, pxPerMm);
            ox = markerScenePos.x;
            oy = markerScenePos.y;

            const radius = 12.5 / zoom;
            const lineLen = 50 / zoom;
            const color = '#FFD700'; // High-visibility Yellow (Gold)

            // Find existing objects
            const objects = canvas.getObjects();
            const circle = objects.find(obj => (obj as any).isProcessingMarker && obj.type === 'circle') as fabric.Circle;
            const lines = objects.filter(obj => (obj as any).isProcessingMarker && obj.type === 'line') as fabric.Line[];

            if (circle && lines.length === 2) {
                // Update existing instead of destroying & recreating
                circle.set({
                    left: ox,
                    top: oy,
                    radius: radius,
                    strokeWidth: thickness * 2
                });
                circle.setCoords();

                // Sort lines by horizontal/vertical
                const hLine = lines.find(l => l.x1 !== l.x2);
                const vLine = lines.find(l => l.y1 !== l.y2);

                if (hLine) {
                    hLine.set({
                        x1: ox - lineLen,
                        y1: oy,
                        x2: ox + lineLen,
                        y2: oy,
                        strokeWidth: thickness
                    });
                    hLine.setCoords();
                }
                if (vLine) {
                    vLine.set({
                        x1: ox,
                        y1: oy - lineLen,
                        x2: ox,
                        y2: oy + lineLen,
                        strokeWidth: thickness
                    });
                    vLine.setCoords();
                }
            } else {
                // Create them if they don't exist yet
                const newCircle = new fabric.Circle({
                    left: ox, top: oy, radius,
                    stroke: color, strokeWidth: thickness * 2, fill: 'transparent',
                    originX: 'center', originY: 'center',
                    selectable: false, evented: false, excludeFromExport: true, opacity: 1
                });
                (newCircle as any).isProcessingMarker = true;

                const h = new fabric.Line([ox - lineLen, oy, ox + lineLen, oy], {
                    stroke: color, strokeWidth: thickness,
                    selectable: false, evented: false, excludeFromExport: true
                });
                const v = new fabric.Line([ox, oy - lineLen, ox, oy + lineLen], {
                    stroke: color, strokeWidth: thickness,
                    selectable: false, evented: false, excludeFromExport: true
                });
                (h as any).isProcessingMarker = true;
                (v as any).isProcessingMarker = true;

                canvas.add(newCircle, h, v);
            }

            canvas.requestRenderAll();
        };

        syncProcessingMarker();

        // Re-sync on viewport change during processing
        const updateHandler = () => syncProcessingMarker();
        canvas.on('viewport:transform' as any, updateHandler);

        return () => {
            canvas.off('viewport:transform' as any, updateHandler);
            const existing = canvas.getObjects().filter(obj => (obj as any).isProcessingMarker);
            existing.forEach(obj => canvas.remove(obj));
        };
    }, [canvas, useCanvasStore((s) => s.isProcessingLocal), useCanvasStore((s) => s.crosshairOffset), useAppStore((s) => s.positions), zoom, pxPerMm]);

    return { drawCrosshair: drawWorldCross };
};
