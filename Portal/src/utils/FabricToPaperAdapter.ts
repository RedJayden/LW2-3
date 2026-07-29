import * as fabric from 'fabric';
import paper from 'paper';
import { vectorizeText } from './textToPath';

/**
 * @class FabricToPaperAdapter
 * @brief Fabric 객체 → Paper Item 변환 유틸리티 (정적 클래스).
 */
export class FabricToPaperAdapter {
    /**
     * @brief Fabric object 를 Paper.js Item 으로 변환한다.
     * @param fabricObj 변환할 Fabric 객체
     * @param scope 사용할 PaperScope (없으면 global paper 사용)
     * @return 변환된 Paper Item, 변환 불가 시 null
     */
    public static async toPaperItem(
        fabricObj: fabric.FabricObject,
        scope?: paper.PaperScope
    ): Promise<paper.Item | null> {
        let paperItem: paper.Item | null = null;
        const objType = (fabricObj.type || '').toLowerCase();
        const currentScope = scope || paper;

        // --------------------------------------------------
        // 타입별 기본 Geometry 생성
        // --------------------------------------------------
        // [FIX] Fabric v7: instanceof 책크를 우선 사용하여 타입 문자열 불일치 방지
        if (fabricObj instanceof fabric.Rect) {
            paperItem = FabricToPaperAdapter.convertRect(fabricObj as fabric.Rect, currentScope);
        } else if (fabricObj instanceof fabric.Circle) {
            paperItem = FabricToPaperAdapter.convertCircle(fabricObj as fabric.Circle, currentScope);
        } else if (fabricObj instanceof fabric.Ellipse) {
            paperItem = FabricToPaperAdapter.convertEllipse(fabricObj as fabric.Ellipse, currentScope);
        } else if (fabricObj instanceof fabric.Polygon) {
            // Polygon extends Polyline in v7 — Polygon을 먼저 체크!
            paperItem = FabricToPaperAdapter.convertPolygon(fabricObj as fabric.Polygon, currentScope);
        } else if (fabricObj instanceof fabric.Polyline) {
            paperItem = FabricToPaperAdapter.convertPolyline(fabricObj as fabric.Polyline, currentScope);
        } else if (fabricObj instanceof fabric.Path) {
            paperItem = FabricToPaperAdapter.convertPath(fabricObj as fabric.Path, currentScope);
        } else if (fabricObj instanceof fabric.Line) {
            paperItem = FabricToPaperAdapter.convertLine(fabricObj as fabric.Line, currentScope);
        } else if (fabricObj instanceof fabric.Triangle) {
            paperItem = FabricToPaperAdapter.convertTriangle(fabricObj as fabric.Triangle, currentScope);
        } else if (fabricObj instanceof fabric.Image) {
            paperItem = FabricToPaperAdapter.convertImage(fabricObj as fabric.Image, currentScope);
        } else if (fabricObj instanceof fabric.Text || fabricObj instanceof fabric.IText || fabricObj instanceof fabric.Textbox
            || objType === 'text' || objType === 'itext' || objType === 'i-text' || objType === 'textbox'
            || (fabricObj as any).type?.toLowerCase()?.includes('text')) {
            // Text -> Path 변환
            const svgString = await vectorizeText(fabricObj as any);
            if (svgString) {
                currentScope.activate();
                paperItem = currentScope.project.importSVG(svgString, {
                    insert: false,
                    expandShapes: true
                }) as paper.Item;

                // SVG as CompoundPath/Group might need transformation mapping
                // Align visual center
                if (paperItem) {
                    // To properly union overlapping characters while preserving their internal holes (like 'o', 'e')
                    // we can just use the built in Paper.js `unite` on the entire item itself, or just let it be a Group
                    // and unite its children.

                    // If it's a Group, it might contain overlapping cursive letters as well as disjoint letters.
                    // To optimize G-code (hatch letter-by-letter instead of row-by-row across the whole sentence),
                    // we want to merge only the OVERLAPPING paths, and keep disjoint islands as separate children in a Group.
                    if (paperItem instanceof paper.Group) {
                        const newChildren: paper.PathItem[] = [];

                        for (const child of paperItem.children) {
                            if (child instanceof paper.PathItem) {
                                newChildren.push(child.clone({ insert: false }) as paper.PathItem);
                            }
                        }
                        const group = new paper.Group();
                        newChildren.forEach(c => group.addChild(c));
                        paperItem = group;


                    }

                    // We must align the Paper JS group using exactly Fabric's logical offset strategy
                    // Fabric assumes local (0,0) is the center of the bounding box.
                    // But importSVG creates paths relative to the SVG top-left with raw font metrics.
                    // Text paths from vectorizer are now correctly pre-centered onto (0,0) with lineLeft and topOffset applied in textToPath.ts.
                    FabricToPaperAdapter.applyTransform(paperItem, fabricObj);
                }
            }
        } else if (fabricObj.type === 'MatrixRepeater') {
            // Convert MatrixRepeater virtual children to paper.js items and group them
            const repeater = fabricObj as any;
            const virtualObjects = repeater.getVirtualObjects() as fabric.Object[];
            
            currentScope.activate();
            const paperGroup = new paper.Group();
            
            for (const child of virtualObjects) {
                // Apply overrides temporarily during paper conversion
                const r = (child as any).customData?.row;
                const c = (child as any).customData?.col;
                const cellKey = `${r}_${c}`;
                const override = repeater.overrides?.[cellKey];
                
                const originalFill = child.fill;
                const originalStroke = child.stroke;
                const originalFillSettings = (child as any).fillSettings;

                if (override?.fill !== undefined) child.fill = override.fill;
                if (override?.stroke !== undefined) child.stroke = override.stroke;
                if (override?.fillSettings !== undefined) (child as any).fillSettings = override.fillSettings;

                const item = await FabricToPaperAdapter.toPaperItem(child, currentScope as any);
                if (item) {
                    paperGroup.addChild(item);
                }

                // Restore original properties
                child.fill = originalFill;
                child.stroke = originalStroke;
                (child as any).fillSettings = originalFillSettings;
            }
            paperItem = paperGroup;
        } else if (objType === 'group' || fabricObj instanceof fabric.Group) {
            // 그룹은 내부 children 을 재귀적으로 변환
            const children = (fabricObj as fabric.Group).getObjects();
            currentScope.activate();
            const paperGroup = new paper.Group();
            for (const child of children) {
                const item = await FabricToPaperAdapter.toPaperItem(child, currentScope as any);
                if (item) paperGroup.addChild(item);
            }
            paperItem = paperGroup;
        }

        if (!paperItem) {
            return null;
        }

        // --------------------------------------------------
        // Ghosting Technique: strokeWidth 제거
        // --------------------------------------------------
        (paperItem as any).strokeWidth = 0;

        // --------------------------------------------------
        // 타입 메타데이터 설정 (원 vs 타원 판별 포함)
        // --------------------------------------------------
        let type: string = (fabricObj as any).type;

        if (fabricObj instanceof fabric.Circle || fabricObj instanceof fabric.Ellipse) {
            const anyObj: any = fabricObj as any;
            const rx = anyObj.rx ?? ((anyObj.width ?? 0) / 2);
            const ry = anyObj.ry ?? ((anyObj.height ?? 0) / 2);

            const scaleX = fabricObj.scaleX || 1;
            const scaleY = fabricObj.scaleY || 1;

            const effRx = rx * scaleX;
            const effRy = ry * scaleY;

            type = Math.abs(effRx - effRy) < 0.0001 ? 'circle' : 'ellipse';
        }

        const mtx = fabricObj.calcTransformMatrix();
        const decomposed = fabric.util.qrDecompose(mtx);
        const globalAngle = decomposed.angle || 0;

        paperItem.data = {
            ...paperItem.data,
            type,
            original: fabricObj,
            globalAngle: globalAngle
        };

        return paperItem;
    }

