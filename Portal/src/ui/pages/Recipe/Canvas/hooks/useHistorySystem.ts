import { useCallback, useRef } from 'react';
import { useCanvasStore } from '../useCanvasStore';
import { useAppStore } from '../../../../../store/appStore';

export const useHistorySystem = (
    initPaper: (preserveViewport?: boolean) => void,
    updateRuler: () => void
) => {
    const { canvas, history, historyStep, setHistory, setHistoryStep } = useCanvasStore();
    const isHistoryProcessing = useRef(false);

    // We use a local ref for history to avoid stale closures in callbacks if we relied solely on store state in some cases,
    // but here we are using the store actions. However, the store updates are async in React state terms? No, Zustand is synchronous usually.
    // But to be safe and match previous logic which used refs:
    // The previous logic used refs for history. We should sync with store.

    // Actually, the previous implementation used refs for history and only synced to store on save/load?
    // Let's look at the store definition.
    // Store has history: string[], historyStep: number.

    // The previous code:
    // const history = useRef<string[]>([]);
    // const historyStep = useRef<number>(-1);

    // And it synced:
    // if (savedHistory.length > 0) { history.current = savedHistory; ... }

    // To keep it simple and robust, let's stick to the store as the source of truth if possible, 
    // OR use refs and sync to store. Using refs is faster for frequent updates (like dragging).
    // Let's use refs for internal management and sync to store when needed (e.g. for persistence).
    // BUT the store is used for persistence.

    // Let's use the store directly. It might cause re-renders but that's probably fine for history updates (on mouse up).

    const saveHistory = useCallback(() => {
        if (!canvas || isHistoryProcessing.current) return;

        const currentHistory = useCanvasStore.getState().history;
        const currentStep = useCanvasStore.getState().historyStep;

        let newHistory = [...currentHistory];
        if (currentStep < newHistory.length - 1) {
            newHistory = newHistory.slice(0, currentStep + 1);
        }

        // [FIX] 'customData'를 포함해야 색상 프리셋 연결 상태(colorPresetLinked)와 Use Default
        // Parameters 강제 재색상화 스냅샷(originalColor/forcedByDefaultParams)이 Undo/Redo 후에도
        // 유지된다. 빠져 있으면 되돌리기 한 번으로 전체 스냅샷 정보가 사라진다.
        const json = (canvas as any).toObject(['id', 'selectable', 'evented', 'isPaper', 'isGridLine', 'isGuide', 'strokeUniform', 'fillEnabled', 'strokeEnabled', 'fillOpacity', 'fillSettings', 'markPointTime', 'excludeFromExport', 'customData']);
        json.objects = json.objects.filter((obj: any) => !obj.isPaper && !obj.isGridLine && !obj.isGuide && !obj.isTemp);

        newHistory.push(JSON.stringify(json));

        // Enforce max history steps
        const maxSteps = useAppStore.getState().maxHistorySteps;
        let finalStep = currentStep + 1;
        if (newHistory.length > maxSteps) {
            newHistory.shift();
            finalStep = newHistory.length - 1;
        }

        setHistory(newHistory);
        setHistoryStep(finalStep);
    }, [canvas, setHistory, setHistoryStep]);

    const undo = useCallback(() => {
        if (!canvas || isHistoryProcessing.current) return;

        const currentHistory = useCanvasStore.getState().history;
        const currentStep = useCanvasStore.getState().historyStep;

        if (currentStep > 0) {
            isHistoryProcessing.current = true;
            const prevStep = currentStep - 1;
            const json = JSON.parse(currentHistory[prevStep]);

            canvas.loadFromJSON(json).then(() => {
                initPaper(true);
                updateRuler();
                canvas.requestRenderAll();
                isHistoryProcessing.current = false;
                setHistoryStep(prevStep);
            });
        }
    }, [canvas, initPaper, updateRuler, setHistoryStep]);

    const redo = useCallback(() => {
        if (!canvas || isHistoryProcessing.current) return;

        const currentHistory = useCanvasStore.getState().history;
        const currentStep = useCanvasStore.getState().historyStep;

        if (currentStep < currentHistory.length - 1) {
            isHistoryProcessing.current = true;
            const nextStep = currentStep + 1;
            const json = JSON.parse(currentHistory[nextStep]);

            canvas.loadFromJSON(json).then(() => {
                initPaper(true);
                updateRuler();
                canvas.requestRenderAll();
                isHistoryProcessing.current = false;
                setHistoryStep(nextStep);
            });
        }
    }, [canvas, initPaper, updateRuler, setHistoryStep]);

    return { saveHistory, undo, redo };
};
