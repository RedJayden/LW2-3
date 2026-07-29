/**
 * @file appStore.ts
 * @brief Portal 전역 상태(Zustand) - 초기화/카메라/조명/줌/조그/카메라 선택
 * @details
 *  - 디자인 패턴: Observer(구독 렌더), Singleton Store(Zustand), Command(Action)
 *  - 확장: currentCameraId, streamVersion, bumpStreamVersion 추가
 *  - 호환: setStepMessage 별칭 유지
 */

import { create } from "zustand";
import { hwFacade } from "../services/HardwareFacade";
export interface HardwareConfig {
  scanner: string;
  motion: string;
  light: string;
  laser: string;
}

export interface FeatureConfig {
  lightChannels: number;
  allowedModes: string[];
  allowedLenses: string[];
  hasLensMotor: boolean;
  hasZeroG: boolean;
  useLight?: boolean;
  useLaser?: boolean;
  hasObjectX20?: boolean;
}

export interface CameraSlotConfig {
  slotId: number;
  name: string;
  role: "scanner" | "object" | string;
  enabled: boolean;
}

export function getEnabledCameras(motion: string): CameraSlotConfig[] {
  const objectEnabled = motion === "PMAC";
  return [
    { slotId: 0, name: "Scanner", role: "scanner", enabled: true },
    { slotId: 1, name: "Object", role: "object", enabled: objectEnabled },
  ].filter(c => c.enabled);
}

/** **********************************************************************
 * Util
 * **********************************************************************/
const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

const immut = {
  arr<T>(a: readonly T[]): T[] {
    return Array.isArray(a) ? a.slice() : [];
  },
  merge<T extends object>(base: T, patch: Partial<T>): T {
    return { ...(base as any), ...(patch as any) } as T;
  },
};

/** **********************************************************************
 * Types
 * **********************************************************************/

/** @brief 카메라 ID 고정 매핑 */
export enum CameraId {
  Scanner = 0,
  Object = 1,
}

/** @brief 카메라 종류 */
export type CameraKind = "scanner" | "object";

/** @brief 초기화 단계 항목 */
export type HwStep = { title: string; done: boolean };

/** @brief 조명 채널 */
export type LightChannel = { id: number; value: number; isOn: boolean };

/** @brief 카메라 연결/스트림 상태 */
export type CameraStatus = "idle" | "connecting" | "streaming" | "error";

/** @brief 카메라 런타임 정보 */
export interface CameraInfo {
  id: number;
  name: string;
  status: CameraStatus;
  exposure?: number;
  gain?: number;
  error?: string;
  // [NEW] Config
  resolution?: { width: number; height: number };
  presets?: Record<string, any>;
}

/** @brief 전역 상태 */
export type AxisFlags = {
  servo: { X: boolean; Y: boolean; Z: boolean };
  homed: { X: boolean; Y: boolean; Z: boolean };
  alarm: { X: boolean; Y: boolean; Z: boolean };
  alarmReason: { X: string; Y: string; Z: string };
  servoState: { X: number; Y: number; Z: number };
  alarmResetState: { X: number; Y: number; Z: number };
};

export interface IAureliaStatus {
  connected: boolean;
  power_status: number;
  shutter_status?: number;
  op_status: number;
  temp: number;
  humidity: number;
  alarm: number;
  err_data: number;
  r_hour: number;
  r_min: number;
  il: boolean;
  ch: boolean;
  ml: boolean;
  t_alarm: boolean;
  ol: boolean;
  used?: boolean;

  err_code?: number;
  mode?: number;
  prf?: number;
  burst?: number;
  amp?: number;
  pw?: number;
}

