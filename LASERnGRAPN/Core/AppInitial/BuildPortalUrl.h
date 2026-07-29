#pragma once
#include <string>
#include "include/cef_base.h"

// route는 "/splash", "main", "#/main" 등 어떤 형식이든 허용
// 최종적으로 index.html + "#/<route>" 형태로 반환
CefString BuildPortalUrl(const std::wstring& route = L"");
