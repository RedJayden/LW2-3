import paper from 'paper';
import * as fabric from 'fabric';
import { vectorizeText } from '../utils/textToPath';
import { IFillSettings, IColorPreset } from '../types/cad';
import { ImageProcessor } from '../utils/ImageProcessor';
import { resolveObjectColorHex } from '../utils/colorUtils';

// [NEW] 'COMMENT'는 UI Generated Commands 패널에만 표시되는 주석 라인이다. 실제 하드웨어에는
// 절대 전송되지 않으며, HardwareFacade.generateScannerCommands()의 진입점에서 항상 필터링된다.
// [NEW 2026-07-22] 'SET_PARAM'은 색상(레이어) 그룹 경계에서 Mark Speed/Power를 전환하는
// 명령이다. 드라이버(SinoGalvo/Scanlab)는 이 명령에서 현재 청크를 flush한 뒤 내부 속도/파워를
// 갱신하며, 이후 청크부터 새 값이 적용된다 — Z_MOVE가 색상별 Z를 반영하는 것과 대칭 구조.
// [7차 P1 2026-07-23] 'REPEAT_BEGIN'/'REPEAT_END'는 Mark Times 반복 블록 마커다.
// 기존에는 generate()가 전체 기하 명령을 markTimes번 물리 복제해(45,824×100=4.58M)
// 단일 JSON.stringify(~500MB)가 V8/CEF 한계를 넘어 "Command Generation Failed"가 났다.
// 이제 그룹당 1패스만 생성하고 반복은 드라이버(SinoGalvoController::Run)가 블록을
// repeatCount회 재실행한다. 명령 수는 Mark Times와 무관하게 1패스 분량으로 고정된다.
export type ScannerCommandType = 'JUMP' | 'POINT' | 'LINE' | 'CIRCLE' | 'RECT' | 'ARC' | 'ELLIPSE' | 'EARC' | 'CENTER' | 'Z_MOVE' | 'DELAY' | 'COMMENT' | 'SET_PARAM' | 'REPEAT_BEGIN' | 'REPEAT_END';

export interface ScannerCommand {
    type: ScannerCommandType;
    x: number;
    y: number;
    delayTime?: number; // Shape Delay time in seconds
    r?: number;
    width?: number;
    height?: number;
    angle?: number;
    rx?: number;
    ry?: number;
    startAngle?: number;
    endAngle?: number;
    startX?: number;
    startY?: number;
    pointTime?: number;
    z?: number;
    /** type==='COMMENT'일 때만 사용. UI 표시 전용 텍스트(도형 타입, 반복 회차 등). */
    text?: string;
    /** type==='SET_PARAM': 이후 도형에 적용할 Mark Speed (mm/s) */
    markSpeed?: number;
    /** type==='SET_PARAM': 이후 도형에 적용할 Power (%) */
    power?: number;
    /** type==='REPEAT_BEGIN': 이 마커부터 REPEAT_END까지의 블록을 실행할 총 횟수(≥2) */
    repeatCount?: number;
    /** [Issue9 P3] type==='REPEAT_BEGIN': 이 그룹의 레이어 색상 hex('#RRGGBB').
     *  드라이버가 실측 회차 방송(__onScannerMarkPass)에 함께 실어 UI가 색상 칩을 표시한다. */
    color?: string;
}

export interface ScannerGenerationOptions {
    invertY?: boolean;
    origin?: { x: number; y: number };
    offsetMm?: { x: number; y: number };
    pxPerMm?: { x: number; y: number };
    currentZ?: number;
    shapeDelay?: number;
    markTimes?: number;
    /**
     * 색상(hex)별 가공 프리셋. 주어지면 도형을 색상별로 그룹화해 그룹마다
     * preset.markTimes만큼 반복하고 preset.zOffset(절대 Z)을 currentZ로 적용한다.
     * 생략 시 기존과 동일하게 전체 도형을 단일 그룹(markTimes 전역값)으로 처리한다.
     */
    colorPresets?: Record<string, IColorPreset>;
    onProgress?: (progress: number) => void;
    /** [PERF] true면 이 generatePass() 호출 내부의 자체 yield를 생략한다.
     *  MatrixRepeater가 셀마다 재귀 호출할 때, 셀 단위 yield(최대 1만 회) 대신
     *  바깥 루프에서 청크 단위로 한 번만 yield하기 위해 사용한다. */
    suppressYield?: boolean;
    /** [NEW] true면 generatePass()가 도형마다 찍는 "Shape N/M: type" 주석을 생략한다.
     *  MatrixRepeater가 셀마다 재귀 호출할 때, 호출부(생성 루프)가 이미 더 구체적인
     *  "Matrix Cell (row,col) [i/N]: type" 주석을 직접 찍으므로 중복을 막기 위해 사용한다. */
    suppressShapeComment?: boolean;
}

export interface PathOptions {
    skipProfile?: boolean;
    onProgress?: (progress: number) => void;
}

import { FabricToPaperAdapter } from '../utils/FabricToPaperAdapter';

/**
 * @interface IGenerationContext
 * @brief 다중 패스(Mark times) 생성 동안 패스 간 공유되는 상태.
 * @details Z 오프셋 추적 및 Shape Delay 삽입 기준(실제 명령을 생성한 도형 수)을 유지한다.
 */
interface IGenerationContext {
    /** 마지막으로 적용된 절대 Z 오프셋 (undefined = 미적용) */
    lastZ?: number;
    /** 실제로 명령을 생성(발행)한 도형의 누적 개수 (전체 패스 통산) */
    emittedShapes: number;
    /** 진행률 계산용: 전체 색상 그룹 통산 (도형 수 × 반복 횟수) 총량 */
    totalUnits: number;
    /** 진행률 계산용: 지금까지 처리한 (도형 × 패스) 누적 단위 수 */
    doneUnits: number;
    /** true면 generatePass()가 다음 도형 앞에 자체 Shape Delay를 또 삽입하지 않는다
     *  (generate()가 Mark Times 반복/색상 그룹 경계에서 이미 경계 DELAY를 삽입했음을 의미). */
    suppressNextShapeDelay?: boolean;
    /** [Issue10 P3 2026-07-23] true면 REPEAT 블록 내 첫 Z 요구 지점의 Z_MOVE를 lastZ 중복
     *  제거와 무관하게 강제 방출한다. lastZ 기반 dedupe는 "선형 실행"을 전제하는데, REPEAT
     *  블록은 드라이버가 되감아 재실행하므로 pass≥2 시작 시점의 물리 Z는 이전 pass의 마지막
     *  Z다 — 블록 안에 첫 Z_MOVE가 없으면 pass 2부터 첫 셀이 초점 이탈 Z에서 가공된다
     *  (ScannerIssue10_ZReturn.md §2.3). generate()가 REPEAT_BEGIN 방출 직후 세운다. */
    forceNextZMove?: boolean;
}

/**
 * Service to convert Fabric.js objects to Scanner Commands using Paper.js
 */
export class ScannerGenerator {
    private paperScope: paper.PaperScope;

    constructor() {
        this.paperScope = new paper.PaperScope();
        const canvas = document.createElement('canvas');
        this.paperScope.setup(canvas);
    }

