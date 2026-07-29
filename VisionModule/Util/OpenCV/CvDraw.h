#pragma once
#include <afxwin.h>
#include <opencv2/core.hpp>

/** Mat (BGR, 8U) 를 HBITMAP으로 변환 */
inline HBITMAP MatToHBITMAP(const cv::Mat& bgr)
{
    if (bgr.empty()) return nullptr;
    ASSERT(bgr.type() == CV_8UC3);

    BITMAPINFO bmi{};
    bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bmi.bmiHeader.biWidth = bgr.cols;
    bmi.bmiHeader.biHeight = -bgr.rows; // top-down
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 24;
    bmi.bmiHeader.biCompression = BI_RGB;

    void* pBits = nullptr;
    HDC hdc = ::GetDC(nullptr);
    HBITMAP hBmp = CreateDIBSection(hdc, &bmi, DIB_RGB_COLORS, &pBits, nullptr, 0);
    ::ReleaseDC(nullptr, hdc);
    if (!hBmp || !pBits) return nullptr;

    const int dstStride = ((bgr.cols * 3 + 3) / 4) * 4; // 4바이트 패딩
    for (int y = 0; y < bgr.rows; ++y)
        memcpy((BYTE*)pBits + y * dstStride, bgr.ptr(y), bgr.cols * 3);

    return hBmp;
}
