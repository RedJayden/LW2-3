import { useCallback } from 'react';
import * as fabric from 'fabric';
import paper from 'paper';
import { FabricToPaperAdapter } from '../utils/FabricToPaperAdapter';
import { BiarcDecomposition } from '../utils/BiarcDecomposition';
import { ImageProcessor } from '../utils/ImageProcessor';
import { IGCodeSettings, IFillSettings, IColorPreset } from '../types/cad';
import { useCanvasStore } from '../ui/pages/Recipe/Canvas/useCanvasStore';
import { resolveObjectColorHex } from '../utils/colorUtils';

export interface IGCodeOptions {
    /** 픽셀 대비 mm 스케일 (px per mm) */
    pxPerMm?: { x: number; y: number };
    /** G-Code 원점 (Fabric 캔버스 좌표계 기준, px 단위) */
    origin?: { x: number; y: number };
    /** 추가적인 물리적 오프셋 (mm 단위) */
    offsetMm?: { x: number; y: number };
    /** Y 축 반전 여부 (CNC Y+ 위쪽, Fabric Y+ 아래쪽) */
    invertY?: boolean;
    /** [NEW] 가공 완료 후 복귀할 좌표 */
    returnToPos?: { x: number; y: number };
    /**
     * 색상(hex)별 가공 프리셋. 주어지면 도형을 색상별로 그룹화해 그룹마다
     * preset.markTimes만큼 반복하고 preset.zOffset(절대 Z)을 workingZ로 적용한다
     * (ScannerGenerator.ts의 groupByColorPreset과 동일한 정책).
     */
    colorPresets?: Record<string, IColorPreset>;
}

/**
 * @hook useGCodeGenerator
 * @brief Fabric canvas 로부터 산업용 표준 G-Code를 생성하는 커스텀 훅.
 *
 * Hybrid Approach:
 * - Primitives (Rect, Line, Polyline, Polygon, Triangle, Uniform Circle): Use direct Fabric.js geometry.
 * - Complex (Ellipse, Non-uniform Circle, Path): Use Paper.js + Biarc approximation.
 * - [v6.5.7] Added recursive Layer (Group) flattening.
 */
