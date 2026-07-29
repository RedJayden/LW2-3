import * as fabric from 'fabric';

// Patch fabric.Text.prototype._renderTextDecoration to support underline in stroke-only mode
export const applyFabricPatch = () => {
    // --- [PATCH] Hide solid fill when hatching is enabled ---
    const originalRenderFill = fabric.Object.prototype._renderFill;
    // @ts-ignore
    fabric.Object.prototype._renderFill = function (ctx: CanvasRenderingContext2D) {
        const fsettings = (this as any).fillSettings;
        if (fsettings && fsettings.enableFill && (this as any).fillEnabled && this.fill) {
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.01)'; // Transparent fill to keep it clickable
            ctx.fill();
            ctx.restore();
            return;
        }
        originalRenderFill.call(this, ctx);
    };

    // @ts-ignore
    fabric.Text.prototype._renderTextDecoration = function (
        ctx: CanvasRenderingContext2D,
        type: 'underline' | 'linethrough' | 'overline'
    ) {
        if (!this[type] && !this.styleHas(type)) {
            return;
        }

        // Helper to resolve effective fill color for decoration
        // If fill is transparent/null, use stroke color.
        const getEffectiveFill = (lineIndex: number, charIndex: number) => {
            const fill = this.getValueOfPropertyAt(lineIndex, charIndex, 'fill');
            if (!fill || fill === 'transparent') {
                const stroke = this.getValueOfPropertyAt(lineIndex, charIndex, 'stroke');
                return stroke && stroke !== 'transparent' ? stroke : fill;
            }
            return fill;
        };

        const heightOfLineGetter = this.getHeightOfLine.bind(this);
        let topOffset = this._getTopOffset();
        const leftOffset = this._getLeftOffset(),
            path = this.path,
            charSpacing = this._getWidthOfCharSpacing(),
            offsetAligner =
                type === 'linethrough' ? 0.5 : type === 'overline' ? 1 : 0,
            offsetY = this.offsets[type];

        for (let i = 0, len = this._textLines.length; i < len; i++) {
            const heightOfLine = heightOfLineGetter(i);
            if (!this[type] && !this.styleHas(type, i)) {
                topOffset += heightOfLine;
                continue;
            }
            const line = this._textLines[i];
            const maxHeight = heightOfLine / this.lineHeight;
            const lineLeftOffset = this._getLineLeftOffset(i);
            let boxStart = 0;
            let boxWidth = 0;
            let lastDecoration = this.getValueOfPropertyAt(i, 0, type);
            // [PATCH] Use effective fill
            let lastFill = getEffectiveFill(i, 0);
            let lastTickness = this.getValueOfPropertyAt(i, 0, 'textDecorationThickness');
            let currentDecoration = lastDecoration;
            let currentFill = lastFill;
            let currentTickness = lastTickness;
            const top = topOffset + maxHeight * (1 - this._fontSizeFraction);
            let size = this.getHeightOfChar(i, 0);
            let dy = this.getValueOfPropertyAt(i, 0, 'deltaY');

            for (let j = 0, jlen = line.length; j < jlen; j++) {
                const charBox = this.__charBounds[i][j];
                currentDecoration = this.getValueOfPropertyAt(i, j, type);
                // [PATCH] Use effective fill
                currentFill = getEffectiveFill(i, j);
                currentTickness = this.getValueOfPropertyAt(i, j, 'textDecorationThickness');
                const currentSize = this.getHeightOfChar(i, j);
                const currentDy = this.getValueOfPropertyAt(i, j, 'deltaY');

                if (path && currentDecoration && currentFill) {
                    const finalTickness = (this.fontSize * currentTickness) / 1000;
                    ctx.save();
                    ctx.fillStyle = currentFill as string;
                    ctx.translate(charBox.renderLeft || 0, charBox.renderTop || 0);
                    ctx.rotate(charBox.angle || 0);
                    ctx.fillRect(
                        -charBox.kernedWidth / 2,
                        offsetY * currentSize + currentDy - offsetAligner * finalTickness,
                        charBox.kernedWidth,
                        finalTickness,
                    );
                    ctx.restore();
                } else if (
                    (currentDecoration !== lastDecoration ||
                        currentFill !== lastFill ||
                        currentSize !== size ||
                        currentTickness !== lastTickness ||
                        currentDy !== dy) &&
                    boxWidth > 0
                ) {
                    const finalTickness = (this.fontSize * lastTickness) / 1000;
                    let drawStart = leftOffset + lineLeftOffset + boxStart;
                    if (this.direction === 'rtl') {
                        drawStart = this.width - drawStart - boxWidth;
                    }
                    if (lastDecoration && lastFill && lastTickness) {
                        ctx.fillStyle = lastFill as string;
                        ctx.fillRect(
                            drawStart,
                            top + offsetY * size + dy - offsetAligner * finalTickness,
                            boxWidth,
                            finalTickness,
                        );
                    }
                    boxStart = charBox.left;
                    boxWidth = charBox.width;
                    lastDecoration = currentDecoration;
                    lastTickness = currentTickness;
                    lastFill = currentFill;
                    size = currentSize;
                    dy = currentDy;
                } else {
                    boxWidth += charBox.kernedWidth;
                }
            }
            let drawStart = leftOffset + lineLeftOffset + boxStart;
            if (this.direction === 'rtl') {
                drawStart = this.width - drawStart - boxWidth;
            }
            ctx.fillStyle = currentFill as string;
            const finalTickness = (this.fontSize * currentTickness) / 1000;
            if (currentDecoration && currentFill && currentTickness) {
                ctx.fillRect(
                    drawStart,
                    top + offsetY * size + dy - offsetAligner * finalTickness,
                    boxWidth - charSpacing,
                    finalTickness,
                );
            }
            topOffset += heightOfLine;
        }
        // if there is text background color no
        // other shadows should be casted
        this._removeShadow(ctx);
    };
};

declare module 'fabric' {
    interface CanvasEvents {
        'project:loaded': any;
    }
}
