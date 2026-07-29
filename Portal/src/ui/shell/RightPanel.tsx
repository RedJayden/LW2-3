/**
 * @file RightPanel.tsx
 * @brief 앱 오른쪽 제어 패널 (조그/조명/카메라 설정)
 * @details
 *  - 디자인 패턴: Strategy(섹션 구성), Facade(HW 호출), Debounce(조명/카메라), Observer(Zustand)
 *  - Camera 섹션은 현재 선택 카메라(scanner/object)에 대한 노출/게인만 노출
 */

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Box, Divider, IconButton, Tooltip, ToggleButton, ToggleButtonGroup, LinearProgress, Typography } from "@mui/material";
import { CSSObject, Theme, styled, useTheme } from "@mui/material/styles";
import MuiDrawer from "@mui/material/Drawer";
import { useLocation } from "react-router-dom";
import MenuIcon from "@mui/icons-material/Menu";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ControlCameraIcon from "@mui/icons-material/ControlCamera";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import GpsFixedRoundedIcon from "@mui/icons-material/GpsFixedRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";

import useAppStore, { selectors } from "../../store/appStore";
import { useUIPreferenceStore } from "../../store/useUIPreferenceStore";
import { hwFacade } from "../../services/HardwareFacade";
import { uiText, type UiText } from "../locale/strings";
import { KeyedDebounceScheduler } from "../../core/patterns/scheduler";
import { bus } from "../../core/patterns/events";
import {
  ControlPanel,
  JogControlCard,
  LightControlCard,
  PositionControlCard,
  CameraSettingsCard,
  type LightChannel,
  type CameraSettingField,
  type PositionAxisState,
  type JogAxis,
} from "../components/control";
import { LaserControlCard } from "../components/control/LaserControlCard";

import { GCodePanel } from "../../components/GCodePanel";
import { SinoGalvoProcessPanel } from "./SinoGalvoProcessPanel";
import { ScanlabProcessPanel } from "./ScanlabProcessPanel";
import { ProcessPanel } from "../../components/ProcessPanel";
import { useCanvasStore } from "../pages/Recipe/Canvas/useCanvasStore";
import { logger } from "@/utils/logger";

export type RightPanelVariant = "default" | "recipe" | "recipe-canvas";
export type RightPanelProps = {
  variant: RightPanelVariant;
  topOffset: number;
  open: boolean;
  onToggle: () => void;
  onOpen?: () => void;
};
type SectionKey = "position" | "jog" | "lights" | "camera" | "info" | "process" | "laser";

export const RIGHT_PANEL_WIDTH = 360;
export const RIGHT_PANEL_COLLAPSED = 64;


/** Drawer paper 공통 스타일 */
const paperStyles = (theme: Theme): CSSObject => ({
  backgroundColor: theme.palette.background.paper,
  borderLeft: `1px solid ${theme.palette.divider}`,
  color: theme.palette.text.primary,
  borderRadius: 0,
  scrollbarGutter: "stable", // [FIX] Reserve space for scrollbar to avoid jitter
});

const opened = (theme: Theme): CSSObject => ({
  width: RIGHT_PANEL_WIDTH,
  transition: theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: "hidden",
});
const closed = (theme: Theme): CSSObject => ({
  width: RIGHT_PANEL_COLLAPSED,
  transition: theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflowX: "hidden",
});

/** 상단 오프셋을 지원하는 퍼머넌트 Drawer */
const Drawer = styled(MuiDrawer, {
  shouldForwardProp: (prop) => prop !== "open" && prop !== "offset",
})<{ open?: boolean; offset: number }>(({ theme, open, offset }) => {
    const paperCommon: CSSObject = {
    ...paperStyles(theme),
    top: offset,
    height: `calc(100vh - ${offset}px - 28px)`,
    display: "flex",
    flexDirection: "column",
  };
  return {
    width: RIGHT_PANEL_WIDTH,
    flexShrink: 0,
    whiteSpace: "nowrap",
    boxSizing: "border-box",
    top: offset,
    height: `calc(100vh - ${offset}px - 28px)`,
    ...(open
      ? {
        ...opened(theme),
        "& .MuiDrawer-paper": { ...opened(theme), ...paperStyles(theme), ...paperCommon }, // Fixed paperStyles usage
      }
      : {
        ...closed(theme),
        "& .MuiDrawer-paper": { ...closed(theme), ...paperStyles(theme), ...paperCommon },
      }),
  };
});

interface PanelSectionStrategy {
  key: SectionKey;
  title: string;
  icon?: ReactNode;
  render: () => ReactNode;
  includeInNavigation?: boolean;
}

interface PanelBodyProps {
  sections: PanelSectionStrategy[];
  scrollBoxRef: React.RefObject<HTMLDivElement | null>;
  sectionRefs: Record<SectionKey, React.RefObject<HTMLDivElement | null>>;
}

/** 스크롤 가능한 패널 본문 */
function PanelBody({ sections, scrollBoxRef, sectionRefs }: PanelBodyProps) {
  return (
    <Box
      ref={scrollBoxRef}
      sx={{
        px: 1.5,
        py: 1.5,
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflowY: "auto",
        scrollbarGutter: "stable", // [FIX] Reserve space for scrollbar to prevent jitter
      }}
      data-nodrag
    >
      <ControlPanel>
        {sections.map((section) => (
          <div key={section.key} ref={sectionRefs[section.key]}>
            {section.render()}
          </div>
        ))}
      </ControlPanel>
    </Box>
  );
}

