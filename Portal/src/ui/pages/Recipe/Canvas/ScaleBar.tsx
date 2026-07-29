/**
 * @file ScaleBar.tsx
 * @brief 캔버스 줌 레벨에 연동되어 현재 축적을 표시하는 하단 바 컴포넌트입니다.
 * @applied_design_pattern: Stateless Functional Component
 * @clean_code_principle: 수치 계산 로직의 순수 함수화, 명확한 단위 변환
 */

import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';

import { useTheme } from '@mui/material/styles';
import { useCanvasStore } from './useCanvasStore';


interface ScaleBarProps {
    // zoom and pxPerMm moved to direct store subscription
}

/**
 * @brief 화면상에 표시할 최적의 거리 단위를 계산합니다.
 * @param targetPx 목표로 하는 화면상 픽셀 길이 (가이드라인)
 * @param zoom 현재 줌 레벨
 * @param pxPerMm mm당 픽셀 수
 */
const calculateScale = (targetPx: number, zoom: number, pxPerMm: number) => {
    const worldDist = targetPx / (pxPerMm * zoom);
    
    // 1, 2, 5 단위로 가장 가까운 작은 값 찾기
    const magnitude = Math.pow(10, Math.floor(Math.log10(worldDist)));
    const relDist = worldDist / magnitude;
    
    let bestDist;
    if (relDist >= 5) bestDist = 5 * magnitude;
    else if (relDist >= 2) bestDist = 2 * magnitude;
    else bestDist = 1 * magnitude;
    
    return bestDist;
};

const ScaleBar: React.FC<ScaleBarProps> = () => {
    const theme = useTheme();
    const { zoom, pxPerMm } = useCanvasStore();

    const isDark = theme.palette.mode === 'dark';

    const { displayDist, displayUnit, barWidth } = useMemo(() => {
        // 목표 픽셀 길이: 150px
        const distMm = calculateScale(150, zoom, pxPerMm.x);
        const pxWidth = distMm * pxPerMm.x * zoom;
        
        let unit = 'mm';
        let val = distMm;
        
        if (distMm < 1) {
            unit = 'μm';
            val = distMm * 1000;
        }
        
        return {
            displayDist: Number(val.toFixed(2)),
            displayUnit: unit,
            barWidth: pxWidth
        };
    }, [zoom, pxPerMm.x]);

    // Theme-based Colors
    const labelColor = theme.palette.text.secondary;
    const valueColor = theme.palette.primary.main;
    const segmentBg = isDark ? '#1e293b' : '#cbd5e1'; // Dark: Slate-800, Light: Slate-300
    const segmentActive = theme.palette.primary.main;

    return (
        <Box sx={{
            position: 'absolute',
            bottom: 40,
            left: 70, // Ruler 너비(60px) + 여백
            zIndex: 30,
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 0.2
        }}>
            <Box sx={{ display: 'flex', width: barWidth, justifyContent: 'space-between', mb: 0 }}>
                <Typography variant="caption" sx={{ color: labelColor, fontSize: '9px', fontWeight: 600 }}>0</Typography>
                <Typography variant="caption" sx={{ color: labelColor, fontSize: '9px', fontWeight: 600 }}>{displayDist / 2}</Typography>
                <Typography variant="caption" sx={{ color: valueColor, fontSize: '10px', fontWeight: 700 }}>{displayDist} {displayUnit}</Typography>
            </Box>
            
            {/* 세그먼트 바 (Dynamic Theme Colors) */}
            <Box sx={{
                width: barWidth,
                height: 3,
                borderRadius: '1px',
                overflow: 'hidden',
                display: 'flex',
                boxShadow: isDark ? '0 0 4px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.1)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}`
            }}>
                <Box sx={{ flex: 1, bgcolor: segmentBg }} />
                <Box sx={{ flex: 1, bgcolor: segmentActive }} />
            </Box>
        </Box>
    );
};

export default React.memo(ScaleBar);
