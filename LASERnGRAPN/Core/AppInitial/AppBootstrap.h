#pragma once



#include <string>

/**
 * @file AppBootstrap.h
 * @brief 애플리케이션 초기화/종료 부트스트랩 헬퍼
 * @details
 * - 디자인 패턴 : Facade(부트스트랩), RAII(수명관리), Template Method(초기화 순서 고정)
 * - 역할: COM → VisionBridge → CEF(app:// 스킴) → Producers(카메라) 순으로 초기화
 */
namespace AppBootstrap {

	/**
	 * @brief VisionBridge 및 CEF app:// 스킴을 초기화
	 * @param dllPath VisionModule.dll 경로 (기본: ".\\VisionModule.dll")
	 * @param camIndex 기본으로 오픈할 카메라 인덱스 (기본: 0)
	 * @return 성공 여부
	 *
	 * @par Design
	 * - COM(CoInitializeEx) → VisionBridge 준비 → app::RegisterAppSchemeHandler()
	 *   → MjpegFeederFromVision 시작
	 */
	bool InitVisionAndScheme(const std::wstring& dllPath = L".\\VisionModule.dll",
		int camIndex = 0);

	/**
	 * @brief (하위 호환) 과거 오타 버전도 그대로 제공
	 * @copydoc InitVisionAndScheme
	 */
	inline bool InitVisionaAndScheme(const std::wstring& dllPath = L".\\VisionModule.dll",
		int camIndex = 0) {
		return InitVisionAndScheme(dllPath, camIndex);
	}

	/**
	 * @brief Vision/CEF 스킴/COM 해제
	 * @details
	 * - MjpegFeeder 정지 → app::UnregisterAppSchemeHandler()
	 * - CoUninitialize()는 내부 RAII 객체 소멸 시점에 자동 실행
	 */
	void ShutdownVision();

	/**
	 * @brief 특수키(DevTools 등) 글로벌 차단 시작
	 */
	void InstallGlobalKeyBlockerSafe();

	/**
	 * @brief 특수키(DevTools 등) 글로벌 차단 해제
	 */
	void UninstallGlobalKeyBlockerSafe();
}
