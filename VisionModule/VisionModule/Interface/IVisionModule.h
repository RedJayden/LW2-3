#pragma once

#include "VisionModuleExport.h"
#include "VisionTypes.h"

#ifdef __cplusplus
extern "C" {
#endif

	typedef void(*VM_LogCallback)(int level, const char* msg);
	typedef void(*VM_FrameCallback)(int camId, const VMFrameView* frame, void* user);

	typedef void* VM_Handle;

	VM_API const char* VM_GetVersion();

	VM_API VM_Handle VM_Create();
	VM_API void VM_Destroy(VM_Handle);

	/**
	 * 로그/프레임 콜백
	 */
	VM_API void VM_SetLogCallback(VM_Handle h, VM_LogCallback cb);
	VM_API void VM_SetFrameCallback(VM_Handle h, VM_FrameCallback cb, void* user);

	/**
	 * 카메라 정보
	 */
	VM_API int  VM_EnumCameras(VM_Handle h);
	VM_API bool VM_GetCameraInfo(VM_Handle h, int index, char* outName, int nameCap);
	VM_API bool VM_Open(VM_Handle h, int index);
	VM_API bool VM_OpenBySerial(VM_Handle h, const char* serialNumber);
	VM_API void VM_Close(VM_Handle h);

	/**
	 * 스트리밍 제어
	 */
	VM_API bool VM_Start(VM_Handle h, bool enableStreaming);
	VM_API void VM_Stop(VM_Handle h);

	/**
	 * 프레임 조회
	 */
	VM_API bool VM_PopLatest(VM_Handle h, VMFrameView* out);

	/**
	 * FPS 조회 ( ★ 추가해야 하는 함수 )
	 */
	VM_API bool VM_GetFps(VM_Handle h, double* outFps);

	/**
	 * 노출/게인
	 */
	VM_API bool VM_GetExposureRange(VM_Handle h, double* min_us, double* max_us, double* step_us);
	VM_API bool VM_SetExposure(VM_Handle h, double exposure_us);
	VM_API bool VM_GetGainRange(VM_Handle h, double* min, double* max, double* step);
	VM_API bool VM_SetGain(VM_Handle h, double gain);

#ifdef __cplusplus
}
#endif
