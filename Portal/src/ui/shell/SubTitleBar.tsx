/**
 * @file SubTitleBar.tsx
 * @brief 상단 보조 툴바: 페이지 컨텍스트 토글(Main/Recipe/Parameter/Calibration) + 전역 상태(컴팩트)
 * @details
 *  - 디자인 패턴: Strategy(페이지별 좌/중 UI) + Presenter(우측 상태)
 *  - Fallback 상태 내장: 부모 콜백이 없더라도 토글이 동작하도록 내부 useState 제공
 *  - Recipe: [Scanner | Object | Canvas] 단일 그룹
 *  - Parameter만 중앙 탭 노출 (Calibration에서는 제거)
 */

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  IconButton,
  Divider,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CameraswitchRoundedIcon from "@mui/icons-material/CameraswitchRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import ArchitectureRoundedIcon from '@mui/icons-material/ArchitectureRounded';
import CameraAltRoundedIcon from "@mui/icons-material/CameraAltRounded";
import PhotoCameraFrontRoundedIcon from "@mui/icons-material/PhotoCameraFrontRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import PrecisionManufacturingRoundedIcon from "@mui/icons-material/PrecisionManufacturingRounded";
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';

import { useLocation } from "react-router-dom";
import useAppStore, { CameraId, CameraKind, selectors } from "../../store/appStore";
import { useUIPreferenceStore } from "../../store/useUIPreferenceStore";
import { AtomStatus } from "../../components/ui/AtomStatus/AtomStatus";
import { DigitalDisplay } from "../components/ui/DigitalDisplay";
import GlobalToast from "../components/ui/GlobalToast";

import {
  createSegmentGroupSx,
  createSquareIconButtonSx,
} from "../styles/segments";
import { hwFacade } from "../../services/HardwareFacade";
import { useCanvasStore } from "../pages/Recipe/Canvas/useCanvasStore";
import { RIGHT_PANEL_WIDTH } from "./RightPanel";


export type PageKey = "main" | "calibration" | "recipe" | "parameter";
export type CameraMode = "scanner" | "object";
export type ParameterView =
  | "motion"
  | "scanCam"
  | "objectCam"
  | "lights"
  | "laser"
  | null;

export type SubTitleBarProps = {
  page?: PageKey;

  /** Main/Calibration/Parameter: 카메라 선택 (부모 미지정 시 내부 상태로 관리) */
  cameraMode?: CameraMode;
  onCameraModeChange?: (mode: CameraMode) => void;

  /** Recipe: Canvas on/off (부모 미지정 시 내부 상태로 관리) */
  canvasVisible?: boolean;
  onToggleCanvas?: (next: boolean) => void;

  /** Parameter: 중앙 파라미터 탭 (부모 미지정 시 내부 상태로 관리) */
  parameterView?: ParameterView;
  onParameterViewChange?: (view: ParameterView) => void;

  /** 우측 상태 텍스트(외부 강제) */
  statusTextOverride?: string;
};

/** @brief 라우터 → 페이지 키 */
function useRoutePageKey(explicit?: PageKey): PageKey {
  const location = useLocation();
  return useMemo(() => {
    if (explicit) return explicit;
    const p = location.pathname.toLowerCase();
    if (p.includes("recipe")) return "recipe";
    if (p.includes("parameter")) return "parameter";
    if (p.includes("calibration")) return "calibration";
    return "main";
  }, [explicit, location.pathname]);
}

/** @brief 상태 공유를 위한 키 생성 헬퍼 */
function getUIStateKey(page: PageKey, pathname: string): string {
  // Main, Recipe, Calibration 페이지는 상태를 공유함
  if (page === "main" || page === "recipe" || page === "calibration") {
    return "shared_machine_layout";
  }
  return pathname.toLowerCase();
}