// Internal component for Recipe Tab Content
const RecipePanelContent = ({ activeTab }: { activeTab: 'process' | 'motion' | 'gcode' | 'scanner' }) => {
  const canvas = useCanvasStore((s) => s.canvas);
  const gcode = useCanvasStore((s) => s.gcode);
  const setGcode = useCanvasStore((s) => s.setGcode);
  const viewMode = useCanvasStore((s) => s.viewMode);
  const pxPerMm = useCanvasStore((s) => s.pxPerMm);
  const isScanner = viewMode === "scanner";

  // Upload Simulation State
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const useProcessDetail = useAppStore(s => s.useProcessDetail);
  const scannerType = useAppStore(s => s.hardware.scanner);

  // Reset upload status when gcode changes
  useEffect(() => {
    setUploadStatus('idle');
  }, [gcode]);

  const setGcodeSettings = useCanvasStore((s) => s.setGcodeSettings);
  const gcodeSettings = useCanvasStore((s) => s.gcodeSettings);
  const setMotionState = useAppStore((s) => s.setMotionState); // NEW: Get global motion state setter

  // ---- Load G-Code ----
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadGCode = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;

      // 1. Update G-Code Viewer
      setGcode(content);

      // 2. Parse Settings
      let newSettings = { ...gcodeSettings };

      // Parse Feed Rate (F)
      const feedMatch = content.match(/F([\d.]+)/);
      if (feedMatch) {
        newSettings.feedRate = parseFloat(feedMatch[1]);
      }

      // Parse Laser Power (S)
      const powerMatch = content.match(/S([\d.]+)/);
      if (powerMatch) {
        let power = parseFloat(powerMatch[1]);
        if (power > 100) power = 100;
        newSettings.intensity = power;
      }

      // Parse Z Values
      const lines = content.split('\n');
      let foundSafeZ = false;
      let foundWorkingZ = false;

      for (const line of lines) {
        if (line.trim().startsWith('//') || line.trim().startsWith(';')) continue;

        // Safe Z: G00 Z... or G53 Z...
        if (!foundSafeZ && (line.includes('G00') || line.includes('G53')) && line.includes('Z')) {
          const zMatch = line.match(/Z([\d.]+)/);
          if (zMatch) {
            newSettings.safeZ = parseFloat(zMatch[1]);
            foundSafeZ = true;
          }
        }

        // Working Z: G01 Z...
        if (!foundWorkingZ && line.includes('G01') && line.includes('Z')) {
          const zMatch = line.match(/Z([\d.]+)/);
          if (zMatch) {
            newSettings.workingZ = parseFloat(zMatch[1]);
            foundWorkingZ = true;
          }
        }

        if (foundSafeZ && foundWorkingZ) break;
      }

      setGcodeSettings(newSettings);

      useAppStore.getState().showToast("G-Code Loaded Successfully", "success");
      logger.info("GCode", `G-Code file loaded: ${file.name} (${content.length} chars)`);

      // Reset input value to allow reloading same file
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleDownload = async () => {
    try {
      // Check if File System Access API is supported and not running locally via file://
      // Strategy Pattern: Choosing the right file save strategy based on environment
      if ('showSaveFilePicker' in window && window.location.protocol !== 'file:') {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: 'output.nc',
          types: [{
            description: 'G-Code File',
            accept: { 'text/plain': ['.nc'] },
          }],
        });

        const writable = await handle.createWritable();
        await writable.write(gcode);
        await writable.close();
        useAppStore.getState().showToast("G-Code Saved Successfully", "success");
        logger.info("GCode", "G-Code file saved successfully");
      } else {
        // Fallback for browsers that don't support the API or are blocked by file:/// protocol (e.g. CEF)
        // Use native IPC save dialog to prevent CEF crashing on download
        const result = await hwFacade.dialogSaveRecipeFile(gcode, 'output.nc');
        if (result && result.ok) {
          useAppStore.getState().showToast("G-Code Saved Successfully", "success");
        } else if (result?.message !== "Canceled") {
          useAppStore.getState().showToast("G-Code Save Failed", "error");
        }
      }
    } catch (err) {
      console.error('File save failed:', err);
      useAppStore.getState().showToast("G-Code Save Failed", "error");
    }
  };

  const handleUpload = async (codeOverride?: string): Promise<boolean> => {
    const codeToUpload = codeOverride || gcode;
    if (!codeToUpload) return false;

    // Pre-flight Safety Checks
    const appState = useAppStore.getState();
    const { motion, io } = appState;
    const axisFlags = motion.axisFlags;

    // 1) PMAC 통신 에러 시 중단
    if (motion.commError) {
      useAppStore.getState().openDialog({
        title: '업로드 중단 - 통신 에러',
        message: 'PMAC 통신 에러를 발견했습니다.\n통신 연결 상태를 확인해 주세요.',
        type: 'warning',
        confirmText: '확인',
      });
      return false;
    }

    // 2) Servo OFF 상태 확인
    const servoOff = !axisFlags.servo.X || !axisFlags.servo.Y || !axisFlags.servo.Z;
    if (servoOff) {
      const offAxes = (['X', 'Y', 'Z'] as const).filter(ax => !axisFlags.servo[ax]).join(', ');
      useAppStore.getState().openDialog({
        title: '업로드 중단 - Servo OFF',
        message: `Servo OFF 상태인 축이 있습니다: ${offAxes}\nServo ON 후 다시 시도해 주세요.`,
        type: 'warning',
        confirmText: '확인',
      });
      return false;
    }

    // 3) Home 완료 여부 확인
    const notHomed = !axisFlags.homed.X || !axisFlags.homed.Y || !axisFlags.homed.Z;
    if (notHomed) {
      const unhomedAxes = (['X', 'Y', 'Z'] as const).filter(ax => !axisFlags.homed[ax]).join(', ');
      useAppStore.getState().openDialog({
        title: '업로드 중단 - Home 미완료',
        message: `Homing이 완료되지 않은 축이 있습니다: ${unhomedAxes}\n홈 검색을 완료한 후 다시 시도해 주세요.`,
        type: 'warning',
        confirmText: '확인',
      });
      return false;
    }

    // 4) Alarm 발생 확인
    const hasAlarm = axisFlags.alarm.X || axisFlags.alarm.Y || axisFlags.alarm.Z;
    if (hasAlarm) {
      const alarmAxes = (['X', 'Y', 'Z'] as const).filter(ax => axisFlags.alarm[ax]).join(', ');
      useAppStore.getState().openDialog({
        title: '업로드 중단 - Alarm 발생',
        message: `Alarm이 발생한 축이 있습니다: ${alarmAxes}\nAlarm을 해제한 후 다시 시도해 주세요.`,
        type: 'warning',
        confirmText: '확인',
      });
      return false;
    }

    // 5) E-Stop 상태 확인
    if (io.flags.emo) {
      useAppStore.getState().openDialog({
        title: '업로드 중단 - E-Stop 활성',
        message: 'E-Stop(비상 정지)이 활성화되어 있습니다.\nE-Stop을 해제한 후 다시 시도해 주세요.',
        type: 'warning',
        confirmText: '확인',
      });
      return false;
    }

    setUploadStatus('uploading');
    setProgress(0);

    // Listen to real progress
    const off = bus.on("gcode/upload-progress", (p) => {
      setProgress(p);
      if (p >= 100) {
        setUploadStatus('success');
        useAppStore.getState().showToast("G-Code Uploaded Successfully", "success");
        off();
      }
    });

    try {
      // Send to backend
      await hwFacade.uploadGCode(codeToUpload);
      return true;
    } catch {
      off();
      setUploadStatus('error');
      useAppStore.getState().showToast("G-Code Upload Failed", "error");
      return false;
    }
  };


  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flex: 1, overflowY: 'auto', p: 0, scrollbarGutter: "stable" }}>
        <Box sx={{ p: 2 }}>
          {isScanner ? (
            scannerType === 'Scanlab' ? (
              <ScanlabProcessPanel
                canvas={canvas || undefined}
                pxPerMm={pxPerMm}
                origin={canvas ? { x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 } : { x: 0, y: 0 }}
              />
            ) : (
              <SinoGalvoProcessPanel
                canvas={canvas || undefined}
                pxPerMm={pxPerMm}
                origin={canvas ? { x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 } : { x: 0, y: 0 }}
              />
            )
          ) : (
            <GCodePanel
              canvas={canvas || undefined}
              pxPerMm={pxPerMm}
              origin={canvas ? { x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 } : { x: 0, y: 0 }}
              gcode={gcode}
              onGenerate={setGcode}
              onUpload={handleUpload}
            />
          )}
        </Box>
      </Box>

      {(activeTab === 'process' || activeTab === 'gcode' || activeTab === 'scanner') && !isScanner && useProcessDetail && (
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', backgroundColor: 'background.paper', display: 'flex', flexDirection: 'column', gap: 1 }}>
          <button
            onClick={handleDownload}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded transition-colors"
          >
            Save G-Code
          </button>

          <input
            type="file"
            accept=".nc,.gcode,.txt"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button
            onClick={handleLoadGCode}
            className="w-full bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 rounded transition-colors"
            title="Load G-Code from file"
          >
            Load G-Code
          </button>
        </Box>
      )}
    </Box>
  );
};

