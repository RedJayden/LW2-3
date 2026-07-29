#include "pch.h"
#include "Rtc6Driver.h"
#include <iostream>
#include "../../../Shared/Util/LogManager.h"

#undef OutputDebugStringA
#define OutputDebugStringA(msg) \
    do { \
        ::OutputDebugStringA(msg); \
        LogManager::Instance().Write("info", "Scanner", msg); \
    } while(0)

Rtc6Driver::Rtc6Driver() {}

Rtc6Driver::~Rtc6Driver() {
	FreeDll();
}

bool Rtc6Driver::InitDll(const std::wstring& dllPath) {
	if (m_hDll) {
		return true;
	}

	m_hDll = LoadLibrary(dllPath.c_str());
	if (!m_hDll) {
		OutputDebugStringW((L"[Rtc6Driver] Failed to load DLL from " + dllPath + L"\n").c_str());
		return false;
	}

	// Dynamic binding
	rtc6_count_cards = (pfn_rtc6_count_cards)GetProcAddress(m_hDll, "rtc6_count_cards");
	init_rtc6_dll = (pfn_init_rtc6_dll)GetProcAddress(m_hDll, "init_rtc6_dll");
	free_rtc6_dll = (pfn_free_rtc6_dll)GetProcAddress(m_hDll, "free_rtc6_dll");
	select_rtc = (pfn_select_rtc)GetProcAddress(m_hDll, "select_rtc");
	acquire_rtc = (pfn_acquire_rtc)GetProcAddress(m_hDll, "acquire_rtc");
	release_rtc = (pfn_release_rtc)GetProcAddress(m_hDll, "release_rtc");
	load_program_file = (pfn_load_program_file)GetProcAddress(m_hDll, "load_program_file");
	load_correction_file = (pfn_load_correction_file)GetProcAddress(m_hDll, "load_correction_file");
	select_cor_table = (pfn_select_cor_table)GetProcAddress(m_hDll, "select_cor_table");
	set_laser_mode = (pfn_set_laser_mode)GetProcAddress(m_hDll, "set_laser_mode");
	set_laser_control = (pfn_set_laser_control)GetProcAddress(m_hDll, "set_laser_control");
	enable_laser = (pfn_enable_laser)GetProcAddress(m_hDll, "enable_laser");
	disable_laser = (pfn_disable_laser)GetProcAddress(m_hDll, "disable_laser");
	config_list = (pfn_config_list)GetProcAddress(m_hDll, "config_list");
	set_standby = (pfn_set_standby)GetProcAddress(m_hDll, "set_standby");
	set_laser_pulses_ctrl = (pfn_set_laser_pulses_ctrl)GetProcAddress(m_hDll, "set_laser_pulses_ctrl");
	set_laser_delays = (pfn_set_laser_delays)GetProcAddress(m_hDll, "set_laser_delays");
	set_scanner_delays = (pfn_set_scanner_delays)GetProcAddress(m_hDll, "set_scanner_delays");
	get_head_para = (pfn_get_head_para)GetProcAddress(m_hDll, "get_head_para");
	reset_error = (pfn_reset_error)GetProcAddress(m_hDll, "reset_error");
	get_head_status = (pfn_get_head_status)GetProcAddress(m_hDll, "get_head_status");
	get_init_status = (pfn_get_init_status)GetProcAddress(m_hDll, "get_init_status");
	set_delay_mode = (pfn_set_delay_mode)GetProcAddress(m_hDll, "set_delay_mode");
	set_jump_speed_ctrl = (pfn_set_jump_speed_ctrl)GetProcAddress(m_hDll, "set_jump_speed_ctrl");
	set_mark_speed_ctrl = (pfn_set_mark_speed_ctrl)GetProcAddress(m_hDll, "set_mark_speed_ctrl");
	set_start_list = (pfn_set_start_list)GetProcAddress(m_hDll, "set_start_list");
	set_end_of_list = (pfn_set_end_of_list)GetProcAddress(m_hDll, "set_end_of_list");
	execute_list = (pfn_execute_list)GetProcAddress(m_hDll, "execute_list");
	get_status = (pfn_get_status)GetProcAddress(m_hDll, "get_status");
	read_status = (pfn_read_status)GetProcAddress(m_hDll, "read_status");
	stop_execution = (pfn_stop_execution)GetProcAddress(m_hDll, "stop_execution");
	goto_xy = (pfn_goto_xy)GetProcAddress(m_hDll, "goto_xy");

	jump_abs = (pfn_jump_abs)GetProcAddress(m_hDll, "jump_abs");
	mark_abs = (pfn_mark_abs)GetProcAddress(m_hDll, "mark_abs");
	arc_abs = (pfn_arc_abs)GetProcAddress(m_hDll, "arc_abs");
	long_delay = (pfn_long_delay)GetProcAddress(m_hDll, "long_delay");
	laser_on_list = (pfn_laser_on_list)GetProcAddress(m_hDll, "laser_on_list");
	laser_signal_off_list = (pfn_laser_signal_off_list)GetProcAddress(m_hDll, "laser_signal_off_list");

	n_get_last_error = (pfn_n_get_last_error)GetProcAddress(m_hDll, "n_get_last_error");
	n_reset_error = (pfn_n_reset_error)GetProcAddress(m_hDll, "n_reset_error");
	n_get_serial_number = (pfn_n_get_serial_number)GetProcAddress(m_hDll, "n_get_serial_number");
	get_dll_version = (pfn_get_dll_version)GetProcAddress(m_hDll, "get_dll_version");
	n_get_hex_version = (pfn_n_get_hex_version)GetProcAddress(m_hDll, "n_get_hex_version");
	n_get_rtc_version = (pfn_n_get_rtc_version)GetProcAddress(m_hDll, "n_get_rtc_version");

	// Safety check
	if (!rtc6_count_cards || !init_rtc6_dll || !free_rtc6_dll || !select_rtc || !acquire_rtc || !release_rtc ||
		!load_program_file || !load_correction_file || !select_cor_table || !set_laser_mode ||
		!set_laser_control || !enable_laser || !disable_laser || 
		!config_list || !set_standby || !set_laser_pulses_ctrl || !set_laser_delays || !set_scanner_delays || !get_head_para ||
		!reset_error || !get_head_status || !get_init_status ||
		!set_delay_mode || !set_jump_speed_ctrl || !set_mark_speed_ctrl ||
		!set_start_list || !set_end_of_list || !execute_list || !get_status || !read_status ||
		!stop_execution || !goto_xy || !jump_abs || !mark_abs || !arc_abs || !long_delay || !laser_on_list ||
		!laser_signal_off_list || !n_get_last_error || !n_reset_error || !n_get_serial_number ||
		!get_dll_version || !n_get_hex_version || !n_get_rtc_version) {
		OutputDebugStringA("[Rtc6Driver] Some RTC6 API function addresses could not be found.\n");
		FreeDll();
		return false;
	}

	// Initialize DLL itself
	UINT init_err = init_rtc6_dll();
	if (init_err != 0) {
		OutputDebugStringA(("[Rtc6Driver] init_rtc6_dll returned error code: " + std::to_string(init_err) + "\n").c_str());
		
		// [NEW] Early error recovery loop for RTC6 cards
		if (rtc6_count_cards) {
			UINT totalCards = rtc6_count_cards();
			if (totalCards > 0) {
				OutputDebugStringA(("[Rtc6Driver] Checking and resetting early errors for " + std::to_string(totalCards) + " cards...\n").c_str());
				for (UINT i = 1; i <= totalCards; ++i) {
					if (n_get_last_error && n_reset_error) {
						UINT card_err = n_get_last_error(i);
						if (card_err != 0) {
							UINT serial = n_get_serial_number ? n_get_serial_number(i) : 0;
							OutputDebugStringA(("[Rtc6Driver] Card " + std::to_string(i) + " (S/N: " + std::to_string(serial) + ") has early error: " + std::to_string(card_err) + ". Resetting...\n").c_str());
							n_reset_error(i, card_err);
						}
					}
				}
			}
		}
	}

	OutputDebugStringA("[Rtc6Driver] RTC6DLL.dll loaded and bound successfully.\n");
	return true;
}

