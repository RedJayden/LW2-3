// ***********************************************************************
// Module           : SCLLibHelper for C++
// Author           : Lei Youbing
// Created          : 09-07-2016
//
// Last Modified By : Lei Youbing
// Last Modified On : 2021-06-20
// ***********************************************************************
//     Copyright (c) Shanghai AMP & MOONS' Automation Co., Ltd.. All rights reserved.
// ***********************************************************************

// SCLLibHelper.h: interface for the SCLLibHelper class.
//
//////////////////////////////////////////////////////////////////////

#if !defined(AFX_SCLLibHelper_H__2BEB97F7_CDEA_4F40_8457_8D307E32DC1C__INCLUDED_)
#define AFX_SCLLibHelper_H__2BEB97F7_CDEA_4F40_8457_8D307E32DC1C__INCLUDED_

#if _MSC_VER > 1000
#pragma once
#endif // _MSC_VER > 1000

#define MAX_BYTES_COUNT 1024

typedef struct _COMMAND_INFO
{
	int Count;
	BYTE Values[MAX_BYTES_COUNT];
} COMMAND_INFO, *PCOMMAND_INFO;

typedef struct _ERROR_INFO
{
	int ErrorCode;
	char* Command;
	char* ErrorMessage;
} ERROR_INFO, *PERROR_INFO;

typedef   void   (CALLBACK   *EventCallback)();

typedef void (__stdcall *lpOnDataSend)(EventCallback func);
typedef void (__stdcall *lpOnDataReceive)(EventCallback func);

// Open Serial Port
typedef BOOL (__stdcall *lpOpen)(BYTE nCOMPort, int nBaudRate);

// Close
typedef BOOL (__stdcall *lpClose)(BYTE nCOMPort);

// Close
typedef BOOL (__stdcall *lpSetCommParam)(BYTE nCOMPort, BYTE nNodeID, BOOL bSave);

// return port is open or not
typedef BOOL (__stdcall *lpIsOpen)(BYTE nCOMPort);

// Free memory
typedef BOOL (__stdcall *lpFreeNewMemory)(void* pBuffer);

// Set when send data, trigger Send event or not
typedef void (__stdcall *lpSetTriggerSendEvent)(BOOL bTriggerSendEvent);

// Set when received data, trigger Send event or not
typedef void (__stdcall *lpSetTriggerReceiveEvent)(BOOL bTriggerReceiveEvent);

// Set when send data, trigger Send event or not
typedef void (__stdcall *lpSetExecuteTimeOut)(BYTE nCOMPort, UINT nExecuteTimeOut);

// Set when received data, trigger Send event or not
typedef UINT (__stdcall *lpGetExecuteTimeOut)(BYTE nCOMPort);

// Send SCL Command
typedef BOOL (__stdcall *lpSendSCLCommand)(BYTE nCOMPort, BYTE nNodeID, LPCTSTR pCommand);

// Send SCL Command and Return drive's response
typedef BOOL (__stdcall *lpExecuteSCLCommand)(BYTE nCOMPort, BYTE nNodeID, LPCTSTR pCommand, LPTSTR* strResponse);

// Get Last Command sent
typedef BOOL (__stdcall *lpGetLastCommandSent)(BYTE nCOMPort, COMMAND_INFO& commandInfo);

// Get Last Command received
typedef BOOL (__stdcall *lpGetLastCommandReceived)(BYTE nCOMPort, COMMAND_INFO& commandInfo);

// Get Last Error Information
typedef void (__stdcall *lpGetLastErrorInfo)(PERROR_INFO pErrorInfo);

// Get Node ID Mapping Settings for All drives
typedef BOOL (__stdcall *lpGetAllNodeIDMapping)(BYTE nCOMPort, LPTSTR* strNodeIDMapping);

// Set Node ID Mapping Settings for All drives
typedef BOOL (__stdcall *lpSetAllNodeIDMapping)(BYTE nCOMPort, LPTSTR strNodeIDMapping);

// Reset Node ID Mapping Settings
typedef BOOL (__stdcall *lpResetNodeIDMapping)(BYTE nCOMPort);

// Get Node ID Mapping Settings for one drive
typedef BOOL (__stdcall *lpGetOneNodeIDMapping)(BYTE nCOMPort, BYTE nNodeID, char* chRS485Address);

// Set Node ID Mapping Settings for one drive
typedef BOOL (__stdcall *lpSetOneNodeIDMapping)(BYTE nCOMPort, BYTE nNodeID, char chRS485Address);

// Advanced Functions Start
typedef BOOL (__stdcall *lpDriveEnable)(BYTE nCOMPort, BYTE nNodeID, BOOL bEnable);

typedef BOOL (__stdcall *lpSetDriveOutput)(BYTE nCOMPort, BYTE nNodeID, BYTE nOutput1, char chOutputStatus1, BYTE* nOutput2, char* chOutputStatus2, BYTE* nOutput3, char* chOutputStatus3, BYTE* nOutput4, char* chOutputStatus4, BYTE* nOutput5, char* chOutputStatus5, BYTE* nOutput6, char* chOutputStatus6);

typedef BOOL (__stdcall *lpSetP2PProfile)(BYTE nCOMPort, BYTE nNodeID, double* dVelocity, double* dAccel, double* dDecel);

typedef BOOL (__stdcall *lpSetJogProfile)(BYTE nCOMPort, BYTE nNodeID, double* dVelocity, double* dAccel, double* dDecel);

typedef BOOL (__stdcall *lpRelMove)(BYTE nCOMPort, BYTE nNodeID, int nDistance, double* dVelocity, double* dAccel, double* dDecel);

typedef BOOL (__stdcall *lpAbsMove)(BYTE nCOMPort, BYTE nNodeID, int nDistance, double* dVelocity, double* dAccel, double* dDecel);

typedef BOOL (__stdcall *lpFeedtoSensor)(BYTE nCOMPort, BYTE nNodeID, int* nStopDistance, BYTE nInputSensor, char chInputStatus, double* dVelocity, double* dAccel, double* dDecel);

typedef BOOL (__stdcall *lpP2PMoveWithVelocityChange)(BYTE nCOMPort, BYTE nNodeID, int* nDistance1, int* nDistance2, BYTE* nInputSensor, char* chInputStatus, double* dVelocity1, double* dVelocity2, double* dAccel, double* dDecel);

typedef BOOL (__stdcall *lpP2PMoveAndSetOutput)(BYTE nCOMPort, BYTE nNodeID, int* nMoveDistance, int* nSetOutputDistance, BYTE nOutput, char chOutputStatus, double* dVelocity, double* dAccel, double* dDecel);

typedef BOOL (__stdcall *lpFeedtoDoubleSensor)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor1, char chCondition1, BYTE nInputSensor2, char chCondition2, double* dVelocity, double* dAccel, double* dDecel);

typedef BOOL (__stdcall *lpFeedtoSensorWithMaskDistance)(BYTE nCOMPort, BYTE nNodeID, int* nStopDistance, int* nMaskDistance, BYTE nInputSensor, char chInputStatus, double* dVelocity, double* dAccel, double* dDecel);

typedef BOOL (__stdcall *lpSeekHome)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, char chInputStatus, double* dVelocity, double* dAccel, double* dDecel);

typedef BOOL (__stdcall *lpExtendedSeekHome)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, char chInputStatus, double* dVelocity1, double* dVelocity2, double* dVelocity3, double* dAccel1, double* dAccel2, double* dAccel3, double* dDecel1, double* dDecel2, double* dDecel3);

typedef BOOL (__stdcall *lpHardStopHoming)(BYTE nCOMPort, int nNodeID, BOOL bWithIndex, double* dVelocity1, double* dVelocity2, double* dVelocity3, double* dAccel1, double* dAccel2, double* dAccel3, double* dDecel1, double* dDecel2, double* dDecel3);

typedef BOOL (__stdcall *lpIsMotorEnabled)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsSampling)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInFault)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInPosition)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsMoving)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsJogging)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsStopping)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsWaitingforInput)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsSavingParam)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarm)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsHoming)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsWaitingforTime)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsRunningWizard)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsCheckingEncoder)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsRunningQProgram)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInitializingOrServoReady)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmPositionLimit)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmCWLimit)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmCCWLimit)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmOverTemp)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmOverVoltage)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmUnderVoltage)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmOverCurrent)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmEncoderFault)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmCommError)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmBadFlash)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmBlankQSegment)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmMoveWhileDisabled)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmMoveWhileDisabledMSeries)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmACPowerPhasseLostMSeries)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmSafeTorqueOffMSeries)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmVelocityLimitMSeries)(BYTE nCOMPort, BYTE nNodeID);

typedef BOOL (__stdcall *lpIsInAlarmVoltageWarningMSeries)(BYTE nCOMPort, BYTE nNodeID);

// AC - Read
typedef BOOL (__stdcall *lpReadAccelerationRate)(BYTE nCOMPort, BYTE nNodeID, double* dAccel);

// AC - Write
typedef BOOL (__stdcall *lpWriteAccelerationRate)(BYTE nCOMPort, BYTE nNodeID, double dAccel);

// AD - Read
typedef BOOL (__stdcall *lpReadAnalogDeadband)(BYTE nCOMPort, BYTE nNodeID, BYTE* nAnalogDeadband);

// AD - Write
typedef BOOL (__stdcall *lpWriteAnalogDeadband)(BYTE nCOMPort, BYTE nNodeID, BYTE nAnalogDeadband);

// AD for M Series - Read
typedef BOOL (__stdcall *lpReadAnalogDeadbandWithChannel)(BYTE nCOMPort, BYTE nNodeID, BYTE nAnalogChannel, BYTE* nAnalogDeadband);

// AD for M Series - Write
typedef BOOL (__stdcall *lpWriteAnalogDeadbandMSeries)(BYTE nCOMPort, BYTE nNodeID, BYTE nAnalogChannel, BYTE nAnalogDeadband);

// AF - Read
typedef BOOL (__stdcall *lpReadAnalogFilter)(BYTE nCOMPort, BYTE nNodeID, int* filter);

// AF - Write
typedef BOOL (__stdcall *lpWriteAnalogFilter)(BYTE nCOMPort, BYTE nNodeID, int filter);

// AG - Read
typedef BOOL (__stdcall *lpReadAnalogVelocityGain)(BYTE nCOMPort, BYTE nNodeID, int* velocityGain);

// AG - Write
typedef BOOL (__stdcall *lpWriteAnalogVelocityGain)(BYTE nCOMPort, BYTE nNodeID, int velocityGain);

// AI - Read
typedef BOOL (__stdcall *lpReadAlarmResetInput)(BYTE nCOMPort, BYTE nNodeID, BYTE* nInputUsage);

// AI - Write
typedef BOOL (__stdcall *lpWriteAlarmResetInput)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputUsage);

// AI - Read
typedef BOOL (__stdcall *lpReadAlarmResetInputFlexIO)(BYTE nCOMPort, BYTE nNodeID, BYTE* nInputSensor, BYTE* nInputUsage);

// AI - Write
typedef BOOL (__stdcall *lpWriteAlarmResetInputFlexIO)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, BYTE nAlarmInput);

// AL - Read Only
typedef BOOL (__stdcall *lpReadAlarmCode)(BYTE nCOMPort, BYTE nNodeID, int* nAlarmCode);

typedef BOOL (__stdcall *lpReadAlarmCodeWithChannel)(BYTE nCOMPort, BYTE nNodeID, BYTE nChannel, int* nAlarmCode);

// AM - Read
typedef BOOL (__stdcall *lpReadMaxAcceleration)(BYTE nCOMPort, BYTE nNodeID, double* maxAcceleration);

// AM - Write
typedef BOOL (__stdcall *lpWriteMaxAcceleration)(BYTE nCOMPort, BYTE nNodeID, double maxAcceleration);

// AN - Read
typedef BOOL (__stdcall *lpReadAnalogTorqueGain)(BYTE nCOMPort, BYTE nNodeID, double* analogTorqueGain);

// AN - Write
typedef BOOL (__stdcall *lpWriteAnalogTorqueGain)(BYTE nCOMPort, BYTE nNodeID, double analogTorqueGain);

// AO - Read
typedef BOOL (__stdcall *lpReadAlarmOutput)(BYTE nCOMPort, BYTE nNodeID, BYTE* alarmOutput);

// AO - Write
typedef BOOL (__stdcall *lpWriteAlarmOutput)(BYTE nCOMPort, BYTE nNodeID, BYTE alarmOutput);

// AO - Read
typedef BOOL (__stdcall *lpReadAlarmOutputFlexIO)(BYTE nCOMPort, BYTE nNodeID, BYTE* nOutput, BYTE* nInputUsage);

// AO - Write
typedef BOOL (__stdcall *lpWriteAlarmOutputFlexIO)(BYTE nCOMPort, BYTE nNodeID, BYTE nOutput, BYTE alarmOutput);

// AP - Read
typedef BOOL (__stdcall *lpReadAnalogPositionGain)(BYTE nCOMPort, BYTE nNodeID, int* positionGain);

// AP - Write
typedef BOOL (__stdcall *lpWriteAnalogPositionGain)(BYTE nCOMPort, BYTE nNodeID, int positionGain);

// AR - Write Only
typedef BOOL (__stdcall *lpWriteAlarmReset)(BYTE nCOMPort, BYTE nNodeID, BOOL bImmediately);

// AS - Read
typedef BOOL (__stdcall *lpReadAnalogScaling)(BYTE nCOMPort, BYTE nNodeID, BYTE* scaling);

// AS - Write
typedef BOOL (__stdcall *lpWriteAnalogScaling)(BYTE nCOMPort, BYTE nNodeID, BYTE scaling);

// AT - Read
typedef BOOL (__stdcall *lpReadAnalogThreshold)(BYTE nCOMPort, BYTE nNodeID, double* analogThreshold);

// AT - Write
typedef BOOL (__stdcall *lpWriteAnalogThreshold)(BYTE nCOMPort, BYTE nNodeID, double analogThreshold);

// AV - Read
typedef BOOL (__stdcall *lpReadAnalogOffset)(BYTE nCOMPort, BYTE nNodeID, double* dAnalogOffset);

// AV - Write
typedef BOOL (__stdcall *lpWriteAnalogOffset)(BYTE nCOMPort, BYTE nNodeID, double dAnalogOffset);

// AV for M Series - Read
typedef BOOL (__stdcall *lpReadAnalogOffsetMSeries)(BYTE nCOMPort, BYTE nNodeID, BYTE nAnalogChannel, double* dAnalogOffset);

// AV for M Series - Write
typedef BOOL (__stdcall *lpWriteAnalogOffsetMSeries)(BYTE nCOMPort, BYTE nNodeID, BYTE nAnalogChannel, double dAnalogOffset);

// AZ - Write Only
typedef BOOL (__stdcall *lpWriteAnalogZero)(BYTE nCOMPort, BYTE nNodeID);

// BD - Read
typedef BOOL (__stdcall *lpReadBrakeDisengageDelay)(BYTE nCOMPort, BYTE nNodeID, double* brakeDisengageDelay);

// BD - Write
typedef BOOL (__stdcall *lpWriteBrakeDisengageDelay)(BYTE nCOMPort, BYTE nNodeID, double brakeDisengageDelay);

// BE - Read
typedef BOOL (__stdcall *lpReadBrakeEngageDelay)(BYTE nCOMPort, BYTE nNodeID, double* brakeEngageDelay);

// BE - Write
typedef BOOL (__stdcall *lpWriteBrakeEngageDelay)(BYTE nCOMPort, BYTE nNodeID, double brakeEngageDelay);

// BO - Read
typedef BOOL (__stdcall *lpReadBrakeOutput)(BYTE nCOMPort, BYTE nNodeID, BYTE* nInputUsage);

// BO - Write
typedef BOOL (__stdcall *lpWriteBrakeOutput)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputUsage);

// BO - Read
typedef BOOL (__stdcall *lpReadBrakeOutputFlexIO)(BYTE nCOMPort, BYTE nNodeID, BYTE* nOutput, BYTE* nBreakOutput);

// BO - Write
typedef BOOL (__stdcall *lpWriteBrakeOutputFlexIO)(BYTE nCOMPort, BYTE nNodeID, BYTE nOutput, BYTE nBreakOutput);

// BR - Read
typedef BOOL (__stdcall *lpReadBaudRate)(BYTE nCOMPort, BYTE nNodeID, BYTE* nBaudRate);

// BS - Read Only
typedef BOOL (__stdcall *lpReadBufferStatus)(BYTE nCOMPort, BYTE nNodeID, BYTE* bufferStatus);

// CA - Read
typedef BOOL (__stdcall *lpReadChangeAccelerationCurrent)(BYTE nCOMPort, BYTE nNodeID, double* changeAccelerationCurrent);

// CA - Write
typedef BOOL (__stdcall *lpWriteChangeAccelerationCurrent)(BYTE nCOMPort, BYTE nNodeID, double changeAccelerationCurrent);

// CC - Read
typedef BOOL (__stdcall *lpReadChangeCurrent)(BYTE nCOMPort, BYTE nNodeID, double* changeCurrent);

// CC - Write
typedef BOOL (__stdcall *lpWriteChangeCurrent)(BYTE nCOMPort, BYTE nNodeID, double changeCurrent);

// CD - Read
typedef BOOL (__stdcall *lpReadIdleCurrentDelayTime)(BYTE nCOMPort, BYTE nNodeID, double* idleCurrentDelayTime);

// CD - Write
typedef BOOL (__stdcall *lpWriteIdleCurrentDelayTime)(BYTE nCOMPort, BYTE nNodeID, double idleCurrentDelayTime);

// CE - Read Only
typedef BOOL (__stdcall *lpReadCommunicationError)(BYTE nCOMPort, BYTE nNodeID, int* communicationError);

// CF - Read
typedef BOOL (__stdcall *lpReadAntiResonanceFilterFreq)(BYTE nCOMPort, BYTE nNodeID, int* antiResonanceFilterFreq);

