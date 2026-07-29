#include "pch.h"
#include "MoonsConfigService.h"
#include "../../Core/MachineType.h"


void MoonsConfigService::Load() {
  // [CONNECT]
  m_connect.com = INI_MOONS.GetInt(_T("CONNECT"), _T("COM"), 7);
  m_connect.baudrate = INI_MOONS.GetInt(_T("CONNECT"), _T("BAUDRATE"), 9600);

  // [LENS] - x50 관련 좌표는 MC2에서도 사용됨
  m_lens.id = INI_MOONS.GetInt(_T("LENS"), _T("ID"), 1);
  m_lens.lead = INI_MOONS.GetDouble(_T("LENS"), _T("LEAD"), 2.0);
  m_lens.pluse = INI_MOONS.GetInt(_T("LENS"), _T("PLUSE"), 20000);

  m_lens.home.run_vel = INI_MOONS.GetDouble(_T("LENS"), _T("HOME_VEL"), 10.0);
  m_lens.home.run_acc = INI_MOONS.GetDouble(_T("LENS"), _T("HOME_ACC"), 100.0);
  m_lens.home.run_dec = INI_MOONS.GetDouble(_T("LENS"), _T("HOME_DEC"), 100.0);

  m_lens.move.run_vel = INI_MOONS.GetDouble(_T("LENS"), _T("MOVE_VEL"), 10.0);
  m_lens.move.run_acc = INI_MOONS.GetDouble(_T("LENS"), _T("MOVE_ACC"), 100.0);
  m_lens.move.run_dec = INI_MOONS.GetDouble(_T("LENS"), _T("MOVE_DEC"), 100.0);

  m_lens.jog.run_vel = INI_MOONS.GetDouble(_T("LENS"), _T("JOG_VEL"), 10.0);
  m_lens.jog.run_acc = INI_MOONS.GetDouble(_T("LENS"), _T("JOG_ACC"), 100.0);
  m_lens.jog.run_dec = INI_MOONS.GetDouble(_T("LENS"), _T("JOG_DEC"), 100.0);

  m_lens.x20 = INI_MOONS.GetDouble(_T("LENS"), _T("x20"), 0.0);
  m_lens.x20_z_pos = INI_MOONS.GetDouble(_T("LENS"), _T("x20_Z_POS"), 0.0);
  m_lens.x20_safe_z = INI_MOONS.GetDouble(_T("LENS"), _T("x20_SAFE_Z"), 0.0);
  m_lens.stage_x20_offset = INI_MOONS.GetDouble(_T("LENS"), _T("StageX20_Offset"), 0.0);
  m_lens.stage_y20_offset = INI_MOONS.GetDouble(_T("LENS"), _T("StageY20_Offset"), 0.0);

  m_lens.x50 = INI_MOONS.GetDouble(_T("LENS"), _T("x50"), 0.0);
  m_lens.x50_z_pos = INI_MOONS.GetDouble(_T("LENS"), _T("x50_Z_POS"), 0.0);
  m_lens.x50_safe_z = INI_MOONS.GetDouble(_T("LENS"), _T("x50_SAFE_Z"), 0.0);
  m_lens.stage_x50_offset = INI_MOONS.GetDouble(_T("LENS"), _T("StageX50_Offset"), 0.0);
  m_lens.stage_y50_offset = INI_MOONS.GetDouble(_T("LENS"), _T("StageY50_Offset"), 0.0);

  // [MIRROR]
  m_mirror.id = INI_MOONS.GetInt(_T("MIRROR"), _T("ID"), 2);
  m_mirror.lead = INI_MOONS.GetDouble(_T("MIRROR"), _T("LEAD"), 2.0);
  m_mirror.pluse = INI_MOONS.GetInt(_T("MIRROR"), _T("PLUSE"), 20000);

  m_mirror.home.run_vel =
      INI_MOONS.GetDouble(_T("MIRROR"), _T("HOME_VEL"), 10.0);
  m_mirror.home.run_acc =
      INI_MOONS.GetDouble(_T("MIRROR"), _T("HOME_ACC"), 100.0);
  m_mirror.home.run_dec =
      INI_MOONS.GetDouble(_T("MIRROR"), _T("HOME_DEC"), 100.0);

  m_mirror.move.run_vel =
      INI_MOONS.GetDouble(_T("MIRROR"), _T("MOVE_VEL"), 10.0);
  m_mirror.move.run_acc =
      INI_MOONS.GetDouble(_T("MIRROR"), _T("MOVE_ACC"), 100.0);
  m_mirror.move.run_dec =
      INI_MOONS.GetDouble(_T("MIRROR"), _T("MOVE_DEC"), 100.0);

  m_mirror.jog.run_vel = INI_MOONS.GetDouble(_T("MIRROR"), _T("JOG_VEL"), 10.0);
  m_mirror.jog.run_acc =
      INI_MOONS.GetDouble(_T("MIRROR"), _T("JOG_ACC"), 100.0);
  m_mirror.jog.run_dec =
      INI_MOONS.GetDouble(_T("MIRROR"), _T("JOG_DEC"), 100.0);

  m_mirror.scanner_pos =
      INI_MOONS.GetDouble(_T("MIRROR"), _T("SCANNER_POS"), 0.0);
  m_mirror.scanner_z_pos =
      INI_MOONS.GetDouble(_T("MIRROR"), _T("SCANNER_Z_POS"), 0.0);
  m_mirror.scanner_safe_z =
      INI_MOONS.GetDouble(_T("MIRROR"), _T("SCANNER_SAFE_Z"), 0.0);
  m_mirror.objective_pos =
      INI_MOONS.GetDouble(_T("MIRROR"), _T("OBJECTIVE_POS"), 0.0);

  m_mirror.stage_x_offset =
      INI_MOONS.GetDouble(_T("MIRROR"), _T("StageX_Offset"), 0.0);
  m_mirror.stage_y_offset =
      INI_MOONS.GetDouble(_T("MIRROR"), _T("StageY_Offset"), 0.0);
}

