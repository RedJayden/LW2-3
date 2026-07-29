import * as fabric from 'fabric';
import { hwFacade } from '../../../../services/HardwareFacade';
import { useCanvasStore } from './useCanvasStore';
import { generateDXF } from './utils/dxfExport';

/** @brief Export 지원 포맷 (P2 + P4-c) */
export type ExportFormat = 'svg' | 'dxf' | 'png' | 'jpeg' | 'webp' | 'json';

/** @brief 포맷별 저장 확장자 */
export const EXT_BY_FORMAT: Record<ExportFormat, string> = {
    svg: 'svg', dxf: 'dxf', png: 'png', jpeg: 'jpg', webp: 'webp', json: 'json',
};

export const getSanitizedSVGBlob = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const svgString = e.target?.result as string;
            if (!svgString) {
                reject('Empty SVG');
                return;
            }
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(svgString, 'image/svg+xml');
                const svg = doc.documentElement;

                // 1. Inject Dimensions if missing (Fix for Fox)
                let width = svg.getAttribute('width');
                let height = svg.getAttribute('height');
                const viewBox = svg.getAttribute('viewBox');

                if ((!width || !height) && viewBox) {
                    const parts = viewBox.split(/\s+|,/).filter(Boolean);
                    if (parts.length === 4) {
                        const vbWidth = parts[2];
                        const vbHeight = parts[3];
                        if (!width) {
                            width = vbWidth;
                            svg.setAttribute('width', vbWidth);
                        }
                        if (!height) {
                            height = vbHeight;
                            svg.setAttribute('height', vbHeight);
                        }
                    }
                }

                // 2. Remove Black Background (Fix for Antigravity)
                const bgElement = svg.querySelector('#BACKGROUND');
                if (bgElement) {
                    bgElement.remove();
                } else {
                    // Fallback: Check first path/rect if it looks like a background
                    const firstChild = svg.querySelector('g, path, rect');
                    if (firstChild && (firstChild.tagName === 'path' || firstChild.tagName === 'rect')) {
                        // Only remove if we are fairly sure (heuristic)
                        // For now, we rely mostly on ID, but this fallback exists.
                        // We won't aggressively remove here to avoid deleting content in standard files.
                    }
                }

                const serializer = new XMLSerializer();
                const newSvgString = serializer.serializeToString(svg);
                const blob = new Blob([newSvgString], { type: 'image/svg+xml' });
                resolve(URL.createObjectURL(blob));
            } catch (err) {
                reject(err);
            }
        };
        reader.readAsText(file);
    });
};

/**
 * @brief 캔버스를 SVG로 직렬화하여 네이티브 저장 다이얼로그로 저장한다.
 * @return 백엔드 저장 결과 (사용자 취소 시 ok=false, message='Canceled')
 */
