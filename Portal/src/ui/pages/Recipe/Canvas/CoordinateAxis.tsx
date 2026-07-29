import React from 'react';
import { Box, Typography } from '@mui/material';

interface CoordinateAxisProps {
    className?: string;
    style?: React.CSSProperties;
}

export default function CoordinateAxis({ className, style }: CoordinateAxisProps) {
    return (
        <Box
            className={className}
            sx={{
                width: 80,
                height: 80,
                pointerEvents: 'none',
                ...style
            }}
        >
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* X Axis (Red) - Origin at (20, 60), pointing RIGHT to (60, 60) */}
                <line x1="20" y1="60" x2="60" y2="60" stroke="#FF4444" strokeWidth="2" markerEnd="url(#arrowhead-x)" />
                <text x="65" y="64" fill="#FF4444" fontSize="12" fontWeight="bold" fontFamily="Arial">X</text>

                {/* Y Axis (Green) - Origin at (20, 60), pointing UP to (20, 20) */}
                <line x1="20" y1="60" x2="20" y2="20" stroke="#44FF44" strokeWidth="2" markerEnd="url(#arrowhead-y)" />
                <text x="16" y="15" fill="#44FF44" fontSize="12" fontWeight="bold" fontFamily="Arial">Y</text>

                {/* Origin Dot */}
                <circle cx="20" cy="60" r="3" fill="#FFFFFF" />

                <defs>
                    <marker id="arrowhead-x" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#FF4444" />
                    </marker>
                    <marker id="arrowhead-y" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#44FF44" />
                    </marker>
                </defs>
            </svg>
        </Box>
    );
}
