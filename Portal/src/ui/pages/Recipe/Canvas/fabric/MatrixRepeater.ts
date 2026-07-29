import * as fabric from 'fabric';
import { useAppStore } from '../../../../../store/appStore';
import { resolveObjectColorHex } from '../../../../../utils/colorUtils';

/**
 * sourceObjects 각 항목을 직렬화할 때 함께 저장할 커스텀 속성 화이트리스트.
 * RecipeCanvas.tsx의 캔버스 최상위 저장 화이트리스트와 동일하게 맞춰
 * 복원 후에도 동일한 커스텀 동작(Dot markPointTime, isConstantSize 등)이 유지되도록 한다.
 */
const MATRIX_SOURCE_OBJECT_PROPS = [
    'id', 'name', 'selectable', 'evented', 'lockScalingX', 'lockScalingY', 'lockRotation',
    'hasControls', 'subTargetCheck', 'fill', 'stroke', 'strokeWidth', 'isHairline',
    'strokeUniform', 'originX', 'originY', 'markPointTime', 'fillEnabled', 'strokeEnabled',
    'fillOpacity', 'fillSettings', 'customData'
];

/**
 * 셀 인덱스/Z-info 라벨 칩 스타일 상수 (MatrixLabelUX.md — 전부 "화면 px" 단위).
 * drawCellLabel()이 ctx.scale(1/zoom) 이후에 사용하므로 줌과 무관하게 화면상 크기가 고정된다.
 */
const LABEL_FONT_MIN = 11;          // 폰트 하한(축소 시에도 이 미만으로 안 줄어듦)
const LABEL_FONT_MAX = 22;          // 폰트 상한(초확대 시 화면 점유 방지)
const LABEL_ACTIVE_FONT_BONUS = 2;  // 활성 셀 강조 가산
const LABEL_PAD_X = 6;              // 칩 좌우 패딩
const LABEL_PAD_Y = 3;              // 칩 상하 패딩
const LABEL_RADIUS = 4;             // 칩 모서리 반경
const LABEL_DOT_RADIUS = 3;         // 레이어색 액센트 색점 반경
const LABEL_GAP = 4;                // 셀 상단과 칩 사이 간격
const LABEL_LOD_MIN_PITCH = 32;     // 화면상 셀 피치가 이 미만이면 일반 셀 라벨 생략(LOD)
const LABEL_MAX_PER_FRAME = 300;    // 프레임당 라벨 상한(성능 가드)
const LABEL_BG = 'rgba(17, 24, 39, 0.78)';   // 칩 배경(반투명 다크 — 카메라 영상 대비 보장)
const LABEL_TEXT = '#F1F5F9';                 // 일반 텍스트(근백색)
const LABEL_ACTIVE_TEXT = '#0B1220';          // 활성 셀 텍스트(액센트 칩 위 다크 반전)

/** @brief 라운드 사각형 경로 생성(구형 CEF 호환을 위해 ctx.roundRect 대신 arcTo로 직접 구성) */
function traceRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

export interface MatrixOverride {
    xOffset?: number;
    yOffset?: number;
    /** 셀별 상대 Z 오프셋(mm). 매트릭스 전체의 누적 Z(zStep × 셀 인덱스) 위에 추가로 더해진다. */
    zOffset?: number;
    /** 셀별 크기 override. 소스 오브젝트의 "자연" scaleX/scaleY 대비 상대 배율(1 = 원본 크기). */
    scaleX?: number;
    scaleY?: number;
    markTime?: number;
    visible?: boolean;
}

export interface MatrixRepeaterOptions extends fabric.GroupProps {
    sourceObjects: fabric.Object[];
    xCount: number;
    yCount: number;
    xSpacing: number; // in mm, wait we need px
    ySpacing: number; // in px
    zStep?: number;
    isZigzag?: boolean;
    overrides?: Record<string, MatrixOverride>;
    pxPerMm?: { x: number, y: number };
    /** true면 화면에 보이는 셀 위에 (row,col)과 절대 Z 값을 라벨로 그린다 */
    showLabels?: boolean;
}

export class MatrixRepeater extends fabric.Group {
    static type = 'MatrixRepeater';
    public type = 'MatrixRepeater';

    public sourceObjects: fabric.Object[];
    public xCount: number;
    public yCount: number;
    public xSpacing: number; // px
    public ySpacing: number; // px
    public zStep: number;
    public isZigzag: boolean;
    public overrides: Record<string, MatrixOverride>;
    public pxPerMm: { x: number, y: number };
    public showLabels: boolean;
    public activeCell: { row: number, col: number } | null = null;

    /** 단일 소스 오브젝트 묶음의 축정렬 경계상자 좌상단(local) 및 크기 — updateBoundingBox()에서 갱신 */
    private _srcMinX = 0;
    private _srcMinY = 0;
    private sourceWidth = 0;
    private sourceHeight = 0;

    /**
     * override(xOffset/yOffset/scaleX/scaleY)로 인해 명목 그리드보다 바운딩 박스가 확장된 만큼의
     * 오프셋(항상 ≤0). updateBoundingBox()가 `left/top`을 보정할 때 및 drawObject()가 셀을
     * 중앙 정렬된 로컬 좌표로 배치할 때 함께 사용해, "명목 그리드의 scene 위치는 그대로 두고
     * 바운딩 박스만 확장"되도록 한다.
     */
    private _boundsOffsetX = 0;
    private _boundsOffsetY = 0;