void MoonsConfigService::Save() {
  // [CONNECT]
  INI_MOONS.WriteNumber(_T("CONNECT"), _T("COM"), m_connect.com);
  INI_MOONS.WriteNumber(_T("CONNECT"), _T("BAUDRATE"), m_connect.baudrate);

  // [LENS] - x50 관련 좌표는 MC2에서도 사용됨
  INI_MOONS.WriteNumber(_T("LENS"), _T("ID"), m_lens.id);
  INI_MOONS.WriteNumber(_T("LENS"), _T("LEAD"), m_lens.lead);
  INI_MOONS.WriteNumber(_T("LENS"), _T("PLUSE"), m_lens.pluse);

  INI_MOONS.WriteNumber(_T("LENS"), _T("HOME_VEL"), m_lens.home.run_vel);
  INI_MOONS.WriteNumber(_T("LENS"), _T("HOME_ACC"), m_lens.home.run_acc);
  INI_MOONS.WriteNumber(_T("LENS"), _T("HOME_DEC"), m_lens.home.run_dec);

  INI_MOONS.WriteNumber(_T("LENS"), _T("MOVE_VEL"), m_lens.move.run_vel);
  INI_MOONS.WriteNumber(_T("LENS"), _T("MOVE_ACC"), m_lens.move.run_acc);
  INI_MOONS.WriteNumber(_T("LENS"), _T("MOVE_DEC"), m_lens.move.run_dec);

  INI_MOONS.WriteNumber(_T("LENS"), _T("JOG_VEL"), m_lens.jog.run_vel);
  INI_MOONS.WriteNumber(_T("LENS"), _T("JOG_ACC"), m_lens.jog.run_acc);
  INI_MOONS.WriteNumber(_T("LENS"), _T("JOG_DEC"), m_lens.jog.run_dec);

  INI_MOONS.WriteNumber(_T("LENS"), _T("x20"), m_lens.x20);
  INI_MOONS.WriteNumber(_T("LENS"), _T("x20_Z_POS"), m_lens.x20_z_pos);
  INI_MOONS.WriteNumber(_T("LENS"), _T("x20_SAFE_Z"), m_lens.x20_safe_z);
  INI_MOONS.WriteNumber(_T("LENS"), _T("StageX20_Offset"), m_lens.stage_x20_offset);
  INI_MOONS.WriteNumber(_T("LENS"), _T("StageY20_Offset"), m_lens.stage_y20_offset);

  INI_MOONS.WriteNumber(_T("LENS"), _T("x50"), m_lens.x50);
  INI_MOONS.WriteNumber(_T("LENS"), _T("x50_Z_POS"), m_lens.x50_z_pos);
  INI_MOONS.WriteNumber(_T("LENS"), _T("x50_SAFE_Z"), m_lens.x50_safe_z);
  INI_MOONS.WriteNumber(_T("LENS"), _T("StageX50_Offset"), m_lens.stage_x50_offset);
  INI_MOONS.WriteNumber(_T("LENS"), _T("StageY50_Offset"), m_lens.stage_y50_offset);

  // [MIRROR]
  INI_MOONS.WriteNumber(_T("MIRROR"), _T("ID"), m_mirror.id);
  INI_MOONS.WriteNumber(_T("MIRROR"), _T("LEAD"), m_mirror.lead);
  INI_MOONS.WriteNumber(_T("MIRROR"), _T("PLUSE"), m_mirror.pluse);

  INI_MOONS.WriteNumber(_T("MIRROR"), _T("HOME_VEL"), m_mirror.home.run_vel);
  INI_MOONS.WriteNumber(_T("MIRROR"), _T("HOME_ACC"), m_mirror.home.run_acc);
  INI_MOONS.WriteNumber(_T("MIRROR"), _T("HOME_DEC"), m_mirror.home.run_dec);

  INI_MOONS.WriteNumber(_T("MIRROR"), _T("MOVE_VEL"), m_mirror.move.run_vel);
  INI_MOONS.WriteNumber(_T("MIRROR"), _T("MOVE_ACC"), m_mirror.move.run_acc);
  INI_MOONS.WriteNumber(_T("MIRROR"), _T("MOVE_DEC"), m_mirror.move.run_dec);

  INI_MOONS.WriteNumber(_T("MIRROR"), _T("JOG_VEL"), m_mirror.jog.run_vel);
  INI_MOONS.WriteNumber(_T("MIRROR"), _T("JOG_ACC"), m_mirror.jog.run_acc);
  INI_MOONS.WriteNumber(_T("MIRROR"), _T("JOG_DEC"), m_mirror.jog.run_dec);

  INI_MOONS.WriteNumber(_T("MIRROR"), _T("SCANNER_POS"), m_mirror.scanner_pos);
  INI_MOONS.WriteNumber(_T("MIRROR"), _T("SCANNER_Z_POS"),
                        m_mirror.scanner_z_pos);
  INI_MOONS.WriteNumber(_T("MIRROR"), _T("SCANNER_SAFE_Z"),
                        m_mirror.scanner_safe_z);
  INI_MOONS.WriteNumber(_T("MIRROR"), _T("OBJECTIVE_POS"),
                        m_mirror.objective_pos);

  INI_MOONS.WriteNumber(_T("MIRROR"), _T("StageX_Offset"),
                        m_mirror.stage_x_offset);
  INI_MOONS.WriteNumber(_T("MIRROR"), _T("StageY_Offset"),
                        m_mirror.stage_y_offset);
}
