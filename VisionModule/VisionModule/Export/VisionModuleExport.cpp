#include "pch.h"
#ifdef VISIONMODULE_EXPORTS

#include "IVisionModule.h"
#include "VisionModuleImpl.h"
#include <memory>
#include <unordered_map>
#include <mutex>

/** @brief 핸들 → 구현체 매핑 */
static std::mutex g_mtx;
static std::unordered_map<VM_Handle, std::unique_ptr<VisionModuleImpl>> g_tbl;

static inline VisionModuleImpl* impl_nolock(VM_Handle h) {
    auto it = g_tbl.find(h);
    return (it == g_tbl.end()) ? nullptr : it->second.get();
}
static inline VisionModuleImpl* impl(VM_Handle h) {
    std::lock_guard<std::mutex> lk(g_mtx);
    return impl_nolock(h);
}

extern "C" {

    VM_API const char* VM_GetVersion() { static const char* v = "VisionModule 1.0.1"; return v; }

    VM_API VM_Handle VM_Create() {
        auto* p = new VisionModuleImpl();
        std::lock_guard<std::mutex> lk(g_mtx);
        g_tbl.emplace((VM_Handle)p, std::unique_ptr<VisionModuleImpl>(p));
        return (VM_Handle)p;
    }

    VM_API void VM_Destroy(VM_Handle h) {
        std::lock_guard<std::mutex> lk(g_mtx);
        auto it = g_tbl.find(h);
        if (it != g_tbl.end()) g_tbl.erase(it);
    }

    VM_API void VM_SetLogCallback(VM_Handle h, VM_LogCallback cb) {
        if (auto p = impl(h)) p->SetLogCallback(cb);
    }
    VM_API void VM_SetFrameCallback(VM_Handle h, VM_FrameCallback cb, void* user) {
        if (auto p = impl(h)) p->SetFrameCallback(cb, user);
    }

    VM_API int  VM_EnumCameras(VM_Handle h) { if (auto p = impl(h)) return p->EnumCameras(); return 0; }
    VM_API bool VM_GetCameraInfo(VM_Handle h, int idx, char* outName, int cap) { if (auto p = impl(h)) return p->GetCameraInfo(idx, outName, cap); return false; }

    VM_API bool VM_Open(VM_Handle h, int idx) { if (auto p = impl(h)) return p->Open(idx); return false; }
    VM_API bool VM_OpenBySerial(VM_Handle h, const char* serialNumber) { if (auto p = impl(h); p && serialNumber) return p->OpenBySerial(serialNumber); return false; }
    VM_API void VM_Close(VM_Handle h) { if (auto p = impl(h)) p->Close(); }
    VM_API bool VM_Start(VM_Handle h, bool enableStreaming) { if (auto p = impl(h)) return p->Start(enableStreaming); return false; }
    VM_API void VM_Stop(VM_Handle h) { if (auto p = impl(h)) p->Stop(); }

    VM_API bool VM_PopLatest(VM_Handle h, VMFrameView* out) { auto p = impl(h); if (p && out) return p->PopLatest(*out); return false; }
    VM_API bool VM_GetFps(VM_Handle h, double* outFps) { auto p = impl(h); if (p && outFps) return p->GetFps(*outFps); return false; }
    VM_API bool VM_Snapshot(VM_Handle h, const wchar_t* filePath) { auto p = impl(h); if (p && filePath) return p->Snapshot(filePath); return false; }

    VM_API bool VM_GetExposureRange(VM_Handle h, double* mn, double* mx, double* st) { auto p = impl(h); if (p && mn && mx && st) return p->GetExposureRange(*mn, *mx, *st); return false; }
    VM_API bool VM_SetExposure(VM_Handle h, double v) { if (auto p = impl(h)) return p->SetExposure(v); return false; }
    VM_API bool VM_GetGainRange(VM_Handle h, double* mn, double* mx, double* st) { auto p = impl(h); if (p && mn && mx && st) return p->GetGainRange(*mn, *mx, *st); return false; }
    VM_API bool VM_SetGain(VM_Handle h, double v) { if (auto p = impl(h)) return p->SetGain(v); return false; }

    VM_API const wchar_t* VM_LastError(VM_Handle h) { auto p = impl(h); return p ? p->LastError() : L"Invalid handle"; }

} // extern "C"
#endif // VISIONMODULE_EXPORTS
