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

// SCLLibHelper.cpp: implementation of the SCLLibHelper class.
//
//////////////////////////////////////////////////////////////////////

#include "pch.h"
#include "SCLLibHelper.h"

#ifdef _DEBUG
#undef THIS_FILE
static char THIS_FILE[]=__FILE__;
#define new DEBUG_NEW
#endif

EventCallback OnDataSend()
{
	//::SendMessage(AfxGetApp()->m_pMainWnd->m_hWnd, WM_DATASEND_MESSAGE, 0, 0);
	return 0;
}

EventCallback OnDataReceive()
{
	//::SendMessage(AfxGetApp()->m_pMainWnd->m_hWnd, WM_DATARECEIVE_MESSAGE, 0, 0);
	return 0;
}

//////////////////////////////////////////////////////////////////////
// Construction/Destruction
//////////////////////////////////////////////////////////////////////

SCLLibHelper::SCLLibHelper()
{
	m_bWasLoaded = FALSE;

	m_hDll = LoadLibrary( _T("SCLLib_x64.dll") );
	if ( !m_hDll )
	{
		AfxMessageBox( _T("Fail to load SCLLib_x64.dll") );
		return;
	}

	InitializeCriticalSectionAndSpinCount( &_cs , 2000 );

	m_OnDataSend = (lpOnDataSend)GetProcAddress(m_hDll, "OnDataSend");
	m_OnDataReceive = (lpOnDataReceive)GetProcAddress(m_hDll, "OnDataReceive");
	m_OnDataSend((EventCallback)OnDataSend);
	m_OnDataReceive((EventCallback)OnDataReceive);

	// Open Serial Port
	m_Open = (lpOpen)GetProcAddress(m_hDll, "Open");
	// Close
	m_Close = (lpClose)GetProcAddress(m_hDll, "Close");
	// SetCommParam
	m_SetCommParam = (lpSetCommParam)GetProcAddress(m_hDll, "SetCommParam");
	// return port is open or not
	m_IsOpen = (lpIsOpen)GetProcAddress(m_hDll, "IsOpen");
	// Free memory
	m_FreeNewMemory = (lpFreeNewMemory)GetProcAddress(m_hDll, "FreeNewMemory");
	// Set when send data, trigger Send event or not
	m_SetTriggerSendEvent = (lpSetTriggerSendEvent)GetProcAddress(m_hDll, "SetTriggerSendEvent");
	// Set when received data, trigger Send event or not
	m_SetTriggerReceiveEvent = (lpSetTriggerReceiveEvent)GetProcAddress(m_hDll, "SetTriggerReceiveEvent");
	// Set when send data, trigger Send event or not
	m_SetExecuteTimeOut = (lpSetExecuteTimeOut)GetProcAddress(m_hDll, "SetExecuteTimeOut");
	// Set when received data, trigger Send event or not
	m_GetExecuteTimeOut = (lpGetExecuteTimeOut)GetProcAddress(m_hDll, "GetExecuteTimeOut");
	// Send SCL Command
	m_SendSCLCommand = (lpSendSCLCommand)GetProcAddress(m_hDll, "SendSCLCommand");
	// Send SCL Command and Return drive's response
	m_ExecuteSCLCommand = (lpExecuteSCLCommand)GetProcAddress(m_hDll, "ExecuteSCLCommand");
	// Get Last Command sent
	m_GetLastCommandSent = (lpGetLastCommandSent)GetProcAddress(m_hDll, "GetLastCommandSent");
	// Get Last Command received
	m_GetLastCommandReceived = (lpGetLastCommandReceived)GetProcAddress(m_hDll, "GetLastCommandReceived");
	// Get Last Error Information
	m_GetLastErrorInfo = (lpGetLastErrorInfo)GetProcAddress(m_hDll, "GetLastErrorInfo");
	// Get Node ID Mapping Settings for All drives
	m_GetAllNodeIDMapping = (lpGetAllNodeIDMapping)GetProcAddress(m_hDll, "GetAllNodeIDMapping");
	// Set Node ID Mapping Settings for All drives
	m_SetAllNodeIDMapping = (lpSetAllNodeIDMapping)GetProcAddress(m_hDll, "SetAllNodeIDMapping");
	// Reset Node ID Mapping Settings
	m_ResetNodeIDMapping = (lpResetNodeIDMapping)GetProcAddress(m_hDll, "ResetNodeIDMapping");
	// Get Node ID Mapping Settings for one drive
	m_GetOneNodeIDMapping = (lpGetOneNodeIDMapping)GetProcAddress(m_hDll, "GetOneNodeIDMapping");
	// Set Node ID Mapping Settings for one drive
	m_SetOneNodeIDMapping = (lpSetOneNodeIDMapping)GetProcAddress(m_hDll, "SetOneNodeIDMapping");
	// AC - Read
	m_ReadAccelerationRate = (lpReadAccelerationRate)GetProcAddress(m_hDll, "ReadAccelerationRate");
	// AC - Write
	m_WriteAccelerationRate = (lpWriteAccelerationRate)GetProcAddress(m_hDll, "WriteAccelerationRate");
	// AD - Read
	m_ReadAnalogDeadband = (lpReadAnalogDeadband)GetProcAddress(m_hDll, "ReadAnalogDeadband");
	// AD - Write
	m_WriteAnalogDeadband = (lpWriteAnalogDeadband)GetProcAddress(m_hDll, "WriteAnalogDeadband");
	// AD for M Series - Read
	m_ReadAnalogDeadbandWithChannel = (lpReadAnalogDeadbandWithChannel)GetProcAddress(m_hDll, "ReadAnalogDeadbandWithChannel");
	// AD for M Series - Write
	m_WriteAnalogDeadbandMSeries = (lpWriteAnalogDeadbandMSeries)GetProcAddress(m_hDll, "WriteAnalogDeadbandWithChannel");
	// AF - Read
	m_ReadAnalogFilter = (lpReadAnalogFilter)GetProcAddress(m_hDll, "ReadAnalogFilter");
	// AF - Write
	m_WriteAnalogFilter = (lpWriteAnalogFilter)GetProcAddress(m_hDll, "WriteAnalogFilter");
	// AG - Read
	m_ReadAnalogVelocityGain = (lpReadAnalogVelocityGain)GetProcAddress(m_hDll, "ReadAnalogVelocityGain");
	// AG - Write
	m_WriteAnalogVelocityGain = (lpWriteAnalogVelocityGain)GetProcAddress(m_hDll, "WriteAnalogVelocityGain");
	// AI - Read
	m_ReadAlarmResetInput = (lpReadAlarmResetInput)GetProcAddress(m_hDll, "ReadAlarmResetInput");
	// AI - Write
	m_WriteAlarmResetInput = (lpWriteAlarmResetInput)GetProcAddress(m_hDll, "WriteAlarmResetInput");
	// AI - Read
	m_ReadAlarmResetInputFlexIO = (lpReadAlarmResetInputFlexIO)GetProcAddress(m_hDll, "ReadAlarmResetInputFlexIO");
	// AI - Write
	m_WriteAlarmResetInputFlexIO = (lpWriteAlarmResetInputFlexIO)GetProcAddress(m_hDll, "WriteAlarmResetInputFlexIO");
	// AL - Read Only
	m_ReadAlarmCode = (lpReadAlarmCode)GetProcAddress(m_hDll, "ReadAlarmCode");
	m_ReadAlarmCodeWithChannel = (lpReadAlarmCodeWithChannel)GetProcAddress(m_hDll, "ReadAlarmCodeWithChannel");
	// AM - Read
	m_ReadMaxAcceleration = (lpReadMaxAcceleration)GetProcAddress(m_hDll, "ReadMaxAcceleration");
	// AM - Write
	m_WriteMaxAcceleration = (lpWriteMaxAcceleration)GetProcAddress(m_hDll, "WriteMaxAcceleration");
	// AN - Read
	m_ReadAnalogTorqueGain = (lpReadAnalogTorqueGain)GetProcAddress(m_hDll, "ReadAnalogTorqueGain");
	// AN - Write
	m_WriteAnalogTorqueGain = (lpWriteAnalogTorqueGain)GetProcAddress(m_hDll, "WriteAnalogTorqueGain");
	// AO - Read
	m_ReadAlarmOutput = (lpReadAlarmOutput)GetProcAddress(m_hDll, "ReadAlarmOutput");
	// AO - Write
	m_WriteAlarmOutput = (lpWriteAlarmOutput)GetProcAddress(m_hDll, "WriteAlarmOutput");
	// AO - Read
	m_ReadAlarmOutputFlexIO = (lpReadAlarmOutputFlexIO)GetProcAddress(m_hDll, "ReadAlarmOutputFlexIO");
	// AO - Write
	m_WriteAlarmOutputFlexIO = (lpWriteAlarmOutputFlexIO)GetProcAddress(m_hDll, "WriteAlarmOutputFlexIO");
	// AP - Read
	m_ReadAnalogPositionGain = (lpReadAnalogPositionGain)GetProcAddress(m_hDll, "ReadAnalogPositionGain");
	// AP - Write
	m_WriteAnalogPositionGain = (lpWriteAnalogPositionGain)GetProcAddress(m_hDll, "WriteAnalogPositionGain");
	// AR - Write Only
	m_WriteAlarmReset = (lpWriteAlarmReset)GetProcAddress(m_hDll, "WriteAlarmReset");
	// AS - Read
	m_ReadAnalogScaling = (lpReadAnalogScaling)GetProcAddress(m_hDll, "ReadAnalogScaling");
	// AS - Write
	m_WriteAnalogScaling = (lpWriteAnalogScaling)GetProcAddress(m_hDll, "WriteAnalogScaling");
	// AT - Read
	m_ReadAnalogThreshold = (lpReadAnalogThreshold)GetProcAddress(m_hDll, "ReadAnalogThreshold");
	// AT - Write
	m_WriteAnalogThreshold = (lpWriteAnalogThreshold)GetProcAddress(m_hDll, "WriteAnalogThreshold");
	// AV - Read
	m_ReadAnalogOffset = (lpReadAnalogOffset)GetProcAddress(m_hDll, "ReadAnalogOffset");
	// AV - Write
	m_WriteAnalogOffset = (lpWriteAnalogOffset)GetProcAddress(m_hDll, "WriteAnalogOffset");
	// AV for M Series - Read
	m_ReadAnalogOffsetMSeries = (lpReadAnalogOffsetMSeries)GetProcAddress(m_hDll, "ReadAnalogOffsetMSeries");
	// AV for M Series - Write
	m_WriteAnalogOffsetMSeries = (lpWriteAnalogOffsetMSeries)GetProcAddress(m_hDll, "WriteAnalogOffsetMSeries");
	// AZ - Write Only
	m_WriteAnalogZero = (lpWriteAnalogZero)GetProcAddress(m_hDll, "WriteAnalogZero");
	// BD - Read
	m_ReadBrakeDisengageDelay = (lpReadBrakeDisengageDelay)GetProcAddress(m_hDll, "ReadBrakeDisengageDelay");
	// BD - Write
	m_WriteBrakeDisengageDelay = (lpWriteBrakeDisengageDelay)GetProcAddress(m_hDll, "WriteBrakeDisengageDelay");
	// BE - Read
	m_ReadBrakeEngageDelay = (lpReadBrakeEngageDelay)GetProcAddress(m_hDll, "ReadBrakeEngageDelay");
	// BE - Write
	m_WriteBrakeEngageDelay = (lpWriteBrakeEngageDelay)GetProcAddress(m_hDll, "WriteBrakeEngageDelay");
	// BO - Read
	m_ReadBrakeOutput = (lpReadBrakeOutput)GetProcAddress(m_hDll, "ReadBrakeOutput");
	// BO - Write
	m_WriteBrakeOutput = (lpWriteBrakeOutput)GetProcAddress(m_hDll, "WriteBrakeOutput");
	// BO - Read
	m_ReadBrakeOutputFlexIO = (lpReadBrakeOutputFlexIO)GetProcAddress(m_hDll, "ReadBrakeOutputFlexIO");
	// BO - Write
	m_WriteBrakeOutputFlexIO = (lpWriteBrakeOutputFlexIO)GetProcAddress(m_hDll, "WriteBrakeOutputFlexIO");
	// BR - Read
	m_ReadBaudRate = (lpReadBaudRate)GetProcAddress(m_hDll, "ReadBaudRate");
	// BS - Read Only
	m_ReadBufferStatus = (lpReadBufferStatus)GetProcAddress(m_hDll, "ReadBufferStatus");
	// CA - Read
	m_ReadChangeAccelerationCurrent = (lpReadChangeAccelerationCurrent)GetProcAddress(m_hDll, "ReadChangeAccelerationCurrent");
	// CA - Write
	m_WriteChangeAccelerationCurrent = (lpWriteChangeAccelerationCurrent)GetProcAddress(m_hDll, "WriteChangeAccelerationCurrent");
	// CC - Read
	m_ReadChangeCurrent = (lpReadChangeCurrent)GetProcAddress(m_hDll, "ReadChangeCurrent");
	// CC - Write
	m_WriteChangeCurrent = (lpWriteChangeCurrent)GetProcAddress(m_hDll, "WriteChangeCurrent");
	// CD - Read
	m_ReadIdleCurrentDelayTime = (lpReadIdleCurrentDelayTime)GetProcAddress(m_hDll, "ReadIdleCurrentDelayTime");
	// CD - Write
	m_WriteIdleCurrentDelayTime = (lpWriteIdleCurrentDelayTime)GetProcAddress(m_hDll, "WriteIdleCurrentDelayTime");
	// CE - Read Only
	m_ReadCommunicationError = (lpReadCommunicationError)GetProcAddress(m_hDll, "ReadCommunicationError");
	// CF - Read
	m_ReadAntiResonanceFilterFreq = (lpReadAntiResonanceFilterFreq)GetProcAddress(m_hDll, "ReadAntiResonanceFilterFreq");
	// CF - Write
	m_WriteAntiResonanceFilterFreq = (lpWriteAntiResonanceFilterFreq)GetProcAddress(m_hDll, "WriteAntiResonanceFilterFreq");
	// CG - Read
	m_ReadAntiResonanceFilterGain = (lpReadAntiResonanceFilterGain)GetProcAddress(m_hDll, "ReadAntiResonanceFilterGain");
	// CG - Write
	m_WriteAntiResonanceFilterGain = (lpWriteAntiResonanceFilterGain)GetProcAddress(m_hDll, "WriteAntiResonanceFilterGain");
	// CI - Read
	m_ReadChangeIdleCurrent = (lpReadChangeIdleCurrent)GetProcAddress(m_hDll, "ReadChangeIdleCurrent");
	// CI - Write
	m_WriteChangeIdleCurrent = (lpWriteChangeIdleCurrent)GetProcAddress(m_hDll, "WriteChangeIdleCurrent");
	// CJ - Write Only
	m_WriteCommenceJogging = (lpWriteCommenceJogging)GetProcAddress(m_hDll, "WriteCommenceJogging");
	// CM - Read
	m_ReadCommandMode = (lpReadCommandMode)GetProcAddress(m_hDll, "ReadCommandMode");
	// CM - Write
	m_WriteCommandMode = (lpWriteCommandMode)GetProcAddress(m_hDll, "WriteCommandMode");
	// CN - Read
	m_ReadSecondaryCommandMode = (lpReadSecondaryCommandMode)GetProcAddress(m_hDll, "ReadSecondaryCommandMode");
	// CN - Write
	m_WriteSecondaryCommandMode = (lpWriteSecondaryCommandMode)GetProcAddress(m_hDll, "WriteSecondaryCommandMode");
	// CP - Read
	m_ReadChangePeakCurrent = (lpReadChangePeakCurrent)GetProcAddress(m_hDll, "ReadChangePeakCurrent");
	// CP - Write
	m_WriteChangePeakCurrent = (lpWriteChangePeakCurrent)GetProcAddress(m_hDll, "WriteChangePeakCurrent");
	// CR - Write Only
	m_WriteCompareRegisters = (lpWriteCompareRegisters)GetProcAddress(m_hDll, "WriteCompareRegisters");
	// CS - Read
	m_ReadChangeSpeed = (lpReadChangeSpeed)GetProcAddress(m_hDll, "ReadChangeSpeed");
	// CS - Write
	m_WriteChangeSpeed = (lpWriteChangeSpeed)GetProcAddress(m_hDll, "WriteChangeSpeed");
	// DC - Read
	m_ReadChangeDistance = (lpReadChangeDistance)GetProcAddress(m_hDll, "ReadChangeDistance");
	// DC - Write
	m_WriteChangeDistance = (lpWriteChangeDistance)GetProcAddress(m_hDll, "WriteChangeDistance");
	// DD - Read
	m_ReadDefaultDisplay = (lpReadDefaultDisplay)GetProcAddress(m_hDll, "ReadDefaultDisplay");
	// DD - Write
	m_WriteDefaultDisplay = (lpWriteDefaultDisplay)GetProcAddress(m_hDll, "WriteDefaultDisplay");
	// DE - Read
	m_ReadDecelerationRate = (lpReadDecelerationRate)GetProcAddress(m_hDll, "ReadDecelerationRate");
	// DE - Write
	m_WriteDecelerationRate = (lpWriteDecelerationRate)GetProcAddress(m_hDll, "WriteDecelerationRate");
	// DI - Read
	m_ReadDistanceOrPosition = (lpReadDistanceOrPosition)GetProcAddress(m_hDll, "ReadDistanceOrPosition");
	// DI - Write
	m_WriteDistanceOrPosition = (lpWriteDistanceOrPosition)GetProcAddress(m_hDll, "WriteDistanceOrPosition");
	// DL - Read
	m_ReadDefineLimits = (lpReadDefineLimits)GetProcAddress(m_hDll, "ReadDefineLimits");
	// DL - Write
	m_WriteDefineLimits = (lpWriteDefineLimits)GetProcAddress(m_hDll, "WriteDefineLimits");
	// DP - Read
	m_ReadDumpingPower = (lpReadDumpingPower)GetProcAddress(m_hDll, "ReadDumpingPower");
	// DP - Write
	m_WriteDumpingPower = (lpWriteDumpingPower)GetProcAddress(m_hDll, "WriteDumpingPower");
	// DR - Write Only
	m_WriteDataRegisterforCapture = (lpWriteDataRegisterforCapture)GetProcAddress(m_hDll, "WriteDataRegisterforCapture");
	// DS - Read
	m_ReadSwitchingElectronicGearing = (lpReadSwitchingElectronicGearing)GetProcAddress(m_hDll, "ReadSwitchingElectronicGearing");
	// DS - Write
	m_WriteSwitchingElectronicGearing = (lpWriteSwitchingElectronicGearing)GetProcAddress(m_hDll, "WriteSwitchingElectronicGearing");
	// ED - Read
	m_ReadEncoderDirection = (lpReadEncoderDirection)GetProcAddress(m_hDll, "ReadEncoderDirection");
	// ED - Write
	m_WriteEncoderDirection = (lpWriteEncoderDirection)GetProcAddress(m_hDll, "WriteEncoderDirection");
	// EF - Read
	m_ReadEncoderFunction = (lpReadEncoderFunction)GetProcAddress(m_hDll, "ReadEncoderFunction");
	// EF - Write
	m_WriteEncoderFunction = (lpWriteEncoderFunction)GetProcAddress(m_hDll, "WriteEncoderFunction");
	// EG - Read
	m_ReadElectronicGearing = (lpReadElectronicGearing)GetProcAddress(m_hDll, "ReadElectronicGearing");
	// EG - Write
	m_WriteElectronicGearing = (lpWriteElectronicGearing)GetProcAddress(m_hDll, "WriteElectronicGearing");
	// EH - Write
	m_WriteExtendedHoming = (lpWriteExtendedHoming)GetProcAddress(m_hDll, "WriteExtendedHoming");
	// EI - Read
	m_ReadInputNoiseFilter = (lpReadInputNoiseFilter)GetProcAddress(m_hDll, "ReadInputNoiseFilter");
	// EI - Write
	m_WriteInputNoiseFilter = (lpWriteInputNoiseFilter)GetProcAddress(m_hDll, "WriteInputNoiseFilter");
	// EN - Read
	m_ReadElectronicGearingRatioNumerator = (lpReadElectronicGearingRatioNumerator)GetProcAddress(m_hDll, "ReadElectronicGearingRatioNumerator");
	// EN - Write
	m_WriteElectronicGearingRatioNumerator = (lpWriteElectronicGearingRatioNumerator)GetProcAddress(m_hDll, "WriteElectronicGearingRatioNumerator");
	// EP - Read
	m_ReadEncoderPosition = (lpReadEncoderPosition)GetProcAddress(m_hDll, "ReadEncoderPosition");
	// EP - Write
	m_WriteEncoderPosition = (lpWriteEncoderPosition)GetProcAddress(m_hDll, "WriteEncoderPosition");
	// ER - Read
	m_ReadEncoderResolution = (lpReadEncoderResolution)GetProcAddress(m_hDll, "ReadEncoderResolution");
	// ER - Write
	m_WriteEncoderResolution = (lpWriteEncoderResolution)GetProcAddress(m_hDll, "WriteEncoderResolution");
	// ES - Read
	m_ReadSingleEndedEncoderUsage = (lpReadSingleEndedEncoderUsage)GetProcAddress(m_hDll, "ReadSingleEndedEncoderUsage");
	// ES - Write
	m_WriteSingleEndedEncoderUsage = (lpWriteSingleEndedEncoderUsage)GetProcAddress(m_hDll, "WriteSingleEndedEncoderUsage");
	// EU - Read
	m_ReadElectronicGearingRatioDenominator = (lpReadElectronicGearingRatioDenominator)GetProcAddress(m_hDll, "ReadElectronicGearingRatioDenominator");
	// EU - Write
	m_WriteElectronicGearingRatioDenominator = (lpWriteElectronicGearingRatioDenominator)GetProcAddress(m_hDll, "WriteElectronicGearingRatioDenominator");
	// FA - Read
	m_ReadFunctionofAnalogInput = (lpReadFunctionofAnalogInput)GetProcAddress(m_hDll, "ReadFunctionofAnalogInput");
	// FA - Write
	m_WriteFunctionofAnalogInput = (lpWriteFunctionofAnalogInput)GetProcAddress(m_hDll, "WriteFunctionofAnalogInput");
	// FC - Write Only
	m_WriteFeedtoLengthwithSpeedChange = (lpWriteFeedtoLengthwithSpeedChange)GetProcAddress(m_hDll, "WriteFeedtoLengthwithSpeedChange");
	// FD - Write Only
	m_WriteFeedtoDoubleSensor = (lpWriteFeedtoDoubleSensor)GetProcAddress(m_hDll, "WriteFeedtoDoubleSensor");
	// FE - Write Only
	m_WriteFollowEncoder = (lpWriteFollowEncoder)GetProcAddress(m_hDll, "WriteFollowEncoder");
	// FH - Write
	m_WriteFindHome = (lpWriteFindHome)GetProcAddress(m_hDll, "WriteFindHome");
	// FI - Read
	m_ReadFilterInput = (lpReadFilterInput)GetProcAddress(m_hDll, "ReadFilterInput");
	// FI - Write
	m_WriteFilterInput = (lpWriteFilterInput)GetProcAddress(m_hDll, "WriteFilterInput");
	// FL - Write Only
	m_WriteFeedtoLength = (lpWriteFeedtoLength)GetProcAddress(m_hDll, "WriteFeedtoLength");
	// FM - Write Only
	m_WriteFeedtoSensorwithMaskDistance = (lpWriteFeedtoSensorwithMaskDistance)GetProcAddress(m_hDll, "WriteFeedtoSensorwithMaskDistance");
	// FO - Write Only
	m_WriteFeedtoLengthandSetOutput = (lpWriteFeedtoLengthandSetOutput)GetProcAddress(m_hDll, "WriteFeedtoLengthandSetOutput");
	// FP - Write Only
	m_WriteFeedtoPosition = (lpWriteFeedtoPosition)GetProcAddress(m_hDll, "WriteFeedtoPosition");
	// FS - Write Only
	m_WriteFeedtoSensor = (lpWriteFeedtoSensor)GetProcAddress(m_hDll, "WriteFeedtoSensor");
	// FX - Read
	m_ReadFilterSelectInputs = (lpReadFilterSelectInputs)GetProcAddress(m_hDll, "ReadFilterSelectInputs");
	// FX - Write
	m_WriteFilterSelectInputs = (lpWriteFilterSelectInputs)GetProcAddress(m_hDll, "WriteFilterSelectInputs");
	// FY - Write Only
	m_WriteFeedtoSensorwithSafetyDistance = (lpWriteFeedtoSensorwithSafetyDistance)GetProcAddress(m_hDll, "WriteFeedtoSensorwithSafetyDistance");
	// GC - Read
	m_ReadCurrentCommand = (lpReadCurrentCommand)GetProcAddress(m_hDll, "ReadCurrentCommand");
	// GC - Write
	m_WriteCurrentCommand = (lpWriteCurrentCommand)GetProcAddress(m_hDll, "WriteCurrentCommand");
	// GG - Read
	m_ReadGlobalGainSelection = (lpReadGlobalGainSelection)GetProcAddress(m_hDll, "ReadGlobalGainSelection");
	// GG - Write
	m_WriteGlobalGainSelection = (lpWriteGlobalGainSelection)GetProcAddress(m_hDll, "WriteGlobalGainSelection");
	//HA - Read
	m_ReadHomingAcceleration = (lpReadHomingAcceleration)GetProcAddress(m_hDll, "ReadHomingAcceleration");
	// HA - Write
	m_WriteHomingAcceleration = (lpWriteHomingAcceleration)GetProcAddress(m_hDll, "WriteHomingAcceleration");
	// HC - Read
	m_ReadHardStopCurrent = (lpReadHardStopCurrent)GetProcAddress(m_hDll, "ReadHardStopCurrent");
	// HC - Write
	m_WriteHardStopCurrent = (lpWriteHardStopCurrent)GetProcAddress(m_hDll, "WriteHardStopCurrent");
	// HD -Read
	m_ReadHardStopFaultDelay = (lpReadHardStopFaultDelay)GetProcAddress(m_hDll, "ReadHardStopFaultDelay");
	// HD - Write
	m_WriteHardStopFaultDelay = (lpWriteHardStopFaultDelay)GetProcAddress(m_hDll, "WriteHardStopFaultDelay");
	// HG - Read
	m_ReadHarmonicFilterGain = (lpReadHarmonicFilterGain)GetProcAddress(m_hDll, "ReadHarmonicFilterGain");
	// HG - Write
	m_WriteHarmonicFilterGain = (lpWriteHarmonicFilterGain)GetProcAddress(m_hDll, "WriteHarmonicFilterGain");
	//HL - Read
	m_ReadHomingDeceleration = (lpReadHomingDeceleration)GetProcAddress(m_hDll, "ReadHomingDeceleration");
	// HL - Write
	m_WriteHomingDeceleration = (lpWriteHomingDeceleration)GetProcAddress(m_hDll, "WriteHomingDeceleration");
	// HO - Read
	m_ReadHomingOffset = (lpReadHomingOffset)GetProcAddress(m_hDll, "ReadHomingOffset");
	// HO - Write
	m_WriteHomingOffset = (lpWriteHomingOffset)GetProcAddress(m_hDll, "WriteHomingOffset");
	// HP - Read
	m_ReadHarmonicFilterPhase = (lpReadHarmonicFilterPhase)GetProcAddress(m_hDll, "ReadHarmonicFilterPhase");
	// HP - Write
	m_WriteHarmonicFilterPhase = (lpWriteHarmonicFilterPhase)GetProcAddress(m_hDll, "WriteHarmonicFilterPhase");
	// HS - Write
	m_WriteHardStopHoming = (lpWriteHardStopHoming)GetProcAddress(m_hDll, "WriteHardStopHoming");
	// HV - Read
	m_ReadHomingVelocity = (lpReadHomingVelocity)GetProcAddress(m_hDll, "ReadHomingVelocity");
	// HV - Write
	m_WriteHomingVelocity = (lpWriteHomingVelocity)GetProcAddress(m_hDll, "WriteHomingVelocity");
	// HW - Write Only
	m_WriteHandWheel = (lpWriteHandWheel)GetProcAddress(m_hDll, "WriteHandWheel");
	// IA - Read
	m_ReadImmediateAnalog = (lpReadImmediateAnalog)GetProcAddress(m_hDll, "ReadImmediateAnalog");
	// IA1 - Read
	m_ReadImmediateAnalogWithChannel = (lpReadImmediateAnalogWithChannel)GetProcAddress(m_hDll, "ReadImmediateAnalogWithChannel");
	// IC - Read
	m_ReadImmediateCommandedCurrent = (lpReadImmediateCommandedCurrent)GetProcAddress(m_hDll, "ReadImmediateCommandedCurrent");
	// ID - Read Only
	m_ReadImmediateDistance = (lpReadImmediateDistance)GetProcAddress(m_hDll, "ReadImmediateDistance");
	// IE - Read Only
	m_ReadImmediateEncoder = (lpReadImmediateEncoder)GetProcAddress(m_hDll, "ReadImmediateEncoder");
	// IF - Read Only
	m_ReadHexFormat = (lpReadHexFormat)GetProcAddress(m_hDll, "ReadHexFormat");
	// IH - Write Only
	m_WriteImmediateHighOutput = (lpWriteImmediateHighOutput)GetProcAddress(m_hDll, "WriteImmediateHighOutput");
	// IL - Write Only
	m_WriteImmediateLowOutput = (lpWriteImmediateLowOutput)GetProcAddress(m_hDll, "WriteImmediateLowOutput");
	// IO - Read
	m_ReadOutputStatus = (lpReadOutputStatus)GetProcAddress(m_hDll, "ReadOutputStatus");
	// IO
	m_WriteOutputStatus = (lpWriteOutputStatus)GetProcAddress(m_hDll, "WriteOutputStatus");
	// IP - Read Only
	m_ReadImmediatePosition = (lpReadImmediatePosition)GetProcAddress(m_hDll, "ReadImmediatePosition");
	// IQ - Read
	m_ReadImmediateActualCurrent = (lpReadImmediateActualCurrent)GetProcAddress(m_hDll, "ReadImmediateActualCurrent");
	// IS - Read
	m_ReadInputStatus = (lpReadInputStatus)GetProcAddress(m_hDll, "ReadInputStatus");
	// IT - Read
	m_ReadImmediateTemperature = (lpReadImmediateTemperature)GetProcAddress(m_hDll, "ReadImmediateTemperature");
	// IT2 - Read
	m_ReadImmediateTemperatureWithChannel = (lpReadImmediateTemperatureWithChannel)GetProcAddress(m_hDll, "ReadImmediateTemperatureWithChannel");
	// IU - Read
	m_ReadImmediateVoltage = (lpReadImmediateVoltage)GetProcAddress(m_hDll, "ReadImmediateVoltage");
	// IU0, IU1, IU2 - Read
	m_ReadImmediateVoltageWithChannel = (lpReadImmediateVoltageWithChannel)GetProcAddress(m_hDll, "ReadImmediateVoltageWithChannel");
	// IV - Read Only
	m_ReadImmediateActualVelocity = (lpReadImmediateActualVelocity)GetProcAddress(m_hDll, "ReadImmediateActualVelocity");
	// IV - Read Only
	m_ReadImmediateTargetVelocity = (lpReadImmediateTargetVelocity)GetProcAddress(m_hDll, "ReadImmediateTargetVelocity");
	// IX - Read Only
	m_ReadImmediatePositionError = (lpReadImmediatePositionError)GetProcAddress(m_hDll, "ReadImmediatePositionError");
	// JA - Read
	m_ReadJogAcceleration = (lpReadJogAcceleration)GetProcAddress(m_hDll, "ReadJogAcceleration");
	// JA - Write
	m_WriteJogAcceleration = (lpWriteJogAcceleration)GetProcAddress(m_hDll, "WriteJogAcceleration");
	// JC - Read
	m_ReadVelocityModeSecondSpeed = (lpReadVelocityModeSecondSpeed)GetProcAddress(m_hDll, "ReadVelocityModeSecondSpeed");
	// JC - Write
	m_WriteVelocityModeSecondSpeed = (lpWriteVelocityModeSecondSpeed)GetProcAddress(m_hDll, "WriteVelocityModeSecondSpeed");
	// JC for M Series - Read
	m_ReadVelocityModeSecondSpeedMSeries = (lpReadVelocityModeSecondSpeedMSeries)GetProcAddress(m_hDll, "ReadVelocityModeSecondSpeedMSeries");
	// JC for M Series - Write
	m_WriteVelocityModeSecondSpeedMSeries = (lpWriteVelocityModeSecondSpeedMSeries)GetProcAddress(m_hDll, "WriteVelocityModeSecondSpeedMSeries");
	// JD - Write Only
	m_WriteJogDisable = (lpWriteJogDisable)GetProcAddress(m_hDll, "WriteJogDisable");
	// JE- Write Only
	m_WriteJogEnable = (lpWriteJogEnable)GetProcAddress(m_hDll, "WriteJogEnable");
	// JL - Read
	m_ReadJogDeceleration = (lpReadJogDeceleration)GetProcAddress(m_hDll, "ReadJogDeceleration");
	// JL - Write
	m_WriteJogDeceleration = (lpWriteJogDeceleration)GetProcAddress(m_hDll, "WriteJogDeceleration");
	// JM - Read
	m_ReadJogMode = (lpReadJogMode)GetProcAddress(m_hDll, "ReadJogMode");
	// JM - Write
	m_WriteJogMode = (lpWriteJogMode)GetProcAddress(m_hDll, "WriteJogMode");
	// JS - Read
	m_ReadJogSpeed = (lpReadJogSpeed)GetProcAddress(m_hDll, "ReadJogSpeed");
	// JS - Write
	m_WriteJogSpeed = (lpWriteJogSpeed)GetProcAddress(m_hDll, "WriteJogSpeed");
	// KC - Read
	m_ReadOverallServoFilter = (lpReadOverallServoFilter)GetProcAddress(m_hDll, "ReadOverallServoFilter");
	// KC - Write
	m_WriteOverallServoFilter = (lpWriteOverallServoFilter)GetProcAddress(m_hDll, "WriteOverallServoFilter");
	// KD - Read
	m_ReadDifferentialConstant = (lpReadDifferentialConstant)GetProcAddress(m_hDll, "ReadDifferentialConstant");
	// KD - Write
	m_WriteDifferentialConstant = (lpWriteDifferentialConstant)GetProcAddress(m_hDll, "WriteDifferentialConstant");
	// KE - Read
	m_ReadDifferentialFilter = (lpReadDifferentialFilter)GetProcAddress(m_hDll, "ReadDifferentialFilter");
	// KE - Write
	m_WriteDifferentialFilter = (lpWriteDifferentialFilter)GetProcAddress(m_hDll, "WriteDifferentialFilter");
	// KF - Read
	m_ReadVelocityFeedforwardConstant = (lpReadVelocityFeedforwardConstant)GetProcAddress(m_hDll, "ReadVelocityFeedforwardConstant");
	// KF - Write
	m_WriteVelocityFeedforwardConstant = (lpWriteVelocityFeedforwardConstant)GetProcAddress(m_hDll, "WriteVelocityFeedforwardConstant");
	// KG - Read
	m_ReadSecondaryGlobalGain = (lpReadSecondaryGlobalGain)GetProcAddress(m_hDll, "ReadSecondaryGlobalGain");
	// KG - Write
	m_WriteSecondaryGlobalGain = (lpWriteSecondaryGlobalGain)GetProcAddress(m_hDll, "WriteSecondaryGlobalGain");
	// KI - Read
	m_ReadIntegratorConstant = (lpReadIntegratorConstant)GetProcAddress(m_hDll, "ReadIntegratorConstant");
	// KI - Write
	m_WriteIntegratorConstant = (lpWriteIntegratorConstant)GetProcAddress(m_hDll, "WriteIntegratorConstant");
	// KJ - Read
	m_ReadJerkFilterFrequency = (lpReadJerkFilterFrequency)GetProcAddress(m_hDll, "ReadJerkFilterFrequency");
	// KJ - Write
	m_WriteJerkFilterFrequency = (lpWriteJerkFilterFrequency)GetProcAddress(m_hDll, "WriteJerkFilterFrequency");
	// KK - Read
	m_ReadInertiaFeedforwardConstant = (lpReadInertiaFeedforwardConstant)GetProcAddress(m_hDll, "ReadInertiaFeedforwardConstant");
	// KK - Write
	m_WriteInertiaFeedforwardConstant = (lpWriteInertiaFeedforwardConstant)GetProcAddress(m_hDll, "WriteInertiaFeedforwardConstant");
	// KP - Read
	m_ReadProportionalConstant = (lpReadProportionalConstant)GetProcAddress(m_hDll, "ReadProportionalConstant");
	// KP - Write
	m_WriteProportionalConstant = (lpWriteProportionalConstant)GetProcAddress(m_hDll, "WriteProportionalConstant");
	// KV - Read
	m_ReadVelocityFeedbackConstant = (lpReadVelocityFeedbackConstant)GetProcAddress(m_hDll, "ReadVelocityFeedbackConstant");
	// KV - Write
	m_WriteVelocityFeedbackConstant = (lpWriteVelocityFeedbackConstant)GetProcAddress(m_hDll, "WriteVelocityFeedbackConstant");
	// LA - Read
	m_ReadLeadAngleMaxValue = (lpReadLeadAngleMaxValue)GetProcAddress(m_hDll, "ReadLeadAngleMaxValue");
	// LA - Write
	m_WriteLeadAngleMaxValue = (lpWriteLeadAngleMaxValue)GetProcAddress(m_hDll, "WriteLeadAngleMaxValue");
	// LM - Read
	m_ReadSoftwareLimitCCW = (lpReadSoftwareLimitCCW)GetProcAddress(m_hDll, "ReadSoftwareLimitCCW");
	// LM - Write
	m_WriteSoftwareLimitCCW = (lpWriteSoftwareLimitCCW)GetProcAddress(m_hDll, "WriteSoftwareLimitCCW");
	// LP - Read
	m_ReadSoftwareLimitCW = (lpReadSoftwareLimitCW)GetProcAddress(m_hDll, "ReadSoftwareLimitCW");
	// LP - Write
	m_WriteSoftwareLimitCW = (lpWriteSoftwareLimitCW)GetProcAddress(m_hDll, "WriteSoftwareLimitCW");
	// LS - Read
	m_ReadLeadAngleSpeed = (lpReadLeadAngleSpeed)GetProcAddress(m_hDll, "ReadLeadAngleSpeed");
	// LS - Write
	m_WriteLeadAngleSpeed = (lpWriteLeadAngleSpeed)GetProcAddress(m_hDll, "WriteLeadAngleSpeed");
	// LV - Read
	m_ReadLowVoltageThreshold = (lpReadLowVoltageThreshold)GetProcAddress(m_hDll, "ReadLowVoltageThreshold");
	// LV - Write
	m_WriteLowVoltageThreshold = (lpWriteLowVoltageThreshold)GetProcAddress(m_hDll, "WriteLowVoltageThreshold");
	// MD - Write Only
	m_WriteMotorDisable = (lpWriteMotorDisable)GetProcAddress(m_hDll, "WriteMotorDisable");
	// ME- Write Only
	m_WriteMotorEnable = (lpWriteMotorEnable)GetProcAddress(m_hDll, "WriteMotorEnable");
	//MN - Read
	m_ReadModelNumber = (lpReadModelNumber)GetProcAddress(m_hDll, "ReadModelNumber");
	// MO - Read
	m_ReadMotionOutput = (lpReadMotionOutput)GetProcAddress(m_hDll, "ReadMotionOutput");
	// MO - Write
	m_WriteMotionOutput = (lpWriteMotionOutput)GetProcAddress(m_hDll, "WriteMotionOutput");
	// MO - Read
	m_ReadMotionOutputFlexIO = (lpReadMotionOutputFlexIO)GetProcAddress(m_hDll, "ReadMotionOutputFlexIO");
	// MO - Write
	m_WriteMotionOutputFlexIO = (lpWriteMotionOutputFlexIO)GetProcAddress(m_hDll, "WriteMotionOutputFlexIO");
	// MO - Read
	m_ReadMotionOutputMSeries = (lpReadMotionOutputMSeries)GetProcAddress(m_hDll, "ReadMotionOutputMSeries");
	// MO - Write
	m_WriteMotionOutputMSeries = (lpWriteMotionOutputMSeries)GetProcAddress(m_hDll, "WriteMotionOutputMSeries");
	// MR - Read
	m_ReadMicrostepResolution = (lpReadMicrostepResolution)GetProcAddress(m_hDll, "ReadMicrostepResolution");
	// MR - Write
	m_WriteMicrostepResolution = (lpWriteMicrostepResolution)GetProcAddress(m_hDll, "WriteMicrostepResolution");
	// MS - Read
	m_ReadControlModeSelection = (lpReadControlModeSelection)GetProcAddress(m_hDll, "ReadControlModeSelection");
	// MS - Write
	m_WriteControlModeSelection = (lpWriteControlModeSelection)GetProcAddress(m_hDll, "WriteControlModeSelection");
	// MT - Read
	m_ReadMultiTasking = (lpReadMultiTasking)GetProcAddress(m_hDll, "ReadMultiTasking");
	// MT - Write
	m_WriteMultiTasking = (lpWriteMultiTasking)GetProcAddress(m_hDll, "WriteMultiTasking");
	// MV - Read Only
	m_ReadModelRevision = (lpReadModelRevision)GetProcAddress(m_hDll, "ReadModelRevision");
	// OF - Write Only
	m_WriteOnFault = (lpWriteOnFault)GetProcAddress(m_hDll, "WriteOnFault");
	// OI - Write Only
	m_WriteOnInput = (lpWriteOnInput)GetProcAddress(m_hDll, "WriteOnInput");
	// OP - Read
	m_ReadOptionBoard = (lpReadOptionBoard)GetProcAddress(m_hDll, "ReadOptionBoard");
	// PA - Read
	m_ReadPowerupAccelerationCurrent = (lpReadPowerupAccelerationCurrent)GetProcAddress(m_hDll, "ReadPowerupAccelerationCurrent");
	// PA - Write
	m_WritePowerupAccelerationCurrent = (lpWritePowerupAccelerationCurrent)GetProcAddress(m_hDll, "WritePowerupAccelerationCurrent");
	// PB - Read
	m_ReadPowerupBaudRate = (lpReadPowerupBaudRate)GetProcAddress(m_hDll, "ReadPowerupBaudRate");
	// PB - Write
	m_WritePowerupBaudRate = (lpWritePowerupBaudRate)GetProcAddress(m_hDll, "WritePowerupBaudRate");
	// PC - Read
	m_ReadPowerupCurrent = (lpReadPowerupCurrent)GetProcAddress(m_hDll, "ReadPowerupCurrent");
	// PC - Write
	m_WritePowerupCurrent = (lpWritePowerupCurrent)GetProcAddress(m_hDll, "WritePowerupCurrent");
	// PD - Read
	m_ReadInPositionCounts = (lpReadInPositionCounts)GetProcAddress(m_hDll, "ReadInPositionCounts");
	// PD - Write
	m_WriteInPositionCounts = (lpWriteInPositionCounts)GetProcAddress(m_hDll, "WriteInPositionCounts");
	// PE - Read
	m_ReadInPositionTiming = (lpReadInPositionTiming)GetProcAddress(m_hDll, "ReadInPositionTiming");
	// PE - Write
	m_WriteInPositionTiming = (lpWriteInPositionTiming)GetProcAddress(m_hDll, "WriteInPositionTiming");
	// PF - Read
	m_ReadPositionFault = (lpReadPositionFault)GetProcAddress(m_hDll, "ReadPositionFault");
	// PF - Write
	m_WritePositionFault = (lpWritePositionFault)GetProcAddress(m_hDll, "WritePositionFault");
	// PH - Read
	m_ReadInhibitionOfPulseCommand = (lpReadInhibitionOfPulseCommand)GetProcAddress(m_hDll, "ReadInhibitionOfPulseCommand");
	// PH - Write
	m_WriteInhibitionOfPulseCommand = (lpWriteInhibitionOfPulseCommand)GetProcAddress(m_hDll, "WriteInhibitionOfPulseCommand");
	// PI - Read
	m_ReadPowerupIdleCurrent = (lpReadPowerupIdleCurrent)GetProcAddress(m_hDll, "ReadPowerupIdleCurrent");
	// PI - Write
	m_WritePowerupIdleCurrent = (lpWritePowerupIdleCurrent)GetProcAddress(m_hDll, "WritePowerupIdleCurrent");
	// PK - Read
	m_ReadParameterLock = (lpReadParameterLock)GetProcAddress(m_hDll, "ReadParameterLock");
	// PK - Write
	m_WriteParameterLock = (lpWriteParameterLock)GetProcAddress(m_hDll, "WriteParameterLock");
	// PL - Read
	m_ReadPositionLimit = (lpReadPositionLimit)GetProcAddress(m_hDll, "ReadPositionLimit");
	// PL - Write
	m_WritePositionLimit = (lpWritePositionLimit)GetProcAddress(m_hDll, "WritePositionLimit");
	// PM - Read
	m_ReadPowerupMode = (lpReadPowerupMode)GetProcAddress(m_hDll, "ReadPowerupMode");
	// PM - Write
	m_WritePowerupMode = (lpWritePowerupMode)GetProcAddress(m_hDll, "WritePowerupMode");
	// PN - Write
	m_WriteProbeonDemand = (lpWriteProbeonDemand)GetProcAddress(m_hDll, "WriteProbeonDemand");
	// PP - Read
	m_ReadPowerupPeakCurrent = (lpReadPowerupPeakCurrent)GetProcAddress(m_hDll, "ReadPowerupPeakCurrent");
	// PP - Write
	m_WritePowerupPeakCurrent = (lpWritePowerupPeakCurrent)GetProcAddress(m_hDll, "WritePowerupPeakCurrent");
	// PR - Read
	m_ReadProtocol = (lpReadProtocol)GetProcAddress(m_hDll, "ReadProtocol");
	// PT - Read
	m_ReadPulseType = (lpReadPulseType)GetProcAddress(m_hDll, "ReadPulseType");
	// PT - Write
	m_WritePulseType = (lpWritePulseType)GetProcAddress(m_hDll, "WritePulseType");
	// PV - Read
	m_ReadSecondaryElectronicGearing = (lpReadSecondaryElectronicGearing)GetProcAddress(m_hDll, "ReadSecondaryElectronicGearing");
	// PV - Write
	m_WriteSecondaryElectronicGearing = (lpWriteSecondaryElectronicGearing)GetProcAddress(m_hDll, "WriteSecondaryElectronicGearing");
	// PW - Write Only
	m_WritePassword = (lpWritePassword)GetProcAddress(m_hDll, "WritePassword");
	// QC - Write Only
	m_WriteQueueCall = (lpWriteQueueCall)GetProcAddress(m_hDll, "WriteQueueCall");
	// QD - Write Only
	m_WriteQueueDelete = (lpWriteQueueDelete)GetProcAddress(m_hDll, "WriteQueueDelete");
	// QE - Write Only
	m_WriteQueueExecute = (lpWriteQueueExecute)GetProcAddress(m_hDll, "WriteQueueExecute");
	// QG - Write Only
	m_WriteQueueGoto = (lpWriteQueueGoto)GetProcAddress(m_hDll, "WriteQueueGoto");
	// QJ - Write Only
	m_WriteQueueJump = (lpWriteQueueJump)GetProcAddress(m_hDll, "WriteQueueJump");
	// QK - Write Only
	m_WriteQueueKill = (lpWriteQueueKill)GetProcAddress(m_hDll, "WriteQueueKill");
	// QL - Write Only
	m_WriteQueueLoad = (lpWriteQueueLoad)GetProcAddress(m_hDll, "WriteQueueLoad");
	// QR - Write Only
	m_WriteQueueRepeat = (lpWriteQueueRepeat)GetProcAddress(m_hDll, "WriteQueueRepeat");
	// QS - Write Only
	m_WriteQueueSave = (lpWriteQueueSave)GetProcAddress(m_hDll, "WriteQueueSave");
	// QX - Write Only
	m_WriteQueueLoadAndExecute = (lpWriteQueueLoadAndExecute)GetProcAddress(m_hDll, "WriteQueueLoadAndExecute");
	// RC - Write Only
	m_WriteRegisterCounter = (lpWriteRegisterCounter)GetProcAddress(m_hDll, "WriteRegisterCounter");
	// RD - Write Only
	m_WriteRegisterDecrement = (lpWriteRegisterDecrement)GetProcAddress(m_hDll, "WriteRegisterDecrement");
	// RE - Write Only
	m_WriteRestart = (lpWriteRestart)GetProcAddress(m_hDll, "WriteRestart");
	// RI - Write Only
	m_WriteRegisterIncrement = (lpWriteRegisterIncrement)GetProcAddress(m_hDll, "WriteRegisterIncrement");
	// RL - Read
	m_ReadRegisterLoad = (lpReadRegisterLoad)GetProcAddress(m_hDll, "ReadRegisterLoad");
	// RL - Write
	m_WriteRegisterLoad = (lpWriteRegisterLoad)GetProcAddress(m_hDll, "WriteRegisterLoad");
	// RM - Write Only
	m_WriteRegisterMove = (lpWriteRegisterMove)GetProcAddress(m_hDll, "WriteRegisterMove");
	// RO - Read
	m_ReadAntiResonanceOn = (lpReadAntiResonanceOn)GetProcAddress(m_hDll, "ReadAntiResonanceOn");
	// RO - Write
	m_WriteAntiResonanceOn = (lpWriteAntiResonanceOn)GetProcAddress(m_hDll, "WriteAntiResonanceOn");
	// RR - Write Only
	m_WriteRegisterRead = (lpWriteRegisterRead)GetProcAddress(m_hDll, "WriteRegisterRead");
	// RS - Read Only
	m_ReadRequestStatus = (lpReadRequestStatus)GetProcAddress(m_hDll, "ReadRequestStatus");
	// RV - Write
	m_ReadRevisionLevel = (lpReadRevisionLevel)GetProcAddress(m_hDll, "ReadRevisionLevel");
	// RW - Write Only
	m_WriteRegisterWrite = (lpWriteRegisterWrite)GetProcAddress(m_hDll, "WriteRegisterWrite");
	// R+ - Write Only
	m_WriteRegisterAdd = (lpWriteRegisterAdd)GetProcAddress(m_hDll, "WriteRegisterAdd");
	// R- - Write Only
	m_WriteRegisterSubstract = (lpWriteRegisterSubstract)GetProcAddress(m_hDll, "WriteRegisterSubstract");
	// R* - Write Only
	m_WriteRegisterMultiply = (lpWriteRegisterMultiply)GetProcAddress(m_hDll, "WriteRegisterMultiply");
	// R/ - Write Only
	m_WriteRegisterDivide = (lpWriteRegisterDivide)GetProcAddress(m_hDll, "WriteRegisterDivide");
	// R& - Write Only
	m_WriteRegisterAnd = (lpWriteRegisterAnd)GetProcAddress(m_hDll, "WriteRegisterAnd");
	// R| - Write Only
	m_WriteRegisterOr = (lpWriteRegisterOr)GetProcAddress(m_hDll, "WriteRegisterOr");
	// SA - Write Only
	m_WriteSaveParameters = (lpWriteSaveParameters)GetProcAddress(m_hDll, "WriteSaveParameters");
	// SC - Read Only
	m_ReadStatusCode = (lpReadStatusCode)GetProcAddress(m_hDll, "ReadStatusCode");
	// SD - Read
	m_ReadSetDirection = (lpReadSetDirection)GetProcAddress(m_hDll, "ReadSetDirection");
	// SD - Write
	m_WriteSetDirection = (lpWriteSetDirection)GetProcAddress(m_hDll, "WriteSetDirection");
	// SF - Read
	m_ReadStepFilterFrequency = (lpReadStepFilterFrequency)GetProcAddress(m_hDll, "ReadStepFilterFrequency");
	// SF - Write
	m_WriteStepFilterFrequency = (lpWriteStepFilterFrequency)GetProcAddress(m_hDll, "WriteStepFilterFrequency");
	// SH - Write Only
	m_WriteSeekHome = (lpWriteSeekHome)GetProcAddress(m_hDll, "WriteSeekHome");
	// SI - Read
	m_ReadEnableInputUsage = (lpReadEnableInputUsage)GetProcAddress(m_hDll, "ReadEnableInputUsage");
	// SI - Write
	m_WriteEnableInputUsage = (lpWriteEnableInputUsage)GetProcAddress(m_hDll, "WriteEnableInputUsage");
	// SI - Read
	m_ReadEnableInputUsageFlexIO = (lpReadEnableInputUsageFlexIO)GetProcAddress(m_hDll, "ReadEnableInputUsageFlexIO");
	// SI - Write
	m_WriteEnableInputUsageFlexIO = (lpWriteEnableInputUsageFlexIO)GetProcAddress(m_hDll, "WriteEnableInputUsageFlexIO");
	// SJ - Write Only
	m_WriteStopJogging = (lpWriteStopJogging)GetProcAddress(m_hDll, "WriteStopJogging");
	// SK - Write Only
	m_WriteStopAndKill = (lpWriteStopAndKill)GetProcAddress(m_hDll, "WriteStopAndKill");
	// SM - Write
	m_WriteStopMove = (lpWriteStopMove)GetProcAddress(m_hDll, "WriteStopMove");
	// SO - Write Only
	m_WriteSetOutput = (lpWriteSetOutput)GetProcAddress(m_hDll, "WriteSetOutput");
	// SP - Read
	m_ReadSetPosition = (lpReadSetPosition)GetProcAddress(m_hDll, "ReadSetPosition");
	// SP - Write
	m_WriteSetPosition = (lpWriteSetPosition)GetProcAddress(m_hDll, "WriteSetPosition");
	// ST - Write Only
	m_WriteStop = (lpWriteStop)GetProcAddress(m_hDll, "WriteStop");
	// TD - Read
	m_ReadTransmitDelay = (lpReadTransmitDelay)GetProcAddress(m_hDll, "ReadTransmitDelay");
	// TD - Write
	m_WriteTransmitDelay = (lpWriteTransmitDelay)GetProcAddress(m_hDll, "WriteTransmitDelay");
	// TI - Write Only
	m_WriteTestInput = (lpWriteTestInput)GetProcAddress(m_hDll, "WriteTestInput");
	// TO - Read
	m_ReadTachOutput = (lpReadTachOutput)GetProcAddress(m_hDll, "ReadTachOutput");
	// TO - Write
	m_WriteTachOutput = (lpWriteTachOutput)GetProcAddress(m_hDll, "WriteTachOutput");
	// TR - Write Only
	m_WriteTestRegister = (lpWriteTestRegister)GetProcAddress(m_hDll, "WriteTestRegister");
	// TS - Write Only
	m_WriteTimeStamp = (lpWriteTimeStamp)GetProcAddress(m_hDll, "WriteTimeStamp");
	// TT - Read
	m_ReadPulseCompleteTiming = (lpReadPulseCompleteTiming)GetProcAddress(m_hDll, "ReadPulseCompleteTiming");
	// TT - Write
	m_WritePulseCompleteTiming = (lpWritePulseCompleteTiming)GetProcAddress(m_hDll, "WritePulseCompleteTiming");
	// TV - Read
	m_ReadTorqueRipple = (lpReadTorqueRipple)GetProcAddress(m_hDll, "ReadTorqueRipple");
	// TV - Write
	m_WriteTorqueRipple = (lpWriteTorqueRipple)GetProcAddress(m_hDll, "WriteTorqueRipple");
	// VC - Read
	m_ReadVelocityChange = (lpReadVelocityChange)GetProcAddress(m_hDll, "ReadVelocityChange");
	// VC - Write
	m_WriteVelocityChange = (lpWriteVelocityChange)GetProcAddress(m_hDll, "WriteVelocityChange");
	// VE - Read
	m_ReadVelocity = (lpReadVelocity)GetProcAddress(m_hDll, "ReadVelocity");
	// VE - Write
	m_WriteVelocity = (lpWriteVelocity)GetProcAddress(m_hDll, "WriteVelocity");
	// VI - Read
	m_ReadVelocityIntegratorConstant = (lpReadVelocityIntegratorConstant)GetProcAddress(m_hDll, "ReadVelocityIntegratorConstant");
	// VI - Write
	m_WriteVelocityIntegratorConstant = (lpWriteVelocityIntegratorConstant)GetProcAddress(m_hDll, "WriteVelocityIntegratorConstant");
	// VL - Read
	m_ReadVoltageLimit = (lpReadVoltageLimit)GetProcAddress(m_hDll, "ReadVoltageLimit");
	// VL - Write
	m_WriteVoltageLimit = (lpWriteVoltageLimit)GetProcAddress(m_hDll, "WriteVoltageLimit");
	// VM - Read
	m_ReadMaximumVelocity = (lpReadMaximumVelocity)GetProcAddress(m_hDll, "ReadMaximumVelocity");
	// VM - Write
	m_WriteMaximumVelocity = (lpWriteMaximumVelocity)GetProcAddress(m_hDll, "WriteMaximumVelocity");
	// VP - Read
	m_ReadVelocityProportionalConstant = (lpReadVelocityProportionalConstant)GetProcAddress(m_hDll, "ReadVelocityProportionalConstant");
	// VP - Write
	m_WriteVelocityProportionalConstant = (lpWriteVelocityProportionalConstant)GetProcAddress(m_hDll, "WriteVelocityProportionalConstant");
	// VR - Read
	m_ReadVelocityRipple = (lpReadVelocityRipple)GetProcAddress(m_hDll, "ReadVelocityRipple");
	// VR - Write
	m_WriteVelocityRipple = (lpWriteVelocityRipple)GetProcAddress(m_hDll, "WriteVelocityRipple");
	// WD - Write Only
	m_WriteWaitDelay = (lpWriteWaitDelay)GetProcAddress(m_hDll, "WriteWaitDelay");
	// WI - Write Only
	m_WriteWaitforInput = (lpWriteWaitforInput)GetProcAddress(m_hDll, "WriteWaitforInput");
	// WM - Write Only
	m_WriteWaitonMove = (lpWriteWaitonMove)GetProcAddress(m_hDll, "WriteWaitonMove");
	// WP - Write Only
	m_WriteWaitPosition = (lpWriteWaitPosition)GetProcAddress(m_hDll, "WriteWaitPosition");
	// WT - Write
	m_WriteWaitTime = (lpWriteWaitTime)GetProcAddress(m_hDll, "WriteWaitTime");
	// ZC - Read
	m_ReadRegenResistorWattage = (lpReadRegenResistorWattage)GetProcAddress(m_hDll, "ReadRegenResistorWattage");
	// ZC - Write
	m_WriteRegenResistorWattage = (lpWriteRegenResistorWattage)GetProcAddress(m_hDll, "WriteRegenResistorWattage");
	// ZR - Read
	m_ReadRegenResistorValue = (lpReadRegenResistorValue)GetProcAddress(m_hDll, "ReadRegenResistorValue");
	// ZR - Write
	m_WriteRegenResistorValue = (lpWriteRegenResistorValue)GetProcAddress(m_hDll, "WriteRegenResistorValue");
	// ZT - Read
	m_ReadRegenResistorPeakTime = (lpReadRegenResistorPeakTime)GetProcAddress(m_hDll, "ReadRegenResistorPeakTime");
	// ZT - Write
	m_WriteRegenResistorPeakTime = (lpWriteRegenResistorPeakTime)GetProcAddress(m_hDll, "WriteRegenResistorPeakTime");
	// Advanced Functions Start
	m_DriveEnable = (lpDriveEnable)GetProcAddress(m_hDll, "DriveEnable");
	m_SetDriveOutput = (lpSetDriveOutput)GetProcAddress(m_hDll, "SetDriveOutput");
	m_SetP2PProfile = (lpSetP2PProfile)GetProcAddress(m_hDll, "SetP2PProfile");
	m_SetJogProfile = (lpSetJogProfile)GetProcAddress(m_hDll, "SetJogProfile");
	m_RelMove = (lpRelMove)GetProcAddress(m_hDll, "RelMove");
	m_AbsMove = (lpAbsMove)GetProcAddress(m_hDll, "AbsMove");
	m_FeedtoSensor = (lpFeedtoSensor)GetProcAddress(m_hDll, "FeedtoSensor");
	m_P2PMoveWithVelocityChange = (lpP2PMoveWithVelocityChange)GetProcAddress(m_hDll, "P2PMoveWithVelocityChange");
	m_P2PMoveAndSetOutput = (lpP2PMoveAndSetOutput)GetProcAddress(m_hDll, "P2PMoveAndSetOutput");
	m_FeedtoDoubleSensor = (lpFeedtoDoubleSensor)GetProcAddress(m_hDll, "FeedtoDoubleSensor");
	m_FeedtoSensorWithMaskDistance = (lpFeedtoSensorWithMaskDistance)GetProcAddress(m_hDll, "FeedtoSensorWithMaskDistance");
	m_SeekHome = (lpSeekHome)GetProcAddress(m_hDll, "SeekHome");
	m_ExtendedSeekHome = (lpExtendedSeekHome)GetProcAddress(m_hDll, "ExtendedSeekHome");
	m_HardStopHoming = (lpHardStopHoming)GetProcAddress(m_hDll, "HardStopHoming");
	m_IsMotorEnabled = (lpIsMotorEnabled)GetProcAddress(m_hDll, "IsMotorEnabled");
	m_IsSampling = (lpIsSampling)GetProcAddress(m_hDll, "IsSampling");
	m_IsInFault = (lpIsInFault)GetProcAddress(m_hDll, "IsInFault");
	m_IsInPosition = (lpIsInPosition)GetProcAddress(m_hDll, "IsInPosition");
	m_IsMoving = (lpIsMoving)GetProcAddress(m_hDll, "IsMoving");
	m_IsJogging = (lpIsJogging)GetProcAddress(m_hDll, "IsJogging");
	m_IsStopping = (lpIsStopping)GetProcAddress(m_hDll, "IsStopping");
	m_IsWaitingforInput = (lpIsWaitingforInput)GetProcAddress(m_hDll, "IsWaitingforInput");
	m_IsSavingParam = (lpIsSavingParam)GetProcAddress(m_hDll, "IsSavingParam");
	m_IsInAlarm = (lpIsInAlarm)GetProcAddress(m_hDll, "IsInAlarm");
	m_IsHoming = (lpIsHoming)GetProcAddress(m_hDll, "IsHoming");
	m_IsWaitingforTime = (lpIsWaitingforTime)GetProcAddress(m_hDll, "IsWaitingforTime");
	m_IsRunningWizard = (lpIsRunningWizard)GetProcAddress(m_hDll, "IsRunningWizard");
	m_IsCheckingEncoder = (lpIsCheckingEncoder)GetProcAddress(m_hDll, "IsCheckingEncoder");
	m_IsRunningQProgram = (lpIsRunningQProgram)GetProcAddress(m_hDll, "IsRunningQProgram");
	m_IsInitializingOrServoReady = (lpIsInitializingOrServoReady)GetProcAddress(m_hDll, "IsInitializingOrServoReady");
	m_IsInAlarmPositionLimit = (lpIsInAlarmPositionLimit)GetProcAddress(m_hDll, "IsInAlarmPositionLimit");
	m_IsInAlarmCWLimit = (lpIsInAlarmCWLimit)GetProcAddress(m_hDll, "IsInAlarmCWLimit");
	m_IsInAlarmCCWLimit = (lpIsInAlarmCCWLimit)GetProcAddress(m_hDll, "IsInAlarmCCWLimit");
	m_IsInAlarmOverTemp = (lpIsInAlarmOverTemp)GetProcAddress(m_hDll, "IsInAlarmOverTemp");
	m_IsInAlarmOverVoltage = (lpIsInAlarmOverVoltage)GetProcAddress(m_hDll, "IsInAlarmOverVoltage");
	m_IsInAlarmUnderVoltage = (lpIsInAlarmUnderVoltage)GetProcAddress(m_hDll, "IsInAlarmUnderVoltage");
	m_IsInAlarmOverCurrent = (lpIsInAlarmOverCurrent)GetProcAddress(m_hDll, "IsInAlarmOverCurrent");
	m_IsInAlarmEncoderFault = (lpIsInAlarmEncoderFault)GetProcAddress(m_hDll, "IsInAlarmEncoderFault");
	m_IsInAlarmCommError = (lpIsInAlarmCommError)GetProcAddress(m_hDll, "IsInAlarmCommError");
	m_IsInAlarmBadFlash = (lpIsInAlarmBadFlash)GetProcAddress(m_hDll, "IsInAlarmBadFlash");
	m_IsInAlarmBlankQSegment = (lpIsInAlarmBlankQSegment)GetProcAddress(m_hDll, "IsInAlarmBlankQSegment");
	m_IsInAlarmMoveWhileDisabled = (lpIsInAlarmMoveWhileDisabled)GetProcAddress(m_hDll, "IsInAlarmMoveWhileDisabled");
	m_IsInAlarmMoveWhileDisabledMSeries = (lpIsInAlarmMoveWhileDisabledMSeries)GetProcAddress(m_hDll, "IsInAlarmMoveWhileDisabledMSeries");
	m_IsInAlarmACPowerPhasseLostMSeries = (lpIsInAlarmACPowerPhasseLostMSeries)GetProcAddress(m_hDll, "IsInAlarmACPowerPhasseLostMSeries");
	m_IsInAlarmSafeTorqueOffMSeries = (lpIsInAlarmSafeTorqueOffMSeries)GetProcAddress(m_hDll, "IsInAlarmSafeTorqueOffMSeries");
	m_IsInAlarmVelocityLimitMSeries = (lpIsInAlarmVelocityLimitMSeries)GetProcAddress(m_hDll, "IsInAlarmVelocityLimitMSeries");
	m_IsInAlarmVoltageWarningMSeries = (lpIsInAlarmVoltageWarningMSeries)GetProcAddress(m_hDll, "IsInAlarmVoltageWarningMSeries");


	m_bWasLoaded = TRUE;
}