// CF - Write
typedef BOOL (__stdcall *lpWriteAntiResonanceFilterFreq)(BYTE nCOMPort, BYTE nNodeID, int antiResonanceFilterFreq);

// CG - Read
typedef BOOL (__stdcall *lpReadAntiResonanceFilterGain)(BYTE nCOMPort, BYTE nNodeID, int* antiResonanceFilterGain);

// CG - Write
typedef BOOL (__stdcall *lpWriteAntiResonanceFilterGain)(BYTE nCOMPort, BYTE nNodeID, int antiResonanceFilterGain);

// CI - Read
typedef BOOL (__stdcall *lpReadChangeIdleCurrent)(BYTE nCOMPort, BYTE nNodeID, double* changeIdleCurrent);

// CI - Write
typedef BOOL (__stdcall *lpWriteChangeIdleCurrent)(BYTE nCOMPort, BYTE nNodeID, double changeIdleCurrent);

// CJ - Write Only
typedef BOOL (__stdcall *lpWriteCommenceJogging)(BYTE nCOMPort, BYTE nNodeID);

// CM - Read
typedef BOOL (__stdcall *lpReadCommandMode)(BYTE nCOMPort, BYTE nNodeID, BYTE* nCommandMode);

// CM - Write
typedef BOOL (__stdcall *lpWriteCommandMode)(BYTE nCOMPort, BYTE nNodeID, BYTE nCommandMode);

// CN - Read
typedef BOOL (__stdcall *lpReadSecondaryCommandMode)(BYTE nCOMPort, BYTE nNodeID, BYTE* nCommandMode);

// CN - Write
typedef BOOL (__stdcall *lpWriteSecondaryCommandMode)(BYTE nCOMPort, BYTE nNodeID, BYTE nCommandMode);

// CP - Read
typedef BOOL (__stdcall *lpReadChangePeakCurrent)(BYTE nCOMPort, BYTE nNodeID, double* dChangePeakCurrent);

// CP - Write
typedef BOOL (__stdcall *lpWriteChangePeakCurrent)(BYTE nCOMPort, BYTE nNodeID, double dChangePeakCurrent);

// CR - Write Only
typedef BOOL (__stdcall *lpWriteCompareRegisters)(BYTE nCOMPort, BYTE nNodeID, char chRegister1, char chRegister2);

// CS - Read
typedef BOOL (__stdcall *lpReadChangeSpeed)(BYTE nCOMPort, BYTE nNodeID, double* dChangeSpeed);

// CS - Write
typedef BOOL (__stdcall *lpWriteChangeSpeed)(BYTE nCOMPort, BYTE nNodeID, double dChangeSpeed);

// DC - Read
typedef BOOL (__stdcall *lpReadChangeDistance)(BYTE nCOMPort, BYTE nNodeID, int* nChangeDistance);

// DC - Write
typedef BOOL (__stdcall *lpWriteChangeDistance)(BYTE nCOMPort, BYTE nNodeID, int nChangeDistance);

// DD - Read
typedef BOOL (__stdcall *lpReadDefaultDisplay)(BYTE nCOMPort, BYTE nNodeID, BYTE* nDefaultDisplay);

// DD - Write
typedef BOOL (__stdcall *lpWriteDefaultDisplay)(BYTE nCOMPort, BYTE nNodeID, BYTE nDefaultDisplay);

// DE - Read
typedef BOOL (__stdcall *lpReadDecelerationRate)(BYTE nCOMPort, BYTE nNodeID, double* dDecel);

// DE - Write
typedef BOOL (__stdcall *lpWriteDecelerationRate)(BYTE nCOMPort, BYTE nNodeID, double dDecel);

// DI - Read
typedef BOOL (__stdcall *lpReadDistanceOrPosition)(BYTE nCOMPort, BYTE nNodeID, int* nDistance);

// DI - Write
typedef BOOL (__stdcall *lpWriteDistanceOrPosition)(BYTE nCOMPort, BYTE nNodeID, int nDistance);

// DL - Read
typedef BOOL (__stdcall *lpReadDefineLimits)(BYTE nCOMPort, BYTE nNodeID, BYTE* nDefineLimits);

// DL - Write
typedef BOOL (__stdcall *lpWriteDefineLimits)(BYTE nCOMPort, BYTE nNodeID, BYTE nDefineLimits);

// DP - Read
typedef BOOL (__stdcall *lpReadDumpingPower)(BYTE nCOMPort, BYTE nNodeID, BYTE* nDumpingPower);

// DP - Write
typedef BOOL (__stdcall *lpWriteDumpingPower)(BYTE nCOMPort, BYTE nNodeID, BYTE nDumpingPower);

// DR - Write Only
typedef BOOL (__stdcall *lpWriteDataRegisterforCapture)(BYTE nCOMPort, BYTE nNodeID, char chDataRegisterforCapture);

// DS - Read
typedef BOOL (__stdcall *lpReadSwitchingElectronicGearing)(BYTE nCOMPort, BYTE nNodeID, BYTE* nSwitchingElectronicGearing);

// DS - Write
typedef BOOL (__stdcall *lpWriteSwitchingElectronicGearing)(BYTE nCOMPort, BYTE nNodeID, BYTE nSwitchingElectronicGearing);

// ED - Read
typedef BOOL (__stdcall *lpReadEncoderDirection)(BYTE nCOMPort, BYTE nNodeID, BYTE* nEncoderDirection);

// ED - Write
typedef BOOL (__stdcall *lpWriteEncoderDirection)(BYTE nCOMPort, BYTE nNodeID, BYTE nEncoderDirection);

// EF - Read
typedef BOOL (__stdcall *lpReadEncoderFunction)(BYTE nCOMPort, BYTE nNodeID, BYTE* nEncoderFunction);

// EF - Write
typedef BOOL (__stdcall *lpWriteEncoderFunction)(BYTE nCOMPort, BYTE nNodeID, BYTE nEncoderFunction);

// EG - Read
typedef BOOL (__stdcall *lpReadElectronicGearing)(BYTE nCOMPort, BYTE nNodeID, int* nElectronicGearing);

// EG - Write
typedef BOOL (__stdcall *lpWriteElectronicGearing)(BYTE nCOMPort, BYTE nNodeID, int nElectronicGearing);

// EH - Write
typedef BOOL (__stdcall *lpWriteExtendedHoming)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX);

// EI - Read
typedef BOOL (__stdcall *lpReadInputNoiseFilter)(BYTE nCOMPort, BYTE nNodeID, BYTE* nInputNoiseFilter);

// EI - Write
typedef BOOL (__stdcall *lpWriteInputNoiseFilter)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputNoiseFilter);

// EN - Read
typedef BOOL (__stdcall *lpReadElectronicGearingRatioNumerator)(BYTE nCOMPort, BYTE nNodeID, BYTE* nElectronicGearingRatioNumerator);

// EN - Write
typedef BOOL (__stdcall *lpWriteElectronicGearingRatioNumerator)(BYTE nCOMPort, BYTE nNodeID, BYTE nElectronicGearingRatioNumerator);

// EP - Read
typedef BOOL (__stdcall *lpReadEncoderPosition)(BYTE nCOMPort, BYTE nNodeID, int* nEncoderPosition);

// EP - Write
typedef BOOL (__stdcall *lpWriteEncoderPosition)(BYTE nCOMPort, BYTE nNodeID, int nEncoderPosition);

// ER - Read
typedef BOOL (__stdcall *lpReadEncoderResolution)(BYTE nCOMPort, BYTE nNodeID, int* nEncoderResolution);

// ER - Write
typedef BOOL (__stdcall *lpWriteEncoderResolution)(BYTE nCOMPort, BYTE nNodeID, int nEncoderResolution);

// ES - Read
typedef BOOL (__stdcall *lpReadSingleEndedEncoderUsage)(BYTE nCOMPort, BYTE nNodeID, BYTE* nSingleEndedEncoderUsage);

// ES - Write
typedef BOOL (__stdcall *lpWriteSingleEndedEncoderUsage)(BYTE nCOMPort, BYTE nNodeID, BYTE nSingleEndedEncoderUsage);

// EU - Read
typedef BOOL (__stdcall *lpReadElectronicGearingRatioDenominator)(BYTE nCOMPort, BYTE nNodeID, BYTE* nElectronicGearingRatioDenominator);

// EU - Write
typedef BOOL (__stdcall *lpWriteElectronicGearingRatioDenominator)(BYTE nCOMPort, BYTE nNodeID, BYTE nElectronicGearingRatioDenominator);

// FA - Read
typedef BOOL (__stdcall *lpReadFunctionofAnalogInput)(BYTE nCOMPort, BYTE nNodeID, BYTE nAnalogChannel, BYTE* nFunction);

// FA - Write
typedef BOOL (__stdcall *lpWriteFunctionofAnalogInput)(BYTE nCOMPort, BYTE nNodeID, BYTE nAnalogChannel, BYTE nFunction);

// FC - Write Only
typedef BOOL (__stdcall *lpWriteFeedtoLengthwithSpeedChange)(BYTE nCOMPort, BYTE nNodeID, BYTE* nInputSensor, char* chInputStatus, BOOL bWithOptionalX);

// FD - Write Only
typedef BOOL (__stdcall *lpWriteFeedtoDoubleSensor)(BYTE nCOMPort, BYTE nNodeID, BYTE nInput1, char chInputCondition1, BYTE nInput2, char chInputCondition2);

// FE - Write Only
typedef BOOL (__stdcall *lpWriteFollowEncoder)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX);

// FH - Write
typedef BOOL (__stdcall *lpWriteFindHome)(BYTE nCOMPort, BYTE nNodeID, int nHomingMethod);

// FI - Read
typedef BOOL (__stdcall *lpReadFilterInput)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, int* nFilter);

// FI - Write
typedef BOOL (__stdcall *lpWriteFilterInput)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, int nFilter);

// FL - Write Only
typedef BOOL (__stdcall *lpWriteFeedtoLength)(BYTE nCOMPort, BYTE nNodeID, int* nDistance);

// FM - Write Only
typedef BOOL (__stdcall *lpWriteFeedtoSensorwithMaskDistance)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX);

// FO - Write Only
typedef BOOL (__stdcall *lpWriteFeedtoLengthandSetOutput)(BYTE nCOMPort, BYTE nNodeID, BYTE nOutput, char nOutputStatus, BOOL bWithOptionalY);

// FP - Write Only
typedef BOOL (__stdcall *lpWriteFeedtoPosition)(BYTE nCOMPort, BYTE nNodeID, int* nPosition);

// FS - Write Only
typedef BOOL (__stdcall *lpWriteFeedtoSensor)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX);

// FX - Read
typedef BOOL (__stdcall *lpReadFilterSelectInputs)(BYTE nCOMPort, BYTE nNodeID, BYTE* nFilterSelectInputs);

// FX - Write
typedef BOOL (__stdcall *lpWriteFilterSelectInputs)(BYTE nCOMPort, BYTE nNodeID, BYTE nFilterSelectInputs);

// FY - Write Only
typedef BOOL (__stdcall *lpWriteFeedtoSensorwithSafetyDistance)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX);

// GC - Read
typedef BOOL (__stdcall *lpReadCurrentCommand)(BYTE nCOMPort, BYTE nNodeID, int* nCurrentCommand);

// GC - Write
typedef BOOL (__stdcall *lpWriteCurrentCommand)(BYTE nCOMPort, BYTE nNodeID, int nCurrentCommand);

// GG - Read
typedef BOOL (__stdcall *lpReadGlobalGainSelection)(BYTE nCOMPort, BYTE nNodeID, BYTE* nGlobalGainSelection);

// GG - Write
typedef BOOL (__stdcall *lpWriteGlobalGainSelection)(BYTE nCOMPort, BYTE nNodeID, BYTE nGlobalGainSelection);

//HA - Read
typedef BOOL (__stdcall *lpReadHomingAcceleration)(BYTE nCOMPort, BYTE nNodeID, int nStep, double* dHomingAccel);

// HA - Write
typedef BOOL (__stdcall *lpWriteHomingAcceleration)(BYTE nCOMPort, BYTE nNodeID, int nStep, double dHomingAccel);

// HC - Read
typedef BOOL (__stdcall *lpReadHardStopCurrent)(BYTE nCOMPort, BYTE nNodeID, double* dHardStopCurrent);

// HC - Write
typedef BOOL (__stdcall *lpWriteHardStopCurrent)(BYTE nCOMPort, BYTE nNodeID, double dHardStopCurrent);

// HD -Read
typedef BOOL (__stdcall *lpReadHardStopFaultDelay)(BYTE nCOMPort, BYTE nNodeID, int* nHardStopCurrent);

// HD - Write
typedef BOOL (__stdcall *lpWriteHardStopFaultDelay)(BYTE nCOMPort, BYTE nNodeID, int nHardStopFaultDelay);

// HG - Read
typedef BOOL (__stdcall *lpReadHarmonicFilterGain)(BYTE nCOMPort, BYTE nNodeID, int* nHarmonicFilterGain);

// HG - Write
typedef BOOL (__stdcall *lpWriteHarmonicFilterGain)(BYTE nCOMPort, BYTE nNodeID, int nHarmonicFilterGain);

//HL - Read
typedef BOOL (__stdcall *lpReadHomingDeceleration)(BYTE nCOMPort, BYTE nNodeID, int nStep, double* dHomingDecel);

// HL - Write
typedef BOOL (__stdcall *lpWriteHomingDeceleration)(BYTE nCOMPort, BYTE nNodeID, int nStep, double dHomingDecel);

// HO - Read
typedef BOOL (__stdcall *lpReadHomingOffset)(BYTE nCOMPort, BYTE nNodeID, int* nHomingOffset);

// HO - Write
typedef BOOL (__stdcall *lpWriteHomingOffset)(BYTE nCOMPort, BYTE nNodeID, int nHomingOffset);

// HP - Read
typedef BOOL (__stdcall *lpReadHarmonicFilterPhase)(BYTE nCOMPort, BYTE nNodeID, int* nHarmonicFilterPhase);

// HP - Write
typedef BOOL (__stdcall *lpWriteHarmonicFilterPhase)(BYTE nCOMPort, BYTE nNodeID, int nHarmonicFilterPhase);

// HS - Write
typedef BOOL (__stdcall *lpWriteHardStopHoming)(BYTE nCOMPort, BYTE nNodeID, BOOL bWithIndex);

// HV - Read
typedef BOOL (__stdcall *lpReadHomingVelocity)(BYTE nCOMPort, BYTE nNodeID, int nStep, double* dHomeVelocity);

// HV - Write
typedef BOOL (__stdcall *lpWriteHomingVelocity)(BYTE nCOMPort, BYTE nNodeID, int nStep, double dHomeVelocity);

// HW - Write Only
typedef BOOL (__stdcall *lpWriteHandWheel)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX);

// IA - Read
typedef BOOL (__stdcall *lpReadImmediateAnalog)(BYTE nCOMPort, BYTE nNodeID, double* nAnalogValue);

// IA1 - Read
typedef BOOL (__stdcall *lpReadImmediateAnalogWithChannel)(BYTE nCOMPort, BYTE nNodeID, int nChannel, double* dAnalogValue);

// IC - Read
typedef BOOL (__stdcall *lpReadImmediateCommandedCurrent)(BYTE nCOMPort, BYTE nNodeID, double* dImmediateCommandedCurrent);

// ID - Read Only
typedef BOOL (__stdcall *lpReadImmediateDistance)(BYTE nCOMPort, BYTE nNodeID, int* immediateDistance);

// IE - Read Only
typedef BOOL (__stdcall *lpReadImmediateEncoder)(BYTE nCOMPort, BYTE nNodeID, int* immediateEncoder);

// IF - Read Only
typedef BOOL (__stdcall *lpReadHexFormat)(BYTE nCOMPort, BYTE nNodeID, BOOL* bHexFormat);

// IH - Write Only
typedef BOOL (__stdcall *lpWriteImmediateHighOutput)(BYTE nCOMPort, BYTE nNodeID, BYTE nOutput, BOOL bWithOptionalY);

// IL - Write Only
typedef BOOL (__stdcall *lpWriteImmediateLowOutput)(BYTE nCOMPort, BYTE nNodeID, BYTE nOutput, BOOL bWithOptionalY);

// IO - Read
typedef BOOL (__stdcall *lpReadOutputStatus)(BYTE nCOMPort, BYTE nNodeID, BYTE* nOutputStatus, BOOL bWithOptionalY);

// IO
typedef BOOL (__stdcall *lpWriteOutputStatus)(BYTE nCOMPort, BYTE nNodeID, BYTE nOutputStatus, BOOL bWithOptionalY);

// IP - Read Only
typedef BOOL (__stdcall *lpReadImmediatePosition)(BYTE nCOMPort, BYTE nNodeID, int* immediatePosition);

// IQ - Read
typedef BOOL (__stdcall *lpReadImmediateActualCurrent)(BYTE nCOMPort, BYTE nNodeID, double* dImmediateActualCurrent);

// IS - Read
typedef BOOL (__stdcall *lpReadInputStatus)(BYTE nCOMPort, BYTE nNodeID, int* nInputStatus, BOOL bWithOptionalY);

// IT - Read
typedef BOOL (__stdcall *lpReadImmediateTemperature)(BYTE nCOMPort, BYTE nNodeID, double* dTemperature);

// IT2 - Read
typedef BOOL (__stdcall *lpReadImmediateTemperatureWithChannel)(BYTE nCOMPort, BYTE nNodeID, int nChannel, double* dTemperature);

// IU - Read
typedef BOOL (__stdcall *lpReadImmediateVoltage)(BYTE nCOMPort, BYTE nNodeID, double* dVoltage);

// IU0, IU1, IU2 - Read
typedef BOOL (__stdcall *lpReadImmediateVoltageWithChannel)(BYTE nCOMPort, BYTE nNodeID, int nChannel, double* dVoltage);

// IV - Read Only
typedef BOOL (__stdcall *lpReadImmediateActualVelocity)(BYTE nCOMPort, BYTE nNodeID, double* actualVelocity);