    private getAllObjects(objs: fabric.Object[]): fabric.Object[] {
        let result: fabric.Object[] = [];
        for (const obj of objs) {
            // Systems lockdown hides objects (visible=false), but they should still be processed
            // UNLESS the user explicitly hid them in the Layer List (userVisible=false)
            // AND we must strictly exclude objects that are explicitly set to visible=false (like the matrix seed)
            // Wait, if a system lockdown hides objects via userVisible, then visible could be false.
            // If the user explicitly hides an object, userVisible is false.
            // For the Matrix seed, it has `excludeFromExport = true` set in useMatrixGenerator.
            // We should just check excludeFromExport directly.
            if (!obj || (obj as any).userVisible === false || (obj as any).excludeFromExport === true) continue;

            // [FIX] Exclude measurement groups and other overlays entirely so their children don't leak
            if ((obj as any).isMeasurement || (obj as any).isGuide || (obj as any).isTemp || (obj as any).isCrosshair || (obj as any).excludeFromExport) {
                continue;
            }

            // [FIX 2026-07-21] 매트릭스 원본/프리뷰 최종 가드. 매트릭스 생성 원본(isMatrixOriginal)은
            // 은닉(visible=false + excludeFromExport) 상태여야 하지만, 비동기 경쟁/가시성 토글 등으로
            // 플래그가 어긋나 살아남으면 "소스 도형 + 매트릭스 도형이 함께 가공"되는 실기 증상이
            // 발생한다. 어떤 경로로든 이 표식이 남아 있으면 가공 명령에서 무조건 제외한다.
            // 프리뷰 리피터(isPreview)도 확정 전이므로 가공 대상이 아니다.
            const cd = (obj as any).customData;
            if (cd?.isMatrixOriginal || (cd?.isPreview && (obj as any).type === 'MatrixRepeater')) {
                continue;
            }

            // Check for layers/groups via getObjects, but EXCLUDE MatrixRepeater and standard Groups
            const isGroupType = obj.type === 'group' || obj.type === 'Group' || obj instanceof fabric.Group;
            if ((obj as any).type !== 'MatrixRepeater' && !isGroupType && (obj as any).getObjects && typeof (obj as any).getObjects === 'function') {
                result = result.concat(this.getAllObjects((obj as any).getObjects()));
            } else {
                result.push(obj);
            }
        }
        return result;
    }

    /**
     * @brief 평탄화된 도형을 해상 색상별로 그룹화하고, 그룹마다 적용할 Mark Times/Z를 결정한다.
     * @details options.colorPresets가 없으면(호환성 유지) 전체 도형을 단일 그룹으로 취급해
     *          기존과 동일하게 options.markTimes(전역값)만큼 전체를 반복한다.
     *          "색상에서 분리"된 도형(customData.colorPresetLinked === false)은 색상과 무관하게
     *          별도의 그룹으로 묶여 전역 markTimes를 적용받는다.
     *          [FIX] preset.zOffset은 "기준 Z 위의 상대 오프셋"이 아니라 "이 색상이 가공될
     *          절대 Z"를 의미한다(useCanvasStore.getColorPresetOrDefault가 처음 생성 시 현재
     *          모션 Z축 위치를 기본값으로 채워주므로, 사용자가 따로 만지지 않은 색상은 baseZ와
     *          동일하게 동작한다). 색상 프리셋이 없는 그룹은 baseZ(현재 Z)를 그대로 쓴다.
     */
    private groupByColorPreset(
        flatObjects: fabric.Object[],
        options: ScannerGenerationOptions,
        baseZ: number
    ): { color: string; objs: fabric.Object[]; markTimes: number; targetZ: number; markSpeed?: number; power?: number }[] {
        const fallbackMarkTimes = Math.max(1, Math.floor(Number(options.markTimes) || 1));
        const presets = options.colorPresets;

        if (!presets) {
            // 프리셋 미사용(레거시 경로): SET_PARAM을 방출하지 않고(markSpeed/power undefined)
            // scannerControl()이 설정한 전역 속도를 그대로 쓴다.
            return [{ color: '', objs: flatObjects, markTimes: fallbackMarkTimes, targetZ: baseZ }];
        }

        const order: string[] = [];
        const buckets: Record<string, fabric.Object[]> = {};
        flatObjects.forEach((obj) => {
            const isDetached = (obj as any).customData?.colorPresetLinked === false;
            const color = isDetached ? '' : resolveObjectColorHex(obj);
            if (!buckets[color]) { buckets[color] = []; order.push(color); }
            buckets[color].push(obj);
        });

        return order.map((color) => {
            const preset = color ? presets[color] : undefined;
            return {
                color,
                objs: buckets[color],
                markTimes: preset ? Math.max(1, Math.floor(Number(preset.markTimes) || 1)) : fallbackMarkTimes,
                targetZ: preset ? (Number(preset.zOffset) || 0) : baseZ,
                // [이슈: 색상별 Mark Speed 2026-07-22] 프리셋이 없는 색상은 스토어 고정 기본값
                // (useCanvasStore.getColorPresetOrDefault: markSpeed 1, power 1)과 동일한 값을 쓴다.
                // Right Panel이 그 색상에 대해 표시하는 값과 실제 가공 값이 일치해야 한다.
                markSpeed: preset ? (Number(preset.markSpeed) || 1) : 1,
                power: preset ? (Number(preset.power) || 1) : 1,
            };
        });
    }

