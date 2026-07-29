#include "pch.h"
#include "SinoGalvoController.h"
#include "../../../simple_handler.h"
#include <cmath>
#include <iostream>
#include <fstream>
#include <string>
#include <cstdio>   // For snprintf
#include <algorithm>
#include <vector>
#include <sstream>
#include <iomanip>
#include "include/cef_parser.h"
#include "../Core/MachineType.h"  // MC1/MC2
#include "../../../Shared/Util/LogManager.h"

GALVOPARAM galvoparam;

/**
 * @brief Mirrors the same message shown via OutputDebugStringA into the Portal(UI)
 *        SYSTEM CONSOLE and into Bin\Log\Log_*.txt.
 * @details Lets the SinoGalvo delay investigation be inspected from inside the app
 *          without an external tool (DebugView), by forwarding the message to the
 *          frontend via window.__onNativeLog(level, source, message). This replaces
 *          the previous plain OutputDebugStringA call sites in this file.
 *          level is one of "debug" (high-frequency polling, low interest), "info"
 *          (normal progress summary), "warn" (recovered timeout/anomaly), or "error"
 *          (failure severe enough to abort the job) — callers must pick the right
 *          one so the SYSTEM CONSOLE's level filter is actually meaningful.
 *          The local message string usually keeps its "[SinoGalvoController] ..."
 *          prefix (so DebugView readers can tell the source at a glance), but the
 *          SYSTEM CONSOLE and log file already tag the source separately, so the
 *          prefix is stripped once before forwarding to avoid a duplicated tag.
 *          LogManager::Write() appends to the file immediately on every call
 *          (including polling logs, uncompressed) — so the file always keeps every
 *          entry in chronological order regardless of how the SYSTEM CONSOLE groups
 *          repeated lines for display.
 *          NOTE: feature_Scanner.md section 6.7 previously required new comments here to
 *          stay ASCII-only, because this file had lost its UTF-8 BOM and a non-/utf-8 MSVC
 *          build could read it as CP949 and silently swallow the line after a Korean
 *          comment. As of 2026-07-21 the UTF-8 BOM has been restored (matching the sibling
 *          files JhcLib.cpp / simple_handler.cpp), so MSVC now reads this file as UTF-8 and
 *          Korean comments are safe. Keep the BOM when saving this file.
 */
static void DiagLog(const std::string& msg, const char* level = "debug") {
	OutputDebugStringA(msg.c_str());

	const std::string prefix = "[SinoGalvoController] ";
	std::string body = (msg.rfind(prefix, 0) == 0) ? msg.substr(prefix.size()) : msg;
	while (!body.empty() && (body.back() == '\n' || body.back() == '\r')) body.pop_back();

	LogManager::Instance().Write(level, "SinoGalvoController", body);

	if (auto* h = SimpleHandler::GetInstance()) {
		std::string escaped;
		escaped.reserve(body.size() + 8);
		for (char c : body) {
			if (c == '\\') escaped += "\\\\";
			else if (c == '\'') escaped += "\\'";
			else if (c == '\n') escaped += "\\n";
			else escaped += c;
		}
		std::string js = "window.__onNativeLog && window.__onNativeLog('" + std::string(level) + "','SinoGalvoController','" + escaped + "');";
		h->BroadcastJS(js);
	}
}

// [이슈 G 2026-07-21] CSG9210 보드의 하드웨어 명령 버퍼 한계(바이트 단위).
// 값은 정상 동작이 검증된 레거시 빌드(전남대 통합헤드 LW-1000, MacroSystemSetting.h:
// SCANNER_DATA_BUFFER_LIMIT = 100000)에서 그대로 가져왔다. 보드 데이터 버퍼는 유한하므로,
// 무제한 개수의 SchOut* 명령을 하나의 BufStart에 쌓으면(예: Z_MOVE/DELAY 경계가 없는 대형
// DXF나 매트릭스) 버퍼가 오버플로되어 보드가 먹통이 될 수 있다. Run()은 실제로 밀어 넣은
// 바이트를 누적하여 이 한계를 넘기 전에 flush 한다.
static constexpr int SCANNER_DATA_BUFFER_LIMIT = 100000;

// [이슈 G] 각 명령이 보드 버퍼에 밀어 넣는 바이트 수. 도형별 float 페이로드 크기는 레거시
// 바이트 산정을 따른다(LINE=16, POINT/CIRCLE=12, ELLIPSE=16, ARC=20, EARC=24). 이 컨트롤러는
// 모든 도형 앞에 MovetTo(SchOutPoint, 12바이트)를 추가로 붙이고 RECT는 4개의 직선으로
// 전개되므로 여기에 반영했다. JUMP는 암묵적이며 Z_MOVE/DELAY는 누적기를 리셋하는 청크
// 경계이므로 0이다.
static int CommandBufferBytes(ScannerCommandType type) {
	switch (type) {
	case ScannerCommandType::POINT:   return 12 + 12;      // MovetTo + SchOutPoint
	case ScannerCommandType::LINE:    return 12 + 16;      // MovetTo + SchOutLine
	case ScannerCommandType::CIRCLE:  return 12 + 12;      // MovetTo + SchOutCircle
	case ScannerCommandType::RECT:    return 12 + 16 * 4;  // MovetTo + 직선 4개
	case ScannerCommandType::ARC:     return 12 + 20;      // MovetTo + SchOutArc
	case ScannerCommandType::ELLIPSE: return 12 + 16;      // MovetTo + SchOutEllipse
	case ScannerCommandType::EARC:    return 12 + 24;      // MovetTo + SchOutEArc
	default:                          return 0;            // JUMP / Z_MOVE / DELAY
	}
}

SinoGalvoController& SinoGalvoController::Instance() {
	static SinoGalvoController instance;
	return instance;
}

SinoGalvoController::SinoGalvoController() : m_jhcLib(std::make_unique<JhcLib>()) {
	m_stopFlag = false;
	LoadConfig(); // Load initial configuration from JSON
}

SinoGalvoController::~SinoGalvoController() {
	if (m_isInitialized && m_jhcLib->CloseDevice) {
		m_jhcLib->CloseDevice();
	}
}

bool SinoGalvoController::IsOpen() {
	if (m_jhcLib && m_jhcLib->IsOpen) {
		return m_jhcLib->IsOpen() == TRUE;
	}
	return false;
}

bool SinoGalvoController::OpenDevice() {
	if (m_jhcLib && m_jhcLib->OpenDevice) {
		return m_jhcLib->OpenDevice() == TRUE;
	}
	return false;
}

void SinoGalvoController::CloseDevice() {
	if (m_jhcLib && m_jhcLib->CloseDevice) {
		m_jhcLib->CloseDevice();
	}
}

void SinoGalvoController::Cancel() {
	if (m_jhcLib && m_jhcLib->Cancel) {
		m_jhcLib->Cancel();
	}
}

void SinoGalvoController::SetDefaultCorrectionSet() {
	if (m_jhcLib && m_jhcLib->CorrectionSet) {
		m_jhcLib->CorrectionSet(
			static_cast<float>(m_barrelDistortionX),
			static_cast<float>(m_barrelDistortionY),
			static_cast<float>(m_trapezoidalDistortionX),
			static_cast<float>(m_trapezoidalDistortionY),
			static_cast<float>(m_parallelogramDistortionX),
			static_cast<float>(m_parallelogramDistortionY),
			static_cast<float>(m_HRatio),
			static_cast<float>(m_VRatio));
	}
}

