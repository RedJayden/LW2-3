/**
 * @file ScannerPanel.tsx
 * @brief Scanner Tab specialized UI Panel
 */

import React from 'react';
import * as fabric from 'fabric';
import { useGCodeGenerator } from '../hooks/useGCodeGenerator';
import { useCanvasStore } from '../ui/pages/Recipe/Canvas/useCanvasStore';
import { useAppStore } from '../store/appStore';
import { bus } from '../core/patterns/events';
import { logger } from '../utils/logger';
import { IGCodeSettings } from '../types/cad';
import { scannerGenerator } from '../services/ScannerGenerator';
import { hwFacade } from '../services/HardwareFacade';
import { useShallow } from 'zustand/react/shallow';
import { ProcessDashboard } from './ProcessDashboard';
import { Typography, Divider } from '@mui/material';

interface ScannerPanelProps {
    canvas: fabric.Canvas | undefined;
    pxPerMm?: { x: number; y: number };
    origin?: { x: number; y: number };
    onGenerate?: (code: string) => void;
}

/**
 * @component ScannerPanel
 * @brief Panel for Scanner settings and motion generation
 */
export const ScannerPanel = React.memo<ScannerPanelProps>(({ canvas, pxPerMm, origin, onGenerate }) => {
    const { generateGCode } = useGCodeGenerator(canvas);

    // Using independent scanner settings
    const settings = useCanvasStore((s) => s.scannerSettings);
    const setSettings = useCanvasStore((s) => s.setScannerSettings);

    // State for Generated Commands (Lifted to Store)
    const commands = useCanvasStore((s) => s.scannerCommands);
    const setCommands = useCanvasStore((s) => s.setScannerCommands);

    const {
        genStatus, progress,
        setGenStatus, setProgress 
    } = useCanvasStore(useShallow(s => ({
        genStatus: s.scannerGenStatus,
        progress: s.scannerProgress,
        setGenStatus: s.setGcodeGenStatus, // Wait, this should be ScannerGenStatus
        setProgress: s.setScannerProgress
    })));

    // Corrected action mapping
    const setScannerGenStatus = useCanvasStore(s => s.setScannerGenStatus);

    const useProcessDetail = useAppStore(s => s.useProcessDetail);

    // [NEW] Use ScannerGenerator
    const handleGenerate = async (): Promise<boolean> => {
        if (!canvas) {
            console.warn("[ScannerPanel] Canvas is missing");
            return false;
        }

        const allObjectsHidden = useCanvasStore.getState().allObjectsHidden;
        const objects = canvas.getObjects().filter((obj: any) => {
            if (obj.isGridLine) return false;
            if (obj.isPaper) return false;
            if (obj.isCrosshair) return false; // Exclude crosshair from processing
            if (obj.excludeFromExport) return false;

            // [NEW] Visibility Filtering: Only process what's currently shown
            if (allObjectsHidden) return false;
            if ((obj as any).userVisible === false) return false;

            return true;
        });

        if (objects.length === 0) {
            useAppStore.getState().showToast("No objects to process", "warning");
            logger.warn("Process", "Process Sequence Interrupted: No objects to process");
            return false;
        }

        logger.info("Process", "Process Sequence Step 1: Generating Commands...");
        setScannerGenStatus('generating');
        setProgress(0);

        // [FIX] Calculate absolute center origin using physical stage position (completely independent of screen pan/zoom)
        const pos = useAppStore.getState().positions;
        const stageX = pos.X ?? 0;
        const stageY = pos.Y ?? 0;
        const activePxPerMm = pxPerMm || { x: 1000, y: 1000 };
        const realOrigin = {
            x: stageX * activePxPerMm.x,
            y: -stageY * activePxPerMm.y
        };

        // [FIX] scene = 절대 기계 좌표 (sceneCoords.ts). 갈보 좌표 = scene/ppm - 현재 스테이지 위치이므로
        // origin(스테이지 위치) 차감만 필요하고 추가 오프셋은 없습니다. 카메라-레이저 정렬은 영상
        // 디지털 패닝(pixelX/pixelY)이 담당하므로 recipeCenter 스테이지 좌표를 가산하면 이중 보정입니다.
        try {
            const cmds = await scannerGenerator.generate(objects, {
                invertY: true,
                origin: realOrigin,
                offsetMm: { x: 0, y: 0 },
                pxPerMm: pxPerMm || { x: 1000, y: 1000 },
                currentZ: useAppStore.getState().positions.Z, // [NEW] Sync with current focus
                shapeDelay: Number(settings.shapeDelay || 0),
                markTimes: Number(settings.markTimes || 1),
                onProgress: (p) => setProgress(p)
            });

            setCommands(cmds);
            await hwFacade.generateScannerCommands(cmds);
            
            setScannerGenStatus('success');
            logger.info("Process", "Process Sequence Step 1: Commands Generated Successfully");
            setTimeout(() => setScannerGenStatus('idle'), 1000);
            return true;
        } catch (e) {
            console.error("[ScannerPanel] Generation failed:", e);
            logger.error("Process", "Process Sequence Interrupted: Command Generation Failed");
            useAppStore.getState().showToast("Generation Failed", "error");
            setScannerGenStatus('idle');
            return false;
        }
    };

    const handleProcessStart = async () => {
        const success = await handleGenerate();
        if (success) {
            logger.info("Process", "Process Sequence Step 2: Starting Scanner Machining");
            useAppStore.getState().showToast("Starting Scanner Process...", "info");
            // [FIX] Reset status correctly and force progress to 0 to prevent 100% bug
            useAppStore.getState().resetProcessStatus('scanner');
            useAppStore.getState().updateProcessStatus('scanner', { progress: 0 });
            
            await hwFacade.scannerControl(1, {
                scannerMarkSpeed: Number(settings.feedRate),
                scannerIntensity: Number(settings.intensity || 50) // Default if missing
            });

            const pos = useAppStore.getState().positions;
            useAppStore.getState().setLastProcessStartPosition({ X: pos.X, Y: pos.Y });
        } else {
            // [FIX] Release UI lockdown if generation fails
            const { setProcessingLocal, setHideOverlays } = useCanvasStore.getState();
            setProcessingLocal(false);
            setHideOverlays(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;

        let newValue: any = value;
        if (type !== 'checkbox') {
            newValue = value.replace(/[^0-9.-]/g, '');
            if (name === 'intensity' && newValue !== '') {
                const num = Number(newValue);
                if (num > 100) newValue = '100';
                if (num < 0) newValue = '0';
            }
        }

        setSettings({
            [name]: type === 'checkbox' ? checked : newValue
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const allowedKeys = [
            'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
            'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
            'Home', 'End'
        ];
        if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey) {
            return;
        }
        const isValidChar = /^[0-9.-]$/.test(e.key);
        if (!isValidChar) {
            e.preventDefault();
        }
    };

    const commandText = React.useMemo(() => {
        if (commands.length === 0) return "No commands generated. (Draw something?)";
        const limit = 2000;
        const shown = commands.slice(0, limit);
        const formatNum = (num: number) => num.toFixed(3);
        
        let text = shown.map(c => {
            const parts = [`${c.type}`];
            const isZMove = c.type === 'Z_MOVE';

            // [NEW] DELAY 명령은 좌표 대신 지연 시간(sec)만 표기
            if (c.type === 'DELAY') {
                parts.push(`P${Number((c as any).delayTime ?? 0).toFixed(3)}s`);
                return parts.join(' ');
            }

            if (!isZMove) {
                if (c.startX !== undefined) parts.push(`SX${formatNum(c.startX)}`);
                if (c.startY !== undefined) parts.push(`SY${formatNum(c.startY)}`);
                if (c.x !== undefined) parts.push(`X${formatNum(c.x)}`);
                if (c.y !== undefined) parts.push(`Y${formatNum(c.y)}`);
            }
            
            // [NEW] Show Z-axis information for all relevant commands
            if (c.z !== undefined) parts.push(`Z${formatNum(c.z)}`);
            
            if (!isZMove) {
                if (c.r !== undefined) parts.push(`R${formatNum(c.r)}`);
                if (c.w !== undefined) parts.push(`W${formatNum(c.w)}`);
                if (c.h !== undefined) parts.push(`H${formatNum(c.h)}`);
                if (c.angle !== undefined) parts.push(`A${formatNum(c.angle)}`);
            }
            return parts.join(' ');
        }).join('\n');

        if (commands.length > limit) {
            text += `\n... (${commands.length - limit} more commands not shown)`;
        }
        return text;
    }, [commands]);

    React.useEffect(() => {
        const off = bus.on("scanner/status", (status) => {
            if (status === 'idle') {
                useAppStore.getState().setMotionState('FINISH');
                // [NEW] Ensure 100% on finish
                useAppStore.getState().updateProcessStatus('scanner', { progress: 100 });
            }
            else if (status === 'running') {
                useAppStore.getState().setMotionState('Running');
            }
        });

        // [NEW] Global progress listener from backend
        (window as any).__onScannerProgress = (v: number) => {
            // [FIX] Convert 0~100 scale from backend accurately
            useAppStore.getState().updateProcessStatus('scanner', { progress: v });
        };

        // [NEW] Tooling size compensation on zoom
        const onZoom = () => {
            if (!canvas) return;
            const zoom = canvas.getZoom();
            canvas.getObjects().forEach((obj: any) => {
                if (obj.customData?.isConstantSize) {
                    // Maintain visual size regardless of zoom
                    obj.set({ 
                        scaleX: 1 / zoom, 
                        scaleY: 1 / zoom,
                        // Recalculate coords to prevent jitter
                        left: obj.left,
                        top: obj.top 
                    });
                    obj.setCoords();
                }
            });
            canvas.requestRenderAll();
        };

        (canvas as any)?.on('mouse:wheel', onZoom);
        // Use 'after:render' as a fallback to catch any zoom changes from other sources
        (canvas as any)?.on('after:render', onZoom);

        return () => { 
            off(); 
            (canvas as any)?.off('mouse:wheel', onZoom);
            (canvas as any)?.off('after:render', onZoom);
            delete (window as any).__onScannerProgress;
        };
    }, []);

    return (
        <div className="p-4 space-y-3 w-full bg-white dark:bg-slate-900/50 rounded-lg shadow-sm border border-gray-200 dark:border-none flex flex-col h-full overflow-hidden">
            <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                    <label className="block text-xs text-gray-600 dark:text-slate-400 font-medium mb-1">Mark Speed (mm/sec)</label>
                    <input
                        type="number"
                        name="feedRate"
                        min={0.001}
                        max={8000}
                        step={0.001}
                        value={settings.feedRate}
                        onChange={(e) => {
                            const { name, value } = e.target;
                            let newValue = value.replace(/[^0-9.-]/g, '');
                            setSettings({ [name]: newValue });
                        }}
                        onBlur={(e) => {
                            const { name, value } = e.target;
                            let num = Number(value);
                            if (isNaN(num) || value === '') num = 0.001;
                            if (num > 8000) num = 8000;
                            if (num < 0.001) num = 0.001;
                            
                            // [FIX] 부동 소수점 정밀도 오류 해결
                            setSettings({ [name]: Number(num.toFixed(6)).toString() });
                        }}
                        onKeyDown={handleKeyDown}
                        className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 text-gray-900 dark:text-white"
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-600 dark:text-slate-400 font-medium mb-1">Shape Delay (sec)</label>
                    <input
                        type="number"
                        name="shapeDelay"
                        step={0.1}
                        min={0.0}
                        max={9999}
                        value={settings.shapeDelay}
                        onChange={(e) => {
                            const { name, value } = e.target;
                            let newValue = value.replace(/[^0-9.-]/g, '');
                            setSettings({ [name]: newValue });
                        }}
                        onBlur={(e) => {
                            const { name, value } = e.target;
                            let num = Number(value);
                            if (isNaN(num) || value === '') num = 0.0;
                            if (num < 0) num = 0.0;
                            setSettings({ [name]: Number(num.toFixed(3)).toString() });
                        }}
                        onKeyDown={handleKeyDown}
                        className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 text-gray-900 dark:text-white"
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-600 dark:text-slate-400 font-medium mb-1">Mark times</label>
                    <input
                        type="number"
                        name="markTimes"
                        step={1}
                        min={1}
                        max={9999}
                        value={settings.markTimes}
                        onChange={(e) => {
                            const { name, value } = e.target;
                            let newValue = value.replace(/[^0-9]/g, '');
                            setSettings({ [name]: newValue });
                        }}
                        onBlur={(e) => {
                            const { name, value } = e.target;
                            let num = parseInt(value, 10);
                            if (isNaN(num) || num < 1) num = 1;
                            if (num > 9999) num = 9999;
                            setSettings({ [name]: num.toString() });
                        }}
                        onKeyDown={handleKeyDown}
                        className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 text-gray-900 dark:text-white"
                    />
                </div>
            </div>


            <div className="flex-none p-1 flex flex-col gap-2">
                {genStatus === 'generating' && (
                    <div className="py-2 bg-blue-50/50 dark:bg-blue-900/10 px-3 rounded border border-blue-100 dark:border-blue-800/30">
                        <div className="flex justify-between items-center mb-2">
                             <Typography variant="caption" className="text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider">Step 1: Generating Commands</Typography>
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
                {genStatus !== 'generating' && (
                    <ProcessDashboard onStart={handleProcessStart} />
                )}
            </div>

            {/* Command Viewer (Optional/Hidden in production but kept for dev) */}
            {useProcessDetail && commands.length > 0 && (
                <div className="flex-1 mt-2 min-h-0 bg-slate-950/80 rounded border border-slate-800 relative group overflow-hidden">
                    <div className="absolute top-1 left-2 flex items-center gap-2 z-10">
                        <Typography variant="caption" className="text-slate-500 font-mono text-[10px]">Generated Commands: {commands.length}</Typography>
                    </div>
                    <button
                        onClick={() => {
                            if (commands.length > 0) {
                                navigator.clipboard.writeText(commandText);
                                useAppStore.getState().showToast("Commands copied", "info");
                            }
                        }}
                        className="absolute top-1 right-2 bg-slate-800/80 hover:bg-slate-700 text-[10px] text-white px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                        Copy
                    </button>
                    <textarea
                        readOnly
                        value={commandText}
                        className="w-full h-full bg-transparent text-[10px] font-mono p-2 pt-6 text-green-500/80 resize-none focus:outline-none whitespace-pre select-text"
                        spellCheck={false}
                    />
                </div>
            )}
        </div>
    );
});

ScannerPanel.displayName = 'ScannerPanel';
