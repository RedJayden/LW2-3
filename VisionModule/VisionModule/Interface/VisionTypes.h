#pragma once

#include <cstdint>


/// @brief 카메라 벤더 종류
enum class VMVendor {
	Hikrobot = 0,      ///< Hikvision MVS SDK
	Basler         ///< Basler Pylon SDK
};

/**
* @brief 픽셀 포멧
*/
enum class VMPixelFormat : uint32_t
{
	MONO8 = 0,
	BGR8 = 1
};

/**
* @brief 프레임 메타데이터
*/
struct VMFrameDesc {
	const void*		imgData = nullptr;			// 이미지 버퍼 시작 주소
	int             width = 0;		// 픽셀 단위 폭
	int             height = 0;		// 픽셀 단위 높이
	int             stride = 0;		// 한 줄 byte 수 (row pitch)
	VMPixelFormat   pixelType = VMPixelFormat::BGR8;
	size_t          imgDataSize;   // 전체 buffer 크기 (stride * height 이상 보장)
	uint64_t		timestamp_us = 0;
};

/**
* @brief 프레임 버퍼(View). data는 DLL 소유. Poplatest/GetLatestBuffer로 획득 시 유효.
*/
struct VMFrameView
{
	const uint8_t* data = nullptr; // row-major, stride 존재
	VMFrameDesc desc{};
};