import React, { useEffect, useState } from 'react';
import { hwFacade } from '../../../../services/HardwareFacade';
import { ParameterLayout, ParameterCard, ParameterSectionHeader, ParameterSlider, ParameterSwitch } from '../../../components/ParameterComponents';

import useAppStore from '../../../../store/appStore';

// Sub-component for a single Channel
const LightChannel = ({
    label,
    value,
    isOn,
    onChange,
    onToggle
}: {
    label: string;
    value: number; // 0-100
    isOn: boolean;
    onChange: (val: number) => void;
    onToggle: (state: boolean) => void;
}) => {
    return (
        <div className={`flex items-center gap-4 p-3 rounded-lg border transition-all duration-200 ${isOn ? 'bg-slate-900/80 border-cyan-500/30 shadow-[0_0_15px_-5px_rgba(6,182,212,0.1)]' : 'bg-slate-900/30 border-slate-800 opacity-60 hover:opacity-100'}`}>
            {/* Label */}
            <div className="w-20 shrink-0">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-widest block mb-1">{label}</span>
                <span className={`text-[10px] font-mono ${isOn ? 'text-cyan-400' : 'text-slate-600'}`}>
                    {isOn ? "Active" : "Disabled"}
                </span>
            </div>

            {/* Slider */}
            <div className="flex-1 min-w-0">
                <ParameterSlider
                    label="Brightness"
                    value={value}
                    onChange={onChange}
                    min={0}
                    max={100}
                    unit="%"
                />
            </div>

            {/* Toggle */}
            <div className="shrink-0 pl-3 border-l border-slate-700/50">
                <ParameterSwitch
                    label={isOn ? "ON" : "OFF"}
                    checked={isOn}
                    onChange={onToggle}
                />
            </div>
        </div>
    );
};