void SinoGalvoController::SetDefaultParameters(float MarkingSpeed,
	float JumpSpeed) {
	PARAMETER param = { 0 };
	param.WorkSize = static_cast<float>(m_workSize);
	param.MarkSpeed = MarkingSpeed;
	// 음수로 해야 원형 시작 딜레이 없이 가공됨.
	// 0 또는 양수면 원형 시작 위치 이동을 markspeed 로 이동함
	// 마크 스피드 10 이면 대략 10초되에 원 가공 시작됨
	param.OpenDelay = -100;// -100.f;
	param.CloseDelay = 200.f; //0;// 200.f;
	param.FoldDelay = 0.0f;
	param.FinishDelay = 100.0f; //0;// 100.0f;
	param.RedSpeed = 300.0f;
	param.JumpSpeed = JumpSpeed; // 다음 도형 위치 이동시 속도
	param.JumpLocationDelay = 0.0f;
	param.JumpDistanceDelay = 0.0f;

	//if (m_jhcLib && m_jhcLib->ParameterSet)
	//	m_jhcLib->ParameterSet(param);

	if (m_jhcLib->ParameterSet)
		m_jhcLib->ParameterSet(param);

	galvoparam.bXYExchange = m_bXYExchange;
	galvoparam.bXAxisN = m_bXAxisN;
	galvoparam.bYAxisN = m_bYAxisN;

	//if (m_jhcLib && m_jhcLib->GalvoParameterSet)
	//	m_jhcLib->GalvoParameterSet(galvoparam);

	m_jhcLib->GalvoParameterSet(galvoparam);

}

bool SinoGalvoController::Initialize() {
	if (m_isInitialized)
		return true;

	if (m_jhcLib && m_jhcLib->OpenDevice) {
		m_isInitialized = true;
	}

	return m_isInitialized;
}

void SinoGalvoController::LoadCommands(
	const std::vector<ScannerCommand>& commands) {
	// [P1-3 2026-07-22] [Design Pattern: Balking] Run() 워커가 m_commands를 순회하는 동안
	// 벡터를 통째로 교체하면 재할당으로 옛/새 커맨드가 뒤섞여 마킹된다(6차 이슈 S3의
	// "축소 영역에 원본 도형이 우겨넣어진" 중첩 가공). 실행 중에는 교체를 거부한다.
	// 라우터(HandleScannerGenerate)도 IsRunning()을 선확인해 프론트에 busy 에러를 돌려준다.
	if (m_isRunning.load()) {
		DiagLog("[SinoGalvoController] LoadCommands REJECTED: marking still running.\n", "warn");
		return;
	}
	m_commands = commands;
	DiagLog(("[SinoGalvoController] Commands Loaded: " +
		std::to_string(m_commands.size()) + "\n")
		.c_str(), "info");
}

void SinoGalvoController::SetMarkSpeed(float speed) {
	if (speed > 0) {
		m_markSpeed = speed;
		DiagLog(("[SinoGalvoController] SetMarkSpeed: " +
			std::to_string(m_markSpeed) + "\n")
			.c_str());
	}
}

// Helper for Rotation
static void RotatePointLocal(float& x, float& y, float cx, float cy, float angleDeg) {
	if (std::abs(angleDeg) < 0.001f)
		return;
	float rad = angleDeg * 3.1415926535f / 180.0f;
	float s = std::sin(rad);
	float c = std::cos(rad);
	float dx = x - cx;
	float dy = y - cy;
	x = cx + dx * c - dy * s;
	y = cy + dx * s + dy * c;
}

