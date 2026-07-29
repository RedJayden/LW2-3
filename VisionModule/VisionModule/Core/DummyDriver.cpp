#include "pch.h"
#include "DummyDriver.h"

DummyDriver::DummyDriver(std::function<void(const VMFrameView&)> onFrame)
    : onFrame_(std::move(onFrame)) {
}

DummyDriver::~DummyDriver() {
    Stop(); Close();
}

bool DummyDriver::Open(int) {
    opened_ = true;
    return true;
}

void DummyDriver::Close() {
    Stop();
    opened_ = false;
    fb_.Clear();
    std::lock_guard<std::mutex> lk(m_);
    last_ = {};
}

bool DummyDriver::Start() {
    if (!opened_) return false;
    if (running_.exchange(true)) return true;
    th_ = std::thread(&DummyDriver::ThreadProc, this);
    return true;
}

void DummyDriver::Stop() {
    if (!running_.exchange(false)) return;
    if (th_.joinable()) th_.join();
}

bool DummyDriver::PopLatest(VMFrameView& out) {
    std::lock_guard<std::mutex> lk(m_);
    out = last_;
    return (out.data != nullptr);
}

void DummyDriver::ThreadProc() {
    const int W = 640, H = 480, FPS = 30;
    cv::Mat bgr(H, W, CV_8UC3);

    auto next = std::chrono::steady_clock::now();
    int t = 0;

    while (running_) {
        // 1) 렌더(격자 + 텍스트 + 움직임)
        bgr.setTo(cv::Scalar(30, 30, 30));
        for (int y = 0; y < H; y += 40) cv::line(bgr, { 0,y }, { W,y }, { 80,80,80 }, 1);
        for (int x = 0; x < W; x += 40) cv::line(bgr, { x,0 }, { x,H }, { 80,80,80 }, 1);
        cv::circle(bgr, { (t * 4) % W, (t * 2) % H }, 20, { 0,255,255 }, -1);
        auto now = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
        char buf[64]; ctime_s(buf, sizeof(buf), &now);
        buf[strcspn(buf, "\n")] = 0;
        cv::putText(bgr, std::string("Dummy @ ") + buf, { 10, H - 10 }, cv::FONT_HERSHEY_SIMPLEX, 0.5, { 255,255,255 }, 1);

        // 2) FrameBuffer push
        VMFrameDesc d{};
        d.width = W; d.height = H; d.stride = W * 3; d.format = VMPixelFormat::BGR8;
        const auto tp = std::chrono::steady_clock::now().time_since_epoch();
        d.timestamp_us = static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::microseconds>(tp).count());
        fb_.Push(bgr.data, d);

        // 3) last_ + 브로드캐스트
        VMFrameView vw{};
        if (fb_.Pop(vw)) {
            std::lock_guard<std::mutex> lk(m_);
            last_ = vw;
            if (onFrame_) onFrame_(vw);
        }

        // 4) 30fps
        next += std::chrono::milliseconds(1000 / FPS);
        std::this_thread::sleep_until(next);
        ++t;
    }
}
