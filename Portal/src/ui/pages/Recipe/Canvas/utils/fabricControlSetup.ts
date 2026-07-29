
import * as fabric from 'fabric';

/**
 * Adds a Center Drag Control to a specific Fabric object instance.
 * @param obj The Fabric object to modify.
 */
export const addCenterControl = (obj: fabric.Object) => {
    if (!obj.controls) {
        obj.controls = {};
    }

    if (obj.controls.centerControl) return;

    // Define Drag Action
    const dragActionHandler = (eventData: any, transform: fabric.Transform, x: number, y: number) => {
        const { target } = transform;
        target.setPositionByOrigin(new fabric.Point(x, y), 'center', 'center');
        target.fire('moving'); // [FIX] Trigger real-time property sync
        return true;
    };

    // Render Logic - Native to match object style
    const renderFn = fabric.controlsUtils.renderSquareControl;

    // Create Control
    const centerControl = new fabric.Control({
        x: 0,
        y: 0,
        cursorStyle: 'move',
        actionHandler: dragActionHandler,
        actionName: 'drag',
        render: renderFn,
        withConnection: false, // Important for center control
    });

    obj.controls.centerControl = centerControl;
};

/**
 * Global Setup to patch Prototypes.
 * This is arguably more robust for ActiveSelection which is re-created often.
 */
export const configureFabricControls = () => {
    // Define Control Definition (Reusable)
    const dragActionHandler = (eventData: any, transform: fabric.Transform, x: number, y: number) => {
        const { target } = transform;
        target.setPositionByOrigin(new fabric.Point(x, y), 'center', 'center');
        target.fire('moving'); // [FIX] Trigger real-time property sync
        return true;
    };

    // Render Logic - Native to match object style
    const renderFn = fabric.controlsUtils.renderSquareControl;

    const centerControl = new fabric.Control({
        x: 0,
        y: 0,
        cursorStyle: 'move',
        actionHandler: dragActionHandler,
        actionName: 'drag',
        render: renderFn,
        withConnection: false,
    });

    // 1. Patch ActiveSelection Prototype
    // ActiveSelection often overrides controls, so we must add it specifically.
    if (fabric.ActiveSelection && fabric.ActiveSelection.prototype.controls) {
        (fabric.ActiveSelection.prototype.controls as any).centerControl = centerControl;

    }

    // 2. Patch Object Prototype (Fallback/Default)
    if (fabric.Object && fabric.Object.prototype) {
        // [FIX] perPixelTargetFind=true 및 targetFindTolerance=15 설정은 도형이 많을 때 mousemove마다
        // 막대한 CPU 연산(Offscreen Canvas)을 유발하여 크래시를 일으키므로 원복(제거)합니다.
        if (fabric.Object.prototype.controls && !(fabric.Object.prototype.controls as any).centerControl) {
            (fabric.Object.prototype.controls as any).centerControl = centerControl;
        }
    }
};
