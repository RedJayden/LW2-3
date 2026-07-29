import { useEffect, useRef, useCallback } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from '../useCanvasStore';
import { PX_PER_MM, PX_SCALING_FACTOR, NAVIGATE_CURSOR } from '../constants';
import { throttle } from '../../../../../utils/throttle';
import useAppStore from '../../../../../store/appStore';
import { hwFacade } from '../../../../../services/HardwareFacade';
import { scenePxToStageMm } from '../utils/sceneCoords';

interface UseCanvasEventsProps {
    saveHistory: () => void;
    drawGrid: (canvas: fabric.Canvas, show: boolean, paper: fabric.FabricObject) => void;
    updateRuler: (vpt?: number[]) => void;
    setContextMenu: (menu: { x: number; y: number } | null) => void;
}

export const useCanvasEvents = ({
    saveHistory,
    drawGrid,
    updateRuler,
    setContextMenu
}: UseCanvasEventsProps) => {
    const { canvas, activeTool, measureMode, setActiveTool, setSelectedObject, setZoom, pxPerMm, isNavigateMode } = useCanvasStore();

    // [NEW] Navigate Mode(더블클릭 이동) 진행 가드: 이동 완료 전 재클릭 무시
    const isNavigateMovingRef = useRef(false);
    const navigateMoveCleanupRef = useRef<(() => void) | null>(null);

    // Tool State Refs
    const isDrawing = useRef(false);
    const startX = useRef(0);
    const startY = useRef(0);
    const activeShape = useRef<fabric.FabricObject | null>(null);

    // Measurement State Refs
    const isMeasuring = useRef(false);
    const measureLine = useRef<fabric.Line | null>(null);
    const measureText = useRef<fabric.Text | null>(null);
    const measureStart = useRef<{ x: number, y: number } | null>(null);
    const persistentMeasurements = useRef<fabric.FabricObject[][]>([]);

    // Dimension Text Ref
    const dimensionText = useRef<fabric.Text | null>(null);

    // Polyline State Refs
    const polylinePoints = useRef<{ x: number; y: number }[]>([]);
    const polylineLines = useRef<fabric.Line[]>([]);
    const polylineMarkers = useRef<fabric.Circle[]>([]);
    const polylineTempLine = useRef<fabric.Line | null>(null);
    const polylineTotalDist = useRef(0);
    const polylineText = useRef<fabric.Text | null>(null);

    // Polyline Shape Refs
    const polylineShapePoints = useRef<{ x: number; y: number }[]>([]);
    const polylineShapeLines = useRef<fabric.Line[]>([]);
    const polylineShapeMarkers = useRef<fabric.Circle[]>([]);
    const polylineShapeTempLine = useRef<fabric.Line | null>(null);
    // Angle Measurement Refs
    const anglePoints = useRef<{ x: number; y: number }[]>([]);
    const angleLines = useRef<fabric.Line[]>([]);
    const angleText = useRef<fabric.Text | null>(null);
    const angleArc = useRef<fabric.Path | null>(null);

    const polylineShapeTempText = useRef<fabric.Text | null>(null);

    // Arc Drawing Refs
    const arcDrawingStep = useRef<number>(0); // 0: Start(Center), 1: Radius, 2: Start Angle, 3: End Angle
    const arcCenter = useRef<{ x: number, y: number } | null>(null);
    const arcRadius = useRef<number>(0);
    const arcStartAngle = useRef<number>(0);
    const arcTempLine = useRef<fabric.Line | null>(null);
    const arcGuideCircle = useRef<fabric.Circle | null>(null);

    // Interaction State Refs
    const isMiddleClickPanning = useRef(false);
    const isDragging = useRef(false);
    const isSpacePressed = useRef(false);
    const lastPosX = useRef(0);
    const lastPosY = useRef(0);
    const isScriptedAdding = useRef(false);



    // Smart Guides Refs
    const smartGuides = useRef<fabric.FabricObject[]>([]);

    const updateDimensionText = useCallback((text: string, x: number, y: number, startX?: number, startY?: number) => {
        if (!canvas) return;
        const zoom = canvas.getZoom();
        const fontSize = 14 / zoom;
        const color = '#ff00ff';
        const padding = 5 / zoom;
        
        // [UX] High transparency to allow seeing features behind the text
        const bgColor = 'rgba(255,255,255,0.4)'; 

        // [UX] Large Offset to avoid blocking the 'Active' point (x,y)
        // Default: Well above the cursor to keep the point clear
        let left = x + (25 / zoom);
        let top = y - (65 / zoom); 

        if (startX !== undefined && startY !== undefined) {
             const isRight = x >= startX;
             const isDown = y >= startY;
             
             // If drawing Down-Right, put text WELL ABOVE and RIGHT
             if (isRight && isDown) {
                 top = y - (70 / zoom);
                 left = x + (20 / zoom);
             } 
             // If drawing Up-Left, put text WELL BELOW and LEFT
             else if (!isRight && !isDown) {
                 top = y + (30 / zoom);
                 left = x - (fontSize * text.length * 0.6) - (30 / zoom);
             }
             // If drawing Down-Left, put text WELL ABOVE and LEFT
             else if (!isRight && isDown) {
                 top = y - (70 / zoom);
                 left = x - (fontSize * text.length * 0.6) - (30 / zoom);
             }
             // If drawing Up-Right, put text WELL BELOW and RIGHT
             else {
                 top = y + (30 / zoom);
                 left = x + (30 / zoom);
             }
        }

        if (!dimensionText.current) {
            dimensionText.current = new fabric.Text(text, {
                left, top,
                fontSize: fontSize,
                fill: color,
                backgroundColor: bgColor,
                selectable: false,
                evented: false,
                padding: padding,
            });
            (dimensionText.current as any).isTemp = true;
            canvas.add(dimensionText.current);
        } else {
            dimensionText.current.set({ text, left, top, fontSize, fill: color, backgroundColor: bgColor });
            canvas.bringObjectToFront(dimensionText.current);
        }
    }, [canvas]);

    const removeDimensionText = useCallback(() => {
        if (!canvas) return;
        if (dimensionText.current) {
            canvas.remove(dimensionText.current);
            dimensionText.current = null;
        }
    }, [canvas]);

    const resetTempState = useCallback(() => {
        if (!canvas) return;

        isMeasuring.current = false;
        isDrawing.current = false;
        if (activeShape.current) {
            canvas.remove(activeShape.current);
            activeShape.current = null;
        }
        if (measureLine.current) { canvas.remove(measureLine.current); measureLine.current = null; }
        if (measureText.current) { canvas.remove(measureText.current); measureText.current = null; }

        // Reset polyline measurement
        polylinePoints.current = [];
        polylineLines.current.forEach(l => canvas.remove(l));
        polylineLines.current = [];
        polylineMarkers.current.forEach(m => canvas.remove(m));
        polylineMarkers.current = [];
        if (polylineTempLine.current) { canvas.remove(polylineTempLine.current); polylineTempLine.current = null; }
        if (polylineText.current) { canvas.remove(polylineText.current); polylineText.current = null; }
        polylineTotalDist.current = 0;

        // Reset polyline shape
        polylineShapePoints.current = [];
        polylineShapeLines.current.forEach(l => canvas.remove(l));
        polylineShapeLines.current = [];
        polylineShapeMarkers.current.forEach(m => canvas.remove(m));
        polylineShapeMarkers.current = [];
        if (polylineShapeTempLine.current) { canvas.remove(polylineShapeTempLine.current); polylineShapeTempLine.current = null; }
        if (polylineShapeTempText.current) { canvas.remove(polylineShapeTempText.current); polylineShapeTempText.current = null; }

        // Reset Angle Measurement
        anglePoints.current = [];
        angleLines.current.forEach(l => canvas.remove(l));
        angleLines.current = [];
        if (angleText.current) { canvas.remove(angleText.current); angleText.current = null; }
        if (angleArc.current) { canvas.remove(angleArc.current); angleArc.current = null; }

        if (angleArc.current) { canvas.remove(angleArc.current); angleArc.current = null; }

        // Reset Arc State
        arcDrawingStep.current = 0;
        arcCenter.current = null;
        arcRadius.current = 0;
        arcStartAngle.current = 0;

        removeDimensionText();
    }, [canvas, removeDimensionText]);

    // Reset interaction when active tool changes
    useEffect(() => {
        resetTempState();
    }, [activeTool, resetTempState]);

    const resetInteraction = useCallback(() => {
        if (!canvas) return;

        // Clear all measurements
        const objects = canvas.getObjects();
        objects.forEach(obj => {
            if ((obj as any).isMeasurement) {
                canvas.remove(obj);
            }
        });

        resetTempState();
    }, [canvas, resetTempState]);

    const handleCompletePolylineShape = useCallback(() => {
        if (!canvas) return;
        const { activeTool } = useCanvasStore.getState();
        if (activeTool !== 'polyline-shape') return;

        if (polylineShapeTempLine.current) {
            canvas.remove(polylineShapeTempLine.current);
            polylineShapeTempLine.current = null;
        }
        if (polylineShapeTempText.current) {
            canvas.remove(polylineShapeTempText.current);
            polylineShapeTempText.current = null;
        }

        polylineShapeMarkers.current.forEach(marker => canvas.remove(marker));
        polylineShapeLines.current.forEach(line => canvas.remove(line));

        const points = polylineShapePoints.current;
        if (points.length > 1) {
            isScriptedAdding.current = true;

            const first = points[0];
            const last = points[points.length - 1];
            const dist = Math.sqrt(Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2));

            const zoom = canvas.getZoom();
            const isClosed = dist < 10 / zoom / PX_SCALING_FACTOR;

            let shape;
            const commonProps = {
                stroke: '#00BEFF',
                strokeWidth: 2 / zoom, // Match Rect stroke width
                fill: 'transparent',
                selectable: true,
                evented: true,
                objectCaching: false,
                strokeUniform: true
            };

            if (isClosed) {
                points.pop();
                shape = new fabric.Polygon(points, { ...commonProps, strokeUniform: true });
            } else {
                shape = new fabric.Polyline(points, { ...commonProps, strokeUniform: true });
            }

            canvas.add(shape);
            canvas.setActiveObject(shape);
            isScriptedAdding.current = false;
            saveHistory();
        }

        removeDimensionText();
        polylineShapePoints.current = [];
        polylineShapeLines.current = [];
        polylineShapeMarkers.current = [];
        useCanvasStore.getState().setActiveTool('select');
        canvas.requestRenderAll();
    }, [canvas, saveHistory, removeDimensionText]);

    const handleCompletePolyline = useCallback(() => {
        if (!canvas || !isMeasuring.current) return;
        isMeasuring.current = false;

        if (polylineTempLine.current) {
            canvas.remove(polylineTempLine.current);
            polylineTempLine.current = null;
        }

        const components = [
            ...polylineMarkers.current,
            ...polylineLines.current,
            polylineText.current
        ].filter(Boolean);

        if (components.length > 0) {
            isScriptedAdding.current = true;
            components.forEach(obj => canvas.remove(obj as fabric.FabricObject));
            const group = new fabric.Group(components as fabric.FabricObject[], {
                selectable: true,
                evented: true,
                lockScalingX: true,
                lockScalingY: true,
                lockRotation: true,
                hasControls: false,
                subTargetCheck: false
            });
            (group as any).isMeasurement = true;
            canvas.add(group);
            persistentMeasurements.current.push([group]);
            isScriptedAdding.current = false;
            saveHistory();
        }

        removeDimensionText();
        polylinePoints.current = [];
        polylineLines.current = [];
        polylineMarkers.current = [];
        polylineText.current = null;
        polylineTotalDist.current = 0;

        canvas.requestRenderAll();
        useCanvasStore.getState().setActiveTool('select');
    }, [canvas, saveHistory, removeDimensionText]);

    const clearSmartGuides = useCallback(() => {
        if (!canvas) return;
        smartGuides.current.forEach(guide => canvas.remove(guide));
        smartGuides.current = [];
    }, [canvas]);

    // [NEW] Sync Matrix Labels utility
    const syncLabel = useCallback((obj: fabric.FabricObject) => {
        if (!canvas) return;
        const data = (obj as any).get?.('customData') || (obj as any).customData;
        if (!data) return;

        // [FIX] If this is the original shape, use session sync for everything
        if (data.isMatrixOriginal) {
            syncMatrixSession(obj);
            return;
        }

        // Individual label sync for matrix children (Normal Mode)
        if (data.matrixId) {
            const label = canvas.getObjects().find(o => {
                const oData = (o as any).get?.('customData') || (o as any).customData;
                return oData?.matrixId === data.matrixId && oData?.isMatrixLabel;
            });

            if (label) {
                const rect = obj.getBoundingRect();
                label.set({
                    left: rect.left + rect.width + 5,
                    top: rect.top
                });
                label.setCoords();
                canvas.requestRenderAll(); 
            }
        }
    }, [canvas]);

    // [NEW] High-performance Matrix Session Sync
    const syncMatrixSession = useCallback((base: fabric.FabricObject) => {
        if (!canvas) return;
        const baseData = (base as any).get?.('customData') || (base as any).customData;
        if (!baseData?.matrixSessionId) return;

        const allObjects = canvas.getObjects();
        allObjects.forEach(obj => {
            const oData = (obj as any).get?.('customData') || (obj as any).customData;
            if (oData?.matrixSessionId === baseData.matrixSessionId && obj !== base) {
                // Formula: follower position = base position + relative offset
                if (oData.offsetX !== undefined && oData.offsetY !== undefined) {
                    obj.set({
                        left: base.left! + oData.offsetX,
                        top: base.top! + oData.offsetY
                    });
                    obj.setCoords();
                }
            }
        });
        canvas.requestRenderAll();
    }, [canvas]);

    const handleObjectMoving = useCallback(throttle((e: any) => {
        if (!canvas || (canvas as any)._isDisposed) return;
        clearSmartGuides();

        const target = e.target as fabric.FabricObject;
        if (!target) return;

        if (target.type === 'activeSelection') {
            (target as fabric.ActiveSelection).getObjects().forEach(syncLabel);
        } else {
            syncLabel(target);
        }

        const objects = canvas.getObjects().filter(obj => {
            if (obj === target) return false;
            if ((obj as any).isGridLine) return false;
            if ((obj as any).isPaper) return false;
            if ((obj as any).isTemp) return false;
            if ((obj as any).isGuide) return false;
            if ((obj as any).isMeasurement) return false;

            const data = (obj as any).get?.('customData') || (obj as any).customData;
            if (data?.isMatrixChild || data?.isMatrixLabel) return false;

            return true;
        });

        if (objects.length === 0) return;

        let targetRect: any;
        let targetCenter: any;
        try {
            targetRect = target.getBoundingRect();
            targetCenter = target.getCenterPoint();
            // [FIX] STATUS_BREAKPOINT crash guard: If rect is invalid, exit early
            if (!targetRect || isNaN(targetRect.width) || isNaN(targetRect.height)) return;
        } catch (e) {
            console.warn("Invalid bounds during object move, aborting guide calc", e);
            return;
        }

        let closestLeft: { dist: number, rect: any } | null = null;
        let closestRight: { dist: number, rect: any } | null = null;
        let closestTop: { dist: number, rect: any } | null = null;
        let closestBottom: { dist: number, rect: any } | null = null;

        for (const obj of objects) {
            const rect = obj.getBoundingRect();

            // Right of target (Target Right -> Obj Left)
            if (rect.left >= targetRect.left + targetRect.width) {
                const dist = rect.left - (targetRect.left + targetRect.width);
                if (!closestRight || dist < closestRight.dist) {
                    closestRight = { dist, rect };
                }
            }

            // Left of target (Target Left -> Obj Right)
            if (rect.left + rect.width <= targetRect.left) {
                const dist = targetRect.left - (rect.left + rect.width);
                if (!closestLeft || dist < closestLeft.dist) {
                    closestLeft = { dist, rect };
                }
            }

            // Bottom of target (Target Bottom -> Obj Top)
            if (rect.top >= targetRect.top + targetRect.height) {
                const dist = rect.top - (targetRect.top + targetRect.height);
                if (!closestBottom || dist < closestBottom.dist) {
                    closestBottom = { dist, rect };
                }
            }

            // Top of target (Target Top -> Obj Bottom)
            if (rect.top + rect.height <= targetRect.top) {
                const dist = targetRect.top - (rect.top + rect.height);
                if (!closestTop || dist < closestTop.dist) {
                    closestTop = { dist, rect };
                }
            }
        }

        const zoom = canvas.getZoom();
        const fontSize = 12 / zoom;
        const strokeWidth = 1 / zoom;
        const color = '#ff00ff';

        const drawGuide = (x1: number, y1: number, x2: number, y2: number, dist: number) => {
            const line = new fabric.Line([x1, y1, x2, y2], {
                stroke: color,
                strokeWidth,
                strokeDashArray: [4 / zoom, 4 / zoom],
                selectable: false,
                evented: false,
            });
            (line as any).isGuide = true;
            canvas.add(line);
            smartGuides.current.push(line);

            const avgPxPerMm = (pxPerMm.x + pxPerMm.y) / 2;
            const distMm = (dist / avgPxPerMm).toFixed(2);
            const text = new fabric.Text(`${distMm}`, {
                left: (x1 + x2) / 2,
                top: (y1 + y2) / 2,
                fontSize,
                fill: color,
                backgroundColor: 'rgba(255,255,255,0.8)',
                originX: 'center',
                originY: 'center',
                selectable: false,
                evented: false
            });
            (text as any).isGuide = true;
            canvas.add(text);
            smartGuides.current.push(text);
        };

        if (closestRight) {
            const y = targetCenter.y;
            drawGuide(targetRect.left + targetRect.width, y, closestRight.rect.left, y, closestRight.dist);
        }
        if (closestLeft) {
            const y = targetCenter.y;
            drawGuide(closestLeft.rect.left + closestLeft.rect.width, y, targetRect.left, y, closestLeft.dist);
        }
        if (closestBottom) {
            const x = targetCenter.x;
            drawGuide(x, targetRect.top + targetRect.height, x, closestBottom.rect.top, closestBottom.dist);
        }
        if (closestTop) {
            const x = targetCenter.x;
            drawGuide(x, closestTop.rect.top + closestTop.rect.height, x, targetRect.top, closestTop.dist);
        }

    }, 32), [canvas, clearSmartGuides, pxPerMm]);

    useEffect(() => {
        if (!canvas) return;

        // [NEW] 선택 툴이 아닌 다른 툴로 변경될 때, 기존에 활성화된 도형 포커스 강제 해제
        if (activeTool !== 'select') {
            canvas.discardActiveObject();
        }

        if (activeTool === 'select') {
            // [FIX] Navigate Mode(더블클릭 이동)가 켜져 있으면 select 도구여도 편집 상태로 복원하지 않는다.
            // (탭 전환으로 캔버스가 재생성될 때 이 이펙트가 재실행되며 잠금을 풀어버리던 문제 방지)
            if (isNavigateMode) {
                canvas.selection = false;
                canvas.defaultCursor = NAVIGATE_CURSOR;
                canvas.hoverCursor = NAVIGATE_CURSOR;
                canvas.skipTargetFind = true;
                canvas.forEachObject((obj) => {
                    if (!(obj as any).isGridLine && !(obj as any).isPaper && !(obj as any).isTemp && !(obj as any).isCrosshair) {
                        obj.selectable = false;
                    }
                });
            } else {
                canvas.selection = true;
                canvas.defaultCursor = 'default';
                canvas.hoverCursor = 'move';
                canvas.skipTargetFind = false;
                canvas.forEachObject((obj) => {
                    if (!(obj as any).isGridLine && !(obj as any).isPaper && !(obj as any).isTemp && !(obj as any).isCrosshair) {
                        obj.selectable = true;
                        obj.evented = true;
                    }
                });
            }
        } else if (activeTool === 'pan') {
            canvas.selection = false;
            canvas.defaultCursor = 'grab';
            canvas.hoverCursor = 'grab';
            canvas.forEachObject((obj) => {
                obj.selectable = false;
                obj.evented = false;
            });
        } else if (activeTool === 'laserCenter') {
            canvas.selection = false;
            canvas.defaultCursor = 'crosshair';
            canvas.hoverCursor = 'crosshair';
            canvas.forEachObject((obj) => {
                obj.selectable = false;
                obj.evented = false;
            });
        } else {
            canvas.selection = false;
            canvas.defaultCursor = 'crosshair';
            canvas.hoverCursor = 'crosshair';
            canvas.forEachObject((obj) => {
                obj.selectable = false;
                obj.evented = false;
            });
        }
        canvas.requestRenderAll();
    }, [canvas, activeTool, isNavigateMode]);

    useEffect(() => {
        if (!canvas) return;

        const handleMouseDown = (opt: any) => {
            const evt = opt.e as MouseEvent;
            const { activeTool } = useCanvasStore.getState();
            console.log('[useCanvasEvents] mouse:down', { activeTool, button: evt.button });

            if ((opt as any).button === 3 || evt.button === 2) {
                if (!evt.shiftKey) {
                    // Select object on right click if not already selected
                    if (opt.target && opt.target.selectable && activeTool === 'select') {
                        const activeObj = canvas.getActiveObject();
                        if (activeObj && activeObj.type === 'activeSelection') {
                            const isTargetInSelection = (activeObj as fabric.ActiveSelection).getObjects().includes(opt.target);
                            if (!isTargetInSelection) {
                                canvas.setActiveObject(opt.target);
                            }
                        } else {
                            canvas.setActiveObject(opt.target);
                        }
                        canvas.requestRenderAll();
                    }
                    
                    // Backup active objects in case selection is discarded during context menu interaction
                    const activeObjects = canvas.getActiveObjects();
                    if (activeObjects && activeObjects.length > 0) {
                        (canvas as any)._contextMenuObjectsBackup = [...activeObjects];
                    } else {
                        (canvas as any)._contextMenuObjectsBackup = null;
                    }

                    setContextMenu({ x: evt.clientX, y: evt.clientY });
                }
                return;
            }
            setContextMenu(null);

            // Middle click detection (Native 1, Fabric 2 or opt.button === 2)
            if (evt.button === 1 || (opt as any).button === 2) {
                isMiddleClickPanning.current = true;
                isDragging.current = true;
                canvas.selection = false;
                lastPosX.current = evt.clientX;
                lastPosY.current = evt.clientY;
                canvas.defaultCursor = 'grabbing';
                console.log('[useCanvasEvents] Middle click panning started');
                return;
            }

            // [NEW] Laser Set Center Tool
            if (activeTool === 'laserCenter') {
                const pointer = canvas.getScenePoint(evt);
                console.log('[useCanvasEvents] Laser Center Clicked:', pointer);
                useCanvasStore.getState().setLaserClickPosition({ x: pointer.x, y: pointer.y });
                useCanvasStore.getState().setActiveTool('select');
                canvas.defaultCursor = 'default';
                return;
            }


            const { currentScope } = useCanvasStore.getState();

            if (currentScope === 'recipe' && ['rect', 'circle', 'arc', 'triangle', 'line', 'text'].includes(activeTool)) {
                console.log('[DEBUG] Tool is Shape:', activeTool);

                // Special handling for Arc multi-step
                if (activeTool === 'arc') {
                    console.log('[DEBUG] Arc Tool Clicked. Step:', arcDrawingStep.current);
                    const pointer = canvas.getScenePoint(evt);

                    if (arcDrawingStep.current === 0) {
                        // Step 0: Set Center
                        isDrawing.current = true;
                        canvas.selection = false;
                        arcCenter.current = { x: pointer.x, y: pointer.y };

                        // Create Active Shape (The Final Arc) - Initially Hidden
                        const commonProps = {
                            left: pointer.x,
                            top: pointer.y,
                            fill: 'transparent',
                            stroke: '#00BEFF', // Final Color
                            strokeWidth: 2 / canvas.getZoom(),
                            selectable: false,
                            evented: false,
                            isHairline: true,
                            originX: 'center' as const,
                            originY: 'center' as const,
                            opacity: 0, // Hidden initially
                            strokeUniform: true
                        };

                        const shape = new fabric.Circle({ ...commonProps, radius: 0 });
                        activeShape.current = shape;
                        canvas.add(shape);

                        // Create Radius Line (Visual Feedback for Step 1)
                        const line = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
                            stroke: '#ff00ff', // Magenta prompt color
                            strokeWidth: 1 / canvas.getZoom(),
                            selectable: false,
                            evented: false,
                            strokeDashArray: [5, 5],
                            strokeUniform: true
                        });
                        (line as any).isTemp = true;
                        arcTempLine.current = line;
                        canvas.add(line);

                        arcDrawingStep.current = 1; // Move to Radius step
                        console.log('[useCanvasEvents] Arc Step 0->1: Center set', pointer);
                    } else if (arcDrawingStep.current === 1) {
                        // Step 1: Confirm Radius -> Move to Start Angle
                        // 1. Create Guide Circle (Dashed, Full)
                        const guide = new fabric.Circle({
                            left: arcCenter.current!.x,
                            top: arcCenter.current!.y,
                            radius: arcRadius.current,
                            fill: 'transparent',
                            stroke: '#aaaaaa',
                            strokeWidth: 1 / canvas.getZoom(),
                            strokeDashArray: [5, 5],
                            selectable: false,
                            evented: false,
                            originX: 'center',
                            originY: 'center',
                            opacity: 0.8
                        });
                        (guide as any).isTemp = true;
                        arcGuideCircle.current = guide;
                        // Fabric v6/v7: insertAt(object, index)
                        const activeIndex = canvas.getObjects().indexOf(activeShape.current!);
                        canvas.insertAt(activeIndex >= 0 ? activeIndex : 0, guide); // Put behind active shape

                        // 2. Keep Temp Line as "Angle Indicator"
                        // It currently points from Center to Radius-Point.
                        // We continue using it to point to Cursor for Start Angle.

                        arcDrawingStep.current = 2;
                        console.log('[useCanvasEvents] Arc Step 1->2: Radius confirmed, Guide Circle added');
                    } else if (arcDrawingStep.current === 2) {
                        // Step 2: Confirm Start Angle -> Move to End Angle

                        // Show the Active Shape (The Arc) - partially properties set
                        // but we will update start/end angles in MouseMove.
                        if (activeShape.current) {
                            activeShape.current.set({ opacity: 1 });
                            // Set initial angles equal so it's empty or barely visible,
                            // or starts growing from here.
                            // MouseMove will drive the "EndAngle".
                        }

                        arcDrawingStep.current = 3;
                        console.log('[useCanvasEvents] Arc Step 2->3: Start Angle confirmed');
                    } else if (arcDrawingStep.current === 3) {
                        // Step 3: Finish
                        console.log('[useCanvasEvents] Arc Step 3->Finish: End Angle confirmed');

                        // Finalize Logic
                        isDrawing.current = false;
                        if (activeShape.current) {
                            const circle = activeShape.current as fabric.Circle;
                            activeShape.current.set({ selectable: true, evented: true });
                            activeShape.current.setCoords();
                            activeShape.current = null;
                            saveHistory();
                            canvas.requestRenderAll();
                        }

                        // Cleanup
                        arcDrawingStep.current = 0;
                        arcCenter.current = null;
                        arcRadius.current = 0;
                        arcStartAngle.current = 0;

                        if (arcTempLine.current) {
                            canvas.remove(arcTempLine.current);
                            arcTempLine.current = null;
                        }
                        if (arcGuideCircle.current) {
                            canvas.remove(arcGuideCircle.current);
                            arcGuideCircle.current = null;
                        }

                        removeDimensionText();
                        useCanvasStore.getState().setActiveTool('select');
                    }
                    return;
                }

                isDrawing.current = true;
                canvas.selection = false;
                const pointer = canvas.getScenePoint(evt);
                startX.current = pointer.x;
                startY.current = pointer.y;
                console.log('[useCanvasEvents] Start Drawing', { tool: activeTool, startX: startX.current, startY: startY.current });

                if (activeTool === 'text') {
                    const zoom = canvas.getZoom();
                    const text = new fabric.IText('Text', {
                        left: startX.current,
                        top: startY.current,
                        fontFamily: 'Arial',
                        cursorColor: '#00BEFF',
                        cursorWidth: 2, // Scales with object
                        fontSize: 40, // [FIX] Fixed font size, scale object instead
                        scaleX: 1 / zoom, // [FIX] Scale adaptively to bypass font limits
                        scaleY: 1 / zoom, // [FIX] Scale adaptively to bypass font limits
                        fill: 'transparent',
                        stroke: '#00BEFF',
                        strokeWidth: 1, // Scales with object -> 1px visual
                        strokeUniform: true, // [FIX] Maintain stroke width across zoom for Text
                        selectable: true,
                        evented: true,
                        originX: 'center',
                        originY: 'center',
                        objectCaching: false
                    });
                    canvas.add(text);
                    canvas.setActiveObject(text);
                    text.enterEditing();
                    text.selectAll();
                    isDrawing.current = false;
                    useCanvasStore.getState().setActiveTool('select');
                    saveHistory();
                    return;
                }

                let shape: fabric.FabricObject | null = null;
                const commonProps = {
                    left: startX.current,
                    top: startY.current,
                    fill: 'transparent',
                    stroke: '#00BEFF',
                    strokeWidth: 2 / canvas.getZoom(), // Initial cosmetic width 2px
                    selectable: false,
                    evented: false,
                    objectCaching: false,
                    strokeUniform: true,
                    isHairline: true
                };

                if (activeTool === 'rect') {
                    shape = new fabric.Rect({ ...commonProps, width: 0, height: 0, originX: 'left', originY: 'top' });
                } else if (activeTool === 'circle') {
                    shape = new fabric.Circle({ ...commonProps, radius: 0, originX: 'left', originY: 'top' });
                } else if (activeTool === 'triangle') {
                    shape = new fabric.Triangle({ ...commonProps, width: 0, height: 0, originX: 'left', originY: 'top' });
                } else if (activeTool === 'line') {
                    shape = new fabric.Line([startX.current, startY.current, startX.current, startY.current], commonProps);
                }

                if (shape) {
                    activeShape.current = shape;
                    canvas.add(shape);
                    console.log('[useCanvasEvents] Shape added', shape);

                    const store = useCanvasStore.getState();
                    store.setSelectedObject(shape);
                }
            } else if (activeTool === 'dot') {
                const pointer = canvas.getScenePoint(evt);
                const { pxPerMm, viewMode } = useCanvasStore.getState();

                // [FIX] 시인성 극대화를 위해 픽셀 기준 반지름 5px로 변경하고 줌 불변 속성 추가
                const visualRadius = 5;
                const zoom = canvas.getZoom();

                // Naming Logic: Count existing 'Dot N'
                const objects = canvas.getObjects();
                const dotCount = objects.filter((o: any) => o.name && o.name.startsWith('Dot ')).length;
                const newName = `Dot ${dotCount + 1}`;

                // Mark Time Logic: Scanner view -> 0.2, Object view -> 1.0
                const defaultMarkTime = viewMode === 'scanner' ? 0.2 : 1.0;

                // 2px 원형 (radius 1, 채움)
                const dotCircle = new fabric.Circle({
                    left: 0,
                    top: 0,
                    radius: 1, // 직경 2px (물리 좌표계 기준)
                    fill: '#00BEFF',
                    strokeWidth: 0,
                    originX: 'center',
                    originY: 'center'
                });

                // 3px 짜리 X 모양 마커 (-1.5 ~ +1.5 대각선)
                const diag1 = new fabric.Line([-1.5, -1.5, 1.5, 1.5], {
                    stroke: '#00BEFF',
                    strokeWidth: 2 / zoom,
                    originX: 'center',
                    originY: 'center',
                    isHairline: true,
                    strokeUniform: true
                });

                const diag2 = new fabric.Line([-1.5, 1.5, 1.5, -1.5], {
                    stroke: '#00BEFF',
                    strokeWidth: 2 / zoom,
                    originX: 'center',
                    originY: 'center',
                    isHairline: true,
                    strokeUniform: true
                });

                // 그룹으로 묶기 (isConstantSize 제거 -> 일반 도형처럼 줌에 따라 스케일 변함)
                const dotGroup = new fabric.Group([dotCircle, diag1, diag2], {
                    left: pointer.x,
                    top: pointer.y,
                    originX: 'center',
                    originY: 'center',
                    selectable: true,
                    evented: true,
                    objectCaching: false,
                    id: 'dot_marker',
                    name: newName,
                    markPointTime: defaultMarkTime
                });

                canvas.add(dotGroup);
                canvas.setActiveObject(dotGroup);
                useCanvasStore.getState().setActiveTool('select');
                saveHistory();

                // [NOTE] No group needed for single object
            } else if (activeTool === 'polyline-shape' && currentScope === 'recipe') {
                const pointer = canvas.getScenePoint(evt);
                const zoom = canvas.getZoom();
                const strokeWidth = 1 / zoom;

                // [NEW] Smart Close Loop Logic
                if (polylineShapePoints.current.length > 2) {
                    const firstPoint = polylineShapePoints.current[0];
                    const distToStart = Math.sqrt(Math.pow(pointer.x - firstPoint.x, 2) + Math.pow(pointer.y - firstPoint.y, 2));
                    const snapThreshold = 20 / zoom;

                    if (distToStart < snapThreshold) {
                        // User clicked on Start Point -> Close Loop
                        // Push the start point as the last point to trigger 'isClosed' logic in handleCompletePolylineShape
                        polylineShapePoints.current.push({ x: firstPoint.x, y: firstPoint.y });
                        handleCompletePolylineShape();
                        return;
                    }
                }

                polylineShapePoints.current.push({ x: pointer.x, y: pointer.y });

                const marker = new fabric.Circle({
                    left: pointer.x,
                    top: pointer.y,
                    radius: 4 / zoom,
                    fill: '#00BEFF',
                    originX: 'center',
                    originY: 'center',
                    selectable: false,
                    evented: false,
                    isTemp: true // [FIX] Hide from Layer List
                });
                canvas.add(marker);
                polylineShapeMarkers.current.push(marker);

                if (polylineShapePoints.current.length > 1) {
                    const prev = polylineShapePoints.current[polylineShapePoints.current.length - 2];
                    const line = new fabric.Line([prev.x, prev.y, pointer.x, pointer.y], {
                        stroke: '#00BEFF',
                        strokeWidth,
                        selectable: false,
                        evented: false,
                        isTemp: true // [FIX] Hide from Layer List
                    });
                    canvas.add(line);
                    polylineShapeLines.current.push(line);
                }

                if (!polylineShapeTempLine.current) {
                    polylineShapeTempLine.current = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
                        stroke: '#00BEFF',
                        strokeWidth,
                        strokeDashArray: [5, 5],
                        selectable: false,
                        evented: false,
                        opacity: 0.5,
                        isTemp: true // [FIX] Hide from Layer List
                    });
                    canvas.add(polylineShapeTempLine.current);
                } else {
                    polylineShapeTempLine.current.set({ x1: pointer.x, y1: pointer.y, x2: pointer.x, y2: pointer.y });
                }

                canvas.requestRenderAll();
            } else if (activeTool === 'measure') {
                const pointer = canvas.getScenePoint(evt);
                const { measureMode } = useCanvasStore.getState();
                const zoom = canvas.getZoom();
                const strokeWidth = 1 / zoom;
                const fontSize = 14 / zoom;
                const textOffset = 10 / zoom;

                if (measureMode === 'distance' || measureMode === 'width' || measureMode === 'height') {
                    if (!isMeasuring.current) {
                        isMeasuring.current = true;
                        measureStart.current = { x: pointer.x, y: pointer.y };

                        measureLine.current = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
                            stroke: '#ff00ff',
                            strokeWidth,
                            selectable: false,
                            evented: false
                        });
                        (measureLine.current as any).isMeasurement = true;
                        canvas.add(measureLine.current);

                        measureText.current = new fabric.Text('0.00 mm', {
                            left: pointer.x + textOffset,
                            top: pointer.y + textOffset,
                            fontSize,
                            fill: '#ff00ff',
                            backgroundColor: 'rgba(255,255,255,0.8)',
                            selectable: false,
                            evented: false
                        });
                        (measureText.current as any).isMeasurement = true;
                        canvas.add(measureText.current);
                    } else {
                        isMeasuring.current = false;
                        if (measureLine.current && measureText.current) {
                            const group = new fabric.Group([measureLine.current, measureText.current], {
                                selectable: true,
                                evented: true,
                                lockScalingX: true,
                                lockScalingY: true,
                                lockRotation: true,
                                hasControls: false,
                                subTargetCheck: false
                            });
                            (group as any).isMeasurement = true;
                            canvas.add(group);
                            persistentMeasurements.current.push([group]);
                            canvas.remove(measureLine.current);
                            canvas.remove(measureText.current);
                        }
                        measureLine.current = null;
                        measureText.current = null;
                        useCanvasStore.getState().setActiveTool('select');
                    }
                } else if (measureMode === 'circle') {
                    if (!isMeasuring.current) {
                        isMeasuring.current = true;
                        measureStart.current = { x: pointer.x, y: pointer.y };

                        // Use activeShape for circle measurement to reuse drawing logic style
                        activeShape.current = new fabric.Circle({
                            left: pointer.x,
                            top: pointer.y,
                            radius: 0,
                            originX: 'center',
                            originY: 'center',
                            fill: 'transparent',
                            stroke: '#ff00ff',
                            strokeWidth,
                            selectable: false,
                            evented: false,
                            objectCaching: false
                        });
                        (activeShape.current as any).isMeasurement = true;
                        canvas.add(activeShape.current);

                        measureText.current = new fabric.Text('R: 0.00 mm', {
                            left: pointer.x + textOffset,
                            top: pointer.y + textOffset,
                            fontSize,
                            fill: '#ff00ff',
                            backgroundColor: 'rgba(255,255,255,0.8)',
                            selectable: false,
                            evented: false
                        });
                        (measureText.current as any).isMeasurement = true;
                        canvas.add(measureText.current);
                    } else {
                        isMeasuring.current = false;
                        if (activeShape.current && measureText.current) {
                            const group = new fabric.Group([activeShape.current, measureText.current], {
                                selectable: true,
                                evented: true,
                                lockScalingX: true,
                                lockScalingY: true,
                                lockRotation: true,
                                hasControls: false,
                                subTargetCheck: false
                            });
                            (group as any).isMeasurement = true;
                            canvas.add(group);
                            persistentMeasurements.current.push([group]);
                            canvas.remove(activeShape.current);
                            canvas.remove(measureText.current);
                        }
                        activeShape.current = null;
                        measureText.current = null;
                        useCanvasStore.getState().setActiveTool('select');
                    }
                } else if (measureMode === 'rect') {
                    if (!isMeasuring.current) {
                        isMeasuring.current = true;
                        measureStart.current = { x: pointer.x, y: pointer.y };

                        activeShape.current = new fabric.Rect({
                            left: pointer.x,
                            top: pointer.y,
                            width: 0,
                            height: 0,
                            originX: 'left',
                            originY: 'top',
                            fill: 'transparent',
                            stroke: '#ff00ff',
                            strokeWidth,
                            selectable: false,
                            evented: false,
                            objectCaching: false,
                            strokeUniform: true
                        });
                        (activeShape.current as any).isMeasurement = true;
                        canvas.add(activeShape.current);

                        measureText.current = new fabric.Text('W: 0.00 mm\nH: 0.00 mm', {
                            left: pointer.x + textOffset,
                            top: pointer.y + textOffset,
                            fontSize,
                            fill: '#ff00ff',
                            backgroundColor: 'rgba(255,255,255,0.8)',
                            selectable: false,
                            evented: false,
                            textAlign: 'left'
                        });
                        (measureText.current as any).isMeasurement = true;
                        canvas.add(measureText.current);
                    } else {
                        isMeasuring.current = false;
                        if (activeShape.current && measureText.current) {
                            const group = new fabric.Group([activeShape.current, measureText.current], {
                                selectable: true,
                                evented: true,
                                lockScalingX: true,
                                lockScalingY: true,
                                lockRotation: true,
                                hasControls: false,
                                subTargetCheck: false
                            });
                            (group as any).isMeasurement = true;
                            canvas.add(group);
                            persistentMeasurements.current.push([group]);

                            // [FIX] Remove temp objects to prevent duplication
                            canvas.remove(activeShape.current);
                            canvas.remove(measureText.current);
                        }
                        activeShape.current = null;
                        measureText.current = null;
                        useCanvasStore.getState().setActiveTool('select');
                    }
                } else if (measureMode === 'polyline') {
                    isMeasuring.current = true;
                    polylinePoints.current.push({ x: pointer.x, y: pointer.y });

                    const marker = new fabric.Circle({
                        left: pointer.x,
                        top: pointer.y,
                        radius: 3 / zoom,
                        fill: '#ff00ff',
                        originY: 'center',
                        selectable: false,
                        evented: false,
                        strokeUniform: true
                    });
                    (marker as any).isMeasurement = true;
                    canvas.add(marker);
                    polylineMarkers.current.push(marker);

                    if (polylinePoints.current.length > 1) {
                        const prev = polylinePoints.current[polylinePoints.current.length - 2];
                        const line = new fabric.Line([prev.x, prev.y, pointer.x, pointer.y], {
                            stroke: '#ff00ff',
                            strokeWidth,
                            selectable: false,
                            evented: false,
                            strokeUniform: true
                        });
                        (line as any).isMeasurement = true;
                        canvas.add(line);
                        polylineLines.current.push(line);

                        const dist = Math.sqrt(Math.pow(pointer.x - prev.x, 2) + Math.pow(pointer.y - prev.y, 2));
                        polylineTotalDist.current += dist;
                    }

                    if (!polylineText.current) {
                        polylineText.current = new fabric.Text('0.00 mm', {
                            left: pointer.x + textOffset,
                            top: pointer.y + textOffset,
                            fontSize,
                            fill: '#ff00ff',
                            backgroundColor: 'rgba(255,255,255,0.8)',
                            selectable: false,
                            evented: false
                        });
                        (polylineText.current as any).isMeasurement = true;
                        canvas.add(polylineText.current);
                    } else {
                        const avgPxPerMm = (pxPerMm.x + pxPerMm.y) / 2;
                        const distMm = (polylineTotalDist.current / avgPxPerMm).toFixed(2);
                        polylineText.current.set({ text: `${distMm} mm`, left: pointer.x + textOffset, top: pointer.y + textOffset });
                        canvas.bringObjectToFront(polylineText.current);
                    }

                    if (!polylineTempLine.current) {
                        polylineTempLine.current = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
                            stroke: '#ff00ff',
                            strokeWidth,
                            strokeDashArray: [5, 5],
                            selectable: false,
                            evented: false,
                            opacity: 0.5,
                            strokeUniform: true
                        });
                        canvas.add(polylineTempLine.current);
                    } else {
                        polylineTempLine.current.set({ x1: pointer.x, y1: pointer.y, x2: pointer.x, y2: pointer.y });
                    }

                    canvas.requestRenderAll();
                } else if (measureMode === 'angle') {
                    anglePoints.current.push({ x: pointer.x, y: pointer.y });

                    // Click 1: Vertex
                    if (anglePoints.current.length === 1) {
                        isMeasuring.current = true;
                        // Create temp line for first arm
                        const line = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
                            stroke: '#ff00ff',
                            strokeWidth,
                            selectable: false,
                            evented: false,
                            strokeUniform: true
                        });
                        (line as any).isMeasurement = true;
                        canvas.add(line);
                        angleLines.current.push(line);

                        // Click 2: First Arm End
                    } else if (anglePoints.current.length === 2) {
                        // Create temp line for second arm
                        const vertex = anglePoints.current[0];
                        const line = new fabric.Line([vertex.x, vertex.y, pointer.x, pointer.y], {
                            stroke: '#ff00ff',
                            strokeWidth,
                            selectable: false,
                            evented: false,
                            strokeUniform: true
                        });
                        (line as any).isMeasurement = true;
                        canvas.add(line);
                        angleLines.current.push(line);

                        // Click 3: Second Arm End (Finish)
                    } else if (anglePoints.current.length === 3) {
                        isMeasuring.current = false;

                        // Calculate final angle
                        const p1 = anglePoints.current[1];
                        const p2 = anglePoints.current[0]; // Vertex
                        const p3 = anglePoints.current[2];

                        const angle1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
                        const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
                        let angleDeg = (angle2 - angle1) * 180 / Math.PI;
                        if (angleDeg < 0) angleDeg += 360;
                        if (angleDeg > 180) angleDeg = 360 - angleDeg; // Take smaller angle

                        // Remove preview text/arc if exists
                        if (angleText.current) {
                            canvas.remove(angleText.current);
                            angleText.current = null;
                        }
                        if (angleArc.current) {
                            canvas.remove(angleArc.current);
                            angleArc.current = null;
                        }

                        // Create Arc Path
                        const radius = 20 / canvas.getZoom();
                        const startAngle = Math.atan2(p1.y - p2.y, p1.x - p2.x);
                        const endAngle = Math.atan2(p3.y - p2.y, p3.x - p2.x);

                        let start = startAngle;
                        let end = endAngle;

                        // Ensure we draw the smaller angle
                        let diff = end - start;
                        while (diff <= -Math.PI) diff += 2 * Math.PI;
                        while (diff > Math.PI) diff -= 2 * Math.PI;

                        if (diff < 0) {
                            const temp = start;
                            start = end;
                            end = temp;
                        }

                        // Check if we need the large arc flag (should be 0 for < 180)
                        const largeArcFlag = Math.abs(diff) > Math.PI ? 1 : 0;

                        const startX = p2.x + radius * Math.cos(start);
                        const startY = p2.y + radius * Math.sin(start);
                        const endX = p2.x + radius * Math.cos(end);
                        const endY = p2.y + radius * Math.sin(end);

                        const pathData = `M ${p2.x} ${p2.y} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;

                        const arc = new fabric.Path(pathData, {
                            fill: 'rgba(255, 0, 255, 0.2)',
                            stroke: '#ff00ff',
                            strokeWidth: 1 / canvas.getZoom(),
                            selectable: false,
                            evented: false,
                            originX: 'left',
                            originY: 'top'
                        });
                        (arc as any).isMeasurement = true;

                        // Create Text
                        const text = new fabric.Text(`${angleDeg.toFixed(2)}`, {
                            left: p2.x + (radius + 10 / canvas.getZoom()) * Math.cos(start + diff / 2),
                            top: p2.y + (radius + 10 / canvas.getZoom()) * Math.sin(start + diff / 2),
                            fontSize,
                            fill: '#ff00ff',
                            backgroundColor: 'rgba(255,255,255,0.8)',
                            selectable: false,
                            evented: false,
                            originX: 'center',
                            originY: 'center'
                        });
                        (text as any).isMeasurement = true;


                        // Group elements
                        const group = new fabric.Group([...angleLines.current, arc, text], {
                            selectable: true,
                            evented: true,
                            lockScalingX: true,
                            lockScalingY: true,
                            lockRotation: true,
                            hasControls: false,
                            subTargetCheck: false
                        });
                        (group as any).isMeasurement = true;
                        canvas.add(group);
                        persistentMeasurements.current.push([group]);

                        // Cleanup temp objects (they are now in group, but we remove references)
                        angleLines.current.forEach(l => canvas.remove(l));

                        anglePoints.current = [];
                        angleLines.current = [];
                        angleText.current = null;
                        angleArc.current = null;

                        // Reset tool to select and ensure selection
                        useCanvasStore.getState().setActiveTool('select');
                        canvas.setActiveObject(group);
                        canvas.requestRenderAll();
                    }
                }
            } else if (activeTool === 'pan') {
                isDragging.current = true;
                canvas.selection = false;
                lastPosX.current = evt.clientX;
                lastPosY.current = evt.clientY;
                canvas.defaultCursor = 'grabbing';
            }
        };

        const handleMouseMove = throttle((opt: any) => {
            const evt = opt.e as MouseEvent;
            const { activeTool, measureMode } = useCanvasStore.getState();
            const pointer = canvas.getScenePoint(evt);

            // [FIX] Update userPan in store during manual panning to ensure stability across effects
            if (isDragging.current && (activeTool === 'pan' || isSpacePressed.current || isMiddleClickPanning.current)) {
                const { userPan, setUserPan, viewMode } = useCanvasStore.getState();
                const vpt = canvas.viewportTransform!;
                const dx = evt.clientX - lastPosX.current;
                const dy = evt.clientY - lastPosY.current;
                
                let nextVpt4 = vpt[4] + dx;
                let nextVpt5 = vpt[5] + dy;
                
                const zoom = canvas.getZoom();
                const containerW = canvas.width!;
                const containerH = canvas.height!;
                const centerX = (containerW + 60) / 2;
                const centerY = (containerH + 20) / 2;

                const stageLimit = useAppStore.getState().stageLimit;
                const ratio = 0.1; // 10% 비율 추가 마진
                const spanX = stageLimit.maxX - stageLimit.minX;
                const spanY = stageLimit.maxY - stageLimit.minY;
                const limitMinX = stageLimit.minX - spanX * ratio;
                const limitMaxX = stageLimit.maxX + spanX * ratio;
                const limitMinY = stageLimit.minY - spanY * ratio;
                const limitMaxY = stageLimit.maxY + spanY * ratio;

                const evtBaseScale = useCanvasStore.getState().pxPerMm || { x: 1000, y: 1000 };
                const stageW_px = (limitMaxX - limitMinX) * evtBaseScale.x * zoom;
                const stageH_px = (limitMaxY - limitMinY) * evtBaseScale.y * zoom;

                const isFitCameraMode = viewMode !== 'canvas'; 

                if (isFitCameraMode) {
                    // [Fit to Camera 모드]: 카메라 중심뷰가 동적 영역 내부에만 매핑되도록 userPan 제한
                    const latestPositions = useAppStore.getState().positions;
                    const pxX = latestPositions.X * evtBaseScale.x;
                    const pxY = -latestPositions.Y * evtBaseScale.y;

                    const minUserPanX = pxX * zoom - (stageW_px / 2);
                    const maxUserPanX = pxX * zoom + (stageW_px / 2);
                    const minUserPanY = pxY * zoom - (stageH_px / 2);
                    const maxUserPanY = pxY * zoom + (stageH_px / 2);

                    // [V13 FIX] Compute userPan from the CURRENT viewport instead of the stored value.
                    // Stored userPan may be stale (e.g., after fitScreen which doesn't update userPan
                    // to match the camera formula). Using stored value causes a visible jump on the
                    // very first pan move after a viewport change.
                    // Formula: vpt[4] = centerX + userPan - pxX*zoom  →  userPan = vpt[4] - centerX + pxX*zoom
                    const currentUserPanX = vpt[4] - centerX + (pxX * zoom);
                    const currentUserPanY = vpt[5] - centerY + (pxY * zoom);

                    let nextUserPanX = currentUserPanX + dx;
                    let nextUserPanY = currentUserPanY + dy;


                    if (nextUserPanX < minUserPanX) nextUserPanX = minUserPanX;
                    if (nextUserPanX > maxUserPanX) nextUserPanX = maxUserPanX;
                    if (nextUserPanY < minUserPanY) nextUserPanY = minUserPanY;
                    if (nextUserPanY > maxUserPanY) nextUserPanY = maxUserPanY;

                    nextVpt4 = centerX + nextUserPanX - (pxX * zoom);
                    nextVpt5 = centerY + nextUserPanY - (pxY * zoom);

                    setUserPan({ x: nextUserPanX, y: nextUserPanY });
                } else {
                    // [Fit to Working Area 모드]: 도화지가 화면 밖으로 완전히 유실되지 않도록 화면 중심 기준 1.0배 크기로 제한
                    const minVpt4 = centerX - stageW_px;
                    const maxVpt4 = centerX + stageW_px;
                    const minVpt5 = centerY - stageH_px;
                    const maxVpt5 = centerY + stageH_px;

                    if (nextVpt4 < minVpt4) nextVpt4 = minVpt4;
                    if (nextVpt4 > maxVpt4) nextVpt4 = maxVpt4;
                    if (nextVpt5 < minVpt5) nextVpt5 = minVpt5;
                    if (nextVpt5 > maxVpt5) nextVpt5 = maxVpt5;

                    setUserPan({
                        x: nextVpt4 - centerX,
                        y: nextVpt5 - centerY
                    });
                }

                vpt[4] = nextVpt4;
                vpt[5] = nextVpt5;
                
                canvas.setViewportTransform(vpt);
                canvas.requestRenderAll();
                lastPosX.current = evt.clientX;
                lastPosY.current = evt.clientY;
                // [FIX] Explicitly update store/ruler on every mouse move to ensure
                // zero-lag synchronization between Fabric and HTML layers.
                updateRuler(vpt);
                return;
            }

            // ... (existing drawing move logic)
            // Drawing Move
            if (isDrawing.current && activeShape.current) {
                const pointer = canvas.getScenePoint(evt);
                const zoom = canvas.getZoom();
                const textOffset = 15 / zoom;

                console.log('[useCanvasEvents] Drawing Move', { tool: activeTool, pointer });
                if (activeTool === 'rect') {
                    const width = pointer.x - startX.current;
                    const height = pointer.y - startY.current;
                    activeShape.current.set({ width: Math.abs(width), height: Math.abs(height) });
                    if (width < 0) activeShape.current.set({ left: pointer.x });
                    if (height < 0) activeShape.current.set({ top: pointer.y });
                    updateDimensionText(`${(Math.abs(width) / pxPerMm.x).toFixed(3)} x ${(Math.abs(height) / pxPerMm.y).toFixed(3)} mm`, pointer.x, pointer.y, startX.current, startY.current);
                } else if (activeTool === 'circle') {
                    const width = pointer.x - startX.current;
                    const height = pointer.y - startY.current;
                    const diameter = Math.min(Math.abs(width), Math.abs(height));
                    const radius = diameter / 2;
                    
                    (activeShape.current as fabric.Circle).set({ radius });
                    
                    // Adjust position based on drag direction to keep circle inside bounding box
                    const left = width > 0 ? startX.current : startX.current - diameter;
                    const top = height > 0 ? startY.current : startY.current - diameter;
                    activeShape.current.set({ left, top });

                    const avgPxPerMm = (pxPerMm.x + pxPerMm.y) / 2;
                    updateDimensionText(`D: ${(diameter / avgPxPerMm).toFixed(3)} mm`, pointer.x, pointer.y, startX.current, startY.current);
                } else if (activeTool === 'line') {
                    (activeShape.current as fabric.Line).set({ x2: pointer.x, y2: pointer.y });
                    const len = Math.sqrt(Math.pow(pointer.x - startX.current, 2) + Math.pow(pointer.y - startY.current, 2));
                    const avgPxPerMm = (pxPerMm.x + pxPerMm.y) / 2;
                    updateDimensionText(`L: ${(len / avgPxPerMm).toFixed(3)} mm`, pointer.x, pointer.y, startX.current, startY.current);
                } else if (activeTool === 'triangle') {
                    const width = pointer.x - startX.current;
                    const height = pointer.y - startY.current;
                    activeShape.current.set({ width: Math.abs(width), height: Math.abs(height) });
                    if (width < 0) activeShape.current.set({ left: pointer.x });
                    if (height < 0) activeShape.current.set({ top: pointer.y });
                    updateDimensionText(`${(Math.abs(width) / pxPerMm.x).toFixed(3)} x ${(Math.abs(height) / pxPerMm.y).toFixed(3)} mm`, pointer.x, pointer.y, startX.current, startY.current);
                } else if (activeTool === 'arc') {
                    if (arcDrawingStep.current === 1) {
                        // Radius Step: Update Temp Line & Invisible Circle Radius
                        const dx = pointer.x - arcCenter.current!.x;
                        const dy = pointer.y - arcCenter.current!.y;
                        const radius = Math.sqrt(dx * dx + dy * dy);

                        (activeShape.current as fabric.Circle).set({ radius });
                        if (arcTempLine.current) {
                            arcTempLine.current.set({ x2: pointer.x, y2: pointer.y });
                        }
                        arcRadius.current = radius;
                        const avgPxPerMm = (pxPerMm.x + pxPerMm.y) / 2;
                        updateDimensionText(`R: ${(radius / avgPxPerMm).toFixed(3)} mm`, pointer.x, pointer.y, arcCenter.current!.x, arcCenter.current!.y);

                    } else if (arcDrawingStep.current === 2) {
                        // Start Angle Step: Update Temp Line Angle
                        // Guide Circle is already visible and fixed radius
                        if (arcTempLine.current) {
                            arcTempLine.current.set({ x2: pointer.x, y2: pointer.y });
                        }

                        const dx = pointer.x - arcCenter.current!.x;
                        const dy = pointer.y - arcCenter.current!.y;
                        let angle = Math.atan2(dy, dx);
                        let angleDeg = angle * 180 / Math.PI;
                        if (angleDeg < 0) angleDeg += 360;
                        arcStartAngle.current = angle;
                        updateDimensionText(`Start Angle: ${angleDeg.toFixed(2)}`, pointer.x, pointer.y, arcCenter.current!.x, arcCenter.current!.y);

                    } else if (arcDrawingStep.current === 3) {
                        // End Angle Step: Draw Arc from Start to Current
                        if (arcTempLine.current) {
                            arcTempLine.current.set({ x2: pointer.x, y2: pointer.y });
                        }

                        const dx = pointer.x - arcCenter.current!.x;
                        const dy = pointer.y - arcCenter.current!.y;
                        let angle = Math.atan2(dy, dx);

                        let startDeg = arcStartAngle.current * 180 / Math.PI;
                        let endDeg = angle * 180 / Math.PI;

                        // Normalize
                        if (startDeg < 0) startDeg += 360;
                        if (endDeg < 0) endDeg += 360;

                        // Calculate Sweep
                        let sweepAngle = endDeg - startDeg;
                        if (sweepAngle < 0) sweepAngle += 360;

                        // Fabric Order (CW) logic:
                        let displayEndDeg = endDeg;
                        if (endDeg < startDeg) {
                            displayEndDeg += 360;
                        }

                        (activeShape.current as fabric.Circle).set({
                            startAngle: startDeg,
                            endAngle: displayEndDeg
                        });

                        // Display Sweep Angle
                        updateDimensionText(`End Angle: ${sweepAngle.toFixed(2)}`, pointer.x, pointer.y, arcCenter.current!.x, arcCenter.current!.y);
                    }
                }

                // Trigger 'scaling' event to update PropertyBar in real-time
                activeShape.current.fire('scaling');

                canvas.requestRenderAll();
                canvas.requestRenderAll();
            }

            // ... (existing polyline shape move logic)
            if (activeTool === 'polyline-shape' && polylineShapeTempLine.current) {
                // [NEW] Smart Snapping Logic
                let targetX = pointer.x;
                let targetY = pointer.y;
                let isSnapped = false;

                const firstPoint = polylineShapePoints.current[0];
                if (firstPoint && polylineShapePoints.current.length > 2) {
                    const zoom = canvas.getZoom();
                    const distToStart = Math.sqrt(Math.pow(pointer.x - firstPoint.x, 2) + Math.pow(pointer.y - firstPoint.y, 2));
                    const snapThreshold = 20 / zoom;

                    if (distToStart < snapThreshold) {
                        targetX = firstPoint.x;
                        targetY = firstPoint.y;
                        isSnapped = true;
                        canvas.defaultCursor = 'copy'; // Indicate 'link' or 'close' action
                        canvas.hoverCursor = 'copy';
                        polylineShapeTempLine.current.set({ stroke: '#00ff00' }); // Green to indicate closing
                    } else {
                        canvas.defaultCursor = 'crosshair';
                        canvas.hoverCursor = 'crosshair';
                        polylineShapeTempLine.current.set({ stroke: '#00BEFF' }); // Reset color
                    }
                }

                polylineShapeTempLine.current.set({ x2: targetX, y2: targetY });

                // Update dimension text for polyline segment
                const lastPoint = polylineShapePoints.current[polylineShapePoints.current.length - 1];
                if (lastPoint) {
                    const zoom = canvas.getZoom();
                    const textOffset = 15 / zoom;
                    // Use targetX/Y for distance calculation to reflect snap
                    const dist = Math.sqrt(Math.pow(targetX - lastPoint.x, 2) + Math.pow(targetY - lastPoint.y, 2));
                    const avgPxPerMm = (pxPerMm.x + pxPerMm.y) / 2;
                    updateDimensionText(`${(dist / avgPxPerMm).toFixed(3)} mm`, targetX, targetY, lastPoint.x, lastPoint.y);
                }

                canvas.requestRenderAll();
            }

            if (activeTool === 'measure') {
                const zoom = canvas.getZoom();
                const fontSize = 14 / zoom;
                const offset = 70 / zoom; // Large offset to clear corner
                const bgColor = 'rgba(255,255,255,0.4)';

                if ((measureMode === 'distance' || measureMode === 'width' || measureMode === 'height') && isMeasuring.current && measureLine.current && measureText.current) {
                    let targetX = pointer.x;
                    let targetY = pointer.y;
                    if (measureMode === 'width') {
                        targetY = measureStart.current!.y;
                    } else if (measureMode === 'height') {
                        targetX = measureStart.current!.x;
                    }

                    measureLine.current.set({ x2: targetX, y2: targetY });

                    const dx = targetX - measureStart.current!.x;
                    const dy = targetY - measureStart.current!.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const avgPxPerMm = (pxPerMm.x + pxPerMm.y) / 2;
                    const distMm = (dist / avgPxPerMm).toFixed(3);

                    // Smart Repositioning
                    let left = targetX + (20 / zoom);
                    let top = targetY - offset;
                    if (targetX < measureStart.current!.x) left = targetX - offset - (fontSize * distMm.length * 0.6);
                    if (targetY < measureStart.current!.y) top = targetY + (20 / zoom);

                    measureText.current.set({ text: `${distMm} mm`, left, top, backgroundColor: bgColor });
                    canvas.requestRenderAll();
                } else if (measureMode === 'rect' && isMeasuring.current && activeShape.current && measureText.current) {
                    const width = pointer.x - measureStart.current!.x;
                    const height = pointer.y - measureStart.current!.y;

                    activeShape.current.set({ width: Math.abs(width), height: Math.abs(height) });
                    if (width < 0) activeShape.current.set({ left: pointer.x });
                    if (height < 0) activeShape.current.set({ top: pointer.y });

                    const widthMm = (Math.abs(width) / pxPerMm.x).toFixed(3);
                    const heightMm = (Math.abs(height) / pxPerMm.y).toFixed(3);
                    const labelText = `W: ${widthMm} mm\nH: ${heightMm} mm`;

                    // Smart Repositioning
                    let left = pointer.x + (20 / zoom);
                    let top = pointer.y - offset;
                    if (width < 0) left = pointer.x - offset - (fontSize * widthMm.length * 0.6);
                    if (height < 0) top = pointer.y + (20 / zoom);

                    measureText.current.set({ text: labelText, left, top, backgroundColor: bgColor });
                    canvas.requestRenderAll();
                } else if (measureMode === 'circle' && isMeasuring.current && activeShape.current && measureText.current) {
                    const radius = Math.sqrt(Math.pow(pointer.x - measureStart.current!.x, 2) + Math.pow(pointer.y - measureStart.current!.y, 2));
                    (activeShape.current as fabric.Circle).set({ radius });

                    const avgPxPerMm = (pxPerMm.x + pxPerMm.y) / 2;
                    const radiusMm = (radius / avgPxPerMm).toFixed(3);
                    const labelText = `R: ${radiusMm} mm`;

                    // Smart Repositioning
                    let left = pointer.x + (20 / zoom);
                    let top = pointer.y - offset;
                    if (pointer.x < measureStart.current!.x) left = pointer.x - offset - (fontSize * labelText.length * 0.6);
                    if (pointer.y < measureStart.current!.y) top = pointer.y + (20 / zoom);

                    measureText.current.set({ text: labelText, left, top, backgroundColor: bgColor });
                    canvas.requestRenderAll();
                } else if (measureMode === 'polyline' && polylineTempLine.current) {
                    polylineTempLine.current.set({ x2: pointer.x, y2: pointer.y });
                    canvas.requestRenderAll();
                } else if (measureMode === 'angle' && isMeasuring.current) {
                    if (anglePoints.current.length === 1) {
                        const line = angleLines.current[0];
                        if (line) line.set({ x2: pointer.x, y2: pointer.y });
                    } else if (anglePoints.current.length === 2) {
                        const line = angleLines.current[1];
                        if (line) line.set({ x2: pointer.x, y2: pointer.y });

                        // Angle calculation
                        const p1 = anglePoints.current[1];
                        const p2 = anglePoints.current[0]; // Vertex
                        const p3 = pointer;
                        const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
                        const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
                        const dot = v1.x * v2.x + v1.y * v2.y;
                        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
                        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
                        let angleDeg = Math.acos(dot / (mag1 * mag2)) * (180 / Math.PI);
                        if (isNaN(angleDeg)) angleDeg = 0;

                        const labelText = `Angle: ${angleDeg.toFixed(2)}°`;
                        let left = pointer.x + (20 / zoom);
                        let top = pointer.y - offset;
                        if (pointer.x < p2.x) left = pointer.x - offset - (fontSize * labelText.length * 0.6);
                        if (pointer.y < p2.y) top = pointer.y + (20 / zoom);

                        measureText.current?.set({ text: labelText, left, top, backgroundColor: bgColor });

                        // [UX] Add visual Arc guide for angle
                        const arcRad = 30 / zoom;
                        const sA = Math.atan2(p1.y - p2.y, p1.x - p2.x);
                        const eA = Math.atan2(p3.y - p2.y, p3.x - p2.x);
                        let sweep = eA - sA;
                        while(sweep <= -Math.PI) sweep += 2 * Math.PI;
                        while(sweep > Math.PI) sweep -= 2 * Math.PI;
                        const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
                        const arcPath = `M ${p2.x} ${p2.y} L ${p2.x + arcRad * Math.cos(sA)} ${p2.y + arcRad * Math.sin(sA)} A ${arcRad} ${arcRad} 0 ${largeArc} 1 ${p2.x + arcRad * Math.cos(eA)} ${p2.y + arcRad * Math.sin(eA)} Z`;

                        if (angleArc.current) {
                            canvas.remove(angleArc.current);
                            angleArc.current = new fabric.Path(arcPath, {
                                fill: 'rgba(255, 0, 255, 0.2)',
                                stroke: '#ff00ff',
                                strokeWidth: 1 / zoom,
                                selectable: false,
                                evented: false
                            });
                            (angleArc.current as any).isMeasurement = true;
                            canvas.add(angleArc.current);
                        }
                    }
                    canvas.requestRenderAll();
                }
            }
        }, 16);


        const handleDoubleClick = (opt: any) => {
            const { activeTool, measureMode, isNavigateMode } = useCanvasStore.getState();

            if (activeTool === 'polyline-shape') {
                handleCompletePolylineShape();
            } else if (activeTool === 'measure' && measureMode === 'polyline') {
                handleCompletePolyline();
            }

            // [NEW] Navigate Mode: double-click camera view -> move stage so that point is centered
            if (isNavigateMode && activeTool === 'select' && canvas) {
                const evt = opt.e as MouseEvent;
                if (evt.button !== 0) return; // Left click only

                const isHoming = useAppStore.getState().homingState.active;
                const isProcessingLocal = useCanvasStore.getState().isProcessingLocal;
                if (isHoming || isProcessingLocal) return;

                // [FIX] 이동 완료(도착) 전 재더블클릭으로 moveAbs가 중첩되는 것을 차단
                if (isNavigateMovingRef.current) return;

                // [FIX] getScenePoint() inverts the CURRENT viewportTransform (zoom + pan),
                // so it always returns the clicked point's absolute mm-scaled scene coordinate
                // regardless of current zoom level or panning.
                const point = canvas.getScenePoint(evt);

                // [FIX] 카메라 영상 투영(CanvasBackground.tsx)의 정확한 역함수 사용.
                // 영상은 sceneCoords.ts의 절대 투영식 scene = stage * ppm 으로 배치되므로,
                // 역산은 반드시 scenePxToStageMm(= scene/ppm)을 사용해야 한다.
                // (투영과 역산이 같은 모듈의 수식 쌍이므로 렌즈 오프셋 이중 가산/누락이 구조적으로 불가능)
                const calibrationScales_dbl = useCanvasStore.getState().calibrationScales;
                const scannerScaleRaw = calibrationScales_dbl['scanner'] || { x: 1000, y: 1000 };
                const ppm = typeof scannerScaleRaw === 'number'
                    ? { x: scannerScaleRaw, y: scannerScaleRaw }
                    : scannerScaleRaw;

                const { x: targetX, y: targetY } = scenePxToStageMm(point.x, point.y, ppm);

                // [DEBUG] 잔여 오차 진단용: 크로스헤어 정중앙 더블클릭 시 target ≈ 현재 position이어야 함
                console.log('[NavigateMode] dblclick', {
                    scene: { x: point.x, y: point.y },
                    target: { X: targetX, Y: targetY },
                    current: useAppStore.getState().positions,
                    zoom: canvas.getZoom(),
                    roi: useCanvasStore.getState().calibrationROI,
                });

                isNavigateMovingRef.current = true;
                hwFacade.moveAbs('X', targetX);
                hwFacade.moveAbs('Y', targetY);

                // 도착(±허용오차) 또는 타임아웃 시 가드 해제 — positions는 100ms 주기로 갱신됨
                const TOLERANCE_MM = 0.01;
                const TIMEOUT_MS = 10000;
                const finish = () => {
                    isNavigateMovingRef.current = false;
                    navigateMoveCleanupRef.current = null;
                    unsubscribe();
                    clearTimeout(timeoutId);
                };
                const unsubscribe = useAppStore.subscribe((s) => {
                    const p = s.positions;
                    if (Math.abs(p.X - targetX) <= TOLERANCE_MM && Math.abs(p.Y - targetY) <= TOLERANCE_MM) {
                        finish();
                    }
                });
                const timeoutId = setTimeout(finish, TIMEOUT_MS);
                navigateMoveCleanupRef.current = finish;
            }
        };

        const handleMouseUp = (opt: any) => {
            const evt = opt.e as MouseEvent;
            const { activeTool } = useCanvasStore.getState();
            // console.log('[useCanvasEvents] mouse:up', { activeTool, isDrawing: isDrawing.current });

            // [FIX] Navigate Mode 중에는 커서/selection 원복이 이동 모드 상태를 덮어쓰지 않도록 가드
            const isNavigating = useCanvasStore.getState().isNavigateMode;

            if (isMiddleClickPanning.current) {
                isMiddleClickPanning.current = false;
                isDragging.current = false;
                canvas.defaultCursor = isNavigating ? NAVIGATE_CURSOR : 'default';
                canvas.selection = !isNavigating;
                useCanvasStore.getState().setActiveTool('select');
                return;
            }

            if (isDragging.current) {
                isDragging.current = false;
                canvas.defaultCursor = isNavigating ? NAVIGATE_CURSOR : 'default';
                if (activeTool === 'pan') {
                    canvas.defaultCursor = 'grab';
                } else {
                    canvas.selection = !isNavigating;
                }
            }

            clearSmartGuides();

            if (isDrawing.current) {
                if (activeTool === 'arc') {
                    // For Arc, MouseUp shouldn't stop drawing until Step 3 is done AND clicked.
                    // Logic:
                    // Step 0 Down -> Step 1 (Radius Drag). Up -> Nothing (Wait for Click 2)
                    // Wait, our logic in MouseDown advances the step.
                    // So MouseUp handles the 'End of Click'.

                    if (arcDrawingStep.current === 0) {
                        // Just finished clicking center. Now in Step 1 (Radius).
                        // Do nothing, let user move mouse.
                    } else if (arcDrawingStep.current === 2) {
                        // Finished clicking Radius. Now in Step 2 (Start Angle).
                    } else if (arcDrawingStep.current === 3) {
                        // Finished clicking Start Angle. Now in Step 3 (End Angle).
                    } else if (arcDrawingStep.current === 3 && activeShape.current) {
                        // NOTE: We rely on MouseDown to advance step.
                        // But if we are in Step 3, MouseDown hasn't happened yet for the FINAL confirm?
                        // Ah, MouseDown advances 2->3. So we are in 3.
                        // The NEXT MouseDown will finish it?
                        // We need a specific check.
                    }

                    // Actually, simpler logic: 
                    // We only finalize if we are 'done'.
                    // We need to check if we just performed the last click.
                    // But MouseDown updates step.
                    // Step 3 is "Waiting for End Angle confirmation".
                    // MouseDown on Step 3 logic:
                    // Log "Arc Step 3->Finish"
                    // But we didn't reset isDrawing there.
                    // We should reset here if we are effectively done.

                    // Refined Logic:
                    // MouseDown(Step 0) -> Sets Center, Step=1.
                    // MouseUp -> Still Step 1. User moves (Radius).
                    // MouseDown(Step 1) -> Sets Radius, Step=2.
                    // MouseUp -> Still Step 2. User moves (Start Angle).
                    // MouseDown(Step 2) -> Sets Start Angle, Step=3.
                    // MouseUp -> Still Step 3. User moves (End Angle).
                    // MouseDown(Step 3) -> Sets End Angle... wait, MouseDown(Step 3) logic was empty comment.

                    // We need to implement MouseDown(Step 3) to finalize.
                    // Let's re-visit MouseDown for Step 3.
                } else {
                    isDrawing.current = false;
                    if (activeShape.current) {
                        console.log('[useCanvasEvents] Finalizing Shape', activeShape.current);

                        // [FIX] Enforce Minimum Size (0.001 mm) to prevent 0-size invisible objects
                        // This handles cases where user just clicks without dragging
                        const avgPxPerMm = (pxPerMm.x + pxPerMm.y) / 2;
                        const minSize = 0.001 * avgPxPerMm;

                        if (activeShape.current instanceof fabric.Rect || activeShape.current instanceof fabric.Triangle) {
                            if (activeShape.current.width! < minSize) activeShape.current.set({ width: minSize });
                            if (activeShape.current.height! < minSize) activeShape.current.set({ height: minSize });
                        } else if (activeShape.current instanceof fabric.Circle) {
                            if (activeShape.current.radius! < minSize / 2) activeShape.current.set({ radius: minSize / 2 });
                        } else if (activeShape.current instanceof fabric.Line) {
                            // Line width/height are bounding box. Check actual length (diagonal)
                            const dx = Math.abs(activeShape.current.width!);
                            const dy = Math.abs(activeShape.current.height!);
                            if (dx < minSize && dy < minSize) {
                                // Extend slightly in X direction if point
                                // Need to update point coordinates
                                // Line doesn't have simple width setter for points, need to set x2/y2
                                // But Fabric Line uses x1,y1,x2,y2 props.
                                // Actually 'width'/'height' are derived.
                                // Safest is to check x1/y1 vs x2/y2
                                const l = activeShape.current as fabric.Line;
                                // @ts-ignore
                                if (Math.abs(l.x2 - l.x1) < minSize && Math.abs(l.y2 - l.y1) < minSize) {
                                    l.set({ x2: (l.x1 || 0) + minSize });
                                    // Force recalc
                                }
                            }
                        }

                        // [FIX] Normalize origin to Center to prevent shift when changing strokeWidth
                        // Fabric.js grows stroke outwards relative to origin. 
                        // If Top-Left, center moves. If Center, center stays fixed.
                        const center = activeShape.current.getCenterPoint();
                        activeShape.current.set({
                            originX: 'center',
                            originY: 'center',
                            left: center.x,
                            top: center.y,
                            selectable: true,
                            evented: true
                        });

                        activeShape.current.setCoords();

                        // [FIX] Explicitly Set Active Object & Trigger Update
                        // This ensures PropertyBar treats it as a fresh selection with updated W/H
                        const shape = activeShape.current;
                        canvas.setActiveObject(shape);
                        (shape as any).fire('modified'); // Trigger any listeners

                        // Force Store Update (Create new reference if needed, or just set)
                        useCanvasStore.getState().setSelectedObject(shape);

                        activeShape.current = null;
                        saveHistory();
                    }
                    removeDimensionText();
                    if (activeTool !== 'polyline-shape') {
                        useCanvasStore.getState().setActiveTool('select');
                    }
                }
            }

            // Reinforce cursor state for select mode
            // [FIX] Navigate Mode 가드: 모든 mouse:up(더블클릭, 컨텍스트 메뉴 닫는 클릭 포함)마다
            // 이 블록이 커서/selection을 되돌려 크로스헤어 커서가 사라지고 마퀴 선택이 부활하던 원인.
            if (activeTool === 'select' && !isMiddleClickPanning.current && !isDragging.current && !isNavigating) {
                canvas.defaultCursor = 'default';
                canvas.selection = true;
            }
        };

        const handleMouseWheel = (opt: any) => {
            const { activeTool, viewMode } = useCanvasStore.getState();

            const evt = opt.e as WheelEvent;

            evt.preventDefault();
            evt.stopPropagation();

            let zoom = canvas.getZoom();
            const delta = evt.deltaY;

            if (delta > 0) {
                zoom /= 1.25;
            } else {
                zoom *= 1.25;
            }

            // Clamp zoom
            /**
             * @brief 뷰 모드에 따라 줌 최대/최소 임계값을 동적으로 결정합니다.
             * @details 
             *  - object 모드: 0.01% (0.0001) ~ 2000% (20.0)
             *  - scanner 모드: 0.1% (0.001) ~ 1000% (10.0)
             *  - canvas 모드: 0.1% (0.001) ~ 2000% (20.0)
             */
            let minZoom = 0.001;
            let maxZoom = 20.0;
            if (viewMode === 'object') {
                minZoom = 0.0001;
                maxZoom = 20.0;
            } else if (viewMode === 'scanner') {
                minZoom = 0.001;
                maxZoom = 10.0;
            }

            if (zoom > maxZoom) zoom = maxZoom;
            if (zoom < minZoom) zoom = minZoom;

            canvas.zoomToPoint(new fabric.Point(evt.offsetX, evt.offsetY), zoom);

            setZoom(zoom);
            // [FIX] 수동 줌 시 자동 카메라 추적을 끄고 커스텀 뷰 상태로 전환
            useCanvasStore.getState().setIsFitCamera(false);
            updateRuler();

            /**
             * @brief 줌 배율 변경에 따른 하이라인 가공선 두께 실시간 스케일 보정을 수행합니다.
             * @details 줌 변경에 따라 Fabric Object의 strokeWidth를 동적으로 업데이트하여 화면상 2px로 유지되게 합니다.
             */
            const updateHairline = (obj: any) => {
                if (obj.isHairline && !obj.isGridLine) {
                    obj.set('strokeWidth', 2 / zoom);
                    obj.setCoords();
                }
                if (obj.type === 'group' || obj.getObjects) {
                    obj.getObjects().forEach(updateHairline);
                }
            };
            canvas.getObjects().forEach(updateHairline);

            const paper = canvas.getObjects().find(obj => (obj as any).isPaper);
            if (paper) {
                drawGrid(canvas, useCanvasStore.getState().showGrid, paper);
            }

            // [FIX] 수동 줌 시 viewport:transformed 이벤트를 강제 발생시켜 handleZoomCompensate 가 실행되도록 유도 (Dot 크기 유지)
            canvas.fire('viewport:transformed' as any);
        };

        const handleZoomCompensate = () => {
            const zoom = canvas.getZoom();

            const compensateObject = (obj: fabric.Object, parentScaleX: number = 1, parentScaleY: number = 1) => {
                if ((obj as any).customData?.isConstantSize) {
                    obj.set({ 
                        scaleX: 1 / (zoom * parentScaleX), 
                        scaleY: 1 / (zoom * parentScaleY) 
                    });
                    obj.setCoords();
                }

                // Recursively scale children of regular fabric Groups (excluding MatrixRepeater)
                if (obj.type !== 'MatrixRepeater' && (obj as any).getObjects && typeof (obj as any).getObjects === 'function') {
                    const currentScaleX = parentScaleX * (obj.scaleX || 1);
                    const currentScaleY = parentScaleY * (obj.scaleY || 1);
                    (obj as any).getObjects().forEach((child: fabric.Object) => {
                        compensateObject(child, currentScaleX, currentScaleY);
                    });
                }
            };

            canvas.getObjects().forEach((obj: any) => {
                compensateObject(obj);
            });
            canvas.requestRenderAll();
        };

        const handleObjectAdded = (e: any) => {
            if (!isScriptedAdding.current && !(e.target as any).isTemp && !(e.target as any).isGridLine && !(e.target as any).isPaper) {
                saveHistory();
            }
        };

        const handleObjectRemoved = (e: any) => {
            const target = e.target as any;
            if (!isScriptedAdding.current && !target.isTemp && !target.isGridLine && !target.isPaper) {
                // [NEW] Auto-delete associated matrix label
                if (target.customData?.matrixId && target.customData?.isMatrixChild) {
                    const label = canvas.getObjects().find(o => 
                        (o as any).customData?.matrixId === target.customData.matrixId && 
                        (o as any).customData?.isMatrixLabel
                    );
                    if (label) {
                        canvas.remove(label);
                    }
                }
                saveHistory();
            }
        };

        const handleSelectionCreated = (e: any) => {
            const active = canvas.getActiveObject();
            if (active) {
                // [FIX] Locked Multi-Selection Logic (Canvas Drag)
                if (active.type.toLowerCase() === 'activeselection') {
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
                } else {
                    // Single object: ensure controls visible if not locked (Fabric usually handles this, but good to ensure)
                    const isLocked = active.lockMovementX || active.lockMovementY || active.lockScalingX || active.lockScalingY || active.lockRotation;
                    active.set('hasControls', !isLocked);
                }

                setSelectedObject(active);
                // Auto-switch to 'Edit' tab if in 'G-Code' tab
                if (useCanvasStore.getState().activeRightTab === 'gcode') {

                }
            } else {
                setSelectedObject(null);
            }
        };

        const handleSelectionUpdated = (e: any) => {
            const active = canvas.getActiveObject();
            if (active) {
                // [FIX] Locked Multi-Selection Logic (Canvas Drag)
                if (active.type.toLowerCase() === 'activeselection') {
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
                } else {
                    const isLocked = active.lockMovementX || active.lockMovementY || active.lockScalingX || active.lockScalingY || active.lockRotation;
                    active.set('hasControls', !isLocked);
                }

                setSelectedObject(active);
                // Auto-switch to 'Edit' tab if in 'G-Code' tab
                if (useCanvasStore.getState().activeRightTab === 'gcode') {

                }
            } else {
                setSelectedObject(null);
            }
        };

        const handleSelectionCleared = () => {
            setSelectedObject(null);
        };

        const handleMouseOver = (e: any) => {
            const { activeTool } = useCanvasStore.getState();
            if (activeTool === 'select' && e.target && e.target.selectable) {
                e.target.set('opacity', 0.5);
            }
            if (e.target) {
                canvas.requestRenderAll();
            }
        };

        const handleMouseOut = (e: any) => {
            const { activeTool } = useCanvasStore.getState();
            if (activeTool === 'select' && e.target && e.target.selectable) {
                e.target.set('opacity', 1);
            }
            if (e.target) {
                canvas.requestRenderAll();
            }
        };

        canvas.on('mouse:down', handleMouseDown);
        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:up', handleMouseUp);
        canvas.on('mouse:wheel', handleMouseWheel);
        canvas.on('viewport:transformed', handleZoomCompensate);
        canvas.on('mouse:over', handleMouseOver);
        canvas.on('mouse:out', handleMouseOut);
        canvas.on('mouse:dblclick', handleDoubleClick);
        const handleObjectModified = (e: any) => {
            // [FIX] Ensure final sync on drop
            if (e.target) {
                if (e.target.type === 'activeSelection') {
                    (e.target as fabric.ActiveSelection).getObjects().forEach(syncLabel);
                } else {
                    syncLabel(e.target);
                }
            }
            saveHistory();
        };
        canvas.on('object:modified', handleObjectModified);
        canvas.on('object:added', handleObjectAdded);
        canvas.on('object:removed', handleObjectRemoved);
        canvas.on('object:moving', handleObjectMoving);
        canvas.on('selection:created', handleSelectionCreated);
        canvas.on('selection:updated', handleSelectionUpdated);
        canvas.on('selection:cleared', handleSelectionCleared);

        // [FIX] Global MouseUp to catch releases outside canvas (e.g. over PropertyBar)
        // This prevents "stuck" isDrawing/isDragging states
        const handleGlobalMouseUp = (e: MouseEvent) => {
            // Only trigger if we think we are doing something
            if (isDrawing.current || isDragging.current || isMiddleClickPanning.current) {
                handleMouseUp({ e });
            }
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);

        return () => {
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:up', handleMouseUp);
            canvas.off('mouse:wheel', handleMouseWheel);
            canvas.off('viewport:transformed', handleZoomCompensate);
            canvas.off('mouse:over', handleMouseOver);
            canvas.off('mouse:out', handleMouseOut);
            canvas.off('mouse:dblclick', handleDoubleClick);
            canvas.off('object:modified', saveHistory);
            canvas.off('object:moving', handleObjectMoving);
            canvas.off('object:added', handleObjectAdded);
            canvas.off('object:removed', handleObjectRemoved);
            canvas.off('selection:created', handleSelectionCreated);
            canvas.off('selection:updated', handleSelectionUpdated);
            canvas.off('selection:cleared', handleSelectionCleared);

            window.removeEventListener('mouseup', handleGlobalMouseUp);

            // [NEW] Navigate Mode 이동 가드가 걸린 채 언마운트되면 구독/타이머 정리
            if (navigateMoveCleanupRef.current) navigateMoveCleanupRef.current();
        };
    }, [canvas, saveHistory, drawGrid, updateRuler, setContextMenu, updateDimensionText, removeDimensionText, setSelectedObject, setZoom, pxPerMm]);

    return {
        resetInteraction,
        resetTempState,
        handleCompletePolyline,
        handleCompletePolylineShape,
        isSpacePressed
    };
};
