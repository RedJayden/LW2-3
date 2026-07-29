/**
 * @file HardwareFacade.ts
 * @brief Portal 전역 하드웨어 초기화/제어 파사드
 * @details
 *  - Vision / 카메라:
 *      - Native(AppBootstrap)에서 이미 카메라 0/1 을 자동 Open+Start
 *      - Portal은 app://camera/stream 을 그대로 사용 (start/stop 없이)
 *  - Portal IPC:
 *      - 조그/조명/줌/카메라 파라미터만 IPC로 제어
 */

import type { IHardwareFacade, JogAxis, MoonsConfig } from "../core/types/hw";
import { CommandInvoker } from "../core/patterns/command";
import { Pipeline } from "../core/patterns/pipeline";
import { InitSteps } from "./commands/InitSteps";
import { JogCommand, JogStopCommand } from "./commands/JogCommands";
import { ZoomSetCommand } from "./commands/ZoomCommands";
import { useAppStore, CameraId } from "../store/appStore";
import { bus } from "../core/patterns/events";
import { logger } from "../utils/logger";
import { di } from "../core/di/container";
import { Channels } from "../core/ipc/channels.gen";
import useLogStore, { type LogLevel } from "../store/logStore";

const wire = (ch: string) => ch;

type NumRange = { min: number; max: number; inc?: number };
type CameraRanges = { exposure?: NumRange; gain?: NumRange; connected?: boolean };

declare global {
  interface Window {
    __onGCodeUploadProgress?: (percent: number) => void;
    __onScannerStatus?: (status: string) => void;
    /** 네이티브 완료 체크포인트 진행률(SinoGalvoController::Run 등의 emitProgress → BroadcastJS).
     *  [FIX 2026-07-23] 기존에는 탭-마운트 패널(ScanlabProcessPanel/죽은 ScannerPanel)만 등록해
     *  SinoGalvo 장비에서는 수신자가 아예 없어 진행률·MARK TIMES 회차가 갱신되지 않았다.
     *  __onScannerStatus와 동일하게 여기(전역 생명주기)서 1회 등록한다. */
    __onScannerProgress?: (percent: number) => void;
    /** [Issue9 P3] 드라이버 실측 MARK TIMES 회차 방송: (현재 회차, 총 횟수, 그룹 색상 hex).
     *  SinoGalvo/Scanlab Run()의 REPEAT 블록 시작·되감기 지점에서 발화. */
    __onScannerMarkPass?: (cur: number, total: number, color: string) => void;
    __onGCodeStatus?: (status: string) => void;
    __showToast?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    /** C++ 백엔드(OutputDebugStringA 등)가 진단 로그를 Portal SYSTEM CONSOLE로 실시간 전달할 때 사용. */
    __onNativeLog?: (level: string, source: string, message: string) => void;
  }
}

export class HardwareFacade implements IHardwareFacade {
  private _lastJobId: string | null = null;
  private _lastGCodeStatus: string | null = null;
  private _currentLightMode: string = ""; // Track current mode
  private _lastMotionData: string | null = null; // Track previous motion state
  private _initializing = false;
  private _aureliaTick = 0;

