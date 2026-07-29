import React from 'react';
import { IconButton, Tooltip, Paper, Stack } from '@mui/material';
import StraightenIcon from '@mui/icons-material/Straighten'; // Distance
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'; // Circle
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'; // Width
import SwapVertIcon from '@mui/icons-material/SwapVert'; // Height
import { SvgIcon } from '@mui/material';
import { useCanvasStore, MeasureMode } from '../Canvas/useCanvasStore';

import TimelineIcon from '@mui/icons-material/Timeline'; // Polyline

import CropSquareIcon from '@mui/icons-material/CropSquare'; // Rectangle

function AngleIcon(props: any) {
    return (
        <SvgIcon {...props}>
            <path d="M20 18H4L16 4" fill="none" stroke="currentColor" strokeWidth="2" />
        </SvgIcon>
    );
}

export default function MeasureToolbar() {
    const { measureMode, setMeasureMode, activeTool } = useCanvasStore();

    if (activeTool !== 'measure') return null;

    const tools: { mode: MeasureMode; icon: React.ReactNode; label: string }[] = [
        { mode: 'distance', icon: <StraightenIcon />, label: 'Distance (D)' },
        { mode: 'rect', icon: <CropSquareIcon />, label: 'Rectangle (Shift+R)' },
        { mode: 'circle', icon: <RadioButtonUncheckedIcon />, label: 'Circle Radius (Shift+C)' },
        { mode: 'width', icon: <SwapHorizIcon />, label: 'Width (W)' },
        { mode: 'height', icon: <SwapVertIcon />, label: 'Height (E)' },
        { mode: 'angle', icon: <AngleIcon />, label: 'Angle (A)' },
        { mode: 'polyline', icon: <TimelineIcon />, label: 'Polyline Distance (Shift+P)' },
    ];

    return (
        <Paper
            elevation={3}
            sx={{
                position: 'absolute',
                left: 20,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 100,
                backgroundColor: 'rgba(30, 30, 30, 0.9)',
                backdropFilter: 'blur(4px)',
                borderRadius: 2,
                p: 1,
            }}
        >
            <Stack spacing={1}>
                {tools.map((tool) => (
                    <Tooltip key={tool.mode} title={tool.label} placement="right">
                        <IconButton
                            onClick={() => setMeasureMode(tool.mode)}
                            color={measureMode === tool.mode ? 'primary' : 'default'}
                            sx={{
                                backgroundColor: measureMode === tool.mode ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                                '&:hover': {
                                    backgroundColor: measureMode === tool.mode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                },
                            }}
                        >
                            {tool.icon}
                        </IconButton>
                    </Tooltip>
                ))}
            </Stack>
        </Paper>
    );
}