    /** [Design Pattern: Flyweight] override/활성 셀이 아닌 동일 외형의 셀은 이 비트맵을 blit해 재사용한다 */
    private _matrixCellBitmap: HTMLCanvasElement | null = null;
    private _matrixCellBitmapKey = '';

    private _virtualObjectsCache: fabric.Object[] = [];
    private _lastCacheKey: string = '';

    /** 라벨 measureText 결과 캐시 (key: `font|text` → 폭 px). 프레임당 재측정 방지용 */
    private _labelMetricsCache = new Map<string, number>();
    /** 라벨 액센트 색(레이어색) 캐시 — resolveObjectColorHex의 leaf 재귀 해석을 프레임마다 반복하지 않기 위함 */
    private _labelAccentColor: string | null = null;

    /**
     * @brief 배열 개수를 1~100으로 강제하는 방어 클램프.
     * @details 다이얼로그 입력은 이미 100으로 clamp되지만, 저장 레시피 로드(fromObject →
     *          생성자)·스토어 직접 설정 등 다이얼로그를 우회하는 진입점에서 100 초과 값이
     *          유입되면 1만 셀 초과 렌더/가공 폭주로 이어질 수 있어 최종 방어선을 여기에 둔다.
     */
    public static clampCount(n: unknown): number {
        const v = Math.floor(Number(n) || 1);
        return Math.min(100, Math.max(1, v));
    }

    constructor(options: MatrixRepeaterOptions) {
        // Group is instantiated empty because we draw sourceObjects manually
        super([], options);
        this.sourceObjects = options.sourceObjects || [];
        this.xCount = MatrixRepeater.clampCount(options.xCount);
        this.yCount = MatrixRepeater.clampCount(options.yCount);
        this.xSpacing = options.xSpacing || 0;
        this.ySpacing = options.ySpacing || 0;
        this.zStep = options.zStep || 0;
        this.isZigzag = options.isZigzag || false;
        this.overrides = options.overrides || {};
        this.pxPerMm = options.pxPerMm || { x: 1, y: 1 };
        this.showLabels = options.showLabels || false;

        // Disable controls and target finding for performance
        this.hasControls = false;
        this.hasBorders = true; // show border for the whole matrix?
        this.perPixelTargetFind = false;
        this.objectCaching = false; // [FIX] GPU cache limit issue and empty render

        this.updateBoundingBox();

        this.on('mousedown', this.handleMouseDown.bind(this));
    }

    public isOnScreen(): boolean {
        return true;
    }

    public isNotVisible() {
        return this.visible === false || this.opacity === 0;
    }

    /**
     * @brief 셀의 절대 Z 값(현재 모션 Z + 매트릭스 누적 zStep + 셀별 zOffset override)을 계산한다.
     * @details [Design Pattern: 없음, 단일 진실 공급원] 캔버스 Z-info 라벨, CanvasTopBar의
     *          Cell Z-Offset 필드, ScannerGenerator/useGCodeGenerator의 실제 Z_MOVE 커맨드 생성이
     *          모두 이 공식을 공유해야 서로 다른 값을 보여주는 불일치를 방지할 수 있다.
     * @param cellIndex 셀의 순번(0-based). zStep 누적 계산에 쓰이는 인덱스(생성 순서 기준).
     * @param override 해당 셀의 override(zOffset 사용, 없으면 0)
     * @param liveZ 기준 Z(mm) — 호출부에서 현재 모션 Z(또는 가공 시작 시점 Z) 등을 전달
     * @return 절대 Z(mm)
     */
    public computeAbsoluteZ(cellIndex: number, override: MatrixOverride | undefined, liveZ: number): number {
        return liveZ + (this.zStep * cellIndex) + (override?.zOffset || 0);
    }

    /**
     * @brief 특정 셀(row,col)의 소스 오브젝트 원점이 놓이는 scene 좌표(px)를 계산한다.
     * @details [Design Pattern: 없음, 단일 진실 공급원] `this.left/top`은 updateBoundingBox()가
     *          override로 확장된 바운딩 박스에 맞춰 보정한 값(`_boundsOffsetX/Y`만큼 이동)이므로,
     *          `repeater.left + col*xSpacing + ...`처럼 직접 계산하면 override가 있을 때 어긋난다.
     *          CanvasTopBar 등 외부에서 셀 위치를 표시/역산할 때는 반드시 이 메서드를 통해
     *          drawObject()의 배치 공식과 일치시켜야 한다.
     * @param row 셀 행(0-based)
     * @param col 셀 열(0-based, zigzag 반전이 이미 적용된 실제 열 인덱스)
     * @param override 해당 셀의 override(xOffset/yOffset 사용)
     * @return scene 좌표계 기준 셀 원점 {x, y} (px)
     */
    public getCellSceneOrigin(row: number, col: number, override?: MatrixOverride): { x: number; y: number } {
        const xSpc = isNaN(this.xSpacing) ? 0 : this.xSpacing;
        const ySpc = isNaN(this.ySpacing) ? 0 : this.ySpacing;
        const nominalLeft = (this.left || 0) - (this._boundsOffsetX || 0);
        const nominalTop = (this.top || 0) - (this._boundsOffsetY || 0);
        return {
            x: nominalLeft + col * xSpc + (override?.xOffset || 0),
            y: nominalTop + row * ySpc + (override?.yOffset || 0)
        };
    }

