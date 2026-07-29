/**
 * @file dxfExport.ts
 * @brief Fabric 캔버스 → DXF R12 (AC1009) ASCII 내보내기.
 *
 * 좌표 규약은 G-code 생성기(useGCodeGenerator)와 동일하다:
 *   원점 = 스테이지 중심 (fabric (0,0)), mm = px / pxPerMm, Y반전(invertY).
 * DXF는 mm 단위 · Y-up 이므로 mmY = -pxY / pxPerMm.y 로 변환한다.
 *
 * 엔티티 정책 (P4-b 네이티브 승격):
 *   line               → LINE
 *   circle(균일 스케일) → CIRCLE / ARC
 *   rect / triangle    → POLYLINE (closed)
 *   polyline / polygon → POLYLINE
 *   그 외(path/ellipse/text/group/MatrixRepeater 등)
 *                      → FabricToPaperAdapter 평탄화 후 POLYLINE (P4-a)
 *   raster image       → skip (벡터 아님)
 *
 * @note R12 호환성을 위해 LWPOLYLINE(R14+) 대신 POLYLINE/VERTEX/SEQEND를 사용한다.
 *       자체 임포터(dxfImport.ts)가 POLYLINE을 지원하므로 라운드트립이 보장된다.
 *
 * @pattern Strategy + Builder — exportCanvas 레지스트리의 DXF 전략이며,
 *          DxfBuilder가 DXF group code 직렬화를 담당한다.
 */
import * as fabric from 'fabric';
import paper from 'paper';
import { FabricToPaperAdapter } from '../../../../../utils/FabricToPaperAdapter';
import { useCanvasStore } from '../useCanvasStore';

interface Vec2 { x: number; y: number; }

/** @brief 곡선 평탄화 허용 오차 (mm) — G-code 정밀도(1µm) 대비 여유 있는 5µm */
const FLATTEN_TOLERANCE_MM = 0.005;

/**
 * @class DxfBuilder
 * @brief DXF R12 ASCII 문서 조립기 (Builder 패턴).
 *        엔티티 append 후 build()로 HEADER/ENTITIES/EOF 골격을 완성한다.
 */
class DxfBuilder {
    private readonly entities: string[] = [];
    private entityCount = 0;

    /** @return 지금까지 추가된 엔티티 수 */
    public get count(): number { return this.entityCount; }

    /** 좌표값 포맷 (1µm = 0.001mm → 소수 5자리면 충분) */
    private fmt(n: number): string { return n.toFixed(5); }

    private push(code: number, value: string): void {
        this.entities.push(String(code), value);
    }
    private pushNum(code: number, value: number): void {
        this.push(code, this.fmt(value));
    }
    private pushInt(code: number, value: number): void {
        this.push(code, String(Math.trunc(value)));
    }

    /** @brief LINE 엔티티 추가 */
    public addLine(p1: Vec2, p2: Vec2): void {
        this.push(0, 'LINE');
        this.push(8, '0');
        this.pushNum(10, p1.x); this.pushNum(20, p1.y);
        this.pushNum(11, p2.x); this.pushNum(21, p2.y);
        this.entityCount++;
    }

    /** @brief CIRCLE 엔티티 추가 */
    public addCircle(center: Vec2, radius: number): void {
        this.push(0, 'CIRCLE');
        this.push(8, '0');
        this.pushNum(10, center.x); this.pushNum(20, center.y);
        this.pushNum(40, radius);
        this.entityCount++;
    }

    /** @brief ARC 엔티티 추가 (DXF: CCW, 도 단위) */
    public addArc(center: Vec2, radius: number, startDeg: number, endDeg: number): void {
        this.push(0, 'ARC');
        this.push(8, '0');
        this.pushNum(10, center.x); this.pushNum(20, center.y);
        this.pushNum(40, radius);
        this.pushNum(50, startDeg);
        this.pushNum(51, endDeg);
        this.entityCount++;
    }

