import { create } from 'zustand';
import { hwFacade } from '@/services/HardwareFacade';
import { CalibrationData, CalibrationIndexItem, CalibrationProfile } from '@/core/types/calibration';
import useAppStore, { selectors } from '@/store/appStore';
import { useCanvasStore } from '@/ui/pages/Recipe/Canvas/useCanvasStore';

/**
 * @brief Syncs a newly saved calibration data to the global canvas store immediately.
 * @param profile The calibration profile that was updated ('scanner' | 'object_x20' | 'object_x50').
 * @param data The CalibrationData that was saved.
 */
function syncCalibrationToCanvas(profile: string, data: CalibrationData) {
    const umPerPx = data.calibration.scale_um_per_px;
    const umPerPy = data.calibration.scale_um_per_py || umPerPx;
    if (!umPerPx || umPerPx <= 0) return;

    const newScale = {
        x: 1000 / umPerPx,
        y: 1000 / umPerPy
    };

    const canvasStore = useCanvasStore.getState();
    const oldScale = canvasStore.calibrationScales[profile] || { x: 1000, y: 1000 };

    canvasStore.setCalibrationScale(profile, newScale);

    // Also update pxPerMm if this is the currently active view mode AND it is the scanner profile
    const { viewMode, magnification, canvas } = canvasStore;
    const activeKey = viewMode === 'object' ? `object_x${magnification}` : viewMode;
    
    if (activeKey === profile && profile === 'scanner') {
        // [FIX] Scale existing objects to maintain their mm dimensions
        if (canvas) {
            const ratioX = newScale.x / oldScale.x;
            const ratioY = newScale.y / oldScale.y;

            if (ratioX !== 1 || ratioY !== 1) {
                canvas.getObjects().forEach(obj => {
                    // Ignore system objects, only scale user objects
                    if ((obj as any).isPaper || (obj as any).isGridLine || (obj as any).isCrosshair || (obj as any).isMeasurement || (obj as any).isTemp) {
                        return;
                    }

                    // Scale the object dimensions and position
                    obj.scaleX = (obj.scaleX || 1) * ratioX;
                    obj.scaleY = (obj.scaleY || 1) * ratioY;
                    obj.left = (obj.left || 0) * ratioX;
                    obj.top = (obj.top || 0) * ratioY;

                    obj.setCoords();
                });
                canvas.requestRenderAll();
                console.log(`[Calibration] Rescaled canvas objects by ratio {x: ${ratioX.toFixed(3)}, y: ${ratioY.toFixed(3)}} to maintain physical mm.`);
            }
        }

        canvasStore.setPxPerMm(newScale);
    }
}

/** 캘리브레이션 방법 (Phase 1/2/3) */
export type CalibMethod = 'autofit' | 'pattern' | 'stage';
/** Auto-Fit 도형 힌트 */
export type AutoFitShape = 'rect' | 'circle' | 'auto';

/** Phase 1 Auto-Fit 검출 결과 */
export interface AutoFitResult {
    shape: string;
    cx: number;
    cy: number;
    widthPx: number;
    heightPx: number;
    angleDeg: number;
    rmsPx: number;
}

/** Phase 2 패턴 검출 결과 */
export interface PatternResult {
    scaleX: number;   // mm/px
    scaleY: number;   // mm/px
    rotationDeg: number;
    rmsPx: number;
    points: number;
}

/** Phase 3 스테이지 캘리브레이션 진행 상태 (네이티브 폴링 미러) */
export interface StageCalibStatus {
    running: boolean;
    step: string;
    progress: number;
    message: string;
    result: {
        scaleX: number;
        scaleY: number;
        rotationDeg: number;
        orthoDeg: number;
        stepMm: number;
        dispXPx: number;
        dispYPx: number;
        scoreX: number;
        scoreY: number;
        backlashXPx: number;
        backlashYPx: number;
    } | null;
    error: string | null;
}

interface CalibrationState {
    // Current Setup
    targetWidth: number;
    targetHeight: number;