    /**
     * @brief MatrixRepeater를 JSON으로 직렬화한다(캔버스 저장/스코프 전환/레시피 저장에 사용).
     * @details [Design Pattern: 없음 — Fabric.js 커스텀 클래스 직렬화 관례] 생성자가
     *          `super([], options)`로 호출되어 Fabric이 인식하는 실제 그룹 자식은 항상 비어있고,
     *          렌더링에 쓰는 `sourceObjects`는 별도의 커스텀 배열이라 기본 `toObject()`는 이를
     *          전혀 저장하지 않는다. xCount/yCount 등 커스텀 스칼라 속성과 함께, sourceObjects는
     *          각 오브젝트 자신의 `toObject()`를 호출해 완전한 plain-object 배열로 변환해 포함시킨다.
     * @param propertiesToInclude 호출부(canvas.toObject 등)가 요청한 추가 속성 목록
     * @return 직렬화된 plain object (fromObject()로 복원 가능)
     */
    toObject(propertiesToInclude: any[] = []): any {
        const base = super.toObject([
            ...propertiesToInclude,
            'xCount', 'yCount', 'xSpacing', 'ySpacing', 'zStep', 'isZigzag',
            'overrides', 'pxPerMm', 'showLabels', 'customData'
        ] as any);
        return {
            ...base,
            sourceObjects: this.sourceObjects.map(o => o.toObject(MATRIX_SOURCE_OBJECT_PROPS))
        };
    }

    /**
     * @brief 직렬화된 JSON으로부터 MatrixRepeater 인스턴스를 복원한다.
     * @details [Design Pattern: 없음 — Fabric.js 커스텀 클래스 직렬화 관례] 커스텀 fromObject가
     *          없으면 부모 클래스 `fabric.Group`의 정적 `fromObject`가 상속되어 실행되는데,
     *          Group의 구현은 `new this(objects, options)`(자식 배열, 옵션 두 인자)로 생성자를
     *          호출한다. 이 클래스의 생성자는 `constructor(options: MatrixRepeaterOptions)`
     *          단일 인자만 받으므로 완전히 어긋난 인자가 전달되어 `xCount=1, yCount=1,
     *          sourceObjects=[]`인 빈 껍데기로 복원되던 버그(페이지 이동/저장-불러오기 후
     *          매트릭스가 사라지는 원인)가 있었다. 이 오버라이드는 실제 생성자 시그니처(단일
     *          options 객체)와 정확히 맞춰 호출한다.
     * @param object toObject()가 생성한 plain object
     * @return 복원된 MatrixRepeater 인스턴스로 resolve되는 Promise
     */
    static async fromObject(object: any): Promise<MatrixRepeater> {
        // [FIX] fabric.Group.toObject()가 함께 직렬화하는 `layoutManager`/`objects`/`type`은
        // 순수 plain object(실제 동작하는 인스턴스가 아님)라서 그대로 생성자에 넘기면
        // groupInit() 내부의 `this.layoutManager.performLayout(...)` 호출이
        // "performLayout is not a function"으로 크래시한다. Fabric 자신의 Group.fromObject도
        // 이 필드들을 제거하고 생성자에는 넘기지 않은 뒤(생성자 기본값 `new LayoutManager()`가
        // 적용되도록), 필요하면 생성 "후"에만 layoutManager를 재구성한다. 이 클래스는 자체
        // layoutManager를 쓰지 않으므로 단순히 제거만 하면 생성자의 기본 폴백으로 충분하다.
        const { layoutManager, objects, type, ...rest } = object;
        const sourceObjects = object.sourceObjects?.length
            ? await fabric.util.enlivenObjects(object.sourceObjects)
            : [];
        return new MatrixRepeater({
            ...rest,
            sourceObjects
        });
    }

    private handleMouseDown(opt: any) {
        if (!this.canvas) return;
        const pointer = this.canvas.getScenePoint(opt.e);

        // Calculate local point. Assuming origin is top-left and no complex rotation/scale for now.
        // For full accuracy, use fabric.util.invertTransform
        const vpt = this.canvas.viewportTransform;
        if (!vpt) return;

        const invTransform = fabric.util.invertTransform(this.calcTransformMatrix());
        const localPoint = fabric.util.transformPoint(pointer, invTransform);

        // Since origin is left/top, localPoint is exactly x,y from top-left
        const x = localPoint.x;
        const y = localPoint.y;

        // The object is drawn at dx, dy. Let's find the nearest grid point
        const col = this.xSpacing > 0 ? Math.round(x / this.xSpacing) : 0;
        const row = this.ySpacing > 0 ? Math.round(y / this.ySpacing) : 0;

        if (col >= 0 && col < this.xCount && row >= 0 && row < this.yCount) {
            this.activeCell = { row, col };
            this.canvas.requestRenderAll();

            // Fire event so React UI can update Right Panel
            this.canvas.fire('matrix:cell:selected', {
                target: this,
                row, col,
                cellKey: `${row}_${col}`,
                override: this.overrides[`${row}_${col}`]
            });
        } else {
            this.activeCell = null;
            this.canvas.requestRenderAll();
            this.canvas.fire('matrix:cell:deselected', { target: this });
        }
    }

