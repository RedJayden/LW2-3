import React, { useEffect, useState, useRef, useMemo } from 'react';
import { hwFacade } from '../../../services/HardwareFacade';
import { ParameterLayout, ParameterCard, ParameterSectionHeader, ParameterInput, Tooltip } from '../../components/ParameterComponents';
import { useAppStore } from '../../../store/appStore';

/**
 * @brief 기능 설명 데이터베이스 (18종)
 */
const AURELIA_DESC = {
    PRF: "Repetition rate setting, Unit: kHz",
    BURST: "Pulse burst quantity setting, Default Burst=1",
    AMP: "Output power setting, 0-100.00%",
    OF: "Optimized Frequency value (TRIG mode: PRF > OF 시 자동 상향 조절됨)",
    PRF_IN: "Frequency Control Mode: PRF_IN (Internal), PRF_EXT (External)",
    AMP_IN: "Power Control Mode: AMP_IN (Internal), AMP_EXT (External)",
    MODE: "Laser Output Mode: ADJ (Shutter Control), GATE (Ext Level), TRIG (Ext Edge)",
    TURN: "Automatic Power On/Off",
    SHUTTER: "Control laser output",
    SAVE: "Save parameters to local storage",
    IL: "Interlock status indicator (Safety check)",
    CH: "Water temperature status indicator",
    ML: "Mode-lock status indicator (Laser stability)",
    T: "Temperature status indicator",
    OL: "Communication status indicator",
    ERR_CODE: "Fault code from laser hardware",
    ERR_DATA: "Detailed fault information",
    RUNTIME: "Laser operation duration (Hours/Minutes)"
};

/**
 * @brief 상태 표시를 위한 LED 컴포넌트
 */
const StatusLED = React.memo(({ label, active, color = "green", tooltip }: { label: string, active: boolean, color?: string, tooltip?: string }) => {
    const content = (
        <div className="flex flex-col items-center gap-1">
            <div className={`w-4 h-4 rounded-full border-2 border-slate-700 transition-all duration-300 ${active
                    ? (color === "green" ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]" : "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]")
                    : "bg-slate-800 shadow-inner"
                }`} />
            <span className="text-[10px] font-bold text-slate-500 uppercase">{label}</span>
        </div>
    );

    if (tooltip) return <Tooltip text={tooltip}>{content}</Tooltip>;
    return content;
});

const parseAureliaError = (errCode?: number, errData?: number): string => {
    if (!errCode) return "Normal";
    switch (errCode) {
        case 1001: return "Open circuit at Intlock1, Intlock2 connectors";
        case 1002: return "Intlock anomaly";
        case 2001: return "Chiller Interlock connector open circuit / abnormal";
        case 2002:
            if (errData === 99.99) return "Laser head temperature probe open circuit";
            if (errData === 0.01) return "Laser head temperature probe short circuit";
            if (errData === 0) return "Laser head temperature communication failure";
            return "Laser head temperature limit exceeded";
        case 2011: return "F1 Gas flow limit exceeded alarm";
        case 2012: return "F2 Gas flow limit exceeded alarm";
        case 2013: return "F3 Water flow limit exceeded alarm";
        case 3001: return "Seed source / Mode-locking anomaly";
        case 4001: case 4002: case 4003: case 4004: case 4005: case 4006: case 4007:
            if (errData === 99.99) return "Temperature control board anomaly";
            if (errData === 0) return "Temperature control board communication anomaly";
            return "Temperature control limit exceeded";
        case 5000: return "Temp/Humidity Anomaly";
        case 5001: case 5002: case 5003: case 5004: case 5005: case 5006: case 5007:
            return "Digital board / Communication / 5V power anomaly";
        case 5008: return "Feedback Power Abnormal";
        case 5009: case 5010: case 5011: case 5012:
            return "LD Current Abnormal";
        default: return `Unknown Fault Code: ${errCode}`;
    }
};