interface SectionDependencies {
  strings: UiText["shell"]["rightPanel"];
  jogging: boolean;
  onJogToggle: (value: boolean) => void;
  onJog: (axis: JogAxis, dir: 1 | -1, speed?: string) => void;
  onJogStop: (axis: JogAxis) => void;
  onJogSpeedChange: (speed: "slow" | "mid" | "fast") => void; // Added dependency
  onStopAll: () => void;
  onMoveRel: (axis: JogAxis, distance: number, speed: string) => void;
  onMoveAbs: (axis: JogAxis, position: number, speed: string) => void;
  lightChannels: LightChannel[];
  onLightChange: (id: number, value: number) => void;
  onLightCommit: (id: number, value: number) => void;
  onLightToggle: (id: number, isOn: boolean) => void;
  onLightSave?: () => void;
  onLightReload?: () => void;
  onJogSave?: () => void;
  onJogReload?: () => void;
  positionAxes: PositionAxisState[];
  onHomeAll?: () => void;
  onHomeAxis?: (axis: string) => void;
  homing?: { active: boolean; type: "all" | "X" | "Y" | "Z" | null };
  onCancelHome?: (axis?: string) => void;
  /** @brief 가공 중 잠금(isProcessingLocal || hideOverlays) — Home/Jog 등 모션 조작 비활성화 */
  processingLocked: boolean;

  /** Camera (현재 선택 카메라) */
  cameraFields: CameraSettingField[];
  onCameraChange: (key: string, value: number) => void;
  onCameraApply?: (key: string) => void;
  onCameraSave?: () => void;
  onCameraReload?: () => void;

  /** Recipe Tab State */
  activeTab: 'motion' | 'gcode' | 'process' | 'scanner';

  /** Hardware Capabilities */
  hardware: any;
  features: any;
}

/** 변형별 섹션 전략 구성 (Strategy) */
const buildSectionStrategies = (
  variant: RightPanelVariant,
  deps: SectionDependencies
): PanelSectionStrategy[] => {
  const positionIcon = <GpsFixedRoundedIcon fontSize="small" />;
  const jogIcon = <ControlCameraIcon fontSize="small" />;
  const lightIcon = <LightModeRoundedIcon fontSize="small" />;
  const cameraIcon = <TuneRoundedIcon fontSize="small" />;

  const showLights = deps.features.useLight !== false &&
                     deps.hardware.light !== "None" &&
                     deps.features.lightChannels > 0;

  const motionSections: PanelSectionStrategy[] = [
    {
      key: "position",
      title: deps.strings.sectionTitle.position,
      icon: positionIcon,
      includeInNavigation: true,
      render: () => (
        <PositionControlCard
          sectionTitle={deps.strings.sectionTitle.position}
          icon={positionIcon}
          axes={deps.positionAxes}
          onHomeAll={deps.onHomeAll}
          onHomeAxis={deps.onHomeAxis}
          homing={deps.homing}
          onCancelHome={deps.onCancelHome}
          disabled={deps.processingLocked}
        />
      ),
    },
    {
      key: "jog",
      title: deps.strings.sectionTitle.jog,
      icon: jogIcon,
      includeInNavigation: true,
      render: () => (
        <JogControlCard
          strings={deps.strings}
          sectionTitle={deps.strings.sectionTitle.jog}
          enableLabel={deps.strings.toggles.jogEnable}
          active={deps.jogging}
          onToggleActive={deps.onJogToggle}
          onJog={deps.onJog}
          onSpeedChange={deps.onJogSpeedChange}
          onStop={deps.onJogStop}
          onStopAll={deps.onStopAll}
          onMoveRel={deps.onMoveRel}
          onMoveAbs={deps.onMoveAbs}
          onSave={deps.onJogSave}
          onReload={deps.onJogReload}
          icon={jogIcon}
          disabled={deps.homing?.active || deps.processingLocked}
        />
      ),
    },
    ...(showLights
      ? [
          {
            key: "lights" as SectionKey,
            title: deps.strings.sectionTitle.lights,
            icon: lightIcon,
            includeInNavigation: true,
            render: () => (
              <LightControlCard
                sectionTitle={deps.strings.sectionTitle.lights}
                channels={deps.lightChannels}
                onChange={deps.onLightChange}
                onCommit={deps.onLightCommit}
                onToggle={deps.onLightToggle}
                onSave={deps.onLightSave}
                onReload={deps.onLightReload}
                icon={lightIcon}
                defaultExpanded={false}
              />
            ),
          },
        ]
      : []),
    {
      key: "camera",
      title: deps.strings.sectionTitle.camera,
      icon: cameraIcon,
      includeInNavigation: true,
      render: () => (
        <CameraSettingsCard
          sectionTitle={deps.strings.sectionTitle.camera}
          fields={deps.cameraFields}
          onChange={deps.onCameraChange}
          onApply={deps.onCameraApply}
          onSave={deps.onCameraSave}
          onReload={deps.onCameraReload}
          icon={cameraIcon}
          collapsible
          defaultOpen={false}
          persistKey="rightpanel.camera"
        />
      ),
    },
    {
      key: "laser",
      title: "Laser Shutter",
      icon: <BuildRoundedIcon fontSize="small" />,
      includeInNavigation: true,
      render: () => (
        <>
          <Divider sx={{ my: 1.5, borderColor: "divider" }} />
          <LaserControlCard />
        </>
      ),
    },
  ];

  if (variant === "recipe-canvas") {
    // If motion tab, show motion sections
    if (deps.activeTab === 'motion') {
        return motionSections;
    }
    // For any process-related tabs, show RecipePanelContent
    return [
      {
        key: "info",
        title: "Properties",
        includeInNavigation: false,
        render: () => (
          <RecipePanelContent activeTab={deps.activeTab} />
        ),
      },
    ];
  }

  return motionSections;
};