    /**
     * @brief Fabric 오브젝트들을 갈보 스캐너 명령어 시퀀스로 변환한다.
     * @details [Design Pattern: Template Method]
     *          - 전체 가공 시퀀스(색상 그룹별 Mark Times 반복 → Z 복원 → CENTER 복귀)의 골격을
     *            본 메서드가 정의하고, 단일 패스 생성은 generatePass()에 위임한다.
     *          - 도형을 색상별로 그룹화해 그룹 A를 preset.markTimes만큼 모두 반복한 뒤 그룹 B로
     *            넘어간다(그룹별로 다른 Mark Times/Z를 갖도록 하기 위함).
     *          - options.shapeDelay(sec) > 0 이면 도형과 도형 사이에만 DELAY 명령을 삽입한다.
     *            (전체 시퀀스의 첫 도형 직전에는 지연을 넣지 않는다)
     * @param fabricObjects 변환 대상 Fabric 오브젝트 배열
     * @param options 좌표 변환/반복/지연/진행률/색상별 프리셋 옵션
     * @return 하드웨어 전송용 ScannerCommand 배열
     */
    public async generate(
        fabricObjects: fabric.Object[],
        options: ScannerGenerationOptions = {}
    ): Promise<ScannerCommand[]> {
        const commands: ScannerCommand[] = [];
        const shapeDelaySec = Math.max(0, Number(options.shapeDelay) || 0);
        const baseZ = options.currentZ ?? 0;

        const flatObjects = this.getAllObjects(fabricObjects);
        const groups = this.groupByColorPreset(flatObjects, options, baseZ);

        const context: IGenerationContext = {
            lastZ: undefined,
            emittedShapes: 0,
            // [7차 P1 2026-07-23] 생성 진행률 분모 = 그룹당 1패스 기준. 반복은 더 이상 생성
            // 시간에 비례하지 않으므로(드라이버 REPEAT 블록 실행) markTimes를 곱하지 않는다.
            totalUnits: groups.reduce((sum, g) => sum + g.objs.length, 0),
            doneUnits: 0,
        };

        let isFirstUnit = true;
        // [이슈: 색상별 Mark Speed 2026-07-22] 직전에 방출한 속도/파워. 그룹 간 값이 같으면
        // 불필요한 SET_PARAM(=청크 분할)을 만들지 않는다. 첫 그룹은 항상 방출해
        // scannerControl()의 시작 시점 단일 기준값 의존을 제거한다.
        let lastMarkSpeed: number | undefined;
        let lastPower: number | undefined;
        for (const group of groups) {
            const groupOptions: ScannerGenerationOptions = { ...options, currentZ: group.targetZ };

            // 색상 그룹의 Mark Speed/Power 전환 명령. Z_MOVE보다 먼저 두어 드라이버가
            // (flush → 속도 갱신) → (Z 이동) → 새 청크(BufStart 시 새 속도 적용) 순으로 처리한다.
            if (group.markSpeed !== undefined &&
                (group.markSpeed !== lastMarkSpeed || group.power !== lastPower)) {
                commands.push({ type: 'SET_PARAM', x: 0, y: 0, markSpeed: group.markSpeed, power: group.power });
                lastMarkSpeed = group.markSpeed;
                lastPower = group.power;
            }

            // [이슈 2 2026-07-21] 색상 그룹의 절대 Z(preset.zOffset)가 현재 물리 Z와 다르면 그룹
            // 시작 전에 Z_MOVE를 방출한다. 기존에는 groupOptions.currentZ로 기준값만 바꿔 전달할 뿐
            // Z_MOVE 명령을 만들지 않아, customData.zOffset이 없는 일반 도형(원/사각형 등)은 색상별
            // Z 설정이 하드웨어에 전혀 반영되지 않았다(실기: Z축 무변화). Z_MOVE는 드라이버에서
            // 버퍼 flush + zMoveCallback(모션 Z 이동) 경계로도 작동한다. 파킹 좌표(startX/startY)는
            // 넣지 않는다 — 다음 도형이 자신의 MovetTo로 시작 위치를 잡는다(이슈 3-③ 규약).
            const zBefore = context.lastZ ?? baseZ;
            if (group.targetZ !== zBefore) {
                commands.push({ type: 'Z_MOVE', x: 0, y: 0, z: group.targetZ });
                context.lastZ = group.targetZ;
            }

            // [7차 P1 2026-07-23] Mark Times 반복을 데이터 복제(pass 루프 × generatePass)에서
            // REPEAT 블록 마커로 전환했다. 그룹당 기하는 1패스만 방출하고, 드라이버가
            // REPEAT_BEGIN(repeatCount)~REPEAT_END 사이를 반복 실행한다(각 반복 종료 시
            // flush+StartMarking으로 물리 경계 보장, Stop 게이트 포함 — 6차 Pass 경계 규약 계승).
            // 반복 사이 Shape Delay는 REPEAT_END.delayTime으로 전달해 드라이버가 대기한다.
            // 그룹 사이 경계는 기존과 동일하게 DELAY 명령으로 flush를 강제한다.
            if (!isFirstUnit) {
                commands.push({ type: 'DELAY', x: 0, y: 0, delayTime: shapeDelaySec });
                context.suppressNextShapeDelay = true;
            }
            const repeat = Math.max(1, Math.floor(group.markTimes));
            const passLabel = groups.length > 1 ? ` - Color ${group.color || 'default'}` : '';
            // [Issue9 P3 2026-07-23] 반복 1회 그룹을 포함해 **모든 색상 그룹**을 REPEAT 마커로
            // 감싸고 그룹의 레이어 색상(hex)을 REPEAT_BEGIN에 싣는다. 드라이버가 그룹 시작/회차마다
            // 실측 회차+색상(__onScannerMarkPass)을 방송해 MARK TIMES 행이 항상 "지금 가공 중인
            // 레이어"를 가리키게 하기 위함 — 1회 그룹에 마커가 없으면 직전 그룹의 n/N 표시가
            // 잔존한다(계획서 ScannerIssue9 §2.5). repeatCount=1은 드라이버가 되감기 없이 자연
            // 처리하며, 그룹 종료 flush 지점이 REPEAT_END로 이동할 뿐 물리 동작은 등가.
            commands.push({ type: 'REPEAT_BEGIN', x: 0, y: 0, repeatCount: repeat, color: group.color || undefined });
            // [Issue10 P3 2026-07-23] 되감기 재실행 대비: repeat>1이면 블록 내 첫 Z 요구
            // 지점의 Z_MOVE를 강제 방출하게 한다 — 각 pass가 자신의 시작 Z를 스스로 복원.
            // repeat=1은 되감기가 없어 선형 실행 전제가 유효하므로 강제하지 않는다(명령 수 절약).
            context.forceNextZMove = repeat > 1;
            // [NEW] UI Generated Commands 패널 표시 전용 주석(하드웨어 전송 시 필터링됨)
            commands.push({ type: 'COMMENT', x: 0, y: 0, text: `Pass x${repeat}${passLabel}` });
            await this.generatePass(group.objs, groupOptions, commands, context, shapeDelaySec);
            commands.push({ type: 'REPEAT_END', x: 0, y: 0, delayTime: shapeDelaySec });
            isFirstUnit = false;
        }

        if (options.onProgress) options.onProgress(100);

        // [Issue10 P2 2026-07-23] 꼬리 Z_MOVE(시작 Z 복귀) 제거 — 복귀 책임을 네이티브
        // HandleScannerRun의 Run 경계 실측 복귀로 단일화했다(ScannerIssue10_ZReturn.md).
        // 스트림 꼬리 복귀는 ① Stop/실패 시 실행되지 못해 시작 Z가 유실되는 래칫 드리프트,
        // ② baseZ(생성 시점 폴링 값)와 실측 Z의 불일치로 인한 이중 이동의 원인이었다.

        // [NEW] Return Scanner to Center (0,0)
        commands.push({ type: 'CENTER', x: 0, y: 0 });

        return commands;
    }

