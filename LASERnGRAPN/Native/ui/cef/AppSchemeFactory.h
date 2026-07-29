#pragma once

#include "include/cef_scheme.h"

/**
 * @file AppSchemeFactory.h
 * @brief CEF용 http://app/* 스킴 핸들러 등록/해제 유틸
 * @details
 *  - 디자인 패턴: Facade, Factory
 *  - Portal(React)과 카메라 스트림을 같은 Origin(http://app)으로 맞추기 위한 진입점.
 */
namespace app
{
    /**
     * @brief http://app/* 스킴 핸들러 등록
     * @details
     *  - 내부적으로 CefRegisterSchemeHandlerFactory("http", "app", ...) 호출.
     *  - 여러 번 호출되어도 한 번만 등록되도록 방어 코드 포함.
     */
    void RegisterAppSchemeHandler();

    /**
     * @brief http://app/* 스킴 핸들러 해제
     * @details
     *  - CefRegisterSchemeHandlerFactory("http", "app", nullptr) 호출.
     *  - 보통 프로세스 종료 시점 또는 재초기화용.
     */
    void UnregisterAppSchemeHandler();
}