// IV - Read Only
typedef BOOL (__stdcall *lpReadImmediateTargetVelocity)(BYTE nCOMPort, BYTE nNodeID, double* targetVelocity);

// IX - Read Only
typedef BOOL (__stdcall *lpReadImmediatePositionError)(BYTE nCOMPort, BYTE nNodeID, int* immediatePositionError);

// JA - Read
typedef BOOL (__stdcall *lpReadJogAcceleration)(BYTE nCOMPort, BYTE nNodeID, double* jogAcceleration);

// JA - Write
typedef BOOL (__stdcall *lpWriteJogAcceleration)(BYTE nCOMPort, BYTE nNodeID, double jogAcceleration);

// JC - Read
typedef BOOL (__stdcall *lpReadVelocityModeSecondSpeed)(BYTE nCOMPort, BYTE nNodeID, double* velocityModeSecondSpeed);

// JC - Write
typedef BOOL (__stdcall *lpWriteVelocityModeSecondSpeed)(BYTE nCOMPort, BYTE nNodeID, double velocityModeSecondSpeed);

// JC for M Series - Read
typedef BOOL (__stdcall *lpReadVelocityModeSecondSpeedMSeries)(BYTE nCOMPort, BYTE nNodeID, BYTE nVelocityIndex, double* dVelocity);

// JC for M Series - Write
typedef BOOL (__stdcall *lpWriteVelocityModeSecondSpeedMSeries)(BYTE nCOMPort, BYTE nNodeID, BYTE nAnalogChannel, double dVelocity);

// JD - Write Only
typedef BOOL (__stdcall *lpWriteJogDisable)(BYTE nCOMPort, BYTE nNodeID);

// JE- Write Only
typedef BOOL (__stdcall *lpWriteJogEnable)(BYTE nCOMPort, BYTE nNodeID);

// JL - Read
typedef BOOL (__stdcall *lpReadJogDeceleration)(BYTE nCOMPort, BYTE nNodeID, double* jogDeceleration);

// JL - Write
typedef BOOL (__stdcall *lpWriteJogDeceleration)(BYTE nCOMPort, BYTE nNodeID, double jogDeceleration);

// JM - Read
typedef BOOL (__stdcall *lpReadJogMode)(BYTE nCOMPort, BYTE nNodeID, BYTE* jogMode);

// JM - Write
typedef BOOL (__stdcall *lpWriteJogMode)(BYTE nCOMPort, BYTE nNodeID, BYTE jogMode);

// JS - Read
typedef BOOL (__stdcall *lpReadJogSpeed)(BYTE nCOMPort, BYTE nNodeID, double* jogSpeed);

// JS - Write
typedef BOOL (__stdcall *lpWriteJogSpeed)(BYTE nCOMPort, BYTE nNodeID, double jogSpeed);

// KC - Read
typedef BOOL (__stdcall *lpReadOverallServoFilter)(BYTE nCOMPort, BYTE nNodeID, int* overallServoFilter);

// KC - Write
typedef BOOL (__stdcall *lpWriteOverallServoFilter)(BYTE nCOMPort, BYTE nNodeID, int overallServoFilter);

// KD - Read
typedef BOOL (__stdcall *lpReadDifferentialConstant)(BYTE nCOMPort, BYTE nNodeID, int* differentialConstant);

// KD - Write
typedef BOOL (__stdcall *lpWriteDifferentialConstant)(BYTE nCOMPort, BYTE nNodeID, int differentialConstant);

// KE - Read
typedef BOOL (__stdcall *lpReadDifferentialFilter)(BYTE nCOMPort, BYTE nNodeID, int* differentialFilter);

// KE - Write
typedef BOOL (__stdcall *lpWriteDifferentialFilter)(BYTE nCOMPort, BYTE nNodeID, int differentialFilter);

// KF - Read
typedef BOOL (__stdcall *lpReadVelocityFeedforwardConstant)(BYTE nCOMPort, BYTE nNodeID, int* velocityFeedforwardConstant);

// KF - Write
typedef BOOL (__stdcall *lpWriteVelocityFeedforwardConstant)(BYTE nCOMPort, BYTE nNodeID, int velocityFeedforwardConstant);

// KG - Read
typedef BOOL (__stdcall *lpReadSecondaryGlobalGain)(BYTE nCOMPort, BYTE nNodeID, BYTE* nSecondaryGlobalGain);

// KG - Write
typedef BOOL (__stdcall *lpWriteSecondaryGlobalGain)(BYTE nCOMPort, BYTE nNodeID, BYTE nSecondaryGlobalGain);

// KI - Read
typedef BOOL (__stdcall *lpReadIntegratorConstant)(BYTE nCOMPort, BYTE nNodeID, int* integratorConstant);

// KI - Write
typedef BOOL (__stdcall *lpWriteIntegratorConstant)(BYTE nCOMPort, BYTE nNodeID, int integratorConstant);

// KJ - Read
typedef BOOL (__stdcall *lpReadJerkFilterFrequency)(BYTE nCOMPort, BYTE nNodeID, int* jerkFilterFrequency);

// KJ - Write
typedef BOOL (__stdcall *lpWriteJerkFilterFrequency)(BYTE nCOMPort, BYTE nNodeID, int jerkFilterFrequency);

// KK - Read
typedef BOOL (__stdcall *lpReadInertiaFeedforwardConstant)(BYTE nCOMPort, BYTE nNodeID, int* inertiaFeedforwardConstant);

// KK - Write
typedef BOOL (__stdcall *lpWriteInertiaFeedforwardConstant)(BYTE nCOMPort, BYTE nNodeID, int inertiaFeedforwardConstant);

// KP - Read
typedef BOOL (__stdcall *lpReadProportionalConstant)(BYTE nCOMPort, BYTE nNodeID, int* proportionalConstant);

// KP - Write
typedef BOOL (__stdcall *lpWriteProportionalConstant)(BYTE nCOMPort, BYTE nNodeID, int proportionalConstant);

// KV - Read
typedef BOOL (__stdcall *lpReadVelocityFeedbackConstant)(BYTE nCOMPort, BYTE nNodeID, int* velocityFeedbackConstant);

// KV - Write
typedef BOOL (__stdcall *lpWriteVelocityFeedbackConstant)(BYTE nCOMPort, BYTE nNodeID, int velocityFeedbackConstant);

// LA - Read
typedef BOOL (__stdcall *lpReadLeadAngleMaxValue)(BYTE nCOMPort, BYTE nNodeID, BYTE* nLeadAngleMaxValue);

// LA - Write
typedef BOOL (__stdcall *lpWriteLeadAngleMaxValue)(BYTE nCOMPort, BYTE nNodeID, BYTE nLeadAngleMaxValue);

// LM - Read
typedef BOOL (__stdcall *lpReadSoftwareLimitCCW)(BYTE nCOMPort, BYTE nNodeID, int* nSoftwareLimitCCW);

// LM - Write
typedef BOOL (__stdcall *lpWriteSoftwareLimitCCW)(BYTE nCOMPort, BYTE nNodeID, int nSoftwareLimitCCW);

// LP - Read
typedef BOOL (__stdcall *lpReadSoftwareLimitCW)(BYTE nCOMPort, BYTE nNodeID, int* nSoftwareLimitCW);

// LP - Write
typedef BOOL (__stdcall *lpWriteSoftwareLimitCW)(BYTE nCOMPort, BYTE nNodeID, int nSoftwareLimitCW);

// LS - Read
typedef BOOL (__stdcall *lpReadLeadAngleSpeed)(BYTE nCOMPort, BYTE nNodeID, double* dLeadAngleSpeed);

// LS - Write
typedef BOOL (__stdcall *lpWriteLeadAngleSpeed)(BYTE nCOMPort, BYTE nNodeID, double dLeadAngleSpeed);

// LV - Read
typedef BOOL (__stdcall *lpReadLowVoltageThreshold)(BYTE nCOMPort, BYTE nNodeID, int* lowVoltageThreshold);

// LV - Write
typedef BOOL (__stdcall *lpWriteLowVoltageThreshold)(BYTE nCOMPort, BYTE nNodeID, int lowVoltageThreshold);

// MD - Write Only
typedef BOOL (__stdcall *lpWriteMotorDisable)(BYTE nCOMPort, BYTE nNodeID);

// ME- Write Only
typedef BOOL (__stdcall *lpWriteMotorEnable)(BYTE nCOMPort, BYTE nNodeID);

//MN - Read
typedef BOOL (__stdcall *lpReadModelNumber)(BYTE nCOMPort, BYTE nNodeID, BYTE* chModelNumber);

// MO - Read
typedef BOOL (__stdcall *lpReadMotionOutput)(BYTE nCOMPort, BYTE nNodeID, BYTE* nOutputUsage);

// MO - Write
typedef BOOL (__stdcall *lpWriteMotionOutput)(BYTE nCOMPort, BYTE nNodeID, BYTE nOutputUsage);

// MO - Read
typedef BOOL (__stdcall *lpReadMotionOutputFlexIO)(BYTE nCOMPort, BYTE nNodeID, BYTE* nOutputUsage, BYTE* nOutput);

// MO - Write
typedef BOOL (__stdcall *lpWriteMotionOutputFlexIO)(BYTE nCOMPort, BYTE nNodeID, BYTE nOutputUsage, BYTE nOutput);

// MO - Read
typedef BOOL (__stdcall *lpReadMotionOutputMSeries)(BYTE nCOMPort, BYTE nNodeID, BYTE nOutput, BYTE* nOutputUsage);

// MO - Write
typedef BOOL (__stdcall *lpWriteMotionOutputMSeries)(BYTE nCOMPort, BYTE nNodeID, BYTE nOutput, BYTE nOutputUsage);

// MR - Read
typedef BOOL (__stdcall *lpReadMicrostepResolution)(BYTE nCOMPort, BYTE nNodeID, BYTE* microstepResolution);

// MR - Write
typedef BOOL (__stdcall *lpWriteMicrostepResolution)(BYTE nCOMPort, BYTE nNodeID, BYTE microstepResolution);

// MS - Read
typedef BOOL (__stdcall *lpReadControlModeSelection)(BYTE nCOMPort, BYTE nNodeID, BYTE* nControlModeSelection);

// MS - Write
typedef BOOL (__stdcall *lpWriteControlModeSelection)(BYTE nCOMPort, BYTE nNodeID, BYTE nControlModeSelection);

// MT - Read
typedef BOOL (__stdcall *lpReadMultiTasking)(BYTE nCOMPort, BYTE nNodeID, BYTE* multiTasking);

// MT - Write
typedef BOOL (__stdcall *lpWriteMultiTasking)(BYTE nCOMPort, BYTE nNodeID, BYTE multiTasking);

// MV - Read Only
typedef BOOL (__stdcall *lpReadModelRevision)(BYTE nCOMPort, BYTE nNodeID, LPTSTR* strModelRevision);

// OF - Write Only
typedef BOOL (__stdcall *lpWriteOnFault)(BYTE nCOMPort, BYTE nNodeID, BYTE nQSegment);

// OI - Write Only
typedef BOOL (__stdcall *lpWriteOnInput)(BYTE nCOMPort, BYTE nNodeID, BYTE* nInputSensor, char* chInputStatus, BOOL bWithOptionalX);

// OP - Read
typedef BOOL (__stdcall *lpReadOptionBoard)(BYTE nCOMPort, BYTE nNodeID, BYTE* nOptionBoard);

// PA - Read
typedef BOOL (__stdcall *lpReadPowerupAccelerationCurrent)(BYTE nCOMPort, BYTE nNodeID, double* powerupAccelerationCurrent);

// PA - Write
typedef BOOL (__stdcall *lpWritePowerupAccelerationCurrent)(BYTE nCOMPort, BYTE nNodeID, double powerupAccelerationCurrent);

// PB - Read
typedef BOOL (__stdcall *lpReadPowerupBaudRate)(BYTE nCOMPort, BYTE nNodeID, BYTE* powerupBaudRate);

// PB - Write
typedef BOOL (__stdcall *lpWritePowerupBaudRate)(BYTE nCOMPort, BYTE nNodeID, BYTE powerupBaudRate);

// PC - Read
typedef BOOL (__stdcall *lpReadPowerupCurrent)(BYTE nCOMPort, BYTE nNodeID, double* powerupCurrent);

// PC - Write
typedef BOOL (__stdcall *lpWritePowerupCurrent)(BYTE nCOMPort, BYTE nNodeID, double powerupCurrent);

// PD - Read
typedef BOOL (__stdcall *lpReadInPositionCounts)(BYTE nCOMPort, BYTE nNodeID, int* nInPositionCounts);

// PD - Write
typedef BOOL (__stdcall *lpWriteInPositionCounts)(BYTE nCOMPort, BYTE nNodeID, int nInPositionCounts);

// PE - Read
typedef BOOL (__stdcall *lpReadInPositionTiming)(BYTE nCOMPort, BYTE nNodeID, int* positionFault);

// PE - Write
typedef BOOL (__stdcall *lpWriteInPositionTiming)(BYTE nCOMPort, BYTE nNodeID, int positionFault);

// PF - Read
typedef BOOL (__stdcall *lpReadPositionFault)(BYTE nCOMPort, BYTE nNodeID, int* positionFault);

// PF - Write
typedef BOOL (__stdcall *lpWritePositionFault)(BYTE nCOMPort, BYTE nNodeID, int positionFault);

// PH - Read
typedef BOOL (__stdcall *lpReadInhibitionOfPulseCommand)(BYTE nCOMPort, BYTE nNodeID, int* nInhibitionOfPulseCommand);

// PH - Write
typedef BOOL (__stdcall *lpWriteInhibitionOfPulseCommand)(BYTE nCOMPort, BYTE nNodeID, int nInhibitionOfPulseCommand);

// PI - Read
typedef BOOL (__stdcall *lpReadPowerupIdleCurrent)(BYTE nCOMPort, BYTE nNodeID, double* powerupIdleCurrent);

// PI - Write
typedef BOOL (__stdcall *lpWritePowerupIdleCurrent)(BYTE nCOMPort, BYTE nNodeID, double powerupIdleCurrent);

// PK - Read
typedef BOOL (__stdcall *lpReadParameterLock)(BYTE nCOMPort, BYTE nNodeID, int* nParameterLock);

// PK - Write
typedef BOOL (__stdcall *lpWriteParameterLock)(BYTE nCOMPort, BYTE nNodeID, int nParameterLock);

// PL - Read
typedef BOOL (__stdcall *lpReadPositionLimit)(BYTE nCOMPort, BYTE nNodeID, int* positionLimit);

// PL - Write
typedef BOOL (__stdcall *lpWritePositionLimit)(BYTE nCOMPort, BYTE nNodeID, int positionLimit);

// PM - Read
typedef BOOL (__stdcall *lpReadPowerupMode)(BYTE nCOMPort, BYTE nNodeID, BYTE* powerupMode);

// PM - Write
typedef BOOL (__stdcall *lpWritePowerupMode)(BYTE nCOMPort, BYTE nNodeID, BYTE powerupMode);

// PN - Write
typedef BOOL (__stdcall *lpWriteProbeonDemand)(BYTE nCOMPort, BYTE nNodeID);

// PP - Read
typedef BOOL (__stdcall *lpReadPowerupPeakCurrent)(BYTE nCOMPort, BYTE nNodeID, double* powerupPeakCurrent);

// PP - Write
typedef BOOL (__stdcall *lpWritePowerupPeakCurrent)(BYTE nCOMPort, BYTE nNodeID, double powerupPeakCurrent);

// PR - Read
typedef BOOL (__stdcall *lpReadProtocol)(BYTE nCOMPort, BYTE nNodeID, BYTE* nProtocol);

// PT - Read
typedef BOOL (__stdcall *lpReadPulseType)(BYTE nCOMPort, BYTE nNodeID, BYTE* nPulseType);

// PT - Write
typedef BOOL (__stdcall *lpWritePulseType)(BYTE nCOMPort, BYTE nNodeID, BYTE nPulseType);

// PV - Read
typedef BOOL (__stdcall *lpReadSecondaryElectronicGearing)(BYTE nCOMPort, BYTE nNodeID, BYTE* nSecondaryElectronicGearing);

// PV - Write
typedef BOOL (__stdcall *lpWriteSecondaryElectronicGearing)(BYTE nCOMPort, BYTE nNodeID, BYTE nSecondaryElectronicGearing);

// PW - Write Only
typedef BOOL (__stdcall *lpWritePassword)(BYTE nCOMPort, BYTE nNodeID, LPTSTR password);

// QC - Write Only
typedef BOOL (__stdcall *lpWriteQueueCall)(BYTE nCOMPort, BYTE nNodeID, BOOL bWithQSegment, BYTE nQSegment);

// QD - Write Only
typedef BOOL (__stdcall *lpWriteQueueDelete)(BYTE nCOMPort, BYTE nNodeID, BYTE nQSegment);

// QE - Write Only
typedef BOOL (__stdcall *lpWriteQueueExecute)(BYTE nCOMPort, BYTE nNodeID);

// QG - Write Only
typedef BOOL (__stdcall *lpWriteQueueGoto)(BYTE nCOMPort, BYTE nNodeID, BYTE nLineNumber);

// QJ - Write Only
typedef BOOL (__stdcall *lpWriteQueueJump)(BYTE nCOMPort, BYTE nNodeID, char conditionCode, int nLineNumber);

// QK - Write Only
typedef BOOL (__stdcall *lpWriteQueueKill)(BYTE nCOMPort, BYTE nNodeID);

// QL - Write Only
typedef BOOL (__stdcall *lpWriteQueueLoad)(BYTE nCOMPort, BYTE nNodeID, BOOL fromNVMemory, int nQSegment);

// QR - Write Only
typedef BOOL (__stdcall *lpWriteQueueRepeat)(BYTE nCOMPort, BYTE nNodeID, BYTE nLineNumber);

// QS - Write Only
typedef BOOL (__stdcall *lpWriteQueueSave)(BYTE nCOMPort, BYTE nNodeID, BYTE nQSegment);