    /**
     * @brief 단일 패스(1회 가공)에 해당하는 명령어를 commands 버퍼에 누적 생성한다.
     * @details 각 도형 처리 직전의 명령 개수를 기억했다가, 실제로 명령이 생성된 도형에 한해
     *          도형 시작 직전(첫 도형 제외)에 DELAY 명령을 삽입한다.
     *          MatrixRepeater 재귀 호출도 본 메서드를 직접 사용하므로
     *          Mark times 반복/Shape Delay/CENTER 복귀가 중복 적용되지 않는다.
     * @param fabricObjects 변환 대상 오브젝트 배열
     * @param options 좌표 변환 옵션
     * @param commands 누적 명령 버퍼 (출력 파라미터)
     * @param context 패스 간 공유 상태 (Z 오프셋, 발행 도형 수)
     * @param shapeDelaySec 도형 간 지연 시간(초), 0이면 삽입하지 않음
     */
    private async generatePass(
        fabricObjects: fabric.Object[],
        options: ScannerGenerationOptions,
        commands: ScannerCommand[],
        context: IGenerationContext,
        shapeDelaySec: number
    ): Promise<void> {
        const { invertY = false, origin = { x: 0, y: 0 }, pxPerMm = { x: 1, y: 1 }, offsetMm = { x: 0, y: 0 }, currentZ = 0 } = options;

        const scaleX = 1 / pxPerMm.x;
        const scaleY = 1 / pxPerMm.y;

        const transformPoint = (p: { x: number, y: number }): { x: number; y: number } => {
            let x = (p.x - origin.x) * scaleX;
            let y = (p.y - origin.y) * scaleY;
            if (invertY) y = -y;
            return { x: x + offsetMm.x, y: y + offsetMm.y };
        };

        const flatObjects = this.getAllObjects(fabricObjects);

        for (let idx = 0; idx < flatObjects.length; idx++) {
            const obj: any = flatObjects[idx];
            const cmdCountBeforeShape = commands.length;
            // [NEW] "이 도형이 실제로 커맨드를 발행했는지" 판단 기준점. 아래에서 찍는 COMMENT는
            // 실제 가공 명령이 아니므로 이 기준점에서 제외해야, 빈 도형(실패/스킵)이 COMMENT만
            // 남기고도 "발행됨"으로 잘못 집계되어 emittedShapes/Shape Delay 로직이 어긋나지 않는다.
            let cmdCountAfterComment = cmdCountBeforeShape;

            // [NEW] Unblock the UI thread occasionally to allow Progress Bar to render for massive paths
            // [PERF] MatrixRepeater가 셀마다 재귀 호출하는 경로(suppressYield)는 여기서 매번 yield하지 않고
            // 바깥 셀 루프에서 청크 단위로 한 번만 yield한다 (수만 회의 이벤트 루프 왕복 방지).
            if (idx % 5 === 0 && !options.suppressYield) {
                await new Promise(r => setTimeout(r, 0));
            }

            if (obj.isPaper || obj.excludeFromExport) continue;

            try {
                // [NEW] UI Generated Commands 패널 표시 전용 주석(하드웨어 전송 시 필터링됨).
                // DELAY는 이 주석보다 앞(cmdCountBeforeShape 위치)에 삽입되도록 유지한다.
                if (!options.suppressShapeComment) {
                    commands.push({ type: 'COMMENT', x: 0, y: 0, text: `Shape ${idx + 1}/${flatObjects.length}: ${obj.type}` });
                }
                cmdCountAfterComment = commands.length;

                const currentZOffset = obj.customData?.zOffset;
                if (currentZOffset !== undefined) {
                    const absoluteZ = currentZ + currentZOffset;
                    // [Issue10 P3] forceNextZMove: REPEAT 블록의 첫 Z 요구 지점은 lastZ dedupe를
                    // 우회해 항상 방출한다(되감기 pass≥2의 시작 Z 복원 — §2.3 초점 이탈 방지).
                    if (absoluteZ !== context.lastZ || context.forceNextZMove) {
                        // [FIX] Force Z_MOVE only if the target Z is explicitly different from the current physical Z,
                        // or if it changed from the last object in this session.
                        if (context.lastZ !== undefined || currentZOffset !== 0 || context.forceNextZMove) {
                            commands.push({ type: 'Z_MOVE', x: 0, y: 0, z: absoluteZ });
                            context.forceNextZMove = false;
                        }
                        context.lastZ = absoluteZ;
                    }
                }

                const isType = (t: string) => obj.isType?.(t) || obj.type === t;
                const isRect = isType('rect');

                // [FIX] Coordinate Unification: Every object uses mathematically rigorous getCenterPoint
                // [FIX] ARC의 기하학적 원 중심 보정: getCenterPoint()는 바운딩 박스 중심이므로
                // ARC(원호)에서는 기하학적 원 중심과 불일치. calcTransformMatrix()의 e,f가 진정한 원 중심.
                let globalX: number, globalY: number;
                const isCircleType = obj.isType?.('circle') || obj.type === 'circle';
                if (isCircleType) {
                    const circleObj = obj as any;
                    const sa = circleObj.startAngle ?? 0;
                    const ea = circleObj.endAngle ?? 360;
                    const span = Math.abs(ea - sa) % 360;
                    if (span >= 0.001) {
                        // ARC: calcTransformMatrix()[4,5]가 기하학적 원 중심
                        const m = obj.calcTransformMatrix();
                        globalX = m[4];
                        globalY = m[5];
                    } else {
                        // Full Circle: bbox 중심 = 원 중심
                        const center = obj.getCenterPoint();
                        globalX = center.x;
                        globalY = center.y;
                    }
                } else {
                    const center = obj.getCenterPoint();
                    globalX = center.x;
                    globalY = center.y;
                }
                const { x, y } = transformPoint({ x: globalX, y: globalY });

                let angle = obj.angle || 0;
                if (invertY) angle = -angle;

                const fillSettings = obj.fillSettings as IFillSettings | undefined;

                // 2. DOT Marker
                if (obj.id === 'dot_marker' || obj.type === 'dot_marker' || obj.name?.startsWith('Dot ')) {
                    const pointTime = (obj as any).markPointTime || 0.01;
                    commands.push({ type: 'POINT', x, y, pointTime: Number(pointTime) });
                    continue;
                }

                // 2.5 MatrixRepeater (High-performance generation)
                if (obj.type === 'MatrixRepeater') {
                    const repeater = obj as any; // Type as MatrixRepeater
                    const sourceObjects = repeater.sourceObjects || [];
                    if (sourceObjects.length === 0) continue;

                    const numItems = repeater.xCount * repeater.yCount;
                    const YIELD_CHUNK = 200;

                    for (let i = 0; i < numItems; i++) {
                        // [PERF] 셀마다가 아니라 청크(기본 200셀) 단위로만 UI 스레드에 양보한다.
                        if (i > 0 && i % YIELD_CHUNK === 0) {
                            await new Promise(r => setTimeout(r, 0));
                        }

                        const row = Math.floor(i / repeater.xCount);
                        const isReverse = repeater.isZigzag && (row % 2 !== 0);
                        const col = isReverse ? (repeater.xCount - 1 - (i % repeater.xCount)) : (i % repeater.xCount);
                        
                        const cellKey = `${row}_${col}`;
                        const override = repeater.overrides?.[cellKey];

                        if (override?.visible === false) continue;

                        // [FIX 2026-07-21] repeater.left/top(매트릭스의 실제 scene 위치)을 반영해야
                        // 하므로, col*xSpacing만으로 계산하지 않고 렌더링/CanvasTopBar/Object 모드
                        // useGCodeGenerator와 동일한 getCellSceneOrigin()(단일 진실 공급원)을 사용한다.
                        // 이 파일에서만 이 호출이 누락되어 있어, 매트릭스를 원점에서 떨어진 곳에 그리면
                        // 셀 간 간격은 맞아도 매트릭스 전체가 원점 근처(우측 하단 대각선)로 오가공되던
                        // feature_Scanner.md §6.9 버그가 Scanner 모드에서만 재발했다.
                        const cellOrigin = repeater.getCellSceneOrigin(row, col, override);
                        const dx = cellOrigin.x;
                        const dy = cellOrigin.y;

                        // If Z-step is enabled or this cell has an individual Z override, move Z for this cell
                        if (repeater.zStep || override?.zOffset) {
                            // [FIX] 캔버스 Z-info 라벨/CanvasTopBar Cell Z 필드와 동일한 공식(단일 진실 공급원)
                            const absoluteZ = repeater.computeAbsoluteZ(i, override, currentZ);
                            // [Issue10 P3] forceNextZMove: REPEAT 블록의 첫 Z 요구 지점(셀 0)은 lastZ
                            // dedupe를 우회해 항상 방출 — 되감기 pass≥2가 셀 0 Z에서 시작하도록 보장.
                            if (absoluteZ !== context.lastZ || context.forceNextZMove) {
                                // [이슈 3-③ 2026-07-21] Z_MOVE에 이 셀의 원점(파킹 좌표)을 실어 보낸다.
                                // 좌표 없는 Z_MOVE는 드라이버가 기본값 (0,0)으로 MovetTo 하여 셀 경계마다
                                // 갈보가 센터로 점프했다가 돌아오는 오동작이 있었다. 이제 드라이버는
                                // hasStart(=startX/startY 존재)일 때만 파킹하므로, 여기서는 다음 셀 원점을
                                // 채워 Z 이동 동안 빔이 다음 셀 근처에 대기하게 한다.
                                const cellStart = transformPoint({ x: dx, y: dy });
                                commands.push({ type: 'Z_MOVE', x: 0, y: 0, z: absoluteZ, startX: cellStart.x, startY: cellStart.y });
                                context.forceNextZMove = false;
                                context.lastZ = absoluteZ;
                            }
                        }

                        // Recursively generate commands for the sourceObjects, shifted by dx, dy
                        // (dx, dy는 이제 getCellSceneOrigin()이 계산한 절대 scene 좌표이므로,
                        // src.left/top(0 기준 정규화)에 그대로 더하면 정확한 절대 위치가 나온다)

                        // [NEW] UI Generated Commands 패널 표시 전용 주석(하드웨어 전송 시 필터링됨)
                        const cellShapeLabel = sourceObjects.length === 1 ? sourceObjects[0].type : `${sourceObjects.length} shapes`;
                        commands.push({ type: 'COMMENT', x: 0, y: 0, text: `Matrix Cell (${row},${col}) [${i + 1}/${numItems}]: ${cellShapeLabel}` });

                        // For generic shapes, we use a recursive call with shifted origin
                        for (const src of sourceObjects) {
                            // If it's a Dot, output directly for max speed
                            if (src.id === 'dot_marker' || src.type === 'dot_marker') {
                                // sourceObjects are normalized to the matrix cell frame by
                                // useMatrixGenerator (single object -> left/top = 0,0), so getCenterPoint()
                                // returns the source's LOCAL offset within the cell. dx/dy is now the
                                // absolute scene origin of this cell (getCellSceneOrigin), so
                                // local-offset + cell-origin = correct absolute scene position.
                                const srcCenter = src.getCenterPoint();
                                const finalGlobalX = srcCenter.x + dx;
                                const finalGlobalY = srcCenter.y + dy;
                                const transformed = transformPoint({ x: finalGlobalX, y: finalGlobalY });
                                
                                const pointTime = override?.markTime !== undefined ? override.markTime : (src.markPointTime || 0.01);
                                commands.push({ type: 'POINT', x: transformed.x, y: transformed.y, pointTime: Number(pointTime) });
                            } else {
                                // For other shapes, temporarily shift the shared source to this cell's
                                // absolute origin and run the single-pass generator recursively.
                                const curLeft = src.left;
                                const curTop = src.top;

                                // Temporarily inject color / hatching / size overrides to the source object
                                const originalFill = src.fill;
                                const originalStroke = src.stroke;
                                const originalFillSettings = (src as any).fillSettings;
                                const originalScaleX = src.scaleX;
                                const originalScaleY = src.scaleY;

                                // [Design Pattern: Scoped Guard] 공유 소스의 임시 변경은 예외/중단 경로를
                                // 포함해 반드시 원복되어야 한다. finally 없이 복원하면 generatePass 실패 시
                                // 소스가 셀 절대좌표에 영구적으로 남는다(MatrixDisplayIssues2.md §2.3).
                                try {
                                    src.set({ left: curLeft + dx, top: curTop + dy });
                                    src.setCoords();

                                    if (override?.fill !== undefined) src.fill = override.fill;
                                    if (override?.stroke !== undefined) src.stroke = override.stroke;
                                    if (override?.fillSettings !== undefined) (src as any).fillSettings = override.fillSettings;
                                    if (override?.scaleX !== undefined) src.scaleX = (src.scaleX || 1) * override.scaleX;
                                    if (override?.scaleY !== undefined) src.scaleY = (src.scaleY || 1) * override.scaleY;

                                    // [FIX] 재귀 생성 시 단일 패스 생성기를 직접 호출하여
                                    // Mark times 반복/Shape Delay/CENTER 복귀 명령이 셀마다 중복 삽입되지 않도록 한다.
                                    // [PERF] suppressYield: 셀 단위 yield 대신 바깥 루프의 청크 단위 yield만 사용한다.
                                    const subOptions: ScannerGenerationOptions = { ...options, markTimes: 1, shapeDelay: 0, onProgress: undefined, suppressYield: true, suppressShapeComment: true };
                                    await this.generatePass([src], subOptions, commands, context, 0);
                                } finally {
                                    // Restore original properties
                                    src.fill = originalFill;
                                    src.stroke = originalStroke;
                                    (src as any).fillSettings = originalFillSettings;
                                    src.scaleX = originalScaleX;
                                    src.scaleY = originalScaleY;

                                    src.set({ left: curLeft, top: curTop });
                                    // [FIX 2026-07-23] 복원 후 setCoords()로 aCoords 캐시까지 원위치로 갱신한다.
                                    // fabric v7의 getBoundingRect()는 캐시된 aCoords를 그대로 사용하므로,
                                    // 이 호출이 없으면 가공 후 소스의 aCoords가 마지막 셀 절대좌표에 고착되고
                                    // 이후 updateBoundingBox()가 _srcMinX/Y(라벨·컬링·비트맵 앵커)를 오염시켜
                                    // "라벨-도형 분리 / 확대 시 오버레이 소실" 버그를 일으켰다.
                                    src.setCoords();
                                }
                            }
                        }
                    }
                    continue;
                }

                // 3. RECT (Only raw primitive if no complex fill)
                if (isRect && (!fillSettings || (!fillSettings.enableFill && !fillSettings.enableProfile))) {
                    let strokeEnabled = obj.strokeEnabled !== undefined ? obj.strokeEnabled : !!(obj.stroke && obj.stroke !== 'transparent');
                    if (strokeEnabled) {
                        commands.push({
                            type: 'RECT', x, y,
                            width: (obj.width! * (obj.scaleX || 1)) * scaleX,
                            height: (obj.height! * (obj.scaleY || 1)) * scaleY,
                            angle
                        });
                    }
                    continue;
                }

                // 4. All Other Shapes (Paper.js exact geometry fallback)
                const PRECISION_SCALE = 10000;
                const originalItem = await FabricToPaperAdapter.toPaperItem(obj, this.paperScope);
                
                if (originalItem) {
                    const item = originalItem.clone() as paper.Item;
                    item.scale(PRECISION_SCALE, new paper.Point(0, 0));
                    
                    const bakeTransforms = (itm: paper.Item) => {
                        if (itm instanceof paper.Raster) return;
                        
                        // Save the true transformed geometric points BEFORE they are baked and lost!
                        if (itm.data && itm.data.isNativeProfile) {
                            const bboxLocalX = 0;
                            const bboxLocalY = 0;

                            itm.data.nativeCenter = itm.matrix.transform(new paper.Point(-bboxLocalX, -bboxLocalY));
                            const rx = itm.data.nativeRadius ?? itm.data.nativeRx ?? (itm.data.nativeWidth ? itm.data.nativeWidth / 2 : 0);
                            const ry = itm.data.nativeRadius ?? itm.data.nativeRy ?? (itm.data.nativeHeight ? itm.data.nativeHeight / 2 : 0);
                            itm.data.nativeRight = itm.matrix.transform(new paper.Point(rx - bboxLocalX, -bboxLocalY));
                            itm.data.nativeBottom = itm.matrix.transform(new paper.Point(-bboxLocalX, ry - bboxLocalY));
                            
                            // Transform start, end, mid for ARC
                            if (itm.data.nativeType === 'ARC') {
                                const dToR = Math.PI / 180;
                                let sAng = itm.data.startAngle || 0;
                                let eAng = itm.data.endAngle || 0;
                                let sweep = eAng - sAng;
                                if (sweep < 0) sweep += 360;
                                const mAng = sAng + sweep / 2;
                                
                                itm.data.nativeArcStart = itm.matrix.transform(new paper.Point(rx * Math.cos(sAng * dToR) - bboxLocalX, ry * Math.sin(sAng * dToR) - bboxLocalY));
                                itm.data.nativeArcEnd = itm.matrix.transform(new paper.Point(rx * Math.cos(eAng * dToR) - bboxLocalX, ry * Math.sin(eAng * dToR) - bboxLocalY));
                                itm.data.nativeArcMid = itm.matrix.transform(new paper.Point(rx * Math.cos(mAng * dToR) - bboxLocalX, ry * Math.sin(mAng * dToR) - bboxLocalY));
                            }
                        }
                        
                        (itm as any).applyMatrix = true;
                        if ((itm as any).children) {
                            (itm as any).children.forEach((child: paper.Item) => bakeTransforms(child));
                        }
                    };
                    bakeTransforms(item);
                    
                    this.processPaperItem(item, obj, commands, transformPoint, pxPerMm, options);
                    
                    item.remove();
                    originalItem.remove();
                }

            } catch (err) {
                console.error('[ScannerGenerator] Failed to generate for:', obj.id, err);
            } finally {
                // [NEW] Shape Delay 삽입: 실제로 명령이 생성된 도형에 한해,
                // 전체 시퀀스 기준 첫 도형을 제외한 도형 시작 직전에 DELAY를 삽입한다.
                // generate()가 Mark Times/색상 그룹 경계에서 이미 경계 DELAY를 삽입한 경우
                // (suppressNextShapeDelay) 같은 경계에 중복 삽입하지 않는다.
                if (commands.length > cmdCountAfterComment) {
                    if (context.suppressNextShapeDelay) {
                        context.suppressNextShapeDelay = false;
                    } else if (shapeDelaySec > 0 && context.emittedShapes > 0) {
                        commands.splice(cmdCountBeforeShape, 0, { type: 'DELAY', x: 0, y: 0, delayTime: shapeDelaySec });
                    }
                    context.emittedShapes++;
                }

                // [NEW] 색상 그룹×Mark times 반복을 포함한 전체 진행률 보고 (최종 100%는 generate()에서 확정)
                if (options.onProgress) {
                    context.doneUnits++;
                    if (context.totalUnits > 0) {
                        options.onProgress(Math.min(99, Math.round((context.doneUnits / context.totalUnits) * 100)));
                    }
                }
            }
        }
    }