    /**
     * @brief 명목(override 없는) 그리드 범위 + 모든 위치/크기 override를 포함하도록 바운딩 박스를 재계산한다.
     * @details [Design Pattern: 없음] override(xOffset/yOffset/scaleX/scaleY)로 인해 셀이 명목
     *          그리드 밖으로 나가면, Fabric의 선택 테두리(hasBorders)가 이를 반영하지 못해
     *          "선택 영역을 벗어나 표시되는" 것처럼 보이는 버그가 있었다. 이제 override를 포함한
     *          실제 확장 범위(extMinX/Y ~ extMaxX/Y)로 width/height를 넓히되, `left/top`을
     *          함께 보정해 명목 그리드(override 없는 원래 배치)의 scene 위치는 그대로 유지한다.
     *          `left/top`의 "이전에 적용된 오프셋"을 역산해 원상태를 복원한 뒤 새 오프셋을
     *          다시 적용하는 방식이라, 드래그 이동/스냅숏 복원 등 어떤 경로로 left/top이
     *          바뀌었든 항상 멱등(idempotent)하게 동작한다.
     */
    public updateBoundingBox() {
        if (this.sourceObjects.length === 0) return;

        // Calculate the bounding box of a single source object/group
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        this.sourceObjects.forEach(obj => {
            // [FIX 2026-07-23] getBoundingRect()는 fabric v7에서 캐시된 aCoords를 그대로 사용한다.
            // 외부 코드(가공 커맨드 생성기 등)가 set()으로만 좌표를 되돌리고 지나가면 캐시가 옛
            // 위치(예: 마지막 셀 절대좌표)에 고착된 채 여기로 들어와 _srcMinX/Y(라벨·뷰포트 컬링·
            // Flyweight 비트맵의 공통 앵커)를 오염시킨다. SSOT인 이 메서드가 항상 현재 변환 기준의
            // 신선한 좌표를 쓰도록 setCoords()를 명시 호출한다(소스는 소수라 비용 무시 가능).
            obj.setCoords();
            const bound = obj.getBoundingRect();
            minX = Math.min(minX, bound.left);
            minY = Math.min(minY, bound.top);
            maxX = Math.max(maxX, bound.left + bound.width);
            maxY = Math.max(maxY, bound.top + bound.height);
        });

        const sourceWidth = isNaN(maxX - minX) ? 0 : (maxX - minX);
        const sourceHeight = isNaN(maxY - minY) ? 0 : (maxY - minY);

        this._srcMinX = isNaN(minX) ? 0 : minX;
        this._srcMinY = isNaN(minY) ? 0 : minY;
        this.sourceWidth = sourceWidth;
        this.sourceHeight = sourceHeight;

        // Nominal (override 없는) 그리드 범위
        const xSpc = isNaN(this.xSpacing) ? 0 : this.xSpacing;
        const ySpc = isNaN(this.ySpacing) ? 0 : this.ySpacing;
        const xC = isNaN(this.xCount) ? 1 : this.xCount;
        const yC = isNaN(this.yCount) ? 1 : this.yCount;

        const nominalWidth = sourceWidth + (xC - 1) * xSpc;
        const nominalHeight = sourceHeight + (yC - 1) * ySpc;

        // override가 있는 셀들을 반영해 실제 확장 범위를 구한다
        let extMinX = 0, extMinY = 0, extMaxX = nominalWidth, extMaxY = nominalHeight;
        Object.entries(this.overrides).forEach(([key, ov]) => {
            if (!ov || ov.visible === false) return;
            const parts = key.split('_');
            const row = Number(parts[0]);
            const col = Number(parts[1]);
            if (!Number.isFinite(row) || !Number.isFinite(col)) return;
            if (row < 0 || row >= yC || col < 0 || col >= xC) return;

            const cellW = sourceWidth * (ov.scaleX || 1);
            const cellH = sourceHeight * (ov.scaleY || 1);
            const cx = col * xSpc + (ov.xOffset || 0);
            const cy = row * ySpc + (ov.yOffset || 0);

            extMinX = Math.min(extMinX, cx);
            extMaxX = Math.max(extMaxX, cx + cellW);
            extMinY = Math.min(extMinY, cy);
            extMaxY = Math.max(extMaxY, cy + cellH);
        });

        const totalWidth = isNaN(extMaxX - extMinX) ? 0 : (extMaxX - extMinX);
        const totalHeight = isNaN(extMaxY - extMinY) ? 0 : (extMaxY - extMinY);

        // 이전에 적용된 오프셋을 역산해 명목 앵커를 복원한 뒤, 새 오프셋을 다시 적용한다.
        const prevOffsetX = this._boundsOffsetX || 0;
        const prevOffsetY = this._boundsOffsetY || 0;
        const nominalLeft = (this.left || 0) - prevOffsetX;
        const nominalTop = (this.top || 0) - prevOffsetY;

        // [이슈 5 2026-07-21] left/top을 직접 대입(this.left = ...)하면 Fabric의 변환행렬 캐시
        // (ownMatrixCache)가 무효화되지 않아 calcTransformMatrix()가 이전 값을 반환한다.
        // 그 결과 drawObject()의 뷰포트 컬링(getVisibleLocalBounds)이 옛 프레임 기준으로 판정되어
        // "원래 매트릭스 영역을 벗어난 셀이 화면에서 사라지는" 증상이 생겼다. 반드시 set()으로
        // 변경해 캐시를 무효화하고, aCoords 갱신을 위해 setCoords()까지 호출한다.
        this.set({
            left: nominalLeft + extMinX,
            top: nominalTop + extMinY,
            width: totalWidth,
            height: totalHeight
        });
        this._boundsOffsetX = extMinX;
        this._boundsOffsetY = extMinY;
        this.setCoords();

        // 배열 구성이 바뀌면 캐시된 셀 비트맵도 무효화한다 (소스 크기가 캐시 캔버스 크기에 영향을 줌)
        this._matrixCellBitmap = null;
        this._matrixCellBitmapKey = '';
        // 소스 스타일 변경 가능성이 있는 갱신 경로이므로 라벨 액센트 색 캐시도 함께 무효화
        this._labelAccentColor = null;
    }

