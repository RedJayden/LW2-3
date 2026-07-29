import * as fabric from 'fabric';
import opentype from 'opentype.js';

// Map of UI font names to local bundled font files
const FONT_FILE_MAP: Record<string, string> = {
    'Arial': './fonts/arial.ttf',
    'Arial Black': './fonts/arial.ttf', // Fallback
    'Verdana': './fonts/verdana.ttf',
    'Tahoma': './fonts/tahoma.ttf',
    'Trebuchet MS': './fonts/trebuc.ttf',
    'Impact': './fonts/impact.ttf',
    'Times New Roman': './fonts/times.ttf',
    'Georgia': './fonts/georgia.ttf',
    'Garamond': './fonts/times.ttf', // Fallback
    'Courier New': './fonts/cour.ttf',
    'Brush Script MT': './fonts/arial.ttf', // Fallback
    'Comic Sans MS': './fonts/comic.ttf',
    'Roboto': './fonts/arial.ttf', // Fallback
    'Lato': './fonts/arial.ttf', // Fallback
    'Open Sans': './fonts/arial.ttf', // Fallback
    'Montserrat': './fonts/arial.ttf', // Fallback
    'Noto Sans KR': './fonts/NotoSansKR-VF.ttf',
    'Nanum Gothic': './fonts/malgun.ttf', // Fallback
    'Nanum Pen Script': './fonts/malgun.ttf', // Fallback
    'Gaegu': './fonts/malgun.ttf', // Fallback
    'default': './fonts/arial.ttf'
};

// Cache for loaded fonts to avoid re-fetching
const loadedFonts: Record<string, opentype.Font> = {};

/**
 * Loads an opentype font from a URL.
 */
async function loadFont(fontFamily: string): Promise<opentype.Font> {
    const fontUrl = FONT_FILE_MAP[fontFamily] || FONT_FILE_MAP['default'];

    if (loadedFonts[fontUrl]) {
        return loadedFonts[fontUrl];
    }

    return new Promise((resolve, reject) => {
        opentype.load(fontUrl, (err, font) => {
            if (err || !font) {
                console.error(`Failed to load font from ${fontUrl}`, err);
                // Fallback to default
                if (fontUrl !== FONT_FILE_MAP['default']) {
                    loadFont('default').then(resolve).catch(reject);
                } else {
                    reject(err);
                }
            } else {
                loadedFonts[fontUrl] = font;
                resolve(font);
            }
        });
    });
}

/**
 * Use opentype.js to generate a true SVG vector path from a Fabric Text object.
 * This completely avoids pixel tracing artifacts and provides perfect G02/G03 compatibility.
 */