void SinoGalvoController::Run(const std::string& profile, std::function<void(double)> zMoveCallback) {
	// [P1-3 2026-07-22] [Design Pattern: Balking] 재진입 가드. Stop이 듣지 않는 상태에서
	// Process Start를 다시 누르면 WORK_1 워커가 Run을 병렬 기동해 두 스레드가 같은 보드에
	// BufStart/StartMarking을 교차 발행했다(6차 이슈 S3 중첩 가공). 이미 실행 중이면 즉시 거부.
	bool expected = false;
	if (!m_isRunning.compare_exchange_strong(expected, true)) {
		DiagLog("[SinoGalvoController] Run REJECTED: already running.\n", "warn");
		if (auto* h = SimpleHandler::GetInstance()) {
			h->BroadcastJS("window.__showToast && window.__showToast('Scanner is already running. Stop it first.', 'warning');");
		}
		return;
	}
	// [Design Pattern: RAII] 모든 반환 경로(초기화 실패/빈 커맨드/정상 종료/예외)에서 실행
	// 플래그를 확실히 내린다.
	struct RunningGuard {
		std::atomic<bool>& f;
		~RunningGuard() { f = false; }
	} runningGuard{ m_isRunning };

	// [P1-1 2026-07-22] 유휴 중 눌린 Stop 요청이 다음 가공을 오염시키지 않도록 시작 시점에
	// 소거한다. 이후 m_stopFlag 소거는 Run() 말단 한 곳뿐이다(§CheckMarkingState 주석 참조).
	m_stopFlag = false;

	if (!Initialize()) {
		DiagLog("[SinoGalvoController] Not Initialized!\n", "error");
		if (auto* h = SimpleHandler::GetInstance()) {
			h->BroadcastJS("window.__onScannerStatus && window.__onScannerStatus('idle');");
			h->BroadcastJS("window.__showToast && window.__showToast('Hardware is not connected. Process aborted.', 'error');");
		}
		return;
	}

	if (m_commands.empty()) {
		DiagLog("[SinoGalvoController] No commands to run.\n", "warn");
		if (auto* h = SimpleHandler::GetInstance()) {
			h->BroadcastJS("window.__onScannerStatus && window.__onScannerStatus('idle');");
			h->BroadcastJS("window.__showToast && window.__showToast('No commands to run.', 'error');");
		}
		return;
	}

	m_jhcLib->Cancel();

	if (m_jhcLib->StartMarking) {
		if (auto* h = SimpleHandler::GetInstance()) {
			h->BroadcastJS("window.__onScannerStatus && window.__onScannerStatus('running');");
		}

		// 1. Set Correction
		SetDefaultCorrectionSet();

		// [FIX] Wait until the board is ready. If a previous run aborted abnormally the board
		// may be stuck in busy(0) forever, so apply a 3-second hard timeout and recover with
		// Cancel() before continuing. (Same Guarded Wait pattern as the 6.1 Z-axis timeout fix)
		// [POLARITY] Per the SDK manual excerpt transcribed in JhcLib.cpp ScannerUtil::WaitFinish()
		// ([cite: 49]): GetMarkingState() returns 0 = not over (busy), 1 = end of sending data (idle).
		// NOTE: this contradicts the terse inline comment on the typedef in JhcLib.h ("1:Busy, 0:Idle") -
		// that header comment is the actual error; do not "fix" this polarity again without new
		// hardware evidence overriding the manual-cited reference below.
		// [DIAG] Temporary instrumentation to root-cause a reported ~3s delay before the first
		// mark: logs the raw GetMarkingState() value every ~100ms and how long the wait actually
		// took, so real hardware behavior can be inspected via DebugView instead of guessed at.
		{
			DiagLog("[SinoGalvoController] Run: pre-wait for board ready...\n", "info");
			const DWORD preWaitStart = GetTickCount();
			DWORD lastLog = preWaitStart;
			int pollCount = 0;
			while (m_jhcLib->GetMarkingState() == 0)
			{
				// [FIX 2026-07-21] Immediate Stop response: this wait loop had no m_stopFlag
				// check, so a user Stop could be held off for up to 3s here. Bail out at once.
				if (m_stopFlag) {
					DiagLog("[SinoGalvoController] Run: pre-wait aborted by Stop.\n", "info");
					m_jhcLib->Cancel();
					break;
				}
				const DWORD now = GetTickCount();
				if (now - lastLog >= 100) {
					char diag[160];
					snprintf(diag, sizeof(diag), "[SinoGalvoController] Run: pre-wait poll #%d, elapsed=%lums, GetMarkingState()=0 (still busy/not-over)\n", ++pollCount, now - preWaitStart);
					DiagLog(diag);
					lastLog = now;
				}
				if (now - preWaitStart > 3000) {
					char diag[160];
					snprintf(diag, sizeof(diag), "[SinoGalvoController] Run: pre-wait TIMEOUT (3s, elapsed=%lums). Forcing Cancel and continuing.\n", now - preWaitStart);
					DiagLog(diag, "warn");
					m_jhcLib->Cancel();
					break;
				}
				Sleep(1);
			}
			{
				char diag[160];
				snprintf(diag, sizeof(diag), "[SinoGalvoController] Run: board ready after %lums. Starting command chunks.\n", GetTickCount() - preWaitStart);
				DiagLog(diag, "info");
			}
		}

		// [안 A 2026-07-21] 네이티브의 완료-체크포인트 진행률을 진행 상태의 유일한 진실 공급원으로
		// 삼는다. 각 CheckMarkingState() 체크포인트 직후에 물리적으로 완료된 명령 개수(cmdIndex)
		// 기준으로 진행률을 방송한다. cmdIndex는 증가만 하므로 단조 증가하며, 100%는 실제 완료에서만
		// 도달한다. JhcLib는 실시간 진행 피드백 API가 없으므로 이 체크포인트 비율이 유일한 정직한
		// 신호다. 매초 이 값을 덮어쓰던 기존 프론트엔드 타이머 추정(useProcessMonitor)은 SinoGalvo에
		// 대해 제거되었다.
		auto emitProgress = [](size_t done, size_t total) {
			if (total == 0) return;
			double pct = (static_cast<double>(done) * 100.0) / static_cast<double>(total);
			if (pct > 100.0) pct = 100.0;
			if (auto* h = SimpleHandler::GetInstance()) {
				char buf[128];
				snprintf(buf, sizeof(buf), "window.__onScannerProgress && window.__onScannerProgress(%.1f);", pct);
				h->BroadcastJS(buf);
			}
		};

		// [Issue9 P2 2026-07-23] [Design Pattern: Adapter] Curve primitives tessellated to lines.
		// Hardware evidence (Bin\Log\Log_2026-07-23.txt, 18:11 run): a buffer whose geometry is
		// SchOutCircle completes physically but NEVER latches MarkStatus bit0 (GetMarkingState=1,
		// bit0=0 held for 105s until manual Stop), while SchOutLine buffers latch reliably
		// (rect pass: state=0 3.2s -> state=1/bit0=0 4.3s -> bit0=1 at 7.6s = perimeter/speed).
		// bit0 is the only sane completion criterion (feature_Scanner.md 6.11), so all curve
		// primitives (CIRCLE confirmed; ARC/ELLIPSE/EARC preventively - same curve engine family)
		// are emitted as SchOutLine chords instead. Chord tolerance 0.005mm is below the beam
		// width, so marking quality is unaffected. Returns the emitted line count for
		// buffer-limit byte accounting. See docs/plans/ScannerIssue9_Circle_Bit0_and_MarkTimesUI.md.
		auto emitArcAsLines = [this](float cx, float cy, float rx, float ry, float startDeg, float endDeg) -> int {
			const float kPi = 3.14159265358979f;
			const float rMax = (rx > ry) ? rx : ry;
			if (rMax <= 0.0f) return 0;
			const float sweepRad = (endDeg - startDeg) * kPi / 180.0f;
			if (sweepRad <= 0.0f) return 0;
			const float eps = 0.005f;  // chord error tolerance (mm)
			const float stepRad = (eps >= rMax) ? (kPi / 2.0f) : (2.0f * std::acos(1.0f - eps / rMax));
			int segs = static_cast<int>(std::ceil(sweepRad / stepRad));
			if (segs < 8) segs = 8;
			if (segs > 720) segs = 720;
			const float startRad = startDeg * kPi / 180.0f;
			float px = cx + rx * std::cos(startRad);
			float py = cy + ry * std::sin(startRad);
			MovetTo(px, py);
			for (int s = 1; s <= segs; ++s) {
				const float a = startRad + sweepRad * static_cast<float>(s) / static_cast<float>(segs);
				const float nx = cx + rx * std::cos(a);
				const float ny = cy + ry * std::sin(a);
				m_jhcLib->SchOutLine(px, py, nx, ny);
				px = nx; py = ny;
			}
			return segs;
		};

		// [Issue9 P3 2026-07-23] Broadcast the measured repeat pass (and its layer color) so the
		// UI shows "[color chip] MARK TIMES cur/total" from ground truth instead of deriving it
		// from progress ratio x selected-swatch preset (that derivation showed "1/2" while a
		// 3-pass rect group was marking). Color string is validated as #hex before being embedded
		// into the JS snippet (injection guard); invalid input degrades to an empty string.
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

		// [260619 정렬 2026-07-22] 실제 커맨드 실행 전 항상 갈보를 센터(0,0)에서 시작한다.
		// 이 프로젝트에서 검증된 정상 동작 버전(inchen/LW2-3_INC_260619)의 Run()과 동일한 구조로,
		// 각 마킹 사이클을 "센터 이동"으로 정연하게 시작/종료시켜 MarkStatus bit0 전이를 신뢰성 있게
		// 만든다(조기완료/무한대기 방지의 핵심 요소).
		ReturnToCenterPoint();

		// [7차 Mark Times 2026-07-23] [Design Pattern: Interpreter] REPEAT 블록 반복 상태.
		// 프론트는 그룹당 기하를 1패스만 보내고, REPEAT_BEGIN(repeatCount)~REPEAT_END 블록을
		// 여기서 반복 실행한다(중첩 없음, 단일 레벨). 진행률은 물리 총량(블록 × 횟수) 기준으로
		// 단조 증가시키기 위해, 블록을 되감을 때마다 완료 오프셋을 블록 길이만큼 누적한다.
		size_t repeatStartIndex = 0;   // 블록 첫 명령 인덱스(REPEAT_BEGIN 다음)
		int    repeatRemaining = 0;    // 남은 실행 횟수(현재 회차 포함)
		int    repeatTotal = 0;        // 총 반복 횟수(로그/회차 표시용)
		std::string repeatColor;       // [Issue9 P3] current block's layer color (from REPEAT_BEGIN)
		size_t physicalDoneOffset = 0; // 되감기로 소실되는 완료 명령 수 보정 오프셋

		// 물리 진행률 총량: REPEAT 블록 내부 명령은 repeatCount배로 계상한다.
		size_t physicalTotal = m_commands.size();
		{
			size_t rb = 0; int rc = 0;
			for (size_t i = 0; i < m_commands.size(); ++i) {
				if (m_commands[i].type == ScannerCommandType::REPEAT_BEGIN) {
					rb = i; rc = m_commands[i].repeatCount;
				}
				else if (m_commands[i].type == ScannerCommandType::REPEAT_END && rc > 1) {
					physicalTotal += static_cast<size_t>(rc - 1) * (i - rb);
					rc = 0;
				}
			}
		}

		size_t cmdIndex = 0;
		while (cmdIndex < m_commands.size()) {
			if (m_stopFlag) break;

			// [Issue8 2026-07-23] Lazy buffer open. BufStart used to be called eagerly at the
			// top of every chunk, so boundary commands (DELAY/SET_PARAM/Z_MOVE/REPEAT_END) that
			// arrived on a still-empty buffer had to discard it with Cancel(). Once SET_PARAM/
			// DELAY/REPEAT markers made empty chunks common (multi-color groups), those
			// between-job Cancel() calls poisoned the board's completion handshake: the next
			// StartMarking job marked physically but MarkStatus bit0 never latched again, so
			// CheckMarkingState() waited forever (multi-group runs froze after the first group;
			// see docs/plans/ScannerIssue8_MultiGroup_Hang_and_PresetKey.md). The buffer is now
			// opened only right before the first geometry command of the chunk (see the queueing
			// loop below), so an empty chunk never opens - and never cancels - a buffer.
			// Cancel() stays reserved for Stop/timeout recovery only.
			// Byte accumulator for the hardware buffer-limit split: reset per opened buffer,
			// incremented per queued shape.
			int bufferedBytes = 0;

			bool hasDrawn = false;

			try {
				// 3. Queue Commands
				for (; cmdIndex < m_commands.size(); ++cmdIndex) {
					if (m_stopFlag)
					{
						break;
					}

					//// Update Progress periodically while buffering
					//if (cmdIndex % 20 == 0 || cmdIndex == m_commands.size() - 1) {
					//	double currentProgress = (cmdIndex * 100.0) / m_commands.size();
					//	if (auto* h = SimpleHandler::GetInstance()) {
					//		char buf[256];
					//		snprintf(buf, sizeof(buf), "window.__onScannerProgress && window.__onScannerProgress(%.1f);", currentProgress);
					//		h->BroadcastJS(buf);
					//	}
					//}

					const auto& cmd = m_commands[cmdIndex];

					if (cmd.type == ScannerCommandType::Z_MOVE) {
						if (hasDrawn)
						{
							// [260619 정렬 2026-07-22] 각 셀 버퍼를 센터 이동으로 마무리한다.
							// 검증된 정상 버전(inchen/LW2-3_INC_260619)의 핵심: ReturnToCenterPoint()가
							// 버퍼 마지막에 실제 갈보 이동을 넣어 마킹 사이클의 종점을 명확히 하고, 이로써
							// 완료 판정(GetMarkingState()==1 && MarkStatus bit0==1)이 신뢰성 있게 동작한다.
							// 3·4차에서 이 호출을 hasStart/MovetTo로 대체·제거한 것이 완료 판정을 불안정하게
							// 만들어 조기완료(및 이전엔 무한대기)를 유발했다 → 원복.
							ReturnToCenterPoint();

							m_jhcLib->SchLaserOut(m_power, static_cast<int>(m_nType), static_cast<int>(m_nMode));
							try
							{
								m_jhcLib->StartMarking();
								CheckMarkingState();
							}
							catch (...) {}
							hasDrawn = false;
							emitProgress(physicalDoneOffset + cmdIndex, physicalTotal);  // [안 A] Z 이동 직전 체크포인트
						}
						// [Issue8 2026-07-23] Empty buffer: with lazy BufStart nothing was opened, so
						// there is nothing to discard. The old Cancel() here corrupted the next job's
						// done-bit (bit0) tracking - do not reintroduce it.

						if (zMoveCallback && !m_stopFlag) {
							zMoveCallback(cmd.z);
						}

						++cmdIndex;
						break;
					}

					if (cmd.type == ScannerCommandType::DELAY) {
						if (hasDrawn)
						{
							// [Issue8 2026-07-23] End every flushed marking cycle with a real move to
							// center, same as the Z_MOVE and chunk-end flush paths. Per the 260619-
							// verified doctrine (feature_Scanner.md 6.11) the done-bit (bit0) latches
							// reliably when the cycle ends at a real movement endpoint.
							ReturnToCenterPoint();

							m_jhcLib->SchLaserOut(m_power, static_cast<int>(m_nType), static_cast<int>(m_nMode));
							try
							{
								m_jhcLib->StartMarking();
								CheckMarkingState();
							}
							catch (...) {}
							hasDrawn = false;
							emitProgress(physicalDoneOffset + cmdIndex, physicalTotal);  // [안 A] 도형 지연 직전 체크포인트
						}
						// [Issue8 2026-07-23] Empty buffer: nothing opened (lazy BufStart), nothing to
						// discard - the old Cancel() here corrupted the next job's done-bit tracking.

						if (cmd.delayTime > 0.0 && !m_stopFlag) {
							// [NEW] Shape Delay diagnostic log (trace physical delay timing via DebugView)
							char delayLog[128];
							snprintf(delayLog, sizeof(delayLog), "[SinoGalvoController] Run: Shape Delay %.3f sec (cmd %zu/%zu)\n", cmd.delayTime, cmdIndex + 1, m_commands.size());
							DiagLog(delayLog);
							Sleep(static_cast<DWORD>(cmd.delayTime * 1000.0));
						}

						++cmdIndex;
						break;
					}

					/* [색상별 Mark Speed 2026-07-22] 색상(레이어) 그룹 경계의 속도/파워 전환.
					   기존에는 Run 시작 시 scannerControl로 받은 단일 m_markSpeed가 전체 가공에
					   적용되어 색상별 Mark Speed 설정이 무시되었다(Z만 Z_MOVE로 반영되던 비대칭).
					   DELAY와 동일하게 현재 청크를 flush한 뒤 값만 갱신하고 새 청크를 시작한다 —
					   다음 청크의 BufStart 직후 SetDefaultParameters(m_markSpeed, ...)가 새 속도를,
					   SchLaserOut(m_power, ...)가 새 파워를 하드웨어에 반영한다. */
					if (cmd.type == ScannerCommandType::SET_PARAM) {
						if (hasDrawn)
						{
							// [Issue8 2026-07-23] Real-movement endpoint for reliable bit0 latch
							// (same rationale as the DELAY flush above).
							ReturnToCenterPoint();

							m_jhcLib->SchLaserOut(m_power, static_cast<int>(m_nType), static_cast<int>(m_nMode));
							try
							{
								m_jhcLib->StartMarking();
								CheckMarkingState();
							}
							catch (...) {}
							hasDrawn = false;
							emitProgress(physicalDoneOffset + cmdIndex, physicalTotal);
						}
						// [Issue8 2026-07-23] Empty buffer: nothing opened (lazy BufStart), nothing to
						// discard - the old Cancel() here corrupted the next job's done-bit tracking.
						// This exact spot (SET_PARAM right after a finished group) is what froze the
						// multi-color scenarios S1/S2.

						if (cmd.markSpeed > 0.0) {
							m_markSpeed = static_cast<float>(cmd.markSpeed);
						}
						if (cmd.power >= 0.0) {
							m_power = static_cast<float>(cmd.power);
						}
						{
							char paramLog[160];
							snprintf(paramLog, sizeof(paramLog), "[SinoGalvoController] Run: SET_PARAM speed=%.3f power=%.1f (cmd %zu/%zu)\n", m_markSpeed, m_power, cmdIndex + 1, m_commands.size());
							DiagLog(paramLog, "info");
						}

						++cmdIndex;
						break;
					}

					/* [7차 Mark Times 2026-07-23] 반복 블록 시작 마커. 버퍼 flush가 필요 없으므로
					   (직전 그룹 경계 DELAY가 이미 flush) 같은 청크를 유지한 채 상태만 기록한다. */
					if (cmd.type == ScannerCommandType::REPEAT_BEGIN) {
						repeatStartIndex = cmdIndex + 1;
						repeatTotal = (cmd.repeatCount > 1) ? cmd.repeatCount : 1;
						repeatRemaining = repeatTotal;
						// [Issue9 P3] The generator now wraps EVERY color group (repeatCount >= 1)
						// and carries the group's layer color. Announce pass 1 with the color so the
						// UI's MARK TIMES row always reflects the group being marked right now.
						repeatColor = cmd.color;
						emitMarkPass(1, repeatTotal, repeatColor);
						{
							char repLog[128];
							snprintf(repLog, sizeof(repLog), "[SinoGalvoController] Run: REPEAT block begin, pass 1/%d (cmd %zu)\n", repeatTotal, cmdIndex + 1);
							DiagLog(repLog, "info");
						}
						continue;
					}

					/* [7차 Mark Times 2026-07-23] 반복 블록 종료 마커. 현재 회차의 버퍼를 flush해
					   물리 가공을 완료시킨 뒤(6차 Pass 경계 규약: 반복 사이 flush+StartMarking 강제),
					   잔여 횟수가 남았고 Stop이 아니면 블록 시작으로 되감는다. delayTime(Shape Delay)은
					   반복 사이 대기 시간으로 쓰인다. 진행률 오프셋은 되감은 길이만큼 누적해 단조성 유지. */
					if (cmd.type == ScannerCommandType::REPEAT_END) {
						if (hasDrawn) {
							// [Issue8 2026-07-23] Real-movement endpoint for reliable bit0 latch
							// (same rationale as the DELAY flush above). This makes each repeat pass
							// a full 260619-style cycle: geometry -> center -> StartMarking -> bit0.
							ReturnToCenterPoint();

							m_jhcLib->SchLaserOut(m_power, static_cast<int>(m_nType), static_cast<int>(m_nMode));
							try
							{
								m_jhcLib->StartMarking();
								CheckMarkingState();
							}
							catch (...) {}
							hasDrawn = false;
						}
						// [Issue8 2026-07-23] Empty repeat block (no geometry queued): nothing opened
						// (lazy BufStart), nothing to discard - no Cancel() here (done-bit poisoning).
						emitProgress(physicalDoneOffset + cmdIndex, physicalTotal);

						if (repeatRemaining > 1 && !m_stopFlag) {
							--repeatRemaining;
							if (cmd.delayTime > 0.0) {
								Sleep(static_cast<DWORD>(cmd.delayTime * 1000.0));
							}
							// [Issue9 P3] Announce the measured pass number for the UI MARK TIMES row.
							emitMarkPass(repeatTotal - repeatRemaining + 1, repeatTotal, repeatColor);
							{
								char repLog[128];
								snprintf(repLog, sizeof(repLog), "[SinoGalvoController] Run: REPEAT pass %d/%d\n", repeatTotal - repeatRemaining + 1, repeatTotal);
								DiagLog(repLog, "info");
							}
							// [Issue9 P0 2026-07-23] Rewind credit must match physicalTotal accounting.
							// physicalTotal counts (REPEAT_END - REPEAT_BEGIN) commands per extra pass
							// (block interior + the REPEAT_END marker), but this offset used to add only
							// (cmdIndex - repeatStartIndex) = interior. The per-pass shortfall of 1 made
							// progress converge to ~50% for a 1-command block (rect x10 stuck at "6/10"
							// while marking all 10 passes). Include the marker: +1.
							physicalDoneOffset += cmdIndex - repeatStartIndex + 1;
							cmdIndex = repeatStartIndex;
						}
						else {
							repeatRemaining = 0;
							++cmdIndex;
						}
						break;  // 새 청크(BufStart)로 다음 회차/명령 시작
					}

					// [Issue8 2026-07-23] Lazy buffer open: the first geometry command of the chunk
					// opens the hardware buffer and applies the current marking parameters. This is
					// also where a preceding SET_PARAM's new speed takes effect via
					// SetDefaultParameters(m_markSpeed, ...) - same contract as the old eager
					// chunk-entry open (feature_Scanner.md 6.14).
					if (!hasDrawn) {
						m_jhcLib->BufStart();
						SetDefaultParameters(m_markSpeed, m_jumpSpeed);
						bufferedBytes = 0;
					}
					hasDrawn = true;
					float valX = static_cast<float>(cmd.x);
					float valY = static_cast<float>(cmd.y);
					float valStartX = static_cast<float>(cmd.startX);
					float valStartY = static_cast<float>(cmd.startY);

					float valR = static_cast<float>(cmd.r);
					float valW = static_cast<float>(cmd.w);
					float valH = static_cast<float>(cmd.h);
					float valRx = static_cast<float>(cmd.rx);
					float valRy = static_cast<float>(cmd.ry);
					float valAng = static_cast<float>(cmd.angle);
					float valStart = static_cast<float>(cmd.startAngle);
					float valEnd = static_cast<float>(cmd.endAngle);

					float valPointTime = static_cast<float>(cmd.pointTime);

					// [Issue9 P2] Set by the curve cases below when the primitive was emitted as a
					// tessellated SchOutLine chain (buffer byte accounting uses LINE cost x count).
					int tessellatedSegments = 0;

					switch (cmd.type) {
					case ScannerCommandType::JUMP:
						// Implicit jump
						break;

					case ScannerCommandType::POINT:
						if (m_jhcLib->SchOutPoint) {
							MovetTo(valX, valY);
							m_jhcLib->SchOutPoint(valX, valY, valPointTime);
						}
						break;

					case ScannerCommandType::LINE:
						if (m_jhcLib->SchOutLine) {
							MovetTo(valStartX, valStartY);
							m_jhcLib->SchOutLine(valStartX, valStartY, valX, valY);
						}
						break;

					case ScannerCommandType::CIRCLE: {
						// [Issue9 P2] SchOutCircle buffers never latch the completion bit (bit0) on
						// this board - confirmed by the 2026-07-23 18:11 hardware log. Emit the circle
						// as tessellated SchOutLine chords instead (see emitArcAsLines above).
						if (m_jhcLib->SchOutLine) {
							tessellatedSegments = emitArcAsLines(valX, valY, valR, valR, 0.0f, 360.0f);
						}
						break;
					}

					case ScannerCommandType::RECT: {
						if (m_jhcLib->SchOutLine) {
							float halfW = valW / 2.0f;
							float halfH = valH / 2.0f;

							float x1 = valX - halfW;
							float y1 = valY - halfH;
							float x2 = valX + halfW;
							float y2 = valY - halfH;
							float x3 = valX + halfW;
							float y3 = valY + halfH;
							float x4 = valX - halfW;
							float y4 = valY + halfH;

							RotatePointLocal(x1, y1, valX, valY, valAng);
							RotatePointLocal(x2, y2, valX, valY, valAng);
							RotatePointLocal(x3, y3, valX, valY, valAng);
							RotatePointLocal(x4, y4, valX, valY, valAng);

							MovetTo(x2, y2);
							m_jhcLib->SchOutLine(x1, y1, x2, y2);
							m_jhcLib->SchOutLine(x2, y2, x3, y3);
							m_jhcLib->SchOutLine(x3, y3, x4, y4);
							m_jhcLib->SchOutLine(x4, y4, x1, y1);
						}
						break;
					}

					case ScannerCommandType::ARC: {
						// [Issue9 P2] Preventive tessellation (same curve engine family as CIRCLE).
						if (m_jhcLib->SchOutLine) {
							if (std::isnan(valStart) || std::isnan(valEnd) ||
								std::isnan(valX) || std::isnan(valY) || std::isnan(valR)) {
								break;
							}

							valStart = fmod(valStart, 360.0f);
							if (valStart < 0)
								valStart += 360.0f;

							valEnd = fmod(valEnd, 360.0f);
							if (valEnd < 0)
								valEnd += 360.0f;

							if (valEnd <= valStart) {
								valEnd += 360.0f;
							}

							if (std::abs(valStart - valEnd) < 0.001f) {
								break;
							}

							tessellatedSegments = emitArcAsLines(valX, valY, valR, valR, valStart, valEnd);
						}
						break;
					}

					case ScannerCommandType::ELLIPSE: {
						// [Issue9 P2] Preventive tessellation (same curve engine family as CIRCLE).
						if (m_jhcLib->SchOutLine) {
							tessellatedSegments = emitArcAsLines(valX, valY, valRx, valRy, 0.0f, 360.0f);
						}
						break;
					}

					case ScannerCommandType::EARC: {
						// [Issue9 P2] Preventive tessellation (same curve engine family as CIRCLE).
						if (m_jhcLib->SchOutLine) {
							if (std::isnan(valStart) || std::isnan(valEnd) ||
								std::isnan(valRx) || std::isnan(valRy)) {
								break;
							}

							valStart = fmod(valStart, 360.0f);
							if (valStart < 0)
								valStart += 360.0f;

							valEnd = fmod(valEnd, 360.0f);
							if (valEnd < 0)
								valEnd += 360.0f;

							if (valEnd <= valStart)
								valEnd += 360.0f;
							if (std::abs(valStart - valEnd) < 0.001f)
								break;

							tessellatedSegments = emitArcAsLines(valX, valY, valRx, valRy, valStart, valEnd);
						}
						break;
					}
					} // end switch

					// [이슈 G 2026-07-21] 하드웨어 버퍼 한계 분할. 레거시 Is_Accumulated_Buffer_Over()
					// 가드와 동일한 방식이다: 현재 BufStart에 쌓인 바이트가 CSG9210 데이터 버퍼 용량에
					// 근접하면 flush(SchLaserOut + StartMarking + CheckMarkingState로 물리 완료 대기)한 뒤
					// 새 BufStart를 열고 이 청크의 나머지를 계속 버퍼링한다. 여기서는 청크 종료 flush와
					// 달리 ReturnToCenterPoint를 호출하지 않아 연속되는 도형 스트림이 중심 이동 점프로
					// 끊기지 않는다. 마지막 명령일 때는 건너뛴다(아래 청크 종료 flush가 꼬리를 처리).
					// [Issue9 P2] Tessellated curves are billed as their actual LINE payload
					// (slightly conservative: LINE cost includes a MovetTo per chord).
					bufferedBytes += (tessellatedSegments > 0)
						? tessellatedSegments * CommandBufferBytes(ScannerCommandType::LINE)
						: CommandBufferBytes(cmd.type);
					if (!m_stopFlag && bufferedBytes >= SCANNER_DATA_BUFFER_LIMIT && (cmdIndex + 1) < m_commands.size()) {
						char split[176];
						snprintf(split, sizeof(split), "[SinoGalvoController] Run: buffer-limit flush at cmd %zu/%zu (%d bytes >= %d)\n", cmdIndex + 1, m_commands.size(), bufferedBytes, SCANNER_DATA_BUFFER_LIMIT);
						DiagLog(split, "info");

						m_jhcLib->SchLaserOut(m_power, static_cast<int>(m_nType), static_cast<int>(m_nMode));
						try {
							m_jhcLib->StartMarking();
							CheckMarkingState();  // 이 부분 버퍼가 물리적으로 마킹될 때까지 대기
						}
						catch (...) {
							DiagLog("[SinoGalvoController] Exception during buffer-limit flush.\n", "error");
						}
						emitProgress(physicalDoneOffset + cmdIndex + 1, physicalTotal);  // [안 A] 부분 버퍼 체크포인트

						// [Issue8 2026-07-23] Lazy reopen: the next geometry command re-opens the
						// buffer (BufStart + SetDefaultParameters) at the queueing site, same as the
						// chunk entry. No eager BufStart here so a trailing boundary command cannot
						// leave an opened-but-empty buffer behind.
						bufferedBytes = 0;
						hasDrawn = false;  // 다음 도형이 큐잉되기 전까지 새 버퍼는 비어 있음
					}
				} // end for loop
			} // end try
			catch (const std::exception& e) {
				DiagLog(("[SinoGalvoController] Exception in processing queue: " + std::string(e.what()) + "\n").c_str(), "error");
			}
			catch (...) {
				DiagLog("[SinoGalvoController] Unknown Exception in processing queue.\n", "error");
			}

			if (hasDrawn && !m_stopFlag) {
				// center move
				ReturnToCenterPoint();

				// 그리기 시작
				m_jhcLib->SchLaserOut(m_power, static_cast<int>(m_nType), static_cast<int>(m_nMode));

				// [FIX] Removed redundant status notification per chunk to prevent UI flux

				try {
					m_jhcLib->StartMarking();
					CheckMarkingState();
				}
				catch (...) {
					DiagLog("[GalvoController] Exception running StartMarking/CheckMarkingState.\n", "error");
				}
				emitProgress(physicalDoneOffset + cmdIndex, physicalTotal);  // [안 A] 청크 종료 체크포인트
			}

			// Wait till galvo is ready for the next chunk
			// [FIX] This wait can also dead-lock when the board is stuck in busy(0),
			// so recover with Cancel() after a 5-second hard timeout and continue.
			// [POLARITY] Per the SDK manual excerpt transcribed in JhcLib.cpp ScannerUtil::WaitFinish()
			// ([cite: 49]): GetMarkingState() returns 0 = not over (busy), 1 = end of sending data (idle).
			// [DIAG] Temporary instrumentation to root-cause a reported ~3s delay between
			// Mark Times repeats: logs the raw GetMarkingState() value periodically and how
			// long the wait actually took, so real hardware behavior can be inspected via
			// DebugView instead of guessed at.
			if (!m_stopFlag && cmdIndex < m_commands.size()) {
				const DWORD chunkWaitStart = GetTickCount();
				DWORD lastLog = chunkWaitStart;
				int pollCount = 0;
				while (m_jhcLib->GetMarkingState() == 0) {
					// [FIX 2026-07-21] Immediate Stop response: this wait loop had no m_stopFlag
					// check either, so a user Stop could be held off for up to 5s here. Bail out at once.
					if (m_stopFlag) {
						DiagLog("[SinoGalvoController] Run: next-chunk wait aborted by Stop.\n", "info");
						m_jhcLib->Cancel();
						break;
					}
					const DWORD now = GetTickCount();
					if (now - lastLog >= 100) {
						char diag[160];
						snprintf(diag, sizeof(diag), "[SinoGalvoController] Run: next-chunk wait poll #%d, elapsed=%lums, GetMarkingState()=0 (still busy/not-over)\n", ++pollCount, now - chunkWaitStart);
						DiagLog(diag);
						lastLog = now;
					}
					if (now - chunkWaitStart > 5000) {
						char diag[160];
						snprintf(diag, sizeof(diag), "[SinoGalvoController] Run: next-chunk wait TIMEOUT (5s, elapsed=%lums). Forcing Cancel and continuing.\n", now - chunkWaitStart);
						DiagLog(diag, "warn");
						m_jhcLib->Cancel();
						break;
					}
					Sleep(10);
				}
				{
					char diag[160];
					snprintf(diag, sizeof(diag), "[SinoGalvoController] Run: next-chunk ready after %lums.\n", GetTickCount() - chunkWaitStart);
					DiagLog(diag, "info");
				}
			}
		} // end of while(cmdIndex < m_commands.size()) chunks loop

		// 그리기 종료
		// cancle
		// m_jhcLib->Cancel();
		m_stopFlag = false;

		if (auto* h = SimpleHandler::GetInstance()) {
			h->BroadcastJS("window.__onScannerStatus && window.__onScannerStatus('idle');");
		}

		DiagLog("[SinoGalvoController] Marking Finished/Stopped.\n", "info");
	}
}