bool Rtc6Driver::FreeDll() {
	CloseCard();
	if (m_hDll) {
		if (free_rtc6_dll) {
			free_rtc6_dll();
		}
		FreeLibrary(m_hDll);
		m_hDll = nullptr;
		OutputDebugStringA("[Rtc6Driver] RTC6DLL.dll freed.\n");
	}
	return true;
}

bool Rtc6Driver::OpenCard(unsigned int cardNo) {
	if (!m_hDll) return false;

	m_cardNo = cardNo;
	m_isSimulation = false;

	UINT totalCards = 0;
	if (rtc6_count_cards) {
		totalCards = rtc6_count_cards();
	}
	OutputDebugStringA(("[Rtc6Driver] Total RTC6 cards detected: " + std::to_string(totalCards) + "\n").c_str());

	if (totalCards == 0) {
		OutputDebugStringA("[Rtc6Driver] No physical RTC6 cards found. Falling back to Simulation Mode (Demo Mode).\n");
		m_isSimulation = true;
		m_isCardOpen = true;
		return true;
	}

	UINT err = acquire_rtc(m_cardNo);
	if (err != 0) {
		OutputDebugStringA(("[Rtc6Driver] Failed to acquire specified card " + std::to_string(m_cardNo) + ". Error: " + std::to_string(err) + ". Scanning other cards...\n").c_str());
		
		bool acquired = false;
		for (UINT i = 1; i <= totalCards; ++i) {
			if (i == m_cardNo) continue;
			err = acquire_rtc(i);
			if (err == 0) {
				m_cardNo = i;
				acquired = true;
				OutputDebugStringA(("[Rtc6Driver] Successfully auto-acquired alternative card " + std::to_string(m_cardNo) + ".\n").c_str());
				break;
			}
		}

		if (!acquired) {
			// [NEW] Fallback: Even if acquire_rtc fails, check if select_rtc succeeds.
			// select_rtc returns 0 on error, or non-zero (valid card index) on success.
			if (select_rtc) {
				UINT sel_res = select_rtc(m_cardNo);
				if (sel_res != 0) {
					OutputDebugStringA(("[Rtc6Driver] acquire_rtc failed but select_rtc(" + std::to_string(m_cardNo) + ") succeeded. Proceeding with physical card!\n").c_str());
					m_isCardOpen = true;
					m_isSimulation = false;
					return true;
				}
			}
			OutputDebugStringA("[Rtc6Driver] Failed to acquire any physical RTC6 card. Falling back to Simulation Mode (Demo Mode).\n");
			m_isSimulation = true;
			m_isCardOpen = true;
			return true;
		}
	}

	select_rtc(m_cardNo);
	m_isCardOpen = true;
	m_isSimulation = false;
	OutputDebugStringA(("[Rtc6Driver] Card " + std::to_string(m_cardNo) + " opened successfully.\n").c_str());
	return true;
}