export interface ProcessStatus {
  state: 'idle' | 'running' | 'paused';
  progress: number;
  startTime: string | null; // ISO string for easy storage
  elapsedSeconds: number;
  estimatedTotalSeconds: number; // Persistent estimate
  finalElapsedTime: number | null;
  // [Issue9 P3 2026-07-23] 드라이버 실측 MARK TIMES 회차 방송(__onScannerMarkPass) 저장소.
  // 기존의 "진행률 × 선택 스와치 프리셋" 유도 계산(다색/소형 블록에서 오표시)을 대체한다.
  markPass: number;        // 현재 색상 그룹의 회차 (0 = 미방송)
  markPassTotal: number;   // 현재 색상 그룹의 총 반복 횟수 (0 = 미방송)
  markPassColor: string;   // 현재 그룹의 레이어 색상 hex ('' = 미상)
}

export interface AppState {
  // Machine Config
  hardware: HardwareConfig;
  features: FeatureConfig;
  setMachineStatus: (status: { hardware: HardwareConfig; features: FeatureConfig }) => void;
  useCanvas: boolean;
  setUseCanvas: (use: boolean) => void;
  useProcessDetail: boolean;
  setUseProcessDetail: (use: boolean) => void;
  maxHistorySteps: number;
  setMaxHistorySteps: (steps: number) => void;

  // Stage Limit
  stageLimit: { minX: number; maxX: number; minY: number; maxY: number };
  setStageLimit: (limit: { minX: number; maxX: number; minY: number; maxY: number }) => void;

  // Config
  cameraConfig: any;
  setCameraConfig: (cfg: any) => void;
  loadCameraConfig: () => Promise<void>;

  // Moons Config (Hardware defaults)
  moonsConfig: any;
  setMoonsConfig: (cfg: any) => void;

  // Recipe Center
  recipeCenter: {
    scanner: { x: number; y: number; pixelX?: number; pixelY?: number; viewRatio?: number };
    object_x20: { x: number; y: number; pixelX?: number; pixelY?: number; viewRatio?: number };
    object_x50: { x: number; y: number; pixelX?: number; pixelY?: number; viewRatio?: number };
  };
  isSetCenterMode: boolean;
  setRecipeCenter: (mode: 'scanner' | 'object_x20' | 'object_x50', pos: { x: number; y: number; pixelX?: number; pixelY?: number; viewRatio?: number }) => void;
  setIsSetCenterMode: (mode: boolean) => void;
  loadRecipeCenterData: () => Promise<void>;
  saveRecipeCenterData: () => Promise<void>;
  initRecipeCenterFromConfig: () => Promise<void>;

  // 초기화/공통
  initSteps: HwStep[];
  progress: number;
  zoom: number;
  lights: LightChannel[];
  jogging: boolean;
  positions: Record<string, number>;

  // Jog Settings
  jog: {
    mode: "JOG" | "REL" | "ABS";
    speed: "slow" | "mid" | "fast";
    relStep: Record<"X" | "Y" | "Z", string>;
    absTarget: Record<"X" | "Y" | "Z", string>;
    direction: Record<"X" | "Y" | "Z", 1 | -1>;
    jogXDir: number;
    jogYDir: number;
  };
  setJogMode: (mode: "JOG" | "REL" | "ABS") => void;
  setJogSpeed: (speed: "slow" | "mid" | "fast") => void;
  setJogRelStep: (axis: "X" | "Y" | "Z", val: string) => void;
  setJogAbsTarget: (axis: "X" | "Y" | "Z", val: string) => void;
  setJogDirection: (axis: "X" | "Y" | "Z", dir: 1 | -1) => void;
  setJogDirections: (x: number, y: number) => void;

  // 카메라
  objectMag: "x20" | "x50";
  cameraKind: CameraKind; ///< "scanner" | "object"
  currentCameraId: CameraId; ///< 실제 스트림 id (0=Scanner, 1=Object)
  streamVersion: number; ///< MJPEG 캐시-바스팅용 버전
  cameras: Record<number, CameraInfo>;

