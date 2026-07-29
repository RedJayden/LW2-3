/**
 * @file canvasNormalization.ts
 * @brief Canvas JSON 객체의 좌표계 변환 유틸리티
 * @details
 *  - Design Pattern: Strategy (정규화/역정규화를 독립적 전략으로 캡슐화)
 *  - 표준 저장 좌표: 1000 px/mm + **Scanner 렌즈 프레임** 기준
 *  - scene = 절대 기계 좌표 (sceneCoords.ts 참조)
 *
 * ## 렌즈 프레임 변환 (Lens Frame Shift)
 * 모드(Scanner/Object x20/x50) 전환 시 백엔드는 렌즈 오프셋 차이만큼 스테이지를
 * 상대 이동시키며, 도형이 카메라 뷰 기준 동일한 상대 위치를 유지하려면 도형의
 * scene 좌표도 같은 변위만큼 이동해야 합니다. 본 모듈은 이를 저장/로드 시점에 수행합니다:
 *  - 저장(normalize): 현재 렌즈 프레임 변위(frameShiftMm)를 **제거**하여 항상
 *    Scanner 프레임의 표준 좌표로 기록 (모드 독립적 저장 포맷)
 *  - 로드(denormalize): 로드 대상 렌즈의 프레임 변위를 **가산**하여 해당 모드의
 *    카메라 목표점 주변으로 배치
 *
 * frameShiftMm은 sceneCoords.ts의 getLensFrameShiftMm()으로 구합니다
 * (= moonsConfig 렌즈 오프셋 - 스캐너 오프셋, 백엔드 cmd.moons.preset의 상대 이동량과 동일).
 */

/** mm 단위 프레임 변위를 scene px 변위로 환산 (캔버스 Y축 반전 포함) */
const frameShiftToPx = (
    frameShiftMm: { x: number; y: number },
    pxPerMm: { x: number; y: number }
): { x: number; y: number } => ({
    x: frameShiftMm.x * pxPerMm.x,
    y: -frameShiftMm.y * pxPerMm.y,
});

const ZERO_SHIFT = { x: 0, y: 0 };

/**
 * Normalizes canvas JSON data from Current View Scale to Standard Scale (1000 px/mm).
 * Assumes the input data uses an absolute machine coordinate scene.
 *
 * @param json The Fabric JSON object (from canvas.toObject)
 * @param currentPxPerMm The current PxPerMm of the view
 * @param frameShiftMm 저장 시점 캔버스가 속한 렌즈 프레임의 Scanner 대비 변위 (mm).
 *                     생략 시 {0,0} (Scanner 프레임 그대로 저장).
 * @returns Normalized JSON object (Scanner 프레임, 1000 px/mm)
 */
export const normalizeToStandard = (
    json: any,
    currentPxPerMm: { x: number, y: number },
    frameShiftMm: { x: number; y: number } = ZERO_SHIFT
): any => {
    if (!json || !json.objects) return json;

    const STANDARD_SCALE = 1000; // 1mm = 1000 units in storage
    const ratioX = STANDARD_SCALE / currentPxPerMm.x;
    const ratioY = STANDARD_SCALE / currentPxPerMm.y;
    const shiftPx = frameShiftToPx(frameShiftMm, currentPxPerMm);

    const normalizedObjects = json.objects.map((obj: any) => {
        // Skip system objects if they were accidentally included
        if (obj.isPaper || obj.isGridLine || obj.isGuide || obj.isTemp || obj.isCrosshair) {
            return obj;
        }

        // Clone to avoid mutation
        const newObj = { ...obj };

        // 1. Scale Dimensions / Scale Factors
        newObj.scaleX = (newObj.scaleX || 1) * ratioX;
        newObj.scaleY = (newObj.scaleY || 1) * ratioY;

        // 2. Scale Position (렌즈 프레임 변위를 제거하여 Scanner 프레임으로 환원 후 표준 스케일 적용)
        newObj.left = ((newObj.left || 0) - shiftPx.x) * ratioX;
        newObj.top = ((newObj.top || 0) - shiftPx.y) * ratioY;

        // Adjust Stroke Width (it is in pixels)
        if (newObj.strokeWidth) {
            newObj.strokeWidth = newObj.strokeWidth * ((ratioX + ratioY) / 2);
        }

        return newObj;
    });

    return { ...json, objects: normalizedObjects };
};

/**
 * Denormalizes canvas JSON data from Standard Scale (1000 px/mm, Scanner 프레임)
 * to Current View Scale + 대상 렌즈 프레임.
 *
 * @param json The Normalized JSON object
 * @param currentPxPerMm The target PxPerMm of the view
 * @param frameShiftMm 로드 대상 렌즈 프레임의 Scanner 대비 변위 (mm).
 *                     생략 시 {0,0} (Scanner 프레임 그대로 로드).
 * @returns Denormalized JSON object ready for canvas.loadFromJSON
 */
export const denormalizeFromStandard = (
    json: any,
    currentPxPerMm: { x: number, y: number },
    frameShiftMm: { x: number; y: number } = ZERO_SHIFT
): any => {
    if (!json || !json.objects) return json;

    const STANDARD_SCALE = 1000;
    const ratioX = currentPxPerMm.x / STANDARD_SCALE;
    const ratioY = currentPxPerMm.y / STANDARD_SCALE;
    const shiftPx = frameShiftToPx(frameShiftMm, currentPxPerMm);

    // [DEBUG] Trace Scaling Logic
    if (json.objects && json.objects.length > 0) {
        console.log(`[canvasNormalization] DENORM: ScaleX=${currentPxPerMm.x}, RatioX=${ratioX.toFixed(6)}, shiftPx=(${shiftPx.x.toFixed(1)}, ${shiftPx.y.toFixed(1)}), Obj[0].scaleX=${(json.objects[0].scaleX || 1).toFixed(6)}`);
    }

    const denormalizedObjects = json.objects.map((obj: any) => {
        if (obj.isPaper || obj.isGridLine || obj.isGuide || obj.isTemp || obj.isCrosshair) {
            return obj;
        }

        const newObj = { ...obj };

        // 1. Scale Factors
        newObj.scaleX = (newObj.scaleX || 1) * ratioX;
        newObj.scaleY = (newObj.scaleY || 1) * ratioY;

        // 2. Scale Position (표준 스케일 해제 후 대상 렌즈 프레임 변위 가산)
        newObj.left = (newObj.left || 0) * ratioX + shiftPx.x;
        newObj.top = (newObj.top || 0) * ratioY + shiftPx.y;

        // Adjust Stroke Width
        if (newObj.strokeWidth) {
            newObj.strokeWidth = newObj.strokeWidth * ((ratioX + ratioY) / 2);
        }

        return newObj;
    });

    return { ...json, objects: denormalizedObjects };
};