export const exportToSVG = async (canvas: fabric.Canvas, filename: string): Promise<{ ok: boolean; message?: string }> => {
    // Temporarily remove background color for export
    const originalBg = canvas.backgroundColor;
    canvas.backgroundColor = '';

    // Find Paper to define ViewBox
    const paper = canvas.getObjects().find(obj => (obj as any).isPaper);
    let options = {};

    if (paper) {
        const { left, top, width, height } = paper;
        if (left !== undefined && top !== undefined && width !== undefined && height !== undefined) {
            options = {
                viewBox: {
                    x: left,
                    y: top,
                    width: width,
                    height: height
                },
                width: width,
                height: height,
            };
        }
    }
    // Temporarily hide non-design objects (Paper, Grid, Guides, etc.)
    const objectsToHide = canvas.getObjects().filter(obj =>
        (obj as any).isPaper ||
        (obj as any).isGridLine ||
        (obj as any).isGuide ||
        (obj as any).isTemp ||
        (obj as any).isMeasurement
    );

    const originalVisibilities = objectsToHide.map(obj => obj.visible);
    objectsToHide.forEach(obj => obj.visible = false);

    // Set precision globally for Fabric.js SVG export
    // We assume default is 12 from RecipeCanvas
    fabric.config.configure({ NUM_FRACTION_DIGITS: 5 });
    const originalPrecision = 12;

    let svg = await canvas.toSVG({
        ...options,
        suppressPreamble: false
    });

    // Restore precision
    fabric.config.configure({ NUM_FRACTION_DIGITS: originalPrecision });

    // Fix: Post-process SVG to ensure images have width/height attributes
    // Fabric.js 6.x can sometimes omit these, causing invisible images in some viewers.
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svg, 'image/svg+xml');
        const imageElements = doc.querySelectorAll('image');

        const getVisibleImages = (objects: fabric.FabricObject[]): fabric.Image[] => {
            let images: fabric.Image[] = [];
            for (const obj of objects) {
                if (!obj.visible || (obj as any).excludeFromExport) continue;
                if (obj.type === 'image') {
                    images.push(obj as fabric.Image);
                } else if (obj.type === 'group' && (obj as fabric.Group).getObjects) {
                    images = images.concat(getVisibleImages((obj as fabric.Group).getObjects()));
                }
            }
            return images;
        };

        const canvasImages = getVisibleImages(canvas.getObjects());

        if (imageElements.length === canvasImages.length) {
            let modified = false;
            imageElements.forEach((imgEl, index) => {
                const fabricImg = canvasImages[index];
                if (!imgEl.hasAttribute('width') && fabricImg.width) {
                    imgEl.setAttribute('width', fabricImg.width.toString());
                    modified = true;
                }
                if (!imgEl.hasAttribute('height') && fabricImg.height) {
                    imgEl.setAttribute('height', fabricImg.height.toString());
                    modified = true;
                }
            });

            if (modified) {
                const serializer = new XMLSerializer();
                svg = serializer.serializeToString(doc);
            }
        }
    } catch (err) {
        console.warn('SVG Post-processing failed:', err);
    }

    // Restore precision
    fabric.config.configure({ NUM_FRACTION_DIGITS: 12 });

    // Restore visibility
    objectsToHide.forEach((obj, index) => obj.visible = originalVisibilities[index]);

    // Restore background color
    canvas.backgroundColor = originalBg;

    // Use Backend Save (Bypassing Browser Security)
    try {
        return await hwFacade.dialogSaveRecipeFile(svg, filename.endsWith('.svg') ? filename : `${filename}.svg`);
    } catch (err) {
        console.error('Export SVG Failed:', err);
        return { ok: false, message: String(err) };
    }
};

/**
 * @brief SVG 파일을 벡터 객체로 파싱하여 캔버스에 로드한다.
 * @return 캔버스에 추가된 객체 수 (0 = 유효한 벡터 객체 없음)
 * @throws 파일 읽기/SVG 파싱 실패 시
 */
export const importFromSVG = (canvas: fabric.Canvas, file: File): Promise<number> => {
    return new Promise<number>((resolvePromise, rejectPromise) => {
    const reader = new FileReader();
    reader.onerror = () => rejectPromise(new Error(`Failed to read file: ${file.name}`));
    reader.onload = async (e) => {
        const svgString = e.target?.result as string;
        if (!svgString) {
            rejectPromise(new Error(`Empty SVG file: ${file.name}`));
            return;
        }

        try {
            // 1. Attempt to load as Vector first
            const { objects, options } = await fabric.loadSVGFromString(svgString);

            let useImageFallback = false;

            if (objects && objects.length > 0) {
                const validObjects = objects.filter((obj): obj is fabric.FabricObject => obj !== null);

                // 2. Detect "Black Box" (Best for Antigravity) or backgrounds
                if (validObjects.length > 0) {
                    const bgObj = validObjects[0];
                    // Ignore Groups for background detection
                    if (bgObj.type !== 'group') {
                        const svgWidth = options.width || 0;
                        const svgHeight = options.height || 0;

                        const isFullSize = bgObj.width && bgObj.height &&
                            Math.abs(bgObj.width - svgWidth) < 5 &&
                            Math.abs(bgObj.height - svgHeight) < 5;

                        if (isFullSize) {
                            const fill = bgObj.fill as string;
                            if (fill && typeof fill === 'string') {
                                try {
                                    const color = new fabric.Color(fill);
                                    const rgb = color.getSource();
                                    const isBlack = rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0;
                                    const isWhite = rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255;

                                    if (isBlack || isWhite) {
                                        // If it's a solid black or white full-size rect/path, it's likely a background.
                                        // Instead of forcing image fallback, we remove this background and keep vectors.
                                        validObjects.shift(); 
                                        console.log('[importFromSVG] Removed background object:', bgObj.type, fill);
                                    }
                                } catch (e) {
                                    console.warn('Color parsing failed for background detection:', e);
                                }
                            }
                        }
                    }
                }

                if (useImageFallback) {
                    // 3. Image Fallback with Sanitization
                    getSanitizedSVGBlob(file).then(url => {
                        fabric.Image.fromURL(url).then((img) => {
                            const canvasWidth = canvas.width || 800;
                            const canvasHeight = canvas.height || 600;

                            const scale = Math.min(
                                (canvasWidth * 0.8) / (img.width || 100),
                                (canvasHeight * 0.8) / (img.height || 100)
                            );
                            img.scale(scale);
                            img.set({
                                left: 0,
                                top: 0,
                                originX: 'center',
                                originY: 'center'
                            });
                            canvas.add(img);
                            canvas.setActiveObject(img);
                            canvas.requestRenderAll();
                            URL.revokeObjectURL(url);
                            resolvePromise(1);
                        });
                    });

                } else {
                    // 4. Vector Loading (Standard)
                    const visibleObjects = validObjects.filter(obj => obj.visible !== false && obj.opacity !== 0);
                    
                    // Apply default styling to vector objects if they lack stroke
                    visibleObjects.forEach(obj => {
                        if (!obj.stroke || obj.stroke === 'transparent' || obj.stroke === 'none') {
                            obj.set({
                                stroke: '#00BEFF',
                                strokeWidth: 1 / (canvas.getZoom() || 1),
                                strokeUniform: true
                            });
                        }
                    });

                    if (visibleObjects.length > 0) {
                        const obj = visibleObjects.length === 1 ? visibleObjects[0] : new fabric.Group(visibleObjects);
                        const canvasWidth = canvas.width || 800;
                        const canvasHeight = canvas.height || 600;

                        const { pxPerMm } = useCanvasStore.getState();

                        obj.set({
                            left: 0,
                            top: 0,
                            originX: 'center',
                            originY: 'center',
                            scaleX: pxPerMm.x,
                            scaleY: pxPerMm.y
                        });

                        canvas.add(obj);
                        canvas.setActiveObject(obj);
                        canvas.requestRenderAll();
                        resolvePromise(visibleObjects.length);
                    } else {
                        resolvePromise(0);
                    }
                }
            } else {
                resolvePromise(0);
            }
        } catch (error) {
            console.error('Error loading SVG:', error);
            rejectPromise(error instanceof Error ? error : new Error(String(error)));
        }
    };
    reader.readAsText(file);
    });
};

