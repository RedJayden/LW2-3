#pragma once

#include "../../IScannerController.h"
#include "../Driver/IRtcDriver.h"
#include <memory>
#include <string>
#include <vector>
#include <atomic>
#include <functional>

/**
 * @class ScanlabController
 * @brief Scanner Controller implementing IScannerController for Scanlab hardware.
 */
class ScanlabController : public IScannerController {
public:
	static ScanlabController& Instance();

	bool Initialize() override;
	void LoadCommands(const std::vector<ScannerCommand>& commands) override;
	void Run(const std::string& profile = "scanner", std::function<void(double)> zMoveCallback = nullptr) override;
	void Stop() override;

	bool IsOpen() override;
	bool OpenDevice() override;
	void CloseDevice() override;
	void Cancel() override;
	unsigned int GetHeadStatus() const override;
	unsigned int GetInitStatus() const override;

	bool LoadConfig() override;
	bool SaveConfig() override;

	// Common properties and getters
	float GetMarkSpeed() const override { return m_markSpeed; }
	void SetMarkSpeed(float speed) override { m_markSpeed = speed; }
	float GetJumpSpeed() const override { return m_jumpSpeed; }
	void SetJumpSpeed(float speed) override { m_jumpSpeed = speed; }
	double GetWorkSize() const override { return 110.0; } // Legacy override
	void SetWorkSize(double size) override {} // Legacy override

	bool GetXYExchange() const override { return m_bXYExchange; }
	void SetXYExchange(bool val) override { m_bXYExchange = val; }
	bool GetXAxisN() const override { return m_bXAxisN; }
	void SetXAxisN(bool val) override { m_bXAxisN = val; }
	bool GetYAxisN() const override { return m_bYAxisN; }
	void SetYAxisN(bool val) override { m_bYAxisN = val; }

	int GetRtcVersion() const { return m_rtcVersion; }
	void SetRtcVersion(int val) { m_rtcVersion = val; }
	int GetCardNo() const { return m_cardNo; }
	void SetCardNo(int val) { m_cardNo = val; }
	std::string GetProgramFile() const { return m_programFile; }
	void SetProgramFile(const std::string& val) { m_programFile = val; }
	std::string GetCorrectionFile() const { return m_correctionFile; }
	void SetCorrectionFile(const std::string& val) { m_correctionFile = val; }
	double GetActiveKFactor() const {
		return m_dCalibrationFactorK > 0.0 ? m_dCalibrationFactorK : 1.0;
	}
	unsigned int GetLaserMode() const { return m_laserMode; }
	void SetLaserMode(unsigned int val) { m_laserMode = val; }
	unsigned int GetLaserControl() const { return m_laserControl; }
	void SetLaserControl(unsigned int val) { m_laserControl = val; }

	// Hardware Diagnostics Getters
	unsigned int GetDllVersion() const;
	unsigned int GetHexVersion() const;
	unsigned int GetRtcVersionNumber() const;
	unsigned int GetSerialNumber() const;

	std::string GetWavelength() const { return m_wavelength; }
	void SetWavelength(const std::string& val) { m_wavelength = val; }

	// Implemented scale overrides for Scanlab, dummy for distortions
	double GetHRatio() const override { return m_hRatio; }
	void SetHRatio(double val) override { m_hRatio = val; }
	double GetVRatio() const override { return m_vRatio; }
	void SetVRatio(double val) override { m_vRatio = val; }
	double GetBarrelDistortionX() const override { return 0.0; }
	void SetBarrelDistortionX(double) override {}
	double GetBarrelDistortionY() const override { return 0.0; }
	void SetBarrelDistortionY(double) override {}
	double GetTrapezoidalDistortionX() const override { return 0.0; }
	void SetTrapezoidalDistortionX(double) override {}
	double GetTrapezoidalDistortionY() const override { return 0.0; }
	void SetTrapezoidalDistortionY(double) override {}
	double GetParallelogramDistortionX() const override { return 0.0; }
	void SetParallelogramDistortionX(double) override {}
	double GetParallelogramDistortionY() const override { return 0.0; }
	void SetParallelogramDistortionY(double) override {}

public:
	ScanlabController();
	~ScanlabController() override;

private:
	ScanlabController(const ScanlabController&) = delete;
	ScanlabController& operator=(const ScanlabController&) = delete;

	long MmToBits(double mm, bool isX) const;
	double ConvertSpeedToBitsPerMs(double speedMmPerSec) const;
	void ApplyActiveParameters();

private:
	std::vector<ScannerCommand> m_commands;
	std::unique_ptr<IRtcDriver> m_rtcDriver;
	bool m_isInitialized = false;
	std::atomic<bool> m_stopFlag;

	// Configuration Parameters (Scanlab specific/generic)
	int m_rtcVersion = 6;
	int m_cardNo = 1;
	std::string m_wavelength = "IR_1064";
	std::string m_programFile = "RTC6OUT.out";
	std::string m_correctionFile = "Config\\D2_1753.ct5";
	double m_hRatio = 1.0;
	double m_vRatio = 1.0;

	float m_markSpeed = 1000.0f; // mm/sec
	float m_jumpSpeed = 3000.0f; // mm/sec
	double m_dCalibrationFactorK = 0.0; // Calibration factor bits/mm from card

	unsigned int m_laserMode = 1;      // e.g. YAG
	unsigned int m_laserControl = 2;   // active high, etc.
	
	// Axis orientation
	bool m_bXYExchange = false;
	bool m_bXAxisN = false;
	bool m_bYAxisN = false;
};
