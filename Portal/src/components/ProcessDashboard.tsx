import React, { useEffect, useState } from 'react';
import { Box, Typography, LinearProgress } from '@mui/material';
import { useAppStore } from '../store/appStore';
import { useCanvasStore } from '../ui/pages/Recipe/Canvas/useCanvasStore';
import { hwFacade } from '../services/HardwareFacade';
import clsx from 'clsx';

interface ProcessDashboardProps {
    onStart?: () => void;
    showStartButton?: boolean;
}

/**
 * @component ProcessDashboard
 * @brief 공정 상태 모니터링 및 제어를 위한 대시보드 컴포넌트
 */
export function ProcessDashboard({ onStart, showStartButton = true }: ProcessDashboardProps) {
    const { viewMode, setHideOverlays, isProcessingLocal, setProcessingLocal } = useCanvasStore();
    const kind = (viewMode === 'scanner' ? 'scanner' : 'gcode') as "scanner" | "gcode";
    const status = useAppStore(s => s.processStates[kind]);
    const updateStatus = useAppStore(s => s.updateProcessStatus);
    const resetStatus = useAppStore(s => s.resetProcessStatus);
    const setMotionState = useAppStore((s) => s.setMotionState);

    const { state: processState, progress: globalProgress, startTime: startTimeStr, elapsedSeconds, finalElapsedTime } = status;
    const startTime = startTimeStr ? new Date(startTimeStr) : null;

    const [localProgress, setLocalProgress] = useState(globalProgress);
    useEffect(() => {
        setLocalProgress(globalProgress);
    }, [globalProgress, kind]);

    // [Issue9 P3 2026-07-23] MARK TIMES 회차는 드라이버 실측 방송(__onScannerMarkPass →
    // processStates.scanner.markPass/markPassTotal/markPassColor)을 그대로 표시한다.
    // 기존의 "선택 스와치 프리셋 분모 × 전체 진행률 환산 분자" 유도 계산은 (a) 다색 레시피에서
    // 가공 중인 그룹이 아닌 선택 스와치의 N을 표시("1/2" 오표시), (b) 소형 REPEAT 블록의 진행률
    // 회계 특성과 결합해 "6/10" 정체를 만들었으므로 폐기(계획서 ScannerIssue9 §2.2·§2.4).
    // 방송값은 그룹 시작/회차마다 갱신되며 색상 칩으로 현재 가공 레이어를 함께 명시한다.
    const totalMarkTimes = status.markPassTotal || 0;
    const currentMarkPass = status.markPass || 0;
    const markPassColor = status.markPassColor || '';

    const lastStartRef = React.useRef<number>(0);

    // [NEW] Sync hideOverlays with processState globally
    useEffect(() => {
        if (processState === 'idle') {
            // Ignore idle state for 2 seconds after manual start to allow backend to switch to running
            const now = Date.now();
            if (now - lastStartRef.current > 2000) {
                setHideOverlays(false);
                setProcessingLocal(false);
            }
        } else if (processState === 'running' || processState === 'paused') {
            setHideOverlays(true);
            setProcessingLocal(true);
        }
    }, [processState, setHideOverlays, setProcessingLocal]);

    const displayElapsed = finalElapsedTime !== null ? finalElapsedTime : elapsedSeconds;
    const estimatedTotalSeconds = status.estimatedTotalSeconds;
    
    // 종료 시간 계산
    const estimatedEndTime = finalElapsedTime !== null && startTime
        ? new Date(startTime.getTime() + finalElapsedTime * 1000)
        : null;

    const formatSecs = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = Math.floor(secs % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const formatTime = (d: Date | null) => d ? d.toTimeString().split(' ')[0] : '--:--:--';

    // [P1-5 2026-07-22] Stop 요청 중 표시. 기존에는 Stop 클릭 즉시 state를 'idle'로 강제해
    // Process Start 버튼이 다시 노출됐는데, 하드웨어는 아직 가공 중이라 재클릭 시 중첩 가공
    // (6차 이슈 S3)으로 이어졌다. 이제 idle 전환은 네이티브 Run() 종료 브로드캐스트
    // (scanner/status 'idle' → useProcessMonitor)만이 수행한다.
    const [isStopping, setIsStopping] = useState(false);
    useEffect(() => {
        if (processState === 'idle') setIsStopping(false);
    }, [processState]);

    const handleProcessControl = async (mode: number) => {
        if (viewMode === 'scanner') {
            if (mode === 2) { // Stop
                // [P1-5] UI 상태를 선점적으로 idle로 바꾸지 않는다(위 주석 참조). Stop은
                // 재전송 가능(네이티브 Stop()은 멱등)하므로 버튼은 계속 활성 상태로 둔다.
                setIsStopping(true);
                useAppStore.getState().showToast("Stop requested…", "warning");
                hwFacade.scannerStop();
            }
        } else {
            if (mode === 2) { // Stop
                updateStatus('gcode', { state: 'idle' });
                setHideOverlays(false);
                setProcessingLocal(false);
                setMotionState('Ready');
            } else if (mode === 3) { // Pause
                updateStatus('gcode', { state: 'paused' });
                setMotionState('Paused');
            } else if (mode === 4) { // Resume
                updateStatus('gcode', { state: 'running' });
                setMotionState('Running');
            }
            try {
                await hwFacade.processGCode(mode);
            } catch (e) {
                console.warn("Backend IPC failed", e);
            }
        }
    };

    return (
        <Box className="flex flex-col gap-4 text-slate-800 dark:text-slate-200">
            {/* 진행률 섹션 */}
            <div className="bg-gray-50 dark:bg-slate-800/80 rounded-lg p-4 flex flex-col gap-2 shadow-sm border border-gray-200 dark:border-slate-700">
                {/* [이슈 2 2026-07-21] 스캐너 모드는 JhcLib가 실시간 진행 피드백을 주지 못해
                    정직한 %가 불가하므로, 퍼센트 대신 부정형(indeterminate) 흐르는 로딩 표시를 쓴다.
                    Object(G-Code) 모드는 PMAC 현재 라인 기반 실측 %가 있으므로 기존 % 바를 유지한다. */}
                {kind === 'scanner' ? (
                    <>
                        <div className="flex justify-between items-center">
                            <Typography variant="subtitle2" className="text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold text-[10px]">Status</Typography>
                            <Typography variant="subtitle1" className="text-emerald-500 dark:text-emerald-400 font-bold">
                                {processState === 'running' ? 'Processing…' : (finalElapsedTime !== null ? 'Completed' : 'Ready')}
                            </Typography>
                        </div>
                        {processState === 'running' ? (
                            // MUI LinearProgress 기본 variant='indeterminate' = 흐르는 애니메이션
                            <LinearProgress color="success" sx={{ height: 8, borderRadius: 4 }} />
                        ) : (
                            <div className="w-full bg-gray-200 dark:bg-slate-900 rounded-full h-2 overflow-hidden border border-gray-300 dark:border-slate-700">
                                <div
                                    className="bg-emerald-500 h-full rounded-full transition-all duration-500 ease-out"
                                    style={{ width: finalElapsedTime !== null ? '100%' : '0%' }}
                                />
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className="flex justify-between items-center">
                            <Typography variant="subtitle2" className="text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold text-[10px]">Processing Rate</Typography>
                            <Typography variant="subtitle1" className="text-emerald-500 dark:text-emerald-400 font-bold">{localProgress.toFixed(1)}%</Typography>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-slate-900 rounded-full h-2 overflow-hidden border border-gray-300 dark:border-slate-700">
                            <div
                                className="bg-emerald-500 h-full rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${localProgress}%` }}
                            />
                        </div>
                    </>
                )}
                {/* [NEW] Mark Times 반복 회차 전용 행: 진행바 하단에 분리 배치하여 헤더 레이아웃을 침범하지 않음 */}
                {totalMarkTimes >= 1 && currentMarkPass >= 1 && (
                    <div className="flex justify-between items-center pt-2 mt-1 border-t border-gray-200 dark:border-slate-700">
                        <Typography variant="subtitle2" className="text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold text-[10px]">Mark Times</Typography>
                        <span className="flex items-center gap-1.5">
                            {/* [Issue9 P3] 현재 가공 중인 색상 그룹(레이어)의 스와치 — 실측 방송값 */}
                            {markPassColor && (
                                <span
                                    className="inline-block w-3 h-3 rounded-full border border-gray-300 dark:border-slate-600"
                                    style={{ backgroundColor: markPassColor }}
                                    title={markPassColor}
                                />
                            )}
                            <Typography variant="subtitle2" className="text-blue-500 dark:text-blue-400 font-mono font-bold">{currentMarkPass} / {totalMarkTimes}</Typography>
                        </span>
                    </div>
                )}
            </div>

            {/* 시간 정보 섹션 */}
            <div className="grid grid-cols-2 gap-2">
                <TimeCard label="Start Time" value={formatTime(startTime)} />
                <TimeCard 
                    label="Elapsed" 
                    value={(processState !== 'idle' || finalElapsedTime !== null) ? formatSecs(displayElapsed) : '00:00:00'} 
                    highlight 
                />
                <div className="col-span-2">
                    <TimeCard label="End Time" value={formatTime(estimatedEndTime)} />
                </div>
            </div>

            {/* 제어 버튼 섹션 */}
            <div className="mt-2 bg-gray-50 dark:bg-slate-800/80 rounded-lg p-4 flex flex-col gap-3 border border-gray-200 dark:border-slate-700">
                {processState === 'idle' && showStartButton && (
                    <button
                        onClick={() => {
                            lastStartRef.current = Date.now();
                            setProcessingLocal(true);
                            setHideOverlays(true);
                            if (onStart) onStart();
                        }}
                        className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-md transition-colors shadow-lg shadow-orange-900/40 uppercase tracking-widest text-sm"
                    >
                        Process Start
                    </button>
                )}

                {processState === 'running' && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleProcessControl(2)}
                            className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-md transition-colors shadow-lg shadow-red-900/40 uppercase tracking-widest text-sm"
                        >
                            {viewMode === 'scanner' && isStopping ? 'Stopping…' : 'Stop'}
                        </button>
                        {viewMode !== 'scanner' && (
                            <button
                                onClick={() => handleProcessControl(3)}
                                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold py-3 rounded-md transition-colors shadow-lg shadow-amber-900/40 uppercase tracking-widest text-sm"
                            >
                                Pause
                            </button>
                        )}
                    </div>
                )}

                {processState === 'paused' && viewMode !== 'scanner' && (
                    <div className="flex gap-2">
                         <button
                            onClick={() => handleProcessControl(2)}
                            className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-md transition-colors shadow-lg shadow-red-900/40 uppercase tracking-widest text-sm"
                        >
                            Stop
                        </button>
                        <button
                            onClick={() => handleProcessControl(4)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-md transition-colors shadow-lg shadow-emerald-900/40 uppercase tracking-widest text-sm"
                        >
                            Resume
                        </button>
                    </div>
                )}
            </div>
        </Box>
    );
}

function TimeCard({ label, value, highlight }: { label: string, value: string, highlight?: boolean }) {
    return (
        <div className="bg-white dark:bg-slate-900/40 p-2.5 rounded-lg border border-gray-200 dark:border-slate-700 flex flex-col items-center gap-0.5">
            <Typography variant="caption" className="text-slate-500 dark:text-slate-400 text-[9px] uppercase tracking-wider">{label}</Typography>
            <Typography variant="body1" className={clsx("font-mono font-bold tracking-tight text-sm", highlight ? 'text-blue-500 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300')}>
                {value}
            </Typography>
        </div>
    );
}