void SinoGalvoController::ReturnToCenterPoint() {
	m_jhcLib->SchOutPoint(0.0f, 0.0f, 0.0f);
}

// [기능2 2026-07-22] 갈보를 센터(0,0)로 이동시키는 자립 사이클(카메라뷰 "Move to Scanner Center" 버튼용).
// ReturnToCenterPoint()는 SchOutPoint 버퍼링만 하므로 단독으로는 갈보가 움직이지 않는다. 여기서는
// BufStart→SchOutPoint(0,0)→SchLaserOut→StartMarking의 완전한 사이클로 실제 이동을 실행한다.
// 파워 0으로 발사 없이 위치만 이동한다. 완료 대기는 CheckMarkingState(bit0) 대신, 센터 이동은 짧고
// 제로 거리 이동 시 bit0가 갱신되지 않을 수 있으므로 전송 소진(GetMarkingState()==1)까지 짧은 바운드
// 대기만 한다(하드 타임아웃 2초).
void SinoGalvoController::MoveToCenter() {
	if (!Initialize()) return;
	if (!m_jhcLib || !m_jhcLib->BufStart || !m_jhcLib->StartMarking) return;
	// [P1-3 2026-07-22] [Design Pattern: Balking] 가공 중 카메라뷰 센터 버튼이 눌리면 Run 워커의
	// 버퍼에 BufStart/SchOutPoint를 교차 발행해 스트림을 오염시키므로 거부한다.
	if (m_isRunning.load()) {
		DiagLog("[SinoGalvoController] MoveToCenter REJECTED: marking still running.\n", "warn");
		return;
	}

	m_jhcLib->Cancel();
	m_jhcLib->BufStart();
	SetDefaultParameters(m_markSpeed, m_jumpSpeed);
	ReturnToCenterPoint();  // SchOutPoint(0,0,0)
	m_jhcLib->SchLaserOut(0.0f, static_cast<int>(m_nType), static_cast<int>(m_nMode));  // 0 파워 = 발사 없음
	m_jhcLib->StartMarking();

	const DWORD start = GetTickCount();
	while (m_jhcLib->GetMarkingState && m_jhcLib->GetMarkingState() == 0) {
		if (GetTickCount() - start > 2000) break;  // 센터 이동 방어 상한
		Sleep(2);
	}
	DiagLog("[SinoGalvoController] MoveToCenter done.\n", "info");
}