void Rtc6Driver::CloseCard() {
	if (m_isCardOpen && m_hDll && release_rtc) {
		if (!m_isSimulation) {
			release_rtc(m_cardNo);
		}
		m_isCardOpen = false;
		m_isSimulation = false;
		OutputDebugStringA(("[Rtc6Driver] Card " + std::to_string(m_cardNo) + " closed.\n").c_str());
	}
}

bool Rtc6Driver::IsCardOpen() const {
	return m_isCardOpen;
}

bool Rtc6Driver::LoadProgramFile(const std::string& path) {
	if (!m_isCardOpen) return false;
	if (m_isSimulation) {
		OutputDebugStringA(("[Rtc6Driver] [Sim] LoadProgramFile: " + path + "\n").c_str());
		return true;
	}
	const char* pPath = path.empty() ? nullptr : path.c_str();
	UINT err = load_program_file(pPath);
	if (err != 0) {
		OutputDebugStringA(("[Rtc6Driver] Failed to load program file " + path + ". Error: " + std::to_string(err) + "\n").c_str());
		return false;
	}
	return true;
}

bool Rtc6Driver::LoadCorrectionFile(const std::string& path, unsigned int tableNo, unsigned int dimension) {
	if (!m_isCardOpen) return false;
	if (m_isSimulation) {
		OutputDebugStringA(("[Rtc6Driver] [Sim] LoadCorrectionFile: " + path + "\n").c_str());
		return true;
	}
	const char* pPath = path.empty() ? nullptr : path.c_str();
	UINT err = load_correction_file(pPath, tableNo, dimension);
	if (err != 0) {
		OutputDebugStringA(("[Rtc6Driver] Failed to load correction file " + path + ". Error: " + std::to_string(err) + "\n").c_str());
		return false;
	}
	return true;
}

void Rtc6Driver::SelectCorTable(unsigned int headA, unsigned int headB) {
	if (m_isCardOpen && !m_isSimulation) select_cor_table(headA, headB);
}

void Rtc6Driver::SetLaserMode(unsigned int mode) {
	if (m_isCardOpen && !m_isSimulation) set_laser_mode(mode);
}

void Rtc6Driver::SetLaserControl(unsigned int control) {
	if (m_isCardOpen && !m_isSimulation) set_laser_control(control);
}

void Rtc6Driver::SetDelayMode(unsigned int varPoly, unsigned int directMove3D, unsigned int edgeLevel, unsigned int minJumpDelay, unsigned int jumpLengthLimit) {
	if (m_isCardOpen && !m_isSimulation) set_delay_mode(varPoly, directMove3D, edgeLevel, minJumpDelay, jumpLengthLimit);
}

void Rtc6Driver::SetSpeed(double markSpeed, double jumpSpeed) {
	if (m_isCardOpen && !m_isSimulation) {
		set_mark_speed_ctrl(markSpeed);
		set_jump_speed_ctrl(jumpSpeed);
	}
}

void Rtc6Driver::SetStartList(unsigned int listNo) {
	if (m_isCardOpen && !m_isSimulation) set_start_list(listNo);
}

void Rtc6Driver::SetEndOfList() {
	if (m_isCardOpen && !m_isSimulation) set_end_of_list();
}

