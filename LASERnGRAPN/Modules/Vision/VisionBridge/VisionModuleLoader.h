#pragma once

/**
* @file VisionModuleLoader.h
* @brief VisionModule.dll 동적 로드 언로드 래퍼(Facade/RAII)
* @details
* - IVisionModule.h 에 선언된 C API와 1:1 매핑
* - Load/Unload 메서드로 DLL을 동적 로드/언로드
* - 사용 예 :
*    VisonModuleLoader vm;
*    if(vm.load()) {
*       VM_Handle handle = vm.Create();
*       vm.Open(handle, 0);
* 	    vm.Start(handle, true);
* 	    ...
*       vm.stop(handle); vm.close(handle); vm.destory(handle);
*    }
*/


#include <string>
#include <Windows.h>
// Vision Module Interface (VisonModule dll 솔루션 파일의 Interface 폴더에 위치)
#include "../VisionModule/VisionModule/Interface/IVisionModule.h"

/**
* @brief VisionModule.dll 동적 로드 언로드 래퍼
*/
class VisionModuleLoader {
public:
	/// @brief 로거 /프레임 콜백은 IVisonModule.h 정의 재사용
	using LogCB = VM_LogCallback;
	using FrameCB = VM_FrameCallback;

public:
    VisionModuleLoader() = default;
	~VisionModuleLoader() { Unload(); }

	VisionModuleLoader(const VisionModuleLoader&) = delete;
	VisionModuleLoader& operator=(const VisionModuleLoader&) = delete;
	VisionModuleLoader(VisionModuleLoader&& rhs) noexcept { MoveFrom(std::move(rhs)); }
	VisionModuleLoader& operator=(VisionModuleLoader&& rhs) noexcept {
		if (this != &rhs) {
			Unload();
			MoveFrom(std::move(rhs));
		}
		return *this;
	}

public:
	/**
	* @brief DLL 로드 및 심볼 바인딩
	* @param dllPath 기본 "VisionModule.dll" (Bin 폴더에 위치 함)
	* @return 성공시 true
	*/
    bool Load(const std::wstring& dllPath = L"VisionModule.dll");
	// @brief DLL 언로드
    void Unload();
	// @brief 로드 여부
    bool IsLoaded() const noexcept { return hVM_Handle_ != nullptr; }

public:
	// VisionModule 의 C API 함수 포인터 매핑
	// IVisionModule.h 와 시그니처 동일
	const char* (*GetVersion)();

	VM_Handle(*Create)();
	void(*Destroy)(VM_Handle);

	void(*SetLogCallback)(VM_Handle, LogCB);
	void(*SetFrameCallback)(VM_Handle, FrameCB, void* user);

	int(*EnumCameras)(VM_Handle);
	bool(*GetCameraInfo)(VM_Handle, int idx, char* outName, int cap);

	bool(*Open)(VM_Handle, int idx);
	void(*Close)(VM_Handle);

	bool(*Start)(VM_Handle, bool enableStreaming);
	void(*Stop)(VM_Handle);

	bool(*PopLatest)(VM_Handle, VMFrameView* outFrame);
	bool(*GetFps)(VM_Handle, double* outFps);
	bool(*Snapshot)(VM_Handle, const wchar_t* filepath);

	bool(*GetExposureRange)(VM_Handle, double* min_us, double* max_us, double* step_us);
	bool(*SetExposure)(VM_Handle, double exposure_us);
	bool(*GetGainRange)(VM_Handle, double* min, double* max, double* step);
	bool(*SetGain)(VM_Handle, double gain);

	const wchar_t* (*LastErrorMessage)(VM_Handle);

private:
	/// <summary>
	///	Module 핸들에서 심볼을 함수 포인터에 바인딩
	/// </summary>
	/// <typeparam name="FnT"></typeparam>
	/// <param name="fn"></param>
	/// <param name="name"></param>
	/// <returns></returns>
	template<typename FnT>
	bool Resolve(FnT& fn, const char* name) {
		if (!hVM_Handle_) return false;
		fn = reinterpret_cast<FnT>(GetProcAddress(hVM_Handle_, name));
		return fn != nullptr;
	}

	void MoveFrom(VisionModuleLoader&& rhs) noexcept {
		hVM_Handle_ = rhs.hVM_Handle_;
		rhs.hVM_Handle_ = nullptr;
		GetVersion = rhs.GetVersion; rhs.GetVersion = nullptr;
		Create = rhs.Create; rhs.Create = nullptr;
		Destroy = rhs.Destroy; rhs.Destroy = nullptr;
		SetLogCallback = rhs.SetLogCallback; rhs.SetLogCallback = nullptr;
		SetFrameCallback = rhs.SetFrameCallback; rhs.SetFrameCallback = nullptr;
		EnumCameras = rhs.EnumCameras; rhs.EnumCameras = nullptr;
		GetCameraInfo = rhs.GetCameraInfo; rhs.GetCameraInfo = nullptr;
		Open = rhs.Open; rhs.Open = nullptr;
		Close = rhs.Close; rhs.Close = nullptr;
		Start = rhs.Start; rhs.Start = nullptr;
		Stop = rhs.Stop; rhs.Stop = nullptr;
		PopLatest = rhs.PopLatest; rhs.PopLatest = nullptr;
		GetFps = rhs.GetFps; rhs.GetFps = nullptr;
		Snapshot = rhs.Snapshot; rhs.Snapshot = nullptr;
		GetExposureRange = rhs.GetExposureRange; rhs.GetExposureRange = nullptr;
		SetExposure = rhs.SetExposure; rhs.SetExposure = nullptr;
		GetGainRange = rhs.GetGainRange; rhs.GetGainRange = nullptr;
		SetGain = rhs.SetGain; rhs.SetGain = nullptr;
		LastErrorMessage = rhs.LastErrorMessage; rhs.LastErrorMessage = nullptr;
	}

private:
	HMODULE hVM_Handle_ = nullptr;
};