// QX - Write Only
typedef BOOL (__stdcall *lpWriteQueueLoadAndExecute)(BYTE nCOMPort, BYTE nNodeID, BYTE nQSegment);

// RC - Write Only
typedef BOOL (__stdcall *lpWriteRegisterCounter)(BYTE nCOMPort, BYTE nNodeID, BYTE* nInputSensor, char* chInputStatus, BOOL bWithOptionalX);

// RD - Write Only
typedef BOOL (__stdcall *lpWriteRegisterDecrement)(BYTE nCOMPort, BYTE nNodeID, char chDataRegister);

// RE - Write Only
typedef BOOL (__stdcall *lpWriteRestart)(BYTE nCOMPort, BYTE nNodeID);

// RI - Write Only
typedef BOOL (__stdcall *lpWriteRegisterIncrement)(BYTE nCOMPort, BYTE nNodeID, char chDataRegister);

// RL - Read
typedef BOOL (__stdcall *lpReadRegisterLoad)(BYTE nCOMPort, BYTE nNodeID, char chDataRegister, int* nRegisterValue, BOOL immediately);

// RL - Write
typedef BOOL (__stdcall *lpWriteRegisterLoad)(BYTE nCOMPort, BYTE nNodeID, char chDataRegister, int nRegisterValue, BOOL immediately);

// RM - Write Only
typedef BOOL (__stdcall *lpWriteRegisterMove)(BYTE nCOMPort, BYTE nNodeID, char chRegister1, char chRegister2);

// RO - Read
typedef BOOL (__stdcall *lpReadAntiResonanceOn)(BYTE nCOMPort, BYTE nNodeID, BOOL* bAntiResonanceOn);

// RO - Write
typedef BOOL (__stdcall *lpWriteAntiResonanceOn)(BYTE nCOMPort, BYTE nNodeID, BOOL bAntiResonanceOn);

// RR - Write Only
typedef BOOL (__stdcall *lpWriteRegisterRead)(BYTE nCOMPort, BYTE nNodeID, char chRegister1, BYTE value);

// RS - Read Only
typedef BOOL (__stdcall *lpReadRequestStatus)(BYTE nCOMPort, BYTE nNodeID, LPTSTR* strStatusWord);

// RV - Write
typedef BOOL (__stdcall *lpReadRevisionLevel)(BYTE nCOMPort, BYTE nNodeID, BYTE* revisionLevel);

// RW - Write Only
typedef BOOL (__stdcall *lpWriteRegisterWrite)(BYTE nCOMPort, BYTE nNodeID, char chRegister1, BYTE chRegister2);

// R+ - Write Only
typedef BOOL (__stdcall *lpWriteRegisterAdd)(BYTE nCOMPort, BYTE nNodeID, char chRegister1, char chRegister2);

// R- - Write Only
typedef BOOL (__stdcall *lpWriteRegisterSubstract)(BYTE nCOMPort, BYTE nNodeID, char chRegister1, char chRegister2);

// R* - Write Only
typedef BOOL (__stdcall *lpWriteRegisterMultiply)(BYTE nCOMPort, BYTE nNodeID, char chRegister1, char chRegister2);

// R/ - Write Only
typedef BOOL (__stdcall *lpWriteRegisterDivide)(BYTE nCOMPort, BYTE nNodeID, char chRegister1, char chRegister2);

// R& - Write Only
typedef BOOL (__stdcall *lpWriteRegisterAnd)(BYTE nCOMPort, BYTE nNodeID, char chRegister1, char chRegister2);

// R| - Write Only
typedef BOOL (__stdcall *lpWriteRegisterOr)(BYTE nCOMPort, BYTE nNodeID, char chRegister1, char chRegister2);

// SA - Write Only
typedef BOOL (__stdcall *lpWriteSaveParameters)(BYTE nCOMPort, BYTE nNodeID);

// SC - Read Only
typedef BOOL (__stdcall *lpReadStatusCode)(BYTE nCOMPort, BYTE nNodeID, int* nStatusCode);

// SD - Read
typedef BOOL (__stdcall *lpReadSetDirection)(BYTE nCOMPort, BYTE nNodeID, BYTE* nDirection);

// SD - Write
typedef BOOL (__stdcall *lpWriteSetDirection)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, char chDirection);

// SF - Read
typedef BOOL (__stdcall *lpReadStepFilterFrequency)(BYTE nCOMPort, BYTE nNodeID, int* filter);

// SF - Write
typedef BOOL (__stdcall *lpWriteStepFilterFrequency)(BYTE nCOMPort, BYTE nNodeID, int filter);

// SH - Write Only
typedef BOOL (__stdcall *lpWriteSeekHome)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX);

// SI - Read
typedef BOOL (__stdcall *lpReadEnableInputUsage)(BYTE nCOMPort, BYTE nNodeID, BYTE* nInputUsage);

// SI - Write
typedef BOOL (__stdcall *lpWriteEnableInputUsage)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputUsage);

// SI - Read
typedef BOOL (__stdcall *lpReadEnableInputUsageFlexIO)(BYTE nCOMPort, BYTE nNodeID, BYTE* nInputUsage, BYTE* nInputSensor);

// SI - Write
typedef BOOL (__stdcall *lpWriteEnableInputUsageFlexIO)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, BYTE nInputUsage);

// SJ - Write Only
typedef BOOL (__stdcall *lpWriteStopJogging)(BYTE nCOMPort, BYTE nNodeID);

// SK - Write Only
typedef BOOL (__stdcall *lpWriteStopAndKill)(BYTE nCOMPort, BYTE nNodeID, BOOL bWithOptionD);

// SM - Write
typedef BOOL (__stdcall *lpWriteStopMove)(BYTE nCOMPort, BYTE nNodeID, char chDecelType);

// SO - Write Only
typedef BOOL (__stdcall *lpWriteSetOutput)(BYTE nCOMPort, BYTE nNodeID, BYTE nOutput, char nOutputCondition, BOOL bWithOptionalY);

// SP - Read
typedef BOOL (__stdcall *lpReadSetPosition)(BYTE nCOMPort, BYTE nNodeID, int* nSetPosition);

// SP - Write
typedef BOOL (__stdcall *lpWriteSetPosition)(BYTE nCOMPort, BYTE nNodeID, int nSetPosition);

// ST - Write Only
typedef BOOL (__stdcall *lpWriteStop)(BYTE nCOMPort, BYTE nNodeID, BOOL bWithOptionD);

// TD - Read
typedef BOOL (__stdcall *lpReadTransmitDelay)(BYTE nCOMPort, BYTE nNodeID, int* nTransmitDelay);

// TD - Write
typedef BOOL (__stdcall *lpWriteTransmitDelay)(BYTE nCOMPort, BYTE nNodeID, int nTransmitDelay);

// TI - Write Only
typedef BOOL (__stdcall *lpWriteTestInput)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX);

// TO - Read
typedef BOOL (__stdcall *lpReadTachOutput)(BYTE nCOMPort, BYTE nNodeID, int* nTachOutput);

// TO - Write
typedef BOOL (__stdcall *lpWriteTachOutput)(BYTE nCOMPort, BYTE nNodeID, int nTachOutput);

// TR - Write Only
typedef BOOL (__stdcall *lpWriteTestRegister)(BYTE nCOMPort, BYTE nNodeID, char chDataRegister, int nRegisterValue);

// TS - Write Only
typedef BOOL (__stdcall *lpWriteTimeStamp)(BYTE nCOMPort, BYTE nNodeID);

// TT - Read
typedef BOOL (__stdcall *lpReadPulseCompleteTiming)(BYTE nCOMPort, BYTE nNodeID, int* nPulseCompleteTiming);

// TT - Write
typedef BOOL (__stdcall *lpWritePulseCompleteTiming)(BYTE nCOMPort, BYTE nNodeID, int nPulseCompleteTiming);

// TV - Read
typedef BOOL (__stdcall *lpReadTorqueRipple)(BYTE nCOMPort, BYTE nNodeID, double* nTorqueRipple);

// TV - Write
typedef BOOL (__stdcall *lpWriteTorqueRipple)(BYTE nCOMPort, BYTE nNodeID, double nTorqueRipple);

// VC - Read
typedef BOOL (__stdcall *lpReadVelocityChange)(BYTE nCOMPort, BYTE nNodeID, double* nVelocityChange);

// VC - Write
typedef BOOL (__stdcall *lpWriteVelocityChange)(BYTE nCOMPort, BYTE nNodeID, double nVelocityChange);

// VE - Read
typedef BOOL (__stdcall *lpReadVelocity)(BYTE nCOMPort, BYTE nNodeID, double* dVelocity);

// VE - Write
typedef BOOL (__stdcall *lpWriteVelocity)(BYTE nCOMPort, BYTE nNodeID, double dVelocity);

// VI - Read
typedef BOOL (__stdcall *lpReadVelocityIntegratorConstant)(BYTE nCOMPort, BYTE nNodeID, int* nVelocityIntegratorConstant);

// VI - Write
typedef BOOL (__stdcall *lpWriteVelocityIntegratorConstant)(BYTE nCOMPort, BYTE nNodeID, int nVelocityIntegratorConstant);

// VL - Read
typedef BOOL (__stdcall *lpReadVoltageLimit)(BYTE nCOMPort, BYTE nNodeID, int* nVoltageLimit);

// VL - Write
typedef BOOL (__stdcall *lpWriteVoltageLimit)(BYTE nCOMPort, BYTE nNodeID, int nVoltageLimit);

// VM - Read
typedef BOOL (__stdcall *lpReadMaximumVelocity)(BYTE nCOMPort, BYTE nNodeID, double* dMaxVelocity);

// VM - Write
typedef BOOL (__stdcall *lpWriteMaximumVelocity)(BYTE nCOMPort, BYTE nNodeID, double dMaxVelocity);

// VP - Read
typedef BOOL (__stdcall *lpReadVelocityProportionalConstant)(BYTE nCOMPort, BYTE nNodeID, int* nVelocityProportionalConstant);

// VP - Write
typedef BOOL (__stdcall *lpWriteVelocityProportionalConstant)(BYTE nCOMPort, BYTE nNodeID, int nVelocityProportionalConstant);

// VR - Read
typedef BOOL (__stdcall *lpReadVelocityRipple)(BYTE nCOMPort, BYTE nNodeID, double* dVelocityRipple);

// VR - Write
typedef BOOL (__stdcall *lpWriteVelocityRipple)(BYTE nCOMPort, BYTE nNodeID, double dVelocityRipple);

// WD - Write Only
typedef BOOL (__stdcall *lpWriteWaitDelay)(BYTE nCOMPort, BYTE nNodeID, char chDataRegister);

// WI - Write Only
typedef BOOL (__stdcall *lpWriteWaitforInput)(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX);

// WM - Write Only
typedef BOOL (__stdcall *lpWriteWaitonMove)(BYTE nCOMPort, BYTE nNodeID);

// WP - Write Only
typedef BOOL (__stdcall *lpWriteWaitPosition)(BYTE nCOMPort, BYTE nNodeID);

// WT - Write
typedef BOOL (__stdcall *lpWriteWaitTime)(BYTE nCOMPort, BYTE nNodeID, double dWaitTime);

// ZC - Read
typedef BOOL (__stdcall *lpReadRegenResistorWattage)(BYTE nCOMPort, BYTE nNodeID, int* nRegenResistorWattage);

// ZC - Write
typedef BOOL (__stdcall *lpWriteRegenResistorWattage)(BYTE nCOMPort, BYTE nNodeID, int nRegenResistorWattage);

// ZR - Read
typedef BOOL (__stdcall *lpReadRegenResistorValue)(BYTE nCOMPort, BYTE nNodeID, int* nRegenResistorValue);

// ZR - Write
typedef BOOL (__stdcall *lpWriteRegenResistorValue)(BYTE nCOMPort, BYTE nNodeID, int nRegenResistorValue);

// ZT - Read
typedef BOOL (__stdcall *lpReadRegenResistorPeakTime)(BYTE nCOMPort, BYTE nNodeID, int* nRegenResistorPeakTime);

// ZT - Write
typedef BOOL (__stdcall *lpWriteRegenResistorPeakTime)(BYTE nCOMPort, BYTE nNodeID, int nRegenResistorPeakTime);


class SCLLibHelper  
{
private:
	HINSTANCE m_hDll; //DLL Handle
	BOOL m_bWasLoaded;
	BYTE m_nCOMPort;
	CRITICAL_SECTION _cs;

public:

	SCLLibHelper();
	virtual ~SCLLibHelper();

private:
	lpOnDataSend m_OnDataSend;
	lpOnDataReceive m_OnDataReceive;

	lpOpen m_Open;
	lpClose m_Close;
	lpSetCommParam m_SetCommParam;
	lpIsOpen m_IsOpen;
	lpFreeNewMemory m_FreeNewMemory;
	lpSetTriggerSendEvent m_SetTriggerSendEvent;
	lpSetTriggerReceiveEvent m_SetTriggerReceiveEvent;
	lpSetExecuteTimeOut m_SetExecuteTimeOut;
	lpGetExecuteTimeOut m_GetExecuteTimeOut;
	lpSendSCLCommand m_SendSCLCommand;
	lpExecuteSCLCommand m_ExecuteSCLCommand;
	lpGetLastCommandSent m_GetLastCommandSent;
	lpGetLastCommandReceived m_GetLastCommandReceived;
	lpGetLastErrorInfo m_GetLastErrorInfo;
	lpGetAllNodeIDMapping m_GetAllNodeIDMapping;
	lpSetAllNodeIDMapping m_SetAllNodeIDMapping;
	lpResetNodeIDMapping m_ResetNodeIDMapping;
	lpGetOneNodeIDMapping m_GetOneNodeIDMapping;
	lpSetOneNodeIDMapping m_SetOneNodeIDMapping;

	lpDriveEnable m_DriveEnable;
	lpSetDriveOutput m_SetDriveOutput;
	lpSetP2PProfile m_SetP2PProfile;
	lpSetJogProfile m_SetJogProfile;
	lpRelMove m_RelMove;
	lpAbsMove m_AbsMove;
	lpFeedtoSensor m_FeedtoSensor;
	lpP2PMoveWithVelocityChange m_P2PMoveWithVelocityChange;
	lpP2PMoveAndSetOutput m_P2PMoveAndSetOutput;
	lpFeedtoDoubleSensor m_FeedtoDoubleSensor;
	lpFeedtoSensorWithMaskDistance m_FeedtoSensorWithMaskDistance;
	lpSeekHome m_SeekHome;
	lpExtendedSeekHome m_ExtendedSeekHome;
	lpHardStopHoming m_HardStopHoming;
	lpIsMotorEnabled m_IsMotorEnabled;
	lpIsSampling m_IsSampling;
	lpIsInFault m_IsInFault;
	lpIsInPosition m_IsInPosition;
	lpIsMoving m_IsMoving;
	lpIsJogging m_IsJogging;
	lpIsStopping m_IsStopping;
	lpIsWaitingforInput m_IsWaitingforInput;
	lpIsSavingParam m_IsSavingParam;
	lpIsInAlarm m_IsInAlarm;
	lpIsHoming m_IsHoming;
	lpIsWaitingforTime m_IsWaitingforTime;
	lpIsRunningWizard m_IsRunningWizard;
	lpIsCheckingEncoder m_IsCheckingEncoder;
	lpIsRunningQProgram m_IsRunningQProgram;
	lpIsInitializingOrServoReady m_IsInitializingOrServoReady;
	lpIsInAlarmPositionLimit m_IsInAlarmPositionLimit;
	lpIsInAlarmCWLimit m_IsInAlarmCWLimit;
	lpIsInAlarmCCWLimit m_IsInAlarmCCWLimit;
	lpIsInAlarmOverTemp m_IsInAlarmOverTemp;
	lpIsInAlarmOverVoltage m_IsInAlarmOverVoltage;
	lpIsInAlarmUnderVoltage m_IsInAlarmUnderVoltage;
	lpIsInAlarmOverCurrent m_IsInAlarmOverCurrent;
	lpIsInAlarmEncoderFault m_IsInAlarmEncoderFault;
	lpIsInAlarmCommError m_IsInAlarmCommError;
	lpIsInAlarmBadFlash m_IsInAlarmBadFlash;
	lpIsInAlarmBlankQSegment m_IsInAlarmBlankQSegment;
	lpIsInAlarmMoveWhileDisabled m_IsInAlarmMoveWhileDisabled;
	lpIsInAlarmMoveWhileDisabledMSeries m_IsInAlarmMoveWhileDisabledMSeries;
	lpIsInAlarmACPowerPhasseLostMSeries m_IsInAlarmACPowerPhasseLostMSeries;
	lpIsInAlarmSafeTorqueOffMSeries m_IsInAlarmSafeTorqueOffMSeries;
	lpIsInAlarmVelocityLimitMSeries m_IsInAlarmVelocityLimitMSeries;
	lpIsInAlarmVoltageWarningMSeries m_IsInAlarmVoltageWarningMSeries;

