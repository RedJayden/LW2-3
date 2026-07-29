#include "stdafx.h"

#include "API_Bitbus.h"
#include "./Impl/Bitbus_Impl.h"

//////////////////////////////////////////////////////////////////////////
// Create / Destroy
//////////////////////////////////////////////////////////////////////////

HBITBUS __stdcall CreateBitbus()
{
	AFX_MANAGE_STATE(AfxGetStaticModuleState());

	return reinterpret_cast<HBITBUS>(
		new CBitbus_Impl());
}

void __stdcall DestroyBitbus(
	HBITBUS handle)
{
	AFX_MANAGE_STATE(AfxGetStaticModuleState());

	if (handle)
	{
		delete reinterpret_cast<CBitbus_Impl*>(handle);
	}
}

//////////////////////////////////////////////////////////////////////////
// Serial
//////////////////////////////////////////////////////////////////////////

void __stdcall OpenSerialPort(
	HBITBUS handle,
	int port,
	DWORD baud,
	BYTE dataBits,
	BYTE stopBits,
	BYTE parity,
	DWORD* lastError)
{
	AFX_MANAGE_STATE(AfxGetStaticModuleState());

	if (!handle || !lastError)
	{
		return;
	}

	auto impl =
		reinterpret_cast<CBitbus_Impl*>(handle);

	impl->OpenSerial(
		port,
		baud,
		dataBits,
		stopBits,
		parity,
		*lastError);
}

void __stdcall CloseSerialPort(
	HBITBUS handle)
{
	AFX_MANAGE_STATE(AfxGetStaticModuleState());

	if (!handle)
	{
		return;
	}

	auto impl =
		reinterpret_cast<CBitbus_Impl*>(handle);

	impl->CloseSerial();
}

//////////////////////////////////////////////////////////////////////////
// Lock
//////////////////////////////////////////////////////////////////////////

void __stdcall LockOnOff(
	HBITBUS handle,
	bool bFlag)
{
	AFX_MANAGE_STATE(AfxGetStaticModuleState());

	if (!handle)
	{
		return;
	}

	auto impl =
		reinterpret_cast<CBitbus_Impl*>(handle);

	impl->LockOnOff(bFlag);
}

//////////////////////////////////////////////////////////////////////////
// PWM
//////////////////////////////////////////////////////////////////////////

void __stdcall SetPWM(
	HBITBUS handle,
	int pwm1,
	int pwm2,
	int pwm3,
	int pwm4)
{
	AFX_MANAGE_STATE(AfxGetStaticModuleState());

	if (!handle)
	{
		return;
	}

	auto impl =
		reinterpret_cast<CBitbus_Impl*>(handle);

	impl->SetPWM(
		pwm1,
		pwm2,
		pwm3,
		pwm4);
}

void __stdcall ReadPWM(
	HBITBUS handle,
	int* pwm1,
	int* pwm2,
	int* pwm3,
	int* pwm4)
{
	AFX_MANAGE_STATE(AfxGetStaticModuleState());

	if (!handle ||
		!pwm1 ||
		!pwm2 ||
		!pwm3 ||
		!pwm4)
	{
		return;
	}

	auto impl =
		reinterpret_cast<CBitbus_Impl*>(handle);

	impl->ReadPWM(
		*pwm1,
		*pwm2,
		*pwm3,
		*pwm4);
}