export default function LightPage() {
    const features = useAppStore(s => s.features);
    const [tabIndex, setTabIndex] = useState(0);
    const [loading, setLoading] = useState(true);

    // Brightness Values
    const [data, setData] = useState<{
        scanner: number[];
        object20: number[];
        object50: number[];
    }>({
        scanner: [0, 0, 0, 0, 0, 0],
        object20: [0, 0, 0, 0, 0, 0],
        object50: [0, 0, 0, 0, 0, 0]
    });

    // On/Off States
    const [channelStates, setChannelStates] = useState<{
        scanner: boolean[];
        object20: boolean[];
        object50: boolean[];
    }>({
        scanner: [true, true, true, true, true, true],
        object20: [true, true, true, true, true, true],
        object50: [true, true, true, true, true, true]
    });

    const [connected, setConnected] = useState(true);

    // Initial Load
    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            const res = await hwFacade.getLightConfig() as any;
            if (res.ok) {
                setData({
                    scanner: res.scanner,
                    object20: res.object20,
                    object50: res.object50
                });

                setChannelStates({
                    scanner: res.scanner_on || [false, false, false, false, false, false],
                    object20: res.object20_on || [false, false, false, false, false, false],
                    object50: res.object50_on || [false, false, false, false, false, false]
                });

                if (typeof res.connected === 'boolean') {
                    setConnected(res.connected);
                }

                if (res.mode >= 0 && res.mode <= 2) setTabIndex(res.mode);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const currentProfileKey = tabIndex === 0 ? 'scanner' : (tabIndex === 1 ? 'object20' : 'object50');
    const rawChannels = data[currentProfileKey] || [0, 0, 0, 0, 0, 0];
    const channels = rawChannels.slice(0, features.lightChannels);

    const handleChannelChange = (chIdx: number, newVal: number) => {
        const newData = { ...data };
        newData[currentProfileKey] = [...newData[currentProfileKey]];
        newData[currentProfileKey][chIdx] = newVal;
        setData(newData);

        if (channelStates[currentProfileKey][chIdx]) {
            hwFacade.setLightVal(currentProfileKey, chIdx + 1, newVal);
        }
    };

    const handleToggleChannel = (chIdx: number, newState: boolean) => {
        const newStates = { ...channelStates };
        newStates[currentProfileKey] = [...newStates[currentProfileKey]];
        newStates[currentProfileKey][chIdx] = newState;
        setChannelStates(newStates);

        hwFacade.setLightEnable(currentProfileKey, chIdx + 1, newState);
    };

    const handleTabChange = (newVal: number) => {
        setTabIndex(newVal);
        const modeStr = newVal === 0 ? 'scanner' : (newVal === 1 ? 'object20' : 'object50');
        hwFacade.setLightMode(modeStr);
    };

    const handleSave = async () => {
        await hwFacade.saveLightConfig();
        alert("Light Configuration Saved.");
    };

    const tabs = [
        { id: 0, label: 'Scanner', key: 'scanner' },
        ...(features.allowedLenses.includes('X20') ? [{ id: 1, label: 'Object x20', key: 'object20' }] : []),
        ...(features.allowedLenses.includes('X50') ? [{ id: 2, label: 'Object x50', key: 'object50' }] : []),
    ];

    if (features.lightChannels === 0) {
        return (
            <ParameterLayout title="Lighting Control">
                <div className="flex items-center justify-center p-20 text-slate-500 font-bold border border-slate-800 bg-slate-900/30 rounded-lg">
                    이 장비에는 활성화된 조명 제어 모듈이 존재하지 않습니다.
                </div>
            </ParameterLayout>
        );
    }

    if (loading) return <div className="p-20 text-center text-slate-500 font-mono tracking-widest animate-pulse">LOADING LIGHT CONFIG...</div>;

    const Actions = (
        <div className="flex gap-4 items-center">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded border ${connected
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400'
                : 'bg-red-950/30 border-red-500/30 text-red-400'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                    {connected ? "Online" : "Offline"}
                </span>
            </div>
            <button
                onClick={handleSave}
                className="bg-cyan-600 hover:bg-cyan-500 text-white px-8 py-2.5 rounded font-bold shadow-lg shadow-cyan-500/20 transition-all uppercase tracking-wider hover:-translate-y-0.5"
            >
                Save Config
            </button>
        </div>
    );

    return (
        <ParameterLayout
            title="Lighting Control"
            actions={Actions}
        >
            <div className="grid grid-cols-12 gap-6 h-full">
                <div className="col-span-12 flex flex-col h-full">
                    <ParameterCard className="flex-1 flex flex-col">

                        {/* Tabs */}
                        <div className="flex justify-center mb-8 border-b border-slate-700/50 pb-6">
                            <div className="flex gap-2 bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                                {tabs.map((tab) => {
                                    const isActive = tabIndex === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => handleTabChange(tab.id)}
                                            className={`px-8 py-3 rounded text-xs font-bold transition-all border ${isActive
                                                ? "bg-slate-800 text-cyan-400 border-cyan-500/50 shadow-[0_0_10px_-3px_rgba(6,182,212,0.3)]"
                                                : "bg-transparent text-slate-500 border-transparent hover:text-slate-300"
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="uppercase tracking-wider">{tab.label}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Channels */}
                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="flex items-center justify-between mb-6">
                                <ParameterSectionHeader title="Channel Control" />
                                <span className="text-[10px] text-slate-500 font-mono">
                                    {currentProfileKey.toUpperCase()} MODE ACTIVE
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {channels.map((val, idx) => (
                                    <LightChannel
                                        key={idx}
                                        label={`Channel ${idx + 1}`}
                                        value={val}
                                        isOn={channelStates[currentProfileKey][idx]}
                                        onChange={(v) => handleChannelChange(idx, v)}
                                        onToggle={(state) => handleToggleChannel(idx, state)}
                                    />
                                ))}
                            </div>
                        </div>
                    </ParameterCard>
                </div>
            </div>
        </ParameterLayout>
    );
}
