/**
 * @file GCodePanel.tsx
 * @brief UI component for configuring and generating G-Code.
 */

import React, { useState } from 'react';
import * as fabric from 'fabric';
import { useGCodeGenerator } from '../hooks/useGCodeGenerator';
import { useCanvasStore } from '../ui/pages/Recipe/Canvas/useCanvasStore';
import { IGCodeSettings } from '../types/cad';
import { useShallow } from 'zustand/react/shallow';
import { ProcessDashboard } from './ProcessDashboard';
import ColorPresetPanel from '../ui/components/control/ColorPresetPanel';
import { CommandViewerPanel } from '../ui/components/control/CommandViewerPanel';
import { Typography, Divider } from '@mui/material';
import { useAppStore } from '../store/appStore';
import { hwFacade } from '../services/HardwareFacade';
import { bus } from '../core/patterns/events';
import { logger } from '../utils/logger';

interface GCodePanelProps {
    canvas: fabric.Canvas | undefined;
    pxPerMm?: { x: number; y: number }; // Optional prop to override default scaling
    origin?: { x: number; y: number }; // Optional prop to override default origin
    gcode?: string;
    onGenerate?: (code: string) => void;
    onUpload?: (code: string) => Promise<boolean>;
}

/**
 * @component GCodePanel
 * @brief Panel for G-Code settings, generation, and download.
 */