void Rtc6Driver::ExecuteList(unsigned int listNo) {
	if (m_isCardOpen && !m_isSimulation) execute_list(listNo);
}

void Rtc6Driver::GetStatus(unsigned int& status, unsigned int& pos) {
	if (m_isCardOpen) {
		if (m_isSimulation) {
			status = 0; // 0 represents idle/marking finished
			pos = 0;
			return;
		}
		get_status(status, pos);
	}
}

unsigned int Rtc6Driver::ReadStatus() {
	if (m_isCardOpen) {
		if (m_isSimulation) return 0;
		return read_status();
	}
	return 0;
}

void Rtc6Driver::StopExecution() {
	if (m_isCardOpen && !m_isSimulation) stop_execution();
}

void Rtc6Driver::JumpAbs(long x, long y) {
	if (m_isCardOpen && !m_isSimulation) jump_abs(x, y);
}

void Rtc6Driver::GotoXY(long x, long y) {
	if (m_isCardOpen && !m_isSimulation && goto_xy) goto_xy(x, y);
}

void Rtc6Driver::MarkAbs(long x, long y) {
	if (m_isCardOpen && !m_isSimulation) mark_abs(x, y);
}

void Rtc6Driver::ArcAbs(long xc, long yc, double angle) {
	if (m_isCardOpen && !m_isSimulation) arc_abs(xc, yc, angle);
}

void Rtc6Driver::LongDelay(long delay) {
	if (m_isCardOpen && !m_isSimulation) long_delay(delay);
}

void Rtc6Driver::LaserOnList(long delay) {
	if (m_isCardOpen && !m_isSimulation) laser_on_list(delay);
}

void Rtc6Driver::LaserOffList() {
	if (m_isCardOpen && !m_isSimulation) laser_signal_off_list();
}

void Rtc6Driver::EnableLaser() {
	if (m_isCardOpen && !m_isSimulation && enable_laser) enable_laser();
}

void Rtc6Driver::DisableLaser() {
	if (m_isCardOpen && !m_isSimulation && disable_laser) disable_laser();
}

void Rtc6Driver::ConfigList(unsigned int mem1, unsigned int mem2) {
	if (m_isCardOpen && !m_isSimulation && config_list) config_list(mem1, mem2);
}

void Rtc6Driver::SetStandby(unsigned int halfPeriod, unsigned int pulseLength) {
	if (m_isCardOpen && !m_isSimulation && set_standby) set_standby(halfPeriod, pulseLength);
}

void Rtc6Driver::SetLaserPulsesCtrl(unsigned int halfPeriod, unsigned int pulseLength) {
	if (m_isCardOpen && !m_isSimulation && set_laser_pulses_ctrl) set_laser_pulses_ctrl(halfPeriod, pulseLength);
}

void Rtc6Driver::SetLaserDelays(long onDelay, unsigned int offDelay) {
	if (m_isCardOpen && !m_isSimulation && set_laser_delays) set_laser_delays(onDelay, offDelay);
}

void Rtc6Driver::SetScannerDelays(unsigned int jump, unsigned int mark, unsigned int polygon) {
	if (m_isCardOpen && !m_isSimulation && set_scanner_delays) set_scanner_delays(jump, mark, polygon);
}

double Rtc6Driver::GetHeadPara(unsigned int headNo, unsigned int paraNo) {
	if (m_isCardOpen && !m_isSimulation && get_head_para) return get_head_para(headNo, paraNo);
	return 0.0;
}

void Rtc6Driver::ResetError(unsigned int code) {
	if (m_isCardOpen && !m_isSimulation && reset_error) reset_error(code);
}

unsigned int Rtc6Driver::GetHeadStatus(unsigned int headNo) {
	if (m_isCardOpen && !m_isSimulation && get_head_status) return get_head_status(headNo);
	return 0;
}

unsigned int Rtc6Driver::GetInitStatus() {
	if (m_isCardOpen && !m_isSimulation && get_init_status) return get_init_status();
	return 0;
}

unsigned int Rtc6Driver::GetDllVersion() {
	if (m_hDll && get_dll_version) return get_dll_version();
	return 0;
}

unsigned int Rtc6Driver::GetHexVersion() {
	if (m_isCardOpen && !m_isSimulation && m_hDll && n_get_hex_version) return n_get_hex_version(m_cardNo);
	return 0;
}

unsigned int Rtc6Driver::GetRtcVersionNumber() {
	if (m_isCardOpen && !m_isSimulation && m_hDll && n_get_rtc_version) return n_get_rtc_version(m_cardNo);
	return 0;
}

unsigned int Rtc6Driver::GetSerialNumber() {
	if (m_isCardOpen && !m_isSimulation && m_hDll && n_get_serial_number) return n_get_serial_number(m_cardNo);
	return 0;
}
