/**
 * @file importImage.ts
 * @brief Raster 이미지 Import 전략 (PNG/JPG/JPEG/BMP/WebP/GIF/TIFF).
 *
 * Chromium이 네이티브 디코딩하는 형식은 dataURL 경로를 그대로 사용하고,
 * Chromium이 지원하지 않는 TIFF는 UTIF.js로 RGBA 디코딩 후 PNG dataURL로
 * 변환하여 동일한 외곽선 처리 파이프라인에 투입한다.
 *
 * @pattern Strategy — importFile 디스패처의 raster 형식 담당 전략.
 *          (processImageForOutline은 Toolbar.tsx에서 이동)
 */
import * as fabric from 'fabric';
import * as UTIF from 'utif';
import { useCanvasStore } from '../useCanvasStore';

/** @brief File → dataURL 리더 (Promise 래핑) */
const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
        reader.onload = (e) => {
            const data = e.target?.result as string;
            if (data) {
                resolve(data);
            } else {
                reject(new Error(`Empty file: ${file.name}`));
            }
        };
        reader.readAsDataURL(file);
    });
};

/**
 * @brief TIFF 파일을 UTIF.js로 디코딩하여 PNG dataURL로 변환한다.
 *
 * Chromium은 TIFF 코덱이 없으므로 <img>/fabric.Image로 직접 로드할 수 없다.
 * 멀티페이지 TIFF는 첫 페이지만 사용한다.
 */
const decodeTiffToDataURL = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const ifds = UTIF.decode(buffer);
    if (!ifds || ifds.length === 0) {
        throw new Error(`Invalid TIFF file: ${file.name}`);
    }

    const page = ifds[0];
    UTIF.decodeImage(buffer, page, ifds);
    const rgba = UTIF.toRGBA8(page);

    const off = document.createElement('canvas');
    off.width = page.width;
    off.height = page.height;
    const ctx = off.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to create canvas context for TIFF decode');
    }
    const imgData = ctx.createImageData(page.width, page.height);
    imgData.data.set(rgba);
    ctx.putImageData(imgData, 0, 0);
    return off.toDataURL('image/png');
};

/**
 * @brief Helper to remove solid background (White/Black) and keep outlines
 *        (Toolbar.tsx에서 이동 — 로직 변경 없음)
 */
export const processImageForOutline = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(dataUrl); return; }

            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // Threshold-based background removal (Handles White and Black)
            // And simple edge detection
            const outputData = ctx.createImageData(canvas.width, canvas.height);
            const out = outputData.data;

            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const idx = (y * canvas.width + x) * 4;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];

                    const gray = (r + g + b) / 3;

                    // Edge Detection: Compare with neighbor
                    let isEdge = false;
                    if (x < canvas.width - 1 && y < canvas.height - 1) {
                        const ridx = idx + 4;
                        const bidx = idx + canvas.width * 4;
                        const rGray = (data[ridx] + data[ridx + 1] + data[ridx + 2]) / 3;
                        const bGray = (data[bidx] + data[bidx + 1] + data[bidx + 2]) / 3;
                        if (Math.abs(gray - rGray) > 30 || Math.abs(gray - bGray) > 30) {
                            isEdge = true;
                        }
                    }

                    if (isEdge) {
                        out[idx] = 0;   // R
                        out[idx + 1] = 190; // G (#00BEFF)
                        out[idx + 2] = 255; // B
                        out[idx + 3] = 255; // A
                    } else {
                        out[idx + 3] = 0;
                    }
                }
            }

            // [NEW] Simple 1-pixel Dilation to ensure continuity and thickness
            const dilatedData = ctx.createImageData(canvas.width, canvas.height);
            const dOut = dilatedData.data;
            const width = canvas.width;
            const height = canvas.height;

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    // If current or any neighbor in cross (+) shape is active
                    let active = false;
                    for (let dy = -1; dy <= 1; dy++) {
                        const ny = y + dy;
                        if (ny < 0 || ny >= height) continue;
                        const nidx = (ny * width + x) * 4;
                        if (out[nidx + 3] > 0) { active = true; break; }
                    }
                    if (!active) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const nx = x + dx;
                            if (nx < 0 || nx >= width) continue;
                            const nidx = (y * width + nx) * 4;
                            if (out[nidx + 3] > 0) { active = true; break; }
                        }
                    }

                    if (active) {
                        dOut[idx] = 0;
                        dOut[idx + 1] = 190;
                        dOut[idx + 2] = 255;
                        dOut[idx + 3] = 255;
                    } else {
                        dOut[idx + 3] = 0;
                    }
                }
            }

            ctx.putImageData(dilatedData, 0, 0);
            resolve(canvas.toDataURL());
        };
        img.src = dataUrl;
    });
};

/**
 * @brief raster 이미지 파일을 외곽선 처리 후 캔버스에 추가한다.
 * @param canvas Fabric 캔버스 인스턴스
 * @param file   raster 이미지 파일 (TIFF 포함)
 * @return 캔버스에 추가된 객체 수 (항상 1)
 * @throws 파일 읽기/디코딩 실패 시
 */
export const importImage = async (canvas: fabric.Canvas, file: File): Promise<number> => {
    const isTiff = /\.tiff?$/i.test(file.name) || file.type === 'image/tiff';
    const data = isTiff ? await decodeTiffToDataURL(file) : await readFileAsDataURL(file);

    // Process Raster Image for Background Removal & Outlines
    const processedData = await processImageForOutline(data);
    const img = await fabric.Image.fromURL(processedData);

    (img as any).originalSrc = data; // Store original raw image
    (img as any).threshold = useCanvasStore.getState().gcodeSettings.threshold || 50;
    (img as any).stroke = '#00BEFF'; // Default stroke for images
    (img as any).strokeEnabled = true;
    img.set({ left: 100, top: 100 });
    const pxPerMm = useCanvasStore.getState().pxPerMm;
    img.scaleToWidth(10 * pxPerMm.x);
    canvas.add(img);
    canvas.setActiveObject(img);
    return 1;
};
