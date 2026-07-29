#pragma once

#include <windows.h>
#include <vector>
#include <string>
#include <functional>

/**
 * @brief Scanner Command Type
 */
enum class ScannerCommandType {
	JUMP = 0,
	POINT = 1,
	LINE = 2,
	CIRCLE = 3,
	RECT = 4,
	ARC = 5,
	ELLIPSE = 6,
	EARC = 7,
	Z_MOVE = 8,
	DELAY = 9,
	/* [색상별 Mark Speed 2026-07-22] 색상(레이어) 그룹 경계에서 Mark Speed/Power를 전환.
	   드라이버는 이 명령에서 현재 청크를 flush한 뒤 내부 속도/파워를 갱신한다(Z_MOVE와 대칭). */
	SET_PARAM = 10,
	/* [7차 Mark Times 2026-07-23] 반복 블록 마커. 프론트는 그룹당 기하를 1패스만 전송하고
	   드라이버(Run)가 REPEAT_BEGIN(repeatCount)~REPEAT_END 사이를 반복 실행한다. 기존의
	   "명령 전체를 markTimes번 복제" 방식은 Mark Times 100에서 458만 명령/500MB JSON을
	   만들어 IPC가 실패했다(계획서 ScannerIssue7_MarkTimes100.md). */
	REPEAT_BEGIN = 11,
	REPEAT_END = 12,
};

/**
 * @brief Scanner Command Structure
 */
struct ScannerCommand {
	ScannerCommandType type;
	double x = 0.0;
	double y = 0.0;
	double z = 0.0; /* Z-Axis Offset */
	double r = 0.0; /* Radius or Width */
	double w = 0.0;     /* Width */
	double h = 0.0;     /* Height */
	double angle = 0.0; /* Rotation */
	double rx = 0.0;    /* Radius X (Ellipse) */
	double ry = 0.0;    /* Radius Y (Ellipse) */
	double startAngle = 0.0;
	double endAngle = 0.0;
	double startX = 0.0;
	double startY = 0.0;
	double pointTime = 0.0; /* Default to 0.0 */
	double delayTime = 0.0; /* Shape Delay in seconds */
	/* [이슈 3-③ 2026-07-21] startX/startY가 프론트엔드에서 명시적으로 채워졌는지 여부.
	   Z_MOVE는 이 플래그가 true일 때만 파킹 좌표로 MovetTo를 수행한다 — 값이 없는 Z_MOVE에서
	   기본값(0,0)으로 MovetTo 하면 셀 경계마다 갈보가 센터로 점프하는 오동작이 있었다. */
	bool hasStart = false;
	/* [색상별 Mark Speed 2026-07-22] SET_PARAM 전용. 0 이하면 해당 항목 미변경. */
	double markSpeed = 0.0; /* Mark speed (mm/s) to apply from the next chunk */
	double power = -1.0;    /* Laser power (%) to apply from the next chunk (<0 = keep) */
	/* [7차 Mark Times 2026-07-23] REPEAT_BEGIN 전용: 블록 총 실행 횟수(≥2). */
	int repeatCount = 0;
	/* [Issue9 P3 2026-07-23] REPEAT_BEGIN only: layer color hex ("#RRGGBB") of this group.
	   Broadcast together with the measured repeat pass so the UI MARK TIMES row shows which
	   layer is being marked. Empty when unknown (legacy path). */
	std::string color;
};

/**
 * @brief Laser marking parameter structure
 */
struct PARAMETER
{
	float MarkSpeed;         /* Mark speed */
	float WorkSize;          /* Work field size */
	float RedSpeed;          /* Guide light speed */
	float JumpSpeed;         /* Jump speed */
	float JumpLocationDelay; /* Jump position delay */
	float JumpDistanceDelay; /* Jump distance delay */
	float OpenDelay;         /* Laser on delay */
	float CloseDelay;        /* Laser off delay */
	float FoldDelay;         /* Poly/Corner delay */
	float FinishDelay;       /* End delay */
};

/**
 * @brief Galvo scanner hardware parameter structure
 */
struct GALVOPARAM
{
	BOOL bXYExchange; /* Swap X/Y */
	BOOL bXAxisN;     /* Mirror X */
	BOOL bYAxisN;     /* Mirror Y */
};

