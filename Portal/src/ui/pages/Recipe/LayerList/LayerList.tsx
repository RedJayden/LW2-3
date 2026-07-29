import React, { useEffect, useState, useMemo } from "react";
import {
    Box,
    Typography,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    IconButton,
    Collapse,
    Divider,
    Menu, //
    MenuItem, //
    InputBase, //
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import Lock from "@mui/icons-material/Lock";
import LockOpen from "@mui/icons-material/LockOpen"; // Restored
import CircleIcon from "@mui/icons-material/Circle"; // Restored
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked"; //  Icon for Circle
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import ChangeHistoryIcon from "@mui/icons-material/ChangeHistory";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import TimelineIcon from "@mui/icons-material/Timeline";
import TitleIcon from "@mui/icons-material/Title"; //  for Text
import ImageIcon from "@mui/icons-material/Image"; //  for Image
import GestureIcon from "@mui/icons-material/Gesture"; //  for SVG path/group
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft"; //  Icon
import * as fabric from "fabric";
import { useCanvasStore } from "../Canvas/useCanvasStore";
import { getColorHex, resolveObjectColorHex } from "../../../../utils/colorUtils";

// Helper to generate enhanced thumbnail with visible strokes
const generateEnhancedThumbnail = async (obj: fabric.Object): Promise<string> => {
    // Clone to safely modify styling for thumbnail without affecting canvas
    const clone = await obj.clone();

    // Inject Matrix properties since simple clone() doesn't copy custom properties on Empty Group
    if (obj.type === 'MatrixRepeater') {
        const srcRepeater = obj as any;
        const targetRepeater = clone as any;
        targetRepeater.sourceObjects = srcRepeater.sourceObjects;
        targetRepeater.xCount = srcRepeater.xCount;
        targetRepeater.yCount = srcRepeater.yCount;
        targetRepeater.xSpacing = srcRepeater.xSpacing;
        targetRepeater.ySpacing = srcRepeater.ySpacing;
        targetRepeater.isZigzag = srcRepeater.isZigzag;
        targetRepeater.overrides = srcRepeater.overrides;
        targetRepeater.width = srcRepeater.width;
        targetRepeater.height = srcRepeater.height;
    }

    // Reset position/transform for consistent thumbnail generation
    clone.set({
        left: 0,
        top: 0,
        originX: 'center',
        originY: 'center',
        angle: obj.angle,
        padding: 0, // Remove padding to ensure tight bounding box
        strokeUniform: true // Ensure stroke doesn't scale weirdly
    });
    clone.setCoords(); // Update coords after reset

    // 1. Calculate Auto-Crop Scale
    // We want the final auto-cropped image to have a max dimension of 64px.
    const boundingRect = clone.type === 'MatrixRepeater'
        ? { left: 0, top: 0, width: clone.width || 1, height: clone.height || 1 }
        : clone.getBoundingRect();
    const maxDim = Math.max(boundingRect.width, boundingRect.height);

    if (maxDim === 0) return "";

    // Scale to exactly 64px (tight fit)
    const targetSize = 64;
    let scaleFactor = targetSize / maxDim;

    // [FIX] Dot 도형은 썸네일에서 너무 꽉 차지 않도록 고정 크기(약 16px)로 렌더링
    if ((clone as any).id === 'dot_marker' || (clone as any).name?.startsWith('Dot ')) {
        // 16px 정도의 작은 원으로 보이도록 스케일 조정
        const visualSize = 16;
        scaleFactor = visualSize / maxDim;
    }

    clone.scaleX = (clone.scaleX || 1) * scaleFactor;
    clone.scaleY = (clone.scaleY || 1) * scaleFactor;

    // 2. Normalize Stroke
    // Text Handling: Always prefer FILL for thumbnails for clarity
    if (clone.type === 'i-text' || clone.type === 'text') {
        const hasFill = clone.fill && clone.fill !== 'transparent';
        const hasStroke = clone.stroke && clone.stroke !== 'transparent';

        if (hasFill) {
            // If it has Fill, remove Stroke for the thumbnail.
            // Stroke on tiny text often bloats the bounding box or looks messy.
            // Pure Fill is crispest for icons.
            clone.set({
                stroke: 'transparent',
                strokeWidth: 0
            });
        } else if (hasStroke) {
            // "Stroke Only" -> Convert to "Fill Only" using Stroke Color
            clone.set({
                fill: clone.stroke,
                stroke: 'transparent',
                strokeWidth: 0
            });
        } else {
            // Invisible -> Default Black
            clone.set({ fill: '#000000' });
        }
    } else {
        // Normalize Stroke for Non-Text objects (Shapes)
        if (clone.stroke && clone.stroke !== 'transparent') {
            clone.set({
                strokeWidth: 3,
                strokeUniform: true
            });
        }
    }

    // Capture the Auto-Cropped image
    return clone.toDataURL({
        format: 'png',
        multiplier: 1,
        enableRetinaScaling: false
    });
};

// Object Icon Component with Real Thumbnail
// Memoized to prevent refresh on Zoom (unless properties change)
const ObjectIcon = React.memo(({ obj }: { obj: fabric.Object, hash: string }) => {
    const [iconUrl, setIconUrl] = useState<string>("");

    useEffect(() => {
        let isMounted = true;

        const generateIcon = () => {
            // Wait for object to be ready (e.g. on add)
            if (!obj.canvas && !obj.width) return;

            // Debounce to improve performance on large lists
            const timer = setTimeout(async () => {
                if (!isMounted) return;
                try {
                    // [FIX] Skip thumbnail generation if object is being transformed to prevent crash
                    if ((obj as any).isTransforming || (obj.canvas as any)?.isTransforming) return;

                    const url = await generateEnhancedThumbnail(obj);
                    if (isMounted) setIconUrl(url);
                } catch (e) {
                    console.warn("Failed to generate icon", e);
                }
            }, 300); // [FIX] Increased debounce (50ms -> 300ms) for stability

            return () => clearTimeout(timer);
        };

        const cleanup = generateIcon();

        return () => {
            isMounted = false;
            if (cleanup) cleanup();
        };
    }, [
        obj,
        obj.fill, obj.stroke, obj.strokeWidth,
        obj.width, obj.height, obj.scaleX, obj.scaleY, obj.angle,
        (obj as any).skewX, (obj as any).skewY, // Add Skew
        (obj as any).text, (obj as any).version,
        // Add dependencies for Arc/Circle/Path changes
        (obj as any).path, (obj as any).startAngle, (obj as any).endAngle, (obj as any).radius,
        // Add dependency for Polyline points
        (obj as any).points
    ]);

    return (
        <Box sx={{
            width: 32, // Revert to 32px
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            bgcolor: '#F8F9FA', // Off-white per request
            // Subtle border for contrast against off-white if needed, or keep clean
            // border: '1px solid rgba(0, 0, 0, 0.05)', 
            borderRadius: 1,
            p: 0.5, // Added Padding (4px) to prevent icon touching edges
            pointerEvents: 'none' // Critical for Drag Drop
        }}>
            {iconUrl ? (
                <img
                    src={iconUrl}
                    alt="icon"
                    draggable={false} // legitimate drag
                    onDragStart={(e) => e.preventDefault()}
                    style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        pointerEvents: 'none', // Pass clicks/drags to parent ListItem
                        userSelect: 'none'
                    }}
                />
            ) : (
                <div style={{ width: 14, height: 14, background: '#555', borderRadius: '50%' }} />
            )}
        </Box>
    );
});

