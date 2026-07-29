import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEffect, useState, useRef } from "react";

export type DigitalDisplayProps = {
    value: number | string;
    unit?: string;
    label?: string;
    color?: string; // Default text color override
    minWidth?: number | string;
    /** 
     * If provided, controls the highlight color (Green) based on this state.
     * Use true to force Green, false to force standard color.
     * If undefined, falls back to "Flash on Change" behavior.
     */
    active?: boolean;
};

/**
 * @component DigitalDisplay
 * @brief Displays regular text/numbers in a digital 7-segment style font (VT323).
 * @details
 *  - Highlights prominently when value changes.
 *  - Uses Ghost Padding (Transparent Zeros) to prevent jitter.
 */
export function DigitalDisplay({
    value,
    unit = "",
    label,
    color,
    minWidth = 110, // Increased default width
    active
}: DigitalDisplayProps) {
    const theme = useTheme();
    const [highlight, setHighlight] = useState(false);
    const prevValueRef = useRef(value);

    // Params for fixed width
    const INT_DIGITS = 3; // Support up to 999
    const DEC_DIGITS = 3;

    // Formatting Logic
    const rawNum = typeof value === 'number' ? value : parseFloat(value as string) || 0;

    // Sign Logic
    const sign = rawNum < 0 ? "-" : "\u00A0"; // Minus or Non-breaking space

    // Absolute String Fixed
    const absNum = Math.abs(rawNum);
    const absStr = absNum.toFixed(DEC_DIGITS);
    const [intPart, decPart] = absStr.split(".");

    // Pad integer part
    const paddedInt = intPart.padStart(INT_DIGITS, "0");
    const realIntLength = intPart.length;

    /**
     * Renders integer part with transparent padding for fixed width
     */
    const renderInt = () => {
        const paddingCount = Math.max(0, INT_DIGITS - realIntLength);
        const paddingStr = paddedInt.slice(0, paddingCount);
        const realStr = paddedInt.slice(paddingCount);

        return (
            <>
                {/* Ghost Padding (Transparent) */}
                <span style={{ opacity: 0, userSelect: 'none' }}>{paddingStr}</span>
                {/* Real Digits */}
                <span>{realStr}</span>
            </>
        );
    };

    useEffect(() => {
        const displayValue = rawNum.toFixed(DEC_DIGITS);
        if (displayValue !== (typeof prevValueRef.current === 'number' ? prevValueRef.current.toFixed(DEC_DIGITS) : prevValueRef.current)) {
            setHighlight(true);
            prevValueRef.current = rawNum;
            const timer = setTimeout(() => setHighlight(false), 500);
            return () => clearTimeout(timer);
        }
    }, [rawNum]);

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {label && (
                <Typography
                    sx={{
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        lineHeight: 1,
                        color: theme.palette.text.secondary,
                        mt: 0.25
                    }}
                >
                    {label}
                </Typography>
            )}
            <Box
                sx={{
                    fontFamily: "'Digital-7 Mono', monospace",
                    fontSize: '1.6rem',
                    lineHeight: 1,
                    minWidth: minWidth,
                    textAlign: 'right', // Align right inside container
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'pre', // Preserve spaces
                    color: (active || highlight)
                        ? theme.palette.success.main
                        : (color || theme.palette.text.primary),
                    transition: 'color 0.1s',
                    textShadow: (active || highlight)
                        ? `0 0 10px ${theme.palette.success.main}`
                        : 'none',

                    // Flex Layout for precise structural alignment
                    display: 'flex',
                    justifyContent: 'flex-end',
                }}
            >
                {/* Structure: [Sign][GhostPad][Int][.][Dec] */}
                <span>{sign}</span>
                {renderInt()}
                <span>.{decPart}</span>

                {unit && (
                    <Typography
                        component="span"
                        sx={{
                            fontSize: '0.85rem',
                            ml: 0.75,
                            mr: 2, // [NEW] Added margin to right to separate from next display
                            color: theme.palette.text.secondary,
                            fontFamily: "'Inter', sans-serif",
                            fontWeight: 500,
                            alignSelf: 'center', // Center vertically
                            mt: 0.5
                        }}
                    >
                        {unit}
                    </Typography>
                )}
            </Box>
        </Box>
    );
}
