
export type MachineType = "MC1" | "MC2" | "MC3";
export type JogAxis = "X" | "Y" | "Z";
export interface IHardwareFacade {
  initialize(): Promise<void>;
  jogStart(axis: JogAxis, dir: 1 | -1, speed?: string): Promise<void>;
  jogStop(axis: JogAxis): Promise<void>;
  stopAll(): Promise<void>;
  moveRel(axis: JogAxis, distance: number, speed?: string): Promise<void>;
  moveAbs(axis: JogAxis, position: number, speed?: string): Promise<void>;
  home(axis: string): Promise<void>;
  homeAll(): Promise<void>;
  setLight(channel: number, value: number): Promise<void>;
  setZoom(percent: number): Promise<void>;

  // [NEW] Laser Config
  getLaserConfig(): Promise<{ ok: boolean; data?: any; message?: string }>;
  setLaserConfig(config: any): Promise<{ ok: boolean; message?: string }>;

  // [NEW] Moons Config
  getMoonsConfig(): Promise<{ ok: boolean; data?: MoonsConfig; message?: string }>;
  setMoonsConfig(config: MoonsConfig): Promise<{ ok: boolean; message?: string }>;
  getMachineStatus(): Promise<{ ok: boolean; type?: MachineType; useCanvas?: number }>;

  // Aurelia Laser
  aureliaPower(on: boolean): Promise<any>;
  aureliaShutter(open: boolean): Promise<any>;
  aureliaSetParams(params: { prf?: number, amp?: number, burst?: number, pw?: number }): Promise<any>;
  aureliaGetStatus(): Promise<any>;

  // Scanner Control
  scannerControl(mode?: number, options?: { scannerMarkSpeed?: number; scannerIntensity?: number }): Promise<boolean>;
  scannerStop(): Promise<boolean>;
  scannerInit(): Promise<{ ok: boolean; message?: string }>;
}

export interface MoonsMotionProfile {
  run_vel: number;
  run_acc: number;
  run_dec: number;
}

export interface MoonsLensParams {
  id: number;
  lead: number;
  pluse: number;
  home: MoonsMotionProfile;
  move: MoonsMotionProfile;
  jog: MoonsMotionProfile;
  x20: number;
  x20_z_pos: number;
  x20_safe_z: number;
  stage_x20_offset: number;
  stage_y20_offset: number;
  x50: number;
  x50_z_pos: number;
  x50_safe_z: number;
  stage_x50_offset: number;
  stage_y50_offset: number;
}

export interface MoonsMirrorParams {
  id: number;
  lead: number;
  pluse: number;
  home: MoonsMotionProfile;
  move: MoonsMotionProfile;
  jog: MoonsMotionProfile;
  scanner_pos: number;
  scanner_z_pos: number;
  scanner_safe_z: number;
  objective_pos: number;
  stage_x_offset: number;
  stage_y_offset: number;
}

export interface MoonsConfig {
  connect: { com: number; baudrate: number };
  lens?: MoonsLensParams;
  mirror: MoonsMirrorParams;
}
