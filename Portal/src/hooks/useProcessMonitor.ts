import { useEffect } from 'react';
import useAppStore from '../store/appStore';
import { useCanvasStore } from '../ui/pages/Recipe/Canvas/useCanvasStore';
import { bus } from '../core/patterns/events';

/**
 * @hook useProcessMonitor
 * @brief Background monitoring logic for process dashboard.
 * @details This hook is intended to be called in AppShell to persist process updates
 *          (Processing Rate, Elapsed Time) regardless of current tab or page.
 */
export function useProcessMonitor() {
    const updateStatus = useAppStore(s => s.updateProcessStatus);
    const setMotionState = useAppStore(s => s.setMotionState);

    // 1. Process Event Listeners
    useEffect(() => {
        const offGcode = bus.on("gcode/status", (payload: any) => {
            const status = typeof payload === 'string' ? payload : payload.status;

            if (payload && payload.totalLines > 0 && payload.currentLine !== undefined) {
                const currentProgress = useAppStore.getState().processStates['gcode'].progress;
                const calc = Math.min((payload.currentLine / payload.totalLines) * 100, 100);
                updateStatus('gcode', { progress: Math.max(currentProgress, calc) });
            }

            if (status === 'idle' || status === 'completed') {
                updateStatus('gcode', { state: 'idle' });
                setMotionState('Ready');

                if (status === 'completed') {
                    const currentElapsed = useAppStore.getState().processStates['gcode'].elapsedSeconds;
                    updateStatus('gcode', {
                        finalElapsedTime: currentElapsed,
                        progress: 100
                    });
                }
            } else if (status === 'running') {
                const currentStatus = useAppStore.getState().processStates['gcode'];
                updateStatus('gcode', {
                    state: 'running',
                    finalElapsedTime: null,
                    startTime: currentStatus.startTime || new Date().toISOString()
                });
                setMotionState('Running');
            } else if (status === 'paused') {
                updateStatus('gcode', { state: 'paused' });
                setMotionState('Paused');
            }
        });

        const offScanner = bus.on("scanner/status", (status) => {
            if (status === 'idle') {
                const currentStatus = useAppStore.getState().processStates['scanner'];
                setMotionState('FINISH');
                const currentElapsed = currentStatus.elapsedSeconds;

                // [안 A 2026-07-21] EMA "overhead factor" self-learning을 제거했다. 이 로직은
                // 타이머 기반 가짜 진행률 추정에만 쓰였는데, SinoGalvo에서는 그 추정이 폐기되어
                // 진행률이 이제 네이티브 완료 체크포인트(SinoGalvoController::Run -> __onScannerProgress)
                // 에서만 나온다. JhcLib는 실시간 진행 피드백이 없어 자가 보정할 대상 자체가 없다.

                updateStatus('scanner', {
                    state: 'idle',
                    finalElapsedTime: currentElapsed,
                    progress: 100
                });
                useAppStore.getState().showToast("Scanner Process Completed", "success");
            }
            else if (status === 'running') {
                const currentStatus = useAppStore.getState().processStates['scanner'];
                updateStatus('scanner', {
                    state: 'running',
                    finalElapsedTime: null,
                    startTime: currentStatus.startTime || new Date().toISOString()
                });
                setMotionState('Running');
            }
        });

        // [FIX 2026-07-23] 네이티브 체크포인트 진행률(scanner/progress) 전역 소비.
        // 핸들러 등록은 HardwareFacade(__onScannerProgress), 소비는 항상 마운트되는 이 훅 —
        // 탭-마운트 패널에 두면 탭 전환 시 수신이 끊긴다(§6.13 교훈). SinoGalvo 장비에서는
        // 수신자가 아예 없어 진행률·MARK TIMES 회차(n/N)가 1/N에 고정되던 버그의 수정.
        const offScannerProgress = bus.on("scanner/progress", (p: number) => {
            const cur = useAppStore.getState().processStates['scanner'].progress;
            // Native checkpoints are monotonic; guard defensively anyway (same convention as gcode path)
            updateStatus('scanner', { progress: Math.max(cur, Math.min(100, p)) });
        });

        // [Issue9 P3 2026-07-23] 드라이버 실측 MARK TIMES 회차(현재 색상 그룹의 n/N + 레이어 색상).
        // ProcessDashboard가 이 값을 그대로 표시한다 — 기존의 "진행률 × 선택 스와치 프리셋" 유도
        // 계산은 다색 레시피/소형 REPEAT 블록에서 오표시("1/2", "6/10")를 만들어 폐기됨.
        const offMarkPass = bus.on("scanner/markpass", (mp: { cur: number; total: number; color: string }) => {
            updateStatus('scanner', {
                markPass: mp.cur,
                markPassTotal: mp.total,
                markPassColor: mp.color || '',
            });
        });

        const offProgress = bus.on("test/process-progress" as any, (p: number) => {
            // Note: Kind is not easily inferred here without knowing the active viewMode,
            // but usually this is for simulation/test. We update both for safety if needed,
            // or we could check viewMode.
            const viewMode = useCanvasStore.getState().viewMode;
            // [FIX] Map viewMode to process kind: canvas/object -> gcode, scanner -> scanner
            const kind = (viewMode === 'canvas' || viewMode === 'object') ? 'gcode' : 'scanner';
            if (kind === 'scanner' || kind === 'gcode') {
                updateStatus(kind, { progress: p });
            }
        });

        return () => {
            offGcode();
            offScanner();
            offScannerProgress();
            offMarkPass();
            offProgress();
        };
    }, [updateStatus, setMotionState]);

    // 2. [가공 잠금 전역 동기화] processState 전이 → isProcessingLocal/hideOverlays
    //    [Design Pattern: Observer — appStore 구독 기반 상태 전이 감시]
    /**
     * @brief 가공 상태 전이에 따라 UI 잠금(isProcessingLocal/hideOverlays)을 전역에서 동기화한다.
     * @details 기존에는 이 동기화가 ProcessDashboard(Process 탭 내부)의 effect에만 있어,
     *          Motion 탭을 보는 동안 가공이 끝나면 ProcessDashboard가 언마운트 상태라
     *          잠금 해제가 실행되지 않았다(Process 탭으로 전환해야 해제되는 버그).
     *          항상 마운트되는 이 훅(AppShell)에서 전이(prev !== cur) 기반으로 처리한다.
     *          - running/paused 진입 → 잠금
     *          - idle 복귀 → 해제
     *          전이 기반이므로 Process Start 직후(백엔드가 running을 보고하기 전, state는 아직
     *          idle)에 잠금을 되돌리는 일이 없다. ProcessDashboard의 기존 effect(2초 유예 포함)와
     *          동작이 일관되어 병행 마운트 시에도 충돌하지 않는다.
     */
    useEffect(() => {
        const unsub = useAppStore.subscribe((s, prevS) => {
            (['scanner', 'gcode'] as const).forEach(kind => {
                const cur = s.processStates[kind].state;
                const prev = prevS.processStates[kind].state;
                if (cur === prev) return;
                const { setProcessingLocal, setHideOverlays } = useCanvasStore.getState();
                if (cur === 'running' || cur === 'paused') {
                    setProcessingLocal(true);
                    setHideOverlays(true);
                } else if (cur === 'idle') {
                    setProcessingLocal(false);
                    setHideOverlays(false);
                }
            });
        });
        return unsub;
    }, []);

    // 3. Global Timer logic (1 second interval)
    useEffect(() => {
        const interval = setInterval(() => {
            const state = useAppStore.getState();

            (['scanner', 'gcode'] as const).forEach(kind => {
                const status = state.processStates[kind];
                if (status.state === 'running' && status.startTime) {
                    const nextElapsed = status.elapsedSeconds + 1;
                    let nextProgress = status.progress;

                    // [안 A 2026-07-21] 타이머 기반 예상 진행률은 이제 G-Code에만 적용한다.
                    // SinoGalvo 스캐너 진행률은 네이티브 완료 체크포인트(SinoGalvoController::Run의
                    // __onScannerProgress)만으로 구동되며, 이는 물리적으로 완료된 명령 비율을 보고한다.
                    // 기존 타이머 추정이 매초 이 정직한 네이티브 값을 덮어써 부정확했다. JhcLib는
                    // 실시간 진행 피드백이 없으므로 네이티브 체크포인트가 유일한 정직한 신호다.
                    // 경과 시간(Elapsed)은 모든 종류에서 계속 카운트된다.
                    if (kind === 'gcode' && status.estimatedTotalSeconds > 0) {
                        const ratio = nextElapsed / status.estimatedTotalSeconds;

                        // Zeno's Cap (Non-linear asymptotic progress)
                        if (ratio < 0.9) {
                            // Linear up to 90%
                            nextProgress = ratio * 100;
                        } else {
                            // Asymptotic approach to 99% after 90%
                            nextProgress = 90 + 9.0 * (1 - Math.exp(-(ratio - 0.9) * 5));
                        }
                    }

                    updateStatus(kind, {
                        elapsedSeconds: nextElapsed,
                        progress: kind === 'gcode' ? nextProgress : status.progress
                    });
                }
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [updateStatus]);

    // 4. Estimated Total Time Calculation Logic
    useEffect(() => {
        const calculateEstimation = () => {
            const { viewMode, scannerSettings, gcodeSettings, scannerCommands, gcode } = useCanvasStore.getState();
            // [FIX] object mode is also a G-Code process
            const kind = (viewMode === 'canvas' || viewMode === 'object') ? 'gcode' : (viewMode === 'scanner' ? 'scanner' : null);
            if (!kind) return;

            const settings = kind === 'scanner' ? scannerSettings : gcodeSettings;
            const speedParam = Math.max(0.1, Number(settings.feedRate) || 10);
            let estimatedSecs = 0;

            if (kind === 'scanner') {
                const count = scannerCommands.length;
                if (count > 0) {
                    let totalDist = 0;
                    let totalJumpDist = 0;
                    scannerCommands.forEach(c => {
                        const sx = c.startX || 0;
                        const sy = c.startY || 0;
                        const ex = c.x || sx;
                        const ey = c.y || sy;
                        const dist = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2);
                        if (c.type === 'jump' || c.type === 'move') totalJumpDist += dist;
                        else totalDist += dist;
                    });
                    if (totalDist === 0 && totalJumpDist === 0) estimatedSecs = (count * 2.0) / speedParam;
                    else estimatedSecs = (totalDist / speedParam) + (totalJumpDist / 2000) + (count * 0.001);
                }
            } else {
                const lines = gcode.split('\n').filter(l => l.trim() && !l.trim().startsWith(';') && !l.trim().startsWith('//'));
                const count = lines.length;
                if (count > 0) {
                    let totalDist = 0, totalJumpDist = 0, currentF = speedParam;
                    let jumpFeedRate = 100.0 * (Math.min(100, Math.max(1, Number(settings.feedRate) || 100)) / 100.0);
                    let cx: number | null = null, cy: number | null = null, cz: number | null = null;

                    lines.forEach(line => {
                        const l = line.toUpperCase();
                        const fMatch = l.match(/F([\d.]+)/);
                        if (fMatch) currentF = Math.max(0.1, parseFloat(fMatch[1]) > 100 ? parseFloat(fMatch[1]) / 60 : parseFloat(fMatch[1]));

                        const isG0 = l.includes('G0') && !l.includes('G01') && !l.includes('G02') && !l.includes('G03');
                        const isG1 = l.includes('G1') || l.includes('G01') || l.includes('G2') || l.includes('G02') || l.includes('G3') || l.includes('G03');
                        if (isG0 || isG1) {
                            let nx = cx ?? 0, ny = cy ?? 0, nz = cz ?? 0;
                            const xm = l.match(/X([\d.-]+)/), ym = l.match(/Y([\d.-]+)/), zm = l.match(/Z([\d.-]+)/);
                            if (xm) nx = parseFloat(xm[1]); if (ym) ny = parseFloat(ym[1]); if (zm) nz = parseFloat(zm[1]);
                            if (cx !== null && cy !== null && cz !== null) {
                                const dist = Math.sqrt((nx - cx) ** 2 + (ny - cy) ** 2 + (nz - cz) ** 2);
                                if (isG0) totalJumpDist += (dist / jumpFeedRate);
                                else totalDist += (dist / currentF);
                            }
                            cx = nx; cy = ny; cz = nz;
                        }
                    });
                    estimatedSecs = totalDist + totalJumpDist + (count * 0.15);
                }
            }

            // [안 A 2026-07-21] SinoGalvo "self-learned overhead factor" 곱셈을 제거했다. 이 값은
            // 스캐너에서 더 이상 쓰지 않는 타이머 기반 가짜 진행률에 쓰였고, 스캐너 진행률은 이제
            // 네이티브 완료 체크포인트에서 나온다. estimatedTotalSeconds는 G-Code 타이머 진행률 및
            // End-Time 표시용으로만(가공 없는 순수 기하 추정) 유지한다.
            const finalEstimate = Math.ceil(isNaN(estimatedSecs) ? 0 : Math.max(0, estimatedSecs));
            updateStatus(kind, { estimatedTotalSeconds: finalEstimate });
        };

        // Trigger estimation on changes
        const subCanvas = useCanvasStore.subscribe(() => calculateEstimation());
        calculateEstimation(); // initial run

        return () => subCanvas();
    }, [updateStatus]);
}
