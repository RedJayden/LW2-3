
import { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from '../useCanvasStore';
import useAppStore from '@/store/appStore';
import { addCenterControl, configureFabricControls } from '../utils/fabricControlSetup'; // [FIX] Import Helper

export const useCanvasSetup = (
    canvasRef: React.RefObject<HTMLCanvasElement>,
    containerRef: React.RefObject<HTMLDivElement>,
    onResize?: () => void,
    onBeforeDispose?: () => void
) => {
    const { setCanvas, setSelectedObject, setZoom, savedState, history, historyStep, viewMode } = useCanvasStore();
    const resizeRequestRef = useRef<number | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    // [NEW] Configure Global Controls (ActiveSelection Prototype Patch)
    useEffect(() => {
        configureFabricControls();
    }, []);

    useEffect(() => {
        if (!canvasRef.current || !containerRef.current) return;

        console.log("Initializing Fabric Canvas...");
        let canvas: fabric.Canvas;
        try {
            canvas = new fabric.Canvas(canvasRef.current, {
                width: containerRef.current.clientWidth,
                height: containerRef.current.clientHeight,
                backgroundColor: viewMode === 'canvas' ? '#f3f4f6' : 'transparent',
                selection: true,
                // [NEW 2026-07-22] PowerPoint식 다중 선택: Ctrl(또는 Shift)+클릭으로 선택에
                // 추가하고, 이미 선택된 도형을 수정키+클릭하면 선택에서 제외(토글)한다.
                // Ctrl+Shift+클릭 제외 요구는 이 토글 규칙의 부분집합으로 자연 충족된다.
                selectionKey: ['ctrlKey', 'shiftKey'],
                preserveObjectStacking: true,
                fireRightClick: true,
                stopContextMenu: true,
                fireMiddleClick: true,
                selectionColor: 'rgba(0, 190, 255, 0.1)',
                selectionBorderColor: '#00BEFF',
                selectionLineWidth: 1,
                skipOffscreen: true, // [NEW] Limit rendering overhead for large matrix (e.g., 100x100)
                // [FIX] perPixelTargetFind 및 targetFindTolerance 는 성능 저하 및 드래그 중 크래시 원인이 되므로 제거
            });
        } catch (e) {
            console.error("Failed to initialize canvas:", e);
            return;
        }

        // Initial Setup
        setCanvas(canvas);
        setIsLoaded(true);

        // [FIX] Inject Center Control into all new objects (Instance Level)
        canvas.on('object:added', (e) => {
            if (e.target) addCenterControl(e.target);
        });

        // [FIX] Sync Selection with Store
        const syncSelection = () => {
            const active = canvas.getActiveObject();
            setSelectedObject(active || null);
        };

        // [FIX] ActiveSelection uses Prototype now, but we keep this as backup
        const handleSelection = (e: any) => {
            syncSelection();
            const active = e.target || canvas.getActiveObject();
            if (active && active.type.toLowerCase() === 'activeselection') {
                addCenterControl(active);
                active.setCoords();
                canvas.requestRenderAll();
            }
        };

        canvas.on('selection:created', handleSelection);
        canvas.on('selection:updated', handleSelection);
        canvas.on('selection:cleared', () => setSelectedObject(null));

        const resizeObserver = new ResizeObserver(() => {
            if (resizeRequestRef.current) {
                cancelAnimationFrame(resizeRequestRef.current);
            }

            resizeRequestRef.current = requestAnimationFrame(() => {
                if (!containerRef.current || !canvas || (canvas as any)._isDisposed) return;

                const width = containerRef.current.clientWidth;
                const height = containerRef.current.clientHeight;

                if (canvas.width === width && canvas.height === height) return;

                canvas.setDimensions({ width, height });
                canvas.calcOffset(); // Ensure offsets are recalculated

                const { viewMode, viewStates, currentScope, magnification } = useCanvasStore.getState();
                // [V13 FIX] Generate correct scoped key (e.g., main:scanner or recipe:object_x20)
                // instead of using un-scoped viewStates[viewMode] which defaults to zoom=0 and resets pan to center.
                const baseKey = viewMode === 'object' ? `object_x${magnification}` : viewMode;
                const scopedKey = `${currentScope}:${baseKey}`;
                const storedState = viewStates[scopedKey] || { zoom: 0, pan: { x: 0, y: 0 } };

                const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];

                // [V14 FIX] If isFitCamera is true (or always true for object mode), center dynamically on stage coordinates.
                // Otherwise (canvas mode or stage-centered scanner mode), center on the stage origin.
                const isFitCamera = storedState.isFitCamera !== undefined ? storedState.isFitCamera : (viewMode === 'object');
                
                if (isFitCamera) {
                    const latestPositions = useAppStore.getState().positions;
                    const activePxPerMm = useCanvasStore.getState().pxPerMm || { x: 1000, y: 1000 };

                    // [FIX] Ensure the viewport centers on the Camera's physical location.
                    // ALWAYS use the active camera scale (pxPerMm) because the Fabric Canvas coordinate system is fixed to it!
                    // Backend aligns Object Camera origin to 0,0 by moving the stage, so we just use latestPositions directly.
                    const pxX = latestPositions.X * activePxPerMm.x;
                    const pxY = -latestPositions.Y * activePxPerMm.y;
                    
                    const zoom = storedState.zoom !== 0 ? storedState.zoom : canvas.getZoom();
                    vpt[0] = zoom;
                    vpt[3] = zoom;
                    
                    // storedState.pan contains userPan for camera modes
                    const userPanX = storedState.zoom !== 0 ? storedState.pan.x : useCanvasStore.getState().userPan.x;
                    const userPanY = storedState.zoom !== 0 ? storedState.pan.y : useCanvasStore.getState().userPan.y;
                    
                    // Apply ruler-adjusted offset center ((width+60)/2)
                    vpt[4] = ((width + 60) / 2) + userPanX - (pxX * zoom);
                    vpt[5] = ((height + 20) / 2) + userPanY - (pxY * zoom);
                } else {
                    if (storedState.zoom !== 0) { // [FIX] zoom=0 is the default "virgin" state
                        vpt[0] = storedState.zoom;
                        vpt[3] = storedState.zoom;
                        vpt[4] = storedState.pan.x + ((width + 60) / 2); // Ruler adjusted offset
                        vpt[5] = storedState.pan.y + ((height + 20) / 2);
                    } else {
                        // Default behavior: Center the view with ruler offset
                        vpt[4] = (width + 60) / 2;
                        vpt[5] = (height + 20) / 2;
                    }
                }

                canvas.setViewportTransform(vpt);
                useCanvasStore.getState().setZoom(vpt[0]);
                useCanvasStore.getState().setPan({ x: vpt[4], y: vpt[5] });

                canvas.requestRenderAll();

                if (onResize) onResize();
            });
        });
        resizeObserver.observe(containerRef.current);

        return () => {
            console.log("Disposing Fabric Canvas...");
            resizeObserver.disconnect();
            if (resizeRequestRef.current) {
                cancelAnimationFrame(resizeRequestRef.current);
            }
            // Trigger pre-disposal save
            if (onBeforeDispose) {
                onBeforeDispose();
            }
            // Safe Dispose
            try {
                if (canvas && !(canvas as any)._isDisposed) {
                    (canvas as any)._isDisposed = true;
                    // Prevent any more renders during disposal
                    canvas.renderOnAddRemove = false;
                    canvas.dispose();
                }
            } catch (e) {
                console.warn("Error disposing canvas:", e);
            }
            setCanvas(null as any); // Reset store
        };
    }, [canvasRef, containerRef, setCanvas, onResize]);

    return { isLoaded };
};