  /**
   * @brief 하드웨어 초기화 + 메인 윈도우 오픈
   * @details
   *  - Vision / 카메라:
   *      - Native(AppBootstrap)에서 이미 카메라 0/1 을 자동 Open+Start
   *      - Portal은 app://camera/stream 을 그대로 사용 (start/stop 없이)
   *  - Portal IPC:
   *      - 조그/조명/줌/카메라 파라미터만 IPC로 제어
   */
  async initialize(): Promise<void> {
    if (this._initializing) return;
    this._initializing = true;
    logger.info("System", "Hardware initialization started");

    // 0. 머신 타입 동기화 (C++ 백엔드 machine.ini 선행 읽기)
    try {
      const status = await this.getMachineStatus();
      console.log("[HardwareFacade] Machine status sync result:", status);
      if (status.ok) {
        if (status.hardware && status.features) {
          useAppStore.getState().setMachineStatus({
            hardware: status.hardware,
            features: status.features
          });
        }
        if (status.useCanvas !== undefined) {
          const val = Number(status.useCanvas) === 1;
          console.log(`[HardwareFacade] Setting useCanvas to: ${val} (raw: ${status.useCanvas})`);
          useAppStore.getState().setUseCanvas(val);
        }
        if (status.useProcessDetail !== undefined) {
          const valpd = Number(status.useProcessDetail) === 1;
          console.log(`[HardwareFacade] Setting useProcessDetail to: ${valpd}`);
          useAppStore.getState().setUseProcessDetail(valpd);
        }
        if (status.jogXDir !== undefined && status.jogYDir !== undefined) {
          useAppStore.getState().setJogDirections(status.jogXDir, status.jogYDir);
        }
        if (status.maxHistorySteps !== undefined) {
          console.log(`[HardwareFacade] Setting maxHistorySteps to: ${status.maxHistorySteps}`);
          useAppStore.getState().setMaxHistorySteps(status.maxHistorySteps);
        }
        if (status.stageMinX !== undefined && status.stageMaxX !== undefined && status.stageMinY !== undefined && status.stageMaxY !== undefined) {
          useAppStore.getState().setStageLimit({
            minX: status.stageMinX,
            maxX: status.stageMaxX,
            minY: status.stageMinY,
            maxY: status.stageMaxY
          });
        }
      }
    } catch (e) {
      logger.warn("System", `Failed to sync machine status: ${e}`);
    }

    const { setProgress, setStepMessage, markDone, setCameraStatus } = useAppStore.getState();
    const pipeline = new Pipeline(InitSteps);

    setProgress(0);
    const off = bus.on("init/progress", ({ step, total, message }) => {
      setStepMessage(step - 1, message);
      setProgress(Math.round((step / total) * 100));
    });

    // Start polling every 1 second (actually 100ms)
    setInterval(async () => {
      try {
        // Send request without axis argument to get all positions
        const res = await di.transport.send(wire(Channels.motion_getPosition), {});

        // Expected response: {"channel":"motion.getPosition","payload":{"X":1.234,"Y":23.23,"Z":32.22} }
        const data = res?.payload || res;

        if (data) {
          const serializedData = JSON.stringify(data);
          if (this._lastMotionData !== serializedData) {
            this._lastMotionData = serializedData;

            // Iterate over keys (X, Y, Z, etc.) and update store
            Object.entries(data).forEach(([axis, pos]) => {
              if (typeof pos === "number") {
                useAppStore.getState().setPosition(axis, pos);
              }
            });

            if (data.servoX !== undefined || data.emo !== undefined) {
              useAppStore.getState().setHardwareFlags({
                axisFlags: {
                  servo: { X: !!data.servoX, Y: !!data.servoY, Z: !!data.servoZ },
                  homed: { X: !!data.homedX, Y: !!data.homedY, Z: !!data.homedZ },
                  alarm: { X: !!data.alarmX, Y: !!data.alarmY, Z: !!data.alarmZ },
                  alarmReason: {
                    X: String(data.alarmReasonX || "None"),
                    Y: String(data.alarmReasonY || "None"),
                    Z: String(data.alarmReasonZ || "None")
                  },
                  servoState: {
                    X: Number(data.servoStateX ?? -1),
                    Y: Number(data.servoStateY ?? -1),
                    Z: Number(data.servoStateZ ?? -1)
                  },
                  alarmResetState: {
                    X: Number(data.alarmResetStateX ?? -1),
                    Y: Number(data.alarmResetStateY ?? -1),
                    Z: Number(data.alarmResetStateZ ?? -1)
                  }
                },
                emo: !!data.emo,
              });
            }

            // [Safety] Monitor Global Safety Status from Backend
            const safety = data.safety;
            if (safety) {
              const { openDialog, dialog } = useAppStore.getState();

              // 1. Emergency Stop Modal
              if (safety.emo && !dialog.open) {
                openDialog({
                  title: "Emergency Stop (비상 정지)",
                  message: safety.safetyMessage || "비상 정지 신호가 감지되었습니다. X, Y, Z 서보가 차단되었습니다.",
                  type: "warning",
                  confirmText: "확인"
                });
                logger.error("Safety", "Emergency Stop Triggered");
              }
              // 2. Software Interlock Modal
              // [FIX] Skip during homing: axes intentionally travel to/near limits while homing, so a soft-limit
              // crossing at that time is expected and should not raise a false alarm.
              else if (safety.interlockTriggered && !dialog.open && !useAppStore.getState().homingState.active) {
                openDialog({
                  title: "Software Interlock (경계값 인터락)",
                  message: safety.safetyMessage || "축 이동 한계값을 초과하였습니다.",
                  type: "warning",
                  confirmText: "확인"
                });
                logger.warn("Safety", `Interlock Triggered: ${safety.safetyMessage}`);
              }
            }

            if (data.commError !== undefined) {
              const currentCommError = useAppStore.getState().motion.commError;
              if (data.commError && !currentCommError) {
                // New error detected
                logger.error("HW", `PMAC Communication Error: ${data.commErrorMessage}`);
                useAppStore.getState().showToast(`PMAC Error: ${data.commErrorMessage}`, "error");
              }
              useAppStore.getState().setCommError(!!data.commError, data.commErrorMessage || "");
            }

            if (data.scannerConnected !== undefined) {
              useAppStore.getState().setScanlabStatus({
                connected: !!data.scannerConnected,
                headStatus: Number(data.scannerHeadStatus ?? 0),
                initStatus: Number(data.scannerInitStatus ?? 0)
              });
            }
          }

          // --- Homing status detection based on HomeComplete signals ---
          const currentHomingState = useAppStore.getState().homingState;
          if (currentHomingState.active) {
            const now = Date.now();
            const startTime = currentHomingState.startTime ?? 0;
            const gracePeriod = 1000; // 1 second grace period to allow hardware to clear bits

            // Only check completion after grace period has passed
            if (now - startTime > gracePeriod) {
              const homedX = !!data.homedX;
              const homedY = !!data.homedY;
              const homedZ = !!data.homedZ;

              // Check completion based on type
              let isFinished = false;
              if (currentHomingState.type === "all") {
                isFinished = homedX && homedY && homedZ;
              } else if (currentHomingState.type === "X") {
                isFinished = homedX;
              } else if (currentHomingState.type === "Y") {
                isFinished = homedY;
              } else if (currentHomingState.type === "Z") {
                isFinished = homedZ;
              }

              if (isFinished) {
                useAppStore.getState().setHomingState({ active: false, type: null, startTime: 0 });
              }
            }
          } else {
            // Proactively detect homing started from backend (just in case)
            const homingX = (data.homingX ?? 0) as number;
            const homingY = (data.homingY ?? 0) as number;
            const homingZ = (data.homingZ ?? 0) as number;

            if (homingX === 10) useAppStore.getState().setHomingState({ active: true, type: "X", startTime: Date.now() });
            else if (homingY === 10) useAppStore.getState().setHomingState({ active: true, type: "Y", startTime: Date.now() });
            else if (homingZ === 10) useAppStore.getState().setHomingState({ active: true, type: "Z", startTime: Date.now() });
          }
        }
      } catch (e) {
        // ignore error
      }

      // [NEW] Poll for GCode Status
      try {
        if (this._lastJobId) {
          const res = await di.transport.send(wire(Channels.cmd_gcode_status), { jobId: this._lastJobId });
          const data = res?.payload || res;
          if (data && data.status) {
            // Always emit so UI gets continuous progress updates
            bus.emit("gcode/status", data);
            this._lastGCodeStatus = data.status;
          }
        }
      } catch (e) {
        // ignore error
      }

      // [NEW] Poll for Aurelia Status (1s interval)
      try {
        if (++this._aureliaTick >= 10) {
          this._aureliaTick = 0;
          const res = await di.transport.send("cmd.aurelia.getStatus", {});
          if (res) {
            useAppStore.getState().setAureliaStatus(res);
          }
        }
      } catch (e) {
        // ignore
      }
    }, 100);

    try {
      // Register global callback for G-Code upload progress
      window.__onGCodeUploadProgress = (percent: number) => {
        bus.emit("gcode/upload-progress", percent);
      };

      // Register global callback for Scanner Status
      window.__onScannerStatus = (status: string) => {
        bus.emit("scanner/status", status);
      };

      // Register global callback for Scanner marking progress (native checkpoints).
      // Consumed by useProcessMonitor (AppShell-resident) so updates survive tab switches.
      window.__onScannerProgress = (percent: number) => {
        bus.emit("scanner/progress", percent);
      };

      // [Issue9 P3] Register global callback for the measured MARK TIMES pass broadcast.
      window.__onScannerMarkPass = (cur: number, total: number, color: string) => {
        bus.emit("scanner/markpass", { cur, total, color: color || '' });
      };

      // Register global callback for G-Code Status
      window.__onGCodeStatus = (status: string) => {
        bus.emit("gcode/status", status);
      };

      // [DIAG] Register global callback for native (C++) diagnostic logs, so
      // OutputDebugStringA-style logs (e.g. SinoGalvo delay investigation) also
      // show up in Portal's own SYSTEM CONSOLE without needing DebugView.
      window.__onNativeLog = (level: string, source: string, message: string) => {
        useLogStore.getState().addNativeLog(level as LogLevel, source, message);
      };

      // Register global callback for UI Toast
      window.__showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning') => {
        useAppStore.getState().showToast(message, type);
      };

      await pipeline.execute();

      // 하드웨어 Init 파이프라인이 완료되면,
      // Vision 쪽 카메라는 이미 Native에서 자동으로 스트리밍 중이라고 가정.
      markDone(2);
      logger.info("System", "Hardware initialization completed successfully");

      // 활성 카메라 동적 스트리밍 
      const enabledCameras = Object.values(useAppStore.getState().cameras);
      enabledCameras.forEach(c => setCameraStatus(c.id, 'streaming'));

      try {
        // [Refine] Delay 200ms to allow splash to hide smoothly before showing main window
        await new Promise(resolve => setTimeout(resolve, 200));

        await di.transport.send(wire(Channels.app_openMain), {
          route: "#/main",
          show: "maximized",
        });
      } catch {
        /* no-op */
      }
    } catch (e) {
      logger.error("System", `Hardware initialization failed: ${e}`);
      console.error("[HardwareFacade] initialize failed:", e);
    } finally {
      off();
      setProgress(100);
    }
  }

  // ===== 카메라 제어 (필요 시 사용 – 기본 플로우에서는 자동 스트림 전제) =====

  /** @deprecated 기본 플로우에서는 사용하지 않음 (Native 초기화가 이미 수행) */
  async connectCamera(id: number): Promise<void> {
    await di.transport.send(wire(Channels.camera_start), {
      id,
      preview: false,
    });
  }

  /** @deprecated MJPEG 스트림은 자동이라고 가정. 복구용/디버깅용. */
  async startStream(id: number): Promise<void> {
    await di.transport.send(wire(Channels.camera_start), { id, preview: true });
  }

  /** @deprecated 일반 UI 플로우에서는 호출하지 않음. */
  async stopStream(id: number): Promise<void> {
    await di.transport.send(wire(Channels.camera_stop), { id });
  }

  async setParams(
    id: number,
    p: { exposure?: number; gain?: number }
  ): Promise<void> {
    await di.transport.send(wire(Channels.camera_setParams), { id, ...p });
  }

  async getRanges(id: number): Promise<CameraRanges> {
    try {
      const r = await di.transport.send(wire(Channels.camera_getRange), { id });
      return (r ?? {}) as CameraRanges;
    } catch {
      return {};
    }
  }

  async getParams(id: number): Promise<{ exposure?: number; gain?: number }> {
    try {
      const p = await di.transport.send(wire(Channels.camera_getParams), { id });
      return (p ?? {}) as { exposure?: number; gain?: number };
    } catch {
      return {};
    }
  }

  async cameraStart(id: number): Promise<void> {
    await di.transport.send(wire(Channels.camera_start), { id, preview: true });
  }

  async cameraStop(id: number): Promise<void> {
    await di.transport.send(wire(Channels.camera_stop), { id });
  }

  // ===== Motion / Light / Zoom =====

  async jogStart(axis: JogAxis, dir: 1 | -1, speed?: string) {
    logger.debug("Motion", `Jog start: ${axis} ${dir > 0 ? "+" : "-"} speed=${speed || "mid"}`);
    await di.transport.send(wire(Channels.motion_jog_start), {
      axis,
      dir: dir > 0 ? "+" : "-",
      speed: speed || "mid",
    });
  }

  async setJogSpeed(speed: "slow" | "mid" | "fast") {
    // UI speed setting applies to all axes
    await Promise.all([
      di.transport.send(wire(Channels.motion_setJogSpeed), { axis: "X", speed }),
      di.transport.send(wire(Channels.motion_setJogSpeed), { axis: "Y", speed }),
      di.transport.send(wire(Channels.motion_setJogSpeed), { axis: "Z", speed }),
    ]);
  }

  // [NEW] Axis Controls
  async setServo(axis: "X" | "Y" | "Z", state: number): Promise<{ ok: boolean, message?: string }> {
    const r = await di.transport.send(wire("cmd.motion.setServo"), { axis, state });
    return r as any;
  }

  async resetAlarm(axis: "X" | "Y" | "Z", type: number): Promise<{ ok: boolean, message?: string }> {
    const r = await di.transport.send(wire("cmd.motion.resetAlarm"), { axis, type });
    return r as any;
  }

  async fastechAlarmReset(axis: "X" | "Y" | "Z"): Promise<{ ok: boolean, message?: string }> {
    const r = await di.transport.send(wire("cmd.motion.fastechAlarmReset"), { axis });
    return r as any;
  }

  async jogStop(axis: JogAxis) {
    await di.transport.send(wire(Channels.motion_jog_stop), { axis });
  }

  async stopAll() {
    await di.transport.send(wire(Channels.motion_stop), {});
  }

  async moveRel(axis: JogAxis, distance: number, speed?: string) {
    await di.transport.send(wire(Channels.motion_moveRel), {
      axis,
      distance,
      speed,
    });
  }

  async moveAbs(axis: JogAxis, position: number, speed?: string) {
    await di.transport.send(wire(Channels.motion_moveAbs), {
      axis,
      position,
      speed,
    });
  }

  async home(axis: string) {
    logger.info("Motion", `Homing axis: ${axis}`);
    useAppStore.getState().setHomingState({ active: true, type: axis as any, startTime: Date.now() });
    await di.transport.send(wire(Channels.motion_home), { axis });
  }

  async homeAll() {
    logger.info("Motion", "Homing all axes (X, Y, Z)");
    useAppStore.getState().setHomingState({ active: true, type: "all", startTime: Date.now() });
    await di.transport.send(wire(Channels.motion_homeAll), {});
  }

  async cancelHome(axis?: string) {
    logger.info("Motion", `Cancel homing: ${axis || "all"}`);
    // Immediately release UI lock on cancel
    useAppStore.getState().setHomingState({ active: false, type: null, startTime: 0 });
    await di.transport.send(wire("motion.cancelHome"), { axis: axis || "all" });
  }

  async setLight(channel: number, value: number) {
    // Use new Light API (cmd.light.set_val) instead of legacy LightSetCommand (hw/light)
    // Infer profile from current AppStore state
    const { cameraKind, objectMag } = useAppStore.getState();
    let profile = "scanner";
    if (cameraKind === "object") {
      profile = objectMag === "x50" ? "object_x50" : "object_x20"; // "object_x20" or "object_x50"
    }

    // Call the new API
    await this.setLightVal(profile, channel, value);
  }

  async setLightOn(channel: number, enabled: boolean) {
    const { cameraKind, objectMag } = useAppStore.getState();
    let profile = "scanner";
    if (cameraKind === "object") {
      profile = objectMag === "x50" ? "object_x50" : "object_x20";
    }
    await this.setLightEnable(profile, channel, enabled);
  }

  // ===== Laser Center Calibration Reform =====
  async calibGetState(key: string) {
    return await di.transport.send(wire(Channels.cmd_calib_getState), { key });
  }

  async calibSetViewRatio(key: string, ratio: number) {
    return await di.transport.send(wire(Channels.cmd_calib_setViewRatio), { key, value: ratio });
  }

  async calibPickCenter(key: string, pixel: { x: number, y: number }) {
    return await di.transport.send(wire(Channels.cmd_calib_pickCenter), { key, x: pixel.x, y: pixel.y });
  }

  async calibApply(key: string) {
    return await di.transport.send(wire(Channels.cmd_calib_apply), { key });
  }

  async calibSave() {
    return await di.transport.send(wire(Channels.cmd_calib_save), {});
  }

  async setZoom(percent: number) {
    const { setZoom } = useAppStore.getState();
    const inv = new CommandInvoker();
    inv.enqueue(new ZoomSetCommand(setZoom, percent));
    await inv.runAll();
  }

  async uploadGCode(gcode: string) {
    const rawLines = gcode.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const jobId = `job-${Date.now()}`;
    this._lastJobId = jobId;
    this._lastGCodeStatus = null;
    logger.info("GCode", `Uploading G-Code: ${rawLines.length} lines, jobId=${jobId}`);

    // [FIX] Chunk lines into blocks up to 250 characters, ensuring no line is split.
    const chunkedLines: string[] = [];
    let currentBlock = "";

    for (const line of rawLines) {
      if (line.length > 250) {
        if (currentBlock) {
          chunkedLines.push(currentBlock);
          currentBlock = "";
        }
        chunkedLines.push(line);
        continue;
      }

      const potentialBlock = currentBlock ? `${currentBlock}\n${line}` : line;
      if (potentialBlock.length > 250) {
        chunkedLines.push(currentBlock);
        currentBlock = line;
      } else {
        currentBlock = potentialBlock;
      }
    }

    if (currentBlock) {
      chunkedLines.push(currentBlock);
    }

    // Single IPC Dispatch
    await di.transport.send(wire(Channels.cmd_gcode_write), {
      jobId,
      name: "generated-gcode",
      lines: chunkedLines,
    });
  }

  async processGCode(mode: number, ttlTime?: number) {
    const modeNames: Record<number, string> = { 1: "Start", 2: "Stop", 3: "Pause", 4: "Resume" };
    logger.info("GCode", `Process G-Code: ${modeNames[mode] || mode}`);

    const payload: any = {
      jobId: this._lastJobId ?? "",
      mode
    };
    if (ttlTime !== undefined) {
      payload.ttlTime = ttlTime;
    }

    await di.transport.send(wire(Channels.cmd_gcode_run), payload);
  }

  async moonsPreset(payload: "scanner_base" | "object_x20" | "object_x50", syncOnly: boolean = false, forceAbsolute: boolean = false) {
    const { features } = useAppStore.getState();
    let effectivePayload = payload;
    if (!features.allowedLenses.includes("X20") && payload === "object_x20") {
      effectivePayload = "object_x50";
    }
    await di.transport.send(wire(Channels.cmd_moons_preset), { payload: effectivePayload, syncOnly, forceAbsolute });
  }

  // [NEW] Scanner Integration
  /**
   * @brief 생성된 Scanner 커맨드를 네이티브 드라이버로 전송한다.
   * @details [Design Pattern: 없음] `ScannerCommand[]`에는 UI Generated Commands 패널
   *          표시 전용인 `type: 'COMMENT'` 항목이 섞여 있을 수 있다(도형 타입/반복 회차 등
   *          정보성 텍스트일 뿐 좌표가 없다). 호출부(SinoGalvoProcessPanel/ScanlabProcessPanel
   *          등)가 필터링을 깜빡해도 네이티브 드라이버에 알 수 없는 커맨드 타입이 전달되지
   *          않도록, 실제 전송 직전인 이 진입점 한 곳에서 항상 걸러낸다.
   * @param commands ScannerCommand[] (COMMENT 포함 가능)
   */
  async generateScannerCommands(commands: any[]) {
    // commands: ScannerCommand[]
    const realCommands = commands.filter((c) => c?.type !== 'COMMENT');
    await di.transport.send(wire(Channels.cmd_scanner_generate), { commands: realCommands });
  }

  async scannerControl(mode: number = 1, options?: { scannerMarkSpeed?: number; scannerIntensity?: number }): Promise<boolean> {
    const modeNames: Record<number, string> = { 1: "Start", 2: "Stop", 3: "Pause", 4: "Resume" };
    logger.info("Scanner", `Scanner control: ${modeNames[mode] || mode}`);
    const r = await di.transport.send(wire(Channels.cmd_scanner_run), { mode, ...options });
    return (r as any).ok;
  }

  async scannerStop(): Promise<boolean> {
    const r = await di.transport.send(wire('cmd.scanner.stop'), {});
    return (r as any).ok;
  }

  /** [기능2] 갈보 미러를 센터(0,0)로 이동(스테이지 아님). 카메라뷰 "Move to Scanner Center" 버튼용. */
  async scannerMoveToCenter(): Promise<boolean> {
    logger.info("Scanner", "Move galvo to center (0,0)");
    const r = await di.transport.send(wire('cmd.scanner.center'), {});
    return (r as any).ok;
  }

  async scannerInit(): Promise<{ ok: boolean, message?: string }> {
    const r = await di.transport.send(wire('cmd.scanner.init'), {});
    return r as any;
  }

  // Dialogs
  async dialogOpenImage(extensions?: string): Promise<{ ok: boolean, data?: string, path?: string, message?: string }> {
    const r = await di.transport.send(wire(Channels.cmd_dialog_openImage), { extensions });
    return r as any;
  }

  async dialogSaveImage(data: string, fileName?: string): Promise<{ ok: boolean, message?: string }> {
    const r = await di.transport.send(wire(Channels.cmd_dialog_saveImage), { data, fileName });
    return r as any;
  }

  async dialogSaveRecipeFile(data: string, fileName?: string): Promise<{ ok: boolean, message?: string }> {
    console.log('[HardwareFacade] dialogSaveRecipeFile called', fileName);
    const r = await di.transport.send(wire("cmd.dialog.saveRecipeFile"), { data, fileName });
    return r as any;
  }

  // Calibration
  async saveCalibration(profile: string, data: any): Promise<{ ok: boolean, message?: string }> {
    const r = await di.transport.send(wire(Channels.cmd_calibration_save), { profile, data });
    return r as any;
  }

  async loadCalibration(profile: string): Promise<{ ok: boolean, data?: any, message?: string }> {
    const r = await di.transport.send(wire(Channels.cmd_calibration_load), { profile });
    return r as any;
  }

  async listCalibration(profile: string): Promise<{ ok: boolean, list?: any[], message?: string }> {
    const r = await di.transport.send(wire(Channels.cmd_calibration_list), { profile });
    return r as any;
  }

  async rollbackCalibration(profile: string, filename: string): Promise<{ ok: boolean, message?: string }> {
    const r = await di.transport.send(wire(Channels.cmd_calibration_rollback), { profile, filename });
    return r as any;
  }

  async deleteCalibration(profile: string, filename: string): Promise<{ ok: boolean, message?: string }> {
    const r = await di.transport.send(wire(Channels.cmd_calibration_delete), { profile, filename });
    return r as any;
  }

  // ===== Calibration Vision (Phase 1/2/3) =====

  /**
   * @brief Phase 1: ROI 내 단일 타겟(사각형/원) 자동 피팅 (네이티브 OpenCV)
   * @param camId 카메라 ID (0=Scanner, 1=Object)
   * @param roi   카메라 네이티브 픽셀 좌표 ROI
   * @param shape "rect" | "circle" | "auto"
   */
  async visionAutoFit(camId: number, roi: { x: number, y: number, w: number, h: number }, shape: 'rect' | 'circle' | 'auto'):
    Promise<{ ok: boolean, shape?: string, cx?: number, cy?: number, widthPx?: number, heightPx?: number, angleDeg?: number, rmsPx?: number, error?: string }> {
    const r = await di.transport.send(wire("cmd.vision.autoFit"), { camId, ...roi, shape });
    return r as any;
  }

  /**
   * @brief Phase 2: 체커보드/도트그리드 전자동 검출 → mm/px 스케일·회전각 산출
   */
  async visionDetectPattern(camId: number, pattern: 'chessboard' | 'circles', cols: number, rows: number, pitchMm: number):
    Promise<{ ok: boolean, scaleX?: number, scaleY?: number, rotationDeg?: number, rmsPx?: number, points?: number, error?: string }> {
    const r = await di.transport.send(wire("cmd.vision.detectPattern"), { camId, pattern, cols, rows, pitchMm });
    return r as any;
  }

  /**
   * @brief Phase 3: 스테이지 이동 기반 자동 캘리브레이션 시작 (비동기, 상태 폴링)
   */
  async visionStageCalibStart(camId: number, stepMm: number, speed: 'slow' | 'mid' = 'slow'):
    Promise<{ ok: boolean, error?: string }> {
    const r = await di.transport.send(wire("cmd.vision.stageCalibStart"), { camId, stepMm, speed });
    return r as any;
  }

  /**
   * @brief Phase 3 진행 상태 폴링
   */
  async visionStageCalibStatus():
    Promise<{ ok: boolean, running?: boolean, step?: string, progress?: number, message?: string, result?: any, error?: string | null }> {
    const r = await di.transport.send(wire("cmd.vision.stageCalibStatus"), {});
    return r as any;
  }

  /**
   * @brief Phase 3 중단 요청 (모션 정지 + 원위치 복귀 시도)
   */
  async visionStageCalibAbort(): Promise<{ ok: boolean }> {
    const r = await di.transport.send(wire("cmd.vision.stageCalibAbort"), {});
    return r as any;
  }

  // Recipe Center
  async saveRecipeCenter(data: any): Promise<{ ok: boolean, message?: string }> {
    const r = await di.transport.send(wire(Channels.cmd_recipe_center_save), { data: JSON.stringify(data) });
    return r as any;
  }

  async loadRecipeCenter(): Promise<{ ok: boolean, data?: string, message?: string }> {
    const r = await di.transport.send(wire(Channels.cmd_recipe_center_load), {});
    return r as any;
  }

  // Color Preset Library (프로젝트와 무관하게 재사용되는 전역 색상 프리셋)
  async savePresetLibrary(data: any): Promise<{ ok: boolean, message?: string }> {
    const r = await di.transport.send(wire(Channels.cmd_presetLibrary_save), { data: JSON.stringify(data) });
    return r as any;
  }

  async loadPresetLibrary(): Promise<{ ok: boolean, data?: string, message?: string }> {
    const r = await di.transport.send(wire(Channels.cmd_presetLibrary_load), {});
    return r as any;
  }

  // Camera Configuration
  async getCameraConfig(): Promise<{ ok: boolean, data?: any, message?: string }> {
    const r = await di.transport.send(wire(Channels.cmd_config_getCamera), {});
    return r as any;
  }

  async setCameraConfig(data: any): Promise<{ ok: boolean, message?: string }> {
    const r = await di.transport.send(wire(Channels.cmd_config_setCamera), { data });
    return r as any;
  }

  // Laser Configuration
  async getLaserConfig(): Promise<{ ok: boolean, data?: any, message?: string }> {
    // using direct string since it might not be in Channels.gen.ts
    const r = await di.transport.send(wire("cmd.config.getLaser"), {});
    return r as any;
  }

  async setLaserConfig(data: any): Promise<{ ok: boolean, message?: string }> {
    const r = await di.transport.send(wire("cmd.config.setLaser"), { data });
    return r as any;
  }

  // Scanner Configuration
  async getScannerConfig(): Promise<{ ok: boolean, data?: any, message?: string }> {
    const r = await di.transport.send(wire("cmd.config.getScanner"), {});
    return r as any;
  }

  async setScannerConfig(data: any): Promise<{ ok: boolean, message?: string }> {
    const r = await di.transport.send(wire("cmd.config.setScanner"), { data });
    return r as any;
  }

  /**
   * @brief 레이저 제어 파라미터 개별 설정 (Selector, Shutter, TTL Time)
   */
  async setLaserControl(params: { selector?: number, shutter?: number, ttlTime?: number }): Promise<{ ok: boolean, message?: string }> {
    logger.debug("Laser", `Setting Laser Control: ${JSON.stringify(params)}`);
    const r = await di.transport.send(wire("cmd.config.setLaser"), { data: params });
    return r as any;
  }

  // Aurelia Laser
  async aureliaPower(on: boolean) {
    return await di.transport.send(wire("cmd.aurelia.power"), { on });
  }

  async aureliaShutter(open: boolean) {
    return await di.transport.send(wire("cmd.aurelia.shutter"), { open });
  }

  async aureliaSetParams(params: { prf?: number, amp?: number, burst?: number, pw?: number }) {
    return await di.transport.send(wire("cmd.aurelia.setParams"), params);
  }

  async aureliaGetStatus() {
    return await di.transport.send(wire("cmd.aurelia.getStatus"), {});
  }

  // Motion Configuration
  async getMotionConfig(): Promise<{ ok: boolean, data?: any, message?: string }> {
    const r = await di.transport.send(wire(Channels.cmd_config_getMotion), {});
    return r as any;
  }

  async setMotionConfig(data: any): Promise<{ ok: boolean, message?: string }> {
    const r = await di.transport.send(wire(Channels.cmd_config_setMotion), { data });
    return r as any;
  }

  async getMachineStatus(): Promise<{ ok: boolean; [key: string]: any }> {
    try {
      const res = await di.transport.send(wire("cmd.config.getMachineStatus"), {});
      return (res?.payload || res) as any;
    } catch {
      return { ok: false };
    }
  }

  // Moons Config
  async getMoonsConfig(): Promise<{ ok: boolean, data?: MoonsConfig, message?: string }> {
    const r = await di.transport.send(wire("cmd.config.getMoons"), {});
    return r as any;
  }

  async setMoonsConfig(config: MoonsConfig): Promise<{ ok: boolean, message?: string }> {
    // Wrap config in 'data' key to match backend expectation
    const r = await di.transport.send(wire("cmd.config.setMoons"), { data: config });
    return r as any;
  }

  // Light Control
  async getLightConfig(): Promise<{
    ok: boolean,
    mode: number,
    scanner: number[], scanner_on: boolean[],
    object20: number[], object20_on: boolean[],
    object50: number[], object50_on: boolean[]
  }> {
    const res = await di.transport.send(wire("cmd.light.get_config"), {}) as any;
    if (res.ok && typeof res.mode === 'number') {
      const modes = ["scanner", "object20", "object50"];
      if (res.mode >= 0 && res.mode < modes.length) {
        this._currentLightMode = modes[res.mode];
      }
    }
    return res;
  }

  async setLightVal(profile: string, ch: number, val: number): Promise<{ ok: boolean }> {
    let targetMode = profile;
    if (targetMode === "object_x20") targetMode = "object20";
    if (targetMode === "object_x50") targetMode = "object50";

    if (this._currentLightMode !== targetMode) {
      console.log(`[HardwareFacade] Auto-switching Light Mode: ${this._currentLightMode} -> ${targetMode}`);
      await this.setLightMode(targetMode);
    }
    return await di.transport.send(wire("cmd.light.set_val"), { profile: targetMode, ch, val }) as any;
  }

  async setLightEnable(profile: string, ch: number, enabled: boolean): Promise<{ ok: boolean }> {
    let targetMode = profile;
    if (targetMode === "object_x20") targetMode = "object20";
    if (targetMode === "object_x50") targetMode = "object50";

    if (this._currentLightMode !== targetMode) {
      console.log(`[HardwareFacade] Auto-switching Light Mode: ${this._currentLightMode} -> ${targetMode}`);
      await this.setLightMode(targetMode);
    }

    return await di.transport.send(wire("cmd.light.set_enable"), { profile: targetMode, ch, enabled }) as any;
  }


  async setLightMode(mode: string): Promise<{ ok: boolean }> {
    let targetMode = mode;
    if (targetMode === "object_x20") targetMode = "object20";
    if (targetMode === "object_x50") targetMode = "object50";

    const res = await di.transport.send(wire("cmd.light.set_mode"), { mode: targetMode }) as any;
    if (res.ok) {
      this._currentLightMode = targetMode;
    }
    return res;
  }

  async saveLightConfig(): Promise<{ ok: boolean }> {
    return await di.transport.send(wire("cmd.light.save"), {}) as any;
  }

  // Logs
  async writeLog(level: string, source: string, message: string): Promise<{ ok: boolean }> {
    return await di.transport.send(wire("cmd.log.write"), { level, source, message }) as any;
  }
}

export const hwFacade = new HardwareFacade();
