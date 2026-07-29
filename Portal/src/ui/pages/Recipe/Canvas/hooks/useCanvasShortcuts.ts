import { useCallback, useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from '../useCanvasStore';

interface UseCanvasShortcutsProps {
    saveHistory: () => void;
    undo: () => void;
    redo: () => void;
    copy: () => void;
    paste: () => void;
    cut: () => void;
    resetInteraction: () => void;
    resetTempState: () => void;
    handleCompletePolyline: () => void;
    handleCompletePolylineShape: () => void;
    isSpacePressed: React.MutableRefObject<boolean>;
    handleGroup: () => void;
    handleUngroup: () => void;
}

export const useCanvasShortcuts = ({
    saveHistory,
    undo,
    redo,
    copy,
    paste,
    cut,
    resetInteraction,
    resetTempState,
    handleCompletePolyline,
    handleCompletePolylineShape,
    isSpacePressed,
    handleGroup,
    handleUngroup
}: UseCanvasShortcutsProps) => {
    const { canvas, setActiveTool, setMeasureMode } = useCanvasStore();

    const handleSelectAll = useCallback(() => {
        if (!canvas) return;
        canvas.discardActiveObject();
        const sel = new fabric.ActiveSelection(canvas.getObjects().filter(obj =>
            (obj as any).selectable !== false &&
            !(obj as any).isPaper &&
            !(obj as any).isGridLine &&
            !(obj as any).isGuide &&
            !(obj as any).isCrosshair
        ), {
            canvas: canvas,
        });
        canvas.setActiveObject(sel);
        canvas.requestRenderAll();
    }, [canvas]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!canvas) return;

        // [FIX] Ignore shortcuts when typing in Input/Textarea
        const active = document.activeElement as HTMLElement;
        if (active && (
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName.toUpperCase()) ||
            active.isContentEditable
        )) {
            return;
        }

        if (e.code === 'Space') {
            isSpacePressed.current = true;
            canvas.defaultCursor = 'grab';
            canvas.selection = false;
        }

        if (e.code === 'Enter') {
            const { activeTool, measureMode } = useCanvasStore.getState();
            if (activeTool === 'polyline-shape') {
                handleCompletePolylineShape();
            } else if (activeTool === 'measure' && measureMode === 'polyline') {
                handleCompletePolyline();
            }
        }
        if (e.key === 'Escape') {
            resetInteraction();
            setActiveTool('select');
            canvas.requestRenderAll();
            return;
        }
        const { currentScope } = useCanvasStore.getState();

        if (e.key === 'Delete') {
            const activeObjects = canvas.getActiveObjects();
            const activeObject = canvas.getActiveObject();
            if (activeObject instanceof fabric.IText && activeObject.isEditing) {
                return;
            }

            if (activeObjects.length) {
                if (currentScope !== 'recipe') {
                    const hasNonMeasurement = activeObjects.some(obj => !(obj as any).isMeasurement);
                    if (hasNonMeasurement) {
                        return; // Ignore delete key
                    }
                }
                canvas.discardActiveObject();
                activeObjects.forEach((obj) => {
                    // [NEW] Delete linked matrix labels
                    const data = (obj as any).customData;
                    if (data?.matrixId) {
                        const linked = canvas.getObjects().filter(o => 
                            (o as any).customData?.matrixId === data.matrixId && o !== obj
                        );
                        linked.forEach(l => canvas.remove(l));
                    }
                    canvas.remove(obj);
                });
                saveHistory();
            }
        }

        if (e.ctrlKey) {
            if (currentScope !== 'recipe') {
                return;
            }
            switch (e.key.toLowerCase()) {
                case 'a':
                    e.preventDefault();
                    handleSelectAll();
                    return;
                case 'c':
                    e.preventDefault();
                    copy();
                    return;
                case 'v':
                    e.preventDefault();
                    paste();
                    return;
                case 'x':
                    e.preventDefault();
                    cut();
                    return;
                case 'z':
                    e.preventDefault();
                    resetTempState();
                    undo();
                    return;
                case 'y':
                    e.preventDefault();
                    resetTempState();
                    redo();
                    return;
                case 'g':
                    e.preventDefault();
                    if (e.shiftKey) {
                        handleUngroup();
                    } else {
                        handleGroup();
                    }
                    return;
            }
        }

        const activeObj = canvas.getActiveObject();
        if (activeObj instanceof fabric.IText && activeObj.isEditing) return;

        if (e.ctrlKey || e.altKey) return;

        const code = e.code;

        if (currentScope !== 'recipe') {
            switch (code) {
                case 'KeyS': setActiveTool('select'); break;
                case 'KeyH':
                    if (e.shiftKey) {
                        setActiveTool('measure');
                        setMeasureMode('height');
                    } else {
                        setActiveTool('pan');
                    }
                    break;
                case 'KeyR':
                    if (e.shiftKey) {
                        setActiveTool('measure');
                        setMeasureMode('rect');
                    }
                    break;
                case 'KeyC':
                    if (e.shiftKey) {
                        setActiveTool('measure');
                        setMeasureMode('circle');
                    }
                    break;
                case 'KeyP':
                    if (e.shiftKey) {
                        setActiveTool('measure');
                        setMeasureMode('polyline');
                    }
                    break;
                case 'KeyD':
                    if (e.shiftKey) {
                        setActiveTool('measure');
                        setMeasureMode('distance');
                    }
                    break;
                case 'KeyW':
                    if (e.shiftKey) {
                        setActiveTool('measure');
                        setMeasureMode('width');
                    }
                    break;
                case 'KeyA':
                    if (e.shiftKey) {
                        setActiveTool('measure');
                        setMeasureMode('angle');
                    }
                    break;
            }
            return;
        }

        switch (code) {
            case 'KeyS': setActiveTool('select'); break;
            case 'KeyH':
                if (e.shiftKey) {
                    setActiveTool('measure');
                    setMeasureMode('height');
                } else {
                    setActiveTool('pan');
                }
                break;
            case 'KeyR':
                if (e.shiftKey) {
                    setActiveTool('measure');
                    setMeasureMode('rect');
                } else {
                    setActiveTool('rect');
                }
                break;
            case 'KeyC':
                if (e.shiftKey) {
                    setActiveTool('measure');
                    setMeasureMode('circle');
                } else {
                    setActiveTool('circle');
                }
                break;
            case 'KeyL': setActiveTool('line'); break;
            case 'KeyP':
                if (e.shiftKey) {
                    setActiveTool('measure');
                    setMeasureMode('polyline');
                } else {
                    setActiveTool('polyline-shape');
                }
                break;
            case 'KeyT':
                if (e.shiftKey) {
                    setActiveTool('text');
                } else {
                    setActiveTool('triangle');
                }
                break;
            case 'KeyD':
                if (e.shiftKey) {
                    setActiveTool('measure');
                    setMeasureMode('distance');
                } else {
                    setActiveTool('dot');
                }
                break;
            case 'KeyW':
                if (e.shiftKey) {
                    setActiveTool('measure');
                    setMeasureMode('width');
                }
                break;
            // Case KeyE removed for Height (Height is Shift+H)
            case 'KeyA':
                if (e.shiftKey) {
                    setActiveTool('measure');
                    setMeasureMode('angle');
                } else {
                    setActiveTool('arc');
                }
                break;
        }
    }, [canvas, saveHistory, handleSelectAll, copy, paste, cut, undo, redo, resetInteraction, resetTempState, setActiveTool, setMeasureMode, isSpacePressed]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);

    return { handleSelectAll };
};
