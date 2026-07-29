/**
 * @file ScanlabProcessPanel.tsx
 * @brief Scanlab scanner process control panel.
 * @details Implements specialized UI controls for Scanlab RTC cards, including laser speed adjustment, connection initialization button, and buffer progress gauge.
 */

import React, { useState } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from '../pages/Recipe/Canvas/useCanvasStore';
import { useAppStore } from '../../store/appStore';
import { bus } from '../../core/patterns/events';
import { logger } from '../../utils/logger';
import { scannerGenerator } from '../../services/ScannerGenerator';
import { hwFacade } from '../../services/HardwareFacade';
import { useShallow } from 'zustand/react/shallow';
import { ProcessDashboard } from '../../components/ProcessDashboard';
import ColorPresetPanel from '../components/control/ColorPresetPanel';
import { CommandViewerPanel } from '../components/control/CommandViewerPanel';
import { Typography, LinearProgress, Box } from '@mui/material';

interface ScanlabProcessPanelProps {
    canvas: fabric.Canvas | undefined;
    pxPerMm?: { x: number; y: number };
    origin?: { x: number; y: number };
}

/**
 * @component ScanlabProcessPanel
 * @brief Control panel with specialized features for Scanlab RTC controllers.
 */
export const ScanlabProcessPanel: React.FC<ScanlabProcessPanelProps> = React.memo(({ canvas, pxPerMm, origin }) => {
    const settings = useCanvasStore((s) => s.scannerSettings);

    const commands = useCanvasStore((s) => s.scannerCommands);
    const setCommands = useCanvasStore((s) => s.setScannerCommands);

    const {
        genStatus, progress,
        setScannerGenStatus, setProgress 
    } = useCanvasStore(useShallow(s => ({
        genStatus: s.scannerGenStatus,
        progress: s.scannerProgress,
        setScannerGenStatus: s.setScannerGenStatus,
        setProgress: s.setScannerProgress
    })));
    // [UX] 하단 커맨드 미리보기 → "View Commands" 버튼 + 전체 화면 오버레이 뷰어
    const [showCommands, setShowCommands] = useState(false);
    const commandCount = commands.filter(c => c.type !== 'COMMENT').length;

    const handleGenerate = async (): Promise<boolean> => {
        if (!canvas) {
            console.warn("[ScanlabProcessPanel] Canvas is missing");
            return false;
        }

        const allObjectsHidden = useCanvasStore.getState().allObjectsHidden;
        const objects = canvas.getObjects().filter((obj: any) => {
            if (obj.isGridLine) return false;
            if (obj.isPaper) return false;
            if (obj.isCrosshair) return false;
            if (obj.excludeFromExport) return false;
            if (allObjectsHidden) return false;
            if ((obj as any).userVisible === false) return false;
            return true;
        });

        if (objects.length === 0) {
            useAppStore.getState().showToast("No objects to process", "warning");
            logger.warn("Process", "Process Sequence Interrupted: No objects to process");
            return false;
        }

        logger.info("Process", "Process Sequence Step 1: Translating Drawing for Scanlab RTC...");
        setScannerGenStatus('generating');
        setProgress(0);

        const pos = useAppStore.getState().positions;
        const stageX = pos.X ?? 0;
        const stageY = pos.Y ?? 0;
        const activePxPerMm = pxPerMm || { x: 1000, y: 1000 };
        const realOrigin = {
            x: stageX * activePxPerMm.x,
            y: -stageY * activePxPerMm.y
        };

        // [FIX] scene = 절대 기계 좌표 (sceneCoords.ts). 갈보 좌표 = scene/ppm - 스테이지 위치이며
        // origin(스테이지 위치) 차감만 필요합니다. recipeCenter 스테이지 좌표 가산은 이중 보정입니다.
        try {
            const cmds = await scannerGenerator.generate(objects, {
                invertY: true,
                origin: realOrigin,
                offsetMm: { x: 0, y: 0 },
                pxPerMm: pxPerMm || { x: 1000, y: 1000 },
                currentZ: useAppStore.getState().positions.Z,
                shapeDelay: Number(settings.shapeDelay || 0),   // [NEW] 도형 간 지연(초)
                markTimes: Number(settings.markTimes || 1),     // 색상 프리셋이 없는 도형의 폴백 반복 횟수
                colorPresets: useCanvasStore.getState().colorPresets.scanner, // [FIX] 스캐너 스코프 프리셋만 사용(오브젝트 모드와 격리)
                onProgress: (p) => setProgress(p)
            });

            setCommands(cmds);
            await hwFacade.generateScannerCommands(cmds);
            
            setScannerGenStatus('success');
            logger.info("Process", "Process Sequence Step 1: Scanlab commands loaded to memory buffer");
            setTimeout(() => setScannerGenStatus('idle'), 1000);
            return true;
        } catch (e) {
            console.error("[ScanlabProcessPanel] Generation failed:", e);
            logger.error("Process", "Process Sequence Interrupted: Command translation failed");
            useAppStore.getState().showToast("Translation Failed", "error");
            setScannerGenStatus('idle');
            return false;
        }
    };

    const handleProcessStart = async () => {
        useAppStore.getState().resetProcessStatus('scanner');
        const success = await handleGenerate();
        if (success) {
            logger.info("Process", "Process Sequence Step 2: Executing Scanlab marking pipeline");
            useAppStore.getState().showToast("Executing Scanlab buffer marking...", "info");
            useAppStore.getState().updateProcessStatus('scanner', { progress: 0 });
            
            // Hide objects if we are in scanner mode
            if (useAppStore.getState().cameraKind === 'scanner' && canvas) {
                canvas.getObjects().forEach((obj: any) => {
                    if (!obj.isGridLine && !obj.isCrosshair && !obj.isPaper) {
                        obj.set('visible', false);
                    }
                });
                canvas.discardActiveObject();
                canvas.renderAll();
            }

            // [FIX 2026-07-22] 색상 그룹별 속도/파워는 이제 커맨드 스트림의 SET_PARAM이
            // 그룹 경계마다 전환한다(ScannerGenerator.generate). 아래 scannerControl 값은
            // 첫 SET_PARAM 이전 구간·레거시(프리셋 미사용) 경로를 위한 초기 기준값일 뿐이다.
            const { currentLayerColor, getColorPresetOrDefault } = useCanvasStore.getState();
            const activePreset = getColorPresetOrDefault(currentLayerColor || '');
            await hwFacade.scannerControl(1, {
                scannerMarkSpeed: Number(activePreset.markSpeed),
                scannerIntensity: Number(activePreset.power || 50)
            });

            const pos = useAppStore.getState().positions;
            useAppStore.getState().setLastProcessStartPosition({ X: pos.X, Y: pos.Y });
        } else {
            const { setProcessingLocal, setHideOverlays } = useCanvasStore.getState();
            setProcessingLocal(false);
            setHideOverlays(false);
        }
    };

    const commandText = React.useMemo(() => {
        if (commands.length === 0) return "No RTC commands compiled.";
        const limit = 2000;
        const shown = commands.slice(0, limit);
        const formatNum = (num: number) => num.toFixed(3);
        
        let text = shown.map(c => {
            // [NEW] UI 표시 전용 주석(도형 타입, N회 반복 중 몇 회 등). 하드웨어에는 전송되지 않는다.
            if (c.type === 'COMMENT') return `/* ${c.text} */`;

            // [NEW] 색상 그룹 경계의 속도/파워 전환 명령은 값만 표시한다.
            if (c.type === 'SET_PARAM') {
                return `SET_PARAM Speed${c.markSpeed !== undefined ? formatNum(c.markSpeed) : '-'}mm/s Power${c.power !== undefined ? formatNum(c.power) : '-'}%`;
            }

            const parts = [`${c.type}`];
            const isZMove = c.type === 'Z_MOVE';

            if (!isZMove) {
                if (c.startX !== undefined) parts.push(`SX${formatNum(c.startX)}`);
                if (c.startY !== undefined) parts.push(`SY${formatNum(c.startY)}`);
                if (c.x !== undefined) parts.push(`X${formatNum(c.x)}`);
                if (c.y !== undefined) parts.push(`Y${formatNum(c.y)}`);
            }
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
                useAppStore.getState().updateProcessStatus('scanner', { progress: 100 });

                // Show objects again
                if (canvas) {
                    canvas.getObjects().forEach((obj: any) => {
                        if (!obj.isGridLine && !obj.isCrosshair && !obj.isPaper) {
                            if (obj.userVisible !== false) {
                                obj.set('visible', true);
                            }
                        }
                    });
                    canvas.renderAll();
                }
            }
            else if (status === 'running') {
                useAppStore.getState().setMotionState('Running');
            }
        });

        // [FIX 2026-07-23] __onScannerProgress 등록을 이 패널에서 제거.
        // 전역 등록(HardwareFacade) + 전역 소비(useProcessMonitor)로 이관됨 — 여기 남겨두면
        // 패널 언마운트(탭 전환) 시 cleanup의 delete가 전역 핸들러를 지워 진행률이 유실된다.

        return () => {
            off();
        };
    }, [canvas]);

    return (
        <div className="relative p-4 space-y-4 w-full bg-white dark:bg-slate-900/50 rounded-lg shadow-sm border border-gray-200 dark:border-none flex flex-col h-full overflow-hidden">

            {/* [NEW] 전역 Mark Speed/Shape Delay/Mark Times를 대체: 색상(레이어)별 프리셋으로만 동작 */}
            <ColorPresetPanel mode="scanner" />

            <div className="flex-none p-1 flex flex-col gap-2">
                {genStatus === 'generating' && (
                    <div className="py-2 bg-blue-50/50 dark:bg-blue-900/10 px-3 rounded border border-blue-100 dark:border-blue-800/30">
                        <div className="flex justify-between items-center mb-2">
                             <Typography variant="caption" className="text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider">Step 1: Compiling Buffer</Typography>
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

            {commands.length > 0 && (
                <div className="flex-none mt-2">
                    <button
                        onClick={() => setShowCommands(true)}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-semibold py-2 rounded transition-colors"
                    >
                        View Commands ({commandCount})
                    </button>
                </div>
            )}

            {showCommands && (
                <CommandViewerPanel
                    title="Compiled RTC Commands"
                    count={commandCount}
                    text={commandText}
                    onClose={() => setShowCommands(false)}
                />
            )}
        </div>
    );
});

ScanlabProcessPanel.displayName = 'ScanlabProcessPanel';