export default function LayerList() {
    const theme = useTheme();
    const {
        canvas, selectedObject, setSelectedObject, setShowLayerList, layerNames, setLayerName,
    } = useCanvasStore();

    // Group Expansion State
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    const [objects, setObjects] = useState<fabric.Object[]>([]);
    const [layersOpen, setLayersOpen] = useState(true);
    const [objectsOpen, setObjectsOpen] = useState(true);
    const [, forceUpdate] = useState(0);
    const [draggedLayerColor, setDraggedLayerColor] = useState<string | null>(
        null,
    );
    const [draggedObjectIndex, setDraggedObjectIndex] = useState<number | null>(
        null,
    );
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [lastClickPos, setLastClickPos] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [deepSelectionCandidates, setDeepSelectionCandidates] = useState<
        fabric.Object[]
    >([]);
    const [deepSelectionIndex, setDeepSelectionIndex] = useState<number>(0);

    // Multi-Selection State
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
    const [lastSelectedLayerIndex, setLastSelectedLayerIndex] = useState<number | null>(null);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{
        mouseX: number;
        mouseY: number;
        type: 'layer' | 'object';
        target: any; // fabric.Object or Layer Group
    } | null>(null);

    // Rename State
    const [renameTarget, setRenameTarget] = useState<{
        type: 'layer' | 'object';
        target: any;
    } | null>(null);
    const [newName, setNewName] = useState("");

    const handleContextMenu = (e: React.MouseEvent, type: 'layer' | 'object', target: any) => {
        e.preventDefault();
        setContextMenu({
            mouseX: e.clientX,
            mouseY: e.clientY,
            type,
            target
        });
    };

    const handleCloseContextMenu = () => {
        setContextMenu(null);
    };

    const handleContextAction = (action: 'toggle' | 'rename' | 'delete' | 'detachColor') => {
        if (!contextMenu || !canvas) return;
        const { type, target } = contextMenu;

        if (action === 'toggle') {
            if (type === 'object') {
                const obj = target as fabric.Object;
                obj.visible = !obj.visible;
                if (!obj.visible) canvas.discardActiveObject();
                obj.setCoords();
            } else {
                // Layer
                const layerObjs = target.objs as fabric.Object[];
                const anyVisible = layerObjs.some(o => o.visible);
                layerObjs.forEach(o => {
                    o.visible = !anyVisible;
                    (o as any).userVisible = o.visible; // Sync user intent
                    if (anyVisible) canvas.discardActiveObject(); // If hiding, discard
                });
            }
            canvas.requestRenderAll();
            forceUpdate(n => n + 1);
        } else if (action === 'rename') {
            const currentName = type === 'object'
                ? ((target as any).name || "")
                : (layerNames[target.color] || target.color);
            setNewName(currentName);
            setRenameTarget({ type, target });
        } else if (action === 'delete') {
            if (type === 'object') {
                canvas.remove(target);
                // History is saved by canvas event 'object:removed' (handled in useCanvasEvents)
                // But we manually triggered it? 
                // useCanvasEvents listens to 'object:removed', so it should auto-save.
            } else {
                // Layer Delete -> Delete ALL objects in group
                const layerObjs = target.objs as fabric.Object[];
                layerObjs.forEach(o => canvas.remove(o));
            }
            canvas.requestRenderAll();
        } else if (action === 'detachColor') {
            // "색상에서 분리": 우연히 같은 색상을 공유하는 도형이 Use Default Parameters
            // 일괄 재색상화에 휩쓸리지 않도록 표시만 한다 (색상 자체는 바꾸지 않음).
            if (type === 'object') {
                const obj = target as any;
                if (!obj.customData) obj.customData = {};
                obj.customData.colorPresetLinked = (obj.customData.colorPresetLinked === false) ? true : false;
                canvas.fire('object:modified', { target: obj } as any);
                forceUpdate(n => n + 1);
            }
        }
        handleCloseContextMenu();
    };

    const handleRenameSubmit = () => {
        if (renameTarget && newName.trim()) {
            if (renameTarget.type === 'object') {
                const obj = renameTarget.target as fabric.Object;
                (obj as any).name = newName.trim();
                setObjects([...objects]); // Re-render list
            } else {
                // Layer Rename
                const layer = renameTarget.target;
                setLayerName(layer.color, newName.trim());
            }
            setRenameTarget(null);
            setContextMenu(null); // Just in case
        }
    };


    // Group Objects by Color (Simple Layer System)
    const layers = useMemo(() => {
        const groups: Record<string, fabric.Object[]> = {};
        objects.forEach((obj) => {
            // [FIX 2026-07-21] raw stroke/fill 대신 resolveObjectColorHex(단일 진실 공급원)를 쓴다.
            // MatrixRepeater/Group 같은 컨테이너는 자기 자신의 fabric 기본값(검은 fill)을 갖고 있어,
            // raw로 읽으면 매트릭스가 "#000000" 레이어로 잘못 분류되었다(우측 Current Layer 스와치·
            // 가공 그룹핑과 불일치). leaf 색 기준으로 세 곳이 모두 일치해야 한다.
            const color = resolveObjectColorHex(obj);
            if (!groups[color]) groups[color] = [];
            groups[color].push(obj);
        });
        return Object.entries(groups).map(([color, objs]) => ({ color, objs }));
    }, [objects]);

    // Sync Object List & Naming
    useEffect(() => {
        if (!canvas) return;

        const updateObjects = () => {
            if (!canvas) return;
            const objs = canvas
                .getObjects()
                .filter(
                    (o: any) =>
                        !o.isTemp &&
                        !o.isGuide &&
                        !o.isGridLine &&
                        !o.isPaper &&
                        !o.isCrosshair &&
                        !o.isMeasurement && // Exclude Measurement Tools
                        !o.customData?.isMatrixLabel && // [NEW] Exclude Matrix Labels from Layer List
                        // [FIX 2026-07-21] 매트릭스 프리뷰/확정 과정에서 은닉된 원본 도형은 목록에서 제외.
                        // 목록에 노출되면 사용자가 눈(가시성) 토글로 되살리는 등 상태가 꼬여
                        // "원본+매트릭스 이중 표시/이중 가공"의 진입로가 된다. Cancel 시에는
                        // clearMatrix()가 이 플래그를 지워 다시 목록에 나타난다.
                        !o.customData?.isMatrixOriginal &&
                        !o.isProcessingMarker && // [NEW] Exclude Process Indicator (Yellow Circle/Cross) from Layer List
                        o.type !== "selection" &&
                        o.type !== "activeSelection",
                );

            // Auto-Naming Logic
            const maxIndices: Record<string, number> = {};
            const getTypeLabel = (obj: any) => {
                switch (obj.type) {
                    case 'rect': return 'Rect';
                    case 'circle': {
                        // Check if it's an Arc (incomplete circle)
                        const startAngle = obj.startAngle || 0;
                        const endAngle = obj.endAngle || (Math.PI * 2);
                        const isArc = Math.abs(endAngle - startAngle) < Math.PI * 2 - 0.001;
                        return isArc ? 'Arc' : 'Circle';
                    }
                    case 'triangle': return 'Triangle';
                    case 'line': return 'Line';
                    case 'polyline':
                    case 'polygon': return 'Polyline';
                    case 'i-text':
                    case 'text': return 'Text';
                    case 'image': return 'Image';
                    case 'group': return 'Group';
                    case 'path': return 'SVG';
                    default: return 'Object';
                }
            };

            objs.forEach((obj) => {
                const label = getTypeLabel(obj);

                // Text Object Name Sync
                // If it's text, use the content as the name
                if (obj.type === 'i-text' || obj.type === 'text') {
                    const textContent = (obj as any).text;
                    if (textContent && textContent.trim().length > 0) {
                        (obj as any).name = textContent.length > 20
                            ? textContent.substring(0, 20) + '...'
                            : textContent;
                        return; // Skip default naming logic
                    }
                }

                const name = (obj as any).name;
                if (name && name.startsWith(label + " ")) {
                    const num = parseInt(name.split(" ")[1]);
                    if (!isNaN(num))
                        maxIndices[label] = Math.max(maxIndices[label] || 0, num);
                }
            });

            objs.forEach((obj) => {
                const label = getTypeLabel(obj.type);
                if (!(obj as any).name) {
                    const nextIndex = (maxIndices[label] || 0) + 1;
                    (obj as any).name = `${label} ${nextIndex}`;
                    maxIndices[label] = nextIndex;
                }
            });

            // Removed .reverse() to show 1...N order (Top to Bottom in list = Bottom to Top in Z-index)
            setObjects([...objs]);
        };

        updateObjects();

        const listeners = {
            "object:added": updateObjects,
            "object:removed": updateObjects,
            "object:modified": updateObjects,
            "selection:created": () => {
                forceUpdate((n) => n + 1);
            },
            "selection:updated": () => {
                forceUpdate((n) => n + 1);
            },
            "selection:cleared": () => {
                forceUpdate((n) => n + 1);
            },
        };

        Object.entries(listeners).forEach(([evt, handler]) => {
            canvas.on(evt as any, handler);
        });

        return () => {
            if (!canvas) return;
            Object.entries(listeners).forEach(([evt, handler]) => {
                canvas.off(evt as any, handler);
            });
        };
    }, [canvas]);

    const handleSelect = (e: React.MouseEvent, obj: fabric.Object, index: number, parentGroup?: fabric.Object) => {
        if (!canvas) return;

        const isCtrl = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;

        // [FIX] 매트릭스 개별 셀(getVirtualObjects()가 만든 표시 전용 mock 오브젝트)을 클릭한 경우,
        // mock 오브젝트를 그대로 선택하면 캔버스에 실제로 존재하지 않으므로 이후 위치/크기 편집이
        // 아무 효과도 내지 못한다(CanvasTopBar의 편집 로직은 실제 MatrixRepeater 선택 +
        // activeCellInfo를 전제로 동작함). 캔버스에서 셀을 직접 클릭했을 때와 동일하게 실제
        // MatrixRepeater를 선택하고 'matrix:cell:selected' 이벤트를 재현해 동일한 편집 경로를 탄다.
        if (!isCtrl && !isShift && (obj as any).customData?.isMatrixChild) {
            const row = (obj as any).customData.row;
            const col = (obj as any).customData.col;
            const parentSessionId = (obj as any).customData.parentSessionId;
            const repeater = (parentGroup && (parentGroup as any).type === 'MatrixRepeater' && (parentGroup as any).customData?.matrixSessionId === parentSessionId)
                ? parentGroup
                : canvas.getObjects().find((o: any) => o.type === 'MatrixRepeater' && o.customData?.matrixSessionId === parentSessionId);

            if (repeater) {
                canvas.setActiveObject(repeater);
                (repeater as any).activeCell = { row, col };
                const cellKey = `${row}_${col}`;
                canvas.fire('matrix:cell:selected', {
                    target: repeater,
                    row, col,
                    cellKey,
                    override: (repeater as any).overrides?.[cellKey]
                });
                canvas.requestRenderAll();
                return;
            }
        }

        if (isShift && lastSelectedIndex !== null) {
            // Range Selection
            const start = Math.min(lastSelectedIndex, index);
            const end = Math.max(lastSelectedIndex, index);
            const rangeObjs = objects.slice(start, end + 1);

            const isLocked = rangeObjs.some(o => o.lockMovementX || o.lockMovementY || o.lockScalingX || o.lockScalingY || o.lockRotation);
            const selection = new fabric.ActiveSelection(rangeObjs, {
                canvas,
                lockMovementX: isLocked,
                lockMovementY: isLocked,
                lockRotation: isLocked,
                lockScalingX: isLocked,
                lockScalingY: isLocked,
                hasControls: !isLocked
            });
            canvas.setActiveObject(selection);
        } else if (isCtrl) {
            // Toggle Selection
            const active = canvas.getActiveObject();

            // Robus Discard & Recreate Strategy
            let newSelectionList: fabric.Object[] = [];

            if (active) {
                if (active === obj) {
                    // Deselecting single -> Empty
                    canvas.discardActiveObject();
                } else if (active.type.toLowerCase() === 'activeselection') {
                    const activeSel = active as fabric.ActiveSelection;
                    // Ensure we get current objects correctly without references breaking
                    const current = [...activeSel.getObjects()];

                    if (current.includes(obj)) {
                        // Remove obj
                        newSelectionList = current.filter(o => o !== obj);
                    } else {
                        // Add obj
                        newSelectionList = [...current, obj];
                    }

                    // Apply
                    canvas.discardActiveObject();
                    if (newSelectionList.length === 1) {
                        canvas.setActiveObject(newSelectionList[0]);
                    } else if (newSelectionList.length > 1) {
                        const isLocked = newSelectionList.some(o => o.lockMovementX || o.lockMovementY || o.lockScalingX || o.lockScalingY || o.lockRotation);
                        const newSel = new fabric.ActiveSelection(newSelectionList, {
                            canvas,
                            lockMovementX: isLocked,
                            lockMovementY: isLocked,
                            lockRotation: isLocked,
                            lockScalingX: isLocked,
                            lockScalingY: isLocked,
                            hasControls: !isLocked
                        });
                        canvas.setActiveObject(newSel);
                    }
                } else {
                    // Single -> ActiveSelection (2 items)
                    newSelectionList = [active, obj];
                    canvas.discardActiveObject();
                    const isLocked = newSelectionList.some(o => o.lockMovementX || o.lockMovementY || o.lockScalingX || o.lockScalingY || o.lockRotation);
                    const newSel = new fabric.ActiveSelection(newSelectionList, {
                        canvas,
                        lockMovementX: isLocked,
                        lockMovementY: isLocked,
                        lockRotation: isLocked,
                        lockScalingX: isLocked,
                        lockScalingY: isLocked,
                        hasControls: !isLocked
                    });
                    canvas.setActiveObject(newSel);
                }
            } else {
                canvas.setActiveObject(obj);
            }
            setLastSelectedIndex(index);
        } else {
            // Single Selection
            canvas.setActiveObject(obj);
            setLastSelectedIndex(index);
        }
        canvas.requestRenderAll();
    };

    const handleSelectLayer = (e: React.MouseEvent, objs: fabric.Object[], layerIndex: number) => {
        if (!canvas || objs.length === 0) return;

        const isCtrl = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;

        if (isShift && lastSelectedLayerIndex !== null) {
            // Layer Range Selection
            const start = Math.min(lastSelectedLayerIndex, layerIndex);
            const end = Math.max(lastSelectedLayerIndex, layerIndex);

            let allObjs: fabric.Object[] = [];
            for (let i = start; i <= end; i++) {
                if (layers[i]) allObjs = allObjs.concat(layers[i].objs);
            }

            if (allObjs.length > 0) {
                const isLocked = allObjs.some(o => o.lockMovementX || o.lockMovementY || o.lockScalingX || o.lockScalingY || o.lockRotation);
                const selection = new fabric.ActiveSelection(allObjs, {
                    canvas,
                    lockMovementX: isLocked,
                    lockMovementY: isLocked,
                    lockRotation: isLocked,
                    lockScalingX: isLocked,
                    lockScalingY: isLocked,
                    hasControls: !isLocked
                });
                canvas.setActiveObject(selection);
            }
        } else if (isCtrl) {
            // Toggle Layer
            const active = canvas.getActiveObject();
            const layerObjs = objs;
            let newSelectionList: fabric.Object[] = [];

            if (active) {
                if (active.type.toLowerCase() === 'activeselection') {
                    const activeSel = active as fabric.ActiveSelection;
                    const current = [...activeSel.getObjects()];

                    // Check if ALL layer objects are already present
                    const allPresent = layerObjs.every(o => current.includes(o));

                    if (allPresent) {
                        // Remove All Layer Objs
                        newSelectionList = current.filter(o => !layerObjs.includes(o));
                    } else {
                        // Add Missing Layer Objs
                        const missing = layerObjs.filter(o => !current.includes(o));
                        newSelectionList = [...current, ...missing];
                    }
                } else {
                    // Single object selected
                    const current = [active];
                    const allPresent = layerObjs.every(o => current.includes(o)); // Only true if layer has 1 obj and it matches

                    if (allPresent) {
                        newSelectionList = [];
                    } else {
                        const missing = layerObjs.filter(o => !current.includes(o));
                        newSelectionList = [...current, ...missing];
                    }
                }

                // Apply
                canvas.discardActiveObject();
                if (newSelectionList.length === 1) {
                    canvas.setActiveObject(newSelectionList[0]);
                } else if (newSelectionList.length > 1) {
                    const isLocked = newSelectionList.some(o => o.lockMovementX || o.lockMovementY || o.lockScalingX || o.lockScalingY || o.lockRotation);
                    const newSel = new fabric.ActiveSelection(newSelectionList, {
                        canvas,
                        lockMovementX: isLocked,
                        lockMovementY: isLocked,
                        lockRotation: isLocked,
                        lockScalingX: isLocked,
                        lockScalingY: isLocked,
                        hasControls: !isLocked
                    });
                    canvas.setActiveObject(newSel);
                }
            } else {
                // No selection -> Select Layer
                if (layerObjs.length === 1) canvas.setActiveObject(layerObjs[0]);
                else {
                    const isLocked = layerObjs.some(o => o.lockMovementX || o.lockMovementY || o.lockScalingX || o.lockScalingY || o.lockRotation);
                    const selection = new fabric.ActiveSelection(layerObjs, {
                        canvas,
                        lockMovementX: isLocked,
                        lockMovementY: isLocked,
                        lockRotation: isLocked,
                        lockScalingX: isLocked,
                        lockScalingY: isLocked,
                        hasControls: !isLocked
                    });
                    canvas.setActiveObject(selection);
                }
            }
            setLastSelectedLayerIndex(layerIndex);
        } else {
            // Single Layer Selection (Default)
            if (objs.length === 1) {
                canvas.setActiveObject(objs[0]);
            } else {
                const isLocked = objs.some(o => o.lockMovementX || o.lockMovementY || o.lockScalingX || o.lockScalingY || o.lockRotation);
                const selection = new fabric.ActiveSelection(objs, {
                    canvas,
                    lockMovementX: isLocked,
                    lockMovementY: isLocked,
                    lockRotation: isLocked,
                    lockScalingX: isLocked,
                    lockScalingY: isLocked,
                    hasControls: !isLocked
                });
                canvas.setActiveObject(selection);
            }
            setLastSelectedLayerIndex(layerIndex);
        }
        canvas.requestRenderAll();
    };

    // Hover handlers for Layers
    const handleLayerMouseEnter = (objs: fabric.Object[]) => {
        objs.forEach((obj) => {
            obj.set("opacity", 0.5);
        });
        canvas?.requestRenderAll();
    };

    const handleLayerMouseLeave = (objs: fabric.Object[]) => {
        objs.forEach((obj) => {
            obj.set("opacity", 1);
        });
        canvas?.requestRenderAll();
    };

    // Hover handlers for Objects
    const handleObjectMouseEnter = (obj: fabric.Object, parentObj?: fabric.Object) => {
        if ((obj as any).customData?.isMatrixChild && parentObj) {
            const repeater = parentObj as any;
            const r = (obj as any).customData.row;
            const c = (obj as any).customData.col;
            const cellKey = `${r}_${c}`;
            if (!repeater.overrides[cellKey]) repeater.overrides[cellKey] = {};
            repeater.overrides[cellKey].opacity = 0.5;
            repeater.dirty = true;
        } else {
            obj.set("opacity", 0.5);
        }
        canvas?.requestRenderAll();
    };

    const handleObjectMouseLeave = (obj: fabric.Object, parentObj?: fabric.Object) => {
        if ((obj as any).customData?.isMatrixChild && parentObj) {
            const repeater = parentObj as any;
            const r = (obj as any).customData.row;
            const c = (obj as any).customData.col;
            const cellKey = `${r}_${c}`;
            if (repeater.overrides[cellKey]) {
                delete repeater.overrides[cellKey].opacity;
            }
            repeater.dirty = true;
        } else {
            obj.set("opacity", 1);
        }
        canvas?.requestRenderAll();
    };

    const toggleVisibility = (e: React.MouseEvent, obj: fabric.Object, parentObj?: fabric.Object) => {
        e.stopPropagation();

        if ((obj as any).customData?.isMatrixChild && parentObj) {
            const repeater = parentObj as any;
            const r = (obj as any).customData.row;
            const c = (obj as any).customData.col;
            const cellKey = `${r}_${c}`;
            if (!repeater.overrides[cellKey]) repeater.overrides[cellKey] = {};
            
            const currentVisible = repeater.overrides[cellKey].visible !== false;
            repeater.overrides[cellKey].visible = !currentVisible;
            
            obj.visible = !currentVisible;
            (obj as any).userVisible = !currentVisible;
            
            repeater.dirty = true;
            canvas?.requestRenderAll();
            forceUpdate((n) => n + 1);
            return;
        }

        const { isProcessingLocal, hideOverlays } = useCanvasStore.getState();
        const isProcessing = hideOverlays || isProcessingLocal;

        const activeObjects = canvas?.getActiveObjects() || [];
        const isSelected = activeObjects.includes(obj);

        if (isSelected && activeObjects.length > 1) {
            const newState = !(obj as any).userVisible;

            activeObjects.forEach(o => {
                const val = newState === undefined ? !o.visible : newState;
                (o as any).userVisible = val; 
                o.visible = val;
                if (val) {
                    o.selectable = !isProcessing;
                    o.evented = !isProcessing;
                } else {
                    o.selectable = false;
                    o.evented = false;
                }
                o.setCoords();
                o.dirty = true;
                if (o.group) o.group.dirty = true;
            });
        } else {
            const current = (obj as any).userVisible !== false;
            const newState = !current;
            (obj as any).userVisible = newState;
            obj.visible = newState;
            if (newState) {
                obj.selectable = !isProcessing;
                obj.evented = !isProcessing;
            } else {
                obj.selectable = false;
                obj.evented = false;
            }
            obj.setCoords();
            obj.dirty = true;
            if (obj.group) obj.group.dirty = true;
        }

        canvas?.requestRenderAll();

        const allObjects = canvas?.getObjects().filter((o: any) => !o.isPaper && !o.isGridLine && !o.isCrosshair && !o.isProcessingMarker && !o.isTemp && !o.isMeasurement) || [];
        const allHidden = allObjects.every((o: any) => (o as any).userVisible === false);
        useCanvasStore.getState().setAllObjectsHiddenOnly(allHidden);

        forceUpdate((n) => n + 1);
    };

    const toggleLayerVisibility = (
        e: React.MouseEvent,
        layerObjs: fabric.Object[],
    ) => {
        e.stopPropagation();

        const { isProcessingLocal, hideOverlays } = useCanvasStore.getState();
        const isProcessing = hideOverlays || isProcessingLocal;

        const activeObjects = canvas?.getActiveObjects() || [];
        const isLayerSelected = layerObjs.some(o => activeObjects.includes(o));

        if (isLayerSelected && activeObjects.length > 0) {
            const selectedLayers = layers.filter(l => l.objs.some(o => activeObjects.includes(o)));
            const anyVisible = layerObjs.some((o) => (o as any).userVisible !== false);
            const newState = !anyVisible;

            selectedLayers.forEach(l => {
                l.objs.forEach(o => {
                    (o as any).userVisible = newState;
                    o.visible = newState;
                    if (newState) {
                        o.selectable = !isProcessing;
                        o.evented = !isProcessing;
                    } else {
                        o.selectable = false;
                        o.evented = false;
                    }
                    o.setCoords();
                    o.dirty = true;
                    if (o.group) o.group.dirty = true;
                });
            });
        } else {
            const anyVisible = layerObjs.some((o) => (o as any).userVisible !== false);
            const newState = !anyVisible;
            layerObjs.forEach((o) => {
                (o as any).userVisible = newState;
                o.visible = newState;
                if (newState) {
                    o.selectable = !isProcessing;
                    o.evented = !isProcessing;
                } else {
                    o.selectable = false;
                    o.evented = false;
                }
                o.setCoords();
                o.dirty = true;
                if (o.group) o.group.dirty = true;
            });
        }

        canvas?.requestRenderAll();

        const allObjects = canvas?.getObjects().filter((o: any) => !o.isPaper && !o.isGridLine && !o.isCrosshair && !o.isProcessingMarker && !o.isTemp && !o.isMeasurement) || [];
        const allHidden = allObjects.every((o: any) => (o as any).userVisible === false);
        useCanvasStore.getState().setAllObjectsHiddenOnly(allHidden);

        forceUpdate((n) => n + 1);
    };

    const toggleLock = (e: React.MouseEvent, obj: fabric.Object, parentObj?: fabric.Object) => {
        e.stopPropagation();

        if ((obj as any).customData?.isMatrixChild && parentObj) {
            const repeater = parentObj as any;
            const r = (obj as any).customData.row;
            const c = (obj as any).customData.col;
            const cellKey = `${r}_${c}`;
            if (!repeater.overrides[cellKey]) repeater.overrides[cellKey] = {};
            
            const currentLocked = !!repeater.overrides[cellKey].locked;
            repeater.overrides[cellKey].locked = !currentLocked;
            
            obj.set({
                lockMovementX: !currentLocked,
                lockMovementY: !currentLocked,
                lockRotation: !currentLocked,
                lockScalingX: !currentLocked,
                lockScalingY: !currentLocked,
            });
            (obj as any).hasControls = currentLocked;
            
            repeater.dirty = true;
            canvas?.requestRenderAll();
            forceUpdate((n) => n + 1);
            return;
        }

        const activeObjects = canvas?.getActiveObjects() || [];
        const isSelected = activeObjects.includes(obj);

        if (isSelected && activeObjects.length > 1) {
            const shouldLock = !obj.lockMovementX;

            activeObjects.forEach(o => {
                o.set({
                    lockMovementX: shouldLock,
                    lockMovementY: shouldLock,
                    lockRotation: shouldLock,
                    lockScalingX: shouldLock,
                    lockScalingY: shouldLock,
                    selectable: true,
                    evented: true,
                });
                o.set("hasControls", !shouldLock);
                o.dirty = true;
                if (o.group) o.group.dirty = true;
            });

            const active = canvas?.getActiveObject();
            if (active && active.type.toLowerCase() === 'activeselection') {
                active.set({
                    lockMovementX: shouldLock,
                    lockMovementY: shouldLock,
                    lockRotation: shouldLock,
                    lockScalingX: shouldLock,
                    lockScalingY: shouldLock,
                    hasControls: !shouldLock
                });
            }

        } else {
            const locked = !obj.lockMovementX;
            obj.set({
                lockMovementX: locked,
                lockMovementY: locked,
                lockRotation: locked,
                lockScalingX: locked,
                lockScalingY: locked,
                selectable: true,
                evented: true,
            });
            obj.set("hasControls", !locked);
            obj.dirty = true;
            if (obj.group) obj.group.dirty = true;

            const active = canvas?.getActiveObject();
            if (active && active.type.toLowerCase() === 'activeselection') {
                const sel = active as fabric.ActiveSelection;
                if (sel.getObjects().includes(obj)) {
                    const isLocked = sel.getObjects().some(o => o.lockMovementX || o.lockMovementY || o.lockScalingX || o.lockScalingY || o.lockRotation);
                    sel.set({
                        lockMovementX: isLocked,
                        lockMovementY: isLocked,
                        lockRotation: isLocked,
                        lockScalingX: isLocked,
                        lockScalingY: isLocked,
                        hasControls: !isLocked
                    });
                }
            }
        }

        canvas?.requestRenderAll();
        forceUpdate((n) => n + 1);
    };

    const toggleLayerLock = (e: React.MouseEvent, layerObjs: fabric.Object[]) => {
        e.stopPropagation();

        // Multi-Selection Support for Layers
        const activeObjects = canvas?.getActiveObjects() || [];
        const isLayerSelected = layerObjs.some(o => activeObjects.includes(o));

        if (isLayerSelected && activeObjects.length > 0) {
            // Find ALL layers that are currently selected (involved in ActiveSelection)
            const selectedLayers = layers.filter(l => l.objs.some(o => activeObjects.includes(o)));

            // Determine new state based on CLICKED layer's lock state
            const anyUnlocked = layerObjs.some((o) => !o.lockMovementX);
            const shouldLock = anyUnlocked;

            // Apply to ALL objects in ALL selected layers
            selectedLayers.forEach(l => {
                l.objs.forEach(obj => {
                    obj.set({
                        lockMovementX: shouldLock,
                        lockMovementY: shouldLock,
                        lockRotation: shouldLock,
                        lockScalingX: shouldLock,
                        lockScalingY: shouldLock,
                        selectable: true,
                        evented: true,
                    });
                    obj.set("hasControls", !shouldLock);
                    obj.dirty = true;
                    if (obj.group) obj.group.dirty = true;
                });
            });

            // Update ActiveSelection
            const active = canvas?.getActiveObject();
            if (active && active.type.toLowerCase() === 'activeselection') {
                active.set({
                    lockMovementX: shouldLock,
                    lockMovementY: shouldLock,
                    lockRotation: shouldLock,
                    lockScalingX: shouldLock,
                    lockScalingY: shouldLock,
                    hasControls: !shouldLock
                });
            }

        } else {
            // Original Single-Layer Logic
            const anyUnlocked = layerObjs.some((o) => !o.lockMovementX);
            const shouldLock = anyUnlocked;
            layerObjs.forEach((obj) => {
                obj.set({
                    lockMovementX: shouldLock,
                    lockMovementY: shouldLock,
                    lockRotation: shouldLock,
                    lockScalingX: shouldLock,
                    lockScalingY: shouldLock,
                    selectable: true,
                    evented: true,
                });
                obj.set("hasControls", !shouldLock);
                obj.dirty = true;
                if (obj.group) obj.group.dirty = true;
            });

            // Update ActiveSelection if exists
            const active = canvas?.getActiveObject();
            if (active && active.type.toLowerCase() === 'activeselection') {
                const sel = active as fabric.ActiveSelection;
                const isLocked = sel.getObjects().some(o => o.lockMovementX || o.lockMovementY || o.lockScalingX || o.lockScalingY || o.lockRotation);
                sel.set({
                    lockMovementX: isLocked,
                    lockMovementY: isLocked,
                    lockRotation: isLocked,
                    lockScalingX: isLocked,
                    lockScalingY: isLocked,
                    hasControls: !isLocked
                });
            }
        }

        canvas?.requestRenderAll();
        forceUpdate((n) => n + 1);
    };

    // Drag and Drop handlers for Layers
    const handleLayerDragStart = (
        e: React.DragEvent<HTMLDivElement>,
        color: string,
    ) => {
        setDraggedLayerColor(color);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleLayerDragOver = (
        e: React.DragEvent<HTMLDivElement>,
        index: number,
    ) => {
        e.preventDefault();
        // Strict Drag Scope: Only allow Layer dragging here
        if (!draggedLayerColor) {
            e.dataTransfer.dropEffect = "none";
            return;
        }
        e.dataTransfer.dropEffect = "move";
        // Don't highlight self as drop target
        if (layers[index].color === draggedLayerColor) return;
        setDragOverIndex(index);
    };

    const handleLayerDrop = (
        e: React.DragEvent<HTMLDivElement>,
        targetColor: string,
    ) => {
        e.preventDefault();
        setDraggedLayerColor(null);
        setDragOverIndex(null);

        if (!draggedLayerColor || draggedLayerColor === targetColor) return;

        const draggedIndex = layers.findIndex((l) => l.color === draggedLayerColor);
        const targetIndex = targetColor === '__END__' ? layers.length : layers.findIndex((l) => l.color === targetColor);

        if (draggedIndex === -1 || (targetIndex === -1 && targetColor !== '__END__')) return;

        const newLayers = [...layers];

        // Check if we are dragging a selected layer
        const draggedLayerObj = layers[draggedIndex];
        const isDraggedLayerSelected = draggedLayerObj.objs.length > 0 && selectedObject && (
            (selectedObject.type.toLowerCase() === 'activeselection' && draggedLayerObj.objs.every(o => (selectedObject as fabric.ActiveSelection).getObjects().includes(o))) ||
            (draggedLayerObj.objs.length === 1 && selectedObject === draggedLayerObj.objs[0])
        );

        let layersToMoveIndexes: number[] = [draggedIndex];

        if (isDraggedLayerSelected) {
            // Find ALL selected layers
            layersToMoveIndexes = layers.map((l, i) => {
                const isSelected = l.objs.length > 0 && selectedObject && (
                    (selectedObject.type.toLowerCase() === 'activeselection' && l.objs.every(o => (selectedObject as fabric.ActiveSelection).getObjects().includes(o))) ||
                    (l.objs.length === 1 && selectedObject === l.objs[0])
                );
                return isSelected ? i : -1;
            }).filter(i => i !== -1);

            // If dragged index somehow isn't in there (shouldn't happen), add it? No, if logic is correct.
        }

        // Sort indexes descending to remove safely
        layersToMoveIndexes.sort((a, b) => b - a);

        const layersToMove: { color: string; objs: fabric.Object[] }[] = [];

        // Remove from list
        layersToMoveIndexes.forEach(idx => {
            layersToMove.unshift(newLayers.splice(idx, 1)[0]); // unshift to keep order
        });

        // Calculate Target Index adjustment
        // We need to know how many removed items were BEFORE the target index.
        const originalTargetIndex = targetIndex;
        let adjustCount = 0;
        layersToMoveIndexes.forEach(idx => {
            if (idx < originalTargetIndex) adjustCount++;
        });

        const finalTargetIndex = Math.max(0, originalTargetIndex - adjustCount);

        // Insert
        newLayers.splice(finalTargetIndex, 0, ...layersToMove);

        const newObjects = newLayers.flatMap((l) => l.objs);
        setObjects(newObjects);
        if (canvas) {
            newObjects.forEach(obj => canvas.bringObjectToFront(obj));
            canvas.requestRenderAll();
            // [FIX 2026-07-21 이슈 5] canvas z-order만 바꾸면 object:added/removed/modified가
            // 발생하지 않아 useCanvasColorGroups(Right Panel의 Current Layer 스와치)와
            // ScannerGenerator의 가공 순서가 갱신되지 않는다. object:modified를 발생시켜 canvas
            // 순서(=Layer List 순서)를 단일 진실로 두고 스와치/가공 순서를 연동시킨다.
            canvas.fire('object:modified', {} as any);
        }
    };

    // Drag and Drop handlers for Objects
    const handleObjectDragStart = (
        e: React.DragEvent<HTMLDivElement>,
        index: number,
    ) => {
        setDraggedObjectIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleObjectDragOver = (
        e: React.DragEvent<HTMLDivElement>,
        index: number,
    ) => {
        e.preventDefault();
        // Strict Drag Scope: Only allow Object dragging here
        if (draggedObjectIndex === null) {
            e.dataTransfer.dropEffect = "none";
            return;
        }
        e.dataTransfer.dropEffect = "move";
        // Don't highlight self as drop target
        if (index === draggedObjectIndex) return;
        setDragOverIndex(index);
    };

    const handleObjectDrop = (
        e: React.DragEvent<HTMLDivElement>,
        targetIndex: number,
    ) => {
        e.preventDefault();
        setDraggedObjectIndex(null);
        setDragOverIndex(null);

        if (draggedObjectIndex === null || draggedObjectIndex === targetIndex) return;

        const newObjects = [...objects];

        // Check if dragged object is selected
        const draggedObj = objects[draggedObjectIndex];
        const isDraggedSelected = selectedObject && (
            (selectedObject.type.toLowerCase() === 'activeselection' && (selectedObject as fabric.ActiveSelection).getObjects().includes(draggedObj)) ||
            (selectedObject === draggedObj)
        );

        let moveIndices = [draggedObjectIndex];

        if (isDraggedSelected) {
            moveIndices = objects.map((obj, i) => {
                const isSelected = selectedObject && (
                    (selectedObject.type.toLowerCase() === 'activeselection' && (selectedObject as fabric.ActiveSelection).getObjects().includes(obj)) ||
                    (selectedObject === obj)
                );
                return isSelected ? i : -1;
            }).filter(i => i !== -1);
        }

        // Sort descending to remove safely
        moveIndices.sort((a, b) => b - a);

        const objsToMove: fabric.Object[] = [];
        moveIndices.forEach(idx => {
            objsToMove.unshift(newObjects.splice(idx, 1)[0]);
        });

        // Adjust target
        let adjustCount = 0;
        moveIndices.forEach(idx => {
            if (idx < targetIndex) adjustCount++;
        });

        const finalTargetIndex = Math.max(0, targetIndex - adjustCount);

        newObjects.splice(finalTargetIndex, 0, ...objsToMove);
        setObjects(newObjects);

        if (canvas) {
            // Apply Z-index change to Canvas
            newObjects.forEach(obj => {
                canvas.bringObjectToFront(obj);
            });
            canvas.requestRenderAll();
            // [FIX 2026-07-21 이슈 5] 오브젝트 재정렬도 동일하게 object:modified를 발생시켜
            // Current Layer 스와치/가공 순서를 canvas z-order(=Layer List 순서)와 동기화한다.
            canvas.fire('object:modified', {} as any);
        }
    };

    const handleDragEnd = () => {
        setDraggedLayerColor(null);
        setDraggedObjectIndex(null);
        setDragOverIndex(null);
    };

    return (
        <Box
            sx={{
                width: 240,
                height: "100%",
                bgcolor: theme.palette.background.paper,
                color: theme.palette.text.primary,
                borderRight: `1px solid ${theme.palette.divider}`,
                borderLeft: `1px solid ${theme.palette.divider}`,
                display: "flex",
                flexDirection: "column",
                fontSize: "0.875rem",
                overflowX: "hidden", // Remove unwanted HScrollBar
            }}
        >
            {/* Header: Fixed Height 48px to match LeftNav */}
            <Box
                sx={{
                    height: 48,
                    px: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between", // Space between Title and Actions
                }}
            >
                {/* Title Moved Here */}
                <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
                    Layer List
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {/* Save Button */}


                    {/* Close Button */}
                    <IconButton
                        size="small"
                        onClick={() => setShowLayerList(false)}
                        sx={{
                            color: theme.palette.text.primary,
                            p: 0.5,
                            ml: 0.5
                        }}
                    >
                        <ChevronLeftIcon />
                    </IconButton>
                </Box>
            </Box>
            <Divider />

            <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
                {/* [REMOVED] Old Title Location */}

                {/* Layers Group */}
                <ListItemButton
                    onClick={() => setLayersOpen(!layersOpen)}
                    sx={{ py: 0.5, minHeight: 32, bgcolor: theme.palette.action.hover }}
                >
                    <ListItemText
                        primary="Layers"
                        primaryTypographyProps={{
                            variant: "caption",
                            fontWeight: "bold",
                            color: "text.secondary",
                        }}
                    />
                    {layersOpen ? (
                        <ExpandLess fontSize="small" />
                    ) : (
                        <ExpandMore fontSize="small" />
                    )}
                </ListItemButton>
                <Collapse in={layersOpen} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                        {layers.length === 0 && (
                            <Typography
                                variant="caption"
                                sx={{
                                    pl: 2,
                                    py: 1,
                                    color: theme.palette.text.disabled,
                                    fontStyle: "italic",
                                }}
                            >
                                No Layers
                            </Typography>
                        )}
                        {layers.map((layer, layerIndex) => {
                            const isVisible = layer.objs.some((o) => (o as any).userVisible !== false);
                            const isLocked = layer.objs.every((o) => o.lockMovementX);
                            const isDragged = draggedLayerColor === layer.color;
                            const isDragOver = dragOverIndex === layerIndex;

                            // Layer Selection Visual Feedback
                            const isLayerSelected = layer.objs.length > 0 && selectedObject && (
                                (selectedObject.type === 'activeSelection' && (selectedObject as fabric.ActiveSelection).getObjects().some(selObj => layer.objs.includes(selObj))) ||
                                (layer.objs.includes(selectedObject as fabric.Object))
                            );

                            const isAllLayerSelected = layer.objs.length > 0 && selectedObject && (
                                (selectedObject.type.toLowerCase() === 'activeselection' && layer.objs.every(o => (selectedObject as fabric.ActiveSelection).getObjects().includes(o))) ||
                                (layer.objs.length === 1 && selectedObject === layer.objs[0])
                            );

                            return (
                                <ListItem
                                    key={layer.color}
                                    draggable
                                    onDragStart={(e) =>
                                        handleLayerDragStart(e as any, layer.color)
                                    }
                                    onDragOver={(e) => handleLayerDragOver(e as any, layerIndex)}
                                    onDrop={(e) => handleLayerDrop(e as any, layer.color)}
                                    // Context Menu
                                    onContextMenu={(e) => handleContextMenu(e, 'layer', layer)}
                                    onDragLeave={(e) => {
                                        // Don't clear if entering child element
                                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                            setDragOverIndex(null);
                                        }
                                    }}
                                    onDragEnd={handleDragEnd}
                                    onMouseEnter={() => handleLayerMouseEnter(layer.objs)}
                                    onMouseLeave={() => handleLayerMouseLeave(layer.objs)}
                                    secondaryAction={
                                        <Box sx={{ display: "flex", gap: 0.5, pr: 1 }}>
                                            <IconButton
                                                size="small"
                                                onClick={(e) => toggleLayerVisibility(e, layer.objs)}
                                                sx={{
                                                    color: theme.palette.action.active,
                                                    p: 0.5,
                                                    opacity: !isVisible ? 1 : 0,
                                                    transition: 'opacity 0.2s',
                                                    '.MuiListItem-root:hover &': {
                                                        opacity: 1
                                                    }
                                                }}
                                            >
                                                {isVisible ? (
                                                    <Visibility sx={{ fontSize: 16 }} />
                                                ) : (
                                                    <VisibilityOff
                                                        sx={{
                                                            fontSize: 16,
                                                            color: theme.palette.text.disabled,
                                                        }}
                                                    />
                                                )}
                                            </IconButton>
                                            <IconButton
                                                size="small"
                                                onClick={(e) => toggleLayerLock(e, layer.objs)}
                                                sx={{
                                                    color: theme.palette.action.active,
                                                    p: 0.5,
                                                    opacity: isLocked ? 1 : 0,
                                                    transition: 'opacity 0.2s',
                                                    '.MuiListItem-root:hover &': {
                                                        opacity: 1
                                                    }
                                                }}
                                            >
                                                {isLocked ? (
                                                    <Lock sx={{ fontSize: 16 }} />
                                                ) : (
                                                    <LockOpen
                                                        sx={{
                                                            fontSize: 16,
                                                            color: theme.palette.text.disabled,
                                                        }}
                                                    />
                                                )}
                                            </IconButton>
                                        </Box>
                                    }
                                    sx={{
                                        pl: 2,
                                        py: 0.5,
                                        cursor: "grab",
                                        "&:active": { cursor: "grabbing" },
                                        opacity: isDragged ? 0.5 : 1,
                                        transition: "all 0.2s ease",
                                        position: "relative",
                                        // Selection Styling
                                        bgcolor: isDragged
                                            ? "transparent"
                                            : isAllLayerSelected
                                                ? "rgba(0, 190, 255, 0.15)"
                                                : "transparent",
                                        borderLeft: isDragged
                                            ? "2px solid transparent"
                                            : isAllLayerSelected
                                                ? "2px solid #00BEFF"
                                                : "2px solid transparent",
                                        ...(isDragOver && {
                                            bgcolor:
                                                isAllLayerSelected && !isDragged
                                                    ? "rgba(0, 190, 255, 0.3)"
                                                    : "rgba(33, 150, 243, 0.2)",
                                            // Use BoxShadow instead of BorderTop to prevent layout shift (jitter)
                                            boxShadow: "inset 0 2px 0 0 #2196F3, inset 0 2px 4px rgba(33, 150, 243, 0.3)",
                                            borderRadius: "4px",
                                        }),
                                        "&:hover": {
                                            bgcolor: isDragOver
                                                ? isAllLayerSelected && !isDragged
                                                    ? "rgba(0, 190, 255, 0.3)"
                                                    : "rgba(33, 150, 243, 0.25)"
                                                : isDragged
                                                    ? "transparent"
                                                    : isAllLayerSelected
                                                        ? "rgba(0, 190, 255, 0.25)"
                                                        : theme.palette.action.hover,
                                            transform: (isDragged || isDragOver) ? "none" : "translateX(2px)", // Prevent jitter
                                            opacity: 0.5,
                                        },
                                    }}
                                >
                                    <ListItemButton
                                        onClick={(e) => handleSelectLayer(e, layer.objs, layerIndex)}
                                        sx={{
                                            py: 0.5,
                                            pl: 0,
                                            pr: 9, // Extra padding for icons overlap
                                            cursor: "grab",
                                            "&:active": { cursor: "grabbing" },
                                            "&:hover": {
                                                opacity: 0.5,
                                            },
                                        }}
                                    >
                                        <ListItemIcon sx={{ minWidth: 24 }}>
                                            <CircleIcon
                                                sx={{ width: 10, height: 10, color: layer.color }}
                                            />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={(layerNames[layer.color] || layer.color).toUpperCase()} // Use Alias
                                            primaryTypographyProps={{
                                                variant: "body2",
                                                fontSize: 13,
                                                fontFamily: "monospace",
                                            }}
                                        />
                                    </ListItemButton>
                                </ListItem>
                            );
                        })}
                        {/* Drop Zone for Layers End (Modern UI - Subtle) */}
                        <Box
                            sx={{
                                height: (dragOverIndex === layers.length) ? 12 : 8,
                                mt: 0.5,
                                mx: 2,
                                borderRadius: 1,
                                transition: 'all 0.2s ease',
                                bgcolor: (dragOverIndex === layers.length) ? 'rgba(0, 190, 255, 0.3)' : 'transparent',
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                // Strict Scope
                                if (!draggedLayerColor) {
                                    e.dataTransfer.dropEffect = "none";
                                    return;
                                }
                                e.dataTransfer.dropEffect = "move";
                                setDragOverIndex(layers.length);
                            }}
                            onDragLeave={() => setDragOverIndex(null)}
                            onDrop={(e) => handleLayerDrop(e, '__END__')}
                        />
                    </List>
                </Collapse>

                <Divider sx={{ borderColor: theme.palette.divider }} />

                {/* Objects Group */}
                <ListItemButton
                    onClick={() => setObjectsOpen(!objectsOpen)}
                    sx={{ py: 0.5, minHeight: 32, bgcolor: theme.palette.action.hover }}
                >
                    <ListItemText
                        primary="Objects"
                        primaryTypographyProps={{
                            variant: "caption",
                            fontWeight: "bold",
                            color: "text.secondary",
                        }}
                    />
                    {objectsOpen ? (
                        <ExpandLess fontSize="small" />
                    ) : (
                        <ExpandMore fontSize="small" />
                    )}
                </ListItemButton>
                <Collapse in={objectsOpen} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                        {(() => {
                            const renderObjectNode = (obj: fabric.Object, i: number, level: number = 0, parentGroup?: fabric.Group) => {
                                // Robust Multi-Selection Highlight
                                const isSelected = selectedObject === obj || (obj.group && obj.group === selectedObject);

                                const isDragged = level === 0 && draggedObjectIndex === i;
                                const isDragOver = level === 0 && dragOverIndex === i;
                                
                                // [FIX 2026-07-22] Dot은 시인성용 렌더 프리미티브(원+X 2선)를 담은 그룹일 뿐
                                // 사용자 도메인 오브젝트는 "점 1개"다. 자식(Object 0/1/2)을 트리로 노출하면
                                // 개별 삭제/토글로 상태가 꼬이므로 leaf(원자 오브젝트)로 취급한다.
                                const isDotMarker = (obj as any).id === 'dot_marker';
                                const isGroup = (obj.type === 'Group' || obj.type === 'group') && obj.type !== 'MatrixRepeater' && !isDotMarker;
                                const isMatrix = obj.type === 'MatrixRepeater';
                                const hasChildren = isGroup || isMatrix;
                                
                                // Ensure Group has ID for expansion
                                if (hasChildren && !(obj as any).__id) {
                                    (obj as any).__id = Math.random().toString(36).substr(2, 9);
                                }
                                const groupId = (obj as any).__id;
                                const isExpanded = expandedGroups[groupId] || false;

                                return (
                                    <React.Fragment key={obj.id || ((obj as any).__id) || `${level}_${i}`}>
                                        <ListItem
                                            disablePadding
                                            draggable={level === 0}
                                            onContextMenu={(e) => handleContextMenu(e, 'object', obj)}
                                            onDragStart={level === 0 ? (e) => handleObjectDragStart(e as any, i) : undefined}
                                            onDragOver={level === 0 ? (e) => handleObjectDragOver(e as any, i) : undefined}
                                            onDrop={level === 0 ? (e) => handleObjectDrop(e as any, i) : undefined}
                                            onDragLeave={level === 0 ? (e) => {
                                                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                    setDragOverIndex(null);
                                                }
                                            } : undefined}
                                            onDragEnd={level === 0 ? handleDragEnd : undefined}
                                            onMouseEnter={() => handleObjectMouseEnter(obj, parentGroup)}
                                            onMouseLeave={() => handleObjectMouseLeave(obj, parentGroup)}
                                            sx={{
                                                bgcolor: isDragged ? "transparent" : isSelected ? "rgba(0, 190, 255, 0.15)" : "transparent",
                                                borderLeft: isDragged ? "2px solid transparent" : isSelected ? "2px solid #00BEFF" : "2px solid transparent",
                                                opacity: isDragged ? 0.5 : 1,
                                                transition: "all 0.2s ease",
                                                cursor: level === 0 ? "grab" : "default",
                                                "&:active": { cursor: level === 0 ? "grabbing" : "default" },
                                                position: "relative",
                                                pl: level * 2, // Indentation
                                                ...(isDragOver && {
                                                    bgcolor: isSelected && !isDragged ? "rgba(0, 190, 255, 0.3)" : "rgba(33, 150, 243, 0.2)",
                                                    boxShadow: "inset 0 2px 0 0 #2196F3, inset 0 2px 4px rgba(33, 150, 243, 0.3)",
                                                    borderRadius: "4px",
                                                }),
                                                "&:hover": {
                                                    bgcolor: isDragOver ? isSelected && !isDragged ? "rgba(0, 190, 255, 0.3)" : "rgba(33, 150, 243, 0.25)" : isDragged ? "transparent" : "rgba(255,255,255,0.05)",
                                                },
                                            }}
                                            secondaryAction={
                                                <Box sx={{ display: "flex", gap: 0 }}>
                                                    {/* Toggle Expand for Groups */}
                                                    {hasChildren && (
                                                        <IconButton
                                                            edge="end"
                                                            size="small"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setExpandedGroups(prev => ({ ...prev, [groupId]: !isExpanded }));
                                                            }}
                                                            sx={{ color: "inherit", p: 0.5 }}
                                                        >
                                                            {isExpanded ? <ExpandMore sx={{ fontSize: 16 }} /> : <ChevronLeftIcon sx={{ fontSize: 16, transform: 'rotate(180deg)' }} />}
                                                        </IconButton>
                                                    )}
                                                    {(() => {
                                                        const isObjVisible = (obj as any).userVisible !== false;
                                                        const isObjLocked = !!obj.lockMovementX;
 
                                                        return (
                                                            <>
                                                                <IconButton
                                                                    edge="end"
                                                                    size="small"
                                                                    onClick={(e) => toggleVisibility(e, obj, parentGroup)}
                                                                    sx={{ color: "inherit", p: 0.5, opacity: isObjVisible ? 0 : 1, transition: 'opacity 0.2s', '.MuiListItem-root:hover &': { opacity: 1 } }}
                                                                >
                                                                    {isObjVisible ? <Visibility sx={{ fontSize: 16, color: theme.palette.text.disabled }} /> : <VisibilityOff sx={{ fontSize: 16 }} />}
                                                                </IconButton>
                                                                <IconButton
                                                                    edge="end"
                                                                    size="small"
                                                                    onClick={(e) => toggleLock(e, obj, parentGroup)}
                                                                    sx={{ color: "inherit", p: 0.5, opacity: isObjLocked ? 1 : 0, transition: 'opacity 0.2s', '.MuiListItem-root:hover &': { opacity: 1 } }}
                                                                >
                                                                    {isObjLocked ? <Lock sx={{ fontSize: 16 }} /> : <LockOpen sx={{ fontSize: 16, color: theme.palette.text.disabled }} />}
                                                                </IconButton>
                                                            </>
                                                        );
                                                    })()}
                                                </Box>
                                            }
                                        >
                                            <ListItemButton
                                                onClick={(e) => handleSelect(e, obj, level === 0 ? i : -1, parentGroup)}
                                                sx={{ py: 0.5, pl: 2, pr: 8, cursor: level === 0 ? "grab" : "default", "&:active": { cursor: level === 0 ? "grabbing" : "default" }, "&:hover": { opacity: 0.5 } }}
                                            >
                                                <ListItemIcon sx={{ minWidth: 44 }}>
                                                    <ObjectIcon
                                                        obj={obj}
                                                        hash={`${obj.fill}-${obj.stroke}-${obj.width}-${obj.height}-${obj.scaleX}-${obj.scaleY}-${obj.angle}-${(obj as any).skewX}-${(obj as any).skewY}-${(obj as any).text}-${(obj as any).startAngle}-${(obj as any).endAngle}-${(obj as any).points ? (obj as any).points.length : 0}`}
                                                    />
                                                </ListItemIcon>
                                                <ListItemText
                                                    primary={(obj as any).name || `Object ${i}`}
                                                    primaryTypographyProps={{ variant: "body2", fontSize: 13, noWrap: true, color: "text.primary" }}
                                                />
                                            </ListItemButton>
                                        </ListItem>
                                        
                                        {/* Render Children if Expanded Group */}
                                        {hasChildren && (
                                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                                <List component="div" disablePadding>
                                                    {isMatrix ? (
                                                        (obj as any).xCount * (obj as any).yCount > 150 ? (
                                                            <ListItem sx={{ pl: (level + 1) * 2, py: 0.5 }}>
                                                                <ListItemText 
                                                                    primary={`[${(obj as any).xCount * (obj as any).yCount} items - Details hidden for performance]`}
                                                                    primaryTypographyProps={{ 
                                                                        variant: "caption", 
                                                                        color: "text.disabled", 
                                                                        fontStyle: "italic" 
                                                                    }}
                                                                />
                                                            </ListItem>
                                                        ) : (
                                                            (obj as any).getVirtualObjects().map((child: fabric.Object, childIdx: number) => 
                                                                renderObjectNode(child, childIdx, level + 1, obj as any)
                                                            )
                                                        )
                                                    ) : (
                                                        (obj as fabric.Group).getObjects().map((child, childIdx) => 
                                                            renderObjectNode(child, childIdx, level + 1, obj as fabric.Group)
                                                        )
                                                    )}
                                                </List>
                                            </Collapse>
                                        )}
                                    </React.Fragment>
                                );
                            };

                            return objects.map((obj, i) => renderObjectNode(obj, i, 0));
                        })()}
                        {/* Drop Zone for Objects End (Modern UI - Subtle) */}
                        <Box
                            sx={{
                                height: (dragOverIndex === objects.length) ? 12 : 8,
                                mt: 0.5,
                                mx: 2,
                                borderRadius: 1,
                                transition: 'all 0.2s ease',
                                bgcolor: (dragOverIndex === objects.length) ? 'rgba(0, 190, 255, 0.3)' : 'transparent',
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                // Strict Scope
                                if (draggedObjectIndex === null) {
                                    e.dataTransfer.dropEffect = "none";
                                    return;
                                }
                                e.dataTransfer.dropEffect = "move";
                                setDragOverIndex(objects.length);
                            }}
                            onDragLeave={() => setDragOverIndex(null)}
                            onDrop={(e) => handleObjectDrop(e, objects.length)}
                        />
                    </List>
                </Collapse>
            </Box>
            {/* Context Menu */}
            <Menu
                open={contextMenu !== null}
                onClose={handleCloseContextMenu}
                anchorReference="anchorPosition"
                anchorPosition={
                    contextMenu !== null
                        ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
                        : undefined
                }
            >
                <MenuItem onClick={() => handleContextAction('toggle')}>show/hide</MenuItem>
                <MenuItem onClick={() => handleContextAction('rename')}>이름 바꾸기</MenuItem>
                {contextMenu?.type === 'object' && (
                    <MenuItem onClick={() => handleContextAction('detachColor')}>
                        {(contextMenu.target as any)?.customData?.colorPresetLinked === false
                            ? '색상 프리셋에 다시 연결'
                            : '색상 프리셋에서 분리'}
                    </MenuItem>
                )}
                <MenuItem onClick={() => handleContextAction('delete')}>삭제</MenuItem>
            </Menu>

            {/* Rename Dialog */}
            {
                renameTarget && (
                    <Box
                        sx={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 9999,
                            bgcolor: 'rgba(0,0,0,0.5)', // Backdrop
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    // Removed onClick backdrop close to prevent accidental closing
                    >
                        <Box
                            onKeyDown={(e) => {
                                // Firewall: Stop ALL keys from reaching window shortcuts
                                e.stopPropagation();
                                e.nativeEvent.stopImmediatePropagation();
                            }}
                            onClick={(e) => e.stopPropagation()}
                            sx={{
                                width: 320,
                                bgcolor: '#1E1E1E', // Dark BG
                                borderRadius: '12px',
                                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                                p: 2.5,
                                border: '1px solid #333',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 2
                            }}
                        >
                            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#fff' }}>
                                Rename Object
                            </Typography>

                            <InputBase
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                fullWidth
                                autoFocus
                                placeholder="Enter name"
                                sx={{
                                    border: '1px solid #00BEFF', // Blue Border
                                    borderRadius: '4px',
                                    px: 1.5,
                                    py: 1,
                                    bgcolor: '#2C2C2C', // Slightly lighter input BG
                                    color: '#fff',
                                    fontSize: '0.9rem',
                                    '& input::placeholder': {
                                        color: '#888',
                                        opacity: 1
                                    }
                                }}
                                onKeyDown={(e) => {
                                    // Stop Propagation to prevent Canvas Shortcuts
                                    e.stopPropagation();
                                    e.nativeEvent.stopImmediatePropagation();

                                    if (e.key === 'Enter') handleRenameSubmit();
                                    if (e.key === 'Escape') setRenameTarget(null);
                                }}
                            />

                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
                                <ListItemButton
                                    onClick={() => setRenameTarget(null)}
                                    sx={{
                                        flex: 'none',
                                        px: 2,
                                        py: 0.8,
                                        borderRadius: '6px',
                                        border: '1px solid #444',
                                        color: '#aaa',
                                        fontSize: '0.85rem',
                                        fontWeight: 500,
                                        bgcolor: 'transparent',
                                        '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', borderColor: '#666', color: '#fff' }
                                    }}
                                >
                                    Cancel
                                </ListItemButton>
                                <ListItemButton
                                    onClick={handleRenameSubmit}
                                    sx={{
                                        flex: 'none',
                                        px: 3,
                                        py: 0.8,
                                        borderRadius: '6px',
                                        bgcolor: '#00BEFF',
                                        color: '#fff',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        '&:hover': { bgcolor: '#0099CC' }
                                    }}
                                >
                                    Confirm
                                </ListItemButton>
                            </Box>
                        </Box>
                    </Box>
                )
            }
        </Box >
    );
}
