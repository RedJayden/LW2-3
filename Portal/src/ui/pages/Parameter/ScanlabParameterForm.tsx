/**
 * @file ScanlabParameterForm.tsx
 * @brief Scanlab scanner configuration form.
 * @details Handles mark speed, jump speed, field size (work size), and axis orientation settings for Scanlab RTC controllers.
 */

import React, { useState } from 'react';
import { ParameterCard, ParameterSectionHeader, ParameterInput, ParameterSwitch, ParameterSelect } from '../../components/ParameterComponents';
import { Stack, SimpleGrid } from '@mantine/core';
import { hwFacade } from '../../../services/HardwareFacade';
import { useAppStore } from '../../../store/appStore';
import { logger } from '../../../utils/logger';

interface ScanlabConfig {
    wavelength?: string;
    markSpeed: number;
    jumpSpeed: number;
    bXYExchange: boolean;
    bXAxisN: boolean;
    bYAxisN: boolean;
    rtcVersion: number;
    cardNo: number;
    programFile: string;
    correctionFile: string;
    activeKFactor?: number;
    hRatio?: number;
    vRatio?: number;
    laserMode: number;
    laserControl: number;
    dllVersion?: number;
    hexVersion?: number;
    rtcVersionNo?: number;
    serialNumber?: number;
}

interface ScanlabParameterFormProps {
    config: ScanlabConfig;
    onChange: (key: keyof ScanlabConfig, value: any) => void;
}

/**
 * @component ScanlabParameterForm
 * @brief View component representing Scanlab-specific configuration fields.
 */