void SinoGalvoController::MovetTo(float X, float Y)
{
	m_jhcLib->SchOutPoint(X, Y, 0.0f);
}

/**
 * @brief 물리 마킹이 끝날 때까지 대기한다.
 * @details [Design Pattern: Guarded Wait]
 *          [260619 정렬 2026-07-22 — 검증된 정상 버전 복원]
 *          완료 조건 = GetMarkingState()==1 (전송/큐 소진) AND (MarkStatus & 0x01)==1.
 *          이는 이 프로젝트에서 조기완료가 없던 검증 버전 inchen/LW2-3_INC_260619의
 *          CheckMarkingState()와 동일하다.
 *
 *          경위: 3·4차(ScannerIssue3.md)에서 bit0 의미를 "0:Idle,1:Marking"으로 보고 완료를
 *          bit0==0으로 바꿨으나, 이는 Z_MOVE 핸들러의 ReturnToCenterPoint()를 함께 제거한 상태에서의
 *          관측에 기반한 오판이었다. 260619는 각 셀 버퍼를 ReturnToCenterPoint()(SchOutPoint(0,0))로
 *          마무리해 갈보가 항상 실제 이동으로 사이클을 끝내고, 그 종점에서 bit0==1이 신뢰성 있게
 *          세워진다. ReturnToCenterPoint를 복원하면 bit0==1 완료 판정이 정상 동작하며 조기완료가
 *          사라진다(이번 5차에서 Z_MOVE·루프시작 ReturnToCenterPoint 복원과 함께 적용).
 *
 *          Stop은 1ms 폴링으로 즉시 반응한다. HARD_TIMEOUT은 260619에는 없던 보드 고착 방어용
 *          안전망(10분)일 뿐 정상 동작에는 관여하지 않는다.
 */