    // processPath removed in favor of FabricToPaperAdapter directly in generate()

    private processPaperItem(
        pItem: paper.Item,
        obj: fabric.Object,
        commands: ScannerCommand[],
        transformPoint: (p: { x: number, y: number }) => { x: number, y: number },
        pxPerMm: { x: number, y: number },
        options: PathOptions = {}
    ) {
        if (!pItem) return;

        // Resolve style/fillSettings provider (fallback to nested child's original fabric object if available)
        const targetObj = pItem.data?.original || obj;

        // [FIX] JPG/Image Support: Perform Line-by-Line Raster Engraving using shared ImageProcessor
        if (pItem instanceof paper.Raster) {
            const fabricImage = targetObj as fabric.Image;
            const element = fabricImage.getElement() as HTMLImageElement | HTMLCanvasElement;
            if (!element) return;
            
            const width = Math.floor(fabricImage.width || 0);
            const height = Math.floor(fabricImage.height || 0);
            if (width <= 0 || height <= 0) return;
            
            const sensitivity = (targetObj as any).threshold ?? 50;
            const edgeDetection = (targetObj as any).edgeDetection ?? true;
            
            // Extract Binarized Pixels using shared algorithm
            const binarized = ImageProcessor.getBinarizedPixels(element, width, height, sensitivity, edgeDetection);
            if (!binarized) return;
            
            const matrix = pItem.matrix;
            
            const emitRasterLine = (startX: number, endX: number, y: number) => {
                const localStartX = startX - width / 2;
                const localEndX = endX - width / 2;
                const localY = y - height / 2;
                
                const ptStart = matrix.transform(new paper.Point(localStartX, localY));
                const ptEnd = matrix.transform(new paper.Point(localEndX, localY));
                
                // Account for PRECISION_SCALE (10000) from processPaperItem scaling
                const ptStartScan = transformPoint({ x: ptStart.x / 10000, y: ptStart.y / 10000 });
                const ptEndScan = transformPoint({ x: ptEnd.x / 10000, y: ptEnd.y / 10000 });
                
                commands.push({
                    type: 'LINE',
                    startX: ptStartScan.x, startY: ptStartScan.y,
                    x: ptEndScan.x, y: ptEndScan.y
                });
            };

            for (let y = 0; y < height; y++) {
                let lineStartX = -1;
                for (let x = 0; x < width; x++) {
                    const isDark = binarized[y * width + x] === 1;
                    if (isDark) {
                        if (lineStartX === -1) lineStartX = x;
                    } else {
                        if (lineStartX !== -1) {
                            emitRasterLine(lineStartX, x - 1, y);
                            lineStartX = -1;
                        }
                    }
                }
                if (lineStartX !== -1) emitRasterLine(lineStartX, width - 1, y);
            }
            return;
        }

        if (pItem instanceof paper.Group) {
            const children = (pItem as any).children;
            if (children && children.length > 0) {
                children.forEach((c: any) => this.processPaperItem(c, obj, commands, transformPoint, pxPerMm, options));
                return;
            }
        }

        if (pItem instanceof paper.Shape) {
            this.processPaperItem((pItem as paper.Shape).toPath(), obj, commands, transformPoint, pxPerMm, options);
            return;
        }

        if (pItem instanceof paper.Path || pItem instanceof paper.CompoundPath) {
            const fillSettings = (targetObj as any).fillSettings as IFillSettings | undefined;
            
            let strokeEnabled = (targetObj as any).strokeEnabled !== undefined ? (targetObj as any).strokeEnabled : !!(targetObj.stroke && targetObj.stroke !== 'transparent');
            let fillEnabled = (targetObj as any).fillEnabled !== undefined ? (targetObj as any).fillEnabled : !!(targetObj.fill && targetObj.fill !== 'transparent');
            if (fillSettings && fillSettings.enableFill) {
                fillEnabled = true;
            }

            if (!strokeEnabled && !fillEnabled) {
                return;
            }

            if (fillSettings) {
                const skipThisProfile = options.skipProfile || obj.customData?.skipNativeProfileDownstream;
                const doProfile = strokeEnabled && fillSettings.enableProfile && !skipThisProfile;
                const doFill = fillEnabled && fillSettings.enableFill;

                const tp = transformPoint.bind(this);
                if (doProfile) this.generateProfile(pItem, fillSettings, tp, commands);
                
                // [FIX] Extract global angle from metadata to rotate hatch lines with the object
                const objRot = pItem.data?.globalAngle || 0;
                
                if (doFill) this.processHatching(pItem, fillSettings, tp, pxPerMm, commands, objRot, doProfile);

                if (!doProfile && !doFill) {
                    if (strokeEnabled && !skipThisProfile) {
                        if (pItem.data && pItem.data.isNativeProfile) {
                            this.generateProfile(pItem, fillSettings, tp, commands);
                        } else {
                            this.flattenAndRun(pItem, tp, commands);
                        }
                    }
                }
            } else {
                if (strokeEnabled && !(options.skipProfile || obj.customData?.skipNativeProfileDownstream)) {
                    if (pItem.data && pItem.data.isNativeProfile) {
                        this.generateProfile(pItem, {} as IFillSettings, transformPoint, commands);
                    } else {
                        this.flattenAndRun(pItem, transformPoint, commands);
                    }
                }
            }
        }
    }

