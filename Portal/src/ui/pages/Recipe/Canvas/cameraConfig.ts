/**
 * @file cameraConfig.ts
 * @brief Configuration for Camera Specifications
 */

export const CAMERA_SPECS = {
    scanner: {
        id: 0,
        magnification: 1,
        resolution: { width: 2448, height: 2048 },
        fov: { width: 40, height: 40 }, // mm
        opticalRes: 3.45, // um
        description: 'Scanner (1x, 40mm FOV)'
    },
    object: {
        id: 1,
        resolution: { width: 2448, height: 2048 },
        opticalRes: 3.45, // um
        lenses: {
            x20: {
                magnification: 20,
                fov: { width: 0.422, height: 0.353 }, // mm
                pxRes: 0.175 // um/pixel
            },
            x50: {
                magnification: 50,
                fov: { width: 0.169, height: 0.141 }, // mm
                pxRes: 0.069 // um/pixel
            }
        }
    }
};

/**
 * Calculates pixels per millimeter based on FOV and Resolution width
 * @param fovWidthMm Field of View width in mm
 * @param imageWidthPx Image width in pixels
 * @returns Pixels per Millimeter
 */
export const calculatePxPerMm = (fovWidthMm: number, imageWidthPx: number) => {
    if (fovWidthMm === 0) return 1000; // Fallback
    return imageWidthPx / fovWidthMm;
};