    /** @brief POLYLINE/VERTEX/SEQEND 엔티티 추가 (R12 호환) */
    public addPolyline(points: Vec2[], closed: boolean): void {
        if (points.length < 2) return;
        this.push(0, 'POLYLINE');
        this.push(8, '0');
        this.pushInt(66, 1); // vertices follow
        this.pushInt(70, closed ? 1 : 0);
        for (const p of points) {
            this.push(0, 'VERTEX');
            this.push(8, '0');
            this.pushNum(10, p.x); this.pushNum(20, p.y);
        }
        this.push(0, 'SEQEND');
        this.push(8, '0');
        this.entityCount++;
    }

    /** @brief HEADER/ENTITIES/EOF 골격을 포함한 완성 DXF 문자열 반환 (CRLF) */
    public build(): string {
        const doc: string[] = [
            '0', 'SECTION', '2', 'HEADER',
            '9', '$ACADVER', '1', 'AC1009',
            '9', '$INSUNITS', '70', '4',      // 4 = millimeters
            '9', '$MEASUREMENT', '70', '1',   // 1 = metric
            '0', 'ENDSEC',
            '0', 'SECTION', '2', 'ENTITIES',
            ...this.entities,
            '0', 'ENDSEC',
            '0', 'EOF',
        ];
        // CRLF: 일부 구형 CAD 호환
        return doc.join('\r\n') + '\r\n';
    }
}

/** @brief 디자인 객체 필터 — Paper/Grid/Guide/측정 오버레이 등 비가공 객체 제외 */
const isDesignObject = (obj: any): boolean =>
    obj.visible !== false &&
    !obj.isPaper && !obj.isGridLine && !obj.isGuide && !obj.isTemp &&
    !obj.isMeasurement && !obj.isCrosshair && !obj.isProcessingMarker &&
    !obj.excludeFromExport;

export interface DxfExportResult {
    /** 완성된 DXF ASCII 문자열 */
    data: string;
    /** 출력된 DXF 엔티티 수 */
    entityCount: number;
    /** 벡터가 아니어서 건너뛴 raster 이미지 수 */
    skippedImages: number;
}

/**
 * @brief 캔버스의 디자인 객체들을 DXF R12 문자열로 직렬화한다.
 * @param canvas Fabric 캔버스 인스턴스
 * @return DXF 문자열 + 엔티티/스킵 통계
 */
