/**
 * @file ScannerParameterForm.tsx
 * @brief Scanner Configuration page with Switch Factory.
 * @details Dynamically renders SinoGalvoParameterForm or ScanlabParameterForm based on the hardware configuration, and coordinates loading/saving parameter data via HardwareFacade.
 */

import React, { useEffect, useState } from 'react';
import { hwFacade } from '../../../services/HardwareFacade';
import { ParameterLayout } from '../../components/ParameterComponents';
import { useAppStore } from '../../../store/appStore';
import { Group, Button } from '@mantine/core';
import { NavIcons } from '../../icons/NavIcons';
import { SinoGalvoParameterForm } from './SinoGalvoParameterForm';
import { ScanlabParameterForm } from './ScanlabParameterForm';

/**
 * @component ScannerParameterForm
 * @brief Factory component that selects and manages the active scanner parameter form.
 */
export const ScannerParameterForm: React.FC = () => {
    const showToast = useAppStore(s => s.showToast);
    const scannerType = useAppStore(s => s.hardware.scanner); // "SinoGalvo" or "Scanlab"
    const [loading, setLoading] = useState(true);

    // SinoGalvo Config state
    const [sinoConfig, setSinoConfig] = useState({
        hRatio: 1.0,
        vRatio: 1.0,
        barrelDistortionX: 0.0,
        barrelDistortionY: 0.0,
        trapezoidalDistortionX: 0.0,
        trapezoidalDistortionY: 0.0,
        parallelogramDistortionX: 0.0,
        parallelogramDistortionY: 0.0,
        workSize: 110.0,
        bXYExchange: true,
        bXAxisN: true,
        bYAxisN: true
    });

    // Scanlab Config state
    const [scanlabConfig, setScanlabConfig] = useState({
        wavelength: "IR_1064",
        workSize: 110.0,
        markSpeed: 1000.0,
        jumpSpeed: 3000.0,
        bXYExchange: false,
        bXAxisN: false,
        bYAxisN: false,
        rtcVersion: 6,
        cardNo: 1,
        programFile: "RTC6OUT.out",
        correctionFile: "Cor_1to1.ct5",
        kFactor: 0.0,
        activeKFactor: 0.0,
        laserMode: 1,
        laserControl: 2,
        dllVersion: 0,
        hexVersion: 0,
        rtcVersionNo: 0,
        serialNumber: 0
    });

    useEffect(() => {
        loadConfig();
    }, [scannerType]);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const { ok, data } = await hwFacade.getScannerConfig();
            if (ok && data) {
                const actualData = data.data || data;
                if (scannerType === 'SinoGalvo') {
                    setSinoConfig({
                        hRatio: actualData.hRatio ?? 1.0,
                        vRatio: actualData.vRatio ?? 1.0,
                        barrelDistortionX: actualData.barrelDistortionX ?? 0.0,
                        barrelDistortionY: actualData.barrelDistortionY ?? 0.0,
                        trapezoidalDistortionX: actualData.trapezoidalDistortionX ?? 0.0,
                        trapezoidalDistortionY: actualData.trapezoidalDistortionY ?? 0.0,
                        parallelogramDistortionX: actualData.parallelogramDistortionX ?? 0.0,
                        parallelogramDistortionY: actualData.parallelogramDistortionY ?? 0.0,
                        workSize: actualData.workSize ?? 110.0,
                        bXYExchange: actualData.bXYExchange ?? true,
                        bXAxisN: actualData.bXAxisN ?? true,
                        bYAxisN: actualData.bYAxisN ?? true
                    });
                } else {
                    setScanlabConfig({
                        workSize: actualData.workSize ?? 110.0,
                        markSpeed: actualData.markSpeed ?? 1000.0,
                        jumpSpeed: actualData.jumpSpeed ?? 3000.0,
                        bXYExchange: actualData.bXYExchange ?? false,
                        bXAxisN: actualData.bXAxisN ?? false,
                        bYAxisN: actualData.bYAxisN ?? false,
                        rtcVersion: actualData.rtcVersion ?? 6,
                        cardNo: actualData.cardNo ?? 1,
                        programFile: actualData.programFile ?? "RTC6OUT.out",
                        correctionFile: actualData.correctionFile ?? "Cor_1to1.ct5",
                        wavelength: actualData.wavelength ?? "IR_1064",
                        kFactor: actualData.kFactor ?? 0.0,
                        activeKFactor: actualData.activeKFactor ?? 0.0,
                        laserMode: actualData.laserMode ?? 1,
                        laserControl: actualData.laserControl ?? 2,
                        dllVersion: actualData.dllVersion ?? 0,
                        hexVersion: actualData.hexVersion ?? 0,
                        rtcVersionNo: actualData.rtcVersionNo ?? 0,
                        serialNumber: actualData.serialNumber ?? 0
                    });
                }
            }
        } catch (e) {
            console.error(e);
            showToast("Failed to load scanner config", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            const configToSave = scannerType === 'SinoGalvo' ? sinoConfig : scanlabConfig;

            // K-Factor Override 입력값 검증 (배율 형태 오입력 차단)
            if (scannerType === 'Scanlab' && scanlabConfig.kFactor > 0 && scanlabConfig.kFactor <= 100) {
                showToast("K-Factor Override must be an absolute value in bits/mm (e.g., ~9532 for 110mm field), not a scaling ratio (e.g., 0.9). Set to 0.0 to use default.", "error");
                return;
            }

            const { ok, message } = await hwFacade.setScannerConfig(configToSave);
            if (ok) {
                showToast("Scanner configuration saved successfully", "success");
                // Saved 후 현재 K-Factor 데이터 갱신을 위해 데이터 재조회
                loadConfig();
            } else {
                showToast(message || "Failed to save configuration", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Error saving configuration", "error");
        }
    };

    const handleSinoChange = (key: string, value: any) => {
        setSinoConfig(prev => ({ ...prev, [key]: value }));
    };

    const handleScanlabChange = (key: string, value: any) => {
        setScanlabConfig(prev => ({ ...prev, [key]: value }));
    };

    if (loading) {
        return <div className="p-20 text-center text-slate-500 font-mono tracking-widest animate-pulse">LOADING SCANNER CONFIG...</div>;
    }

    return (
        <ParameterLayout
            title={
                <Group gap="sm">
                    <NavIcons.Scanner size={28} className="text-cyan-400" />
                    <span>Scanner Configuration ({scannerType})</span>
                </Group>
            }
            actions={
                <Group gap="xl">
                    <Button 
                        variant="subtle" 
                        color="gray" 
                        onClick={loadConfig}
                        className="text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-widest font-bold text-xs"
                    >
                        Reload
                    </Button>
                    <Button 
                        color="cyan" 
                        onClick={handleSave}
                        size="md"
                        className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-8 shadow-[0_0_20px_-5px_rgba(6,182,212,0.5)] transition-all uppercase tracking-wider"
                    >
                        Save Changes
                    </Button>
                </Group>
            }
        >
            {scannerType === 'SinoGalvo' ? (
                <SinoGalvoParameterForm config={sinoConfig} onChange={handleSinoChange} />
            ) : (
                <ScanlabParameterForm config={scanlabConfig} onChange={handleScanlabChange} />
            )}
        </ParameterLayout>
    );
};
