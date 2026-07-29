/* AUTO-GENERATED — DO NOT EDIT */
export type IpcVersion = "1.1.0";
export type Channel = "app.quit" | "app.window.close" | "app.window.minimize" | "app.window.maximizeToggle" | "app.window.drag" | "app.window.setState" | "app.openMain" | "motion.homeAll" | "motion.home" | "motion.getPosition" | "cmd.motion.setServo" | "cmd.motion.resetAlarm" | "motion.jog.start" | "motion.jog.stop" | "motion.setJogSpeed" | "motion.stop" | "motion.moveRel" | "motion.moveAbs" | "camera.start" | "camera.stop" | "camera.setParams" | "camera.getRange" | "camera.getParams" | "cmd.gcode.write" | "cmd.gcode.run" | "cmd.gcode.status" | "cmd.moons.preset" | "cmd.scanner.generate" | "cmd.scanner.run" | "cmd.scanner.stop" | "cmd.dialog.openImage" | "cmd.dialog.saveImage" | "cmd.calibration.save" | "cmd.calibration.load" | "cmd.calibration.list" | "cmd.calibration.rollback" | "cmd.calibration.delete" | "cmd.config.getCamera" | "cmd.config.setCamera" | "cmd.config.getMotion" | "cmd.config.setMotion" | "cmd.calib.getState" | "cmd.calib.setViewRatio" | "cmd.calib.pickCenter" | "cmd.calib.apply" | "cmd.calib.save" | "cmd.light.get_config" | "cmd.light.set_val" | "cmd.light.set_mode" | "cmd.light.save" | "cmd.recipe.center.save" | "cmd.recipe.center.load" | "cmd.presetLibrary.save" | "cmd.presetLibrary.load";

export interface ArgsMap {
  "app.quit": {

  };
  "app.window.close": {

  };
  "app.window.minimize": {

  };
  "app.window.maximizeToggle": {

  };
  "app.window.drag": {

  };
  "app.window.setState": {
    state: "maximized" | "minimized" | "restored";
  };
  "app.openMain": {
    route: string;
    show?: "maximized" | "restored" | "normal";
  };
  "motion.homeAll": {
    timeoutMs?: number;
  };
  "motion.home": {
    axis: "X" | "Y" | "Z" | "A" | "C";
  };
  "motion.getPosition": {
    axis?: "X" | "Y" | "Z" | "A" | "C";
    position?: number;
  };
  "cmd.motion.setServo": {

  };
  "cmd.motion.resetAlarm": {

  };
  "motion.jog.start": {
    axis: "X" | "Y" | "Z" | "A" | "C";
    dir: "+" | "-";
    speed: string;
  };
  "motion.jog.stop": {
    axis: "X" | "Y" | "Z" | "A" | "C";
  };
  "motion.setJogSpeed": {
    speed: "slow" | "mid" | "fast";
  };
  "motion.stop": {

  };
  "motion.moveRel": {
    axis: "X" | "Y" | "Z" | "A" | "C";
    distance: number;
    speed?: string;
  };
  "motion.moveAbs": {
    axis: "X" | "Y" | "Z" | "A" | "C";
    position: number;
    speed?: string;
  };
  "camera.start": {
    id: number;
    preview?: unknown;
  };
  "camera.stop": {
    id: number;
  };
  "camera.setParams": {
    id: number;
    exposure?: number;
    gain?: number;
  };
  "camera.getRange": {
    id: number;
  };
  "camera.getParams": {
    id: number;
  };
  "cmd.gcode.write": {

  };
  "cmd.gcode.run": {

  };
  "cmd.gcode.status": {

  };
  "cmd.moons.preset": {
    payload: "scanner_base" | "object_x20" | "object_x50";
  };
  "cmd.scanner.generate": {

  };
  "cmd.scanner.run": {

  };
  "cmd.scanner.stop": {

  };
  "cmd.dialog.openImage": {

  };
  "cmd.dialog.saveImage": {

  };
  "cmd.calibration.save": {

  };
  "cmd.calibration.load": {

  };
  "cmd.calibration.list": {

  };
  "cmd.calibration.rollback": {

  };
  "cmd.calibration.delete": {

  };
  "cmd.config.getCamera": {

  };
  "cmd.config.setCamera": {

  };
  "cmd.config.getMotion": {

  };
  "cmd.config.setMotion": {

  };
  "cmd.calib.getState": {

  };
  "cmd.calib.setViewRatio": {

  };
  "cmd.calib.pickCenter": {

  };
  "cmd.calib.apply": {

  };
  "cmd.calib.save": {

  };
  "cmd.light.get_config": {

  };
  "cmd.light.set_val": {

  };
  "cmd.light.set_mode": {

  };
  "cmd.light.save": {

  };
  "cmd.recipe.center.save": {

  };
  "cmd.recipe.center.load": {

  };
  "cmd.presetLibrary.save": {

  };
  "cmd.presetLibrary.load": {

  };
}