  //Actions
  setObjectMag: (mag: "x20" | "x50") => void;
  setProgress: (v: number) => void;
  setStepTitle: (idx: number, title: string, markDone?: boolean) => void;
  markDone: (idx: number) => void;
  setZoom: (z: number) => void;
  setLight: (id: number, v: number) => void;
  setLightOn: (id: number, on: boolean) => void;
  setJog: (v: boolean) => void;
  setPosition: (axis: string, v: number) => void;
  resetInit: () => void;

  // Motion State
  motion: {
    state: string;
    axisFlags: AxisFlags;
    commError: boolean;
    commErrorMessage: string;
  };
  io: {
    flags: { emo: boolean; vac: boolean; door: boolean; laser: boolean };
  };
  setMotionState: (state: string) => void;
  setHardwareFlags: (flags: { axisFlags: AxisFlags; emo: boolean }) => void;
  setCommError: (hasError: boolean, message: string) => void;

  setCameraKind: (k: CameraKind) => void;
  setCurrentCameraId: (id: CameraId) => void;
  toggleCameraKind: () => void;

  setCameraStatus: (id: number, status: CameraStatus, error?: string) => void;

  // UI State
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;

  /** @note LeftNav \u2192 Parameter Page Switching */
  parameterView: "motion" | "motion-axis" | "motion-speed" | "motion-lens" | "motion-mirror" | "scanCam" | "objectCam" | "lights" | "laser" | "scanner" | "calibration" | "offset-calibration" | null;
  setParameterView: (view: "motion" | "motion-axis" | "motion-speed" | "motion-lens" | "motion-mirror" | "scanCam" | "objectCam" | "lights" | "laser" | "scanner" | "calibration" | "offset-calibration" | null) => void;

  setCameraParams: (
    id: number,
    p: Partial<Pick<CameraInfo, "exposure" | "gain">>
  ) => void;

  // --- Laser Shutter Global State ---
  laserShutter: boolean;
  setLaserShutter: (on: boolean) => void;

  // --- Homing State ---
  homingState: { active: boolean; type: "all" | "X" | "Y" | "Z" | null; startTime?: number };
  setHomingState: (state: { active: boolean; type: "all" | "X" | "Y" | "Z" | null; startTime?: number }) => void;

  /** @brief 스트림 재연결/강제 새로고침 트리거 */
  bumpStreamVersion: () => void;

  // Dialog State
  dialog: {
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    showCancel?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
    type?: "info" | "confirm" | "warning"; // default confirm
  };
  openDialog: (props: Omit<AppState["dialog"], "open">) => void;
  closeDialog: () => void;

  // Legacy alias
  setStepMessage: (idx: number, title: string) => void;

  // Notification (Toast)
  notification: {
    message: string | null;
    type: "success" | "info" | "warning" | "error";
    timerId: ReturnType<typeof setTimeout> | null;
  };
  showToast: (message: string, type?: "success" | "info" | "warning" | "error") => void;
  hideToast: () => void;

  // Process Dashboard State
  processStates: Record<"scanner" | "gcode", ProcessStatus>;
  updateProcessStatus: (kind: "scanner" | "gcode", patch: Partial<ProcessStatus>) => void;
  resetProcessStatus: (kind: "scanner" | "gcode") => void;

  lastProcessStartPosition: { X: number, Y: number } | null;
  setLastProcessStartPosition: (pos: { X: number, Y: number } | null) => void;

  // Aurelia Laser
  aureliaStatus: IAureliaStatus;
  setAureliaStatus: (status: IAureliaStatus) => void;

  // Scanlab
  scanlab: {
    connected: boolean;
    headStatus: number;
    initStatus: number;
  };
  setScanlabStatus: (status: { connected: boolean; headStatus: number; initStatus: number }) => void;
}


/** **********************************************************************
 * Initials
 * **********************************************************************/
const INITIAL_STEPS: HwStep[] = [
  { title: "Load Config", done: false },
  { title: "Connect Motion", done: false },
  { title: "Connect Camera", done: false },
  { title: "Connect Light", done: false },
  { title: "Homing / Ready", done: false },
];

