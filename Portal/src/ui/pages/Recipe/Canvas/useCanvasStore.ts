import { create } from 'zustand';
import * as fabric from 'fabric';
import { MatrixOptions } from '@/hooks/useMatrixGenerator';
import { applyFabricPatch } from './fabricPatch';
import { IColorPreset } from '@/types/cad';
import { resolveObjectColorHex, getColorHex, collectStyleLeafObjects, replaceColorKeepAlpha } from '@/utils/colorUtils';
import { hwFacade } from '@/services/HardwareFacade';
import { useAppStore } from '@/store/appStore';

// Apply Fabric Patches (e.g., Underline in Stroke-only mode)
applyFabricPatch();

export type ToolType = 'select' | 'pan' | 'rect' | 'circle' | 'arc' | 'dot' | 'triangle' | 'line' | 'text' | 'polyline' | 'image' | 'measure' | 'polyline-shape' | 'laserCenter';

export type MeasureMode = 'distance' | 'rect' | 'circle' | 'width' | 'height' | 'angle' | 'polyline';

/** 색상 프리셋이 격리되는 렌즈/모드 스코프. 스캐너(갈보)와 오브젝트 x20/x50은 물리적 Z 위치와
 *  용도가 전혀 달라 Mark Speed/Times/Power/Z 프리셋을 공유하면 안 된다. */
export type LensScope = 'scanner' | 'object_x20' | 'object_x50';

interface CanvasState {
    canvas: fabric.Canvas | null;
    activeTool: ToolType;
    measureMode: MeasureMode;
    zoom: number;
    gridSize: number;
    selectedObject: fabric.Object | null;
    viewMode: 'scanner' | 'object' | 'canvas';
    showGrid: boolean;
    allObjectsHidden: boolean;
    savedState: any;
    history: string[];
    historyStep: number;
    pxPerMm: { x: number, y: number };
    userPan: { x: number, y: number };
    pan: { x: number, y: number };
    magnification: number;
    activeRightTab: 'motion' | 'gcode' | 'scanner' | 'process';
    scannerSettings: {
        feedRate: number;
        intensity: number;
        threshold: number;
        edgeDetection?: boolean; // Outline extraction mode
        shapeDelay: number; // in seconds
        markTimes: number; // repetition count
    };
    gcodeSettings: {
        feedRate: number;
        intensity: number;
        passes: number;
        safeZ: number;
        workingZ: number;
        includeComments: boolean;
        includeSafeZ: boolean;
        shapeDelay: number; // in seconds
        markTimes: number; // repetition count
        edgeDetection?: boolean; // Outline extraction mode
        threshold: number; // 0-100 sensitivity
    };
    setScannerSettings: (settings: Partial<CanvasState['scannerSettings']>) => void;
    setGcodeSettings: (settings: Partial<CanvasState['gcodeSettings']>) => void;

    // View State Persistence
    currentScope: 'main' | 'recipe' | 'calibration'; // [V13] Track current active page scope
    setCurrentScope: (scope: 'main' | 'recipe' | 'calibration') => void;
    viewStates: Record<string, { zoom: number; pan: { x: number; y: number }; isFitCamera?: boolean }>;
    isFitCamera: boolean;
    setIsFitCamera: (isFitCamera: boolean) => void;
    
    // [FIX] Initial Load Flag to force "Fit to Working Area" on first application start
    isInitialLoad: boolean;
    setIsInitialLoad: (val: boolean) => void;

    // Per-View Settings Persistence
    viewSettings: Record<string, { showGrid: boolean; showCross: boolean; showCameraGrid?: boolean; showCameraCross?: boolean }>;

    setViewMode: (mode: 'scanner' | 'object' | 'canvas') => void;
    updateViewState: (mode: string, zoom: number, pan: { x: number; y: number }, isFitCamera?: boolean) => void;

    // Camera Tools
    setActiveTool: (tool: ToolType) => void;
    setMeasureMode: (mode: MeasureMode) => void;
    setZoom: (zoom: number) => void;
    setSelectedObject: (obj: fabric.Object | null) => void;

    showCross: boolean;
    setShowCross: (show: boolean) => void;

    showCameraGrid: boolean;
    setShowCameraGrid: (show: boolean) => void;
    showCameraCross: boolean;
    setShowCameraCross: (show: boolean) => void;

    setShowGrid: (show: boolean) => void;
    setAllObjectsHidden: (hidden: boolean) => void;
    setAllObjectsHiddenOnly: (hidden: boolean) => void;
    setSavedState: (state: any) => void;
    setHistory: (history: string[]) => void;
    setHistoryStep: (step: number) => void;
    setPxPerMm: (val: { x: number, y: number }) => void;
    setUserPan: (val: { x: number, y: number }) => void;
    setMagnification: (val: number) => void;
    setActiveRightTab: (tab: 'motion' | 'gcode' | 'process') => void;
    setPan: (pan: { x: number, y: number }) => void;


    // Persisted G-Code State
    gcode: string;
    setGcode: (gcode: string) => void;

    // Persisted Scanner Commands State
    scannerCommands: any[];
    setScannerCommands: (commands: any[]) => void;

