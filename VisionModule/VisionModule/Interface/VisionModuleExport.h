#pragma once

/**
*  @file VisionModuleExport.h
*  @brief DLL import/export 매크로 정의
*/
#if defined(_WIN32) || defined(_WIN64)
#if defined(VISIONMODULE_EXPORTS)
#define VM_API __declspec(dllexport)
#else
#define VM_API __declspec(dllimport)
#endif
#else
#define VM_API
#endif