    /**
     * @brief 셀 override를 기록하고 파생 갱신을 일괄 수행하는 단일 진입점.
     * @details [Design Pattern: Facade, 단일 진실 공급원 — ScannerIssue3.md 이슈 5]
     *          기존에는 호출부(CanvasTopBar 등)마다 overrides 기록 → updateBoundingBox() 호출을
     *          수동으로 반복해 누락 여지가 있었다. override를 변경하는 모든 경로가 이 메서드를
     *          거치게 하여, 바운딩 박스 확장(영역 밖 셀 표시) / 좌표 캐시 갱신 / 재렌더 /
     *          수정 이벤트(object:modified — 스와치·가공 순서·Undo 연동)가 항상 함께 수행되게 한다.
     * @param cellKey "row_col" 형식의 셀 키
     * @param patch 병합할 override 부분 값(xOffset/yOffset/scaleX/scaleY/markTime/visible 등)
     */
    public applyOverride(cellKey: string, patch: Partial<MatrixOverride>) {
        if (!this.overrides[cellKey]) this.overrides[cellKey] = {};
        Object.assign(this.overrides[cellKey], patch);

        this.updateBoundingBox();   // 내부에서 set()/setCoords()까지 수행
        this.dirty = true;

        if (this.canvas) {
            this.canvas.fire('object:modified', { target: this } as any);
            this.canvas.requestRenderAll();
        }
    }

    /**
     * @brief 현재 캔버스 뷰포트에 보이는 영역을 이 리피터의 로컬(비회전/비스케일) 좌표계로 변환한다.
     * @details [Design Pattern: 없음] `drawObject()`의 뷰포트 컬링에 사용. 캔버스/뷰포트 정보가
     *          없으면 컬링을 건너뛸 수 있도록 null을 반환한다(안전한 폴백: 전체 렌더링).
     * @return 로컬 좌표계 기준 가시 영역 {minX,maxX,minY,maxY} 또는 null
     */
    private getVisibleLocalBounds(): { minX: number; maxX: number; minY: number; maxY: number } | null {
        if (!this.canvas) return null;
        const vpt = this.canvas.viewportTransform;
        const cw = this.canvas.width || 0;
        const ch = this.canvas.height || 0;
        if (!vpt || !cw || !ch) return null;

        const invVpt = fabric.util.invertTransform(vpt);
        const sceneTL = fabric.util.transformPoint(new fabric.Point(0, 0), invVpt);
        const sceneBR = fabric.util.transformPoint(new fabric.Point(cw, ch), invVpt);

        const invObj = fabric.util.invertTransform(this.calcTransformMatrix());
        const localA = fabric.util.transformPoint(sceneTL, invObj);
        const localB = fabric.util.transformPoint(sceneBR, invObj);

        return {
            minX: Math.min(localA.x, localB.x),
            maxX: Math.max(localA.x, localB.x),
            minY: Math.min(localA.y, localB.y),
            maxY: Math.max(localA.y, localB.y)
        };
    }

    /** @brief 셀 비트맵 캐시의 무효화 여부 판단용 키를 만든다(소스 시각 정보 + isConstantSize인 경우 줌 배율). */
    private buildCacheKey(): string {
        const hasConstantSize = this.sourceObjects.some(o => (o as any).customData?.isConstantSize);
        const zoomPart = hasConstantSize ? (this.canvas?.getZoom() || 1).toFixed(4) : 'fixed';
        const sig = this.sourceObjects
            .map(o => `${o.type}|${o.fill}|${o.stroke}|${o.strokeWidth}|${(o as any).name || ''}`)
            .join(',');
        return `${sig}::${this.sourceWidth.toFixed(3)}x${this.sourceHeight.toFixed(3)}::${zoomPart}`;
    }

    /**
     * @brief override/활성 셀이 없는 "평범한" 셀들이 공유하는 단일 셀 비트맵을 (재)생성한다.
     * @details [Design Pattern: Flyweight] 원본 소스 오브젝트의 intrinsic(공유) 렌더 결과를
     *          1회만 오프스크린 캔버스에 래스터화해 캐시하고, `drawObject()`는 override 없는
     *          셀에 대해 매 프레임 fabric object render 대신 `ctx.drawImage()`만 호출한다.
     *          isConstantSize(줌 불변 크기) 소스가 있을 때만 줌 배율 변경 시 캐시를 다시 만든다.
     */
    private ensureCache() {
        const key = this.buildCacheKey();
        if (this._matrixCellBitmap && key === this._matrixCellBitmapKey) return;

        const PAD = 4;
        const w = Math.max(1, Math.ceil(this.sourceWidth + PAD * 2));
        const h = Math.max(1, Math.ceil(this.sourceHeight + PAD * 2));

        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const octx = off.getContext('2d');
        if (!octx) return;

        octx.translate(-(this._srcMinX - PAD), -(this._srcMinY - PAD));

        const zoom = this.canvas?.getZoom() || 1;
        this.sourceObjects.forEach(obj => {
            if (!obj.canvas) obj.canvas = this.canvas;
            obj.objectCaching = false;

            if ((obj as any).customData?.isConstantSize && this.canvas) {
                obj.set({ scaleX: 1 / zoom, scaleY: 1 / zoom });
                obj.setCoords();
            }

            obj.render(octx);
        });

        this._matrixCellBitmap = off;
        this._matrixCellBitmapKey = key;
    }

