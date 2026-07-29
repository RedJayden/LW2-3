#pragma once

#include "IRtcDriver.h"
#include <windows.h>

// Function pointer typedefs matching RTC6 API
typedef UINT(__stdcall* pfn_init_rtc6_dll)(void);
typedef void (__stdcall* pfn_free_rtc6_dll)(void);
typedef UINT(__stdcall* pfn_select_rtc)(const UINT CardNo);
typedef UINT(__stdcall* pfn_acquire_rtc)(const UINT CardNo);
typedef UINT(__stdcall* pfn_release_rtc)(const UINT CardNo);
typedef UINT(__stdcall* pfn_load_program_file)(const char* Path);
typedef UINT(__stdcall* pfn_load_correction_file)(const char* Name, const UINT No, const UINT Dim);
typedef void (__stdcall* pfn_select_cor_table)(const UINT HeadA, const UINT HeadB);
typedef void (__stdcall* pfn_set_laser_mode)(const UINT Mode);
typedef void (__stdcall* pfn_set_laser_control)(const UINT Ctrl);
typedef void (__stdcall* pfn_set_delay_mode)(const UINT VarPoly, const UINT DirectMove3D, const UINT EdgeLevel, const UINT MinJumpDelay, const UINT JumpLengthLimit);
typedef void (__stdcall* pfn_set_jump_speed_ctrl)(const double Speed);
typedef void (__stdcall* pfn_set_mark_speed_ctrl)(const double Speed);
typedef void (__stdcall* pfn_set_start_list)(const UINT ListNo);
typedef void (__stdcall* pfn_set_end_of_list)(void);
typedef void (__stdcall* pfn_execute_list)(const UINT ListNo);
typedef void (__stdcall* pfn_get_status)(UINT& Status, UINT& Pos);
typedef UINT(__stdcall* pfn_read_status)(void);
typedef void (__stdcall* pfn_stop_execution)(void);
typedef void (__stdcall* pfn_enable_laser)(void);
typedef void (__stdcall* pfn_disable_laser)(void);
typedef void (__stdcall* pfn_config_list)(const UINT Mem1, const UINT Mem2);
typedef void (__stdcall* pfn_set_standby)(const UINT HalfPeriod, const UINT PulseLength);
typedef void (__stdcall* pfn_set_laser_pulses_ctrl)(const UINT HalfPeriod, const UINT PulseLength);
typedef void (__stdcall* pfn_set_laser_delays)(const LONG OnDelay, const UINT OffDelay);
typedef void (__stdcall* pfn_set_scanner_delays)(const UINT Jump, const UINT Mark, const UINT Polygon);
typedef double (__stdcall* pfn_get_head_para)(const UINT HeadNo, const UINT ParaNo);
typedef void (__stdcall* pfn_reset_error)(const UINT Code);
typedef UINT (__stdcall* pfn_get_head_status)(const UINT HeadNo);
typedef UINT (__stdcall* pfn_get_init_status)(void);
typedef UINT (__stdcall* pfn_n_get_last_error)(const UINT CardNo);
typedef void (__stdcall* pfn_n_reset_error)(const UINT CardNo, const UINT Code);
typedef UINT (__stdcall* pfn_n_get_serial_number)(const UINT CardNo);
typedef UINT (__stdcall* pfn_get_dll_version)(void);
typedef UINT (__stdcall* pfn_n_get_hex_version)(const UINT CardNo);
typedef UINT (__stdcall* pfn_n_get_rtc_version)(const UINT CardNo);

typedef void (__stdcall* pfn_jump_abs)(const LONG X, const LONG Y);
typedef void (__stdcall* pfn_mark_abs)(const LONG X, const LONG Y);
typedef void (__stdcall* pfn_arc_abs)(const LONG X, const LONG Y, const double Angle);
typedef void (__stdcall* pfn_long_delay)(const LONG Delay);
typedef void (__stdcall* pfn_laser_on_list)(const LONG Delay);
typedef void (__stdcall* pfn_laser_signal_off_list)(void);
typedef UINT(__stdcall* pfn_rtc6_count_cards)(void);
typedef void (__stdcall* pfn_goto_xy)(const LONG X, const LONG Y);

/**
 * @class Rtc6Driver
 * @brief Concrete RTC6 driver utilizing dynamic DLL binding.
 */
class Rtc6Driver : public IRtcDriver {
public:
	Rtc6Driver();
	~Rtc6Driver() override;

	bool InitDll(const std::wstring& dllPath) override;
	bool FreeDll() override;

	bool OpenCard(unsigned int cardNo) override;
	void CloseCard() override;
	bool IsCardOpen() const override;

	bool LoadProgramFile(const std::string& path) override;
	bool LoadCorrectionFile(const std::string& path, unsigned int tableNo, unsigned int dimension) override;
	void SelectCorTable(unsigned int headA, unsigned int headB) override;

