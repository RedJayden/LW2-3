import React, { useEffect, useState, useMemo } from 'react';
import { Box, Typography, TextField, InputAdornment, Checkbox, IconButton, Popover, FormControlLabel } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useLocation } from 'react-router-dom';

// Icons
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import CloseIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import Tooltip from '@mui/material/Tooltip';
import FormatColorFillIcon from '@mui/icons-material/FormatColorFill';
import GridOnIcon from '@mui/icons-material/GridOn';

import * as fabric from 'fabric';
import { useCanvasStore } from '../Canvas/useCanvasStore';
import { useAppStore } from '../../../../store/appStore';
import ColorPicker from './ColorPicker';
import FontPicker from './FontPicker';
import FillSettingsDialog from './FillSettingsDialog';
import { IFillSettings } from '../../../../types/cad';
import { resolveStyleSourceObject, collectStyleLeafObjects, replaceColorKeepAlpha } from '../../../../utils/colorUtils';

const defaultFillSettings: IFillSettings = {
    enableProfile: true,
    profileStartPoint: 'LT',
    profileDirection: 'CW',
    enableFill: false,
    fillType: 'OneWay',
    fillProgression: 'T2B',
    angle: 0,
    lineSpacing: 0.1,
    margin: 0
};

/** Helper for Real-time Image Binarization/Edge Processing with Denoising - Optimized to use HTMLImageElement */
const processImageForPreview = (img: HTMLImageElement, threshold: number, strokeColor: string, edgeDetection: boolean): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const w = img.width;
    const h = img.height;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const outputData = ctx.createImageData(w, h);
    const out = outputData.data;

    const color = new fabric.Color(strokeColor);
    const [rOut, gOut, bOut] = color.getSource();
    const sensitivity = threshold;
    const grayThreshold = sensitivity / 100;

    const binarized = new Uint8Array(w * h);

    if (edgeDetection) {
        // Edge Detection Mode preview logic
        const edgeThresholdBar = (0.25 * (100 - sensitivity) / 100);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                const idx = i * 4;
                if (x < w - 1 && y < h - 1) {
                    const rIdx = idx + 4;
                    const bIdx = idx + w * 4;

                    const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 765;
                    const rGray = (data[rIdx] + data[rIdx + 1] + data[rIdx + 2]) / 765;
                    const bGray = (data[bIdx] + data[bIdx + 1] + data[bIdx + 2]) / 765;

                    const alpha = data[idx + 3] / 255;
                    const rAlpha = data[rIdx + 3] / 255;
                    const bAlpha = data[bIdx + 3] / 255;

                    const diff = Math.abs(gray - rGray) + Math.abs(gray - bGray) +
                        Math.abs(alpha - rAlpha) + Math.abs(alpha - bAlpha);

                    if (diff > edgeThresholdBar) binarized[i] = 1;
                }
            }
        }
    } else {
        // Standard Binarization Mode
        for (let i = 0; i < w * h; i++) {
            const idx = i * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const gray = (r + g + b) / 765;
            const alpha = data[idx + 3] / 255;
            if (alpha > 0.1 && gray < grayThreshold) binarized[i] = 1;
        }
    }

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const idx = i * 4;
            if (binarized[i]) {
                if (sensitivity >= 90) {
                    let neighbors = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            const nx = x + dx; const ny = y + dy;
                            if (nx >= 0 && nx < w && ny >= 0 && ny < h && binarized[ny * w + nx]) neighbors++;
                        }
                    }
                    if (neighbors < 1) continue;
                }
                out[idx] = rOut; out[idx + 1] = gOut; out[idx + 2] = bOut; out[idx + 3] = 255;
            } else {
                out[idx + 3] = 0;
            }
        }
    }
    ctx.putImageData(outputData, 0, 0);
    return canvas.toDataURL();
};

/** Helper to calculate logical (stroke-free) bounds of a Group or ActiveSelection */
const getGroupLogicalSize = (group: fabric.Group | fabric.ActiveSelection) => {
    const objects = group.getObjects();
    if (objects.length === 0) return { width: 0, height: 0 };

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    objects.forEach(obj => {
        const halfW = (obj.width || 0) / 2;
        const halfH = (obj.height || 0) / 2;
        const corners = [
            new fabric.Point(-halfW, -halfH),
            new fabric.Point(halfW, -halfH),
            new fabric.Point(halfW, halfH),
            new fabric.Point(-halfW, halfH)
        ];
        const childMatrix = obj.calcTransformMatrix();
        corners.forEach(p => {
            const transformed = fabric.util.transformPoint(p, childMatrix);
            if (transformed.x < minX) minX = transformed.x;
            if (transformed.x > maxX) maxX = transformed.x;
            if (transformed.y < minY) minY = transformed.y;
            if (transformed.y > maxY) maxY = transformed.y;
        });
    });

    return {
        width: maxX - minX,
        height: maxY - minY
    };
};

