/**
 * @file ImageProcessor.ts
 * @brief Shared image processing logic for Laser Scanner / GCode generation.
 */

export class ImageProcessor {
    /**
     * Extracts a binarized (1 or 0) pixel array from an image element.
     * Matches the exact algorithm used in CanvasTopBar for live preview.
     * 
     * @param element HTMLImageElement or HTMLCanvasElement
     * @param width Intrinsic width of the image
     * @param height Intrinsic height of the image
     * @param sensitivity Threshold percentage (0-100)
     * @param edgeDetection Whether to use Outline/Edge Detection mode
     * @returns Uint8Array of length width*height, where 1 means dark/markable, 0 means skip
     */
    public static getBinarizedPixels(
        element: HTMLImageElement | HTMLCanvasElement,
        width: number,
        height: number,
        sensitivity: number,
        edgeDetection: boolean
    ): Uint8Array | null {
        if (!element || width <= 0 || height <= 0) return null;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;

        try {
            ctx.drawImage(element, 0, 0, width, height);
        } catch (e) {
            console.warn("ImageProcessor: Failed to draw image to canvas", e);
            return null;
        }

        const data = ctx.getImageData(0, 0, width, height).data;
        const binarized = new Uint8Array(width * height);
        const grayThreshold = sensitivity / 100;

        if (edgeDetection) {
            const edgeThresholdBar = (0.25 * (100 - sensitivity) / 100);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = y * width + x;
                    const idx = i * 4;
                    if (x < width - 1 && y < height - 1) {
                        const rIdx = idx + 4;
                        const bIdx = idx + width * 4;

                        // normalized Gray [0, 1]
                        const gray = (data[idx] + data[idx+1] + data[idx+2]) / 765;
                        const rGray = (data[rIdx] + data[rIdx+1] + data[rIdx+2]) / 765;
                        const bGray = (data[bIdx] + data[bIdx+1] + data[bIdx+2]) / 765;

                        const alpha = data[idx+3] / 255;
                        const rAlpha = data[rIdx+3] / 255;
                        const bAlpha = data[bIdx+3] / 255;

                        const diff = Math.abs(gray - rGray) + Math.abs(gray - bGray) +
                                     Math.abs(alpha - rAlpha) + Math.abs(alpha - bAlpha);

                        if (diff > edgeThresholdBar) {
                            binarized[i] = 1;
                        }
                    }
                }
            }
        } else {
            // Standard Mode
            for (let i = 0; i < width * height; i++) {
                const idx = i * 4;
                const gray = (data[idx] + data[idx+1] + data[idx+2]) / 765;
                const alpha = data[idx+3] / 255;
                if (alpha > 0.1 && gray < grayThreshold) {
                    binarized[i] = 1;
                }
            }
        }

        // Apply denoise filter if sensitivity is very high
        if (sensitivity >= 90) {
            const filtered = new Uint8Array(width * height);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = y * width + x;
                    if (binarized[i] === 1) {
                        let neighbors = 0;
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                if (dx === 0 && dy === 0) continue;
                                const nx = x + dx; 
                                const ny = y + dy;
                                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                    if (binarized[ny * width + nx] === 1) neighbors++;
                                }
                            }
                        }
                        if (neighbors >= 1) {
                            filtered[i] = 1;
                        }
                    }
                }
            }
            return filtered;
        }

        return binarized;
    }
}
