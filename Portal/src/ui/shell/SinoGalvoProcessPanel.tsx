/**
 * @file SinoGalvoProcessPanel.tsx
 * @brief SinoGalvo scanner process control panel.
 * @details Specialized panel for SinoGalvo machining parameters, drawing command generation, and execution status monitoring.
 */

import React from 'react';
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
import { Typography, Box, LinearProgress } from '@mui/material';

interface SinoGalvoProcessPanelProps {
    canvas: fabric.Canvas | undefined;
    pxPerMm?: { x: number; y: number };
    origin?: { x: number; y: number };
}

/**
 * @component SinoGalvoProcessPanel
 * @brief Control card for SinoGalvo machining parameters.
 */
export const SinoGalvoProcessPanel: React.FC<SinoGalvoProcessPanelProps> = React.memo(({ canvas, pxPerMm, origin }) => {
    const settings = useCanvasStore((s) => s.scannerSettings);

    const commands = useCanvasStore((s) => s.scannerCommands);
    const setCommands = useCanvasStore((s) => s.setScannerCommands);

    const {
        genStatus, progress,
        setGenStatus, setProgress 
    } = useCanvasStore(useShallow(s => ({
        genStatus: s.scannerGenStatus,
        progress: s.scannerProgress,
        setGenStatus: s.setGcodeGenStatus,
        setProgress: s.setScannerProgress
    })));

    const setScannerGenStatus = useCanvasStore(s => s.setScannerGenStatus);

    // [UX] 하단 커맨드 미리보기 → "View Commands" 버튼 + 전체 화면 오버레이 뷰어
    const [showCommands, setShowCommands] = React.useState(false);
    const commandCount = commands.filter(c => c.type !== 'COMMENT').length;

    const handleGenerate = async (): Promise<boolean> => {
        if (!canvas) {
            console.warn("[SinoGalvoProcessPanel] Canvas is missing");
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

        // [MatrixOwnership.md P2] 가공 명령 총량 사전 고지. 렌더링은 Flyweight로 해결되지만
        // 명령 수는 "셀 수 × 소스 복잡도"라는 물리 총량을 피할 수 없다(예: 세그먼트 1,000개
        // DXF의 100×100 매트릭스 ≈ 1,000만 명령 — 생성 수 분/메모리 수백 MB). 차단하지 않고
        // (단순 도형 100×100은 정상 사용례) 임계 초과 시 경고만 남긴다.
        // (차단형 확인 다이얼로그는 공용 confirm UI 인프라 확보 후 후속 적용)
        const estimateShapeCommands = (o: any): number => {
            if (o.type === 'MatrixRepeater') {
                const cells = (o.xCount || 1) * (o.yCount || 1);
                const per = (o.sourceObjects || []).reduce((s: number, so: any) => s + estimateShapeCommands(so), 0);
                return cells * Math.max(1, per);
            }
            if ((o.type === 'group' || o.type === 'Group') && typeof o.getObjects === 'function') {
                return o.getObjects().reduce((s: number, c: any) => s + estimateShapeCommands(c), 0);
            }
            if (o.type === 'path') return Math.max(1, (o.path?.length || 1));
            if (o.type === 'polyline' || o.type === 'polygon') return Math.max(1, (o.points?.length || 1));
            return 4; // rect/circle/line 등 기본 도형의 근사값
        };
        const estimatedCommands = objects.reduce((s: number, o: any) => s + estimateShapeCommands(o), 0);
        // [7차 P3-1 2026-07-23] 경고 후 진행 → 차단으로 변경. 임계 초과 시 IPC 단일
        // JSON.stringify가 V8/CEF 한계(약 50만 명령 ≈ 50MB+)를 넘겨 어차피 실패하므로,
        // 실패가 예정된 작업을 시작하지 않고 여기서 중단한다. Mark Times는 REPEAT 블록으로
        // 전환되어 이 추정치에 곱해지지 않는다 — 여기 걸리는 것은 기하 자체가 거대한 경우뿐.
        const COMMAND_BLOCK_THRESHOLD = 500000;
        if (estimatedCommands > COMMAND_BLOCK_THRESHOLD) {
            useAppStore.getState().showToast(
                `예상 가공 명령 약 ${(estimatedCommands / 10000).toFixed(0)}만 개 — 전송 한계(50만)를 초과하여 시작할 수 없습니다. 도형/매트릭스 수를 줄여주세요.`,
                "error"
            );
            logger.error("Process", `Blocked: command estimate ~${estimatedCommands} exceeds ${COMMAND_BLOCK_THRESHOLD}`);
            return false;
        }

        logger.info("Process", "Process Sequence Step 1: Generating Commands...");
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
            logger.info("Process", "Process Sequence Step 1: Commands Generated Successfully");
            setTimeout(() => setScannerGenStatus('idle'), 1000);
            return true;
        } catch (e) {
            // [7차 P3-2 2026-07-23] 실패 원인을 로그/토스트에 그대로 노출한다(기존에는 정보 없는
            // "Generation Failed"만 남아 IPC 직렬화 한계였는지 생성 실패였는지 구분이 불가했다).
            const detail = e instanceof Error ? e.message : String(e);
            console.error("[SinoGalvoProcessPanel] Generation failed:", e);
            logger.error("Process", `Process Sequence Interrupted: Command Generation Failed — ${detail}`);
            useAppStore.getState().showToast(`Generation Failed: ${detail}`, "error");
            setScannerGenStatus('idle');
            return false;
        }
    };

    const handleProcessStart = async () => {
        useAppStore.getState().resetProcessStatus('scanner');
        const success = await handleGenerate();
        if (success) {
            logger.info("Process", "Process Sequence Step 2: Starting Scanner Machining");
            useAppStore.getState().showToast("Starting Scanner Process...", "info");
            useAppStore.getState().updateProcessStatus('scanner', { progress: 0 });
            
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
        if (commands.length === 0) return "No commands generated. (Draw something?)";
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
            }
            else if (status === 'running') {
                useAppStore.getState().setMotionState('Running');
            }
        });

        return () => { 
            off(); 
        };
    }, []);



    return (
        <div className="relative p-4 space-y-3 w-full bg-white dark:bg-slate-900/50 rounded-lg shadow-sm border border-gray-200 dark:border-none flex flex-col h-full overflow-hidden">
            {/* [NEW] 전역 Mark Speed/Shape Delay/Mark Times를 대체: 색상(레이어)별 프리셋으로만 동작 */}
            <ColorPresetPanel mode="scanner" />

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
                    title="Generated Commands"
                    count={commandCount}
                    text={commandText}
                    onClose={() => setShowCommands(false)}
                />
            )}
        </div>
    );
});

SinoGalvoProcessPanel.displayName = 'SinoGalvoProcessPanel';