/**
 * @brief 캔버스 전체를 JSON으로 직렬화하여 네이티브 저장 다이얼로그로 저장한다.
 * @return 백엔드 저장 결과
 */
export const exportToJSON = async (canvas: fabric.Canvas, filename: string = 'recipe'): Promise<{ ok: boolean; message?: string }> => {
    // [FIX] Include custom properties in JSON serialization
    const customProps = ['isMeasurement', 'isGuide', 'isTemp', 'isPaper', 'isGridLine', 'id', 'selectable', 'evented', 'lockMovementX', 'lockMovementY', 'lockScalingX', 'lockScalingY', 'lockRotation', 'markPointTime', 'fillEnabled', 'strokeEnabled', 'fillOpacity', 'fillSettings', 'customData', 'startAngle', 'endAngle', 'radius', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points'];
    const jsonObj = (canvas as any).toJSON(customProps);
    const json = JSON.stringify(jsonObj, null, 2); // Pretty print

    try {
        return await hwFacade.dialogSaveRecipeFile(json, filename.endsWith('.json') ? filename : `${filename}.json`);
    } catch (err) {
        console.error('Export JSON Failed:', err);
        return { ok: false, message: String(err) };
    }
};

/**
 * @brief 캔버스를 raster 이미지(PNG/JPEG/WebP)로 렌더링하여 네이티브 저장 다이얼로그로 저장한다.
 *
 * exportToSVG와 동일하게 비디자인 객체(Paper/Grid/Guide/측정)를 숨기고,
 * Paper 영역을 크롭하여 출력한다. WebP 인코딩은 Chromium 네이티브 코덱을 사용한다.
 *
 * @pattern Strategy — exportCanvas 레지스트리의 raster 전략.
 * @return 백엔드 저장 결과 (dialogSaveImage: Base64 디코딩 후 파일 기록)
 */
export const exportToRaster = async (
    canvas: fabric.Canvas,
    filename: string,
    format: 'png' | 'jpeg' | 'webp'
): Promise<{ ok: boolean; message?: string }> => {
    const originalBg = canvas.backgroundColor;
    // JPEG는 알파 미지원 → 흰 배경, PNG/WebP는 투명 유지
    canvas.backgroundColor = format === 'jpeg' ? '#ffffff' : '';

    const objectsToHide = canvas.getObjects().filter(obj =>
        (obj as any).isPaper ||
        (obj as any).isGridLine ||
        (obj as any).isGuide ||
        (obj as any).isTemp ||
        (obj as any).isMeasurement
    );
    const originalVisibilities = objectsToHide.map(obj => obj.visible);
    objectsToHide.forEach(obj => obj.visible = false);

    try {
        // Paper 영역 크롭: 절대 좌표 → viewport(엘리먼트) 좌표 변환
        const paperObj = canvas.getObjects().find(obj => (obj as any).isPaper);
        let opts: any = { format: (format === 'webp' ? 'png' : format), quality: 0.95, multiplier: 1, enableRetinaScaling: false };
        if (paperObj && paperObj.left !== undefined && paperObj.top !== undefined && paperObj.width && paperObj.height) {
            const vpt = canvas.viewportTransform;
            const tl = fabric.util.transformPoint(new fabric.Point(paperObj.left, paperObj.top), vpt);
            const br = fabric.util.transformPoint(new fabric.Point(paperObj.left + paperObj.width, paperObj.top + paperObj.height), vpt);
            const w = br.x - tl.x;
            const h = br.y - tl.y;
            // 목표 해상도: 긴 변 최대 4096px (배율 상한 8x)
            const maxSide = Math.max(Math.abs(w), Math.abs(h));
            const mult = maxSide > 0 ? Math.min(4096 / maxSide, 8) : 1;
            opts = { ...opts, left: tl.x, top: tl.y, width: w, height: h, multiplier: mult };
        }

        let dataUrl: string = canvas.toDataURL(opts);
        if (format === 'webp') {
            // fabric 타입은 png/jpeg만 정의 → 엘리먼트 재인코딩으로 WebP 생성
            const img = new Image();
            await new Promise<void>((res, rej) => {
                img.onload = () => res();
                img.onerror = () => rej(new Error('WebP re-encode failed'));
                img.src = dataUrl;
            });
            const off = document.createElement('canvas');
            off.width = img.width;
            off.height = img.height;
            const ctx = off.getContext('2d');
            if (!ctx) return { ok: false, message: 'Canvas context unavailable' };
            ctx.drawImage(img, 0, 0);
            dataUrl = off.toDataURL('image/webp', 0.95);
        }

        const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
        const ext = format === 'jpeg' ? 'jpg' : format;
        const finalName = filename.toLowerCase().endsWith(`.${ext}`) ? filename : `${filename}.${ext}`;
        return await hwFacade.dialogSaveImage(base64, finalName);
    } catch (err) {
        console.error(`Export ${format.toUpperCase()} Failed:`, err);
        return { ok: false, message: String(err) };
    } finally {
        // Restore visibility & background
        objectsToHide.forEach((obj, index) => obj.visible = originalVisibilities[index]);
        canvas.backgroundColor = originalBg;
        canvas.requestRenderAll();
    }
};

/**
 * @brief DXF Export 전략 — 직렬화(generateDXF) 후 네이티브 저장 다이얼로그 호출.
 * @return 백엔드 저장 결과 (message에 엔티티 통계 포함)
 */
export const exportToDXF = async (canvas: fabric.Canvas, filename: string): Promise<{ ok: boolean; message?: string }> => {
    try {
        const { data, entityCount, skippedImages } = await generateDXF(canvas);
        if (entityCount === 0) {
            return { ok: false, message: 'No vector objects to export as DXF' };
        }
        const finalName = filename.endsWith('.dxf') ? filename : `${filename}.dxf`;
        const result = await hwFacade.dialogSaveRecipeFile(data, finalName);
        if (result.ok && skippedImages > 0) {
            return { ok: true, message: `${entityCount} entities (${skippedImages} raster image(s) skipped)` };
        }
        return result;
    } catch (err) {
        console.error('Export DXF Failed:', err);
        return { ok: false, message: String(err) };
    }
};

/**
 * @brief Export 포맷 전략 레지스트리 (Strategy Registry 패턴).
 *        Toolbar의 Export 다이얼로그가 선택 포맷으로 위임 호출한다.
 */
export const exportCanvas = async (
    canvas: fabric.Canvas,
    format: ExportFormat,
    filename: string
): Promise<{ ok: boolean; message?: string }> => {
    switch (format) {
        case 'svg': return exportToSVG(canvas, filename);
        case 'json': return exportToJSON(canvas, filename);
        case 'dxf': return exportToDXF(canvas, filename);
        case 'png':
        case 'jpeg':
        case 'webp':
            return exportToRaster(canvas, filename, format);
        default:
            return { ok: false, message: `Unsupported export format: ${format}` };
    }
};

export const importFromJSON = (canvas: fabric.Canvas, file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
        const jsonString = e.target?.result as string;
        if (!jsonString) return;

        try {
            await canvas.loadFromJSON(jsonString);
            canvas.requestRenderAll();
        } catch (err) {
            console.error('Error loading JSON:', err);
        }
    };
    reader.readAsText(file);
};
