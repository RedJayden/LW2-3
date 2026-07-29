#include "pch.h"
#include "ScanlabController.h"
#include "../Driver/RtcDriverFactory.h"
#include "../../../Shared/Util/LogManager.h"

#undef OutputDebugStringA
#define OutputDebugStringA(msg) \
    do { \
        ::OutputDebugStringA(msg); \
        LogManager::Instance().Write("info", "Scanner", msg); \
    } while(0)
#include "../../../simple_handler.h"
#include "../Core/MachineProfile.h"
#include <cmath>
#include <iostream>
#include <fstream>
#include <string>
#include <cstdio>   // For snprintf
#include <algorithm>
#include <vector>
#include <sstream>
#include "include/cef_parser.h"

ScanlabController& ScanlabController::Instance() {
	static ScanlabController instance;
	return instance;
}

ScanlabController::ScanlabController() {
	m_stopFlag = false;
	LoadConfig(); // Load ScanlabConfig.json
}

ScanlabController::~ScanlabController() {
	CloseDevice();
}

bool ScanlabController::IsOpen() {
	return m_rtcDriver && m_rtcDriver->IsCardOpen();
}

bool ScanlabController::OpenDevice() {
	return Initialize();
}

void ScanlabController::CloseDevice() {
	if (m_rtcDriver) {
		m_rtcDriver->CloseCard();
		m_rtcDriver->FreeDll();
		m_rtcDriver.reset();
	}
	m_isInitialized = false;
}

void ScanlabController::Cancel() {
	if (m_rtcDriver) {
		m_rtcDriver->StopExecution();
		m_rtcDriver->DisableLaser();
	}
}

