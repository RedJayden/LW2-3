/**
 * @file SinoGalvoParameterForm.tsx
 * @brief SinoGalvo scanner configuration form.
 * @details Handles horizontal/vertical ratio correction, barrel/trapezoidal/parallelogram distortion correction, field size, and axis settings.
 */

import React, { useEffect, useState } from 'react';
import { hwFacade } from '../../../services/HardwareFacade';
import { ParameterCard, ParameterSectionHeader, ParameterInput, ParameterSwitch } from '../../components/ParameterComponents';
import { useAppStore } from '../../../store/appStore';
import { Stack, SimpleGrid } from '@mantine/core';

interface SinoGalvoConfig {
    hRatio: number;
    vRatio: number;
    barrelDistortionX: number;
    barrelDistortionY: number;
    trapezoidalDistortionX: number;
    trapezoidalDistortionY: number;
    parallelogramDistortionX: number;
    parallelogramDistortionY: number;
    workSize: number;
    bXYExchange: boolean;
    bXAxisN: boolean;
    bYAxisN: boolean;
}

interface SinoGalvoParameterFormProps {
    config: SinoGalvoConfig;
    onChange: (key: keyof SinoGalvoConfig, value: any) => void;
}

/**
 * @component SinoGalvoParameterForm
 * @brief View component representing SinoGalvo-specific configuration fields.
 */
export const SinoGalvoParameterForm: React.FC<SinoGalvoParameterFormProps> = ({ config, onChange }) => {
    return (
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
            <Stack gap="xl">
                {/* Basic Correction */}
                <ParameterCard>
                    <ParameterSectionHeader title="Basic Correction" />
                    <Stack gap="lg" mt="md">
                        <ParameterInput 
                            label="Correct Size" 
                            type="number" 
                            unit="mm"
                            value={config.workSize} 
                            onChange={(val) => onChange('workSize', parseFloat(val) || 0)} 
                        />
                        <SimpleGrid cols={2} spacing="md">
                            <ParameterInput 
                                label="HRatio" 
                                type="number" 
                                step={0.0001}
                                value={config.hRatio} 
                                onChange={(val) => onChange('hRatio', parseFloat(val) || 0)} 
                            />
                            <ParameterInput 
                                label="VRatio" 
                                type="number" 
                                step={0.0001}
                                value={config.vRatio} 
                                onChange={(val) => onChange('vRatio', parseFloat(val) || 0)} 
                            />
                        </SimpleGrid>
                    </Stack>
                </ParameterCard>

                {/* Axis Setting */}
                <ParameterCard>
                    <ParameterSectionHeader title="Axis Setting" />
                    <Stack gap="md" mt="md">
                        <ParameterSwitch 
                            label="XY swap" 
                            checked={config.bXYExchange} 
                            onChange={(val) => onChange('bXYExchange', val)} 
                        />
                        <ParameterSwitch 
                            label="X reverse (Y-Axis Inv)" 
                            checked={config.bXAxisN} 
                            onChange={(val) => onChange('bXAxisN', val)} 
                        />
                        <ParameterSwitch 
                            label="Y reverse (X-Axis Inv)" 
                            checked={config.bYAxisN} 
                            onChange={(val) => onChange('bYAxisN', val)} 
                        />
                    </Stack>
                </ParameterCard>
            </Stack>

            <Stack gap="xl">
                {/* Distortion Correction */}
                <ParameterCard className="h-full">
                    <ParameterSectionHeader title="Distortion Correction" />
                    <Stack gap="xl" mt="md">
                        <Stack gap="xs">
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Barrel Distortion</div>
                            <SimpleGrid cols={2} spacing="md">
                                <ParameterInput 
                                    label="X" 
                                    type="number" 
                                    step={0.0001}
                                    value={config.barrelDistortionX} 
                                    onChange={(val) => onChange('barrelDistortionX', parseFloat(val) || 0)} 
                                />
                                <ParameterInput 
                                    label="Y" 
                                    type="number" 
                                    step={0.0001}
                                    value={config.barrelDistortionY} 
                                    onChange={(val) => onChange('barrelDistortionY', parseFloat(val) || 0)} 
                                />
                              </SimpleGrid>
                        </Stack>

                        <Stack gap="xs">
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Trapezoidal Distortion</div>
                            <SimpleGrid cols={2} spacing="md">
                                <ParameterInput 
                                    label="X" 
                                    type="number" 
                                    step={0.0001}
                                    value={config.trapezoidalDistortionX} 
                                    onChange={(val) => onChange('trapezoidalDistortionX', parseFloat(val) || 0)} 
                                />
                                <ParameterInput 
                                    label="Y" 
                                    type="number" 
                                    step={0.0001}
                                    value={config.trapezoidalDistortionY} 
                                    onChange={(val) => onChange('trapezoidalDistortionY', parseFloat(val) || 0)} 
                                />
                            </SimpleGrid>
                        </Stack>

                        <Stack gap="xs">
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Parallelogram Distortion</div>
                            <SimpleGrid cols={2} spacing="md">
                                <ParameterInput 
                                    label="X" 
                                    type="number" 
                                    step={0.0001}
                                    value={config.parallelogramDistortionX} 
                                    onChange={(val) => onChange('parallelogramDistortionX', parseFloat(val) || 0)} 
                                />
                                <ParameterInput 
                                    label="Y" 
                                    type="number" 
                                    step={0.0001}
                                    value={config.parallelogramDistortionY} 
                                    onChange={(val) => onChange('parallelogramDistortionY', parseFloat(val) || 0)} 
                                />
                            </SimpleGrid>
                        </Stack>
                    </Stack>
                </ParameterCard>
            </Stack>
        </SimpleGrid>
    );
};
