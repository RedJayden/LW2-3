#pragma once
/**
 * @file DriverFactory.h
 * @brief 벤더/엔트리에 따른 ICamDriver 생성 팩토리
 * @details
 *  - 디자인 패턴: Factory + Strategy
 */

#include <memory>
#include <functional>
#include "ICamDriver.h"
#include "DeviceRegistry.h"

 /**
  * @brief 장치 엔트리에 맞는 ICamDriver 생성
  * @param dev     통합 장치 엔트리
  * @param onFrame 프레임 브로드캐스트 콜백
  */
std::unique_ptr<ICamDriver>
CreateDriver(const DeviceEntry& dev,
    std::function<void(const VMFrameView&)> onFrame);
