import React, { useEffect, useState } from 'react';
import { hwFacade } from '../../../services/HardwareFacade';
import { MoonsConfig, MoonsLensParams, MoonsMirrorParams, MoonsMotionProfile } from '../../../core/types/hw';
import { ParameterLayout, ParameterCard, ParameterSectionHeader, ParameterInput } from '../../components/ParameterComponents';
import { MotionProfileMatrix } from '../../components/MotionProfileMatrix';
import { useAppStore } from '../../../store/appStore';

interface MoonsParameterFormProps {
    view: 'lens' | 'mirror';
}

const DEFAULT_PROFILE: MoonsMotionProfile = { run_vel: 10, run_acc: 100, run_dec: 100 };
const DEFAULT_LENS: MoonsLensParams = {
    id: 1, lead: 2, pluse: 20000,
    home: { ...DEFAULT_PROFILE }, move: { ...DEFAULT_PROFILE }, jog: { ...DEFAULT_PROFILE },
    x20: 0, x20_z_pos: 0, x20_safe_z: 0, stage_x20_offset: 0, stage_y20_offset: 0,
    x50: 0, x50_z_pos: 0, x50_safe_z: 0, stage_x50_offset: 0, stage_y50_offset: 0
};
const DEFAULT_MIRROR: MoonsMirrorParams = {
    id: 2, lead: 2, pluse: 20000,
    home: { ...DEFAULT_PROFILE }, move: { ...DEFAULT_PROFILE }, jog: { ...DEFAULT_PROFILE },
    scanner_pos: 0, scanner_z_pos: 0, scanner_safe_z: 0, objective_pos: 0, stage_x_offset: 0, stage_y_offset: 0
};
const DEFAULT_CONFIG: MoonsConfig = {
    connect: { com: 7, baudrate: 9600 },
    lens: DEFAULT_LENS,
    mirror: DEFAULT_MIRROR
};

