/**
 * @file RecipeCanvas.tsx
 * @brief Fabric.js 캔버스를 래핑하고, 고정밀 좌표계 설정을 적용하는 컴포넌트입니다.
 * @note DPI 25400 (PX_PER_MM = 1000) 설정을 적용하여 1μm 정밀도 기반을 마련했습니다.
 */
import { useRef, useState, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import * as fabric from 'fabric';
import { useTheme, Fab, Box, Typography, Tooltip } from '@mui/material';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import { useCanvasStore } from './useCanvasStore';
import Ruler from './Ruler';
import CanvasContextMenu from './CanvasContextMenu';
import CoordinateAxis from './CoordinateAxis';
import { ZoomControl } from '../../../components/control/ZoomControl';
import CanvasBackground from './CanvasBackground';
import { useUIPreferenceStore } from '../../../../store/useUIPreferenceStore';

import { CAMERA_SPECS, calculatePxPerMm } from './cameraConfig';
import { PX_PER_MM, NAVIGATE_CURSOR } from './constants';
import { normalizeToStandard, denormalizeFromStandard } from './utils/canvasNormalization';
import { lensKeyFromCamera, lensKeyFromView, stageToScenePx, getLensFrameShiftMm } from './utils/sceneCoords';
import CanvasTopBar from '../PropertyBar/CanvasTopBar';
import ScaleBar from './ScaleBar';
// [P3] Strategy + Dispatcher: 드래그 앤 드롭 파일도 통합 Import 디스패처로 라우팅
import { importFile } from './utils/importFile';

// [FIX] Increase Precision for Serialization
// Default is 2, which destroys small scale factors (e.g. 0.0035 -> 0.00).
// 12 digits ensures we keep sub-nanometer precision in our scaling factors.
fabric.config.configure({ NUM_FRACTION_DIGITS: 12 });

// Hooks
import { useCanvasSetup } from './hooks/useCanvasSetup';
import { useGridSystem } from './hooks/useGridSystem';
import { useHistorySystem } from './hooks/useHistorySystem';
import { useClipboardSystem } from './hooks/useClipboardSystem';
import { useDragDuplicate } from './hooks/useDragDuplicate';
import { useCanvasShortcuts } from './hooks/useCanvasShortcuts';
import { useCanvasEvents } from './hooks/useCanvasEvents';
import { useCrosshair } from './hooks/useCrosshair';
import { useHatchOverlay } from './hooks/useHatchOverlay';

import useAppStore, { selectors } from '@/store/appStore';

import { useShallow } from 'zustand/react/shallow';
import { hwFacade } from '../../../../services/HardwareFacade';

let globalLastCameraMode = '';
let globalLastScope = '';

interface RecipeCanvasProps {
    enableCameraCrosshair?: boolean;
    scope?: string;
}

export default function RecipeCanvas({ enableCameraCrosshair = false, scope = 'recipe' }: RecipeCanvasProps) {
    const theme = useTheme();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayFabricCanvasRef = useRef<fabric.StaticCanvas | null>(null);
    const saveContentRef = useRef<() => void>(() => { });
    // [FIX] Ref to save ViewState BEFORE canvas is disposed (via onBeforeDispose)
    const saveViewStateRef = useRef<() => void>(() => { });
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

    const {
        activeTool,
        measureMode,
        showGrid,
        setShowGrid,
        showCross,
        setShowCross,
        showCameraGrid,
        setShowCameraGrid,
        showCameraCross,
        setShowCameraCross,
        allObjectsHidden,
        setAllObjectsHidden,
        canvas,
        viewMode,
        pxPerMm,
        magnification,
        setPxPerMm,
        setMagnification,
        calibrationScales,
        cameraCalibration, updateViewState, saveCanvasScope, loadCanvasScope,
        hideOverlays, isProcessingLocal,
        isNavigateMode, setIsNavigateMode,
        setCurrentScope // [V12]
    } = useCanvasStore();

    const isHoming = useAppStore(s => s.homingState.active);

    const cameraConfig = useAppStore((state) => state.cameraConfig);
    const recipeCenter = useAppStore((state) => state.recipeCenter);

    // 1. Setup Canvas
    const drawGridRef = useRef<any>(null);
    const onResizeRef = useRef<() => void>(() => { });

    // Stable callback passed to useCanvasSetup
    const onResize = useCallback(() => {
        onResizeRef.current();
    }, []);

    // Pass onBeforeDispose callback to save content before canvas destruction
    const { isLoaded } = useCanvasSetup(canvasRef as React.RefObject<HTMLCanvasElement>, containerRef as React.RefObject<HTMLDivElement>, onResize, () => {
        // [FIX] Save ViewState BEFORE canvas._isDisposed is set to true
        if (saveViewStateRef.current) saveViewStateRef.current();
        if (saveContentRef.current) saveContentRef.current();
    });

    // 1.5 Setup Overlay Canvas (Read-only Shapes)
    const isMainScope = scope.startsWith('main:');
    useEffect(() => {
        if (isMainScope && overlayCanvasRef.current && !overlayFabricCanvasRef.current) {
            const staticCanvas = new fabric.StaticCanvas(overlayCanvasRef.current, {
                width: containerRef.current?.clientWidth || 0,
                height: containerRef.current?.clientHeight || 0,
                backgroundColor: 'transparent'
            });
            overlayFabricCanvasRef.current = staticCanvas;
        }

        return () => {
            if (overlayFabricCanvasRef.current) {
                const c = overlayFabricCanvasRef.current;
                (c as any)._isDisposed = true;
                // [FIX] Delay disposal slightly or check existence to avoid clearRect on destroyed element
                try {
                    c.dispose();
                } catch (e) {
                    console.warn("Error disposing overlay canvas:", e);
                }
                overlayFabricCanvasRef.current = null;
            }
        };
    }, [isMainScope]);

    // Resize Overlay
    useEffect(() => {
        if (overlayFabricCanvasRef.current && containerRef.current) {
            overlayFabricCanvasRef.current.setDimensions({
                width: containerRef.current.clientWidth,
                height: containerRef.current.clientHeight
            });
        }
    }, [isLoaded]); // Sync with primary canvas resize timing

    // 2. Grid & Paper System
    const { currentZoom, initPaper, updateRuler, drawGrid } = useGridSystem();
    const { drawCrosshair } = useCrosshair(enableCameraCrosshair);

    // 2.5 Hatching UI Overlay
    useHatchOverlay();

    useEffect(() => {
        drawGridRef.current = drawGrid;
    }, [drawGrid]);

    // 0. Scope & Persistence Logic
    const storageKey = scope;
    const contentLoadedRef = useRef(false);

    // Helper to generate key for Hybrid Measurement Scope
    // e.g. 'recipe:scanner', 'recipe:object:x20', 'recipe:canvas'
    const getMeasurementScopeKey = useCallback(() => {
        if (scope !== 'recipe') return null;
        if (viewMode === 'object') return `recipe:${viewMode}:x${magnification}`;
        return `recipe:${viewMode}`;
    }, [scope, viewMode, magnification]);



    // ... existing imports ...

    // Hooks
    // ... existing hooks ...

    // ... RecipeCanvas component ...

    // [FIX] Track the scale used when the current content was LOADED.
    // This allows us to save using the SAME scale, preventing "Double Scale" during calibration updates.
    const loadedScaleRef = useRef<{ x: number, y: number }>({ x: 1000, y: 1000 });

    // [NEW] Track the lens frame shift (mm) applied when the current content was LOADED.
    // 저장 시 이 값을 정확히 역적용해야 모드 전환 타이밍(스토어가 먼저 새 모드로 갱신됨)과
    // 무관하게 콘텐츠가 항상 Scanner 프레임으로 무결하게 기록됩니다. (sceneCoords.ts 참조)
    const loadedFrameShiftRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });

    // Define Save Function (Updated when deps change)
    useEffect(() => {
        saveContentRef.current = () => {
            // Access latest canvas availability
            const currentCanvas = useCanvasStore.getState().canvas;

            // [CRITICAL] Use the scale recorded when we Loaded/Rendered these objects.
            const pxPerMm = loadedScaleRef.current; // <--- Source of Truth for "Dirty" data

            // [CRITICAL] Do not save if content never finished loading!
            if (!contentLoadedRef.current) {
                console.warn(`[RecipeCanvas] Skipping Save for ${storageKey}: Content not loaded.`);
                return;
            }

            if (currentCanvas && !(currentCanvas as any)._isDisposed) {
                try {
                    // [FIX] Enforce High Precision for Serialization (Runtime)
                    // Fabric.js 6: Use config or static property on FabricObject
                    fabric.config.configure({ NUM_FRACTION_DIGITS: 12 });

                    console.log(`[RecipeCanvas] FIX: Set Precision to 12.`);

                    const json = (currentCanvas as any).toObject(['id', 'name', 'isPaper', 'isGridLine', 'isMeasurement', 'selectable', 'evented', 'lockScalingX', 'lockScalingY', 'lockRotation', 'hasControls', 'subTargetCheck', 'fill', 'stroke', 'strokeWidth', 'isHairline', 'strokeUniform', 'originX', 'originY', 'isCrosshair', 'excludeFromExport', 'isGuide', 'isTemp', 'markPointTime', 'fillEnabled', 'strokeEnabled', 'fillOpacity', 'fillSettings', 'customData']);

                    if (json.objects) {
                        // Filter out system objects (Paper, Grid, Guide, Temp) -> These are re-generated
                        json.objects = json.objects.filter((obj: any) => !obj.isPaper && !obj.isGridLine && !obj.isGuide && !obj.isTemp && !obj.isCrosshair);
                    }

                    // [FIX] Normalize Data to Standard Scale (1000 px/mm)
                    // This creates a resolution-independent storage format.
                    // Removed centerX/Y subtraction as we rely on Center-Origin Viewport.
                    const safePxPerMm = pxPerMm || { x: 1000, y: 1000 };

                    // Canvas Center-Origin 시스템에서 스케일 변환만으로 카메라 간 일관성이 보장됩니다.
                    // left=0 은 항상 '현재 카메라가 바라보는 물리적 지점' 을 의미하므로,
                    // 별도의 카메라 오프셋 픽셀 변환이 불필요합니다.
                    // [NEW] 로드 시 적용했던 렌즈 프레임 변위를 역적용하여 항상 Scanner 프레임으로 저장
                    const normalizedJson = normalizeToStandard(json, safePxPerMm, loadedFrameShiftRef.current);

                    const measureKey = getMeasurementScopeKey();

                    if (measureKey) {
                        // Hybrid Mode (Recipe UI): Split Shared vs Measurements
                        console.log(`[RecipeCanvas] Saving Hybrid Content. Shared='${storageKey}', Measure='${measureKey}', Scale=${safePxPerMm}`);

                        // [DEBUG] Log normalization results (Restored for Verification)
                        if (normalizedJson.objects.length > 0) {
                            const sample = normalizedJson.objects[0];
                            console.log(`[RecipeCanvas] DEBUG SAVE: ScaleRef=${pxPerMm}, Used=${safePxPerMm}, Obj[0].scaleX=${sample.scaleX.toFixed(9)}, W=${(sample.width * sample.scaleX).toFixed(6)}`);
                        }

                        const measurements = normalizedJson.objects.filter((obj: any) => obj.isMeasurement);
                        const shared = normalizedJson.objects.filter((obj: any) => !obj.isMeasurement);

                        // Save Shared (Shapes) -> 'recipe'
                        saveCanvasScope(storageKey, { ...normalizedJson, objects: shared });

                        // Save Measurements -> 'recipe:scanner' etc
                        saveCanvasScope(measureKey, { ...normalizedJson, objects: measurements });

                    } else {
                        // Normal Mode (Main UI / Calibration)
                        console.log(`[RecipeCanvas] Saving Content for ${storageKey}, Scale=${safePxPerMm}`);
                        saveCanvasScope(storageKey, normalizedJson);
                    }
                } catch (e) {
                    console.warn("[RecipeCanvas] Failed to save state:", e);
                }
            }
        };
    }, [storageKey, saveCanvasScope, getMeasurementScopeKey]);

    useEffect(() => {
        if (!canvas) return;

        // Reset Load State on Scope Change
        contentLoadedRef.current = false;
        const currentScope = storageKey;
        const measureKey = getMeasurementScopeKey();

        // [FIX] Calculate Expected PxPerMm for the target view
        // The primary canvas coordinate system is always standard Scanner scale
        const { calibrationScales } = useCanvasStore.getState();
        const baseScale = calibrationScales['scanner'] || { x: 1000, y: 1000 };
        let expectedPxPerMm = baseScale;

        if (viewMode === 'canvas') {
            // [FIX] 'canvas' mode always uses Standard 1000 px/mm (Logical Scale)
            expectedPxPerMm = { x: 1000, y: 1000 };
        }

        // [CRITICAL] Update the Ref so the Save logic knows what scale we are using.
        loadedScaleRef.current = expectedPxPerMm;

        // [NEW] 로드 대상 렌즈 프레임 변위 계산 (Scanner 프레임으로 저장된 데이터를 현재 모드의
        // 카메라 목표점 주변으로 배치). 저장 시 동일 값을 역적용할 수 있도록 Ref에 기록합니다.
        const loadFrameShift = getLensFrameShiftMm(lensKeyFromView(viewMode, magnification));
        loadedFrameShiftRef.current = loadFrameShift;

        // [NEW] Undo 히스토리 초기화: 히스토리 스냅숏은 로드 당시 렌즈 프레임의 픽셀 좌표를
        // 담고 있어, 모드 전환 후 Undo하면 도형이 이전 프레임 위치로 튀는 오염이 발생합니다.
        // 콘텐츠 재로드(모드/배율/스코프 전환)마다 히스토리를 리셋하여 프레임 오염을 차단합니다.
        useCanvasStore.getState().setHistory([]);
        useCanvasStore.getState().setHistoryStep(-1);

        // LOAD State
        let data: any = null;

        if (measureKey) {
            // Hybrid Load
            console.log(`[RecipeCanvas] Loading Hybrid Content. Shared='${storageKey}', Measure='${measureKey}'`);
            const sharedData = loadCanvasScope(storageKey);
            const scopedData = loadCanvasScope(measureKey);

            if (sharedData && scopedData) {
                // Clone to avoid mutating store if shallow copy (defensive)
                data = JSON.parse(JSON.stringify(sharedData));
                if (scopedData.objects) {
                    data.objects = [...(data.objects || []), ...scopedData.objects];
                }
            } else {
                data = sharedData || scopedData;
            }
        } else {
            // Normal Load
            data = loadCanvasScope(storageKey);
        }

        if (canvas.contextContainer && !(canvas as any)._isDisposed) {
            // [FIX] clear() failure safety
            // Fabric v6's clear() is synchronous but might fail if context is invalid.
            // We ensure we only clear if we have a context.
            try {
                canvas.clear();
            } catch (e) {
                console.warn("[RecipeCanvas] Clear failed. Ignoring.", e);
            }
        }

        const handlePostLoad = () => {
            if ((canvas as any)._isDisposed) return;
            canvas.requestRenderAll();
            if (initPaper) initPaper(true);
            if (drawCrosshair) drawCrosshair();

            // Mark Content as Loaded - Safe to Save now
            contentLoadedRef.current = true;
        };

        if (data) {
            console.log(`[RecipeCanvas] Loading Content for ${storageKey} (Hybrid=${!!measureKey})`);

            if ((canvas as any)._isDisposed) return;

            // [NEW] Scanner 프레임(표준)으로 저장된 도형을 현재 렌즈 프레임 변위만큼 이동시켜 로드.
            // 모드 전환 시 백엔드의 스테이지 상대 이동과 동일한 변위가 적용되어
            // 도형이 카메라 뷰 기준 동일한 상대 위치를 유지합니다.
            const denormalizedData = denormalizeFromStandard(data, expectedPxPerMm, loadFrameShift);

            canvas.loadFromJSON(denormalizedData).then(() => {
                if (!(canvas as any)._isDisposed) {
                    // [FIX] Force uniform strokes and ensure they look like 1px on screen
                    const currentZoom = canvas.getZoom();
                    canvas.getObjects().forEach(obj => {
                        if (!obj.isPaper && !obj.isGridLine) {
                            // [FIX] 헤어라인 객체는 로드 즉시 현재 줌 기준 2px로 재정규화.
                            // (과거 클립보드 복제에서 isHairline이 유실되어 굵은 strokeWidth로
                            //  저장된 레거시 데이터도 이 경로로 자가 치유됩니다.)
                            const isHairline = (obj as any).isHairline === true;
                            obj.set({
                                strokeUniform: true,
                                strokeWidth: isHairline
                                    ? 2 / (currentZoom || 1)
                                    : (obj.strokeWidth !== undefined ? obj.strokeWidth : 1)
                            });
                        }
                    });

                    // Double check if scope usage hasn't changed (rare concurrency)
                    if (currentScope === storageKey) handlePostLoad();
                    // [NEW] Force re-apply lock state after JSON content load
                    syncObjectLock();
                }
            }).catch(e => {
                // If load fails because the component unmounted, swallow the clear() TypeError.
                if (!(canvas as any)._isDisposed) {
                    console.warn("Load failed", e);
                }
            });
        } else {
            console.log(`[RecipeCanvas] No Saved Content for ${storageKey}, Initializing defaults.`);
            handlePostLoad();
        }

        return () => {
            // Manually trigger save on cleanup (e.g. Scope Change)
            if (canvas && !(canvas as any)._isDisposed) {
                saveContentRef.current();
            }
        };
        // [FIX] Reload if calibrationScales change to ensure we use the precise scale.
    }, [storageKey, canvas, saveCanvasScope, loadCanvasScope, getMeasurementScopeKey, viewMode, magnification, calibrationScales]);

    // [New] Load Read-only Overlay Data
    useEffect(() => {
        if (!isMainScope || !overlayFabricCanvasRef.current) return;

        const overlayCanvas = overlayFabricCanvasRef.current;
        const { getCanvasScopeData } = useCanvasStore.getState();
        const recipeData = getCanvasScopeData('recipe');

        if (recipeData) {
            const { calibrationScales } = useCanvasStore.getState();
            const baseScale = calibrationScales['scanner'] || { x: 1000, y: 1000 };
            let expectedPxPerMm = baseScale;

            if (viewMode === 'object') {
                if (magnification === 50) expectedPxPerMm = calibrationScales['object_x50'] || { x: 5000, y: 5000 };
                else expectedPxPerMm = calibrationScales['object_x20'] || { x: 2000, y: 2000 };
            }

            // [NEW] 오버레이도 메인 캔버스와 동일한 렌즈 프레임 변위를 적용하여 위치 일관성 유지
            const overlayFrameShift = getLensFrameShiftMm(lensKeyFromView(viewMode, magnification));
            const denormalizedData = denormalizeFromStandard(recipeData, expectedPxPerMm, overlayFrameShift);
            if ((overlayCanvas as any)._isDisposed) return;
            overlayCanvas.loadFromJSON(denormalizedData).then(() => {
                if ((overlayCanvas as any)._isDisposed) return;
                overlayCanvas.getObjects().forEach(obj => {
                    obj.selectable = false;
                    obj.evented = false;
                });
                overlayCanvas.requestRenderAll();
            }).catch(e => {
                if (!(overlayCanvas as any)._isDisposed) {
                    console.warn("Overlay Load failed", e);
                }
            });
        } else {
            overlayCanvas.clear();
        }
    }, [isMainScope, viewMode, magnification, loadCanvasScope, calibrationScales]);

    // [New] Sync Overlay Viewport with Primary Canvas
    useEffect(() => {
        if (!canvas || !overlayFabricCanvasRef.current) return;

        const syncViewport = () => {
            const vpt = canvas.viewportTransform;
            if (vpt && overlayFabricCanvasRef.current) {
                overlayFabricCanvasRef.current.setViewportTransform([...vpt]);
                overlayFabricCanvasRef.current.requestRenderAll();
            }
        };

        canvas.on('after:render', syncViewport);
        return () => {
            canvas.off('after:render', syncViewport);
        };
    }, [canvas]);

    // [NEW] Project Load Event Listener (Restores Grid/Paper)
    useEffect(() => {
        if (!canvas) return;

        const handleProjectLoaded = () => {
            console.log("[RecipeCanvas] Project Loaded Event Received - Restoring Grid/Paper");
            if (initPaper) {
                initPaper(true);
            }
            // Trigger Grid Draw
            const paper = canvas.getObjects().find(obj => (obj as any).isPaper);
            if (paper && drawGridRef.current) {
                drawGridRef.current(canvas, useCanvasStore.getState().showGrid, paper);
            }
            // [FIX] Restore Crosshair
            if (drawCrosshair) {
                drawCrosshair();
            }
            canvas.requestRenderAll();
        };

        canvas.on('project:loaded', handleProjectLoaded);
        return () => {
            canvas.off('project:loaded', handleProjectLoaded);
        };
    }, [canvas, initPaper, drawCrosshair]);
    
    // [NEW] Read-only & Overlay Hide Logic (Intent-based Implementation)
    const syncObjectLock = useCallback((canvasInstance?: fabric.Canvas) => {
        const targetCanvas = canvasInstance || canvas;
        if (!targetCanvas) return;

        const isProcessing = hideOverlays || isProcessingLocal;
        // [FIX] Use the subscribed variable from the component scope directly

        // 1. Selection & Interaction Control
        targetCanvas.selection = !isProcessing && !isNavigateMode;
        if (isProcessing || isNavigateMode) {
            targetCanvas.discardActiveObject();
        }

        // 2. Objects Lockdown & Visibility Hierarchy
        const objects = targetCanvas.getObjects();
        objects.forEach((obj: any) => {
            // System objects (Paper, Grid, Crosshair) are always handled separately
            if (obj.isPaper || obj.isGridLine || obj.isCrosshair) return;

            // [CRITICAL] Priority 1: Processing Marker (Special small crosshair for laser processing)
            if (obj.isProcessingMarker) {
                // Only visible during processing
                obj.visible = !!isProcessing;
                obj.evented = false;
                obj.selectable = false;
                return;
            }

            // [CRITICAL] Priority 2: Laser Center Calibration Mode (Temporary tools)
            if (obj.isTemp) return;

            // [CRITICAL] Priority 3: Processing State (Read-only / hide based on viewMode)
            if (isProcessing) {
                if (viewMode === 'scanner') {
                    obj.visible = false;
                } else {
                    obj.visible = obj.userVisible !== false;
                }
                obj.selectable = false;
                obj.evented = false; // Read-only
                return;
            }

            // [CRITICAL] Priority 4: Navigate Mode (Read-only, click-to-move)
            if (isNavigateMode) {
                obj.visible = obj.userVisible !== false;
                obj.selectable = false;
                obj.evented = true; // Allow hover/inspection, just not editing
                return;
            }

            // [CRITICAL] Priority 5: Normal Mode (Edit)
            // Object intent (userVisible) is already synced with master toggle in store
            const intentVisible = obj.userVisible !== false;
            obj.visible = intentVisible;
            obj.selectable = intentVisible; // Hidden objects shouldn't be clicked
            obj.evented = intentVisible;
        });

        targetCanvas.requestRenderAll();
    }, [canvas, hideOverlays, isProcessingLocal, isNavigateMode, allObjectsHidden, viewMode]);

    useEffect(() => {
        if (!canvas) return;

        // Apply on state change (Crucial for Processing Start/Stop)
        syncObjectLock();

        // [FIX] Add listener for dynamic objects (e.g. from tools)
        const handleObjectAdded = (e: any) => {
            if (hideOverlays || isProcessingLocal || isNavigateMode) {
                const obj = e.target;
                if (obj && !obj.isPaper && !obj.isGridLine && !obj.isCrosshair && !obj.isProcessingMarker) {
                    const isProcessing = hideOverlays || isProcessingLocal;
                    obj.selectable = false;
                    obj.evented = !isProcessing;
                    if (isProcessing) {
                        if (viewMode === 'scanner') {
                            obj.visible = false;
                        } else {
                            obj.visible = obj.userVisible !== false;
                        }
                    }
                }
            }
        };

        canvas.on('object:added', handleObjectAdded);
        return () => {
            canvas.off('object:added', handleObjectAdded);
        };
    }, [canvas, syncObjectLock, hideOverlays, isProcessingLocal, isNavigateMode, allObjectsHidden, viewMode]);

    const prevIsProcessing = useRef(false);
    useEffect(() => {
        const isProcessing = hideOverlays || isProcessingLocal;
        if (prevIsProcessing.current && !isProcessing) {
            // Processing ended (normally completed or manually stopped) -> Restore shape visibility based on userVisible state
            const objs = canvas?.getObjects();
            if (objs) {
                objs.forEach((obj: any) => {
                    if (obj.isPaper || obj.isGridLine || obj.isCrosshair || obj.isProcessingMarker || obj.isTemp) return;
                    
                    const intentVisible = obj.userVisible !== false;
                    obj.visible = intentVisible;
                    obj.selectable = intentVisible;
                    obj.evented = intentVisible;
                    obj.setCoords();
                });
                canvas?.requestRenderAll();
                
                const drawingObjects = objs.filter((obj: any) => 
                    !obj.isPaper && !obj.isGridLine && !obj.isCrosshair && !obj.isProcessingMarker && !obj.isTemp && !obj.isMeasurement
                );
                const allHidden = drawingObjects.length > 0 && drawingObjects.every((o: any) => o.userVisible === false);
                useCanvasStore.getState().setAllObjectsHiddenOnly(allHidden);
            }
        }
        prevIsProcessing.current = isProcessing;
    }, [hideOverlays, isProcessingLocal, canvas]);

    // [NEW] Navigate Mode 커서 최종 방어선: CSS !important 규칙은 인라인 style.cursor보다 우선하므로,
    // Fabric 내부 어디서 커서를 덮어써도(최소화/복원, 컨텍스트 메뉴, mouse:up 등) 크로스헤어가 유지된다.
    useEffect(() => {
        const STYLE_ID = 'navigate-mode-cursor-style';
        if (!document.getElementById(STYLE_ID)) {
            const styleEl = document.createElement('style');
            styleEl.id = STYLE_ID;
            styleEl.textContent = `.navigate-mode-cursor, .navigate-mode-cursor canvas { cursor: ${NAVIGATE_CURSOR} !important; }`;
            document.head.appendChild(styleEl);
        }
    }, []);

    // [NEW] Navigate Mode: high-visibility crosshair cursor hints "double-click here to move stage"
    // skipTargetFind blocks object hover targeting entirely so the cursor never flips to 'move'
    // over shape borders and right-click cannot grab objects while navigating.
    useEffect(() => {
        if (!canvas) return;
        if (isNavigateMode) {
            canvas.defaultCursor = NAVIGATE_CURSOR;
            canvas.hoverCursor = NAVIGATE_CURSOR;
            canvas.moveCursor = NAVIGATE_CURSOR;
            canvas.skipTargetFind = true;
        } else {
            // Restore cursors consistent with the currently active tool
            const tool = useCanvasStore.getState().activeTool;
            if (tool === 'select') {
                canvas.defaultCursor = 'default';
                canvas.hoverCursor = 'move';
            } else if (tool === 'pan') {
                canvas.defaultCursor = 'grab';
                canvas.hoverCursor = 'grab';
            } else {
                canvas.defaultCursor = 'crosshair';
                canvas.hoverCursor = 'crosshair';
            }
            canvas.moveCursor = 'move';
            canvas.skipTargetFind = false;
        }
        canvas.requestRenderAll();
    }, [canvas, isNavigateMode]);

    // [NEW] Safety: force-exit Navigate Mode if homing or a process starts while it's active
    useEffect(() => {
        if (isNavigateMode && (isHoming || isProcessingLocal)) {
            setIsNavigateMode(false);
        }
    }, [isHoming, isProcessingLocal, isNavigateMode, setIsNavigateMode]);

    // [NEW] Navigate Mode must not survive page/tab switches -- the canvas is remounted
    // on every Main/Recipe/Calibration navigation, so unmount is the exact hook point.
    useEffect(() => {
        return () => {
            useCanvasStore.getState().setIsNavigateMode(false);
        };
    }, []);

    // -------------------------------------------------------------
    // Visual Consistency System (PxPerMm)
    // -------------------------------------------------------------
    const [imageScaleX, setImageScaleX] = useState(1);
    const [imageScaleY, setImageScaleY] = useState(1);

    // Monitor viewMode/Magnification to update PxPerMm
    // Monitor viewMode/Magnification to update PxPerMm & Image Scale

    // -------------------------------------------------------------------------
    // Persistent Calibration Loader (Digital Pan/Zoom)
    // -------------------------------------------------------------------------
    const recipeCenterState = useAppStore(useShallow(s => s.recipeCenter));

    useEffect(() => {
        const loadCalibration = async () => {
            let activeKey = 'scanner';
            if (viewMode === 'object') {
                activeKey = magnification === 50 ? 'object_x50' : 'object_x20';
            }

            // [FIX] C++ 백엔드의 메모리 휘발 문제와 (0,0) 정상값 판별 오류를 방지하기 위해,
            // 오직 프론트엔드의 영구 저장소(RecipeCenter.json)만을 Single Source of Truth로 사용합니다.
            const savedRecipe = recipeCenterState[activeKey as 'scanner' | 'object_x20' | 'object_x50'];
            
            if (savedRecipe && savedRecipe.pixelX !== undefined && savedRecipe.pixelY !== undefined) {
                const pixel = { x: savedRecipe.pixelX, y: savedRecipe.pixelY };
                const currentRatio = savedRecipe.viewRatio ?? 100;
                
                useCanvasStore.getState().setCalibrationROI({
                    active: true,
                    viewRatio: currentRatio,
                    center: pixel
                });
                console.log(`[RecipeCanvas] Applied Calibration strictly from RecipeCenter.json for ${activeKey}`, { pixel, currentRatio });
            } else {
                useCanvasStore.getState().setCalibrationROI({ active: false });
            }
        };
        loadCalibration();
    }, [viewMode, magnification, recipeCenterState]);

    // Update Canvas Background and Paper based on mode
    useEffect(() => {
        if (!canvas) return;

        const isCanvasMode = viewMode === 'canvas' && scope === 'recipe';
        canvas.backgroundColor = isCanvasMode ? '#f3f4f6' : 'transparent';

        // [FIX] Always use preserveViewport=true to prevent zoom resets to 100%
        if (initPaper) {
            initPaper(true);
        }

        canvas.requestRenderAll();
    }, [viewMode, canvas, scope, initPaper]);

    // [FIX] Force Grid/Paper/Crosshair Redraw on Scope/View Change
    // Optimized: Use a single effect to handle visual consistency after scope/view changes
    useEffect(() => {
        if (!canvas || (canvas as any)._isDisposed) return;
        let isMounted = true;

        const syncVisuals = () => {
            if (!isMounted || (canvas as any)._isDisposed) return;

            // [FIX] Always use preserveViewport=true
            if (initPaper) initPaper(true);

            // Force Draw Grid
            const paper = canvas.getObjects().find(obj => (obj as any).isPaper);
            if (paper && drawGridRef.current) {
                drawGridRef.current(canvas, useCanvasStore.getState().showGrid, paper);
            }

            // Force Draw Crosshair
            if (drawCrosshair) drawCrosshair();

            canvas.requestRenderAll();
        };

        // Delay slightly to ensure layout / container size is stable
        const tid = setTimeout(syncVisuals, 50);
        return () => {
            isMounted = false;
            clearTimeout(tid);
        };
    }, [scope, viewMode, initPaper, drawCrosshair, canvas]);

    // [V12] Scoped ViewState Key (Main and Recipe are fully independent)
    const viewStateKey = useMemo(() => {
        const baseKey = viewMode === 'object'
            ? `object_x${magnification}`
            : viewMode;
        
        // Scope can be 'main:scanner', 'recipe' etc. We only need the first part if it has a colon.
        const scopePrefix = scope.split(':')[0]; // 'main' or 'recipe'
        return `${scopePrefix}:${baseKey}`;
    }, [viewMode, magnification, scope]);
    
    // [V13] Sync current scope to store whenever it changes - including calibration
    useEffect(() => {
        const scopePrefix = scope.split(':')[0];
        if (scopePrefix === 'main' || scopePrefix === 'recipe' || scopePrefix === 'calibration') {
            setCurrentScope(scopePrefix as 'main' | 'recipe' | 'calibration');
        }
    }, [scope, setCurrentScope]);

    // [FIX] Define Zoom Constants
    /**
     * @brief 뷰 모드에 따라 툴바 및 핏에 사용될 최대/최소 줌 한계를 결정합니다.
     * @details 
     *  - object 모드: 최소 0.01% (0.0001) / 최대 2000% (20.0)
     *  - scanner 모드: 최소 0.1% (0.001) / 최대 1000% (10.0)
     *  - canvas 모드: 최소 0.1% (0.001) / 최대 2000% (20.0)
     */
    const minZoomScalar = viewMode === 'object' ? 0.0001 : 0.001;
    const maxZoomScalar = viewMode === 'canvas' ? 20 : (viewMode === 'object' ? 20 : 10);
    const maxZoomPercent = maxZoomScalar * 100;
    const minZoomPercent = minZoomScalar * 100;

    const positions = useAppStore(selectors.positions);

    const fitScreen = useCallback(() => {
        const canvas = useCanvasStore.getState().canvas;
        if (canvas && containerRef.current) {
            const containerW = containerRef.current.clientWidth;
            const containerH = containerRef.current.clientHeight;
            const stageLimit = useAppStore.getState().stageLimit;
            // [FIX] ALWAYS use the base Scanner scale to calculate Fit to Working Area!
            // This ensures that the Stage Area (Working Area) size on screen is perfectly
            // unified and consistent across all modes (Scanner, Object x20, Object x50).
            const { calibrationScales } = useCanvasStore.getState();
            const baseScale = calibrationScales['scanner'] || { x: 1000, y: 1000 };
            const targetW = (stageLimit.maxX - stageLimit.minX) * baseScale.x;
            const targetH = (stageLimit.maxY - stageLimit.minY) * baseScale.y;

            const padding = 50;
            const scaleX = (containerW - 60 - padding) / targetW;
            const scaleY = (containerH - 20 - padding) / targetH;
            let fitZoom = Math.min(scaleX, scaleY);

            if (fitZoom > maxZoomScalar) fitZoom = maxZoomScalar;
            if (fitZoom < minZoomScalar) fitZoom = minZoomScalar;

            canvas.setZoom(fitZoom);
            const vpt = canvas.viewportTransform;
            if (vpt) {
                // [FIX] Shift viewport center to align with the EXACT physical center of the stage bounds!
                // Do not assume the bounds are symmetric around 0,0!
                const targetLeft = stageLimit.minX * baseScale.x;
                const targetTop = -stageLimit.maxY * baseScale.y; // Y is inverted in Fabric
                const centerX = targetLeft + targetW / 2;
                const centerY = targetTop + targetH / 2;
                
                vpt[4] = ((canvas.width! + 60) / 2) - centerX * vpt[0];
                vpt[5] = ((canvas.height! + 20) / 2) - centerY * vpt[3];
                canvas.setViewportTransform(vpt);
                
                // [FIX] Synchronize Store for Background alignment
                const { setPan, setZoom, updateViewState, setIsFitCamera, setUserPan } = useCanvasStore.getState();
                setUserPan({ x: 0, y: 0 });
                setPan({ x: vpt[4], y: vpt[5] });
                setZoom(fitZoom);
                setIsFitCamera(false); // [V14 FIX] Set isFitCamera to false (Fit to Working Area)

                // [V10 FIX] Synchronously persist immediately to prevent cross-page contamination.
                // The previous setTimeout caused fitZoom computed for page A to be saved
                // under page B's viewStateKey when page transitions happened within 50ms.
                updateViewState(viewStateKey, fitZoom, { x: 0, y: 0 }, false);

                // [FIX] Force explicit event to trigger direct DOM sync in CanvasBackground
                canvas.fire('viewport:transformed' as any);
            }

            // [FIX] Immediate Stroke Update for non-grid hairlines
            // and force coordinate update for all objects
            canvas.getObjects().forEach(obj => {
                if ((obj as any).isHairline && !(obj as any).isGridLine) {
                    obj.set('strokeWidth', 2 / fitZoom);
                }
                obj.setCoords(); // [FIX] Force bounding box update
            });

            // [FIX] Redraw Grid to ensure perfect thickness and alignment
            const paper = canvas.getObjects().find(obj => (obj as any).isPaper);
            if (paper && drawGrid) {
                drawGrid(canvas, useCanvasStore.getState().showGrid, paper);
            }

            canvas.requestRenderAll();
            updateRuler(canvas.viewportTransform);
        }
    }, [canvas, viewStateKey, updateRuler, maxZoomScalar, minZoomScalar, drawGrid]);

    const triggerFitCameraCount = useCanvasStore(s => s.triggerFitCameraCount);

    const fitCameraArea = useCallback((preserveZoom = false) => {
        if (canvas) {
            const uiPrefs = useUIPreferenceStore.getState();
            const subBarState = uiPrefs.getSubBarState("shared_machine_layout");
            const features = useAppStore.getState().features;

            let camMode = useAppStore.getState().cameraKind;
            let magStr = useAppStore.getState().objectMag;

            if (viewMode === 'canvas') {
                camMode = subBarState.cameraMode;
                magStr = subBarState.mag;
            }

            let effectiveMag = magStr;
            if (!features.hasObjectX20 && effectiveMag === "x20") effectiveMag = "x50";

            const isObjCam = camMode === 'object';
            const activeKey_local = lensKeyFromCamera(camMode, effectiveMag);

            const camScaleRaw = useCanvasStore.getState().calibrationScales[activeKey_local] || 1000;
            const camScale = typeof camScaleRaw === 'number' ? { x: camScaleRaw, y: camScaleRaw } : camScaleRaw;

            const cameraConfig = useAppStore.getState().cameraConfig;
            let camWidth = 2448;
            let camHeight = 2048;

            if (isObjCam) {
                const objCam = cameraConfig?.cameras?.find((c: any) => c.name.toLowerCase().includes('object') || c.id === 1);
                if (objCam && objCam.resolution) {
                    camWidth = objCam.resolution.width;
                    camHeight = objCam.resolution.height;
                }
            } else {
                const scanCam = cameraConfig?.cameras?.find((c: any) => c.name.toLowerCase().includes('scanner') || c.id === 2);
                if (scanCam && scanCam.resolution) {
                    camWidth = scanCam.resolution.width;
                    camHeight = scanCam.resolution.height;
                }
            }

            const physicalW = camWidth / camScale.x;
            const physicalH = camHeight / camScale.y;
            // [RESTORE] Use activePxPerMm (current camera scale) instead of baseScale to ensure correct pixel dimensions in high-res Object mode.
            const activePxPerMm = useCanvasStore.getState().pxPerMm || { x: 1000, y: 1000 };
            
            const renderW = physicalW * activePxPerMm.x;
            const renderH = physicalH * activePxPerMm.y;
            
            // [FIX] Read fresh stage positions from useAppStore directly to avoid stale closures
            const latestPositions = useAppStore.getState().positions;

            // [FIX] scene = 절대 기계 좌표 (sceneCoords.ts 단일 수식).
            // (구버전의 cameraConfig.cameras[].offset 조회는 실데이터에 존재하지 않는 필드라 항상 0으로
            //  폴백되던 죽은 코드였으며, 절대 투영 단일 수식으로 대체되었습니다.)
            const { x: pxX, y: pxY } = stageToScenePx(latestPositions.X, latestPositions.Y, activePxPerMm);

            console.log(`[fitCameraArea] stage=(${latestPositions.X.toFixed(3)},${latestPositions.Y.toFixed(3)}), pxOffset=(${pxX.toFixed(1)},${pxY.toFixed(1)})`);

            const padding = 20; // [FIX] Reduced padding (100 -> 20) for full screen FOV
            const width = canvas.width! - 60 - padding;
            const height = canvas.height! - 20 - padding;
            const scaleX = width / renderW;
            const scaleY = height / renderH;
            
            // [FIX] preserveZoom이 참이면 현재 줌 레벨을 유지하고, 거짓이면 새로 핏된 줌 레벨을 계산합니다.
            let fitZoom = preserveZoom ? canvas.getZoom() : Math.min(scaleX, scaleY);

            if (fitZoom > maxZoomScalar) fitZoom = maxZoomScalar;
            if (fitZoom < minZoomScalar) fitZoom = minZoomScalar;

            canvas.setZoom(fitZoom);
            const vpt = canvas.viewportTransform;
            if (vpt) {
                // [FIX] preserveZoom이 참이면 사용자의 수동 panOffset을 가산하여 뷰포트 상대 정렬을 완벽하게 맞춥니다.
                let userPan = preserveZoom ? useCanvasStore.getState().userPan : { x: 0, y: 0 };

                // [NEW] EqMotionRunPara.ini에서 파생된 동적 stageLimit에 10% 비율 여백을 반영하여 userPan 제한
                const stageLimit = useAppStore.getState().stageLimit;
                const ratio = 0.1; // 10% 비율 추가 마진
                const spanX = stageLimit.maxX - stageLimit.minX;
                const spanY = stageLimit.maxY - stageLimit.minY;
                const limitMinX = stageLimit.minX - spanX * ratio;
                const limitMaxX = stageLimit.maxX + spanX * ratio;
                const limitMinY = stageLimit.minY - spanY * ratio;
                const limitMaxY = stageLimit.maxY + spanY * ratio;

                const activePxPerMm = useCanvasStore.getState().pxPerMm || { x: 1000, y: 1000 };
                
                // [FIX] userPan is the pixel offset relative to the camera center (pxX, pxY).
                // To guarantee the camera is ALWAYS visible when we "Fit to Camera" (even if it is outside the stage limit),
                // we expand the valid pan bounding box to include the current camera position.
                // Y is inverted in canvas: +Y world = -Y canvas (UP), -Y world = +Y canvas (DOWN).
                const panMinX = Math.min(limitMinX * activePxPerMm.x, pxX);
                const panMaxX = Math.max(limitMaxX * activePxPerMm.x, pxX);
                const panTop = Math.min(-(limitMaxY * activePxPerMm.y), pxY); // Topmost (most negative)
                const panBottom = Math.max(-(limitMinY * activePxPerMm.y), pxY); // Bottommost (most positive)

                const minUserPanX = (pxX - panMaxX) * fitZoom; // Always <= 0
                const maxUserPanX = (pxX - panMinX) * fitZoom; // Always >= 0
                const minUserPanY = (pxY - panBottom) * fitZoom; // Always <= 0
                const maxUserPanY = (pxY - panTop) * fitZoom; // Always >= 0

                if (userPan.x < minUserPanX) userPan.x = minUserPanX;
                if (userPan.x > maxUserPanX) userPan.x = maxUserPanX;
                if (userPan.y < minUserPanY) userPan.y = minUserPanY;
                if (userPan.y > maxUserPanY) userPan.y = maxUserPanY;

                // [FIX] Shift centering to avoid Ruler overlap (Left: 60px, Top: 20px)
                vpt[4] = ((canvas.width! + 60) / 2) + userPan.x - (pxX * fitZoom);
                vpt[5] = ((canvas.height! + 20) / 2) + userPan.y - (pxY * fitZoom);
                canvas.setViewportTransform(vpt);

                // [FIX] Synchronize Store for Background alignment
                const { setPan, setZoom, updateViewState, setIsFitCamera, setUserPan } = useCanvasStore.getState();
                if (!preserveZoom) {
                    setUserPan({ x: 0, y: 0 });
                }
                const curUserPan = preserveZoom ? useCanvasStore.getState().userPan : { x: 0, y: 0 };
                
                setPan({ x: vpt[4], y: vpt[5] });
                setZoom(fitZoom);
                setIsFitCamera(true); // [V14 FIX] Set isFitCamera to true (Fit to Camera Area)
                
                // [V14 FIX] Camera Mode (scanner & object): Save the current userPan instead of hardcoded {0,0}.
                // This ensures manual user panning offsets are preserved and combined with stage coordinates on restoration.
                updateViewState(viewStateKey, fitZoom, { x: curUserPan.x, y: curUserPan.y }, true);

                // [FIX] Force explicit event to trigger direct DOM sync in CanvasBackground
                canvas.fire('viewport:transformed' as any);
            }

            // [FIX] Immediate Stroke Update for non-grid hairlines
            // and force coordinate update for all objects
            canvas.getObjects().forEach(obj => {
                if ((obj as any).isHairline && !(obj as any).isGridLine) {
                    obj.set('strokeWidth', 2 / fitZoom);
                }
                obj.setCoords(); // [FIX] Force bounding box update
            });

            // [FIX] Redraw Grid to ensure perfect thickness and alignment
            const paper = canvas.getObjects().find(obj => (obj as any).isPaper);
            if (paper && drawGrid) {
                drawGrid(canvas, useCanvasStore.getState().showGrid, paper);
            }

            canvas.requestRenderAll();
            updateRuler(canvas.viewportTransform);
        }
    }, [canvas, viewMode, magnification, viewStateKey, updateRuler, maxZoomScalar, minZoomScalar, drawGrid]);


    // [V13 FIX] SubTitleBar 버튼 클릭으로 triggerFitCameraCount가 증가했을 때, 항상 Fit to Working Area를 수행합니다.
    // 컴포넌트가 새로 마운트되는 시점(예: 페이지 전환)에는 triggerFitCameraCount > 0 이더라도 
    // fitScreen()이 실행되지 않도록 isFirstMountRef 가드를 적용하여 이전 줌 상태 복원을 보호합니다.
    const isFirstMountRef = useRef(true);
    useLayoutEffect(() => {
        if (isFirstMountRef.current) {
            isFirstMountRef.current = false;
            return;
        }
        if (triggerFitCameraCount > 0) {
            fitScreenRef.current();
        }
    }, [triggerFitCameraCount]);


    // [NEW] Move to Center Handler
    /** @brief Move-to-Center 스테이지 이동 진행 여부(FAB 사이언 강조 및 재클릭 방지용) */
    const [isMovingToCenter, setIsMovingToCenter] = useState(false);

    const handleMoveToCenter = async () => {
        const mode = viewMode;
        if (mode === 'canvas') return;

        const mag = magnification;
        let preset: "scanner_base" | "object_x20" | "object_x50" = "scanner_base";

        if (mode === 'scanner') {
            preset = "scanner_base";
        } else if (mode === 'object') {
            preset = mag === 20 ? "object_x20" : "object_x50";
        }

        console.log('[RecipeCanvas] Move To Center Triggered (Force Absolute):', preset);
        setIsMovingToCenter(true);
        // [FIX] Pass forceAbsolute = true to absolute alignment to Original Center
        // 주의: cmd.moons.preset은 이동을 워커 스레드에 게시한 직후 응답하므로(접수 시점 resolve)
        // 이 await는 이동 완료를 의미하지 않는다. 완료 판정은 아래 settle 감시 effect가 담당한다.
        await hwFacade.moonsPreset(preset, false, true);
    };

    /**
     * @brief Move-to-Center 이동 종료 감시자 [Design Pattern: Observer — 스토어 positions 폴링 값 정착(settle) 감시]
     * @details
     *  - 최소 표시 1초: 백엔드가 "already at target"으로 이동을 스킵해도 짧게 점등 후 소등된다.
     *  - 300ms 간격으로 X/Y/Z 비교, 연속 2회 delta < 0.005mm면 정착으로 판정.
     *  - 하드 타임아웃 30초: C++ 각 이동 구간의 5초 워치독 * 다단계(SafeZ→XY→TargetZ)를 감안한 상한.
     */
    useEffect(() => {
        if (!isMovingToCenter) return;
        const t0 = Date.now();
        let last = { ...useAppStore.getState().positions };
        let stableCount = 0;
        const timer = setInterval(() => {
            const cur = useAppStore.getState().positions;
            const moved = (['X', 'Y', 'Z'] as const).some(a => Math.abs((cur[a] ?? 0) - (last[a] ?? 0)) > 0.005);
            stableCount = moved ? 0 : stableCount + 1;
            last = { ...cur };
            const elapsed = Date.now() - t0;
            if ((elapsed > 1000 && stableCount >= 2) || elapsed > 30000) {
                setIsMovingToCenter(false);
            }
        }, 300);
        return () => clearInterval(timer);
    }, [isMovingToCenter]);

    const hasObjectX20 = useAppStore.getState().features.hasObjectX20;

    // -------------------------------------------------------------------------
    // [V13] Auto-Save on ViewStateKey Change (Page/Mode Navigation)
    // -------------------------------------------------------------------------
    /**
     * @brief viewStateKey(페이지 또는 모드) 변경 시 이전 상태를 자동 저장합니다.
     * @details
     *  - useLayoutEffect는 useEffect(Restoration Effect)보다 먼저 실행됩니다.
     *  - 따라서 ① 이전 키 저장 → ② 새 키 복원 순서가 항상 보장됩니다.
     *  - 이 메커니즘이 없으면 수동 줌/패닝이 페이지 전환 시 소실됩니다.
     *  - Object mode는 pan={0,0}으로 저장 (stage 위치 기반 재계산이므로 pan 불필요)
     */
    const prevViewStateKeyRef = useRef<{ key: string; mode: 'scanner' | 'object' | 'canvas' }>({
        key: '',
        mode: 'scanner'
    });

    useLayoutEffect(() => {
        const prev = prevViewStateKeyRef.current;

        // viewStateKey가 바뀌는 순간 (페이지 전환 or 모드/배율 전환)
        // 이전 키의 현재 캔버스 상태를 저장한다
        if (prev.key && prev.key !== viewStateKey) {
            const c = useCanvasStore.getState().canvas;
            const ref = containerRef.current;
            if (c && !(c as any)._isDisposed && ref) {
                const zoom = c.getZoom();
                // zoom=1.0은 미초기화(기본값), zoom=0은 미설정 — 저장 제외
                if (zoom > 0 && zoom !== 1) {
                    const vpt = c.viewportTransform;
                    const cW = ref.clientWidth;
                    const cH = ref.clientHeight;
                    
                    // [V14 FIX] Save camera-relative userPan if isFitCamera is true.
                    // Otherwise save absolute ruler-adjusted stage-relative pan.
                    const isFitCamera = useCanvasStore.getState().isFitCamera;
                    let panX = 0;
                    let panY = 0;
                    if (isFitCamera) {
                        const curUserPan = useCanvasStore.getState().userPan;
                        panX = curUserPan.x;
                        panY = curUserPan.y;
                    } else {
                        panX = vpt ? vpt[4] - ((cW + 60) / 2) : 0;
                        panY = vpt ? vpt[5] - ((cH + 20) / 2) : 0;
                    }

                    console.log(`[RecipeCanvas] [AutoSave] ${prev.key} → ${viewStateKey}: zoom=${zoom.toFixed(4)}, pan=(${panX.toFixed(0)},${panY.toFixed(0)}), isFitCamera=${isFitCamera}`);
                    useCanvasStore.getState().updateViewState(prev.key, zoom, { x: panX, y: panY }, isFitCamera);
                }
            }
        }

        // 현재 키와 모드를 다음 비교를 위해 저장
        prevViewStateKeyRef.current = { key: viewStateKey, mode: viewMode };
    }, [viewStateKey, viewMode]); // viewStateKey 또는 viewMode 변경 시 실행

    useEffect(() => {

        if (!canvas) return;

        // [FIX] Update saveViewStateRef so onBeforeDispose can save BEFORE canvas is disposed
        saveViewStateRef.current = () => {
            if (!canvas) return; // [FIX] Remove dependency on containerRef to prevent data loss on unmount
            const zoom = canvas.getZoom();
            const vpt = canvas.viewportTransform;
            
            // [FIX] Use canvas dimensions instead of DOM dimensions which might be null during unmount
            const containerW = canvas.width || 1000;
            const containerH = canvas.height || 1000;
            
            // [V14 FIX] Save camera-relative userPan if isFitCamera is true.
            // Otherwise save absolute ruler-adjusted stage-relative pan.
            const isFitCamera = useCanvasStore.getState().isFitCamera;
            let panX = 0;
            let panY = 0;
            if (isFitCamera) {
                const curUserPan = useCanvasStore.getState().userPan;
                panX = curUserPan.x;
                panY = curUserPan.y;
            } else {
                panX = vpt ? vpt[4] - ((containerW + 60) / 2) : 0;
                panY = vpt ? vpt[5] - ((containerH + 20) / 2) : 0;
            }
            
            // [V10] Guard against saving legacy 100% (1.0) zoom during disposal/unmount
            if (zoom === 1) {
                console.log(`[RecipeCanvas] Skipping save for ${viewStateKey} because zoom is 1.0 (Ambiguous)`);
                return;
            }

            console.log(`[RecipeCanvas] Saving ViewState for ${viewStateKey}:`, { zoom, pan: { x: panX, y: panY }, isFitCamera });
            updateViewState(viewStateKey, zoom, { x: panX, y: panY }, isFitCamera);
        };
    }, [canvas, viewStateKey, updateViewState]);

    // [FIX] Store fitCameraArea and fitScreen in refs to prevent Restoration effect from re-running when positions change
    const fitCameraAreaRef = useRef(fitCameraArea);
    const fitScreenRef = useRef(fitScreen);

    useEffect(() => {
        fitCameraAreaRef.current = fitCameraArea;
        fitScreenRef.current = fitScreen;
    }, [fitCameraArea, fitScreen]);

    // [NEW] 2-Step Auto-Focus Sequence State based on Stage Stabilization (Stopping)
    const isPendingAutoCameraFitRef = useRef(false);
    const lastPosRef = useRef({ X: positions.X, Y: positions.Y, Z: positions.Z });
    const stableTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!isPendingAutoCameraFitRef.current) return;

        const diffX = Math.abs(positions.X - lastPosRef.current.X);
        const diffY = Math.abs(positions.Y - lastPosRef.current.Y);
        const diffZ = Math.abs(positions.Z - lastPosRef.current.Z);

        // Update tracking reference
        lastPosRef.current = { X: positions.X, Y: positions.Y, Z: positions.Z };

        // If stage is currently moving (diff >= 0.003mm), clear any stable timer
        if (diffX >= 0.003 || diffY >= 0.003 || diffZ >= 0.003) {
            if (stableTimerRef.current) {
                clearTimeout(stableTimerRef.current);
                stableTimerRef.current = null;
            }
            return;
        }

        // Stage is stationary! Wait 500ms to ensure mechanical settlement
        if (!stableTimerRef.current) {
            stableTimerRef.current = setTimeout(() => {
                if (!isPendingAutoCameraFitRef.current) return;
                console.log(`[RecipeCanvas] Stage stationary stabilized. Executing Fit to Camera. Positions:`, positions);
                isPendingAutoCameraFitRef.current = false;
                useCanvasStore.getState().setIsFitCamera(true);
                fitCameraAreaRef.current(false);
                stableTimerRef.current = null;
            }, 500);
        }
    }, [positions.X, positions.Y, positions.Z, canvas, triggerFitCameraCount]);

    // Unmount 시에만 타이머 정리 (메모리 누수 방지)
    useEffect(() => {
        return () => {
            if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
        };
    }, []);

    /**
     * @brief 최초 하드웨어 좌표 싱크 여부를 추적합니다.
     * @details 프로그램 재기동 극초기에 positions가 (0,0) 기본값으로 읽혀
     *          오브젝트 모드에 있는 장비가 목표지에 도달한 것으로 오판하는 오작동을 방지합니다.
     */
    const [isFirstPositionsSynced, setIsFirstPositionsSynced] = useState(false);
    
    useEffect(() => {
        setIsFirstPositionsSynced(true);
    }, [positions]);

    useEffect(() => {
        const tid = setTimeout(() => {
            setIsFirstPositionsSynced(true);
        }, 1000);
        return () => clearTimeout(tid);
    }, []);

    /**
     * @brief 뷰포트 상태 복원 및 초기화 로직
     * @details 기동 후 최초 싱크 및 페이지 전환 시 이전 줌/팬 상태를 복원합니다.
     */
    useEffect(() => {
        if (!canvas || (canvas as any)._isDisposed) return;
        if (!isFirstPositionsSynced) return;

        const currentScopePrefix = scope.split(':')[0];
        const isScopeSwitch = !!(globalLastScope && globalLastScope !== currentScopePrefix);
        const lastScope = globalLastScope;
        globalLastScope = currentScopePrefix; // [FIX] 얼리 리턴에 따른 변수 누락 방지를 위해 즉시 최신화

        const currentCameraMode = `${viewMode}_${magnification}`;
        const isModeSwitch = globalLastCameraMode !== currentCameraMode;
        const lastCameraMode = globalLastCameraMode;
        globalLastCameraMode = currentCameraMode; // [FIX] 얼리 리턴에 따른 변수 누락 방지를 위해 즉시 최신화

        // UI 모드 변경이거나, 물리적으로 아직 목표 지점에 도달하지 못한 경우를 실제 전환(Transition)으로 봅니다.
        const isActualTransition = isModeSwitch;

        const { viewStates, isInitialLoad, setIsInitialLoad } = useCanvasStore.getState();
        let state = viewStates?.[viewStateKey];
        if (viewMode === 'canvas') state = viewStates['canvas'];

        const isCameraMode = viewMode === 'scanner' || viewMode === 'object';
        const isFitCameraStored = state ? (state.isFitCamera !== undefined ? state.isFitCamera : isCameraMode) : isCameraMode;
        
        const hasSavedState = !!(state && state.zoom > 0);
        let tid1: ReturnType<typeof setTimeout>;

        if (hasSavedState && !isInitialLoad) {
            const shouldApplyStageState = (!isCameraMode || !isFitCameraStored);
            
            if (shouldApplyStageState) {
                const containerW = containerRef.current?.clientWidth || 1000;
                const containerH = containerRef.current?.clientHeight || 1000;
                const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
                vpt[0] = state!.zoom;
                vpt[3] = state!.zoom;
                vpt[4] = ((containerW + 60) / 2) + state!.pan.x;
                vpt[5] = ((containerH + 20) / 2) + state!.pan.y;

                canvas.setViewportTransform(vpt);
                useCanvasStore.getState().setZoom(state!.zoom);
                useCanvasStore.getState().setPan({ x: vpt[4], y: vpt[5] });
                useCanvasStore.getState().setIsFitCamera(false);

                canvas.requestRenderAll();
                if (updateRuler) updateRuler(vpt);
                
                console.log(`[RecipeCanvas] SUCCESS: Restored Stage-Relative ViewState for ${viewStateKey}:`, { zoom: state!.zoom, pan: state!.pan });
                return;
            } else {
                console.log(`[RecipeCanvas] Restoring Camera-Relative zoom and userPan for ${viewStateKey}:`, { zoom: state!.zoom, userPan: state!.pan });
                useCanvasStore.getState().setUserPan({ x: state!.pan.x, y: state!.pan.y });
                
                const isPureModeSwitch = isModeSwitch && !isScopeSwitch;
                if (!isPureModeSwitch) {
                    canvas.setZoom(state!.zoom);
                    useCanvasStore.getState().setZoom(state!.zoom);
                    useCanvasStore.getState().setIsFitCamera(true);
                    fitCameraAreaRef.current(true);
                    console.log('[RecipeCanvas] Restore Complete: Restored camera view state immediately.');
                    return;
                } else {
                    console.log('[RecipeCanvas] Mode Switch detected on same page. Deferring camera fit for 2-step alignment sequence.');
                }
            }
        }

        console.log('[RecipeCanvas] Initializing View. Mode:', viewMode, 'isInitialLoad:', isInitialLoad, 'hasSavedState:', hasSavedState);
        if (isInitialLoad) setIsInitialLoad(false);
        
        if (isCameraMode) {
            // [FIX] 2-Step Tracking 중에는 다른 의존성(pxPerMm 등) 업데이트로 인한 리렌더링이
            // 강제로 Fit to Camera를 발생시켜 Tracking을 취소하지 않도록 방어합니다.
            if (isPendingAutoCameraFitRef.current) {
                console.log('[RecipeCanvas] 2-Step tracking is in progress. Skipping view restoration override.');
                return;
            }

            if (!isActualTransition) {
                console.log('[RecipeCanvas] Forcing default Fit to Camera immediately.');
                useCanvasStore.getState().setIsFitCamera(true);
                fitCameraAreaRef.current(false);
            } else {
                console.log('[RecipeCanvas] Executing Fit to Workarea for mode switch tracking.');
                useCanvasStore.getState().setIsFitCamera(false);
                fitScreenRef.current();
                
                isPendingAutoCameraFitRef.current = true;
            }
        } else {
            useCanvasStore.getState().setIsFitCamera(false);
            fitScreenRef.current();
        }

        return () => {
            if (tid1) clearTimeout(tid1);
        };
    }, [canvas, viewStateKey, viewMode, scope, updateRuler, drawGrid, pxPerMm, isFirstPositionsSynced]);



    // [NEW] 가공 시작(false->true) 시 현재 뷰포트 프레이밍을 camera-relative userPan으로 1회 환산.
    // 자유 이동(free-roam) 상태에서는 스테이지가 움직여도 updateRuler가 돌지 않아 userPan이
    // 낡아 있을 수 있으므로, 추적 시작 직전에 현재 구도를 그대로 보존하도록 동기화합니다.
    const prevProcessFollowRef = useRef(false);
    useEffect(() => {
        const followProcessing = isProcessingLocal && viewMode === 'object';
        if (followProcessing && !prevProcessFollowRef.current && canvas) {
            const vpt = canvas.viewportTransform;
            if (vpt) {
                const activePxPerMm = useCanvasStore.getState().pxPerMm || { x: 1000, y: 1000 };
                const pos = useAppStore.getState().positions;
                const { x: pxX, y: pxY } = stageToScenePx(pos.X, pos.Y, activePxPerMm);
                const zoom = canvas.getZoom();
                useCanvasStore.getState().setUserPan({
                    x: vpt[4] - ((canvas.width! + 60) / 2) + pxX * zoom,
                    y: vpt[5] - ((canvas.height! + 20) / 2) + pxY * zoom,
                });
            }
        }
        prevProcessFollowRef.current = followProcessing;
    }, [isProcessingLocal, viewMode, canvas]);

    // [NEW] Fit to Camera 상태일 때 JOG 동작에 맞춰 뷰포트를 실시간 정렬 (카메라 화면 중앙 고정)
    // JOG 동작 중의 잦은 갱신으로 인한 떨림(Jittering)을 방지하기 위해,
    // Zustand 스토어 및 LocalStorage/Config 저장을 거치지 않고 Fabric 캔버스 뷰포트 행렬과 Ruler를 다이렉트로 직접 갱신합니다.
    // [FIX] 오브젝트 가공 중에는 fit 상태가 아니어도 카메라 뷰(=마킹 지점)를 절대 좌표로 추적합니다.
    // 스테이지가 곧 카메라이므로 이 단일 수식이 곧 "도형 궤적 따라가기"이며,
    // 구 변위(lastProcessStartPosition) 기반 추적 경로는 폐기되었습니다.
    useEffect(() => {
        const isFitCamera = useCanvasStore.getState().isFitCamera;
        const followProcessing = isProcessingLocal && viewMode === 'object';
        if (!canvas || (!isFitCamera && !followProcessing)) return;

        const activePxPerMm = useCanvasStore.getState().pxPerMm || { x: 1000, y: 1000 };
        const vpt = canvas.viewportTransform;
        if (vpt) {
            // [FIX] scene = 절대 기계 좌표 (sceneCoords.ts 단일 수식).
            // CanvasBackground / useGridSystem / fitCameraArea와 동일한 투영을 공유해야
            // JOG 추적 중 뷰포트가 튀지 않습니다.
            const { x: pxX, y: pxY } = stageToScenePx(positions.X, positions.Y, activePxPerMm);
            const currentZoom = canvas.getZoom();
            const userPan = useCanvasStore.getState().userPan;

            // 뷰포트 오프셋 계산 (Ruler 마진 60px, 20px 반영)
            vpt[4] = ((canvas.width! + 60) / 2) + userPan.x - (pxX * currentZoom);
            vpt[5] = ((canvas.height! + 20) / 2) + userPan.y - (pxY * currentZoom);

            canvas.setViewportTransform(vpt);

            // 캔버스 강제 동적 렌더 및 눈금자 갱신 (Zustand 스토어 갱신 우회)
            canvas.requestRenderAll();
            if (updateRuler) updateRuler(vpt);

            // CanvasBackground의 수동 DOM 좌표 동기화 트리거
            canvas.fire('viewport:transformed' as any);
        }
    }, [positions.X, positions.Y, canvas, viewMode, magnification, updateRuler, isProcessingLocal]);

    // Update onResize behavior
    useEffect(() => {
        onResizeRef.current = () => {
            const canvas = useCanvasStore.getState().canvas;
            if (!canvas || !containerRef.current || (canvas as any)._isDisposed || typeof canvas.setWidth !== 'function') return;

            const containerW = containerRef.current.clientWidth;
            const containerH = containerRef.current.clientHeight;
            const vpt = canvas.viewportTransform;

            // [FIX] On resize, maintain the current zoom level.
            // Instead of calling fitScreen() which resets zoom, we just re-center
            // the viewport relative to the new container size while keeping the zoom scalar.
            if (vpt) {
                // Compute the offset from canvas center (excluding Ruler) to viewport center (pan offset)
                const prevCenterX = ((canvas.width || containerW) + 60) / 2;
                const prevCenterY = ((canvas.height || containerH) + 20) / 2;
                const panOffsetX = vpt[4] - prevCenterX;
                const panOffsetY = vpt[5] - prevCenterY;

                // Update canvas dimensions to new container
                canvas.setWidth(containerW);
                canvas.setHeight(containerH);

                // Re-apply pan offset relative to new center (shifted for Ruler)
                vpt[4] = (containerW + 60) / 2 + panOffsetX;
                vpt[5] = (containerH + 20) / 2 + panOffsetY;
                canvas.setViewportTransform(vpt);
            }

            // Redraw grid / crosshair to match new dimensions
            const { viewMode: currentMode, showGrid } = useCanvasStore.getState();
            const paper = canvas.getObjects().find(obj => (obj as any).isPaper);
            if (paper && drawGrid) {
                drawGrid(canvas, showGrid, paper);
            }
            if (updateRuler) updateRuler(canvas.viewportTransform);
            canvas.requestRenderAll();
        };
    }, [fitScreen, drawGrid, updateRuler]);


    // [FIX] Removed redundant fitScreen effect on cameraConfig load.
    // This was causing mandatory resets to 'fit to screen' (0.44%) on every page switch.
    // View restoration is now handled exclusively by the primary restore effect.






    // 3. History System
    const { saveHistory, undo, redo } = useHistorySystem(initPaper, updateRuler);

    // 4. Clipboard System
    const { copy, paste, cut } = useClipboardSystem(saveHistory);

    // 4-1. PowerPoint식 Ctrl+드래그 복제 (Ctrl+클릭 다중선택은 useCanvasSetup의 selectionKey가 담당)
    useDragDuplicate();

    // 5. Events & Interaction
    const {
        resetInteraction,
        resetTempState,
        handleCompletePolyline,
        handleCompletePolylineShape,
        isSpacePressed
    } = useCanvasEvents({
        saveHistory,
        drawGrid,
        updateRuler,
        setContextMenu
    });

    const userPan = useCanvasStore(s => s.userPan);

    const handleGroup = useCallback(() => {
        if (!canvas) return;
        
        // 1. Fallback to backup objects or active selection
        let objsToGroup = (canvas as any)._contextMenuObjectsBackup as fabric.Object[] | undefined;
        if (!objsToGroup || objsToGroup.length <= 1) {
            objsToGroup = canvas.getActiveObjects();
        }

        if (!objsToGroup || objsToGroup.length <= 1) {
            console.log('[handleGroup] No objects or insufficient objects to group');
            return;
        }

        // 2. Clear backup
        (canvas as any)._contextMenuObjectsBackup = null;

        // 3. Discard active selection to avoid layout corruption
        canvas.discardActiveObject();

        // 4. Remove elements from canvas first so they can be adopted by the new Group
        objsToGroup.forEach(obj => {
            canvas.remove(obj);
        });

        // 5. Build programmatical fabric.Group
        const allObjects = canvas.getObjects();
        const groupCount = allObjects.filter(o => o.type === 'group').length + 1;

        const group = new fabric.Group(objsToGroup, {
            name: `Group ${groupCount}`,
            canvas: canvas
        });

        // 6. Add and set active
        canvas.add(group);
        canvas.setActiveObject(group);
        canvas.requestRenderAll();
        saveHistory();
        
        console.log('[handleGroup] Group created successfully:', group.name);
    }, [canvas, saveHistory]);

    const handleUngroup = useCallback(() => {
        if (!canvas) return;
        
        // Backup restore logic when context menu discards canvas selection
        let activeObj = canvas.getActiveObject();
        const backupObjects = (canvas as any)._contextMenuObjectsBackup as fabric.Object[] | undefined;
        if (!activeObj && backupObjects && backupObjects.length === 1) {
            activeObj = backupObjects[0];
        }

        if (!activeObj) {
            console.log('[handleUngroup] No active object or backup target to ungroup');
            return;
        }

        // Reset context menu backup
        (canvas as any)._contextMenuObjectsBackup = null;

        if (activeObj.type === 'MatrixRepeater') {
            const repeater = activeObj as any; // Typecast to access MatrixRepeater options
            const pxSpacingX = repeater.xSpacing;
            const pxSpacingY = repeater.ySpacing;
            
            // Collect all cloning promises
            const clonePromises: Promise<fabric.Object>[] = [];
            const placementOffsets: { dx: number, dy: number, cellKey: string }[] = [];

            for (let row = 0; row < repeater.yCount; row++) {
                for (let col = 0; col < repeater.xCount; col++) {
                    const isReverse = repeater.isZigzag && (row % 2 !== 0);
                    const actualCol = isReverse ? (repeater.xCount - 1 - col) : col;
                    const cellKey = `${row}_${actualCol}`;
                    const override = repeater.overrides[cellKey];

                    if (override?.visible === false) continue;

                    // Match normalized left/top spacing origin of the repeater
                    const dx = actualCol * pxSpacingX + (override?.xOffset || 0);
                    const dy = row * pxSpacingY + (override?.yOffset || 0);

                    repeater.sourceObjects.forEach((srcObj: fabric.Object) => {
                        clonePromises.push(srcObj.clone([
                            'id', 'name', 'markPointTime', 'customData', 'fillSettings', 
                            'isMeasurement', 'isGuide', 'isTemp', 'fillEnabled', 'strokeEnabled', 'fillOpacity'
                        ]));
                        placementOffsets.push({ dx, dy, cellKey });
                    });
                }
            }

            Promise.all(clonePromises).then((clonedObjects) => {
                const repeaterMatrix = repeater.calcTransformMatrix();
                const addedItems: fabric.Object[] = [];
                const existingNames = new Set(canvas.getObjects().map(o => o.name).filter(Boolean));

                clonedObjects.forEach((cloned, idx) => {
                    const { dx, dy } = placementOffsets[idx];
                    const srcObj = repeater.sourceObjects[idx % repeater.sourceObjects.length];
                    
                    // Local coords in MatrixRepeater group context
                    const localX = cloned.left! + dx;
                    const localY = cloned.top! + dy;

                    // Project local point to world coordinate space using repeater's transform matrix
                    const worldPoint = fabric.util.transformPoint(new fabric.Point(localX, localY), repeaterMatrix);
                    
                    cloned.set({
                        left: worldPoint.x,
                        top: worldPoint.y,
                        originX: srcObj.originX || 'left',
                        originY: srcObj.originY || 'top',
                        selectable: true,
                        evented: true,
                        excludeFromExport: false
                    });

                    // Remove matrix repeater meta properties
                    if (cloned.customData) {
                        const newCustomData = { ...cloned.customData };
                        delete newCustomData.isMatrixChild;
                        delete newCustomData.matrixSessionId;
                        delete newCustomData.matrixId;
                        cloned.set('customData', newCustomData);
                    }

                    // Handle unique name assignment for Dots
                    if (cloned.name && cloned.name.startsWith('Dot ')) {
                        let dotIdx = 1;
                        while (existingNames.has(`Dot ${dotIdx}`)) {
                            dotIdx++;
                        }
                        const newName = `Dot ${dotIdx}`;
                        cloned.set('name', newName);
                        existingNames.add(newName);
                    } else {
                        const baseName = cloned.name || 'Object';
                        let copyIdx = 1;
                        while (existingNames.has(`${baseName} (Copy ${copyIdx})`)) {
                            copyIdx++;
                        }
                        const newName = `${baseName} (Copy ${copyIdx})`;
                        cloned.set('name', newName);
                        existingNames.add(newName);
                    }

                    canvas.add(cloned);
                    addedItems.push(cloned);
                });

                // Remove the parent MatrixRepeater container
                canvas.remove(repeater);

                // Force immediate zoom scale correction for unpacked constant size objects
                canvas.fire('viewport:transformed');

                // Group-select all unpacked children
                const sel = new (fabric as any).ActiveSelection(addedItems, { canvas });
                canvas.setActiveObject(sel);
                canvas.requestRenderAll();
                saveHistory();
            }).catch(e => {
                console.error("[RecipeCanvas] Failed to decompose MatrixRepeater:", e);
            });
        } 
        else if (activeObj && (activeObj.type === 'Group' || activeObj.type === 'group' || activeObj.type.toLowerCase() === 'group')) {
            const group = activeObj as fabric.Group;
            
            // Force set as active object before ungrouping so Fabric internal coordinates correctly unravel
            canvas.setActiveObject(group);
            
            // Unpack cleanly using native method
            group.toActiveSelection();

            canvas.requestRenderAll();
            saveHistory();
            console.log('[handleUngroup] Group decomposed natively and cleanly');
        }
    }, [canvas, saveHistory]);

    // [REMOVED] 구 가공 변위(lastProcessStartPosition 대비) 추적 이펙트를 삭제했습니다.
    // 해당 이펙트는 updateRuler의 가공 분기와 순환 참조(userPan 읽기 -> vpt 쓰기 -> userPan 되쓰기)를
    // 이루어 매 positions 틱마다 뷰포트가 누적 발산하는 원인이었습니다 (가공 중 fit to camera 이탈 353mm 사고).
    // 가공 중 카메라 추적은 아래 JOG 절대 추적 이펙트가 절대 좌표 단일 수식으로 담당합니다.


    // 6. Shortcuts
    const { handleSelectAll } = useCanvasShortcuts({
        saveHistory,
        undo,
        redo,
        copy,
        paste,
        cut,
        resetInteraction,
        resetTempState,
        handleCompletePolyline,
        handleCompletePolylineShape,
        isSpacePressed,
        handleGroup,
        handleUngroup
    });

    const handleClearMeasurements = () => {
        const canvas = useCanvasStore.getState().canvas;
        if (!canvas) return;

        const objects = canvas.getObjects();
        objects.forEach((obj) => {
            if ((obj as any).isMeasurement) {
                canvas.remove(obj);
            }
        });
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        saveHistory();
    };

    const handleDeleteAll = () => {
        const canvas = useCanvasStore.getState().canvas;
        if (!canvas) return;

        const objects = canvas.getObjects();
        objects.forEach((obj) => {
            if (!(obj as any).isPaper && !(obj as any).isGridLine && !(obj as any).isGuide && !(obj as any).isCrosshair) {
                canvas.remove(obj);
            }
        });
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        saveHistory();
    };

    // -------------------------------------------------------------------------
    // Debounced Grid Updater (for smooth panning)
    // -------------------------------------------------------------------------
    const gridUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!canvas) return;
        if (gridUpdateTimeoutRef.current) clearTimeout(gridUpdateTimeoutRef.current);
        
        gridUpdateTimeoutRef.current = setTimeout(() => {
            const paper = canvas.getObjects().find(obj => (obj as any).isPaper);
            if (paper && drawGridRef.current) {
                drawGridRef.current(canvas, useCanvasStore.getState().showGrid, paper);
            }
        }, 300); // 300ms debounce ensures zero lag while actively panning/jogging
        
        return () => {
            if (gridUpdateTimeoutRef.current) clearTimeout(gridUpdateTimeoutRef.current);
        };
    }, [userPan.x, userPan.y, positions.X, positions.Y, currentZoom, canvas]);

    /**
     * @brief [P3] 캔버스 드래그 앤 드롭 파일 로드.
     * 여러 파일을 동시에 드롭할 수 있으며 각 파일은 통합 디스패처(importFile)로 라우팅된다.
     * @note Recipe 페이지(scope='recipe')에서만 허용된다. Main/Calibration 등
     *       다른 페이지에서는 드롭이 무시된다(Guard Clause 패턴).
     */
    const isRecipeScope = scope.split(':')[0] === 'recipe';

    const handleFileDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isRecipeScope) {
            useAppStore.getState().showToast('File import is only available on the Recipe page', 'error');
            return;
        }
        const canvas = useCanvasStore.getState().canvas;
        const files = Array.from(e.dataTransfer?.files || []);
        if (!canvas || files.length === 0) return;

        for (const file of files) {
            try {
                const result = await importFile(canvas, file);
                const countText = result.count > 0 ? `, ${result.count} object${result.count > 1 ? 's' : ''}` : '';
                useAppStore.getState().showToast(`Imported ${file.name} (${result.format.toUpperCase()}${countText})`, 'success');
            } catch (err) {
                console.error('[Canvas Drop] Import failed:', err);
                useAppStore.getState().showToast(err instanceof Error ? err.message : `Failed to import ${file.name}`, 'error');
            }
        }
    }, [isRecipeScope]);

    return (
        <div
            ref={containerRef}
            className={isNavigateMode ? 'navigate-mode-cursor' : undefined}
            style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                overflow: 'hidden',
                backgroundColor: '#28292d',
                // [FIX] Strictly contain all rendering to this box
                isolation: 'isolate',
                contain: 'strict',
                zIndex: 1
            }}
            onContextMenu={(e) => e.preventDefault()}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = isRecipeScope ? 'copy' : 'none'; }}
            onDrop={handleFileDrop}
        >
            {(() => {
                const containerW = containerRef.current?.clientWidth || 0;
                const containerH = containerRef.current?.clientHeight || 0;

                return (
                    <>
                        <CanvasBackground 
                            key={viewMode} 
                            imageScaleX={imageScaleX} 
                            imageScaleY={imageScaleY} 
                        />

                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}>
                            <canvas ref={canvasRef} />
                        </div>

                        {/* Read-only Shape Overlay (z-index 10) */}
                        {isMainScope && (
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10, pointerEvents: 'none' }}>
                                <canvas ref={overlayCanvasRef} />
                            </div>
                        )}

                        <CanvasTopBar />

                        {/* HUD Elements (Ruler, ScaleBar) - Use Direct Subscription */}
                        <Ruler
                            orientation="horizontal"
                            length={containerW}
                            pxScalingFactor={pxPerMm.x}
                        />
                        <Ruler
                            orientation="vertical"
                            length={containerH}
                            pxScalingFactor={pxPerMm.y}
                        />
                        <ScaleBar />
                    </>
                );
            })()}


            <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 20, pointerEvents: 'none' }}>
                <ZoomControl
                    zoom={currentZoom * 100}
                    maxZoom={maxZoomPercent}
                    minZoom={minZoomPercent}
                    isFitCamera={useCanvasStore(s => s.isFitCamera)}
                    onZoomIn={() => {
                        const canvas = useCanvasStore.getState().canvas;
                        if (canvas) {
                            let zoom = canvas.getZoom();
                            zoom *= 1.25;
                            if (zoom > maxZoomScalar) zoom = maxZoomScalar;
                            if (zoom < minZoomScalar) zoom = minZoomScalar;

                            canvas.zoomToPoint(new fabric.Point(canvas.width! / 2, canvas.height! / 2), zoom);
                            updateRuler();

                            /**
                             * @brief 줌 배율 확대 시 하이라인 가공선 두께 실시간 스케일 보정을 수행합니다.
                             */
                            const updateHairline = (obj: any) => {
                                if (obj.isHairline && !obj.isGridLine) {
                                    obj.set('strokeWidth', 2 / zoom);
                                }
                                obj.setCoords();
                                if (obj.type === 'group' || obj.getObjects) {
                                    obj.getObjects().forEach(updateHairline);
                                }
                            };
                            canvas.getObjects().forEach(updateHairline);

                            const paper = canvas.getObjects().find(obj => (obj as any).isPaper);
                            if (paper) drawGrid(canvas, useCanvasStore.getState().showGrid, paper);

                            // [FIX] Ensure active object controls are updated
                            const activeObj = canvas.getActiveObject();
                            if (activeObj) {
                                activeObj.setCoords();
                            }
                            canvas.requestRenderAll();
                        }
                    }}
                    onZoomOut={() => {
                        const canvas = useCanvasStore.getState().canvas;
                        if (canvas) {
                            let zoom = canvas.getZoom();
                            zoom /= 1.25;
                            if (zoom < minZoomScalar) zoom = minZoomScalar;
                            if (zoom > maxZoomScalar) zoom = maxZoomScalar;

                            canvas.zoomToPoint(new fabric.Point(canvas.width! / 2, canvas.height! / 2), zoom);
                            updateRuler();

                            /**
                             * @brief 줌 배율 축소 시 하이라인 가공선 두께 실시간 스케일 보정을 수행합니다.
                             */
                            const updateHairline = (obj: any) => {
                                if (obj.isHairline && !obj.isGridLine) {
                                    obj.set('strokeWidth', 2 / zoom);
                                }
                                obj.setCoords();
                                if (obj.type === 'group' || obj.getObjects) {
                                    obj.getObjects().forEach(updateHairline);
                                }
                            };
                            canvas.getObjects().forEach(updateHairline);

                            const paper = canvas.getObjects().find(obj => (obj as any).isPaper);
                            if (paper) drawGrid(canvas, useCanvasStore.getState().showGrid, paper);

                            // [FIX] Ensure active object controls are updated
                            const activeObj = canvas.getActiveObject();
                            if (activeObj) {
                                activeObj.setCoords();
                            }
                            canvas.requestRenderAll();
                        }
                    }}
                    onFitScreen={() => fitScreen()}
                    onFitStage={() => fitScreen()} // Fit Stage is current fitScreen (Fit Paper)
                    onFitCamera={() => fitCameraArea(false)} // [FIX] 버튼 클릭 시 MouseEvent 객체가 전달되어 preserveZoom이 true로 평가되는 문제를 방지하기 위해 명시적으로 false를 전달합니다.
                    onZoomChange={(newZoom) => {
                        const canvas = useCanvasStore.getState().canvas;
                        if (canvas) {
                            let scale = newZoom / 100;
                            if (scale > maxZoomScalar) scale = maxZoomScalar;
                            if (scale < minZoomScalar) scale = minZoomScalar;

                            canvas.zoomToPoint(new fabric.Point(canvas.width! / 2, canvas.height! / 2), scale);
                            updateRuler();

                            /**
                             * @brief 줌 배율 값 변경 시 하이라인 가공선 두께 실시간 스케일 보정을 수행합니다.
                             */
                            const updateHairline = (obj: any) => {
                                if (obj.isHairline && !obj.isGridLine) {
                                    obj.set('strokeWidth', 2 / scale);
                                }
                                obj.setCoords();
                                if (obj.type === 'group' || obj.getObjects) {
                                    obj.getObjects().forEach(updateHairline);
                                }
                            };
                            canvas.getObjects().forEach(updateHairline);

                            const paper = canvas.getObjects().find(obj => (obj as any).isPaper);
                            if (paper) drawGrid(canvas, useCanvasStore.getState().showGrid, paper);

                            // [FIX] Ensure active object controls are updated
                            const activeObj = canvas.getActiveObject();
                            if (activeObj) {
                                activeObj.setCoords();
                            }
                            canvas.requestRenderAll();
                        }
                    }}
                />
            </div>

            {/* [NEW] Move To Center Floating Action Button */}
            {viewMode !== 'canvas' && (
                <Box sx={{ 
                    position: 'absolute', 
                    // [UX/UI] 화면 폭 축소 시 줌 뱃지(bottom: 20px)와 겹침을 방지하기 위해 xs에서는 bottom: 80px로 배치
                    bottom: { xs: 80, md: 24 }, 
                    right: 24, 
                    zIndex: 30, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'flex-end', 
                    gap: 1,
                    pointerEvents: 'none' // Allow clicks to pass through except for FAB
                }}>
                    {/* [기능2 2026-07-22] 갈보 미러를 센터(0,0)로 이동(스테이지 아님). 스캐너 모드 전용,
                        Click-to-Move 버튼 위에 배치. 아래 MyLocation 버튼(스테이지 센터 이동)과 구분된다. */}
                    {viewMode === 'scanner' && (
                        <Tooltip
                            title={
                                isProcessingLocal
                                    ? 'Unavailable during processing'
                                    : 'Move to Scanner Center (galvo mirror → 0,0)'
                            }
                            placement="left"
                            arrow
                        >
                            <span style={{ pointerEvents: 'auto' }}>
                                <Fab
                                    size="medium"
                                    disabled={isHoming || isProcessingLocal}
                                    onClick={() => { hwFacade.scannerMoveToCenter(); }}
                                    sx={{
                                        boxShadow: 6,
                                        '&:hover': { transform: 'scale(1.05)' },
                                        transition: 'transform 0.2s, background-color 0.2s',
                                        bgcolor: theme.palette.background.paper,
                                        color: theme.palette.text.secondary,
                                        border: `1px solid ${theme.palette.divider}`,
                                    }}
                                >
                                    <CenterFocusStrongIcon />
                                </Fab>
                            </span>
                        </Tooltip>
                    )}
                    <Tooltip
                        title={
                            isHoming || isProcessingLocal
                                ? 'Click-to-Move is unavailable during homing/processing'
                                : `Click-to-Move: ${isNavigateMode ? 'ON' : 'OFF'} (double-click camera view to move stage there)`
                        }
                        placement="left"
                        arrow
                    >
                        {/* span wrapper so the tooltip still shows while the Fab is disabled */}
                        <span style={{ pointerEvents: 'auto' }}>
                            <Fab
                                size="medium"
                                disabled={isHoming || isProcessingLocal}
                                onClick={() => setIsNavigateMode(!isNavigateMode)}
                                sx={{
                                    boxShadow: 6,
                                    '&:hover': { transform: 'scale(1.05)' },
                                    transition: 'transform 0.2s, bottom 0.2s, background-color 0.2s',
                                    bgcolor: isNavigateMode ? theme.palette.primary.main : theme.palette.background.paper,
                                    color: isNavigateMode ? '#fff' : theme.palette.text.secondary,
                                    border: isNavigateMode ? 'none' : `1px solid ${theme.palette.divider}`,
                                }}
                            >
                                <TouchAppIcon />
                            </Fab>
                        </span>
                    </Tooltip>
                    <Tooltip
                        title={
                            isHoming || isProcessingLocal
                                ? 'Unavailable during homing/processing'
                                : isMovingToCenter
                                    ? 'Moving stage to center...'
                                    : `Move Stage to ${viewMode === 'scanner' ? 'Scanner' : 'Object x' + magnification} Center`
                        }
                        placement="left"
                        arrow
                    >
                        {/* span wrapper so the tooltip still shows while the Fab is disabled */}
                        <span style={{ pointerEvents: 'auto' }}>
                            <Fab
                                size="medium"
                                disabled={isHoming || isProcessingLocal || isMovingToCenter}
                                onClick={handleMoveToCenter}
                                // [UX/UI] variant="extended"를 제거하여 콤팩트한 원형 FAB으로 변경하고 텍스트 문구 생략
                                // [가공 잠금] 스테이지 이동 중에만 사이언(primary) 채움으로 표시하고,
                                // 평상시에는 다른 FAB과 동일한 비강조(배경색) 스타일을 쓴다.
                                sx={{
                                    boxShadow: 6,
                                    '&:hover': { transform: 'scale(1.05)' },
                                    transition: 'transform 0.2s, bottom 0.2s, background-color 0.2s',
                                    bgcolor: isMovingToCenter ? theme.palette.primary.main : theme.palette.background.paper,
                                    color: isMovingToCenter ? '#fff' : theme.palette.text.secondary,
                                    border: isMovingToCenter ? 'none' : `1px solid ${theme.palette.divider}`,
                                    // 이동 중에는 disabled(재클릭 방지)와 사이언 강조가 동시에 필요하므로
                                    // MUI 기본 disabled 회색이 강조색을 덮지 않도록 오버라이드한다.
                                    '&.Mui-disabled': isMovingToCenter
                                        ? { bgcolor: theme.palette.primary.main, color: '#fff' }
                                        : undefined,
                                }}
                            >
                                <MyLocationIcon />
                            </Fab>
                        </span>
                    </Tooltip>
                </Box>
            )}




            <CoordinateAxis style={{ position: 'absolute', top: 30, right: 20, zIndex: 20 }} />

            {/* [V9] Removed redundant useEffect that was interfering with zoom restoration */}



            {contextMenu && (
                <CanvasContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onMove={(newX, newY) => setContextMenu({ x: newX, y: newY })}
                    onClose={() => setContextMenu(null)}
                    showGrid={showGrid}
                    onToggleGrid={() => setShowGrid(!showGrid)}
                    showCross={showCross}
                    onToggleCross={() => setShowCross(!showCross)}
                    showCameraGrid={showCameraGrid}
                    onToggleCameraGrid={() => setShowCameraGrid(!showCameraGrid)}
                    showCameraCross={showCameraCross}
                    onToggleCameraCross={() => setShowCameraCross(!showCameraCross)}
                    showHidden={allObjectsHidden}
                    onToggleHidden={() => setAllObjectsHidden(!allObjectsHidden)}
                    activeTool={activeTool}
                    measureMode={measureMode}
                    onCompletePolyline={handleCompletePolyline}
                    onCompletePolylineShape={handleCompletePolylineShape}
                    onCopy={copy}
                    onPaste={paste}
                    onCut={cut}
                    onSelectAll={handleSelectAll}
                    onUndo={undo}
                    onRedo={redo}
                    onDeleteAll={handleDeleteAll}
                    onClearMeasurements={handleClearMeasurements}
                    onGroup={handleGroup}
                    onUngroup={handleUngroup}
                    canGroup={
                        canvas?.getActiveObject()?.type.toLowerCase() === 'activeselection' ||
                        (canvas && (canvas as any)._contextMenuObjectsBackup && (canvas as any)._contextMenuObjectsBackup.length > 1)
                    }
                    canUngroup={
                        canvas?.getActiveObject()?.type.toLowerCase() === 'group' || 
                        canvas?.getActiveObject()?.type === 'MatrixRepeater' ||
                        (canvas && (canvas as any)._contextMenuObjectsBackup && (canvas as any)._contextMenuObjectsBackup.length === 1 && 
                         ((canvas as any)._contextMenuObjectsBackup[0].type.toLowerCase() === 'group' || (canvas as any)._contextMenuObjectsBackup[0].type === 'MatrixRepeater'))
                    }
                />
            )}
        </div>
    );
}