export const useGCodeGenerator = (canvas: fabric.Canvas | undefined) => {

    /**
     * Recursive helper to extract all leaf objects from layers/groups.
     * Keeps the original code structure but allows deep navigation.
     */
    /** [FIX] matches ScannerGenerator.ts approach */
    const isType = (obj: any, type: string) => {
        if (!obj) return false;
        return obj.isType?.(type) || obj.type === type;
    };

    /**
     * Recursive helper to extract all leaf objects from layers/groups.
     * Keeps the original code structure but allows deep navigation.
     */
    const getAllObjects = (objs: fabric.Object[]): fabric.Object[] => {
        let result: fabric.Object[] = [];
        for (const obj of objs) {
            // [FIX] v7.4: Filter by userVisible intent, not system-level visible state.
            // Systems lockdown hides objects (visible=false), but they should still be processed
            // UNLESS the user explicitly hid them in the Layer List (userVisible=false).
            if (!obj || (obj as any).userVisible === false) continue;
            
            // [FIX] Exclude measurement groups and other overlays entirely so their children don't leak
            if ((obj as any).isMeasurement || (obj as any).isGuide || (obj as any).isTemp || (obj as any).isCrosshair || (obj as any).excludeFromExport) {
                continue;
            }

            // Check if it's a group or layer (any object with getObjects), but EXCLUDE standard Groups
            const hasChildren = (obj as any).getObjects && typeof (obj as any).getObjects === 'function';
            const isGroupType = obj.type === 'group' || obj.type === 'Group' || obj instanceof fabric.Group;
            
            if (hasChildren && !isGroupType && !isType(obj, 'path') && !isType(obj, 'compoundPath')) {
                // Flatten child objects (except for standard groups and path/compoundPath types)
                result = result.concat(getAllObjects((obj as any).getObjects()));
            } else {
                result.push(obj);
            }
        }
        return result;
    };

    const generateGCode = useCallback(
        async (settings: IGCodeSettings, options?: IGCodeOptions): Promise<string> => {
            if (!canvas) {
                console.warn('useGCodeGenerator: Canvas is undefined');
                return '';
            }

            // ------------------------------------------------------
            // 1. Configuration & Setup
            // ------------------------------------------------------
            const pxPerMm = options?.pxPerMm ?? { x: 1000, y: 1000 }; // [FIX] Default to standard 1000 px/mm
            const origin = options?.origin ?? {
                x: canvas.getWidth() / 2,
                y: canvas.getHeight() / 2
            };
            const offsetMm = options?.offsetMm ?? { x: 0, y: 0 };
            const invertY = options?.invertY ?? true;

            // 좌표 정밀도 확보를 위한 내부 스케일 (Paper.js 처리용)
            const PRECISION_SCALE = 10000;

            // number 포맷 (1µm = 0.001mm, 소수 5자리면 충분)
            const fmt = (n: number) => n.toFixed(5);
            const feedStr = settings.feedRate.toFixed(3);

            const gcode: string[] = [];
            let _pendingShapeDelay = false;
            let _lastZOffset: number | undefined = undefined;

            // ------------------------------------------------------
            // 공통 유틸
            // ------------------------------------------------------

            const addComment = (text: string) => {
                if (settings.includeComments) {
                    gcode.push(text);
                }
            };


            // Fabric Point (px) -> G-Code (mm)
            const toMm = (x: number, y: number) => {
                const dx = x - origin.x;
                const dy = y - origin.y;
                const mmX = dx / pxPerMm.x;
                let mmY = dy / pxPerMm.y;
                if (invertY) mmY = -mmY;
                return { x: mmX + offsetMm.x, y: mmY + offsetMm.y };
            };

            // Paper Point (scaled px) -> G-Code (mm)
            const paperToMm = (p: { x: number; y: number }, scale: number) => {
                const xPx = p.x / scale;
                const yPx = p.y / scale;
                return toMm(xPx, yPx);
            };

            const moveTo = (x: number, y: number) => {
                const p = toMm(x, y);
                addComment('// Move to Start');
                gcode.push(`G00 X${fmt(p.x)} Y${fmt(p.y)}`);

                if (_pendingShapeDelay) {
                    addComment(`// Shape Delay ${settings.shapeDelay}s`);
                    gcode.push(`G04 P${fmt(settings.shapeDelay)}`);
                    _pendingShapeDelay = false;
                }
            };

            const lineTo = (x: number, y: number) => {
                const p = toMm(x, y);
                gcode.push(`G01 X${fmt(p.x)} Y${fmt(p.y)} F${feedStr}`);
            };

            const laserOn = () => {
                addComment('// LASER ON');
                const targetZ = _lastZOffset !== undefined ? _lastZOffset : settings.workingZ;
                gcode.push(`G01 Z${fmt(targetZ)} F${feedStr}`);
                gcode.push('M10');
            };

            const laserOff = (isLast: boolean = false) => {
                addComment('// LASER OFF');
                gcode.push('M11');
                if (settings.includeSafeZ && !isLast) {
                    gcode.push(`G00 Z${fmt(settings.safeZ)}`);
                }
            };

            // ------------------------------------------------------
            // 2. Header / Footer
            // ------------------------------------------------------
            const generateHeader = () => {
                const now = new Date();
                const dateStr = now.toLocaleDateString();
                const timeStr = now.toLocaleTimeString();

                addComment('// START');
                addComment('// NAME     : recipe');
                addComment(`// DATE     : ${dateStr}`);
                addComment(`// TIME     : ${timeStr}`);
                gcode.push('G00');
                gcode.push('G90');
                gcode.push('G17');
                addComment('// WORK ORIGIN (Current Position)');
                if (settings.includeSafeZ) {
                    gcode.push(`G53 Z${fmt(settings.safeZ)}`);
                }

                addComment('// LASER OFF');
                gcode.push('M11');
                gcode.push('');
            };

            const generateFooter = () => {
                gcode.push('');
                addComment('// LASER OFF');
                gcode.push('M11');
                addComment('// RETURN TO SAFE Z');
                if (settings.includeSafeZ) {
                    gcode.push(`G53 Z${fmt(settings.safeZ)}`);
                }

                if (options?.returnToPos) {
                    addComment('// RETURN TO START POSITION');
                    gcode.push(`G00 X${fmt(options.returnToPos.x)} Y${fmt(options.returnToPos.y)}`);
                }

                addComment('// END');
            };

            // ------------------------------------------------------
            // 3. Fabric Primitive Processors
            // ------------------------------------------------------

            const processPoint = (obj: fabric.Object, isLast: boolean = false) => {
                addComment('// Shape: Point (Dot)');

                const center = obj.getCenterPoint();
                // [NEW] Use explicit markPointTime or default
                const dwellTime = (obj as any).markPointTime || 0.01;
                const p = toMm(center.x, center.y);

                addComment('// Move to Start');
                gcode.push('G90'); // Ensure absolute mode
                gcode.push(`G00 X${fmt(p.x)} Y${fmt(p.y)}`);

                if (_pendingShapeDelay) {
                    addComment(`// Shape Delay ${settings.shapeDelay}s`);
                    gcode.push(`G04 P${fmt(settings.shapeDelay)}`);
                    _pendingShapeDelay = false;
                }

                addComment('// LASER ON');
                // Optional: Move Z to working Z before checking?
                // Standard flow: G00 X Y -> M10 -> G04 -> M11
                gcode.push('M10');

                addComment(`// Dwell ${dwellTime}ms`);
                // G04 Px (x in seconds? or ms? User said "G04 P0.050" for 50ms)
                // If controller interprets P as seconds, then 0.050 is 50ms.
                // Property markPointTime is in ms (default 0.01 = 10us? No, usually UI says ms).
                // Wait, in previous context: "MarkPointTime input field (default: 0.01 ms"??
                // If user Example says: "G04 P0.050 ; 50ms", then Unit is Seconds.
                // So if markPointTime is "ms", we divide by 1000? 
                // Or is markPointTime just a number "0.01" which user Thinks is ms but actually is used as is?
                // React code: "value={props.markPointTime} ... label='Point Time (ms)'"
                // Backend Galvo: passed as is.
                // Here GCode: User example "G04 P0.050 ; 3. 50ms". 0.050s = 50ms.
                // So if value is "50", we need "0.050". if value is "0.05", it is "0.05".
                // Let's assume the value stored in object IS the value to put in P.
                // User Example: "G04 P0.050".

                gcode.push(`G04 P${Number(dwellTime).toFixed(3)}`);

                gcode.push('M11');
                gcode.push(''); // Empty line for readability
            };

            const processRect = (rect: fabric.Rect, isLast: boolean = false) => {
                addComment('// Shape: Rect');

                // Use geometry dimensions (ignoring stroke)
                const width = rect.width || 0;
                const height = rect.height || 0;

                // Local points (centered)
                const points = [
                    new fabric.Point(-width / 2, -height / 2), // TL
                    new fabric.Point(width / 2, -height / 2),  // TR
                    new fabric.Point(width / 2, height / 2),   // BR
                    new fabric.Point(-width / 2, height / 2)   // BL
                ];

                const matrix = rect.calcTransformMatrix();
                const tPoints = points.map(p => fabric.util.transformPoint(p, matrix));

                moveTo(tPoints[0].x, tPoints[0].y);
                laserOn();
                lineTo(tPoints[1].x, tPoints[1].y);
                lineTo(tPoints[2].x, tPoints[2].y);
                lineTo(tPoints[3].x, tPoints[3].y);
                lineTo(tPoints[0].x, tPoints[0].y); // Close
                laserOff(isLast);
            };

            const processLine = (line: fabric.Line, isLast: boolean = false) => {
                addComment('// Shape: Line');

                // Use calcLinePoints to get geometry relative to center (ignoring stroke usually)
                const points = line.calcLinePoints();
                const p1 = new fabric.Point(points.x1, points.y1);
                const p2 = new fabric.Point(points.x2, points.y2);

                const matrix = line.calcTransformMatrix();
                const tP1 = fabric.util.transformPoint(p1, matrix);
                const tP2 = fabric.util.transformPoint(p2, matrix);

                moveTo(tP1.x, tP1.y);
                laserOn();
                lineTo(tP2.x, tP2.y);
                laserOff(isLast);
            };

            const processPolyline = (polyline: fabric.Polyline, isLast: boolean = false) => {
                addComment('// Shape: Polyline');
                const points = polyline.points;
                if (!points || points.length === 0) return;

                const pathOffset = polyline.pathOffset || { x: 0, y: 0 };
                const matrix = polyline.calcTransformMatrix();

                const start = fabric.util.transformPoint(
                    new fabric.Point(points[0].x - pathOffset.x, points[0].y - pathOffset.y),
                    matrix
                );

                moveTo(start.x, start.y);
                laserOn();

                for (let i = 1; i < points.length; i++) {
                    const p = fabric.util.transformPoint(
                        new fabric.Point(points[i].x - pathOffset.x, points[i].y - pathOffset.y),
                        matrix
                    );
                    lineTo(p.x, p.y);
                }
                laserOff(isLast);
            };

            const processPolygon = (polygon: fabric.Polygon, isLast: boolean = false) => {
                addComment('// Shape: Polygon');
                const points = polygon.points;
                if (!points || points.length === 0) return;

                const pathOffset = polygon.pathOffset || { x: 0, y: 0 };
                const matrix = polygon.calcTransformMatrix();

                const start = fabric.util.transformPoint(
                    new fabric.Point(points[0].x - pathOffset.x, points[0].y - pathOffset.y),
                    matrix
                );

                moveTo(start.x, start.y);
                laserOn();

                for (let i = 1; i < points.length; i++) {
                    const p = fabric.util.transformPoint(
                        new fabric.Point(points[i].x - pathOffset.x, points[i].y - pathOffset.y),
                        matrix
                    );
                    lineTo(p.x, p.y);
                }
                lineTo(start.x, start.y); // Close
                laserOff(isLast);
            };

            const processTriangle = (triangle: fabric.Triangle, isLast: boolean = false) => {
                addComment('// Shape: Triangle');
                const width = triangle.width || 0;
                const height = triangle.height || 0;

                const p1 = new fabric.Point(0, -height / 2);
                const p2 = new fabric.Point(-width / 2, height / 2);
                const p3 = new fabric.Point(width / 2, height / 2);

                const matrix = triangle.calcTransformMatrix();
                
                // [FIX] Negate angle if invertY is true to match CNC rotation sense
                if (invertY && triangle.angle) {
                    const center = triangle.getCenterPoint();
                    const negMatrix = fabric.util.composeMatrix({
                        translateX: center.x,
                        translateY: center.y,
                        scaleX: triangle.scaleX,
                        scaleY: triangle.scaleY,
                        angle: -triangle.angle,
                        skewX: triangle.skewX,
                        skewY: triangle.skewY
                    });
                    const tP1 = fabric.util.transformPoint(p1, negMatrix);
                    const tP2 = fabric.util.transformPoint(p2, negMatrix);
                    const tP3 = fabric.util.transformPoint(p3, negMatrix);
                    
                    moveTo(tP1.x, tP1.y);
                    laserOn();
                    lineTo(tP2.x, tP2.y);
                    lineTo(tP3.x, tP3.y);
                    lineTo(tP1.x, tP1.y); // Close
                } else {
                    const tP1 = fabric.util.transformPoint(p1, matrix);
                    const tP2 = fabric.util.transformPoint(p2, matrix);
                    const tP3 = fabric.util.transformPoint(p3, matrix);
                    
                    moveTo(tP1.x, tP1.y);
                    laserOn();
                    lineTo(tP2.x, tP2.y);
                    lineTo(tP3.x, tP3.y);
                    lineTo(tP1.x, tP1.y); // Close
                }
                laserOff(isLast);
            };

            const processUniformCircle = (circle: fabric.Circle, isLast: boolean = false) => {
                const isFullCircle = (Math.abs(circle.endAngle - circle.startAngle) >= 360) || (circle.endAngle === circle.startAngle);

                addComment(isFullCircle ? '// Shape: Circle' : '// Shape: Arc');

                const scaleX = circle.scaleX || 1;
                const radius = (circle.radius || 0) * scaleX;
                let center: { x: number, y: number };
                if (!isFullCircle) {
                    const sa = circle.startAngle ?? 0;
                    const ea = circle.endAngle ?? 360;
                    const r = circle.radius || 0;
                    const pts: { x: number; y: number }[] = [];
                    const saRad = sa * Math.PI / 180;
                    const eaRad = ea * Math.PI / 180;
                    pts.push({ x: r * Math.cos(saRad), y: r * Math.sin(saRad) });
                    pts.push({ x: r * Math.cos(eaRad), y: r * Math.sin(eaRad) });
                    
                    const isAngleBetween = (target: number, start: number, end: number): boolean => {
                        let s = start % 360; if (s < 0) s += 360;
                        let e = end % 360; if (e < 0) e += 360;
                        let t = target % 360; if (t < 0) t += 360;
                        if (s <= e) {
                            return t >= s && t <= e;
                        } else {
                            return t >= s || t <= e;
                        }
                    };

                    for (let axis = 0; axis < 360; axis += 90) {
                        if (isAngleBetween(axis, sa, ea)) {
                            const aRad = axis * Math.PI / 180;
                            pts.push({ x: r * Math.cos(aRad), y: r * Math.sin(aRad) });
                        }
                    }
                    
                    const minX = Math.min(...pts.map(p => p.x));
                    const maxX = Math.max(...pts.map(p => p.x));
                    const minY = Math.min(...pts.map(p => p.y));
                    const maxY = Math.max(...pts.map(p => p.y));
                    
                    const bboxLocalX = (minX + maxX) / 2;
                    const bboxLocalY = (minY + maxY) / 2;
                    
                    const bboxCenter = circle.getCenterPoint();
                    const rot = (circle.angle || 0) * Math.PI / 180;
                    const sx = circle.scaleX || 1;
                    const sy = circle.scaleY || 1;
                    const dx = -bboxLocalX * sx;
                    const dy = -bboxLocalY * sy;
                    center = {
                        x: bboxCenter.x + dx * Math.cos(rot) - dy * Math.sin(rot),
                        y: bboxCenter.y + dx * Math.sin(rot) + dy * Math.cos(rot)
                    };
                } else {
                    center = circle.getCenterPoint();
                }
                const rotation = circle.angle || 0;

                // Fabric angles are in Degrees.
                // startAngle/endAngle are relative to the object's rotation?
                // Actually usually they work together.
                // Let's assume startAngle is relative to 0 of the circle, which is rotated by `angle`.

                // Effective angles in degrees
                const effStartAngle = (circle.startAngle + rotation);
                const effEndAngle = (circle.endAngle + rotation);

                const startRad = fabric.util.degreesToRadians(effStartAngle);
                const endRad = fabric.util.degreesToRadians(effEndAngle);

                const startX = center.x + radius * Math.cos(startRad);
                const startY = center.y + radius * Math.sin(startRad);

                const endX = center.x + radius * Math.cos(endRad);
                const endY = center.y + radius * Math.sin(endRad);

                moveTo(startX, startY);
                laserOn();

                // I, J are relative to Start Point (in mm)
                const startMm = toMm(startX, startY);
                const centerMm = toMm(center.x, center.y);
                const iVal = centerMm.x - startMm.x;
                const jVal = centerMm.y - startMm.y;

                // Determine direction:
                // Fabric Arcs are drawn from startAngle to endAngle in CLOCKWISE direction (if Y is down).
                // If invertY is true (standard CNC), Y is up.
                // G-Code G02 is Clockwise, G03 is Correct-Clockwise.
                // Visual Clockwise on Screen (Y down) == G-Code Clockwise (Y up)?
                // Screen: East(0) -> South(90).
                // G-Code: East(X+) -> South(Y-).
                // Moving X+ to Y- is Clockwise.
                // So Screen CW matches G-Code CW (G02).

                // However, we must ensure we use the correct G2/G3 based on "invertY".
                // Default `processUniformCircle` used `invertY ? 'G02' : 'G03'`.
                // This implies if InvertY (normal CNC), use G02 (CW).

                // Fabric Arcs are always Clockwise sweep from start to end (in visual coordinate)
                const isClockwise = true;
                const cmd = isClockwise ? 'G02' : 'G03';

                // For full circle, end == start (conceptually for G-Code full circle, usually handled by I/J without X/Y, or returning to start)
                // If we pass X,Y equal to Start, it's a full circle.

                const endMm = toMm(endX, endY);

                gcode.push(`${cmd} X${fmt(endMm.x)} Y${fmt(endMm.y)} I${fmt(iVal)} J${fmt(jVal)} F${feedStr}`);

                laserOff(isLast);
            };

            // ------------------------------------------------------
            // 4. Paper.js Processor (Complex Shapes)
            // ------------------------------------------------------

            const processPaperPathInternal = (item: paper.Path, isLast: boolean = false) => {
                if (!item.segments || item.segments.length === 0) return;

                const avgPxPerMm = (pxPerMm.x + pxPerMm.y) / 2;

                // [FIX] Flatten all complex bezier curves (especially text/fonts) into lines with 0.01mm tolerance.
                // But DO NOT flatten if it's a native profile (Arc) so it can be extracted as G02/G03 below.
                if (!(item.data && item.data.isNativeProfile)) {
                    item.flatten(0.01 * avgPxPerMm * PRECISION_SCALE);
                }

                addComment('// Move to Start');

                const startMm = paperToMm(item.segments[0].point, PRECISION_SCALE);
                gcode.push(`G00 X${fmt(startMm.x)} Y${fmt(startMm.y)}`);

                if (_pendingShapeDelay) {
                    addComment(`// Shape Delay ${settings.shapeDelay}s`);
                    gcode.push(`G04 P${fmt(settings.shapeDelay)}`);
                    _pendingShapeDelay = false;
                }

                addComment('// LASER ON');
                gcode.push(`G01 Z${fmt(settings.workingZ)} F${feedStr}`);
                gcode.push('M10');

                const firstMm = startMm;
                const MIN_SEG_LEN_MM = 0.001;
                let lastOutputMm = { x: firstMm.x, y: firstMm.y };

                if (!item.curves || item.curves.length === 0) {
                    for (let i = 1; i < item.segments.length; i++) {
                        const endMm = paperToMm(item.segments[i].point, PRECISION_SCALE);
                        const dx = endMm.x - lastOutputMm.x;
                        const dy = endMm.y - lastOutputMm.y;
                        if (Math.hypot(dx, dy) < MIN_SEG_LEN_MM) continue;
                        gcode.push(`G01 X${fmt(endMm.x)} Y${fmt(endMm.y)} F${feedStr}`);
                        lastOutputMm = { x: endMm.x, y: endMm.y };
                    }
                    if (item.closed) {
                        const dx = firstMm.x - lastOutputMm.x;
                        const dy = firstMm.y - lastOutputMm.y;
                        if (Math.hypot(dx, dy) >= MIN_SEG_LEN_MM) {
                            gcode.push(`G01 X${fmt(firstMm.x)} Y${fmt(firstMm.y)} F${feedStr}`);
                        }
                    }
                } else {
                    for (let i = 0; i < item.curves.length; i++) {
                        const curve = item.curves[i];

                        if (curve.isLinear()) {
                            const endMm = paperToMm(curve.point2, PRECISION_SCALE);
                            let tx = endMm.x;
                            let ty = endMm.y;

                            if (item.closed && i === item.curves.length - 1) {
                                tx = firstMm.x;
                                ty = firstMm.y;
                            }

                            const dx = tx - lastOutputMm.x;
                            const dy = ty - lastOutputMm.y;
                            if (Math.hypot(dx, dy) < MIN_SEG_LEN_MM) continue;

                            gcode.push(`G01 X${fmt(tx)} Y${fmt(ty)} F${feedStr}`);
                            lastOutputMm = { x: tx, y: ty };
                        } else {
                            // Biarc Approximation
                            const p0 = curve.point1;
                            const p1 = curve.point1.add(curve.handle1);
                            const p2 = curve.point2.add(curve.handle2);
                            const p3 = curve.point2;

                            const avgPxPerMm = (pxPerMm.x + pxPerMm.y) / 2;
                            const tolerancePx = 0.0005 * avgPxPerMm * PRECISION_SCALE;
                            const arcs = BiarcDecomposition.approximateBezier(p0, p1, p2, p3, tolerancePx);

                            if (!arcs || arcs.length === 0) {
                                // Fallback to straight line if bezier approximation yields no arcs
                                const endMm = paperToMm(curve.point2, PRECISION_SCALE);
                                let tx = endMm.x;
                                let ty = endMm.y;
                                if (item.closed && i === item.curves.length - 1) {
                                    tx = firstMm.x;
                                    ty = firstMm.y;
                                }
                                gcode.push(`G01 X${fmt(tx)} Y${fmt(ty)} F${feedStr}`);
                                continue;
                            }

                            for (let j = 0; j < arcs.length; j++) {
                                const arc = arcs[j];
                                const startArcMm = paperToMm(arc.start, PRECISION_SCALE);
                                const endArcMm = paperToMm(arc.end, PRECISION_SCALE);
                                const centerArcMm = paperToMm(arc.center, PRECISION_SCALE);

                                let tx = endArcMm.x;
                                let ty = endArcMm.y;

                                if (item.closed && i === item.curves.length - 1 && j === arcs.length - 1) {
                                    tx = firstMm.x;
                                    ty = firstMm.y;
                                }

                                const dx = tx - startArcMm.x;
                                const dy = ty - startArcMm.y;
                                if (Math.hypot(dx, dy) < MIN_SEG_LEN_MM) continue;

                                let iVal = centerArcMm.x - startArcMm.x;
                                let jVal = centerArcMm.y - startArcMm.y;
                                const radius = Math.hypot(iVal, jVal);

                                if (radius < 0.01 || radius > 1000) {
                                    gcode.push(`G01 X${fmt(tx)} Y${fmt(ty)} F${feedStr}`);
                                    continue;
                                }

                                const isClockwise = arc.clockwise;
                                const cmd = isClockwise ? 'G02' : 'G03';

                                gcode.push(`${cmd} X${fmt(tx)} Y${fmt(ty)} I${fmt(iVal)} J${fmt(jVal)} F${feedStr}`);
                            }
                        }
                    }
                }
                laserOff(isLast);
            };

            const generateProfile = (item: paper.PathItem, fsettings: IFillSettings, isLast: boolean) => {
                if (!fsettings.enableProfile) return;

                // If CompoundPath, generate profile for each child independently
                if (item instanceof paper.CompoundPath) {
                    item.children.forEach((child, idx) => {
                        const isChildLast = idx === item.children.length - 1;
                        generateProfile(child as paper.PathItem, fsettings, isLast && isChildLast);
                    });
                    return;
                }

                let path = item.clone() as paper.Path;

                // [NEW] Intercept Native Profile (Circle/Ellipse/Arc) that were preserved by FabricToPaperAdapter
                // This ensures grouped circles are exported as perfect G02 commands instead of broken G01 polygons
                if (item.data && item.data.isNativeProfile) {
                    const bounds = item.bounds;
                    const center = bounds.center;
                    
                    const startMm = paperToMm(new paper.Point(center.x, center.y), PRECISION_SCALE);
                    const marginMm = fsettings.margin || 0;
                    
                    const ptRight = paperToMm(new paper.Point(center.x + bounds.width / 2, center.y), PRECISION_SCALE);
                    const ptBottom = paperToMm(new paper.Point(center.x, center.y + bounds.height / 2), PRECISION_SCALE);
                    
                    const realRx = Math.abs(ptRight.x - startMm.x);
                    const realRy = Math.abs(ptBottom.y - startMm.y);
                    
                    const finalRx = realRx;
                    const finalRy = realRy;
                    
                    if (item.data.nativeType === 'CIRCLE' && finalRx > 0) {
                        addComment('// Shape: Circle (Native Profile)');
                        const startX = startMm.x - finalRx;
                        const startY = startMm.y;
                        
                        addComment('// Move to Start');
                        gcode.push(`G00 X${fmt(startX)} Y${fmt(startY)}`);

                        if (_pendingShapeDelay) {
                            addComment(`// Shape Delay ${settings.shapeDelay}s`);
                            gcode.push(`G04 P${fmt(settings.shapeDelay)}`);
                            _pendingShapeDelay = false;
                        }

                        laserOn();
                        // InvertY is true for CNC: Y is UP. PaperJS draws CW, so we want CW arc = G02
                        const cmd = invertY ? 'G02' : 'G03';
                        gcode.push(`${cmd} X${fmt(startX)} Y${fmt(startY)} I${fmt(finalRx)} J0.000 F${feedStr}`);
                        
                        laserOff(isLast);
                        path.remove();
                        return;
                    }
                    // For ARC, it's safer to let processPaperPathInternal handle it if we don't have start/end mm easily,
                    // but since we want to prevent flatten, we'll bypass flatten below.
                }

                if (path.closed && path.segments && path.segments.length > 1) {
                    const bounds = path.bounds;
                    let targetPt = bounds.topLeft;
                    if (fsettings.profileStartPoint === 'RT') targetPt = bounds.topRight;
                    else if (fsettings.profileStartPoint === 'LB') targetPt = bounds.bottomLeft;
                    else if (fsettings.profileStartPoint === 'RB') targetPt = bounds.bottomRight;

                    let minDist = Infinity;
                    let minIdx = 0;
                    path.segments.forEach((seg, idx) => {
                        const d = seg.point.getDistance(targetPt);
                        if (d < minDist) { minDist = d; minIdx = idx; }
                    });

                    // Reorder segments to start at minIdx
                    if (minIdx !== 0 && path.segments.length > 0) {
                        try {
                            const isPathClosed = path.closed;
                            const offset = path.segments[minIdx].location.offset;
                            const newPart = path.splitAt(offset);
                            if (newPart) {
                                // If path was open, splitAt returns the newly cut end portion
                                newPart.join(path);
                                newPart.closed = isPathClosed;
                                path = newPart;
                            } else {
                                // If path was closed, splitAt modifies it in place, shifting the start point, 
                                // making it open, and returns null. We just need to re-close it.
                                path.closed = true;
                            }
                        } catch (e) {
                            console.warn("Failed to split path for start point", e);
                        }
                    }

                    // Determine optimal Profile Direction (CW vs CCW) based on Progression (L2R, R2L, T2B, B2T)
                    let targetVector = new paper.Point(1, 0); // L2R default
                    if (fsettings.fillProgression === 'R2L') targetVector = new paper.Point(-1, 0);
                    else if (fsettings.fillProgression === 'T2B') targetVector = new paper.Point(0, 1);
                    else if (fsettings.fillProgression === 'B2T') targetVector = new paper.Point(0, -1);

                    // Get tangent of the very first segment
                    const tangent = path.getTangentAt(Math.min(1, path.length * 0.01));

                    if (tangent) {
                        const dot = tangent.dot(targetVector);
                        if (dot < 0) {
                            path.reverse();
                        }
                    }
                }

                addComment('// --- Profile Start ---');
                processPaperPathInternal(path, isLast);
                addComment('// --- Profile End ---');
                path.remove();
            };

            const processHatching = (item: paper.PathItem, fsettings: IFillSettings, isLast: boolean, effectiveEnableProfile: boolean = fsettings.enableProfile) => {
                if (!fsettings.enableFill || fsettings.lineSpacing <= 0) return;

                addComment('// --- Hatching Start ---');
                // Use a CompoundPath wrapper if it's a layer/group, or clone directly
                const hatchItem = item.clone() as paper.PathItem;
                hatchItem.visible = false;

                if (hatchItem instanceof paper.Path) {
                    hatchItem.closed = true;
                }

                // [FIX] Add objRot (global angle) to fsettings.angle to rotate hatch lines with the object
                const objRot = item.data?.globalAngle || 0;
                const angle = (fsettings.angle || 0) + objRot;
                const center = hatchItem.bounds.center;
                
                // Match UI overlay grid calculation: rotate the 4 corners of the original bounding box
                const unrotatedBounds = hatchItem.bounds;
                hatchItem.rotate(-angle, center);
                
                const rad = -angle * Math.PI / 180;
                const corners = [
                    new paper.Point(unrotatedBounds.left, unrotatedBounds.top),
                    new paper.Point(unrotatedBounds.right, unrotatedBounds.top),
                    new paper.Point(unrotatedBounds.right, unrotatedBounds.bottom),
                    new paper.Point(unrotatedBounds.left, unrotatedBounds.bottom)
                ];
                
                let minX = Infinity, maxX = -Infinity;
                let minY = Infinity, maxY = -Infinity;
                corners.forEach(pt => {
                    const dx = pt.x - center.x;
                    const dy = pt.y - center.y;
                    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
                    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
                    if (rx < minX) minX = rx;
                    if (rx > maxX) maxX = rx;
                    if (ry < minY) minY = ry;
                    if (ry > maxY) maxY = ry;
                });
                
                const sweepBounds = {
                    left: center.x + minX,
                    right: center.x + maxX,
                    top: center.y + minY,
                    bottom: center.y + maxY,
                    width: maxX - minX,
                    height: maxY - minY
                };
                if (sweepBounds.width <= 0 || sweepBounds.height <= 0) {
                    hatchItem.remove();
                    return;
                }

                const avgPxPerMm = (pxPerMm.x + pxPerMm.y) / 2;
                const spacingSq = fsettings.lineSpacing * avgPxPerMm * PRECISION_SCALE;
                let marginSq = fsettings.margin * avgPxPerMm * PRECISION_SCALE;

                let is2DInset = false;
                if (fsettings.margin > 0 && item.data?.isNativeProfile && item.data.nativeType === 'CIRCLE') {
                    const marginPx = fsettings.margin * avgPxPerMm * PRECISION_SCALE;
                    const rPx = unrotatedBounds.width / 2;
                    if (rPx > 0) {
                        const scaleF = Math.max(0.0001, (rPx - marginPx) / rPx);
                        hatchItem.scale(scaleF, center);
                        is2DInset = true;
                    }
                }

                const lines: paper.Path.Line[] = [];
                const isHorizontalSweep = fsettings.fillProgression === 'T2B' || fsettings.fillProgression === 'B2T';

                const startPrimary = isHorizontalSweep ?
                    (fsettings.fillProgression === 'T2B' ? sweepBounds.top : sweepBounds.bottom) :
                    (fsettings.fillProgression === 'L2R' ? sweepBounds.left : sweepBounds.right);

                const endPrimary = isHorizontalSweep ?
                    (fsettings.fillProgression === 'T2B' ? sweepBounds.bottom : sweepBounds.top) :
                    (fsettings.fillProgression === 'L2R' ? sweepBounds.right : sweepBounds.left);

                const stepPrimary = (endPrimary > startPrimary) ? spacingSq : -spacingSq;

                const minSec = isHorizontalSweep ? sweepBounds.left : sweepBounds.top;
                const maxSec = isHorizontalSweep ? sweepBounds.right : sweepBounds.bottom;

                let p = startPrimary;
                const limit = endPrimary;

                if (effectiveEnableProfile) {
                    p += stepPrimary; // Skip the exact boundary start line only if a profile pass is actually emitted
                }

                const eps = 0.0001 * avgPxPerMm * PRECISION_SCALE;
                const condition = stepPrimary > 0 
                    ? (val: number) => effectiveEnableProfile ? val <= limit - eps : val <= limit + eps
                    : (val: number) => effectiveEnableProfile ? val >= limit + eps : val >= limit - eps;

                for (; condition(p); p += stepPrimary) {
                    const pOffset = p + 1.0; // Perturb by 1.0 in PRECISION_SCALE (0.0001 mm) to avoid Paper.js anchor intersection bug
                    const lineStart = isHorizontalSweep ? new paper.Point(minSec - 1000, pOffset) : new paper.Point(pOffset, minSec - 1000);
                    const lineEnd = isHorizontalSweep ? new paper.Point(maxSec + 1000, pOffset) : new paper.Point(pOffset, maxSec + 1000);

                    const sweepLine = new paper.Path.Line(lineStart, lineEnd);
                    const intersections = sweepLine.getIntersections(hatchItem as paper.PathItem);

                    if (intersections.length >= 2) {
                        intersections.sort((a, b) => {
                            if (isHorizontalSweep) return a.point.x - b.point.x;
                            return a.point.y - b.point.y;
                        });

                        for (let i = 0; i < intersections.length - 1; i += 2) {
                            let p1 = intersections[i].point;
                            let p2 = intersections[i + 1].point;

                            if (marginSq > 0 && !is2DInset) {
                                const vec = p2.subtract(p1);
                                if (vec.length <= marginSq * 2) continue;
                                const dir = vec.normalize();
                                p1 = p1.add(dir.multiply(marginSq));
                                p2 = p2.subtract(dir.multiply(marginSq));
                            } else {
                                // Filter out zero-length lines (tangents) that Paper.js might return
                                const vec = p2.subtract(p1);
                                if (vec.length < 1.0) continue;
                            }
                            lines.push(new paper.Path.Line(p1, p2));
                        }
                    }
                    sweepLine.remove();
                }
                hatchItem.remove();

                let initL2R = true;
                const sp = fsettings.profileStartPoint || 'LT';
                if (sp === 'RT' || sp === 'RB') initL2R = false;
                if (!isHorizontalSweep) {
                    if (sp === 'LB' || sp === 'RB') initL2R = false;
                    else initL2R = true;
                }

                // Handle path construction differently depending on fillType
                // 'OneWay' - standard, all L2R or R2L
                // 'TwoWay' - Zigzag, alternates every line
                // 'OptimizedTwoWay' - Zigzag AND laser stays on for traversing down margin? (Actually just zigzag without offing the laser normally?)
                // Actually, OptimizedTwoWay just means we don't lift the laser. We draw the connector line.
                // OptimizedBow means we skip blank areas (which our algorithm already naturally handles because we only draw intersecting lines!)

                lines.forEach((line, idx) => {
                    let p1 = line.firstSegment.point;
                    let p2 = line.lastSegment.point;

                    let swap = false;
                    if (isHorizontalSweep) {
                        if (p1.x > p2.x) swap = true;
                    } else {
                        if (p1.y > p2.y) swap = true;
                    }
                    if (swap) { const tmp = p1; p1 = p2; p2 = tmp; }

                    let goL2R = initL2R;
                    if ((fsettings.fillType === 'TwoWay' || fsettings.fillType === 'OptimizedTwoWay' || fsettings.fillType === 'OptimizedBow') && (idx % 2 === 1)) {
                        goL2R = !initL2R;
                    }

                    if (!goL2R) { const tmp = p1; p1 = p2; p2 = tmp; }

                    // map back correctly to absolute position
                    const matrix = new paper.Matrix().rotate(angle, center.x, center.y);
                    let globalP1 = matrix.transform(p1);
                    let globalP2 = matrix.transform(p2);

                    const startPx = new paper.Point(globalP1.x / PRECISION_SCALE, globalP1.y / PRECISION_SCALE);
                    const endPx = new paper.Point(globalP2.x / PRECISION_SCALE, globalP2.y / PRECISION_SCALE);

                    const isLastHatch = isLast && idx === lines.length - 1 && !effectiveEnableProfile;

                    const marginValue = fsettings.margin || 0;
                    // Only keep laser ON for connecting lines if we have a margin>0 pushing it inside the shape.
                    // If margin is 0, connecting lines will overlap exactly with the shape's profile, burning it twice or making it uneven.
                    const canConnect = marginValue > 0 && (fsettings.fillType === 'OptimizedTwoWay' || fsettings.fillType === 'OptimizedBow');

                    if (canConnect) {
                        // Keep laser on to the next start point if possible (unless it's the very first line)
                        if (idx === 0) {
                            moveTo(startPx.x, startPx.y);
                            laserOn();
                        } else {
                            lineTo(startPx.x, startPx.y); // Draw connecting line
                        }
                        lineTo(endPx.x, endPx.y);
                        if (idx === lines.length - 1) {
                            laserOff(isLastHatch);
                        }
                    } else {
                        // Standard jump behavior (Laser OFF during traversal to avoid burning outline)
                        if (idx > 0) {
                            // If we were at endPx of previous line, move to new startPx with laser OFF
                        }
                        moveTo(startPx.x, startPx.y);
                        laserOn();
                        lineTo(endPx.x, endPx.y);
                        laserOff(isLastHatch);
                    }
                });

                lines.forEach(l => l.remove());
                addComment('// --- Hatching End ---');
            };

            // ------------------------------------------------------
            // 4.5 Single-Object Dispatch (Dot/Primitive/Paper.js) — 최상위 도형과
            //     MatrixRepeater의 각 셀이 공통으로 사용하는 단일 오브젝트 처리기
            // ------------------------------------------------------

            /**
             * @brief 도형 하나에 대한 G-Code를 생성한다(Dot/Primitive 고속 경로 → Paper.js 폴백).
             * @details [Design Pattern: 없음] 기존에는 이 로직이 메인 루프 안에 인라인되어 있어
             *          MatrixRepeater 셀에서 재사용할 수 없었다. 최상위 도형 처리와
             *          processMatrixRepeater()의 셀별 처리가 이 함수 하나를 공유하도록 분리했다.
             * @param obj 처리할 fabric 오브젝트
             * @param isLast 전체 시퀀스의 마지막 도형(마지막 셀 포함)인지 여부 (Safe Z 복귀 판단용)
             * @param shapeLabel 진행 상황 주석에 그대로 출력할 라벨 문자열
             */
            const processOneObject = async (obj: any, isLast: boolean, shapeLabel: string): Promise<void> => {
                addComment(shapeLabel);

                // [NEW] Matrix Z-Offset Support
                const zOffset = obj.customData?.zOffset || 0;
                const absoluteZ = settings.workingZ + zOffset;
                if (absoluteZ !== _lastZOffset) {
                    addComment(`// Z-Offset move: ${absoluteZ.toFixed(3)}`);
                    gcode.push(`G00 Z${fmt(absoluteZ)}`);
                    _lastZOffset = absoluteZ;
                }

                // [NEW] 1. Dot Marker (Point)
                if (isType(obj, 'dot_marker') || (obj as any).id === 'dot_marker') {
                    processPoint(obj, isLast);
                    return;
                }

                // 2. Custom Hatching / Profile Bypass
                const fillSettings = (obj as any).fillSettings as IFillSettings;
                if (fillSettings && (fillSettings.enableFill || fillSettings.enableProfile)) {
                    // Force Paper.js to handle geometry so we can construct Hatch/Profile
                    addComment(`// Fabric Object (Custom Fill/Profile routed to Paper.js): ${obj.type}`);
                    // Fall through to Paper Logic
                } else {
                    // 3. Primitives (Fabric Logic - Fast path when NO special fill settings)
                    if (isType(obj, 'rect')) {
                        processRect(obj as fabric.Rect, isLast);
                        return;
                    }
                    if (isType(obj, 'line')) {
                        processLine(obj as fabric.Line, isLast);
                        return;
                    }
                    if (isType(obj, 'polyline')) {
                        processPolyline(obj as fabric.Polyline, isLast);
                        return;
                    }
                    if (isType(obj, 'polygon')) {
                        processPolygon(obj as fabric.Polygon, isLast);
                        return;
                    }
                    if (isType(obj, 'triangle')) {
                        processTriangle(obj as fabric.Triangle, isLast);
                        return;
                    }
                    if (isType(obj, 'circle')) {
                        const circleObj = obj as fabric.Circle;
                        const scaleX = circleObj.scaleX || 1;
                        const scaleY = circleObj.scaleY || 1;
                        if (Math.abs(scaleX - scaleY) < 0.05) {
                            processUniformCircle(circleObj, isLast);
                            return;
                        }
                    }
                    addComment(`// Fabric Object: ${obj.type}`);
                }

                // 4. Complex Shapes (Paper Logic)
                const originalItem = await FabricToPaperAdapter.toPaperItem(obj, scope);

                if (!originalItem) {
                    addComment('// WARN: Failed to convert to Paper Item');
                    return;
                }
                addComment(`// Converted to Paper: ${originalItem.className}`);

                const item = originalItem.clone() as paper.Item;
                item.scale(PRECISION_SCALE, new paper.Point(0, 0));

                const bakeTransforms = (itm: paper.Item) => {
                    if (itm instanceof paper.Raster) return; // Skip Raster to prevent huge resampling
                    (itm as any).applyMatrix = true;
                    if ((itm as any).children) {
                        (itm as any).children.forEach((child: paper.Item) => bakeTransforms(child));
                    }
                };
                bakeTransforms(item);

                const parentCenter = item.bounds.center;
                let parentSweepBounds = item.bounds;

                if (fillSettings && fillSettings.enableFill) {
                    const tempGlobal = item.clone();
                    tempGlobal.rotate(-(fillSettings.angle || 0), parentCenter);
                    parentSweepBounds = tempGlobal.bounds;
                    tempGlobal.remove();
                }

                const processRaster = (raster: paper.Raster) => {
                    const bounds = raster.bounds;
                    const imgElement = (raster as any).image || (raster as any).canvas;
                    if (!imgElement) return;

                    const width = raster.width || 0;
                    const height = raster.height || 0;
                    if (width <= 0 || height <= 0) return;

                    const targetObj = raster.data?.original || obj;
                    const sensitivity = (targetObj as any).threshold ?? 50;
                    const edgeDetection = (targetObj as any).edgeDetection ?? true;

                    // Read pixels into memory once using shared utility
                    const binarized = ImageProcessor.getBinarizedPixels(imgElement, width, height, sensitivity, edgeDetection);
                    if (!binarized) return;

                    let stepPaper = Math.min(bounds.width / width, bounds.height / height);
                    if (stepPaper < PRECISION_SCALE) stepPaper = PRECISION_SCALE;

                    const avgPxPerMm = (pxPerMm.x + pxPerMm.y) / 2;
                    const stepMm = stepPaper / (avgPxPerMm * PRECISION_SCALE);

                    addComment('// Shape: Image (Raster Engraving)');
                    addComment(`// Resolution: ${stepMm.toFixed(4)}mm`);

                    // In paper.js, raster can be rotated by bounds, but for simplification we've flattened it.
                    for (let y = 0; y < height; y++) {
                        let activeSegmentStart: number | null = null;
                        const globalY = bounds.top + y * (bounds.height / height);

                        for (let x = 0; x < width; x++) {
                            const isDark = binarized[y * width + x] === 1;
                            const globalX = bounds.left + x * (bounds.width / width);

                            if (isDark) {
                                if (activeSegmentStart === null) activeSegmentStart = globalX;
                            } else {
                                if (activeSegmentStart !== null) {
                                    writeScanSegment(activeSegmentStart, globalX - (bounds.width / width), globalY);
                                    activeSegmentStart = null;
                                }
                            }
                        }
                        if (activeSegmentStart !== null) {
                            writeScanSegment(activeSegmentStart, bounds.right, globalY);
                        }
                    }
                };

                const writeScanSegment = (startX: number, endX: number, y: number) => {
                    // Convert Scaled Paper Points to MM
                    const startMm = paperToMm(new paper.Point(startX, y), PRECISION_SCALE);
                    const endMm = paperToMm(new paper.Point(endX, y), PRECISION_SCALE);

                    // Move to Start (Laser OFF)
                    gcode.push(`G00 X${fmt(startMm.x)} Y${fmt(startMm.y)}`);

                    if (_pendingShapeDelay) {
                        addComment(`// Shape Delay ${settings.shapeDelay}s`);
                        gcode.push(`G04 P${fmt(settings.shapeDelay)}`);
                        _pendingShapeDelay = false;
                    }

                    // Cut to End (Laser ON)
                    // Using M10/M11 for On/Off
                    gcode.push(`M10`); // Laser On
                    gcode.push(`G01 X${fmt(endMm.x)} Y${fmt(endMm.y)} F${feedStr}`);
                    gcode.push(`M11`); // Laser Off
                };

                const processItem = (itm: paper.Item, itmIsLast: boolean = false) => {
                    if (!itm) return;

                    // 1. Raster
                    if (itm instanceof paper.Raster) {
                        processRaster(itm);
                        return;
                    }

                    // 2. Shape -> Path conversion
                    if (itm instanceof paper.Shape) {
                        const path = itm.toPath();
                        processItem(path, itmIsLast);
                        return;
                    }

                    // 3. Children Recursion (Group, Layer, etc. but skip CompoundPath)
                    if (itm.children && itm.children.length > 0 && !(itm instanceof paper.CompoundPath)) {
                        itm.children.forEach((child, idx) => {
                            const isChildLast = idx === itm.children!.length - 1;
                            processItem(child, itmIsLast && isChildLast);
                        });
                        return;
                    }

                    // 4. Leaf Geometry (Path) OR CompoundPath
                    if (itm instanceof paper.Path || itm instanceof paper.CompoundPath) {
                        addComment(`// Shape: ${itm.className}`);
                        const targetObj = itm.data?.original || obj;
                        const fillSettings = (targetObj as any).fillSettings as IFillSettings;
                        if (fillSettings) {
                            const strokeEnabled = (targetObj as any).strokeEnabled ?? (targetObj.stroke && targetObj.stroke !== 'transparent');
                            const fillEnabled = (targetObj as any).fillEnabled ?? (targetObj.fill && targetObj.fill !== 'transparent');

                            const doProfile = strokeEnabled && fillSettings.enableProfile;
                            const doFill = fillEnabled && fillSettings.enableFill;

                            if (doProfile) {
                                generateProfile(itm, fillSettings, itmIsLast && !doFill);
                            }
                            if (doFill) {
                                processHatching(itm, fillSettings, itmIsLast, doProfile);
                            }
                        } else {
                            if (itm instanceof paper.CompoundPath) {
                                // For basic g-code trace (no fill settings), we DO need to trace each child contour individually
                                itm.children.forEach((child, idx) => {
                                    const isChildLast = idx === itm.children.length - 1;
                                    processPaperPathInternal(child as paper.Path, itmIsLast && isChildLast);
                                });
                            } else {
                                processPaperPathInternal(itm, itmIsLast);
                            }
                        }
                        return;
                    }
                };

                processItem(item, isLast);
                item.remove();
                originalItem.remove();
            };

            /**
             * @brief Object 모드(G-Code)에서 MatrixRepeater를 xCount×yCount 그대로 순회하며 셀별 G-code를 생성한다.
             * @details [Design Pattern: 없음] 기존에는 이 분기가 없어 매트릭스 오브젝트가
             *          FabricToPaperAdapter의 MatrixRepeater 변환 분기(getVirtualObjects(), 150셀 캡)로
             *          흘러가 150셀을 넘으면 G-Code가 전혀 생성되지 않는 버그가 있었다.
             *          Scanner 모드(ScannerGenerator.ts)와 동일하게 셀을 직접 순회해
             *          100×100(1만 셀) 규모에서도 정상 동작하도록 한다.
             * @param repeater 대상 MatrixRepeater 인스턴스
             * @param isLastShape 이 리피터가 전체 시퀀스의 마지막 최상위 도형인지 여부
             * @param shapeIndex objects 배열에서의 이 리피터의 인덱스 (주석/라벨용)
             * @param totalShapes objects 배열 전체 길이 (주석/라벨용)
             * @param loop 현재 Mark times 반복 회차 (0-based)
             * @param totalLoops 전체 Mark times 반복 횟수
             */
            const processMatrixRepeater = async (
                repeater: any,
                isLastShape: boolean,
                shapeIndex: number,
                totalShapes: number,
                loop: number,
                totalLoops: number
            ): Promise<void> => {
                const sourceObjects: fabric.Object[] = repeater.sourceObjects || [];
                if (sourceObjects.length === 0) return;

                const numItems = repeater.xCount * repeater.yCount;
                const YIELD_CHUNK = 200;

                for (let i = 0; i < numItems; i++) {
                    // [PERF] 셀마다가 아니라 청크(기본 200셀) 단위로만 UI 스레드에 양보한다.
                    if (i > 0 && i % YIELD_CHUNK === 0) {
                        await new Promise(r => setTimeout(r, 0));
                    }

                    const row = Math.floor(i / repeater.xCount);
                    const isReverseRow = repeater.isZigzag && (row % 2 !== 0);
                    const col = isReverseRow ? (repeater.xCount - 1 - (i % repeater.xCount)) : (i % repeater.xCount);

                    const cellKey = `${row}_${col}`;
                    const override = repeater.overrides?.[cellKey];
                    if (override?.visible === false) continue;

                    // [FIX] repeater.left/top(매트릭스의 실제 scene 위치)을 반영해야 하므로,
                    // col*xSpacing만으로 계산하지 않고 렌더링/CanvasTopBar 표시와 동일한
                    // getCellSceneOrigin()(단일 진실 공급원)을 사용한다. 그렇지 않으면 셀 간
                    // 상대 간격은 맞아도 매트릭스 전체가 캔버스 원점 근처의 엉뚱한 절대
                    // 좌표에 가공되는 버그가 있었다.
                    const cellOrigin = repeater.getCellSceneOrigin(row, col, override);
                    const dx = cellOrigin.x;
                    const dy = cellOrigin.y;

                    // [Matrix Z-Step] 매트릭스 자체의 Z-Axis Cumulative Offset 옵션(셀별 누적 Z) +
                    // 셀별 개별 Z 오프셋(override.zOffset)
                    if (repeater.zStep || override?.zOffset) {
                        // [FIX] 캔버스 Z-info 라벨/CanvasTopBar Cell Z 필드와 동일한 공식(단일 진실 공급원)
                        const absoluteZ = repeater.computeAbsoluteZ(i, override, settings.workingZ);
                        if (absoluteZ !== _lastZOffset) {
                            addComment(`// Matrix Z-Step move: ${absoluteZ.toFixed(3)}`);
                            gcode.push(`G00 Z${fmt(absoluteZ)}`);
                            _lastZOffset = absoluteZ;
                        }
                    }

                    const isLastCell = isLastShape && (i === numItems - 1);

                    for (let s = 0; s < sourceObjects.length; s++) {
                        const src: any = sourceObjects[s];
                        const curLeft = src.left;
                        const curTop = src.top;

                        const originalFill = src.fill;
                        const originalStroke = src.stroke;
                        const originalFillSettings = src.fillSettings;
                        const originalMarkPointTime = src.markPointTime;
                        const originalScaleX = src.scaleX;
                        const originalScaleY = src.scaleY;

                        // [Design Pattern: Scoped Guard] 공유 소스의 임시 변경은 예외/중단 경로를
                        // 포함해 반드시 원복되어야 한다(ScannerGenerator.ts 매트릭스 분기와 대칭 —
                        // MatrixDisplayIssues2.md §2.3).
                        try {
                            src.set({ left: (curLeft || 0) + dx, top: (curTop || 0) + dy });
                            src.setCoords();

                            if (override?.fill !== undefined) src.fill = override.fill;
                            if (override?.stroke !== undefined) src.stroke = override.stroke;
                            if (override?.fillSettings !== undefined) src.fillSettings = override.fillSettings;
                            if (override?.markTime !== undefined) src.markPointTime = override.markTime;
                            if (override?.scaleX !== undefined) src.scaleX = (src.scaleX || 1) * override.scaleX;
                            if (override?.scaleY !== undefined) src.scaleY = (src.scaleY || 1) * override.scaleY;

                            const isLastSrc = isLastCell && (s === sourceObjects.length - 1);
                            await processOneObject(
                                src,
                                isLastSrc,
                                `// Shape ${shapeIndex + 1}/${totalShapes} Cell (${row},${col}) (Pass ${loop + 1}/${totalLoops})`
                            );
                        } finally {
                            src.fill = originalFill;
                            src.stroke = originalStroke;
                            src.fillSettings = originalFillSettings;
                            src.markPointTime = originalMarkPointTime;
                            src.scaleX = originalScaleX;
                            src.scaleY = originalScaleY;
                            src.set({ left: curLeft, top: curTop });
                            // [FIX 2026-07-23] 복원 후 setCoords()로 aCoords 캐시까지 원위치로 갱신.
                            // fabric v7 getBoundingRect()는 캐시된 aCoords를 사용하므로, 누락 시 가공 후
                            // updateBoundingBox()가 _srcMinX/Y를 오염시켜 라벨-도형 분리/컬링 오류를 유발.
                            src.setCoords();
                        }
                    }
                }
            };

            // ------------------------------------------------------
            // 5. Main Processing Loop
            // ------------------------------------------------------

            const scope = new paper.PaperScope();
            scope.setup(new paper.Size(canvas.getWidth(), canvas.getHeight()));

            generateHeader();

            // [FIX] Recursive Flattening for Layer Support
            const allObjectsHidden = useCanvasStore.getState().allObjectsHidden;
            const allFabricObjects = canvas.getObjects();
            const objects = getAllObjects(allFabricObjects).filter(obj =>
                !(obj as any).isPaper &&
                !(obj as any).isGridLine &&
                !(obj as any).isGuide &&
                !(obj as any).isTemp &&
                !(obj as any).isMeasurement &&
                !(obj as any).isCrosshair &&
                !(obj as any).excludeFromExport &&
                !allObjectsHidden &&
                (obj as any).userVisible !== false
            );

            // [NEW] 색상별 그룹화: colorPresets가 주어지면 도형을 색상(레이어)별로 묶어
            // 그룹마다 preset.markTimes만큼 반복하고 preset.zOffset을 절대 workingZ로 적용한다.
            // ScannerGenerator.ts의 groupByColorPreset과 동일한 정책이며, 생략 시(호환성 유지)
            // 기존과 동일하게 전체 도형을 단일 그룹(전역 markTimes)으로 처리한다.
            // [FIX] preset.zOffset은 "기준 Z 위의 상대 오프셋"이 아니라 "이 색상이 가공될 절대
            // Z"를 의미한다(getColorPresetOrDefault가 처음 생성 시 현재 모션 Z축 위치를 기본값으로
            // 채워준다). 색상 프리셋이 없는 그룹은 baseWorkingZ(현재 workingZ)를 그대로 쓴다.
            const fallbackTotalLoops = Math.max(1, Math.floor(Number(settings.markTimes) || 1));
            const colorPresets = options?.colorPresets;
            const baseWorkingZ = settings.workingZ;
            type GCodeShapeGroup = { color: string; objs: any[]; markTimes: number; targetZ: number };
            let groups: GCodeShapeGroup[];
            if (!colorPresets) {
                groups = [{ color: '', objs: objects, markTimes: fallbackTotalLoops, targetZ: baseWorkingZ }];
            } else {
                const order: string[] = [];
                const buckets: Record<string, any[]> = {};
                objects.forEach((obj: any) => {
                    const isDetached = obj.customData?.colorPresetLinked === false;
                    const color = isDetached ? '' : resolveObjectColorHex(obj);
                    if (!buckets[color]) { buckets[color] = []; order.push(color); }
                    buckets[color].push(obj);
                });
                groups = order.map((color) => {
                    const preset = color ? colorPresets[color] : undefined;
                    return {
                        color,
                        objs: buckets[color],
                        markTimes: preset ? Math.max(1, Math.floor(Number(preset.markTimes) || 1)) : fallbackTotalLoops,
                        targetZ: preset ? (Number(preset.zOffset) || 0) : baseWorkingZ,
                    };
                });
            }

            let emittedCount = 0;

            for (let gi = 0; gi < groups.length; gi++) {
                const group = groups[gi];
                const isLastGroup = gi === groups.length - 1;
                // [NEW] 이 색상 그룹 동안만 적용되는 작업 Z (색상 프리셋의 절대 Z)
                settings.workingZ = group.targetZ;

                const totalLoops = group.markTimes;
                for (let loop = 0; loop < totalLoops; loop++) {
                    // [NEW] 반복 패스 구분 헤더 주석
                    if (totalLoops > 1) {
                        gcode.push('');
                        addComment(`// ===== Mark Pass ${loop + 1} / ${totalLoops}${group.color ? ` (${group.color})` : ''} =====`);
                    }
                    for (let index = 0; index < group.objs.length; index++) {
                        const obj: any = group.objs[index];
                        const isLast = isLastGroup && (loop === totalLoops - 1) && (index === group.objs.length - 1);

                        // [FIX] Apply Shape Delay only BETWEEN shapes (very first shape of very first group/pass 제외)
                        if (settings.shapeDelay > 0 && emittedCount > 0) {
                            _pendingShapeDelay = true;
                        }
                        emittedCount++;

                        // [NEW] Object 모드 MatrixRepeater 전용 고속 경로.
                        // getVirtualObjects()(150셀 캡)를 거치지 않고 xCount×yCount를 직접 순회한다.
                        if (isType(obj, 'MatrixRepeater')) {
                            await processMatrixRepeater(obj, isLast, index, group.objs.length, loop, totalLoops);
                            continue;
                        }

                        await processOneObject(obj, isLast, `// Shape ${index + 1}/${group.objs.length} (Pass ${loop + 1}/${totalLoops})`);
                    }
                }
            }

            // [FIX] Return Z to original workingZ if Z-Offset was applied during Matrix/색상 그룹 processing
            settings.workingZ = baseWorkingZ;
            if (_lastZOffset !== settings.workingZ) {
                addComment('// Restore original Z after Matrix processing');
                gcode.push(`G00 Z${fmt(settings.workingZ)}`);
            }

            generateFooter();

            return gcode.join('\n');
        },
        [canvas, getAllObjects]
    );

    return { generateGCode };
};
