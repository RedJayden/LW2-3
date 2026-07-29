import { useState, useMemo, useEffect, useCallback } from 'react';
import { Typography, Button, Box, TextField, InputAdornment, Grid } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SaveIcon from '@mui/icons-material/Save';
import FlareIcon from '@mui/icons-material/Flare';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import CropIcon from '@mui/icons-material/Crop';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CropFreeIcon from '@mui/icons-material/CropFree';
import FloatingWindow from '../../components/common/FloatingWindow';
import { useCanvasStore } from '../../pages/Recipe/Canvas/useCanvasStore';
import { hwFacade } from '../../../services/HardwareFacade';
import { CAMERA_SPECS } from '../../pages/Recipe/Canvas/cameraConfig';
import useAppStore from '../../../store/appStore';

export default function LaserSetCenterDialog() {
    const {
        setShowLaserSetCenterDialog,
        laserClickPosition,
        setLaserClickPosition,
        setActiveTool,
        viewMode,
        magnification,
        setCalibrationROI,
        calibrationROI
    } = useCanvasStore();

    // Force Live Video (User Requirement: Always Live)
    // Even if we were in 'captured' state, opening this must switch to live.
    // And it must STAY live until user explicitly stops it (Context Menu).
    const cameraId = viewMode === 'scanner' ? 0 : 1;
    useEffect(() => {
        useAppStore.getState().setCameraStatus(cameraId, 'streaming');
    }, [cameraId]);

    // Determine Active Key
    const activeKey = useMemo(() => {
        if (viewMode === 'scanner') return 'scanner';
        if (viewMode === 'object') {
            return magnification === 50 ? 'object_x50' : 'object_x20';
        }
        return 'scanner';
    }, [viewMode, magnification]);

    const activeLabel = useMemo(() => {
        if (activeKey === 'scanner') return 'Scanner';
        if (activeKey === 'object_x20') return 'Object x20';
        if (activeKey === 'object_x50') return 'Object x50';
        return 'Unknown';
    }, [activeKey]);

    const activeColor = useMemo(() => {
        if (activeKey === 'scanner') return 'primary';
        if (activeKey === 'object_x50') return 'warning';
        return 'secondary';
    }, [activeKey]);

    const isObjectMode = viewMode === 'object';
    const cameraConfig = useAppStore.getState().cameraConfig;
    let W = 2448;
    let H = 2048;

    if (isObjectMode) {
        const objCam = cameraConfig?.cameras?.find((c: any) => c.name.toLowerCase().includes('object') || c.id === 1);
        if (objCam && objCam.resolution) {
            W = objCam.resolution.width;
            H = objCam.resolution.height;
        }
    } else {
        const scanCam = cameraConfig?.cameras?.find((c: any) => c.name.toLowerCase().includes('scanner') || c.id === 2);
        if (scanCam && scanCam.resolution) {
            W = scanCam.resolution.width;
            H = scanCam.resolution.height;
        }
    }

    const savedRecipe = useAppStore.getState().recipeCenter[activeKey as 'scanner' | 'object_x20' | 'object_x50'];

    // Backend State
    // Use string or number for input handling
    const [state, setState] = useState<{
        viewRatio: number | string;
        pixel: { x: number; y: number };
        motion: { x: number; y: number };
    }>({
        viewRatio: savedRecipe?.viewRatio ?? 100,
        pixel: { x: W / 2, y: H / 2 },
        motion: { x: 0, y: 0 }
    });

    // [NEW] Snapshot state to restore upon Cancel/Close
    const [initialSnapshot, setInitialSnapshot] = useState<{
        viewRatio: number;
        pixel: { x: number; y: number };
        motion: { x: number; y: number };
        isLoaded: boolean;
    }>({ viewRatio: 100, pixel: { x: W / 2, y: H / 2 }, motion: { x: 0, y: 0 }, isLoaded: false });

    // Load State from Backend & Frontend Store
    const refreshState = useCallback(async () => {
        try {
            // Get Backend motion state (may reset to 0,0 on reboot)
            const res: any = await hwFacade.calibGetState(activeKey);
            // Get Frontend Persistent State (Single Source of Truth)
            const savedRecipe = useAppStore.getState().recipeCenter[activeKey as 'scanner' | 'object_x20' | 'object_x50'];

            // If backend returns exactly 0,0, it means it's uncalibrated. 
            // In digital panning, the uncalibrated center is the physical center of the camera (W/2, H/2), NOT the top-left corner (0,0).
            let finalPixel = res?.pixel || { x: W / 2, y: H / 2 };
            if (finalPixel.x === 0 && finalPixel.y === 0) {
                finalPixel = { x: W / 2, y: H / 2 };
            }
            
            let finalRatio = res?.viewRatio ?? 100;
            const finalMotion = res?.motion || { x: 0, y: 0 };

            // Override with Frontend persistent state if exists
            if (savedRecipe && savedRecipe.pixelX !== undefined && savedRecipe.pixelY !== undefined) {
                finalPixel = { x: savedRecipe.pixelX, y: savedRecipe.pixelY };
                finalRatio = savedRecipe.viewRatio ?? 100;
            }

            const newState = {
                viewRatio: finalRatio,
                pixel: finalPixel,
                motion: finalMotion
            };
            
            setState(newState);
            
            if (!initialSnapshot.isLoaded) {
                setInitialSnapshot({ ...newState, isLoaded: true });
            }

            // Sync ROI
            setCalibrationROI({
                active: false,
                viewRatio: finalRatio,
                center: finalPixel
            });

            if (savedRecipe && savedRecipe.pixelX !== undefined && savedRecipe.pixelY !== undefined) {
                setCalibrationROI({
                    active: true,
                    viewRatio: finalRatio,
                    center: finalPixel
                });
            } else {
                // Default to centered box preview if no calibration exists
                setCalibrationROI({
                    active: false,
                    viewRatio: finalRatio,
                    center: { x: W / 2, y: H / 2 }
                });
            }
        } catch (e) {
            console.error("Failed to load calibration state", e);
        }
    }, [activeKey, setCalibrationROI, W, H]);

    useEffect(() => {
        setInitialSnapshot(prev => ({ ...prev, isLoaded: false }));
        refreshState();
    }, [activeKey, refreshState]);

    // [FIX] Sync ROI Box when viewRatio changes
    useEffect(() => {
        setCalibrationROI({
            viewRatio: Number(state.viewRatio) || 100,
        });
    }, [state.viewRatio, setCalibrationROI]);

    // -------------------------------------------------------------
    // Pick Logic
    // -------------------------------------------------------------
    useEffect(() => {
        if (laserClickPosition) {
            console.log('[LaserSetCenter] Raw Click:', laserClickPosition);

            // 1. Unified Calculation for Image Pixels
            // Canvas Pan/Zoom is handled by Fabric. `laserClickPosition` is in logical Stage Coordinates.
            const pxPerMm = useCanvasStore.getState().pxPerMm || { x: 1000, y: 1000 };
            const camScaleRaw = useCanvasStore.getState().calibrationScales[activeKey] || 1000;
            const camScale = typeof camScaleRaw === 'number' ? { x: camScaleRaw, y: camScaleRaw } : camScaleRaw;

            // Find Stage Center
            const pos = useAppStore.getState().positions;
            const recipeCenter = useAppStore.getState().recipeCenter;
            const currentOffset = recipeCenter[activeKey as 'scanner' | 'object_x20' | 'object_x50'] || { x: 0, y: 0 };
            const mx = currentOffset.x ?? 0;
            const my = currentOffset.y ?? 0;
            const pxX = (pos.X - mx) * pxPerMm.x;
            const pxY = -(pos.Y - my) * pxPerMm.y;

            // Offset from Stage Center
            const relX = laserClickPosition.x - pxX;
            const relY = laserClickPosition.y - pxY;

            const scaleX = pxPerMm.x / camScale.x;
            const scaleY = pxPerMm.y / camScale.y;

            // [FIX] Always base pixel calculation on the physical center of the camera.
            // Avoid double-applying the offset which causes the target to drift.
            const currentCenter = { x: W / 2, y: H / 2 };

            let pixelX = currentCenter.x + (relX / scaleX);
            let pixelY = currentCenter.y + (relY / scaleY);

            // Bounds Check
            pixelX = Math.max(0, Math.min(W, pixelX));
            pixelY = Math.max(0, Math.min(H, pixelY));

            console.log('[LaserSetCenter] Mapped to Image Pixel:', { pixelX, pixelY, currentCenter, relX, relY, scaleX, scaleY });

            // 3. Update State & Fetch Motion
            hwFacade.calibPickCenter(activeKey, { x: pixelX, y: pixelY }).then((res: any) => {
                if (res && res.pixel && res.motion) {
                    setState(prev => ({
                        ...prev,
                        pixel: res.pixel,
                        motion: res.motion
                    }));
                    // [NEW] Persist Picked Pixel for Visual Overlay (Red X)
                    useCanvasStore.getState().setPickedPixel(res.pixel);
                } else {
                    // Fallback
                    // setState(prev => ({ ...prev, pixel: { x: pixelX, y: pixelY } }));
                }
            });

            setLaserClickPosition(null);
            setActiveTool('select');
        }
    }, [laserClickPosition, activeKey, setLaserClickPosition, setActiveTool, calibrationROI, W, H, state.viewRatio]);

    const handleSetCenterClick = () => {
        console.log('[LaserSetCenter] Activating Pick Tool');
        setActiveTool('laserCenter');
        // Force focus?
    };

    const handleResetCenter = () => {
        // Reset to physical center
        const center = { x: W / 2, y: H / 2 };
        setState(prev => ({
            ...prev,
            pixel: center,
            motion: { x: 0, y: 0 }
        }));
        // Remove Red X overlay
        useCanvasStore.getState().setPickedPixel(null);
        // [FIX] Immediately un-pan for visual feedback
        setCalibrationROI({
            active: false,
            viewRatio: Number(state.viewRatio) || 100,
            center
        });
    };

    // -------------------------------------------------------------
    // Apply (Set ROI)
    // -------------------------------------------------------------
    const handleApply = async () => {
        const currentRatio = Number(state.viewRatio) || 100;
        const newCenter = state.pixel ? { ...state.pixel } : { x: W / 2, y: H / 2 };

        setCalibrationROI({
            active: true,
            viewRatio: currentRatio,
            center: newCenter,
            isApplied: true
        } as any);

        // 2. Call Backend Apply (Temporary)
        await hwFacade.calibApply(activeKey);
        
        // 3. Do NOT save to RecipeCenter.json yet.
        // The dialog remains open.
    };

    const handleOriginalROI = () => {
        // Disable ROI Crop
        setCalibrationROI({ active: false });
    };

    const handleSave = async () => {
        const currentRatio = Number(state.viewRatio) || 100;
        const newCenter = state.pixel ? { ...state.pixel } : { x: W / 2, y: H / 2 };

        // 1. Apply to UI
        setCalibrationROI({
            active: true,
            viewRatio: currentRatio,
            center: newCenter,
            isApplied: true // <--- Shifted!
        });

        // 2. Apply to backend permanently
        await hwFacade.calibApply(activeKey);
        await hwFacade.calibSave();

        // 3. Save to frontend recipe
        const currentRecipe = useAppStore.getState().recipeCenter[activeKey as 'scanner' | 'object_x20' | 'object_x50'] || {};
        useAppStore.getState().setRecipeCenter(activeKey as 'scanner' | 'object_x20' | 'object_x50', {
            ...currentRecipe,
            x: state.motion.x,
            y: state.motion.y,
            pixelX: newCenter.x,
            pixelY: newCenter.y,
            viewRatio: currentRatio
        });
        await useAppStore.getState().saveRecipeCenterData();

        // 4. Update snapshot so close doesn't revert
        setInitialSnapshot({
            viewRatio: currentRatio,
            pixel: newCenter,
            motion: state.motion,
            isLoaded: true
        });

        // 5. Close dialog
        setShowLaserSetCenterDialog(false);
        // Toast shows in Subtitle bar? or alert
        // alert("Calibration Saved.");
    };

    const handleClose = async () => {
        if (initialSnapshot.isLoaded) {
            // Revert UI State
            const savedRecipe = useAppStore.getState().recipeCenter[activeKey as 'scanner' | 'object_x20' | 'object_x50'];
            const wasActive = savedRecipe && savedRecipe.pixelX !== undefined && savedRecipe.pixelY !== undefined;

            setCalibrationROI({
                active: !!wasActive,
                viewRatio: initialSnapshot.viewRatio,
                center: initialSnapshot.pixel,
                isApplied: true
            });

            // Revert hardware backend if it was modified by apply
            const isChanged = state.pixel.x !== initialSnapshot.pixel.x ||
                              state.pixel.y !== initialSnapshot.pixel.y ||
                              Number(state.viewRatio) !== initialSnapshot.viewRatio;
            if (isChanged) {
                try {
                    await hwFacade.calibPickCenter(activeKey, initialSnapshot.pixel);
                    await hwFacade.calibSetViewRatio(activeKey, initialSnapshot.viewRatio);
                    await hwFacade.calibApply(activeKey);
                    await hwFacade.calibSave();
                } catch (e) {
                    console.error("Failed to revert backend calibration state on close", e);
                }
            }
        }
        useCanvasStore.getState().setPickedPixel(null);
        setShowLaserSetCenterDialog(false);
    };

    // Input Handling
    const handleViewPercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '') {
            setState(prev => ({ ...prev, viewRatio: '' }));
            return;
        }

        // Allow numeric typing. Clamping happens on Blur.
        const num = parseFloat(val);
        if (!isNaN(num)) {
            setState(prev => ({ ...prev, viewRatio: val }));
        }
    };

    const handleViewPercentBlur = () => {
        let val = Number(state.viewRatio);
        if (isNaN(val) || val < 50) val = 50;
        if (val > 100) val = 100;

        setState(prev => ({ ...prev, viewRatio: val }));
        hwFacade.calibSetViewRatio(activeKey, val);
    };

    const renderContent = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    bgcolor: (theme) => alpha(theme.palette[activeColor].main, 0.1),
                    color: (theme) => theme.palette[activeColor].main,
                    py: 1,
                    px: 2,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: (theme) => alpha(theme.palette[activeColor].main, 0.2)
                }}
            >
                <FlareIcon fontSize="small" color="inherit" />
                <Typography variant="subtitle2" fontWeight="bold">
                    Target: {activeLabel}
                </Typography>
            </Box>

            {/* View Area Input */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>View Area:</Typography>
                <TextField
                    size="small"
                    type="number" // Restore spinners
                    value={state.viewRatio}
                    onChange={handleViewPercentChange}
                    onBlur={handleViewPercentBlur}
                    InputProps={{
                        endAdornment: <InputAdornment position="end">%</InputAdornment>,
                        inputProps: { min: 50, max: 100, step: 1 } // Step 1
                    }}
                    sx={{ width: 120 }}
                />
            </Box>

            {/* Buttons Grid */}
            <Grid container spacing={1}>
                {/* Row 1: ROI Controls */}
                <Grid item xs={6}>
                    <Button
                        variant="outlined"
                        startIcon={<CropFreeIcon fontSize="small" />}
                        onClick={handleOriginalROI}
                        fullWidth
                        size="small"
                        sx={{ whiteSpace: 'nowrap' }}
                    >
                        Original
                    </Button>
                </Grid>
                <Grid item xs={6}>
                    <Button
                        variant="outlined"
                        startIcon={<CropIcon fontSize="small" />}
                        onClick={() => {
                            // User Request: Preview crop around current state.pixel without shifting image to center
                            setCalibrationROI({
                                active: true,
                                viewRatio: Number(state.viewRatio) || 100,
                                center: state.pixel,
                                isApplied: false
                            });
                        }}
                        fullWidth
                        size="small"
                        sx={{ whiteSpace: 'nowrap' }}
                    >
                        Set ROI
                    </Button>
                </Grid>

                {/* Row 2: Center Controls */}
                <Grid item xs={6}>
                    <Button
                        variant="outlined"
                        color="secondary"
                        startIcon={<RestartAltIcon fontSize="small" />}
                        onClick={handleResetCenter}
                        fullWidth
                        size="small"
                        sx={{ whiteSpace: 'nowrap' }}
                    >
                        Reset
                    </Button>
                </Grid>
                <Grid item xs={6}>
                    <Button
                        variant="outlined"
                        color="warning"
                        startIcon={<CenterFocusStrongIcon fontSize="small" />}
                        onClick={handleSetCenterClick}
                        fullWidth
                        size="small"
                        sx={{ whiteSpace: 'nowrap' }}
                    >
                        Set Center
                    </Button>
                </Grid>
            </Grid>

            <Box sx={{ bgcolor: 'rgba(0,0,0,0.3)', p: 1, borderRadius: 1 }}>
                <Typography variant="caption" sx={{ display: 'block', mb: 0.5, color: '#aaa' }}>Captured Position:</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <Box>
                        <Typography variant="caption" sx={{ color: '#888' }}>Pixel X</Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {state.pixel?.x?.toFixed(4) ?? '--'}
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="caption" sx={{ color: '#888' }}>Pixel Y</Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {state.pixel?.y?.toFixed(4) ?? '--'}
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="caption" sx={{ color: '#888' }}>Motion X</Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#ffa726' }}>
                            {state.motion?.x?.toFixed(4) ?? '--'}
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="caption" sx={{ color: '#888' }}>Motion Y</Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#ffa726' }}>
                            {state.motion?.y?.toFixed(4) ?? '--'}
                        </Typography>
                    </Box>
                </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={handleApply}
                    fullWidth
                    size="medium"
                >
                    Apply
                </Button>
                <Button
                    variant="contained"
                    color="primary"
                    startIcon={<SaveIcon />}
                    onClick={handleSave}
                    fullWidth
                    size="medium"
                >
                    Save
                </Button>
            </Box>
        </Box>
    );

    return (
        <FloatingWindow
            title="Laser Set Center"
            icon={<FlareIcon fontSize="small" color="warning" />}
            onClose={handleClose}
            width={340}
        >
            <Box sx={{ p: 2 }}>
                {renderContent()}
            </Box>
        </FloatingWindow>
    );
}
