// AUTO-GENERATED — DO NOT EDIT
#pragma once
#include <string_view>

namespace ipc {
static constexpr std::string_view kIpcVersion = "1.1.0";
static constexpr std::string_view app_quit = "app.quit";
static constexpr std::string_view app_window_close = "app.window.close";
static constexpr std::string_view app_window_minimize = "app.window.minimize";
static constexpr std::string_view app_window_maximizeToggle = "app.window.maximizeToggle";
static constexpr std::string_view app_window_drag = "app.window.drag";
static constexpr std::string_view app_window_setState = "app.window.setState";
static constexpr std::string_view app_openMain = "app.openMain";
static constexpr std::string_view motion_homeAll = "motion.homeAll";
static constexpr std::string_view motion_home = "motion.home";
static constexpr std::string_view motion_getPosition = "motion.getPosition";
static constexpr std::string_view cmd_motion_setServo = "cmd.motion.setServo";
static constexpr std::string_view cmd_motion_resetAlarm = "cmd.motion.resetAlarm";
static constexpr std::string_view motion_jog_start = "motion.jog.start";
static constexpr std::string_view motion_jog_stop = "motion.jog.stop";
static constexpr std::string_view motion_setJogSpeed = "motion.setJogSpeed";
static constexpr std::string_view motion_stop = "motion.stop";
static constexpr std::string_view motion_moveRel = "motion.moveRel";
static constexpr std::string_view motion_moveAbs = "motion.moveAbs";
static constexpr std::string_view camera_start = "camera.start";
static constexpr std::string_view camera_stop = "camera.stop";
static constexpr std::string_view camera_setParams = "camera.setParams";
static constexpr std::string_view camera_getRange = "camera.getRange";
static constexpr std::string_view camera_getParams = "camera.getParams";
static constexpr std::string_view cmd_gcode_write = "cmd.gcode.write";
static constexpr std::string_view cmd_gcode_run = "cmd.gcode.run";
static constexpr std::string_view cmd_gcode_status = "cmd.gcode.status";
static constexpr std::string_view cmd_moons_preset = "cmd.moons.preset";
static constexpr std::string_view cmd_scanner_generate = "cmd.scanner.generate";
static constexpr std::string_view cmd_scanner_run = "cmd.scanner.run";
static constexpr std::string_view cmd_scanner_stop = "cmd.scanner.stop";
static constexpr std::string_view cmd_dialog_openImage = "cmd.dialog.openImage";
static constexpr std::string_view cmd_dialog_saveImage = "cmd.dialog.saveImage";
static constexpr std::string_view cmd_calibration_save = "cmd.calibration.save";
static constexpr std::string_view cmd_calibration_load = "cmd.calibration.load";
static constexpr std::string_view cmd_calibration_list = "cmd.calibration.list";
static constexpr std::string_view cmd_calibration_rollback = "cmd.calibration.rollback";
static constexpr std::string_view cmd_calibration_delete = "cmd.calibration.delete";
static constexpr std::string_view cmd_config_getCamera = "cmd.config.getCamera";
static constexpr std::string_view cmd_config_setCamera = "cmd.config.setCamera";
static constexpr std::string_view cmd_config_getMotion = "cmd.config.getMotion";
static constexpr std::string_view cmd_config_setMotion = "cmd.config.setMotion";
static constexpr std::string_view cmd_calib_getState = "cmd.calib.getState";
static constexpr std::string_view cmd_calib_setViewRatio = "cmd.calib.setViewRatio";
static constexpr std::string_view cmd_calib_pickCenter = "cmd.calib.pickCenter";
static constexpr std::string_view cmd_calib_apply = "cmd.calib.apply";
static constexpr std::string_view cmd_calib_save = "cmd.calib.save";
static constexpr std::string_view cmd_light_get_config = "cmd.light.get_config";
static constexpr std::string_view cmd_light_set_val = "cmd.light.set_val";
static constexpr std::string_view cmd_light_set_mode = "cmd.light.set_mode";
static constexpr std::string_view cmd_light_save = "cmd.light.save";
static constexpr std::string_view cmd_recipe_center_save = "cmd.recipe.center.save";
static constexpr std::string_view cmd_recipe_center_load = "cmd.recipe.center.load";
static constexpr std::string_view cmd_presetLibrary_save = "cmd.presetLibrary.save";
static constexpr std::string_view cmd_presetLibrary_load = "cmd.presetLibrary.load";
static constexpr std::string_view kAllChannels[] = { "app.quit", "app.window.close", "app.window.minimize", "app.window.maximizeToggle", "app.window.drag", "app.window.setState", "app.openMain", "motion.homeAll", "motion.home", "motion.getPosition", "cmd.motion.setServo", "cmd.motion.resetAlarm", "motion.jog.start", "motion.jog.stop", "motion.setJogSpeed", "motion.stop", "motion.moveRel", "motion.moveAbs", "camera.start", "camera.stop", "camera.setParams", "camera.getRange", "camera.getParams", "cmd.gcode.write", "cmd.gcode.run", "cmd.gcode.status", "cmd.moons.preset", "cmd.scanner.generate", "cmd.scanner.run", "cmd.scanner.stop", "cmd.dialog.openImage", "cmd.dialog.saveImage", "cmd.calibration.save", "cmd.calibration.load", "cmd.calibration.list", "cmd.calibration.rollback", "cmd.calibration.delete", "cmd.config.getCamera", "cmd.config.setCamera", "cmd.config.getMotion", "cmd.config.setMotion", "cmd.calib.getState", "cmd.calib.setViewRatio", "cmd.calib.pickCenter", "cmd.calib.apply", "cmd.calib.save", "cmd.light.get_config", "cmd.light.set_val", "cmd.light.set_mode", "cmd.light.save", "cmd.recipe.center.save", "cmd.recipe.center.load", "cmd.presetLibrary.save", "cmd.presetLibrary.load" };
} // namespace ipc