    // Camera Calibration (Global Variables)
    cameraCalibration: {
        scannerFov: number; // width in mm
        object20Fov: number;
        object50Fov: number;
    };
    setCameraCalibration: (cal: Partial<{ scannerFov: number; object20Fov: number; object50Fov: number }>) => void;

    // Multi-Camera Logic
    calibrationScales: Record<string, { x: number, y: number }>; // profile -> {px/mm x, px/mm y}
    setCalibrationScale: (profile: string, scale: { x: number, y: number }) => void;
    setCalibrationScales: (scales: Record<string, { x: number, y: number }>) => void;

    // Loaded Background Image (Offline/Analysis Mode)
    // Keys: 'scanner', 'object_x20', 'object_x50'
    loadedImages: Record<string, string | null>;
    setLoadedCameraImage: (url: string | null, key?: string) => void;

    showCalibrationDialog: boolean;
    setShowCalibrationDialog: (show: boolean) => void;

    showMatrixDialog: boolean;
    setShowMatrixDialog: (show: boolean) => void;

    showPresetLibraryDialog: boolean;
    setShowPresetLibraryDialog: (show: boolean) => void;

    showFillSettingsDialog: boolean;
    setShowFillSettingsDialog: (show: boolean) => void;
    
    matrixOptions: MatrixOptions;
    setMatrixOptions: (options: Partial<MatrixOptions>) => void;

    // Scope State
    canvasScopes: Record<string, { data: any; activeTool: ToolType; measureMode: MeasureMode }>;
    saveCanvasScope: (scope: string, data: any) => void;
    loadCanvasScope: (scope: string) => any;
    getCanvasScopeData: (scope: string) => any;

    // Layer List Visibility
    showLayerList: boolean;
    setShowLayerList: (show: boolean) => void;

    // Laser Set Center State
    showLaserSetCenterDialog: boolean;
    setShowLaserSetCenterDialog: (show: boolean) => void;
    laserClickPosition: { x: number, y: number } | null;
    setLaserClickPosition: (pos: { x: number, y: number } | null) => void;
    pickedPixel: { x: number, y: number } | null;
    setPickedPixel: (pos: { x: number, y: number } | null) => void;

    triggerFitCameraCount: number;
    triggerFitCamera: () => void;

    // Crosshair Offset
    crosshairOffset: { x: number, y: number };

    setCrosshairOffset: (offset: { x: number, y: number }) => void;

    // Calibration ROI
    calibrationROI: {
        active: boolean;
        viewRatio: number;
        center: { x: number; y: number } | null;
        isApplied?: boolean;
    };
    setCalibrationROI: (roi: Partial<{ active: boolean; viewRatio: number; center: { x: number; y: number } | null; isApplied?: boolean }>) => void;

    // Layer Naming (Color Alias)
    layerNames: Record<string, string>;
    setLayerName: (color: string, name: string) => void;

    // Color Preset System (색상별 Mark Times/Speed/Power/Z 프리셋)
    /** 레시피에 내장되어 저장/로드되는 색상별 프리셋. 스캐너/오브젝트 x20/x50 스코프별로 완전히 분리 관리한다
     *  (물리적 Z 위치·용도가 모드마다 달라 프리셋을 공유하면 안 된다). */
    colorPresets: Record<LensScope, Record<string, IColorPreset>>;
    setColorPreset: (color: string, patch: Partial<IColorPreset>) => void;
    removeColorPreset: (color: string) => void;
    /** 현재 활성 모드(뷰모드+배율) 기준 스코프 키를 반환한다. */
    getLensScope: () => LensScope;
    /** 해당 색상의 프리셋이 현재 스코프(뷰모드/배율)에 없으면 고정 기본값(+현재 모션 Z축 위치)을 반환한다. */
    getColorPresetOrDefault: (color: string) => IColorPreset;

    /** 프로젝트와 무관하게 재사용 가능한 이름 붙은 전역 프리셋 라이브러리. */
    presetLibrary: IColorPreset[];
    setPresetLibrary: (library: IColorPreset[]) => void;
    saveColorAsLibraryPreset: (color: string, name: string) => void;
    deleteLibraryPreset: (name: string) => void;
    applyLibraryPresetToColor: (color: string, presetName: string) => void;
    /** 앱 부팅 시 1회 호출: Config\ColorPresetLibrary.json에서 전역 프리셋 라이브러리를 불러온다. */
    loadPresetLibraryData: () => Promise<void>;
    /** 라이브러리 변경(저장/삭제) 직후 호출해 Config\ColorPresetLibrary.json에 영속화한다. */
    savePresetLibraryData: () => Promise<void>;

    /** Layer-Default 패널의 "CurrentLayer" 선택 색상. */
    currentLayerColor: string | null;
    setCurrentLayerColor: (color: string | null) => void;