    public drawObject(ctx: CanvasRenderingContext2D) {
        if (this.sourceObjects.length === 0) return;

        this.ensureCache();
        const visible = this.getVisibleLocalBounds();

        const xSpc = isNaN(this.xSpacing) ? 0 : this.xSpacing;
        const ySpc = isNaN(this.ySpacing) ? 0 : this.ySpacing;
        const w = isNaN(this.width) ? 0 : this.width;
        const h = isNaN(this.height) ? 0 : this.height;
        const offX = this._boundsOffsetX || 0;
        const offY = this._boundsOffsetY || 0;
        const PAD = 4;
        const zoom = this.canvas?.getZoom() || 1;

        // 라벨(있을 때만): 매 프레임 useAppStore를 구독하지 않고 그릴 때마다 최신값을 읽는다(가벼운 getState 호출).
        const liveZ = this.showLabels ? useAppStore.getState().positions.Z : 0;

        // [UX/LOD — MatrixLabelUX.md §2.3] 셀 그리드의 화면상 피치가 임계 미만이면 일반 셀 라벨을
        // 생략한다(겹쳐서 읽을 수 없는 라벨은 노이즈 + 칩 렌더 비용 낭비). 단 (0,0) 셀과 활성 셀
        // 라벨은 항상 유지해 "기능이 꺼진 게 아니라 축소 때문"임을 알린다. 프레임당 상한 가드 포함.
        const pitchCandidates: number[] = [];
        if (this.xCount > 1) pitchCandidates.push(xSpc);
        if (this.yCount > 1) pitchCandidates.push(ySpc);
        const pitchScreen = pitchCandidates.length ? Math.min(...pitchCandidates) * zoom : Infinity;
        const labelLodOk = pitchScreen >= LABEL_LOD_MIN_PITCH;
        let labelsDrawn = 0;

        // Render all cells (Native clipping handles viewport boundary naturally and safely,
        // but we additionally cull off-screen cells below to avoid paying JS/draw cost for them)
        for (let row = 0; row < this.yCount; row++) {
            for (let c = 0; c < this.xCount; c++) {
                const isReverse = this.isZigzag && (row % 2 !== 0);
                const col = isReverse ? (this.xCount - 1 - c) : c;
                const cellIndex = row * this.xCount + c;

                const cellKey = `${row}_${col}`;
                const override = this.overrides[cellKey];

                if (override?.visible === false) continue;

                // [FIX] override로 확장된 바운딩 박스(offX/offY, width) 기준으로 셀을 배치한다.
                // override가 없으면 offX=offY=0 이 되어 기존 공식과 동일하다.
                const dx = col * xSpc + (override?.xOffset || 0) - offX - w / 2;
                const dy = row * ySpc + (override?.yOffset || 0) - offY - h / 2;

                if (isNaN(dx) || isNaN(dy)) continue;

                const cellW = this.sourceWidth * (override?.scaleX || 1);
                const cellH = this.sourceHeight * (override?.scaleY || 1);

                // [PERF] Viewport culling: 화면 밖 셀은 JS 렌더 비용 자체를 건너뛴다
                if (visible) {
                    const cellMinX = dx + this._srcMinX;
                    const cellMaxX = dx + this._srcMinX + cellW;
                    const cellMinY = dy + this._srcMinY;
                    const cellMaxY = dy + this._srcMinY + cellH;
                    if (cellMaxX < visible.minX || cellMinX > visible.maxX ||
                        cellMaxY < visible.minY || cellMinY > visible.maxY) {
                        continue;
                    }
                }

                const isActiveCell = !!this.activeCell && this.activeCell.row === row && this.activeCell.col === col;
                const hasScaleOverride = !!override && (override.scaleX !== undefined || override.scaleY !== undefined);
                const hasOverride = !!override;

                // [PERF/Flyweight] override도 없고 활성 셀도 아니면 캐시 비트맵만 blit(정식 fabric 렌더 생략)
                if (!hasOverride && !isActiveCell && this._matrixCellBitmap) {
                    ctx.save();
                    ctx.translate(dx, dy);
                    ctx.drawImage(this._matrixCellBitmap, this._srcMinX - PAD, this._srcMinY - PAD);
                    ctx.restore();
                } else {
                    ctx.save();
                    ctx.translate(dx, dy);

                    // Apply hover / cell specific opacity overrides
                    const cellOpacity = override?.opacity !== undefined ? override.opacity : 1;
                    ctx.globalAlpha = ctx.globalAlpha * cellOpacity;

                    // Draw source objects (override/활성 셀은 개별 조정이 가능해야 하므로 정식 fabric 렌더 유지)
                    this.sourceObjects.forEach(obj => {
                        if (!obj.canvas) obj.canvas = this.canvas;
                        obj.objectCaching = false;

                        // [FIX] sourceObjects 중 줌 불변(Constant Size) 객체가 있다면 실시간 줌 배율을 반영해 줌
                        if ((obj as any).customData?.isConstantSize && this.canvas) {
                            obj.set({
                                scaleX: 1 / zoom,
                                scaleY: 1 / zoom
                            });
                            obj.setCoords();
                        }

                        // Apply fill / stroke / size overrides if customized in overrides map
                        const originalFill = obj.fill;
                        const originalStroke = obj.stroke;
                        const originalScaleX = obj.scaleX;
                        const originalScaleY = obj.scaleY;

                        if (override?.fill !== undefined) obj.fill = override.fill;
                        if (override?.stroke !== undefined) obj.stroke = override.stroke;
                        if (hasScaleOverride) {
                            obj.scaleX = (obj.scaleX || 1) * (override?.scaleX || 1);
                            obj.scaleY = (obj.scaleY || 1) * (override?.scaleY || 1);
                        }

                        obj.render(ctx);

                        // Restore original properties
                        obj.fill = originalFill;
                        obj.stroke = originalStroke;
                        obj.scaleX = originalScaleX;
                        obj.scaleY = originalScaleY;
                    });

                    ctx.restore();
                }

                // [UX — MatrixLabelUX.md] Z-info 라벨: 뷰포트 컬링을 통과한(=화면에 보이는) 셀에
                // 한해, LOD(밀도)·프레임 상한을 만족할 때만 칩 형태로 그린다. 활성 셀과 (0,0) 셀은
                // LOD와 무관하게 항상 표시.
                if (this.showLabels) {
                    const isFirstCell = row === 0 && col === 0;
                    if ((labelLodOk || isActiveCell || isFirstCell) && labelsDrawn < LABEL_MAX_PER_FRAME) {
                        const absoluteZ = this.computeAbsoluteZ(cellIndex, override, liveZ);
                        this.drawCellLabel(ctx, dx, dy, row, col, zoom, absoluteZ, isActiveCell,
                            this.sourceHeight * (override?.scaleY || 1));
                        labelsDrawn++;
                    }
                }
            }
        }
    }

