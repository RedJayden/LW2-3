import React, { useRef, useState, useEffect } from 'react';
import { IconButton, Tooltip, Divider, Box, Typography, Button, Menu, MenuItem, ListItemIcon, ListItemText, Dialog, DialogTitle, DialogContent, DialogActions, TextField, SvgIcon, FormControlLabel, Checkbox, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { NavStyles } from "../../../styles/NavigationStyles";
import { Theme, useTheme } from "@mui/material/styles";
import { NavIcons, getMeasureIcon } from "../../../icons/NavIcons";
import { NavButton } from "../../../shell/NavButton"; // [NEW] Shared component


import { useCanvasStore, ToolType, MeasureMode } from '../Canvas/useCanvasStore';
import useAppStore from '../../../../store/appStore';
// [P2] Strategy Registry: 포맷 선택 기반 통합 Export
import { exportCanvas, ExportFormat, EXT_BY_FORMAT } from '../Canvas/canvasImportExport';
// [P1] Strategy + Dispatcher: 확장자 판별 기반 통합 Import
import { importFile, SUPPORTED_IMPORT_ACCEPT } from '../Canvas/utils/importFile';

interface ToolbarProps {
    open?: boolean;
}


export default function Toolbar({ open = false }: ToolbarProps) {
    const theme = useTheme(); // [NEW]
    const { activeTool, setActiveTool, canvas, setMeasureMode, measureMode, showLayerList, setShowLayerList, hideOverlays, isProcessingLocal } = useCanvasStore();
    const showToast = useAppStore((s) => s.showToast);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Shape Menu State
    const [shapeMenuAnchor, setShapeMenuAnchor] = useState<null | HTMLElement>(null);
    const [lastShapeTool, setLastShapeTool] = useState<ToolType>('rect');

    // Measure Menu State
    const [measureMenuAnchor, setMeasureMenuAnchor] = useState<null | HTMLElement>(null);

    // Export Dialog State
    const [exportDialogOpen, setExportDialogOpen] = useState(false);
    const [exportFilename, setExportFilename] = useState('recipe');
    const [exportFormat, setExportFormat] = useState<ExportFormat>('svg');

    useEffect(() => {
        if (['rect', 'circle', 'arc', 'triangle', 'line'].includes(activeTool)) {
            setLastShapeTool(activeTool);
        }
    }, [activeTool]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            if (e.key.toLowerCase() === 'i') {
                handleImportClick();
            }
            if (e.shiftKey && e.key.toLowerCase() === 't') {
                handleShapeSelect('triangle');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    /**
     * @brief [P1] 통합 파일 Import 핸들러 (Strategy + Dispatcher)
     * 확장자 판별은 importFile 디스패처에 위임하고, 결과를 Toast로 피드백한다.
     */
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (e.target) e.target.value = '';
        if (!file || !canvas) return;

        try {
            const result = await importFile(canvas, file);
            if (result.format === 'image') {
                setActiveTool('select');
            }
            const countText = result.count > 0 ? `, ${result.count} object${result.count > 1 ? 's' : ''}` : '';
            showToast(`Imported ${file.name} (${result.format.toUpperCase()}${countText})`, 'success');
        } catch (err) {
            console.error('[Import File] Failed:', err);
            showToast(err instanceof Error ? err.message : `Failed to import ${file.name}`, 'error');
        }
    };

    /**
     * @brief [P2] 선택 포맷으로 Export 실행 + 결과 Toast 피드백 (Strategy Registry)
     * 파일명·형식 확정 후 네이티브 저장 다이얼로그(위치/덮어쓰기)는 OS가 담당한다.
     */
    const runExport = async (filename: string, format: ExportFormat) => {
        if (!canvas) return;
        const base = filename.replace(/\.(svg|dxf|png|jpe?g|webp|json)$/i, '').trim() || 'recipe';
        const finalName = `${base}.${EXT_BY_FORMAT[format]}`;
        const result = await exportCanvas(canvas, format, finalName);
        if (result.ok) {
            showToast(`Exported ${finalName}${result.message ? ` — ${result.message}` : ''}`, 'success');
        } else if (result.message !== 'Canceled') {
            showToast(result.message || 'Export failed', 'error');
        }
    };

    /** 포맷 선택이 필요하므로 항상 앱 다이얼로그를 먼저 연다 (이중 OS 다이얼로그 방지) */
    const handleExportClick = () => {
        setExportDialogOpen(true);
    };

    const handleConfirmExport = async () => {
        if (!canvas) return;
        setExportDialogOpen(false);
        await runExport(exportFilename, exportFormat);
    };

    /** @brief 파일명에 확장자를 직접 입력하면 해당 포맷을 자동 선택한다 */
    const handleExportFilenameChange = (value: string) => {
        setExportFilename(value);
        const m = value.match(/\.(\w+)$/);
        if (m) {
            const extMap: Record<string, ExportFormat> = {
                svg: 'svg', dxf: 'dxf', png: 'png', jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp', json: 'json',
            };
            const fmt = extMap[m[1].toLowerCase()];
            if (fmt) setExportFormat(fmt);
        }
    };

    const handleShapeMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
        setShapeMenuAnchor(event.currentTarget);
    };

    const handleShapeMenuClose = () => {
        setShapeMenuAnchor(null);
    };

    const handleShapeSelect = (tool: ToolType) => {
        setActiveTool(tool);
        setLastShapeTool(tool);
        handleShapeMenuClose();
    };

    const getShapeIcon = (tool: ToolType) => {
        switch (tool) {
            case 'rect': return <NavIcons.Rect />;
            case 'circle': return <NavIcons.Circle />;
            case 'arc': return <NavIcons.Arc />;
            case 'triangle': return <NavIcons.Triangle />;
            case 'line': return <NavIcons.Line />;
            default: return <NavIcons.Rect />;
        }
    };

    const getShapeLabel = (tool: ToolType) => {
        switch (tool) {
            case 'rect': return 'Rectangle (R)';
            case 'circle': return 'Circle (C)';
            case 'arc': return 'Arc';
            case 'triangle': return 'Triangle (Shift+T)';
            case 'line': return 'Line (L)';
            default: return 'Shape';
        }
    };

    const handleMeasureMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
        setMeasureMenuAnchor(event.currentTarget);
    };

    const handleMeasureMenuClose = () => {
        setMeasureMenuAnchor(null);
    };

    const handleMeasureSelect = (mode: MeasureMode) => {
        setActiveTool('measure');
        setMeasureMode(mode);
        handleMeasureMenuClose();
    };

    const getMeasureIcon = (mode: MeasureMode) => {
        switch (mode) {
            case 'distance': return <NavIcons.MeasureDistance />;
            case 'rect': return <NavIcons.MeasureRect />;
            case 'circle': return <NavIcons.MeasureCircle />;
            case 'width': return <NavIcons.MeasureWidth />;
            case 'height': return <NavIcons.MeasureHeight />;
            case 'angle': return <NavIcons.MeasureAngle />;
            case 'polyline': return <NavIcons.MeasurePolyline />;
            default: return <NavIcons.MeasureDistance />;
        }
    };

    const getMeasureLabel = (mode: MeasureMode) => {
        switch (mode) {
            case 'distance': return 'Distance (D)';
            case 'rect': return 'Rectangle (Shift+R)';
            case 'circle': return 'Circle Radius (Shift+C)';
            case 'width': return 'Width (W)';
            case 'height': return 'Height (E)';
            case 'angle': return 'Angle (A)';
            case 'polyline': return 'Polyline (Shift+P)';
            default: return 'Measure';
        }
    };

    const renderToolButton = (tool: any) => {
        // Shape Group
        if (tool.type === 'shape-group') {
            const isActive = ['rect', 'circle', 'arc', 'triangle', 'line'].includes(activeTool);
            return (
                <React.Fragment key="shape-group">
                    <NavButton
                        open={open}
                        active={isActive}
                        label={tool.label}
                        icon={tool.icon}
                        onClick={handleShapeMenuOpen}
                        disabled={hideOverlays || isProcessingLocal}
                        endIcon={<NavIcons.Dropdown />}
                        indicator={!open ? <NavIcons.Dropdown sx={{ position: 'absolute', bottom: 0, right: 0, fontSize: 10 }} /> : undefined}
                    />
                    <Menu
                        anchorEl={shapeMenuAnchor}
                        open={Boolean(shapeMenuAnchor)}
                        onClose={handleShapeMenuClose}
                        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
                        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
                    >
                        <MenuItem onClick={() => handleShapeSelect('dot')} selected={activeTool === 'dot'}>
                            <ListItemIcon><NavIcons.Dot fontSize="small" /></ListItemIcon>
                            <ListItemText><u>D</u>ot (D)</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => handleShapeSelect('line')} selected={activeTool === 'line'}>
                            <ListItemIcon><NavIcons.Line fontSize="small" /></ListItemIcon>
                            <ListItemText><u>L</u>ine (L)</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => handleShapeSelect('rect')} selected={activeTool === 'rect'}>
                            <ListItemIcon><NavIcons.Rect fontSize="small" /></ListItemIcon>
                            <ListItemText><u>R</u>ectangle (R)</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => handleShapeSelect('circle')} selected={activeTool === 'circle'}>
                            <ListItemIcon><NavIcons.Circle fontSize="small" /></ListItemIcon>
                            <ListItemText><u>C</u>ircle (C)</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => handleShapeSelect('arc')} selected={activeTool === 'arc'}>
                            <ListItemIcon><NavIcons.Arc fontSize="small" /></ListItemIcon>
                            <ListItemText><u>A</u>rc (A)</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => handleShapeSelect('triangle')} selected={activeTool === 'triangle'}>
                            <ListItemIcon><NavIcons.Triangle fontSize="small" /></ListItemIcon>
                            <ListItemText><u>T</u>riangle (T)</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => handleShapeSelect('polyline-shape')} selected={activeTool === 'polyline-shape'}>
                            <ListItemIcon><NavIcons.Polyline fontSize="small" /></ListItemIcon>
                            <ListItemText><u>P</u>olyline (P)</ListItemText>
                        </MenuItem>
                    </Menu>
                </React.Fragment>
            );
        }

        // Measure Group
        if (tool.type === 'measure-group') {
            const isActive = activeTool === 'measure';
            return (
                <React.Fragment key="measure-group">
                    <NavButton
                        open={open}
                        active={isActive}
                        label={tool.label}
                        icon={tool.icon}
                        onClick={handleMeasureMenuOpen}
                        disabled={hideOverlays || isProcessingLocal}
                        endIcon={<NavIcons.Dropdown />}
                        indicator={!open ? <NavIcons.Dropdown sx={{ position: 'absolute', bottom: 0, right: 0, fontSize: 10 }} /> : undefined}
                    />
                    <Menu
                        anchorEl={measureMenuAnchor}
                        open={Boolean(measureMenuAnchor)}
                        onClose={handleMeasureMenuClose}
                        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
                        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
                    >
                        <MenuItem onClick={() => {
                            if (canvas) {
                                const objects = canvas.getObjects();
                                objects.forEach(obj => {
                                    if ((obj as any).isMeasurement) {
                                        canvas.remove(obj);
                                    }
                                });
                                canvas.requestRenderAll();
                            }
                            handleMeasureMenuClose();
                        }}>
                            <ListItemIcon><NavIcons.Delete fontSize="small" sx={{ color: '#ff8800' }} /></ListItemIcon>
                            <ListItemText>Clear All Measurements</ListItemText>
                        </MenuItem>
                        <Divider />
                        <MenuItem onClick={() => handleMeasureSelect('distance')} selected={measureMode === 'distance'}>
                            <ListItemIcon><NavIcons.MeasureDistance fontSize="small" /></ListItemIcon>
                            <ListItemText><u>D</u>istance (Shift+D)</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => handleMeasureSelect('rect')} selected={measureMode === 'rect'}>
                            <ListItemIcon><NavIcons.MeasureRect fontSize="small" /></ListItemIcon>
                            <ListItemText><u>R</u>ectangle (Shift+R)</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => handleMeasureSelect('circle')} selected={measureMode === 'circle'}>
                            <ListItemIcon><NavIcons.MeasureCircle fontSize="small" /></ListItemIcon>
                            <ListItemText><u>C</u>ircle Radius (Shift+C)</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => handleMeasureSelect('width')} selected={measureMode === 'width'}>
                            <ListItemIcon><NavIcons.MeasureWidth fontSize="small" /></ListItemIcon>
                            <ListItemText><u>W</u>idth (Shift+W)</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => handleMeasureSelect('height')} selected={measureMode === 'height'}>
                            <ListItemIcon><NavIcons.MeasureHeight fontSize="small" /></ListItemIcon>
                            <ListItemText><u>H</u>eight (Shift+H)</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => handleMeasureSelect('angle')} selected={measureMode === 'angle'}>
                            <ListItemIcon><NavIcons.MeasureAngle fontSize="small" /></ListItemIcon>
                            <ListItemText><u>A</u>ngle (Shift+A)</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => handleMeasureSelect('polyline')} selected={measureMode === 'polyline'}>
                            <ListItemIcon><NavIcons.MeasurePolyline fontSize="small" /></ListItemIcon>
                            <ListItemText><u>P</u>olyline (Shift+P)</ListItemText>
                        </MenuItem>
                    </Menu>
                </React.Fragment>
            );
        }

        // Simple Tool
        const isActive = activeTool === tool.type;
        const handleClick = () => {
            if (tool.type !== 'action') {
                setActiveTool(tool.type as ToolType);
            }
        };

        return (
            <NavButton
                key={tool.label}
                open={open}
                active={isActive}
                label={tool.label}
                icon={tool.icon}
                onClick={handleClick}
                disabled={hideOverlays || isProcessingLocal}
            />
        );
    };

    const renderActionButton = (label: string, icon: React.ReactNode, onClick: () => void) => {
        return (
            <NavButton
                key={label}
                open={open}
                active={false}
                label={label}
                icon={icon}
                onClick={onClick}
                disabled={hideOverlays || isProcessingLocal}
            />
        );
    };

    const tools: { type: ToolType | 'action' | 'shape-group' | 'measure-group'; icon: React.ReactNode; label: string; action?: () => void }[] = [
        { type: 'select', icon: <NavIcons.Select />, label: 'Select (S)' },
        { type: 'pan', icon: <NavIcons.Pan />, label: 'Pan (H)' },
        { type: 'shape-group', icon: <NavIcons.Draw />, label: 'Draw Tools' },
        { type: 'text', icon: <NavIcons.Text />, label: 'Text (Shift+T)' },
        { type: 'measure-group', icon: <NavIcons.MeasureDistance />, label: 'Measure Tools' },
    ];

    return (
        <>
            <Box
                sx={{
                    width: '100%',
                    height: '100%',
                    bgcolor: 'background.paper',
                    borderRight: open ? 0 : 1, // Remove border if open as LeftNav handles it, or keep it? LeftNav has border.
                    borderColor: 'divider',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: open ? 'stretch' : 'center',
                    py: 1,
                    gap: 0.5,
                    // boxShadow: 1, // Remove shadow to blend with LeftNav
                    zIndex: 10,
                }}
            >
                {/* Layer List Toggle */}
                <NavButton
                    open={open}
                    active={showLayerList}
                    label="Layers List (Shift+L)"
                    icon={<NavIcons.Layers />}
                    onClick={() => setShowLayerList(!showLayerList)}
                    disabled={hideOverlays || isProcessingLocal}
                />
                <Divider flexItem sx={{ my: 0.5, width: '80%' }} />



                {tools.map(renderToolButton)}
                <Divider flexItem sx={{ my: 1 }} />
                {/* [P1] 통합 Import/Export: 형식 판별은 importFile 디스패처가 담당 */}
                {renderActionButton("Import File (I)", <NavIcons.Load />, handleImportClick)}
                {renderActionButton("Export File", <NavIcons.Save />, handleExportClick)}

                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept={SUPPORTED_IMPORT_ACCEPT}
                    onChange={handleFileChange}
                />

            </Box >

            {/* [P2] Export Dialog: 포맷 선택 + 파일명 (확장자 입력 시 포맷 자동 선택) */}
            <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Export File</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <TextField
                            autoFocus
                            label="Filename"
                            type="text"
                            fullWidth
                            variant="standard"
                            value={exportFilename}
                            onChange={(e) => handleExportFilenameChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleConfirmExport();
                                }
                            }}
                            helperText={`Saved as ${exportFilename.replace(/\.(svg|dxf|png|jpe?g|webp|json)$/i, '') || 'recipe'}.${EXT_BY_FORMAT[exportFormat]}`}
                        />
                        <Box>
                            <Typography variant="caption" color="text.secondary">Format</Typography>
                            <ToggleButtonGroup
                                exclusive
                                size="small"
                                value={exportFormat}
                                onChange={(_, v) => { if (v) setExportFormat(v as ExportFormat); }}
                                sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap' }}
                            >
                                <ToggleButton value="svg">SVG</ToggleButton>
                                <ToggleButton value="dxf">DXF</ToggleButton>
                                <ToggleButton value="png">PNG</ToggleButton>
                                <ToggleButton value="jpeg">JPG</ToggleButton>
                                <ToggleButton value="webp">WebP</ToggleButton>
                                <ToggleButton value="json">JSON</ToggleButton>
                            </ToggleButtonGroup>
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setExportDialogOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleConfirmExport}>Export</Button>
                </DialogActions>
            </Dialog >
        </>
    );
}
