import DxfParser from 'dxf-parser';
import * as fabric from 'fabric';
import { useCanvasStore } from '../useCanvasStore';

/**
 * Imports a DXF file and shapes into the Fabric.js canvas.
 * @param canvas The Fabric canvas instance.
 * @param file The DXF file to import.
 * @return 캔버스에 추가된 객체 수 (0 = 지원 엔티티 없음)
 * @throws DXF 파싱 실패 또는 유효 엔티티 부재 시
 */
export const importFromDXF = async (canvas: fabric.Canvas, file: File): Promise<number> => {
    const text = await file.text();
    const parser = new DxfParser();

    try {
        const dxf = parser.parseSync(text);
        if (!dxf || !dxf.entities) {
            throw new Error(`Invalid DXF file or no entities found: ${file.name}`);
        }

        const objects: fabric.Object[] = [];

        dxf.entities.forEach((entity: any) => {
            switch (entity.type) {
                case 'LINE':
                    objects.push(convertLine(entity));
                    break;
                case 'LWPOLYLINE':
                case 'POLYLINE':
                    objects.push(convertPolyline(entity));
                    break;
                case 'CIRCLE':
                    objects.push(convertCircle(entity));
                    break;
                case 'ARC':
                    objects.push(convertArc(entity));
                    break;
                // Add more entity types as needed (e.g., ELLIPSE, SPLINE)
                default:
                    // console.warn(`Unsupported DXF entity type: ${entity.type}`);
                    break;
            }
        });

        if (objects.length > 0) {
            // Add all objects to the canvas
            objects.forEach(obj => {
                // Set some default properties for imported objects
                obj.set({
                    stroke: '#00ff00', // Green for imported DXF
                    strokeWidth: 2 / (canvas.getZoom() || 1), // Adjust stroke width based on zoom? Or fixed.
                    fill: 'transparent',
                    strokeUniform: true
                });
                canvas.add(obj);

                // [FIX] Normalize origin to Center
                // This prevents center-shift when strokeWidth changes (due to Fabric's bounding box logic)
                const center = obj.getCenterPoint();
                obj.set({
                    originX: 'center',
                    originY: 'center',
                    left: center.x,
                    top: center.y
                });
                obj.setCoords();
            });

            // Group them to easily select/move initially? 
            // Or just select them all.
            const selection = new fabric.ActiveSelection(objects, { canvas: canvas });
            canvas.setActiveObject(selection);

            // Center the imported objects exactly at Stage Center (0,0)
            const { pxPerMm } = useCanvasStore.getState();
            selection.set({
                originX: 'center',
                originY: 'center',
                left: 0,
                top: 0,
                scaleX: pxPerMm.x,
                scaleY: pxPerMm.y
            });
            selection.setCoords();

            canvas.requestRenderAll();
        }

        return objects.length;

    } catch (err) {
        console.error('Error parsing DXF file:', err);
        throw err instanceof Error ? err : new Error(String(err));
    }
};

// [P4 FIX] DXF는 Y-up, Fabric 캔버스는 Y-down 좌표계이므로 임포트 시 Y를 반전한다.
// (G-code 생성기의 invertY 및 dxfExport의 toMm과 정합 — 라운드트립/가공 극성 보장)

const convertLine = (entity: any) => {
    // DXF coordinates object {x, y, z}
    // Fabric Line [x1, y1, x2, y2]
    return new fabric.Line(
        [
            entity.vertices[0].x,
            -entity.vertices[0].y,
            entity.vertices[1].x,
            -entity.vertices[1].y
        ],
        {
            strokeUniform: true
        }
    );
};

const convertPolyline = (entity: any) => {
    // LWPOLYLINE / POLYLINE vertices array of {x, y}
    const points = entity.vertices.map((v: any) => ({
        x: v.x,
        y: -v.y
    }));

    // Check if closed
    const isClosed = entity.shape === true || (entity.flags & 1) === 1; // Flag 1 = Closed

    // [FIX] Always use Polyline
    // We previously tried using Polygon for closed shapes, but this triggers 'auto-close' logic
    // in ScannerGenerator which creates unwanted 'stitching' lines on complex shapes (like spirals)
    // that might be flagged as closed but shouldn't have a closing segment.
    return new fabric.Polyline(points, {
        fill: 'transparent',
        stroke: 'black',
        strokeUniform: true
    });
};

const convertCircle = (entity: any) => {
    // Center {x, y}, radius — [P4 FIX] Y반전: centerY → -centerY
    return new fabric.Circle({
        left: entity.center.x - entity.radius,
        top: -entity.center.y - entity.radius,
        radius: entity.radius,
        fill: 'transparent',
        strokeUniform: true
    });
};

const convertArc = (entity: any) => {
    // DXF Arc: center, radius, startAngle (degrees), endAngle (degrees)
    // Fabric doesn't have a native Arc primitive that matches exactly perfectly without using Path.
    // We construct a Path command for the arc.

    const cx = entity.center.x;
    const cy = entity.center.y;
    const r = entity.radius;
    const startAngle = (entity.startAngle * Math.PI) / 180;
    const endAngle = (entity.endAngle * Math.PI) / 180;

    // Calculate start and end points
    // [P4 FIX] Y반전: DXF(Y-up) → Fabric(Y-down) 미러이므로 y = -(cy + r·sin a)
    const startX = cx + r * Math.cos(startAngle);
    const startY = -(cy + r * Math.sin(startAngle));
    const endX = cx + r * Math.cos(endAngle);
    const endY = -(cy + r * Math.sin(endAngle));

    // Large arc flag
    // Determine if the arc is greater than 180 degrees
    let diff = endAngle - startAngle;
    if (diff < 0) {
        diff += 2 * Math.PI;
    }
    const largeArcFlag = diff > Math.PI ? 1 : 0;

    // Sweep flag
    // [P4 FIX] DXF arcs are counter-clockwise(Y-up 기준). Y미러 후에는 방향이 반전되므로 0.
    const sweepFlag = 0;

    // SVG Path Command: M startX startY A rx ry x-axis-rotation large-arc-flag sweep-flag endX endY
    const pathData = `M ${startX} ${startY} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`;

    return new fabric.Path(pathData, {
        fill: 'transparent',
        stroke: 'black',
        strokeUniform: true
    });
};