    // Calculated Results
    calculatedScaleX: number; // mm/px
    calculatedScaleY: number; // mm/px
    /** 검출된 카메라-축 회전각 (deg). 수동/AutoFit 경로는 0. */
    rotationDeg: number;
    /** 현재 calculatedScale 을 만든 방법 (저장 meta 기록용) */
    resultMethod: CalibMethod | 'manual' | null;
    /** 현재 결과의 잔차 RMS (px). 없으면 null. */
    resultRmsPx: number | null;

    // ---- Phase 1: Auto-Fit ----
    autoFitShape: AutoFitShape;
    autoFitResult: AutoFitResult | null;
    isDetecting: boolean;

    // ---- Phase 2: Pattern ----
    patternType: 'chessboard' | 'circles';
    patternCols: number;
    patternRows: number;
    patternPitchMm: number;
    patternResult: PatternResult | null;

    // ---- Phase 3: Stage-Move ----
    stageStepMm: number;
    stageStatus: StageCalibStatus;

    // Method Selection
    method: CalibMethod;

    // Data Management
    history: CalibrationIndexItem[];
    currentData: CalibrationData | null;

    // UI State
    isCalculating: boolean;
    isSaving: boolean;

    // Actions
    setTargetSize: (w: number, h: number) => void;
    setScale: (x: number, y: number) => void;
    setMethod: (m: CalibMethod) => void;
    setAutoFitShape: (s: AutoFitShape) => void;
    clearAutoFitResult: () => void;
    setPatternConfig: (cfg: Partial<{ patternType: 'chessboard' | 'circles'; patternCols: number; patternRows: number; patternPitchMm: number }>) => void;
    setStageStepMm: (mm: number) => void;

    // Async Actions
    runAutoFit: (camId: number, roi: { x: number, y: number, w: number, h: number }) => Promise<AutoFitResult | { error: string }>;
    runDetectPattern: (camId: number) => Promise<PatternResult | { error: string }>;
    startStageCalib: (camId: number) => Promise<{ ok: boolean, error?: string }>;
    abortStageCalib: () => Promise<void>;
    loadHistory: (profile: CalibrationProfile) => Promise<void>;
    loadCurrent: (profile: CalibrationProfile) => Promise<void>;
    saveCalibration: (profile: CalibrationProfile, data: CalibrationData) => Promise<void>;
    calculateScale: (drawnPixelW: number, drawnPixelH: number) => void;
    rollback: (profile: CalibrationProfile, filename: string) => Promise<void>;
    deleteHistoryItem: (profile: CalibrationProfile, filename: string) => Promise<void>;
}

/** Phase 3 상태 폴링 타이머 (모듈 스코프) */
let stagePollTimer: ReturnType<typeof setInterval> | null = null;

const stopStagePolling = () => {
    if (stagePollTimer) {
        clearInterval(stagePollTimer);
        stagePollTimer = null;
    }
};

