#include "pch.h"

#include "HwInitService.h"
#include "include/cef_values.h"
#include "include/cef_task.h"
#include "include/wrapper/cef_helpers.h"

// simple_handler의 Broadcast를 직접 부르지 않게 하려면 여기선 브로드캐스트 없이 상태만 유지.
// 필요하면 콜백을 주입하도록 확장 가능.

HwInitService& HwInitService::instance() {
    static HwInitService s;
    return s;
}

HwInitService::~HwInitService() {
    request_stop_and_join();
}

void HwInitService::start_async() {
    if (started.exchange(true))
		return; // 이미 시작됨

    stop.store(false);

    th = std::thread([this]
    {
        auto push = [&](const char* s)
            {
                std::lock_guard<std::mutex> lk(m);
                log.emplace_back(s);
            };
        auto inc_to = [&](int target, int delay_ms)
            {
            while (!stop.load() && percent.load() < target)
            {
                percent.store(std::min(target, percent.load() + 1));
                std::this_thread::sleep_for(std::chrono::milliseconds(delay_ms));
            }
        };

        push("Start HW init");
        step = "Checking IO";  inc_to(25, 60);
        step = "Init Motion";  push("Init Motion...");  inc_to(60, 50);
        step = "Init Camera";  push("Init Camera...");  inc_to(90, 50);
        step = "Warming up";   push("Warmup...");       inc_to(99, 50);
        if (stop.load())
            return;
        percent.store(100);
        step = "Done";
        push("All ready");
    });
}

//** @brief 초기화 중지 요청 및 스레드 조인
void HwInitService::request_stop_and_join()
{
    stop.store(true);
    if (th.joinable())
    {
        try { th.join(); }
        catch (...) {}
    }
    started.store(false);
}

/// JS 브로드캐스트 등 외부에서 쓰려면 스냅샷 제공
CefRefPtr<CefDictionaryValue> HwInitService::snapshot()
{
    auto d = CefDictionaryValue::Create();
    d->SetInt("percent", percent.load());
    d->SetString("step", step);

    auto a = CefListValue::Create();
    {
        std::lock_guard<std::mutex> lk(m);
        const int n = (int)log.size(); const int st = std::max(0, n - 50);
        for (int i = st, k = 0; i < n; ++i) a->SetString(k++, log[i]);
    }
    d->SetList("log", a);
    return d;
}