bool ScanlabController::Initialize() {
	if (m_isInitialized)
		return true;

	// Load configuration parameters dynamically (ensures CEF is initialized)
	LoadConfig();

	// 1) Read machine.ini parameters through MachineProfile
	// Use custom default value if not specified
	m_rtcVersion = 6; // Default to RTC6
	m_cardNo = 1;

	// In real environment, MachineProfile can parse these from machine.ini [MACHINE] section
	// e.g. MachineProfile::Instance().GetRtcVersion()
	// Let's assume we can fetch them or read machine.ini fallback
	try {
		// Temporary fallback parsing if not fully integrated in MachineProfile yet
		char exePath[MAX_PATH];
		GetModuleFileNameA(NULL, exePath, MAX_PATH);
		std::string path(exePath);
		size_t lastBackslash = path.find_last_of("\\/");
		std::string iniPath = path.substr(0, lastBackslash) + "\\Config\\machine.ini";

		char rtcVerStr[32] = { 0 };
		GetPrivateProfileStringA("MACHINE", "RTC_VERSION", "6", rtcVerStr, sizeof(rtcVerStr), iniPath.c_str());
		m_rtcVersion = std::stoi(rtcVerStr);

		char rtcCardStr[32] = { 0 };
		GetPrivateProfileStringA("MACHINE", "RTC_CARD_NO", "1", rtcCardStr, sizeof(rtcCardStr), iniPath.c_str());
		m_cardNo = std::stoi(rtcCardStr);
	}
	catch (...) {
		m_rtcVersion = 6;
		m_cardNo = 1;
	}

	// 2) Instantiate driver via Factory
	try {
		m_rtcDriver = RtcDriverFactory::CreateDriver(m_rtcVersion);
	}
	catch (const std::exception& e) {
		OutputDebugStringA(("[ScanlabController] Driver creation failed: " + std::string(e.what()) + "\n").c_str());
		return false;
	}

	// 3) Locate DLL
	char exePath[MAX_PATH];
	GetModuleFileNameA(NULL, exePath, MAX_PATH);
	std::string path(exePath);
	size_t lastBackslash = path.find_last_of("\\/");
	std::string binDir = path.substr(0, lastBackslash);

	std::wstring dllName = L"\\RTC6DLLx64.dll";
	if (m_rtcVersion == 5) dllName = L"\\RTC5DLL.dll";
	else if (m_rtcVersion == 4) dllName = L"\\RTC4DLL.dll";

	std::wstring dllPath = std::wstring(binDir.begin(), binDir.end()) + dllName;

	// 4) Initialize DLL
	if (!m_rtcDriver->InitDll(dllPath)) {
		OutputDebugStringA("[ScanlabController] Failed to initialize DLL.\n");
		return false;
	}

	// 5) Open connection to card
	if (!m_rtcDriver->OpenCard(m_cardNo)) {
		OutputDebugStringA("[ScanlabController] Failed to open card.\n");
		m_rtcDriver->FreeDll();
		return false;
	}

	// 6) Load DSP/Firmware file
	std::string progPath = binDir + "\\" + m_programFile;
	if (!m_rtcDriver->LoadProgramFile(progPath)) {
		OutputDebugStringA(("[ScanlabController] Failed to load firmware file: " + progPath + ". Trying empty/default fallback...\n").c_str());
		if (!m_rtcDriver->LoadProgramFile("")) {
			OutputDebugStringA("[ScanlabController] Fallback firmware loading failed.\n");
			m_rtcDriver->FreeDll();
			return false;
		}
	}

	// 7) Load Correction file
	std::string corPath = binDir + "\\" + m_correctionFile;
	if (!m_rtcDriver->LoadCorrectionFile(corPath, 1, 2)) {
		OutputDebugStringA(("[ScanlabController] Failed to load correction file: " + corPath + ". Trying Config folder fallback...\n").c_str());
		std::string fallbackCorPath = binDir + "\\Config\\" + m_correctionFile;
		if (!m_rtcDriver->LoadCorrectionFile(fallbackCorPath, 1, 2)) {
			OutputDebugStringA("[ScanlabController] Fallback correction file loading failed. Trying default fallback...\n");
			m_rtcDriver->LoadCorrectionFile("", 1, 2);
		}
	}
	m_rtcDriver->SelectCorTable(1, 0);

	// Configure list memory partition (4MB for List 1, 4MB for List 2)
	m_rtcDriver->ConfigList(4194304, 4194304);

	// Force clear all card error locks before checking status and loading K-factor
	m_rtcDriver->ResetError(0xFFFFFFFF);

	// Retrieve real-time Calibration Factor K (bits/mm) from board
	m_dCalibrationFactorK = m_rtcDriver->GetHeadPara(1, 1);
	if (m_dCalibrationFactorK <= 0.0) {
		// Fallback if K-factor reading is not available (e.g. simulation/error)
		m_dCalibrationFactorK = 9532.5; // (1048576 = 2^20) / 110
	}

	// 8) Initial Settings
	m_rtcDriver->SetLaserMode(m_laserMode);
	
	// Configure default standby and active pulse periods for laser sync trigger
	m_rtcDriver->SetStandby(0, 0);
	m_rtcDriver->SetLaserPulsesCtrl(10, 20);

	m_rtcDriver->SetLaserControl(m_laserControl);

	// Delay Mode: VarPoly=0, DirectMove3D=0, EdgeLevel=0, MinJumpDelay=0, JumpLengthLimit=0
	m_rtcDriver->SetDelayMode(0, 0, 0, 0, 0);
	m_rtcDriver->SetSpeed(ConvertSpeedToBitsPerMs(m_markSpeed), ConvertSpeedToBitsPerMs(m_jumpSpeed));

	// Force load default delays into scanner board via initial list run to release galvo lock
	m_rtcDriver->SetStartList(1);
	m_rtcDriver->SetLaserDelays(640, 640);
	m_rtcDriver->SetScannerDelays(9, 6, 3);
	m_rtcDriver->SetEndOfList();
	m_rtcDriver->ExecuteList(1);

	// Wait until default delays configuration list completes
	unsigned int rtcStatus = 1, rtcPos = 0;
	do {
		Sleep(1);
		m_rtcDriver->GetStatus(rtcStatus, rtcPos);
	} while (rtcStatus != 0);

	m_isInitialized = true;
	OutputDebugStringA("[ScanlabController] Scanlab initialization completed successfully.\n");
	return true;
}

void ScanlabController::LoadCommands(const std::vector<ScannerCommand>& commands) {
	m_commands = commands;
	OutputDebugStringA(("[ScanlabController] Commands Loaded: " +
		std::to_string(m_commands.size()) + "\n")
		.c_str());
}

