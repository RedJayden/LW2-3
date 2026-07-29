import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/appStore";
import { hwFacade } from "@/services/HardwareFacade";
import { CircleSpinner } from "@/ui/components/CircleSpinner";
import { ParticlesBackground } from "@/ui/components/ParticlesBackground";
import { callNative } from "@/core/ipc/bridge";
import { Channels } from "@/core/ipc/channels.gen";

/**
 * @file Splash.tsx
 * @brief 고도로 정제된 미니멀 스플래시 화면
 * @details 불필요한 텍스트를 제거하고 종료 버튼을 우측 상단으로 이동했습니다.
 */
export default function SplashPage() {
  const nav = useNavigate();
  const { progress, resetInit } = useAppStore();

  const [fading, setFading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      resetInit();
      try {
        await hwFacade.initialize();
      } catch (e) {
        /* HW 초기화 오류 처리 필요 시 추가 */
      }
      if (cancelled) return;

      await Promise.all([
        import("@/ui/shell/AppShell"),
        import("@/ui/pages/Main"),
      ]).catch(() => {});

      if (cancelled) return;
      setReady(true);
      setFading(true);
    })();
    return () => { cancelled = true; };
  }, [resetInit]);

  const handleFadeEnd = useCallback(() => {
    if (!fading || !ready) return;
    callNative(Channels.app_openMain, { route: "/main", show: "maximized" })
      .catch(() => nav("/main"));
  }, [fading, ready, nav]);

  return (
    <div
      className="relative flex items-center justify-center text-white"
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "#030712",
      }}
    >
      {/* 배경 장식 */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_rgba(0,242,255,0.08),_transparent_45%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.05),_transparent_40%)]" />
      <ParticlesBackground className="pointer-events-none absolute inset-0 opacity-20" />

      {/* 우측 상단 종료 버튼 (X) */}
      <button
        type="button"
        className="absolute right-8 top-8 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/40 transition-all hover:bg-red-500/20 hover:text-red-400 active:scale-95"
        onClick={async () => {
          try {
            const { features } = useAppStore.getState();
            const channels = features.lightChannels || 4;
            for (let i = 1; i <= channels; i++) {
              await hwFacade.setLightEnable("scanner", i, false);
            }
          } catch (e) {
            console.error("Failed to turn off lights on quit", e);
          }
          callNative(Channels.app_quit, {});
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div
        className="relative z-10 w-full max-w-lg transition-opacity duration-1000 ease-in-out"
        style={{ opacity: fading ? 0 : 1 }}
        onTransitionEnd={handleFadeEnd}
      >
        <div className="flex flex-col items-center gap-16 text-center">
          {/* 로고 영역 */}
          <div className="flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 fill-mode-both">
            <div className="relative">
              <CircleSpinner />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_12px_#00f2ff] animate-pulse" />
              </div>
            </div>
            <div>
              <h1 className="text-6xl font-bold tracking-[0.2em] text-white">LW-23</h1>
            </div>
          </div>

          {/* 상태 표시 영역 */}
          <div className="w-full space-y-5 px-10">
            <div className="flex items-end justify-between px-1">
              <div className="text-sm font-medium tracking-widest text-white/70 uppercase">
                System Workspace Initializing...
              </div>
              <span className="text-2xl font-black italic tracking-tighter text-cyan-400">
                {Math.round(progress)}%
              </span>
            </div>

            {/* 프로그레스 바 */}
            <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="absolute inset-y-0 left-0 bg-cyan-400 shadow-[0_0_15px_#00f2ff] transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