const INITIAL_LIGHTS: LightChannel[] = [
  { id: 1, value: 0, isOn: false },
  { id: 2, value: 0, isOn: false },
  { id: 3, value: 0, isOn: false },
  { id: 4, value: 0, isOn: false },
  { id: 5, value: 0, isOn: false },
];

/** @note 초기 카메라 로드는 기본값 PMAC 기준으로 생성 (동적 업데이트됨) */
const INITIAL_CAMERAS: Record<number, CameraInfo> = Object.fromEntries(
  getEnabledCameras("PMAC").map(c => [c.slotId, { id: c.slotId, name: c.name, status: "idle" as CameraStatus }])
);

const INITIAL_PROCESS_STATUS: ProcessStatus = {
  state: 'idle',
  progress: 0,
  startTime: null,
  elapsedSeconds: 0,
  estimatedTotalSeconds: 0,
  finalElapsedTime: null,
  markPass: 0,
  markPassTotal: 0,
  markPassColor: '',
};

/** **********************************************************************
 * Store
 * **********************************************************************/
export const useAppStore = create<AppState>((set, get) => ({
  // Machine State
  hardware: {
    scanner: "SinoGalvo",
    motion: "PMAC",
    light: "LFINE",
    laser: "JPT"
  },
  features: {
    lightChannels: 5,
    allowedModes: ["SCANNER", "OBJECT"],
    allowedLenses: ["X20", "X50"],
    hasLensMotor: true,
    hasZeroG: false,
    useLight: true,
    useLaser: true,
    hasObjectX20: true
  },
  setMachineStatus: (status) => {
    // 동적 카메라 슬롯 업데이트 로직
    const newCameras = getEnabledCameras(status.hardware.motion);
    set((s) => {
      const updatedCameras: Record<number, CameraInfo> = {};
      newCameras.forEach(c => {
        updatedCameras[c.slotId] = s.cameras[c.slotId] ?? { id: c.slotId, name: c.name, status: "idle" as CameraStatus };
      });
      const hasObjectX20 = status.features.allowedLenses.includes("X20");
      return {
        hardware: status.hardware,
        features: {
          ...status.features,
          hasObjectX20
        },
        objectMag: hasObjectX20 ? "x20" : "x50",
        cameras: updatedCameras
      };
    });
  },
  useCanvas: true,
  setUseCanvas: (useCanvas) => set({ useCanvas }),
  useProcessDetail: true,
  setUseProcessDetail: (useProcessDetail) => set({ useProcessDetail }),
  maxHistorySteps: 100,
  setMaxHistorySteps: (maxHistorySteps) => set({ maxHistorySteps }),

  stageLimit: { minX: -100, maxX: 100, minY: -100, maxY: 100 },
  setStageLimit: (stageLimit) => set({ stageLimit }),

  // State
  initSteps: INITIAL_STEPS.map((s) => ({ ...s })),
  progress: 0,
  zoom: 100,
  lights: INITIAL_LIGHTS.map((l) => ({ ...l })),
  jogging: false,
  positions: { X: 0, Y: 0, Z: 0, A: 0, C: 0 },
  motion: {
    state: "Ready",
    axisFlags: {
      servo: { X: false, Y: false, Z: false },
      homed: { X: false, Y: false, Z: false },
      alarm: { X: false, Y: false, Z: false },
      alarmReason: { X: "None", Y: "None", Z: "None" },
      servoState: { X: -1, Y: -1, Z: -1 },
      alarmResetState: { X: -1, Y: -1, Z: -1 }
    },
    commError: false,
    commErrorMessage: "",
  },
  io: {
    flags: { emo: false, vac: false, door: true, laser: false },
  },
  jog: {
    mode: "JOG",
    speed: "mid",
    relStep: { X: "0.001", Y: "0.001", Z: "0.001" }, // Changed default to 0.001
    absTarget: { X: "0", Y: "0", Z: "0" },
    direction: { X: -1, Y: -1, Z: 1 }, // X, Y axis inverted by default
    jogXDir: 0,
    jogYDir: 0,
  },

  cameraKind: "scanner",
  currentCameraId: CameraId.Scanner, // 기본을 Scanner(1)로 고정
  objectMag: "x20", // default
  streamVersion: 0,
  cameras: { ...INITIAL_CAMERAS },

  // UI State
  rightPanelOpen: true,
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),

  /**
   * @brief 현재 활성화된 Parameter 서브 뷰 (localStorage로 상태 유지, 초기값 motion-axis 설정)
   * @details Clean Code Principle: IIFE(즉시 실행 함수)를 활용하여 localStorage 접근을 응집도 있게 처리합니다.
   */
  parameterView: (() => {
    try {
      const saved = localStorage.getItem("PARAMETER_LAST_VIEW");
      if (saved) return saved as AppState["parameterView"];
    } catch (e) {
      console.warn("localStorage access denied for PARAMETER_LAST_VIEW");
    }
    return "motion-axis";
  })(),

  /**
   * @brief Parameter 서브 뷰 설정 및 localStorage 저장
   * @param view 활성화할 뷰 
   */
  setParameterView: (view) => {
    set({ parameterView: view });
    try {
      if (view) {
        localStorage.setItem("PARAMETER_LAST_VIEW", view);
      } else {
        localStorage.removeItem("PARAMETER_LAST_VIEW");
      }
    } catch (e) {
      console.warn("localStorage write disabled for PARAMETER_LAST_VIEW");
    }
  },

  // Actions
  setObjectMag: (mag) => set({ objectMag: mag }),
  setProgress: (v) => set({ progress: clamp(Math.round(v), 0, 100) }),

  setStepTitle: (idx, title, markDone = true) =>
    set((s) => {
      const steps = immut.arr(s.initSteps);
      if (steps[idx])
        steps[idx] = { title, done: markDone ? true : steps[idx].done };
      return { initSteps: steps };
    }),

  markDone: (idx) =>
    set((s) => {
      const steps = immut.arr(s.initSteps);
      if (steps[idx]) steps[idx] = { ...steps[idx], done: true };
      return { initSteps: steps };
    }),

  setZoom: (z) => set({ zoom: clamp(Math.round(z), 10, 400) }),

  setLight: (id, v) =>
    set((s) => ({
      lights: s.lights.map((L) =>
        L.id === id ? { ...L, value: clamp(Math.round(v), 0, 100) } : L
      ),
    })),

  setLightOn: (id, on) =>
    set((s) => ({
      lights: s.lights.map((L) => (L.id === id ? { ...L, isOn: on } : L)),
    })),

  setJog: (v) => set({ jogging: v }),

  setPosition: (axis, v) =>
    set((s) => ({ positions: { ...s.positions, [axis]: v } })),

  setMotionState: (state) => set((s) => ({ motion: { ...s.motion, state } })),

  setHardwareFlags: (flags) =>
    set((s) => ({
      motion: {
        ...s.motion,
        axisFlags: flags.axisFlags,
      },
      io: {
        ...s.io,
        flags: { ...s.io.flags, emo: flags.emo },
      },
    })),

  setCommError: (hasError, message) =>
    set((s) => ({
      motion: {
        ...s.motion,
        commError: hasError,
        commErrorMessage: message,
      },
    })),

  // Jog Actions
  setJogMode: (mode) => set((s) => ({ jog: { ...s.jog, mode } })),
  setJogSpeed: (speed) => set((s) => ({ jog: { ...s.jog, speed } })),
  setJogRelStep: (axis, val) =>
    set((s) => ({ jog: { ...s.jog, relStep: { ...s.jog.relStep, [axis]: val } } })),
  setJogAbsTarget: (axis, val) =>
    set((s) => ({ jog: { ...s.jog, absTarget: { ...s.jog.absTarget, [axis]: val } } })),
  setJogDirection: (axis, dir) =>
    set((s) => ({ jog: { ...s.jog, direction: { ...s.jog.direction, [axis]: dir } } })),
  setJogDirections: (x, y) =>
    set((s) => ({ jog: { ...s.jog, jogXDir: x, jogYDir: y } })),

  resetInit: () =>
    set((s) => ({
      progress: 0,
      initSteps: s.initSteps.map((x) => ({
        title: x.title.split(" | ")[0],
        done: false,
      })),
    })),

  setCameraKind: (k) =>
    set((s) => {
      // kind → id 동기화
      const nextId =
        k === "object"
          ? CameraId.Object
          : CameraId.Scanner;
      return { cameraKind: k, currentCameraId: nextId };
    }),

  setCurrentCameraId: (id) =>
    set((s) => {
      // id → kind 동기화
      const nextKind: CameraKind =
        id === CameraId.Object
          ? "object"
          : "scanner";
      return { currentCameraId: id, cameraKind: nextKind };
    }),

  toggleCameraKind: () =>
    set((s) => {
      const nextKind: CameraKind =
        s.cameraKind === "scanner" ? "object" : "scanner";
      const nextId =
        nextKind === "scanner" ? CameraId.Scanner : CameraId.Object;
      return { cameraKind: nextKind, currentCameraId: nextId };
    }),

  laserShutter: false,
  setLaserShutter: (on) => set({ laserShutter: on }),

  homingState: { active: false, type: null, startTime: 0 },
  setHomingState: (state) => set({ homingState: state }),

  setCameraStatus: (id, status, error) =>
    set((s) => ({
      cameras: {
        ...s.cameras,
        [id]: immut.merge<CameraInfo>(
          s.cameras[id] ?? {
            id,
            name:
              id === CameraId.Object
                ? "Object"
                : "Scanner",
            status: "idle",
          },
          { status, error }
        ),
      },
    })),

  setCameraParams: (id, p) =>
    set((s) => ({
      cameras: {
        ...s.cameras,
        [id]: immut.merge<CameraInfo>(
          s.cameras[id] ?? {
            id,
            name:
              id === CameraId.Object
                ? "Object"
                : "Scanner",
            status: "idle",
          },
          p
        ),
      },
    })),

  // Config
  cameraConfig: null,
  setCameraConfig: (cfg: any) => set({ cameraConfig: cfg }),
  moonsConfig: null,
  setMoonsConfig: (cfg: any) => set({ moonsConfig: cfg }),
  loadCameraConfig: async () => {
    try {
      const { ok, data } = await hwFacade.getCameraConfig();
      if (ok && data) {
        // Support both legacy and new structure (wrapped in "data")
        const config = data.data && Array.isArray(data.data.cameras) ? data.data : data;
        set({ cameraConfig: config });
      } else {
        // Fallback for Localhost / Dev
        console.warn("Using Mock Camera Config");
        set({
          cameraConfig: {
            system_version: "1.0",
            cameras: [
              {
                id: 1, name: "Scanner", vendor: "HikRobot", resolution: { width: 2448, height: 2048 },
                presets: [{ magnification: 20.0, gain: 6.0, exposure_time: 80000.0 }] // Single lens scenario per user req
              },
              {
                id: 2, name: "Object", vendor: "BASLER", resolution: { width: 2448, height: 2048 },
                presets: [
                  { magnification: 20.0, gain: 0.0, exposure_time: 3000.0 },
                  { magnification: 50.0, gain: 0.0, exposure_time: 5000.0 }
                ]
              }
            ]
          }
        });
      }
    } catch (e) {
      console.error("Failed to load camera config", e);
      // Fallback for Error Case
      set({
        cameraConfig: {
          cameras: [
            { id: 1, name: "Scanner (Mock)", resolution: { width: 2448, height: 2048 }, presets: [] },
            { id: 2, name: "Object (Mock)", resolution: { width: 2448, height: 2048 }, presets: [] }
          ]
        }
      });
    }
  },

  // Recipe Center
  recipeCenter: {
    scanner: { x: 0, y: 0 },
    object_x20: { x: 0, y: 0 },
    object_x50: { x: 0, y: 0 },
  },
  isSetCenterMode: false,
  setRecipeCenter: (mode, pos) => set((s) => ({
    recipeCenter: { ...s.recipeCenter, [mode]: pos }
  })),
  setIsSetCenterMode: (mode) => set({ isSetCenterMode: mode }),
  loadRecipeCenterData: async () => {
    try {
      const { ok, data } = await hwFacade.loadRecipeCenter();
      if (ok && data) {
        const parsed = JSON.parse(data);
        set((s) => ({ recipeCenter: { ...s.recipeCenter, ...parsed } }));
      }
    } catch (e) {
      console.error("Failed to load RecipeCenter", e);
    }
  },
  saveRecipeCenterData: async () => {
    try {
      await hwFacade.saveRecipeCenter(get().recipeCenter);
    } catch (e) {
      console.error("Failed to save RecipeCenter", e);
    }
  },
  initRecipeCenterFromConfig: async () => {
    try {
      const { ok, data } = await hwFacade.getMoonsConfig();
      if (ok && data) {
        set((s) => {
          // [FIX] recipeCenter.json에 x, y 위치값이 누락되었거나 0인 경우,
          // pixelX 등 다른 캘리브레이션 값이 있더라도 하드웨어 offset(Config)으로 폴백하도록 수정합니다.
          // (0,0)은 물리적으로 유효한 오프셋이 아니므로 0일 경우에도 fallback합니다.
          const scannerX = (s.recipeCenter.scanner.x !== undefined && s.recipeCenter.scanner.x !== 0) ? s.recipeCenter.scanner.x : (data.mirror?.stage_x_offset ?? 0);
          const scannerY = (s.recipeCenter.scanner.y !== undefined && s.recipeCenter.scanner.y !== 0) ? s.recipeCenter.scanner.y : (data.mirror?.stage_y_offset ?? 0);

          const object_x20X = (s.recipeCenter.object_x20.x !== undefined && s.recipeCenter.object_x20.x !== 0) ? s.recipeCenter.object_x20.x : (data.lens?.stage_x20_offset ?? 0);
          const object_x20Y = (s.recipeCenter.object_x20.y !== undefined && s.recipeCenter.object_x20.y !== 0) ? s.recipeCenter.object_x20.y : (data.lens?.stage_y20_offset ?? 0);

          const object_x50X = (s.recipeCenter.object_x50.x !== undefined && s.recipeCenter.object_x50.x !== 0) ? s.recipeCenter.object_x50.x : (data.lens?.stage_x50_offset ?? 0);
          const object_x50Y = (s.recipeCenter.object_x50.y !== undefined && s.recipeCenter.object_x50.y !== 0) ? s.recipeCenter.object_x50.y : (data.lens?.stage_y50_offset ?? 0);

          const scanner = { ...s.recipeCenter.scanner, x: scannerX, y: scannerY };
          const object_x20 = { ...s.recipeCenter.object_x20, x: object_x20X, y: object_x20Y };
          const object_x50 = { ...s.recipeCenter.object_x50, x: object_x50X, y: object_x50Y };

          console.log("[appStore] Initialized RecipeCenter from MoonsConfig (Origin fallback)", { scanner, object_x20, object_x50 });
          return { recipeCenter: { scanner, object_x20, object_x50 }, moonsConfig: data };
        });
      }
    } catch (e) {
      console.error("Failed to init RecipeCenter from config", e);
    }
  },

  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  bumpStreamVersion: () => set((s) => ({ streamVersion: s.streamVersion + 1 })),

  // Dialog Actions
  dialog: {
    open: false,
    title: "",
    message: "",
  },
  openDialog: (props) => set((s) => ({ dialog: { ...s.dialog, ...props, open: true } })),
  closeDialog: () => set((s) => ({ dialog: { ...s.dialog, open: false } })),

  // Legacy alias
  setStepMessage: (idx: number, title: string) => {
    get().setStepTitle(idx, title, true);
  },

  // Notification (Toast)
  notification: {
    message: null,
    type: "info",
    timerId: null,
  },
  showToast: (message, type = "info") => {
    // Clear existing timer if any
    const prevTimer = get().notification.timerId;
    if (prevTimer) clearTimeout(prevTimer);

    // Set new timer for auto-dismiss
    const timerId = setTimeout(() => {
      set((s) => ({ notification: { ...s.notification, message: null, timerId: null } }));
    }, 3000); // 3 seconds

    set({ notification: { message, type, timerId } });
  },
  hideToast: () => {
    const prevTimer = get().notification.timerId;
    if (prevTimer) clearTimeout(prevTimer);
    set((s) => ({ notification: { ...s.notification, message: null, timerId: null } }));
  },

  // Process Dashboard Actions
  processStates: {
    scanner: { ...INITIAL_PROCESS_STATUS },
    gcode: { ...INITIAL_PROCESS_STATUS },
  },
  updateProcessStatus: (kind, patch) =>
    set((s) => {
      const currentStatus = s.processStates[kind];
      // [FIX] Ensure progress only increases (monotonic) to prevent jumping/bouncing
      if ('progress' in patch && patch.progress !== undefined) {
        patch.progress = Math.max(currentStatus.progress || 0, patch.progress);
      }
      return {
        processStates: {
          ...s.processStates,
          [kind]: { ...currentStatus, ...patch },
        },
      };
    }),
  resetProcessStatus: (kind) =>
    set((s) => ({
      processStates: {
        ...s.processStates,
        [kind]: { ...INITIAL_PROCESS_STATUS },
      },
    })),

  lastProcessStartPosition: null,
  setLastProcessStartPosition: (pos) => set({ lastProcessStartPosition: pos }),

  // Aurelia Laser
  aureliaStatus: {
    connected: false,
    power_status: 0,
    op_status: 0,
    temp: 0,
    humidity: 0,
    alarm: 0,
    err_data: 0,
    r_hour: 0,
    r_min: 0,
    il: false,
    ch: false,
    ml: false,
    t_alarm: false,
    ol: false,
    used: true,
  },
  setAureliaStatus: (status) => set({ aureliaStatus: status }),

  // Scanlab
  scanlab: {
    connected: false,
    headStatus: 0,
    initStatus: 0,
  },
  setScanlabStatus: (status) => set({ scanlab: status }),
}));