SCLLibHelper::~SCLLibHelper()
{
	DeleteCriticalSection( &_cs );

	m_bWasLoaded = FALSE;
	if (m_hDll != NULL)
	{
		Close();
		FreeLibrary(m_hDll);
	}
	m_hDll = NULL;
}

// Open Serial Port
BOOL SCLLibHelper::Open(BYTE nCOMPort, int nBaudRate)
{
	CSPtr CS(_cs);

	if (IsOpen())
	{
		Close();
	}
	m_nCOMPort = nCOMPort;
	return m_Open(m_nCOMPort, nBaudRate);
}

// Close
BOOL SCLLibHelper::Close()
{
	return m_Close(m_nCOMPort);
}

// Close
BOOL SCLLibHelper::SetCommParam(BYTE nNodeID, BOOL bSave)
{
	CSPtr CS(_cs);

	return m_SetCommParam(m_nCOMPort, nNodeID, bSave);
}

// return port is open or not
BOOL SCLLibHelper::IsOpen()
{
	CSPtr CS(_cs);

	return m_IsOpen(m_nCOMPort);
}

// Send SCL Command and Return drive's response
BOOL SCLLibHelper::FreeNewMemory(void* pBuffer)
{
	return m_FreeNewMemory(pBuffer);
}

// Set when send data, trigger Send event or not
void SCLLibHelper::SetTriggerSendEvent(BOOL bTriggerSendEvent)
{
	return m_SetTriggerSendEvent(bTriggerSendEvent);
}

