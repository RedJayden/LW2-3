#pragma once

#include "IRtcDriver.h"
#include "Rtc6Driver.h"
#include <memory>
#include <stdexcept>
#include <string>

/**
 * @class RtcDriverFactory
 * @brief Factory class to instantiate appropriate IRtcDriver based on version.
 */
class RtcDriverFactory {
public:
	static std::unique_ptr<IRtcDriver> CreateDriver(int rtcVersion) {
		if (rtcVersion == 6) {
			return std::make_unique<Rtc6Driver>();
		}
		else if (rtcVersion == 5) {
			// RTC5 Driver can be expanded here
			throw std::runtime_error("RTC5 Driver is defined in architecture but not active.");
		}
		else if (rtcVersion == 4) {
			// RTC4 Driver can be expanded here
			throw std::runtime_error("RTC4 Driver is defined in architecture but not active.");
		}
		else {
			throw std::runtime_error("Unsupported RTC version: " + std::to_string(rtcVersion));
		}
	}
};
