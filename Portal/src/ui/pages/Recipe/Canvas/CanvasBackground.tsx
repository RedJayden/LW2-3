import React, { useEffect, useRef } from 'react';
import { useCanvasStore } from './useCanvasStore';
import { CAMERA_SPECS } from './cameraConfig';
import useAppStore, { selectors } from '../../../../store/appStore';
import { camFrameUrl } from '../../../../shared/endpoints';
import { useUIPreferenceStore } from '../../../../store/useUIPreferenceStore';
import { lensKeyFromView, stageToScenePx } from './utils/sceneCoords';


export interface CanvasBackgroundProps {
    zoom?: number;
    panOffset?: { x: number; y: number };
    imageScaleX?: number;
    imageScaleY?: number;
}

/**
 * @file CanvasBackground.tsx
 * @brief Renders the background for the RecipeCanvas.
 * @details
 * - Supports Standard Display and "Digital Zoom" (ROI) via frontend canvas rendering.
 * - (NEW) Completely decoupled React state from Network Polling!
 * - Uses createImageBitmap on a separate worker thread to decode JPEGs.
 * - Nullifies Chrome HTTP (canceled) warnings permanently.
 */
export default function CanvasBackground({
    imageScaleX = 1,
    imageScaleY = 1
}: CanvasBackgroundProps) {
    // [FIX] DECOUPLE FROM REACT STATE FOR SMOOTH SYNC
    // We remove 'pan' and 'zoom' from the destructuring to prevent React re-renders during every pan/zoom move.
    // Instead, we will use a ref and update the style directly via Fabric.js events.
    const { viewMode, loadedImages, calibrationROI, magnification, showLaserSetCenterDialog } = useCanvasStore();
    const canvas = useCanvasStore(s => s.canvas);
    
    // [FIX] ZERO-LAG POSITION SYNC
    // Use refs for positions to avoid React re-render noise during JOG moves
    const positions = useAppStore(selectors.positions);
    const latestPositionsRef = useRef(positions);
    useEffect(() => {
        latestPositionsRef.current = positions;
        // Trigger a manual update when positions change (JOG)
        if (canvas) {
            canvas.fire('viewport:transformed' as any);
        }
    }, [positions, canvas]);

    const panRef = useRef({ x: 0, y: 0 });
    const zoomRef = useRef(1);
    const transformRef = useRef<HTMLDivElement>(null);
    const cameraCanvasRef = useRef<HTMLCanvasElement>(null);

    const isStreaming = useAppStore(selectors.isStreaming);
    const renderCanvasRef = useRef<HTMLCanvasElement>(null);
    const rafId = useRef<number | null>(null);

    // [최적화] GPU로 넘어간 최신 Bitmap을 조용히 상태값(State)없이 보관
    const latestBitmapRef = useRef<ImageBitmap | null>(null);

    // We want to render the camera stream as a mini-overlay even in 'canvas' mode!
    // if (viewMode === 'canvas') {
    //     return null;
    // }

    const uiPrefs = useUIPreferenceStore.getState();
    const subBarState = uiPrefs.getSubBarState("shared_machine_layout");
    const features = useAppStore.getState().features;

    let camMode = useAppStore.getState().cameraKind;
    let magStr = useAppStore.getState().objectMag;

    if (viewMode === 'canvas') {
        camMode = subBarState.cameraMode;
        magStr = subBarState.mag;
    }

    let effectiveMag = magStr;
    if (!features.hasObjectX20 && effectiveMag === "x20") effectiveMag = "x50";

    const isObjCam = camMode === 'object';
    const cameraId = isObjCam ? 1 : 0;
    const activeKey = isObjCam ? (effectiveMag === "x50" ? 'object_x50' : 'object_x20') : 'scanner';

    const loadedImage = loadedImages[activeKey];

    // Source Logic
    // 1. App is Streaming (Global State) หรือ 2. Laser Set Center Dialog is Open
    const effectiveStreaming = isStreaming || showLaserSetCenterDialog;

    // 비동기 백그라운드 Fetch Loop (React 렌더링 사이클과 완전 분리)
    useEffect(() => {
        let isRunning = true;
        let abortController = new AbortController();
        let timeoutId: NodeJS.Timeout | null = null;
        let tick = 0;

        const fetchContent = async () => {
            if (!isRunning) return;

            let fetchUrl = "";
            if (effectiveStreaming) {
                tick++;
                const buster = Date.now().toString(36) + "-" + tick.toString(36);
                fetchUrl = `${camFrameUrl(cameraId)}&_=${buster}`;
            } else if (loadedImage) {
                fetchUrl = loadedImage; 
            }

            if (!fetchUrl) {
                // 스트리밍이나 로드 이미지 둘 다 없는 경우 잠시 대기
                timeoutId = setTimeout(fetchContent, 200);
                return;
            }

            try {
                const response = await fetch(fetchUrl, {
                    cache: effectiveStreaming ? "no-store" : "default",
                    signal: abortController.signal,
                });

                if (!response.ok) throw new Error("bad-response");

                const blob = await response.blob();
                // 브라우저 백그라운드 스레드에서 즉시 GPU 포맷(Bitmap)으로 디코딩 (Stuttering 주원인 해결)
                const bitmap = await createImageBitmap(blob);

                if (!isRunning) {
                    bitmap.close();
                    return;
                }

                // 기존 프레임 텍스처 파기 후 새 텍스처 최신화
                if (latestBitmapRef.current) {
                    // GPU 메모리 반환
                    latestBitmapRef.current.close();
                }
                latestBitmapRef.current = bitmap;

                if (effectiveStreaming) {
                    // Push 방식 스케줄링. (한 장이 완벽히 그려진 이후에만 다음장 요청)
                    fetchContent();
                } else {
                    // Static image의 경우 한장 그려두고 폴링 멈춤
                }
            } catch (err: any) {
                if (!isRunning) return;
                // 네트워크 에러이거나 데이터가 깨졌을 때 잠시 대기
                if (err.name !== 'AbortError') {
                    timeoutId = setTimeout(fetchContent, 200);
                }
            }
        };

        fetchContent();

        return () => {
            isRunning = false;
            abortController.abort(); // 즉시 취소
            if (timeoutId) clearTimeout(timeoutId);

            // 주의: 언마운트 시 메모리 회수하되, 렌더 루프 충돌 피하기 위해 레퍼런스 null화
            if (latestBitmapRef.current) {
                const bmp = latestBitmapRef.current;
                latestBitmapRef.current = null;
                bmp.close();
            }
        };
    }, [effectiveStreaming, loadedImage, cameraId]);

    // Resolution Config
    const cameraConfig = useAppStore.getState().cameraConfig;
    let width = 2448;
    let height = 2048;

    if (isObjCam) {
        const objCam = cameraConfig?.cameras?.find((c: any) => c.name.toLowerCase().includes('object') || c.id === 2);
        if (objCam && objCam.resolution) {
            width = objCam.resolution.width;
            height = objCam.resolution.height;
        }
    } else {
        const scanCam = cameraConfig?.cameras?.find((c: any) => c.name.toLowerCase().includes('scanner') || c.id === 1);
        if (scanCam && scanCam.resolution) {
            width = scanCam.resolution.width;
            height = scanCam.resolution.height;
        }
    }

    // Motion Coordinates (already declared at the top)
    const calibrationScales = useCanvasStore((s) => s.calibrationScales);

    // 무조건 60FPS로 빙글빙글 도는 순수 Canvas 렌더링 루프
    useEffect(() => {
        const render = () => {
            const canvas = renderCanvasRef.current;
            if (!canvas) return;

            const ctx = canvas.getContext('2d'); // Removed { alpha: false } to support transparency
            if (!ctx) return;

            const bmp = latestBitmapRef.current;

            // Clear background
            const dw = canvas.width;
            const dh = canvas.height;
            ctx.clearRect(0, 0, dw, dh);

            const isOffline = !bmp || bmp.width === 0;
            if (isOffline) {
                // If camera is disconnected or offline, draw black background
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, dw, dh);
            }

            // Dimensions
            const W = isOffline ? width : bmp.width;
            const H = isOffline ? height : bmp.height;

            // ROI Calculation
            let sx = 0, sy = 0, sw = W, sh = H;
            let dx = 0, dy = 0, dw_draw = dw, dh_draw = dh;

            // Get fresh state instead of stale closure
            const storeState = useCanvasStore.getState();
            const currentCalibrationROI = storeState.calibrationROI;
            const currentShowLaserDialog = storeState.showLaserSetCenterDialog;

            let idealRoiLeft = 0;
            let idealRoiTop = 0;
            let idealCropW = W;
            let idealCropH = H;

            const hasActiveROI = currentCalibrationROI.active && currentCalibrationROI.center;

            if (hasActiveROI) {
                const r = Math.max(0.1, Math.min(1.0, currentCalibrationROI.viewRatio / 100.0));

                const cropW = W * r;
                const cropH = H * r;
                idealCropW = cropW;
                idealCropH = cropH;

                let cx_logical = currentCalibrationROI.center!.x;
                let cy_logical = currentCalibrationROI.center!.y;

                const scaleX = W / width;
                const scaleY = H / height;

                let cx = cx_logical * scaleX;
                let cy = cy_logical * scaleY;

                idealRoiLeft = cx - cropW / 2;
                idealRoiTop = cy - cropH / 2;

                // [FIX] DO NOT CLAMP idealRoiLeft to bounds! Truncation gives exact visible bounds.
                const visibleLeft = Math.max(0, idealRoiLeft);
                const visibleTop = Math.max(0, idealRoiTop);
                const visibleRight = Math.min(W, idealRoiLeft + cropW);
                const visibleBottom = Math.min(H, idealRoiTop + cropH);

                const visibleW = Math.max(0, visibleRight - visibleLeft);
                const visibleH = Math.max(0, visibleBottom - visibleTop);

                sx = visibleLeft;
                sy = visibleTop;
                sw = visibleW;
                sh = visibleH;

                // [FIX] Do not scale to fill canvas. Maintain original mapping (dw / W) and center it.
                const scaleDestX = dw / W;
                const scaleDestY = dh / H;

                const renderCx = dw / 2;
                const renderCy = dh / 2;

                const drawW = visibleW * scaleDestX;
                const drawH = visibleH * scaleDestY;

                // [FIX] Distinguish between Preview (Set ROI) and Applied (Center)
                // If not explicitly applied, we just crop without shifting.
                const isApplied = currentCalibrationROI.isApplied !== false;

                if (isApplied) {
                    // Map cx directly to renderCx to perfectly align the laser hit point!
                    dx = renderCx - (cx - visibleLeft) * scaleDestX;
                    dy = renderCy - (cy - visibleTop) * scaleDestY;
                } else {
                    // Leave it at its original physical position (No shift)
                    dx = visibleLeft * scaleDestX;
                    dy = visibleTop * scaleDestY;
                }

                dw_draw = drawW;
                dh_draw = drawH;
            } else {
                idealRoiLeft = 0;
                idealRoiTop = 0;
                idealCropW = W;
                idealCropH = H;
                sx = 0; sy = 0; sw = W; sh = H;
                dx = 0; dy = 0; dw_draw = dw; dh_draw = dh;
            }

            try {
                if (!isOffline && bmp) {
                    if (sw > 0 && sh > 0) {
                        ctx.drawImage(bmp, sx, sy, sw, sh, dx, dy, dw_draw, dh_draw);
                    }
                }

                // -------------------------------------------------------------
                // [NEW] Camera Grid & Cross Overlay
                // -------------------------------------------------------------
                const { showCameraGrid, showCameraCross, showLaserSetCenterDialog, pickedPixel } = useCanvasStore.getState();

                if (showCameraGrid && sw > 0 && sh > 0) {
                    const cssWidth = cameraCanvasRef.current ? parseFloat(cameraCanvasRef.current.style.width) : width;
                    const screenScale = (cssWidth || width) / width;
                    const gridThickness = Math.max(0.5, 1.5 / screenScale);

                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)'; // Brighter slate-400
                    ctx.lineWidth = gridThickness;
                    
                    const stepX = dw_draw / 10;
                    const stepY = dh_draw / 10;

                    for (let i = 1; i < 10; i++) {
                        const lx = dx + i * stepX;
                        ctx.moveTo(lx, dy);
                        ctx.lineTo(lx, dy + dh_draw);
                        
                        const ly = dy + i * stepY;
                        ctx.moveTo(dx, ly);
                        ctx.lineTo(dx + dw_draw, ly);
                    }
                    ctx.stroke();
                }

                if (showCameraCross && sw > 0 && sh > 0) {
                    // [FIX] Always draw the camera cross at the absolute center of the canvas (dw/2, dh/2),
                    // which corresponds to the physical stage center, instead of the center of the truncated visible image.
                    const cx = dw / 2;
                    const cy = dh / 2;
                    const cssWidth = cameraCanvasRef.current ? parseFloat(cameraCanvasRef.current.style.width) : width;
                    const screenScale = (cssWidth || width) / width;
                    const crossThickness = Math.max(0.5, 2 / screenScale);

                    ctx.beginPath();
                    ctx.strokeStyle = 'orange'; // Match Stage Cross
                    ctx.lineWidth = crossThickness;
                    
                    // vertical
                    ctx.moveTo(cx, dy);
                    ctx.lineTo(cx, dy + dh_draw);
                    // horizontal
                    ctx.moveTo(dx, cy);
                    ctx.lineTo(dx + dw_draw, cy);
                    ctx.stroke();

                    // Center Circle
                    const radius = 50; // Fixed native radius to maintain proportion with camera image
                    ctx.beginPath();
                    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
                    ctx.stroke();
                }

                // -------------------------------------------------------------
                // Red X Overlay
                // -------------------------------------------------------------

                if (currentShowLaserDialog && storeState.pickedPixel) {
                    const pickedPixel = storeState.pickedPixel;
                    const scaleNatX = W / width;
                    const scaleNatY = H / height;
                    const px_nat = pickedPixel.x * scaleNatX;
                    const py_nat = pickedPixel.y * scaleNatY;

                    // The actual pixel position mapped to the current rendering canvas
                    const canvasX = dx + (px_nat - sx) * (dw_draw / (sw || 1));
                    const canvasY = dy + (py_nat - sy) * (dh_draw / (sh || 1));

                    ctx.beginPath();
                    ctx.strokeStyle = '#FF0000';
                    ctx.lineWidth = 2;
                    const s = 10;
                    ctx.moveTo(canvasX - s, canvasY - s);
                    ctx.lineTo(canvasX + s, canvasY + s);
                    ctx.moveTo(canvasX + s, canvasY - s);
                    ctx.lineTo(canvasX - s, canvasY + s);
                    ctx.stroke();
                }

                if (currentShowLaserDialog && !currentCalibrationROI.active) {
                    const ratio = Math.max(0.1, Math.min(1.0, currentCalibrationROI.viewRatio / 100.0));
                    const cropW_p = W * ratio;
                    const cropH_p = H * ratio;
                    const cx_p_log = storeState.pickedPixel ? storeState.pickedPixel.x : (currentCalibrationROI.center ? currentCalibrationROI.center.x : width / 2);
                    const cy_p_log = storeState.pickedPixel ? storeState.pickedPixel.y : (currentCalibrationROI.center ? currentCalibrationROI.center.y : height / 2);

                    const scaleNatX = W / width;
                    const scaleNatY = H / height;
                    const cx_p = cx_p_log * scaleNatX;
                    const cy_p = cy_p_log * scaleNatY;

                    let startX_p = cx_p - cropW_p / 2;
                    let startY_p = cy_p - cropH_p / 2;
                    // [FIX] DO NOT CLAMP red box. It must accurately reflect the crop boundary even if it goes out of bounds.

                    const scaleOpX = dw / W;
                    const scaleOpY = dh / H;

                    const bX = startX_p * scaleOpX;
                    const bY = startY_p * scaleOpY;
                    const bW = cropW_p * scaleOpX;
                    const bH = cropH_p * scaleOpY;

                    const cX_disp = cx_p * scaleOpX;
                    const cY_disp = cy_p * scaleOpY;

                    ctx.fillStyle = 'rgba(0,0,0,0.6)';
                    ctx.fillRect(0, 0, dw, bY);
                    ctx.fillRect(0, bY + bH, dw, dh - (bY + bH));
                    ctx.fillRect(0, bY, bX, bH);
                    ctx.fillRect(bX + bW, bY, dw - (bX + bW), bH);

                    ctx.strokeStyle = '#FF0000';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(bX, bY, bW, bH);

                    ctx.beginPath();
                    ctx.moveTo(cX_disp - 10, cY_disp);
                    ctx.lineTo(cX_disp + 10, cY_disp);
                    ctx.moveTo(cX_disp, cY_disp - 10);
                    ctx.lineTo(cX_disp, cY_disp + 10);
                    ctx.stroke();
                } else if (showLaserSetCenterDialog && calibrationROI.active) {
                    // When ROI is actively applied, the image is already cropped and centered.
                    // Just draw the red box precisely around the drawn cropped image boundary.
                    ctx.strokeStyle = '#FF0000';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(dx, dy, dw_draw, dh_draw);
                }

            } catch (e) {
                // Ignore transient errors
            }

            rafId.current = requestAnimationFrame(render);
        };

        rafId.current = requestAnimationFrame(render);

        return () => {
            if (rafId.current) cancelAnimationFrame(rafId.current);
        };
    }, [calibrationROI, width, height, effectiveStreaming]); // 의존성 추가
    
    // [FIX] Coordinate System uses dynamic pxPerMm from the store.
    // This ensures 1:1 mapping between Canvas Pixels and Camera Image Pixels.
    // eliminating the size discrepancy between camera image and drawn geometry.
    
    // [NEW] DIRECT VIEWPORT & POSITION SYNC (Manual Projection)
    const stageBgRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!canvas || !cameraCanvasRef.current || !stageBgRef.current) return;

        const updateAll = () => {
            const vpt = canvas.viewportTransform;
            if (!vpt || !cameraCanvasRef.current || !stageBgRef.current) return;
            
            const zoom = canvas.getZoom();
            // [FIX] Always use the standard scanner scale for the background rendering limits
            const calibrationScales_bg = useCanvasStore.getState().calibrationScales;
            const scannerScaleRaw = calibrationScales_bg['scanner'] || { x: 1000, y: 1000 };
            const pxPerMm = typeof scannerScaleRaw === 'number' 
                ? { x: scannerScaleRaw, y: scannerScaleRaw } 
                : scannerScaleRaw;
            
            // 1. Update Stage Background (Machine Bounds)
            const sLimit = useAppStore.getState().stageLimit;
            const stageW = (sLimit.maxX - sLimit.minX) * pxPerMm.x;
            const stageH = (sLimit.maxY - sLimit.minY) * pxPerMm.y;
            
            const screenStageW = stageW * zoom;
            const screenStageH = stageH * zoom;
            
            const pos = latestPositionsRef.current;
            // [FIX] Accurately position Stage Background using exact min/max bounds instead of centering around 0,0
            const stageScreenLeft = vpt[4] + (sLimit.minX * pxPerMm.x * zoom);
            const stageScreenTop = vpt[5] - (sLimit.maxY * pxPerMm.y * zoom);

            // [FIX] Hardware accelerated transforms instead of layout-thrashing left/top
            stageBgRef.current.style.transform = `translate3d(${stageScreenLeft}px, ${stageScreenTop}px, 0)`;
            stageBgRef.current.style.width = `${screenStageW}px`;
            stageBgRef.current.style.height = `${screenStageH}px`;
            
            // 2. Update Camera Canvas Position (Absolute Machine Coordinates)
            // [FIX] scene = 절대 기계 좌표 (sceneCoords.ts 단일 수식).
            // 카메라 뷰는 항상 스테이지의 절대 위치에 투영되므로 모드 전환 시
            // 현재 위치에서 렌즈 오프셋 목표점으로 이동하는 과정이 그대로 표시됩니다.
            // 도형의 카메라 상대 위치 유지는 저장/로드 프레임 변환(canvasNormalization)이 담당합니다.
            const activeKey_local = lensKeyFromView(viewMode, magnification);
            const { x: pxX_cam, y: pxY_cam } = stageToScenePx(pos.X, pos.Y, pxPerMm);

            const camScaleRaw = calibrationScales[activeKey_local] || 1000;
            const camScale = typeof camScaleRaw === 'number' ? { x: camScaleRaw, y: camScaleRaw } : camScaleRaw;
            
            const physicalW = width / camScale.x;
            const physicalH = height / camScale.y;
            const renderW = physicalW * pxPerMm.x;
            const renderH = physicalH * pxPerMm.y;

            const camScreenLeft = vpt[4] + (pxX_cam * zoom) - (renderW * zoom / 2);
            const camScreenTop = vpt[5] + (pxY_cam * zoom) - (renderH * zoom / 2);

            // [FIX] Hardware accelerated transforms for butter-smooth camera movement
            cameraCanvasRef.current.style.transform = `translate3d(${camScreenLeft}px, ${camScreenTop}px, 0)`;
            cameraCanvasRef.current.style.width = `${renderW * zoom + 0.5}px`; 
            cameraCanvasRef.current.style.height = `${renderH * zoom + 0.5}px`;

            // 3. Update Text Labels (With Clamping to prevent Ruler overlap - Left: 60px, Top: 20px)
            if (stageLabelRef.current) {
                const labelTop = stageScreenTop - 28;
                const finalTop = labelTop < 20 ? stageScreenTop + 8 : labelTop;
                stageLabelRef.current.style.transform = `translate3d(${Math.max(60, stageScreenLeft)}px, ${finalTop}px, 0)`; 
            }
            if (cameraLabelRef.current) {
                const labelTop = camScreenTop - 28;
                const finalTop = labelTop < 20 ? camScreenTop + 8 : labelTop;
                cameraLabelRef.current.style.transform = `translate3d(${Math.max(60, camScreenLeft)}px, ${finalTop}px, 0)`; 
            }
        };

        // Initialize
        updateAll();

        // Subscribe to all relevant events
        canvas.on('viewport:transformed' as any, updateAll);
        canvas.on('after:render', updateAll);

        return () => {
            canvas.off('viewport:transformed' as any, updateAll);
            canvas.off('after:render', updateAll);
        };
    }, [canvas, width, height, viewMode, magnification, calibrationScales]);

    const stageLabelRef = useRef<HTMLDivElement>(null);
    const cameraLabelRef = useRef<HTMLDivElement>(null);

    // Ensure Canvas Size matches Resolution
    useEffect(() => {
        if (renderCanvasRef.current) {
            renderCanvasRef.current.width = width;
            renderCanvasRef.current.height = height;
        }
    }, [width, height]);


    return (
        <div style={{
            position: 'absolute',
            top: 0, left: 0, width: '100%', height: '100%',
            zIndex: 0, pointerEvents: 'none', overflow: 'hidden',
            backgroundColor: 'transparent'
        }}>
            {/* [FIX] Manual Projection Background - No Transform Layer */}
            <div 
                ref={stageBgRef}
                style={{
                    position: 'absolute',
                    top: 0, left: 0,
                    backgroundColor: '#1e293b', 
                    boxSizing: 'border-box',
                    willChange: 'transform, width, height',
                    pointerEvents: 'none'
                }} 
            />

            {/* Manual Projection Camera Canvas */}
            <canvas
                ref={(el) => {
                    (renderCanvasRef as any).current = el;
                    (cameraCanvasRef as any).current = el;
                }}
                style={{
                    position: 'absolute',
                    top: 0, left: 0,
                    boxShadow: viewMode === 'canvas' ? '0 0 15px rgba(0, 255, 255, 0.4)' : 'none',
                    border: viewMode === 'canvas' ? '2px solid rgba(0, 255, 255, 0.6)' : 'none',
                    borderRadius: '4px',
                    willChange: 'transform, width, height',
                    pointerEvents: 'none'
                }}
            />

            {/* Area Labels */}
            <div
                ref={stageLabelRef}
                style={{
                    position: 'absolute',
                    top: 0, left: 0,
                    padding: '2px 8px',
                    backgroundColor: 'rgba(30, 41, 59, 0.8)',
                    backdropFilter: 'blur(4px)',
                    color: '#10b981', // emerald-500
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    pointerEvents: 'none',
                    willChange: 'transform'
                }}
            >
                Stage Area
            </div>
            <div
                ref={cameraLabelRef}
                style={{
                    position: 'absolute',
                    top: 0, left: 0,
                    padding: '2px 8px',
                    backgroundColor: 'rgba(30, 41, 59, 0.8)',
                    backdropFilter: 'blur(4px)',
                    color: '#38bdf8', // sky-400
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    pointerEvents: 'none',
                    willChange: 'transform'
                }}
            >
                Camera Area
            </div>
        </div>
    );
}
