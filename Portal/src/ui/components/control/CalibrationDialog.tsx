/**
 * @file CalibrationDialog.tsx
 * @brief 카메라 스케일 캘리브레이션 매니저 (Phase 1/2/3 통합 UI)
 * @details
 *  - 디자인 패턴: Strategy(방법별 패널 분기), Facade(hwFacade/store 위임)
 *  - 방법 선택:
 *    - Auto-Fit (기본)  : 대략적 박스 드래그 → 네이티브 OpenCV 자동 피팅 → 오버레이 스냅
 *    - Pattern          : 체커보드/도트그리드 원클릭 전자동 검출 (Scale+회전각)
 *    - Stage-Move       : 스테이지 기지 이동 + 템플릿 매칭 (타겟 불필요)
 *  - 가드레일: X/Y 비등방성 경고, 직전 저장값 대비 급변(>5%) 저장 확인
 */
import { useEffect, useState, useRef } from 'react';
import {
    Box,
    IconButton,
    Typography,
    Button,
    TextField,
    Divider,
    List,
    ListItem,
    ListItemText,
    ListItemButton,
    Paper,
    ToggleButton,
    ToggleButtonGroup,
    Stack,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    DialogContentText,
    Chip,
    Collapse,
    LinearProgress,
    Alert
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import RestoreIcon from '@mui/icons-material/Restore';
import RefreshIcon from '@mui/icons-material/Refresh';
import RemoveIcon from '@mui/icons-material/Remove';
import TonalityIcon from '@mui/icons-material/Tonality';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import GridOnIcon from '@mui/icons-material/GridOn';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import SaveIcon from '@mui/icons-material/Save';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import * as fabric from 'fabric';

import { useCanvasStore } from '@/ui/pages/Recipe/Canvas/useCanvasStore';
import { useCalibrationStore, AutoFitResult } from '@/ui/pages/Calibration/useCalibrationStore';
import useAppStore, { selectors } from '@/store/appStore';
import { CalibrationProfile } from '@/core/types/calibration';
import { getCameraFrameInfo, sceneRectToImageRoi, imagePtToScene } from './calibration/calibCoords';

// ---------------------------------------------------------------------
// Styled Message Dialog
// ---------------------------------------------------------------------
function MessageDialog({ open, title, message, showCancel, confirmText, onConfirm, onClose }: {
    open: boolean,
    title: string,
    message: string,
    showCancel?: boolean,
    confirmText?: string,
    onConfirm?: () => void,
    onClose: () => void
}) {
    const theme = useTheme();
    return (
        <Dialog
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    bgcolor: '#2b2d31',
                    color: '#fff',
                    borderRadius: 2,
                    minWidth: 320,
                    boxShadow: theme.shadows[10],
                    backgroundImage: 'none'
                }
            }}
        >
            <DialogTitle sx={{ color: '#fff', fontSize: 16, fontWeight: 600, pb: 1 }}>
                {title}
            </DialogTitle>
            <DialogContent sx={{ pb: 2 }}>
                <DialogContentText sx={{ color: '#d0d0d0', fontSize: 14, whiteSpace: 'pre-line' }}>
                    {message}
                </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 2, pb: 2 }}>
                {showCancel && (
                    <Button
                        onClick={onClose}
                        sx={{ color: '#bdbdbd', fontWeight: 600, textTransform: 'none' }}
                    >
                        Cancel
                    </Button>
                )}
                <Button
                    onClick={() => {
                        if (onConfirm) onConfirm();
                        onClose();
                    }}
                    sx={{ color: '#90caf9', fontWeight: 600, textTransform: 'none' }}
                    autoFocus
                >
                    {confirmText || 'OK'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

import { RIGHT_PANEL_WIDTH, RIGHT_PANEL_COLLAPSED } from "../../shell/RightPanel";

// ---------------------------------------------------------------------
// Floating Window Component with Glassmorphism
// ---------------------------------------------------------------------
function FloatingWindow({ title, children, rightPanelOpen, onClose }: { title: string, children: React.ReactNode, rightPanelOpen: boolean, onClose: () => void }) {
    const theme = useTheme();
    const [position, setPosition] = useState<{ x: number, y: number } | null>(null);
    const [isMinimized, setIsMinimized] = useState(false);
    const draggingRef = useRef<{ isDragging: boolean, startX: number, startY: number, initialX: number, initialY: number }>({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });
    const paperRef = useRef<HTMLDivElement>(null);
    const prevRightPanelOpen = useRef(rightPanelOpen);

    // Initial Position (Top-Right of Container)
    useEffect(() => {
        if (!paperRef.current) return;
        if (position === null) {
            const parent = paperRef.current.offsetParent as HTMLElement;
            const containerW = parent ? parent.clientWidth : window.innerWidth;
            const width = paperRef.current.offsetWidth || 340;

            setPosition({
                x: containerW - width - 1,
                y: 0
            });
        }
    }, [position]);

    // Responsive Position Adjustment
    useEffect(() => {
        if (position === null) return;

        if (prevRightPanelOpen.current !== rightPanelOpen) {
            const delta = RIGHT_PANEL_WIDTH - RIGHT_PANEL_COLLAPSED;
            if (rightPanelOpen === false) {
                setPosition(p => p ? { ...p, x: p.x + delta } : null);
            } else {
                setPosition(p => p ? { ...p, x: p.x - delta } : null);
            }
            prevRightPanelOpen.current = rightPanelOpen;
        }
    }, [rightPanelOpen, position]);

    // Window Resize Handler to keep window in view
    useEffect(() => {
        const handleResize = () => {
            setPosition((prev) => {
                if (!prev || !paperRef.current) return prev;

                const parent = paperRef.current.offsetParent as HTMLElement || document.body;
                const containerW = parent.clientWidth || window.innerWidth;
                const containerH = parent.clientHeight || window.innerHeight;
                const width = paperRef.current.offsetWidth || 320;
                const height = paperRef.current.offsetHeight || 500;

                let { x, y } = prev;
                let adjusted = false;

                if (x + width > containerW) {
                    x = Math.max(0, containerW - width);
                    adjusted = true;
                }
                if (y + height > containerH) {
                    y = Math.max(0, containerH - height);
                    adjusted = true;
                }

                if (x < 0) { x = 0; adjusted = true; }
                if (y < 0) { y = 0; adjusted = true; }

                return adjusted ? { x, y } : prev;
            });
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

    return (
        <Paper
            ref={paperRef}
            elevation={12}
            sx={{
                position: 'absolute',
                width: 340,
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
                    <TonalityIcon fontSize="small" color="primary" />
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
        </Paper>
    );
}

// ---------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------

/** 섹션 캡션 라벨 */
function SectionLabel({ children, right }: { children: React.ReactNode, right?: React.ReactNode }) {
    return (
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="caption" fontWeight={700} color="text.secondary">
                {children}
            </Typography>
            {right}
        </Stack>
    );
}

/**
 * @brief 검출 품질(RMS px) 배지 — 초록(<1px)/노랑(<2px)/빨강(≥2px)
 */
function RmsBadge({ rmsPx }: { rmsPx: number | null }) {
    if (rmsPx === null || rmsPx === undefined) return null;
    const color: 'success' | 'warning' | 'error' =
        rmsPx < 1.0 ? 'success' : rmsPx < 2.0 ? 'warning' : 'error';
    return (
        <Chip
            size="small"
            color={color}
            variant="outlined"
            label={`RMS ${rmsPx.toFixed(2)} px`}
            sx={{ fontWeight: 700, height: 22 }}
        />
    );
}

/** 결과 카드의 라벨-값 한 줄 */
function ResultRow({ label, value }: { label: string, value: string }) {
    return (
        <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography variant="caption" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
        </Stack>
    );
}

/** 타겟 치수 프리셋 (mm) */
const SIZE_PRESETS = [0.5, 1.0, 1.5, 2.0];
/** Phase 3 이동량 프리셋 (mm) */
const STEP_PRESETS = [0.2, 0.5, 1.0];

// =====================================================================
// Main Component
// =====================================================================
export default function CalibrationDialog() {
    const theme = useTheme();
    const { setShowCalibrationDialog, canvas, activeTool, setActiveTool, setMeasureMode, measureMode, setCalibrationScale } = useCanvasStore();
    const {
        targetWidth, targetHeight, setTargetSize,
        calculateScale, calculatedScaleX, calculatedScaleY, setScale,
        rotationDeg, resultMethod, resultRmsPx,
        method, setMethod,
        autoFitShape, setAutoFitShape, autoFitResult, clearAutoFitResult, isDetecting, runAutoFit,
        patternType, patternCols, patternRows, patternPitchMm, setPatternConfig, patternResult, runDetectPattern,
        stageStepMm, setStageStepMm, stageStatus, startStageCalib, abortStageCalib,
        loadHistory, loadCurrent, history, saveCalibration, rollback, deleteHistoryItem, currentData
    } = useCalibrationStore();

    // Selectors
    const rightPanelOpen = useAppStore(s => s.rightPanelOpen);
    const cameraKind = useAppStore(selectors.cameraKind);
    const objectMag = useAppStore(selectors.objectMag);

    const [selectedHistory, setSelectedHistory] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // [Advanced] Overlay Dimensions State (수동 폴백 경로)
    const [overlayWidthInput, setOverlayWidthInput] = useState<string>('');
    const [overlayHeightInput, setOverlayHeightInput] = useState<string>('');

    // ---- Sync with Canvas Overlay (Advanced 수동 조정용) ----
    useEffect(() => {
        if (!canvas) return;

        const updateFromObj = (obj: any) => {
            if (!obj) return;

            let targetObj = obj;
            if (obj.type === 'group' && obj.isMeasurement) {
                const objects = (obj as fabric.Group).getObjects();
                const shape = objects.find(o => o.type === 'rect' || o.type === 'circle' || o.type === 'ellipse' || o.type === 'line' || o.type === 'triangle');
                if (shape) targetObj = shape;
            }

            let w = 0;
            let h = 0;

            if (targetObj.type === 'rect') {
                w = targetObj.get('width') * targetObj.get('scaleX');
                h = targetObj.get('height') * targetObj.get('scaleY');
            } else if (targetObj.type === 'line') {
                const l = targetObj as any;
                w = Math.abs(l.x2 - l.x1) * targetObj.get('scaleX');
                h = Math.abs(l.y2 - l.y1) * targetObj.get('scaleY');
            } else {
                w = targetObj.width * targetObj.scaleX;
                h = targetObj.height * targetObj.scaleY;
            }

            if (obj.type === 'group') {
                w *= obj.get('scaleX') || 1;
                h *= obj.get('scaleY') || 1;
            }

            setOverlayWidthInput(prev => {
                const prevVal = parseFloat(prev) || 0;
                if (Math.abs(prevVal - w) > 0.1) return w.toFixed(2);
                return prev;
            });
            setOverlayHeightInput(prev => {
                const prevVal = parseFloat(prev) || 0;
                if (Math.abs(prevVal - h) > 0.1) return h.toFixed(2);
                return prev;
            });
        };

        const checkMeasurementObject = () => {
            const active = canvas.getActiveObject();
            if (active && (active as any).isMeasurement) {
                updateFromObj(active);
                return;
            }

            const objects = canvas.getObjects();
            const measureObj = objects.find(o => (o as any).isMeasurement);
            if (measureObj) {
                updateFromObj(measureObj);
            }
        };

        canvas.on('object:modified', checkMeasurementObject);
        canvas.on('object:scaling', checkMeasurementObject);
        canvas.on('object:moving', checkMeasurementObject);
        canvas.on('object:added', checkMeasurementObject);
        canvas.on('mouse:up', checkMeasurementObject);
        canvas.on('selection:created', checkMeasurementObject);
        canvas.on('selection:updated', checkMeasurementObject);

        return () => {
            canvas.off('object:modified', checkMeasurementObject);
            canvas.off('object:scaling', checkMeasurementObject);
            canvas.off('object:moving', checkMeasurementObject);
            canvas.off('object:added', checkMeasurementObject);
            canvas.off('mouse:up', checkMeasurementObject);
            canvas.off('selection:created', checkMeasurementObject);
            canvas.off('selection:updated', checkMeasurementObject);
        };
    }, [canvas]);

    // Dialog State
    const [dialogState, setDialogState] = useState<{
        open: boolean,
        title: string,
        message: string,
        showCancel?: boolean,
        confirmText?: string,
        onConfirm?: () => void
    }>({
        open: false,
        title: '',
        message: ''
    });

    const handleCloseDialog = () => {
        setDialogState(prev => ({ ...prev, open: false }));
    };

    const showError = (message: string) => {
        setDialogState({
            open: true,
            title: 'Notice',
            message,
            showCancel: false,
            confirmText: 'OK',
            onConfirm: undefined
        });
    };

    const showConfirm = (message: string, onConfirm: () => void, confirmText = 'OK') => {
        setDialogState({
            open: true,
            title: 'Confirm Operation',
            message,
            showCancel: true,
            confirmText,
            onConfirm
        });
    };

    // Derive Profile
    const profile: CalibrationProfile = cameraKind === 'scanner' ? 'scanner' : (objectMag === 'x50' ? 'object_x50' : 'object_x20');

    // Load history and current data
    useEffect(() => {
        loadHistory(profile);
        loadCurrent(profile);
    }, [profile, loadHistory, loadCurrent]);

    // -----------------------------------------------------------------
    // Overlay helpers
    // -----------------------------------------------------------------

    /**
     * @brief 측정 오버레이의 도형 중심(scene)과 논리 px 치수를 구한다.
     */
    const getOverlayGeometry = (rootObj: fabric.Object): { centerX: number, centerY: number, w: number, h: number } => {
        let targetShape: fabric.Object = rootObj;
        if (rootObj.type === 'group') {
            const items = (rootObj as fabric.Group).getObjects();
            targetShape = items.find(i =>
                ['rect', 'line', 'circle', 'ellipse', 'triangle', 'polygon', 'polyline'].includes(i.type) &&
                !(i as any).isTemp
            ) || rootObj;
        }

        let w = (targetShape.width || 0) * (targetShape.scaleX || 1);
        let h = (targetShape.height || 0) * (targetShape.scaleY || 1);
        if (rootObj.type === 'group') {
            w *= rootObj.scaleX || 1;
            h *= rootObj.scaleY || 1;
        }

        // calcTransformMatrix 는 그룹 중첩을 포함한 도형 중심의 절대(scene) 좌표를 제공
        const m = targetShape.calcTransformMatrix();
        const center = fabric.util.transformPoint(new fabric.Point(0, 0), m);
        return { centerX: center.x, centerY: center.y, w, h };
    };

    /**
     * @brief 캔버스의 측정/임시 오버레이 전체 제거
     */
    const removeAllOverlays = () => {
        if (!canvas) return;
        canvas.getObjects()
            .filter(o => (o as any).isMeasurement || (o as any).isTemp)
            .forEach(o => canvas.remove(o));
    };

    /**
     * @brief Auto-Fit 검출 결과 위치로 오버레이를 스냅시킨다 (초록 강조).
     */
    const snapOverlayToResult = (res: AutoFitResult) => {
        if (!canvas) return;
        removeAllOverlays();

        const c = imagePtToScene({ x: res.cx, y: res.cy });
        const zoom = canvas.getZoom() || 1;
        const isCircle = res.shape === 'circle';

        const common: any = {
            originX: 'center',
            originY: 'center',
            left: c.x,
            top: c.y,
            fill: 'rgba(34,197,94,0.08)',
            stroke: '#22c55e',
            strokeWidth: 2 / zoom,
            strokeUniform: true,
        };

        let shapeObj: fabric.Object;
        if (isCircle) {
            shapeObj = new fabric.Ellipse({ ...common, rx: res.widthPx / 2, ry: res.heightPx / 2 });
        } else {
            shapeObj = new fabric.Rect({ ...common, width: res.widthPx, height: res.heightPx, angle: res.angleDeg });
        }
        (shapeObj as any).isMeasurement = true;

        const label = new fabric.Text(
            `${isCircle ? '⌀' : 'W×H'} ${res.widthPx.toFixed(1)} × ${res.heightPx.toFixed(1)} px   RMS ${res.rmsPx.toFixed(2)} px`,
            {
                left: c.x - res.widthPx / 2,
                top: c.y - res.heightPx / 2 - (30 / zoom),
                fontSize: 16 / zoom,
                fill: '#22c55e',
                backgroundColor: 'rgba(0,0,0,0.55)',
                selectable: false,
                evented: false
            }
        );
        (label as any).isTemp = true;

        canvas.add(shapeObj);
        canvas.add(label);
        canvas.requestRenderAll();
    };

    // -----------------------------------------------------------------
    // Phase 1: Auto-Fit handlers
    // -----------------------------------------------------------------

    /** ROI 드로잉 모드 진입 */
    const handleStartRoi = () => {
        removeAllOverlays();
        clearAutoFitResult();
        setActiveTool('measure');
        setMeasureMode('rect' as any);
        canvas?.requestRenderAll();
    };

    /** 네이티브 Auto-Fit 검출 실행 */
    const handleDetectAutoFit = async () => {
        if (!canvas) return;
        const objects = canvas.getObjects().filter(o => (o as any).isMeasurement);
        if (objects.length === 0) {
            showError('먼저 [Draw ROI]를 누르고 타겟 주위로 대략적인 박스를 드래그하세요.\n(정확히 맞출 필요 없습니다 — 자동으로 피팅됩니다)');
            return;
        }

        const rootObj = objects[objects.length - 1];
        const geo = getOverlayGeometry(rootObj);
        const roi = sceneRectToImageRoi({
            left: geo.centerX - geo.w / 2,
            top: geo.centerY - geo.h / 2,
            width: geo.w,
            height: geo.h
        });
        if (!roi) {
            showError('ROI가 카메라 영상 범위를 벗어났습니다. 카메라 영상 위에 박스를 그려주세요.');
            return;
        }

        const info = getCameraFrameInfo();
        const res = await runAutoFit(info.camId, roi);
        if ('error' in res) {
            showError(`자동 검출 실패: ${res.error}\n조명/초점을 확인하거나 Advanced에서 수동으로 조정하세요.`);
            return;
        }

        snapOverlayToResult(res);
        setActiveTool('select');

        // 원형 타겟이면 W=H(지름) 입력을 동기화
        if (res.shape === 'circle' && targetWidth > 0) {
            setTargetSize(targetWidth, targetWidth);
        }
    };

    /** Scale 계산 (Auto-Fit 결과 우선, 폴백: 수동 오버레이 치수) */
    const handleCalculate = () => {
        if (targetWidth <= 0 || targetHeight <= 0) {
            showError('Target 치수(mm)를 먼저 입력하세요.');
            return;
        }

        if (method === 'autofit' && autoFitResult) {
            calculateScale(autoFitResult.widthPx, autoFitResult.heightPx);
            return;
        }

        // ---- 폴백: 수동 오버레이 기반 (기존 방식) ----
        if (!canvas) return;
        const objects = canvas.getObjects().filter(o => (o as any).isMeasurement);
        if (objects.length === 0) {
            showError('측정 오버레이가 없습니다. Detect 를 실행하거나 박스를 그려주세요.');
            return;
        }
        const geo = getOverlayGeometry(objects[objects.length - 1]);
        console.log(`[Calibration] Manual overlay dims: ${geo.w.toFixed(3)} x ${geo.h.toFixed(3)} px`);
        calculateScale(geo.w, geo.h);
    };

    // -----------------------------------------------------------------
    // Phase 2: Pattern handler
    // -----------------------------------------------------------------
    const handleDetectPattern = async () => {
        const info = getCameraFrameInfo();
        const res = await runDetectPattern(info.camId);
        if ('error' in res) {
            showError(`패턴 검출 실패: ${res.error}\n격자 수(cols/rows)와 패턴 전체가 화면에 보이는지 확인하세요.`);
        }
    };

    // -----------------------------------------------------------------
    // Phase 3: Stage-Move handlers
    // -----------------------------------------------------------------
    const handleStartStage = () => {
        const info = getCameraFrameInfo();
        showConfirm(
            `스테이지가 X/Y 축으로 ±${stageStepMm} mm 저속 이동 후 원위치로 복귀합니다.\n` +
            `헤드 주변 간섭이 없는지 확인하세요.\n\n진행하시겠습니까?`,
            async () => {
                const r = await startStageCalib(info.camId);
                if (!r.ok) {
                    showError(`시작 실패: ${r.error}`);
                }
            },
            'Start'
        );
    };

    // -----------------------------------------------------------------
    // Save (공통) — 가드레일 포함
    // -----------------------------------------------------------------
    const doSave = async () => {
        // 1. Update Runtime Scale (Memory)
        if (calculatedScaleX > 0 && calculatedScaleY > 0) {
            const newScaleX = 1 / calculatedScaleX; // px/mm
            const newScaleY = 1 / calculatedScaleY;
            console.log(`[Calibration] Applying Scale for ${profile}: {x: ${newScaleX}, y: ${newScaleY}} px/mm (method: ${resultMethod})`);
            setCalibrationScale(profile, { x: newScaleX, y: newScaleY });
        }

        // 2. Save to Backend (Disk)
        try {
            const data = {
                meta: {
                    timestamp: new Date().toISOString(),
                    operator: "User",
                    profile: profile,
                    camera: { model: "Simulated" },
                    roi: { x: 0, y: 0, w: 0, h: 0 },
                    method: resultMethod || 'manual',
                    rms_px: resultRmsPx ?? undefined
                },
                calibration: {
                    scale_um_per_px: calculatedScaleX * 1000,
                    scale_um_per_py: calculatedScaleY * 1000,
                    rotation_deg: rotationDeg || 0
                }
            };
            await saveCalibration(profile, data as any);

            // 저장 완료 후 측정 오버레이 제거 (Fabric v6 역직렬화 충돌 방지)
            if (canvas) {
                removeAllOverlays();
                canvas.requestRenderAll();
            }
        } catch (e) {
            console.error("[Calibration] Failed to save calibration to backend:", e);
            showError("Calibration applied to session, but failed to save to disk. Please check backend.");
        }
    };

    const handleApply = () => {
        if (!calculatedScaleX && !calculatedScaleY) {
            showError("Please calculate or set scale first.");
            return;
        }

        // 가드레일: 직전 저장값 대비 급변(>5%) 확인
        const prevX = (currentData?.calibration?.scale_um_per_px || 0) / 1000;
        const prevY = (currentData?.calibration?.scale_um_per_py || currentData?.calibration?.scale_um_per_px || 0) / 1000;
        if (prevX > 0 && calculatedScaleX > 0) {
            const dx = Math.abs(calculatedScaleX - prevX) / prevX * 100;
            const dy = prevY > 0 ? Math.abs(calculatedScaleY - prevY) / prevY * 100 : 0;
            const dMax = Math.max(dx, dy);
            if (dMax > 5) {
                showConfirm(
                    `이전 저장값 대비 스케일이 ${dMax.toFixed(1)}% 변경됩니다.\n` +
                    `X: ${(prevX * 1000).toFixed(3)} → ${(calculatedScaleX * 1000).toFixed(3)} µm/px\n` +
                    `Y: ${(prevY * 1000).toFixed(3)} → ${(calculatedScaleY * 1000).toFixed(3)} µm/px\n\n저장하시겠습니까?`,
                    doSave,
                    'Save'
                );
                return;
            }
        }
        doSave();
    };

    // [Advanced] 수동 오버레이 크기 적용
    const handleApplyOverlaySize = () => {
        if (!canvas) return;

        const rawW = parseFloat(overlayWidthInput) || 0;
        const rawH = parseFloat(overlayHeightInput) || 0;
        if (rawW <= 0 || rawH <= 0) return;

        let mainObj = canvas.getActiveObject();
        if (!mainObj || !(mainObj as any).isMeasurement) {
            const objects = canvas.getObjects().filter(o => (o as any).isMeasurement);
            if (objects.length > 0) mainObj = objects[objects.length - 1];
        }
        if (!mainObj) return;

        let shapeObj: fabric.Object = mainObj;
        let isGroup = false;
        if (mainObj.type === 'group') {
            isGroup = true;
            const group = mainObj as fabric.Group;
            shapeObj = group.getObjects().find(o => ['rect', 'circle', 'ellipse', 'line', 'triangle'].includes(o.type)) || mainObj;
        }

        const groupScaleX = isGroup ? (mainObj.scaleX || 1) : 1;
        const groupScaleY = isGroup ? (mainObj.scaleY || 1) : 1;

        if (shapeObj.type === 'rect') {
            shapeObj.set({
                width: rawW / groupScaleX,
                height: rawH / groupScaleY,
                scaleX: 1,
                scaleY: 1
            });
        } else if (shapeObj.type === 'ellipse') {
            (shapeObj as fabric.Ellipse).set({ rx: rawW / 2, ry: rawH / 2, scaleX: 1, scaleY: 1 });
        } else {
            shapeObj.set({ width: rawW / (shapeObj.scaleX || 1), height: rawH / (shapeObj.scaleY || 1) });
        }

        shapeObj.setCoords();
        if (isGroup) {
            const grp = mainObj as fabric.Group;
            (grp as any).addWithUpdate?.();
            grp.setCoords();
        } else {
            mainObj.setCoords();
        }
        canvas.requestRenderAll();
    };

    const features = useAppStore(s => s.features);
    const activeLabel = cameraKind === 'scanner'
        ? 'Scanner'
        : (objectMag === 'x50' ? 'Object x50' : (features.hasObjectX20 ? 'Object x20' : 'Object x50'));
    const activeColor = cameraKind === 'scanner' ? 'primary' : (objectMag === 'x50' ? 'warning' : 'secondary');

    // 비등방성(Scale X/Y 편차) 경고
    const anisoPct = (calculatedScaleX > 0 && calculatedScaleY > 0)
        ? Math.abs(calculatedScaleX - calculatedScaleY) / ((calculatedScaleX + calculatedScaleY) / 2) * 100
        : 0;

    const methodChipLabel = resultMethod === 'autofit' ? 'Auto-Fit'
        : resultMethod === 'pattern' ? 'Pattern'
            : resultMethod === 'stage' ? 'Stage-Move'
                : resultMethod === 'manual' ? 'Manual' : null;

    const stageRunning = stageStatus.running;
    const isCircleMode = method === 'autofit' && (autoFitShape === 'circle' || autoFitResult?.shape === 'circle');

    // =================================================================
    // Render
    // =================================================================
    return (
        <>
            <FloatingWindow
                title="Calibration Manager"
                rightPanelOpen={rightPanelOpen}
                onClose={() => setShowCalibrationDialog(false)}
            >
                <Stack spacing={2}>
                    {/* Camera Context Badge */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 1,
                            bgcolor: alpha(theme.palette[activeColor].main, 0.1),
                            color: theme.palette[activeColor].main,
                            py: 0.75,
                            px: 2,
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: alpha(theme.palette[activeColor].main, 0.2)
                        }}
                    >
                        <Typography variant="subtitle2" fontWeight="bold">
                            Active View: {activeLabel}
                        </Typography>
                    </Box>

                    {/* ==================== METHOD SELECTOR ==================== */}
                    <Box>
                        <SectionLabel>CALIBRATION METHOD</SectionLabel>
                        <ToggleButtonGroup
                            value={method}
                            exclusive
                            onChange={(_, v) => { if (v && !stageRunning) setMethod(v); }}
                            fullWidth
                            sx={{
                                gap: 0.75,
                                '& .MuiToggleButton-root': {
                                    flex: 1,
                                    flexDirection: 'column',
                                    gap: 0.25,
                                    py: 1,
                                    border: `1px solid ${alpha(theme.palette.primary.main, 0.35)} !important`,
                                    borderRadius: '8px !important',
                                    color: 'text.secondary',
                                    textTransform: 'none',
                                    lineHeight: 1.1,
                                    '&.Mui-selected': {
                                        bgcolor: alpha(theme.palette.primary.main, 0.12),
                                        color: 'primary.main',
                                        borderColor: `${theme.palette.primary.main} !important`
                                    }
                                }
                            }}
                        >
                            <ToggleButton value="autofit">
                                <CenterFocusStrongIcon fontSize="small" />
                                <Typography variant="caption" fontWeight={700}>Auto-Fit</Typography>
                            </ToggleButton>
                            <ToggleButton value="pattern">
                                <GridOnIcon fontSize="small" />
                                <Typography variant="caption" fontWeight={700}>Pattern</Typography>
                            </ToggleButton>
                            <ToggleButton value="stage">
                                <OpenWithIcon fontSize="small" />
                                <Typography variant="caption" fontWeight={700}>Stage</Typography>
                            </ToggleButton>
                        </ToggleButtonGroup>
                    </Box>

                    <Divider />

                    {/* ==================== PHASE 1: AUTO-FIT ==================== */}
                    {method === 'autofit' && (
                        <Box>
                            <SectionLabel
                                right={
                                    <Tooltip title="Clear all overlays">
                                        <IconButton size="small" onClick={() => { removeAllOverlays(); clearAutoFitResult(); canvas?.requestRenderAll(); }} color="error" sx={{ mr: -0.5 }}>
                                            <DeleteIcon fontSize="inherit" />
                                        </IconButton>
                                    </Tooltip>
                                }
                            >
                                TARGET SHAPE
                            </SectionLabel>

                            <ToggleButtonGroup
                                value={autoFitShape}
                                exclusive
                                onChange={(_, v) => { if (v) setAutoFitShape(v); }}
                                fullWidth
                                size="small"
                                sx={{
                                    mb: 1.5,
                                    gap: 0.75,
                                    '& .MuiToggleButton-root': {
                                        flex: 1,
                                        gap: 0.5,
                                        textTransform: 'none',
                                        border: `1px solid ${alpha(theme.palette.divider, 0.5)} !important`,
                                        borderRadius: '6px !important',
                                        '&.Mui-selected': {
                                            bgcolor: alpha(theme.palette.primary.main, 0.12),
                                            color: 'primary.main'
                                        }
                                    }
                                }}
                            >
                                <ToggleButton value="rect"><CheckBoxOutlineBlankIcon sx={{ fontSize: 16 }} /> Rect</ToggleButton>
                                <ToggleButton value="circle"><CircleOutlinedIcon sx={{ fontSize: 16 }} /> Circle</ToggleButton>
                                <ToggleButton value="auto"><AutoAwesomeIcon sx={{ fontSize: 16 }} /> Auto</ToggleButton>
                            </ToggleButtonGroup>

                            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                                ① 타겟 주위로 <b>대략적인</b> 박스를 그리세요 → ② Detect 가 외곽을 자동 피팅합니다.
                            </Typography>

                            <Stack direction="row" spacing={1} mb={1.5}>
                                <Button
                                    variant={activeTool === 'measure' && measureMode === 'rect' ? 'contained' : 'outlined'}
                                    size="medium"
                                    onClick={handleStartRoi}
                                    fullWidth
                                    disabled={isDetecting}
                                    sx={{ height: 38, textTransform: 'none', fontWeight: 700 }}
                                >
                                    ① Draw ROI
                                </Button>
                                <Button
                                    variant="contained"
                                    color="secondary"
                                    size="medium"
                                    onClick={handleDetectAutoFit}
                                    fullWidth
                                    disabled={isDetecting}
                                    startIcon={<AutoFixHighIcon />}
                                    sx={{ height: 38, textTransform: 'none', fontWeight: 700 }}
                                >
                                    ② Detect
                                </Button>
                            </Stack>
                            {isDetecting && <LinearProgress sx={{ mb: 1.5, borderRadius: 1 }} />}

                            {/* 검출 결과 카드 */}
                            {autoFitResult && (
                                <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5, bgcolor: alpha(theme.palette.success.main, 0.06), borderColor: alpha(theme.palette.success.main, 0.35) }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                                        <Typography variant="caption" fontWeight={700} color="success.main">
                                            {autoFitResult.shape === 'circle' ? 'Circle detected' : 'Rectangle detected'}
                                        </Typography>
                                        <RmsBadge rmsPx={autoFitResult.rmsPx} />
                                    </Stack>
                                    <ResultRow label={autoFitResult.shape === 'circle' ? 'Diameter X / Y (px)' : 'Width / Height (px)'}
                                        value={`${autoFitResult.widthPx.toFixed(1)} / ${autoFitResult.heightPx.toFixed(1)}`} />
                                    {Math.abs(autoFitResult.angleDeg) > 0.05 && (
                                        <ResultRow label="Tilt" value={`${autoFitResult.angleDeg.toFixed(2)}°`} />
                                    )}
                                </Paper>
                            )}

                            {/* Target dimensions + presets */}
                            <SectionLabel>{isCircleMode ? 'TARGET DIAMETER (mm)' : 'TARGET DIMENSIONS (mm)'}</SectionLabel>
                            <Stack direction="row" spacing={0.75} mb={1}>
                                {SIZE_PRESETS.map(v => (
                                    <Chip
                                        key={v}
                                        label={`${v}`}
                                        size="small"
                                        variant={targetWidth === v && targetHeight === v ? 'filled' : 'outlined'}
                                        color={targetWidth === v && targetHeight === v ? 'primary' : 'default'}
                                        onClick={() => setTargetSize(v, v)}
                                        sx={{ flex: 1, fontWeight: 700 }}
                                    />
                                ))}
                            </Stack>
                            <Stack direction="row" spacing={1} mb={1.5}>
                                <TextField
                                    label={isCircleMode ? 'Diameter' : 'Target Width'}
                                    size="small"
                                    type="number"
                                    value={targetWidth || ''}
                                    onChange={e => {
                                        const v = parseFloat(e.target.value) || 0;
                                        setTargetSize(v, isCircleMode ? v : targetHeight);
                                    }}
                                    InputLabelProps={{ shrink: true }}
                                    fullWidth
                                    variant="outlined"
                                />
                                {!isCircleMode && (
                                    <TextField
                                        label="Target Height"
                                        size="small"
                                        type="number"
                                        value={targetHeight || ''}
                                        onChange={e => setTargetSize(targetWidth, parseFloat(e.target.value) || 0)}
                                        InputLabelProps={{ shrink: true }}
                                        fullWidth
                                        variant="outlined"
                                    />
                                )}
                            </Stack>

                            <Button
                                variant="contained"
                                color="secondary"
                                onClick={handleCalculate}
                                fullWidth
                                disabled={isDetecting}
                                sx={{ borderRadius: 2, fontWeight: 'bold', textTransform: 'none' }}
                            >
                                ③ Calculate Scale
                            </Button>

                            {/* Advanced: 수동 오버레이 px 조정 (폴백) */}
                            <Box mt={1}>
                                <Button
                                    size="small"
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                    endIcon={showAdvanced ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                    sx={{ textTransform: 'none', color: 'text.secondary', px: 0.5 }}
                                >
                                    Advanced (manual overlay)
                                </Button>
                                <Collapse in={showAdvanced}>
                                    <Stack direction="row" spacing={1} mt={1} mb={1}>
                                        <TextField
                                            label="Overlay W (px)"
                                            size="small"
                                            type="text"
                                            value={overlayWidthInput}
                                            onChange={e => {
                                                if (/^[\d.]*$/.test(e.target.value)) setOverlayWidthInput(e.target.value);
                                            }}
                                            InputLabelProps={{ shrink: true }}
                                            fullWidth
                                        />
                                        <TextField
                                            label="Overlay H (px)"
                                            size="small"
                                            type="text"
                                            value={overlayHeightInput}
                                            onChange={e => {
                                                if (/^[\d.]*$/.test(e.target.value)) setOverlayHeightInput(e.target.value);
                                            }}
                                            InputLabelProps={{ shrink: true }}
                                            fullWidth
                                        />
                                    </Stack>
                                    <Button variant="outlined" size="small" onClick={handleApplyOverlaySize} fullWidth sx={{ textTransform: 'none' }}>
                                        Apply Overlay Size
                                    </Button>
                                </Collapse>
                            </Box>
                        </Box>
                    )}

                    {/* ==================== PHASE 2: PATTERN ==================== */}
                    {method === 'pattern' && (
                        <Box>
                            <SectionLabel>PATTERN TYPE</SectionLabel>
                            <ToggleButtonGroup
                                value={patternType}
                                exclusive
                                onChange={(_, v) => { if (v) setPatternConfig({ patternType: v }); }}
                                fullWidth
                                size="small"
                                sx={{
                                    mb: 1.5,
                                    gap: 0.75,
                                    '& .MuiToggleButton-root': {
                                        flex: 1,
                                        gap: 0.5,
                                        textTransform: 'none',
                                        border: `1px solid ${alpha(theme.palette.divider, 0.5)} !important`,
                                        borderRadius: '6px !important',
                                        '&.Mui-selected': {
                                            bgcolor: alpha(theme.palette.primary.main, 0.12),
                                            color: 'primary.main'
                                        }
                                    }
                                }}
                            >
                                <ToggleButton value="chessboard">Chessboard</ToggleButton>
                                <ToggleButton value="circles">Dot Grid</ToggleButton>
                            </ToggleButtonGroup>

                            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                                패턴 전체가 화면에 보이도록 배치 후 Detect 를 누르세요.
                                {patternType === 'chessboard' ? ' (Cols/Rows = 내부 코너 수)' : ' (Cols/Rows = 원 개수)'}
                            </Typography>

                            <Stack direction="row" spacing={1} mb={1.5}>
                                <TextField
                                    label="Cols"
                                    size="small"
                                    type="number"
                                    value={patternCols}
                                    onChange={e => setPatternConfig({ patternCols: parseInt(e.target.value) || 0 })}
                                    InputLabelProps={{ shrink: true }}
                                    fullWidth
                                />
                                <TextField
                                    label="Rows"
                                    size="small"
                                    type="number"
                                    value={patternRows}
                                    onChange={e => setPatternConfig({ patternRows: parseInt(e.target.value) || 0 })}
                                    InputLabelProps={{ shrink: true }}
                                    fullWidth
                                />
                                <TextField
                                    label="Pitch (mm)"
                                    size="small"
                                    type="number"
                                    value={patternPitchMm}
                                    onChange={e => setPatternConfig({ patternPitchMm: parseFloat(e.target.value) || 0 })}
                                    InputLabelProps={{ shrink: true }}
                                    inputProps={{ step: 0.1 }}
                                    fullWidth
                                />
                            </Stack>

                            <Button
                                variant="contained"
                                color="secondary"
                                onClick={handleDetectPattern}
                                fullWidth
                                disabled={isDetecting}
                                startIcon={<AutoFixHighIcon />}
                                sx={{ borderRadius: 2, fontWeight: 'bold', textTransform: 'none' }}
                            >
                                Detect Pattern
                            </Button>
                            {isDetecting && <LinearProgress sx={{ mt: 1.5, borderRadius: 1 }} />}

                            {patternResult && (
                                <Paper variant="outlined" sx={{ p: 1.25, mt: 1.5, bgcolor: alpha(theme.palette.success.main, 0.06), borderColor: alpha(theme.palette.success.main, 0.35) }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                                        <Typography variant="caption" fontWeight={700} color="success.main">
                                            {patternResult.points} points detected
                                        </Typography>
                                        <RmsBadge rmsPx={patternResult.rmsPx} />
                                    </Stack>
                                    <ResultRow label="Scale X" value={`${(patternResult.scaleX * 1000).toFixed(4)} µm/px`} />
                                    <ResultRow label="Scale Y" value={`${(patternResult.scaleY * 1000).toFixed(4)} µm/px`} />
                                    <ResultRow label="Rotation" value={`${patternResult.rotationDeg.toFixed(3)}°`} />
                                </Paper>
                            )}
                        </Box>
                    )}

                    {/* ==================== PHASE 3: STAGE-MOVE ==================== */}
                    {method === 'stage' && (
                        <Box>
                            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                                타겟 없이 <b>현재 시편 화면 그대로</b> 캘리브레이션합니다.
                                스테이지 이동량(엔코더)을 기준으로 스케일과 회전각을 실측합니다.
                            </Typography>

                            <SectionLabel>STEP SIZE (mm/axis)</SectionLabel>
                            <Stack direction="row" spacing={0.75} mb={1}>
                                {STEP_PRESETS.map(v => (
                                    <Chip
                                        key={v}
                                        label={`±${v}`}
                                        size="small"
                                        variant={stageStepMm === v ? 'filled' : 'outlined'}
                                        color={stageStepMm === v ? 'primary' : 'default'}
                                        onClick={() => !stageRunning && setStageStepMm(v)}
                                        sx={{ flex: 1, fontWeight: 700 }}
                                    />
                                ))}
                                <TextField
                                    size="small"
                                    type="number"
                                    value={stageStepMm}
                                    onChange={e => setStageStepMm(Math.max(0.02, Math.min(5, parseFloat(e.target.value) || 0.5)))}
                                    disabled={stageRunning}
                                    inputProps={{ step: 0.1, style: { padding: '4px 8px', width: 52, textAlign: 'center' } }}
                                />
                            </Stack>

                            {!stageRunning && (
                                <Alert severity="info" icon={false} sx={{ py: 0.25, mb: 1.5, '& .MuiAlert-message': { fontSize: 12 } }}>
                                    X/Y 서보 ON 상태여야 하며, 축이 ±{stageStepMm} mm 씩 저속 왕복 이동합니다.
                                </Alert>
                            )}

                            {!stageRunning ? (
                                <Button
                                    variant="contained"
                                    color="secondary"
                                    onClick={handleStartStage}
                                    fullWidth
                                    startIcon={<PlayArrowIcon />}
                                    sx={{ borderRadius: 2, fontWeight: 'bold', textTransform: 'none' }}
                                >
                                    Start Auto Calibration
                                </Button>
                            ) : (
                                <Box>
                                    <LinearProgress variant="determinate" value={stageStatus.progress} sx={{ borderRadius: 1, height: 8, mb: 0.75 }} />
                                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                                        <Typography variant="caption" color="text.secondary">
                                            {stageStatus.message || stageStatus.step}
                                        </Typography>
                                        <Typography variant="caption" fontWeight={700}>
                                            {Math.round(stageStatus.progress)}%
                                        </Typography>
                                    </Stack>
                                    <Button
                                        variant="outlined"
                                        color="error"
                                        onClick={() => abortStageCalib()}
                                        fullWidth
                                        startIcon={<StopIcon />}
                                        sx={{ textTransform: 'none', fontWeight: 700 }}
                                    >
                                        Abort
                                    </Button>
                                </Box>
                            )}

                            {stageStatus.error && !stageRunning && (
                                <Alert severity="error" sx={{ mt: 1.5, py: 0.25, '& .MuiAlert-message': { fontSize: 12 } }}>
                                    {stageStatus.error}
                                </Alert>
                            )}

                            {stageStatus.result && !stageRunning && !stageStatus.error && (
                                <Paper variant="outlined" sx={{ p: 1.25, mt: 1.5, bgcolor: alpha(theme.palette.success.main, 0.06), borderColor: alpha(theme.palette.success.main, 0.35) }}>
                                    <Typography variant="caption" fontWeight={700} color="success.main" display="block" mb={0.5}>
                                        Stage calibration complete
                                    </Typography>
                                    <ResultRow label="Scale X" value={`${(stageStatus.result.scaleX * 1000).toFixed(4)} µm/px`} />
                                    <ResultRow label="Scale Y" value={`${(stageStatus.result.scaleY * 1000).toFixed(4)} µm/px`} />
                                    <ResultRow label="Rotation" value={`${stageStatus.result.rotationDeg.toFixed(3)}°`} />
                                    <ResultRow label="Orthogonality" value={`${stageStatus.result.orthoDeg.toFixed(3)}°`} />
                                    <ResultRow label="Match score X / Y" value={`${stageStatus.result.scoreX.toFixed(2)} / ${stageStatus.result.scoreY.toFixed(2)}`} />
                                    <ResultRow label="Backlash X / Y" value={`${stageStatus.result.backlashXPx.toFixed(2)} / ${stageStatus.result.backlashYPx.toFixed(2)} px`} />
                                </Paper>
                            )}
                        </Box>
                    )}

                    <Divider />

                    {/* ==================== RESULT & SAVE (공통) ==================== */}
                    <Box>
                        <SectionLabel
                            right={
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                    {methodChipLabel && (
                                        <Chip size="small" variant="outlined" label={methodChipLabel} sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />
                                    )}
                                    <RmsBadge rmsPx={resultRmsPx} />
                                </Stack>
                            }
                        >
                            CALCULATED SCALE (mm/px)
                        </SectionLabel>
                        <Stack direction="row" spacing={1}>
                            <TextField
                                label="Scale X"
                                size="small"
                                type="number"
                                value={calculatedScaleX || ''}
                                onChange={e => setScale(parseFloat(e.target.value) || 0, calculatedScaleY)}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                inputProps={{ step: 0.00001 }}
                                helperText={calculatedScaleX > 0 ? `${(calculatedScaleX * 1000).toFixed(4)} µm/px` : ' '}
                            />
                            <TextField
                                label="Scale Y"
                                size="small"
                                type="number"
                                value={calculatedScaleY || ''}
                                onChange={e => setScale(calculatedScaleX, parseFloat(e.target.value) || 0)}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                inputProps={{ step: 0.00001 }}
                                helperText={calculatedScaleY > 0 ? `${(calculatedScaleY * 1000).toFixed(4)} µm/px` : ' '}
                            />
                        </Stack>

                        {Math.abs(rotationDeg) > 0.001 && (
                            <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                                Rotation: <b>{rotationDeg.toFixed(3)}°</b> (저장 시 rotation_deg 에 기록됩니다)
                            </Typography>
                        )}

                        {anisoPct > 1 && (
                            <Alert severity="warning" sx={{ mt: 1, py: 0.25, '& .MuiAlert-message': { fontSize: 12 } }}>
                                Scale X/Y 편차 {anisoPct.toFixed(1)}% — 타겟 기울어짐 또는 광학계를 확인하세요.
                            </Alert>
                        )}
                    </Box>

                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleApply}
                        fullWidth
                        size="large"
                        disabled={stageRunning || isDetecting}
                        startIcon={<SaveIcon />}
                        sx={{ borderRadius: 2, fontWeight: 'bold' }}
                    >
                        Save Calibration
                    </Button>

                    <Divider />

                    {/* ==================== HISTORY ==================== */}
                    <Box>
                        <SectionLabel
                            right={
                                <IconButton size="small" onClick={() => loadHistory(profile)} sx={{ mr: -0.5 }}>
                                    <RefreshIcon fontSize="inherit" />
                                </IconButton>
                            }
                        >
                            HISTORY
                        </SectionLabel>
                        <Paper variant="outlined" sx={{ maxHeight: 120, overflow: 'auto', bgcolor: 'transparent', borderStyle: 'dashed' }}>
                            <List dense disablePadding>
                                {history.map((item) => {
                                    // Fuzzy Timestamp Match (5초 허용)
                                    let isCurrent = false;
                                    if (currentData?.meta?.timestamp && item.timestamp) {
                                        const currentTs = new Date(currentData.meta.timestamp).getTime();
                                        const historyTs = new Date(item.timestamp).getTime();
                                        if (!isNaN(currentTs) && !isNaN(historyTs)) {
                                            isCurrent = Math.abs(currentTs - historyTs) < 5000;
                                        } else {
                                            isCurrent = currentData.meta.timestamp === item.timestamp;
                                        }
                                    }
                                    return (
                                        <ListItem
                                            key={item.filename}
                                            secondaryAction={
                                                <Stack direction="row" spacing={0.5}>
                                                    <Tooltip title="Rollback and Apply this version">
                                                        <IconButton
                                                            edge="end"
                                                            aria-label="rollback"
                                                            size="small"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                rollback(profile, item.filename);
                                                            }}
                                                        >
                                                            <RestoreIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Delete">
                                                        <IconButton
                                                            edge="end"
                                                            aria-label="delete"
                                                            size="small"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                showConfirm("Are you sure you want to delete this history item?", () => {
                                                                    deleteHistoryItem(profile, item.filename);
                                                                }, 'Delete');
                                                            }}
                                                            color="error"
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Stack>
                                            }
                                            divider
                                            disablePadding
                                            sx={{
                                                bgcolor: isCurrent ? alpha(theme.palette.success.main, 0.08) : 'transparent',
                                                borderLeft: isCurrent ? `3px solid ${theme.palette.success.main}` : '3px solid transparent'
                                            }}
                                        >
                                            <ListItemButton
                                                selected={selectedHistory === item.filename}
                                                onClick={() => setSelectedHistory(item.filename)}
                                                sx={{
                                                    py: 0.5,
                                                    pr: 8,
                                                    '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.1) },
                                                    '&.Mui-selected:hover': { bgcolor: alpha(theme.palette.primary.main, 0.15) }
                                                }}
                                            >
                                                <ListItemText
                                                    primary={new Date(item.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                                                    secondary={`Op: ${item.operator}`}
                                                    primaryTypographyProps={{
                                                        fontSize: 13,
                                                        fontWeight: isCurrent ? 700 : 500,
                                                        color: isCurrent ? 'success.main' : 'text.primary'
                                                    }}
                                                    secondaryTypographyProps={{ fontSize: 11 }}
                                                />
                                            </ListItemButton>
                                        </ListItem>
                                    );
                                })}
                                {history.length === 0 && (
                                    <Box p={2} textAlign="center">
                                        <Typography variant="caption" color="text.secondary">No history records found.</Typography>
                                    </Box>
                                )}
                            </List>
                        </Paper>
                    </Box>
                </Stack>
            </FloatingWindow>

            <MessageDialog
                open={dialogState.open}
                title={dialogState.title}
                message={dialogState.message}
                showCancel={dialogState.showCancel}
                confirmText={dialogState.confirmText}
                onConfirm={dialogState.onConfirm}
                onClose={handleCloseDialog}
            />
        </>
    );
}