export const MoonsParameterForm: React.FC<MoonsParameterFormProps> = ({ view }) => {
    const [config, setConfig] = useState<MoonsConfig>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(false);
    const { features } = useAppStore();

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const { ok, data } = await hwFacade.getMoonsConfig();
            if (ok && data) {
                setConfig(data);
            } else {
                console.warn("Failed to load moons config, using default.");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            const { ok, message } = await hwFacade.setMoonsConfig(config);
            if (!ok) {
                console.error(message);
            } else {
                // [FIX] Reload config after save to ensure UI reflects any backend adjustments
                await loadConfig();
                alert("Configuration Saved!");
            }
        } catch (e) {
            console.error(e);
        }
    };

    if (loading) return <div className="p-20 text-center text-slate-500 font-mono tracking-widest animate-pulse">LOADING CONFIGURATION...</div>;

    const isLens = view === 'lens';
    const params = isLens ? config.lens : config.mirror;
    if (!params) return null;

    const updateParams = (newParams: Partial<MoonsLensParams | MoonsMirrorParams>) => {
        if (isLens) {
            setConfig({ ...config, lens: { ...config.lens, ...newParams } as MoonsLensParams });
        } else {
            setConfig({ ...config, mirror: { ...config.mirror, ...newParams } as MoonsMirrorParams });
        }
    };

    const handleFieldChange = (field: string, value: any) => {
        // [NEW] Special handling for PMAC without Lens mirror view where x50 fields are injected from Lens section
        const x50Fields = ['x50', 'x50_z_pos', 'x50_safe_z', 'stage_x50_offset', 'stage_y50_offset'];
        const isPMACNoLens = features.motion === 'PMAC' && !features.hasLensMotor;
        if (!isLens && isPMACNoLens && x50Fields.includes(field)) {
            setConfig({
                ...config,
                lens: { ...(config.lens || DEFAULT_LENS), [field]: value } as MoonsLensParams
            });
            return;
        }
        updateParams({ [field]: value });
    };

    const handleProfileChange = (profile: 'home' | 'move' | 'jog', field: keyof MoonsMotionProfile, value: number) => {
        const currentProfile = params[profile];
        updateParams({
            [profile]: { ...currentProfile, [field]: value }
        });
    };

    // --- Action Buttons ---
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
                Save Changes
            </button>
        </>
    );

    const isPMACNoLens = features.motion === 'PMAC' && !features.hasLensMotor;

    return (
        <ParameterLayout
            title={
                <span className="flex items-center gap-4">
                    <span className={`w-3 h-3 rounded-full ${isLens ? 'bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.6)]' : 'bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.6)]'}`}></span>
                    {isLens ? "Lens Configuration" : "Mirror Configuration"}
                </span>
            }
            actions={Actions}
        >
            <div className="flex flex-col gap-6 h-full pb-10">
                {/* Top Row: Hardware Specs (1/3) & Motion Profiles (2/3) */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <ParameterCard className="xl:col-span-1">
                        <ParameterSectionHeader title="Hardware Specs" />
                        <div className="grid grid-cols-1 gap-5">
                            <ParameterInput label="Device ID" value={params.id} onChange={(v) => handleFieldChange('id', v)} step={1} unit="#" type="number" />
                            <div className="grid grid-cols-2 gap-4">
                                <ParameterInput label="Lead Pitch" value={params.lead} onChange={(v) => handleFieldChange('lead', v)} unit="mm" type="number" />
                                <ParameterInput label="Resolution" value={params.pluse} onChange={(v) => handleFieldChange('pluse', v)} step={1} unit="ppr" type="number" />
                            </div>
                        </div>
                    </ParameterCard>

                    <div className="xl:col-span-2">
                        <MotionProfileMatrix
                            data={params}
                            columns={[
                                { key: 'home', label: 'Home', colorClass: 'text-cyan-400', bgClass: 'bg-cyan-950/10' },
                                { key: 'move', label: 'Move', colorClass: 'text-purple-400', bgClass: 'bg-purple-950/10' },
                                { key: 'jog', label: 'Jog', colorClass: 'text-emerald-400', bgClass: 'bg-emerald-950/10' }
                            ]}
                            rows={[
                                { key: 'run_vel', label: 'Velocity', unit: 'mm/s' },
                                { key: 'run_acc', label: 'Acceleration', unit: 'ms' },
                                { key: 'run_dec', label: 'Deceleration', unit: 'ms' }
                            ]}
                            onUpdate={(profile, field, val) => handleProfileChange(profile as any, field as any, val)}
                        />
                    </div>
                </div>

                {/* Bottom Row: Position Offsets (Full Width) */}
                <ParameterCard className="w-full">
                    <div className="mb-6 flex items-center justify-between">
                        <ParameterSectionHeader title="Position Offsets" />
                        <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-700">CALIBRATION</span>
                    </div>

                    <div className={`grid grid-cols-1 ${isLens ? (features.hasObjectX20 ? 'xl:grid-cols-2' : 'xl:grid-cols-1') : (isPMACNoLens ? 'xl:grid-cols-3' : 'xl:grid-cols-2')} gap-6`}>
                        {isLens ? (
                            <>
                                {features.hasObjectX20 && (
                                    <div className="p-4 rounded border border-slate-700 bg-slate-900/30">
                                        <label className="text-xs font-bold text-cyan-500 uppercase mb-4 block tracking-wider">Magnification x20</label>
                                        <div className="grid grid-cols-3 gap-3 mb-3">
                                            <ParameterInput label="Position" value={(params as MoonsLensParams).x20} onChange={(v) => handleFieldChange('x20', v)} unit="mm" type="number" />
                                            <ParameterInput label="Z-Height" value={(params as MoonsLensParams).x20_z_pos} onChange={(v) => handleFieldChange('x20_z_pos', v)} unit="mm" type="number" />
                                            <ParameterInput label="Safe Z" value={(params as MoonsLensParams).x20_safe_z} onChange={(v) => handleFieldChange('x20_safe_z', v)} unit="mm" type="number" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <ParameterInput label="Offset X" value={(params as MoonsLensParams).stage_x20_offset} onChange={(v) => handleFieldChange('stage_x20_offset', v)} unit="mm" type="number" />
                                            <ParameterInput label="Offset Y" value={(params as MoonsLensParams).stage_y20_offset} onChange={(v) => handleFieldChange('stage_y20_offset', v)} unit="mm" type="number" />
                                        </div>
                                    </div>
                                )}

                                <div className="p-4 rounded border border-slate-700 bg-slate-900/30">
                                    <label className="text-xs font-bold text-blue-500 uppercase mb-4 block tracking-wider">Magnification x50</label>
                                    <div className="grid grid-cols-3 gap-3 mb-3">
                                        <ParameterInput label="Position" value={(params as MoonsLensParams).x50} onChange={(v) => handleFieldChange('x50', v)} unit="mm" type="number" />
                                        <ParameterInput label="Z-Height" value={(params as MoonsLensParams).x50_z_pos} onChange={(v) => handleFieldChange('x50_z_pos', v)} unit="mm" type="number" />
                                        <ParameterInput label="Safe Z" value={(params as MoonsLensParams).x50_safe_z} onChange={(v) => handleFieldChange('x50_safe_z', v)} unit="mm" type="number" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <ParameterInput label="Offset X" value={(params as MoonsLensParams).stage_x50_offset} onChange={(v) => handleFieldChange('stage_x50_offset', v)} unit="mm" type="number" />
                                        <ParameterInput label="Offset Y" value={(params as MoonsLensParams).stage_y50_offset} onChange={(v) => handleFieldChange('stage_y50_offset', v)} unit="mm" type="number" />
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="p-4 rounded border border-slate-700 bg-slate-900/30">
                                    <label className="text-xs font-bold text-cyan-500 uppercase mb-4 block tracking-wider">Scanner</label>
                                    <div className="flex flex-col gap-3">
                                        <ParameterInput label="Mirror Pos" value={(params as MoonsMirrorParams).scanner_pos} onChange={(v) => handleFieldChange('scanner_pos', v)} unit="mm" type="number" />
                                        <div className="grid grid-cols-2 gap-3">
                                            <ParameterInput label="Scanner Z-Pos" value={(params as MoonsMirrorParams).scanner_z_pos} onChange={(v) => handleFieldChange('scanner_z_pos', v)} unit="mm" type="number" />
                                            <ParameterInput label="Safe Z" value={(params as MoonsMirrorParams).scanner_safe_z} onChange={(v) => handleFieldChange('scanner_safe_z', v)} unit="mm" type="number" />
                                        </div>
                                        {/* Objective Pos - Hidden by User Request */}
                                    </div>
                                </div>
                                
                                {features.motion === 'PMAC' && !features.hasLensMotor && config.lens && (
                                    <div className="p-4 rounded border border-slate-700 bg-slate-900/30">
                                        <label className="text-xs font-bold text-blue-500 uppercase mb-4 block tracking-wider">Object (Mag X50)</label>
                                        <div className="grid grid-cols-3 gap-3 mb-3">
                                            <ParameterInput label="Mirror Pos" value={config.lens.x50} onChange={(v) => handleFieldChange('x50', v)} unit="mm" type="number" />
                                            <ParameterInput label="Z-Height" value={config.lens.x50_z_pos} onChange={(v) => handleFieldChange('x50_z_pos', v)} unit="mm" type="number" />
                                            <ParameterInput label="Safe Z" value={config.lens.x50_safe_z} onChange={(v) => handleFieldChange('x50_safe_z', v)} unit="mm" type="number" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <ParameterInput label="Stage X" value={config.lens.stage_x50_offset} onChange={(v) => handleFieldChange('stage_x50_offset', v)} unit="mm" type="number" />
                                            <ParameterInput label="Stage Y" value={config.lens.stage_y50_offset} onChange={(v) => handleFieldChange('stage_y50_offset', v)} unit="mm" type="number" />
                                        </div>
                                    </div>
                                )}

                                <div className="p-4 rounded border border-slate-700 bg-slate-900/30">
                                    <label className="text-xs font-bold text-emerald-500 uppercase mb-4 block tracking-wider">Stage Original Center (Scanner Offset)</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <ParameterInput label="Offset X" value={(params as MoonsMirrorParams).stage_x_offset} onChange={(v) => handleFieldChange('stage_x_offset', v)} unit="mm" type="number" />
                                        <ParameterInput label="Offset Y" value={(params as MoonsMirrorParams).stage_y_offset} onChange={(v) => handleFieldChange('stage_y_offset', v)} unit="mm" type="number" />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </ParameterCard>
            </div>
        </ParameterLayout>
    );
};
