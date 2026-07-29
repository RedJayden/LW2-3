
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, TextField, Grid, Slider, IconButton } from '@mui/material';
import * as fabric from 'fabric';

interface ColorPickerProps {
    color: string;
    opacity: number;
    onChange: (color: string, opacity: number) => void;
}

// Helpers
const hexToRgb = (hex: string) => {
    const c = new fabric.Color(hex);
    return c.getSource() as [number, number, number, number]; // Fabric v6 returns [r,g,b,a]
};

const rgbToHsv = (r: number, g: number, b: number) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max !== min) {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, v: v * 100 };
};

const hsvToRgb = (h: number, s: number, v: number) => {
    let r = 0, g = 0, b = 0;
    const i = Math.floor(h / 60);
    const f = h / 60 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    // v, s are 0-1 (calculated below)
    // Actually the input s,v are 0-100.
    s /= 100;
    v /= 100;

    // Re-calc using standard algorithm for 0-1 s,v
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
    else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
    else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
    else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
    else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
    else if (h >= 300 && h < 360) { r = c; g = 0; b = x; }

    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    };
};

const quickColors = [
    "#00BEFF", // Cyan
    "#1E90FF", // Dodger Blue
    "#8A2BE2", // Blue Violet
    "#FF00FF", // Magenta
    "#DC143C", // Crimson
    "#FF4500", // Orange Red
    "#FF8C00", // Dark Orange
    "#FFD700", // Gold
    "#32CD32", // Lime Green
    "#008080", // Teal
];

