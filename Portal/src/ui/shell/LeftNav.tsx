/**
 * @file LeftNav.tsx
 * @brief Defines the left navigation drawer with Accordion-style menu.
 */
import React, { useState, useEffect } from "react";
import { CSSObject, Theme, styled, useTheme } from "@mui/material/styles";
import MuiDrawer from "@mui/material/Drawer";
import { NavStyles } from "../styles/NavigationStyles"; // 
import {
    Box,
    CssBaseline,
    Divider,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Tooltip,
    Collapse,
    Menu,
    MenuItem,
    SvgIcon,
    Button, // Added Button
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import MenuIcon from "@mui/icons-material/Menu";
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'; // 
import { NavIcons, getMeasureIcon } from "../icons/NavIcons"; // 
import { NavButton } from "./NavButton"; // Shared component
// Icons replaced by NavIcons


import { useCanvasStore } from "../pages/Recipe/Canvas/useCanvasStore";
import { hwFacade } from "../../services/HardwareFacade";
import useAppStore, { selectors, CameraId } from "../../store/appStore";
import Toolbar from "../pages/Recipe/Toolbar/Toolbar";
import { uiText } from "../locale/strings";
import * as fabric from 'fabric'; // Import Fabric for Save Image composition
import { camFrameUrl } from "../../shared/endpoints"; // Import endpoint for camera frame

import { normalizeToStandard, denormalizeFromStandard } from "../pages/Recipe/Canvas/utils/canvasNormalization";
import { getLensFrameShiftMm, lensKeyFromView } from "../pages/Recipe/Canvas/utils/sceneCoords";

export type LeftNavVariant = "default" | "recipe" | "recipe-canvas" | "parameter" | "calibration";

export type LeftNavProps = {
    variant: LeftNavVariant;
    topOffset: number;
    open: boolean;
    onToggle: () => void;
};

export const LEFT_NAV_WIDTH = 220; // Slightly wider for accordion
export const LEFT_NAV_COLLAPSED = 64;

// Styles
const paperStyles = (theme: Theme): CSSObject => ({
    backgroundColor: theme.palette.background.paper,
    borderRight: `1px solid ${theme.palette.divider}`,
    color: theme.palette.text.primary,
    borderRadius: 0,
});

const opened = (theme: Theme): CSSObject => ({
    width: LEFT_NAV_WIDTH,
    transition: theme.transitions.create("width", {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.enteringScreen,
    }),
    overflowX: "hidden",
});
const closed = (theme: Theme): CSSObject => ({
    width: LEFT_NAV_COLLAPSED,
    transition: theme.transitions.create("width", {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
    }),
    overflowX: "hidden",
});

const Drawer = styled(MuiDrawer, {
    shouldForwardProp: (prop) => prop !== "open" && prop !== "offset",
})<{ open?: boolean; offset: number }>(({ theme, open, offset }) => {
    const paperCommon: CSSObject = {
        ...paperStyles(theme),
        top: offset,
        height: `calc(100vh - ${offset}px - 28px)`,
    };
    return {
        width: LEFT_NAV_WIDTH,
        flexShrink: 0,
        whiteSpace: "nowrap",
        boxSizing: "border-box",
        top: offset,
        height: `calc(100vh - ${offset}px - 28px)`,
        ...(open
            ? {
                ...opened(theme),
                "& .MuiDrawer-paper": { ...opened(theme), ...paperCommon },
            }
            : {
                ...closed(theme),
                "& .MuiDrawer-paper": { ...closed(theme), ...paperCommon },
            }),
    };
});

// Types for Menu
interface MenuItemNode {
    key: string;
    label?: string; // Made optional for divider
    icon?: React.ReactNode; // Made optional for divider
    children?: MenuItemNode[];
    action?: () => void;
    divider?: boolean; // New property
}

export default function LeftNav({
    variant,
    topOffset,
    open,
    onToggle,
}: LeftNavProps) {
    // ... (existing code, ensure to keep it) ...
    // Note: I cannot see the entire file content effectively for a single replace if I need to touch multiple far-apart sections unless I use multi_replace.
    // However, the interface definition and renderMenuItem are somewhat separated.
    // Let's use multi_replace to be safe and precise.

    const theme = useTheme();
    const features = useAppStore(s => s.features);
    const hardware = useAppStore(s => s.hardware);
    const leftNavStrings = uiText.shell.leftNav;
    // Project Save/Load Logic
    const projectInputRef = React.useRef<HTMLInputElement>(null);

    const handleSaveProject = async () => {
        const { canvas, pxPerMm } = useCanvasStore.getState();
        if (!canvas) return;

        // 1. Get Canvas Data
        // Use toObject to get the raw object representation first
        // [FIX] 'customData'를 포함해야 매트릭스 셀 Z 오프셋, 색상 프리셋 연결 상태(colorPresetLinked),
        // Use Default Parameters 강제 재색상화 스냅샷(originalColor/forcedByDefaultParams) 등이
        // 저장/로드 후에도 유지된다. 기존에는 이 목록에 빠져 있어 조용히 유실되고 있었다.
        let json = canvas.toObject(['name', 'id', 'data', 'customData', 'selectable', 'evented', 'lockMovementX', 'lockMovementY', 'lockRotation', 'lockScalingX', 'lockScalingY', 'isPaper', 'isGridLine', 'isGuide', 'strokeUniform', 'isHairline', 'isMeasurement', 'fillEnabled', 'strokeEnabled', 'fillOpacity', 'fillSettings', 'markPointTime', 'excludeFromExport', 'startAngle', 'endAngle', 'radius', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points']);

        // 2. Filter out System Objects (Paper, Grid, etc.)
        if (json.objects) {
            json.objects = json.objects.filter((obj: any) => !obj.isPaper && !obj.isGridLine && !obj.isGuide && !obj.isTemp && !obj.isCrosshair && !obj.isMeasurement);
        }

        // 3. Normalize Coordinates to Standard 1000 px/mm Space (Scanner 렌즈 프레임 기준)
        // [NEW] 현재 렌즈 프레임 변위를 제거하여 레시피 파일이 저장 당시 모드와 무관하게
        // 항상 Scanner 프레임으로 기록되도록 합니다 (sceneCoords.ts 참조).
        const { viewMode, magnification } = useCanvasStore.getState();
        const saveFrameShift = getLensFrameShiftMm(lensKeyFromView(viewMode, magnification));
        json = normalizeToStandard(json, pxPerMm, saveFrameShift);

        // [NEW] 캔버스 도형 외에 스토어에만 존재하는 가공 설정도 레시피 파일에 함께 저장한다
        // (scannerSettings/gcodeSettings/layerNames/색상별 프리셋). 기존에는 이 값들이
        // 레시피 저장에 전혀 포함되지 않아 프로젝트를 다시 열면 유실되고 있었다.
        const { scannerSettings, gcodeSettings, layerNames, colorPresets } = useCanvasStore.getState();
        (json as any).settings = { scannerSettings, gcodeSettings, layerNames, colorPresets };

        const jsonString = JSON.stringify(json, null, 2);

        // 4. Save Dialog - Use Backend Command
        try {
            const result = await hwFacade.dialogSaveRecipeFile(jsonString, 'project_recipe.lng');
            if (result && result.ok) {
                useAppStore.getState().showToast("Project Saved Successfully", "success");
            } else {
                console.warn("Save cancelled or failed", result?.message);
                if (result?.message !== "Canceled") {
                    useAppStore.getState().showToast("Project Save Failed", "error");
                }
            }
        } catch (err) {
            console.error("Save error", err);
            useAppStore.getState().showToast("Project Save Failed", "error");
        }
    };

    const handleLoadProjectClick = () => {
        projectInputRef.current?.click();
    };

    const handleLoadProjectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const { canvas } = useCanvasStore.getState();
        if (!file || !canvas) return;
        const reader = new FileReader();
        reader.onload = (f) => {
            const jsonStr = f.target?.result as string;
            try {
                const rawJson = JSON.parse(jsonStr);
                const { pxPerMm, viewMode, magnification } = useCanvasStore.getState();

                // Denormalize Coordinates from Standard 1000 px/mm to current pxPerMm
                // [NEW] Scanner 프레임으로 저장된 레시피를 현재 렌즈 프레임 변위만큼 이동시켜 로드
                const loadFrameShift = getLensFrameShiftMm(lensKeyFromView(viewMode, magnification));
                const denormalizedJson = denormalizeFromStandard(rawJson, pxPerMm, loadFrameShift);

                // [NEW] 레시피 파일에 함께 저장된 가공 설정(scannerSettings/gcodeSettings/layerNames/
                // 색상별 프리셋)을 복원한다. 구버전 레시피 파일에는 settings가 없을 수 있으므로 optional.
                const savedSettings = (rawJson as any).settings;
                if (savedSettings) {
                    // [FIX] colorPresets는 scanner/object_x20/object_x50 스코프별로 분리 저장된다.
                    // 스코프 분리 이전(구버전)에 저장된 레시피는 최상위 키가 색상 hex였으므로,
                    // scanner/object_x20/object_x50 중 하나도 아니면 구버전 평면 포맷으로 간주해
                    // scanner 스코프로 이관한다(색이 유실되지 않도록).
                    const rawPresets = savedSettings.colorPresets || {};
                    const scopeKeys = ['scanner', 'object_x20', 'object_x50'];
                    const isScopedFormat = Object.keys(rawPresets).every((k) => scopeKeys.includes(k));
                    const migratedColorPresets = isScopedFormat
                        ? { scanner: {}, object_x20: {}, object_x50: {}, ...rawPresets }
                        : { scanner: rawPresets, object_x20: {}, object_x50: {} };

                    useCanvasStore.setState((state) => ({
                        scannerSettings: { ...state.scannerSettings, ...(savedSettings.scannerSettings || {}) },
                        gcodeSettings: { ...state.gcodeSettings, ...(savedSettings.gcodeSettings || {}) },
                        layerNames: savedSettings.layerNames || {},
                        colorPresets: migratedColorPresets,
                    }));
                }

                // Load and then Trigger Restoration
                // Use Promise syntax for Fabric v6 reliability
                canvas.loadFromJSON(denormalizedJson).then(() => {
                    canvas.requestRenderAll();
                    canvas.discardActiveObject();

                    // Trigger Event to Restore Grid/Paper in RecipeCanvas
                    canvas.fire('project:loaded');
                    useAppStore.getState().showToast("Project Loaded Successfully", "success");
                }).catch(err => {
                    console.error("Project load error", err);
                    useAppStore.getState().showToast("Project Load Failed", "error");
                });
            } catch (err) {
                console.error("JSON parse or denormalize error", err);
                useAppStore.getState().showToast("Invalid project file format", "error");
            }
        };
        reader.readAsText(file);
        if (e.target) e.target.value = '';
    };

    const fileInputRef = React.useRef<HTMLInputElement>(null); // For Load Image

    // ... Handler for Load Image
    const handleLoadImageClick = () => {
        fileInputRef.current?.click();
    };

    const handleLoadImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const canvas = useCanvasStore.getState().canvas;
        const { currentCameraId } = useAppStore.getState();
        const setCameraStatus = useAppStore.getState().setCameraStatus;

        if (file && canvas) {
            // [FIX] Clear existing image immediately to avoid ghosting (previous image lingering)
            const { setLoadedCameraImage } = useCanvasStore.getState();
            setLoadedCameraImage(null);

            const reader = new FileReader();
            reader.onload = async (f) => {
                const data = f.target?.result as string;
                
                // [FIX] Update Store PxPerMm & Image Scale to Reset values
                // Since this is a manual loaded image, we assume 1:1 view.
                const { setLoadedCameraImage } = useCanvasStore.getState();
                
                setLoadedCameraImage(data);
                useAppStore.getState().showToast("Image Loaded", "success");
            };
            reader.readAsDataURL(file);
        }
        if (e.target) e.target.value = '';

        // Stop video when image is loaded
        if (currentCameraId !== undefined) {
            setCameraStatus(currentCameraId, 'idle');
        }
        handleMenuClose();
    };

    const handleSaveImage = async () => {
        const { canvas, viewMode, magnification, calibrationScales, calibrationROI, loadedImages, crosshairOffset } = useCanvasStore.getState();
        const { currentCameraId, cameras } = useAppStore.getState();

        if (!canvas) return;

        try {
            // 1. Determine Image Source
            let imageUrl = '';
            const isStreaming = cameras[currentCameraId]?.status === 'streaming';

            if (!isStreaming) {
                const key = viewMode === 'object' ? (magnification === 50 ? 'object_x50' : 'object_x20') : 'scanner';
                if (loadedImages[key]) {
                    imageUrl = loadedImages[key]!;
                }
            }

            if (!imageUrl) {
                // If streaming or no loaded image, fetch snapshot
                imageUrl = camFrameUrl(currentCameraId);
            }

            // 2. Fetch Image - Using direct Image element for better IPC compatibility
            const imgEl = new Image();
            imgEl.crossOrigin = "anonymous"; // Essential for toDataURL later

            await new Promise((resolve, reject) => {
                // If we have a local data URL (Loaded image), imgEl.src will work instantly.
                // If we have a remote MJPEG/Frame URL, it handles loading.
                imgEl.onload = resolve;
                imgEl.onerror = (e) => {
                    console.error("[LeftNav] Image Load Failed", imageUrl, e);
                    reject(new Error("Failed to load image source"));
                };
                imgEl.src = imageUrl;
            });

            // 3. Compose on Temp Canvas
            // Base Resolution = Camera/Paper Resolution (e.g. 2448x2048)
            const width = imgEl.width;
            const height = imgEl.height;

            // Usage: StaticCanvas for off-screen rendering
            const tempCanvasEl = document.createElement('canvas');
            tempCanvasEl.width = width;
            tempCanvasEl.height = height;
            const tempCanvas = new fabric.StaticCanvas(tempCanvasEl, { width, height, backgroundColor: 'black' });

            // 3a. Calculate ROI Crop
            const hasActiveROI = calibrationROI?.active && calibrationROI?.center;
            let cropX = 0;
            let cropY = 0;
            let cropW = width;
            let cropH = height;

            if (hasActiveROI) {
                const r = Math.max(0.1, Math.min(1.0, calibrationROI.viewRatio / 100.0));
                cropW = width * r;
                cropH = height * r;
                cropX = calibrationROI.center!.x - cropW / 2;
                cropY = calibrationROI.center!.y - cropH / 2;
                
                // Boundaries check
                const startX = Math.max(0, cropX);
                const startY = Math.max(0, cropY);
                cropW = Math.min(cropW, width - startX);
                cropH = Math.min(cropH, height - startY);
                cropX = startX;
                cropY = startY;
            }

            // 3b. Draw Background Image (Centered)
            const bgImg = new fabric.Image(imgEl, {
                cropX: cropX,
                cropY: cropY,
                width: cropW,
                height: cropH,
                left: 0,
                top: 0,
                originX: 'center',
                originY: 'center',
                selectable: false
            });
            tempCanvas.add(bgImg);

            // 3b. Overlay Foreground Objects (1:1 with Camera Pixel Space)
            // We use standard 1:1 scale for export
            const drawScale = 1;

            // Alignment: Standard Full-Frame Centering
            // Graphics (0,0) is the center of the 2448x2048 frame.
            const tx = width / 2;
            const ty = height / 2;

            tempCanvas.setViewportTransform([
                drawScale,
                0,
                0,
                drawScale,
                tx,
                ty
            ]);

            // Clone and Add Objects
            const objects = canvas.getObjects();
            // We use Promise.all to handle potential async cloning in Fabric 6 (though usually sync for basic shapes)
            // But for safety iterate.
            for (const obj of objects) {
                // Skip selection controls or temp objects
                // Filter out Grid, Crosshair, and Excluded objects
                if ((obj as any).isTemp || obj.type === 'selection' || (obj as any).isGuide ||
                    (obj as any).isGridLine || (obj as any).isCrosshair || (obj as any).excludeFromExport) continue;

                await obj.clone().then((cloned: fabric.Object) => {
                    tempCanvas.add(cloned);
                });
            }

            tempCanvas.renderAll();

            // 4. Export
            // Crop the image to maintain original dimensions but centered on Laser Center
            // Since we shifted the background, we might have empty space at edges.
            // However, the user request implies they want the "view" to be centered.
            // If we just export the whole canvas (width x height), the center is (width/2, height/2), which corresponds to World(0,0).
            // Since we shifted the BG image so that Laser Center aligns with World(0,0), this is correct.
            const dataURL = tempCanvas.toDataURL({ format: 'png', multiplier: 1 });

            // 5. Save Dialog
            // Verify if window.showSaveFilePicker is available (Chrome/Edge/Desktop)
            // 5. Save Dialog - Use Backend Command
            // dataURL is base64 string
            const filename = `capture-${viewMode}-${Date.now()}.png`;
            try {
                // Remove prefix "data:image/png;base64,"
                const base64Data = dataURL.replace(/^data:image\/(png|jpg|jpeg);base64,/, "");

                // Call Backend
                const result = await hwFacade.dialogSaveImage(base64Data, filename);
                if (result && result.ok) {
                    useAppStore.getState().showToast("Image Saved", "success");
                } else {
                    console.warn('[LeftNav] Save Image cancelled or failed', result?.message);
                    if (result?.message !== "Canceled") {
                        useAppStore.getState().showToast("Image Save Failed", "error");
                    }
                }

            } catch (err) {
                console.error('[LeftNav] Save Image Error', err);
                useAppStore.getState().showToast("Image Save Failed", "error");
            }

            // Cleanup
            tempCanvas.dispose();

        } catch (e) {
            console.error('[LeftNav] Save Image Failed', e);
        }

        handleMenuClose();
    };

    const downloadAnchor = (url: string, name: string) => {
        const link = document.createElement('a');
        link.download = name;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const toggleVideo = () => {
        if (currentCameraId !== undefined) {
            if (isStreaming) {
                // Stop
                setCameraStatus(currentCameraId, 'idle');
            } else {
                // Start
                hwFacade.cameraStart(currentCameraId);
                setCameraStatus(currentCameraId, 'streaming');
            }
        }
        handleMenuClose();
    };

    // Restore navItems for 'recipe' variant
    const navItems = React.useMemo<MenuItemNode[]>(
        () =>
        (variant === "recipe"
            ? leftNavStrings.items.recipe.map(item => ({ key: item.key, label: item.label, icon: <NavIcons.Architecture /> })) // Use generic icon for now
            : []),
        [variant, leftNavStrings]
    );

    const [activeKey, setActiveKey] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    // Sync activeKey with parameterView
    const parameterView = useAppStore(s => s.parameterView);
    useEffect(() => {
        if (variant === 'parameter' && parameterView) {
            setActiveKey(parameterView);
            
            // 파라미터 뷰에 따라 LeftNav Accordion 자동 확장 (UX 개선)
            if (parameterView === 'motion-axis' || parameterView === 'motion-speed') {
                setExpanded(prev => ({ ...prev, motion: true }));
            } else if (parameterView === 'motion-lens' || parameterView === 'motion-mirror') {
                setExpanded(prev => ({ ...prev, motion_sub: true }));
            }
        }
    }, [variant, parameterView]);

    // Canvas Store
    const {
        showCalibrationDialog, setShowCalibrationDialog,
        showLaserSetCenterDialog, setShowLaserSetCenterDialog,
        setCanvas,
        setShowGrid, showGrid,
        setShowCross, showCross,
        setMeasureMode, setActiveTool,
        activeTool, measureMode,
        hideOverlays, isProcessingLocal
    } = useCanvasStore();

    // App Store
    const setCameraKind = useAppStore(s => s.setCameraKind);
    const setCurrentCameraId = useAppStore(s => s.setCurrentCameraId);
    const setParameterView = useAppStore(s => s.setParameterView);
    const { cameras, currentCameraId, setCameraStatus } = useAppStore(); // Subscribe to updates

    // Video State Helper
    const isStreaming = currentCameraId !== undefined && cameras[currentCameraId]?.status === 'streaming';

    // --- Popup Menu State ---
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [activeMenuKey, setActiveMenuKey] = useState<string | null>(null);

    const handleMenuClick = (event: React.MouseEvent<HTMLLIElement>, key: string) => {
        setAnchorEl(event.currentTarget);
        setActiveMenuKey(key);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
        setActiveMenuKey(null);
    };

    const getCurrentMeasureIcon = () => {
        // Always show the specific tool icon based on measureMode, even if activeTool is 'select'
        switch (measureMode) {
            case 'distance': return <NavIcons.MeasureDistance />;
            case 'rect': return <NavIcons.MeasureRect />;
            case 'circle': return <NavIcons.MeasureCircle />;
            case 'width': return <NavIcons.MeasureWidth />;
            case 'height': return <NavIcons.MeasureHeight />;
            case 'angle': return <NavIcons.MeasureAngle />;
            case 'polyline': return <NavIcons.MeasurePolyline />;
            default: return <NavIcons.MeasureDefault />;
        }
    };

    // --- Handlers ---
    const handleParamView = (view: any) => setParameterView(view);

    const handleClearMeasurements = () => {
        const { canvas, history, historyStep, setHistory, setHistoryStep } = useCanvasStore.getState();
        if (!canvas) return;

        const objects = canvas.getObjects();
        let removed = false;
        objects.forEach((obj) => {
            if ((obj as any).isMeasurement) {
                canvas.remove(obj);
                removed = true;
            }
        });

        if (removed) {
            canvas.discardActiveObject();
            canvas.requestRenderAll();

            // Save History (Simplified)
            const currentHistory = history;
            const currentStep = historyStep;
            let newHistory = [...currentHistory];
            if (currentStep < newHistory.length - 1) {
                newHistory = newHistory.slice(0, currentStep + 1);
            }

            const json = (canvas as any).toObject(['id', 'selectable', 'evented', 'isPaper', 'isGridLine', 'isGuide', 'strokeUniform', 'fillEnabled', 'strokeEnabled', 'fillOpacity', 'fillSettings', 'markPointTime', 'excludeFromExport']);
            json.objects = json.objects.filter((obj: any) => !obj.isPaper && !obj.isGridLine && !obj.isGuide && !obj.isTemp);

            newHistory.push(JSON.stringify(json));
            setHistory(newHistory);
            setHistoryStep(currentStep + 1);
        }
    };

    // NOTE: These handlers might need implementation if not imported or defined in file scope
    // Assuming they are local to this function or needed to be re-implemented as earlier.
    const handleScanner = () => {
        // [FIX] 중복 이동 차단 방어 로직 제거. 버튼 클릭 시 무조건 하드웨어 이동 명령(moonsPreset) 전송.

        useCanvasStore.getState().setViewMode('scanner');
        setCameraKind('scanner');
        setCurrentCameraId(CameraId.Scanner);
        hwFacade.moonsPreset('scanner_base');
        // [V13 NEW] Fit to Working Area before motion move (consistent with SubTitleBar behavior)
        const { currentScope } = useCanvasStore.getState();
        useCanvasStore.getState().updateViewState(`${currentScope}:scanner`, 0, { x: 0, y: 0 });
        useCanvasStore.getState().triggerFitCamera();
    };

    const handleObject = () => {
        const { objectMag } = useAppStore.getState();
        // [FIX] 중복 이동 차단 방어 로직 제거. 버튼 클릭 시 무조건 하드웨어 이동 명령(moonsPreset) 전송.

        useCanvasStore.getState().setViewMode('object');
        setCameraKind('object');
        setCurrentCameraId(CameraId.Object);
        hwFacade.moonsPreset(objectMag === 'x50' ? 'object_x50' : 'object_x20');
        // Sync Canvas Magnification
        useCanvasStore.getState().setMagnification(objectMag === "x50" ? 50 : 20);
        // [V13 NEW] Fit to Working Area before motion move (consistent with SubTitleBar behavior)
        const { currentScope } = useCanvasStore.getState();
        const magKey = objectMag === 'x50' ? 'object_x50' : 'object_x20';
        useCanvasStore.getState().updateViewState(`${currentScope}:${magKey}`, 0, { x: 0, y: 0 });
        useCanvasStore.getState().triggerFitCamera();
    };

    // --- Parameter Accordion Menu ---
    const showLights = features.useLight !== false &&
                       hardware.light !== "None" &&
                       features.lightChannels > 0;

    const parameterMenu: MenuItemNode[] = [
        {
            key: 'motion',
            label: 'Motion Main',
            icon: <NavIcons.Motion />,
            children: [
                { key: 'motion-axis', label: 'Axis Information', icon: <NavIcons.Info fontSize="small" />, action: () => handleParamView('motion-axis') },
            ]
        },
        {
            key: 'motion_sub',
            label: 'Motion Sub',
            icon: <NavIcons.Tune />,
            children: [
                ...(features.hasLensMotor ? [{ key: 'motion-lens', label: 'Lens', icon: <NavIcons.Focus fontSize="small" />, action: () => handleParamView('motion-lens') }] : []),
                { key: 'motion-mirror', label: 'Mirror', icon: <NavIcons.Focus fontSize="small" />, action: () => handleParamView('motion-mirror') },
            ]
        },
        {
            key: 'scanCam',
            label: 'Scanner Camera',
            icon: <NavIcons.ScannerCamera />,
            action: () => handleParamView('scanCam')
        },
        ...(features.allowedModes.includes("OBJECT") ? [{
            key: 'objectCam',
            label: 'Object Camera',
            icon: <NavIcons.ObjectCamera />,
            action: () => handleParamView('objectCam')
        }] : []),
        ...(showLights ? [{
            key: 'lights',
            label: 'Light',
            icon: <NavIcons.Light />,
            action: () => handleParamView('lights')
        }] : []),
        {
            key: 'laser',
            label: 'Laser',
            icon: <NavIcons.Laser />,
            action: () => handleParamView('laser')
        },
        {
            key: 'scanner',
            label: 'Scanner',
            icon: <NavIcons.Scanner />,
            action: () => handleParamView('scanner')
        }
    ];

    // --- Calibration Menu ---
    const calibrationMenu: MenuItemNode[] = [
        {
            key: 'camera_tools',
            label: 'Camera Tools',
            icon: <NavIcons.Image />,
            // No children property logic for accordion; will use popup logic
        },
        {
            key: 'measure_tools',
            label: 'Measure Tools',
            icon: <NavIcons.MeasureDistance />,
        },
        { key: 'divider_1', divider: true }, // Divider
        {
            key: 'calibration',
            label: 'Calibration',
            icon: <NavIcons.Calibration />,
            action: () => setShowCalibrationDialog(!showCalibrationDialog)
        },

        {
            key: 'laser_set_center',
            label: 'Laser Set Center',
            icon: <NavIcons.Laser />,
            action: () => setShowLaserSetCenterDialog(!showLaserSetCenterDialog)
        }
    ];

    // --- Default Menu (Main Page) ---
    // Same as Calibration but without calibration-specific items
    const defaultMenu: MenuItemNode[] = [
        {
            key: 'camera_tools',
            label: 'Camera Tools',
            icon: <NavIcons.Image />,
        },
        {
            key: 'measure_tools',
            label: 'Measure Tools',
            icon: <NavIcons.MeasureDistance />,
        }
    ];

    // --- Accordion State (Parameter Only) ---
    const toggleExpand = (key: string) => {
        setExpanded(prev => (prev[key] ? {} : { [key]: true }));
    };

    // --- Render Item ---
    const renderMenuItem = (item: MenuItemNode, depth = 0) => {
        if (item.divider) {
            return <Divider key={item.key} sx={{ my: 1, borderColor: 'rgba(255, 255, 255, 0.12)' }} />;
        }

        // Mode Check:
        const isAccordionMode = variant === 'parameter'; // Only Parameter uses Accordion
        const isPopupMode = (variant === 'default' || variant === 'calibration') && (item.key === 'camera_tools' || item.key === 'measure_tools');

        const hasChildren = item.children && item.children.length > 0;
        const isExpanded = expanded[item.key];
        const paddingLeft = depth * 2 + 2.5;

        // Popup Handlers
        const handleClick = (event: React.MouseEvent<HTMLElement>) => {
            if (isPopupMode) {
                handleMenuClick(event as any, item.key); // Menu anchor still expects specialized element sometimes but HTMLElement is usually fine for anchorEl
            } else if (hasChildren && isAccordionMode) {
                if (open) toggleExpand(item.key);
                else onToggle();
            } else {
                item.action?.();
            }
        };

        // Logic for Active State
        const active = activeKey === item.key || (isPopupMode && activeMenuKey === item.key);

        // Logic for End Icon (Accordion arrow or Popup arrow)
        let endIcon: React.ReactNode = undefined;
        if (hasChildren && isAccordionMode) {
            endIcon = isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />;
        } else if (isPopupMode) {
            endIcon = <ArrowDropDownIcon fontSize="small" sx={{ color: 'text.secondary' }} />;
        }

        // Logic for Indicator (Collapsed State)
        let indicator: React.ReactNode = undefined;
        if (isPopupMode) {
            indicator = <ArrowDropDownIcon sx={NavStyles.collapsedIndicator} />;
        }

        return (
            <React.Fragment key={item.key}>
                <NavButton
                    open={open}
                    active={active}
                    label={item.label || ''}
                    icon={item.icon}
                    onClick={(e) => handleClick(e)}
                    disabled={hideOverlays || isProcessingLocal}
                    endIcon={endIcon}
                    indicator={indicator}
                    sx={{
                        paddingLeft: open ? `${paddingLeft * 8}px` : undefined, // Apply indentation only when open
                        // Ensure NavButton inherits any specific overrides if needed
                    }}
                />

                {/* Accordion Children (Parameter Only) */}
                {hasChildren && isAccordionMode && (
                    <Collapse in={open && isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {item.children!.map(child => renderMenuItem(child, depth + 1))}
                        </Box>
                    </Collapse>
                )}
            </React.Fragment>
        );
    };

    // --- Render Popup Menus ---
    const renderPopupMenus = () => (
        <>
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl) && activeMenuKey === 'camera_tools'}
                onClose={handleMenuClose}
                anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
                transformOrigin={{ vertical: 'center', horizontal: 'left' }}
                PaperProps={{ sx: { ml: 1, minWidth: 200, bgcolor: '#2f3542', color: 'white' } }} // Dark theme matching reference
            >
                <MenuItem onClick={() => { setShowGrid(!showGrid); handleMenuClose(); }}>
                    <ListItemIcon><NavIcons.Grid fontSize="small" sx={{ color: '#ff4444' }} /></ListItemIcon>
                    <ListItemText>Show / Hide Grid</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => { setShowCross(!showCross); handleMenuClose(); }}>
                    <ListItemIcon><NavIcons.Cross fontSize="small" sx={{ color: '#ff8800' }} /></ListItemIcon>
                    <ListItemText>Show / Hide Cross</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleSaveImage}>
                    <ListItemIcon><NavIcons.Save fontSize="small" /></ListItemIcon>
                    <ListItemText>Save Image</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleLoadImageClick}>
                    <ListItemIcon><NavIcons.Load fontSize="small" /></ListItemIcon>
                    <ListItemText>Load Image</ListItemText>
                </MenuItem>
                <MenuItem onClick={toggleVideo}>
                    <ListItemIcon>
                        {isStreaming ? <NavIcons.Stop fontSize="small" /> : <NavIcons.Play fontSize="small" />}
                    </ListItemIcon>
                    <ListItemText>{isStreaming ? "Stop Video" : "Start Video"}</ListItemText>
                </MenuItem>
            </Menu>

            {/* Measure Tools Popup */}
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl) && activeMenuKey === 'measure_tools'}
                onClose={handleMenuClose}
                anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
                transformOrigin={{ vertical: 'center', horizontal: 'left' }}
                PaperProps={{ sx: { ml: 1, minWidth: 250, bgcolor: '#2f3542', color: 'white' } }}
            >
                <MenuItem onClick={() => { handleClearMeasurements(); handleMenuClose(); }}>
                    <ListItemIcon><NavIcons.Delete fontSize="small" sx={{ color: '#ff8800' }} /></ListItemIcon>
                    <ListItemText>Clear All Measurements</ListItemText>
                </MenuItem>
                <Divider sx={{ my: 0.5, bgcolor: 'rgba(255,255,255,0.1)' }} />
                <MenuItem onClick={() => { setActiveTool('measure'); setMeasureMode('distance'); handleMenuClose(); }}>
                    <ListItemIcon><NavIcons.MeasureDistance fontSize="small" /></ListItemIcon>
                    <ListItemText><u>D</u>istance (Shift+D)</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => { setActiveTool('measure'); setMeasureMode('rect'); handleMenuClose(); }}>
                    <ListItemIcon><NavIcons.MeasureRect fontSize="small" /></ListItemIcon>
                    <ListItemText><u>R</u>ectangle (Shift+R)</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => { setActiveTool('measure'); setMeasureMode('circle'); handleMenuClose(); }}>
                    <ListItemIcon><NavIcons.MeasureCircle fontSize="small" /></ListItemIcon>
                    <ListItemText><u>C</u>ircle Radius (Shift+C)</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => { setActiveTool('measure'); setMeasureMode('width'); handleMenuClose(); }}>
                    <ListItemIcon><NavIcons.MeasureWidth fontSize="small" /></ListItemIcon>
                    <ListItemText><u>W</u>idth (Shift+W)</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => { setActiveTool('measure'); setMeasureMode('height'); handleMenuClose(); }}>
                    <ListItemIcon><NavIcons.MeasureHeight fontSize="small" /></ListItemIcon>
                    <ListItemText><u>H</u>eight (Shift+H)</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => { setActiveTool('measure'); setMeasureMode('angle'); handleMenuClose(); }}>
                    <ListItemIcon><NavIcons.MeasureAngle fontSize="small" /></ListItemIcon>
                    <ListItemText><u>A</u>ngle (Shift+A)</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => { setActiveTool('measure'); setMeasureMode('polyline'); handleMenuClose(); }}>
                    <ListItemIcon><NavIcons.MeasurePolyline fontSize="small" /></ListItemIcon>
                    <ListItemText><u>P</u>olyline (Shift+P)</ListItemText>
                </MenuItem>
            </Menu>
        </>
    );

    // Determine Active List
    const activeItems = variant === "parameter" ? parameterMenu :
        variant === "calibration" ? calibrationMenu :
            variant === "default" ? defaultMenu :
                variant === "recipe" ? navItems :
                    [];

    return (
        <Box sx={{ display: "flex" }}>
            <CssBaseline />
            {/* ... Drawer ... */}
            <Drawer variant="permanent" open={open} offset={topOffset}>
                {/* ... Header ... */}
                <Box
                    sx={{
                        height: 48,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        justifyContent: open ? 'flex-start' : 'center',
                        pl: open ? 2.5 : 0, // 20px padding to match List Item
                        transition: theme.transitions.create(['padding', 'justify-content'])
                    }}
                >
                    <IconButton
                        onClick={onToggle}
                        sx={{
                            color: "text.primary",
                            // ml: open ? -1 : 0, // Removed negative margin to align with List Icons
                        }}
                    >
                        {open ? <ChevronLeftIcon /> : <MenuIcon />}
                    </IconButton>

                    {/* Save/Load Buttons (Visible only in Recipe Canvas Mode & When Open) */}
                    {variant === "recipe-canvas" && open && (
                        <>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={handleSaveProject}
                                disabled={hideOverlays || isProcessingLocal}
                                startIcon={<NavIcons.Save sx={{ fontSize: 16 }} />}
                                sx={{
                                    minWidth: 'auto', // Compact
                                    px: 1,
                                    py: 0.5,
                                    fontSize: '0.75rem',
                                    textTransform: 'none',
                                    color: theme.palette.text.primary,
                                    borderColor: 'rgba(255, 255, 255, 0.23)', // Match divider/border
                                    '&:hover': {
                                        borderColor: 'text.primary',
                                        bgcolor: 'rgba(255, 255, 255, 0.05)'
                                    }
                                }}
                            >
                                Save
                            </Button>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={handleLoadProjectClick}
                                disabled={hideOverlays || isProcessingLocal}
                                startIcon={<NavIcons.Load sx={{ fontSize: 16 }} />}
                                sx={{
                                    minWidth: 'auto', // Compact
                                    px: 1,
                                    py: 0.5,
                                    fontSize: '0.75rem',
                                    textTransform: 'none',
                                    color: theme.palette.text.primary,
                                    borderColor: 'rgba(255, 255, 255, 0.23)',
                                    '&:hover': {
                                        borderColor: 'text.primary',
                                        bgcolor: 'rgba(255, 255, 255, 0.05)'
                                    }
                                }}
                            >
                                Load
                            </Button>
                        </>
                    )}
                </Box>
                <Divider />

                {variant === "recipe-canvas" ? (
                    <Box sx={{ flex: 1, pt: 0 }}><Toolbar open={open} /></Box>
                ) : (
                    <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5, py: 1 }}>
                        {activeItems.map(item => renderMenuItem(item))}
                    </Box>
                )}
            </Drawer>
            {renderPopupMenus()}
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={handleLoadImageChange}
            />
            {/* Hidden Input for Project Load */}
            <input
                type="file"
                ref={projectInputRef}
                style={{ display: 'none' }}
                accept=".lng,.json"
                onChange={handleLoadProjectChange}
            />
        </Box>
    );
}