// Set when received data, trigger Send event or not
void SCLLibHelper::SetTriggerReceiveEvent(BOOL bTriggerReceiveEvent)
{
	return m_SetTriggerReceiveEvent(bTriggerReceiveEvent);
}

// Set when send data, trigger Send event or not
void SCLLibHelper::SetExecuteTimeOut(UINT nExecuteTimeOut)
{
	return m_SetExecuteTimeOut(m_nCOMPort, nExecuteTimeOut);
}

// Set when received data, trigger Send event or not
UINT SCLLibHelper::GetExecuteTimeOut(BYTE nCOMPort)
{
	return m_GetExecuteTimeOut(nCOMPort);
}

// Send SCL Command
BOOL SCLLibHelper::SendSCLCommand(BYTE nNodeID, LPCTSTR pCommand)
{
	return m_SendSCLCommand(m_nCOMPort, nNodeID, pCommand);
}

// Send SCL Command and Return drive's response
//BOOL SCLLibHelper::ExecuteSCLCommand(BYTE nNodeID, LPCTSTR pCommand, LPTSTR*  strResponse) // Release memory in the end to avoid memory leak.
BOOL SCLLibHelper::ExecuteSCLCommand(BYTE nNodeID, LPCTSTR pCommand, CString& strResponse)
{
	LPTSTR pResponse;
	BOOL ret = m_ExecuteSCLCommand(m_nCOMPort, nNodeID, pCommand, &pResponse);
	strResponse = CString(pResponse);
	m_FreeNewMemory(pResponse);
	return ret;
}

