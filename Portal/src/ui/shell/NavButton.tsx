import React from 'react';
import { Button, IconButton, Tooltip, Box, Typography, SxProps, Theme, useTheme } from '@mui/material';
import { NavStyles } from '../styles/NavigationStyles';

interface NavButtonProps {
    open: boolean;
    active: boolean;
    label: string;
    icon: React.ReactNode;
    onClick: (event: React.MouseEvent<HTMLElement>) => void;
    endIcon?: React.ReactNode;
    width?: string | number;
    tooltipPlacement?: 'right' | 'left' | 'top' | 'bottom';
    indicator?: React.ReactNode;
    sx?: SxProps<Theme>;
    disabled?: boolean;
}

export const NavButton: React.FC<NavButtonProps> = ({
    open,
    active,
    label,
    icon,
    onClick,
    endIcon,
    indicator,
    width = '100%',
    tooltipPlacement = 'right',
    sx = {},
    disabled = false
}) => {
    const theme = useTheme();

    // Expanded State
    if (open) {
        return (
            <Button
                fullWidth
                onClick={onClick}
                startIcon={icon}
                endIcon={endIcon}
                disabled={disabled}
                sx={{
                    ...(NavStyles.fullButton(theme, active) as any),
                    ...(disabled ? { opacity: 0.5, pointerEvents: 'none', filter: 'grayscale(1)' } : {}),
                    ...sx
                }}
            >
                <Typography variant="body2" sx={{ flex: 1, textAlign: 'left' }}>
                    {label}
                </Typography>
            </Button>
        );
    }

    // Collapsed State
    return (
        <Tooltip title={disabled ? "" : label} placement={tooltipPlacement} arrow>
            <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <IconButton
                    onClick={onClick}
                    disabled={disabled}
                    sx={{
                        ...(NavStyles.iconButton(theme, active) as any),
                        ...(disabled ? { opacity: 0.5, pointerEvents: 'none', filter: 'grayscale(1)' } : {}),
                        ...sx
                    }}
                >
                    {icon}
                    {indicator && (
                        <Box sx={{ position: 'absolute', bottom: 0, right: 0, pointerEvents: 'none', display: 'flex' }}>
                            {indicator}
                        </Box>
                    )}
                </IconButton>
            </Box>
        </Tooltip>
    );
};