    /**
     * @brief Fabric transform matrix 를 Paper Item 에 적용.
     */
    private static applyTransform(item: paper.Item, fabricObj: fabric.FabricObject) {
        // Fabric's calcTransformMatrix() for originX=left maps (0,0) to the Top-Left.
        // But we construct all Paper.js items centered around (0,0).
        // Therefore, we must override the matrix to properly map (0,0) to the physical Canvas Center of the object.
        const center = fabricObj.getCenterPoint();
        const m = fabric.util.composeMatrix({
            translateX: center.x,
            translateY: center.y,
            angle: fabricObj.angle || 0,
            scaleX: fabricObj.scaleX || 1,
            scaleY: fabricObj.scaleY || 1,
        });

        // Fabric: [a, b, c, d, tx, ty]
        // Paper:  Matrix(a, b, c, d, tx, ty) - Standard Canvas/SVG order
        const matrix = new paper.Matrix(m[0], m[1], m[2], m[3], m[4], m[5]);
        (item as any).applyMatrix = false;
        item.matrix = matrix;
    }

    /** Image 변환 */
    private static convertImage(
        image: fabric.Image,
        scope: any
    ): paper.Raster {
        scope.activate();

        // Fabric Image uses 'src' or 'getSrc()'
        const src = image.getSrc ? image.getSrc() : (image as any).src;

        // Create Paper Raster from source
        const paperRaster = new paper.Raster(src);

        // Wait for load if necessary? Paper.Raster usually loads async if it's a URL.
        // However, if it's a Data URL (which we ensured in Toolbar), it might be sync enough or we handle it.
        // Note: Paper.js Raster initialization with src string is asynchronous for loading usually.
        // But for G-Code generation context, we might rely on the image being already loaded in browser cache.
        // Ideally, for immediate export, we might need to handle this. 
        // But `toPaperItem` is synchronous. 

        // Force dimensions to match Fabric's untransformed size
        // Fabric Image size is determined by image.width/height * scale
        // Paper Raster size is determined by loaded image natural size

        // We defer size setting until load? No, existing code expects sync return.
        // If src is Data URL, paper.Raster might load immediately.

        // Set pivot to top-left to match Fabric's default origin logic usually handling
        // But applyTransform handles matrix.
        // Fabric Image center is default origin? No, usually top-left unless changed.

        // IMPORTANT: Paper.js Raster(source) is async. 
        // But we need to return an item.
        // If we use an HTMLImageElement, it's sync if loaded.

        const element = image.getElement();
        if (element) {
            // Use the underlying HTMLImageElement/HTMLCanvasElement which is already loaded
            const pRaster = new paper.Raster(element as any);
            FabricToPaperAdapter.applyTransform(pRaster, image);
            return pRaster;
        }

        // Fallback if element missing
        const pRaster = new paper.Raster(src);
        FabricToPaperAdapter.applyTransform(pRaster, image);
        return pRaster;
    }

