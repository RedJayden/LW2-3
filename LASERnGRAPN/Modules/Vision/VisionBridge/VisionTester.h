#pragma once
/**
 * @file VisionTester.h
 * @brief VisionModule.dll 기능 테스트용 유틸
 * @details
 *  - LASERnGRAPN 환경에서 VisionModule.dll을 직접 로드하여 카메라 영상을 표시.
 *  - Step 2: CEF, Portal 연결 전의 독립 테스트용.
 *  - OpenCV 창에 실시간 영상 및 FPS 표시.
 */

#include <string>
#include "VisionModuleLoader.h"

 /**
  * @brief VisionModule.dll 단독 테스트 실행
  * @param camId 통합 카메라 인덱스 (0=Dummy, 1=Scanner, 2=Object)
  * @param dllPath VisionModule.dll 경로 (기본값 Bin 폴더)
  * @return true: 정상 수행, false: 실패
  */
bool RunVisionTest(int camId = 1, const std::wstring& dllPath = L"VisionModule.dll");