	lpReadAccelerationRate m_ReadAccelerationRate;
	lpWriteAccelerationRate m_WriteAccelerationRate;
	lpReadAnalogDeadband m_ReadAnalogDeadband;
	lpWriteAnalogDeadband m_WriteAnalogDeadband;
	lpReadAnalogDeadbandWithChannel m_ReadAnalogDeadbandWithChannel;
	lpWriteAnalogDeadbandMSeries m_WriteAnalogDeadbandMSeries;
	lpReadAnalogFilter m_ReadAnalogFilter;
	lpWriteAnalogFilter m_WriteAnalogFilter;
	lpReadAnalogVelocityGain m_ReadAnalogVelocityGain;
	lpWriteAnalogVelocityGain m_WriteAnalogVelocityGain;
	lpReadAlarmResetInput m_ReadAlarmResetInput;
	lpWriteAlarmResetInput m_WriteAlarmResetInput;
	lpReadAlarmResetInputFlexIO m_ReadAlarmResetInputFlexIO;
	lpWriteAlarmResetInputFlexIO m_WriteAlarmResetInputFlexIO;
	lpReadAlarmCode m_ReadAlarmCode;
	lpReadAlarmCodeWithChannel m_ReadAlarmCodeWithChannel;
	lpReadMaxAcceleration m_ReadMaxAcceleration;
	lpWriteMaxAcceleration m_WriteMaxAcceleration;
	lpReadAnalogTorqueGain m_ReadAnalogTorqueGain;
	lpWriteAnalogTorqueGain m_WriteAnalogTorqueGain;
	lpReadAlarmOutput m_ReadAlarmOutput;
	lpWriteAlarmOutput m_WriteAlarmOutput;
	lpReadAlarmOutputFlexIO m_ReadAlarmOutputFlexIO;
	lpWriteAlarmOutputFlexIO m_WriteAlarmOutputFlexIO;
	lpReadAnalogPositionGain m_ReadAnalogPositionGain;
	lpWriteAnalogPositionGain m_WriteAnalogPositionGain;
	lpWriteAlarmReset m_WriteAlarmReset;
	lpReadAnalogScaling m_ReadAnalogScaling;
	lpWriteAnalogScaling m_WriteAnalogScaling;
	lpReadAnalogThreshold m_ReadAnalogThreshold;
	lpWriteAnalogThreshold m_WriteAnalogThreshold;
	lpReadAnalogOffset m_ReadAnalogOffset;
	lpWriteAnalogOffset m_WriteAnalogOffset;
	lpReadAnalogOffsetMSeries m_ReadAnalogOffsetMSeries;
	lpWriteAnalogOffsetMSeries m_WriteAnalogOffsetMSeries;
	lpWriteAnalogZero m_WriteAnalogZero;
	lpReadBrakeDisengageDelay m_ReadBrakeDisengageDelay;
	lpWriteBrakeDisengageDelay m_WriteBrakeDisengageDelay;
	lpReadBrakeEngageDelay m_ReadBrakeEngageDelay;
	lpWriteBrakeEngageDelay m_WriteBrakeEngageDelay;
	lpReadBrakeOutput m_ReadBrakeOutput;
	lpWriteBrakeOutput m_WriteBrakeOutput;
	lpReadBrakeOutputFlexIO m_ReadBrakeOutputFlexIO;
	lpWriteBrakeOutputFlexIO m_WriteBrakeOutputFlexIO;
	lpReadBaudRate m_ReadBaudRate;
	lpReadBufferStatus m_ReadBufferStatus;
	lpReadChangeAccelerationCurrent m_ReadChangeAccelerationCurrent;
	lpWriteChangeAccelerationCurrent m_WriteChangeAccelerationCurrent;
	lpReadChangeCurrent m_ReadChangeCurrent;
	lpWriteChangeCurrent m_WriteChangeCurrent;
	lpReadIdleCurrentDelayTime m_ReadIdleCurrentDelayTime;
	lpWriteIdleCurrentDelayTime m_WriteIdleCurrentDelayTime;
	lpReadCommunicationError m_ReadCommunicationError;
	lpReadAntiResonanceFilterFreq m_ReadAntiResonanceFilterFreq;
	lpWriteAntiResonanceFilterFreq m_WriteAntiResonanceFilterFreq;
	lpReadAntiResonanceFilterGain m_ReadAntiResonanceFilterGain;
	lpWriteAntiResonanceFilterGain m_WriteAntiResonanceFilterGain;
	lpReadChangeIdleCurrent m_ReadChangeIdleCurrent;
	lpWriteChangeIdleCurrent m_WriteChangeIdleCurrent;
	lpWriteCommenceJogging m_WriteCommenceJogging;
	lpReadCommandMode m_ReadCommandMode;
	lpWriteCommandMode m_WriteCommandMode;
	lpReadSecondaryCommandMode m_ReadSecondaryCommandMode;
	lpWriteSecondaryCommandMode m_WriteSecondaryCommandMode;
	lpReadChangePeakCurrent m_ReadChangePeakCurrent;
	lpWriteChangePeakCurrent m_WriteChangePeakCurrent;
	lpWriteCompareRegisters m_WriteCompareRegisters;
	lpReadChangeSpeed m_ReadChangeSpeed;
	lpWriteChangeSpeed m_WriteChangeSpeed;
	lpReadChangeDistance m_ReadChangeDistance;
	lpWriteChangeDistance m_WriteChangeDistance;
	lpReadDefaultDisplay m_ReadDefaultDisplay;
	lpWriteDefaultDisplay m_WriteDefaultDisplay;
	lpReadDecelerationRate m_ReadDecelerationRate;
	lpWriteDecelerationRate m_WriteDecelerationRate;
	lpReadDistanceOrPosition m_ReadDistanceOrPosition;
	lpWriteDistanceOrPosition m_WriteDistanceOrPosition;
	lpReadDefineLimits m_ReadDefineLimits;
	lpWriteDefineLimits m_WriteDefineLimits;
	lpReadDumpingPower m_ReadDumpingPower;
	lpWriteDumpingPower m_WriteDumpingPower;
	lpWriteDataRegisterforCapture m_WriteDataRegisterforCapture;
	lpReadSwitchingElectronicGearing m_ReadSwitchingElectronicGearing;
	lpWriteSwitchingElectronicGearing m_WriteSwitchingElectronicGearing;
	lpReadEncoderDirection m_ReadEncoderDirection;
	lpWriteEncoderDirection m_WriteEncoderDirection;
	lpReadEncoderFunction m_ReadEncoderFunction;
	lpWriteEncoderFunction m_WriteEncoderFunction;
	lpReadElectronicGearing m_ReadElectronicGearing;
	lpWriteElectronicGearing m_WriteElectronicGearing;
	lpWriteExtendedHoming m_WriteExtendedHoming;
	lpReadInputNoiseFilter m_ReadInputNoiseFilter;
	lpWriteInputNoiseFilter m_WriteInputNoiseFilter;
	lpReadElectronicGearingRatioNumerator m_ReadElectronicGearingRatioNumerator;
	lpWriteElectronicGearingRatioNumerator m_WriteElectronicGearingRatioNumerator;
	lpReadEncoderPosition m_ReadEncoderPosition;
	lpWriteEncoderPosition m_WriteEncoderPosition;
	lpReadEncoderResolution m_ReadEncoderResolution;
	lpWriteEncoderResolution m_WriteEncoderResolution;
	lpReadSingleEndedEncoderUsage m_ReadSingleEndedEncoderUsage;
	lpWriteSingleEndedEncoderUsage m_WriteSingleEndedEncoderUsage;
	lpReadElectronicGearingRatioDenominator m_ReadElectronicGearingRatioDenominator;
	lpWriteElectronicGearingRatioDenominator m_WriteElectronicGearingRatioDenominator;
	lpReadFunctionofAnalogInput m_ReadFunctionofAnalogInput;
	lpWriteFunctionofAnalogInput m_WriteFunctionofAnalogInput;
	lpWriteFeedtoLengthwithSpeedChange m_WriteFeedtoLengthwithSpeedChange;
	lpWriteFeedtoDoubleSensor m_WriteFeedtoDoubleSensor;
	lpWriteFollowEncoder m_WriteFollowEncoder;
	lpWriteFindHome m_WriteFindHome;
	lpReadFilterInput m_ReadFilterInput;
	lpWriteFilterInput m_WriteFilterInput;
	lpWriteFeedtoLength m_WriteFeedtoLength;
	lpWriteFeedtoSensorwithMaskDistance m_WriteFeedtoSensorwithMaskDistance;
	lpWriteFeedtoLengthandSetOutput m_WriteFeedtoLengthandSetOutput;
	lpWriteFeedtoPosition m_WriteFeedtoPosition;
	lpWriteFeedtoSensor m_WriteFeedtoSensor;
	lpReadFilterSelectInputs m_ReadFilterSelectInputs;
	lpWriteFilterSelectInputs m_WriteFilterSelectInputs;
	lpWriteFeedtoSensorwithSafetyDistance m_WriteFeedtoSensorwithSafetyDistance;
	lpReadCurrentCommand m_ReadCurrentCommand;
	lpWriteCurrentCommand m_WriteCurrentCommand;
	lpReadGlobalGainSelection m_ReadGlobalGainSelection;
	lpWriteGlobalGainSelection m_WriteGlobalGainSelection;
	lpReadHomingAcceleration m_ReadHomingAcceleration;
	lpWriteHomingAcceleration m_WriteHomingAcceleration;
	lpReadHardStopCurrent m_ReadHardStopCurrent;
	lpWriteHardStopCurrent m_WriteHardStopCurrent;
	lpReadHardStopFaultDelay m_ReadHardStopFaultDelay;
	lpWriteHardStopFaultDelay m_WriteHardStopFaultDelay;
	lpReadHarmonicFilterGain m_ReadHarmonicFilterGain;
	lpWriteHarmonicFilterGain m_WriteHarmonicFilterGain;
	lpReadHomingDeceleration m_ReadHomingDeceleration;
	lpWriteHomingDeceleration m_WriteHomingDeceleration;
	lpReadHomingOffset m_ReadHomingOffset;
	lpWriteHomingOffset m_WriteHomingOffset;
	lpReadHarmonicFilterPhase m_ReadHarmonicFilterPhase;
	lpWriteHarmonicFilterPhase m_WriteHarmonicFilterPhase;
	lpWriteHardStopHoming m_WriteHardStopHoming;
	lpReadHomingVelocity m_ReadHomingVelocity;
	lpWriteHomingVelocity m_WriteHomingVelocity;
	lpWriteHandWheel m_WriteHandWheel;
	lpReadImmediateAnalog m_ReadImmediateAnalog;
	lpReadImmediateAnalogWithChannel m_ReadImmediateAnalogWithChannel;
	lpReadImmediateCommandedCurrent m_ReadImmediateCommandedCurrent;
	lpReadImmediateDistance m_ReadImmediateDistance;
	lpReadImmediateEncoder m_ReadImmediateEncoder;
	lpReadHexFormat m_ReadHexFormat;
	lpWriteImmediateHighOutput m_WriteImmediateHighOutput;
	lpWriteImmediateLowOutput m_WriteImmediateLowOutput;
	lpReadOutputStatus m_ReadOutputStatus;
	lpWriteOutputStatus m_WriteOutputStatus;
	lpReadImmediatePosition m_ReadImmediatePosition;
	lpReadImmediateActualCurrent m_ReadImmediateActualCurrent;
	lpReadInputStatus m_ReadInputStatus;
	lpReadImmediateTemperature m_ReadImmediateTemperature;
	lpReadImmediateTemperatureWithChannel m_ReadImmediateTemperatureWithChannel;
	lpReadImmediateVoltage m_ReadImmediateVoltage;
	lpReadImmediateVoltageWithChannel m_ReadImmediateVoltageWithChannel;
	lpReadImmediateActualVelocity m_ReadImmediateActualVelocity;
	lpReadImmediateTargetVelocity m_ReadImmediateTargetVelocity;
	lpReadImmediatePositionError m_ReadImmediatePositionError;
	lpReadJogAcceleration m_ReadJogAcceleration;
	lpWriteJogAcceleration m_WriteJogAcceleration;
	lpReadVelocityModeSecondSpeed m_ReadVelocityModeSecondSpeed;
	lpWriteVelocityModeSecondSpeed m_WriteVelocityModeSecondSpeed;
	lpReadVelocityModeSecondSpeedMSeries m_ReadVelocityModeSecondSpeedMSeries;
	lpWriteVelocityModeSecondSpeedMSeries m_WriteVelocityModeSecondSpeedMSeries;
	lpWriteJogDisable m_WriteJogDisable;
	lpWriteJogEnable m_WriteJogEnable;
	lpReadJogDeceleration m_ReadJogDeceleration;
	lpWriteJogDeceleration m_WriteJogDeceleration;
	lpReadJogMode m_ReadJogMode;
	lpWriteJogMode m_WriteJogMode;
	lpReadJogSpeed m_ReadJogSpeed;
	lpWriteJogSpeed m_WriteJogSpeed;
	lpReadOverallServoFilter m_ReadOverallServoFilter;
	lpWriteOverallServoFilter m_WriteOverallServoFilter;
	lpReadDifferentialConstant m_ReadDifferentialConstant;
	lpWriteDifferentialConstant m_WriteDifferentialConstant;
	lpReadDifferentialFilter m_ReadDifferentialFilter;
	lpWriteDifferentialFilter m_WriteDifferentialFilter;
	lpReadVelocityFeedforwardConstant m_ReadVelocityFeedforwardConstant;
	lpWriteVelocityFeedforwardConstant m_WriteVelocityFeedforwardConstant;
	lpReadSecondaryGlobalGain m_ReadSecondaryGlobalGain;
	lpWriteSecondaryGlobalGain m_WriteSecondaryGlobalGain;
	lpReadIntegratorConstant m_ReadIntegratorConstant;
	lpWriteIntegratorConstant m_WriteIntegratorConstant;
	lpReadJerkFilterFrequency m_ReadJerkFilterFrequency;
	lpWriteJerkFilterFrequency m_WriteJerkFilterFrequency;
	lpReadInertiaFeedforwardConstant m_ReadInertiaFeedforwardConstant;
	lpWriteInertiaFeedforwardConstant m_WriteInertiaFeedforwardConstant;
	lpReadProportionalConstant m_ReadProportionalConstant;
	lpWriteProportionalConstant m_WriteProportionalConstant;
	lpReadVelocityFeedbackConstant m_ReadVelocityFeedbackConstant;
	lpWriteVelocityFeedbackConstant m_WriteVelocityFeedbackConstant;
	lpReadLeadAngleMaxValue m_ReadLeadAngleMaxValue;
	lpWriteLeadAngleMaxValue m_WriteLeadAngleMaxValue;
	lpReadSoftwareLimitCCW m_ReadSoftwareLimitCCW;
	lpWriteSoftwareLimitCCW m_WriteSoftwareLimitCCW;
	lpReadSoftwareLimitCW m_ReadSoftwareLimitCW;
	lpWriteSoftwareLimitCW m_WriteSoftwareLimitCW;
	lpReadLeadAngleSpeed m_ReadLeadAngleSpeed;
	lpWriteLeadAngleSpeed m_WriteLeadAngleSpeed;
	lpReadLowVoltageThreshold m_ReadLowVoltageThreshold;
	lpWriteLowVoltageThreshold m_WriteLowVoltageThreshold;
	lpWriteMotorDisable m_WriteMotorDisable;
	lpWriteMotorEnable m_WriteMotorEnable;
	lpReadModelNumber m_ReadModelNumber;
	lpReadMotionOutput m_ReadMotionOutput;
	lpWriteMotionOutput m_WriteMotionOutput;
	lpReadMotionOutputFlexIO m_ReadMotionOutputFlexIO;
	lpWriteMotionOutputFlexIO m_WriteMotionOutputFlexIO;
	lpReadMotionOutputMSeries m_ReadMotionOutputMSeries;
	lpWriteMotionOutputMSeries m_WriteMotionOutputMSeries;
	lpReadMicrostepResolution m_ReadMicrostepResolution;
	lpWriteMicrostepResolution m_WriteMicrostepResolution;
	lpReadControlModeSelection m_ReadControlModeSelection;
	lpWriteControlModeSelection m_WriteControlModeSelection;
	lpReadMultiTasking m_ReadMultiTasking;
	lpWriteMultiTasking m_WriteMultiTasking;
	lpReadModelRevision m_ReadModelRevision;
	lpWriteOnFault m_WriteOnFault;
	lpWriteOnInput m_WriteOnInput;
	lpReadOptionBoard m_ReadOptionBoard;
	lpReadPowerupAccelerationCurrent m_ReadPowerupAccelerationCurrent;
	lpWritePowerupAccelerationCurrent m_WritePowerupAccelerationCurrent;
	lpReadPowerupBaudRate m_ReadPowerupBaudRate;
	lpWritePowerupBaudRate m_WritePowerupBaudRate;
	lpReadPowerupCurrent m_ReadPowerupCurrent;
	lpWritePowerupCurrent m_WritePowerupCurrent;
	lpReadInPositionCounts m_ReadInPositionCounts;
	lpWriteInPositionCounts m_WriteInPositionCounts;
	lpReadInPositionTiming m_ReadInPositionTiming;
	lpWriteInPositionTiming m_WriteInPositionTiming;
	lpReadPositionFault m_ReadPositionFault;
	lpWritePositionFault m_WritePositionFault;
	lpReadInhibitionOfPulseCommand m_ReadInhibitionOfPulseCommand;
	lpWriteInhibitionOfPulseCommand m_WriteInhibitionOfPulseCommand;
	lpReadPowerupIdleCurrent m_ReadPowerupIdleCurrent;
	lpWritePowerupIdleCurrent m_WritePowerupIdleCurrent;
	lpReadParameterLock m_ReadParameterLock;
	lpWriteParameterLock m_WriteParameterLock;
	lpReadPositionLimit m_ReadPositionLimit;
	lpWritePositionLimit m_WritePositionLimit;
	lpReadPowerupMode m_ReadPowerupMode;
	lpWritePowerupMode m_WritePowerupMode;
	lpWriteProbeonDemand m_WriteProbeonDemand;
	lpReadPowerupPeakCurrent m_ReadPowerupPeakCurrent;
	lpWritePowerupPeakCurrent m_WritePowerupPeakCurrent;
	lpReadProtocol m_ReadProtocol;
	lpReadPulseType m_ReadPulseType;
	lpWritePulseType m_WritePulseType;
	lpReadSecondaryElectronicGearing m_ReadSecondaryElectronicGearing;
	lpWriteSecondaryElectronicGearing m_WriteSecondaryElectronicGearing;
	lpWritePassword m_WritePassword;
	lpWriteQueueCall m_WriteQueueCall;
	lpWriteQueueDelete m_WriteQueueDelete;
	lpWriteQueueExecute m_WriteQueueExecute;
	lpWriteQueueGoto m_WriteQueueGoto;
	lpWriteQueueJump m_WriteQueueJump;
	lpWriteQueueKill m_WriteQueueKill;
	lpWriteQueueLoad m_WriteQueueLoad;
	lpWriteQueueRepeat m_WriteQueueRepeat;
	lpWriteQueueSave m_WriteQueueSave;
	lpWriteQueueLoadAndExecute m_WriteQueueLoadAndExecute;
	lpWriteRegisterCounter m_WriteRegisterCounter;
	lpWriteRegisterDecrement m_WriteRegisterDecrement;
	lpWriteRestart m_WriteRestart;
	lpWriteRegisterIncrement m_WriteRegisterIncrement;
	lpReadRegisterLoad m_ReadRegisterLoad;
	lpWriteRegisterLoad m_WriteRegisterLoad;
	lpWriteRegisterMove m_WriteRegisterMove;
	lpReadAntiResonanceOn m_ReadAntiResonanceOn;
	lpWriteAntiResonanceOn m_WriteAntiResonanceOn;
	lpWriteRegisterRead m_WriteRegisterRead;
	lpReadRequestStatus m_ReadRequestStatus;
	lpReadRevisionLevel m_ReadRevisionLevel;
	lpWriteRegisterWrite m_WriteRegisterWrite;
	lpWriteRegisterAdd m_WriteRegisterAdd;
	lpWriteRegisterSubstract m_WriteRegisterSubstract;
	lpWriteRegisterMultiply m_WriteRegisterMultiply;
	lpWriteRegisterDivide m_WriteRegisterDivide;
	lpWriteRegisterAnd m_WriteRegisterAnd;
	lpWriteRegisterOr m_WriteRegisterOr;
	lpWriteSaveParameters m_WriteSaveParameters;
	lpReadStatusCode m_ReadStatusCode;
	lpReadSetDirection m_ReadSetDirection;
	lpWriteSetDirection m_WriteSetDirection;
	lpReadStepFilterFrequency m_ReadStepFilterFrequency;
	lpWriteStepFilterFrequency m_WriteStepFilterFrequency;
	lpWriteSeekHome m_WriteSeekHome;
	lpReadEnableInputUsage m_ReadEnableInputUsage;
	lpWriteEnableInputUsage m_WriteEnableInputUsage;
	lpReadEnableInputUsageFlexIO m_ReadEnableInputUsageFlexIO;
	lpWriteEnableInputUsageFlexIO m_WriteEnableInputUsageFlexIO;
	lpWriteStopJogging m_WriteStopJogging;
	lpWriteStopAndKill m_WriteStopAndKill;
	lpWriteStopMove m_WriteStopMove;
	lpWriteSetOutput m_WriteSetOutput;
	lpReadSetPosition m_ReadSetPosition;
	lpWriteSetPosition m_WriteSetPosition;
	lpWriteStop m_WriteStop;
	lpReadTransmitDelay m_ReadTransmitDelay;
	lpWriteTransmitDelay m_WriteTransmitDelay;
	lpWriteTestInput m_WriteTestInput;
	lpReadTachOutput m_ReadTachOutput;
	lpWriteTachOutput m_WriteTachOutput;
	lpWriteTestRegister m_WriteTestRegister;
	lpWriteTimeStamp m_WriteTimeStamp;
	lpReadPulseCompleteTiming m_ReadPulseCompleteTiming;
	lpWritePulseCompleteTiming m_WritePulseCompleteTiming;
	lpReadTorqueRipple m_ReadTorqueRipple;
	lpWriteTorqueRipple m_WriteTorqueRipple;
	lpReadVelocityChange m_ReadVelocityChange;
	lpWriteVelocityChange m_WriteVelocityChange;
	lpReadVelocity m_ReadVelocity;
	lpWriteVelocity m_WriteVelocity;
	lpReadVelocityIntegratorConstant m_ReadVelocityIntegratorConstant;
	lpWriteVelocityIntegratorConstant m_WriteVelocityIntegratorConstant;
	lpReadVoltageLimit m_ReadVoltageLimit;
	lpWriteVoltageLimit m_WriteVoltageLimit;
	lpReadMaximumVelocity m_ReadMaximumVelocity;
	lpWriteMaximumVelocity m_WriteMaximumVelocity;
	lpReadVelocityProportionalConstant m_ReadVelocityProportionalConstant;
	lpWriteVelocityProportionalConstant m_WriteVelocityProportionalConstant;
	lpReadVelocityRipple m_ReadVelocityRipple;
	lpWriteVelocityRipple m_WriteVelocityRipple;
	lpWriteWaitDelay m_WriteWaitDelay;
	lpWriteWaitforInput m_WriteWaitforInput;
	lpWriteWaitonMove m_WriteWaitonMove;
	lpWriteWaitPosition m_WriteWaitPosition;
	lpWriteWaitTime m_WriteWaitTime;
	lpReadRegenResistorWattage m_ReadRegenResistorWattage;
	lpWriteRegenResistorWattage m_WriteRegenResistorWattage;
	lpReadRegenResistorValue m_ReadRegenResistorValue;
	lpWriteRegenResistorValue m_WriteRegenResistorValue;
	lpReadRegenResistorPeakTime m_ReadRegenResistorPeakTime;
	lpWriteRegenResistorPeakTime m_WriteRegenResistorPeakTime;	

public:
	// Open Serial Port
	BOOL Open(BYTE nCOMPort, int nBaudRate);