export const generateDXF = async (canvas: fabric.Canvas): Promise<DxfExportResult> => {
    const { pxPerMm } = useCanvasStore.getState();

    // Fabric px(Y-down, 원점=스테이지 중심) → DXF mm(Y-up)
    const toMm = (x: number, y: number): Vec2 => ({ x: x / pxPerMm.x, y: -y / pxPerMm.y });

    const builder = new DxfBuilder();

    // Paper.js 전용 스코프 (전역 프로젝트 오염 방지)
    const scope = new paper.PaperScope();
    scope.setup(new paper.Size(8, 8));

    let skippedImages = 0;

    /** Paper Item 트리를 순회하며 Path를 평탄화 → POLYLINE 출력 */
    const emitPaperItem = (item: paper.Item): void => {
        if (item instanceof paper.Raster) {
            skippedImages++;
            return;
        }
        if (item instanceof paper.Path) {
            try {
                item.flatten(FLATTEN_TOLERANCE_MM * pxPerMm.x);
            } catch {
                /* 빈/퇴화 경로는 무시 */
            }
            const pts = item.segments.map(s => toMm(s.point.x, s.point.y));
            if (pts.length >= 2) builder.addPolyline(pts, item.closed === true);
            return;
        }
        // CompoundPath / Group: 자식 재귀
        const children = (item as any).children as paper.Item[] | undefined;
        if (children) [...children].forEach(emitPaperItem);
    };

    /** 복잡 도형 경로: G-code와 동일하게 Paper.js 변환 → transform bake → 평탄화 */
    const emitViaPaper = async (obj: fabric.FabricObject): Promise<void> => {
        const item = await FabricToPaperAdapter.toPaperItem(obj, scope);
        if (!item) return;

        const clone = item.clone() as paper.Item;
        const bake = (itm: paper.Item): void => {
            if (itm instanceof paper.Raster) return;
            (itm as any).applyMatrix = true;
            const kids = (itm as any).children as paper.Item[] | undefined;
            if (kids) kids.forEach(bake);
        };
        bake(clone);
        emitPaperItem(clone);
        clone.remove();
        item.remove();
    };

    /** 객체 로컬 좌표 → transform 적용 → mm 변환 */
    const transformLocalPoint = (obj: fabric.FabricObject, p: Vec2): Vec2 => {
        const m = obj.calcTransformMatrix();
        const tp = fabric.util.transformPoint(new fabric.Point(p.x, p.y), m);
        return toMm(tp.x, tp.y);
    };

    /** 네이티브 CIRCLE/ARC 승격 가능 여부 (균일 스케일 & 미러 없음) */
    const isUniform = (obj: fabric.FabricObject): boolean => {
        const sx = Math.abs(obj.scaleX || 1);
        const sy = Math.abs(obj.scaleY || 1);
        return Math.abs(sx - sy) < 0.05 && !obj.flipX && !obj.flipY;
    };

    const emitObject = async (obj: fabric.FabricObject): Promise<void> => {
        const type = (obj.type || '').toLowerCase();

        // raster는 벡터가 아니므로 skip (외곽선 벡터화는 G-code 전용 파이프라인)
        if (type === 'image') {
            skippedImages++;
            return;
        }

        // ---------- P4-b: 네이티브 엔티티 승격 ----------
        if (type === 'line') {
            const pts = (obj as fabric.Line).calcLinePoints();
            builder.addLine(
                transformLocalPoint(obj, { x: pts.x1, y: pts.y1 }),
                transformLocalPoint(obj, { x: pts.x2, y: pts.y2 })
            );
            return;
        }

        if (type === 'circle' && isUniform(obj)) {
            const circle = obj as fabric.Circle;
            const radiusMm = ((circle.radius || 0) * Math.abs(circle.scaleX || 1)) / pxPerMm.x;
            const center = circle.getCenterPoint();
            const c = toMm(center.x, center.y);

            // [FIX-C 참조] ?? 사용: || 는 endAngle=0을 360으로 오변환
            const startAngle = circle.startAngle ?? 0;
            const endAngle = circle.endAngle ?? 360;
            const span = Math.abs(endAngle - startAngle) % 360;

            if (span < 0.001) {
                builder.addCircle(c, radiusMm);
            } else {
                // 화면(Y-down, CW+) → DXF(Y-up, CCW+) 변환:
                //   dxfStart = -(fabricEnd + θ), dxfEnd = -(fabricStart + θ)
                // (Y미러로 방향이 반전되므로 시작/끝 각도가 교차한다)
                const theta = fabric.util.qrDecompose(obj.calcTransformMatrix()).angle || 0;
                const norm = (a: number) => ((a % 360) + 360) % 360;
                builder.addArc(c, radiusMm, norm(-(endAngle + theta)), norm(-(startAngle + theta)));
            }
            return;
        }

        if (type === 'rect' && !(obj as fabric.Rect).rx && !(obj as fabric.Rect).ry) {
            // getCoords(): 회전/스케일 반영된 절대 코너 [tl, tr, br, bl]
            const corners = obj.getCoords();
            builder.addPolyline(corners.map(p => toMm(p.x, p.y)), true);
            return;
        }

        if (type === 'triangle') {
            const w = obj.width || 0;
            const h = obj.height || 0;
            const local: Vec2[] = [
                { x: 0, y: -h / 2 },
                { x: -w / 2, y: h / 2 },
                { x: w / 2, y: h / 2 },
            ];
            builder.addPolyline(local.map(p => transformLocalPoint(obj, p)), true);
            return;
        }

        if (type === 'polyline' || type === 'polygon') {
            const poly = obj as fabric.Polyline;
            const pathOffset = (poly as any).pathOffset || { x: 0, y: 0 };
            const pts = (poly.points || []).map(p =>
                transformLocalPoint(obj, { x: p.x - pathOffset.x, y: p.y - pathOffset.y }));
            if (pts.length >= 2) builder.addPolyline(pts, type === 'polygon');
            return;
        }

        // ---------- P4-a: 복잡 도형 평탄화 ----------
        await emitViaPaper(obj);
    };

    for (const obj of canvas.getObjects().filter(isDesignObject)) {
        await emitObject(obj);
    }

    return { data: builder.build(), entityCount: builder.count, skippedImages };
};