void SinoGalvoController::CheckMarkingState() {
	// 보드 고착 방어용 상한(10분). 정상 탈출은 완료 판정(bit0==1) 또는 Stop. 260619에는 없던
	// 순수 안전망으로, 저속 대형 마킹의 긴 꼬리를 오탈출시키지 않도록 넉넉히 둔다.
	const DWORD HARD_TIMEOUT_MS = 600000;

	const DWORD checkStart = GetTickCount();
	DWORD lastLog = checkStart;
	int pollCount = 0;

	bool flag = true;
	JHCStatusdef status;
	while (flag) {
		Sleep(1);

		if (m_stopFlag) {
			// [P1-1 2026-07-22] 여기서 m_stopFlag를 소거하면 안 된다(6차 이슈 S1 원인).
			// 이 함수는 버퍼 분할/청크 flush마다 호출되므로, 여기서 소거하면 복귀 직후
			// Run() 루프의 모든 Stop 게이트가 이미 false가 된 플래그를 보고 통과해
			// 나머지 청크를 끝까지 가공했다. 소거는 Run() 말단 한 곳에서만 한다.
			m_jhcLib->Cancel();
			flag = false;
			break;
		}

		int nMarkState = m_jhcLib->GetMarkingState();
		++pollCount;
		int nBit0 = -1;  // -1: 미조회(전송 중)
		// [Issue9 P1 2026-07-23] Diagnostic: capture the FULL MarkStatus byte and the board's
		// MarkTimes counter, not just bit0. Curve-primitive buffers (SchOutCircle) were observed
		// to never latch bit0 (105s state=1/bit0=0 on 2026-07-23 18:11) - these fields may reveal
		// an alternative completion signal and serve as vendor-inquiry evidence.
		int nMarkStatusFull = -1;
		int nBoardMarkTimes = -1;
		if (nMarkState == 1) {          // 전송/큐 소진 완료
			m_jhcLib->GetSystemState(status, FALSE);
			nBit0 = (status.MarkStatus & 0x01);
			nMarkStatusFull = static_cast<int>(status.MarkStatus);
			nBoardMarkTimes = status.MarkTimes;
			if (nBit0 == 0x01) {        // 260619 기준: bit0 set = 완료
				// [P1-1 2026-07-22] 완료 경로에서도 m_stopFlag를 건드리지 않는다 — 소거 지점이
				// 분산되면 Stop 요청이 소실된다. 소거는 Run() 말단 한 곳뿐이다.
				flag = false;
			}
		}

		{
			const DWORD now = GetTickCount();
			if (now - lastLog >= 200) {
				char diag[224];
				snprintf(diag, sizeof(diag), "[SinoGalvoController] CheckMarkingState: poll #%d, elapsed=%lums, GetMarkingState()=%d, MarkStatusBit0=%d, MarkStatus=0x%02X, BoardMarkTimes=%d\n", pollCount, now - checkStart, nMarkState, nBit0, (nMarkStatusFull < 0 ? 0xFF : nMarkStatusFull), nBoardMarkTimes);
				DiagLog(diag);
				lastLog = now;
			}
		}

		if (GetTickCount() - checkStart > HARD_TIMEOUT_MS) {
			DiagLog("[SinoGalvoController] CheckMarkingState: HARD TIMEOUT (10min), forcing exit.\n", "warn");
			flag = false;
		}
	}
	{
		char diag[160];
		snprintf(diag, sizeof(diag), "[SinoGalvoController] CheckMarkingState: done after %lums (%d polls).\n", GetTickCount() - checkStart, pollCount);
		DiagLog(diag, "info");
	}
}

