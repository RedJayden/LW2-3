/**
 * @file AppShell.tsx
 * @brief 레이아웃 셀을 구성하는 상위 컨테이너를 정의한다.
 */
import { Outlet, useLocation } from "react-router-dom";
import { useState, useMemo, useEffect } from "react";
import { useTheme } from "@mui/material/styles";

import TitleBar from "./TitleBar";
import SubTitleBar from "./SubTitleBar";
import LeftNav from "./LeftNav";
import RightPanel from "./RightPanel";
import StatusBar from "./StatusBar/StatusBar";
import { useCanvasStore } from "../pages/Recipe/Canvas/useCanvasStore";

import { useAppStore } from "../../store/appStore";
import { useProcessMonitor } from "../../hooks/useProcessMonitor";
import { hwFacade } from "@/services/HardwareFacade";
import { ConfirmDialog } from "../../components/dialogs/ConfirmDialog";
import LogConsolePanel from "./LogConsolePanel/LogConsolePanel";
import { logger } from "@/utils/logger";

const TITLE_BAR_HEIGHT = 48;
const SUBTITLE_BAR_HEIGHT = 40;

/**
 * @brief 애플리케이션 전체 셸을 렌더링한다.
 */
export default function AppShell() {
  const location = useLocation();
  const theme = useTheme();

  // Background Monitoring
  useProcessMonitor();

  const normalizedPath = location.pathname.toLowerCase();
  const showSub = ["/main", "/parameter", "/calibration", "/recipe"].includes(
    normalizedPath
  );
  const isRecipe = normalizedPath === "/recipe";
  const offset = showSub
    ? TITLE_BAR_HEIGHT + SUBTITLE_BAR_HEIGHT
    : TITLE_BAR_HEIGHT;

  const [leftOpen, setLeftOpen] = useState(false);
  const rightOpen = useAppStore((s) => s.rightPanelOpen);
  const useCanvas = useAppStore((s) => s.useCanvas);
  const setRightOpen = useAppStore((s) => s.setRightPanelOpen);

  const { viewMode, setViewMode } = useCanvasStore();
  const recipeCanvasMode = ['canvas', 'scanner', 'object'].includes(viewMode);

  const gridCols = useMemo(() => {
    const leftW = leftOpen ? 220 : 64; // LEFT_NAV_WIDTH, LEFT_NAV_COLLAPSED
    const rightW = rightOpen ? 360 : 64; // RIGHT_PANEL_WIDTH, RIGHT_PANEL_COLLAPSED
    return `${leftW}px 1fr ${rightW}px`;
  }, [leftOpen, rightOpen]);

  // Global Context Menu Handler
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (e.shiftKey) {
        // Allow default browser menu (DevTools) if Shift is pressed
        return;
      }
      // Prevent default browser menu otherwise
      e.preventDefault();
    };

    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // App Init & Calibration Loading
  useEffect(() => {
    // [FIX] Instantly restore active lens store states synchronously to prevent child component render race condition
    const lastLens = localStorage.getItem('lastActiveLensMode') || 'scanner';
    console.log('[AppShell] Instantly restoring active lens states synchronously on startup:', lastLens);
    const canvasStore = useCanvasStore.getState();
    if (lastLens === 'object_x20') {
      canvasStore.setViewMode('object');
      canvasStore.setMagnification(20);
    } else if (lastLens === 'object_x50') {
      canvasStore.setViewMode('object');
      canvasStore.setMagnification(50);
    } else {
      canvasStore.setViewMode('scanner');
    }

    logger.info("System", "LASERnGRAPN Application starting...");
    // 1. Initialize Hardware monitoring if the app was reloaded (bypassing Splash)
    // HardwareFacade is now idempotent and prevents duplicate initialization internally.
    const initHardwareIfReloaded = async () => {
      try {
        await hwFacade.initialize();
        // [NEW] v7.7: Initialize Recipe Center from Config (Origin) on Startup
        await useAppStore.getState().initRecipeCenterFromConfig();
        logger.info("System", "Application initialized");

        const preset: "scanner_base" | "object_x20" | "object_x50" = 
            lastLens === 'object_x20' ? 'object_x20' : 
            (lastLens === 'object_x50' ? 'object_x50' : 'scanner_base');

        // 2. Synchronize offsets in Backend only (no physical movement)
        try {
          await hwFacade.moonsPreset(preset, true); // syncOnly = true
          console.log('[AppShell] Startup lens preset offset synchronized:', preset);
        } catch (presetErr) {
          console.error('[AppShell] Failed to sync startup preset offset:', presetErr);
        }

      } catch (e) {
        logger.error("System", `Hardware init failed: ${e}`);
        console.warn("[AppShell] Failed to initialize hardware facade:", e);
      }
    };
    initHardwareIfReloaded();

    // 2. Load Calibration Data for All Available Profiles
    const loadCalibrations = async () => {
      const { setCalibrationScale, calibrationScales } = useCanvasStore.getState();
      const { hasObjectX20 } = useAppStore.getState().features;
      const profiles = (hasObjectX20 
        ? (['scanner', 'object_x20', 'object_x50'] as const)
        : (['scanner', 'object_x50'] as const));
      const scales: Record<string, { x: number, y: number }> = {};

      for (const profile of profiles) {
        try {
          const res = await hwFacade.loadCalibration(profile);
          if (res.ok && res.data && res.data.calibration) {
            const umPerPx = res.data.calibration.scale_um_per_px;
            const umPerPy = res.data.calibration.scale_um_per_py || umPerPx; // fallback to px if py missing
            if (umPerPx && umPerPx > 0) {
              // Store expects PxPerMm
              // scale_um_per_px (e.g. 10um) -> 0.01 mm/px -> 100 px/mm
              scales[profile] = {
                x: 1000 / umPerPx,
                y: 1000 / umPerPy
              };
            }
          }
        } catch (e) {
          console.warn(`[AppShell] Failed to load calibration for ${profile}`, e);
        }
      }

      console.log('[AppShell] Loaded Calibration Scales:', scales);
      logger.info("System", `Calibration loaded: ${Object.keys(scales).join(", ") || "none"}`);
      useCanvasStore.getState().setCalibrationScales({
        ...calibrationScales,
        ...scales
      });

      // [FIX] Always sync pxPerMm with standard Scanner scale for the primary canvas coordinate system
      if (scales['scanner']) {
        useCanvasStore.getState().setPxPerMm(scales['scanner']);
      }
    };
    loadCalibrations();
  }, []);

  // [NEW] USE_CANVAS Guard: Force exit if disabled
  useEffect(() => {
    if (!useCanvas && viewMode === 'canvas') {
      logger.warn("System", "Canvas mode disabled by configuration, switching to Scanner");
      setViewMode('scanner');
    }
  }, [useCanvas, viewMode, setViewMode]);

  return (
    <div
      className="h-full min-h-0 grid animate-[fadeIn_400ms_ease-in-out]"
      style={{
        gridTemplateRows: showSub ? "48px 40px 1fr 28px" : "48px 1fr 28px",
        gridTemplateColumns: gridCols,
        backgroundColor: theme.palette.background.default,
        color: theme.palette.text.primary,
      }}
    >
      <div className="col-span-3 min-h-0">
        <TitleBar />
      </div>

      {showSub && (
        <div className="col-span-3 min-h-0">
          <SubTitleBar
            canvasVisible={recipeCanvasMode && viewMode === 'canvas'}
            onToggleCanvas={(visible) => {
              if (visible && useCanvas) setViewMode('canvas');
            }}
            cameraMode={viewMode === 'object' ? 'object' : 'scanner'}
            onCameraModeChange={(mode) => setViewMode(mode)}
          />
        </div>
      )}

      <LeftNav
        variant={
          isRecipe && recipeCanvasMode ? "recipe-canvas" :
            isRecipe ? "recipe" :
              normalizedPath === "/parameter" ? "parameter" :
                normalizedPath === "/calibration" ? "calibration" :
                  "default"
        }
        topOffset={offset}
        open={leftOpen}
        onToggle={() => setLeftOpen((value) => !value)}
      />

      <div
        className="border-x min-h-0 overflow-hidden"
        style={{
          backgroundColor: theme.palette.background.default,
          borderColor: theme.palette.divider,
        }}
      >
        <Outlet />
      </div>

      <RightPanel
        variant={isRecipe && recipeCanvasMode ? "recipe-canvas" : (isRecipe ? "recipe" : "default")}
        topOffset={offset}
        open={rightOpen}
        onToggle={() => setRightOpen(!rightOpen)}
        onOpen={() => setRightOpen(true)}
      />
      <ConfirmDialog />
      <LogConsolePanel />
      <div 
        className="col-span-3 min-h-0 h-full grid grid-cols-subgrid z-50 relative"
        style={{ gridRow: showSub ? 4 : 3 }}
      >
        <StatusBar />
      </div>
    </div>
  );
}
