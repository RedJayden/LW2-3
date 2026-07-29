#include "pch.h"

#include "VisionModuleLoader.h"

/**
* @brief DLL 로드 & 모든 심볼 바인딩
* @details 하나라도 누락되면 false 반환 및 Unload 호출
*/
bool VisionModuleLoader::Load(const std::wstring& dllPath) {
	if (hVM_Handle_) return true;

	hVM_Handle_ = ::LoadLibraryW(dllPath.c_str());
	if (!hVM_Handle_) return false;

	// ---- 심볼 바인딩 (IVisionModule.h와 동일한 export 이름 사용) ----
	bool ok = true;

	ok &= Resolve(GetVersion, "VM_GetVersion");

	ok &= Resolve(Create, "VM_Create");
	ok &= Resolve(Destroy, "VM_Destroy");

	ok &= Resolve(SetLogCallback, "VM_SetLogCallback");
	ok &= Resolve(SetFrameCallback, "VM_SetFrameCallback");

	ok &= Resolve(EnumCameras, "VM_EnumCameras");
	ok &= Resolve(GetCameraInfo, "VM_GetCameraInfo");

	ok &= Resolve(Open, "VM_Open");
	ok &= Resolve(Close, "VM_Close");

	ok &= Resolve(Start, "VM_Start");     // <-- bool enableStreaming 시그니처
	ok &= Resolve(Stop, "VM_Stop");

	ok &= Resolve(PopLatest, "VM_PopLatest");
	ok &= Resolve(GetFps, "VM_GetFps");
	ok &= Resolve(Snapshot, "VM_Snapshot");

	ok &= Resolve(GetExposureRange, "VM_GetExposureRange");
	ok &= Resolve(SetExposure, "VM_SetExposure");
	ok &= Resolve(GetGainRange, "VM_GetGainRange");
	ok &= Resolve(SetGain, "VM_SetGain");

	ok &= Resolve(LastErrorMessage, "VM_LastError");

	if (!ok) {
		Unload();
		return false;
	}

	return true;
}

/**
* @brief DLL 언로드 및 함수 포인터 초기화
*/
void VisionModuleLoader::Unload() {
	if (hVM_Handle_) {
		::FreeLibrary(hVM_Handle_);
		hVM_Handle_ = nullptr;
	}

	GetVersion = nullptr;
	Create = nullptr;
	Destroy = nullptr;
	SetLogCallback = nullptr;
	SetFrameCallback = nullptr;
	EnumCameras = nullptr;
	GetCameraInfo = nullptr;
	Open = nullptr;
	Close = nullptr;
	Start = nullptr;
	Stop = nullptr;
	PopLatest = nullptr;
	GetFps = nullptr;
	Snapshot = nullptr;
	GetExposureRange = nullptr;
	SetExposure = nullptr;
	GetGainRange = nullptr;
	SetGain = nullptr;
	LastErrorMessage = nullptr;
}