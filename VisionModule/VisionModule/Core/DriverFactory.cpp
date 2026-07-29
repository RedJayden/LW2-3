#include "pch.h"
#include "DriverFactory.h"
#include "HikDriver.h"
#include "BaslerDriver.h"

std::unique_ptr<ICamDriver>
CreateDriver(const DeviceEntry& dev, std::function<void(const VMFrameView&)> onFrame) {
    switch (dev.vendor) {
    case VMVendor::Hikrobot:
        return std::make_unique<HikDriver>(dev, std::move(onFrame));
    default:
        return std::make_unique<BaslerDriver>(); // 스텁
    }
}