export default function ColorPicker({ color, opacity, onChange }: ColorPickerProps) {
    // Current Internal State (HSV dominant)
    const [hsv, setHsv] = useState({ h: 0, s: 0, v: 0 });
    const [draggingSat, setDraggingSat] = useState(false);
    const [draggingHue, setDraggingHue] = useState(false);

    const satRef = useRef<HTMLDivElement>(null);
    const hueRef = useRef<HTMLDivElement>(null);

    // Sync from Props
    useEffect(() => {
        const rgb = hexToRgb(color); // [r,g,b,a]
        const newHsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
        setHsv(newHsv);
    }, [color]); // Only on external update

    const updateFromHsv = (h: number, s: number, v: number) => {
        const rgb = hsvToRgb(h, s, v);
        const hex = new fabric.Color(`rgb(${rgb.r},${rgb.g},${rgb.b})`).toHex();
        onChange(`#${hex}`, opacity);
        setHsv({ h, s, v });
    };

    // Saturation Box Interaction
    const handleSatMouseDown = (e: React.MouseEvent) => {
        setDraggingSat(true);
        updateSat(e);
    };

    const updateSat = useCallback((e: MouseEvent | React.MouseEvent) => {
        if (!satRef.current) return;
        const rect = satRef.current.getBoundingClientRect();
        let x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        let y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

        // x = Saturation, y = 1 - Value
        updateFromHsv(hsv.h, x * 100, (1 - y) * 100);
    }, [hsv.h, opacity]);

    // Hue Slider Interaction
    const handleHueMouseDown = (e: React.MouseEvent) => {
        setDraggingHue(true);
        updateHue(e);
    };

    const updateHue = useCallback((e: MouseEvent | React.MouseEvent) => {
        if (!hueRef.current) return;
        const rect = hueRef.current.getBoundingClientRect();
        let x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

        updateFromHsv(x * 359, hsv.s, hsv.v);
    }, [hsv.s, hsv.v, opacity]);

    // Global Mouse Up / Move
    useEffect(() => {
        const handleUp = () => {
            setDraggingSat(false);
            setDraggingHue(false);
        };
        const handleMove = (e: MouseEvent) => {
            if (draggingSat) updateSat(e);
            if (draggingHue) updateHue(e);
        };
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('mousemove', handleMove);
        return () => {
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('mousemove', handleMove);
        };
    }, [draggingSat, draggingHue, updateSat, updateHue]);

    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);

    return (
        <Box sx={{ width: 220, p: 1.5, bgcolor: '#1e1e1e', borderRadius: 2, boxShadow: 4, border: '1px solid #333' }}>
            {/* 1. Saturation/Value Box */}
            <Box
                ref={satRef}
                onMouseDown={handleSatMouseDown}
                sx={{
                    width: '100%',
                    height: 120,
                    position: 'relative',
                    borderRadius: 1,
                    overflow: 'hidden',
                    cursor: 'crosshair',
                    bgcolor: `hsl(${hsv.h}, 100%, 50%)`,
                    border: '1px solid #444',
                    mb: 1.5,
                    backgroundImage: `
                        linear-gradient(to top, #000, transparent),
                        linear-gradient(to right, #fff, transparent)
                    `
                }}
            >
                {/* Thumb */}
                <Box sx={{
                    position: 'absolute',
                    left: `${hsv.s}%`,
                    top: `${100 - hsv.v}%`,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    border: '2px solid white',
                    boxShadow: '0 0 2px black',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none'
                }} />
            </Box>

            {/* 2. Hue Slider */}
            <Box
                ref={hueRef}
                onMouseDown={handleHueMouseDown}
                sx={{
                    width: '100%',
                    height: 14,
                    borderRadius: 7,
                    mb: 2,
                    cursor: 'pointer',
                    position: 'relative',
                    background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'
                }}
            >
                <Box sx={{
                    position: 'absolute',
                    left: `${(hsv.h / 360) * 100}%`,
                    top: '50%',
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: '3px solid white',
                    boxShadow: '0 0 2px black',
                    transform: 'translate(-50%, -50%)',
                    bgcolor: `hsl(${hsv.h}, 100%, 50%)`,
                    pointerEvents: 'none'
                }} />
            </Box>

            {/* 3. Color Preview & RGB Inputs */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
                {/* Big Color Circle */}
                <Box sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    bgcolor: color,
                    border: '2px solid #555',
                    flexShrink: 0
                }} />

                {/* RGB Inputs */}
                <Box sx={{ display: 'flex', gap: 0.5, flex: 1 }}>
                    {['R', 'G', 'B'].map((label) => {
                        const val = label === 'R' ? rgb.r : label === 'G' ? rgb.g : rgb.b;
                        return (
                            <Box key={label} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                                <TextField
                                    value={val}
                                    size="small"
                                    fullWidth
                                    inputProps={{ style: { fontSize: 12, padding: '4px', textAlign: 'center', color: '#eee' } }}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: 1,
                                            bgcolor: '#2a2a2a',
                                            '& fieldset': { borderColor: '#444' }
                                        }
                                    }}
                                    onChange={(e) => {
                                        const n = Math.min(255, Math.max(0, Number(e.target.value)));
                                        const nr = label === 'R' ? n : rgb.r;
                                        const ng = label === 'G' ? n : rgb.g;
                                        const nb = label === 'B' ? n : rgb.b;
                                        onChange(`#${new fabric.Color(`rgb(${nr},${ng},${nb})`).toHex()}`, opacity);
                                    }}
                                />
                                <Typography variant="caption" sx={{ color: '#00BEFF', fontSize: 10, mt: 0.5, fontWeight: 'bold' }}>{label}</Typography>
                            </Box>
                        );
                    })}
                </Box>
            </Box>

            <Box sx={{ height: 1, bgcolor: '#333', mb: 1.5 }} />

            {/* 4. Quick Palette */}
            <Typography variant="caption" display="block" sx={{ mb: 1, color: '#aaa', fontWeight: 'bold' }}>Quick Palette</Typography>
            <Box sx={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(5, 1fr)', 
                gap: 1.25
            }}>
                {quickColors.map(c => (
                    <Box
                        key={c}
                        onClick={() => onChange(c, opacity)}
                        sx={{
                            width: '100%',
                            aspectRatio: '1/1',
                            bgcolor: c,
                            borderRadius: '50%',
                            cursor: 'pointer',
                            border: color.toLowerCase() === c.toLowerCase() ? '2px solid white' : '1px solid #333',
                            '&:hover': { transform: 'scale(1.1)', borderColor: 'white' },
                            transition: 'transform 0.1s, border-color 0.1s',
                            boxSizing: 'border-box'
                        }}
                    />
                ))}
            </Box>
        </Box>
    );
}
