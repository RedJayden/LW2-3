#include "pch.h"
#include "VisionTester.h"

#include <opencv2/opencv.hpp>
#include <iostream>
#include <chrono>
#include <thread>

/**
 * @brief VisionModule.dll을 직접 로드해 실시간 카메라 영상을 표시.
 */
bool RunVisionTest(int camId, const std::wstring& dllPath)
{
    VisionModuleLoader vm;
    if (!vm.Load(dllPath)) {
        MessageBoxW(nullptr, (L"VisionModule.dll 로드 실패: " + dllPath).c_str(), L"Error", MB_ICONERROR);
        return false;
    }

    VM_Handle h = vm.Create();
    if (!h) {
        MessageBoxW(nullptr, L"VM_Create 실패", L"VisionTest", MB_ICONERROR);
        return false;
    }

    // 콜백 로그 (옵션)
    vm.SetLogCallback(h, [](int level, const char* msg) {
        std::string s = msg ? msg : "";
        OutputDebugStringA(s.c_str());
        OutputDebugStringA("\n");
        });

    // 카메라 열거
    int camCount = vm.EnumCameras(h);
    std::wcout << L"[VisionTest] 감지된 카메라 개수: " << camCount << std::endl;

    char nameBuf[256] = {};
    if (vm.GetCameraInfo(h, camId, nameBuf, sizeof(nameBuf)))
        std::wcout << L"선택된 카메라: " << nameBuf << std::endl;
    else
        std::wcout << L"카메라 정보 읽기 실패" << std::endl;

    // 카메라 오픈
    if (!vm.Open(h, camId)) {
        MessageBoxW(nullptr, vm.LastErrorMessage(h), L"카메라 열기 실패", MB_ICONERROR);
        return false;
    }

    if (!vm.Start(h, true)) {
        MessageBoxW(nullptr, vm.LastErrorMessage(h), L"카메라 Start 실패", MB_ICONERROR);
        return false;
    }

    cv::namedWindow("VisionModule Test", cv::WINDOW_AUTOSIZE);

    while (true) {
        VMFrameView frame{};
        if (vm.PopLatest(h, &frame) && frame.data) {
            // 원본 메모리에 의존하지 않게 클론 후 그 위에 FPS 텍스트를 그립니다.
            cv::Mat src(frame.desc.height, frame.desc.width, CV_8UC3,
                (void*)frame.data, frame.desc.stride);
            cv::Mat view = src.clone();

            double fps = 0.0;
            if (vm.GetFps(h, &fps)) {
                std::ostringstream ss;
                ss << "FPS: " << std::fixed << std::setprecision(1) << fps;
                cv::putText(view, ss.str(),            // 텍스트
                    cv::Point(12, 28),          // 위치
                    cv::FONT_HERSHEY_SIMPLEX,   // 폰트
                    0.8,                        // 스케일
                    cv::Scalar(0, 255, 0),      // 색 (BGR)
                    2,                          // 두께
                    cv::LINE_AA);
            }

            cv::imshow("VisionModule Test", view);
        }

        int key = cv::waitKey(1);
        if (key == 27) break;      // ESC
        if (key == 's' || key == 'S') {
            wchar_t fname[256];
            swprintf_s(fname, L"test_snapshot_camId%d.jpg", camId);
            vm.Snapshot(h, fname);
        }
    }

    vm.Stop(h);
    vm.Close(h);
    vm.Destroy(h);
    return true;
}