	// Close
	BOOL Close();
	
	// Close
	BOOL SetCommParam(BYTE nNodeID, BOOL bSave);

	// return port is open or not
	BOOL IsOpen();

	// free memory
	BOOL FreeNewMemory(void* pBuffer);

	// Set when send data, trigger Send event or not
	void SetTriggerSendEvent(BOOL bTriggerSendEvent);

	// Set when received data, trigger Send event or not
	void SetTriggerReceiveEvent(BOOL bTriggerReceiveEvent);

	// Set when send data, trigger Send event or not
	void SetExecuteTimeOut(UINT nExecuteTimeOut);

	// Set when received data, trigger Send event or not
	UINT GetExecuteTimeOut(BYTE nCOMPort);

	// Send SCL Command
	BOOL SendSCLCommand(BYTE nNodeID, LPCTSTR pCommand);

	// Send SCL Command and Return drive's response
	//BOOL ExecuteSCLCommand(BYTE nNodeID, LPCTSTR pCommand, LPTSTR* strResponse); // Release memory in the end to avoid memory leak.
	BOOL ExecuteSCLCommand(BYTE nNodeID, LPCTSTR pCommand, CString& strResponse);

	// Get Last Command sent
	BOOL GetLastCommandSent(COMMAND_INFO& commandInfo);

	// Get Last Command received
	BOOL GetLastCommandReceived(COMMAND_INFO& commandInfo);

	// Get Last Error Information
	void GetLastErrorInfo(PERROR_INFO pErrorInfo);
	
	// Get Node ID Mapping Settings for All drives
	//BOOL GetAllNodeIDMapping(LPTSTR* strNodeIDMapping); // Release memory in the end to avoid memory leak.
	BOOL GetAllNodeIDMapping(CString& strNodeIDMapping);

	// Set Node ID Mapping Settings for All drives
	BOOL SetAllNodeIDMapping(LPTSTR strNodeIDMapping);

	// Reset Node ID Mapping Settings
	BOOL ResetNodeIDMapping(BYTE nCOMPort);

	// Get Node ID Mapping Settings for one drive
	BOOL GetOneNodeIDMapping(BYTE nNodeID, char* chRS485Address);

	// Set Node ID Mapping Settings for one drive
	BOOL SetOneNodeIDMapping(BYTE nNodeID, char chRS485Address);
	
	// Advanced Functions Start
	BOOL DriveEnable(BYTE nNodeID, BOOL bEnable);

	BOOL SetDriveOutput(BYTE nNodeID, BYTE nOutput1, char chOutputStatus1, BYTE* nOutput2 = NULL, char* chOutputStatus2 = NULL, BYTE* nOutput3 = NULL, char* chOutputStatus3 = NULL, BYTE* nOutput4 = NULL, char* chOutputStatus4 = NULL, BYTE* nOutput5 = NULL, char* chOutputStatus5 = NULL, BYTE* nOutput6 = NULL, char* chOutputStatus6 = NULL);

	BOOL SetP2PProfile(BYTE nNodeID, double* dVelocity, double* dAccel, double* dDecel);

	BOOL SetJogProfile(BYTE nNodeID, double* dVelocity, double* dAccel, double* dDecel);

	BOOL RelMove(BYTE nNodeID, int nDistance, double* dVelocity, double* dAccel, double* dDecel);

	BOOL AbsMove(BYTE nNodeID, int nDistance, double* dVelocity, double* dAccel, double* dDecel);

	BOOL FeedtoSensor(BYTE nCOMPort, BYTE nNodeID, int* nStopDistance, BYTE nInputSensor, char chInputStatus, double* dVelocity, double* dAccel, double* dDecel);

	BOOL P2PMoveWithVelocityChange(BYTE nCOMPort, BYTE nNodeID, int* nDistance1, int* nDistance2, BYTE* nInputSensor, char* chInputStatus, double* dVelocity1, double* dVelocity2, double* dAccel, double* dDecel);

	BOOL P2PMoveAndSetOutput(BYTE nCOMPort, BYTE nNodeID, int* nMoveDistance, int* nSetOutputDistance, BYTE nOutput, char chOutputStatus, double* dVelocity, double* dAccel, double* dDecel);

	BOOL FeedtoDoubleSensor(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor1, char chCondition1, BYTE nInputSensor2, char chCondition2, double* dVelocity, double* dAccel, double* dDecel);

	BOOL FeedtoSensorWithMaskDistance(BYTE nCOMPort, BYTE nNodeID, int* nStopDistance, int* nMaskDistance, BYTE nInputSensor, char chInputStatus, double* dVelocity, double* dAccel, double* dDecel);

    BOOL SeekHome(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, double* dVelocity, double* dAccel, double* dDecel);

	BOOL SeekHome(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, char chInputStatus, double* dVelocity, double* dAccel, double* dDecel);

	BOOL ExtendedSeekHome(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, char chInputStatus, double* dVelocity1, double* dVelocity2, double* dVelocity3, double* dAccel1, double* dAccel2, double* dAccel3, double* dDecel1, double* dDecel2, double* dDecel3);

	BOOL HardStopHoming(BYTE nCOMPort, int nNodeID, BOOL bWithIndex, double* dVelocity1, double* dVelocity2, double* dVelocity3, double* dAccel1, double* dAccel2, double* dAccel3, double* dDecel1, double* dDecel2, double* dDecel3);

	BOOL IsMotorEnabled(BYTE nNodeID);

	BOOL IsSampling(BYTE nNodeID);

	BOOL IsInFault(BYTE nNodeID);

	BOOL IsInPosition(BYTE nNodeID);

	BOOL IsMoving(BYTE nNodeID);

	BOOL IsJogging(BYTE nNodeID);

	BOOL IsStopping(BYTE nNodeID);

	BOOL IsWaitingforInput(BYTE nNodeID);

	BOOL IsSavingParam(BYTE nNodeID);

	BOOL IsInAlarm(BYTE nNodeID);

	BOOL IsHoming(BYTE nNodeID);

	BOOL IsWaitingforTime(BYTE nNodeID);

	BOOL IsRunningWizard(BYTE nNodeID);

	BOOL IsCheckingEncoder(BYTE nNodeID);

	BOOL IsRunningQProgram(BYTE nNodeID);

	BOOL IsInitializingOrServoReady(BYTE nNodeID);

	BOOL IsInAlarmPositionLimit(BYTE nNodeID);

	BOOL IsInAlarmCWLimit(BYTE nNodeID);

	BOOL IsInAlarmCCWLimit(BYTE nNodeID);

	BOOL IsInAlarmOverTemp(BYTE nNodeID);

	BOOL IsInAlarmOverVoltage(BYTE nNodeID);

	BOOL IsInAlarmUnderVoltage(BYTE nNodeID);

	BOOL IsInAlarmOverCurrent(BYTE nNodeID);

	BOOL IsInAlarmEncoderFault(BYTE nNodeID);

	BOOL IsInAlarmCommError(BYTE nNodeID);

	BOOL IsInAlarmBadFlash(BYTE nNodeID);

	BOOL IsInAlarmBlankQSegment(BYTE nNodeID);

	BOOL IsInAlarmMoveWhileDisabled(BYTE nNodeID);

	BOOL IsInAlarmMoveWhileDisabledMSeries(BYTE nNodeID);

	BOOL IsInAlarmACPowerPhasseLostMSeries(BYTE nNodeID);

	BOOL IsInAlarmSafeTorqueOffMSeries(BYTE nNodeID);

	BOOL IsInAlarmVelocityLimitMSeries(BYTE nNodeID);

	BOOL IsInAlarmVoltageWarningMSeries(BYTE nNodeID);

	// AC - Read
	BOOL ReadAccelerationRate(BYTE nNodeID, double* dAccel);

	// AC - Write
	BOOL WriteAccelerationRate(BYTE nNodeID, double dAccel);

	// AD - Read
	BOOL ReadAnalogDeadband(BYTE nNodeID, BYTE* nAnalogDeadband);

	// AD - Write
	BOOL WriteAnalogDeadband(BYTE nNodeID, BYTE nAnalogDeadband);

	// AD for M Series - Read
	BOOL ReadAnalogDeadbandWithChannel(BYTE nNodeID, BYTE nAnalogChannel, BYTE* nAnalogDeadband);

	// AD for M Series - Write
	BOOL WriteAnalogDeadbandWithChannel(BYTE nNodeID, BYTE nAnalogChannel, BYTE nAnalogDeadband);

	// AF - Read
	BOOL ReadAnalogFilter(BYTE nNodeID, int* filter);

	// AF - Write
	BOOL WriteAnalogFilter(BYTE nNodeID, int filter);

	// AG - Read
	BOOL ReadAnalogVelocityGain(BYTE nNodeID, int* velocityGain);

	// AG - Write
	BOOL WriteAnalogVelocityGain(BYTE nNodeID, int velocityGain);

	// AI - Read
	BOOL ReadAlarmResetInput(BYTE nNodeID, BYTE* nInputUsage);

	// AI - Write
	BOOL WriteAlarmResetInput(BYTE nNodeID, BYTE nInputUsage);

	// AI - Read
	BOOL ReadAlarmResetInputFlexIO(BYTE nNodeID, BYTE* nInputUsage, BYTE* nInputSensor);

	// AI - Write
	BOOL WriteAlarmResetInputFlexIO(BYTE nNodeID, BYTE nInputUsage, BYTE nInputSensor);

	// AL - Read Only
	BOOL ReadAlarmCode(BYTE nNodeID, int* nAlarmCode);

	BOOL ReadAlarmCodeWithChannel(BYTE nNodeID, BYTE nChannel, int* nAlarmCode);

	// AM - Read
	BOOL ReadMaxAcceleration(BYTE nNodeID, double* maxAcceleration);

	// AM - Write
	BOOL WriteMaxAcceleration(BYTE nNodeID, double maxAcceleration);

	// AN - Read
	BOOL ReadAnalogTorqueGain(BYTE nNodeID, double* analogTorqueGain);

	// AN - Write
	BOOL WriteAnalogTorqueGain(BYTE nNodeID, double analogTorqueGain);

	// AO - Read
	BOOL ReadAlarmOutput(BYTE nNodeID, BYTE* alarmOutput);

	// AO - Write
	BOOL WriteAlarmOutput(BYTE nNodeID, BYTE alarmOutput);

	// AO - Read
	BOOL ReadAlarmOutputFlexIO(BYTE nNodeID, BYTE* nOutput, BYTE* nInputUsage);

	// AO - Write
	BOOL WriteAlarmOutputFlexIO(BYTE nNodeID, BYTE nOutput, BYTE alarmOutput);

	// AP - Read
	BOOL ReadAnalogPositionGain(BYTE nNodeID, int* positionGain);

	// AP - Write
	BOOL WriteAnalogPositionGain(BYTE nNodeID, int positionGain);

	// AR - Write Only
	BOOL WriteAlarmReset(BYTE nNodeID, BOOL bImmediately);

	// AS - Read
	BOOL ReadAnalogScaling(BYTE nNodeID, BYTE* scaling);

	// AS - Write
	BOOL WriteAnalogScaling(BYTE nNodeID, BYTE scaling);

	// AT - Read
	BOOL ReadAnalogThreshold(BYTE nNodeID, double* analogThreshold);

	// AT - Write
	BOOL WriteAnalogThreshold(BYTE nNodeID, double analogThreshold);

	// AV - Read
	BOOL ReadAnalogOffset(BYTE nNodeID, double* dAnalogOffset);

	// AV - Write
	BOOL WriteAnalogOffset(BYTE nNodeID, double dAnalogOffset);

	// AV for M Series - Read
	BOOL ReadAnalogOffsetMSeries(BYTE nNodeID, BYTE nAnalogChannel, double* dAnalogOffset);

	// AV for M Series - Write
	BOOL WriteAnalogOffsetMSeries(BYTE nNodeID, BYTE nAnalogChannel, double dAnalogOffset);

	// AZ - Write Only
	BOOL WriteAnalogZero(BYTE nNodeID);

	// BD - Read
	BOOL ReadBrakeDisengageDelay(BYTE nNodeID, double* brakeDisengageDelay);

	// BD - Write
	BOOL WriteBrakeDisengageDelay(BYTE nNodeID, double brakeDisengageDelay);

	// BE - Read
	BOOL ReadBrakeEngageDelay(BYTE nNodeID, double* brakeEngageDelay);

	// BE - Write
	BOOL WriteBrakeEngageDelay(BYTE nNodeID, double brakeEngageDelay);

	// BO - Read
	BOOL ReadBrakeOutput(BYTE nNodeID, BYTE* nInputUsage);

	// BO - Write
	BOOL WriteBrakeOutput(BYTE nNodeID, BYTE nInputUsage);

	// BO - Read
	BOOL ReadBrakeOutputFlexIO(BYTE nNodeID, BYTE* nOutput, BYTE* nBreakOutput);