export default function CanvasTopBar() {
    const location = useLocation();
    const isRecipePage = location.pathname.toLowerCase().includes('recipe');

    const {
        selectedObject, canvas, pxPerMm, viewMode, magnification,
        setShowMatrixDialog, showFillSettingsDialog, setShowFillSettingsDialog,
        isProcessingLocal, hideOverlays,
    } = useCanvasStore();
    const theme = useTheme();

    const [props, setProps] = useState({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        angle: 0,
        fillEnabled: true,
        fill: '#000000',
        fillOpacity: 100,
        strokeEnabled: true,
        stroke: '#000000',
        strokeWidth: 1,
        fontFamily: 'Arial',
        fontSize: 20,
        fontWeight: 'normal',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
        markPointTime: 0.02,
        /** 매트릭스 셀 선택 시, 해당 셀의 개별 Z 오프셋(mm). zStep 누적값 위에 더해진다. */
        cellZOffset: 0,
        lockProportion: false,
        fillSettings: defaultFillSettings,
        threshold: 50,
        edgeDetection: true,
    });

    const cachedImageRef = React.useRef<HTMLImageElement | null>(null);
    const debounceTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const lastProcessedRef = React.useRef<{ src: string, threshold: number, color: string, edgeDetection: boolean } | null>(null);
    const isUpdatingRef = React.useRef(false);
    const isEditingRef = React.useRef(false);

    const handleFocus = () => { isEditingRef.current = true; };
    const handleBlur = () => { 
        isEditingRef.current = false;
        // [FIX] Force sync UI state with actual Fabric state after editing is done
        if (selectedObject && canvas) {
            canvas.fire('object:modified', { target: selectedObject });
        }
    };

    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    // 'color' = 대표 색상(Fill·Line 공통, 가공 레이어 색상) 편집. 'stroke'는 이미지
    // 이진화 미리보기 등 stroke 단독 편집 경로에서만 사용한다.
    const [activeColorKey, setActiveColorKey] = useState<'fill' | 'stroke' | 'color' | null>(null);
    const [fontPopoverAnchor, setFontPopoverAnchor] = useState<HTMLElement | null>(null);
    const [previewOriginFont, setPreviewOriginFont] = useState<string | null>(null);

    const [activeCellInfo, setActiveCellInfo] = useState<{
        repeater: fabric.Object;
        row: number;
        col: number;
        cellKey: string;
        override: any;
    } | null>(null);

    // Toggle dialog visibility when object selection changes
    useEffect(() => {
        if (!selectedObject) {
            setShowFillSettingsDialog(false);
            return;
        }
        
        const isGroup = selectedObject.type?.toLowerCase() === 'activeselection' || selectedObject.type?.toLowerCase() === 'group';
        // [FIX] 컨테이너(MatrixRepeater/Group)는 fabric 기본값(검은 fill 등)을 갖고 있어, 이를 그대로
        // firstObj로 쓰면 실제 셀/엔티티와 다른 값이 표시된다. leaf까지 내려가 실체를 읽는다(이슈 3-①).
        const firstObj = isGroup
            ? (selectedObject as fabric.ActiveSelection).getObjects()[0]
            : selectedObject.type === 'MatrixRepeater'
                ? resolveStyleSourceObject(selectedObject)
                : selectedObject;
        // [이슈 4] 매트릭스 선택 시에는 Fill 편집을 제공하지 않으므로 Fill 설정 다이얼로그도 열지 않는다.
        const hasFill = selectedObject.type !== 'MatrixRepeater' && (firstObj as any)?.fillEnabled === true;

        setShowFillSettingsDialog(hasFill);
    }, [selectedObject, setShowFillSettingsDialog]);

    useEffect(() => {
        if (!canvas) return;

        const handleCellSelected = (e: any) => {
            setActiveCellInfo({
                repeater: e.target,
                row: e.row,
                col: e.col,
                cellKey: e.cellKey,
                override: e.override || {}
            });
        };

        const handleCellDeselected = () => {
            setActiveCellInfo(null);
        };

        canvas.on('matrix:cell:selected', handleCellSelected);
        canvas.on('matrix:cell:deselected', handleCellDeselected);
        
        const handleSelectionCleared = () => {
            setActiveCellInfo(null);
        };
        canvas.on('selection:cleared', handleSelectionCleared);
        canvas.on('selection:created', handleSelectionCleared);

        return () => {
            canvas.off('matrix:cell:selected', handleCellSelected);
            canvas.off('matrix:cell:deselected', handleCellDeselected);
            canvas.off('selection:cleared', handleSelectionCleared);
            canvas.off('selection:created', handleSelectionCleared);
        };
    }, [canvas]);

    const isText = selectedObject instanceof fabric.IText;
    const isDot = (selectedObject as any)?.id === 'dot_marker' || 
                  (selectedObject?.type === 'MatrixRepeater' && (selectedObject as any).sourceObjects?.[0]?.id === 'dot_marker');
    const isGroup = selectedObject?.type?.toLowerCase() === 'activeselection' || selectedObject?.type?.toLowerCase() === 'group';

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (['Backspace', 'Delete'].includes(e.key)) {
            if ((e.target as HTMLElement).tagName.toLowerCase() === 'input') return;
            e.stopPropagation();
        }
    };

    useEffect(() => {
        if (selectedObject && canvas) {
            const updateProps = (force = false) => {
                if (!force && (isUpdatingRef.current || isEditingRef.current)) return;
                const getHexColor = (color: string | null | undefined): string => {
                    if (!color || color === 'transparent') return '#000000';
                    try { return `#${new fabric.Color(color).toHex()}`; } catch { return '#000000'; }
                };

                const getOpacity = (color: string | null | undefined): number => {
                    if (!color || color === 'transparent') return 100;
                    try { return (new fabric.Color(color).getAlpha() ?? 1) * 100; } catch { return 100; }
                };

                const isGroup = selectedObject.type.toLowerCase() === 'activeselection' || selectedObject.type.toLowerCase() === 'group';
                // [FIX] 컨테이너(MatrixRepeater/Group)는 fabric 기본값(검은 fill 등)을 갖고 있어, 이를
                // 그대로 firstObj로 쓰면 실제 셀/엔티티와 다른 값(예: Fill 체크됨, Line 색상 검정)이
                // 잘못 표시된다. 단일 DXF는 sourceObjects[0]가 다시 Group이므로 한 단계 위임으로는
                // 부족하다 — leaf까지 내려가 실체를 읽는다(이슈 3-①, resolveStyleSourceObject).
                const firstObj = isGroup
                    ? (selectedObject as fabric.ActiveSelection).getObjects()[0]
                    : selectedObject.type === 'MatrixRepeater'
                        ? resolveStyleSourceObject(selectedObject)
                        : selectedObject;
                if (!firstObj) return;

                const actualFill = (firstObj.fill as string) || 'transparent';
                const actualStroke = (firstObj.stroke as string) || 'transparent';

                let fillColor = actualFill;
                if (actualFill === 'transparent' && firstObj.customData?.originalFill) {
                    fillColor = firstObj.customData.originalFill;
                } else if (actualFill === 'transparent') {
                    fillColor = '#00BEFF';
                }

                let strokeColor = actualStroke;
                if (actualStroke === 'transparent' && firstObj.customData?.originalStroke) {
                    strokeColor = firstObj.customData.originalStroke;
                } else if (actualStroke === 'transparent') {
                    strokeColor = '#00BEFF';
                }
                const center = selectedObject.getCenterPoint();

                // [Camera-Relative] 도형의 물리 좌표를 현재 카메라 뷰 중심 기준으로 표시.
                // scene = 절대 기계 좌표이며 카메라 뷰 중심 = 현재 스테이지 위치이므로,
                // 표시값 = scene(mm) - 스테이지 위치. (recipeCenter 스냅숏은 개입 금지 - sceneCoords.ts 참조)
                const { positions } = useAppStore.getState();
                const laserX = viewMode === 'canvas' ? 0 : positions.X;
                const laserY = viewMode === 'canvas' ? 0 : positions.Y;

                let logicalW = 0;
                let logicalH = 0;
                if (isGroup) {
                    // [FIX] getGroupLogicalSize()는 obj.calcTransformMatrix()(그룹 변환 포함, 절대값)로
                    // 계산하므로 이미 그룹 자체의 scaleX/scaleY가 반영되어 있다. 여기서 다시 곱하면
                    // 그룹 스케일이 제곱되어(예: DXF 임포트 직후 그룹 스케일이 pxPerMm인 경우)
                    // Gr.W/Gr.H가 실제보다 수백~수천 배 부풀려 표시되는 버그가 있었다.
                    const logicalSize = getGroupLogicalSize(selectedObject as fabric.ActiveSelection);
                    logicalW = logicalSize.width;
                    logicalH = logicalSize.height;
                } else {
                    logicalW = (selectedObject.width || 0) * (selectedObject.scaleX || 1);
                    logicalH = (selectedObject.height || 0) * (selectedObject.scaleY || 1);
                }

                // If a MatrixRepeater cell is selected, show that specific cell's coordinate & mark time overrides
                let finalLeft = Number(((center.x / pxPerMm.x) - laserX).toFixed(3));
                let finalTop = Number(((-center.y / pxPerMm.y) - laserY).toFixed(3));
                let finalMarkTime = (firstObj as any).markPointTime !== undefined ? (firstObj as any).markPointTime : (viewMode === 'scanner' ? 0.2 : 1.0);
                let finalCellZOffset = 0;

                if (selectedObject?.type === 'MatrixRepeater' && activeCellInfo) {
                    const repeater = selectedObject as any;
                    const r = activeCellInfo.row;
                    const c = activeCellInfo.col;
                    const isReverse = repeater.isZigzag && (r % 2 !== 0);
                    const actualCol = isReverse ? (repeater.xCount - 1 - c) : c;

                    const override = repeater.overrides?.[`${r}_${c}`] || {};
                    const srcObj = repeater.sourceObjects?.[0];
                    if (srcObj) {
                        // [FIX] repeater.left/top은 override로 확장된 바운딩 박스 기준으로 보정되어
                        // 있으므로, 셀의 실제 scene 좌표는 반드시 getCellSceneOrigin()을 통해 구한다.
                        const origin = repeater.getCellSceneOrigin(r, actualCol, override);
                        const cellGlobalX = origin.x + srcObj.left;
                        const cellGlobalY = origin.y + srcObj.top;

                        finalLeft = Number(((cellGlobalX / pxPerMm.x) - laserX).toFixed(3));
                        finalTop = Number(((-cellGlobalY / pxPerMm.y) - laserY).toFixed(3));

                        if (override.markTime !== undefined) {
                            finalMarkTime = override.markTime;
                        } else {
                            finalMarkTime = srcObj.markPointTime || 0.2;
                        }

                        logicalW = (srcObj.width || 0) * (srcObj.scaleX || 1) * (override.scaleX || 1);
                        logicalH = (srcObj.height || 0) * (srcObj.scaleY || 1) * (override.scaleY || 1);

                        // [NEW] 이 셀에 개별 Fill/Stroke override가 걸려있으면 그 값을 표시한다.
                        if (override.fill !== undefined) fillColor = override.fill;
                        if (override.stroke !== undefined) strokeColor = override.stroke;
                    }

                    const cellIndex = r * repeater.xCount + c;
                    finalCellZOffset = repeater.computeAbsoluteZ(cellIndex, override, useAppStore.getState().positions.Z);
                }
                


                setProps(p => ({
                    ...p,
                    left: finalLeft,
                    top: finalTop,
                    width: Number((logicalW / pxPerMm.x).toFixed(3)),
                    height: Number((logicalH / pxPerMm.y).toFixed(3)),
                    angle: Number((selectedObject.angle || 0).toFixed(2)),
                    fillEnabled: actualFill !== 'transparent' && actualFill !== undefined && actualFill !== null,
                    fill: getHexColor(fillColor),
                    fillOpacity: Math.round(getOpacity(fillColor)),
                    strokeEnabled: actualStroke !== 'transparent' && actualStroke !== undefined && actualStroke !== null,
                    stroke: getHexColor(strokeColor as string),
                    strokeWidth: (firstObj as any).isHairline ? 0 : (firstObj.strokeWidth !== undefined ? firstObj.strokeWidth : 1),
                    fontFamily: (firstObj as fabric.IText).fontFamily || 'Arial',
                    fontSize: Math.round(((firstObj as fabric.IText).fontSize || 20) * ((firstObj as fabric.IText).scaleY || 1)),
                    fontWeight: ((firstObj as fabric.IText).fontWeight || 'normal').toString(),
                    fontStyle: (firstObj as fabric.IText).fontStyle || 'normal',
                    underline: (firstObj as fabric.IText).underline || false,
                    textAlign: (firstObj as fabric.IText).textAlign || 'left',
                    markPointTime: finalMarkTime,
                    cellZOffset: finalCellZOffset,
                    fillSettings: (firstObj as any).fillSettings || defaultFillSettings,
                    threshold: (firstObj as any).threshold ?? (useCanvasStore.getState().gcodeSettings.threshold || 50),
                    edgeDetection: (firstObj as any).edgeDetection ?? true,
                }));

                // Optimize: Pre-cache image for binarization performance
                if (firstObj instanceof fabric.Image) {
                    const originalSrc = (firstObj as any).originalSrc || (firstObj as fabric.Image).getSrc();
                    if (cachedImageRef.current?.src !== originalSrc) {
                        const img = new Image();
                        img.onload = () => { cachedImageRef.current = img; };
                        img.src = originalSrc;
                    }
                }
            };

            // [FIX] Force update when a new object is selected, regardless of isEditingRef
            updateProps(true);
            const objListeners = ['modified', 'scaling', 'moving', 'rotating', 'skewing', 'resizing'];
            objListeners.forEach(evt => selectedObject.on(evt as any, updateProps));
            
            // [FIX] Canvas-level listeners often duplicate object-level ones.
            // Only listen to 'object:modified' on canvas for external changes.
            canvas.on('object:modified', updateProps);
            
            // Subscribe to positions changes without triggering full component re-render
            const unsubPositions = useAppStore.subscribe(
                (state) => state.positions,
                (newPos, prevPos) => {
                    if (isUpdatingRef.current || isEditingRef.current) return;
                    if (Math.abs(newPos.X - prevPos.X) > 0.001 || Math.abs(newPos.Y - prevPos.Y) > 0.001) {
                        updateProps();
                    }
                }
            );
            
            return () => {
                objListeners.forEach(evt => selectedObject.off(evt as any, updateProps));
                canvas.off('object:modified', updateProps);
                unsubPositions();
            };
        }
    }, [selectedObject, canvas, pxPerMm, viewMode, activeCellInfo]);

    const handleChange = (key: string, value: any) => {
        if (!selectedObject || !canvas) return;

        let finalValue = value;
        let updates: any = {};

        const constructColor = (hex: string, opacity: number) => {
            const c = new fabric.Color(hex);
            c.setAlpha(opacity / 100);
            return c.toRgba();
        };

        const isGroup = selectedObject.type.toLowerCase() === 'activeselection' || selectedObject.type.toLowerCase() === 'group';
        
        const applyOriginalColorToSelection = (prop: 'originalFill' | 'originalStroke', val: any) => {
            const objs = isGroup ? (selectedObject as any).getObjects() : [selectedObject];
            objs.forEach((obj: any) => {
                if (!obj.customData) obj.customData = {};
                obj.customData[prop] = val;
                obj.dirty = true;
            });
            if (isGroup) {
                selectedObject.set('objectCaching', false);
                selectedObject.dirty = true;
            }
        };
        const applyToSelection = (prop: string, val: any) => {
            if (isGroup) {
                const objs = selectedObject.type.toLowerCase() === 'activeselection'
                    ? (selectedObject as fabric.ActiveSelection).getObjects()
                    : (selectedObject as fabric.Group).getObjects();
                
                objs.forEach(obj => {
                    obj.set(prop as any, val);
                    obj.dirty = true;
                });
                
                // Force parent group cache invalidation so styling updates visually immediately
                selectedObject.set('objectCaching', false);
                selectedObject.dirty = true;
            } else {
                selectedObject.set(prop as any, val);
                selectedObject.dirty = true;
                
                // Matrix virtual child override handling
                if ((selectedObject as any).customData?.isMatrixChild) {
                    const parentSessionId = (selectedObject as any).customData.parentSessionId;
                    const parentObj = canvas.getObjects().find(
                        (o: any) => o.type === 'MatrixRepeater' && o.customData?.matrixSessionId === parentSessionId
                    ) as any;
                    
                    if (parentObj) {
                        const r = (selectedObject as any).customData.row;
                        const c = (selectedObject as any).customData.col;
                        const cellKey = `${r}_${c}`;
                        if (!parentObj.overrides[cellKey]) parentObj.overrides[cellKey] = {};
                        parentObj.overrides[cellKey][prop] = val;
                        parentObj.dirty = true;
                    }
                }
                
                // If nested inside a parent group, force its cache invalidation too
                if (selectedObject.group) {
                    selectedObject.group.set('objectCaching', false);
                    selectedObject.group.dirty = true;
                }
            }
            canvas.requestRenderAll();
        };

        if (key === 'fillEnabled') {
            if (!value) {
                applyOriginalColorToSelection('originalFill', props.fill);
            }
            // [FIX] Fill 색상은 항상 Line(stroke) 색상을 따라간다 — 독립적으로 지정하지 않는다.
            const colorToUse = props.stroke || props.fill || '#00BEFF';

            let currentOpacity = props.fillOpacity;
            if (value && currentOpacity === 100) {
                currentOpacity = 50;
            }

            finalValue = value ? (colorToUse || '#00BEFF') : 'transparent';
            if (value) finalValue = constructColor(colorToUse || '#00BEFF', currentOpacity);
            applyToSelection('fill', finalValue);
            updates = { fillEnabled: value, fill: colorToUse || '#00BEFF', fillOpacity: currentOpacity };
        } else if (key === 'fillOpacity') {
            finalValue = Number(value);
            const color = constructColor(props.fill, finalValue);
            if (props.fillEnabled) applyToSelection('fill', color);
            updates = { fillOpacity: finalValue };
        } else if (key === 'strokeEnabled') {
            if (!value) {
                applyOriginalColorToSelection('originalStroke', props.stroke);
            }
            finalValue = value ? (props.stroke || '#00BEFF') : 'transparent';
            applyToSelection('stroke', finalValue);
            updates = { strokeEnabled: value };
        } else if (key === 'strokeWidth') {
            updates = { strokeWidth: Number(value) };
            applyToSelection('strokeWidth', Number(value));
        } else if (key === 'fillSettings') {
            applyToSelection('fillSettings', value);
            updates = { fillSettings: value };
        } else if (key === 'representativeColor') {
            // [NEW 2026-07-22] 대표 색상(=가공 레이어 색상) 단일 적용 경로.
            // [Design Pattern: Facade] Fill/Line/Color 스와치 어디를 클릭해도 이 경로 하나로
            // 색상이 갱신된다. Fill/Line 체크 상태와 무관하게 항상 동작해야 한다 — Line 해제
            // (내부 가공만) 도형·Dot에서 색상 변경 진입점이 사라지던 데드엔드를 제거한다.
            // "Fill 색상은 Line 색상을 따른다" 정책은 유지된다(두 채널에 같은 hex 적용).
            // 컨테이너(Dot 그룹/DXF 그룹/MatrixRepeater)는 resolveStyleSourceObject와 같은
            // 규칙으로 leaf까지 내려가 실체에 적용한다 — 판정(read)과 적용(write)의 대칭 유지.
            const hex = value as string;
            collectStyleLeafObjects(selectedObject).forEach((l: fabric.Object) => {
                const leaf = l as any;
                if (!leaf.customData) leaf.customData = {};
                // 채널이 꺼져 있어도(transparent) 색 정체성은 보존 → 다시 켜면 이 색으로 복원
                leaf.customData.originalStroke = hex;
                leaf.customData.originalFill = hex;
                // Use Default Parameters로 강제 재색상된 상태에서 사용자가 명시적으로 색을
                // 바꾼 경우, 강제 해제 시의 복원 목표(originalColor 스냅샷)도 새 색으로
                // 갱신한다 — 해제 한 번에 사용자의 명시적 선택이 소실되는 것을 방지
                // (사용자 의도 우선 원칙). 채널 구조(stroke/fill 유무·알파)는 스냅샷 원형 유지.
                if (leaf.customData.forcedByDefaultParams && leaf.customData.originalColor) {
                    const snap = leaf.customData.originalColor;
                    if (snap.stroke && snap.stroke !== 'transparent') snap.stroke = hex;
                    if (snap.fill && snap.fill !== 'transparent') snap.fill = replaceColorKeepAlpha(snap.fill, hex);
                }
                if (leaf.stroke && leaf.stroke !== 'transparent') leaf.set('stroke', hex);
                if (leaf.fill && leaf.fill !== 'transparent') leaf.set('fill', replaceColorKeepAlpha(leaf.fill, hex));
                leaf.dirty = true;
                if (leaf.group) {
                    leaf.group.set('objectCaching', false);
                    leaf.group.dirty = true;
                }
            });
            // MatrixRepeater 셀별 fill/stroke override도 캐스케이드 (useDefaultParameters와 동일 정책)
            if ((selectedObject as any).type === 'MatrixRepeater' && (selectedObject as any).overrides) {
                Object.values((selectedObject as any).overrides).forEach((ov: any) => {
                    if (ov.stroke !== undefined) ov.stroke = hex;
                    if (ov.fill !== undefined) ov.fill = replaceColorKeepAlpha(ov.fill, hex);
                });
            }
            (selectedObject as any).dirty = true;
            updates = { stroke: hex, fill: hex };
        } else if (key === 'threshold' || key === 'stroke' || key === 'edgeDetection') {
            const threshold = key === 'threshold' ? Number(value) : props.threshold;
            const stroke = key === 'stroke' ? value : props.stroke;
            const edgeDetection = key === 'edgeDetection' ? Boolean(value) : props.edgeDetection;

            updates = { [key]: value };
            applyToSelection(key, value);
            if (key === 'stroke') {
                applyOriginalColorToSelection('originalStroke', value);
                // [FIX] Fill 색상은 항상 Line 색상을 따라간다 — Line이 바뀌면 Fill도 같이 갱신.
                applyOriginalColorToSelection('originalFill', value);
                updates.fill = value;
                if (props.fillEnabled) {
                    applyToSelection('fill', constructColor(value, props.fillOpacity));
                }
            }

            // Optimized Real-time Update for Image with Debouncing
            if (selectedObject instanceof fabric.Image && cachedImageRef.current) {
                if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

                debounceTimeoutRef.current = setTimeout(() => {
                    const cache = lastProcessedRef.current;
                    if (cache && cache.src === cachedImageRef.current?.src && cache.threshold === threshold && cache.color === stroke && cache.edgeDetection === edgeDetection) return;

                    const newSrc = processImageForPreview(cachedImageRef.current!, threshold, stroke, edgeDetection);
                    (selectedObject as fabric.Image).setSrc(newSrc).then(() => {
                        lastProcessedRef.current = { src: cachedImageRef.current!.src, threshold, color: stroke, edgeDetection };
                        canvas.requestRenderAll();
                    });
                    debounceTimeoutRef.current = null;
                }, 50); // 50ms for responsive feel but avoiding thread lock
            }
        } else {
            if (typeof value === 'boolean') {
                applyToSelection(key, value);
                updates = { [key]: value };
            } else {
                const numVal = Number(value);
                // [FIX] isNaN 대신 Number.isFinite 사용: Infinity 입력('1e999' 등)의 객체 유입 차단
                if (Number.isFinite(numVal) && value !== '') {
                    let clampedVal = numVal;
                    const { stageLimit } = useAppStore.getState();

                    if (key === 'left') {
                        clampedVal = Math.max(stageLimit.minX, Math.min(stageLimit.maxX, clampedVal));
                    } else if (key === 'top') {
                        clampedVal = Math.max(stageLimit.minY, Math.min(stageLimit.maxY, clampedVal));
                    } else if (key === 'width') {
                        // [FIX] 커밋이 onBlur 시점으로 일원화되어 중간 타이핑 '0' 보존이 불필요해짐.
                        // 하한을 0.001mm로 복원하여 scaleX=0(특이행렬) 적용을 원천 차단한다.
                        const maxW = stageLimit.maxX - stageLimit.minX;
                        clampedVal = Math.max(0.001, Math.min(maxW, clampedVal));
                    } else if (key === 'height') {
                        const maxH = stageLimit.maxY - stageLimit.minY;
                        clampedVal = Math.max(0.001, Math.min(maxH, clampedVal));
                    } else if (key === 'angle') {
                        clampedVal = Math.max(-360, Math.min(360, clampedVal));
                    }

                    if (key === 'left') {
                        // [Camera-Relative] 입력값(카메라 뷰 중심 기준 mm)을 절대 scene Pixel로 역산.
                        const { positions } = useAppStore.getState();
                        const laserX = viewMode === 'canvas' ? 0 : positions.X;
                        const newAbsX = clampedVal + laserX;
                        const newX = newAbsX * pxPerMm.x;
                        
                        if (selectedObject?.type === 'MatrixRepeater' && activeCellInfo) {
                            const repeater = selectedObject as any;
                            const r = activeCellInfo.row;
                            const c = activeCellInfo.col;
                            const cellKey = `${r}_${c}`;
                            const isReverse = repeater.isZigzag && (r % 2 !== 0);
                            const actualCol = isReverse ? (repeater.xCount - 1 - c) : c;
                            const srcObj = repeater.sourceObjects?.[0];
                            if (srcObj) {
                                // [FIX] repeater.left는 override로 확장된 바운딩 박스 기준이므로
                                // getCellSceneOrigin()으로 override 없는 기준 위치를 구해 역산한다.
                                const baseOrigin = repeater.getCellSceneOrigin(r, actualCol, undefined);
                                const basePosition = baseOrigin.x + srcObj.left;
                                const calculatedOffset = newX - basePosition;
                                // [이슈 5] override 기록과 파생 갱신(바운딩 확장/좌표 캐시/재렌더)을
                                // applyOverride() 한 곳으로 일원화 — 수동 호출 누락으로 영역 밖
                                // 셀이 잘려 보이던 문제를 방지한다.
                                repeater.applyOverride(cellKey, { xOffset: calculatedOffset });
                            }
                        } else {
                            const currentCenter = selectedObject.getCenterPoint();
                            selectedObject.setPositionByOrigin(new fabric.Point(newX, currentCenter.y), 'center', 'center');
                        }
                    } else if (key === 'top') {
                        // [Camera-Relative] 입력값(카메라 뷰 중심 기준 mm)을 절대 scene Pixel로 역산.
                        const { positions } = useAppStore.getState();
                        const laserY = viewMode === 'canvas' ? 0 : positions.Y;
                        const newAbsY = clampedVal + laserY;
                        const newY = -newAbsY * pxPerMm.y;

                        if (selectedObject?.type === 'MatrixRepeater' && activeCellInfo) {
                            const repeater = selectedObject as any;
                            const r = activeCellInfo.row;
                            const c = activeCellInfo.col;
                            const cellKey = `${r}_${c}`;
                            const isReverse = repeater.isZigzag && (r % 2 !== 0);
                            const actualCol = isReverse ? (repeater.xCount - 1 - c) : c;
                            const srcObj = repeater.sourceObjects?.[0];
                            if (srcObj) {
                                // [FIX] repeater.top은 override로 확장된 바운딩 박스 기준이므로
                                // getCellSceneOrigin()으로 override 없는 기준 위치를 구해 역산한다.
                                const baseOrigin = repeater.getCellSceneOrigin(r, actualCol, undefined);
                                const basePosition = baseOrigin.y + srcObj.top;
                                const calculatedOffset = newY - basePosition;
                                // [이슈 5] applyOverride()로 일원화 (left와 동일)
                                repeater.applyOverride(cellKey, { yOffset: calculatedOffset });
                            }
                        } else {
                            const currentCenter = selectedObject.getCenterPoint();
                            selectedObject.setPositionByOrigin(new fabric.Point(currentCenter.x, newY), 'center', 'center');
                        }
                    } else if (key === 'width') {
                        const w = clampedVal * pxPerMm.x;
                        if (selectedObject?.type === 'MatrixRepeater' && activeCellInfo) {
                            // [NEW] 개별 셀 크기(W) override — 소스 오브젝트의 자연 크기 대비 상대 배율로 저장
                            const repeater = selectedObject as any;
                            const cellKey = activeCellInfo.cellKey;
                            const srcObj = repeater.sourceObjects?.[0];
                            const baseW = srcObj ? (srcObj.width || 1) * (srcObj.scaleX || 1) : 1;
                            const nextScaleX = w / baseW;
                            if (Number.isFinite(nextScaleX) && nextScaleX > 0) {
                                // [이슈 5] applyOverride()로 일원화
                                repeater.applyOverride(cellKey, { scaleX: nextScaleX });
                            }
                        } else {
                            // [FIX] 0/NaN/Infinity 스케일이 객체에 적용되면 특이행렬로 렌더러가 크래시하므로 방어
                            // [FIX 2026-07-21] 그룹/ActiveSelection(예: DXF 임포트 직후)은 getGroupLogicalSize()가
                            // 그룹 스케일이 이미 반영된 "표시 크기"를 반환하므로(위 표시 로직 §4.8 주석 참조),
                            // 이를 목표 폭으로 나눈 값은 절대 scaleX가 아니라 "상대 배율"이다. 이걸 절대값으로
                            // set 하면 DXF 그룹의 실제 스케일(~pxPerMm)이 통째로 날아가 엉뚱한 크기가 됐다.
                            // 단일 도형은 selectedObject.width가 스케일 독립적(내재 크기)이라 기존 공식이 옳다.
                            let nextScaleX: number;
                            if (isGroup) {
                                const displayedW = getGroupLogicalSize(selectedObject as fabric.ActiveSelection).width || 1;
                                nextScaleX = (selectedObject.scaleX || 1) * (w / displayedW);
                            } else {
                                nextScaleX = w / (selectedObject.width || 1);
                            }
                            if (Number.isFinite(nextScaleX) && nextScaleX > 0) {
                                selectedObject.set('scaleX', nextScaleX);
                            }
                        }
                    } else if (key === 'height') {
                        const h = clampedVal * pxPerMm.y;
                        if (selectedObject?.type === 'MatrixRepeater' && activeCellInfo) {
                            // [NEW] 개별 셀 크기(H) override — 소스 오브젝트의 자연 크기 대비 상대 배율로 저장
                            const repeater = selectedObject as any;
                            const cellKey = activeCellInfo.cellKey;
                            const srcObj = repeater.sourceObjects?.[0];
                            const baseH = srcObj ? (srcObj.height || 1) * (srcObj.scaleY || 1) : 1;
                            const nextScaleY = h / baseH;
                            if (Number.isFinite(nextScaleY) && nextScaleY > 0) {
                                // [이슈 5] applyOverride()로 일원화
                                repeater.applyOverride(cellKey, { scaleY: nextScaleY });
                            }
                        } else {
                            // [FIX 2026-07-21] width와 동일: 그룹은 표시 크기 기반 상대 배율을 기존 스케일에 곱한다.
                            let nextScaleY: number;
                            if (isGroup) {
                                const displayedH = getGroupLogicalSize(selectedObject as fabric.ActiveSelection).height || 1;
                                nextScaleY = (selectedObject.scaleY || 1) * (h / displayedH);
                            } else {
                                nextScaleY = h / (selectedObject.height || 1);
                            }
                            if (Number.isFinite(nextScaleY) && nextScaleY > 0) {
                                selectedObject.set('scaleY', nextScaleY);
                            }
                        }
                    } else if (key === 'angle') {
                        selectedObject.rotate(clampedVal);
                    } else if (key === 'markPointTime') {
                        let validVal = clampedVal;
                        if (validVal > 65535) validVal = 65535;

                        if (selectedObject?.type === 'MatrixRepeater' && activeCellInfo) {
                            const repeater = selectedObject as any;
                            const cellKey = activeCellInfo.cellKey;
                            if (!repeater.overrides[cellKey]) repeater.overrides[cellKey] = {};
                            repeater.overrides[cellKey].markTime = validVal;
                            
                            setActiveCellInfo(prev => prev ? {
                                ...prev,
                                override: { ...prev.override, markTime: validVal }
                            } : null);
                        } else {
                            if (isDot) {
                                canvas.getObjects().forEach((obj: any) => {
                                    if (obj.id === 'dot_marker') {
                                        obj.set('markPointTime', validVal);
                                    }
                                });
                            }
                            applyToSelection(key, validVal);
                        }
                        updates = { [key]: validVal };
                    } else if (key === 'cellZOffset') {
                        // [NEW] 필드에는 절대 Z(현재 모션 Z + zStep 누적 + 셀별 오프셋)를 표시/입력받으므로,
                        // 저장 시에는 (현재 모션 Z + zStep 누적)을 역산해 override.zOffset(상대값)으로 변환한다.
                        if (selectedObject?.type === 'MatrixRepeater' && activeCellInfo) {
                            const repeater = selectedObject as any;
                            const cellKey = activeCellInfo.cellKey;
                            const cellIndex = activeCellInfo.row * repeater.xCount + activeCellInfo.col;
                            const liveZ = useAppStore.getState().positions.Z;
                            const baseZ = liveZ + repeater.zStep * cellIndex;
                            const relativeZOffset = clampedVal - baseZ;

                            if (!repeater.overrides[cellKey]) repeater.overrides[cellKey] = {};
                            repeater.overrides[cellKey].zOffset = relativeZOffset;

                            setActiveCellInfo(prev => prev ? {
                                ...prev,
                                override: { ...prev.override, zOffset: relativeZOffset }
                            } : null);
                        }
                        updates = { [key]: clampedVal };
                    } else {
                        applyToSelection(key, clampedVal);
                    }
                    if (!updates[key]) {
                        // [FIX] Allow user to type temporary intermediate values like '0' or '.' without forcing clamping in the UI immediately
                        updates = { [key]: value };
                    }
                } else {
                    // [FIX] Do not apply empty strings to numeric fabric properties to prevent crashes
                    if (!['width', 'height', 'left', 'top', 'angle', 'markPointTime'].includes(key)) {
                        applyToSelection(key, value);
                    }
                    updates = { [key]: value };
                }
            }
        }

        selectedObject.setCoords();
        
        // [FIX] Use transition-like flag to skip redundant updateProps while UI is already handling state.
        isUpdatingRef.current = true;
        setProps(prev => ({ ...prev, ...updates }));
        
        canvas.requestRenderAll();
        // Fire once at canvas level to notify history system and others.
        canvas.fire('object:modified', { target: selectedObject });
        
        // Release lock after short delay or next tick
        setTimeout(() => { isUpdatingRef.current = false; }, 10);
    };

    // =====================================================================
    // [NEW] Layout 입력 폼 생명주기 분리 (arch_CanvasProc.md §2.25 원칙의 Edit 바 적용판)
    // onChange = draft 문자열 보존만 수행(Fabric 객체 미반영), onBlur/Enter = 검증 후 1회 커밋.
    // 키 입력마다 중간값(예: '0')이 객체에 즉시 적용되어 스케일 0(특이행렬) → 렌더러 크래시,
    // 입력 간섭(0.8 → 0.001), 수치 오염(거대 수치 표시)을 유발하던 문제를 원천 차단한다.
    // =====================================================================
    const [layoutDrafts, setLayoutDrafts] = useState<Record<string, string>>({});
    const skipCommitRef = React.useRef(false);

    /**
     * @brief draft 문자열을 검증 후 단 1회 Fabric 객체에 커밋하고 UI 표시값을 재동기화한다.
     * @param key 대상 속성 키 (left/top/width/height/angle)
     * @param raw blur 시점의 입력 문자열
     */
    const commitLayoutField = (key: string, raw: string) => {
        isEditingRef.current = false;
        setLayoutDrafts(d => {
            if (!(key in d)) return d;
            const next = { ...d };
            delete next[key];
            return next;
        });

        if (!skipCommitRef.current && raw !== '' && Number.isFinite(Number(raw))) {
            handleChange(key, raw);
        }
        skipCommitRef.current = false;

        // 커밋(또는 취소) 후 Fabric 실제 상태 기준으로 표시값 재동기화.
        // handleChange 내부의 isUpdatingRef 락(10ms)이 해제된 뒤에 실행되도록 지연.
        setTimeout(() => {
            if (selectedObject && canvas) {
                canvas.fire('object:modified', { target: selectedObject });
            }
        }, 20);
    };

    /** @brief Enter = 커밋(blur 유도), Escape = 커밋 없이 원복 */
    const layoutFieldKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            (e.target as HTMLElement).blur();
        } else if (e.key === 'Escape') {
            skipCommitRef.current = true;
            (e.target as HTMLElement).blur();
        }
    };

    // [FIX] Layout 입력창에 값을 입력한 뒤 다른 입력창이 아니라 캔버스(도형)를 클릭하면
    // 커밋(onBlur)이 발생하지 않아 도형이 갱신되지 않던 문제. Fabric.js 캔버스는 자체
    // mousedown 핸들러에서 선택 유지를 위해 preventDefault를 호출하는데, 이로 인해 브라우저가
    // 이전에 포커스된 input의 blur를 아예 발생시키지 않는 경우가 있다. 캔버스의 mousedown을
    // capture 단계에서 먼저 가로채 현재 포커스된 input을 명시적으로 blur시켜 커밋을 강제한다.
    useEffect(() => {
        const canvasEl = canvas?.upperCanvasEl;
        if (!canvasEl) return;
        const forceCommitBeforeCanvasClick = () => {
            const active = document.activeElement as HTMLElement | null;
            if (active && active.tagName === 'INPUT') {
                active.blur();
            }
        };
        canvasEl.addEventListener('mousedown', forceCommitBeforeCanvasClick, true);
        return () => canvasEl.removeEventListener('mousedown', forceCommitBeforeCanvasClick, true);
    }, [canvas]);

    /** @brief 편집 중이면 draft 문자열, 아니면 객체 동기화 값을 표시 */
    const layoutValue = (key: 'left' | 'top' | 'width' | 'height' | 'angle') =>
        layoutDrafts[key] !== undefined ? layoutDrafts[key] : props[key];

    /** @brief Layout 입력 onChange 핸들러 팩토리: draft만 갱신하고 객체는 건드리지 않는다 */
    const editLayoutDraft = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        setLayoutDrafts(d => ({ ...d, [key]: raw }));
    };

    const openColorPicker = (e: React.MouseEvent<HTMLElement>, key: 'fill' | 'stroke' | 'color') => {
        setAnchorEl(e.currentTarget);
        setActiveColorKey(key);
    };

    const handleColorChange = (hex: string, opacity: number) => {
        if (!activeColorKey) return;
        if (activeColorKey === 'color') {
            handleChange('representativeColor', hex);
        } else {
            handleChange(activeColorKey, hex);
        }
    };

    const handleFontPreview = (previewFont: string | null) => {
        if (previewFont) {
            if (!previewOriginFont) setPreviewOriginFont(props.fontFamily);
            handleChange('fontFamily', previewFont);
        } else {
            if (previewOriginFont) handleChange('fontFamily', previewOriginFont);
        }
    };

    const handleFontSelect = (font: string) => {
        setPreviewOriginFont(null);
        handleChange('fontFamily', font);
        setFontPopoverAnchor(null);
    };

    const handleFontPopoverClose = () => {
        if (previewOriginFont) {
            handleChange('fontFamily', previewOriginFont);
            setPreviewOriginFont(null);
        }
        setFontPopoverAnchor(null);
    };

    // Only render on Recipe page, and only when an object is selected
    // [가공 잠금] 가공 중에는 syncObjectLock의 discardActiveObject(1차)와 무관하게
    // 편집 바를 강제로 닫는다(2차 방어선). 가공 종료 시 스토어 구독으로 자동 복원된다.
    if (!isRecipePage || !selectedObject || isProcessingLocal || hideOverlays) return null;

    const inputStyle = { style: { fontSize: '13px', padding: '4px' } };
    const fieldSx = { width: 125, '& .MuiInputBase-input': { p: 0.5, fontSize: 13, textAlign: 'right', color: theme.palette.text.primary } };

    return (
        <Box
            onKeyDown={handleKeyDown}
            sx={{
                position: 'absolute',
                top: 20, // Height of horizontal ruler
                left: 60, // Width of vertical ruler
                width: 'calc(100% - 60px)',
                backgroundColor: theme.palette.background.paper,
                borderBottom: `1px solid ${theme.palette.divider}`,
                borderLeft: `1px solid ${theme.palette.divider}`,
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                zIndex: 50,
                gap: 3,
                boxShadow: theme.shadows[1],
                color: theme.palette.text.primary,
                overflowX: 'auto',
                borderBottomLeftRadius: theme.shape.borderRadius,
            }}
        >
            {/* 1. Attributes Block (Grid Layout) */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 700, fontSize: '10px', ml: 0.5, mb: -1 }}>Layout</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'auto auto auto auto auto auto', columnGap: 1.5, rowGap: 1, alignItems: 'center' }}>
                    
                    {/* Row 1: X, Y, Ang */}
                    <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600, textAlign: 'right' }}>X</Typography>
                    <TextField
                        type="number" size="small" value={layoutValue('left')} onChange={editLayoutDraft('left')}
                        onFocus={handleFocus} onBlur={(e) => commitLayoutField('left', (e.target as HTMLInputElement).value)} onKeyDown={layoutFieldKeyDown}
                        inputProps={{ step: 0.001 }} InputProps={{ endAdornment: <InputAdornment position="end"><Typography variant="caption" color="text.secondary">mm</Typography></InputAdornment>, ...inputStyle }}
                        sx={fieldSx}
                    />

                    <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600, textAlign: 'right' }}>Y</Typography>
                    <TextField
                        type="number" size="small" value={layoutValue('top')} onChange={editLayoutDraft('top')}
                        onFocus={handleFocus} onBlur={(e) => commitLayoutField('top', (e.target as HTMLInputElement).value)} onKeyDown={layoutFieldKeyDown}
                        inputProps={{ step: 0.001 }} InputProps={{ endAdornment: <InputAdornment position="end"><Typography variant="caption" color="text.secondary">mm</Typography></InputAdornment>, ...inputStyle }}
                        sx={fieldSx}
                    />

                    <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 600, textAlign: 'right', visibility: isDot ? 'hidden' : 'visible' }}>ang</Typography>
                    <TextField
                        type="number" size="small" value={layoutValue('angle')} onChange={editLayoutDraft('angle')}
                        onFocus={handleFocus} onBlur={(e) => commitLayoutField('angle', (e.target as HTMLInputElement).value)} onKeyDown={layoutFieldKeyDown}
                        inputProps={{ step: 0.01 }} InputProps={{ endAdornment: <InputAdornment position="end"><Typography variant="caption" color="text.secondary"></Typography></InputAdornment>, ...inputStyle }}
                        sx={{ ...fieldSx, visibility: isDot ? 'hidden' : 'visible' }}
                    />

                    {/* Row 2: W, H, MarkTime */}
                    <Typography variant="caption" sx={{ gridColumn: 1, color: theme.palette.text.secondary, fontWeight: 600, textAlign: 'right', fontSize: isGroup ? '9px' : '12px' }}>{isGroup ? 'Gr.W' : 'W'}</Typography>
                    <TextField
                        type="number" size="small" value={layoutValue('width')} onChange={editLayoutDraft('width')}
                        onFocus={handleFocus} onBlur={(e) => commitLayoutField('width', (e.target as HTMLInputElement).value)} onKeyDown={layoutFieldKeyDown}
                        inputProps={{ step: 0.001 }} InputProps={{ endAdornment: <InputAdornment position="end"><Typography variant="caption" color="text.secondary">mm</Typography></InputAdornment>, ...inputStyle }}
                        sx={{ ...fieldSx, gridColumn: 2 }}
                    />

                    <Typography variant="caption" sx={{ gridColumn: 3, color: theme.palette.text.secondary, fontWeight: 600, textAlign: 'right', fontSize: isGroup ? '9px' : '12px' }}>{isGroup ? 'Gr.H' : 'H'}</Typography>
                    <TextField
                        type="number" size="small" value={layoutValue('height')} onChange={editLayoutDraft('height')}
                        onFocus={handleFocus} onBlur={(e) => commitLayoutField('height', (e.target as HTMLInputElement).value)} onKeyDown={layoutFieldKeyDown}
                        inputProps={{ step: 0.001 }} InputProps={{ endAdornment: <InputAdornment position="end"><Typography variant="caption" color="text.secondary">mm</Typography></InputAdornment>, ...inputStyle }}
                        sx={{ ...fieldSx, gridColumn: 4 }}
                    />

                    <Typography variant="caption" sx={{ gridColumn: 5, color: theme.palette.text.secondary, fontWeight: 600, textAlign: 'right', visibility: isDot ? 'visible' : 'hidden' }}>Mark Time</Typography>
                    <TextField
                        type="number" size="small" value={props.markPointTime} onChange={(e) => handleChange('markPointTime', e.target.value)}
                        inputProps={{ step: viewMode === 'scanner' ? 0.2 : 1 }} InputProps={{ endAdornment: <InputAdornment position="end"><Typography variant="caption" color="text.secondary">ms</Typography></InputAdornment>, ...inputStyle }}
                        sx={{ gridColumn: 6, width: 120, visibility: isDot ? 'visible' : 'hidden', '& .MuiInputBase-input': { p: 0.5, fontSize: 13, textAlign: 'right', color: theme.palette.text.primary } }}
                    />

                    {/* [NEW] 매트릭스 셀 선택 시에만 표시: 셀의 절대 Z(현재 모션 Z + zStep 누적 + 셀별 오프셋) */}
                    {selectedObject?.type === 'MatrixRepeater' && activeCellInfo && (
                        <>
                            <Typography variant="caption" sx={{ gridColumn: 1, color: theme.palette.text.secondary, fontWeight: 600, textAlign: 'right' }} title="현재 모션 Z + 누적 Z-Step + 셀별 오프셋을 합산한 절대값">Cell Z (절대)</Typography>
                            <TextField
                                type="number" size="small" value={props.cellZOffset} onChange={(e) => handleChange('cellZOffset', e.target.value)}
                                inputProps={{ step: 0.001 }} InputProps={{ endAdornment: <InputAdornment position="end"><Typography variant="caption" color="text.secondary">mm</Typography></InputAdornment>, ...inputStyle }}
                                sx={{ ...fieldSx, gridColumn: 2 }}
                            />
                        </>
                    )}
                </Box>
            </Box>

            <Box sx={{ width: '1px', alignSelf: 'stretch', backgroundColor: theme.palette.divider, my: 1 }} />

            {/* 2. Colors Block (Style) */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 700, fontSize: '10px', ml: 0.5, mb: -1 }}>Style</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'auto auto auto auto auto', columnGap: 1, rowGap: 1, alignItems: 'center' }}>
                    {/* [정책] 색상 = 가공 레이어 색상(Speed/Power 파라미터 키). Fill/Line 체크는
                        "그 색을 어떤 방식으로 가공하나(해칭/외곽선)"의 토글일 뿐이며, 색상 스와치는
                        체크 상태와 무관하게 항상 클릭 가능해야 한다(색상 편집 데드엔드 금지).
                        Fill 색상은 항상 Line 색상을 따라간다 — representativeColor 단일 경로로 적용.
                        [이슈 4 2026-07-21] 매트릭스(MatrixRepeater) 선택 시에는 Fill 항목을 숨긴다.
                        Fill은 매트릭스 생성 전에 원본 도형에서 결정하고 셀은 이를 상속하는 것이 정책이며,
                        여기서 리피터의 Fill을 조작하면 표시-실체 불일치/의도치 않은 해칭 가공 위험이 있다.
                        [2026-07-22] Dot은 점 노광(Mark Time 기반)이라 Fill/Line 구분이 무의미하므로
                        두 행을 숨기고 Color 스와치 + hex만 노출한다. */}
                    {isDot ? (
                        <>
                            <Typography variant="caption" sx={{ gridColumn: '1 / span 2', color: theme.palette.text.secondary, fontWeight: 500 }}>Color</Typography>
                            <Box
                                onClick={(e) => openColorPicker(e, 'color')}
                                title="Dot 색상 (가공 레이어 색상) — 클릭하여 변경"
                                sx={{ gridColumn: 3, width: 24, height: 24, bgcolor: props.stroke, border: `1px solid ${theme.palette.divider}`, borderRadius: 0.5, cursor: 'pointer' }}
                            />
                            <TextField size="small" value={props.stroke.toUpperCase()} disabled InputProps={{ style: { fontSize: '13px', padding: '4px', fontFamily: 'monospace' } }} sx={{ gridColumn: 4, width: 85, '& .MuiInputBase-input': { p: 0.5, fontSize: 13, textAlign: 'center', WebkitTextFillColor: theme.palette.text.primary } }} />
                            <Box sx={{ gridColumn: 5 }} />
                        </>
                    ) : (
                        <>
                            {!(selectedObject instanceof fabric.Image) && selectedObject?.type !== 'MatrixRepeater' && (
                                <>
                                    <Checkbox checked={props.fillEnabled} onChange={(e) => handleChange('fillEnabled', e.target.checked)} size="small" sx={{ p: 0, color: theme.palette.text.secondary }} />
                                    <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 500 }}>Fill</Typography>
                                    <Box
                                        onClick={(e) => openColorPicker(e, 'color')}
                                        title="도형 색상 (Fill·Line 공통, 가공 레이어 색상) — 클릭하여 변경"
                                        sx={{ width: 24, height: 24, bgcolor: props.stroke, border: `1px solid ${theme.palette.divider}`, borderRadius: 0.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: props.fillEnabled ? 1 : 0.5 }}
                                    >
                                        {!props.fillEnabled && <CloseIcon sx={{ fontSize: 16, color: theme.palette.error.main }} />}
                                    </Box>
                                    <TextField type="number" size="small" value={props.fillEnabled ? props.fillOpacity : 100} onChange={(e) => handleChange('fillOpacity', e.target.value)} disabled={!props.fillEnabled} InputProps={{ endAdornment: <InputAdornment position="end"><Typography variant="caption" color="text.secondary" sx={{ opacity: props.fillEnabled ? 1 : 0.5 }}>%</Typography></InputAdornment>, ...inputStyle }} sx={{ width: 85, '& .MuiInputBase-input': { p: 0.5, fontSize: 13, textAlign: 'right', color: theme.palette.text.primary, WebkitTextFillColor: props.fillEnabled ? theme.palette.text.primary : theme.palette.text.disabled } }} />
                                </>
                            )}

                            {/* Line — 스와치는 Line 해제 상태에서도 클릭 가능(대표 색상 편집 진입점 유지).
                                이미지의 스와치는 이진화 미리보기 재처리가 필요하므로 기존 'stroke' 경로를 탄다. */}
                            <Checkbox checked={props.strokeEnabled} onChange={(e) => handleChange('strokeEnabled', e.target.checked)} size="small" sx={{ gridColumn: 1, p: 0, color: theme.palette.text.secondary }} />
                            <Typography variant="caption" sx={{ gridColumn: 2, color: theme.palette.text.secondary, fontWeight: 500 }}>Line</Typography>
                            <Box
                                onClick={(e) => openColorPicker(e, selectedObject instanceof fabric.Image ? 'stroke' : 'color')}
                                title="도형 색상 (Fill·Line 공통, 가공 레이어 색상) — 클릭하여 변경"
                                sx={{ gridColumn: 3, width: 24, height: 24, bgcolor: props.stroke, border: `1px solid ${theme.palette.divider}`, borderRadius: 0.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: props.strokeEnabled ? 1 : 0.5 }}
                            >
                                {!props.strokeEnabled && <CloseIcon sx={{ fontSize: 16, color: theme.palette.error.main }} />}
                            </Box>
                            <TextField size="small" value={props.stroke.toUpperCase()} disabled InputProps={{ style: { fontSize: '13px', padding: '4px', fontFamily: 'monospace' } }} sx={{ gridColumn: 4, width: 85, '& .MuiInputBase-input': { p: 0.5, fontSize: 13, textAlign: 'center', color: theme.palette.text.primary, WebkitTextFillColor: props.strokeEnabled ? theme.palette.text.primary : theme.palette.text.disabled } }} />
                            <Box sx={{ gridColumn: 5 }} />
                        </>
                    )}
                </Box>
            </Box>


            {/* 4. Fill Config Block — [이슈 4] 매트릭스 선택 시 숨김(Fill은 원본 도형에서만 편집) */}
            {!isDot && props.fillEnabled && !(selectedObject instanceof fabric.Image) && selectedObject?.type !== 'MatrixRepeater' && (
                <>
                    <Box sx={{ width: '1px', alignSelf: 'stretch', backgroundColor: theme.palette.divider, my: 1 }} />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', justifyContent: 'center', px: 1 }}>
                        <IconButton
                            onClick={() => setShowFillSettingsDialog(!showFillSettingsDialog)}
                            sx={{ color: props.fillSettings.enableFill ? theme.palette.primary.main : theme.palette.text.secondary }}
                            title="Fill Configuration"
                        >
                            <FormatColorFillIcon />
                        </IconButton>
                        <Typography variant="caption" sx={{ color: theme.palette.text.secondary, mt: -0.5, fontSize: 10 }}>Fill Settings</Typography>
                    </Box>
                </>
            )}

            {/* Matrix Button moved here */}
            <Box sx={{ width: '1px', alignSelf: 'stretch', backgroundColor: theme.palette.divider, my: 1 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', justifyContent: 'center', px: 1 }}>
                <IconButton
                    onClick={(e) => setShowMatrixDialog(true)}
                    sx={{ color: theme.palette.text.secondary, '&:hover': { color: theme.palette.primary.main } }}
                    title="Matrix / Grid Array"
                >
                    <GridOnIcon />
                </IconButton>
                <Typography variant="caption" sx={{ color: theme.palette.text.secondary, mt: -0.5, fontSize: 10 }}>Matrix</Typography>
            </Box>

            {/* 3. Image Sensitivity Block */}
            {selectedObject instanceof fabric.Image && (
                <>
                    <Box sx={{ width: '1px', alignSelf: 'stretch', backgroundColor: theme.palette.divider, my: 1 }} />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, px: 1, minWidth: 200 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 700, fontSize: '10px' }}>
                                Binarization Sensitivity
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            size="small"
                                            checked={props.edgeDetection}
                                            onChange={(e) => handleChange('edgeDetection', e.target.checked)}
                                            sx={{ p: 0.5 }}
                                        />
                                    }
                                    label={<Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 600 }}>Outline</Typography>}
                                    sx={{ m: 0, mr: 1 }}
                                />
                                <Typography variant="caption" sx={{ color: theme.palette.primary.main, fontWeight: 700, fontSize: '10px' }}>
                                    {props.threshold}%
                                </Typography>
                            </Box>
                        </Box>
                        <input
                            type="range"
                            min="1"
                            max="99"
                            value={props.threshold || 50}
                            onChange={(e) => handleChange('threshold', e.target.value)}
                            style={{
                                width: '100%',
                                height: '4px',
                                background: theme.palette.mode === 'dark' ? '#334155' : '#e2e8f0',
                                borderRadius: '4px',
                                appearance: 'none',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        />
                    </Box>
                </>
            )}



            {/* 4. Text Options */}
            {isText && (
                <>
                    <Box sx={{ width: '1px', alignSelf: 'stretch', backgroundColor: theme.palette.divider, my: 1 }} />
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', maxWidth: 180, gap: 1, alignItems: 'center' }}>
                        <Box
                            onClick={(e) => setFontPopoverAnchor(e.currentTarget)}
                            sx={{
                                border: `1px solid ${theme.palette.divider}`, borderRadius: 1, p: '4px 8px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 1, '&:hover': { bgcolor: theme.palette.action.hover }, width: 100, overflow: 'hidden'
                            }}
                        >
                            <Typography variant="body2" noWrap sx={{ fontFamily: props.fontFamily, fontSize: 13, color: theme.palette.text.primary, flex: 1 }}>{props.fontFamily}</Typography>
                            <Typography variant="caption" color="text.secondary">▼</Typography>
                        </Box>
                        <TextField
                            type="number" size="small" value={props.fontSize}
                            onChange={(e) => handleChange('fontSize', e.target.value)}
                            sx={{ width: 60, '& .MuiInputBase-input': { p: 0.5, fontSize: 13, textAlign: 'right', color: theme.palette.text.primary } }}
                        />
                        <Box>
                            <IconButton size="small" onClick={() => handleChange('fontWeight', props.fontWeight === 'bold' ? 'normal' : 'bold')} sx={{ color: props.fontWeight === 'bold' ? theme.palette.primary.main : theme.palette.text.secondary }}>
                                <FormatBoldIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={() => handleChange('fontStyle', props.fontStyle === 'italic' ? 'normal' : 'italic')} sx={{ color: props.fontStyle === 'italic' ? theme.palette.primary.main : theme.palette.text.secondary }}>
                                <FormatItalicIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={() => handleChange('underline', !props.underline)} sx={{ color: props.underline ? theme.palette.primary.main : theme.palette.text.secondary }}>
                                <FormatUnderlinedIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    </Box>
                </>
            )}



            <Popover
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                PaperProps={{ sx: { bgcolor: 'transparent', boxShadow: 'none' } }}
            >
                {activeColorKey && (
                    <ColorPicker
                        color={activeColorKey === 'fill' ? props.fill : props.stroke}
                        opacity={activeColorKey === 'fill' ? props.fillOpacity : 100}
                        onChange={handleColorChange}
                    />
                )}
            </Popover>

            <Popover
                open={Boolean(fontPopoverAnchor)}
                anchorEl={fontPopoverAnchor}
                onClose={handleFontPopoverClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            >
                <FontPicker currentFont={props.fontFamily} onPreview={handleFontPreview} onSelect={handleFontSelect} />
            </Popover>

            {showFillSettingsDialog && (
                <FillSettingsDialog
                    settings={props.fillSettings}
                    onChange={(settings) => handleChange('fillSettings', settings)}
                    onClose={() => setShowFillSettingsDialog(false)}
                />
            )}
        </Box>
    );
}
