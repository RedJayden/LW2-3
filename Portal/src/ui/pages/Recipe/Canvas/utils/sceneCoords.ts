/**
 * @file sceneCoords.ts
 * @brief 스테이지 물리 좌표(mm) <-> 캔버스 scene 좌표(px) 변환의 단일 진실 공급원 (Single Source of Truth)
 *
 * @details
 * ## 좌표계 모델 (절대 기계 좌표 + 렌즈 프레임 재배치)
 * scene 좌표계는 **절대 기계 좌표계**입니다:
 *
 *   sceneX = stageX * pxPerMm.x
 *   sceneY = -stageY * pxPerMm.y   (캔버스 Y축은 물리 Y축과 반전)
 *
 * 카메라 뷰/십자선/눈금자는 항상 스테이지의 절대 위치에 투영되므로,
 * 모드 전환 시 카메라 뷰가 현재 위치에서 렌즈 오프셋 목표점으로 이동하는 과정이
 * 워크 에어리어 위에 그대로 표시됩니다.
 *
 * 모드(Scanner/Object x20/x50) 전환 시 백엔드는 렌즈 오프셋 차이만큼 스테이지를
 * 상대 이동시키며(PortalRouterHandler cmd.moons.preset: Rel = 신오프셋 - s_last_offset),
 * 도형이 카메라 뷰 기준 동일한 상대 위치를 유지하려면 도형 좌표도 같은 변위만큼
 * 이동해야 합니다. 이 재배치는 저장/로드 정규화 파이프라인(canvasNormalization.ts)이
 * 본 모듈의 `getLensFrameShiftMm()`을 사용하여 수행합니다:
 *  - 저장: 현재 렌즈 프레임 변위를 제거하여 항상 Scanner 프레임으로 기록
 *  - 로드: 현재 렌즈 프레임 변위를 가산하여 카메라 목표점 주변으로 배치
 *
 * ⚠️ Laser Set Center가 기록하는 recipeCenter의 스테이지 좌표(x, y)를 투영/역산에
 *    개입시키지 마십시오. 카메라-레이저 정렬은 영상 디지털 패닝(pixelX/pixelY)이
 *    담당하며, 스테이지 좌표 스냅숏을 앵커로 쓰면 실제 렌즈 오프셋 목표점과의
 *    차이만큼 도형이 어긋납니다 (실측 사례: 0.446/0.223mm 오차).
 */
import useAppStore from '@/store/appStore';

/** 렌즈 모드 키 (calibrationScales / 렌즈 오프셋 공용 키) */
export type LensKey = 'scanner' | 'object_x20' | 'object_x50';

/**
 * @brief appStore의 cameraKind/objectMag 조합으로 렌즈 키를 결정합니다.
 */
export const lensKeyFromCamera = (
    cameraKind: 'scanner' | 'object',
    objectMag: 'x20' | 'x50'
): LensKey => {
    if (cameraKind === 'scanner') return 'scanner';
    return objectMag === 'x50' ? 'object_x50' : 'object_x20';
};

/**
 * @brief useCanvasStore의 viewMode/magnification 조합으로 렌즈 키를 결정합니다.
 * @note viewMode가 'canvas'인 경우 scanner 키(프레임 변위 0)를 반환합니다.
 */
export const lensKeyFromView = (viewMode: string, magnification: number): LensKey => {
    if (viewMode === 'object') return magnification === 50 ? 'object_x50' : 'object_x20';
    return 'scanner';
};

/**
 * @brief 스테이지 절대 좌표(mm) -> scene 좌표(px) 투영.
 */
export const stageToScenePx = (
    stageX: number,
    stageY: number,
    pxPerMm: { x: number; y: number }
): { x: number; y: number } => ({
    x: stageX * pxPerMm.x,
    y: -stageY * pxPerMm.y,
});

/**
 * @brief scene 좌표(px) -> 스테이지 절대 좌표(mm) 역투영 (stageToScenePx의 정확한 역함수).
 */
export const scenePxToStageMm = (
    sceneX: number,
    sceneY: number,
    pxPerMm: { x: number; y: number }
): { x: number; y: number } => ({
    x: sceneX / pxPerMm.x,
    y: -(sceneY / pxPerMm.y),
});

/**
 * @brief 지정 렌즈 모드의 스테이지 목표 오프셋(mm)을 moonsConfig에서 조회합니다.
 * @details 백엔드 cmd.moons.preset이 사용하는 것과 동일한 값:
 *  - scanner: MIRROR.StageX_Offset / StageY_Offset
 *  - x20: LENS.StageX20_Offset / StageY20_Offset
 *  - x50: LENS.StageX50_Offset / StageY50_Offset
 */
export const getLensStageOffsetMm = (key: LensKey): { x: number; y: number } => {
    const mc = useAppStore.getState().moonsConfig;
    if (!mc) {
        console.warn('[sceneCoords] moonsConfig not loaded; lens offset fallback to (0,0)');
        return { x: 0, y: 0 };
    }
    if (key === 'object_x20') {
        return { x: mc.lens?.stage_x20_offset ?? 0, y: mc.lens?.stage_y20_offset ?? 0 };
    }
    if (key === 'object_x50') {
        return { x: mc.lens?.stage_x50_offset ?? 0, y: mc.lens?.stage_y50_offset ?? 0 };
    }
    return { x: mc.mirror?.stage_x_offset ?? 0, y: mc.mirror?.stage_y_offset ?? 0 };
};

/**
 * @brief 지정 렌즈 프레임의 Scanner 프레임 대비 변위(mm)를 반환합니다.
 * @details 모드 전환 시 백엔드가 수행하는 스테이지 상대 이동량과 동일합니다.
 *          도형 재배치(저장/로드 프레임 변환)의 유일한 변위 소스입니다.
 */
export const getLensFrameShiftMm = (key: LensKey): { x: number; y: number } => {
    if (key === 'scanner') return { x: 0, y: 0 };
    const target = getLensStageOffsetMm(key);
    const scanner = getLensStageOffsetMm('scanner');
    return { x: target.x - scanner.x, y: target.y - scanner.y };
};