	// BO - Write
	BOOL WriteBrakeOutputFlexIO(BYTE nNodeID, BYTE nOutput, BYTE nBreakOutput);

	// BR - Read
	BOOL ReadBaudRate(BYTE nNodeID, BYTE* nBaudRate);

	// BS - Read Only
	BOOL ReadBufferStatus(BYTE nNodeID, BYTE* bufferStatus);

	// CA - Read
	BOOL ReadChangeAccelerationCurrent(BYTE nNodeID, double* changeAccelerationCurrent);

	// CA - Write
	BOOL WriteChangeAccelerationCurrent(BYTE nNodeID, double changeAccelerationCurrent);

	// CC - Read
	BOOL ReadChangeCurrent(BYTE nNodeID, double* changeCurrent);

	// CC - Write
	BOOL WriteChangeCurrent(BYTE nNodeID, double changeCurrent);

	// CD - Read
	BOOL ReadIdleCurrentDelayTime(BYTE nNodeID, double* idleCurrentDelayTime);

	// CD - Write
	BOOL WriteIdleCurrentDelayTime(BYTE nNodeID, double idleCurrentDelayTime);

	// CE - Read Only
	BOOL ReadCommunicationError(BYTE nNodeID, int* communicationError);

	// CF - Read
	BOOL ReadAntiResonanceFilterFreq(BYTE nNodeID, int* antiResonanceFilterFreq);

	// CF - Write
	BOOL WriteAntiResonanceFilterFreq(BYTE nNodeID, int antiResonanceFilterFreq);

	// CG - Read
	BOOL ReadAntiResonanceFilterGain(BYTE nNodeID, int* antiResonanceFilterGain);

	// CG - Write
	BOOL WriteAntiResonanceFilterGain(BYTE nNodeID, int antiResonanceFilterGain);

	// CI - Read
	BOOL ReadChangeIdleCurrent(BYTE nNodeID, double* changeIdleCurrent);

	// CI - Write
	BOOL WriteChangeIdleCurrent(BYTE nNodeID, double changeIdleCurrent);

	// CJ - Write Only
	BOOL WriteCommenceJogging(BYTE nNodeID);

	// CM - Read
	BOOL ReadCommandMode(BYTE nNodeID, BYTE* nCommandMode);

	// CM - Write
	BOOL WriteCommandMode(BYTE nNodeID, BYTE nCommandMode);

	// CN - Read
	BOOL ReadSecondaryCommandMode(BYTE nNodeID, BYTE* nCommandMode);

	// CN - Write
	BOOL WriteSecondaryCommandMode(BYTE nNodeID, BYTE nCommandMode);

	// CP - Read
	BOOL ReadChangePeakCurrent(BYTE nNodeID, double* dChangePeakCurrent);

	// CP - Write
	BOOL WriteChangePeakCurrent(BYTE nNodeID, double dChangePeakCurrent);

	// CR - Write Only
	BOOL WriteCompareRegisters(BYTE nNodeID, char chRegister1, char chRegister2);

	// CS - Read
	BOOL ReadChangeSpeed(BYTE nNodeID, double* dChangeSpeed);

	// CS - Write
	BOOL WriteChangeSpeed(BYTE nNodeID, double dChangeSpeed);

	// DC - Read
	BOOL ReadChangeDistance(BYTE nNodeID, int* nChangeDistance);

	// DC - Write
	BOOL WriteChangeDistance(BYTE nNodeID, int nChangeDistance);

	// DD - Read
	BOOL ReadDefaultDisplay(BYTE nNodeID, BYTE* nDefaultDisplay);

	// DD - Write
	BOOL WriteDefaultDisplay(BYTE nNodeID, BYTE nDefaultDisplay);

	// DE - Read
	BOOL ReadDecelerationRate(BYTE nNodeID, double* dDecel);

	// DE - Write
	BOOL WriteDecelerationRate(BYTE nNodeID, double dDecel);

	// DI - Read
	BOOL ReadDistanceOrPosition(BYTE nNodeID, int* nDistance);

	// DI - Write
	BOOL WriteDistanceOrPosition(BYTE nNodeID, int nDistance);

	// DL - Read
	BOOL ReadDefineLimits(BYTE nNodeID, BYTE* nDefineLimits);

	// DL - Write
	BOOL WriteDefineLimits(BYTE nNodeID, BYTE nDefineLimits);

	// DP - Read
	BOOL ReadDumpingPower(BYTE nNodeID, BYTE* nDumpingPower);

	// DP - Write
	BOOL WriteDumpingPower(BYTE nNodeID, BYTE nDumpingPower);

	// DR - Write Only
	BOOL WriteDataRegisterforCapture(BYTE nNodeID, char chDataRegisterforCapture);

	// DS - Read
	BOOL ReadSwitchingElectronicGearing(BYTE nNodeID, BYTE* nSwitchingElectronicGearing);

	// DS - Write
	BOOL WriteSwitchingElectronicGearing(BYTE nNodeID, BYTE nSwitchingElectronicGearing);

	// ED - Read
	BOOL ReadEncoderDirection(BYTE nNodeID, BYTE* nEncoderDirection);

	// ED - Write
	BOOL WriteEncoderDirection(BYTE nNodeID, BYTE nEncoderDirection);

	// EF - Read
	BOOL ReadEncoderFunction(BYTE nNodeID, BYTE* nEncoderFunction);

	// EF - Write
	BOOL WriteEncoderFunction(BYTE nNodeID, BYTE nEncoderFunction);

	// EG - Read
	BOOL ReadElectronicGearing(BYTE nNodeID, int* nElectronicGearing);

	// EG - Write
	BOOL WriteElectronicGearing(BYTE nNodeID, int nElectronicGearing);

	// EH - Write
	BOOL WriteExtendedHoming(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX = FALSE);

	// EI - Read
	BOOL ReadInputNoiseFilter(BYTE nNodeID, BYTE* nInputNoiseFilter);

	// EI - Write
	BOOL WriteInputNoiseFilter(BYTE nNodeID, BYTE nInputNoiseFilter);

	// EN - Read
	BOOL ReadElectronicGearingRatioNumerator(BYTE nNodeID, BYTE* nElectronicGearingRatioNumerator);

	// EN - Write
	BOOL WriteElectronicGearingRatioNumerator(BYTE nNodeID, BYTE nElectronicGearingRatioNumerator);

	// EP - Read
	BOOL ReadEncoderPosition(BYTE nNodeID, int* nEncoderPosition);

	// EP - Write
	BOOL WriteEncoderPosition(BYTE nNodeID, int nEncoderPosition);

	// ER - Read
	BOOL ReadEncoderResolution(BYTE nNodeID, int* nEncoderResolution);

	// ER - Write
	BOOL WriteEncoderResolution(BYTE nNodeID, int nEncoderResolution);

	// ES - Read
	BOOL ReadSingleEndedEncoderUsage(BYTE nNodeID, BYTE* nSingleEndedEncoderUsage);

	// ES - Write
	BOOL WriteSingleEndedEncoderUsage(BYTE nNodeID, BYTE nSingleEndedEncoderUsage);

	// EU - Read
	BOOL ReadElectronicGearingRatioDenominator(BYTE nNodeID, BYTE* nElectronicGearingRatioDenominator);

	// EU - Write
	BOOL WriteElectronicGearingRatioDenominator(BYTE nNodeID, BYTE nElectronicGearingRatioDenominator);

	// FA - Read
	BOOL ReadFunctionofAnalogInput(BYTE nNodeID, BYTE nAnalogChannel, BYTE* nFunction);

	// FA - Write
	BOOL WriteFunctionofAnalogInput(BYTE nNodeID, BYTE nAnalogChannel, BYTE nFunction);

	// FC - Write Only
	BOOL WriteFeedtoLengthwithSpeedChange(BYTE nNodeID, BYTE* nInputSensor, char* chInputStatus, BOOL bWithOptionalX = FALSE);

	// FD - Write Only
	BOOL WriteFeedtoDoubleSensor(BYTE nNodeID, BYTE nInput1, char chInputCondition1, BYTE nInput2, char chInputCondition2);

	// FE - Write Only
	BOOL WriteFollowEncoder(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX = FALSE);

	// FH - Write
	BOOL WriteFindHome(BYTE nNodeID, int nHomingMethod);

	// FI - Read
	BOOL ReadFilterInput(BYTE nNodeID, BYTE nInputSensor, int* nFilter);

	// FI - Write
	BOOL WriteFilterInput(BYTE nNodeID, BYTE nInputSensor, int nFilter);

	// FL - Write Only
	BOOL WriteFeedtoLength(BYTE nNodeID, int* nDistance = NULL);

	// FM - Write Only
	BOOL WriteFeedtoSensorwithMaskDistance(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX = FALSE);

	// FO - Write Only
	BOOL WriteFeedtoLengthandSetOutput(BYTE nNodeID, BYTE nOutput, char nOutputStatus, BOOL bWithOptionalY = FALSE);

	// FP - Write Only
	BOOL WriteFeedtoPosition(BYTE nNodeID, int* nPosition = NULL);

	// FS - Write Only
	BOOL WriteFeedtoSensor(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX = FALSE);

	// FX - Read
	BOOL ReadFilterSelectInputs(BYTE nNodeID, BYTE* nFilterSelectInputs);

	// FX - Write
	BOOL WriteFilterSelectInputs(BYTE nNodeID, BYTE nFilterSelectInputs);

	// FY - Write Only
	BOOL WriteFeedtoSensorwithSafetyDistance(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX = FALSE);

	// GC - Read
	BOOL ReadCurrentCommand(BYTE nNodeID, int* nCurrentCommand);

	// GC - Write
	BOOL WriteCurrentCommand(BYTE nNodeID, int nCurrentCommand);

	// GG - Read
	BOOL ReadGlobalGainSelection(BYTE nNodeID, BYTE* nGlobalGainSelection);

	// GG - Write
	BOOL WriteGlobalGainSelection(BYTE nNodeID, BYTE nGlobalGainSelection);

	//HA - Read
	BOOL ReadHomingAcceleration(BYTE nNodeID, int nStep, double* dHomingAccel);

	// HA - Write
	BOOL WriteHomingAcceleration(BYTE nNodeID, int nStep, double dHomingAccel);

	// HC - Read
	BOOL ReadHardStopCurrent(BYTE nNodeID, double* dHardStopCurrent);

	// HC - Write
	BOOL WriteHardStopCurrent(BYTE nNodeID, double dHardStopCurrent);

	// HD -Read
	BOOL ReadHardStopFaultDelay(BYTE nNodeID, int* nHardStopCurrent);

	// HD - Write
	BOOL WriteHardStopFaultDelay(BYTE nNodeID, int nHardStopFaultDelay);

	// HG - Read
	BOOL ReadHarmonicFilterGain(BYTE nNodeID, int* nHarmonicFilterGain);

	// HG - Write
	BOOL WriteHarmonicFilterGain(BYTE nNodeID, int nHarmonicFilterGain);

	//HL - Read
	BOOL ReadHomingDeceleration(BYTE nNodeID, int nStep, double* dHomingDecel);

	// HL - Write
	BOOL WriteHomingDeceleration(BYTE nNodeID, int nStep, double dHomingDecel);

	// HO - Read
	BOOL ReadHomingOffset(BYTE nNodeID, int* nHomingOffset);

	// HO - Write
	BOOL WriteHomingOffset(BYTE nNodeID, int nHomingOffset);

	// HP - Read
	BOOL ReadHarmonicFilterPhase(BYTE nNodeID, int* nHarmonicFilterPhase);

	// HP - Write
	BOOL WriteHarmonicFilterPhase(BYTE nNodeID, int nHarmonicFilterPhase);

	// HS - Write
	BOOL WriteHardStopHoming(BYTE nNodeID, BOOL bWithIndex);

	// HV - Read
	BOOL ReadHomingVelocity(BYTE nNodeID, int nStep, double* dHomeVelocity);

	// HV - Write
	BOOL WriteHomingVelocity(BYTE nNodeID, int nStep, double dHomeVelocity);

	// HW - Write Only
	BOOL WriteHandWheel(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX = FALSE);

	// IA - Read
	BOOL ReadImmediateAnalog(BYTE nNodeID, double* nAnalogValue);

	// IA1 - Read
	BOOL ReadImmediateAnalogWithChannel(BYTE nNodeID, int nChannel, double* dAnalogValue);

	// IC - Read
	BOOL ReadImmediateCommandedCurrent(BYTE nNodeID, double* dImmediateCommandedCurrent);

	// ID - Read Only
	BOOL ReadImmediateDistance(BYTE nNodeID, int* immediateDistance);

	// IE - Read Only
	BOOL ReadImmediateEncoder(BYTE nNodeID, int* immediateEncoder);
	
	// IF - Read Only
	BOOL ReadHexFormat(BYTE nNodeID, BOOL* bHexFormat);

	// IH - Write Only
	BOOL WriteImmediateHighOutput(BYTE nNodeID, BYTE nOutput, BOOL bWithOptionalY = FALSE);

	// IL - Write Only
	BOOL WriteImmediateLowOutput(BYTE nNodeID, BYTE nOutput, BOOL bWithOptionalY = FALSE);

	// IO - Read
	BOOL ReadOutputStatus(BYTE nNodeID, BYTE* nOutputStatus, BOOL bWithOptionalY = FALSE);

	// IO
	BOOL WriteOutputStatus(BYTE nNodeID, BYTE nOutputStatus, BOOL bWithOptionalY = FALSE);

	// IP - Read Only
	BOOL ReadImmediatePosition(BYTE nNodeID, int* immediatePosition);

	// IQ - Read
	BOOL ReadImmediateActualCurrent(BYTE nNodeID, double* dImmediateActualCurrent);

	// IS - Read
	BOOL ReadInputStatus(BYTE nNodeID, int* nInputStatus, BOOL bWithOptionalX = FALSE);

	// IT - Read
	BOOL ReadImmediateTemperature(BYTE nNodeID, double* dTemperature);

	// IT2 - Read
	BOOL ReadImmediateTemperatureWithChannel(BYTE nNodeID, int nChannel, double* dTemperature);

	// IU - Read
	BOOL ReadImmediateVoltage(BYTE nNodeID, double* dVoltage);

	// IU0, IU1, IU2 - Read
	BOOL ReadImmediateVoltageWithChannel(BYTE nNodeID, int nChannel, double* dVoltage);

	// IV - Read Only
	BOOL ReadImmediateActualVelocity(BYTE nNodeID, double* actualVelocity);

	// IV - Read Only
	BOOL ReadImmediateTargetVelocity(BYTE nNodeID, double* targetVelocity);

	// IX - Read Only
	BOOL ReadImmediatePositionError(BYTE nNodeID, int* immediatePositionError);

	// JA - Read
	BOOL ReadJogAcceleration(BYTE nNodeID, double* jogAcceleration);

	// JA - Write
	BOOL WriteJogAcceleration(BYTE nNodeID, double jogAcceleration);

	// JC - Read
	BOOL ReadVelocityModeSecondSpeed(BYTE nNodeID, double* velocityModeSecondSpeed);

	// JC - Write
	BOOL WriteVelocityModeSecondSpeed(BYTE nNodeID, double velocityModeSecondSpeed);

	// JC for M Series - Read
	BOOL ReadVelocityModeSecondSpeedMSeries(BYTE nNodeID, BYTE nVelocityIndex, double* dVelocity);

	// JC for M Series - Write
	BOOL WriteVelocityModeSecondSpeedMSeries(BYTE nNodeID, BYTE nAnalogChannel, double dVelocity);

	// JD - Write Only
	BOOL WriteJogDisable(BYTE nNodeID);

	// JE- Write Only
	BOOL WriteJogEnable(BYTE nNodeID);

	// JL - Read
	BOOL ReadJogDeceleration(BYTE nNodeID, double* jogDeceleration);

	// JL - Write
	BOOL WriteJogDeceleration(BYTE nNodeID, double jogDeceleration);

	// JM - Read
	BOOL ReadJogMode(BYTE nNodeID, BYTE* jogMode);

	// JM - Write
	BOOL WriteJogMode(BYTE nNodeID, BYTE jogMode);

	// JS - Read
	BOOL ReadJogSpeed(BYTE nNodeID, double* jogSpeed);

	// JS - Write
	BOOL WriteJogSpeed(BYTE nNodeID, double jogSpeed);

	// KC - Read
	BOOL ReadOverallServoFilter(BYTE nNodeID, int* overallServoFilter);

	// KC - Write
	BOOL WriteOverallServoFilter(BYTE nNodeID, int overallServoFilter);

	// KD - Read
	BOOL ReadDifferentialConstant(BYTE nNodeID, int* differentialConstant);

	// KD - Write
	BOOL WriteDifferentialConstant(BYTE nNodeID, int differentialConstant);

	// KE - Read
	BOOL ReadDifferentialFilter(BYTE nNodeID, int* differentialFilter);

	// KE - Write
	BOOL WriteDifferentialFilter(BYTE nNodeID, int differentialFilter);

	// KF - Read
	BOOL ReadVelocityFeedforwardConstant(BYTE nNodeID, int* velocityFeedforwardConstant);

	// KF - Write
	BOOL WriteVelocityFeedforwardConstant(BYTE nNodeID, int velocityFeedforwardConstant);

	// KG - Read
	BOOL ReadSecondaryGlobalGain(BYTE nNodeID, BYTE* nSecondaryGlobalGain);

	// KG - Write
	BOOL WriteSecondaryGlobalGain(BYTE nNodeID, BYTE nSecondaryGlobalGain);

	// KI - Read
	BOOL ReadIntegratorConstant(BYTE nNodeID, int* integratorConstant);

	// KI - Write
	BOOL WriteIntegratorConstant(BYTE nNodeID, int integratorConstant);

	// KJ - Read
	BOOL ReadJerkFilterFrequency(BYTE nNodeID, int* jerkFilterFrequency);

	// KJ - Write
	BOOL WriteJerkFilterFrequency(BYTE nNodeID, int jerkFilterFrequency);