// Get Last Command sent
BOOL SCLLibHelper::GetLastCommandSent(COMMAND_INFO& commandInfo)
{
	return m_GetLastCommandSent(m_nCOMPort, commandInfo);
}

// Get Last Command received
BOOL SCLLibHelper::GetLastCommandReceived(COMMAND_INFO& commandInfo)
{
	return m_GetLastCommandReceived(m_nCOMPort, commandInfo);
}

// Get Last Error Information
void SCLLibHelper::GetLastErrorInfo(PERROR_INFO pErrorInfo)
{
	CSPtr CS( _cs );

	return m_GetLastErrorInfo(pErrorInfo);
}

// Get Node ID Mapping Settings for All drives
//BOOL SCLLibHelper::GetAllNodeIDMapping(LPTSTR* strNodeIDMapping) // Release memory in the end to avoid memory leak.
BOOL SCLLibHelper::GetAllNodeIDMapping(CString& strNodeIDMapping)
{
	LPTSTR pResponse;
	BOOL ret = m_GetAllNodeIDMapping(m_nCOMPort, &pResponse);
	strNodeIDMapping = CString(pResponse);
	m_FreeNewMemory(pResponse);
	return ret;
}

// Set Node ID Mapping Settings for All drives
BOOL SCLLibHelper::SetAllNodeIDMapping(LPTSTR strNodeIDMapping)
{
	return m_SetAllNodeIDMapping(m_nCOMPort, strNodeIDMapping);
}

// Reset Node ID Mapping Settings
BOOL SCLLibHelper::ResetNodeIDMapping(BYTE nCOMPort)
{
	return m_ResetNodeIDMapping(nCOMPort);
}

// Get Node ID Mapping Settings for one drive
BOOL SCLLibHelper::GetOneNodeIDMapping(BYTE nNodeID, char* chRS485Address)
{
	return m_GetOneNodeIDMapping(m_nCOMPort, nNodeID, chRS485Address);
}

// Set Node ID Mapping Settings for one drive
BOOL SCLLibHelper::SetOneNodeIDMapping(BYTE nNodeID, char chRS485Address)
{
	return m_SetOneNodeIDMapping(m_nCOMPort, nNodeID, chRS485Address);
}

// Advanced Functions Start

BOOL SCLLibHelper::DriveEnable(BYTE nNodeID, BOOL bEnable)
{
	CSPtr CS( _cs );

	return m_DriveEnable(m_nCOMPort, nNodeID, bEnable);
}

BOOL SCLLibHelper::SetDriveOutput(BYTE nNodeID, BYTE nOutput1, char chOutputStatus1, BYTE* nOutput2, char* chOutputStatus2, BYTE* nOutput3, char* chOutputStatus3, BYTE* nOutput4, char* chOutputStatus4, BYTE* nOutput5, char* chOutputStatus5, BYTE* nOutput6, char* chOutputStatus6)
{
	return m_SetDriveOutput(m_nCOMPort, nNodeID, nOutput1, chOutputStatus1, nOutput2, chOutputStatus2, nOutput3, chOutputStatus3, nOutput4, chOutputStatus4, nOutput5, chOutputStatus5, nOutput6, chOutputStatus6);
}

BOOL SCLLibHelper::SetP2PProfile(BYTE nNodeID, double* dVelocity, double* dAccel, double* dDecel)
{
	return m_SetP2PProfile(m_nCOMPort, nNodeID, dVelocity, dAccel, dDecel);
}

BOOL SCLLibHelper::SetJogProfile(BYTE nNodeID, double* dVelocity, double* dAccel, double* dDecel)
{
	CSPtr CS( _cs );

	return m_SetJogProfile(m_nCOMPort, nNodeID, dVelocity, dAccel, dDecel);
}

BOOL SCLLibHelper::RelMove(BYTE nNodeID, int nDistance, double* dVelocity, double* dAccel, double* dDecel)
{
	CSPtr CS( _cs );

	return m_RelMove(m_nCOMPort, nNodeID, nDistance, dVelocity, dAccel, dDecel);
}

BOOL SCLLibHelper::AbsMove(BYTE nNodeID, int nDistance, double* dVelocity, double* dAccel, double* dDecel)
{
	CSPtr CS( _cs );

	return m_AbsMove(m_nCOMPort, nNodeID, nDistance, dVelocity, dAccel, dDecel);
}

BOOL SCLLibHelper::FeedtoSensor(BYTE nCOMPort, BYTE nNodeID, int* nStopDistance, BYTE nInputSensor, char chInputStatus, double* dVelocity, double* dAccel, double* dDecel)
{
	return m_FeedtoSensor(nCOMPort, nNodeID, nStopDistance, nInputSensor, chInputStatus, dVelocity, dAccel, dDecel);
}

BOOL SCLLibHelper::P2PMoveWithVelocityChange(BYTE nCOMPort, BYTE nNodeID, int* nDistance1, int* nDistance2, BYTE* nInputSensor, char* chInputStatus, double* dVelocity1, double* dVelocity2, double* dAccel, double* dDecel)
{
	return m_P2PMoveWithVelocityChange(nCOMPort, nNodeID, nDistance1, nDistance2, nInputSensor, chInputStatus, dVelocity1, dVelocity2, dAccel, dDecel);
}

BOOL SCLLibHelper::P2PMoveAndSetOutput(BYTE nCOMPort, BYTE nNodeID, int* nMoveDistance, int* nSetOutputDistance, BYTE nOutput, char chOutputStatus, double* dVelocity, double* dAccel, double* dDecel)
{
	return m_P2PMoveAndSetOutput(nCOMPort, nNodeID, nMoveDistance, nSetOutputDistance, nOutput, chOutputStatus, dVelocity, dAccel, dDecel);
}

BOOL SCLLibHelper::FeedtoDoubleSensor(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor1, char chCondition1, BYTE nInputSensor2, char chCondition2, double* dVelocity, double* dAccel, double* dDecel)
{
	return m_FeedtoDoubleSensor(nCOMPort, nNodeID, nInputSensor1, chCondition1, nInputSensor2, chCondition2, dVelocity, dAccel, dDecel);
}

BOOL SCLLibHelper::FeedtoSensorWithMaskDistance(BYTE nCOMPort, BYTE nNodeID, int* nStopDistance, int* nMaskDistance, BYTE nInputSensor, char chInputStatus, double* dVelocity, double* dAccel, double* dDecel)
{
	return m_FeedtoSensorWithMaskDistance(nCOMPort, nNodeID, nStopDistance, nMaskDistance, nInputSensor, chInputStatus, dVelocity, dAccel, dDecel);
}

BOOL SCLLibHelper::SeekHome(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, char chInputStatus, double* dVelocity, double* dAccel, double* dDecel)
{
	return m_SeekHome(nCOMPort, nNodeID, nInputSensor, chInputStatus, dVelocity, dAccel, dDecel);
}

BOOL SCLLibHelper::SeekHome( BYTE nNodeID, BYTE nInputSensor, char chInputStatus, double* dVelocity, double* dAccel, double* dDecel)
{
	CSPtr CS( _cs );

    return SeekHome( m_nCOMPort , nNodeID , nInputSensor, chInputStatus, dVelocity, dAccel, dDecel);
}

BOOL SCLLibHelper::ExtendedSeekHome(BYTE nCOMPort, BYTE nNodeID, BYTE nInputSensor, char chInputStatus, double* dVelocity1, double* dVelocity2, double* dVelocity3, double* dAccel1, double* dAccel2, double* dAccel3, double* dDecel1, double* dDecel2, double* dDecel3)
{
	return m_ExtendedSeekHome(nCOMPort, nNodeID, nInputSensor, chInputStatus, dVelocity1, dVelocity2, dVelocity3, dAccel1, dAccel2, dAccel3, dDecel1, dDecel2, dDecel3);
}

BOOL SCLLibHelper::HardStopHoming(BYTE nCOMPort, int nNodeID, BOOL bWithIndex, double* dVelocity1, double* dVelocity2, double* dVelocity3, double* dAccel1, double* dAccel2, double* dAccel3, double* dDecel1, double* dDecel2, double* dDecel3)
{
	return m_HardStopHoming(nCOMPort, nNodeID, bWithIndex, dVelocity1, dVelocity2, dVelocity3, dAccel1, dAccel2, dAccel3, dDecel1, dDecel2, dDecel3);
}

