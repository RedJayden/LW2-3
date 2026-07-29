#pragma once

#include <string>
#include <windows.h>

inline std::wstring AnsiToWide(const char* s)
{
    if (!s) return L"";
    int n = MultiByteToWideChar(CP_ACP, 0, s, -1, nullptr, 0);
    std::wstring w(n ? (size_t)n - 1 : 0, L'\0');
    if (n) MultiByteToWideChar(CP_ACP, 0, s, -1, w.data(), n);
    return w;
}