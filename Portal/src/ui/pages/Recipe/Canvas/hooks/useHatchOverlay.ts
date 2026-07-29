import { useEffect } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from '../useCanvasStore';
import { vectorizeText } from '../../../../../utils/textToPath';

// [PATCH] Prevent Fabric.js from rendering the original full-size Fill face when hatching with Margin is enabled.
// The shrunken Fill face will be drawn perfectly by the HatchOverlay instead.
if (!(fabric.Object.prototype as any)._originalRenderFillHatchPatched) {
    const originalRenderFill = (fabric.Object.prototype as any)._renderFill;
    if (originalRenderFill) {
        (fabric.Object.prototype as any)._renderFill = function(ctx: CanvasRenderingContext2D) {
            const fsettings = this.fillSettings || this.customData?.fillSettings;
            const marginMm = fsettings?.margin || 0;
            if (fsettings && fsettings.enableFill && marginMm > 0) {
                // Skip the native rendering of the face to avoid overlapping with the shrinked overlay.
                return;
            }
            originalRenderFill.call(this, ctx);
        };
        (fabric.Object.prototype as any)._originalRenderFillHatchPatched = true;
    }
}

export function useHatchOverlay() {
    const { canvas, pxPerMm } = useCanvasStore();

    useEffect(() => {
        if (!canvas) return;

        const handleAfterRender = (opt: any) => {
            const ctx = opt.ctx;
            if (!ctx) return;

            const activeObject = canvas.getActiveObject();
            const hoverTarget = canvas._hoveredTarget;

            // Draw info tooltip in screen coordinates ONLY if hovered or selected
            const drawTooltip = (obj: fabric.Object, parentGroup?: fabric.Group, parentMatrix?: any) => {
                const fsettings = (obj as any).fillSettings;
                if (!fsettings || !fsettings.enableFill || fsettings.lineSpacing <= 0) return;
                // Bypass transparent fill block to allow hatching transparent objects

                let isHoveredOrSelected = false;
                if (activeObject) {
                    if (activeObject === obj || activeObject === parentGroup || activeObject === parentMatrix) isHoveredOrSelected = true;
                    if (activeObject.type === 'activeselection' && (activeObject as fabric.ActiveSelection).contains(obj)) isHoveredOrSelected = true;
                }
                if (hoverTarget) {
                    if (hoverTarget === obj || hoverTarget === parentGroup || hoverTarget === parentMatrix) isHoveredOrSelected = true;
                }

                if (isHoveredOrSelected) {
                    const vptCache = canvas.viewportTransform;
                    if (vptCache) {
                        ctx.save();
                        
                        const center = obj.getCenterPoint();
                        const screenCenter = fabric.util.transformPoint(new fabric.Point(center.x, center.y), vptCache);

                        ctx.font = '12px "Inter", "Roboto", sans-serif';
                        ctx.textAlign = 'center';
                        const textLines = [
                            `Profile: ${fsettings.enableProfile ? 'ON' : 'OFF'}`,
                            `Start Point: ${fsettings.profileStartPoint}`,
                            `Progression: ${fsettings.fillProgression}`,
                            `Fill Type: ${fsettings.fillType}`,
                            `Angle: ${fsettings.angle}, Spacing: ${fsettings.lineSpacing}mm`,
                            `Margin: ${fsettings.margin}mm`
                        ];

                        const lh = 18;
                        const textH = textLines.length * lh;
                        const bgW = 180;

                        const h = (obj.height || 0) * (obj.scaleY || 1);
                        const topScreen = fabric.util.transformPoint(new fabric.Point(center.x, center.y - h / 2), vptCache);
                        const textY = Math.max(10, topScreen.y - textH - 25);

                        ctx.fillStyle = 'rgba(20, 30, 40, 0.85)';
                        ctx.beginPath();
                        if (typeof ctx.roundRect === 'function') {
                            ctx.roundRect(screenCenter.x - bgW / 2, textY, bgW, textH + 12, 6);
                        } else {
                            ctx.rect(screenCenter.x - bgW / 2, textY, bgW, textH + 12);
                        }
                        ctx.fill();

                        ctx.fillStyle = '#00FFFF';
                        textLines.forEach((line, i) => {
                            ctx.fillText(line, screenCenter.x, textY + 16 + i * lh);
                        });

                        ctx.restore();
                    }
                }
            };

            const objects = canvas.getObjects();
            ctx.save();
            
            // Function to draw vectorized hatch block
            const renderObjectHatch = (obj: fabric.Object) => {
                const fsettings = (obj as any).fillSettings;
                if (!fsettings || !fsettings.enableFill || fsettings.lineSpacing <= 0) return;
                if (!obj.visible) return;
                // Bypass transparent fill block to allow hatching transparent objects
                if ((obj.type === 'i-text' || obj.type === 'text') && (obj as any).isEditing) return;

                // [FIX] "Enable Profile" only matters if an outline pass is actually emitted
                // (Style "Line" checked). Mirrors doProfile in ScannerGenerator.ts / useGCodeGenerator.ts.
                const strokeEnabled = (obj as any).strokeEnabled ?? !!(obj.stroke && obj.stroke !== 'transparent');
                const effectiveEnableProfile = strokeEnabled && !!fsettings.enableProfile;

                const center = obj.getCenterPoint();
                const absoluteMatrix = obj.calcTransformMatrix();
                const opt = fabric.util.qrDecompose(absoluteMatrix);
                
                const objScaleX = opt.scaleX;
                const objScaleY = opt.scaleY;
                const objRot = opt.angle;

                // [FIX 2] Add obj.angle to fsettings.angle to rotate hatch lines with the object
                const combinedAngle = (fsettings.angle || 0) + objRot;
                const rad = fabric.util.degreesToRadians(combinedAngle);

                const w = (obj.width || 0) * objScaleX;
                const h = (obj.height || 0) * objScaleY;
                const maxDim = Math.max(w, h);
                const avgPxPerMm = (pxPerMm.x + pxPerMm.y) / 2;
                const lineSpacingPx = fsettings.lineSpacing * avgPxPerMm;

                ctx.save();
                const vpt = canvas.viewportTransform;
                if (vpt) {
                    ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
                }

                ctx.save(); // inner save for absolute matrix
                const absMatrix = ctx.getTransform();

                // 1. Calculate visual margin scaling/offset for the clipping mask
                const marginMm = fsettings.margin || 0;
                const mX = (marginMm * pxPerMm.x);
                const mY = (marginMm * pxPerMm.y);
                const localMarginX = mX / Math.max(0.001, Math.abs(objScaleX));
                const localMarginY = mY / Math.max(0.001, Math.abs(objScaleY));

                // For complex shapes, we use global scale shrinking. For primitives, we use direct offset.
                const isComplexShape = ['path', 'polygon', 'polyline', 'triangle', 'i-text', 'text'].includes(obj.type);
                
                ctx.translate(center.x, center.y);
                ctx.rotate(fabric.util.degreesToRadians(objRot));
                ctx.scale(objScaleX, objScaleY);

                if (isComplexShape && marginMm > 0) {
                    const baseW = obj.width || 0.001;
                    const baseH = obj.height || 0.001;
                    const scaleShrinkX = Math.max(0.0001, (baseW * Math.abs(objScaleX) - mX * 2) / (baseW * Math.abs(objScaleX)));
                    const scaleShrinkY = Math.max(0.0001, (baseH * Math.abs(objScaleY) - mY * 2) / (baseH * Math.abs(objScaleY)));
                    ctx.scale(scaleShrinkX, scaleShrinkY);
                }

                ctx.beginPath();
                if (obj.type === 'rect') {
                    const w = Math.max(0, (obj.width || 0) - localMarginX * 2);
                    const h = Math.max(0, (obj.height || 0) - localMarginY * 2);
                    ctx.rect(-w / 2, -h / 2, w, h);
                } else if (obj.type === 'circle') {
                    const circle = obj as any;
                    const avgLocalMargin = (localMarginX + localMarginY) / 2;
                    const radius = Math.max(0, (circle.radius || 0) - avgLocalMargin);
                    
                    const startVal = circle.startAngle !== undefined ? circle.startAngle : 0;
                    const endVal = circle.endAngle !== undefined ? circle.endAngle : 360;
                    
                    // Support both Radian and Degree values safely
                    const isRadian = Math.abs(endVal - startVal) <= Math.PI * 2 + 0.1;
                    const startRad = isRadian ? startVal : fabric.util.degreesToRadians(startVal);
                    const endRad = isRadian ? endVal : fabric.util.degreesToRadians(endVal);
                    
                    const isFullCircle = Math.abs(endRad - startRad) >= Math.PI * 2 - 0.01;

                    if (isFullCircle) {
                        ctx.arc(0, 0, radius, 0, Math.PI * 2);
                    } else {
                        // Chord clipping mask for Arc/Half-moon (matches Fabric's native fill behavior)
                        ctx.arc(0, 0, radius, startRad, endRad);
                        ctx.closePath();
                    }
                } else if (obj.type === 'ellipse') {
                    const anyObj: any = obj;
                    const rx = Math.max(0, (anyObj.rx ?? ((anyObj.width ?? 0) / 2)) - localMarginX);
                    const ry = Math.max(0, (anyObj.ry ?? ((anyObj.height ?? 0) / 2)) - localMarginY);
                    if (typeof ctx.ellipse === 'function') {
                        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
                    } else {
                        ctx.rect(-rx, -ry, rx * 2, ry * 2);
                    }
                } else if (obj.type === 'triangle') {
                    const tw = obj.width || 0;
                    const th = obj.height || 0;
                    ctx.moveTo(0, -th / 2);
                    ctx.lineTo(-tw / 2, th / 2);
                    ctx.lineTo(tw / 2, th / 2);
                    ctx.closePath();
                } else if (obj.type === 'polygon' || obj.type === 'polyline') {
                    const points = (obj as any).points;
                    const pathObj = obj as any;
                    if (points && points.length > 0) {
                        ctx.moveTo(points[0].x - (pathObj.pathOffset?.x || 0), points[0].y - (pathObj.pathOffset?.y || 0));
                        for (let i = 1; i < points.length; i++) {
                            ctx.lineTo(points[i].x - (pathObj.pathOffset?.x || 0), points[i].y - (pathObj.pathOffset?.y || 0));
                        }
                        if (obj.type === 'polygon') ctx.closePath();
                    }
                } else if (obj.type === 'path') {
                    if ((obj as any)._renderPathCommands) {
                        (obj as any)._renderPathCommands(ctx);
                    } else {
                        ctx.rect(-(obj.width || 0) / 2, -(obj.height || 0) / 2, obj.width || 0, obj.height || 0);
                    }
                } else {
                    ctx.rect(-(obj.width || 0) / 2, -(obj.height || 0) / 2, obj.width || 0, obj.height || 0);
                }

                const isIndividualText = (obj.type === 'i-text' || obj.type === 'text') && (obj as any).__cachedIndividualPaths && typeof Path2D !== 'undefined';
                const cachedObj = obj as any;
                if ((obj.type === 'i-text' || obj.type === 'text') && (!cachedObj.__cachedIndividualPaths || cachedObj.__cacheVersion !== 5)) {
                    if (!(obj as any).__isVectorizing) {
                        (obj as any).__isVectorizing = true;
                        vectorizeText(obj as any).then(() => {
                            (obj as any).__isVectorizing = false;
                            canvas.requestRenderAll();
                        }).catch(() => {
                            (obj as any).__isVectorizing = false;
                        });
                    }
                    ctx.restore();
                    ctx.restore();
                    return; 
                }

                const drawHatchBlock = (setupClip: () => void, getCorners: () => fabric.Point[], blockCenter: fabric.Point) => {
                    ctx.save(); 
                    setupClip();
                    ctx.beginPath(); // [FIX] Clear the clip path from the current path so it doesn't get stroked
                    ctx.setTransform(absMatrix);

                    const zoom = canvas.getZoom();
                    ctx.translate(blockCenter.x, blockCenter.y);
                    ctx.rotate(rad); // fsettings.angle + obj.angle
                    
                    ctx.strokeStyle = '#00FFFF'; 
                    ctx.lineWidth = 1.5 / zoom;

                    const coords = getCorners();
                    let minX = Infinity, maxX = -Infinity;
                    let minY = Infinity, maxY = -Infinity;

                    coords.forEach(pt => {
                        const dx = pt.x - blockCenter.x;
                        const dy = pt.y - blockCenter.y;
                        const rx = dx * Math.cos(-rad) - dy * Math.sin(-rad);
                        const ry = dx * Math.sin(-rad) + dy * Math.cos(-rad);
                        if (rx < minX) minX = rx;
                        if (rx > maxX) maxX = rx;
                        if (ry < minY) minY = ry;
                        if (ry > maxY) maxY = ry;
                    });

                    // [FIX] Shrink the sweep bounds by margin to ensure OptimizedTwoWay connecting lines are drawn INSIDE the clipping mask
                    const marginShrink = marginMm > 0 ? (marginMm * avgPxPerMm) : (0.001 * avgPxPerMm);
                    minX += marginShrink;
                    maxX -= marginShrink;
                    minY += marginShrink;
                    maxY -= marginShrink;

                    if (minX > maxX || minY > maxY) {
                        ctx.restore();
                        return;
                    }

                    const step = Math.max(lineSpacingPx, 0.01);
                    let isHorizontal = fsettings.fillProgression === 'T2B' || fsettings.fillProgression === 'B2T';
                    const startPrimary = isHorizontal ?
                        (fsettings.fillProgression === 'T2B' ? minY : maxY) :
                        (fsettings.fillProgression === 'L2R' ? minX : maxX);
                    const endPrimary = isHorizontal ?
                        (fsettings.fillProgression === 'T2B' ? maxY : minY) :
                        (fsettings.fillProgression === 'L2R' ? maxX : minX);
                    const stepPrimary = (endPrimary > startPrimary) ? step : -step;

                    ctx.beginPath();
                    let p = startPrimary;
                    const limit = endPrimary;

                    const eps = 0.0001 * avgPxPerMm;
                    
                    const skipHatchBoundary = effectiveEnableProfile && marginMm <= 0;

                    if (skipHatchBoundary) p += stepPrimary;

                    const condition = stepPrimary > 0 
                        ? (val: number) => skipHatchBoundary ? val <= limit - eps : val <= limit + eps
                        : (val: number) => skipHatchBoundary ? val >= limit + eps : val >= limit - eps;

                    let initL2R = true;
                    const sp = fsettings.profileStartPoint || 'LT';
                    if (sp === 'RT' || sp === 'RB') initL2R = false;
                    if (!isHorizontal) {
                        if (sp === 'LB' || sp === 'RB') initL2R = false;
                        else initL2R = true;
                    }

                    let idx = 0;
                    let prevP = p;

                    for (; condition(p); p += stepPrimary) {
                        let goL2R = initL2R;
                        if ((fsettings.fillType === 'TwoWay' || fsettings.fillType === 'OptimizedTwoWay' || fsettings.fillType === 'OptimizedBow') && (idx % 2 === 1)) {
                            goL2R = !initL2R;
                        }

                        const canConnect = fsettings.fillType === 'OptimizedTwoWay' || fsettings.fillType === 'OptimizedBow';

                        if (isHorizontal) {
                            ctx.moveTo(-canvas.getWidth() * 2, p);
                            ctx.lineTo(canvas.getWidth() * 2, p);
                            if (idx > 0 && canConnect) {
                                const connX = goL2R ? minX : maxX;
                                ctx.moveTo(connX, prevP);
                                ctx.lineTo(connX, p);
                            }
                        } else {
                            ctx.moveTo(p, -canvas.getHeight() * 2);
                            ctx.lineTo(p, canvas.getHeight() * 2);
                            if (idx > 0 && canConnect) {
                                const connY = goL2R ? minY : maxY;
                                ctx.moveTo(prevP, connY);
                                ctx.lineTo(p, connY);
                            }
                        }

                        const dir = goL2R ? 1 : -1;
                        const spanMin = isHorizontal ? minX : minY;
                        const spanMax = isHorizontal ? maxX : maxY;
                        const lineCenter = (spanMin + spanMax) / 2;

                        const arrowW = 6 / zoom;
                        const arrowH = 4 / zoom;
                        const arrowGap = 60 / zoom;

                        const arrowPositions: number[] = [lineCenter];
                        for (let offset = arrowGap; lineCenter + offset < spanMax - arrowW; offset += arrowGap) {
                            arrowPositions.push(lineCenter + offset);
                            arrowPositions.push(lineCenter - offset);
                        }

                        for (const a of arrowPositions) {
                            if (a < spanMin + arrowW || a > spanMax - arrowW) continue;

                            if (isHorizontal) {
                                ctx.moveTo(a, p);
                                ctx.lineTo(a - arrowW * dir, p - arrowH);
                                ctx.moveTo(a, p);
                                ctx.lineTo(a - arrowW * dir, p + arrowH);
                            } else {
                                ctx.moveTo(p, a);
                                ctx.lineTo(p - arrowH, a - arrowW * dir);
                                ctx.moveTo(p, a);
                                ctx.lineTo(p + arrowH, a - arrowW * dir);
                            }
                        }

                        prevP = p;
                        idx++;
                    }
                    ctx.stroke();
                    ctx.restore();
                };

                if (isIndividualText) {
                    const paths = (obj as any).__cachedIndividualPaths as { pathData: string, bounds: { x1: number, y1: number, x2: number, y2: number } }[];
                    const matrix = fabric.util.composeMatrix({
                        translateX: center.x,
                        translateY: center.y,
                        angle: objRot,
                        scaleX: objScaleX,
                        scaleY: objScaleY,
                    });

                    paths.forEach(charPath => {
                        drawHatchBlock(() => {
                            const p2d = new Path2D(charPath.pathData);
                            ctx.clip(p2d, 'evenodd');
                        }, () => {
                            const b = charPath.bounds;
                            const pts = [
                                { x: b.x1, y: b.y1 },
                                { x: b.x2, y: b.y1 },
                                { x: b.x2, y: b.y2 },
                                { x: b.x1, y: b.y2 }
                            ];
                            return pts.map(pt => fabric.util.transformPoint(new fabric.Point(pt.x, pt.y), matrix));
                        }, center);
                    });
                } else {
                    drawHatchBlock(() => {
                        ctx.clip('evenodd');
                        
                        // [NEW] If margin > 0, we skipped native filling. We must draw the shrunken fill face here before hatching!
                        const fillVal = (obj.fill || 'transparent') as string;
                        if (marginMm > 0 && fillVal !== 'transparent') {
                            ctx.fillStyle = fillVal;
                            ctx.fill();
                        }
                    }, () => {
                        // [FIX] Use stroke-independent size (w/h from line 121-122, same source as
                        // FabricToPaperAdapter.convertRect) instead of obj.getCoords(), which inflates
                        // the bounding box by strokeWidth and lets an extra hatch line sneak in near the edge.
                        const halfW = w / 2, halfH = h / 2;
                        const ang = fabric.util.degreesToRadians(objRot);
                        const cosA = Math.cos(ang), sinA = Math.sin(ang);
                        const local: [number, number][] = [[-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH]];
                        return local.map(([lx, ly]) => new fabric.Point(
                            center.x + lx * cosA - ly * sinA,
                            center.y + lx * sinA + ly * cosA
                        ));
                    }, center);
                }

                ctx.restore();
                ctx.restore();
            };

            // [FIX 1] Safely traverse objects including Groups without messing up the main context state
            const traverseAndRender = (obj: fabric.Object, skipMatrixCalc: boolean = false) => {
                if (!obj || !obj.visible) return;

                if (obj.type === 'MatrixRepeater') {
                    const repeater = obj as any;
                    const virtuals = repeater.getVirtualObjects() as fabric.Object[];
                    virtuals.forEach(v => {
                        const r = (v as any).customData?.row;
                        const c = (v as any).customData?.col;
                        const cellKey = `${r}_${c}`;
                        const override = repeater.overrides?.[cellKey];
                        if (override?.visible === false) return;

                        const srcObj = repeater.sourceObjects?.[0];
                        const fsettings = override?.fillSettings || v.fillSettings || srcObj?.fillSettings;
                        const fillVal = override?.fill || v.fill || srcObj?.fill;

                        if (fsettings && fsettings.enableFill && fillVal && fillVal !== 'transparent') {
                            const mockObj = Object.create(v);
                            mockObj.fillSettings = fsettings;
                            mockObj.fill = fillVal;
                            
                            // Virtual objects from MatrixRepeater already have their coords calculated correctly globally
                            renderObjectHatch(mockObj);
                            
                            // Tooltip should point to the Repeater parent for clean UI
                            drawTooltip(mockObj, undefined, repeater);
                        }
                    });
                }
                else if (obj.type === 'group' || obj.type === 'Group' || obj.type === 'activeselection' || obj instanceof fabric.Group) {
                    const group = obj as fabric.Group;
                    const children = group.getObjects();
                    children.forEach(child => {
                        renderObjectHatch(child);
                    });
                    
                    // Tooltip is drawn on the parent Group
                    drawTooltip(group);
                }
                else {
                    renderObjectHatch(obj);
                    drawTooltip(obj);
                }
            };

            // Process ActiveSelection separately if it exists
            const renderList = [...objects];
            if (activeObject && activeObject.type === 'activeselection') {
                if (!renderList.includes(activeObject)) {
                    renderList.push(activeObject);
                }
            }

            renderList.forEach(obj => {
                // Skip children of active selections or groups since they are rendered via their parent
                if (obj.group && renderList.includes(obj.group)) return;
                
                traverseAndRender(obj);
            });
            
            ctx.restore();
        };

        canvas.on('after:render', handleAfterRender);

        return () => {
            canvas.off('after:render', handleAfterRender);
        };
    }, [canvas, pxPerMm]);
}
