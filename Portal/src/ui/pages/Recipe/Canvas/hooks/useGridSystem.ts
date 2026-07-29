import { useCallback, useEffect, useState, useRef } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from '../useCanvasStore';
import { CAMERA_SPECS } from '../cameraConfig';
import { PX_PER_MM, PX_SCALING_FACTOR } from '../constants';
import useAppStore from '@/store/appStore';
import { useUIPreferenceStore } from '@/store/useUIPreferenceStore';
import { stageToScenePx } from '../utils/sceneCoords';


// Safety check for CAMERA_SPECS
if (!CAMERA_SPECS) {
    console.error('[useGridSystem] CAMERA_SPECS is undefined! Check cameraConfig.ts import.');
} else if (!CAMERA_SPECS.scanner) {
    console.error('[useGridSystem] CAMERA_SPECS.scanner is undefined!', CAMERA_SPECS);
}

export const useGridSystem = () => {
    // Use selectors to avoid unnecessary re-renders
    const canvas = useCanvasStore((s) => s.canvas);
    const showGrid = useCanvasStore((s) => s.showGrid);
    const setZoom = useCanvasStore((s) => s.setZoom);
    const viewMode = useCanvasStore((s) => s.viewMode);
    const pxPerMm = useCanvasStore((s) => s.pxPerMm);

    const zoom = useCanvasStore((s) => s.zoom);
 
    // Use refs to track last broadcasted values to avoid dependency cycles
    const lastPan = useRef({ x: 0, y: 0 });
    const lastZoom = useRef(1);

    const drawGrid = useCallback((c: fabric.Canvas, show: boolean, paper: fabric.Object, manualVpt?: number[]) => {
        if (!c) return;
        const objects = c.getObjects();
        const gridLines = objects.filter(obj => (obj as any).isGridLine);
        gridLines.forEach(line => c.remove(line));

        // console.log('[Grid] drawGrid called. Show:', show, 'HasPaper:', !!paper);

        if (!show) {
            c.requestRenderAll();
            return;
        }

        const zoom = c.getZoom();
        const vpt = manualVpt || c.viewportTransform;
        if (!vpt) return;

        const width = c.width!;
        const height = c.height!;
        const visibleLeft = (-vpt[4] / zoom) - (width * 0.5 / zoom);
        const visibleTop = (-vpt[5] / zoom) - (height * 0.5 / zoom);
        const visibleRight = ((width - vpt[4]) / zoom) + (width * 0.5 / zoom);
        const visibleBottom = ((height - vpt[5]) / zoom) + (height * 0.5 / zoom);

        const paperLeft = paper.left!;
        const paperTop = paper.top!;
        const paperRight = paperLeft + paper.width!;
        const paperBottom = paperTop + paper.height!;

        const startX = Math.max(paperLeft, visibleLeft);
        const endX = Math.min(paperRight, visibleRight);
        const startY = Math.max(paperTop, visibleTop);
        const endY = Math.min(paperBottom, visibleBottom);

        if (startX >= endX || startY >= endY) return;

        const minTickPx = 8;
        const minLabelPx = 60;
        const baseSteps = [1, 2, 5];
        let stepMm = 1;
        let labelStepMm = 10;

        let currentPxPerMm = { x: 1000, y: 1000 };
        try {
            currentPxPerMm = useCanvasStore.getState().pxPerMm || { x: 1000, y: 1000 };
        } catch (e) {
            console.warn('[Grid] useCanvasStore.getState() failed, using default 1000', e);
        }

        if (!currentPxPerMm || currentPxPerMm.x <= 0 || currentPxPerMm.y <= 0) {
            console.warn('[Grid] Invalid pxPerMm:', currentPxPerMm, 'Using default 1000');
            currentPxPerMm = { x: 1000, y: 1000 };
        }

        const avgPxPerMm = (currentPxPerMm.x + currentPxPerMm.y) / 2;
        const idealStepMm = minTickPx / (avgPxPerMm * zoom);
        
        // [FIX] Mathematical O(1) magnitude calculation
        const magnitude = Math.pow(10, Math.floor(Math.log10(idealStepMm || 1e-9)));
        stepMm = magnitude;
        for (const s of baseSteps) {
            if (s * magnitude >= idealStepMm - 1e-9) {
                stepMm = s * magnitude;
                break;
            }
        }

        const idealLabelStepMm = minLabelPx / (avgPxPerMm * zoom);
        // [FIX] Safe label step calculation using integer multipliers to avoid floating point modulo errors
        let labelMultiplier = 1;
        let safetyCount = 0;
        
        while ((labelMultiplier * stepMm * avgPxPerMm * zoom < minLabelPx - 1e-9) && safetyCount < 50) {
            if ((labelMultiplier * 2 * stepMm) >= idealLabelStepMm) {
                labelMultiplier *= 2;
            } else if ((labelMultiplier * 5 * stepMm) >= idealLabelStepMm) {
                labelMultiplier *= 5;
            } else {
                labelMultiplier *= 10;
            }
            safetyCount++;
        }
        labelStepMm = stepMm * labelMultiplier;

        const stepX = labelStepMm * currentPxPerMm.x;
        const stepY = labelStepMm * currentPxPerMm.y;

        const firstLineX = Math.ceil(startX / stepX) * stepX;
        let lineCount = 0;
        const MAX_LINES = 1000;

        for (let i = firstLineX; i <= endX; i += stepX) {
            if (lineCount++ > MAX_LINES) break;
            const snappedI = Math.round(i * 1000) / 1000;
            const isZero = Math.abs(snappedI) < 0.1;

            const line = new fabric.Line(
                [snappedI, startY, snappedI, endY],
                {
                    stroke: isZero ? '#cbd5e1' : '#94a3b8',
                    selectable: false,
                    evented: false,
                    strokeWidth: isZero ? 2 : 1.5, // Thicker and brighter for better visibility
                    strokeUniform: true,
                    excludeFromExport: true,
                }
            );
            (line as any).isGridLine = true;
            c.add(line);
        }

        const firstLineY = Math.ceil(startY / stepY) * stepY;
        lineCount = 0;

        for (let i = firstLineY; i <= endY; i += stepY) {
            if (lineCount++ > MAX_LINES) break;
            const snappedI = Math.round(i * 1000) / 1000;
            const isZero = Math.abs(snappedI) < 0.1;

            const line = new fabric.Line(
                [startX, snappedI, endX, snappedI],
                {
                    stroke: isZero ? '#94a3b8' : '#576574',
                    selectable: false,
                    evented: false,
                    strokeWidth: isZero ? 2 : 1.2, // Slightly thicker for better visibility
                    strokeUniform: true,
                    excludeFromExport: true,
                }
            );
            (line as any).isGridLine = true;
            c.add(line);
        }

        const newGridLines = c.getObjects().filter(obj => (obj as any).isGridLine);
        newGridLines.forEach(line => c.sendObjectToBack(line));
        c.sendObjectToBack(paper);

        c.requestRenderAll();
    }, []);

    const initPaper = useCallback((preserveViewport: boolean = false) => {
        if (!canvas) return;
        const { showGrid, viewMode } = useCanvasStore.getState();

        // 1. Determine Target Dimensions based on ViewMode and Stage Limit
        const stageLimit = useAppStore.getState().stageLimit;
        const stageW = (stageLimit.maxX - stageLimit.minX) * PX_PER_MM;
        const stageH = (stageLimit.maxY - stageLimit.minY) * PX_PER_MM;
        
        // Use Stage Dimensions for Canvas Mode (Master Workspace)
        let targetW = stageW;
        let targetH = stageH;

        // If explicitly isolated to a camera view (Optional legacy behavior, can be removed if strictly unified)
        // if (viewMode === 'scanner' && CAMERA_SPECS?.scanner) {
        //    targetW = CAMERA_SPECS.scanner.resolution.width;
        //    targetH = CAMERA_SPECS.scanner.resolution.height;
        // } else if (viewMode === 'object' && CAMERA_SPECS?.object) {
        //    targetW = CAMERA_SPECS.object.resolution.width;
        //    targetH = CAMERA_SPECS.object.resolution.height;
        // }

        let paper = canvas.getObjects().find(obj => (obj as any).isPaper);

        // 2. Create or Update Paper
        // [FIX] Accurately position Paper using exact min/max bounds instead of assuming symmetry
        const targetLeft = stageLimit.minX * PX_PER_MM;
        const targetTop = -stageLimit.maxY * PX_PER_MM; // Y is inverted in Fabric

        if (!paper) {
            paper = new fabric.Rect({
                left: targetLeft,
                top: targetTop,
                width: targetW,
                height: targetH,
                fill: 'transparent',
                selectable: false,
                evented: false,
                hoverCursor: 'default',
                shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.1)', blur: 20 / PX_SCALING_FACTOR, offsetX: 0, offsetY: 0 }),
                excludeFromExport: true
            });
            (paper as any).isPaper = true;
            canvas.add(paper);
            canvas.sendObjectToBack(paper);
        } else {
            // Update existing paper to match current mode requirements
            // This handles the case where we switched from Canvas (Large) to Scanner (Small)
            // or vice versa, and the paper object was reused.
            const needsResize = paper.width !== targetW || paper.height !== targetH || paper.left !== targetLeft || paper.top !== targetTop;

            paper.set({
                width: targetW,
                height: targetH,
                left: targetLeft,
                top: targetTop,
                fill: 'transparent',
                selectable: false,
                evented: false,
                hoverCursor: 'default',
                excludeFromExport: true
            });

            if (needsResize) {
                console.log(`[Grid] Resizing Paper to ${targetW}x${targetH} at (${targetLeft}, ${targetTop}) for mode ${viewMode}`);
                paper.setCoords();
            }
        }

        // Remove duplicates if any
        const papers = canvas.getObjects().filter(obj => (obj as any).isPaper);
        if (papers.length > 1) {
            papers.slice(1).forEach(p => canvas.remove(p));
            paper = papers[0];
        }

        if (!preserveViewport) {
            // [FIX] Center the viewport on the EXACT center of the physical paper bounds!
            const centerX = targetLeft + targetW / 2;
            const centerY = targetTop + targetH / 2;
            
            const vpt = canvas.viewportTransform!;
            // vpt[4] represents the screen X translation. To center `centerX`, we do:
            vpt[4] = (canvas.width! / 2) - centerX * vpt[0];
            vpt[5] = (canvas.height! / 2) - centerY * vpt[3];
            canvas.setViewportTransform(vpt);
            canvas.requestRenderAll();
        }

        drawGrid(canvas, showGrid, paper);
    }, [canvas, drawGrid]);

    // Use refs to track last broadcasted values to avoid dependency cycles


    const updateRuler = useCallback((vpt?: number[]) => {
        if (!canvas) return;
        const t = vpt || canvas.viewportTransform;
        if (t) {
            // [FIX] Update global store state directly for real-time layer sync
            if (lastPan.current.x !== t[4] || lastPan.current.y !== t[5]) {
                lastPan.current = { x: t[4], y: t[5] };
                useCanvasStore.getState().setPan({ x: t[4], y: t[5] });
            }
            if (!isNaN(t[0]) && t[0] > 0) {
                if (Math.abs(lastZoom.current - t[0]) > 0.000001) {
                    lastZoom.current = t[0];
                    setZoom(t[0]);
                }
            }

            // [FIX] Keep userPan in sync!
            // userPan = (뷰포트 pan) - (카메라 절대 위치 중심 정렬 성분).
            // [FIX] 구 가공 변위(lastProcessStartPosition 대비) 분기를 삭제했습니다.
            // 해당 분기는 RecipeCanvas의 변위 추적 이펙트와 순환 참조를 이루며 매 positions 틱마다
            // userPan을 (변위px×zoom - 30px)씩 누적 발산시키는 오염원이었습니다.
            // 가공 중 카메라 추적은 JOG 절대 추적 이펙트(RecipeCanvas)가 동일 수식으로 담당합니다.
            const { pxPerMm, setUserPan, viewMode } = useCanvasStore.getState();
            let dxPx = 0;
            let dyPx = 0;

            if (viewMode !== 'canvas') {
                // Camera Mode (Scanner or Object)
                const latestPositions = useAppStore.getState().positions;
                // [FIX] scene = 절대 기계 좌표 (sceneCoords.ts 단일 수식).
                // CanvasBackground / JOG 뷰포트 / 십자선과 동일한 투영을 공유해야 눈금자 좌표계가 어긋나지 않습니다.
                const scenePos = stageToScenePx(latestPositions.X, latestPositions.Y, pxPerMm);
                dxPx = scenePos.x;
                dyPx = scenePos.y;
            }

            // [FIX] Subtract Ruler offsets (Left: 60px, Top: 20px) from canvas center calculations
            const panX = t[4] - ((canvas.width! + 60) / 2);
            const panY = t[5] - ((canvas.height! + 20) / 2);

            const targetUserPanX = panX + (dxPx * t[0]);
            const targetUserPanY = panY + (dyPx * t[0]);

            const currentUserPan = useCanvasStore.getState().userPan;
            if (Math.abs(currentUserPan.x - targetUserPanX) > 0.01 || Math.abs(currentUserPan.y - targetUserPanY) > 0.01) {
                setUserPan({ x: targetUserPanX, y: targetUserPanY });
            }
        }
    }, [canvas, setZoom]);


    // Initial Setup Effect
    useEffect(() => {
        if (canvas) {
            const { savedState, viewMode, viewStates } = useCanvasStore.getState();

            // [FIX] Safety check for viewStates
            if (!viewStates || !viewStates[viewMode]) {
                console.warn(`[useGridSystem] viewStates missing for mode: ${viewMode}`, viewStates);
                // Fallback or retry?
                // If viewStates is missing, we can't restore layout. Just init paper.
                initPaper(true);
                updateRuler();
                return;
            }

            const storedState = viewStates[viewMode];

            // Preserve viewport if savedState exists OR if we have a stored view state that is not "virgin" (default)
            // Even if it is default, `useCanvasSetup` might have centered it.
            // We should generally Avoid resetting viewport here if `useCanvasSetup` is responsible for it.
            // Let's assume preservation is safer unless we are explicitly creating a NEW blank canvas?
            // But checking savedState was the old way.

            // If we have a storedPan that is NOT (0,0) (TopLeft), it means we have a set state.
            // If zoom != 1, we have a set state.
            // If default (1, 0,0), `useCanvasSetup` centers it.
            // So in all cases, we probably want to PRESERVE what is currently on the canvas (set by useCanvasSetup).

            // So check if we should just ALWAYS preserve?
            // Does `initPaper` do anything else? It adds Paper.
            // If we pass `true` to `preserveViewport`, it skips centering.

            initPaper(true);
            updateRuler();

            // Add listener for sync
            const onVptChange = () => {
                // [FIX] Always update ruler/hud when viewport transforms to keep sync
                updateRuler();
            };
            // @ts-ignore
            canvas.on('viewport:transform', onVptChange);
            return () => {
                // @ts-ignore
                canvas.off('viewport:transform', onVptChange);
            };
        }
    }, [canvas, initPaper, updateRuler]);

    // Grid Update Effect
    useEffect(() => {
        if (canvas) {
            const paper = canvas.getObjects().find(obj => (obj as any).isPaper);
            if (paper) {
                drawGrid(canvas, showGrid, paper);
            }
        }
    }, [canvas, showGrid, drawGrid, pxPerMm]);

    return { 
        currentZoom: zoom, 
        initPaper, 
        updateRuler, 
        drawGrid 
    };
};
