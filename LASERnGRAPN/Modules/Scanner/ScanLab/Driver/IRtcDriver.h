#pragma once

#include <windows.h>
#include <string>

/**
 * @interface IRtcDriver
 * @brief Common interface for Scanlab RTC4, RTC5, and RTC6 card drivers.
 */
class IRtcDriver {
public:
	virtual ~IRtcDriver() = default;

	/** @brief Load vendor DLL and bind function pointers */
	virtual bool InitDll(const std::wstring& dllPath) = 0;
	virtual bool FreeDll() = 0;

	/** @brief Open connection to specific card number */
	virtual bool OpenCard(unsigned int cardNo) = 0;
	virtual void CloseCard() = 0;
	virtual bool IsCardOpen() const = 0;

	/** @brief Load board DSP system code/firmware (.APB / .HEX) */
	virtual bool LoadProgramFile(const std::string& path) = 0;

	/** @brief Load correction file (.ct5, .ct4, etc.) */
	virtual bool LoadCorrectionFile(const std::string& path, unsigned int tableNo, unsigned int dimension) = 0;
	virtual void SelectCorTable(unsigned int headA, unsigned int headB) = 0;

	// Laser Parameter Configuration
	virtual void SetLaserMode(unsigned int mode) = 0;
	virtual void SetLaserControl(unsigned int control) = 0;
	virtual void EnableLaser() = 0;
	virtual void DisableLaser() = 0;
	virtual double GetHeadPara(unsigned int headNo, unsigned int paraNo) = 0;
	virtual void ResetError(unsigned int code) = 0;
	virtual unsigned int GetHeadStatus(unsigned int headNo) = 0;
	virtual unsigned int GetInitStatus() = 0;
	virtual void ConfigList(unsigned int mem1, unsigned int mem2) = 0;
	virtual void SetStandby(unsigned int halfPeriod, unsigned int pulseLength) = 0;
	virtual void SetLaserPulsesCtrl(unsigned int halfPeriod, unsigned int pulseLength) = 0;
	virtual void SetLaserDelays(long onDelay, unsigned int offDelay) = 0;
	virtual void SetScannerDelays(unsigned int jump, unsigned int mark, unsigned int polygon) = 0;
	virtual void SetDelayMode(unsigned int varPoly, unsigned int directMove3D, unsigned int edgeLevel, unsigned int minJumpDelay, unsigned int jumpLengthLimit) = 0;
	virtual void SetSpeed(double markSpeed, double jumpSpeed) = 0;

	// List Buffer Commands
	virtual void SetStartList(unsigned int listNo) = 0;
	virtual void SetEndOfList() = 0;
	virtual void ExecuteList(unsigned int listNo) = 0;
	virtual void GetStatus(unsigned int& status, unsigned int& pos) = 0;
	virtual unsigned int ReadStatus() = 0;
	virtual void StopExecution() = 0;

	// Drawing commands (Buffered)
	virtual void JumpAbs(long x, long y) = 0;
	virtual void GotoXY(long x, long y) = 0;
	virtual void MarkAbs(long x, long y) = 0;
	virtual void ArcAbs(long xc, long yc, double angle) = 0;
	virtual void LongDelay(long delay) = 0;
	virtual void LaserOnList(long delay) = 0;
	virtual void LaserOffList() = 0;

	// Hardware Diagnostics
	virtual unsigned int GetDllVersion() = 0;
	virtual unsigned int GetHexVersion() = 0;
	virtual unsigned int GetRtcVersionNumber() = 0;
	virtual unsigned int GetSerialNumber() = 0;
};
