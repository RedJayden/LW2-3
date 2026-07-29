/**
 * @file CameraView.tsx
 * @brief Scanner/Object 카메라 스트림 + 노출/게인/줌 제어 뷰
 * @details
 *  - MJPEG: <CameraStream> 에서 app://camera/stream?id=<id> 표시
 *  - 카메라 Start/Stop 은 Native(AppBootstrap+VisionBridge)에서 자동 처리
 *  - Portal은 노출/게인/줌/FPS 표시만 담당
 */

import { useEffect, useMemo, useState } from "react";
import { useTheme, Button } from "@mui/material";
import { useLocation } from "react-router-dom";
import MapIcon from '@mui/icons-material/Map';
import VideocamIcon from '@mui/icons-material/Videocam';

import useAppStore, { selectors } from "@/store/appStore";
import { hwFacade } from "@/services/HardwareFacade";
import { CameraStream, CameraId } from "@/ui/components/control/CameraStream";
import { useCameraFps } from "@/ui/hooks/useCameraFps";
import RecipeCanvas from "../pages/Recipe/Canvas/RecipeCanvas";
import { useCanvasStore } from "../pages/Recipe/Canvas/useCanvasStore";
import CalibrationDialog from "@/ui/components/control/CalibrationDialog";

import LaserSetCenterDialog from "@/ui/components/control/LaserSetCenterDialog";
import MatrixDialog from "@/ui/components/control/MatrixDialog";
import PresetLibraryDialog from "@/ui/components/control/PresetLibraryDialog";
import LayerList from "../pages/Recipe/LayerList/LayerList";

type NumRange = { min: number; max: number; inc?: number };

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

export default function CameraView() {
  const theme = useTheme();

  // AppStore State
  const currentId = useAppStore(selectors.currentCameraId);
  const currentCam = useAppStore(selectors.currentCamera);
  const cameraKind = useAppStore(selectors.cameraKind); // 'scanner' | 'object'

  // CanvasStore Actions
  const { 
    setViewMode, 
    showCalibrationDialog,
    showLaserSetCenterDialog,
    showMatrixDialog,
    showPresetLibraryDialog,
    magnification,
    showLayerList
  } = useCanvasStore();

  const fps = useCameraFps(currentId);

  // Sync Global Camera Kind to Canvas View Mode
  useEffect(() => {
    setViewMode(cameraKind === 'object' ? 'object' : 'scanner');
  }, [cameraKind, setViewMode]);

  // Exposure/Gain Range Logic & Connectivity
  const [expRange, setExpRange] = useState<NumRange>({ min: 15, max: 60000, inc: 50 });
  const [gainRange, setGainRange] = useState<NumRange>({ min: 0, max: 24, inc: 1 });
  const [hasCamera, setHasCamera] = useState<boolean>(true); // Assume true initially

  const exposure = currentCam?.exposure ?? 1000;
  const gain = currentCam?.gain ?? 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await hwFacade.getRanges(currentId);
        if (!cancelled && r) {
          if (r.exposure) setExpRange(r.exposure);
          if (r.gain) setGainRange(r.gain);
          if (typeof r.connected === 'boolean') setHasCamera(r.connected);
        }
      } catch { /* no-op */ }
    })();
    return () => { cancelled = true; };
  }, [currentId]);

  // Route check
  const location = useLocation();
  const isCalibrationPage = location.pathname.toLowerCase().includes("calibration");
  const isRecipePage = location.pathname.toLowerCase().includes("recipe");

  // Independent Measurement Scopes for Main UI
  const mainScope = cameraKind === 'object'
    ? `main:object:x${magnification}`
    : `main:scanner`;

  const canvasScope = isCalibrationPage ? 'calibration' : (isRecipePage ? 'recipe' : mainScope);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        backgroundColor: theme.palette.common.black,
      }}
    >
      {/* 1. Underlying Camera Stream */}
      <div className="absolute inset-0 flex items-center justify-center p-0 z-0">

        {/* 2. Recipe Canvas (Transparent Overlay) */}
        <div className="absolute inset-0 z-10 flex">
          {isRecipePage && showLayerList && (
            <div className="z-20 h-full border-r border-[#333] relative">
              <LayerList />
            </div>
          )}
          <div className="flex-1 relative h-full w-full overflow-hidden">

            <RecipeCanvas
              enableCameraCrosshair={true}
              scope={canvasScope}
            />
          </div>
        </div>

        {/* 3. Calibration Dialog Overlay */}
        {(showCalibrationDialog && isCalibrationPage) && <CalibrationDialog />}
        {(showLaserSetCenterDialog && (isRecipePage || isCalibrationPage)) && <LaserSetCenterDialog />}
        {(showMatrixDialog && (isRecipePage || isCalibrationPage)) && <MatrixDialog />}
        {(showPresetLibraryDialog && (isRecipePage || isCalibrationPage)) && <PresetLibraryDialog />}
      </div>
    </div>
  );
}