	// KK - Read
	BOOL ReadInertiaFeedforwardConstant(BYTE nNodeID, int* inertiaFeedforwardConstant);

	// KK - Write
	BOOL WriteInertiaFeedforwardConstant(BYTE nNodeID, int inertiaFeedforwardConstant);

	// KP - Read
	BOOL ReadProportionalConstant(BYTE nNodeID, int* proportionalConstant);

	// KP - Write
	BOOL WriteProportionalConstant(BYTE nNodeID, int proportionalConstant);

	// KV - Read
	BOOL ReadVelocityFeedbackConstant(BYTE nNodeID, int* velocityFeedbackConstant);

	// KV - Write
	BOOL WriteVelocityFeedbackConstant(BYTE nNodeID, int velocityFeedbackConstant);

	// LA - Read
	BOOL ReadLeadAngleMaxValue(BYTE nNodeID, BYTE* nLeadAngleMaxValue);

	// LA - Write
	BOOL WriteLeadAngleMaxValue(BYTE nNodeID, BYTE nLeadAngleMaxValue);

	// LM - Read
	BOOL ReadSoftwareLimitCCW(BYTE nNodeID, int* nSoftwareLimitCCW);

	// LM - Write
	BOOL WriteSoftwareLimitCCW(BYTE nNodeID, int nSoftwareLimitCCW);

	// LP - Read
	BOOL ReadSoftwareLimitCW(BYTE nNodeID, int* nSoftwareLimitCW);

	// LP - Write
	BOOL WriteSoftwareLimitCW(BYTE nNodeID, int nSoftwareLimitCW);

	// LS - Read
	BOOL ReadLeadAngleSpeed(BYTE nNodeID, double* dLeadAngleSpeed);

	// LS - Write
	BOOL WriteLeadAngleSpeed(BYTE nNodeID, double dLeadAngleSpeed);

	// LV - Read
	BOOL ReadLowVoltageThreshold(BYTE nNodeID, int* lowVoltageThreshold);

	// LV - Write
	BOOL WriteLowVoltageThreshold(BYTE nNodeID, int lowVoltageThreshold);

	// MD - Write Only
	BOOL WriteMotorDisable(BYTE nNodeID);

	// ME- Write Only
	BOOL WriteMotorEnable(BYTE nNodeID);

	//MN - Read
	BOOL ReadModelNumber(BYTE nNodeID, BYTE* chModelNumber);

	// MO - Read
	BOOL ReadMotionOutput(BYTE nNodeID, BYTE* nOutputUsage);

	// MO - Write
	BOOL WriteMotionOutput(BYTE nNodeID, BYTE nOutputUsage);

	// MO - Read
	BOOL ReadMotionOutputFlexIO(BYTE nNodeID, BYTE* nOutputUsage, BYTE* nOutput);

	// MO - Write
	BOOL WriteMotionOutputFlexIO(BYTE nNodeID, BYTE nOutputUsage, BYTE nOutput);
	
	// MO - Read
	BOOL ReadMotionOutputMSeries(BYTE nNodeID, BYTE nOutput, BYTE* nOutputUsage);

	// MO - Write
	BOOL WriteMotionOutputMSeries(BYTE nNodeID, BYTE nOutput, BYTE nOutputUsage);

	// MR - Read
	BOOL ReadMicrostepResolution(BYTE nNodeID, BYTE* microstepResolution);

	// MR - Write
	BOOL WriteMicrostepResolution(BYTE nNodeID, BYTE microstepResolution);

	// MS - Read
	BOOL ReadControlModeSelection(BYTE nNodeID, BYTE* nControlModeSelection);

	// MS - Write
	BOOL WriteControlModeSelection(BYTE nNodeID, BYTE nControlModeSelection);

	// MT - Read
	BOOL ReadMultiTasking(BYTE nNodeID, BYTE* multiTasking);

	// MT - Write
	BOOL WriteMultiTasking(BYTE nNodeID, BYTE multiTasking);

	// MV - Read Only
	//BOOL ReadModelRevision(BYTE nNodeID, LPTSTR* strModelRevision); // Release memory in the end to avoid memory leak.
	BOOL ReadModelRevision(BYTE nNodeID, CString& strModelRevision);

	// OF - Write Only
	BOOL WriteOnFault(BYTE nNodeID, BYTE nQSegment);

	// OI - Write Only
	BOOL WriteOnInput(BYTE nNodeID, BYTE* nInputSensor, char* chInputStatus, BOOL bWithOptionalX = FALSE);

	// OP - Read
	BOOL ReadOptionBoard(BYTE nNodeID, BYTE* nOptionBoard);

	// PA - Read
	BOOL ReadPowerupAccelerationCurrent(BYTE nNodeID, double* powerupAccelerationCurrent);

	// PA - Write
	BOOL WritePowerupAccelerationCurrent(BYTE nNodeID, double powerupAccelerationCurrent);

	// PB - Read
	BOOL ReadPowerupBaudRate(BYTE nNodeID, BYTE* powerupBaudRate);

	// PB - Write
	BOOL WritePowerupBaudRate(BYTE nNodeID, BYTE powerupBaudRate);

	// PC - Read
	BOOL ReadPowerupCurrent(BYTE nNodeID, double* powerupCurrent);

	// PC - Write
	BOOL WritePowerupCurrent(BYTE nNodeID, double powerupCurrent);

	// PD - Read
	BOOL ReadInPositionCounts(BYTE nNodeID, int* nInPositionCounts);

	// PD - Write
	BOOL WriteInPositionCounts(BYTE nNodeID, int nInPositionCounts);

	// PE - Read
	BOOL ReadInPositionTiming(BYTE nNodeID, int* positionFault);

	// PE - Write
	BOOL WriteInPositionTiming(BYTE nNodeID, int positionFault);

	// PF - Read
	BOOL ReadPositionFault(BYTE nNodeID, int* positionFault);

	// PF - Write
	BOOL WritePositionFault(BYTE nNodeID, int positionFault);

	// PH - Read
	BOOL ReadInhibitionOfPulseCommand(BYTE nNodeID, int* nInhibitionOfPulseCommand);

	// PH - Write
	BOOL WriteInhibitionOfPulseCommand(BYTE nNodeID, int nInhibitionOfPulseCommand);

	// PI - Read
	BOOL ReadPowerupIdleCurrent(BYTE nNodeID, double* powerupIdleCurrent);

	// PI - Write
	BOOL WritePowerupIdleCurrent(BYTE nNodeID, double powerupIdleCurrent);

	// PK - Read
	BOOL ReadParameterLock(BYTE nNodeID, int* nParameterLock);

	// PK - Write
	BOOL WriteParameterLock(BYTE nNodeID, int nParameterLock);

	// PL - Read
	BOOL ReadPositionLimit(BYTE nNodeID, int* positionLimit);

	// PL - Write
	BOOL WritePositionLimit(BYTE nNodeID, int positionLimit);

	// PM - Read
	BOOL ReadPowerupMode(BYTE nNodeID, BYTE* powerupMode);

	// PM - Write
	BOOL WritePowerupMode(BYTE nNodeID, BYTE powerupMode);

	// PN - Write
	BOOL WriteProbeonDemand(BYTE nNodeID);

	// PP - Read
	BOOL ReadPowerupPeakCurrent(BYTE nNodeID, double* powerupPeakCurrent);

	// PP - Write
	BOOL WritePowerupPeakCurrent(BYTE nNodeID, double powerupPeakCurrent);

	// PR - Read
	BOOL ReadProtocol(BYTE nNodeID, BYTE* nProtocol);
	
	// PT - Read
	BOOL ReadPulseType(BYTE nNodeID, BYTE* nPulseType);

	// PT - Write
	BOOL WritePulseType(BYTE nNodeID, BYTE nPulseType);

	// PV - Read
	BOOL ReadSecondaryElectronicGearing(BYTE nNodeID, BYTE* nSecondaryElectronicGearing);

	// PV - Write
	BOOL WriteSecondaryElectronicGearing(BYTE nNodeID, BYTE nSecondaryElectronicGearing);

	// PW - Write Only
	BOOL WritePassword(BYTE nNodeID, LPTSTR password);

	// QC - Write Only
	BOOL WriteQueueCall(BYTE nNodeID, BOOL bWithQSegment, BYTE nQSegment);

	// QD - Write Only
	BOOL WriteQueueDelete(BYTE nNodeID, BYTE nQSegment);

	// QE - Write Only
	BOOL WriteQueueExecute(BYTE nNodeID);

	// QG - Write Only
	BOOL WriteQueueGoto(BYTE nNodeID, BYTE nLineNumber);

	// QJ - Write Only
	BOOL WriteQueueJump(BYTE nNodeID, char conditionCode, int nLineNumber);

	// QK - Write Only
	BOOL WriteQueueKill(BYTE nNodeID);

	// QL - Write Only
	BOOL WriteQueueLoad(BYTE nNodeID, BOOL fromNVMemory, int nQSegment);

	// QR - Write Only
	BOOL WriteQueueRepeat(BYTE nNodeID, BYTE nLineNumber);

	// QS - Write Only
	BOOL WriteQueueSave(BYTE nNodeID, BYTE nQSegment);

	// QX - Write Only
	BOOL WriteQueueLoadAndExecute(BYTE nNodeID, BYTE nQSegment);

	// RC - Write Only
	BOOL WriteRegisterCounter(BYTE nNodeID, BYTE* nInputSensor, char* chInputStatus, BOOL bWithOptionalX = FALSE);

	// RD - Write Only
	BOOL WriteRegisterDecrement(BYTE nNodeID, char chDataRegister);

	// RE - Write Only
	BOOL WriteRestart(BYTE nNodeID);

	// RI - Write Only
	BOOL WriteRegisterIncrement(BYTE nNodeID, char chDataRegister);

	// RL - Read
	BOOL ReadRegisterLoad(BYTE nNodeID, char chDataRegister, int* nRegisterValue, BOOL immediately);

	// RL - Write
	BOOL WriteRegisterLoad(BYTE nNodeID, char chDataRegister, int nRegisterValue, BOOL immediately);

	// RM - Write Only
	BOOL WriteRegisterMove(BYTE nNodeID, char chRegister1, char chRegister2);

	// RO - Read
	BOOL ReadAntiResonanceOn(BYTE nNodeID, BOOL* bAntiResonanceOn);

	// RO - Write
	BOOL WriteAntiResonanceOn(BYTE nNodeID, BOOL bAntiResonanceOn);

	// RR - Write Only
	BOOL WriteRegisterRead(BYTE nNodeID, char chRegister1, BYTE value);

	// RS - Read Only
	//BOOL ReadRequestStatus(BYTE nNodeID, LPTSTR* strStatusWord); // Release memory in the end to avoid memory leak.
	BOOL ReadRequestStatus(BYTE nNodeID, CString& strStatusWord);

	// RV - Write
	BOOL ReadRevisionLevel(BYTE nNodeID, BYTE* revisionLevel);

	// RW - Write Only
	BOOL WriteRegisterWrite(BYTE nNodeID, char chRegister1, BYTE chRegister2);

	// R+ - Write Only
	BOOL WriteRegisterAdd(BYTE nNodeID, char chRegister1, char chRegister2);

	// R- - Write Only
	BOOL WriteRegisterSubstract(BYTE nNodeID, char chRegister1, char chRegister2);

	// R* - Write Only
	BOOL WriteRegisterMultiply(BYTE nNodeID, char chRegister1, char chRegister2);

	// R/ - Write Only
	BOOL WriteRegisterDivide(BYTE nNodeID, char chRegister1, char chRegister2);

	// R& - Write Only
	BOOL WriteRegisterAnd(BYTE nNodeID, char chRegister1, char chRegister2);

	// R| - Write Only
	BOOL WriteRegisterOr(BYTE nNodeID, char chRegister1, char chRegister2);

	// SA - Write Only
	BOOL WriteSaveParameters(BYTE nNodeID);

	// SC - Read Only
	BOOL ReadStatusCode(BYTE nNodeID, int* nStatusCode);

	// SD - Read
	BOOL ReadSetDirection(BYTE nNodeID, BYTE* nDirection);

	// SD - Write
	BOOL WriteSetDirection(BYTE nNodeID, BYTE nInputSensor, char chDirection);

	// SF - Read
	BOOL ReadStepFilterFrequency(BYTE nNodeID, int* filter);

	// SF - Write
	BOOL WriteStepFilterFrequency(BYTE nNodeID, int filter);

	// SH - Write Only
	BOOL WriteSeekHome(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX = FALSE);

	// SI - Read
	BOOL ReadEnableInputUsage(BYTE nNodeID, BYTE* nInputUsage);

	// SI - Write
	BOOL WriteEnableInputUsage(BYTE nNodeID, BYTE nInputUsage);

	// SI - Read
	BOOL ReadEnableInputUsageFlexIO(BYTE nNodeID, BYTE* nInputUsage, BYTE* nInputSensor);

	// SI - Write
	BOOL WriteEnableInputUsageFlexIO(BYTE nNodeID, BYTE nInputSensor, BYTE nInputUsage);

	// SJ - Write Only
	BOOL WriteStopJogging(BYTE nNodeID);

	// SK - Write Only
	BOOL WriteStopAndKill(BYTE nNodeID, BOOL bWithOptionD = FALSE);

	// SM - Write
	BOOL WriteStopMove(BYTE nNodeID, char chDecelType);

	// SO - Write Only
	BOOL WriteSetOutput(BYTE nNodeID, BYTE nOutput, char nOutputCondition, BOOL bWithOptionalY = FALSE);

	// SP - Read
	BOOL ReadSetPosition(BYTE nNodeID, int* nSetPosition);

	// SP - Write
	BOOL WriteSetPosition(BYTE nNodeID, int nSetPosition);

	// ST - Write Only
	BOOL WriteStop(BYTE nNodeID, BOOL bWithOptionD = FALSE);

	// TD - Read
	BOOL ReadTransmitDelay(BYTE nNodeID, int* nTransmitDelay);

	// TD - Write
	BOOL WriteTransmitDelay(BYTE nNodeID, int nTransmitDelay);

	// TI - Write Only
	BOOL WriteTestInput(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX = FALSE);

	// TO - Read
	BOOL ReadTachOutput(BYTE nNodeID, int* nTachOutput);

	// TO - Write
	BOOL WriteTachOutput(BYTE nNodeID, int nTachOutput);

	// TR - Write Only
	BOOL WriteTestRegister(BYTE nNodeID, char chDataRegister, int nRegisterValue);

	// TS - Write Only
	BOOL WriteTimeStamp(BYTE nNodeID);

	// TT - Read
	BOOL ReadPulseCompleteTiming(BYTE nNodeID, int* nPulseCompleteTiming);

	// TT - Write
	BOOL WritePulseCompleteTiming(BYTE nNodeID, int nPulseCompleteTiming);

	// TV - Read
	BOOL ReadTorqueRipple(BYTE nNodeID, double* nTorqueRipple);

	// TV - Write
	BOOL WriteTorqueRipple(BYTE nNodeID, double nTorqueRipple);

	// VC - Read
	BOOL ReadVelocityChange(BYTE nNodeID, double* nVelocityChange);

	// VC - Write
	BOOL WriteVelocityChange(BYTE nNodeID, double nVelocityChange);

	// VE - Read
	BOOL ReadVelocity(BYTE nNodeID, double* dVelocity);

	// VE - Write
	BOOL WriteVelocity(BYTE nNodeID, double dVelocity);

	// VI - Read
	BOOL ReadVelocityIntegratorConstant(BYTE nNodeID, int* nVelocityIntegratorConstant);

	// VI - Write
	BOOL WriteVelocityIntegratorConstant(BYTE nNodeID, int nVelocityIntegratorConstant);

	// VL - Read
	BOOL ReadVoltageLimit(BYTE nNodeID, int* nVoltageLimit);

	// VL - Write
	BOOL WriteVoltageLimit(BYTE nNodeID, int nVoltageLimit);

	// VM - Read
	BOOL ReadMaximumVelocity(BYTE nNodeID, double* dMaxVelocity);

	// VM - Write
	BOOL WriteMaximumVelocity(BYTE nNodeID, double dMaxVelocity);

	// VP - Read
	BOOL ReadVelocityProportionalConstant(BYTE nNodeID, int* nVelocityProportionalConstant);

	// VP - Write
	BOOL WriteVelocityProportionalConstant(BYTE nNodeID, int nVelocityProportionalConstant);

	// VR - Read
	BOOL ReadVelocityRipple(BYTE nNodeID, double* dVelocityRipple);

	// VR - Write
	BOOL WriteVelocityRipple(BYTE nNodeID, double dVelocityRipple);

	// WD - Write Only
	BOOL WriteWaitDelay(BYTE nNodeID, char chDataRegister);

	// WI - Write Only
	BOOL WriteWaitforInput(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX = FALSE);

	// WM - Write Only
	BOOL WriteWaitonMove(BYTE nNodeID);

	// WP - Write Only
	BOOL WriteWaitPosition(BYTE nNodeID);

	// WT - Write
	BOOL WriteWaitTime(BYTE nNodeID, double dWaitTime);

	// ZC - Read
	BOOL ReadRegenResistorWattage(BYTE nNodeID, int* nRegenResistorWattage);

	// ZC - Write
	BOOL WriteRegenResistorWattage(BYTE nNodeID, int nRegenResistorWattage);

	// ZR - Read
	BOOL ReadRegenResistorValue(BYTE nNodeID, int* nRegenResistorValue);

	// ZR - Write
	BOOL WriteRegenResistorValue(BYTE nNodeID, int nRegenResistorValue);

	// ZT - Read
	BOOL ReadRegenResistorPeakTime(BYTE nNodeID, int* nRegenResistorPeakTime);

	// ZT - Write
	BOOL WriteRegenResistorPeakTime(BYTE nNodeID, int nRegenResistorPeakTime);
};

#endif // !defined(AFX_SCLLibHelper_H__2BEB97F7_CDEA_4F40_8457_8D307E32DC1C__INCLUDED_)
