#pragma once
/**
 * @file CefInit.h
 * @brief CEF 초기 설정 Facade
 * @details
 *  - Design Pattern: Facade
 */

#include "include/cef_app.h"

 /// @brief CEF 로그/캐시/루트 캐시 설정.
 /// @param s CefSettings (in/out)
void InitCefSettings(CefSettings& s);