export const GCodePanel = React.memo<GCodePanelProps>(({ canvas, pxPerMm, origin, gcode = '', onGenerate, onUpload }) => {
    const { generateGCode } = useGCodeGenerator(canvas);

    // G-Code Settings State
    // loose type to allow string input for numbers (e.g. "-")
    const setSettings = useCanvasStore((s) => s.setGcodeSettings);

    // [NEW] Recipe Center Offset Retrieval & Global Gen State
    const { recipeCenter, cameraKind, objectMag } = useAppStore(useShallow(s => ({
        recipeCenter: s.recipeCenter,
        cameraKind: s.cameraKind,
        objectMag: s.objectMag
    })));

    const {
        genStatus, progress,
        setGenStatus, setProgress
    } = useCanvasStore(useShallow(s => ({
        genStatus: s.gcodeGenStatus,
        progress: s.gcodeProgress,
        setGenStatus: s.setGcodeGenStatus,
        setProgress: s.setGcodeProgress
    })));

    const activeMode = React.useMemo(() => {
        if (cameraKind === 'scanner') return 'scanner';
        return objectMag === 'x50' ? 'object_x50' : 'object_x20';
    }, [cameraKind, objectMag]);

    const currentCenter = recipeCenter[activeMode] || { x: 0, y: 0 };
    // [UX] 하단 G-Code 미리보기 → "View G-Code" 버튼 + 전체 화면 오버레이 뷰어
    const [showCommands, setShowCommands] = useState(false);

    const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success'>('idle');
    const [uploadProgress, setUploadProgress] = useState(0);

    const handleGenerate = async (): Promise<string> => {
        // [FIX] Read latest state directly from stores to avoid stale closure issues during immediate sequential calls
        const appStore = useAppStore.getState();
        const canvasStore = useCanvasStore.getState();

        const settingsFromStore = canvasStore.gcodeSettings;
        const positions = appStore.positions;
        const currentZ = positions['Z'] || 0;

        const finalSettings: IGCodeSettings = {
            ...settingsFromStore,
            feedRate: Number(settingsFromStore.feedRate),
            intensity: 100, // Default full power if removed from UI
            passes: Number(settingsFromStore.passes),
            safeZ: currentZ,
            workingZ: currentZ,
            includeSafeZ: true, // Always include for safety/consistency if using current Z
            shapeDelay: Number(settingsFromStore.shapeDelay),
            markTimes: Math.max(1, Math.floor(Number(settingsFromStore.markTimes) || 1)), // [NEW] 전체 시퀀스 반복 횟수
            includeComments: true, // Force comments inclusion unconditionally
        };

        logger.info("Process", "Process Sequence Step 1: Generating G-Code...");
        setGenStatus('generating');
        setProgress(0);

        // [FIX] Ensure consistent pxPerMm to prevent distance-proportional offset errors.
        // If not provided as prop, default to the standard 1000.0 or currently calibration scale.
        const defaultPxPerMm = appStore.cameraKind === 'scanner' ? { x: 1000, y: 1000 } : { x: 1000, y: 1000 };
        const activePxPerMm = pxPerMm || defaultPxPerMm;

        const stageX = positions.X ?? 0;
        const stageY = positions.Y ?? 0;

        try {
            // [FIX] scene = 절대 기계 좌표 (sceneCoords.ts). 절대 기계 좌표 = scene/ppm 이므로
            // 추가 오프셋 없이 변환합니다. 도형의 렌즈 프레임 재배치는 저장/로드 파이프라인이
            // 처리하므로 여기서 recipeCenter 등을 가산하면 이중 보정이 됩니다.
            const code = await generateGCode(finalSettings, {
                pxPerMm: activePxPerMm,
                origin: { x: 0, y: 0 },   // 절대 scene 원점 기준 변환
                offsetMm: { x: 0, y: 0 },
                invertY: true,
                returnToPos: { x: stageX, y: stageY }, // [FIX] 가공 완료 후 복귀할 좌표
                colorPresets: canvasStore.colorPresets[canvasStore.getLensScope()], // [FIX] 오브젝트 x20/x50 스코프별 프리셋만 사용(스캐너 모드와 격리)
            });

            if (onGenerate) {
                onGenerate(code);
            }

            setGenStatus('success');
            logger.info("Process", "Process Sequence Step 1: G-Code Generated Successfully");
            setTimeout(() => setGenStatus('idle'), 1000);
            return code;
        } catch (e) {
            console.error("G-Code Generation failed", e);
            logger.error("Process", "Process Sequence Interrupted: G-Code Generation Failed");
            useAppStore.getState().showToast("Generation Failed", "error");
            setGenStatus('idle');
            return '';
        }
    };

    const handleProcessStart = async () => {
        // [FIX] Removed destructive overwrite of recipeCenter with stage positions.
        // The calibration data (Laser Set Center) must be preserved.
        // The coordinate shift is now properly handled inside handleGenerate.

        const pos = useAppStore.getState().positions;
        const stageX = pos.X ?? 0;
        const stageY = pos.Y ?? 0;
        const stageZ = pos.Z ?? 0;

        logger.info("Process", `Process Sequence Step 0: Starting G-Code Process at Stage Pos (X:${stageX}, Y:${stageY}, Z:${stageZ})`);

        // Update local settings temporarily for Z if needed, though handleGenerate reads it directly
        setSettings({ workingZ: stageZ });

        // 1. Generate
        const code = await handleGenerate();
        if (!code) return; // Error handled internally

        // 2. Upload
        if (onUpload) {
            logger.info("Process", "Process Sequence Step 2: Uploading G-Code...");
            setUploadStatus('uploading');
            setUploadProgress(0);

            const off = bus.on("gcode/upload-progress", (p) => setUploadProgress(p));
            // Let the UI render the progress bar
            await new Promise(r => setTimeout(r, 50));

            const uploadSuccess = await onUpload(code);
            off();

            if (!uploadSuccess) {
                setUploadStatus('idle');
                logger.warn("Process", "Process Sequence Interrupted: Upload Failed or Safety Triggered");
                return;
            }

            setUploadStatus('success');
            logger.info("Process", "Process Sequence Step 2: Upload Complete");
            setTimeout(() => setUploadStatus('idle'), 1000);
        }

        // 3. Start Processing
        logger.info("Process", "Process Sequence Step 3: Starting Machining");
        useAppStore.getState().showToast("Starting G-Code Process...", "info");
        useAppStore.getState().resetProcessStatus('gcode');

        const canvas = useCanvasStore.getState().canvas;
        const objects = canvas ? canvas.getObjects() : [];
        const dotObject = objects.find((obj: any) => obj.id === 'dot_marker') as any;
        const ttlTime = dotObject ? dotObject.markPointTime : 20;

        useAppStore.getState().setLastProcessStartPosition({ X: stageX, Y: stageY });

        try {
            await hwFacade.processGCode(1, ttlTime);
        } catch (e) {
            console.warn("Backend IPC failed", e);
            logger.error("Process", "Process Sequence Interrupted: Failed to send start command");
        }
    };

    const handleGetCurrentZ = () => {
        const positions = useAppStore.getState().positions;
        const currentZ = positions['Z'] || 0;
        setSettings({ workingZ: currentZ });
    };


    return (
        <div className="relative p-4 space-y-3 w-full bg-white dark:bg-slate-900/50 rounded-lg shadow-sm border border-gray-200 dark:border-none">

            {/* [NEW] 전역 Mark Speed/Shape Delay/Mark Times를 대체: 색상(레이어)별 프리셋으로만 동작 */}
            <ColorPresetPanel mode="gcode" />

            <div className="flex-none p-1 flex flex-col gap-2">
                {genStatus === 'generating' && (
                    <div className="py-2 bg-blue-50/50 dark:bg-blue-900/10 px-3 rounded border border-blue-100 dark:border-blue-800/30">
                        <div className="flex justify-between items-center mb-2">
                            <Typography variant="caption" className="text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider">Step 1: Generating G-Code</Typography>
                            <Typography variant="caption" className="text-blue-600 dark:text-blue-400 font-mono">{progress}%</Typography>
                        </div>
                        <div className="w-full bg-blue-100 dark:bg-blue-900/50 rounded-full h-1.5">
                            <div
                                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                )}
                {uploadStatus === 'uploading' && (
                    <div className="py-2 bg-indigo-50/50 dark:bg-indigo-900/10 px-3 rounded border border-indigo-100 dark:border-indigo-800/30">
                        <div className="flex justify-between items-center mb-2">
                            <Typography variant="caption" className="text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">Step 2: Uploading G-Code</Typography>
                            <Typography variant="caption" className="text-indigo-600 dark:text-indigo-400 font-mono">{Math.round(uploadProgress)}%</Typography>
                        </div>
                        <div className="w-full bg-indigo-100 dark:bg-indigo-900/50 rounded-full h-1.5">
                            <div
                                className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                    </div>
                )}
                {genStatus !== 'generating' && uploadStatus !== 'uploading' && (
                    <ProcessDashboard onStart={handleProcessStart} />
                )}
            </div>

            {gcode && (
                <div className="mt-4">
                    <button
                        onClick={() => setShowCommands(true)}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-semibold py-2 rounded transition-colors"
                    >
                        View G-Code
                    </button>
                </div>
            )}

            {showCommands && gcode && (
                <CommandViewerPanel
                    title="G-Code"
                    text={gcode}
                    onClose={() => setShowCommands(false)}
                />
            )}
        </div >
    );
});

GCodePanel.displayName = 'GCodePanel';