    /** Rect 변환 */
    private static convertRect(
        rect: fabric.Rect,
        scope: any
    ): paper.Path.Rectangle {
        const width = rect.width || 0;
        const height = rect.height || 0;

        scope.activate();
        const paperRect = new paper.Path.Rectangle({
            point: [-width / 2, -height / 2],
            size: [width, height],
            insert: false
        });

        FabricToPaperAdapter.applyTransform(paperRect, rect);
        paperRect.data = { ...paperRect.data, isNativeProfile: true, nativeType: 'RECT', nativeWidth: width, nativeHeight: height };
        return paperRect;
    }

    /** Circle 변환 (원 & 아크) */
    private static convertCircle(
        circle: fabric.Circle,
        scope: any
    ): paper.Path {
        const radius = circle.radius || 0;
        // [FIX-C] ?? 사용: || 는 0을 falsy로 취급하여 endAngle=0 → 360 오변환 발생
        const startAngle = circle.startAngle ?? 0;
        const endAngle = circle.endAngle ?? 360;

        // [FIX-C] 360도 경계 정규화: displayEndDeg += 360 에 의해 endAngle이 360 초과 가능
        const span = Math.abs(endAngle - startAngle) % 360;
        const isFullCircle = span < 0.001; // span이 0 또는 360의 배수 = 풀서클
        console.log('[FabricToPaper] convertCircle:', { startAngle, endAngle, span, isFullCircle, radius });

        scope.activate();

        let paperItem: paper.Path;

        if (isFullCircle) {
            paperItem = new paper.Path.Ellipse({
                center: [0, 0],
                radius: [radius, radius],
                insert: false
            });
        } else {
            // Arc Case: manually construct arc
            // Fabric Arcs: Center(0,0) + Radius. Angles in Degrees.
            // Convert to Local Points for Paper
            const startRad = (startAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;

            const startX = Math.cos(startRad) * radius;
            const startY = Math.sin(startRad) * radius;

            const endX = Math.cos(endRad) * radius;
            const endY = Math.sin(endRad) * radius;

            // Through point? Paper Path.Arc needs "from, through, to"
            // Let's use start + (end-start)/2
            // Careful with crossing 360.
            const diffRad = endRad - startRad;
            const midRad = startRad + diffRad / 2;

            const midX = Math.cos(midRad) * radius;
            const midY = Math.sin(midRad) * radius;

            paperItem = new paper.Path.Arc(
                new paper.Point(startX, startY),
                new paper.Point(midX, midY),
                new paper.Point(endX, endY)
            );
            (paperItem as any).insert = false;
            // Arc defaults might assume closed? No, Path.Arc(from, through, to) is open usually.
            paperItem.closed = false;
        }

        FabricToPaperAdapter.applyTransform(paperItem, circle);
        paperItem.data = { ...paperItem.data, isNativeProfile: true, nativeType: isFullCircle ? 'CIRCLE' : 'ARC', startAngle, endAngle, nativeRadius: radius };
        return paperItem;
    }

    /** Ellipse 변환 (rx, ry 사용) */
    private static convertEllipse(
        ellipse: fabric.Ellipse,
        scope: any
    ): paper.Path.Ellipse {
        const anyObj: any = ellipse as any;
        const rx = anyObj.rx ?? ((anyObj.width ?? 0) / 2);
        const ry = anyObj.ry ?? ((anyObj.height ?? 0) / 2);

        scope.activate();
        const paperEllipse = new paper.Path.Ellipse({
            center: [0, 0],
            radius: [rx, ry],
            insert: false
        });

        FabricToPaperAdapter.applyTransform(paperEllipse, ellipse);
        paperEllipse.data = { ...paperEllipse.data, isNativeProfile: true, nativeType: 'ELLIPSE', nativeRx: rx, nativeRy: ry };
        return paperEllipse;
    }

    /** Polyline 변환 */
    private static convertPolyline(
        polyline: fabric.Polyline,
        scope: any
    ): paper.Path {
        const points = polyline.points || [];
        const pathOffset = (polyline as any).pathOffset || { x: 0, y: 0 };

        scope.activate();
        const paperPoints = points.map(
            p => new paper.Point(p.x - pathOffset.x, p.y - pathOffset.y)
        );

        const paperPath = new paper.Path({
            segments: paperPoints,
            closed: false,
            insert: false
        });

        FabricToPaperAdapter.applyTransform(paperPath, polyline);
        return paperPath;
    }

    /** Polygon 변환 */
    private static convertPolygon(
        polygon: fabric.Polygon,
        scope: any
    ): paper.Path {
        const points = polygon.points || [];
        const pathOffset = (polygon as any).pathOffset || { x: 0, y: 0 };

        scope.activate();
        const paperPoints = points.map(
            p => new paper.Point(p.x - pathOffset.x, p.y - pathOffset.y)
        );

        const paperPath = new paper.Path({
            segments: paperPoints,
            closed: true,
            insert: false
        });

        FabricToPaperAdapter.applyTransform(paperPath, polygon);
        return paperPath;
    }

    /** Fabric Path → Paper Path */
    private static convertPath(
        path: fabric.Path,
        scope: any
    ): paper.Item {
        scope.activate();
        
        // [FIX] Use CompoundPath to prevent straight-line bridging between disjoint segments (M commands).
        const pathData = (path as any).path?.map((seg: any) => seg.join(' ')).join(' ');
        const item = new paper.CompoundPath({
            pathData: pathData,
            insert: false
        });

        // [FIX] Account for pathOffset to prevent double-translation misplacement.
        // Fabric offsets raw SVG paths. We must negate this before applying its external matrix.
        const pathOffset = (path as any).pathOffset || { x: 0, y: 0 };
        if (pathOffset.x !== 0 || pathOffset.y !== 0) {
            item.translate(new paper.Point(-pathOffset.x, -pathOffset.y));
        }

        FabricToPaperAdapter.applyTransform(item, path);
        return item;
    }

    /** Line 변환 */
    private static convertLine(
        line: fabric.Line,
        scope: any
    ): paper.Path {
        // [FIX] Use calcLinePoints() to get precise coordinate points regardless of strokeWidth and rotation.
        // Fabric.Line handles its own internal origin offset perfectly with this method.
        const points = line.calcLinePoints();
        const matrix = line.calcTransformMatrix();
        console.log('[FabricToPaper] convertLine:', {
            calcLinePoints: points,
            center: line.getCenterPoint(),
            left: line.left, top: line.top,
            angle: line.angle,
            matrix: `[${matrix.map(v => v.toFixed(4)).join(', ')}]`
        });

        scope.activate();
        const paperLine = new paper.Path.Line(
            new paper.Point(points.x1, points.y1),
            new paper.Point(points.x2, points.y2)
        );

        (paperLine as any).insert = false;
        FabricToPaperAdapter.applyTransform(paperLine, line);
        return paperLine;
    }

    /** Triangle 변환 */
    private static convertTriangle(
        triangle: fabric.Triangle,
        scope: any
    ): paper.Path {
        const width = triangle.width || 0;
        const height = triangle.height || 0;

        scope.activate();
        const p1 = new paper.Point(0, -height / 2);
        const p2 = new paper.Point(-width / 2, height / 2);
        const p3 = new paper.Point(width / 2, height / 2);

        const paperTriangle = new paper.Path({
            segments: [p1, p2, p3],
            closed: true,
            insert: false
        });

        FabricToPaperAdapter.applyTransform(paperTriangle, triangle);
        return paperTriangle;
    }
}