export const useCalibrationStore = create<CalibrationState>((set, get) => ({
    targetWidth: 0,
    targetHeight: 0,
    calculatedScaleX: 0,
    calculatedScaleY: 0,
    rotationDeg: 0,
    resultMethod: null,
    resultRmsPx: null,

    method: 'autofit',
    autoFitShape: 'auto',
    autoFitResult: null,
    isDetecting: false,

    patternType: 'chessboard',
    patternCols: 9,
    patternRows: 6,
    patternPitchMm: 0.5,
    patternResult: null,

    stageStepMm: 0.5,
    stageStatus: { running: false, step: '', progress: 0, message: '', result: null, error: null },

    history: [],
    currentData: null,
    isCalculating: false,
    isSaving: false,

    setTargetSize: (w, h) => set({ targetWidth: w, targetHeight: h }),

    setScale: (x: number, y: number) => set({
        calculatedScaleX: x,
        calculatedScaleY: y,
        rotationDeg: 0,
        resultMethod: 'manual',
        resultRmsPx: null
    }),

    setMethod: (m) => set({ method: m }),
    setAutoFitShape: (s) => set({ autoFitShape: s }),
    clearAutoFitResult: () => set({ autoFitResult: null }),
    setPatternConfig: (cfg) => set({ ...cfg, patternResult: null }),
    setStageStepMm: (mm) => set({ stageStepMm: mm }),

    calculateScale: (drawnPixelW, drawnPixelH) => {
        const { targetWidth, targetHeight, autoFitResult, method } = get();
        // Avoid division by zero
        const scaleX = drawnPixelW > 0 ? targetWidth / drawnPixelW : 0;
        const scaleY = drawnPixelH > 0 ? targetHeight / drawnPixelH : 0;
        set({
            calculatedScaleX: scaleX,
            calculatedScaleY: scaleY,
            rotationDeg: 0,
            resultMethod: method === 'autofit' && autoFitResult ? 'autofit' : 'manual',
            resultRmsPx: method === 'autofit' && autoFitResult ? autoFitResult.rmsPx : null
        });
    },

    /**
     * @brief Phase 1: 네이티브 Auto-Fit 검출 실행
     * @details 성공 시 결과를 보관하고, Calculate 시 검출 px 치수를 사용한다.
     */
    runAutoFit: async (camId, roi) => {
        set({ isDetecting: true });
        try {
            const shape = get().autoFitShape;
            const r = await hwFacade.visionAutoFit(camId, roi, shape);
            if (!r.ok) {
                set({ autoFitResult: null });
                return { error: r.error || 'Detection failed' };
            }
            const result: AutoFitResult = {
                shape: r.shape || 'rect',
                cx: r.cx || 0,
                cy: r.cy || 0,
                widthPx: r.widthPx || 0,
                heightPx: r.heightPx || 0,
                angleDeg: r.angleDeg || 0,
                rmsPx: r.rmsPx ?? 0
            };
            set({ autoFitResult: result });
            return result;
        } catch (e: any) {
            set({ autoFitResult: null });
            return { error: String(e?.message || e) };
        } finally {
            set({ isDetecting: false });
        }
    },

    /**
     * @brief Phase 2: 표준 패턴(체커보드/도트그리드) 전자동 검출 실행
     * @details 성공 시 Scale X/Y + 회전각을 즉시 calculatedScale 에 반영한다.
     */
    runDetectPattern: async (camId) => {
        set({ isDetecting: true, patternResult: null });
        try {
            const { patternType, patternCols, patternRows, patternPitchMm } = get();
            const r = await hwFacade.visionDetectPattern(camId, patternType, patternCols, patternRows, patternPitchMm);
            if (!r.ok || !r.scaleX || !r.scaleY) {
                return { error: r.error || 'Pattern not detected' };
            }
            const result: PatternResult = {
                scaleX: r.scaleX,
                scaleY: r.scaleY,
                rotationDeg: r.rotationDeg || 0,
                rmsPx: r.rmsPx ?? 0,
                points: r.points || 0
            };
            set({
                patternResult: result,
                calculatedScaleX: result.scaleX,
                calculatedScaleY: result.scaleY,
                rotationDeg: result.rotationDeg,
                resultMethod: 'pattern',
                resultRmsPx: result.rmsPx
            });
            return result;
        } catch (e: any) {
            return { error: String(e?.message || e) };
        } finally {
            set({ isDetecting: false });
        }
    },

    /**
     * @brief Phase 3: 스테이지 이동 캘리브레이션 시작 + 상태 폴링 개시
     * @details 완료 시 Scale X/Y + 회전각을 calculatedScale 에 자동 반영한다.
     */
    startStageCalib: async (camId) => {
        const { stageStepMm } = get();
        try {
            const r = await hwFacade.visionStageCalibStart(camId, stageStepMm, 'slow');
            if (!r.ok) {
                return { ok: false, error: r.error || 'Failed to start' };
            }
            set({
                stageStatus: { running: true, step: 'init', progress: 0, message: 'Starting...', result: null, error: null }
            });

            stopStagePolling();
            stagePollTimer = setInterval(async () => {
                try {
                    const s = await hwFacade.visionStageCalibStatus();
                    if (!s.ok) return;
                    const status: StageCalibStatus = {
                        running: !!s.running,
                        step: s.step || '',
                        progress: s.progress || 0,
                        message: s.message || '',
                        result: s.result || null,
                        error: s.error || null
                    };
                    set({ stageStatus: status });

                    if (!status.running) {
                        stopStagePolling();
                        if (status.result && !status.error) {
                            set({
                                calculatedScaleX: status.result.scaleX,
                                calculatedScaleY: status.result.scaleY,
                                rotationDeg: status.result.rotationDeg,
                                resultMethod: 'stage',
                                resultRmsPx: null
                            });
                        }
                    }
                } catch (e) {
                    console.error('[Calibration] Stage status poll failed:', e);
                }
            }, 500);
            return { ok: true };
        } catch (e: any) {
            return { ok: false, error: String(e?.message || e) };
        }
    },

    /**
     * @brief Phase 3 중단 요청
     */
    abortStageCalib: async () => {
        try {
            await hwFacade.visionStageCalibAbort();
        } catch (e) {
            console.error('[Calibration] Stage abort failed:', e);
        }
    },



    loadHistory: async (profile) => {
        try {
            const res = await hwFacade.listCalibration(profile);
            if (res.ok && res.list) {
                // [FIX] Robust Timestamp Parsing
                const list = res.list.map(item => {
                    const ts = item.timestamp;
                    // Format: YYYYMMDD_HHMMSS
                    if (ts && /^\d{8}_\d{6}$/.test(ts)) {
                        // Treat as Local Time for display consistency
                        const iso = `${ts.substring(0, 4)}-${ts.substring(4, 6)}-${ts.substring(6, 8)}T${ts.substring(9, 11)}:${ts.substring(11, 13)}:${ts.substring(13, 15)}`;
                        return { ...item, timestamp: iso };
                    }
                    return item;
                });

                // Sort by date descending
                list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

                set({ history: list });
            }
        } catch (e) {
            console.error(e);
        }
    },

    loadCurrent: async (profile) => {
        try {
            const res = await hwFacade.loadCalibration(profile);
            if (res.ok && res.data) {
                const data = res.data as CalibrationData;
                set({
                    currentData: data,
                    calculatedScaleX: (data.calibration.scale_um_per_px || 0) / 1000,
                    calculatedScaleY: (data.calibration.scale_um_per_py || data.calibration.scale_um_per_px || 0) / 1000
                });
            }
        } catch (e) {
            console.error(e);
        }
    },

    saveCalibration: async (profile, data) => {
        set({ isSaving: true });
        try {
            await hwFacade.saveCalibration(profile, data);
            await get().loadHistory(profile); // Refresh history
            await get().loadCurrent(profile); // Refresh current

            // [FIX] Immediately sync the new calibration scale to canvasStore
            // so the camera overlay and rulers update without a page reload.
            const updatedData = get().currentData;
            if (updatedData) {
                syncCalibrationToCanvas(profile, updatedData);
            }
        } catch (e) {
            console.error(e);
        } finally {
            set({ isSaving: false });
        }
    },

    rollback: async (profile, filename) => {
        try {
            const res = await hwFacade.rollbackCalibration(profile, filename);
            if (res.ok) {
                // [FIX] loadHistory() 추가 - 롤백 후 History 목록 갱신
                await get().loadHistory(profile);
                await get().loadCurrent(profile);

                // [FIX] Immediately sync rolled-back calibration to canvasStore
                const current = get().currentData;
                if (current) {
                    syncCalibrationToCanvas(profile, current);
                }
            } else {
                console.error('[Calibration] Rollback failed:', res.message);
            }
        } catch (e) {
            console.error('[Calibration] Rollback exception:', e);
        }
    },

    deleteHistoryItem: async (profile, filename) => {
        try {
            const res = await hwFacade.deleteCalibration(profile, filename);
            if (res.ok) {
                await get().loadHistory(profile);
            }
        } catch (e) {
            console.error(e);
        }
    }
}));