long ScanlabController::MmToBits(double mm, bool isX) const {
	double coord = mm;

	// Apply Swapping and inversion based on configuration
	// In user rules: Y axis up is +, X axis right is +
	// Standard galvo might need inversion to match CNC orientation
	if (isX) {
		if (m_bXAxisN) coord = -coord;
	}
	else {
		if (m_bYAxisN) coord = -coord;
	}

	// Calculate bits using Calibration factor from board and UI Scale Ratio
	double ratio = isX ? m_hRatio : m_vRatio;
	long bits = static_cast<long>(coord * m_dCalibrationFactorK * ratio + (coord >= 0 ? 0.5 : -0.5));

	// Limit to 20-bit bounds (RTC5/RTC6 Standard for ct5 correction files: -524288 to 524287)
	if (bits < -524288) bits = -524288;
	if (bits > 524287) bits = 524287;

	return bits;
}

double ScanlabController::ConvertSpeedToBitsPerMs(double speedMmPerSec) const {
	double kFactor = m_dCalibrationFactorK;
	if (kFactor <= 0.0) {
		kFactor = 9532.5;
	}
	return (speedMmPerSec * kFactor) / 1000.0;
}

void ScanlabController::Run(const std::string& profile, std::function<void(double)> zMoveCallback) {
	if (!Initialize()) {
		OutputDebugStringA("[ScanlabController] Not Initialized!\n");
		if (auto* h = SimpleHandler::GetInstance()) {
			h->BroadcastJS("window.__onScannerStatus && window.__onScannerStatus('idle');");
			h->BroadcastJS("window.__showToast && window.__showToast('Hardware is not connected. Process aborted.', 'error');");
		}
		return;
	}

	if (m_commands.empty()) {
		OutputDebugStringA("[ScanlabController] No commands to run.\n");
		if (auto* h = SimpleHandler::GetInstance()) {
			h->BroadcastJS("window.__onScannerStatus && window.__onScannerStatus('idle');");
			h->BroadcastJS("window.__showToast && window.__showToast('No commands to run.', 'error');");
		}
		return;
	}

	m_stopFlag = false;

	// Enable laser shutter before starting scan process
	if (m_rtcDriver) {
		m_rtcDriver->ResetError(0xFFFFFFFF); // Clear any runtime error locks before marking
		m_rtcDriver->EnableLaser();
	}

	if (auto* h = SimpleHandler::GetInstance()) {
		h->BroadcastJS("window.__onScannerStatus && window.__onScannerStatus('running');");
	}

	unsigned int listNo = 1;
	m_rtcDriver->SetStartList(listNo);
	m_rtcDriver->SetSpeed(ConvertSpeedToBitsPerMs(m_markSpeed), ConvertSpeedToBitsPerMs(m_jumpSpeed));

	size_t cmdIndex = 0;
	bool hasDrawn = false;
	unsigned int chunkRtcPos = 2; // JumpAbs(0,0) + SetEndOfList at the end

	// [7차 Mark Times 2026-07-23] REPEAT 블록 반복 상태(단일 레벨, Run 지역).
	size_t repeatStartIndex = 0;
	int repeatRemaining = 0;
	int repeatTotal = 0;            // [Issue9 P3] total passes (for the pass broadcast)
	std::string repeatColor;        // [Issue9 P3] current block's layer color

	// [Issue9 P3 2026-07-23] Measured MARK TIMES pass broadcast (same contract as
	// SinoGalvoController::Run's emitMarkPass): validated hex color only (JS injection guard).
	auto emitMarkPass = [](int cur, int total, const std::string& color) {
		std::string safeColor;
		if (!color.empty() && color[0] == '#' && color.size() <= 9) {
			bool ok = true;
			for (size_t i = 1; i < color.size(); ++i) {
				const char ch = color[i];
				if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F'))) { ok = false; break; }
			}
			if (ok && color.size() >= 4) safeColor = color;
		}
		if (auto* h = SimpleHandler::GetInstance()) {
			char buf[192];
			snprintf(buf, sizeof(buf), "window.__onScannerMarkPass && window.__onScannerMarkPass(%d, %d, '%s');", cur, total, safeColor.c_str());
			h->BroadcastJS(buf);
		}
	};

	try {
		for (; cmdIndex < m_commands.size(); ++cmdIndex) {
			if (m_stopFlag) break;

			const auto& cmd = m_commands[cmdIndex];

			// Handle Z_MOVE chunk transition
			if (cmd.type == ScannerCommandType::Z_MOVE) {
				if (hasDrawn) {
					m_rtcDriver->SetEndOfList();
					m_rtcDriver->ExecuteList(listNo);

					/* Wait for current list to finish 마킹 완료 대기 */
					unsigned int rtcStatus = 1, rtcPos = 0;
					do {
						Sleep(1);
						m_rtcDriver->GetStatus(rtcStatus, rtcPos);
						if (m_stopFlag) {
							m_rtcDriver->StopExecution();
							break;
						}
					} while (rtcStatus != 0);

					hasDrawn = false;
				}

				if (zMoveCallback && !m_stopFlag) {
					zMoveCallback(cmd.z);
				}

				// Start next list chunk
				listNo = (listNo == 1) ? 2 : 1;
				m_rtcDriver->SetStartList(listNo);
				m_rtcDriver->SetSpeed(ConvertSpeedToBitsPerMs(m_markSpeed), ConvertSpeedToBitsPerMs(m_jumpSpeed));
				chunkRtcPos = 2; // Reset for new chunk
				continue;
			}

			// Handle DELAY chunk transition
			if (cmd.type == ScannerCommandType::DELAY) {
				if (hasDrawn) {
					m_rtcDriver->SetEndOfList();
					m_rtcDriver->ExecuteList(listNo);

					/* Wait for current list to finish 마킹 완료 대기 */
					unsigned int rtcStatus = 1, rtcPos = 0;
					do {
						Sleep(1);
						m_rtcDriver->GetStatus(rtcStatus, rtcPos);
						if (m_stopFlag) {
							m_rtcDriver->StopExecution();
							break;
						}
					} while (rtcStatus != 0);

					hasDrawn = false;
				}

				if (cmd.delayTime > 0.0 && !m_stopFlag) {
					Sleep(static_cast<DWORD>(cmd.delayTime * 1000.0));
				}

				// Start next list chunk
				listNo = (listNo == 1) ? 2 : 1;
				m_rtcDriver->SetStartList(listNo);
				m_rtcDriver->SetSpeed(ConvertSpeedToBitsPerMs(m_markSpeed), ConvertSpeedToBitsPerMs(m_jumpSpeed));
				chunkRtcPos = 2; // Reset for new chunk
				// [FIX] Removed the manual ++cmdIndex here: the for-loop increment also runs
				// on continue, so the old code advanced by two and silently dropped the first
				// command right after every DELAY (the next shape's first command).
				continue;
			}

			/* [색상별 Mark Speed 2026-07-22] 색상(레이어) 그룹 경계의 속도 전환. DELAY와 동일하게
			   현재 리스트를 실행·완료 대기 후 m_markSpeed를 갱신하고, 새 리스트를 새 속도
			   (SetSpeed)로 시작한다. 기존에는 Run 시작 시의 단일 m_markSpeed가 전체에 적용되어
			   색상별 Mark Speed 설정이 무시되었다. (파워는 RTC 경로에 개별 API가 없어 보류) */
			if (cmd.type == ScannerCommandType::SET_PARAM) {
				if (hasDrawn) {
					m_rtcDriver->SetEndOfList();
					m_rtcDriver->ExecuteList(listNo);

					/* Wait for current list to finish 마킹 완료 대기 */
					unsigned int rtcStatus = 1, rtcPos = 0;
					do {
						Sleep(1);
						m_rtcDriver->GetStatus(rtcStatus, rtcPos);
						if (m_stopFlag) {
							m_rtcDriver->StopExecution();
							break;
						}
					} while (rtcStatus != 0);

					hasDrawn = false;
				}

				if (cmd.markSpeed > 0.0) {
					m_markSpeed = static_cast<float>(cmd.markSpeed);
				}

				// Start next list chunk with the updated speed
				listNo = (listNo == 1) ? 2 : 1;
				m_rtcDriver->SetStartList(listNo);
				m_rtcDriver->SetSpeed(ConvertSpeedToBitsPerMs(m_markSpeed), ConvertSpeedToBitsPerMs(m_jumpSpeed));
				chunkRtcPos = 2; // Reset for new chunk
				continue;
			}

			/* [7차 Mark Times 2026-07-23] [Design Pattern: Interpreter] REPEAT 블록.
			   프론트는 그룹당 기하를 1패스만 보내고 반복은 드라이버가 수행한다
			   (SinoGalvoController::Run과 동일 규약, 계획서 ScannerIssue7_MarkTimes100.md). */
			if (cmd.type == ScannerCommandType::REPEAT_BEGIN) {
				repeatStartIndex = cmdIndex + 1;
				repeatRemaining = (cmd.repeatCount > 1) ? cmd.repeatCount : 1;
				// [Issue9 P3] Announce pass 1 of this group with its layer color.
				repeatTotal = repeatRemaining;
				repeatColor = cmd.color;
				emitMarkPass(1, repeatTotal, repeatColor);
				continue;
			}

			if (cmd.type == ScannerCommandType::REPEAT_END) {
				if (hasDrawn) {
					m_rtcDriver->SetEndOfList();
					m_rtcDriver->ExecuteList(listNo);

					/* Wait for current list to finish 마킹 완료 대기 */
					unsigned int rtcStatus = 1, rtcPos = 0;
					do {
						Sleep(1);
						m_rtcDriver->GetStatus(rtcStatus, rtcPos);
						if (m_stopFlag) {
							m_rtcDriver->StopExecution();
							break;
						}
					} while (rtcStatus != 0);

					hasDrawn = false;
				}

				// Start next list chunk (다음 회차 또는 다음 명령)
				listNo = (listNo == 1) ? 2 : 1;
				m_rtcDriver->SetStartList(listNo);
				m_rtcDriver->SetSpeed(ConvertSpeedToBitsPerMs(m_markSpeed), ConvertSpeedToBitsPerMs(m_jumpSpeed));
				chunkRtcPos = 2;

				if (repeatRemaining > 1 && !m_stopFlag) {
					--repeatRemaining;
					if (cmd.delayTime > 0.0) {
						Sleep(static_cast<DWORD>(cmd.delayTime * 1000.0));
					}
					// [Issue9 P3] Announce the measured pass number for the UI MARK TIMES row.
					emitMarkPass(repeatTotal - repeatRemaining + 1, repeatTotal, repeatColor);
					// for 루프의 ++cmdIndex를 감안해 블록 시작 직전 인덱스로 되감는다.
					cmdIndex = repeatStartIndex - 1;
				}
				else {
					repeatRemaining = 0;
				}
				continue;
			}

			// Convert coordinate swapping at controller level if enabled
			double posX = cmd.x;
			double posY = cmd.y;
			double startX = cmd.startX;
			double startY = cmd.startY;

			if (m_bXYExchange) {
				std::swap(posX, posY);
				std::swap(startX, startY);
			}

			long bitX = MmToBits(posX, true);
			long bitY = MmToBits(posY, false);
			long bitStartX = MmToBits(startX, true);
			long bitStartY = MmToBits(startY, false);

			hasDrawn = true;

			// Translate ScannerCommand into RTC List Commands
			switch (cmd.type) {
			case ScannerCommandType::JUMP:
				m_rtcDriver->JumpAbs(MmToBits(posX, true), MmToBits(posY, false));
				break;

			case ScannerCommandType::POINT: {
				chunkRtcPos += 4;
				m_rtcDriver->JumpAbs(MmToBits(posX, true), MmToBits(posY, false));
				long delayUs = static_cast<long>(cmd.pointTime * 1000.0); // ms to us
				m_rtcDriver->LaserOnList(delayUs);
				m_rtcDriver->LongDelay(delayUs);
				m_rtcDriver->LaserOffList();
				break;
			}

			case ScannerCommandType::LINE: {
				chunkRtcPos += 4;
				long bitStartX = MmToBits(startX, true);
				long bitStartY = MmToBits(startY, false);
				long bitX = MmToBits(posX, true);
				long bitY = MmToBits(posY, false);

				m_rtcDriver->JumpAbs(bitStartX, bitStartY);
				m_rtcDriver->LaserOnList(0);
				m_rtcDriver->MarkAbs(bitX, bitY);
				m_rtcDriver->LaserOffList();
				break;
			}

			case ScannerCommandType::CIRCLE: {
				chunkRtcPos += 4;
				double r = cmd.r;
				double startX = posX + r;
				double startY = posY;

				long bitStartX = MmToBits(startX, true);
				long bitStartY = MmToBits(startY, false);
				long bitX = MmToBits(posX, true);
				long bitY = MmToBits(posY, false);

				m_rtcDriver->JumpAbs(bitStartX, bitStartY);
				m_rtcDriver->LaserOnList(0);
				m_rtcDriver->ArcAbs(bitX, bitY, 360.0);
				m_rtcDriver->LaserOffList();
				break;
			}

			case ScannerCommandType::RECT: {
				chunkRtcPos += 7;
				double halfW = cmd.w / 2.0;
				double halfH = cmd.h / 2.0;

				double x1 = posX - halfW;
				double y1 = posY - halfH;
				double x2 = posX + halfW;
				double y2 = posY - halfH;
				double x3 = posX + halfW;
				double y3 = posY + halfH;
				double x4 = posX - halfW;
				double y4 = posY + halfH;

				// Apply rotation angle if needed (approximate with points rotating around center posX, posY)
				if (std::abs(cmd.angle) > 0.001) {
					auto rotateLocal = [](double& rx, double& ry, double cx, double cy, double deg) {
						double rad = deg * 3.1415926535 / 180.0;
						double s = std::sin(rad);
						double c = std::cos(rad);
						double dx = rx - cx;
						double dy = ry - cy;
						rx = cx + dx * c - dy * s;
						ry = cy + dx * s + dy * c;
					};
					rotateLocal(x1, y1, posX, posY, cmd.angle);
					rotateLocal(x2, y2, posX, posY, cmd.angle);
					rotateLocal(x3, y3, posX, posY, cmd.angle);
					rotateLocal(x4, y4, posX, posY, cmd.angle);
				}

				m_rtcDriver->JumpAbs(MmToBits(x1, true), MmToBits(y1, false));
				m_rtcDriver->LaserOnList(0);
				m_rtcDriver->MarkAbs(MmToBits(x2, true), MmToBits(y2, false));
				m_rtcDriver->MarkAbs(MmToBits(x3, true), MmToBits(y3, false));
				m_rtcDriver->MarkAbs(MmToBits(x4, true), MmToBits(y4, false));
				m_rtcDriver->MarkAbs(MmToBits(x1, true), MmToBits(y1, false));
				m_rtcDriver->LaserOffList();
				break;
			}

			case ScannerCommandType::ARC: {
				chunkRtcPos += 4;
				// Sweep angle calculation
				double sweep = cmd.endAngle - cmd.startAngle;
				if (sweep <= 0) sweep += 360.0;

				m_rtcDriver->JumpAbs(bitStartX, bitStartY);
				m_rtcDriver->LaserOnList(0);
				m_rtcDriver->ArcAbs(bitX, bitY, sweep);
				m_rtcDriver->LaserOffList();
				break;
			}

			case ScannerCommandType::ELLIPSE: {
				chunkRtcPos += 75;
				// Polyline approximation for ellipse
				const int steps = 72;
				for (int i = 0; i <= steps; i++) {
					double t = (double)i * (360.0 / steps) * (3.1415926535 / 180.0);
					double curX = posX + cmd.rx * std::cos(t);
					double curY = posY + cmd.ry * std::sin(t);

					if (std::abs(cmd.angle) > 0.001) {
						double rad = cmd.angle * 3.1415926535 / 180.0;
						double s = std::sin(rad);
						double c = std::cos(rad);
						double dx = curX - posX;
						double dy = curY - posY;
						curX = posX + dx * c - dy * s;
						curY = posY + dx * s + dy * c;
					}

					long bitEX = MmToBits(curX, true);
					long bitEY = MmToBits(curY, false);

					if (i == 0) {
						m_rtcDriver->JumpAbs(bitEX, bitEY);
						m_rtcDriver->LaserOnList(0);
					}
					else {
						m_rtcDriver->MarkAbs(bitEX, bitEY);
					}
				}
				m_rtcDriver->LaserOffList();
				break;
			}

				case ScannerCommandType::EARC: {
					chunkRtcPos += 39;
					// Similar to ellipse but restricted to start/end angle
					double sweep = cmd.endAngle - cmd.startAngle;
					if (sweep <= 0) sweep += 360.0;

					const int steps = 36;
					for (int i = 0; i <= steps; i++) {
						double angle = cmd.startAngle + (sweep / steps) * i;
						double t = angle * (3.1415926535 / 180.0);
						double curX = posX + cmd.rx * std::cos(t);
						double curY = posY + cmd.ry * std::sin(t);

						if (std::abs(cmd.angle) > 0.001) {
							double rad = cmd.angle * 3.1415926535 / 180.0;
							double s = std::sin(rad);
							double c = std::cos(rad);
							double dx = curX - posX;
							double dy = curY - posY;
							curX = posX + dx * c - dy * s;
							curY = posY + dx * s + dy * c;
						}

						long bitEX = MmToBits(curX, true);
						long bitEY = MmToBits(curY, false);

						if (i == 0) {
							m_rtcDriver->JumpAbs(bitEX, bitEY);
							m_rtcDriver->LaserOnList(0);
						}
						else {
							m_rtcDriver->MarkAbs(bitEX, bitEY);
						}
					}
					m_rtcDriver->LaserOffList();
					break;
				}
				}
			}

		if (hasDrawn && !m_stopFlag) {
			m_rtcDriver->JumpAbs(0, 0); // Return mirror to center at the end of execution
			m_rtcDriver->SetEndOfList();
			m_rtcDriver->ExecuteList(listNo);

			/* Busy-wait for completion */
			unsigned int rtcStatus = 1, rtcPos = 0;
			do {
				Sleep(20);
				m_rtcDriver->GetStatus(rtcStatus, rtcPos);
				
				if (chunkRtcPos > 0) {
					double progress = (rtcPos * 100.0) / chunkRtcPos;
					if (progress > 100.0) progress = 100.0;
					if (auto* h = SimpleHandler::GetInstance()) {
						char buf[256];
						snprintf(buf, sizeof(buf), "window.__onScannerProgress && window.__onScannerProgress(%.1f);", progress);
						h->BroadcastJS(buf);
					}
				}

				if (m_stopFlag) {
					m_rtcDriver->StopExecution();
					break;
				}
			} while (rtcStatus != 0);
		}
	}
	catch (...) {
		OutputDebugStringA("[ScanlabController] Unknown exception in command stream processing.\n");
		if (m_rtcDriver) {
			m_rtcDriver->DisableLaser();
		}
	}

	// Disable laser shutter after scan process completes or is stopped
	if (m_rtcDriver) {
		m_rtcDriver->DisableLaser();
	}

	m_stopFlag = false;

	if (auto* h = SimpleHandler::GetInstance()) {
		h->BroadcastJS("window.__onScannerStatus && window.__onScannerStatus('idle');");
	}

	OutputDebugStringA("[ScanlabController] Run complete.\n");
}

