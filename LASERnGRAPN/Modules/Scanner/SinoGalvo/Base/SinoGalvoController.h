#pragma once
#include "pch.h" // [NEW] Added for Native C++ global rule

#include "../JhcLib.h"
#include "../../IScannerController.h"
#include <memory>
#include <string>
#include <vector>
#include <atomic>
#include <mutex>
#include <functional>

// Forward declaration for CEF types
namespace CefWrapper {
	class DictionaryValue;
}

/**
 * @class SinoGalvoController
 * @brief Controller for SinoGalvo Scanner using JhcLib
 * @details Implements IScannerController interface.
 */
class SinoGalvoController : public IScannerController {
public:
	static SinoGalvoController& Instance();

	// IScannerController interface implementations
	bool Initialize() override;
	void LoadCommands(const std::vector<ScannerCommand>& commands) override;
	bool LoadConfig() override;
	bool SaveConfig() override;
	void SetMarkSpeed(float speed) override;
	void Run(const std::string& profile = "scanner", std::function<void(double)> zMoveCallback = nullptr) override;
	void Stop() override;
	/** @brief [P1-3 2026-07-22] Run() 실행 중 여부(재진입/커맨드 교체 거부 판단용). */
	bool IsRunning() const override { return m_isRunning.load(); }
	// [기능2 2026-07-22] 갈보 미러를 센터(0,0)로 이동(0 파워, 발사 없음). 카메라뷰 버튼용 자립 사이클.
	void MoveToCenter() override;

	bool IsOpen() override;
	bool OpenDevice() override;
	void CloseDevice() override;
	void Cancel() override;

	// Common properties and getters
	float GetMarkSpeed() const override { return m_markSpeed; }
	float GetJumpSpeed() const override { return m_jumpSpeed; }
	void SetJumpSpeed(float speed) override { m_jumpSpeed = speed; }
	double GetWorkSize() const override { return m_workSize; }
	void SetWorkSize(double size) override { m_workSize = size; }

	bool GetXYExchange() const override { return m_bXYExchange; }
	void SetXYExchange(bool val) override { m_bXYExchange = val; }
	bool GetXAxisN() const override { return m_bXAxisN; }
	void SetXAxisN(bool val) override { m_bXAxisN = val; }
	bool GetYAxisN() const override { return m_bYAxisN; }
	void SetYAxisN(bool val) override { m_bYAxisN = val; }

	double GetHRatio() const override { return m_HRatio; }
	void SetHRatio(double val) override { m_HRatio = val; }
	double GetVRatio() const override { return m_VRatio; }
	void SetVRatio(double val) override { m_VRatio = val; }

	double GetBarrelDistortionX() const override { return m_barrelDistortionX; }
	void SetBarrelDistortionX(double val) override { m_barrelDistortionX = val; }
	double GetBarrelDistortionY() const override { return m_barrelDistortionY; }
	void SetBarrelDistortionY(double val) override { m_barrelDistortionY = val; }

	double GetTrapezoidalDistortionX() const override { return m_trapezoidalDistortionX; }
	void SetTrapezoidalDistortionX(double val) override { m_trapezoidalDistortionX = val; }
	double GetTrapezoidalDistortionY() const override { return m_trapezoidalDistortionY; }
	void SetTrapezoidalDistortionY(double val) override { m_trapezoidalDistortionY = val; }

	double GetParallelogramDistortionX() const override { return m_parallelogramDistortionX; }
	void SetParallelogramDistortionX(double val) override { m_parallelogramDistortionX = val; }
	double GetParallelogramDistortionY() const override { return m_parallelogramDistortionY; }
	void SetParallelogramDistortionY(double val) override { m_parallelogramDistortionY = val; }

public:
	SinoGalvoController();
	~SinoGalvoController() override;

private:
	// Prevent copying
	SinoGalvoController(const SinoGalvoController&) = delete;
	SinoGalvoController& operator=(const SinoGalvoController&) = delete;

private:
	std::vector<ScannerCommand> m_commands;
	std::unique_ptr<JhcLib> m_jhcLib;
	bool m_isInitialized = false;
	std::atomic<bool> m_stopFlag;
	/** @brief [P1-3 2026-07-22] Run() 재진입 가드. Stop 미동작 상태에서 Process Start 재클릭 시
	 *         두 Run 스레드가 같은 보드에 교차 큐잉하며 LoadCommands가 순회 중인 m_commands를
	 *         교체해 옛/새 커맨드가 뒤섞여 마킹되는 사고(6차 이슈 S3)를 막는다.
	 *         [Design Pattern: Balking] — 실행 중이면 새 Run/LoadCommands 요청을 즉시 거부한다. */
	std::atomic<bool> m_isRunning{ false };

public:
	void SetDefaultCorrectionSet();
	void SetDefaultParameters(float MarkingSpeed, float JumpSpeed);

	// Parameters (Default values, can be updated via UI later)
	float m_markSpeed = 500.0f;
	float m_jumpSpeed = 4000.0f;// 4000.0f;// 100.0f;// 250.0f; // ���� ���� �̵� �� �ӵ�
	float m_power = 10;
	float m_nType = 2;
	float m_nMode = 2;

	// Calibration Data from JSON
	float m_calibScaleX = 1.0f;
	float m_calibScaleY = 1.0f;
	float m_calibRotation = 0.0f;

	/** @brief Basic Correction Parameters */
	double m_HRatio = 0.0;
	double m_VRatio = 0.0;
	double m_barrelDistortionX = 0.0;
	double m_barrelDistortionY = 0.0;
	double m_trapezoidalDistortionX = 0.0;
	double m_trapezoidalDistortionY = 0.0;
	double m_parallelogramDistortionX = 0.0;
	double m_parallelogramDistortionY = 0.0;

	/** @brief Correct Size (WorkSize) */
	double m_workSize = 110.0;

	/** @brief Axis Settings */
	bool m_bXYExchange = true;
	bool m_bXAxisN = true;
	bool m_bYAxisN = true;

	void CheckMarkingState();
	void ReturnToCenterPoint();
	void MovetTo(float X, float Y);
};
