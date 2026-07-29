import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Box, Paper, Typography, IconButton, Stack, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import RemoveIcon from '@mui/icons-material/Remove';
import TimelineIcon from '@mui/icons-material/Timeline';
import { RIGHT_PANEL_WIDTH, RIGHT_PANEL_COLLAPSED } from "../../shell/RightPanel";
import useAppStore from '../../../store/appStore';

interface FloatingWindowProps {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
    icon?: React.ReactNode;
    width?: number;
    height?: number;
}

export default function FloatingWindow({ title, children, onClose, icon, width = 340, height = 500 }: FloatingWindowProps) {
    const theme = useTheme();
    const rightPanelOpen = useAppStore(s => s.rightPanelOpen);

    // Position State
    const [position, setPosition] = useState<{ x: number, y: number } | null>(null);
    const [isMinimized, setIsMinimized] = useState(false);

    // Drag Refs
    const draggingRef = useRef<{ isDragging: boolean, startX: number, startY: number, initialX: number, initialY: number }>({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });
    const paperRef = useRef<HTMLDivElement>(null);
    const prevRightPanelOpen = useRef(rightPanelOpen);

    // Initial Position (Top-Right of Container)
    useEffect(() => {
        if (!paperRef.current) return;
        if (position === null) {
            const containerW = window.innerWidth;
            const w = paperRef.current.offsetWidth || width;
            const targetX = Math.max(0, containerW - w - 360 - 20); // Force 360px for Right Panel
            
            console.log('[FloatingWindow] Init pos:', { containerW, w, targetX });
            setPosition({
                x: targetX,
                y: 80 // Below top edit panel
            });
        }
    }, [position, width]);

    // Responsive Position Adjustment (Right Panel Toggle)
    useEffect(() => {
        if (position === null) return;

        if (prevRightPanelOpen.current !== rightPanelOpen) {
            const delta = RIGHT_PANEL_WIDTH - RIGHT_PANEL_COLLAPSED;
            if (rightPanelOpen === false) {
                // Panel Closed -> Container Wider -> Move Right
                setPosition(p => p ? { ...p, x: p.x + delta } : null);
            } else {
                // Panel Opened -> Container Narrower -> Move Left
                setPosition(p => p ? { ...p, x: p.x - delta } : null);
            }
            prevRightPanelOpen.current = rightPanelOpen;
        }
    }, [rightPanelOpen, position]);

    // Window Resize Handler
    useEffect(() => {
        const handleResize = () => {
            setPosition((prev) => {
                if (!prev || !paperRef.current) return prev;
                const parent = paperRef.current.offsetParent as HTMLElement || document.body;
                const containerW = parent.clientWidth || window.innerWidth;
                const containerH = parent.clientHeight || window.innerHeight;
                const w = paperRef.current.offsetWidth || width;
                const h = paperRef.current.offsetHeight || height;

                let { x, y } = prev;
                let adjusted = false;

                if (x + w > containerW) { x = Math.max(0, containerW - w); adjusted = true; }
                if (y + h > containerH) { y = Math.max(0, containerH - h); adjusted = true; }
                if (x < 0) { x = 0; adjusted = true; }
                if (y < 0) { y = 0; adjusted = true; }

                return adjusted ? { x, y } : prev;
            });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [width, height]);

    // Drag Handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!paperRef.current) return;
        draggingRef.current = {
            isDragging: true,
            startX: e.clientX,
            startY: e.clientY,
            initialX: position?.x || 0,
            initialY: position?.y || 0
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!draggingRef.current.isDragging) return;
        const dx = e.clientX - draggingRef.current.startX;
        const dy = e.clientY - draggingRef.current.startY;
        setPosition({
            x: draggingRef.current.initialX + dx,
            y: draggingRef.current.initialY + dy
        });
    };

    const handleMouseUp = () => {
        draggingRef.current.isDragging = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    const currentStyle = position ? { top: position.y, left: position.x } : { opacity: 0 };

    return createPortal(
        <Paper
            ref={paperRef}
            elevation={8}
            sx={{
                position: 'fixed',
                width: width,
                maxHeight: isMinimized ? 'auto' : 'calc(100% - 40px)',
                ...currentStyle,
                zIndex: 1300,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: 2,
                bgcolor: alpha(theme.palette.background.paper, 0.85),
                backdropFilter: 'blur(12px)',
                border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                transition: draggingRef.current.isDragging ? 'none' : 'opacity 0.2s ease, left 0.3s ease',
            }}
        >
            {/* Header */}
            <Box
                onMouseDown={handleMouseDown}
                sx={{
                    px: 2,
                    height: 48,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    cursor: 'grab',
                    userSelect: 'none',
                    '&:active': { cursor: 'grabbing' }
                }}
            >
                <Stack direction="row" spacing={1} alignItems="center">
                    {icon || <TimelineIcon fontSize="small" color="primary" />}
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                        {title}
                    </Typography>
                </Stack>
                <Box>
                    <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
                        sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary', bgcolor: 'action.hover' }, mr: 0.5 }}
                    >
                        <RemoveIcon sx={{ transform: isMinimized ? 'none' : 'translateY(4px)' }} fontSize="small" />
                    </IconButton>
                    <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        sx={{ color: 'text.secondary', '&:hover': { color: 'error.main', bgcolor: 'action.hover' } }}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Box>
            </Box>

            {!isMinimized && (
                <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                    {children}
                </Box>
            )}
        </Paper>,
        document.body
    );
}
