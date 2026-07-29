#pragma once

#include "include/cef_values.h"
#include <atomic>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

/**
 * @brief 하드웨어 초기화 상태를 관리하는 백그라운드 서비스
 * @details
 *  - 디자인 패턴: Singleton, RAII, Thread-Safe
 *  - UI 브로드캐스트는 외부(CEF 핸들러)로 위임, 여기선 상태만 유지
 */
class HwInitService
{
public:
	/// @brief 싱글톤 인스턴스 획득
	static HwInitService& instance();
	/// @brief 비동기 하드웨어 초기화 시작(중복 호출 무시)
	void start_async();
	/// @brief 초기화 중지 요청 및 스레드 조인
	void request_stop_and_join();

	// JS 브로드캐스트 등 외부에서 쓰려면 스냅샷 제공
	CefRefPtr<CefDictionaryValue> snapshot();

private:
	HwInitService() = default;
	~HwInitService();

	HwInitService(const HwInitService&) = delete;
	HwInitService& operator=(const HwInitService&) = delete;

	std::atomic<bool> started{ false };
	std::atomic<bool> stop{ false };
	std::atomic<int>  percent{ 0 };
	std::string       step{ "Initial..." };

	std::mutex        m;
	std::vector<std::string> log;
	std::thread       th;
};
