import * as fabric from 'fabric';

const ACTION_NAME = 'modifyPoly';

/**
 * Transforms a point from the canvas plane to the object's local plane.
 * Equivalent to sendPointToPlane in Fabric.js internals.
 */
const sendPointToPlane = (point: fabric.Point, planeMatrix: fabric.TMat2D) => {
    return fabric.util.transformPoint(point, fabric.util.invertTransform(planeMatrix));
};

/**
 * This function locates the controls.
 * It'll be used both for drawing and for interaction.
 */
export const createPolyPositionHandler = (pointIndex: number) => {
    return function (dim: any, finalMatrix: any, polyObject: fabric.Polyline) {
        const x = polyObject.points![pointIndex].x - polyObject.pathOffset.x;
        const y = polyObject.points![pointIndex].y - polyObject.pathOffset.y;

        return fabric.util.transformPoint(
            new fabric.Point(x, y),
            fabric.util.multiplyTransformMatrices(
                polyObject.canvas!.viewportTransform!,
                polyObject.calcTransformMatrix()
            )
        );
    };
};

/**
 * This function defines what the control does.
 * It'll be called on every mouse move after a control has been clicked and is being dragged.
 */
export const polyActionHandler = (
    eventData: MouseEvent,
    transform: any,
    x: number,
    y: number
) => {
    const poly = transform.target as fabric.Polyline;
    const pointIndex = transform.pointIndex;

    const mouseLocalPosition = sendPointToPlane(
        new fabric.Point(x, y),
        poly.calcOwnMatrix()
    );

    const polygonBaseSize = poly._getNonTransformedDimensions();
    const size = poly._getTransformedDimensions();

    const finalPointPosition = {
        x: mouseLocalPosition.x * polygonBaseSize.x / size.x + poly.pathOffset.x,
        y: mouseLocalPosition.y * polygonBaseSize.y / size.y + poly.pathOffset.y
    };

    poly.points![pointIndex] = new fabric.Point(finalPointPosition.x, finalPointPosition.y);

    // Recalculate dimensions
    // Note: setDimensions logic might be complex for Polyline/Polygon in Fabric v6
    // We might need to handle it carefully or let Fabric handle it if possible.
    // For now, let's try simple assignment and see if setCoords/setDimensions works.

    // In the demo:
    // poly.points[pointIndex] = mouseLocalPosition.add(poly.pathOffset);
    // poly.setDimensions();

    // However, sendPointToPlane implementation in demo might be slightly different regarding offsets.
    // Let's stick closer to the demo's logic if possible, but adapted.

    // Re-implementation based on strict demo logic:
    const mouseLocalPos = sendPointToPlane(new fabric.Point(x, y), poly.calcOwnMatrix());
    poly.points![pointIndex] = mouseLocalPos.add(poly.pathOffset);

    // @ts-ignore - setDimensions exists but might have different signature or protected
    if (typeof poly.setDimensions === 'function') {
        // @ts-ignore
        poly.setDimensions();
    }

    return true;
};

/**
 * Keep the polygon in the same position when we change its `width`/`height`/`top`/`left`.
 */
export const factoryPolyActionHandler = (
    pointIndex: number,
    fn: any
) => {
    return function (
        eventData: MouseEvent,
        transform: any,
        x: number,
        y: number
    ) {
        const poly = transform.target as fabric.Polyline;
        const anchorPoint = new fabric.Point(
            poly.points![(pointIndex > 0 ? pointIndex : poly.points!.length) - 1]
        );

        const anchorPointInParentPlane = fabric.util.transformPoint(
            anchorPoint.subtract(poly.pathOffset),
            poly.calcOwnMatrix()
        );

        const actionPerformed = fn(eventData, { ...transform, pointIndex }, x, y);

        const newAnchorPointInParentPlane = fabric.util.transformPoint(
            anchorPoint.subtract(poly.pathOffset),
            poly.calcOwnMatrix()
        );

        const diff = newAnchorPointInParentPlane.subtract(anchorPointInParentPlane);
        poly.left! -= diff.x;
        poly.top! -= diff.y;

        return actionPerformed;
    };
};

export const createPolyActionHandler = (pointIndex: number) => {
    return factoryPolyActionHandler(pointIndex, polyActionHandler);
};

export function createPolyControls(poly: fabric.Polyline) {
    const controls: Record<string, fabric.Control> = {};
    if (!poly.points) return controls;

    poly.points.forEach((point, idx) => {
        controls[`p${idx}`] = new fabric.Control({
            actionName: ACTION_NAME,
            positionHandler: createPolyPositionHandler(idx) as any,
            actionHandler: createPolyActionHandler(idx) as any,
        });
    });

    return controls;
}