export const ScanlabParameterForm: React.FC<ScanlabParameterFormProps> = ({ config, onChange }) => {
    const scanlab = useAppStore(s => s.scanlab);
    const [initLoading, setInitLoading] = useState(false);

    const isOfflineKFactor = config.activeKFactor === undefined || config.activeKFactor === 0 || config.activeKFactor === 1.0;
    const offlineKFactor = config.wavelength === 'UV_355' ? 5152 : 5072;
    const displayedKFactor = isOfflineKFactor ? offlineKFactor : config.activeKFactor;

    const handleInitialize = async () => {
        setInitLoading(true);
        try {
            logger.info("Scanner", "Initializing Scanlab RTC Card...");
            const res = await hwFacade.scannerInit();
            if (res.ok) {
                useAppStore.getState().showToast("Scanlab RTC card initialized successfully", "success");
                logger.info("Scanner", "Scanlab RTC Card initialization success");
            } else {
                useAppStore.getState().showToast(res.message || "Initialization failed", "error");
                logger.error("Scanner", `Scanlab RTC Card initialization failed: ${res.message}`);
            }
        } catch (e) {
            console.error(e);
            useAppStore.getState().showToast("Connection timeout", "error");
        } finally {
            setInitLoading(false);
        }
    };

    return (
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
            <Stack gap="xl">
                {/* Hardware Diagnostics (Top Left) */}
                <ParameterCard>
                    <ParameterSectionHeader title="Hardware Diagnostics" />
                    <Stack gap="lg" mt="md">
                        <div className="flex gap-2 w-full">
                            <button
                                onClick={handleInitialize}
                                disabled={initLoading}
                                className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800/50 text-white font-semibold py-1.5 rounded transition-all text-xs tracking-wider uppercase font-mono shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                            >
                                {initLoading ? "Initializing..." : "Init RTC Card"}
                            </button>
                        </div>

                        <div className="flex items-center justify-between p-2 rounded bg-slate-900 text-xs border border-slate-700 font-mono">
                            <span className="text-slate-400">STATUS:</span>
                            <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${scanlab.connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                                <span className={scanlab.connected ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                    {scanlab.connected ? 'CONNECTED' : 'DISCONNECTED'}
                                </span>
                            </div>
                        </div>

                        {!scanlab.connected && (
                            <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-[10px] text-rose-500 font-mono space-y-1">
                                <div className="font-bold uppercase tracking-wider text-rose-400 text-xs">Diagnostics</div>
                                {((scanlab.initStatus & 1) === 0) ? (
                                    <div>• DSP boot failed. RTC6DASP.APB firmware file missing in Bin folder?</div>
                                ) : (
                                    <>
                                        {((scanlab.headStatus & (1 << 11)) !== 0 || scanlab.headStatus === 0) && <div>• Scanner head not detected. (Check interface cable)</div>}
                                        {((scanlab.headStatus & (1 << 12)) !== 0) && <div>• Head communication protocol error.</div>}
                                        {((scanlab.headStatus & (1 << 13)) !== 0) && <div>• Head +/-15V Galvo power off! (Check power supply)</div>}
                                        {((scanlab.headStatus & (1 << 14)) !== 0) && <div>• Head temperature fault/warning.</div>}
                                        {((scanlab.headStatus & (1 << 15)) !== 0) && <div>• Tracking limits error (Galvo locked!).</div>}
                                    </>
                                )}
                            </div>
                        )}

                        <ParameterInput 
                            label="Device" 
                            value="SCANLAB-RTC" 
                            onChange={() => {}} 
                            disabled={true}
                            className="opacity-70"
                        />
                        <ParameterInput 
                            label="DLL Ver." 
                            value={config.dllVersion !== undefined && config.dllVersion !== 0 ? config.dllVersion.toString() : "-"} 
                            onChange={() => {}} 
                            disabled={true}
                            className="opacity-70"
                        />
                        <ParameterInput 
                            label="Hex Ver." 
                            value={config.hexVersion !== undefined && config.hexVersion !== 0 ? config.hexVersion.toString() : "-"} 
                            onChange={() => {}} 
                            disabled={true}
                            className="opacity-70"
                        />
                        <ParameterInput 
                            label="RTC Ver." 
                            value={config.rtcVersionNo !== undefined && config.rtcVersionNo !== 0 ? config.rtcVersionNo.toString() : "-"} 
                            onChange={() => {}} 
                            disabled={true}
                            className="opacity-70"
                        />
                        <ParameterInput 
                            label="Serial Number" 
                            value={config.serialNumber !== undefined && config.serialNumber !== 0 ? config.serialNumber.toString() : "-"} 
                            onChange={() => {}} 
                            disabled={true}
                            className="opacity-70"
                        />
                    </Stack>
                </ParameterCard>

                {/* Field & Speed Settings (Bottom Left) */}
                <ParameterCard>
                    <ParameterSectionHeader title="Basic Settings" />
                    <Stack gap="lg" mt="md">
                        <ParameterInput 
                            label="Mark Speed" 
                            type="number" 
                            unit="mm/s"
                            value={config.markSpeed} 
                            onChange={(val) => onChange('markSpeed', parseFloat(val) || 0)} 
                            tooltip="가공 기본 속도입니다. Recipe 패널에서 가공을 시작할 때는 Recipe에 지정된 속도가 우선 적용됩니다."
                        />
                        <ParameterInput 
                            label="Jump Speed" 
                            type="number" 
                            unit="mm/s"
                            value={config.jumpSpeed} 
                            onChange={(val) => onChange('jumpSpeed', parseFloat(val) || 0)} 
                            tooltip="레이저가 꺼진 상태로 다음 가공 위치까지 이동하는 점프 속도입니다. 가공 시간 단축에 큰 영향을 미칩니다."
                        />
                        <ParameterInput 
                            label="H Ratio (Scale X)" 
                            type="number" 
                            value={config.hRatio ?? 1.0} 
                            onChange={(val) => onChange('hRatio', parseFloat(val) || 1.0)} 
                            tooltip="가공 실측 보정을 위한 X축 배율입니다. 설정치 / 실측치 (예: 4mm 마킹 후 실측이 4.02mm라면 4 / 4.02 = 0.9950)"
                        />
                        <ParameterInput 
                            label="V Ratio (Scale Y)" 
                            type="number" 
                            value={config.vRatio ?? 1.0} 
                            onChange={(val) => onChange('vRatio', parseFloat(val) || 1.0)} 
                            tooltip="가공 실측 보정을 위한 Y축 배율입니다. 설정치 / 실측치 (예: 4mm 마킹 후 실측이 4.02mm라면 4 / 4.02 = 0.9950)"
                        />
                    </Stack>
                </ParameterCard>
            </Stack>

            <Stack gap="xl">
                {/* Firmware & Correction (Top Right) */}
                <ParameterCard>
                    <ParameterSectionHeader title="Firmware & Correction" />
                    <Stack gap="lg" mt="md">
                        <ParameterSelect 
                            label="Wavelength (Laser Type)"
                            value={config.wavelength || "IR_1064"}
                            onChange={(val) => {
                                onChange('wavelength', val);
                                if (val === 'UV_355') {
                                    onChange('correctionFile', 'Config\\D2_969.ct5');
                                } else {
                                    onChange('correctionFile', 'Config\\D2_1753.ct5');
                                }
                            }}
                            options={[
                                { label: 'IR 1064nm (1030nm)', value: 'IR_1064' },
                                { label: 'UV 355nm (343nm)', value: 'UV_355' }
                            ]}
                            tooltip="장착된 레이저 소스의 파장을 선택합니다. 변경 시 해당 렌즈에 맞는 .ct5 보정 파일 경로가 자동으로 세팅됩니다."
                        />
                        <ParameterInput 
                            label="Active K-Factor" 
                            unit="bit/mm"
                            value={displayedKFactor!.toFixed(3)} 
                            onChange={() => {}} 
                            disabled={true}
                            className="opacity-90"
                            tooltip={`현재 하드웨어 칩셋에 등록된 1mm당 Bit 해상도입니다.\n\n[적용 공식]\n속도(Bits/ms) = (Speed(mm/s) * KFactor) / 1000\nX좌표(Bits) = Coord(mm) * KFactor * HRatio\nY좌표(Bits) = Coord(mm) * KFactor * VRatio`}
                        />
                        <ParameterInput 
                            label="Program File" 
                            value={config.programFile} 
                            onChange={() => {}} 
                            disabled={true}
                            className="opacity-70"
                            tooltip="스캐너 하드웨어 구동을 위한 메인 펌웨어(DSP 프로그램) 파일 경로입니다. 변경할 수 없습니다."
                        />
                        <ParameterInput 
                            label="Correction File" 
                            value={config.correctionFile} 
                            onChange={() => {}} 
                            disabled={true}
                            className="opacity-70"
                            tooltip="현재 로드된 렌즈 광학 왜곡 보정(.ct5) 파일 경로입니다. Wavelength 변경 시 자동 연동됩니다."
                        />
                    </Stack>
                </ParameterCard>

                {/* Axis Setting (Bottom Right) */}
                <ParameterCard>
                    <ParameterSectionHeader title="Axis Setting" />
                    <Stack gap="md" mt="md">
                        <ParameterSwitch 
                            label="XY swap" 
                            checked={config.bXYExchange} 
                            onChange={(val) => onChange('bXYExchange', val)} 
                            tooltip="X축과 Y축의 출력을 서로 바꿉니다. 레이저 마킹 방향이 90도 돌아가 있는 경우 사용합니다."
                        />
                        <ParameterSwitch 
                            label="X reverse (Y-Axis Inv)" 
                            checked={config.bXAxisN} 
                            onChange={(val) => onChange('bXAxisN', val)} 
                            tooltip="X축 출력을 반전(Invert)합니다. 좌우가 뒤집혀서 마킹될 때 사용합니다."
                        />
                        <ParameterSwitch 
                            label="Y reverse (X-Axis Inv)" 
                            checked={config.bYAxisN} 
                            onChange={(val) => onChange('bYAxisN', val)} 
                            tooltip="Y축 출력을 반전(Invert)합니다. 상하가 뒤집혀서 마킹될 때 사용합니다."
                        />
                    </Stack>
                </ParameterCard>
            </Stack>
        </SimpleGrid>
    );
};