void SinoGalvoController::Stop() {
	if (!m_stopFlag) {
		m_stopFlag = true;
		DiagLog("[SinoGalvoController] Stop called.\n", "info");
		// [P1-2 2026-07-22] Cancel만 수행한다. 기존의 ReturnToCenterPoint() 호출은
		// CEF 라우터 스레드에서 Run 워커가 열어 둔 보드 버퍼에 SchOutPoint(0,0)을
		// 비동기 주입해 버퍼 스트림을 오염시켰다(스레드 안전성 없음 + (0,0) 잡선 소지).
		// 센터 복귀는 Run()의 정상 사이클(ReturnToCenterPoint 종점)이 책임진다.
		m_jhcLib->Cancel();
	}
}

bool SinoGalvoController::LoadConfig() {
	char exePath[MAX_PATH];
	GetModuleFileNameA(NULL, exePath, MAX_PATH);
	std::string path(exePath);
	size_t lastBackslash = path.find_last_of("\\/");
	std::string configPath = path.substr(0, lastBackslash) + "\\Config\\GalvoConfig.json";

	std::ifstream ifs(configPath);
	if (!ifs.is_open()) return false;

	std::string content((std::istreambuf_iterator<char>(ifs)), (std::istreambuf_iterator<char>()));
	ifs.close();

	auto val = CefParseJSON(content, JSON_PARSER_RFC);
	if (val.get() && val->GetType() == VTYPE_DICTIONARY) {
		auto dict = val->GetDictionary();
		if (dict->HasKey("hRatio")) m_HRatio = dict->GetDouble("hRatio");
		if (dict->HasKey("vRatio")) m_VRatio = dict->GetDouble("vRatio");
		if (dict->HasKey("barrelDistortionX")) m_barrelDistortionX = dict->GetDouble("barrelDistortionX");
		if (dict->HasKey("barrelDistortionY")) m_barrelDistortionY = dict->GetDouble("barrelDistortionY");
		if (dict->HasKey("trapezoidalDistortionX")) m_trapezoidalDistortionX = dict->GetDouble("trapezoidalDistortionX");
		if (dict->HasKey("trapezoidalDistortionY")) m_trapezoidalDistortionY = dict->GetDouble("trapezoidalDistortionY");
		if (dict->HasKey("parallelogramDistortionX")) m_parallelogramDistortionX = dict->GetDouble("parallelogramDistortionX");
		if (dict->HasKey("parallelogramDistortionY")) m_parallelogramDistortionY = dict->GetDouble("parallelogramDistortionY");

		if (dict->HasKey("workSize")) m_workSize = dict->GetDouble("workSize");

		if (dict->HasKey("bXYExchange")) m_bXYExchange = dict->GetBool("bXYExchange");
		if (dict->HasKey("bXAxisN")) m_bXAxisN = dict->GetBool("bXAxisN");
		if (dict->HasKey("bYAxisN")) m_bYAxisN = dict->GetBool("bYAxisN");

		return true;
	}
	return false;
}