/** RightPanel 메인 */
export default function RightPanel({
  variant,
  topOffset,
  open,
  onToggle,
  onOpen,
}: RightPanelProps) {
  const theme = useTheme();
  const transitions = theme.transitions.duration;
  const enterDuration = transitions.enteringScreen ?? 225;

  const panelStrings = uiText.shell.rightPanel;

  // ---- 글로벌 스토어 ----
  const lightsState = useAppStore((s) => s.lights);
  const jogging = useAppStore((s) => s.jogging);
  const setJog = useAppStore((s) => s.setJog);
  const setJogSpeed = useAppStore((s) => s.setJogSpeed); // Added selector
  const setLight = useAppStore((s) => s.setLight);
  const setLightOn = useAppStore((s) => s.setLightOn);
  const setMotionState = useAppStore((s) => s.setMotionState); // NEW: Action to update global motion state
  const hardware = useAppStore((s) => s.hardware);
  const features = useAppStore((s) => s.features);

  // 현재 선택된 카메라 정보
  const cameraKind = useAppStore(selectors.cameraKind);
  const currentCameraId = useAppStore(selectors.currentCameraId);
  const currentCamera = useAppStore(selectors.currentCamera);
  const cameraConfig = useAppStore((s) => s.cameraConfig);
  const objectMag = useAppStore((s) => s.objectMag); // Track Object Mag

  const { pathname } = useLocation();
  const uiPrefs = useUIPreferenceStore();
  const [isPending, startTransition] = useTransition();

  // ---- Recipe Tab State (Lifted) ----
  const activeTab = useCanvasStore((s) => s.activeRightTab);
  const setActiveTab = useCanvasStore((s) => s.setActiveRightTab);
  const viewMode = useCanvasStore((s) => s.viewMode);

  // [가공 잠금] 가공 중에는 Motion 탭의 Home all/축별 호밍/Jog 패널을 비활성화한다.
  // 가공 종료(완료/Stop/생성 실패 롤백) 시 스토어가 false로 복원되어 자동 재활성화된다.
  const isProcessingLocal = useCanvasStore((s) => s.isProcessingLocal);
  const hideOverlays = useCanvasStore((s) => s.hideOverlays);
  const processingLocked = isProcessingLocal || hideOverlays;

  // 탭 상태 지속성을 위한 복합 키 (Recipe 페이지 등에서 모드별 탭 상태 유지)
  const persistentTabKey = useMemo(() => {
    const p = pathname.toLowerCase();
    // Recipe 페이지의 경우 카메라 모드(scanner/object)별로 탭을 기억함
    if (p.includes("recipe")) {
      return `${p}:${viewMode}`;
    }
    return p;
  }, [pathname, viewMode]);

  // [FIX] Restore last tab on path or mode change (Mount & Key Change)
  useEffect(() => {
    const savedTab = uiPrefs.getRightPanelTab(persistentTabKey, "motion");
    // Compatibility mapping: gcode/scanner -> process
    const target = (savedTab === 'gcode' || savedTab === 'scanner') ? 'process' : savedTab;
    
    if (target !== activeTab) {
      logger.info("UI", `Restoring RightPanel tab for ${persistentTabKey}: ${target}`);
      setActiveTab(target as any);
    }
  }, [persistentTabKey]);

  // [FIX] Save current tab to prefs when it changes (Single Source of Truth)
  useEffect(() => {
    if (activeTab) {
      uiPrefs.setRightPanelTab(persistentTabKey, activeTab);
    }
  }, [activeTab, persistentTabKey]);

  const gcodeLabel = viewMode === 'scanner' ? "Scanner Process" : "Object Process";

  const handleTabChange = (
    event: React.MouseEvent<HTMLElement>,
    newTab: "motion" | "process" | "gcode" | null
  ) => {
    if (newTab !== null) {
      console.log(`[RightPanel] Requesting tab change to: ${newTab}`);
      logger.info("UI", `Right panel tab changed: ${newTab}`);
      // Only update store. The persistence effect will handle saving to uiPrefs.
      setActiveTab(newTab as any);
    }
  };

  // ---- 조명 디바운스 ----
  const lightScheduler = useMemo(
    () =>
      new KeyedDebounceScheduler<number, number>(
        200,
        (ch, v) => void hwFacade.setLight(ch, v)
      ),
    []
  );
  useEffect(() => () => lightScheduler.dispose(), [lightScheduler]);

  // Load Light Config on Mount AND Mode Change
  useEffect(() => {
    (async () => {
      try {
        const res = await hwFacade.getLightConfig();
        if (res.ok) {
          // Sync backend state to global store based on CURRENT MODE
          let targetVals: number[] = [];
          let targetOn: boolean[] = [];

          if (cameraKind === 'scanner') {
            targetVals = res.scanner || [0, 0, 0, 0, 0, 0];
            targetOn = res.scanner_on || [];
          } else {
            // Object Mode
            if (objectMag === 'x50') {
              targetVals = res.object50 || [0, 0, 0, 0, 0, 0];
              targetOn = res.object50_on || [];
            } else {
              targetVals = res.object20 || [0, 0, 0, 0, 0, 0];
              targetOn = res.object20_on || [];
            }
          }

          // Fallbacks if arrays are empty
          if (targetVals.length === 0) targetVals = [0, 0, 0, 0, 0, 0];
          if (targetOn.length === 0) targetOn = [false, false, false, false, false, false];

          // SetStore
          targetVals.forEach((val, idx) => {
            setLight(idx + 1, val);
          });
          targetOn.forEach((isOn, idx) => {
            setLightOn(idx + 1, isOn);
          });

          // Also, ensure backend is aware of the mode switch if we want "View" to trigger switch
          // But `hwFacade` handles switch-on-write. 
          // Just in case, let's proactively switch mode so the hardware is ready?
          // No, better not to spam 'set_mode' unless necessary. 
        }
      } catch (e) {
        console.error("Failed to load light config", e);
      }
    })();
  }, [cameraKind, objectMag, setLight, setLightOn]);

  // ---- 조명 핸들러 ----
  const handleLightChange = useCallback(
    (id: number, value: number) => {
      setLight(id, value);
      const ch = useAppStore.getState().lights.find((l) => l.id === id);
      if (ch?.isOn) {
        lightScheduler.schedule(id, value);
      }
    },
    [lightScheduler, setLight]
  );

  const handleLightCommit = useCallback(
    (id: number, value: number) => {
      lightScheduler.flush(id);
      const ch = useAppStore.getState().lights.find((l) => l.id === id);
      if (ch?.isOn) {
        void hwFacade.setLight(id, value);
      }
    },
    [lightScheduler]
  );

  const handleLightToggle = useCallback(
    (id: number, isOn: boolean) => {
      setLightOn(id, isOn);
      // New Logic: Use setLightOn (Enable) API, decouple from Value
      void hwFacade.setLightOn(id, isOn);
    },
    [setLightOn]
  );

  // ---- JOG ----
  const handleJog = useCallback((axis: JogAxis, dir: 1 | -1, speed?: string) => {
    void hwFacade.jogStart(axis, dir, speed);
  }, []);
  const handleJogStop = useCallback((axis: JogAxis) => void hwFacade.jogStop(axis), []);
  const handleStopAll = useCallback(() => void hwFacade.stopAll(), []);
  const handleMoveRel = useCallback((axis: JogAxis, dist: number, speed: string) => {
    void hwFacade.moveRel(axis, dist, speed);
  }, []);
  const handleMoveAbs = useCallback((axis: JogAxis, pos: number, speed: string) => {
    void hwFacade.moveAbs(axis, pos, speed);
  }, []);

  // NEW: Speed change handler
  const handleJogSpeedChange = useCallback((speed: "slow" | "mid" | "fast") => {
    setJogSpeed(speed); // Update store
    void hwFacade.setJogSpeed(speed); // Update backend
  }, [setJogSpeed]);

  // [FIX] 탭 상태 자동 보정: variant가 'default'(Main)가 아닌데 activeTab이 'process'인 경우 'motion'으로 강제 전환
  useEffect(() => {
    if (variant !== 'default' && activeTab === 'process') {
      setActiveTab('motion');
    }
  }, [variant, activeTab, setActiveTab]);

  // ---- 포지션 (샘플) ----
  const motionState = useAppStore((s) => s.motion?.state ?? "Unknown");
  const isRunning = (motionState.toLowerCase().includes("busy") || motionState.toLowerCase().includes("run") || motionState.toLowerCase().includes("running"))
    && !motionState.toLowerCase().includes("paused");

  const positions = useAppStore(selectors.positions);
  const positionAxes: PositionAxisState[] = useMemo(
    () => [
      { axis: "X", label: "X", current: positions["X"] ?? 0, unit: "mm", active: isRunning },
      { axis: "Y", label: "Y", current: positions["Y"] ?? 0, unit: "mm", active: isRunning },
      { axis: "Z", label: "Z", current: positions["Z"] ?? 0, unit: "mm", active: isRunning },
    ],
    [positions, isRunning]
  );
  const handleHomeAll = useCallback(() => {
    logger.info("Motion", "Home All button clicked");
    const runHome = async () => {
      try {
        await hwFacade.homeAll();
        // [NEW] Reset to Scanner UI mode after successfully homing all axes
        useCanvasStore.getState().setViewMode('scanner');
      } catch (err) {
        logger.error("Motion", "Home All execution failed", err);
      }
    };
    void runHome();
  }, []);
  const handleHomeAxis = useCallback(
    (axis: string) => void hwFacade.home(axis),
    []
  );

  const homingState = useAppStore((s) => s.homingState);
  const handleCancelHome = useCallback(
    (axis?: string) => void hwFacade.cancelHome(axis),
    []
  );

  // ---- Camera: 범위 + 로컬 상태(optimistic) ----
  type NumRange = { min: number; max: number; inc?: number };

  const [expRange, setExpRange] = useState<NumRange>({
    min: 15,
    max: 60000,
    inc: 50,
  });
  const [gainRange, setGainRange] = useState<NumRange>({
    min: 0,
    max: 24,
    inc: 1,
  });

  const [localExp, setLocalExp] = useState<number>(1000);
  const [localGain, setLocalGain] = useState<number>(0);

  /** 범위 + 초기값 로딩: 카메라 전환 시 */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 병렬로 범위와 현재 값 가져오기
        const [r, p] = await Promise.all([
          hwFacade.getRanges(currentCameraId),
          hwFacade.getParams(currentCameraId),
        ]);

        if (cancelled) return;

        if (r?.exposure) {
          // Adjusted range: Scanner 2.0M, Object 0.2M
          const minVal = cameraKind === 'scanner' ? 15 : 28;
          const maxVal = cameraKind === 'scanner' ? 2000000 : 200000;
          setExpRange({ ...r.exposure, min: minVal, max: maxVal });
        } else {
          // Fallback if hardware doesn't report range
          const minVal = cameraKind === 'scanner' ? 15 : 28;
          const maxVal = cameraKind === 'scanner' ? 2000000 : 200000;
          setExpRange({ min: minVal, max: maxVal, inc: 1 });
        }

        // 초기값 반영 (Store 업데이트 → 아래 effect에서 localExp/Gain 동기화됨)
        if (p) {
          useAppStore.getState().setCameraParams(currentCameraId, p);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentCameraId, cameraKind]);

  /** 로컬 상태 동기화: 스토어 값/범위 변경 시 */
  useEffect(() => {
    // 1. Try to get value from cameraConfig (Saved File) if available, otherwise use runtime currentCamera
    let vExp = currentCamera?.exposure ?? 1000;
    let vGain = currentCamera?.gain ?? 0;

    if (cameraConfig?.cameras) {
      // Support 0-based and 1-based ID mismatch + Name-based fallback
      const cam = cameraConfig.cameras.find((c: any) =>
        c.id === currentCameraId ||
        c.id === (currentCameraId + 1) ||
        (c.name && currentCamera?.name && c.name.toLowerCase().includes(currentCamera.name.toLowerCase()))
      );

      if (cam && cam.presets && cam.presets[0]) {
        const preset = cam.presets[0];
        // [CRITICAL] If runtime store is at default values (1000/0), force-update store with saved config values
        if (vExp === 1000 && vGain === 0) {
          vExp = preset.exposure_time;
          vGain = preset.gain;

          console.log(`[RightPanel] Initial Sync: Overriding defaults with Config values: exp=${vExp}, gain=${vGain}`);

          // Synchronize to global store so other components (like overlay) also see the correct values immediately
          useAppStore.getState().setCameraParams(currentCameraId, {
            exposure: vExp,
            gain: vGain
          });

          // Proactively apply to hardware to ensure hardware and UI are in sync
          void hwFacade.setParams(currentCameraId, { exposure: vExp, gain: vGain });
        }
      }
    }

    vExp = Math.floor(vExp);
    vGain = Math.floor(vGain);

    setLocalExp(Math.min(Math.max(vExp, expRange.min), expRange.max));
    setLocalGain(Math.min(Math.max(vGain, gainRange.min), gainRange.max));
  }, [
    currentCameraId,
    currentCamera?.exposure,
    currentCamera?.gain,
    cameraConfig, // Add cameraConfig to dependency
    expRange,
    gainRange,
  ]);

  // ---- Camera Hardware Debounce Refs ----
  const expTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const gainTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /** CameraSettingsCard 필드 구성 */
  const cameraFields: CameraSettingField[] = useMemo(
    () => [
      {
        key: "exposure",
        label:
          (currentCameraId === 0
            ? uiText.shell.rightPanel?.cameraFields?.cam1Exposure
            : uiText.shell.rightPanel?.cameraFields?.cam2Exposure) ??
          `Exposure (${currentCamera?.name ??
          (currentCameraId === 0 ? "Scanner" : "Object")
          })`,
        value: localExp,
        min: expRange.min,
        max: expRange.max,
        step: expRange.inc ?? 1,
        unit: "us",
      },
      {
        key: "gain",
        label:
          (currentCameraId === 0
            ? uiText.shell.rightPanel?.cameraFields?.cam1Gain
            : uiText.shell.rightPanel?.cameraFields?.cam2Gain) ??
          `Gain (${currentCamera?.name ??
          (currentCameraId === 0 ? "Scanner" : "Object")
          })`,
        value: localGain,
        min: gainRange.min,
        max: gainRange.max,
        step: gainRange.inc ?? 1,
        unit: "dB",
      },
    ],
    [currentCamera, currentCameraId, localExp, localGain, expRange, gainRange]
  );

  /** 슬라이더 조작: 로컬 즉시 반영 + Hardware Debounce Call */
  const handleCameraChange = useCallback(
    (key: string, value: number) => {
      // 1. Update Global Store (Runtime) immediately for Overlay
      useAppStore.getState().setCameraParams(currentCameraId, { [key]: value });

      // 2. Local State
      if (key === "exposure") setLocalExp(value);
      if (key === "gain") setLocalGain(value);

      // 3. Hardware Call (Debounced)
      if (key === "exposure") {
        if (expTimeoutRef.current) clearTimeout(expTimeoutRef.current);
        expTimeoutRef.current = setTimeout(() => {
          void hwFacade.setParams(currentCameraId, { exposure: value });
        }, 100); // 100ms debounce
      } else if (key === "gain") {
        if (gainTimeoutRef.current) clearTimeout(gainTimeoutRef.current);
        gainTimeoutRef.current = setTimeout(() => {
          void hwFacade.setParams(currentCameraId, { gain: value });
        }, 100);
      }
    },
    [currentCameraId]
  );

  /** (옵션) Apply 버튼 사용 시 즉시 커밋 */
  const handleCameraApply = useCallback(
    (key: string) => {
      // Force apply current local values immediately
      if (key === "exposure") {
        void hwFacade.setParams(currentCameraId, { exposure: localExp });
      } else if (key === "gain") {
        void hwFacade.setParams(currentCameraId, { gain: localGain });
      }
    },
    [currentCameraId, localExp, localGain]
  );

  // ---- 저장 핸들러 ----
  const handleSaveLight = useCallback(async () => {
    const { ok } = await hwFacade.saveLightConfig();
    if (ok) {
      useAppStore.getState().showToast("Light Configuration Saved", "success");
    } else {
      useAppStore.getState().showToast("Failed to Save Light Config", "error");
    }
  }, []);

  const handleSaveCamera = useCallback(async () => {
    try {
      const store = useAppStore.getState();
      const { cameraConfig, objectMag, cameraKind, currentCameraId, cameras, setCameraConfig } = store;

      if (!cameraConfig?.cameras) return;

      // 1. Clone Config
      const newConfig = JSON.parse(JSON.stringify(cameraConfig));

      // 2. Identify Target Camera in Config
      const targetId = cameraKind === 'scanner' ? 1 : 2;
      const camEntry = newConfig.cameras.find((c: any) => c.id === targetId);

      if (!camEntry) {
        console.warn("Camera entry not found for ID", targetId);
        return;
      }

      // 3. Get Current Runtime Params
      const currentParams = cameras[currentCameraId];
      if (!currentParams) return;

      // 4. Update Preset
      let targetPresetIndex = 0;
      if (cameraKind === 'object' && camEntry.presets) {
        const mag = objectMag === 'x50' ? 50.0 : 20.0;
        const idx = camEntry.presets.findIndex((p: any) => p.magnification === mag);
        if (idx >= 0) targetPresetIndex = idx;
      }

      if (camEntry.presets && camEntry.presets[targetPresetIndex]) {
        const preset = camEntry.presets[targetPresetIndex];
        if (currentParams.exposure !== undefined) preset.exposure_time = currentParams.exposure;
        if (currentParams.gain !== undefined) preset.gain = currentParams.gain;
      }

      // 5. Save to Backend
      const { ok } = await hwFacade.setCameraConfig({ data: newConfig });

      if (ok) {
        useAppStore.getState().showToast("Camera Configuration Saved", "success");
      } else {
        useAppStore.getState().showToast("Failed to Save Camera Config", "error");
      }

      // 6. Sync Config State (so Parameter page sees it)
      setCameraConfig(newConfig);

    } catch (e) {
      console.error("Camera Save Failed", e);
    }
  }, []);

  const handleReloadLight = useCallback(async () => {
    try {
      const res = await hwFacade.getLightConfig();
      if (res.ok) {
        let targetVals: number[] = [];
        let targetOn: boolean[] = [];

        if (cameraKind === 'scanner') {
          targetVals = res.scanner || [0, 0, 0, 0, 0, 0];
          targetOn = res.scanner_on || [];
        } else {
          if (objectMag === 'x50') {
            targetVals = res.object50 || [0, 0, 0, 0, 0, 0];
            targetOn = res.object50_on || [];
          } else {
            targetVals = res.object20 || [0, 0, 0, 0, 0, 0];
            targetOn = res.object20_on || [];
          }
        }

        if (targetVals.length === 0) targetVals = [0, 0, 0, 0, 0, 0];
        if (targetOn.length === 0) targetOn = [false, false, false, false, false, false];

        const profile = cameraKind === 'scanner' ? 'scanner' : (objectMag === 'x50' ? 'object50' : 'object20');

        targetVals.forEach((val, idx) => {
          const cid = idx + 1;
          const v = Math.floor(val);
          setLight(cid, v);
          // Apply value to hardware immediately on reload
          void hwFacade.setLightVal(profile, cid, v);
        });

        targetOn.forEach((isOn, idx) => {
          const cid = idx + 1;
          setLightOn(cid, isOn);
          // Apply enable state to hardware immediately on reload
          void hwFacade.setLightEnable(profile, cid, isOn);
        });
        useAppStore.getState().showToast("Light Configuration Reloaded", "info");
      } else {
        useAppStore.getState().showToast("Failed to reload light config: " + ((res as any).message || "Unknown error"), "error");
      }
    } catch (e) {
      console.error("Failed to reload light config", e);
      useAppStore.getState().showToast("Light Reload Error", "error");
    }
  }, [cameraKind, objectMag, setLight, setLightOn]);

  const handleReloadCamera = useCallback(async () => {
    try {
      const store = useAppStore.getState();

      // Ensure config is loaded first
      if (!store.cameraConfig?.cameras || store.cameraConfig.cameras.length === 0) {
        await store.loadCameraConfig();
      }

      const { cameraConfig, objectMag, cameraKind, currentCameraId } = useAppStore.getState();

      if (!cameraConfig?.cameras) return;

      const targetId = cameraKind === 'scanner' ? 1 : 2;
      const camEntry = cameraConfig.cameras.find((c: any) => c.id === targetId);

      if (!camEntry || !camEntry.presets) {
        console.warn("No presets found for camera ID", targetId);
        return;
      }

      let targetPresetIndex = 0;
      if (cameraKind === 'object') {
        const mag = objectMag === 'x50' ? 50.0 : 20.0;
        targetPresetIndex = camEntry.presets.findIndex((p: any) => p.magnification === mag);
        if (targetPresetIndex < 0) targetPresetIndex = 0;
      }
      const preset = camEntry.presets[targetPresetIndex];

      if (preset) {
        const exp = Math.floor(preset.exposure_time ?? 1000);
        const g = Math.floor(preset.gain ?? 0);

        // Update Hardware - Double tap to ensure backend applies it to the stream
        await hwFacade.setParams(currentCameraId, { exposure: exp, gain: g });
        await new Promise(r => setTimeout(r, 50));
        await hwFacade.setParams(currentCameraId, { exposure: exp, gain: g });

        // Update Store
        store.setCameraParams(currentCameraId, { exposure: exp, gain: g });

        // Sync Local state
        setLocalExp(exp);
        setLocalGain(g);

        store.showToast("Camera Configuration Reloaded", "info");
      }
    } catch (e) {
      console.error("Camera Reload Failed", e);
    }
  }, [cameraKind, objectMag, currentCameraId]);

  const handleReloadJog = useCallback(async () => {
    try {
      const { ok, data } = await hwFacade.getMotionConfig();
      if (ok && data && Array.isArray(data.axes)) {
        const { setJogRelStep, setJogAbsTarget } = useAppStore.getState();
        data.axes.forEach((axis: any) => {
          const name = axis.name as "X" | "Y" | "Z";
          if (["X", "Y", "Z"].includes(name)) {
            if (axis.default_rel_val !== undefined) {
              setJogRelStep(name, axis.default_rel_val.toString());
            }
            if (axis.default_abs_val !== undefined) {
              setJogAbsTarget(name, axis.default_abs_val.toString());
            }
          }
        });
        useAppStore.getState().showToast("Jog Settings Reloaded", "info");
      }
    } catch (e) {
      console.error("Jog Reload Failed", e);
    }
  }, []);

  const handleSaveJog = useCallback(async () => {
    try {
      // First get current config to preserve other values
      const { ok, data } = await hwFacade.getMotionConfig();
      if (ok && data && Array.isArray(data.axes)) {
        const { jog } = useAppStore.getState();
        const updatedAxes = data.axes.map((axis: any) => {
          const name = axis.name as "X" | "Y" | "Z";
          if (["X", "Y", "Z"].includes(name)) {
            return {
              ...axis,
              default_rel_val: parseFloat(jog.relStep[name] || "0"),
              default_abs_val: parseFloat(jog.absTarget[name] || "0"),
            };
          }
          return axis;
        });

        const saveRes = await hwFacade.setMotionConfig({ axes: updatedAxes });
        if (saveRes.ok) {
          useAppStore.getState().showToast("Jog Settings Saved", "success");
        } else {
          useAppStore.getState().showToast("Failed to save jog settings", "error");
        }
      }
    } catch (e) {
      console.error("Jog Save Failed", e);
      useAppStore.getState().showToast("Jog Save Error", "error");
    }
  }, []);

  // ---- 섹션 전략 ----
  const lightChannels: LightChannel[] = useMemo(
    () => {
      const activeLights = lightsState.slice(0, features.lightChannels || lightsState.length);
      return activeLights.map((c, i) => ({
        id: c.id,
        label: `${uiText.shell.rightPanel.lights.channelPrefix}${i + 1}`,
        value: c.value,
        isOn: c.isOn,
      }));
    },
    [lightsState, features.lightChannels]
  );

  const sections = useMemo(
    () =>
      buildSectionStrategies(variant, {
        strings: uiText.shell.rightPanel,
        jogging,
        onJogToggle: setJog,
        onJog: handleJog,
        onJogSpeedChange: handleJogSpeedChange, // Wire it up
        onJogStop: handleJogStop,
        onStopAll: handleStopAll,
        onMoveRel: handleMoveRel,
        onJogReload: handleReloadJog,
        onJogSave: handleSaveJog,
        onMoveAbs: handleMoveAbs,
        lightChannels,
        onLightChange: handleLightChange,
        onLightCommit: handleLightCommit,
        onLightToggle: handleLightToggle,
        onLightSave: handleSaveLight,
        onLightReload: handleReloadLight,
        positionAxes,
        onHomeAll: handleHomeAll,
        onHomeAxis: handleHomeAxis,
        homing: homingState,
        onCancelHome: handleCancelHome,
        processingLocked,
        cameraFields,
        onCameraChange: handleCameraChange,
        onCameraApply: handleCameraApply,
        onCameraSave: handleSaveCamera,
        onCameraReload: handleReloadCamera,
        activeTab, // Pass active tab state
        hardware,
        features,
      }),
    [
      variant,
      jogging,
      setJog,
      handleJog,
      handleJogSpeedChange, // Added dependency
      handleJogStop,
      handleMoveRel,
      handleMoveAbs,
      lightChannels,
      handleLightChange,
      handleLightCommit,
      handleLightToggle,
      handleSaveLight,
      positionAxes,
      handleHomeAll,
      handleHomeAxis,
      homingState,
      handleCancelHome,
      processingLocked,
      cameraFields,
      handleCameraChange,
      handleCameraApply,
      handleSaveCamera,
      handleReloadCamera,
      handleReloadJog,
      handleSaveJog,
      activeTab,
      hardware,
      features,
    ]
  );

  // ---- 내비게이션/스크롤 ----
  const availableSectionKeys = useMemo(
    () => new Set(sections.map((s) => s.key)),
    [sections]
  );

  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef<HTMLDivElement>(null);
  const jogRef = useRef<HTMLDivElement>(null);
  const lightsRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const processRef = useRef<HTMLDivElement>(null);
  const laserRef = useRef<HTMLDivElement>(null);

  const sectionRefs = useMemo(
    () => ({
      position: positionRef,
      jog: jogRef,
      lights: lightsRef,
      camera: cameraRef,
      info: infoRef,
      process: processRef,
      laser: laserRef,
    }),
    []
  );

  const [pendingSection, setPendingSection] = useState<SectionKey | null>(null);
  const isCollapsed = !open;

  const scrollToSection = useCallback(
    (key: SectionKey) =>
      sectionRefs[key]?.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    [sectionRefs]
  );

  useEffect(() => {
    if (!open || !pendingSection) return;
    const timer = window.setTimeout(() => {
      if (availableSectionKeys.has(pendingSection))
        scrollToSection(pendingSection);
      setPendingSection(null);
    }, enterDuration + 30);
    return () => window.clearTimeout(timer);
  }, [
    open,
    pendingSection,
    enterDuration,
    scrollToSection,
    availableSectionKeys,
  ]);

  const go = useCallback(
    (key: SectionKey) => {
      if (!availableSectionKeys.has(key)) return;
      if (isCollapsed) {
        setPendingSection(key);
        onOpen?.();
        return;
      }
      scrollToSection(key);
    },
    [availableSectionKeys, isCollapsed, onOpen, scrollToSection]
  );

  const navigationSections = useMemo(
    () => sections.filter((s) => s.includeInNavigation !== false && s.icon),
    [sections]
  );

  return (
    <Drawer variant="permanent" open={open} offset={topOffset} anchor="right">
      {!open ? (
        <Box
          sx={{
            width: RIGHT_PANEL_COLLAPSED,
            height: `calc(100vh - ${topOffset}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            pt: 1.25,
            gap: 1.0,
          }}
        >
          <Tooltip title={panelStrings.tooltipOpen} placement="left" arrow>
            <IconButton
              size="small"
              onClick={onToggle}
              sx={{ color: "text.primary" }}
              data-nodrag
            >
              <MenuIcon />
            </IconButton>
          </Tooltip>

          <Box
            sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 1.25 }}
          >
            {navigationSections.map((section) => (
              <Tooltip
                key={section.key}
                title={section.title}
                placement="left"
                arrow
              >
                <IconButton
                  size="small"
                  onClick={() => go(section.key)}
                  sx={{
                    color: "text.primary",
                    bgcolor: "action.hover",
                    "&:hover": { bgcolor: "action.selected" },
                  }}
                  data-nodrag
                >
                  {section.icon}
                </IconButton>
              </Tooltip>
            ))}
          </Box>
        </Box>
      ) : (
        <>
          <div className="flex h-12 items-center px-2 gap-2">
            <ToggleButtonGroup
              // Use activeTab for all variants to support switching
              value={activeTab}
              exclusive
              onChange={handleTabChange}
              size="small"
              sx={{
                height: 32,
                backgroundColor: 'background.paper',
                '& .MuiToggleButton-root': {
                  borderColor: 'divider',
                  color: 'text.secondary',
                  px: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  '&.Mui-selected': {
                    backgroundColor: 'primary.main',
                    color: 'primary.contrastText',
                    '&:hover': {
                      backgroundColor: 'primary.dark',
                    },
                  },
                },
              }}
            >
              <ToggleButton value="motion">Motion</ToggleButton>
               {variant === 'recipe-canvas' && (
                <ToggleButton value={viewMode === 'scanner' ? 'scanner' : 'gcode'}>
                  {gcodeLabel}
                </ToggleButton>
              )}
            </ToggleButtonGroup>
            <IconButton
              onClick={onToggle}
              sx={{ ml: 'auto', color: "text.primary" }}
              data-nodrag
            >
              <ChevronRightIcon />
            </IconButton>
          </div>

          <Divider />

          <PanelBody
            sections={sections}
            scrollBoxRef={scrollBoxRef}
            sectionRefs={sectionRefs}
          />
        </>
      )}
    </Drawer>
  );
}
