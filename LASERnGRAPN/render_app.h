#pragma once
#include "include/cef_app.h"
#include "include/wrapper/cef_message_router.h"

class RenderApp : public CefApp, public CefRenderProcessHandler {
public:
    RenderApp() = default;

    CefRefPtr<CefRenderProcessHandler> GetRenderProcessHandler() override { return this; }

    void OnWebKitInitialized() override {}

    void OnContextCreated(CefRefPtr<CefBrowser> browser,
        CefRefPtr<CefFrame> frame,
        CefRefPtr<CefV8Context> context) override {
        if (!router_) {
            CefMessageRouterConfig cfg;
            router_ = CefMessageRouterRendererSide::Create(cfg);
        }
        router_->OnContextCreated(browser, frame, context);
    }

    void OnContextReleased(CefRefPtr<CefBrowser> browser,
        CefRefPtr<CefFrame> frame,
        CefRefPtr<CefV8Context> context) override {
        if (router_) router_->OnContextReleased(browser, frame, context);
    }

    bool OnProcessMessageReceived(CefRefPtr<CefBrowser> browser,
        CefRefPtr<CefFrame> frame,
        CefProcessId source_process,
        CefRefPtr<CefProcessMessage> message) override {
        if (router_ && router_->OnProcessMessageReceived(browser, frame, source_process, message))
            return true;
        return false;
    }

private:
    CefRefPtr<CefMessageRouterRendererSide> router_;
    IMPLEMENT_REFCOUNTING(RenderApp);
    DISALLOW_COPY_AND_ASSIGN(RenderApp);
};