    private generateProfile(pItem: paper.PathItem, fsettings: IFillSettings, transformPoint: any, commands: ScannerCommand[]) {
        if (pItem instanceof paper.CompoundPath) {
            pItem.children.forEach((c: any) => this.generateProfile(c, fsettings, transformPoint, commands));
            return;
        }

        // [NEW] Intercept Native Profile (Circle/Ellipse/Arc) that were preserved by FabricToPaperAdapter
        if (pItem.data && pItem.data.isNativeProfile) {
            // ARC bounds center is the bounding box of the visual arc, NOT the geometric circle center!
            // We retrieve the true center that was saved BEFORE bakeTransforms
            const center = pItem.data.nativeCenter || pItem.bounds.center;
            
            // Apply PRECISION_SCALE transformation 
            const globalCenter = { x: center.x / 10000, y: center.y / 10000 };
            const pt = transformPoint(globalCenter);
            
            // Retrieve right/bottom points to calculate radius
            const right = pItem.data.nativeRight || new paper.Point(0, 0);
            const bottom = pItem.data.nativeBottom || new paper.Point(0, 0);
            
            const globalRight = { x: right.x / 10000, y: right.y / 10000 };
            const globalBottom = { x: bottom.x / 10000, y: bottom.y / 10000 };
            
            const ptRight = transformPoint(globalRight);
            const ptBottom = transformPoint(globalBottom);
            
            // Assuming no shear, just scale/rotation
            const finalRx = Math.sqrt(Math.pow(ptRight.x - pt.x, 2) + Math.pow(ptRight.y - pt.y, 2));
            const finalRy = Math.sqrt(Math.pow(ptBottom.x - pt.x, 2) + Math.pow(ptBottom.y - pt.y, 2));
            
            if (pItem.data.nativeType === 'CIRCLE' && finalRx > 0) {
                // Check if it's actually an ellipse (e.g. circle scaled non-uniformly)
                if (Math.abs(finalRx - finalRy) > 0.001) {
                    commands.push({ type: 'ELLIPSE', x: pt.x, y: pt.y, rx: finalRx, ry: finalRy });
                    return;
                }
                commands.push({ type: 'CIRCLE', x: pt.x, y: pt.y, r: finalRx });
                return;
            } else if (pItem.data.nativeType === 'ARC' && finalRx > 0) {
                const sPt = pItem.data.nativeArcStart || new paper.Point(0, 0);
                const ePt = pItem.data.nativeArcEnd || new paper.Point(0, 0);
                const mPt = pItem.data.nativeArcMid || new paper.Point(0, 0);
                
                const ptStart = transformPoint({ x: sPt.x / 10000, y: sPt.y / 10000 });
                const ptEnd = transformPoint({ x: ePt.x / 10000, y: ePt.y / 10000 });
                const ptMid = transformPoint({ x: mPt.x / 10000, y: mPt.y / 10000 });
                
                let as = Math.atan2(ptStart.y - pt.y, ptStart.x - pt.x) * 180 / Math.PI; if (as < 0) as += 360;
                let ae = Math.atan2(ptEnd.y - pt.y, ptEnd.x - pt.x) * 180 / Math.PI; if (ae < 0) ae += 360;
                let am = Math.atan2(ptMid.y - pt.y, ptMid.x - pt.x) * 180 / Math.PI; if (am < 0) am += 360;
                
                // [FIX] SinoGalvo hardware's SchOutArc ALWAYS draws in the direction of INCREASING mathematical angle (CCW).
                // There is NO 180-degree shift. The previous "Y-axis reversed" illusion was simply because 
                // the conjugate (huge) arc of a half-circle looks exactly like the mirrored half-circle.
                // We just need to ensure that the CCW sweep from startAngle to endAngle contains the original mid point.

                let sweepCCW = ae - as;
                if (sweepCCW < 0) sweepCCW += 360;
                
                let sweepMidCCW = am - as;
                if (sweepMidCCW < 0) sweepMidCCW += 360;

                // If the mid point is NOT inside the CCW sweep, swap start and end to draw the short arc instead.
                if (sweepMidCCW > sweepCCW) {
                    const temp = as; as = ae; ae = temp;
                }
                
                commands.push({ type: 'ARC', x: pt.x, y: pt.y, r: finalRx, startAngle: as, endAngle: ae });
                return;
            } else if (pItem.data.nativeType === 'ELLIPSE' && finalRx > 0 && finalRy > 0) {
                // SchOutEllipse does not support rotation, so we just pass rx and ry
                commands.push({ type: 'ELLIPSE', x: pt.x, y: pt.y, rx: finalRx, ry: finalRy });
                return;
            } else if (pItem.data.nativeType === 'RECT') {
                const finalW = finalRx * 2;
                const finalH = finalRy * 2;
                let rectAngle = Math.atan2(ptRight.y - pt.y, ptRight.x - pt.x) * 180 / Math.PI;
                if (rectAngle < 0) rectAngle += 360;
                rectAngle = 360 - rectAngle; if (rectAngle >= 360) rectAngle -= 360;
                
                commands.push({ type: 'RECT', x: pt.x, y: pt.y, width: finalW, height: finalH, angle: rectAngle });
                return;
            }
        }

        let path = pItem.clone() as paper.Path;
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

            if (minIdx !== 0) {
                try {
                    const offset = path.segments[minIdx].location.offset;
                    const newPart = path.splitAt(offset);
                    if (newPart) {
                        newPart.join(path);
                        newPart.closed = true;
                        path = newPart;
                    }
                } catch (e) {}
            }
            let targetVector = new paper.Point(1, 0); 
            if (fsettings.fillProgression === 'R2L') targetVector = new paper.Point(-1, 0);
            const tangent = path.getTangentAt(Math.min(1, path.length * 0.01));
            if (tangent && tangent.dot(targetVector) < 0) path.reverse();
        }
        this.flattenAndRun(path, transformPoint, commands);
        path.remove();
    }

    private processHatching(pItem: paper.PathItem, fsettings: IFillSettings, transformPoint: any, pxPerMm: { x: number, y: number }, commands: ScannerCommand[], objRot: number = 0, effectiveEnableProfile: boolean = fsettings.enableProfile) {
        const PRECISION_SCALE = 10000;
        const hatchItem = pItem.clone() as paper.PathItem;
        if (hatchItem instanceof paper.Path) hatchItem.closed = true;

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
        if (sweepBounds.width <= 0 || sweepBounds.height <= 0) { hatchItem.remove(); return; }

        const avgPxPerMm = (pxPerMm.x + pxPerMm.y) / 2;
        const matrix = new paper.Matrix().rotate(angle, center.x, center.y);
        const spacingSq = fsettings.lineSpacing * avgPxPerMm * PRECISION_SCALE;
        let marginSqValue = fsettings.margin * avgPxPerMm * PRECISION_SCALE;
        
        // [FIX] Calculate skipHatchBoundary BEFORE overriding marginSqValue
        const skipHatchBoundary = marginSqValue <= 0 && effectiveEnableProfile;

        if (fsettings.margin <= 0) {
            // [FIX] Force a 0.001mm margin internally if margin is 0 to avoid overlapping precisely with the profile boundary (double hit)
            marginSqValue = 0.001 * avgPxPerMm * PRECISION_SCALE;
        }
        
        let is2DInset = false;
        if (fsettings.margin > 0 && pItem.data?.isNativeProfile && pItem.data.nativeType === 'CIRCLE') {
            const marginPx = fsettings.margin * avgPxPerMm * PRECISION_SCALE;
            const rPx = unrotatedBounds.width / 2;
            if (rPx > 0) {
                const scaleF = Math.max(0.0001, (rPx - marginPx) / rPx);
                hatchItem.scale(scaleF, center);
                is2DInset = true;
            }
        }

        const isHorizontalSweep = fsettings.fillProgression === 'T2B' || fsettings.fillProgression === 'B2T';
        let startPrimary = isHorizontalSweep ? 
            (fsettings.fillProgression === 'T2B' ? sweepBounds.top : sweepBounds.bottom) : 
            (fsettings.fillProgression === 'L2R' ? sweepBounds.left : sweepBounds.right);
        let endPrimary = isHorizontalSweep ? 
            (fsettings.fillProgression === 'T2B' ? sweepBounds.bottom : sweepBounds.top) : 
            (fsettings.fillProgression === 'L2R' ? sweepBounds.right : sweepBounds.left);
        
        const stepPrimary = (endPrimary > startPrimary) ? spacingSq : -spacingSq;
        const minSec = isHorizontalSweep ? sweepBounds.left : sweepBounds.top;
        const maxSec = isHorizontalSweep ? sweepBounds.right : sweepBounds.bottom;

        // [FIX] Grid Anchoring: To match the UI overlay, we MUST maintain the original grid start point.
        let marginStartLimit = startPrimary;
        let marginEndLimit = endPrimary;

        if (!is2DInset && marginSqValue > 0) {
            marginStartLimit += (stepPrimary > 0 ? marginSqValue : -marginSqValue);
            marginEndLimit -= (stepPrimary > 0 ? marginSqValue : -marginSqValue);
            
            // Check if margin is larger than the shape itself
            if ((stepPrimary > 0 && marginStartLimit > marginEndLimit) || (stepPrimary < 0 && marginStartLimit < marginEndLimit)) {
                hatchItem.remove();
                return;
            }
        }

        // [FIX] As requested by user:
        // If Profile is enabled and Margin is 0, skip hatch boundaries to avoid drawing the exact same edge twice.
        // If Profile is disabled, or Margin > 0, we MUST draw the fill area's boundaries.
        // skipHatchBoundary was moved up before marginSqValue override

        const eps = 0.0001 * avgPxPerMm * PRECISION_SCALE;
        
        let sweepPositions: number[] = [];
        
        if (!skipHatchBoundary) {
            sweepPositions.push(marginStartLimit + (stepPrimary > 0 ? eps * 5 : -eps * 5));
        }
        
        for (let p = startPrimary; ; p += stepPrimary) {
            if (stepPrimary > 0 && p > endPrimary + eps) break;
            if (stepPrimary < 0 && p < endPrimary - eps) break;
            
            // strictly inside
            const isInsideStart = stepPrimary > 0 ? p > marginStartLimit + eps * 10 : p < marginStartLimit - eps * 10;
            const isInsideEnd   = stepPrimary > 0 ? p < marginEndLimit - eps * 10   : p > marginEndLimit + eps * 10;
            
            if (isInsideStart && isInsideEnd) {
                sweepPositions.push(p);
            }
        }
        
        if (!skipHatchBoundary) {
            sweepPositions.push(marginEndLimit - (stepPrimary > 0 ? eps * 5 : -eps * 5));
        }

        let drawnIdx = 0;
        let pointsForConnect: paper.Point[] = [];

        for (const currentSweepP of sweepPositions) {
            
            const lineStart = isHorizontalSweep ? new paper.Point(minSec - 1000, currentSweepP) : new paper.Point(currentSweepP, minSec - 1000);
            const lineEnd = isHorizontalSweep ? new paper.Point(maxSec + 1000, currentSweepP) : new paper.Point(currentSweepP, maxSec + 1000);
            const sweepLine = new paper.Path.Line(lineStart, lineEnd);
            const inter = sweepLine.getIntersections(hatchItem);
            
            if (inter.length >= 2) {
                inter.sort((a, b) => isHorizontalSweep ? a.point.x - b.point.x : a.point.y - b.point.y);
                for (let i = 0; i < inter.length - 1; i += 2) {
                    let p1 = inter[i].point; let p2 = inter[i + 1].point;
                    if (marginSqValue > 0 && !is2DInset) {
                        const vec = p2.subtract(p1);
                        if (vec.length > marginSqValue * 2) {
                            const dir = vec.normalize();
                            p1 = p1.add(dir.multiply(marginSqValue)); 
                            p2 = p2.subtract(dir.multiply(marginSqValue));
                        } else continue;
                    } else {
                        // Filter out zero-length lines (tangents) that Paper.js might return
                        const vec = p2.subtract(p1);
                        if (vec.length < 1.0) continue;
                    }

                    let goForward = true;
                    // [FIX] TwoWay direction uses drawnIdx, guaranteeing phase matching with the UI overlay
                    if ((fsettings.fillType?.includes('TwoWay') || fsettings.fillType?.includes('Bow')) && (drawnIdx % 2 === 1)) {
                        goForward = false;
                    }
                    drawnIdx++;
                    
                    const pStart = goForward ? p1 : p2;
                    const pEnd = goForward ? p2 : p1;
                    const gStart = matrix.transform(pStart);
                    const gEnd = matrix.transform(pEnd);

                    // [FIX] Disable connecting lines for OptimizedTwoWay if skipHatchBoundary is true
                    // This prevents double processing of the shape edges when margin is 0 and profile is enabled.
                    const canConnect = (fsettings.fillType?.includes('OptimizedTwoWay') || fsettings.fillType?.includes('OptimizedBow')) && !skipHatchBoundary;

                    if (canConnect) {
                        pointsForConnect.push(gStart, gEnd);
                    } else {
                        this.runContiguousLines([gStart, gEnd], transformPoint, commands);
                    }
                }
            }
            sweepLine.remove();
        }

        if (pointsForConnect.length > 0) {
            this.runContiguousLines(pointsForConnect, transformPoint, commands);
        }
        hatchItem.remove();
    }

    private flattenAndRun(pItem: paper.PathItem, transformPoint: any, commands: ScannerCommand[]) {
        if (pItem instanceof paper.CompoundPath) {
            pItem.children.forEach((c: any) => this.flattenAndRun(c, transformPoint, commands));
            return;
        }
        const PRECISION_SCALE = 10000;
        const path = pItem as paper.Path;
        // [FIX] 0.1: 원래 0.25보다 2.5배 정밀하면서 시스템 부하 방지
        // 0.01은 곡선당 2000+ LINE 세그먼트 → 갈보 컨트롤러 과부하로 멈춤 발생
        path.flatten(0.1 * PRECISION_SCALE);
        const segments = path.segments;
        if (!segments || segments.length === 0) return;

        const points = segments.map(s => path.localToGlobal(s.point));
        if (path.closed) points.push(points[0]);
        this.runContiguousLines(points, transformPoint, commands);
    }

    private runContiguousLines(pointsPx: paper.Point[], transformPoint: any, commands: ScannerCommand[]) {
        if (pointsPx.length === 0) return;

        const PRECISION_SCALE = 10000;
        const rawStart = { x: pointsPx[0].x / PRECISION_SCALE, y: pointsPx[0].y / PRECISION_SCALE };
        const startCurrent = transformPoint(rawStart);

        if (!isNaN(startCurrent.x) && !isNaN(startCurrent.y)) {
            // [FIX] Explicitly emit JUMP command so the hardware turns off the laser during transit.
            commands.push({ type: 'JUMP', x: startCurrent.x, y: startCurrent.y });
        }

        let lastPt: { x: number, y: number } | null = startCurrent;
        let skippedCount = 0;
        let degenerateCount = 0;

        // [P2-1 2026-07-22] 제로 길이/중복점 세그먼트 필터(6차 이슈 B-2). 기존에는 시작=끝인
        // LINE이 수백 개 연속 생성돼(예: 동일 좌표 LINE 스팸) 갈보가 한 점에 체류하며 번(burn)
        // 점을 만들고, 명령 수를 부풀려 하드웨어 버퍼 분할(이슈 G)을 유발했다. lastPt를 갱신하지
        // 않고 스킵하므로 미소 세그먼트가 누적되어 임계값을 넘으면 정상적으로 한 개의 LINE으로
        // 방출된다(폴리라인 연속성 유지, 누적 오차 없음).
        const MIN_SEG_MM = 0.001; // 1µm — 갈보 분해능 이하의 이동은 물리적으로 무의미
        for (let i = 1; i < pointsPx.length; i++) {
            const rawPt = { x: pointsPx[i].x / PRECISION_SCALE, y: pointsPx[i].y / PRECISION_SCALE };
            const current = transformPoint(rawPt);
            if (lastPt && !isNaN(current.x) && !isNaN(lastPt.x)) {
                const segLen = Math.hypot(current.x - lastPt.x, current.y - lastPt.y);
                if (segLen < MIN_SEG_MM) {
                    // 마지막 점이어도 방출하지 않는다 — 종점이 직전 방출점과 1µm 이내로
                    // 사실상 동일하므로 폐합 오차는 무시 가능하다.
                    degenerateCount++;
                    continue; // lastPt 유지 — 다음 점과의 누적 거리로 재평가
                }
                commands.push({ type: 'LINE', x: current.x, y: current.y, startX: lastPt.x, startY: lastPt.y });
            } else {
                skippedCount++;
            }
            lastPt = current;
        }

        if (skippedCount > 0) {
            console.warn(`[ScannerGenerator] ${skippedCount} LINE segments skipped due to NaN coordinates!`);
        }
        if (degenerateCount > 0) {
            console.info(`[ScannerGenerator] ${degenerateCount} zero-length segments merged (< ${MIN_SEG_MM}mm).`);
        }
    }
}

export const scannerGenerator = new ScannerGenerator();
