/**
 * @file calibCoords.ts
 * @brief 캔버스 scene 좌표(px) ↔ 카메라 네이티브 픽셀 좌표 변환 유틸 (Auto-Fit ROI 용)
 *
 * @details
 * ## 매핑 모델
 * CanvasBackground 는 카메라 프레임을 scene 좌표계에 1:1 (scene px = native px) 로
 * 렌더링하며, 카메라 영역 중심은 stageToScenePx(stageX, stageY) 에 위치한다.
 * Laser Set Center 의 디지털 패닝이 적용된 경우(calibrationROI.active && isApplied)
 * 네이티브 픽셀 center(cx,cy) 가 카메라 영역 중심에 오도록 이미지가 평행이동된다.
 *
 *   u = cx + (sceneX - camCenterSceneX)
 *   v = cy + (sceneY - camCenterSceneY)
 *   (cx,cy 기본값 = 프레임 중심 W/2, H/2)
 *
 * viewRatio(크롭 비율)는 표시 영역만 잘라낼 뿐 스케일을 바꾸지 않으므로
 * 본 매핑에는 영향을 주지 않는다.
 */
import useAppStore, { CameraId } from '@/store/appStore';
import { useCanvasStore } from '@/ui/pages/Recipe/Canvas/useCanvasStore';
import { stageToScenePx } from '@/ui/pages/Recipe/Canvas/utils/sceneCoords';

/** 카메라 프레임 정보 */
export interface CameraFrameInfo {
    camId: number;          ///< VisionBridge 카메라 ID (0=Scanner, 1=Object)
    width: number;          ///< 네이티브 해상도 W
    height: number;         ///< 네이티브 해상도 H
    centerScene: { x: number; y: number };  ///< 카메라 영역 중심의 scene 좌표
    digitalCenter: { x: number; y: number }; ///< 디지털 패닝 기준 픽셀 (미적용 시 W/2,H/2)
}

/**
 * @brief 현재 활성 카메라의 프레임/배치 정보를 수집한다.
 */
export function getCameraFrameInfo(): CameraFrameInfo {
    const app = useAppStore.getState();
    const canvasStore = useCanvasStore.getState();

    const isObject = app.cameraKind === 'object';
    const camId = isObject ? CameraId.Object : CameraId.Scanner;

    // RecipeCanvas fitCameraArea 와 동일한 해상도 조회 규칙
    let width = 2448;
    let height = 2048;
    const cams = app.cameraConfig?.cameras as any[] | undefined;
    if (cams) {
        const cam = isObject
            ? cams.find((c: any) => c.name?.toLowerCase().includes('object') || c.id === 1)
            : cams.find((c: any) => c.name?.toLowerCase().includes('scanner') || c.id === 2);
        if (cam?.resolution) {
            width = cam.resolution.width;
            height = cam.resolution.height;
        }
    }

    const pxPerMm = canvasStore.pxPerMm || { x: 1000, y: 1000 };
    const positions = app.positions;
    const centerScene = stageToScenePx(positions.X, positions.Y, pxPerMm);

    // 디지털 패닝(Laser Set Center) 적용 여부
    const roi = canvasStore.calibrationROI;
    const applied = !!(roi?.active && roi.center && roi.isApplied !== false);
    const digitalCenter = applied
        ? { x: roi.center!.x, y: roi.center!.y }
        : { x: width / 2, y: height / 2 };

    return { camId, width, height, centerScene, digitalCenter };
}

/**
 * @brief scene 좌표 사각형 → 카메라 네이티브 픽셀 ROI 변환
 * @return 프레임 밖으로 완전히 벗어나면 null
 */
export function sceneRectToImageRoi(rect: { left: number; top: number; width: number; height: number }):
    { x: number; y: number; w: number; h: number } | null {
    const info = getCameraFrameInfo();
    const x = info.digitalCenter.x + (rect.left - info.centerScene.x);
    const y = info.digitalCenter.y + (rect.top - info.centerScene.y);
    const roi = { x, y, w: rect.width, h: rect.height };

    if (roi.x + roi.w < 0 || roi.y + roi.h < 0 || roi.x > info.width || roi.y > info.height) {
        return null;
    }
    return roi;
}

/**
 * @brief 카메라 네이티브 픽셀 좌표 → scene 좌표 변환 (검출 결과 오버레이 스냅용)
 */
export function imagePtToScene(pt: { x: number; y: number }): { x: number; y: number } {
    const info = getCameraFrameInfo();
    return {
        x: info.centerScene.x + (pt.x - info.digitalCenter.x),
        y: info.centerScene.y + (pt.y - info.digitalCenter.y),
    };
}
