import React, { useState, useRef, useEffect } from 'react';
import { ButtonBase, Tooltip, useTheme, Menu, MenuItem, InputBase, Divider } from '@mui/material';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

export interface ZoomControlProps {
    zoom: number; // Percentage (e.g., 100 for 100%)
    onZoomChange: (newZoom: number) => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFitScreen?: () => void;
    onFitStage?: () => void;
    onFitCamera?: () => void;
    onFitWidth?: () => void;
    onFitHeight?: () => void;
    isFitCamera?: boolean;
    showLabel?: boolean;
    label?: string;
    minZoom?: number;
    maxZoom?: number;
    children?: React.ReactNode;
}

export function ZoomControl({
    zoom,
    onZoomChange,
    onZoomIn,
    onZoomOut,
    onFitScreen,
    onFitStage,
    onFitCamera,
    onFitWidth,
    onFitHeight,
    isFitCamera = false,
    showLabel = false,
    label = "Zoom",
    minZoom = 10,
    maxZoom = 2000,
    children,
}: ZoomControlProps) {
    const theme = useTheme();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [isEditing, setIsEditing] = useState(false);
    const formatZoom = (z: number) => {
        if (z < 0.1) return z.toFixed(3);
        if (z < 1) return z.toFixed(2);
        return Number.isInteger(z) ? String(z) : z.toFixed(1);
    };

    const [inputValue, setInputValue] = useState(formatZoom(zoom));
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isEditing) {
            setInputValue(formatZoom(zoom));
        }
    }, [zoom, isEditing]);

    const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleCloseMenu = () => {
        setAnchorEl(null);
    };

    const handlePresetSelect = (value: number) => {
        onZoomChange(value);
        handleCloseMenu();
    };

    const handleInputClick = () => {
        setIsEditing(true);
        // Focus is handled by autoFocus on InputBase, but we might need to select all
        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.select();
            }
        }, 0);
    };

    const handleInputBlur = () => {
        setIsEditing(false);
        commitInput();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            inputRef.current?.blur(); // Will trigger handleInputBlur
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setInputValue(formatZoom(zoom)); // Revert
        }
    };

    const commitInput = () => {
        let val = parseFloat(inputValue);
        if (isNaN(val)) {
            setInputValue(formatZoom(zoom));
            return;
        }
        // Clamp
        if (val < minZoom) val = minZoom;
        if (val > maxZoom) val = maxZoom;

        onZoomChange(val);
        setInputValue(formatZoom(val));
    };

    return (
        <div
            className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border px-3 py-1.5 shadow-lg backdrop-blur-sm"
            style={{
                borderColor: theme.palette.divider,
                backgroundColor:
                    theme.palette.mode === "dark"
                        ? "rgba(30, 30, 30, 0.9)"
                        : "rgba(255, 255, 255, 0.8)",
                boxShadow: `0 4px 30px ${theme.palette.mode === "dark"
                    ? "rgba(0, 0, 0, 0.4)"
                    : "rgba(0, 0, 0, 0.1)"
                    }`,
            }}
        >
            {showLabel && (
                <div
                    className="text-center text-xs font-semibold tracking-wide"
                    style={{ color: theme.palette.text.secondary }}
                >
                    {label}
                </div>
            )}

            <div className="flex items-center gap-1">
                <Tooltip title="Zoom Out" placement="top" arrow disableInteractive>
                    <ButtonBase
                        onClick={onZoomOut}
                        sx={{
                            width: 28,
                            height: 28,
                            borderRadius: 1,
                            border: `1px solid ${theme.palette.divider}`,
                            bgcolor: "background.paper",
                            color: "text.primary",
                            fontSize: "1rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s ease",
                            "&:hover": {
                                borderColor: "primary.main",
                                bgcolor: "action.hover",
                            },
                        }}
                    >
                        -
                    </ButtonBase>
                </Tooltip>

                <div
                    className="relative flex items-center justify-center min-w-[60px]"
                >
                    {isEditing ? (
                        <InputBase
                            inputRef={inputRef}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onBlur={handleInputBlur}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            sx={{
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                color: 'text.primary',
                                textAlign: 'center',
                                '& input': { textAlign: 'center', padding: 0 }
                            }}
                        />
                    ) : (
                        <ButtonBase
                            onClick={handleOpenMenu}
                            sx={{
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                color: 'text.primary',
                                px: 1,
                                py: 0.5,
                                borderRadius: 1,
                                "&:hover": {
                                    bgcolor: "action.hover",
                                },
                            }}
                        >
                            {formatZoom(zoom)}%
                        </ButtonBase>
                    )}
                </div>

                <Tooltip title="Zoom In" placement="top" arrow disableInteractive>
                    <ButtonBase
                        onClick={onZoomIn}
                        sx={{
                            width: 28,
                            height: 28,
                            borderRadius: 1,
                            border: `1px solid ${theme.palette.divider}`,
                            bgcolor: "background.paper",
                            color: "text.primary",
                            fontSize: "1rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s ease",
                            "&:hover": {
                                borderColor: "primary.main",
                                bgcolor: "action.hover",
                            },
                        }}
                    >
                        +
                    </ButtonBase>
                </Tooltip>
                {children}
            </div>

            {/* [UX/UI] Fit to Camera와 Fit to Working Area 버튼을 하나의 토글 버튼으로 통합 */}
            {(onFitStage || onFitCamera) && (
                <Tooltip 
                    title={isFitCamera ? "Fit to Working Area" : "Fit to Camera FOV"} 
                    placement="top" 
                    arrow 
                    disableInteractive
                >
                    <ButtonBase
                        onClick={isFitCamera ? onFitStage : onFitCamera}
                        sx={{
                            width: 28,
                            height: 28,
                            borderRadius: 1,
                            border: `1px solid ${isFitCamera ? theme.palette.primary.main : theme.palette.divider}`,
                            bgcolor: "background.paper",
                            color: isFitCamera ? "primary.main" : "text.primary",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s ease",
                            "&:hover": {
                                borderColor: "primary.main",
                                bgcolor: "action.hover",
                            },
                        }}
                    >
                        {isFitCamera ? (
                            <FitScreenIcon sx={{ fontSize: 16 }} />
                        ) : (
                            <CenterFocusStrongIcon sx={{ fontSize: 16 }} />
                        )}
                    </ButtonBase>
                </Tooltip>
            )}

            {onFitScreen && !onFitStage && (
                <Tooltip title="Fit to Screen" placement="top" arrow disableInteractive>
                    <ButtonBase
                        onClick={onFitScreen}
                        sx={{
                            width: 28,
                            height: 28,
                            borderRadius: 1,
                            border: `1px solid ${theme.palette.divider}`,
                            bgcolor: "background.paper",
                            color: "text.primary",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s ease",
                            "&:hover": {
                                borderColor: "primary.main",
                                bgcolor: "action.hover",
                            },
                        }}
                    >
                        <FitScreenIcon sx={{ fontSize: 16 }} />
                    </ButtonBase>
                </Tooltip>
            )}

            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleCloseMenu}
                anchorOrigin={{
                    vertical: 'top',
                    horizontal: 'center',
                }}
                transformOrigin={{
                    vertical: 'bottom',
                    horizontal: 'center',
                }}
                PaperProps={{
                    sx: {
                        mb: 1,
                        minWidth: 120,
                    }
                }}
            >
                {[2000, 1600, 800, 400, 200, 100, 75, 50, 25]
                    .filter(preset => preset <= maxZoom)
                    .map((preset) => (
                        <MenuItem key={preset} onClick={() => handlePresetSelect(preset)}>
                            {preset}%
                        </MenuItem>
                    ))}
                {(onFitWidth || onFitHeight || onFitScreen) && <Divider />}
                {onFitWidth && (
                    <MenuItem onClick={() => { onFitWidth(); handleCloseMenu(); }}>
                        Fit Width
                    </MenuItem>
                )}
                {onFitHeight && (
                    <MenuItem onClick={() => { onFitHeight(); handleCloseMenu(); }}>
                        Fit Height
                    </MenuItem>
                )}
                {onFitScreen && (
                    <MenuItem onClick={() => { onFitScreen(); handleCloseMenu(); }}>
                        Fit Screen
                    </MenuItem>
                )}
            </Menu>
        </div>
    );
}