export const LaserParameterForm: React.FC = () => {
    const showToast = useAppStore(s => s.showToast);
    const laserShutter = useAppStore(s => s.laserShutter);
    const setLaserShutter = useAppStore(s => s.setLaserShutter);
    const aureliaStatus = useAppStore(s => s.aureliaStatus);
    const hardware = useAppStore(s => s.hardware);
    const [config, setConfig] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [aureliaParams, setAureliaParams] = useState({
        prf: 1000,
        burst: 1,
        amp: 2.00,
        of: 1014,
        mode: 'ADJ' as 'TRIG' | 'ADJ' | 'GATE'
    });

    const [powerTransition, setPowerTransition] = useState<'idle' | 'turning_on' | 'turning_off'>('idle');
    const [progress, setProgress] = useState(0);

    const focusedFieldRef = useRef<string | null>(null);
    const lastUpdatedRef = useRef<Record<string, number>>({});

    useEffect(() => {
        loadConfig();
    }, []);

    // 하드웨어 상태 폴링 시 텍스트 상자 동기화 (사용자 입력 롤백 방지)
    useEffect(() => {
        if (!aureliaStatus) return;
        setAureliaParams(prev => {
            const next = { ...prev };
            let changed = false;

            const now = Date.now();
            const isLocked = (key: string) => (now - (lastUpdatedRef.current[key] || 0)) < 3000;

            if (aureliaStatus.prf !== undefined && aureliaStatus.prf !== prev.prf && focusedFieldRef.current !== 'prf' && !isLocked('prf')) { next.prf = aureliaStatus.prf; changed = true; }
            if (aureliaStatus.burst !== undefined && aureliaStatus.burst !== prev.burst && focusedFieldRef.current !== 'burst' && !isLocked('burst')) { next.burst = aureliaStatus.burst; changed = true; }
            if (aureliaStatus.amp !== undefined && aureliaStatus.amp !== prev.amp && focusedFieldRef.current !== 'amp' && !isLocked('amp')) { next.amp = aureliaStatus.amp; changed = true; }

            if (aureliaStatus.mode !== undefined) {
                const modeStr = aureliaStatus.mode === 0 ? 'TRIG' : aureliaStatus.mode === 1 ? 'ADJ' : 'GATE';
                if (modeStr !== prev.mode && focusedFieldRef.current !== 'mode' && !isLocked('mode')) { next.mode = modeStr; changed = true; }
            }

            return changed ? next : prev;
        });

        // 프로그레스바 상태 추적 (1 = ON OK, 2 = OFF OK, 0 = Default/Transition)
        if (powerTransition === 'turning_on' && aureliaStatus.power_status === 1) {
            setPowerTransition('idle');
            showToast("Turn On Sequence Completed", "success");
        } else if (powerTransition === 'turning_off' && aureliaStatus.power_status === 2) {
            setPowerTransition('idle');
            showToast("Turn Off Sequence Completed", "info");
        }
    }, [aureliaStatus, powerTransition]);

    // 가상 프로그레스 바 타이머 로직
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (powerTransition === 'turning_on') {
            setProgress(0);
            const startTime = Date.now();
            interval = setInterval(() => {
                const elapsed = (Date.now() - startTime) / 1000;
                setProgress(Math.min((elapsed / 120) * 100, 99));
            }, 500);
        } else if (powerTransition === 'turning_off') {
            setProgress(0);
            const startTime = Date.now();
            interval = setInterval(() => {
                const elapsed = (Date.now() - startTime) / 1000;
                setProgress(Math.min((elapsed / 30) * 100, 99));
            }, 500);
        } else {
            setProgress(0);
        }
        return () => clearInterval(interval);
    }, [powerTransition]);

    const loadConfig = async () => {
        try {
            const { ok, data } = await hwFacade.getLaserConfig();
            if (ok && data) {
                setConfig(data);
                if (data.shutter !== undefined) setLaserShutter(data.shutter === 1);
            } else {
                setConfig({ enabled: true, shutter: 2 });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // --- Aurelia Controls ---
    const handleParamApply = async (key: keyof typeof aureliaParams, newValue?: any) => {
        const p = { ...aureliaParams };
        if (newValue !== undefined) {
            (p as any)[key] = newValue;
        }

        const targetPRF = Number(p.prf);
        const currentOF = Number(p.of);

        if (key === 'prf' && p.mode === 'TRIG' && targetPRF > currentOF) {
            showToast(`TRIG Mode: PRF(${targetPRF}) > OF(${currentOF}) 감지. OF를 상향 조절합니다.`, "warning");
            // [FIX] 단일 파라미터만 전송하여 장비 Waiting 데드락 방지
            await hwFacade.aureliaSetParams({ prf: currentOF }); // 임시 안전값
            setTimeout(async () => {
                const res = await hwFacade.aureliaSetParams({ prf: targetPRF });
                if (res.ok) setAureliaParams(prev => ({ ...prev, of: targetPRF }));
            }, 100);
            return;
        }

        const payload: any = {};
        if (key === 'prf') payload.prf = Number(p.prf);
        if (key === 'amp') payload.amp = Number(p.amp);
        if (key === 'burst') payload.burst = Number(p.burst);
        if (key === 'mode') {
            payload.mode = p.mode === 'TRIG' ? 0 : p.mode === 'ADJ' ? 1 : 2;
        }

        // 빈 페이로드 전송 방지
        if (Object.keys(payload).length === 0) return;

        // 낙관적 업데이트를 위한 타임스탬프 락 기록
        lastUpdatedRef.current[key] = Date.now();

        const res = await hwFacade.aureliaSetParams(payload);
        if (res.ok) showToast(`Aurelia ${key.toUpperCase()} Applied`, "success");
    };

    const handleAureliaPower = async (on: boolean) => {
        const res = await hwFacade.aureliaPower(on);
        if (res.ok) {
            setPowerTransition(on ? 'turning_on' : 'turning_off');
            showToast(`Laser ${on ? 'Turn On' : 'Turn Off'} Sequence Started`, "info");
        }
    };

    const handleAureliaShutter = async (open: boolean) => {
        // Optimistic Update: 즉각적인 UI 반응을 위해 상태 선반영
        useAppStore.setState(state => ({
            ...state,
            aureliaStatus: { ...state.aureliaStatus, shutter_status: open ? 1 : 2 }
        }));

        const res = await hwFacade.aureliaShutter(open);
        if (res.ok) showToast(`Shutter ${open ? 'OPEN' : 'CLOSE'} 명령 전송`, "info");
    };

    if (loading) return <div className="p-20 text-center text-slate-500 font-mono">LOADING...</div>;

    return (
        <ParameterLayout title="Laser Configuration">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full max-w-6xl">
                {/* PMAC Laser Control */}
                <div className="space-y-8">
                    <ParameterCard>
                        <ParameterSectionHeader title="Laser Shutter Control" />
                        <div className="flex gap-4 p-4 mt-2">
                            <button
                                onClick={() => hwFacade.setLaserControl({ shutter: 1 }).then(() => setLaserShutter(true))}
                                className={`flex-1 h-12 text-lg font-bold rounded ${laserShutter ? "bg-red-600" : "border-2 border-red-500/30 text-red-500"}`}
                            >
                                Laser Shutter ON
                            </button>
                            <button
                                onClick={() => hwFacade.setLaserControl({ shutter: 2 }).then(() => setLaserShutter(false))}
                                className={`flex-1 h-12 text-lg font-bold rounded ${!laserShutter ? "bg-slate-600" : "border-2 border-slate-600/50 text-slate-400"}`}
                            >
                                Laser Shutter OFF
                            </button>
                        </div>
                    </ParameterCard>
                </div>

                {/* Aurelia Laser Control */}
                {hardware.laser === 'Aurelia' && aureliaStatus.used !== false && (
                    <div className="space-y-8">
                        <ParameterCard className="border-cyan-500/20 bg-slate-800/50">
                            <div className="flex justify-between items-center mb-6">
                                <ParameterSectionHeader title="Aurelia IR-50 Control" />
                                <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-full border border-slate-700">
                                    <div className={`w-2 h-2 rounded-full ${aureliaStatus.connected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                                        {aureliaStatus.connected ? "CONNECTED" : "DISCONNECTED"}
                                    </span>
                                </div>
                            </div>

                            {/* Safety Alert */}
                            <div className="mb-6 p-3 bg-red-900/20 border border-red-500/50 rounded flex gap-3 items-start">
                                <span className="text-red-500 text-lg mt-0.5">⚠️</span>
                                <div className="text-xs text-red-200/80 leading-relaxed font-mono">
                                    <strong className="text-red-400">Note:</strong> Whether under local or remote control, to prevent laser damage, the repetition rate (PRF), burst mode, and operating mode <strong className="text-red-400">MUST NOT be modified</strong> while the laser is in the <span className="underline decoration-red-500/50">Turn On</span> state!
                                </div>
                            </div>

                            {/* Top Inputs & Mode */}
                            <div className="flex flex-col gap-4 mb-8">
                                {/* Row 1: PRF & BURST */}
                                <div className="grid grid-cols-2 gap-4">
                                    <ParameterInput
                                        label="PRF" value={aureliaParams.prf} unit="kHz" className="w-full"
                                        tooltip={AURELIA_DESC.PRF} disabled={aureliaStatus.power_status === 1 || powerTransition !== 'idle'}
                                        onFocus={() => focusedFieldRef.current = 'prf'}
                                        onBlur={() => { focusedFieldRef.current = null; handleParamApply('prf'); }}
                                        onChange={(v) => setAureliaParams({ ...aureliaParams, prf: v })}
                                    />
                                    <ParameterInput
                                        label="BURST" value={aureliaParams.burst} className="w-full"
                                        tooltip={AURELIA_DESC.BURST} disabled={aureliaStatus.power_status === 1 || powerTransition !== 'idle'}
                                        onFocus={() => focusedFieldRef.current = 'burst'}
                                        onBlur={() => { focusedFieldRef.current = null; handleParamApply('burst'); }}
                                        onChange={(v) => setAureliaParams({ ...aureliaParams, burst: v })}
                                    />
                                </div>

                                {/* Row 2: AMP & OF */}
                                <div className="grid grid-cols-2 gap-4">
                                    <ParameterInput
                                        label="AMP" value={aureliaParams.amp} unit="%" className="w-full"
                                        tooltip={AURELIA_DESC.AMP}
                                        onFocus={() => focusedFieldRef.current = 'amp'}
                                        onBlur={() => { focusedFieldRef.current = null; handleParamApply('amp'); }}
                                        onChange={(v) => setAureliaParams({ ...aureliaParams, amp: v })}
                                    />
                                    <ParameterInput
                                        label="OF" value={aureliaParams.of} unit="kHz" className="w-full"
                                        tooltip={AURELIA_DESC.OF} disabled
                                        onFocus={() => focusedFieldRef.current = 'of'}
                                        onBlur={() => { focusedFieldRef.current = null; }}
                                        onChange={(v) => setAureliaParams({ ...aureliaParams, of: v })}
                                    />
                                </div>

                                {/* Row 3: MODE & Buttons/Progress */}
                                <div className="grid grid-cols-2 gap-4">
                                    <Tooltip text={AURELIA_DESC.MODE} className="w-full block">
                                        <div className="group flex flex-col gap-1.5 w-full">
                                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1 transition-colors group-focus-within:text-cyan-400">
                                                MODE
                                            </label>
                                            <div className={`flex items-center h-[42px] bg-slate-900 border border-slate-700 rounded overflow-hidden transition-all duration-200 ${(aureliaStatus.power_status === 1 || powerTransition !== 'idle') ? 'opacity-50 cursor-not-allowed' : 'focus-within:border-cyan-500/50 focus-within:shadow-[0_0_15px_-3px_rgba(6,182,212,0.2)]'}`}>
                                                <select
                                                    value={aureliaParams.mode}
                                                    disabled={aureliaStatus.power_status === 1 || powerTransition !== 'idle'}
                                                    onChange={(e) => {
                                                        const newMode = e.target.value;
                                                        setAureliaParams({ ...aureliaParams, mode: newMode as any });
                                                        handleParamApply('mode' as any, newMode);
                                                    }}
                                                    className="w-full h-full bg-transparent text-cyan-400 px-3 outline-none font-mono text-sm appearance-none cursor-pointer disabled:cursor-not-allowed"
                                                >
                                                    <option value="TRIG">TRIG</option>
                                                    <option value="ADJ">ADJ</option>
                                                    <option value="GATE">GATE</option>
                                                </select>
                                            </div>
                                        </div>
                                    </Tooltip>

                                    {/* Right Side: Buttons & Progress Bar */}
                                    <div className="flex flex-col w-full justify-end">
                                        <div className="flex gap-2 h-[42px]">
                                            <Tooltip text={AURELIA_DESC.TURN} className="flex-1">
                                                <button
                                                    onClick={() => handleAureliaPower(aureliaStatus.power_status === 0 || aureliaStatus.power_status === 2)}
                                                    disabled={powerTransition !== 'idle'}
                                                    className={`h-full w-full font-black rounded shadow-lg transition-all text-sm ${powerTransition !== 'idle'
                                                            ? 'bg-slate-600 text-slate-400 cursor-wait relative overflow-hidden'
                                                            : aureliaStatus.power_status === 1
                                                                ? 'bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95'
                                                                : 'bg-emerald-600/80 text-white hover:bg-emerald-500 active:scale-95'
                                                        }`}
                                                >
                                                    {powerTransition === 'turning_on' ? 'Turning ON...' : powerTransition === 'turning_off' ? 'Turning OFF...' : aureliaStatus.power_status === 1 ? 'TURN OFF' : 'TURN ON'}
                                                    {powerTransition !== 'idle' && (
                                                        <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                                    )}
                                                </button>
                                            </Tooltip>
                                            <Tooltip text={AURELIA_DESC.SHUTTER} className="flex-1">
                                                <button
                                                    onClick={() => handleAureliaShutter(aureliaStatus.shutter_status !== 1)}
                                                    disabled={aureliaStatus.power_status !== 1 || powerTransition !== 'idle'}
                                                    className={`h-full w-full font-black rounded shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors ${aureliaStatus.shutter_status === 1
                                                            ? 'bg-amber-600 hover:bg-amber-500 text-white'
                                                            : 'bg-slate-400/80 hover:bg-slate-400 text-slate-900'
                                                        }`}
                                                >
                                                    {aureliaStatus.shutter_status === 1 ? 'SHUTTER OFF' : 'SHUTTER ON'}
                                                </button>
                                            </Tooltip>
                                        </div>

                                        {/* Progress Bar Container */}
                                        <div className="h-2 w-full bg-slate-800 rounded-full mt-2 overflow-hidden flex-shrink-0">
                                            {powerTransition !== 'idle' && (
                                                <div
                                                    className={`h-full transition-all duration-500 ease-out ${powerTransition === 'turning_on' ? 'bg-emerald-500' : 'bg-red-500'}`}
                                                    style={{ width: `${progress}%` }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Status Area */}
                            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                                <div className="flex justify-around mb-6 py-2 border-b border-slate-700/30">
                                    <StatusLED label="IL" active={aureliaStatus.il} tooltip={AURELIA_DESC.IL} />
                                    <StatusLED label="CH" active={aureliaStatus.ch} tooltip={AURELIA_DESC.CH} />
                                    <StatusLED label="ML" active={aureliaStatus.ml} tooltip={AURELIA_DESC.ML} />
                                    <StatusLED label="T" active={aureliaStatus.t_alarm} tooltip={AURELIA_DESC.T} />
                                    <StatusLED label="OL" active={aureliaStatus.ol} tooltip={AURELIA_DESC.OL} />
                                </div>

                                <div className="flex justify-around gap-8 text-center">
                                    <Tooltip text={AURELIA_DESC.RUNTIME} className="space-y-1">
                                        <div className="text-cyan-400 font-mono text-sm">{aureliaStatus.r_hour || 0} h {aureliaStatus.r_min || 0} m</div>
                                        <div className="text-[9px] text-slate-500 uppercase font-bold">Running Time</div>
                                    </Tooltip>
                                    <div className="space-y-1">
                                        <div className="text-cyan-400 font-mono text-sm">{Number(aureliaStatus.temp || 0).toFixed(2)} °C</div>
                                        <div className="text-[9px] text-slate-500 uppercase font-bold">T(°C)</div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Info */}
                            <div className="mt-4 pt-4 border-t border-slate-700/30 flex justify-between items-center text-[10px] font-mono text-slate-500">
                                <Tooltip text={AURELIA_DESC.ERR_CODE}>
                                    <div className="flex gap-2">
                                        <span>Error Code: <span className={aureliaStatus.err_code ? "text-red-400 font-bold" : "text-slate-300"}>{aureliaStatus.err_code || 0}</span></span>
                                        {(aureliaStatus.err_code ?? 0) > 0 && <span className="text-red-400">({parseAureliaError(aureliaStatus.err_code, aureliaStatus.err_data)})</span>}
                                    </div>
                                </Tooltip>
                                <Tooltip text={AURELIA_DESC.ERR_DATA}>
                                    <div>Error Data: <span className="text-slate-300">{aureliaStatus.err_data || 0}</span></div>
                                </Tooltip>
                                <div className="text-slate-600">AURELIUS.PC-C.1.4.6.1127</div>
                            </div>
                        </ParameterCard>
                    </div>
                )}
            </div>
        </ParameterLayout>
    );
};