BOOL SCLLibHelper::IsMotorEnabled(BYTE nNodeID)
{
	CSPtr CS( _cs );

	return m_IsMotorEnabled(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsSampling(BYTE nNodeID)
{
	return m_IsSampling(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInFault(BYTE nNodeID)
{
	return m_IsInFault(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInPosition(BYTE nNodeID)
{
	CSPtr CS( _cs );

	return m_IsInPosition(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsMoving(BYTE nNodeID)
{
	CSPtr CS( _cs );

	return m_IsMoving(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsJogging(BYTE nNodeID)
{
	CSPtr CS( _cs );

	return m_IsJogging(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsStopping(BYTE nNodeID)
{
	return m_IsStopping(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsWaitingforInput(BYTE nNodeID)
{
	return m_IsWaitingforInput(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsSavingParam(BYTE nNodeID)
{
	return m_IsSavingParam(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarm(BYTE nNodeID)
{
	CSPtr CS( _cs );

	return m_IsInAlarm(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsHoming(BYTE nNodeID)
{
	CSPtr CS( _cs );

	return m_IsHoming(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsWaitingforTime(BYTE nNodeID)
{
	return m_IsWaitingforTime(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsRunningWizard(BYTE nNodeID)
{
	return m_IsRunningWizard(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsCheckingEncoder(BYTE nNodeID)
{
	return m_IsCheckingEncoder(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsRunningQProgram(BYTE nNodeID)
{
	return m_IsRunningQProgram(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInitializingOrServoReady(BYTE nNodeID)
{
	return m_IsInitializingOrServoReady(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmPositionLimit(BYTE nNodeID)
{
	return m_IsInAlarmPositionLimit(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmCWLimit(BYTE nNodeID)
{
	CSPtr CS( _cs );

	return m_IsInAlarmCWLimit(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmCCWLimit(BYTE nNodeID)
{
	CSPtr CS( _cs );

	return m_IsInAlarmCCWLimit(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmOverTemp(BYTE nNodeID)
{
	return m_IsInAlarmOverTemp(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmOverVoltage(BYTE nNodeID)
{
	return m_IsInAlarmOverVoltage(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmUnderVoltage(BYTE nNodeID)
{
	return m_IsInAlarmUnderVoltage(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmOverCurrent(BYTE nNodeID)
{
	return m_IsInAlarmOverCurrent(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmEncoderFault(BYTE nNodeID)
{
	return m_IsInAlarmEncoderFault(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmCommError(BYTE nNodeID)
{
	return m_IsInAlarmCommError(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmBadFlash(BYTE nNodeID)
{
	return m_IsInAlarmBadFlash(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmBlankQSegment(BYTE nNodeID)
{
	return m_IsInAlarmBlankQSegment(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmMoveWhileDisabled(BYTE nNodeID)
{
	return m_IsInAlarmMoveWhileDisabled(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmMoveWhileDisabledMSeries(BYTE nNodeID)
{
	return m_IsInAlarmMoveWhileDisabledMSeries(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmACPowerPhasseLostMSeries(BYTE nNodeID)
{
	return m_IsInAlarmACPowerPhasseLostMSeries(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmSafeTorqueOffMSeries(BYTE nNodeID)
{
	return m_IsInAlarmSafeTorqueOffMSeries(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmVelocityLimitMSeries(BYTE nNodeID)
{
	return m_IsInAlarmVelocityLimitMSeries(m_nCOMPort, nNodeID);
}

BOOL SCLLibHelper::IsInAlarmVoltageWarningMSeries(BYTE nNodeID)
{
	return m_IsInAlarmVoltageWarningMSeries(m_nCOMPort, nNodeID);
}

// AC - Read
BOOL SCLLibHelper::ReadAccelerationRate(BYTE nNodeID, double* dAccel)
{
	return m_ReadAccelerationRate(m_nCOMPort, nNodeID, dAccel);
}

// AC - Write
BOOL SCLLibHelper::WriteAccelerationRate(BYTE nNodeID, double dAccel)
{
	return m_WriteAccelerationRate(m_nCOMPort, nNodeID, dAccel);
}

// AD - Read
BOOL SCLLibHelper::ReadAnalogDeadband(BYTE nNodeID, BYTE* nAnalogDeadband)
{
	return m_ReadAnalogDeadband(m_nCOMPort, nNodeID, nAnalogDeadband);
}

// AD - Write
BOOL SCLLibHelper::WriteAnalogDeadband(BYTE nNodeID, BYTE nAnalogDeadband)
{
	return m_WriteAnalogDeadband(m_nCOMPort, nNodeID, nAnalogDeadband);
}

// AD for M Series - Read
BOOL SCLLibHelper::ReadAnalogDeadbandWithChannel(BYTE nNodeID, BYTE nAnalogChannel, BYTE* nAnalogDeadband)
{
	return m_ReadAnalogDeadbandWithChannel(m_nCOMPort, nNodeID, nAnalogChannel, nAnalogDeadband);
}

// AD for M Series - Write
BOOL SCLLibHelper::WriteAnalogDeadbandWithChannel(BYTE nNodeID, BYTE nAnalogChannel, BYTE nAnalogDeadband)
{
	return m_WriteAnalogDeadbandMSeries(m_nCOMPort, nNodeID, nAnalogChannel, nAnalogDeadband);
}

// AF - Read
BOOL SCLLibHelper::ReadAnalogFilter(BYTE nNodeID, int* filter)
{
	return m_ReadAnalogFilter(m_nCOMPort, nNodeID, filter);
}

// AF - Write
BOOL SCLLibHelper::WriteAnalogFilter(BYTE nNodeID, int filter)
{
	return m_WriteAnalogFilter(m_nCOMPort, nNodeID, filter);
}

// AG - Read
BOOL SCLLibHelper::ReadAnalogVelocityGain(BYTE nNodeID, int* velocityGain)
{
	return m_ReadAnalogVelocityGain(m_nCOMPort, nNodeID, velocityGain);
}

// AG - Write
BOOL SCLLibHelper::WriteAnalogVelocityGain(BYTE nNodeID, int velocityGain)
{
	return m_WriteAnalogVelocityGain(m_nCOMPort, nNodeID, velocityGain);
}

// AI - Read
BOOL SCLLibHelper::ReadAlarmResetInput(BYTE nNodeID, BYTE* nInputUsage)
{
	return m_ReadAlarmResetInput(m_nCOMPort, nNodeID, nInputUsage);
}

// AI - Write
BOOL SCLLibHelper::WriteAlarmResetInput(BYTE nNodeID, BYTE nInputUsage)
{
	return m_WriteAlarmResetInput(m_nCOMPort, nNodeID, nInputUsage);
}

// AI - Read
BOOL SCLLibHelper::ReadAlarmResetInputFlexIO(BYTE nNodeID, BYTE* nInputUsage, BYTE* nInputSensor)
{
	return m_ReadAlarmResetInputFlexIO(m_nCOMPort, nNodeID, nInputUsage, nInputSensor);
}

// AI - Write
BOOL SCLLibHelper::WriteAlarmResetInputFlexIO(BYTE nNodeID, BYTE nInputUsage, BYTE nInputSensor)
{
	return m_WriteAlarmResetInputFlexIO(m_nCOMPort, nNodeID, nInputUsage, nInputSensor);
}

// AL - Read Only
BOOL SCLLibHelper::ReadAlarmCode(BYTE nNodeID, int* nAlarmCode)
{
	return m_ReadAlarmCode(m_nCOMPort, nNodeID, nAlarmCode);
}

// AL - Read Only
BOOL SCLLibHelper::ReadAlarmCodeWithChannel(BYTE nNodeID, BYTE nChannel, int* nAlarmCode)
{
	return m_ReadAlarmCodeWithChannel(m_nCOMPort, nNodeID, nChannel, nAlarmCode);
}

// AM - Read
BOOL SCLLibHelper::ReadMaxAcceleration(BYTE nNodeID, double* maxAcceleration)
{
	return m_ReadMaxAcceleration(m_nCOMPort, nNodeID, maxAcceleration);
}

// AM - Write
BOOL SCLLibHelper::WriteMaxAcceleration(BYTE nNodeID, double maxAcceleration)
{
	return m_WriteMaxAcceleration(m_nCOMPort, nNodeID, maxAcceleration);
}

// AN - Read
BOOL SCLLibHelper::ReadAnalogTorqueGain(BYTE nNodeID, double* analogTorqueGain)
{
	return m_ReadAnalogTorqueGain(m_nCOMPort, nNodeID, analogTorqueGain);
}

// AN - Write
BOOL SCLLibHelper::WriteAnalogTorqueGain(BYTE nNodeID, double analogTorqueGain)
{
	return m_WriteAnalogTorqueGain(m_nCOMPort, nNodeID, analogTorqueGain);
}

// AO - Read
BOOL SCLLibHelper::ReadAlarmOutput(BYTE nNodeID, BYTE* alarmOutput)
{
	return m_ReadAlarmOutput(m_nCOMPort, nNodeID, alarmOutput);
}

// AO - Write
BOOL SCLLibHelper::WriteAlarmOutput(BYTE nNodeID, BYTE alarmOutput)
{
	return m_WriteAlarmOutput(m_nCOMPort, nNodeID, alarmOutput);
}

// AO - Read
BOOL SCLLibHelper::ReadAlarmOutputFlexIO(BYTE nNodeID, BYTE* pOutputUsage, BYTE* nOutput)
{
	return m_ReadAlarmOutputFlexIO(m_nCOMPort, nNodeID, pOutputUsage, nOutput);
}

// AO - Write
BOOL SCLLibHelper::WriteAlarmOutputFlexIO(BYTE nNodeID, BYTE pOutputUsage, BYTE nOutput)
{
	return m_WriteAlarmOutputFlexIO(m_nCOMPort, nNodeID, pOutputUsage, nOutput);
}

// AP - Read
BOOL SCLLibHelper::ReadAnalogPositionGain(BYTE nNodeID, int* positionGain)
{
	return m_ReadAnalogPositionGain(m_nCOMPort, nNodeID, positionGain);
}

// AP - Write
BOOL SCLLibHelper::WriteAnalogPositionGain(BYTE nNodeID, int positionGain)
{
	return m_WriteAnalogPositionGain(m_nCOMPort, nNodeID, positionGain);
}

// AR - Write Only
BOOL SCLLibHelper::WriteAlarmReset(BYTE nNodeID, BOOL bImmediately)
{
	CSPtr CS( _cs );

	return m_WriteAlarmReset(m_nCOMPort, nNodeID, bImmediately);
}

// AS - Read
BOOL SCLLibHelper::ReadAnalogScaling(BYTE nNodeID, BYTE* scaling)
{
	return m_ReadAnalogScaling(m_nCOMPort, nNodeID, scaling);
}

// AS - Write
BOOL SCLLibHelper::WriteAnalogScaling(BYTE nNodeID, BYTE scaling)
{
	return m_WriteAnalogScaling(m_nCOMPort, nNodeID, scaling);
}

// AT - Read
BOOL SCLLibHelper::ReadAnalogThreshold(BYTE nNodeID, double* analogThreshold)
{
	return m_ReadAnalogThreshold(m_nCOMPort, nNodeID, analogThreshold);
}

// AT - Write
BOOL SCLLibHelper::WriteAnalogThreshold(BYTE nNodeID, double analogThreshold)
{
	return m_WriteAnalogThreshold(m_nCOMPort, nNodeID, analogThreshold);
}

// AV - Read
BOOL SCLLibHelper::ReadAnalogOffset(BYTE nNodeID, double* dAnalogOffset)
{
	return m_ReadAnalogOffset(m_nCOMPort, nNodeID, dAnalogOffset);
}

// AV - Write
BOOL SCLLibHelper::WriteAnalogOffset(BYTE nNodeID, double dAnalogOffset)
{
	return m_WriteAnalogOffset(m_nCOMPort, nNodeID, dAnalogOffset);
}

// AV for M Series - Read
BOOL SCLLibHelper::ReadAnalogOffsetMSeries(BYTE nNodeID, BYTE nAnalogChannel, double* dAnalogOffset)
{
	return m_ReadAnalogOffsetMSeries(m_nCOMPort, nNodeID, nAnalogChannel, dAnalogOffset);
}

// AV for M Series - Write
BOOL SCLLibHelper::WriteAnalogOffsetMSeries(BYTE nNodeID, BYTE nAnalogChannel, double dAnalogOffset)
{
	return m_WriteAnalogOffsetMSeries(m_nCOMPort, nNodeID, nAnalogChannel, dAnalogOffset);
}

// AZ - Write Only
BOOL SCLLibHelper::WriteAnalogZero(BYTE nNodeID)
{
	return m_WriteAnalogZero(m_nCOMPort, nNodeID);
}

// BD - Read
BOOL SCLLibHelper::ReadBrakeDisengageDelay(BYTE nNodeID, double* brakeDisengageDelay)
{
	return m_ReadBrakeDisengageDelay(m_nCOMPort, nNodeID, brakeDisengageDelay);
}

// BD - Write
BOOL SCLLibHelper::WriteBrakeDisengageDelay(BYTE nNodeID, double brakeDisengageDelay)
{
	return m_WriteBrakeDisengageDelay(m_nCOMPort, nNodeID, brakeDisengageDelay);
}

// BE - Read
BOOL SCLLibHelper::ReadBrakeEngageDelay(BYTE nNodeID, double* brakeEngageDelay)
{
	return m_ReadBrakeEngageDelay(m_nCOMPort, nNodeID, brakeEngageDelay);
}

// BE - Write
BOOL SCLLibHelper::WriteBrakeEngageDelay(BYTE nNodeID, double brakeEngageDelay)
{
	return m_WriteBrakeEngageDelay(m_nCOMPort, nNodeID, brakeEngageDelay);
}

// BO - Read
BOOL SCLLibHelper::ReadBrakeOutput(BYTE nNodeID, BYTE* nInputUsage)
{
	return m_ReadBrakeOutput(m_nCOMPort, nNodeID, nInputUsage);
}

// BO - Write
BOOL SCLLibHelper::WriteBrakeOutput(BYTE nNodeID, BYTE nInputUsage)
{
	return m_WriteBrakeOutput(m_nCOMPort, nNodeID, nInputUsage);
}

// BO - Read
BOOL SCLLibHelper::ReadBrakeOutputFlexIO(BYTE nNodeID, BYTE* pOutputUsage, BYTE* nOutput)
{
	return m_ReadBrakeOutputFlexIO(m_nCOMPort, nNodeID, pOutputUsage, nOutput);
}

// BO - Write
BOOL SCLLibHelper::WriteBrakeOutputFlexIO(BYTE nNodeID, BYTE pOutputUsage, BYTE nOutput)
{
	return m_WriteBrakeOutputFlexIO(m_nCOMPort, nNodeID, pOutputUsage, nOutput);
}

// BR - Read
BOOL SCLLibHelper::ReadBaudRate(BYTE nNodeID, BYTE* nBaudRate)
{
	CSPtr CS( _cs );

	return m_ReadBaudRate(m_nCOMPort, nNodeID, nBaudRate);
}

// BS - Read Only
BOOL SCLLibHelper::ReadBufferStatus(BYTE nNodeID, BYTE* bufferStatus)
{
	return m_ReadBufferStatus(m_nCOMPort, nNodeID, bufferStatus);
}

// CA - Read
BOOL SCLLibHelper::ReadChangeAccelerationCurrent(BYTE nNodeID, double* changeAccelerationCurrent)
{
	return m_ReadChangeAccelerationCurrent(m_nCOMPort, nNodeID, changeAccelerationCurrent);
}

// CA - Write
BOOL SCLLibHelper::WriteChangeAccelerationCurrent(BYTE nNodeID, double changeAccelerationCurrent)
{
	return m_WriteChangeAccelerationCurrent(m_nCOMPort, nNodeID, changeAccelerationCurrent);
}

// CC - Read
BOOL SCLLibHelper::ReadChangeCurrent(BYTE nNodeID, double* changeCurrent)
{
	return m_ReadChangeCurrent(m_nCOMPort, nNodeID, changeCurrent);
}

// CC - Write
BOOL SCLLibHelper::WriteChangeCurrent(BYTE nNodeID, double changeCurrent)
{
	return m_WriteChangeCurrent(m_nCOMPort, nNodeID, changeCurrent);
}

// CD - Read
BOOL SCLLibHelper::ReadIdleCurrentDelayTime(BYTE nNodeID, double* idleCurrentDelayTime)
{
	return m_ReadIdleCurrentDelayTime(m_nCOMPort, nNodeID, idleCurrentDelayTime);
}

// CD - Write
BOOL SCLLibHelper::WriteIdleCurrentDelayTime(BYTE nNodeID, double idleCurrentDelayTime)
{
	return m_WriteIdleCurrentDelayTime(m_nCOMPort, nNodeID, idleCurrentDelayTime);
}

// CE - Read Only
BOOL SCLLibHelper::ReadCommunicationError(BYTE nNodeID, int* communicationError)
{
	return m_ReadCommunicationError(m_nCOMPort, nNodeID, communicationError);
}

// CF - Read
BOOL SCLLibHelper::ReadAntiResonanceFilterFreq(BYTE nNodeID, int* antiResonanceFilterFreq)
{
	return m_ReadAntiResonanceFilterFreq(m_nCOMPort, nNodeID, antiResonanceFilterFreq);
}

// CF - Write
BOOL SCLLibHelper::WriteAntiResonanceFilterFreq(BYTE nNodeID, int antiResonanceFilterFreq)
{
	return m_WriteAntiResonanceFilterFreq(m_nCOMPort, nNodeID, antiResonanceFilterFreq);
}

// CG - Read
BOOL SCLLibHelper::ReadAntiResonanceFilterGain(BYTE nNodeID, int* antiResonanceFilterGain)
{
	return m_ReadAntiResonanceFilterGain(m_nCOMPort, nNodeID, antiResonanceFilterGain);
}

// CG - Write
BOOL SCLLibHelper::WriteAntiResonanceFilterGain(BYTE nNodeID, int antiResonanceFilterGain)
{
	return m_WriteAntiResonanceFilterGain(m_nCOMPort, nNodeID, antiResonanceFilterGain);
}

// CI - Read
BOOL SCLLibHelper::ReadChangeIdleCurrent(BYTE nNodeID, double* changeIdleCurrent)
{
	return m_ReadChangeIdleCurrent(m_nCOMPort, nNodeID, changeIdleCurrent);
}

// CI - Write
BOOL SCLLibHelper::WriteChangeIdleCurrent(BYTE nNodeID, double changeIdleCurrent)
{
	return m_WriteChangeIdleCurrent(m_nCOMPort, nNodeID, changeIdleCurrent);
}

// CJ - Write Only
BOOL SCLLibHelper::WriteCommenceJogging(BYTE nNodeID)
{
	CSPtr CS( _cs );

	return m_WriteCommenceJogging(m_nCOMPort, nNodeID);
}

// CM - Read
BOOL SCLLibHelper::ReadCommandMode(BYTE nNodeID, BYTE* nCommandMode)
{
	return m_ReadCommandMode(m_nCOMPort, nNodeID, nCommandMode);
}

// CM - Write
BOOL SCLLibHelper::WriteCommandMode(BYTE nNodeID, BYTE nCommandMode)
{
	return m_WriteCommandMode(m_nCOMPort, nNodeID, nCommandMode);
}

// CN - Read
BOOL SCLLibHelper::ReadSecondaryCommandMode(BYTE nNodeID, BYTE* nCommandMode)
{
	return m_ReadSecondaryCommandMode(m_nCOMPort, nNodeID, nCommandMode);
}

// CN - Write
BOOL SCLLibHelper::WriteSecondaryCommandMode(BYTE nNodeID, BYTE nCommandMode)
{
	return m_WriteSecondaryCommandMode(m_nCOMPort, nNodeID, nCommandMode);
}

// CP - Read
BOOL SCLLibHelper::ReadChangePeakCurrent(BYTE nNodeID, double* dChangePeakCurrent)
{
	return m_ReadChangePeakCurrent(m_nCOMPort, nNodeID, dChangePeakCurrent);
}

// CP - Write
BOOL SCLLibHelper::WriteChangePeakCurrent(BYTE nNodeID, double dChangePeakCurrent)
{
	return m_WriteChangePeakCurrent(m_nCOMPort, nNodeID, dChangePeakCurrent);
}

// CR - Write Only
BOOL SCLLibHelper::WriteCompareRegisters(BYTE nNodeID, char chRegister1, char chRegister2)
{
	return m_WriteCompareRegisters(m_nCOMPort, nNodeID, chRegister1, chRegister2);
}

// CS - Read
BOOL SCLLibHelper::ReadChangeSpeed(BYTE nNodeID, double* dChangeSpeed)
{
	return m_ReadChangeSpeed(m_nCOMPort, nNodeID, dChangeSpeed);
}

// CS - Write
BOOL SCLLibHelper::WriteChangeSpeed(BYTE nNodeID, double dChangeSpeed)
{
	return m_WriteChangeSpeed(m_nCOMPort, nNodeID, dChangeSpeed);
}

// DC - Read
BOOL SCLLibHelper::ReadChangeDistance(BYTE nNodeID, int* nChangeDistance)
{
	return m_ReadChangeDistance(m_nCOMPort, nNodeID, nChangeDistance);
}

// DC - Write
BOOL SCLLibHelper::WriteChangeDistance(BYTE nNodeID, int nChangeDistance)
{
	return m_WriteChangeDistance(m_nCOMPort, nNodeID, nChangeDistance);
}

// DD - Read
BOOL SCLLibHelper::ReadDefaultDisplay(BYTE nNodeID, BYTE* nDefaultDisplay)
{
	return m_ReadDefaultDisplay(m_nCOMPort, nNodeID, nDefaultDisplay);
}

// DD - Write
BOOL SCLLibHelper::WriteDefaultDisplay(BYTE nNodeID, BYTE nDefaultDisplay)
{
	return m_WriteDefaultDisplay(m_nCOMPort, nNodeID, nDefaultDisplay);
}

// DE - Read
BOOL SCLLibHelper::ReadDecelerationRate(BYTE nNodeID, double* dDecel)
{
	return m_ReadDecelerationRate(m_nCOMPort, nNodeID, dDecel);
}

// DE - Write
BOOL SCLLibHelper::WriteDecelerationRate(BYTE nNodeID, double dDecel)
{
	return m_WriteDecelerationRate(m_nCOMPort, nNodeID, dDecel);
}

// DI - Read
BOOL SCLLibHelper::ReadDistanceOrPosition(BYTE nNodeID, int* nDistance)
{
	return m_ReadDistanceOrPosition(m_nCOMPort, nNodeID, nDistance);
}

// DI - Write
BOOL SCLLibHelper::WriteDistanceOrPosition(BYTE nNodeID, int nDistance)
{
	CSPtr CS( _cs );

	return m_WriteDistanceOrPosition(m_nCOMPort, nNodeID, nDistance);
}

// DL - Read
BOOL SCLLibHelper::ReadDefineLimits(BYTE nNodeID, BYTE* nDefineLimits)
{
	return m_ReadDefineLimits(m_nCOMPort, nNodeID, nDefineLimits);
}

// DL - Write
BOOL SCLLibHelper::WriteDefineLimits(BYTE nNodeID, BYTE nDefineLimits)
{
	return m_WriteDefineLimits(m_nCOMPort, nNodeID, nDefineLimits);
}

// DP - Read
BOOL SCLLibHelper::ReadDumpingPower(BYTE nNodeID, BYTE* nDumpingPower)
{
	return m_ReadDumpingPower(m_nCOMPort, nNodeID, nDumpingPower);
}

// DP - Write
BOOL SCLLibHelper::WriteDumpingPower(BYTE nNodeID, BYTE nDumpingPower)
{
	return m_WriteDumpingPower(m_nCOMPort, nNodeID, nDumpingPower);
}

// DR - Write Only
BOOL SCLLibHelper::WriteDataRegisterforCapture(BYTE nNodeID, char chDataRegisterforCapture)
{
	return m_WriteDataRegisterforCapture(m_nCOMPort, nNodeID, chDataRegisterforCapture);
}

// DS - Read
BOOL SCLLibHelper::ReadSwitchingElectronicGearing(BYTE nNodeID, BYTE* nSwitchingElectronicGearing)
{
	return m_ReadSwitchingElectronicGearing(m_nCOMPort, nNodeID, nSwitchingElectronicGearing);
}

// DS - Write
BOOL SCLLibHelper::WriteSwitchingElectronicGearing(BYTE nNodeID, BYTE nSwitchingElectronicGearing)
{
	return m_WriteSwitchingElectronicGearing(m_nCOMPort, nNodeID, nSwitchingElectronicGearing);
}

// ED - Read
BOOL SCLLibHelper::ReadEncoderDirection(BYTE nNodeID, BYTE* nEncoderDirection)
{
	return m_ReadEncoderDirection(m_nCOMPort, nNodeID, nEncoderDirection);
}

// ED - Write
BOOL SCLLibHelper::WriteEncoderDirection(BYTE nNodeID, BYTE nEncoderDirection)
{
	return m_WriteEncoderDirection(m_nCOMPort, nNodeID, nEncoderDirection);
}

// EF - Read
BOOL SCLLibHelper::ReadEncoderFunction(BYTE nNodeID, BYTE* nEncoderFunction)
{
	return m_ReadEncoderFunction(m_nCOMPort, nNodeID, nEncoderFunction);
}

// EF - Write
BOOL SCLLibHelper::WriteEncoderFunction(BYTE nNodeID, BYTE nEncoderFunction)
{
	return m_WriteEncoderFunction(m_nCOMPort, nNodeID, nEncoderFunction);
}

// EG - Read
BOOL SCLLibHelper::ReadElectronicGearing(BYTE nNodeID, int* nElectronicGearing)
{
	return m_ReadElectronicGearing(m_nCOMPort, nNodeID, nElectronicGearing);
}

// EG - Write
BOOL SCLLibHelper::WriteElectronicGearing(BYTE nNodeID, int nElectronicGearing)
{
	return m_WriteElectronicGearing(m_nCOMPort, nNodeID, nElectronicGearing);
}

// EH - Write
BOOL SCLLibHelper::WriteExtendedHoming(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX)
{
	return m_WriteExtendedHoming(m_nCOMPort, nNodeID, nInputSensor, chInputStatus, bWithOptionalX);
}

// EI - Read
BOOL SCLLibHelper::ReadInputNoiseFilter(BYTE nNodeID, BYTE* nInputNoiseFilter)
{
	return m_ReadInputNoiseFilter(m_nCOMPort, nNodeID, nInputNoiseFilter);
}

// EI - Write
BOOL SCLLibHelper::WriteInputNoiseFilter(BYTE nNodeID, BYTE nInputNoiseFilter)
{
	return m_WriteInputNoiseFilter(m_nCOMPort, nNodeID, nInputNoiseFilter);
}

// EN - Read
BOOL SCLLibHelper::ReadElectronicGearingRatioNumerator(BYTE nNodeID, BYTE* nElectronicGearingRatioNumerator)
{
	return m_ReadElectronicGearingRatioNumerator(m_nCOMPort, nNodeID, nElectronicGearingRatioNumerator);
}

// EN - Write
BOOL SCLLibHelper::WriteElectronicGearingRatioNumerator(BYTE nNodeID, BYTE nElectronicGearingRatioNumerator)
{
	return m_WriteElectronicGearingRatioNumerator(m_nCOMPort, nNodeID, nElectronicGearingRatioNumerator);
}

// EP - Read
BOOL SCLLibHelper::ReadEncoderPosition(BYTE nNodeID, int* nEncoderPosition)
{
	return m_ReadEncoderPosition(m_nCOMPort, nNodeID, nEncoderPosition);
}

// EP - Write
BOOL SCLLibHelper::WriteEncoderPosition(BYTE nNodeID, int nEncoderPosition)
{
	return m_WriteEncoderPosition(m_nCOMPort, nNodeID, nEncoderPosition);
}

// ER - Read
BOOL SCLLibHelper::ReadEncoderResolution(BYTE nNodeID, int* nEncoderResolution)
{
	return m_ReadEncoderResolution(m_nCOMPort, nNodeID, nEncoderResolution);
}

// ER - Write
BOOL SCLLibHelper::WriteEncoderResolution(BYTE nNodeID, int nEncoderResolution)
{
	return m_WriteEncoderResolution(m_nCOMPort, nNodeID, nEncoderResolution);
}

// ES - Read
BOOL SCLLibHelper::ReadSingleEndedEncoderUsage(BYTE nNodeID, BYTE* nSingleEndedEncoderUsage)
{
	return m_ReadSingleEndedEncoderUsage(m_nCOMPort, nNodeID, nSingleEndedEncoderUsage);
}

// ES - Write
BOOL SCLLibHelper::WriteSingleEndedEncoderUsage(BYTE nNodeID, BYTE nSingleEndedEncoderUsage)
{
	return m_WriteSingleEndedEncoderUsage(m_nCOMPort, nNodeID, nSingleEndedEncoderUsage);
}

// EU - Read
BOOL SCLLibHelper::ReadElectronicGearingRatioDenominator(BYTE nNodeID, BYTE* nElectronicGearingRatioDenominator)
{
	return m_ReadElectronicGearingRatioDenominator(m_nCOMPort, nNodeID, nElectronicGearingRatioDenominator);
}

// EU - Write
BOOL SCLLibHelper::WriteElectronicGearingRatioDenominator(BYTE nNodeID, BYTE nElectronicGearingRatioDenominator)
{
	return m_WriteElectronicGearingRatioDenominator(m_nCOMPort, nNodeID, nElectronicGearingRatioDenominator);
}

// FA - Read
BOOL SCLLibHelper::ReadFunctionofAnalogInput(BYTE nNodeID, BYTE nAnalogChannel, BYTE* nFunction)
{
	return m_ReadFunctionofAnalogInput(m_nCOMPort, nNodeID, nAnalogChannel, nFunction);
}

// FA - Write
BOOL SCLLibHelper::WriteFunctionofAnalogInput(BYTE nNodeID, BYTE nAnalogChannel, BYTE nFunction)
{
	return m_WriteFunctionofAnalogInput(m_nCOMPort, nNodeID, nAnalogChannel, nFunction);
}

// FC - Write Only
BOOL SCLLibHelper::WriteFeedtoLengthwithSpeedChange(BYTE nNodeID, BYTE* nInputSensor, char* chInputStatus, BOOL bWithOptionalX)
{
	return m_WriteFeedtoLengthwithSpeedChange(m_nCOMPort, nNodeID, nInputSensor, chInputStatus, bWithOptionalX);
}

// FD - Write Only
BOOL SCLLibHelper::WriteFeedtoDoubleSensor(BYTE nNodeID, BYTE nInput1, char chInputCondition1, BYTE nInput2, char chInputCondition2)
{
	return m_WriteFeedtoDoubleSensor(m_nCOMPort, nNodeID, nInput1, chInputCondition1, nInput2, chInputCondition2);
}

// FE - Write Only
BOOL SCLLibHelper::WriteFollowEncoder(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX)
{
	return m_WriteFollowEncoder(m_nCOMPort, nNodeID, nInputSensor, chInputStatus, bWithOptionalX);
}

// FH - Write
BOOL SCLLibHelper::WriteFindHome(BYTE nNodeID, int nHomingMethod)
{
	return m_WriteFindHome(m_nCOMPort, nNodeID, nHomingMethod);
}

// FI - Read
BOOL SCLLibHelper::ReadFilterInput(BYTE nNodeID, BYTE nInputSensor, int* nFilter)
{
	return m_ReadFilterInput(m_nCOMPort, nNodeID, nInputSensor, nFilter);
}

// FI - Write
BOOL SCLLibHelper::WriteFilterInput(BYTE nNodeID, BYTE nInputSensor, int nFilter)
{
	return m_WriteFilterInput(m_nCOMPort, nNodeID, nInputSensor, nFilter);
}

// FL - Write Only
BOOL SCLLibHelper::WriteFeedtoLength(BYTE nNodeID, int* nDistance)
{
	return m_WriteFeedtoLength(m_nCOMPort, nNodeID, nDistance);
}

// FM - Write Only
BOOL SCLLibHelper::WriteFeedtoSensorwithMaskDistance(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX)
{
	return m_WriteFeedtoSensorwithMaskDistance(m_nCOMPort, nNodeID, nInputSensor, chInputStatus, bWithOptionalX);
}

// FO - Write Only
BOOL SCLLibHelper::WriteFeedtoLengthandSetOutput(BYTE nNodeID, BYTE nOutput, char nOutputStatus, BOOL bWithOptionalY)
{
	return m_WriteFeedtoLengthandSetOutput(m_nCOMPort, nNodeID, nOutput, nOutputStatus, bWithOptionalY);
}

// FP - Write Only
BOOL SCLLibHelper::WriteFeedtoPosition(BYTE nNodeID, int* nPosition)
{
	return m_WriteFeedtoPosition(m_nCOMPort, nNodeID, nPosition);
}

// FS - Write Only
BOOL SCLLibHelper::WriteFeedtoSensor(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX)
{
	return m_WriteFeedtoSensor(m_nCOMPort, nNodeID, nInputSensor, chInputStatus, bWithOptionalX);
}

// FX - Read
BOOL SCLLibHelper::ReadFilterSelectInputs(BYTE nNodeID, BYTE* nFilterSelectInputs)
{
	return m_ReadFilterSelectInputs(m_nCOMPort, nNodeID, nFilterSelectInputs);
}

// FX - Write
BOOL SCLLibHelper::WriteFilterSelectInputs(BYTE nNodeID, BYTE nFilterSelectInputs)
{
	return m_WriteFilterSelectInputs(m_nCOMPort, nNodeID, nFilterSelectInputs);
}

// FY - Write Only
BOOL SCLLibHelper::WriteFeedtoSensorwithSafetyDistance(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX)
{
	return m_WriteFeedtoSensorwithSafetyDistance(m_nCOMPort, nNodeID, nInputSensor, chInputStatus, bWithOptionalX);
}

// GC - Read
BOOL SCLLibHelper::ReadCurrentCommand(BYTE nNodeID, int* nCurrentCommand)
{
	return m_ReadCurrentCommand(m_nCOMPort, nNodeID, nCurrentCommand);
}

// GC - Write
BOOL SCLLibHelper::WriteCurrentCommand(BYTE nNodeID, int nCurrentCommand)
{
	return m_WriteCurrentCommand(m_nCOMPort, nNodeID, nCurrentCommand);
}

// GG - Read
BOOL SCLLibHelper::ReadGlobalGainSelection(BYTE nNodeID, BYTE* nGlobalGainSelection)
{
	return m_ReadGlobalGainSelection(m_nCOMPort, nNodeID, nGlobalGainSelection);
}

// GG - Write
BOOL SCLLibHelper::WriteGlobalGainSelection(BYTE nNodeID, BYTE nGlobalGainSelection)
{
	return m_WriteGlobalGainSelection(m_nCOMPort, nNodeID, nGlobalGainSelection);
}

//HA - Read
BOOL SCLLibHelper::ReadHomingAcceleration(BYTE nNodeID, int nStep, double* dHomingAccel)
{
	return m_ReadHomingAcceleration(m_nCOMPort, nNodeID, nStep, dHomingAccel);
}

// HA - Write
BOOL SCLLibHelper::WriteHomingAcceleration(BYTE nNodeID, int nStep, double dHomingAccel)
{
	return m_WriteHomingAcceleration(m_nCOMPort, nNodeID, nStep, dHomingAccel);
}

// HC - Read
BOOL SCLLibHelper::ReadHardStopCurrent(BYTE nNodeID, double* dHardStopCurrent)
{
	return m_ReadHardStopCurrent(m_nCOMPort, nNodeID, dHardStopCurrent);
}

// HC - Write
BOOL SCLLibHelper::WriteHardStopCurrent(BYTE nNodeID, double dHardStopCurrent)
{
	return m_WriteHardStopCurrent(m_nCOMPort, nNodeID, dHardStopCurrent);
}

// HD -Read
BOOL SCLLibHelper::ReadHardStopFaultDelay(BYTE nNodeID, int* nHardStopCurrent)
{
	return m_ReadHardStopFaultDelay(m_nCOMPort, nNodeID, nHardStopCurrent);
}

// HD - Write
BOOL SCLLibHelper::WriteHardStopFaultDelay(BYTE nNodeID, int nHardStopFaultDelay)
{
	return m_WriteHardStopFaultDelay(m_nCOMPort, nNodeID, nHardStopFaultDelay);
}

// HG - Read
BOOL SCLLibHelper::ReadHarmonicFilterGain(BYTE nNodeID, int* nHarmonicFilterGain)
{
	return m_ReadHarmonicFilterGain(m_nCOMPort, nNodeID, nHarmonicFilterGain);
}

// HG - Write
BOOL SCLLibHelper::WriteHarmonicFilterGain(BYTE nNodeID, int nHarmonicFilterGain)
{
	return m_WriteHarmonicFilterGain(m_nCOMPort, nNodeID, nHarmonicFilterGain);
}

//HL - Read
BOOL SCLLibHelper::ReadHomingDeceleration(BYTE nNodeID, int nStep, double* dHomingDecel)
{
	return m_ReadHomingDeceleration(m_nCOMPort, nNodeID, nStep, dHomingDecel);
}

// HL - Write
BOOL SCLLibHelper::WriteHomingDeceleration(BYTE nNodeID, int nStep, double dHomingDecel)
{
	return m_WriteHomingDeceleration(m_nCOMPort, nNodeID, nStep, dHomingDecel);
}

// HO - Read
BOOL SCLLibHelper::ReadHomingOffset(BYTE nNodeID, int* nHomingOffset)
{
	return m_ReadHomingOffset(m_nCOMPort, nNodeID, nHomingOffset);
}

// HO - Write
BOOL SCLLibHelper::WriteHomingOffset(BYTE nNodeID, int nHomingOffset)
{
	return m_WriteHomingOffset(m_nCOMPort, nNodeID, nHomingOffset);
}

// HP - Read
BOOL SCLLibHelper::ReadHarmonicFilterPhase(BYTE nNodeID, int* nHarmonicFilterPhase)
{
	return m_ReadHarmonicFilterPhase(m_nCOMPort, nNodeID, nHarmonicFilterPhase);
}

// HP - Write
BOOL SCLLibHelper::WriteHarmonicFilterPhase(BYTE nNodeID, int nHarmonicFilterPhase)
{
	return m_WriteHarmonicFilterPhase(m_nCOMPort, nNodeID, nHarmonicFilterPhase);
}

// HS - Write
BOOL SCLLibHelper::WriteHardStopHoming(BYTE nNodeID, BOOL bWithIndex)
{
	CSPtr CS( _cs );

	return m_WriteHardStopHoming(m_nCOMPort, nNodeID, bWithIndex);
}

// HV - Read
BOOL SCLLibHelper::ReadHomingVelocity(BYTE nNodeID, int nStep, double* dHomeVelocity)
{
	return m_ReadHomingVelocity(m_nCOMPort, nNodeID, nStep, dHomeVelocity);
}

// HV - Write
BOOL SCLLibHelper::WriteHomingVelocity(BYTE nNodeID, int nStep, double dHomeVelocity)
{
	return m_WriteHomingVelocity(m_nCOMPort, nNodeID, nStep, dHomeVelocity);
}

// HW - Write Only
BOOL SCLLibHelper::WriteHandWheel(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX)
{
	return m_WriteHandWheel(m_nCOMPort, nNodeID, nInputSensor, chInputStatus, bWithOptionalX);
}

// IA - Read
BOOL SCLLibHelper::ReadImmediateAnalog(BYTE nNodeID, double* nAnalogValue)
{
	return m_ReadImmediateAnalog(m_nCOMPort, nNodeID, nAnalogValue);
}

// IA1 - Read
BOOL SCLLibHelper::ReadImmediateAnalogWithChannel(BYTE nNodeID, int nChannel, double* dAnalogValue)
{
	return m_ReadImmediateAnalogWithChannel(m_nCOMPort, nNodeID, nChannel, dAnalogValue);
}

// IC - Read
BOOL SCLLibHelper::ReadImmediateCommandedCurrent(BYTE nNodeID, double* dImmediateCommandedCurrent)
{
	return m_ReadImmediateCommandedCurrent(m_nCOMPort, nNodeID, dImmediateCommandedCurrent);
}

// ID - Read Only
BOOL SCLLibHelper::ReadImmediateDistance(BYTE nNodeID, int* immediateDistance)
{
	return m_ReadImmediateDistance(m_nCOMPort, nNodeID, immediateDistance);
}

// IE - Read Only
BOOL SCLLibHelper::ReadImmediateEncoder(BYTE nNodeID, int* immediateEncoder)
{
	CSPtr CS( _cs );

	return m_ReadImmediateEncoder(m_nCOMPort, nNodeID, immediateEncoder);
}

// IF - Read Only
BOOL SCLLibHelper::ReadHexFormat(BYTE nNodeID, BOOL* bHexFormat)
{
	return m_ReadHexFormat(m_nCOMPort, nNodeID, bHexFormat);
}

// IH - Write Only
BOOL SCLLibHelper::WriteImmediateHighOutput(BYTE nNodeID, BYTE nOutput, BOOL bWithOptionalY)
{
	return m_WriteImmediateHighOutput(m_nCOMPort, nNodeID, nOutput, bWithOptionalY);
}

// IL - Write Only
BOOL SCLLibHelper::WriteImmediateLowOutput(BYTE nNodeID, BYTE nOutput, BOOL bWithOptionalY)
{
	return m_WriteImmediateLowOutput(m_nCOMPort, nNodeID, nOutput, bWithOptionalY);
}

// IO - Read
BOOL SCLLibHelper::ReadOutputStatus(BYTE nNodeID, BYTE* nOutputStatus, BOOL bWithOptionalY)
{
	return m_ReadOutputStatus(m_nCOMPort, nNodeID, nOutputStatus, bWithOptionalY);
}

// IO
BOOL SCLLibHelper::WriteOutputStatus(BYTE nNodeID, BYTE nOutputStatus, BOOL bWithOptionalY)
{
	return m_WriteOutputStatus(m_nCOMPort, nNodeID, nOutputStatus, bWithOptionalY);
}

// IP - Read Only
BOOL SCLLibHelper::ReadImmediatePosition(BYTE nNodeID, int* immediatePosition)
{
	return m_ReadImmediatePosition(m_nCOMPort, nNodeID, immediatePosition);
}

// IQ - Read
BOOL SCLLibHelper::ReadImmediateActualCurrent(BYTE nNodeID, double* dImmediateActualCurrent)
{
	return m_ReadImmediateActualCurrent(m_nCOMPort, nNodeID, dImmediateActualCurrent);
}

// IS - Read
BOOL SCLLibHelper::ReadInputStatus(BYTE nNodeID, int* nInputStatus, BOOL bWithOptionalX)
{
	return m_ReadInputStatus(m_nCOMPort, nNodeID, nInputStatus, bWithOptionalX);
}

// IT - Read
BOOL SCLLibHelper::ReadImmediateTemperature(BYTE nNodeID, double* dTemperature)
{
	return m_ReadImmediateTemperature(m_nCOMPort, nNodeID, dTemperature);
}

// IT2 - Read
BOOL SCLLibHelper::ReadImmediateTemperatureWithChannel(BYTE nNodeID, int nChannel, double* dTemperature)
{
	return m_ReadImmediateTemperatureWithChannel(m_nCOMPort, nNodeID, nChannel, dTemperature);
}

// IU - Read
BOOL SCLLibHelper::ReadImmediateVoltage(BYTE nNodeID, double* dVoltage)
{
	return m_ReadImmediateVoltage(m_nCOMPort, nNodeID, dVoltage);
}

// IU0, IU1, IU2 - Read
BOOL SCLLibHelper::ReadImmediateVoltageWithChannel(BYTE nNodeID, int nChannel, double* dVoltage)
{
	return m_ReadImmediateVoltageWithChannel(m_nCOMPort, nNodeID, nChannel, dVoltage);
}

// IV - Read Only
BOOL SCLLibHelper::ReadImmediateActualVelocity(BYTE nNodeID, double* actualVelocity)
{
	return m_ReadImmediateActualVelocity(m_nCOMPort, nNodeID, actualVelocity);
}

// IV - Read Only
BOOL SCLLibHelper::ReadImmediateTargetVelocity(BYTE nNodeID, double* targetVelocity)
{
	return m_ReadImmediateTargetVelocity(m_nCOMPort, nNodeID, targetVelocity);
}

// IX - Read Only
BOOL SCLLibHelper::ReadImmediatePositionError(BYTE nNodeID, int* immediatePositionError)
{
	return m_ReadImmediatePositionError(m_nCOMPort, nNodeID, immediatePositionError);
}

// JA - Read
BOOL SCLLibHelper::ReadJogAcceleration(BYTE nNodeID, double* jogAcceleration)
{
	return m_ReadJogAcceleration(m_nCOMPort, nNodeID, jogAcceleration);
}

// JA - Write
BOOL SCLLibHelper::WriteJogAcceleration(BYTE nNodeID, double jogAcceleration)
{
	return m_WriteJogAcceleration(m_nCOMPort, nNodeID, jogAcceleration);
}

// JC - Read
BOOL SCLLibHelper::ReadVelocityModeSecondSpeed(BYTE nNodeID, double* velocityModeSecondSpeed)
{
	return m_ReadVelocityModeSecondSpeed(m_nCOMPort, nNodeID, velocityModeSecondSpeed);
}

// JC - Write
BOOL SCLLibHelper::WriteVelocityModeSecondSpeed(BYTE nNodeID, double velocityModeSecondSpeed)
{
	return m_WriteVelocityModeSecondSpeed(m_nCOMPort, nNodeID, velocityModeSecondSpeed);
}

// JC for M Series - Read
BOOL SCLLibHelper::ReadVelocityModeSecondSpeedMSeries(BYTE nNodeID, BYTE nVelocityIndex, double* dVelocity)
{
	return m_ReadVelocityModeSecondSpeedMSeries(m_nCOMPort, nNodeID, nVelocityIndex, dVelocity);
}

// JC for M Series - Write
BOOL SCLLibHelper::WriteVelocityModeSecondSpeedMSeries(BYTE nNodeID, BYTE nAnalogChannel, double dVelocity)
{
	return m_WriteVelocityModeSecondSpeedMSeries(m_nCOMPort, nNodeID, nAnalogChannel, dVelocity);
}

// JD - Write Only
BOOL SCLLibHelper::WriteJogDisable(BYTE nNodeID)
{
	return m_WriteJogDisable(m_nCOMPort, nNodeID);
}

// JE- Write Only
BOOL SCLLibHelper::WriteJogEnable(BYTE nNodeID)
{
	return m_WriteJogEnable(m_nCOMPort, nNodeID);
}

// JL - Read
BOOL SCLLibHelper::ReadJogDeceleration(BYTE nNodeID, double* jogDeceleration)
{
	return m_ReadJogDeceleration(m_nCOMPort, nNodeID, jogDeceleration);
}

// JL - Write
BOOL SCLLibHelper::WriteJogDeceleration(BYTE nNodeID, double jogDeceleration)
{
	return m_WriteJogDeceleration(m_nCOMPort, nNodeID, jogDeceleration);
}

// JM - Read
BOOL SCLLibHelper::ReadJogMode(BYTE nNodeID, BYTE* jogMode)
{
	return m_ReadJogMode(m_nCOMPort, nNodeID, jogMode);
}

// JM - Write
BOOL SCLLibHelper::WriteJogMode(BYTE nNodeID, BYTE jogMode)
{
	return m_WriteJogMode(m_nCOMPort, nNodeID, jogMode);
}

// JS - Read
BOOL SCLLibHelper::ReadJogSpeed(BYTE nNodeID, double* jogSpeed)
{
	return m_ReadJogSpeed(m_nCOMPort, nNodeID, jogSpeed);
}

// JS - Write
BOOL SCLLibHelper::WriteJogSpeed(BYTE nNodeID, double jogSpeed)
{
	return m_WriteJogSpeed(m_nCOMPort, nNodeID, jogSpeed);
}

// KC - Read
BOOL SCLLibHelper::ReadOverallServoFilter(BYTE nNodeID, int* overallServoFilter)
{
	return m_ReadOverallServoFilter(m_nCOMPort, nNodeID, overallServoFilter);
}

// KC - Write
BOOL SCLLibHelper::WriteOverallServoFilter(BYTE nNodeID, int overallServoFilter)
{
	return m_WriteOverallServoFilter(m_nCOMPort, nNodeID, overallServoFilter);
}

// KD - Read
BOOL SCLLibHelper::ReadDifferentialConstant(BYTE nNodeID, int* differentialConstant)
{
	return m_ReadDifferentialConstant(m_nCOMPort, nNodeID, differentialConstant);
}

// KD - Write
BOOL SCLLibHelper::WriteDifferentialConstant(BYTE nNodeID, int differentialConstant)
{
	return m_WriteDifferentialConstant(m_nCOMPort, nNodeID, differentialConstant);
}

// KE - Read
BOOL SCLLibHelper::ReadDifferentialFilter(BYTE nNodeID, int* differentialFilter)
{
	return m_ReadDifferentialFilter(m_nCOMPort, nNodeID, differentialFilter);
}

// KE - Write
BOOL SCLLibHelper::WriteDifferentialFilter(BYTE nNodeID, int differentialFilter)
{
	return m_WriteDifferentialFilter(m_nCOMPort, nNodeID, differentialFilter);
}

// KF - Read
BOOL SCLLibHelper::ReadVelocityFeedforwardConstant(BYTE nNodeID, int* velocityFeedforwardConstant)
{
	return m_ReadVelocityFeedforwardConstant(m_nCOMPort, nNodeID, velocityFeedforwardConstant);
}

// KF - Write
BOOL SCLLibHelper::WriteVelocityFeedforwardConstant(BYTE nNodeID, int velocityFeedforwardConstant)
{
	return m_WriteVelocityFeedforwardConstant(m_nCOMPort, nNodeID, velocityFeedforwardConstant);
}

// KG - Read
BOOL SCLLibHelper::ReadSecondaryGlobalGain(BYTE nNodeID, BYTE* nSecondaryGlobalGain)
{
	return m_ReadSecondaryGlobalGain(m_nCOMPort, nNodeID, nSecondaryGlobalGain);
}

// KG - Write
BOOL SCLLibHelper::WriteSecondaryGlobalGain(BYTE nNodeID, BYTE nSecondaryGlobalGain)
{
	return m_WriteSecondaryGlobalGain(m_nCOMPort, nNodeID, nSecondaryGlobalGain);
}

// KI - Read
BOOL SCLLibHelper::ReadIntegratorConstant(BYTE nNodeID, int* integratorConstant)
{
	return m_ReadIntegratorConstant(m_nCOMPort, nNodeID, integratorConstant);
}

// KI - Write
BOOL SCLLibHelper::WriteIntegratorConstant(BYTE nNodeID, int integratorConstant)
{
	return m_WriteIntegratorConstant(m_nCOMPort, nNodeID, integratorConstant);
}

// KJ - Read
BOOL SCLLibHelper::ReadJerkFilterFrequency(BYTE nNodeID, int* jerkFilterFrequency)
{
	return m_ReadJerkFilterFrequency(m_nCOMPort, nNodeID, jerkFilterFrequency);
}

// KJ - Write
BOOL SCLLibHelper::WriteJerkFilterFrequency(BYTE nNodeID, int jerkFilterFrequency)
{
	return m_WriteJerkFilterFrequency(m_nCOMPort, nNodeID, jerkFilterFrequency);
}

// KK - Read
BOOL SCLLibHelper::ReadInertiaFeedforwardConstant(BYTE nNodeID, int* inertiaFeedforwardConstant)
{
	return m_ReadInertiaFeedforwardConstant(m_nCOMPort, nNodeID, inertiaFeedforwardConstant);
}

// KK - Write
BOOL SCLLibHelper::WriteInertiaFeedforwardConstant(BYTE nNodeID, int inertiaFeedforwardConstant)
{
	return m_WriteInertiaFeedforwardConstant(m_nCOMPort, nNodeID, inertiaFeedforwardConstant);
}

// KP - Read
BOOL SCLLibHelper::ReadProportionalConstant(BYTE nNodeID, int* proportionalConstant)
{
	return m_ReadProportionalConstant(m_nCOMPort, nNodeID, proportionalConstant);
}

// KP - Write
BOOL SCLLibHelper::WriteProportionalConstant(BYTE nNodeID, int proportionalConstant)
{
	return m_WriteProportionalConstant(m_nCOMPort, nNodeID, proportionalConstant);
}

// KV - Read
BOOL SCLLibHelper::ReadVelocityFeedbackConstant(BYTE nNodeID, int* velocityFeedbackConstant)
{
	return m_ReadVelocityFeedbackConstant(m_nCOMPort, nNodeID, velocityFeedbackConstant);
}

// KV - Write
BOOL SCLLibHelper::WriteVelocityFeedbackConstant(BYTE nNodeID, int velocityFeedbackConstant)
{
	return m_WriteVelocityFeedbackConstant(m_nCOMPort, nNodeID, velocityFeedbackConstant);
}

// LA - Read
BOOL SCLLibHelper::ReadLeadAngleMaxValue(BYTE nNodeID, BYTE* nLeadAngleMaxValue)
{
	return m_ReadLeadAngleMaxValue(m_nCOMPort, nNodeID, nLeadAngleMaxValue);
}

// LA - Write
BOOL SCLLibHelper::WriteLeadAngleMaxValue(BYTE nNodeID, BYTE nLeadAngleMaxValue)
{
	return m_WriteLeadAngleMaxValue(m_nCOMPort, nNodeID, nLeadAngleMaxValue);
}

// LM - Read
BOOL SCLLibHelper::ReadSoftwareLimitCCW(BYTE nNodeID, int* nSoftwareLimitCCW)
{
	return m_ReadSoftwareLimitCCW(m_nCOMPort, nNodeID, nSoftwareLimitCCW);
}

// LM - Write
BOOL SCLLibHelper::WriteSoftwareLimitCCW(BYTE nNodeID, int nSoftwareLimitCCW)
{
	return m_WriteSoftwareLimitCCW(m_nCOMPort, nNodeID, nSoftwareLimitCCW);
}

// LP - Read
BOOL SCLLibHelper::ReadSoftwareLimitCW(BYTE nNodeID, int* nSoftwareLimitCW)
{
	return m_ReadSoftwareLimitCW(m_nCOMPort, nNodeID, nSoftwareLimitCW);
}

// LP - Write
BOOL SCLLibHelper::WriteSoftwareLimitCW(BYTE nNodeID, int nSoftwareLimitCW)
{
	return m_WriteSoftwareLimitCW(m_nCOMPort, nNodeID, nSoftwareLimitCW);
}

// LS - Read
BOOL SCLLibHelper::ReadLeadAngleSpeed(BYTE nNodeID, double* dLeadAngleSpeed)
{
	return m_ReadLeadAngleSpeed(m_nCOMPort, nNodeID, dLeadAngleSpeed);
}

// LS - Write
BOOL SCLLibHelper::WriteLeadAngleSpeed(BYTE nNodeID, double dLeadAngleSpeed)
{
	return m_WriteLeadAngleSpeed(m_nCOMPort, nNodeID, dLeadAngleSpeed);
}

// LV - Read
BOOL SCLLibHelper::ReadLowVoltageThreshold(BYTE nNodeID, int* lowVoltageThreshold)
{
	return m_ReadLowVoltageThreshold(m_nCOMPort, nNodeID, lowVoltageThreshold);
}

// LV - Write
BOOL SCLLibHelper::WriteLowVoltageThreshold(BYTE nNodeID, int lowVoltageThreshold)
{
	return m_WriteLowVoltageThreshold(m_nCOMPort, nNodeID, lowVoltageThreshold);
}

// MD - Write Only
BOOL SCLLibHelper::WriteMotorDisable(BYTE nNodeID)
{
	return m_WriteMotorDisable(m_nCOMPort, nNodeID);
}

// ME- Write Only
BOOL SCLLibHelper::WriteMotorEnable(BYTE nNodeID)
{
	return m_WriteMotorEnable(m_nCOMPort, nNodeID);
}

//MN - Read
BOOL SCLLibHelper::ReadModelNumber(BYTE nNodeID, BYTE* chModelNumber)
{
	return m_ReadModelNumber(m_nCOMPort, nNodeID, chModelNumber);
}

// MO - Read
BOOL SCLLibHelper::ReadMotionOutput(BYTE nNodeID, BYTE* nOutputUsage)
{
	return m_ReadMotionOutput(m_nCOMPort, nNodeID, nOutputUsage);
}

// MO - Write
BOOL SCLLibHelper::WriteMotionOutput(BYTE nNodeID, BYTE nOutputUsage)
{
	return m_WriteMotionOutput(m_nCOMPort, nNodeID, nOutputUsage);
}

// MO - Read
BOOL SCLLibHelper::ReadMotionOutputFlexIO(BYTE nNodeID, BYTE* pOutputUsage, BYTE* nOutput)
{
	return m_ReadMotionOutputFlexIO(m_nCOMPort, nNodeID, pOutputUsage, nOutput);
}

// MO - Write
BOOL SCLLibHelper::WriteMotionOutputFlexIO(BYTE nNodeID, BYTE pOutputUsage, BYTE nOutput)
{
	return m_WriteMotionOutputFlexIO(m_nCOMPort, nNodeID, pOutputUsage, nOutput);
}

// MO - Read
BOOL SCLLibHelper::ReadMotionOutputMSeries(BYTE nNodeID, BYTE nOutput, BYTE* pOutputUsage)
{
	return m_ReadMotionOutputMSeries(m_nCOMPort, nNodeID, nOutput, pOutputUsage);
}

// MO - Write
BOOL SCLLibHelper::WriteMotionOutputMSeries(BYTE nNodeID, BYTE nOutput, BYTE pOutputUsage)
{
	return m_WriteMotionOutputMSeries(m_nCOMPort, nNodeID, nOutput, pOutputUsage);
}

// MR - Read
BOOL SCLLibHelper::ReadMicrostepResolution(BYTE nNodeID, BYTE* microstepResolution)
{
	return m_ReadMicrostepResolution(m_nCOMPort, nNodeID, microstepResolution);
}

// MR - Write
BOOL SCLLibHelper::WriteMicrostepResolution(BYTE nNodeID, BYTE microstepResolution)
{
	return m_WriteMicrostepResolution(m_nCOMPort, nNodeID, microstepResolution);
}

// MS - Read
BOOL SCLLibHelper::ReadControlModeSelection(BYTE nNodeID, BYTE* nControlModeSelection)
{
	return m_ReadControlModeSelection(m_nCOMPort, nNodeID, nControlModeSelection);
}

// MS - Write
BOOL SCLLibHelper::WriteControlModeSelection(BYTE nNodeID, BYTE nControlModeSelection)
{
	return m_WriteControlModeSelection(m_nCOMPort, nNodeID, nControlModeSelection);
}

// MT - Read
BOOL SCLLibHelper::ReadMultiTasking(BYTE nNodeID, BYTE* multiTasking)
{
	return m_ReadMultiTasking(m_nCOMPort, nNodeID, multiTasking);
}

// MT - Write
BOOL SCLLibHelper::WriteMultiTasking(BYTE nNodeID, BYTE multiTasking)
{
	return m_WriteMultiTasking(m_nCOMPort, nNodeID, multiTasking);
}

// MV - Read Only
//BOOL SCLLibHelper::ReadModelRevision(BYTE nNodeID, LPTSTR* strModelRevision) // Release memory in the end to avoid memory leak.
BOOL SCLLibHelper::ReadModelRevision(BYTE nNodeID, CString& strModelRevision)
{
	LPTSTR pModelRevision;
	BOOL ret = m_ReadModelRevision(m_nCOMPort, nNodeID, &pModelRevision);
	strModelRevision = CString(pModelRevision);
	m_FreeNewMemory(pModelRevision);
	return ret;
}

// OF - Write Only
BOOL SCLLibHelper::WriteOnFault(BYTE nNodeID, BYTE nQSegment)
{
	return m_WriteOnFault(m_nCOMPort, nNodeID, nQSegment);
}

// OI - Write Only
BOOL SCLLibHelper::WriteOnInput(BYTE nNodeID, BYTE* nInputSensor, char* chInputStatus, BOOL bWithOptionalX)
{
	return m_WriteOnInput(m_nCOMPort, nNodeID, nInputSensor, chInputStatus, bWithOptionalX);
}

// OP - Read
BOOL SCLLibHelper::ReadOptionBoard(BYTE nNodeID, BYTE* nOptionBoard)
{
	return m_ReadOptionBoard(m_nCOMPort, nNodeID, nOptionBoard);
}

// PA - Read
BOOL SCLLibHelper::ReadPowerupAccelerationCurrent(BYTE nNodeID, double* powerupAccelerationCurrent)
{
	return m_ReadPowerupAccelerationCurrent(m_nCOMPort, nNodeID, powerupAccelerationCurrent);
}

// PA - Write
BOOL SCLLibHelper::WritePowerupAccelerationCurrent(BYTE nNodeID, double powerupAccelerationCurrent)
{
	return m_WritePowerupAccelerationCurrent(m_nCOMPort, nNodeID, powerupAccelerationCurrent);
}

// PB - Read
BOOL SCLLibHelper::ReadPowerupBaudRate(BYTE nNodeID, BYTE* powerupBaudRate)
{
	return m_ReadPowerupBaudRate(m_nCOMPort, nNodeID, powerupBaudRate);
}

// PB - Write
BOOL SCLLibHelper::WritePowerupBaudRate(BYTE nNodeID, BYTE powerupBaudRate)
{
	return m_WritePowerupBaudRate(m_nCOMPort, nNodeID, powerupBaudRate);
}

// PC - Read
BOOL SCLLibHelper::ReadPowerupCurrent(BYTE nNodeID, double* powerupCurrent)
{
	return m_ReadPowerupCurrent(m_nCOMPort, nNodeID, powerupCurrent);
}

// PC - Write
BOOL SCLLibHelper::WritePowerupCurrent(BYTE nNodeID, double powerupCurrent)
{
	return m_WritePowerupCurrent(m_nCOMPort, nNodeID, powerupCurrent);
}

// PD - Read
BOOL SCLLibHelper::ReadInPositionCounts(BYTE nNodeID, int* nInPositionCounts)
{
	return m_ReadInPositionCounts(m_nCOMPort, nNodeID, nInPositionCounts);
}

// PD - Write
BOOL SCLLibHelper::WriteInPositionCounts(BYTE nNodeID, int nInPositionCounts)
{
	return m_WriteInPositionCounts(m_nCOMPort, nNodeID, nInPositionCounts);
}

// PE - Read
BOOL SCLLibHelper::ReadInPositionTiming(BYTE nNodeID, int* positionFault)
{
	return m_ReadInPositionTiming(m_nCOMPort, nNodeID, positionFault);
}

// PE - Write
BOOL SCLLibHelper::WriteInPositionTiming(BYTE nNodeID, int positionFault)
{
	return m_WriteInPositionTiming(m_nCOMPort, nNodeID, positionFault);
}

// PF - Read
BOOL SCLLibHelper::ReadPositionFault(BYTE nNodeID, int* positionFault)
{
	return m_ReadPositionFault(m_nCOMPort, nNodeID, positionFault);
}

// PF - Write
BOOL SCLLibHelper::WritePositionFault(BYTE nNodeID, int positionFault)
{
	return m_WritePositionFault(m_nCOMPort, nNodeID, positionFault);
}

// PH - Read
BOOL SCLLibHelper::ReadInhibitionOfPulseCommand(BYTE nNodeID, int* nInhibitionOfPulseCommand)
{
	return m_ReadInhibitionOfPulseCommand(m_nCOMPort, nNodeID, nInhibitionOfPulseCommand);
}

// PH - Write
BOOL SCLLibHelper::WriteInhibitionOfPulseCommand(BYTE nNodeID, int nInhibitionOfPulseCommand)
{
	return m_WriteInhibitionOfPulseCommand(m_nCOMPort, nNodeID, nInhibitionOfPulseCommand);
}

// PI - Read
BOOL SCLLibHelper::ReadPowerupIdleCurrent(BYTE nNodeID, double* powerupIdleCurrent)
{
	return m_ReadPowerupIdleCurrent(m_nCOMPort, nNodeID, powerupIdleCurrent);
}

// PI - Write
BOOL SCLLibHelper::WritePowerupIdleCurrent(BYTE nNodeID, double powerupIdleCurrent)
{
	return m_WritePowerupIdleCurrent(m_nCOMPort, nNodeID, powerupIdleCurrent);
}

// PK - Read
BOOL SCLLibHelper::ReadParameterLock(BYTE nNodeID, int* nParameterLock)
{
	return m_ReadParameterLock(m_nCOMPort, nNodeID, nParameterLock);
}

// PK - Write
BOOL SCLLibHelper::WriteParameterLock(BYTE nNodeID, int nParameterLock)
{
	return m_WriteParameterLock(m_nCOMPort, nNodeID, nParameterLock);
}

// PL - Read
BOOL SCLLibHelper::ReadPositionLimit(BYTE nNodeID, int* positionLimit)
{
	return m_ReadPositionLimit(m_nCOMPort, nNodeID, positionLimit);
}

// PL - Write
BOOL SCLLibHelper::WritePositionLimit(BYTE nNodeID, int positionLimit)
{
	return m_WritePositionLimit(m_nCOMPort, nNodeID, positionLimit);
}

// PM - Read
BOOL SCLLibHelper::ReadPowerupMode(BYTE nNodeID, BYTE* powerupMode)
{
	return m_ReadPowerupMode(m_nCOMPort, nNodeID, powerupMode);
}

// PM - Write
BOOL SCLLibHelper::WritePowerupMode(BYTE nNodeID, BYTE powerupMode)
{
	return m_WritePowerupMode(m_nCOMPort, nNodeID, powerupMode);
}

// PN - Write
BOOL SCLLibHelper::WriteProbeonDemand(BYTE nNodeID)
{
	return m_WriteProbeonDemand(m_nCOMPort, nNodeID);
}

// PP - Read
BOOL SCLLibHelper::ReadPowerupPeakCurrent(BYTE nNodeID, double* powerupPeakCurrent)
{
	return m_ReadPowerupPeakCurrent(m_nCOMPort, nNodeID, powerupPeakCurrent);
}

// PP - Write
BOOL SCLLibHelper::WritePowerupPeakCurrent(BYTE nNodeID, double powerupPeakCurrent)
{
	return m_WritePowerupPeakCurrent(m_nCOMPort, nNodeID, powerupPeakCurrent);
}

// PR - Read
BOOL SCLLibHelper::ReadProtocol(BYTE nNodeID, BYTE* nProtocol)
{
	return m_ReadProtocol(m_nCOMPort, nNodeID, nProtocol);
}

// PT - Read
BOOL SCLLibHelper::ReadPulseType(BYTE nNodeID, BYTE* nPulseType)
{
	return m_ReadPulseType(m_nCOMPort, nNodeID, nPulseType);
}

// PT - Write
BOOL SCLLibHelper::WritePulseType(BYTE nNodeID, BYTE nPulseType)
{
	return m_WritePulseType(m_nCOMPort, nNodeID, nPulseType);
}

// PV - Read
BOOL SCLLibHelper::ReadSecondaryElectronicGearing(BYTE nNodeID, BYTE* nSecondaryElectronicGearing)
{
	return m_ReadSecondaryElectronicGearing(m_nCOMPort, nNodeID, nSecondaryElectronicGearing);
}

// PV - Write
BOOL SCLLibHelper::WriteSecondaryElectronicGearing(BYTE nNodeID, BYTE nSecondaryElectronicGearing)
{
	return m_WriteSecondaryElectronicGearing(m_nCOMPort, nNodeID, nSecondaryElectronicGearing);
}

// PW - Write Only
BOOL SCLLibHelper::WritePassword(BYTE nNodeID, LPTSTR password)
{
	return m_WritePassword(m_nCOMPort, nNodeID, password);
}

// QC - Write Only
BOOL SCLLibHelper::WriteQueueCall(BYTE nNodeID, BOOL bWithQSegment, BYTE nQSegment)
{
	return m_WriteQueueCall(m_nCOMPort, nNodeID, bWithQSegment, nQSegment);
}

// QD - Write Only
BOOL SCLLibHelper::WriteQueueDelete(BYTE nNodeID, BYTE nQSegment)
{
	return m_WriteQueueDelete(m_nCOMPort, nNodeID, nQSegment);
}

// QE - Write Only
BOOL SCLLibHelper::WriteQueueExecute(BYTE nNodeID)
{
	return m_WriteQueueExecute(m_nCOMPort, nNodeID);
}

// QG - Write Only
BOOL SCLLibHelper::WriteQueueGoto(BYTE nNodeID, BYTE nLineNumber)
{
	return m_WriteQueueGoto(m_nCOMPort, nNodeID, nLineNumber);
}

// QJ - Write Only
BOOL SCLLibHelper::WriteQueueJump(BYTE nNodeID, char conditionCode, int nLineNumber)
{
	return m_WriteQueueJump(m_nCOMPort, nNodeID, conditionCode, nLineNumber);
}

// QK - Write Only
BOOL SCLLibHelper::WriteQueueKill(BYTE nNodeID)
{
	return m_WriteQueueKill(m_nCOMPort, nNodeID);
}

// QL - Write Only
BOOL SCLLibHelper::WriteQueueLoad(BYTE nNodeID, BOOL fromNVMemory, int nQSegment)
{
	return m_WriteQueueLoad(m_nCOMPort, nNodeID, fromNVMemory, nQSegment);
}

// QR - Write Only
BOOL SCLLibHelper::WriteQueueRepeat(BYTE nNodeID, BYTE nLineNumber)
{
	return m_WriteQueueRepeat(m_nCOMPort, nNodeID, nLineNumber);
}

// QS - Write Only
BOOL SCLLibHelper::WriteQueueSave(BYTE nNodeID, BYTE nQSegment)
{
	return m_WriteQueueSave(m_nCOMPort, nNodeID, nQSegment);
}

// QX - Write Only
BOOL SCLLibHelper::WriteQueueLoadAndExecute(BYTE nNodeID, BYTE nQSegment)
{
	return m_WriteQueueLoadAndExecute(m_nCOMPort, nNodeID, nQSegment);
}

// RC - Write Only
BOOL SCLLibHelper::WriteRegisterCounter(BYTE nNodeID, BYTE* nInputSensor, char* chInputStatus, BOOL bWithOptionalX)
{
	return m_WriteRegisterCounter(m_nCOMPort, nNodeID, nInputSensor, chInputStatus, bWithOptionalX);
}

// RD - Write Only
BOOL SCLLibHelper::WriteRegisterDecrement(BYTE nNodeID, char chDataRegister)
{
	return m_WriteRegisterDecrement(m_nCOMPort, nNodeID, chDataRegister);
}

// RE - Write Only
BOOL SCLLibHelper::WriteRestart(BYTE nNodeID)
{
	return m_WriteRestart(m_nCOMPort, nNodeID);
}

// RI - Write Only
BOOL SCLLibHelper::WriteRegisterIncrement(BYTE nNodeID, char chDataRegister)
{
	return m_WriteRegisterIncrement(m_nCOMPort, nNodeID, chDataRegister);
}

// RL - Read
BOOL SCLLibHelper::ReadRegisterLoad(BYTE nNodeID, char chDataRegister, int* nRegisterValue, BOOL immediately)
{
	return m_ReadRegisterLoad(m_nCOMPort, nNodeID, chDataRegister, nRegisterValue, immediately);
}

// RL - Write
BOOL SCLLibHelper::WriteRegisterLoad(BYTE nNodeID, char chDataRegister, int nRegisterValue, BOOL immediately)
{
	return m_WriteRegisterLoad(m_nCOMPort, nNodeID, chDataRegister, nRegisterValue, immediately);
}

// RM - Write Only
BOOL SCLLibHelper::WriteRegisterMove(BYTE nNodeID, char chRegister1, char chRegister2)
{
	return m_WriteRegisterMove(m_nCOMPort, nNodeID, chRegister1, chRegister2);
}

// RO - Read
BOOL SCLLibHelper::ReadAntiResonanceOn(BYTE nNodeID, BOOL* bAntiResonanceOn)
{
	return m_ReadAntiResonanceOn(m_nCOMPort, nNodeID, bAntiResonanceOn);
}

// RO - Write
BOOL SCLLibHelper::WriteAntiResonanceOn(BYTE nNodeID, BOOL bAntiResonanceOn)
{
	return m_WriteAntiResonanceOn(m_nCOMPort, nNodeID, bAntiResonanceOn);
}

// RR - Write Only
BOOL SCLLibHelper::WriteRegisterRead(BYTE nNodeID, char chRegister1, BYTE value)
{
	return m_WriteRegisterRead(m_nCOMPort, nNodeID, chRegister1, value);
}

// RS - Read Only
//BOOL SCLLibHelper::ReadRequestStatus(BYTE nNodeID, LPTSTR* strStatusWord) // Release memory in the end to avoid memory leak.
BOOL SCLLibHelper::ReadRequestStatus(BYTE nNodeID, CString& strStatusWord)
{
	LPTSTR pStatusWord;
	BOOL ret = m_ReadRequestStatus(m_nCOMPort, nNodeID, &pStatusWord);
	strStatusWord = CString(pStatusWord);
	FreeNewMemory(pStatusWord);
	return ret;
}

// RV - Write
BOOL SCLLibHelper::ReadRevisionLevel(BYTE nNodeID, BYTE* revisionLevel)
{
	return m_ReadRevisionLevel(m_nCOMPort, nNodeID, revisionLevel);
}

// RW - Write Only
BOOL SCLLibHelper::WriteRegisterWrite(BYTE nNodeID, char chRegister1, BYTE chRegister2)
{
	return m_WriteRegisterWrite(m_nCOMPort, nNodeID, chRegister1, chRegister2);
}

// R+ - Write Only
BOOL SCLLibHelper::WriteRegisterAdd(BYTE nNodeID, char chRegister1, char chRegister2)
{
	return m_WriteRegisterAdd(m_nCOMPort, nNodeID, chRegister1, chRegister2);
}

// R- - Write Only
BOOL SCLLibHelper::WriteRegisterSubstract(BYTE nNodeID, char chRegister1, char chRegister2)
{
	return m_WriteRegisterSubstract(m_nCOMPort, nNodeID, chRegister1, chRegister2);
}

// R* - Write Only
BOOL SCLLibHelper::WriteRegisterMultiply(BYTE nNodeID, char chRegister1, char chRegister2)
{
	return m_WriteRegisterMultiply(m_nCOMPort, nNodeID, chRegister1, chRegister2);
}

// R/ - Write Only
BOOL SCLLibHelper::WriteRegisterDivide(BYTE nNodeID, char chRegister1, char chRegister2)
{
	return m_WriteRegisterDivide(m_nCOMPort, nNodeID, chRegister1, chRegister2);
}

// R& - Write Only
BOOL SCLLibHelper::WriteRegisterAnd(BYTE nNodeID, char chRegister1, char chRegister2)
{
	return m_WriteRegisterAnd(m_nCOMPort, nNodeID, chRegister1, chRegister2);
}

// R| - Write Only
BOOL SCLLibHelper::WriteRegisterOr(BYTE nNodeID, char chRegister1, char chRegister2)
{
	return m_WriteRegisterOr(m_nCOMPort, nNodeID, chRegister1, chRegister2);
}

// SA - Write Only
BOOL SCLLibHelper::WriteSaveParameters(BYTE nNodeID)
{
	return m_WriteSaveParameters(m_nCOMPort, nNodeID);
}

// SC - Read Only
BOOL SCLLibHelper::ReadStatusCode(BYTE nNodeID, int* nStatusCode)
{
	return m_ReadStatusCode(m_nCOMPort, nNodeID, nStatusCode);
}

// SD - Read
BOOL SCLLibHelper::ReadSetDirection(BYTE nNodeID, BYTE* nDirection)
{
	return m_ReadSetDirection(m_nCOMPort, nNodeID, nDirection);
}

// SD - Write
BOOL SCLLibHelper::WriteSetDirection(BYTE nNodeID, BYTE nInputSensor, char chDirection)
{
	return m_WriteSetDirection(m_nCOMPort, nNodeID, nInputSensor, chDirection);
}

// SF - Read
BOOL SCLLibHelper::ReadStepFilterFrequency(BYTE nNodeID, int* filter)
{
	return m_ReadStepFilterFrequency(m_nCOMPort, nNodeID, filter);
}

// SF - Write
BOOL SCLLibHelper::WriteStepFilterFrequency(BYTE nNodeID, int filter)
{
	return m_WriteStepFilterFrequency(m_nCOMPort, nNodeID, filter);
}

// SH - Write Only
BOOL SCLLibHelper::WriteSeekHome(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX)
{
	return m_WriteSeekHome(m_nCOMPort, nNodeID, nInputSensor, chInputStatus, bWithOptionalX);
}

// SI - Read
BOOL SCLLibHelper::ReadEnableInputUsage(BYTE nNodeID, BYTE* nInputUsage)
{
	return m_ReadEnableInputUsage(m_nCOMPort, nNodeID, nInputUsage);
}

// SI - Write
BOOL SCLLibHelper::WriteEnableInputUsage(BYTE nNodeID, BYTE nInputUsage)
{
	return m_WriteEnableInputUsage(m_nCOMPort, nNodeID, nInputUsage);
}

// SI - Read
BOOL SCLLibHelper::ReadEnableInputUsageFlexIO(BYTE nNodeID, BYTE* nInputUsage, BYTE* nInputSensor)
{
	return m_ReadEnableInputUsageFlexIO(m_nCOMPort, nNodeID, nInputUsage, nInputSensor);
}

// SI - Write
BOOL SCLLibHelper::WriteEnableInputUsageFlexIO(BYTE nNodeID, BYTE nInputUsage, BYTE nInputSensor)
{
	return m_WriteEnableInputUsageFlexIO(m_nCOMPort, nNodeID, nInputUsage, nInputSensor);
}

// SJ - Write Only
BOOL SCLLibHelper::WriteStopJogging(BYTE nNodeID)
{
	CSPtr CS( _cs );

	return m_WriteStopJogging(m_nCOMPort, nNodeID);
}

// SK - Write Only
BOOL SCLLibHelper::WriteStopAndKill(BYTE nNodeID, BOOL bWithOptionD)
{
	return m_WriteStopAndKill(m_nCOMPort, nNodeID, bWithOptionD);
}

// SM - Write
BOOL SCLLibHelper::WriteStopMove(BYTE nNodeID, char chDecelType)
{
	CSPtr CS( _cs );

	return m_WriteStopMove(m_nCOMPort, nNodeID, chDecelType);
}

// SO - Write Only
BOOL SCLLibHelper::WriteSetOutput(BYTE nNodeID, BYTE nOutput, char nOutputCondition, BOOL bWithOptionalY)
{
	return m_WriteSetOutput(m_nCOMPort, nNodeID, nOutput, nOutputCondition, bWithOptionalY);
}

// SP - Read
BOOL SCLLibHelper::ReadSetPosition(BYTE nNodeID, int* nSetPosition)
{
	return m_ReadSetPosition(m_nCOMPort, nNodeID, nSetPosition);
}

// SP - Write
BOOL SCLLibHelper::WriteSetPosition(BYTE nNodeID, int nSetPosition)
{
	return m_WriteSetPosition(m_nCOMPort, nNodeID, nSetPosition);
}

// ST - Write Only
BOOL SCLLibHelper::WriteStop(BYTE nNodeID, BOOL bWithOptionD)
{
	return m_WriteStop(m_nCOMPort, nNodeID, bWithOptionD);
}

// TD - Read
BOOL SCLLibHelper::ReadTransmitDelay(BYTE nNodeID, int* nTransmitDelay)
{
	return m_ReadTransmitDelay(m_nCOMPort, nNodeID, nTransmitDelay);
}

// TD - Write
BOOL SCLLibHelper::WriteTransmitDelay(BYTE nNodeID, int nTransmitDelay)
{
	return m_WriteTransmitDelay(m_nCOMPort, nNodeID, nTransmitDelay);
}

// TI - Write Only
BOOL SCLLibHelper::WriteTestInput(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX)
{
	return m_WriteTestInput(m_nCOMPort, nNodeID, nInputSensor, chInputStatus, bWithOptionalX);
}

// TO - Read
BOOL SCLLibHelper::ReadTachOutput(BYTE nNodeID, int* nTachOutput)
{
	return m_ReadTachOutput(m_nCOMPort, nNodeID, nTachOutput);
}

// TO - Write
BOOL SCLLibHelper::WriteTachOutput(BYTE nNodeID, int nTachOutput)
{
	return m_WriteTachOutput(m_nCOMPort, nNodeID, nTachOutput);
}

// TR - Write Only
BOOL SCLLibHelper::WriteTestRegister(BYTE nNodeID, char chDataRegister, int nRegisterValue)
{
	return m_WriteTestRegister(m_nCOMPort, nNodeID, chDataRegister, nRegisterValue);
}

// TS - Write Only
BOOL SCLLibHelper::WriteTimeStamp(BYTE nNodeID)
{
	return m_WriteTimeStamp(m_nCOMPort, nNodeID);
}

// TT - Read
BOOL SCLLibHelper::ReadPulseCompleteTiming(BYTE nNodeID, int* nPulseCompleteTiming)
{
	return m_ReadPulseCompleteTiming(m_nCOMPort, nNodeID, nPulseCompleteTiming);
}

// TT - Write
BOOL SCLLibHelper::WritePulseCompleteTiming(BYTE nNodeID, int nPulseCompleteTiming)
{
	return m_WritePulseCompleteTiming(m_nCOMPort, nNodeID, nPulseCompleteTiming);
}

// TV - Read
BOOL SCLLibHelper::ReadTorqueRipple(BYTE nNodeID, double* nTorqueRipple)
{
	return m_ReadTorqueRipple(m_nCOMPort, nNodeID, nTorqueRipple);
}

// TV - Write
BOOL SCLLibHelper::WriteTorqueRipple(BYTE nNodeID, double nTorqueRipple)
{
	return m_WriteTorqueRipple(m_nCOMPort, nNodeID, nTorqueRipple);
}

// VC - Read
BOOL SCLLibHelper::ReadVelocityChange(BYTE nNodeID, double* nVelocityChange)
{
	return m_ReadVelocityChange(m_nCOMPort, nNodeID, nVelocityChange);
}

// VC - Write
BOOL SCLLibHelper::WriteVelocityChange(BYTE nNodeID, double nVelocityChange)
{
	return m_WriteVelocityChange(m_nCOMPort, nNodeID, nVelocityChange);
}

// VE - Read
BOOL SCLLibHelper::ReadVelocity(BYTE nNodeID, double* dVelocity)
{
	return m_ReadVelocity(m_nCOMPort, nNodeID, dVelocity);
}

// VE - Write
BOOL SCLLibHelper::WriteVelocity(BYTE nNodeID, double dVelocity)
{
	return m_WriteVelocity(m_nCOMPort, nNodeID, dVelocity);
}

// VI - Read
BOOL SCLLibHelper::ReadVelocityIntegratorConstant(BYTE nNodeID, int* nVelocityIntegratorConstant)
{
	return m_ReadVelocityIntegratorConstant(m_nCOMPort, nNodeID, nVelocityIntegratorConstant);
}

// VI - Write
BOOL SCLLibHelper::WriteVelocityIntegratorConstant(BYTE nNodeID, int nVelocityIntegratorConstant)
{
	return m_WriteVelocityIntegratorConstant(m_nCOMPort, nNodeID, nVelocityIntegratorConstant);
}

// VL - Read
BOOL SCLLibHelper::ReadVoltageLimit(BYTE nNodeID, int* nVoltageLimit)
{
	return m_ReadVoltageLimit(m_nCOMPort, nNodeID, nVoltageLimit);
}

// VL - Write
BOOL SCLLibHelper::WriteVoltageLimit(BYTE nNodeID, int nVoltageLimit)
{
	return m_WriteVoltageLimit(m_nCOMPort, nNodeID, nVoltageLimit);
}

// VM - Read
BOOL SCLLibHelper::ReadMaximumVelocity(BYTE nNodeID, double* dMaxVelocity)
{
	return m_ReadMaximumVelocity(m_nCOMPort, nNodeID, dMaxVelocity);
}

// VM - Write
BOOL SCLLibHelper::WriteMaximumVelocity(BYTE nNodeID, double dMaxVelocity)
{
	return m_WriteMaximumVelocity(m_nCOMPort, nNodeID, dMaxVelocity);
}

// VP - Read
BOOL SCLLibHelper::ReadVelocityProportionalConstant(BYTE nNodeID, int* nVelocityProportionalConstant)
{
	return m_ReadVelocityProportionalConstant(m_nCOMPort, nNodeID, nVelocityProportionalConstant);
}

// VP - Write
BOOL SCLLibHelper::WriteVelocityProportionalConstant(BYTE nNodeID, int nVelocityProportionalConstant)
{
	return m_WriteVelocityProportionalConstant(m_nCOMPort, nNodeID, nVelocityProportionalConstant);
}

// VR - Read
BOOL SCLLibHelper::ReadVelocityRipple(BYTE nNodeID, double* dVelocityRipple)
{
	return m_ReadVelocityRipple(m_nCOMPort, nNodeID, dVelocityRipple);
}

// VR - Write
BOOL SCLLibHelper::WriteVelocityRipple(BYTE nNodeID, double dVelocityRipple)
{
	return m_WriteVelocityRipple(m_nCOMPort, nNodeID, dVelocityRipple);
}

// WD - Write Only
BOOL SCLLibHelper::WriteWaitDelay(BYTE nNodeID, char chDataRegister)
{
	return m_WriteWaitDelay(m_nCOMPort, nNodeID, chDataRegister);
}

// WI - Write Only
BOOL SCLLibHelper::WriteWaitforInput(BYTE nNodeID, BYTE nInputSensor, char chInputStatus, BOOL bWithOptionalX)
{
	return m_WriteWaitforInput(m_nCOMPort, nNodeID, nInputSensor, chInputStatus, bWithOptionalX);
}

// WM - Write Only
BOOL SCLLibHelper::WriteWaitonMove(BYTE nNodeID)
{
	return m_WriteWaitonMove(m_nCOMPort, nNodeID);
}

// WP - Write Only
BOOL SCLLibHelper::WriteWaitPosition(BYTE nNodeID)
{
	return m_WriteWaitPosition(m_nCOMPort, nNodeID);
}

// WT - Write
BOOL SCLLibHelper::WriteWaitTime(BYTE nNodeID, double dWaitTime)
{
	return m_WriteWaitTime(m_nCOMPort, nNodeID, dWaitTime);
}

// ZC - Read
BOOL SCLLibHelper::ReadRegenResistorWattage(BYTE nNodeID, int* nRegenResistorWattage)
{
	return m_ReadRegenResistorWattage(m_nCOMPort, nNodeID, nRegenResistorWattage);
}

// ZC - Write
BOOL SCLLibHelper::WriteRegenResistorWattage(BYTE nNodeID, int nRegenResistorWattage)
{
	return m_WriteRegenResistorWattage(m_nCOMPort, nNodeID, nRegenResistorWattage);
}

// ZR - Read
BOOL SCLLibHelper::ReadRegenResistorValue(BYTE nNodeID, int* nRegenResistorValue)
{
	return m_ReadRegenResistorValue(m_nCOMPort, nNodeID, nRegenResistorValue);
}

// ZR - Write
BOOL SCLLibHelper::WriteRegenResistorValue(BYTE nNodeID, int nRegenResistorValue)
{
	return m_WriteRegenResistorValue(m_nCOMPort, nNodeID, nRegenResistorValue);
}

// ZT - Read
BOOL SCLLibHelper::ReadRegenResistorPeakTime(BYTE nNodeID, int* nRegenResistorPeakTime)
{
	return m_ReadRegenResistorPeakTime(m_nCOMPort, nNodeID, nRegenResistorPeakTime);
}

// ZT - Write
BOOL SCLLibHelper::WriteRegenResistorPeakTime(BYTE nNodeID, int nRegenResistorPeakTime)
{
	return m_WriteRegenResistorPeakTime(m_nCOMPort, nNodeID, nRegenResistorPeakTime);
}