    /** @brief 라벨 칩의 레이어색 액센트를 leaf 재귀 해석 1회 후 캐시해 반환한다(updateBoundingBox 시 무효화). */
    private getLabelAccentColor(): string {
        if (!this._labelAccentColor) {
            try {
                this._labelAccentColor = resolveObjectColorHex(this as any) || '#00BEFF';
            } catch {
                this._labelAccentColor = '#00BEFF';
            }
        }
        return this._labelAccentColor;
    }

    /**
     * @brief 셀 인덱스/Z-info 라벨을 고대비 칩(chip) 형태로 그린다.
     * @details [Design Pattern: 없음 — 표시 계층 전용, MatrixLabelUX.md §2]
     *          - 크기: 화면 px 기준 clamp(11, 11×zoom, 22) — 확대 시 도형과 함께 커지다 상한에서
     *            고정되고, 축소 시에도 하한 미만으로 줄지 않는다(클램프형 줌 추종).
     *          - 대비: 반투명 다크 칩 + 근백색 텍스트 + 레이어색 색점(액센트) — 카메라 영상
     *            밝기/도형 선 색과 무관하게 판독 보장. 활성 셀은 액센트색 칩 + 다크 텍스트로 반전 강조.
     *          - 클리핑: 칩이 화면 상단 밖으로 잘리면 셀 아래쪽으로 플립, 좌측은 화면 안으로 클램프.
     *          위치 앵커(_srcMinX/Y)와 Z 수식(computeAbsoluteZ)은 기존 SSOT 그대로 사용한다.
     * @param ctx 대상 컨텍스트(리피터 로컬 좌표계 상태)
     * @param dx/dy 셀 배치 로컬 오프셋(drawObject의 셀 공식과 동일 값)
     * @param row/col 셀 인덱스(표시용)
     * @param zoom 현재 캔버스 줌 배율
     * @param absoluteZ 이 셀의 절대 Z(mm)
     * @param isActive 활성(선택) 셀 여부 — 강조 스타일 적용
     * @param cellHScene 셀 높이(scene px, override scale 반영) — 아래쪽 플립 위치 계산에 사용
     */
    private drawCellLabel(
        ctx: CanvasRenderingContext2D,
        dx: number, dy: number,
        row: number, col: number,
        zoom: number, absoluteZ: number,
        isActive: boolean, cellHScene: number
    ) {
        const fontPx = Math.round(Math.min(LABEL_FONT_MAX, Math.max(LABEL_FONT_MIN, LABEL_FONT_MIN * zoom)))
            + (isActive ? LABEL_ACTIVE_FONT_BONUS : 0);
        const font = `${fontPx}px sans-serif`;
        const text = `(${row},${col}) Z:${absoluteZ.toFixed(3)}`;

        ctx.save();
        ctx.translate(dx, dy);
        ctx.scale(1 / zoom, 1 / zoom); // 이후 그리기 단위 = 화면 px
        ctx.font = font;

        // measureText 캐시(문자열+폰트 단위). Z 라이브 갱신으로 키가 계속 늘 수 있어 상한에서 초기화.
        const metricsKey = `${font}|${text}`;
        let textW = this._labelMetricsCache.get(metricsKey);
        if (textW === undefined) {
            textW = ctx.measureText(text).width;
            if (this._labelMetricsCache.size > 512) this._labelMetricsCache.clear();
            this._labelMetricsCache.set(metricsKey, textW);
        }

        // 활성 셀 칩은 전체가 액센트색이므로 색점 생략(동색 겹침 방지)
        const dotSpace = isActive ? 0 : LABEL_DOT_RADIUS * 2 + 5;
        const chipW = textW + LABEL_PAD_X * 2 + dotSpace;
        const chipH = fontPx + LABEL_PAD_Y * 2;

        const anchorX = this._srcMinX * zoom;      // 셀 좌상단(화면 px 좌표계)
        const anchorYTop = this._srcMinY * zoom;
        let chipX = anchorX;
        let chipY = anchorYTop - LABEL_GAP - chipH; // 기본: 셀 위쪽

        // [클리핑 회피] 셀 좌상단의 실제 화면 좌표를 역산해, 칩이 화면 상단 밖이면 셀 아래로 플립,
        // 좌측 밖이면 화면 안으로 클램프한다(리피터 무회전 전제 — hasControls=false로 회전 UI 없음).
        const vpt = this.canvas?.viewportTransform;
        if (vpt) {
            const sceneP = fabric.util.transformPoint(
                new fabric.Point(dx + this._srcMinX, dy + this._srcMinY),
                this.calcTransformMatrix()
            );
            const screenP = fabric.util.transformPoint(sceneP, vpt);
            if (screenP.y - LABEL_GAP - chipH < 0) {
                chipY = anchorYTop + cellHScene * zoom + LABEL_GAP;
            }
            if (screenP.x < 0) {
                chipX = anchorX - screenP.x;
            }
        }

        const accent = this.getLabelAccentColor();

        // 칩 배경
        ctx.fillStyle = isActive ? accent : LABEL_BG;
        traceRoundRect(ctx, chipX, chipY, chipW, chipH, LABEL_RADIUS);
        ctx.fill();

        // 레이어색 액센트 색점(일반 셀만)
        const centerY = chipY + chipH / 2;
        if (!isActive) {
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.arc(chipX + LABEL_PAD_X + LABEL_DOT_RADIUS, centerY, LABEL_DOT_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        }

        // 텍스트
        ctx.fillStyle = isActive ? LABEL_ACTIVE_TEXT : LABEL_TEXT;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, chipX + LABEL_PAD_X + dotSpace, centerY + 0.5);
        ctx.restore();
    }

