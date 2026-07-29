#pragma once
#include <windows.h>

// 전역(프로세스-wide) 저수준 키보드 훅 설치/해제
void InstallGlobalKeyBlocker();     // wWinMain 시작 직후 1회 호출
void UninstallGlobalKeyBlocker();   // 종료 직전 1회 호출

// 최상위 창에 시스템 명령/Alt 메시지 차단 서브클래스 설치/해제
void InstallDevtoolsKeyBlocker(HWND top);
void UninstallDevtoolsKeyBlocker(HWND top);