    /**
     * @brief 체크 시 currentLayerColor를 제외한 모든 도형(색상-분리된 도형 제외)의 실제
     *        색상을 currentLayerColor로 강제 변경하고 그 프리셋을 적용한다. 해제 시 각
     *        도형은 원래 색상(및 그 색상 고유 프리셋)으로 복원된다.
     * @details 스냅샷은 도형별 customData.originalColor/forcedByDefaultParams에 보관된다.
     *          여러 도형을 한번에 바꾸지만 'object:modified'를 1회만 발생시켜(useCanvasEvents.ts의
     *          전역 리스너가 saveHistory()를 호출) Undo 체크포인트가 도형 수만큼 쪼개지지 않는다.
     */
    useDefaultParameters: boolean;
    setUseDefaultParameters: (val: boolean) => void;

    // Generation Persistence State
    gcodeGenStatus: 'idle' | 'generating' | 'success';
    gcodeProgress: number;
    scannerGenStatus: 'idle' | 'generating' | 'success';
    scannerProgress: number;
    setGcodeGenStatus: (status: 'idle' | 'generating' | 'success') => void;
    setGcodeProgress: (progress: number) => void;
    setScannerGenStatus: (status: 'idle' | 'generating' | 'success') => void;
    setScannerProgress: (progress: number) => void;
    setCanvas: (canvas: fabric.Canvas | null) => void;

    hideOverlays: boolean;
    setHideOverlays: (val: boolean) => void;

    isProcessingLocal: boolean;
    setProcessingLocal: (val: boolean) => void;

    /** @brief 카메라 뷰 더블클릭으로 스테이지 이동, 오버레이 read-only 전환 모드 */
    isNavigateMode: boolean;
    setIsNavigateMode: (val: boolean) => void;
}

const INITIAL_VIEW_STATE = {
    zoom: 0, // [FIX] 0 means "Not set yet", triggering initial fitScreen
    pan: { x: 0, y: 0 },
    isFitCamera: false
};