void ScanlabController::Stop() {
	m_stopFlag = true;
	if (m_rtcDriver) {
		m_rtcDriver->StopExecution();
		m_rtcDriver->DisableLaser();
		m_rtcDriver->GotoXY(0, 0);
	}
}

bool ScanlabController::LoadConfig() {
	char exePath[MAX_PATH];
	GetModuleFileNameA(NULL, exePath, MAX_PATH);
	std::string path(exePath);
	size_t lastBackslash = path.find_last_of("\\/");
	std::string configPath = path.substr(0, lastBackslash) + "\\Config\\ScanlabConfig.json";

	std::ifstream ifs(configPath);
	if (!ifs.is_open()) {
		// Create default if not exists
		SaveConfig();
		return true;
	}

	std::string content((std::istreambuf_iterator<char>(ifs)), (std::istreambuf_iterator<char>()));
	ifs.close();

	auto val = CefParseJSON(content, JSON_PARSER_RFC);
	if (val.get() && val->GetType() == VTYPE_DICTIONARY) {
		auto dict = val->GetDictionary();
		if (dict->HasKey("wavelength")) m_wavelength = dict->GetString("wavelength");
		if (dict->HasKey("rtcVersion")) m_rtcVersion = dict->GetInt("rtcVersion");
		if (dict->HasKey("cardNo")) m_cardNo = dict->GetInt("cardNo");
		if (dict->HasKey("programFile")) m_programFile = dict->GetString("programFile");
		if (dict->HasKey("correctionFile")) m_correctionFile = dict->GetString("correctionFile");
		if (dict->HasKey("hRatio")) m_hRatio = dict->GetDouble("hRatio");
		if (dict->HasKey("vRatio")) m_vRatio = dict->GetDouble("vRatio");
		if (dict->HasKey("markSpeed")) m_markSpeed = static_cast<float>(dict->GetDouble("markSpeed"));
		if (dict->HasKey("jumpSpeed")) m_jumpSpeed = static_cast<float>(dict->GetDouble("jumpSpeed"));
		if (dict->HasKey("laserMode")) m_laserMode = dict->GetInt("laserMode");
		if (dict->HasKey("laserControl")) m_laserControl = dict->GetInt("laserControl");
		if (dict->HasKey("bXYExchange")) m_bXYExchange = dict->GetBool("bXYExchange");
		if (dict->HasKey("bXAxisN")) m_bXAxisN = dict->GetBool("bXAxisN");
		if (dict->HasKey("bYAxisN")) m_bYAxisN = dict->GetBool("bYAxisN");
		return true;
	}
	return false;
}

