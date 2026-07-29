#pragma once
#include <string>
#include "include/cef_base.h"

// 실행시 웹 디버깅 창 실행
//#define _DEBUG_DEV_WND

enum class PortalMode { Dev, Dist };

struct AppConfig {
	// 기본값
	PortalMode portal_mode = PortalMode::Dist;        // 로컬 폴더(dist) vs 로컬 서버(dev)
	std::wstring dist_index;                          // ...\web\index.html
	std::wstring dev_url = L"http://localhost:5173";  // Vite dev URL
	bool start_fullscreen_main = false;                // 메인 창 풀스크린
	bool start_fullscreen_splash = false;             // 스플래시는 보통 false

	int splash_width = 600;		// 스플래시 창 너비
	int splash_height = 650;	// 스플래시 창 높이
	int main_width = 1280;		// 메인 창 기본 너비 (전체 화면이 아닐 경우)
	int main_height = 800;		// 메인 창 기본 높이

	// 전역 접근자
	static const AppConfig& instance();
	// 프로세스 시작 후 1회 호출 (커맨드라인 반영)
	static void bootstrap();
};