export const useCanvasStore = create<CanvasState>((set, get) => ({
    canvas: null,
    activeTool: 'select',
    measureMode: 'rect',
    zoom: 1,
    gridSize: 10,
    selectedObject: null,
    viewMode: 'scanner',
    showGrid: true,
    allObjectsHidden: false,
    savedState: null,
    history: [],
    historyStep: -1,
    showLayerList: false, // Default Closed
    userPan: { x: 0, y: 0 },
    pan: { x: 0, y: 0 },


    // New Coordinate System State
    pxPerMm: { x: 1000, y: 1000 }, // Default to 1000 (Scanner/Canvas)
    magnification: 1, // Default 1x
    currentScope: 'main', // [V12] Default scope
    isFitCamera: true,
    isInitialLoad: true, // [FIX] Defaults to true on fresh application start
    activeRightTab: 'motion',
    scannerSettings: {
        feedRate: 1, // Default 1 mm/sec
        intensity: 1, // Default 1%
        threshold: 50, // Default 50%
        edgeDetection: true, // 
        shapeDelay: 0.0, // Default 0.0s (no delay)
        markTimes: 1, // Default 1 repeat
    },
    gcodeSettings: {
        feedRate: 0.01, // Default 0.01 mm/sec
        intensity: 1, // Default 1%
        passes: 1,
        safeZ: 0.0,
        workingZ: 0.0,
        includeComments: false,
        includeSafeZ: false,
        shapeDelay: 1.0, // Default 1000ms = 1.0s
        markTimes: 1, // Default 1 repeat
        edgeDetection: true, // Default to true for outline extraction
        threshold: 50, // Default 50%
    },

    // View States (Restored from localStorage if available)
    viewStates: (() => {
        try {
            const saved = sessionStorage.getItem('recipe_canvas_view_states');
            if (saved) {
                const parsed = JSON.parse(saved);
                // [V10 CRITICAL] Sanitize legacy 100% (1.0) data to force initial fitScreen
                // Otherwise, the system thinks "100%" is a user-saved preference.
                // [V11] Sanitize abnormally large pan values (caused by previous offset transform bug)
                // [V13 FIX] Raised to 500,000. Object mode now saves pan={0,0} always,
                // so only scanner panning is filtered. This acts as an extreme-value guard
                // for any future legacy data while preserving all normal viewport states.
                const PAN_LIMIT = 500000;
                Object.keys(parsed).forEach(key => {
                    if (parsed[key].zoom === 1) {
                        parsed[key].zoom = 0;
                    }
                    const pan = parsed[key]?.pan;
                    if (pan && (Math.abs(pan.x) > PAN_LIMIT || Math.abs(pan.y) > PAN_LIMIT)) {
                        console.warn(`[useCanvasStore] Resetting abnormal pan for ${key}: (${pan.x?.toFixed(0)}, ${pan.y?.toFixed(0)})`);
                        parsed[key] = { zoom: 0, pan: { x: 0, y: 0 } };
                    }
                });
                return parsed;

            }
        } catch (e) {
            console.warn('[useCanvasStore] Failed to load viewStates from localStorage:', e);
        }
        return {
            "main:scanner": { ...INITIAL_VIEW_STATE },
            "main:object_x20": { ...INITIAL_VIEW_STATE },
            "main:object_x50": { ...INITIAL_VIEW_STATE },
            "recipe:scanner": { ...INITIAL_VIEW_STATE },
            "recipe:object_x20": { ...INITIAL_VIEW_STATE },
            "recipe:object_x50": { ...INITIAL_VIEW_STATE },
            "recipe:canvas": { ...INITIAL_VIEW_STATE },
            // [V13] Calibration scope - independent from main/recipe
            "calibration:scanner": { ...INITIAL_VIEW_STATE },
            "calibration:object_x20": { ...INITIAL_VIEW_STATE },
            "calibration:object_x50": { ...INITIAL_VIEW_STATE },
            // Legacy fallbacks (just in case)
            scanner: { ...INITIAL_VIEW_STATE },
            object_x20: { ...INITIAL_VIEW_STATE },
            object_x50: { ...INITIAL_VIEW_STATE },
            canvas: { ...INITIAL_VIEW_STATE }
        };
    })(),

    // Per-View Settings (Grid/Cross)
    viewSettings: {
        scanner: { showGrid: false, showCross: false, showCameraGrid: false, showCameraCross: false },
        object_x20: { showGrid: false, showCross: false, showCameraGrid: false, showCameraCross: false },
        object_x50: { showGrid: false, showCross: false, showCameraGrid: false, showCameraCross: false },
        canvas: { showGrid: true, showCross: false, showCameraGrid: false, showCameraCross: false } // Canvas default: Grid ON
    },

    showCross: false,
    setShowCross: (showCross) => {
        const { viewMode, magnification, viewSettings } = get();
        // Determine current key
        let key = viewMode as string;
        if (viewMode === 'object') {
            const mag = magnification === 50 ? 'x50' : 'x20';
            key = `object_${mag}`;
        }
        // Update Active State AND Persisted State
        set({
            showCross,
            viewSettings: {
                ...viewSettings,
                [key]: { ...viewSettings[key], showCross }
            }
        });
    },

    showCameraGrid: false,
    setShowCameraGrid: (showCameraGrid) => {
        const { viewMode, magnification, viewSettings } = get();
        let key = viewMode as string;
        if (viewMode === 'object') {
            const mag = magnification === 50 ? 'x50' : 'x20';
            key = `object_${mag}`;
        }
        set({
            showCameraGrid,
            viewSettings: {
                ...viewSettings,
                [key]: { ...viewSettings[key], showCameraGrid }
            }
        });
    },

    showCameraCross: false,
    setShowCameraCross: (showCameraCross) => {
        const { viewMode, magnification, viewSettings } = get();
        let key = viewMode as string;
        if (viewMode === 'object') {
            const mag = magnification === 50 ? 'x50' : 'x20';
            key = `object_${mag}`;
        }
        set({
            showCameraCross,
            viewSettings: {
                ...viewSettings,
                [key]: { ...viewSettings[key], showCameraCross }
            }
        });
    },

    setCanvas: (canvas: fabric.Canvas | null) => set({ canvas }),
    // [FIX] Navigate Mode(더블클릭 이동)는 select 도구 전용 — 그리기/측정 도구로 전환 시 자동 해제
    setActiveTool: (activeTool: ToolType) => set((state) => ({
        activeTool,
        isNavigateMode: activeTool === 'select' ? state.isNavigateMode : false,
    })),
    setMeasureMode: (measureMode: MeasureMode) => set({ measureMode }),
    setZoom: (zoom: number) => set({ zoom }),
    setSelectedObject: (selectedObject: fabric.Object | null) => set({ selectedObject }),
    setCurrentScope: (currentScope: 'main' | 'recipe' | 'calibration') => set({ currentScope }), // [V13] Calibration added
    setIsFitCamera: (isFitCamera: boolean) => set({ isFitCamera }),
    setIsInitialLoad: (val: boolean) => set({ isInitialLoad: val }),

    setViewMode: (newMode: 'scanner' | 'object' | 'canvas') => {
        set((state) => {
            const { viewMode, canvas, viewStates, magnification, currentScope } = state;

            // 1. Save current state
            let updatedStates = { ...viewStates };
            if (canvas) {
                const currentZoom = canvas.getZoom();
                const vpt = canvas.viewportTransform;
                
                // [V14 FIX] If current mode is Camera Mode (scanner/object), save the dynamic userPan.
                // Otherwise save absolute pan (relative to the ruler-adjusted center).
                const isCamMode = viewMode === 'scanner' || viewMode === 'object';
                let currentPan = { x: 0, y: 0 };
                if (isCamMode) {
                    currentPan = { x: state.userPan.x, y: state.userPan.y };
                } else {
                    currentPan = vpt ? { x: vpt[4] - ((canvas.width! + 60) / 2), y: vpt[5] - ((canvas.height! + 20) / 2) } : { x: 0, y: 0 };
                }
                
                let saveKey = viewMode as string;
                if (viewMode === 'object') {
                    saveKey = `object_x${magnification}`;
                }
                
                // [V12] Prepend currentScope to ensure independent saves
                saveKey = `${currentScope}:${saveKey}`;
                
                // [V11 CRITICAL GUARD] Do NOT save if zoom is exactly 1.0.
                // This prevents silent overwriting with bad data during page transitions when canvas might be resetting.
                if (currentZoom !== 1) {
                    updatedStates[saveKey] = { zoom: currentZoom, pan: currentPan, isFitCamera: state.isFitCamera };
                    
                    // Persist
                    try {
                        sessionStorage.setItem('recipe_canvas_view_states', JSON.stringify(updatedStates));
                    } catch (e) {}
                } else {
                    console.log(`[useCanvasStore] Skipping save for ${saveKey} in setViewMode because zoom is 1.0 (Ambiguous)`);
                }
            }

            // 2. Determine New Settings
            let key = newMode as string;
            if (newMode === 'object') {
                const mag = state.magnification === 50 ? 'x50' : 'x20';
                key = `object_${mag}`;
            }

            const settings = state.viewSettings[key] || { showGrid: false, showCross: false, showCameraGrid: false, showCameraCross: false };
            
            // [V12] Load from the scoped key
            const loadKey = `${currentScope}:${key}`;
            const newState = updatedStates[loadKey] || { zoom: 0, pan: { x: 0, y: 0 } };

            const lastActiveLensMode = newMode === 'object' ? `object_x${state.magnification}` : newMode;
            try {
                localStorage.setItem('lastActiveLensMode', lastActiveLensMode);
            } catch (e) {}

            return {
                viewMode: newMode,
                viewStates: updatedStates,
                showGrid: settings.showGrid,
                showCross: settings.showCross,
                showCameraGrid: settings.showCameraGrid,
                showCameraCross: settings.showCameraCross,
                // [FIX] Always enforce standard scanner scale for the primary canvas coordinate system
                pxPerMm: state.calibrationScales['scanner'] || { x: 1000, y: 1000 },
                isNavigateMode: false, // [FIX] Scanner/Object 모드 전환 시 더블클릭 이동 모드 자동 해제
                zoom: newState.zoom || 0,
                // [V14 FIX] Restore isFitCamera from saved view state. Object mode is always true.
                // [FIX] Fallback isFitCamera to true for camera modes (scanner & object) when no saved state exists
                isFitCamera: (newMode === 'scanner' || newMode === 'object')
                    ? (newState.isFitCamera !== undefined ? newState.isFitCamera : true)
                    : false
            };
        });
    },

    updateViewState: (mode: string, zoom: number, pan: { x: number; y: number }, isFitCamera?: boolean) => {
        if (!mode) return;
        set((state) => {
            const finalIsFitCamera = isFitCamera !== undefined ? isFitCamera : state.isFitCamera;
            const updatedStates = {
                ...state.viewStates,
                [mode]: { zoom, pan, isFitCamera: finalIsFitCamera }
            };
            
            console.log(`[useCanvasStore] Persisting ViewState for ${mode}:`, { zoom, pan, isFitCamera: finalIsFitCamera });
            try {
                sessionStorage.setItem('recipe_canvas_view_states', JSON.stringify(updatedStates));
            } catch (e) {
                console.warn('[useCanvasStore] Failed to save viewStates:', e);
            }
            return { viewStates: updatedStates };
        });
    },

    setShowGrid: (showGrid: boolean) => {
        const { viewMode, magnification, viewSettings } = get();
        // Determine current key
        let key = viewMode as string;
        if (viewMode === 'object') {
            const mag = magnification === 50 ? 'x50' : 'x20';
            key = `object_${mag}`;
        }
        // Update Active State AND Persisted State
        set({
            showGrid,
            viewSettings: {
                ...viewSettings,
                [key]: { ...viewSettings[key], showGrid }
            }
        });
    },
    setAllObjectsHidden: (allObjectsHidden: boolean) => {
        const { canvas } = get();
        const show = !allObjectsHidden;
        if (canvas) {
            const objects = canvas.getObjects();
            objects.forEach((obj: any) => {
                // System objects are excluded from user-intent visibility
                if (obj.isPaper || obj.isGridLine || obj.isCrosshair || obj.isProcessingMarker) return;
                
                obj.userVisible = show;
                obj.visible = show;
            });
            canvas.requestRenderAll();
        }
        set({ allObjectsHidden });
    },
    setAllObjectsHiddenOnly: (allObjectsHidden: boolean) => set({ allObjectsHidden }),
    setSavedState: (savedState: any) => set({ savedState }),
    setHistory: (history: string[]) => set({ history }),
    setHistoryStep: (historyStep: number) => set({ historyStep }),

    setPxPerMm: (pxPerMm: { x: number, y: number }) => set({ pxPerMm }),
    setPan: (pan: { x: number, y: number }) => set({ pan }),
    setUserPan: (userPan: { x: number, y: number }) => set({ 
        userPan
    }),

    setMagnification: (magnification: number) => {
        const { viewMode, viewSettings, calibrationScales } = get();
        try {
            localStorage.setItem('lastActiveLensMode', `object_x${magnification}`);
        } catch (e) {}

        // Only relevant if currently in object mode
        if (viewMode === 'object') {
            const key = `object_x${magnification}`; // x20 or x50
            const settings = viewSettings[key] || { showGrid: false, showCross: false, showCameraGrid: false, showCameraCross: false };
            set({
                magnification,
                showGrid: settings.showGrid,
                showCross: settings.showCross,
                showCameraGrid: settings.showCameraGrid,
                showCameraCross: settings.showCameraCross,
                // [FIX] Always enforce standard scanner scale for the primary canvas coordinate system
                pxPerMm: calibrationScales['scanner'] || { x: 1000, y: 1000 },
                isNavigateMode: false, // [FIX] x20↔x50 배율 전환 시 더블클릭 이동 모드 자동 해제
            });
        } else {
            set({ magnification });
        }
    },

    setActiveRightTab: (activeRightTab: 'motion' | 'gcode' | 'scanner' | 'process') => {
        set({ activeRightTab });
    },
    setScannerSettings: (newSettings) => set((state) => ({
        scannerSettings: { ...state.scannerSettings, ...newSettings }
    })),
    setGcodeSettings: (newSettings) => set((state) => ({
        gcodeSettings: { ...state.gcodeSettings, ...newSettings }
    })),

    // Persisted G-Code State
    gcode: '',
    setGcode: (gcode: string) => set({ gcode }),

    scannerCommands: [],
    setScannerCommands: (scannerCommands: any[]) => set({ scannerCommands }),

    // [Fixed] Camera Calibration Defaults
    cameraCalibration: {
        scannerFov: 82.304,
        object20Fov: 0.422,
        object50Fov: 0.169
    },
    setCameraCalibration: (cal) => set((s) => ({
        cameraCalibration: { ...s.cameraCalibration, ...cal }
    })),

    // Multi-Camera Logic
    calibrationScales: {
        'scanner': { x: 1000, y: 1000 },
        'object_x20': { x: 2000, y: 2000 }, // Default hypothesis
        'object_x50': { x: 5000, y: 5000 }  // Default hypothesis
    },
    setCalibrationScale: (profile, scale) => set((s) => ({
        calibrationScales: { ...s.calibrationScales, [profile]: scale }
    })),
    setCalibrationScales: (scales) => set({ calibrationScales: scales }),

    loadedImages: { 'scanner': null, 'object_x20': null, 'object_x50': null },
    setLoadedCameraImage: (url, key) => set((state) => {
        // If key is not provided, infer from viewMode
        let targetKey = key;
        if (!targetKey) {
            const { viewMode, magnification } = state;
            if (viewMode === 'object') {
                targetKey = magnification === 50 ? 'object_x50' : 'object_x20';
            } else {
                targetKey = 'scanner';
            }
        }
        return {
            loadedImages: { ...state.loadedImages, [targetKey]: url }
        };
    }),

    // Calibration Dialog State
    showCalibrationDialog: false,
    setShowCalibrationDialog: (show) => set({ showCalibrationDialog: show }),

    setShowLayerList: (show) => set({ showLayerList: show }),

    showMatrixDialog: false,
    setShowMatrixDialog: (show) => set({ showMatrixDialog: show }),

    showPresetLibraryDialog: false,
    setShowPresetLibraryDialog: (show) => set({ showPresetLibraryDialog: show }),

    showFillSettingsDialog: false,
    setShowFillSettingsDialog: (show) => set({ showFillSettingsDialog: show }),

    matrixOptions: {
        xCount: 2,
        xSpacing: 1,
        yCount: 2,
        ySpacing: 1,
        useZOffset: false,
        zOffset: 0.001,
        type: 'oneWay',
        showLabels: true // [NEW] Default ON
    },
    setMatrixOptions: (options) => set((state) => ({ 
        matrixOptions: { ...state.matrixOptions, ...options } 
    })),

    // Laser Set Center State
    showLaserSetCenterDialog: false,
    setShowLaserSetCenterDialog: (show) => set({ showLaserSetCenterDialog: show }),
    laserClickPosition: null,
    setLaserClickPosition: (pos) => set({ laserClickPosition: pos }),
    pickedPixel: null,
    setPickedPixel: (pos) => set({ pickedPixel: pos }),

    triggerFitCameraCount: 0,
    triggerFitCamera: () => set((state) => ({ triggerFitCameraCount: state.triggerFitCameraCount + 1 })),

    // Calibration ROI (Digital Zoom/Crop)
    calibrationROI: {
        active: false,
        viewRatio: 1.0,
        center: null,
        isApplied: true
    },
    setCalibrationROI: (roi) => set((state) => ({
        calibrationROI: { ...state.calibrationROI, ...roi }
    })),

    crosshairOffset: { x: 0, y: 0 },
    setCrosshairOffset: (offset) => set({ crosshairOffset: offset }),

    // Independed Scope States (Main / Recipe / Calibration)
    canvasScopes: {},
    saveCanvasScope: (scope: string, data: any) => {
        const { activeTool, measureMode } = get();
        set((state) => ({
            canvasScopes: {
                ...state.canvasScopes,
                [scope]: { data, activeTool, measureMode }
            }
        }));
    },
    loadCanvasScope: (scope: string) => {
        const { canvasScopes, getCanvasScopeData } = get();
        const saved = canvasScopes[scope];
        if (saved) {
            set({
                activeTool: saved.activeTool,
                measureMode: saved.measureMode
            });
        } else {
            set({ activeTool: 'select', measureMode: 'rect' });
        }
        return getCanvasScopeData(scope);
    },
    getCanvasScopeData: (scope: string) => {
        const { canvasScopes } = get();
        return canvasScopes[scope]?.data || null;
    },

    // Layer Naming
    layerNames: {},
    setLayerName: (color: string, name: string) => set((state) => ({
        layerNames: { ...state.layerNames, [color]: name }
    })),

    // Color Preset System
    colorPresets: { scanner: {}, object_x20: {}, object_x50: {} },
    getLensScope: () => {
        const { viewMode, magnification } = get();
        if (viewMode === 'object') return magnification === 50 ? 'object_x50' : 'object_x20';
        return 'scanner';
    },
    setColorPreset: (color: string, patch: Partial<IColorPreset>) => set((state) => {
        const scope = state.getLensScope();
        const scoped = state.colorPresets[scope];
        const existing = scoped[color] ?? state.getColorPresetOrDefault(color);
        return { colorPresets: { ...state.colorPresets, [scope]: { ...scoped, [color]: { ...existing, ...patch, color } } } };
    }),
    removeColorPreset: (color: string) => set((state) => {
        const scope = state.getLensScope();
        const next = { ...state.colorPresets[scope] };
        delete next[color];
        return { colorPresets: { ...state.colorPresets, [scope]: next } };
    }),
    getColorPresetOrDefault: (color: string) => {
        const state = get();
        const scope = state.getLensScope();
        const existing = state.colorPresets[scope][color];
        if (existing) return existing;
        // [FIX] 색상별 프리셋 체계로 완전히 전환하면서 전역 scannerSettings/gcodeSettings의
        // markTimes/feedRate/intensity에 더 이상 기대지 않는다 — 프리셋이 없는 색상은
        // 아래 고정 기본값을 쓴다(도형은 항상 어떤 색상 프리셋에 속하게 하는 것이 원칙).
        // zOffset은 "기준 Z 위의 상대 오프셋"이 아니라 "이 레이어가 가공될 절대 Z"를 의미하며,
        // 처음 생성될 때는 현재 스코프(스캐너/오브젝트 x20/x50)의 실제 모션 Z축 위치를 기본값으로
        // 삼아 화면에 0이 아닌, 그 모드에 맞는 실제 위치가 보이게 한다.
        return {
            color,
            markTimes: 1,
            markSpeed: 1,
            power: 1,
            zOffset: useAppStore.getState().positions.Z ?? 0,
        };
    },

    presetLibrary: [],
    setPresetLibrary: (library: IColorPreset[]) => set({ presetLibrary: library }),
    saveColorAsLibraryPreset: (color: string, name: string) => set((state) => {
        const preset = state.colorPresets[state.getLensScope()][color] ?? state.getColorPresetOrDefault(color);
        const entry: IColorPreset = { ...preset, name };
        const withoutSameName = state.presetLibrary.filter(p => p.name !== name);
        return { presetLibrary: [...withoutSameName, entry] };
    }),
    deleteLibraryPreset: (name: string) => set((state) => ({
        presetLibrary: state.presetLibrary.filter(p => p.name !== name)
    })),
    loadPresetLibraryData: async () => {
        try {
            const { ok, data } = await hwFacade.loadPresetLibrary();
            if (ok && data) {
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed)) set({ presetLibrary: parsed });
            }
        } catch (e) {
            console.error('Failed to load preset library', e);
        }
    },
    savePresetLibraryData: async () => {
        try {
            await hwFacade.savePresetLibrary(get().presetLibrary);
        } catch (e) {
            console.error('Failed to save preset library', e);
        }
    },
    applyLibraryPresetToColor: (color: string, presetName: string) => set((state) => {
        const libPreset = state.presetLibrary.find(p => p.name === presetName);
        if (!libPreset) return {};
        const { name, ...fields } = libPreset;
        const scope = state.getLensScope();
        return { colorPresets: { ...state.colorPresets, [scope]: { ...state.colorPresets[scope], [color]: { ...fields, color } } } };
    }),

    currentLayerColor: null,
    setCurrentLayerColor: (color: string | null) => set({ currentLayerColor: color }),

    useDefaultParameters: false,
    setUseDefaultParameters: (val: boolean) => set((state) => {
        const { canvas, currentLayerColor } = state;
        if (!canvas || !currentLayerColor) return { useDefaultParameters: val };

        const targetColor = currentLayerColor;
        const objs = canvas.getObjects().filter((o: any) =>
            !o.isPaper && !o.isGridLine && !o.isGuide && !o.isTemp && !o.isCrosshair && !o.isMeasurement &&
            o.type !== 'selection' && o.type !== 'activeSelection'
        );

        // [FIX 2026-07-22] 기존 applyForcedColor는 "컨테이너 자신"의 fill/stroke만 바꿨다.
        // 그룹류(사용자 Ctrl+G 그룹·Dot 그룹·DXF 그룹·매트릭스 소스)는 자식이 자기 스타일로
        // 렌더링하므로 시각 변화가 전혀 없고, 색상 판정(resolveObjectColorHex)은 leaf를 읽으므로
        // 레이어 재분류도 되지 않는 무효 동작이었다. 적용(write)을 판정(read)과 동일한 leaf
        // 집합(collectStyleLeafObjects)으로 캐스케이드한다 — CanvasTopBar의 representativeColor
        // 경로와 대칭. 가드(이미 target 색이면 스냅샷/플래그 생략)를 leaf 단위로 내려,
        // "혼합 색상 그룹"의 각 leaf가 자기 원색 스냅샷을 갖고 해제 시 각자 원색으로 복원된다.
        const forceColorOnLeaves = (obj: any, targetVal: string) => {
            collectStyleLeafObjects(obj).forEach((l: any) => {
                const leaf = l as any;
                if (resolveObjectColorHex(leaf) === targetVal) return; // leaf 단위 가드
                if (!leaf.customData) leaf.customData = {};
                if (!leaf.customData.originalColor) { // 이중 토글에도 최초 원본만 보존
                    leaf.customData.originalColor = { fill: leaf.fill, stroke: leaf.stroke };
                }
                leaf.customData.forcedByDefaultParams = true;
                // 채널별 규칙: 활성(비-transparent) 채널만 교체, fill은 알파(해칭 불투명도) 보존
                if (leaf.stroke && leaf.stroke !== 'transparent') leaf.set('stroke', targetVal);
                if (leaf.fill && leaf.fill !== 'transparent') leaf.set('fill', replaceColorKeepAlpha(leaf.fill, targetVal));
                leaf.dirty = true;
                if (leaf.group) {
                    leaf.group.set('objectCaching', false);
                    leaf.group.dirty = true;
                }
            });
            obj.dirty = true;
        };

        const revertForcedColor = (holder: any) => {
            if (!holder.customData?.forcedByDefaultParams) return;
            const orig = holder.customData.originalColor;
            if (orig) {
                if (typeof holder.set === 'function') holder.set({ fill: orig.fill, stroke: orig.stroke });
                else { holder.fill = orig.fill; holder.stroke = orig.stroke; }
            }
            holder.customData.forcedByDefaultParams = false;
            delete holder.customData.originalColor;
        };

        objs.forEach((obj: any) => {
            if (obj.customData?.colorPresetLinked === false) return; // "색상에서 분리"된 도형은 제외

            if (val) {
                forceColorOnLeaves(obj, targetColor);
                // MatrixRepeater 셀별 오버라이드도 함께 캐스케이드
                if (obj.type === 'MatrixRepeater' && obj.overrides) {
                    Object.values(obj.overrides).forEach((ov: any) => {
                        if (ov.fill === undefined && ov.stroke === undefined) return;
                        const ovColor = getColorHex(ov.stroke ?? ov.fill);
                        if (ovColor === targetColor) return;
                        if (!ov.originalColor) ov.originalColor = { fill: ov.fill, stroke: ov.stroke };
                        ov.forcedByDefaultParams = true;
                        if (ov.stroke !== undefined) ov.stroke = targetColor;
                        if (ov.fill !== undefined) ov.fill = replaceColorKeepAlpha(ov.fill, targetColor);
                    });
                    obj.dirty = true;
                }
            } else {
                // 컨테이너 자신 + leaf 전부를 복원 대상으로 — 구버전(컨테이너 레벨)으로 강제된
                // 상태가 레시피 파일/Undo 히스토리에서 로드된 경우까지 복원하는 이중 경로.
                // forcedByDefaultParams 플래그가 없는 대상은 no-op이므로 부작용 없다.
                [obj, ...collectStyleLeafObjects(obj)].forEach(revertForcedColor);
                if (obj.type === 'MatrixRepeater' && obj.overrides) {
                    Object.values(obj.overrides).forEach((ov: any) => {
                        if (!ov.forcedByDefaultParams) return;
                        if (ov.originalColor) {
                            ov.fill = ov.originalColor.fill;
                            ov.stroke = ov.originalColor.stroke;
                        }
                        ov.forcedByDefaultParams = false;
                        delete ov.originalColor;
                    });
                    obj.dirty = true;
                }
            }
            obj.dirty = true;
        });

        canvas.requestRenderAll();
        // 여러 도형을 일괄 변경했지만 Undo 체크포인트는 1개만 남긴다 (useCanvasEvents.ts의
        // 전역 'object:modified' 리스너가 saveHistory()를 호출한다).
        canvas.fire('object:modified', {} as any);
        return { useDefaultParameters: val };
    }),

    // Generation Persistence Initial State & Actions
    gcodeGenStatus: 'idle',
    gcodeProgress: 0,
    scannerGenStatus: 'idle',
    scannerProgress: 0,
    setGcodeGenStatus: (status) => set({ gcodeGenStatus: status }),
    setGcodeProgress: (progress) => set({ gcodeProgress: progress }),
    setScannerGenStatus: (status) => set({ scannerGenStatus: status }),
    setScannerProgress: (progress) => set({ scannerProgress: progress }),

    hideOverlays: false,
    setHideOverlays: (val: boolean) => set({ hideOverlays: val }),

    isProcessingLocal: false,
    setProcessingLocal: (val: boolean) => set({ isProcessingLocal: val }),

    isNavigateMode: false,
    setIsNavigateMode: (val: boolean) => set({ isNavigateMode: val }),
}));
