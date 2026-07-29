import React, { useEffect, useState } from "react";
import { useAppStore } from "../../../store/appStore";
import { hwFacade } from "../../../services/HardwareFacade";
import { ParameterLayout, ParameterCard, ParameterSectionHeader, ParameterInput, ParameterSlider } from '../../components/ParameterComponents';

interface CameraParameterFormProps {
    configId: number;
}

export const CameraParameterForm: React.FC<CameraParameterFormProps> = ({ configId }) => {
    const { cameraConfig, setCameraConfig } = useAppStore();
    const [localConfig, setLocalConfig] = useState<any>(null);
    const [activePresetIdx, setActivePresetIdx] = useState(0);

    useEffect(() => {
        if (cameraConfig && cameraConfig.cameras) {
            const cam = cameraConfig.cameras.find((c: any) => c.id === configId);
            if (cam) {
                setLocalConfig(JSON.parse(JSON.stringify(cam)));
                setActivePresetIdx(0); // Reset to first preset on load
            }
        }
    }, [cameraConfig, configId]);

    const handleSave = async () => {
        if (!cameraConfig || !cameraConfig.cameras) return;
        const newCameras = cameraConfig.cameras.map((c: any) =>
            c.id === configId ? {
                ...localConfig,
                presets: localConfig.presets.map((p: any) => ({
                    ...p,
                    exposure_time: Math.floor(p.exposure_time),
                    gain: Math.floor(p.gain)
                }))
            } : c
        );
        const newGlobalConfig = { ...cameraConfig, cameras: newCameras };
        setCameraConfig(newGlobalConfig);

        // Sync Runtime State for Immediate UI Update (RightPanel/Overlay)
        if (localConfig && localConfig.presets && localConfig.presets[activePresetIdx]) {
            const preset = localConfig.presets[activePresetIdx];
            useAppStore.getState().setCameraParams(configId, {
                exposure: preset.exposure_time,
                gain: preset.gain
            });
        }

        try {
            await hwFacade.setCameraConfig(newGlobalConfig);
        } catch (e) {
            console.error("Save failed", e);
        }
    };

    if (!localConfig) {
        return (
            <div className="p-20 text-center text-slate-500 font-mono tracking-widest animate-pulse">LOADING CAMERA CONFIG...</div>
        );
    }

    const isScanner = configId === 1;
    const presets = localConfig.presets || [];
    const activePreset = presets[activePresetIdx];

    const Actions = (
        <button
            onClick={handleSave}
            className="bg-cyan-600 hover:bg-cyan-500 text-white px-8 py-2.5 rounded font-bold shadow-lg shadow-cyan-500/20 transition-all uppercase tracking-wider hover:-translate-y-0.5"
        >
            Save Changes
        </button>
    );

    return (
        <ParameterLayout
            title={`${localConfig.name} Settings`}
            actions={Actions}
        >
            <div className="grid grid-cols-12 gap-6 items-start h-full">

                {/* LEFT COLUMN: Global Resolution */}
                <div className="col-span-12 xl:col-span-4 flex flex-col">
                    <ParameterCard>
                        <ParameterSectionHeader title="Global Resolution" />
                        <div className="flex flex-col gap-6">
                            <div className="p-4 bg-purple-950/20 border border-purple-500/20 rounded">
                                <p className="text-[11px] text-purple-300 leading-relaxed font-medium">
                                    <span className="block mb-1 font-bold uppercase tracking-wider text-purple-400">Values Apply Globally</span>
                                    Resolution changes affect all lens configurations and may require a device restart.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <ParameterInput
                                    label="Width"
                                    value={localConfig.resolution.width}
                                    onChange={(v) => setLocalConfig({ ...localConfig, resolution: { ...localConfig.resolution, width: v } })}
                                    unit="px"
                                    type="number"
                                />
                                <ParameterInput
                                    label="Height"
                                    value={localConfig.resolution.height}
                                    onChange={(v) => setLocalConfig({ ...localConfig, resolution: { ...localConfig.resolution, height: v } })}
                                    unit="px"
                                    type="number"
                                />
                            </div>
                        </div>
                    </ParameterCard>
                </div>

                {/* RIGHT COLUMN: Optic Settings (Lens Tabs) */}
                <div className="col-span-12 xl:col-span-8 flex flex-col h-full">
                    <ParameterCard className="flex-1 flex flex-col">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-700/50 pb-2">
                            <ParameterSectionHeader title="Optical Parameters" />

                            {/* Preset Tabs - Hidden for Scanner as requested (only 1 lens) */}
                            {!isScanner && (
                                <div className="flex gap-2">
                                    {presets.map((preset: any, idx: number) => {
                                        const isActive = activePresetIdx === idx;
                                        const label = `${preset.magnification}x Lens`;
                                        return (
                                            <button
                                                key={idx}
                                                onClick={() => setActivePresetIdx(idx)}
                                                className={`px-4 py-2 rounded text-xs font-bold transition-all border ${isActive
                                                    ? "bg-slate-800 text-cyan-400 border-cyan-500/50 shadow-[0_0_10px_-3px_rgba(6,182,212,0.3)]"
                                                    : "bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300"
                                                    }`}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {activePreset && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-2 mt-4">
                                {/* Exposure Group */}
                                <div className="p-6 rounded-lg bg-slate-900/50 border border-slate-700/50">
                                    <ParameterSlider
                                        label="Exposure Time"
                                        value={activePreset.exposure_time}
                                        onChange={(v) => {
                                            const newPresets = [...presets];
                                            newPresets[activePresetIdx] = { ...activePreset, exposure_time: v };
                                            setLocalConfig({ ...localConfig, presets: newPresets });
                                        }}
                                        min={15}
                                        max={60000}
                                        step={100}
                                        unit="s"
                                        className="mb-2"
                                    />
                                    <p className="text-[10px] text-slate-500 text-right font-mono mt-2">Range: 15 - 60,000 s</p>
                                </div>

                                {/* Gain Group */}
                                <div className="p-6 rounded-lg bg-slate-900/50 border border-slate-700/50">
                                    <ParameterSlider
                                        label="Analog Gain"
                                        value={activePreset.gain}
                                        onChange={(v) => {
                                            const newPresets = [...presets];
                                            newPresets[activePresetIdx] = { ...activePreset, gain: v };
                                            setLocalConfig({ ...localConfig, presets: newPresets });
                                        }}
                                        min={0}
                                        max={24}
                                        step={0.1}
                                        unit="dB"
                                        className="mb-2"
                                    />
                                    <p className="text-[10px] text-slate-500 text-right font-mono mt-2">Range: 0 - 24 dB</p>
                                </div>
                            </div>
                        )}
                    </ParameterCard>
                </div>

            </div>
        </ParameterLayout>
    );
};