/** @brief 좌측: 페이지별 컨트롤 (내부 상태 fallback 포함) */
function LeftCluster(props: {
  page: PageKey;
  cameraModeProp?: CameraMode;
  onCameraModeChange?: (mode: CameraMode) => void;
  canvasVisibleProp?: boolean;
  onToggleCanvas?: (next: boolean) => void;
}) {
  const theme = useTheme();
  const sxSegment = createSegmentGroupSx(theme, { iconSize: 14, gap: 4 });

  const {
    page,
    cameraModeProp,
    onCameraModeChange,
    canvasVisibleProp,
    onToggleCanvas,
  } = props;

  // ---- 내부 상태(fallback) ----
  const [cameraMode, setCameraMode] = useState<CameraMode>(
    cameraModeProp ?? "scanner"
  );
  const [canvasVisible, setCanvasVisible] = useState<boolean>(
    canvasVisibleProp ?? false
  );

  const setCameraKind = useAppStore((s) => s.setCameraKind);
  const setCurrentCameraId = useAppStore((s) => s.setCurrentCameraId);
  const homingActive = useAppStore((s) => s.homingState.active);
  const objectMag = useAppStore(selectors.objectMag);
  const setObjectMag = useAppStore((s) => s.setObjectMag);
  const useCanvas = useAppStore((s) => s.useCanvas);
  
  // [NEW] Canvas Store for UI Lockdown
  const { isProcessingLocal, hideOverlays } = useCanvasStore();
  const isLocked = homingActive || isProcessingLocal || hideOverlays;

  const features = useAppStore(s => s.features);
  const objectCam = features.allowedModes.includes("OBJECT");

  // [NEW] positions and recipeCenter for stage target offset comparison
  const positions = useAppStore(selectors.positions);
  const recipeCenter = useAppStore((s) => s.recipeCenter);

  const uiPrefs = useUIPreferenceStore();
  const { pathname } = useLocation();
  const stateKey = useMemo(() => getUIStateKey(page, pathname), [page, pathname]);

  // 외부 prop 변경 시 동기화
  useEffect(() => {
    if (cameraModeProp && cameraModeProp !== cameraMode)
      setCameraMode(cameraModeProp);
  }, [cameraModeProp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const savedState = uiPrefs.getSubBarState(stateKey);
    const canvasStore = useCanvasStore.getState();
    const globalMode = canvasStore.viewMode; // 'scanner' | 'object'
    
    // For Main and Calibration, we force canvasVisible to false
    const shouldShowCanvas = (page === "recipe") ? savedState.canvasVisible : false;

    // Restore Canvas
    if (shouldShowCanvas !== canvasVisible) {
      setCanvasVisible(shouldShowCanvas);
      onToggleCanvas?.(shouldShowCanvas);
    }

    // Restore UI State (WITHOUT Hardware Move)
    if (!shouldShowCanvas) {
      // [FIX] Respect the global active lens mode restored by AppShell on startup
      if (globalMode === "scanner") {
        syncScanner();
      } else if (globalMode === "object") {
        const targetMag = canvasStore.magnification === 50 ? "x50" : "x20";
        syncObject(targetMag);
      } else {
        // Fallback to local saved state if global mode is canvas or not synced yet
        const targetMode = savedState.cameraMode || "scanner";
        if (targetMode === "scanner") {
          syncScanner();
        } else if (targetMode === "object") {
          syncObject(savedState.mag);
        }
      }
    }
  }, [stateKey]); // Run on stateKey change (page transition)

  useEffect(() => {
    if (
      typeof canvasVisibleProp === "boolean" &&
      canvasVisibleProp !== canvasVisible
    )
      setCanvasVisible(canvasVisibleProp);
  }, [canvasVisibleProp]); // eslint-disable-line react-hooks/exhaustive-deps


  // [NEW] Helper for UI-only sync (No Hardware Move)
  const syncScanner = () => {
    setCameraMode("scanner");
    onCameraModeChange?.("scanner");
    setCameraKind("scanner");
    setCurrentCameraId(CameraId.Scanner);
    applyCameraPreset(CameraId.Scanner);
  };

  const syncObject = (mag?: "x20" | "x50") => {
    const magToUse = mag || objectMag;
    setCameraMode("object");
    onCameraModeChange?.("object");
    setCameraKind("object");
    setCurrentCameraId(CameraId.Object);
    
    let effectiveMag = magToUse;
    if (!features.allowedLenses.includes("X20") && effectiveMag === "x20") effectiveMag = "x50";
    setObjectMag(effectiveMag);

    const magVal = effectiveMag === "x50" ? 50 : 20;
    useCanvasStore.getState().setMagnification(magVal);
    applyCameraPreset(CameraId.Object, magVal);
  };

  // Helper to apply preset
  const applyCameraPreset = (camId: CameraId, mag?: number) => {
    const { cameraConfig, setCameraParams } = useAppStore.getState();
    if (!cameraConfig?.cameras) return;

    // Map Enum(0/1) to Config ID(1/2)
    const configId = camId === CameraId.Scanner ? 1 : 2;
    const camConfig = cameraConfig.cameras.find((c: any) => c.id === configId);
    if (!camConfig?.presets) return;

    // Find preset: specific mag or default to first
    let preset = camConfig.presets[0];
    if (mag) {
      const found = camConfig.presets.find((p: any) => p.magnification === mag);
      if (found) preset = found;
    }

    if (preset) {
      const { exposure_time, gain } = preset;
      // 1. Update Hardware (Real-time)
      hwFacade.setParams(camId, { exposure: exposure_time, gain });
      // 2. Update Store (UI Sync)
      setCameraParams(camId, { exposure: exposure_time, gain });
    }
  };

  // ---- Handlers (Includes Hardware Move) ----
  const handleScannerClick = () => {
    // [FIX] 중복 이동 차단 방어 로직 제거. 버튼 클릭 시 무조건 하드웨어 이동 명령(moonsPreset) 전송.

    setCanvasVisible(false);
    onToggleCanvas?.(false);

    syncScanner();

    // Explicit Hardware Commands (Only on Click)
    hwFacade.moonsPreset("scanner_base");
    hwFacade.setLightMode("scanner");

    // [V13 FIX] Only reset the scanner viewState for this page.
    // Previously ALL modes were reset which destroyed object mode state unnecessarily.
    const pagePrefix = page === "calibration" ? "calibration" : (page === "recipe" ? "recipe" : "main");
    const canvasStore = useCanvasStore.getState();
    canvasStore.updateViewState(`${pagePrefix}:scanner`, 0, { x: 0, y: 0 });

    // [FIX] Auto Fit to Working Area when switching to Scanner
    canvasStore.triggerFitCamera();

    // Persist State
    uiPrefs.setSubBarState(stateKey, { cameraMode: "scanner", canvasVisible: false });
  };


  const handleObjectClick = () => {
    // [FIX] 중복 이동 차단 방어 로직 제거. 버튼 클릭 시 무조건 하드웨어 이동 명령(moonsPreset) 전송.
    const magStr = useAppStore.getState().objectMag;

    setCanvasVisible(false);
    onToggleCanvas?.(false);

    syncObject(magStr);

    // Explicit Hardware Commands (Only on Click)
    const targetMode = features.allowedLenses.includes("X20")
      ? (magStr === "x50" ? "object_x50" : "object_x20")
      : "object_x50";
    hwFacade.moonsPreset(targetMode);
    hwFacade.setLightMode(targetMode);

    // [V13 FIX] Only reset the specific object magnification viewState for this page.
    // Previously ALL modes were reset which destroyed scanner and other mag state unnecessarily.
    const pagePrefix = page === "calibration" ? "calibration" : (page === "recipe" ? "recipe" : "main");
    const canvasStore = useCanvasStore.getState();
    const magKey = magStr === 'x50' ? 'object_x50' : 'object_x20';
    canvasStore.updateViewState(`${pagePrefix}:${magKey}`, 0, { x: 0, y: 0 });

    // [FIX] Auto Fit to Working Area when switching to Object
    canvasStore.triggerFitCamera();

    // Persist State
    uiPrefs.setSubBarState(stateKey, { cameraMode: "object", mag: magStr, canvasVisible: false });
  };

  const handleCanvasClick = () => {
    if (!useCanvas) return;
    setCanvasVisible(true);
    onToggleCanvas?.(true);

    // Persist State
    uiPrefs.setSubBarState(stateKey, { canvasVisible: true });
  };

  const handleMagChange = (
    _: React.MouseEvent<HTMLElement>,
    newMag: "x20" | "x50" | null
  ) => {
    if (!newMag) return;

    const activeKey = newMag === "x50" ? "object_x50" : "object_x20";
    const objectTgt = recipeCenter[activeKey] || { x: 0, y: 0 };
    const isAtObject = Math.abs(positions.X - objectTgt.x) < 0.1 && Math.abs(positions.Y - objectTgt.y) < 0.1;
    const currentMag = useAppStore.getState().objectMag;

    // 이미 물리적으로 해당 배율 위치에 있고 UI 배율도 일치하면 return
    if (isAtObject && currentMag === newMag && cameraMode === "object" && !canvasVisible) return;

    setObjectMag(newMag);

    const targetMode = newMag === "x50" ? "object_x50" : "object_x20";
    hwFacade.moonsPreset(targetMode);
    hwFacade.setLightMode(targetMode); 

    const magVal = newMag === "x50" ? 50 : 20;
    useCanvasStore.getState().setMagnification(magVal);

    applyCameraPreset(CameraId.Object, magVal);

    // [V13 FIX] Only reset the specific magnification viewState for this page.
    const pagePrefix = page === "calibration" ? "calibration" : (page === "recipe" ? "recipe" : "main");
    const canvasStore = useCanvasStore.getState();
    const magKey = newMag === 'x50' ? 'object_x50' : 'object_x20';
    canvasStore.updateViewState(`${pagePrefix}:${magKey}`, 0, { x: 0, y: 0 });

    // [FIX] Auto Fit to Working Area when switching magnifications
    canvasStore.triggerFitCamera();

    uiPrefs.setSubBarState(stateKey, {
      cameraMode: "object",
      mag: newMag,
      canvasVisible: false,
    });
  };

  const isScannerActive = !canvasVisible && cameraMode === "scanner";
  const isObjectActive = !canvasVisible && cameraMode === "object";
  const isCanvasActive = canvasVisible;

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <ToggleButtonGroup size="small" exclusive value={isScannerActive ? "scanner" : null} disabled={isLocked} sx={sxSegment} color="info">
        <ToggleButton value="scanner" onClick={handleScannerClick}>
          <CameraswitchRoundedIcon />
          Scanner
        </ToggleButton>
      </ToggleButtonGroup>

      {objectCam && (
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={isObjectActive ? "object" : null}
          disabled={isLocked}
          sx={{
            ...sxSegment,
            ...(isObjectActive && features.allowedLenses.length > 1 && {
              "& .MuiToggleButton-root": {
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                borderRight: "none", 
              },
            }),
          }}
          color="info"
        >
          <ToggleButton value="object" onClick={handleObjectClick}>
            <PhotoCameraFrontRoundedIcon />
            Object
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Magnification Buttons (Only show toggle if multiple mags exist) */}
        {isObjectActive && features.allowedLenses.length > 1 && (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={objectMag}
            disabled={isLocked}
            onChange={handleMagChange}
            sx={{
              ...sxSegment,
              "& .MuiToggleButton-root": {
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                px: 1, 
              },
              ml: "-1px",
            }}
            color="info"
          >
            {features.allowedLenses.map(lens => (
              <ToggleButton key={lens} value={lens.toLowerCase() as "x20" | "x50"}>
                {lens.toLowerCase()}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}
      </Box>
      )}

      {page === "recipe" && useCanvas && (
        <ToggleButtonGroup size="small" exclusive value={isCanvasActive ? "canvas" : null} disabled={isLocked} sx={sxSegment} color="info">
          <ToggleButton value="canvas" onClick={handleCanvasClick}>
            <ArchitectureRoundedIcon />
            Canvas
          </ToggleButton>
        </ToggleButtonGroup>
      )}
    </Stack>
  );
}

/** @brief 중앙: Parameter에서만 탭 노출 (Calibration에서는 제거) - 현재 사용 중지 요청됨 */
function CenterCluster(props: { page: PageKey }) {
    // 사용하지 않는 Parameter 탭 토글 버튼을 숨깁니다 (사용자 요청).
    return <Box sx={{ flex: 1 }} />;
}

/** @brief 우측: 상태칩 + 좌표 */
function RightCluster({
  statusTextOverride,
}: {
  statusTextOverride?: string;
}) {
  const theme = useTheme();
  const motionState = useAppStore((s: any) => s.motion?.state ?? "Unknown");
  const positions = useAppStore(selectors.positions);
  const status = (statusTextOverride ?? motionState) as string;
  const isRunning = (status.toLowerCase().includes("busy") || status.toLowerCase().includes("run") || status.toLowerCase().includes("running"))
    && !status.toLowerCase().includes("paused");

  const x = positions["X"] ?? 0;
  const y = positions["Y"] ?? 0;
  const z = positions["Z"] ?? 0;

  return (
    <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
      <Box sx={{
        display: "flex",
        alignItems: "center",
        height: "100%",
        gap: 3, 
        flexShrink: 1,
        minWidth: 0,
        overflow: "visible" 
      }}>
        <Box sx={{ width: 110, flexShrink: 0, display: "flex", justifyContent: "flex-start", alignItems: "center", overflow: "visible" }}>
          <AtomStatus label={status} status={status.toLowerCase()} active={!!isRunning} />
        </Box>
        <Box sx={{ width: 140, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-start", pl: 1 }}>
          <DigitalDisplay value={x} unit="mm" label="X:" minWidth={64} active={!!isRunning} />
        </Box>
        <Box sx={{ width: 140, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-start", pl: 1 }}>
          <DigitalDisplay value={y} unit="mm" label="Y:" minWidth={64} active={!!isRunning} />
        </Box>
        <Box sx={{ width: 140, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-start", pl: 1 }}>
          <DigitalDisplay value={z} unit="mm" label="Z:" minWidth={64} active={!!isRunning} />
        </Box>
        <Box sx={{ width: 90, flexShrink: 0 }} />
        <Box sx={{ width: 90, flexShrink: 0 }} />
      </Box>

      <Divider orientation="vertical" flexItem sx={{ borderColor: theme.palette.divider, height: "100%" }} />

      <Box sx={{
        width: RIGHT_PANEL_WIDTH - 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start', 
        height: '100%',
        pl: 2,
        gap: 1.5
      }}>
        <Tooltip title="System Notifications">
          <NotificationsRoundedIcon sx={{ color: theme.palette.text.disabled, fontSize: 20 }} />
        </Tooltip>
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-start' }}>
          <GlobalToast />
        </Box>
      </Box>
    </Box>
  );
}

export default function SubTitleBar({
  page: pageProp,
  cameraMode: cameraModeProp = "scanner",
  onCameraModeChange,
  canvasVisible: canvasVisibleProp = false,
  onToggleCanvas,
  statusTextOverride,
}: SubTitleBarProps) {
  const theme = useTheme();
  const page = useRoutePageKey(pageProp);

  return (
    <Box
      sx={{
        height: 40,
        pl: 1.5,
        pr: 0, 
        bgcolor: theme.palette.background.default,
        borderBottom: `1px solid ${theme.palette.divider}`,
        display: "flex",
        alignItems: "center",
        gap: 1.5,
      }}
    >
      {page !== "parameter" && (
        <LeftCluster
          page={page}
          cameraModeProp={cameraModeProp}
          onCameraModeChange={onCameraModeChange}
          canvasVisibleProp={canvasVisibleProp}
          onToggleCanvas={onToggleCanvas}
        />
      )}
      <Box sx={{ flex: 1 }} /> 
      <CenterCluster page={page} />
      <Box sx={{ flex: 1 }} /> 
      <RightCluster statusTextOverride={statusTextOverride} />
    </Box>
  );
}
