import React, { useEffect, useState } from 'react';
import { Box, Text, Title, Progress, Group, Stack, Card, Badge, ActionIcon, Tooltip } from '@mantine/core';
import { useAppStore } from '../store/appStore';
import { useCanvasStore } from '../ui/pages/Recipe/Canvas/useCanvasStore';
import { hwFacade } from '../services/HardwareFacade';
import { Play, Square, Pause, RotateCcw, Zap, Clock, Calendar } from 'lucide-react';
import clsx from 'clsx';

export function ProcessPanel() {
    const setMotionState = useAppStore((s) => s.setMotionState);
    const {
        viewMode,
        scannerSettings,
        gcodeSettings,
    } = useCanvasStore();
    const settings = viewMode === 'scanner' ? scannerSettings : gcodeSettings;

    const kind = (viewMode === 'scanner' ? 'scanner' : 'gcode') as "scanner" | "gcode";
    const status = useAppStore(s => s.processStates[kind]);
    const updateStatus = useAppStore(s => s.updateProcessStatus);
    const resetStatus = useAppStore(s => s.resetProcessStatus);

    const { state: processState, progress: globalProgress, startTime: startTimeStr, elapsedSeconds, finalElapsedTime } = status;
    const startTime = startTimeStr ? new Date(startTimeStr) : null;

    const [localProgress, setLocalProgress] = useState(globalProgress);
    useEffect(() => {
        setLocalProgress(globalProgress);
    }, [globalProgress, kind]);

    const displayElapsed = finalElapsedTime !== null ? finalElapsedTime : elapsedSeconds;
    const estimatedTotalSeconds = status.estimatedTotalSeconds;

    const handleProcess = async (mode: number) => {
        if (viewMode === 'scanner') {
            if (mode === 1) { // Start
                useAppStore.getState().showToast("Initializing Scanner Sequence...", "info");
                resetStatus('scanner');

                const cmds = useCanvasStore.getState().scannerCommands;
                if (cmds && cmds.length > 0) {
                    await hwFacade.generateScannerCommands(cmds);
                }

                hwFacade.scannerControl(1, {
                    scannerMarkSpeed: Number(scannerSettings.feedRate),
                    scannerIntensity: Number(scannerSettings.intensity)
                });

                const pos = useAppStore.getState().positions;
                useAppStore.getState().setLastProcessStartPosition({ X: pos.X, Y: pos.Y });
            } else if (mode === 2) { // Stop
                // [P1-5 2026-07-22] state를 선점적으로 'idle'로 바꾸지 않는다 — Start 버튼이
                // 하드웨어 가공 중에 다시 노출되어 중첩 가공(6차 이슈 S3)의 입구가 됐다.
                // idle 전환은 네이티브 Run() 종료 브로드캐스트(useProcessMonitor)가 수행한다.
                useAppStore.getState().showToast("Stop requested…", "warning");
                hwFacade.scannerStop();
            }
        } else {
            let ttlTime: number | undefined;

            if (mode === 1) { // Start
                useAppStore.getState().showToast("Starting G-Code Process...", "info");
                resetStatus('gcode');

                const canvas = useCanvasStore.getState().canvas;
                const objects = canvas ? canvas.getObjects() : [];
                const dotObject = objects.find((obj: any) => obj.id === 'dot_marker') as any;
                ttlTime = dotObject ? dotObject.markPointTime : 20;

                const pos = useAppStore.getState().positions;
                useAppStore.getState().setLastProcessStartPosition({ X: pos.X, Y: pos.Y });

            } else if (mode === 2) { // Stop
                updateStatus('gcode', { state: 'idle' });
                setMotionState('Ready');
            } else if (mode === 3) { // Pause
                updateStatus('gcode', { state: 'paused' });
                setMotionState('Paused');
            } else if (mode === 4) { // Resume
                updateStatus('gcode', { state: 'running' });
                setMotionState('Running');
            }

            try {
                await hwFacade.processGCode(mode, ttlTime);
            } catch (e) {
                console.warn("Backend IPC failed", e);
            }
        }
    };

    const formatSecs = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const estimatedEndTime = finalElapsedTime !== null && startTime
        ? new Date(startTime.getTime() + finalElapsedTime * 1000)
        : null;

    const formatTime = (d: Date | null) => d ? d.toTimeString().split(' ')[0] : '--:--:--';

    return (
        <Box className="flex flex-col h-full bg-[#0B1121] p-5 gap-6 border-l border-white/5 premium-scrollbar overflow-y-auto">
            <Stack gap={4}>
                <Group justify="space-between" align="center">
                    <Title order={4} className="text-white font-bold tracking-tight uppercase flex items-center gap-2">
                        <Zap size={18} className="text-emerald-400 fill-emerald-400/20" />
                        Process Monitor
                    </Title>
                    <Badge variant="dot" color={processState === 'running' ? 'emerald' : 'gray'} size="sm">
                        {processState.toUpperCase()}
                    </Badge>
                </Group>
                <Text size="xs" c="dimmed">Advanced Manufacturing Control System v4.0</Text>
            </Stack>

            {/* Progress Section */}
            <Card className="glass-card gap-4" p="lg">
                <Group justify="space-between">
                    <Stack gap={0}>
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts="0.1em">Progress Rate</Text>
                        <Text className="neon-text-emerald font-mono text-3xl font-bold">
                            {localProgress.toFixed(1)}%
                        </Text>
                    </Stack>
                    <div className={clsx("status-indicator", processState === 'running' ? "bg-emerald-400 animate-pulse" : "bg-white/20")} />
                </Group>
                <Progress 
                    value={localProgress} 
                    size="xl" 
                    radius="xl" 
                    color="emerald" 
                    animated={processState === 'running'}
                    className="bg-white/5 border border-white/5"
                />
            </Card>

            {/* Time Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
                <TimeCard icon={<Calendar size={12}/>} label="Start Time" value={formatTime(startTime)} />
                <TimeCard 
                    icon={<Clock size={12}/>} 
                    label="Elapsed" 
                    value={(processState !== 'idle' || finalElapsedTime !== null) ? formatSecs(displayElapsed) : '00:00:00'} 
                    highlight 
                />
                <div className="col-span-2">
                    <TimeCard icon={<RotateCcw size={12}/>} label="Est. End Time" value={(processState !== 'idle' || finalElapsedTime !== null) ? formatTime(estimatedEndTime) : '--:--:--'} />
                </div>
            </div>

            <div className="flex-1" />

            {/* Control Center */}
            <Stack gap="md">
                <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts="0.1em" pl={4}>System Control Center</Text>
                
                {processState === 'idle' && (
                    <button onClick={() => handleProcess(1)} className="btn-premium-primary flex items-center justify-center gap-2">
                        <Play size={16} fill="white" />
                        Initialize Process
                    </button>
                )}

                {processState === 'running' && (
                    <Group grow gap="sm">
                        <button onClick={() => handleProcess(2)} className="btn-premium-danger flex items-center justify-center gap-2">
                            <Square size={16} fill="white" />
                            Emergency Stop
                        </button>
                        {viewMode !== 'scanner' && (
                            <button onClick={() => handleProcess(3)} className="btn-premium-warning flex items-center justify-center gap-2">
                                <Pause size={16} fill="white" />
                                Pause
                            </button>
                        )}
                    </Group>
                )}

                {processState === 'paused' && (
                    <Group grow gap="sm">
                        <button onClick={() => handleProcess(2)} className="btn-premium-danger flex items-center justify-center gap-2">
                            <Square size={16} fill="white" />
                            Stop
                        </button>
                        <button onClick={() => handleProcess(4)} className="btn-premium-primary flex items-center justify-center gap-2">
                            <Play size={16} fill="white" />
                            Resume
                        </button>
                    </Group>
                )}
            </Stack>

        </Box>
    );
}

function TimeCard({ icon, label, value, highlight }: { icon: React.ReactNode, label: string, value: string, highlight?: boolean }) {
    return (
        <Card className="bg-white/2 border border-white/5 p-3 flex flex-col items-center justify-center gap-1.5" radius="md">
            <Group gap={6} align="center" opacity={0.6}>
                {icon}
                <Text size="10px" fw={700} tt="uppercase" lts="0.05em">{label}</Text>
            </Group>
            <Text className={clsx("font-mono font-medium", highlight ? "text-emerald-400 neon-text-emerald" : "text-slate-300")} size="lg">
                {value}
            </Text>
        </Card>
    );
}

