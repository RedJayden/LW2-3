/**
 * @file Ruler.tsx
 * @brief 캔버스 확대/축소 및 팬(Pan) 상태에 반응하는 동적 눈금자 컴포넌트입니다.
 * @note DPI 25400 (PX_PER_MM = 1000) 환경에 맞추어 UI 요소를 스케일링했습니다.
 * * @applied_design_pattern: Single Responsibility Principle (SRP)
 * * @clean_code_principle: 상수 명확화, UI 스케일링 로직 적용
 */

import React, { useEffect, useRef } from 'react';
import { useTheme } from '@mui/material/styles';
import { useCanvasStore } from './useCanvasStore';


interface RulerProps {
    orientation: 'horizontal' | 'vertical';
    length?: number;
    zoom?: number;
    offset?: number;
    /** @brief RecipeCanvas에서 전달받은 스케일링 팩터 (PX_PER_MM / 3.7795) */
    pxScalingFactor: number;
}

export default function Ruler({ orientation, length = 1000, pxScalingFactor }: RulerProps) {
    const { pan, zoom } = useCanvasStore();
    const offset = orientation === 'horizontal' ? pan.x : pan.y;

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    useEffect(() => {
        let isMounted = true;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx || !isMounted) return;

        // ... (rest of the drawing logic)
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        canvas.width = width;
        canvas.height = height;

        // Theme-based Colors
        const bgColor = isDark ? 'rgba(11, 17, 33, 0.85)' : 'rgba(255, 255, 255, 0.9)';
        const tickColor = isDark ? '#475569' : '#94a3b8';
        const textColor = isDark ? '#94a3b8' : '#475569';
        const primaryColor = theme.palette.primary.main;

        ctx.clearRect(0, 0, width, height);
        if (!isMounted) return;

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = tickColor;
        ctx.lineWidth = 1;

        // **Dynamic Scale Support**
        const currentPxPerMm = pxScalingFactor || 1000;

        // Adaptive Ruler Logic
        const minTickPx = 8;
        const minLabelPx = 60;

        const baseSteps = [1, 2, 5];
        let stepMm = 1;
        let labelStepMm = 10;

        const idealStepMm = minTickPx / (currentPxPerMm * zoom);

        // [FIX] Use Math.log10 for O(1) magnitude calculation to prevent infinite loops at extreme zooms
        const magnitude = Math.pow(10, Math.floor(Math.log10(idealStepMm || 1e-9)));
        stepMm = magnitude;
        for (const s of baseSteps) {
            if (s * magnitude >= idealStepMm - 1e-9) {
                stepMm = s * magnitude;
                break;
            }
        }

        const idealLabelStepMm = minLabelPx / (currentPxPerMm * zoom);
        // [FIX] Safe label step calculation using integer multipliers to avoid floating point modulo errors
        let labelMultiplier = 1;
        let safetyCount = 0;
        
        while ((labelMultiplier * stepMm * currentPxPerMm * zoom < minLabelPx - 1e-9) && safetyCount < 50) {
            if ((labelMultiplier * 2 * stepMm) >= idealLabelStepMm) {
                labelMultiplier *= 2;
            } else if ((labelMultiplier * 5 * stepMm) >= idealLabelStepMm) {
                labelMultiplier *= 5;
            } else {
                labelMultiplier *= 10;
            }
            safetyCount++;
        }
        labelStepMm = stepMm * labelMultiplier;

        ctx.beginPath();

        // [FIX] Add line count safety to prevent rendering millions of ticks
        let lineCount = 0;
        const MAX_LINES = 2000;

        if (orientation === 'horizontal') {
            const startI = Math.floor((-offset / zoom) / currentPxPerMm / stepMm);
            const endI = Math.ceil(((width - offset) / zoom) / currentPxPerMm / stepMm);

            const stepsPerLabel = Math.round(labelStepMm / stepMm);
            const stepsPerMedium = Math.round((labelStepMm / 2) / stepMm);

            for (let i = startI; i <= endI; i++) {
                if (!isMounted || lineCount++ > MAX_LINES) break;
                const w = i * stepMm;
                const x = (w * currentPxPerMm * zoom) + offset;
                if (x < -50 || x > width + 50) continue;

                const isLabel = i % stepsPerLabel === 0;
                const isMedium = !isLabel && i % stepsPerMedium === 0;

                let tickH = 4;
                if (isMedium) tickH = 7;
                if (isLabel) tickH = 10;
                tickH = Math.max(1, tickH);

                const rulerHeight = 20;
                ctx.moveTo(x, rulerHeight);
                ctx.lineTo(x, rulerHeight - tickH);

                if (isLabel) {
                    let unit = ' mm';
                    let valStr = '';

                    if (Math.abs(w) < 0.000001) {
                        valStr = '0';
                        unit = '';
                    } else {
                        let decimals = 0;
                        if (labelStepMm < 1) {
                            decimals = Math.max(1, Math.abs(Math.floor(Math.log10(labelStepMm))));
                        } else if (labelStepMm % 1 !== 0) {
                            decimals = 1;
                        }
                        valStr = w.toFixed(decimals);
                    }

                    const text = valStr + unit;
                    const fontSize = 10;
                    ctx.font = `${fontSize}px Arial`;

                    if (Math.abs(w) < 0.001) {
                        ctx.fillStyle = primaryColor;
                        ctx.font = `bold 11px Arial`;
                    } else {
                        ctx.fillStyle = textColor;
                    }

                    const textMetrics = ctx.measureText(text);
                    const textWidth = textMetrics.width;
                    ctx.fillText(text, x - textWidth / 2, rulerHeight - tickH - 2);
                }
            }
        } else {
            const startI = Math.floor((offset - (height + 50)) / (currentPxPerMm * zoom) / stepMm);
            const endI = Math.ceil((offset - (-50)) / (currentPxPerMm * zoom) / stepMm);

            const stepsPerLabel = Math.round(labelStepMm / stepMm);
            const stepsPerMedium = Math.round((labelStepMm / 2) / stepMm);

            for (let i = startI; i <= endI; i++) {
                if (!isMounted || lineCount++ > MAX_LINES) break;
                const w = i * stepMm;
                const y = offset - (w * currentPxPerMm * zoom);
                if (y < -50 || y > height + 50) continue;

                const isLabel = i % stepsPerLabel === 0;
                const isMedium = !isLabel && i % stepsPerMedium === 0;

                let tickW = 4;
                if (isMedium) tickW = 7;
                if (isLabel) tickW = 10;
                tickW = Math.max(1, tickW);

                const rulerWidth = 60;
                ctx.moveTo(rulerWidth, y);
                ctx.lineTo(rulerWidth - tickW, y);

                if (isLabel) {
                    let unit = ' mm';
                    let valStr = '';

                    if (Math.abs(w) < 0.000001) {
                        valStr = '0';
                        unit = '';
                    } else {
                        let decimals = 0;
                        if (labelStepMm < 1) {
                            decimals = Math.max(1, Math.abs(Math.floor(Math.log10(labelStepMm))));
                        } else if (labelStepMm % 1 !== 0) {
                            decimals = 1;
                        }
                        valStr = w.toFixed(decimals);
                    }

                    const text = valStr + unit; // [FIX] 사용자 요청에 따라 수평 눈금자와 동일하게 단위 표시
                    const fontSize = 10;
                    ctx.font = `${fontSize}px Arial`;

                    if (Math.abs(w) < 0.001) {
                        ctx.fillStyle = primaryColor;
                        ctx.font = `bold 11px Arial`;
                    } else {
                        ctx.fillStyle = textColor;
                    }

                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(text, 48, y);
                    ctx.textAlign = 'start';
                    ctx.textBaseline = 'alphabetic';
                }
            }
        }
        ctx.stroke();

        return () => {
            isMounted = false;
        };
    }, [orientation, length, zoom, offset, pxScalingFactor, theme, isDark]);

    // 캔버스 크기 (가로: 100%, 세로: 20px / 가로: 60px, 세로: 100%)
    const size = orientation === 'horizontal' ? { width: '100%', height: 20 } : { width: 60, height: '100%' };

    return (
        <canvas
            ref={canvasRef}
            width={orientation === 'horizontal' ? 2000 : 60}
            height={orientation === 'horizontal' ? 20 : 2000}
            style={{ ...size, display: 'block', backgroundColor: 'transparent', position: 'absolute', top: 0, left: 0, zIndex: 100, pointerEvents: 'none' }}
        />
    );
}