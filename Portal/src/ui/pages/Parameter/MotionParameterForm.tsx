import React, { useEffect, useState } from 'react';
import { hwFacade } from '../../../services/HardwareFacade';
import { MotionConfig, DEFAULT_MOTION_CONFIG } from '../../../core/types/motion-config';
import { ParameterLayout, ParameterCard, ParameterSectionHeader, ParameterInput, ParameterSwitch } from '../../components/ParameterComponents';
import { MotionProfileMatrix } from '../../components/MotionProfileMatrix';
import { useAppStore } from '../../../store/appStore';
import { CircularProgress } from '@mui/material';

interface MotionParameterFormProps {
    view: 'axis' | 'speed';
}

export const MotionParameterForm: React.FC<MotionParameterFormProps> = ({ view }) => {
    const [config, setConfig] = useState<MotionConfig>(DEFAULT_MOTION_CONFIG);
    const [loading, setLoading] = useState(false);
    const [activeTabIdx, setActiveTabIdx] = useState(0);

    const axisFlags = useAppStore(s => s.motion.axisFlags);
    const hardware = useAppStore(s => s.hardware);
    const isHoming = useAppStore(s => s.homingState.active);
    const [alarmTimers, setAlarmTimers] = useState<Record<string, number>>({});

    // Timer Effect
    useEffect(() => {
        const interval = setInterval(() => {
            setAlarmTimers(prev => {
                let changed = false;
                const next = { ...prev };
                for (const axis in next) {
                    if (next[axis] > 0) {
                        next[axis] -= 1;
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Initial Load
    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const { ok, data } = await hwFacade.getMotionConfig();
            if (ok && data && data.axes) {
                setConfig(data);
            } else {
                console.warn("Failed to load motion config, using default.");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            const { ok, message } = await hwFacade.setMotionConfig(config);
            if (!ok) console.error(message);
            else alert("Configuration Saved!");
        } catch (e) {
            console.error(e);
        }
    };

    const handleAxisChange = (axisIdx: number, field: string, value: any) => {
        const newAxes = [...config.axes];
        newAxes[axisIdx] = { ...newAxes[axisIdx], [field]: value };
        setConfig({ ...config, axes: newAxes });
    };

    const handleSpeedChange = (axisIdx: number, profile: string, field: string, value: any) => {
        const newAxes = [...config.axes];
        const axis = newAxes[axisIdx];
        const pKey = profile as keyof typeof axis.speeds;
        const newSpeeds = { ...axis.speeds, [pKey]: { ...axis.speeds[pKey], [field]: value } };
        newAxes[axisIdx] = { ...axis, speeds: newSpeeds };
        setConfig({ ...config, axes: newAxes });
    };

    const handleServo = async (axisName: "X" | "Y" | "Z", state: number) => {
        await hwFacade.setServo(axisName, state);
    };

    const handleAlarmReset = async (axisName: "X" | "Y" | "Z", type: number) => {
        await hwFacade.resetAlarm(axisName, type);
        if (type === 2) {
            setAlarmTimers(prev => ({ ...prev, [axisName]: 15 }));
        }
    };

    const handleFastechAlarmReset = async (axisName: "X" | "Y" | "Z") => {
        await hwFacade.fastechAlarmReset(axisName);
    };

    if (loading) return <div className="p-20 text-center text-slate-500 font-mono tracking-widest animate-pulse">LOADING MOTION CONFIG...</div>;

    const activeAxis = config.axes[activeTabIdx];

    const Actions = (
        <>
            <button
                onClick={loadConfig}
                className="px-5 py-2.5 rounded text-sm font-bold text-slate-500 hover:text-white hover:bg-slate-800 transition-all uppercase tracking-wider"
            >
                Reload
            </button>
            <button
                onClick={handleSave}
                className="bg-cyan-600 hover:bg-cyan-500 text-white px-8 py-2.5 rounded font-bold shadow-lg shadow-cyan-500/20 transition-all uppercase tracking-wider hover:-translate-y-0.5"
            >
                Save
            </button>
        </>
    );

    return (
        <ParameterLayout
            title="Motion Control"
            actions={Actions}
        >
            <div className="flex flex-col h-full gap-6">

                {/* Axis Tabs */}
                <div className="flex gap-2">
                    {config.axes.map((axis, idx) => {
                        const isActive = activeTabIdx === idx;
                        return (
                            <button
                                key={axis.name}
                                onClick={() => setActiveTabIdx(idx)}
                                className={`px-6 py-3 rounded text-xs font-bold font-mono transition-all border ${isActive
                                    ? "bg-slate-800 text-cyan-400 border-cyan-500/50 shadow-[0_0_15px_-5px_rgba(6,182,212,0.3)]"
                                    : "bg-slate-900 text-slate-500 border-slate-800 hover:bg-slate-800 hover:text-slate-300"
                                    }`}
                            >
                                <span className="mr-2 opacity-50">AXIS</span>
                                {axis.name}
                            </button>
                        );
                    })}
                </div>

                {activeAxis && (
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-full">

                        {/* Left Column (1/3): Safety & Calibration */}
                        <div className="flex flex-col gap-6 xl:col-span-1">

                            {/* Limits & Safety */}
                            <ParameterCard>
                                <div className="flex justify-between items-center mb-6 border-b border-slate-700/50 pb-2">
                                    <ParameterSectionHeader title="Limits & Safety" />
                                    <div className="mb-4"> {/* Adjust alignment due to header margin */}
                                        <ParameterSwitch
                                            label="Limit Sensors"
                                            checked={activeAxis.limit_used}
                                            onChange={(e) => handleAxisChange(activeTabIdx, 'limit_used', e)}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="p-4 rounded bg-slate-900/50 border border-slate-700/50">
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-[10px] font-bold text-orange-500 uppercase tracking-widest block">Hardware Limits</label>
                                            {isHoming && <span className="text-[10px] text-slate-500">호밍 중에는 수정할 수 없습니다</span>}
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <ParameterInput label="Min Limit" value={activeAxis.limit_min} onChange={(v) => handleAxisChange(activeTabIdx, 'limit_min', v)} unit="mm" type="number" disabled={isHoming} />
                                            <ParameterInput label="Max Limit" value={activeAxis.limit_max} onChange={(v) => handleAxisChange(activeTabIdx, 'limit_max', v)} unit="mm" type="number" disabled={isHoming} />
                                        </div>
                                    </div>

                                    <div className="p-4 rounded bg-slate-900/50 border border-slate-700/50">
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-[10px] font-bold text-purple-500 uppercase tracking-widest block">Software Interlock</label>
                                            {isHoming && <span className="text-[10px] text-slate-500">호밍 중에는 수정할 수 없습니다</span>}
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <ParameterInput label="Soft Min" value={activeAxis.interlock_min} onChange={(v) => handleAxisChange(activeTabIdx, 'interlock_min', v)} unit="mm" type="number" disabled={isHoming} />
                                            <ParameterInput label="Soft Max" value={activeAxis.interlock_max} onChange={(v) => handleAxisChange(activeTabIdx, 'interlock_max', v)} unit="mm" type="number" disabled={isHoming} />
                                        </div>
                                    </div>
                                </div>
                            </ParameterCard>

                            {/* Calibration */}
                            <ParameterCard className="flex-1">
                                <ParameterSectionHeader title="Calibration" />
                                <div className="grid grid-cols-2 gap-4">
                                    <ParameterInput
                                        label="Scale Unit"
                                        value={activeAxis.scale_unit}
                                        onChange={(v) => handleAxisChange(activeTabIdx, 'scale_unit', v)}
                                        unit="mm/pulse"
                                        type="number"
                                    />
                                    <ParameterInput
                                        label="Home Offset"
                                        value={activeAxis.home_offset}
                                        onChange={(v) => handleAxisChange(activeTabIdx, 'home_offset', v)}
                                        unit="mm"
                                        type="number"
                                    />
                                </div>
                            </ParameterCard>
                        </div>

                        {/* Right Column (2/3): Speed Matrix + Axis Controls */}
                        <div className="flex flex-col xl:col-span-2 gap-6">
                            <MotionProfileMatrix
                                title={`Speed Profiles - Axis ${activeAxis.name}`}
                                data={activeAxis.speeds}
                                columns={[
                                    { key: 'slow', label: 'Slow', colorClass: 'text-emerald-400', bgClass: 'bg-emerald-950/10' },
                                    { key: 'mid', label: 'Medium', colorClass: 'text-blue-400', bgClass: 'bg-blue-950/10' },
                                    { key: 'fast', label: 'Fast', colorClass: 'text-orange-400', bgClass: 'bg-orange-950/10' }
                                ]}
                                rows={[
                                    { key: 'velocity', label: 'Velocity', unit: 'um/s' },
                                    { key: 'accel_time', label: 'Accel/Decel', unit: 'ms' }
                                ]}
                                onUpdate={(profile, field, val) => handleSpeedChange(activeTabIdx, profile, field, val)}
                            />

                            {/* Axis Controls */}
                            <ParameterCard>
                                <ParameterSectionHeader title="Axis Controls" />

                                {(() => {
                                    const aName = activeAxis.name as "X" | "Y" | "Z";
                                    const isServoOn = axisFlags.servo[aName];
                                    const isServoOnDone = isServoOn === true;
                                    const isServoOffDone = isServoOn === false;

                                    const isFollowingDone = axisFlags.alarmResetState[aName] === 100 && axisFlags.alarm[aName];
                                    const isAmpFaultDone = axisFlags.alarmResetState[aName] === 200 && axisFlags.alarm[aName];
                                    const ampTimer = alarmTimers[aName] || 0;

                                    return (
                                        <div className="grid grid-cols-2 gap-8">
                                            {/* Servo Control */}
                                            <div className="p-4 rounded bg-slate-900/50 border border-slate-700/50 flex flex-col justify-center">
                                                <label className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest mb-4 block">Servo Power</label>
                                                <div className="flex gap-4 mb-2">
                                                    <button
                                                        onClick={() => handleServo(aName, 1)}
                                                        className={`flex-1 py-3 font-bold rounded shadow-lg transition-all ${isServoOnDone ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'} uppercase tracking-widest text-xs`}
                                                    >
                                                        {axisFlags.servoState[aName] === 1 ? <CircularProgress size={14} color="inherit" /> : 'Servo ON'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleServo(aName, 2)}
                                                        className={`flex-1 py-3 font-bold rounded shadow-lg transition-all ${isServoOffDone ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-500/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'} uppercase tracking-widest text-xs`}
                                                    >
                                                        {axisFlags.servoState[aName] === 2 ? <CircularProgress size={14} color="inherit" /> : 'Servo OFF'}
                                                    </button>
                                                </div>
                                                <div className="text-[10px] text-slate-500 font-mono mt-2">
                                                    Status Var: {axisFlags.servoState[aName]} {isServoOnDone && '(ON Done)'} {isServoOffDone && '(OFF Done)'}
                                                </div>
                                            </div>

                                            {/* Alarm Reset Control */}
                                            <div className="p-4 rounded bg-slate-900/50 border border-slate-700/50 flex flex-col justify-center">
                                                <label className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-4 block">Alarm Reset</label>
                                                {hardware.motion === 'Fastech' ? (
                                                    <div className="flex gap-4 mb-2">
                                                        <button
                                                            onClick={() => handleFastechAlarmReset(aName)}
                                                            className="flex-1 py-3 font-bold rounded shadow-lg transition-all bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white uppercase tracking-widest text-xs"
                                                        >
                                                            Alarm Reset
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex gap-4 mb-2">
                                                        <button
                                                            onClick={() => handleAlarmReset(aName, 1)}
                                                            className={`flex-1 py-3 font-bold rounded shadow-lg transition-all ${isFollowingDone ? 'bg-emerald-600 text-white' : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'} uppercase tracking-widest text-[10px]`}
                                                        >
                                                            {axisFlags.alarmResetState[aName] === 1 ? <CircularProgress size={14} color="inherit" /> : 'Following Error'}
                                                        </button>

                                                        <button
                                                            onClick={() => handleAlarmReset(aName, 2)}
                                                            disabled={ampTimer > 0}
                                                            className={`flex-1 py-3 font-bold rounded shadow-lg transition-all ${ampTimer > 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : isAmpFaultDone ? 'bg-emerald-600 text-white' : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'} uppercase tracking-widest text-[10px]`}
                                                        >
                                                            {ampTimer > 0 ? `Wait ${ampTimer}s` : 'Amp Fault'}
                                                        </button>
                                                    </div>
                                                )}
                                                <div className="text-[10px] text-slate-500 font-mono mt-2 flex justify-between">
                                                    <span>Status Var: {axisFlags.alarmResetState[aName]}</span>
                                                    {hardware.motion !== 'Fastech' && ampTimer > 0 && <span className="text-orange-400">재시작 완료까지 약 15초 소요됩니다</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </ParameterCard>
                        </div>

                    </div>
                )}
            </div>
        </ParameterLayout>
    );
};