bool ScanlabController::SaveConfig() {
	char exePath[MAX_PATH];
	GetModuleFileNameA(NULL, exePath, MAX_PATH);
	std::string path(exePath);
	size_t lastBackslash = path.find_last_of("\\/");
	std::string configPath = path.substr(0, lastBackslash) + "\\Config\\ScanlabConfig.json";

	auto dict = CefDictionaryValue::Create();
	dict->SetString("wavelength", m_wavelength);
	dict->SetInt("rtcVersion", m_rtcVersion);
	dict->SetInt("cardNo", m_cardNo);
	dict->SetString("programFile", m_programFile);
	dict->SetString("correctionFile", m_correctionFile);
	dict->SetDouble("hRatio", m_hRatio);
	dict->SetDouble("vRatio", m_vRatio);
	dict->SetDouble("markSpeed", m_markSpeed);
	dict->SetDouble("jumpSpeed", m_jumpSpeed);
	dict->SetInt("laserMode", m_laserMode);
	dict->SetInt("laserControl", m_laserControl);
	dict->SetBool("bXYExchange", m_bXYExchange);
	dict->SetBool("bXAxisN", m_bXAxisN);
	dict->SetBool("bYAxisN", m_bYAxisN);

	auto v = CefValue::Create();
	v->SetDictionary(dict);
	std::string json = CefWriteJSON(v, JSON_WRITER_PRETTY_PRINT).ToString();

	std::ofstream ofs(configPath);
	if (ofs.is_open()) {
		ofs << json;
		ofs.close();

		// Apply changes to active hardware dynamically
		ApplyActiveParameters();

		return true;
	}
	return false;
}