	void SetLaserMode(unsigned int mode) override;
	void SetLaserControl(unsigned int control) override;
	void EnableLaser() override;
	void DisableLaser() override;
	double GetHeadPara(unsigned int headNo, unsigned int paraNo) override;
	void ResetError(unsigned int code) override;
	unsigned int GetHeadStatus(unsigned int headNo) override;
	unsigned int GetInitStatus() override;
	void ConfigList(unsigned int mem1, unsigned int mem2) override;
	void SetStandby(unsigned int halfPeriod, unsigned int pulseLength) override;
	void SetLaserPulsesCtrl(unsigned int halfPeriod, unsigned int pulseLength) override;
	void SetLaserDelays(long onDelay, unsigned int offDelay) override;
	void SetScannerDelays(unsigned int jump, unsigned int mark, unsigned int polygon) override;
	void SetDelayMode(unsigned int varPoly, unsigned int directMove3D, unsigned int edgeLevel, unsigned int minJumpDelay, unsigned int jumpLengthLimit) override;
	void SetSpeed(double markSpeed, double jumpSpeed) override;

	void SetStartList(unsigned int listNo) override;
	void SetEndOfList() override;
	void ExecuteList(unsigned int listNo) override;
	void GetStatus(unsigned int& status, unsigned int& pos) override;
	unsigned int ReadStatus() override;
	void StopExecution() override;

	void JumpAbs(long x, long y) override;
	void MarkAbs(long x, long y) override;
	void ArcAbs(long xc, long yc, double angle) override;
	void LongDelay(long delay) override;
	void LaserOnList(long delay) override;
	void LaserOffList() override;
	void GotoXY(long x, long y) override;

	// Hardware Diagnostics
	unsigned int GetDllVersion() override;
	unsigned int GetHexVersion() override;
	unsigned int GetRtcVersionNumber() override;
	unsigned int GetSerialNumber() override;

private:
	HINSTANCE m_hDll = nullptr;
	unsigned int m_cardNo = 0;
	bool m_isCardOpen = false;

	// Bounded function pointers
	pfn_init_rtc6_dll init_rtc6_dll = nullptr;
	pfn_free_rtc6_dll free_rtc6_dll = nullptr;
	pfn_select_rtc select_rtc = nullptr;
	pfn_acquire_rtc acquire_rtc = nullptr;
	pfn_release_rtc release_rtc = nullptr;
	pfn_load_program_file load_program_file = nullptr;
	pfn_load_correction_file load_correction_file = nullptr;
	pfn_select_cor_table select_cor_table = nullptr;
	pfn_set_laser_mode set_laser_mode = nullptr;
	pfn_set_laser_control set_laser_control = nullptr;
	pfn_enable_laser enable_laser = nullptr;
	pfn_disable_laser disable_laser = nullptr;
	pfn_get_head_para get_head_para = nullptr;
	pfn_reset_error reset_error = nullptr;
	pfn_get_head_status get_head_status = nullptr;
	pfn_get_init_status get_init_status = nullptr;
	pfn_n_get_last_error n_get_last_error = nullptr;
	pfn_n_reset_error n_reset_error = nullptr;
	pfn_n_get_serial_number n_get_serial_number = nullptr;
	pfn_get_dll_version get_dll_version = nullptr;
	pfn_n_get_hex_version n_get_hex_version = nullptr;
	pfn_n_get_rtc_version n_get_rtc_version = nullptr;
	pfn_config_list config_list = nullptr;
	pfn_set_standby set_standby = nullptr;
	pfn_set_laser_pulses_ctrl set_laser_pulses_ctrl = nullptr;
	pfn_set_laser_delays set_laser_delays = nullptr;
	pfn_set_scanner_delays set_scanner_delays = nullptr;
	pfn_set_delay_mode set_delay_mode = nullptr;
	pfn_set_jump_speed_ctrl set_jump_speed_ctrl = nullptr;
	pfn_set_mark_speed_ctrl set_mark_speed_ctrl = nullptr;
	pfn_set_start_list set_start_list = nullptr;
	pfn_set_end_of_list set_end_of_list = nullptr;
	pfn_execute_list execute_list = nullptr;
	pfn_get_status get_status = nullptr;
	pfn_read_status read_status = nullptr;
	pfn_stop_execution stop_execution = nullptr;

	pfn_jump_abs jump_abs = nullptr;
	pfn_goto_xy goto_xy = nullptr;
	pfn_mark_abs mark_abs = nullptr;
	pfn_arc_abs arc_abs = nullptr;
	pfn_long_delay long_delay = nullptr;
	pfn_laser_on_list laser_on_list = nullptr;
	pfn_laser_signal_off_list laser_signal_off_list = nullptr;

	pfn_rtc6_count_cards rtc6_count_cards = nullptr;
	bool m_isSimulation = false;
};