bool SinoGalvoController::SaveConfig() {
	char exePath[MAX_PATH];
	GetModuleFileNameA(NULL, exePath, MAX_PATH);
	std::string path(exePath);
	size_t lastBackslash = path.find_last_of("\\/");
	std::string configPath = path.substr(0, lastBackslash) + "\\Config\\GalvoConfig.json";

	auto dict = CefDictionaryValue::Create();
	dict->SetDouble("hRatio", m_HRatio);
	dict->SetDouble("vRatio", m_VRatio);
	dict->SetDouble("barrelDistortionX", m_barrelDistortionX);
	dict->SetDouble("barrelDistortionY", m_barrelDistortionY);
	dict->SetDouble("trapezoidalDistortionX", m_trapezoidalDistortionX);
	dict->SetDouble("trapezoidalDistortionY", m_trapezoidalDistortionY);
	dict->SetDouble("parallelogramDistortionX", m_parallelogramDistortionX);
	dict->SetDouble("parallelogramDistortionY", m_parallelogramDistortionY);

	dict->SetDouble("workSize", m_workSize);

	dict->SetBool("bXYExchange", m_bXYExchange);
	dict->SetBool("bXAxisN", m_bXAxisN);
	dict->SetBool("bYAxisN", m_bYAxisN);

	auto v = CefValue::Create();
	v->SetDictionary(dict);
	std::string json = CefWriteJSON(v, JSON_WRITER_PRETTY_PRINT).ToString();

	std::ofstream ofs(configPath);
	if (ofs.is_open()) {
		ofs << json;
		return true;
	}
	return false;
}