void ScanlabController::ApplyActiveParameters() {
	// Find active scanner
	ScanlabController* pActive = nullptr;
	if (g_Scanner) {
		pActive = dynamic_cast<ScanlabController*>(g_Scanner.get());
	}

	if (!pActive) {
		pActive = this;
	}

	if (!pActive->m_rtcDriver || !pActive->m_isInitialized) {
		return;
	}

	// Load configuration parameters on the active scanner from config file
	pActive->LoadConfig();

	// 1) Calibration Factor K 실시간 업데이트
	pActive->m_dCalibrationFactorK = pActive->m_rtcDriver->GetHeadPara(1, 1);
	if (pActive->m_dCalibrationFactorK <= 0.0) {
		pActive->m_dCalibrationFactorK = 9532.5; // Fallback
	}

	// 2) 레이저 제어 모드 및 기본 지연값 리포팅 업데이트
	pActive->m_rtcDriver->SetLaserMode(pActive->m_laserMode);
	pActive->m_rtcDriver->SetLaserControl(pActive->m_laserControl);

	// 3) 스캔 속도 실시간 업데이트
	pActive->m_rtcDriver->SetSpeed(
		pActive->ConvertSpeedToBitsPerMs(pActive->m_markSpeed), 
		pActive->ConvertSpeedToBitsPerMs(pActive->m_jumpSpeed)
	);

	OutputDebugStringA("[ScanlabController] Dynamically applied configuration changes to active RTC card.\n");
}


unsigned int ScanlabController::GetHeadStatus() const {
	if (m_rtcDriver) return m_rtcDriver->GetHeadStatus(1);
	return 0;
}

unsigned int ScanlabController::GetInitStatus() const {
	if (m_rtcDriver) return m_rtcDriver->GetInitStatus();
	return 0;
}

unsigned int ScanlabController::GetDllVersion() const {
	return m_rtcDriver ? m_rtcDriver->GetDllVersion() : 0;
}

unsigned int ScanlabController::GetHexVersion() const {
	return m_rtcDriver ? m_rtcDriver->GetHexVersion() : 0;
}

unsigned int ScanlabController::GetRtcVersionNumber() const {
	return m_rtcDriver ? m_rtcDriver->GetRtcVersionNumber() : 0;
}

unsigned int ScanlabController::GetSerialNumber() const {
	return m_rtcDriver ? m_rtcDriver->GetSerialNumber() : 0;
}