export const Channels = {
  app_quit: "app.quit",
  app_window_close: "app.window.close",
  app_window_minimize: "app.window.minimize",
  app_window_maximizeToggle: "app.window.maximizeToggle",
  app_window_drag: "app.window.drag",
  app_window_setState: "app.window.setState",
  app_openMain: "app.openMain",
  motion_homeAll: "motion.homeAll",
  motion_home: "motion.home",
  motion_getPosition: "motion.getPosition",
  cmd_motion_setServo: "cmd.motion.setServo",
  cmd_motion_resetAlarm: "cmd.motion.resetAlarm",
  motion_jog_start: "motion.jog.start",
  motion_jog_stop: "motion.jog.stop",
  motion_setJogSpeed: "motion.setJogSpeed",
  motion_stop: "motion.stop",
  motion_moveRel: "motion.moveRel",
  motion_moveAbs: "motion.moveAbs",
  camera_start: "camera.start",
  camera_stop: "camera.stop",
  camera_setParams: "camera.setParams",
  camera_getRange: "camera.getRange",
  camera_getParams: "camera.getParams",
  cmd_gcode_write: "cmd.gcode.write",
  cmd_gcode_run: "cmd.gcode.run",
  cmd_gcode_status: "cmd.gcode.status",
  cmd_moons_preset: "cmd.moons.preset",
  cmd_scanner_generate: "cmd.scanner.generate",
  cmd_scanner_run: "cmd.scanner.run",
  cmd_scanner_stop: "cmd.scanner.stop",
  cmd_dialog_openImage: "cmd.dialog.openImage",
  cmd_dialog_saveImage: "cmd.dialog.saveImage",
  cmd_calibration_save: "cmd.calibration.save",
  cmd_calibration_load: "cmd.calibration.load",
  cmd_calibration_list: "cmd.calibration.list",
  cmd_calibration_rollback: "cmd.calibration.rollback",
  cmd_calibration_delete: "cmd.calibration.delete",
  cmd_config_getCamera: "cmd.config.getCamera",
  cmd_config_setCamera: "cmd.config.setCamera",
  cmd_config_getMotion: "cmd.config.getMotion",
  cmd_config_setMotion: "cmd.config.setMotion",
  cmd_calib_getState: "cmd.calib.getState",
  cmd_calib_setViewRatio: "cmd.calib.setViewRatio",
  cmd_calib_pickCenter: "cmd.calib.pickCenter",
  cmd_calib_apply: "cmd.calib.apply",
  cmd_calib_save: "cmd.calib.save",
  cmd_light_get_config: "cmd.light.get_config",
  cmd_light_set_val: "cmd.light.set_val",
  cmd_light_set_mode: "cmd.light.set_mode",
  cmd_light_save: "cmd.light.save",
  cmd_recipe_center_save: "cmd.recipe.center.save",
  cmd_recipe_center_load: "cmd.recipe.center.load",
  cmd_presetLibrary_save: "cmd.presetLibrary.save",
  cmd_presetLibrary_load: "cmd.presetLibrary.load"
} as const;

export type Envelope<C extends Channel = Channel> = {
  version: IpcVersion;
  reqId?: string;
  channel: C;
  args: ArgsMap[C];
};