/**
 * @brief Board and system status structure
 */
struct JHCStatusdef
{
	BYTE InStatus;       /* IO Input status */
	BYTE InStatus2;      /* IO Input status 2 */
	BYTE OutStatus;      /* IO Output status */
	int freeSpace;       /* Buffer free space */
	USHORT MotorStatus;  /* Motor axis status */
	BYTE MarkStatus;     /* Marking status (0: Idle, 1: Marking) */
	BYTE LaserStatus;    /* Laser status */
	BYTE FootStatus;     /* Foot switch status */
	int BeltSpeed;       /* Belt speed (Flying marking) */
	int MarkTimes;       /* Marking count */
};

/**
 * @interface IScannerController
 * @brief Interface to abstract different galvo controllers (SinoGalvo, Scanlab)
 */
class IScannerController {
public:
	virtual ~IScannerController() = default;

	virtual unsigned int GetHeadStatus() const { return 0; }
	virtual unsigned int GetInitStatus() const { return 0; }

	/** @brief Initialize the hardware driver */
	virtual bool Initialize() = 0;

	/** @brief Load drawing commands */
	virtual void LoadCommands(const std::vector<ScannerCommand>& commands) = 0;

	/** @brief Run the loaded command queue */
	virtual void Run(const std::string& profile = "scanner", std::function<void(double)> zMoveCallback = nullptr) = 0;

	/** @brief Stop the current marking operation */
	virtual void Stop() = 0;

	/** @brief [P1-3 2026-07-22] Run()이 현재 실행 중인지 여부. 라우터가 가공 중 재시작/커맨드
	 *         교체를 거부(Balking)하는 데 사용한다. 기본 구현은 실행 상태를 추적하지 않는
	 *         컨트롤러(Scanlab 등)를 위해 false를 반환한다. */
	virtual bool IsRunning() const { return false; }

	/** @brief 갈보 미러를 센터(0,0)로 이동한다(스캐너 전용, 기본 no-op). [기능2 2026-07-22] */
	virtual void MoveToCenter() {}

	/** @brief Check if initialized and open */
	virtual bool IsOpen() = 0;

	/** @brief Open connection to hardware */
	virtual bool OpenDevice() = 0;

	/** @brief Close connection to hardware */
	virtual void CloseDevice() = 0;

	/** @brief Cancel marking */
	virtual void Cancel() = 0;

	/** @brief Load configuration parameters from JSON */
	virtual bool LoadConfig() = 0;

	/** @brief Save configuration parameters to JSON */
	virtual bool SaveConfig() = 0;

	// Common properties and getters
	virtual float GetMarkSpeed() const = 0;
	virtual void SetMarkSpeed(float speed) = 0;

	virtual float GetJumpSpeed() const = 0;
	virtual void SetJumpSpeed(float speed) = 0;

	virtual double GetWorkSize() const = 0;
	virtual void SetWorkSize(double size) = 0;

	virtual bool GetXYExchange() const = 0;
	virtual void SetXYExchange(bool val) = 0;

	virtual bool GetXAxisN() const = 0;
	virtual void SetXAxisN(bool val) = 0;

	virtual bool GetYAxisN() const = 0;
	virtual void SetYAxisN(bool val) = 0;

	// Correction factor configurations
	virtual double GetHRatio() const = 0;
	virtual void SetHRatio(double val) = 0;

	virtual double GetVRatio() const = 0;
	virtual void SetVRatio(double val) = 0;

	virtual double GetBarrelDistortionX() const = 0;
	virtual void SetBarrelDistortionX(double val) = 0;

	virtual double GetBarrelDistortionY() const = 0;
	virtual void SetBarrelDistortionY(double val) = 0;

	virtual double GetTrapezoidalDistortionX() const = 0;
	virtual void SetTrapezoidalDistortionX(double val) = 0;

	virtual double GetTrapezoidalDistortionY() const = 0;
	virtual void SetTrapezoidalDistortionY(double val) = 0;

	virtual double GetParallelogramDistortionX() const = 0;
	virtual void SetParallelogramDistortionX(double val) = 0;

	virtual double GetParallelogramDistortionY() const = 0;
	virtual void SetParallelogramDistortionY(double val) = 0;
};