    /**
     * @brief LayerList/썸네일 등 소규모 UI 표시 전용 가상 오브젝트 목록을 만든다.
     * @details [Design Pattern: 없음] 150셀 초과 시 빈 배열을 반환하는 것은 UI 표시(LayerList 등)에
     *          한정된 안전장치다. G-Code/Scanner 가공 커맨드 생성 경로는 이 함수를 사용하지 말고
     *          `xCount × yCount`를 직접 순회해야 한다(대량 매트릭스에서 무동작 버그를 유발함).
     */
    public getVirtualObjects(): fabric.Object[] {
        const totalCells = this.xCount * this.yCount;
        if (totalCells > 150) {
            return [];
        }

        const key = `${this.xCount}_${this.yCount}_${this.sourceObjects.map(o => o.name).join(',')}`;
        if (this._lastCacheKey === key && this._virtualObjectsCache.length > 0) {
            return this._virtualObjectsCache;
        }

        const virtuals: fabric.Object[] = [];
        let index = 1;

        const leftBase = this.left || 0;
        const topBase = this.top || 0;

        for (let row = 0; row < this.yCount; row++) {
            for (let col = 0; col < this.xCount; col++) {
                const isReverse = this.isZigzag && (row % 2 !== 0);
                const actualCol = isReverse ? (this.xCount - 1 - col) : col;
                const cellKey = `${row}_${actualCol}`;
                const override = this.overrides[cellKey];

                if (override?.visible === false) continue;

                const xSpc = isNaN(this.xSpacing) ? 0 : this.xSpacing;
                const ySpc = isNaN(this.ySpacing) ? 0 : this.ySpacing;
                const dx = actualCol * xSpc + (override?.xOffset || 0);
                const dy = row * ySpc + (override?.yOffset || 0);

                this.sourceObjects.forEach(srcObj => {
                    // Create a lightweight mock object of same geometric family for thumbnails/layers UI
                    let mockObj: fabric.Object;
                    const commonProps = {
                        left: leftBase + dx + (srcObj.left || 0),
                        top: topBase + dy + (srcObj.top || 0),
                        selectable: false,
                        evented: false,
                        visible: this.visible,
                        fill: srcObj.fill,
                        stroke: srcObj.stroke,
                        strokeWidth: srcObj.strokeWidth,
                    };

                    if (srcObj.type === 'circle') {
                        mockObj = new fabric.Circle({
                            ...commonProps,
                            radius: (srcObj as fabric.Circle).radius
                        });
                    } else if (srcObj.type === 'rect') {
                        mockObj = new fabric.Rect({
                            ...commonProps,
                            width: srcObj.width,
                            height: srcObj.height
                        });
                    } else {
                        mockObj = new fabric.Object(commonProps);
                    }

                    // Assign name appropriately
                    if (srcObj.id === 'dot_marker' || (srcObj.name && srcObj.name.startsWith('Dot '))) {
                        (mockObj as any).name = `${srcObj.name || 'Dot 1'} (${row + 1},${actualCol + 1})`;
                        (mockObj as any).id = 'dot_marker';
                    } else {
                        (mockObj as any).name = `${srcObj.name || 'Object'} (${row + 1},${actualCol + 1})`;
                    }

                    (mockObj as any).customData = {
                        isMatrixChild: true,
                        row,
                        col: actualCol,
                        parentSessionId: this.customData?.matrixSessionId
                    };

                    virtuals.push(mockObj);
                });
            }
        }

        this._virtualObjectsCache = virtuals;
        this._lastCacheKey = key;
        return virtuals;
    }
}

// Add to class registry for cloning/serialization
fabric.classRegistry.setClass(MatrixRepeater);