/** **********************************************************************
 * Selectors
 * **********************************************************************/
export const selectCameraKind = (s: AppState) => s.cameraKind;
export const selectZoom = (s: AppState) => s.zoom;
export const selectProgress = (s: AppState) => s.progress;
export const selectLights = (s: AppState) => s.lights;
export const selectCameras = (s: AppState) => s.cameras;
export const selectCurrentCameraId = (s: AppState) => s.currentCameraId;
export const selectCurrentCamera = (s: AppState) =>
  s.cameras[s.currentCameraId];
export const selectIsStreaming = (s: AppState) =>
  (s.cameras[s.currentCameraId]?.status ?? "idle") === "streaming";
export const selectStreamVersion = (s: AppState) => s.streamVersion;

export const selectors = {
  cameraKind: selectCameraKind,
  zoom: selectZoom,
  progress: selectProgress,
  lights: selectLights,
  cameras: selectCameras,
  currentCameraId: selectCurrentCameraId,
  currentCamera: selectCurrentCamera,
  isStreaming: selectIsStreaming,
  streamVersion: selectStreamVersion,
  objectMag: (s: AppState) => s.objectMag,
  positions: (s: AppState) => s.positions,
  parameterView: (s: AppState) => s.parameterView,
};

/** **********************************************************************
 * Non-hook accessor
 * **********************************************************************/
export const getAppState = () => useAppStore.getState();
export default useAppStore;