export async function vectorizeText(textObj: fabric.IText | fabric.Text, scaleFactor = 4): Promise<string> {
    // Cache check with strict parameter matching (since 'modified' event doesn't fire on set())
    if (
        (textObj as any).__cachedSvgString &&
        (textObj as any).__cachedIndividualPaths &&
        !(textObj as any).isDirty &&
        (textObj as any).__cachedText === textObj.text &&
        (textObj as any).__cachedFontSize === (textObj.fontSize || 40) &&
        (textObj as any).__cachedFontFamily === (textObj.fontFamily || 'Arial')
    ) {
        return (textObj as any).__cachedSvgString;
    }

    const text = textObj.text || '';
    if (!text) return '';

    const fontFamily = textObj.fontFamily || 'Arial';

    try {
        const font = await loadFont(fontFamily);

        // Opentype generates path based on font metric sizes.
        // Fabric text bounds depends on fontSize, scaleX, scaleY.
        const fontSize = textObj.fontSize || 40;

        // We will generate the base paths at standard fontSize, and let FabricToPaperAdapter handle
        // the scaling (scaleX/scaleY) natively via SVG transformation matrix.
        // Fabric anchors Text slightly differently depending on originX/originY.
        // To keep it simple, we generate the SVG path at (0,0) and use Paper.js to align it to bounds.

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let svgPaths = '';
        let fullPathData = '';

        const lines = text.split('\n');
        const fill = '#000000';

        const individualPaths: { pathData: string, bounds: { x1: number, y1: number, x2: number, y2: number } }[] = [];
        const charBoundsLine = (textObj as any).__charBounds;

        let lineHeights = 0;
        // Always generate path geometry relative to the center of the text bounds,
        // because FabricToPaperAdapter and useHatchOverlay always translate context to `getCenterPoint()`.
        const topOffset = -(textObj.height || 0) / 2;
        const fontSizeFraction = (textObj as typeof fabric.Text.prototype & { _fontSizeFraction?: number })._fontSizeFraction || 0.222;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const textLeftPos = -(textObj.width || 0) / 2;
            const lineLocalPos = typeof (textObj as any)._getLineLeftOffset === 'function' ? (textObj as any)._getLineLeftOffset(i) : 0;
            const lineLeft = textLeftPos + lineLocalPos;
            const lineBounds = charBoundsLine ? charBoundsLine[i] : null;

            // Accurate Fabric.js fillText Y-coordinate baseline:
            // top = _getTopOffset() + sum(getHeightOfLine(0..i-1)) + getHeightOfLineImpl(i)
            // baseline render Y = top - (getHeightOfLineImpl(i) * _fontSizeFraction)
            const currentLineHeight = typeof (textObj as any).getHeightOfLine === 'function' ? (textObj as any).getHeightOfLine(i) : (fontSize * (textObj.lineHeight || 1.16));
            const currentLineHeightImpl = typeof (textObj as any).getHeightOfLineImpl === 'function' ? (textObj as any).getHeightOfLineImpl(i) : currentLineHeight;
            const lineBaselineY = topOffset + lineHeights + currentLineHeightImpl - (currentLineHeightImpl * fontSizeFraction);

            // Fabric's exact X-coordinate accumulator logic from `_renderChars`
            let runningLeftX = lineLeft;
            let boxWidth = 0;
            const sign = (textObj as any).direction === 'rtl' ? -1 : 1;

            for (let c = 0; c < line.length; c++) {
                const char = line[c];

                // Get Fabric character bounds for this specific letter
                const charBox = lineBounds && lineBounds[c] ? lineBounds[c] : null;

                // Emulate `_renderChars` accumulator to find exactly where Canvas placed this character's origin
                if (charBox) {
                    if (boxWidth === 0) {
                        runningLeftX += sign * (charBox.kernedWidth - charBox.width);
                        boxWidth += charBox.width;
                    } else {
                        boxWidth += charBox.kernedWidth;
                    }
                } else {
                    // Fallback
                    runningLeftX += font.getAdvanceWidth(line.slice(0, c), fontSize) - font.getAdvanceWidth(line.slice(0, Math.max(0, c - 1)), fontSize);
                }

                // CRITICAL FIX: Fabric places character origin exactly at `runningLeftX`. 
                // We MUST let opentype.js inherently compute its own left side bearing from this origin. 
                // Previously, we tried to calculate minimum box edges and shift by them, which ruined glyphs like lowercase 'e', 'x', 't' which have intrinsic side bearings.
                const paths = font.getPaths(char, runningLeftX, lineBaselineY, fontSize);

                paths.forEach(p => {
                    const pd = p.toPathData(5);
                    const bbox = p.getBoundingBox();

                    if (pd && pd.length > 0 && pd.indexOf('d=""') === -1) {
                        svgPaths += `            <path d="${pd}" fill="${fill}" fill-rule="evenodd" />\n`;
                        fullPathData += pd + ' ';
                        individualPaths.push({ pathData: pd, bounds: bbox });
                    }

                    if (!isNaN(bbox.x1) && bbox.x1 < minX) minX = bbox.x1;
                    if (!isNaN(bbox.y1) && bbox.y1 < minY) minY = bbox.y1;
                    if (!isNaN(bbox.x2) && bbox.x2 > maxX) maxX = bbox.x2;
                    if (!isNaN(bbox.y2) && bbox.y2 > maxY) maxY = bbox.y2;
                });

                // Prepare accumulator for the next character
                if (charBox) {
                    runningLeftX += sign * boxWidth;
                    boxWidth = 0;
                }
            }

            lineHeights += currentLineHeight;
        }

        const svgString = `<svg xmlns="http://www.w3.org/2000/svg">\n${svgPaths}        </svg>`;

        // Cache it
        (textObj as any).__cachedSvgString = svgString;
        (textObj as any).__cachedPathData = fullPathData.trim();
        (textObj as any).__cachedPathBounds = { minX, minY, maxX, maxY };
        (textObj as any).__cacheVersion = 5;
        (textObj as any).__cachedIndividualPaths = individualPaths;
        (textObj as any).__cachedText = text;
        (textObj as any).__cachedFontSize = fontSize;
        (textObj as any).__cachedFontFamily = fontFamily;
        (textObj as any).isDirty = false;

        // Listen for changes to invalidate cache
        (textObj as any).off('modified', invalidateCache);
        (textObj as any).on('modified', invalidateCache);

        return svgString;

    } catch (err) {
        console.error("Text vectorization failed:", err);
        return ''; // Return empty string on failure
    }
}

function invalidateCache(this: fabric.Object) {
    (this as any).__cachedSvgString = null;
    (this as any).__cachedPathData = null;
    (this as any).__cachedIndividualPaths = null;
    (this as any).isDirty = true;
}
