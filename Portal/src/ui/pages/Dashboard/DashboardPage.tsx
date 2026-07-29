/**
 * @file DashboardPage.tsx
 * @brief Semiconductor laser equipment monitoring dashboard.
 * @details Visualizes real-time axis positions, EMO safety state, active scanner (SinoGalvo/Scanlab) metrics, and RTC card connection progress. Supports unified Light/Dark theme styles.
 */

import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../../store/appStore';
import { useCanvasStore } from '../Recipe/Canvas/useCanvasStore';
import { useShallow } from 'zustand/react/shallow';
import { 
    Group, 
    Text, 
    Paper, 
    Stack, 
    SimpleGrid, 
    RingProgress, 
    Badge as MantineBadge, 
    ThemeIcon 
} from '@mantine/core';
import { 
    Cpu, 
    Zap, 
    Activity, 
    ShieldAlert, 
    FileText, 
    Compass, 
    Settings,
    Thermometer,
    RefreshCw
} from 'lucide-react';
import { hwFacade } from '../../../services/HardwareFacade';
import { logger } from '../../../utils/logger';

/**
 * @component DashboardPage
 * @brief Premium monitoring page displaying real-time semiconductor equipment telemetry.
 */
export const DashboardPage: React.FC = () => {
    const { 
        positions, 
        motion, 
        io, 
        hardware, 
        processStates, 
        aureliaStatus 
    } = useAppStore(useShallow(s => ({
        positions: s.positions,
        motion: s.motion,
        io: s.io,
        hardware: s.hardware,
        processStates: s.processStates,
        aureliaStatus: s.aureliaStatus
    })));

    const [temp, setTemp] = useState(24.5);
    const [gasFlow, setGasFlow] = useState(320.4);

    // Dynamic environmental variables simulation
    useEffect(() => {
        const interval = setInterval(() => {
            setTemp(prev => +(prev + (Math.random() - 0.5) * 0.2).toFixed(2));
            setGasFlow(prev => +(prev + (Math.random() - 0.5) * 1.5).toFixed(1));
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    // Safety checks
    const hasAlarm = motion.axisFlags.alarm.X || motion.axisFlags.alarm.Y || motion.axisFlags.alarm.Z;
    const isEMO = io.flags.emo;

    // Scanlab / SinoGalvo rendering details
    const isScanlab = hardware.scanner === 'Scanlab';
    const activeProgress = processStates.scanner.progress;

    return (
        <div className="w-full h-full min-h-0 bg-[#0B1121] text-slate-100 p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
            {/* Top Stat Summary Grid */}
            <Group justify="space-between" align="flex-end" className="border-b border-slate-800 pb-4">
                <Stack gap={2}>
                    <Text size="xs" className="text-cyan-500 font-bold uppercase tracking-widest">Semiconductor Process Control</Text>
                    <Text size="xl" fw={900} className="text-white text-2xl tracking-tight">Equipment Overview</Text>
                </Stack>
                <Group gap="xs">
                    <MantineBadge 
                        variant="dot" 
                        color={isEMO ? "red" : (hasAlarm ? "orange" : "green")} 
                        size="lg" 
                        className="bg-slate-900 border border-slate-800 px-4 py-3"
                    >
                        {isEMO ? "EMERGENCY ACTIVE" : (hasAlarm ? "ALARM WARNING" : "SYSTEM STABLE")}
                    </MantineBadge>
                </Group>
            </Group>

            {/* Main Cards Grid */}
            <SimpleGrid cols={{ base: 1, md: 2, lg: 4 }} spacing="lg">
                {/* Chamber Temp */}
                <Paper className="bg-[#151B25] border border-slate-800/80 p-5 rounded-xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl group-hover:bg-cyan-500/10 transition-all duration-300" />
                    <Group justify="space-between">
                        <Text size="xs" className="text-slate-400 font-bold uppercase tracking-wider">Chamber Temp</Text>
                        <ThemeIcon size="md" radius="md" color="cyan" className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            <Thermometer size={16} />
                        </ThemeIcon>
                    </Group>
                    <Group align="flex-end" gap={4} className="mt-4">
                        <Text className="text-3xl font-black text-white font-mono">{temp}</Text>
                        <Text size="xs" className="text-slate-500 font-mono mb-1">°C</Text>
                    </Group>
                </Paper>

                {/* gasFlow */}
                <Paper className="bg-[#151B25] border border-slate-800/80 p-5 rounded-xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-2xl group-hover:bg-orange-500/10 transition-all duration-300" />
                    <Group justify="space-between">
                        <Text size="xs" className="text-slate-400 font-bold uppercase tracking-wider">Argon Gas Flow</Text>
                        <ThemeIcon size="md" radius="md" color="orange" className="bg-orange-500/10 text-orange-400 border border-orange-500/20">
                            <Activity size={16} />
                        </ThemeIcon>
                    </Group>
                    <Group align="flex-end" gap={4} className="mt-4">
                        <Text className="text-3xl font-black text-white font-mono">{gasFlow}</Text>
                        <Text size="xs" className="text-slate-500 font-mono mb-1">sccm</Text>
                    </Group>
                </Paper>

                {/* Laser Power Status */}
                <Paper className="bg-[#151B25] border border-slate-800/80 p-5 rounded-xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-all duration-300" />
                    <Group justify="space-between">
                        <Text size="xs" className="text-slate-400 font-bold uppercase tracking-wider">Aurelia Temp</Text>
                        <ThemeIcon size="md" radius="md" color="violet" className="bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            <Zap size={16} />
                        </ThemeIcon>
                    </Group>
                    <Group align="flex-end" gap={4} className="mt-4">
                        <Text className="text-3xl font-black text-white font-mono">
                            {aureliaStatus.connected ? aureliaStatus.temp.toFixed(1) : "OFFLINE"}
                        </Text>
                        <Text size="xs" className="text-slate-500 font-mono mb-1">{aureliaStatus.connected ? "°C" : ""}</Text>
                    </Group>
                </Paper>

                {/* Scanner Type */}
                <Paper className="bg-[#151B25] border border-slate-800/80 p-5 rounded-xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-2xl group-hover:bg-teal-500/10 transition-all duration-300" />
                    <Group justify="space-between">
                        <Text size="xs" className="text-slate-400 font-bold uppercase tracking-wider">Scanner Type</Text>
                        <ThemeIcon size="md" radius="md" color="teal" className="bg-teal-500/10 text-teal-400 border border-teal-500/20">
                            <Cpu size={16} />
                        </ThemeIcon>
                    </Group>
                    <Group align="flex-end" gap={4} className="mt-4">
                        <Text className="text-3xl font-black text-white font-mono">{hardware.scanner}</Text>
                    </Group>
                </Paper>
            </SimpleGrid>

            {/* Core Monitoring Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                {/* Axis Position Control Monitor */}
                <Paper className="lg:col-span-2 bg-[#151B25] border border-slate-800/80 p-6 rounded-xl shadow-lg flex flex-col gap-6">
                    <Group justify="space-between" className="border-b border-slate-800 pb-3">
                        <Group gap="sm">
                            <Compass className="text-cyan-400" size={20} />
                            <Text fw={700} className="text-white uppercase tracking-wider text-sm">Axis Position Telemetry</Text>
                        </Group>
                    </Group>

                    <Stack gap="lg" className="flex-1 justify-center">
                        {/* X-axis */}
                        <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-800 flex items-center justify-between">
                            <Stack gap={2}>
                                <Text size="sm" className="font-bold text-cyan-400 font-mono">X-AXIS</Text>
                                <Group gap="xs">
                                    <MantineBadge color={motion.axisFlags.servo.X ? "teal" : "gray"} size="xs">Servo</MantineBadge>
                                    <MantineBadge color={motion.axisFlags.homed.X ? "blue" : "gray"} size="xs">Homed</MantineBadge>
                                    {motion.axisFlags.alarm.X && <MantineBadge color="red" size="xs">Alarm</MantineBadge>}
                                </Group>
                            </Stack>
                            <Text className="text-2xl font-black font-mono text-white tracking-wider">
                                {positions.X?.toFixed(4) ?? "0.0000"} <span className="text-slate-500 text-xs">mm</span>
                            </Text>
                        </div>

                        {/* Y-axis */}
                        <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-800 flex items-center justify-between">
                            <Stack gap={2}>
                                <Text size="sm" className="font-bold text-cyan-400 font-mono">Y-AXIS</Text>
                                <Group gap="xs">
                                    <MantineBadge color={motion.axisFlags.servo.Y ? "teal" : "gray"} size="xs">Servo</MantineBadge>
                                    <MantineBadge color={motion.axisFlags.homed.Y ? "blue" : "gray"} size="xs">Homed</MantineBadge>
                                    {motion.axisFlags.alarm.Y && <MantineBadge color="red" size="xs">Alarm</MantineBadge>}
                                </Group>
                            </Stack>
                            <Text className="text-2xl font-black font-mono text-white tracking-wider">
                                {positions.Y?.toFixed(4) ?? "0.0000"} <span className="text-slate-500 text-xs">mm</span>
                            </Text>
                        </div>

                        {/* Z-axis */}
                        <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-800 flex items-center justify-between">
                            <Stack gap={2}>
                                <Text size="sm" className="font-bold text-cyan-400 font-mono">Z-AXIS (Laser Focus)</Text>
                                <Group gap="xs">
                                    <MantineBadge color={motion.axisFlags.servo.Z ? "teal" : "gray"} size="xs">Servo</MantineBadge>
                                    <MantineBadge color={motion.axisFlags.homed.Z ? "blue" : "gray"} size="xs">Homed</MantineBadge>
                                    {motion.axisFlags.alarm.Z && <MantineBadge color="red" size="xs">Alarm</MantineBadge>}
                                </Group>
                            </Stack>
                            <Text className="text-2xl font-black font-mono text-white tracking-wider">
                                {positions.Z?.toFixed(4) ?? "0.0000"} <span className="text-slate-500 text-xs">mm</span>
                            </Text>
                        </div>
                    </Stack>
                </Paper>

                {/* Scanner Progress & Buffer Information */}
                <Paper className="bg-[#151B25] border border-slate-800/80 p-6 rounded-xl shadow-lg flex flex-col gap-5">
                    <Group justify="space-between" className="border-b border-slate-800 pb-3">
                        <Group gap="sm">
                            <Settings className="text-teal-400" size={20} />
                            <Text fw={700} className="text-white uppercase tracking-wider text-sm">Machining Pipeline</Text>
                        </Group>
                    </Group>

                    <Stack gap="md" align="center" justify="center" className="flex-1">
                        <RingProgress
                            size={160}
                            roundCaps
                            thickness={14}
                            sections={[{ value: activeProgress, color: 'cyan' }]}
                            label={
                                <Stack gap={0} align="center">
                                    <Text className="text-xl font-black text-white font-mono">{activeProgress.toFixed(0)}%</Text>
                                    <Text size="xs" className="text-slate-500 uppercase tracking-widest font-bold text-[9px]">Progress</Text>
                                </Stack>
                            }
                        />

                        <div className="w-full space-y-2.5 mt-2">
                            <div className="flex justify-between items-center bg-slate-900/40 p-2.5 rounded border border-slate-800">
                                <Text size="xs" className="text-slate-400 font-medium">RTC Card Sync</Text>
                                <MantineBadge color={isScanlab ? "teal" : "gray"} size="sm">
                                    {isScanlab ? "ACTIVE (RTC6)" : "INACTIVE"}
                                </MantineBadge>
                            </div>
                            <div className="flex justify-between items-center bg-slate-900/40 p-2.5 rounded border border-slate-800">
                                <Text size="xs" className="text-slate-400 font-medium">Job Status</Text>
                                <Text size="xs" fw={700} className={processStates.scanner.state === 'running' ? "text-cyan-400 animate-pulse font-mono" : "text-slate-500 font-mono"}>
                                    {processStates.scanner.state.toUpperCase()}
                                </Text>
                            </div>
                        </div>
                    </Stack>
                </Paper>
            </div>
        </div>
    );
};

export default DashboardPage;
