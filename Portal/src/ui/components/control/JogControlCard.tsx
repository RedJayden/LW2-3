/**
 * @file JogControlCard.tsx
 * @brief JOG 카드 (하드웨어 OFF여도 모든 버튼 선택 가능, 접힘 시만 비활성)
 * @details
 *  - State + Command 패턴
 *  - Mouse/Touch press-and-hold + onClick 폴백
 *  - 실제 HW 동작은 active=true일 때만 onJog/onStop 호출
 *  - Collapsed 상태에서만 버튼 비활성/툴팁 (Collapsed) 표시
 */


import { useCallback, useMemo, useRef, useState, useEffect, type ReactNode } from "react";
import classNames from "classnames";
import { ButtonBase, Switch, Tooltip, useTheme, TextField, InputAdornment, IconButton } from "@mui/material";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import NorthWestRoundedIcon from "@mui/icons-material/NorthWestRounded";
import NorthRoundedIcon from "@mui/icons-material/NorthRounded";
import NorthEastRoundedIcon from "@mui/icons-material/NorthEastRounded";
import WestRoundedIcon from "@mui/icons-material/WestRounded";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import EastRoundedIcon from "@mui/icons-material/EastRounded";
import SouthWestRoundedIcon from "@mui/icons-material/SouthWestRounded";
import SouthRoundedIcon from "@mui/icons-material/SouthRounded";
import SouthEastRoundedIcon from "@mui/icons-material/SouthEastRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import type { UiText } from "@ui/locale/strings";
import { ControlSection } from "./ControlPanel";
import { useAppStore } from "../../../store/appStore";

/** 지원 축/모드/속도 */
export type JogAxis = "X" | "Y" | "Z";
export type JogMode = "JOG" | "REL" | "ABS";
export type JogSpeed = "slow" | "mid" | "fast";

/** 단일 조그 명령 */
type JogCommand = { axis: JogAxis; dir: 1 | -1 };

/** 방향 버튼 설정 */
type DirectionButtonConfig = {
  id: string;
  icon: ReactNode;
  ariaLabel: string;
  commands: JogCommand[];
  spacer?: boolean;
  stop?: boolean;
  tipKey: keyof UiText["shell"]["rightPanel"]["jog"]["tip"];
};

export type JogControlCardProps = {
  /** 섹션 타이틀 */
  sectionTitle: string;
  /** Enable 라벨 */
  enableLabel: string;
  /** locale 문자열 */
  strings: UiText["shell"]["rightPanel"];
  /** 실제 조그 실행 콜백 */
  onJog: (axis: JogAxis, direction: 1 | -1, speed?: string) => void;
  /** Enable 상태 (하드웨어 허용 조건) */
  active: boolean;
  /** Enable 토글 */
  onToggleActive: (value: boolean) => void;
  /** 상단 아이콘 */
  icon?: ReactNode;
  /** 최초 접힘 여부 */
  collapsed?: boolean;
  /** 섹션 토글 콜백 */
  onCollapsedChange?: (expanded?: boolean) => void;
  /** 저장/재로드 콜백 */
  onSave?: () => void;
  onReload?: () => void;
  /** 초기 모드/속도 */
  initialMode?: JogMode;
  initialSpeed?: JogSpeed;
  /** 상태 변경 알림 */
  onModeChange?: (mode: JogMode) => void;
  onSpeedChange?: (speed: JogSpeed) => void;
  /** 정지 콜백 */
  onStop?: (axis: JogAxis) => void;
  /** 모든 축 정지 콜백 */
  onStopAll?: () => void;
  /** REL 이동 콜백 */
  onMoveRel?: (axis: JogAxis, distance: number, speed: JogSpeed) => void;
  /** ABS 이동 콜백 */
  onMoveAbs?: (axis: JogAxis, position: number, speed: JogSpeed) => void;
  /** @brief 호밍 중 전체 비활성화 */
  disabled?: boolean;
};

/** Ripple 공통 스타일 */
const rippleSx = {
  "& .MuiTouchRipple-root": { width: "100%", height: "100%" },
  "& .MuiTouchRipple-rippleVisible": { borderRadius: "inherit" },
  "& .MuiTouchRipple-child": { borderRadius: "inherit" },
} as const;

/**
 * @brief 방향 버튼 스타일 (접힘일 때만 disable)
 */
const getDirectionButtonSx = (
  theme: any,
  isStop: boolean,
  collapsed: boolean
) => {
  const base = {
    width: 34,
    height: 34,
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    bgcolor: theme.palette.background.paper,
    color: theme.palette.text.primary,
    fontSize: "1rem",
    transition: "all 0.2s ease",
    "&:hover": {
      borderColor: theme.palette.info.light,
      bgcolor: theme.palette.action.hover,
    },
  } as const;

  if (collapsed) return { ...base, opacity: 0.55, pointerEvents: "none" };

  if (isStop) {
    return {
      ...base,
      border: `1px solid ${theme.palette.error.main}`,
      bgcolor: theme.palette.error.main,
      color: theme.palette.error.contrastText,
    };
  }
  return base;
};

/** 모드/속도 버튼 스타일 (접힘일 때만 disable) */
const getToggleButtonSx = (
  theme: any,
  selected: boolean,
  collapsed: boolean
) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.25rem",
  borderRadius: theme.shape.borderRadius,
  border: "1px solid",
  borderColor: selected ? theme.palette.info.light : theme.palette.divider,
  bgcolor: selected
    ? theme.palette.action.selected
    : theme.palette.background.paper,
  color: selected ? theme.palette.text.primary : theme.palette.text.secondary,
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  padding: "6px 10px",
  minWidth: 64,
  transition: "all 0.2s ease",
  opacity: collapsed ? 0.55 : 1,
  pointerEvents: collapsed ? "none" : "auto",
});

const getSpeedButtonSx = (
  theme: any,
  selected: boolean,
  collapsed: boolean
) => ({
  minWidth: 60,
  borderRadius: theme.shape.borderRadius,
  border: "1px solid",
  borderColor: selected ? theme.palette.info.light : theme.palette.divider,
  bgcolor: selected
    ? theme.palette.action.selected
    : theme.palette.background.paper,
  color: selected ? theme.palette.text.primary : theme.palette.text.secondary,
  fontSize: "0.8rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  padding: "6px 12px",
  transition: "all 0.2s ease",
  opacity: collapsed ? 0.55 : 1,
  pointerEvents: collapsed ? "none" : "auto",
});

/** 접힘 상태만 툴팁 접미사 적용 */
const withCollapsedSuffix = (
  base: string,
  collapsed: boolean,
  t: UiText["shell"]["rightPanel"]["jog"]["stateSuffix"]
) => (collapsed ? `${base} ${t.collapsed}` : base);

/**
 * @brief Individual Direction Button Component
 * Encapsulates press handling and cleanup logic to avoid hooks-in-loop violations
 * and "sticky button" issues.
 */
const JogDirectionButton = ({
  config,
  collapsed,
  isStop,
  strings,
  pressingIdRef,
  onExecute,
  onStop,
  onStopAll,
  disabled = false,
}: {
  config: DirectionButtonConfig;
  collapsed: boolean;
  isStop: boolean;
  strings: UiText["shell"]["rightPanel"];
  pressingIdRef: React.MutableRefObject<string | null>;
  onExecute: (commands: JogCommand[]) => void;
  onStop?: (axis: JogAxis) => void;
  onStopAll?: () => void;
  disabled?: boolean;
}) => {
  const theme = useTheme();
  const isPressed = useRef(false);
  const effectiveDisabled = collapsed || disabled;

  const baseText = strings.jog.tip[config.tipKey];
  const tip = withCollapsedSuffix(baseText, effectiveDisabled, strings.jog.stateSuffix);

  const handleStop = useCallback(() => {
    // Always cleanup local state
    if (isPressed.current) {
      isPressed.current = false;

      // Cleanup global ref if we own it
      if (pressingIdRef.current === config.id) {
        pressingIdRef.current = null;

        // Send stop command if needed
        // Only send stop in JOG mode (REL/ABS are trigger-once)
        const currentMode = useAppStore.getState().jog.mode;
        if (currentMode === "JOG" && !isStop) {
          config.commands.forEach((cmd) => onStop?.(cmd.axis));
        }
      }
    }

    // Cleanup listeners
    window.removeEventListener("mouseup", handleStop);
    window.removeEventListener("touchend", handleStop);
  }, [config, onStop, isStop, pressingIdRef]);

  // Cleanup on unmount (Critical for sticky button fix)
  useEffect(() => {
    return () => {
      if (isPressed.current) {
        handleStop();
      }
    };
  }, [handleStop]);

  const handleStart = (e: React.SyntheticEvent) => {
    if (effectiveDisabled) return;

    // Stop button behavior
    if (isStop) {
      onStopAll?.();
      return;
    }

    if (isPressed.current) return;

    // Set states
    isPressed.current = true;
    pressingIdRef.current = config.id;

    // Execute Jog Start
    onExecute(config.commands);

    // Add release listeners to Window to catch release anywhere
    window.addEventListener("mouseup", handleStop, { once: true });
    window.addEventListener("touchend", handleStop, { once: true });
  };

  return (
    <Tooltip
      title={tip}
      placement="top"
      arrow
      disableInteractive
    >
      <ButtonBase
        focusRipple
        component="button"
        type="button"
        aria-label={baseText}
        TouchRippleProps={{ center: false }}
        disabled={effectiveDisabled}
        sx={{
          ...getDirectionButtonSx(theme, isStop, effectiveDisabled),
          ...rippleSx,
          pointerEvents: "auto",
          touchAction: "none",
        }}
        data-nodrag
        onMouseDown={handleStart}
        onTouchStart={handleStart}
        onClick={(e) => {
          // Fallback for simple clicks, mainly for Stop button or edge cases.
          if (effectiveDisabled) return;
          if (isStop) {
            onStopAll?.();
          }
          // NOTE: for JOG buttons, action is triggered by onMouseDown/TouchStart
        }}
      >
        {config.icon}
      </ButtonBase>
    </Tooltip>
  );
};

export function JogControlCard({
  sectionTitle,
  enableLabel,
  strings,
  onJog,
  active,
  onToggleActive,
  icon,
  collapsed = false,
  onCollapsedChange,
  initialMode = "JOG",
  initialSpeed = "mid",
  onModeChange,
  onSpeedChange,
  onStop,
  onStopAll,
  onMoveRel,
  onMoveAbs,
  onReload,
  onSave,
  disabled = false,
}: JogControlCardProps) {
  const theme = useTheme();
  // Global store usage
  const { jog, setJogMode, setJogSpeed, setJogRelStep, setJogAbsTarget } = useAppStore();
  const { mode: selectedMode, speed: selectedSpeed, relStep, absTarget } = jog;

  const [isCollapsed, setIsCollapsed] = useState<boolean>(collapsed);
  /** @brief disabled 또는 collapsed이면 UI 비활성화 */
  const isDisabled = isCollapsed || disabled;
  const effectiveCollapsed = isDisabled; // Alias for backward compatibility if needed, but better use isDisabled

  const handleRelChange = (axis: JogAxis, val: string) => {
    setJogRelStep(axis, val);
  };

  const handleAbsChange = (axis: JogAxis, val: string) => {
    setJogAbsTarget(axis, val);
  };

  const handleBlur = (
    axis: JogAxis,
    val: string,
    setter: (axis: JogAxis, val: string) => void
  ) => {
    const n = parseFloat(val);
    if (!isNaN(n)) {
      setter(axis, n.toFixed(3));
    }
  };

  /** 방향키/모드/속도: UI는 항상 활성. 단, 접힘일 때만 막음 */
  const collapsedOnly = effectiveCollapsed;

  const pressingIdRef = useRef<string | null>(null);

  // --- locale 기반 버튼 테이블 ---
  const XY_DIRECTION_BUTTONS: DirectionButtonConfig[] = useMemo(
    () => [
      {
        id: "xy-nw",
        icon: <NorthWestRoundedIcon fontSize="small" />,
        ariaLabel: strings.jog.tip.moveXMinusYMinus,
        commands: [
          { axis: "X", dir: -1 },
          { axis: "Y", dir: 1 },
        ],
        tipKey: "moveXMinusYMinus",
      },
      {
        id: "xy-n",
        icon: <NorthRoundedIcon fontSize="small" />,
        ariaLabel: strings.jog.tip.moveYMinus,
        commands: [{ axis: "Y", dir: 1 }],
        tipKey: "moveYMinus",
      },
      {
        id: "xy-ne",
        icon: <NorthEastRoundedIcon fontSize="small" />,
        ariaLabel: strings.jog.tip.moveXPlusYMinus,
        commands: [
          { axis: "X", dir: 1 },
          { axis: "Y", dir: 1 },
        ],
        tipKey: "moveXPlusYMinus",
      },
      {
        id: "xy-w",
        icon: <WestRoundedIcon fontSize="small" />,
        ariaLabel: strings.jog.tip.moveXMinus,
        commands: [{ axis: "X", dir: -1 }],
        tipKey: "moveXMinus",
      },
      {
        id: "xy-center",
        icon: <StopCircleIcon fontSize="small" />,
        ariaLabel: strings.jog.tip.stop,
        commands: [],
        stop: true,
        tipKey: "stop",
      },
      {
        id: "xy-e",
        icon: <EastRoundedIcon fontSize="small" />,
        ariaLabel: strings.jog.tip.moveXPlus,
        commands: [{ axis: "X", dir: 1 }],
        tipKey: "moveXPlus",
      },
      {
        id: "xy-sw",
        icon: <SouthWestRoundedIcon fontSize="small" />,
        ariaLabel: strings.jog.tip.moveXMinusYPlus,
        commands: [
          { axis: "X", dir: -1 },
          { axis: "Y", dir: -1 },
        ],
        tipKey: "moveXMinusYPlus",
      },
      {
        id: "xy-s",
        icon: <SouthRoundedIcon fontSize="small" />,
        ariaLabel: strings.jog.tip.moveYPlus,
        commands: [{ axis: "Y", dir: -1 }],
        tipKey: "moveYPlus",
      },
      {
        id: "xy-se",
        icon: <SouthEastRoundedIcon fontSize="small" />,
        ariaLabel: strings.jog.tip.moveXPlusYPlus,
        commands: [
          { axis: "X", dir: 1 },
          { axis: "Y", dir: -1 },
        ],
        tipKey: "moveXPlusYPlus",
      },
    ],
    [strings]
  );

  const Z_DIRECTION_BUTTONS: DirectionButtonConfig[] = useMemo(
    () => [
      {
        id: "z-up",
        icon: <KeyboardArrowUpRoundedIcon fontSize="small" />,
        ariaLabel: strings.jog.tip.moveZMinus, // was moveZPlus
        commands: [{ axis: "Z", dir: -1 }], // was 1
        tipKey: "moveZMinus",
      },
      {
        id: "z-spacer",
        icon: null,
        ariaLabel: "Spacer",
        commands: [],
        spacer: true,
        tipKey: "stop",
      },
      {
        id: "z-down",
        icon: <KeyboardArrowDownRoundedIcon fontSize="small" />,
        ariaLabel: strings.jog.tip.moveZPlus, // was moveZMinus
        commands: [{ axis: "Z", dir: 1 }], // was -1 (implicit fix if it was wrong before, but typical logic suggests Down is - or + depending on convention. User said Up is Z-, so Down must be Z+)
        tipKey: "moveZPlus",
      },
    ],
    [strings]
  );

  /** @brief 실제 조그 명령 실행 */
  const executeJogCommand = useCallback(
    (commands: JogCommand[]) => {
      // Global state
      const { jog } = useAppStore.getState();
      const { mode, speed, relStep, direction, jogXDir, jogYDir } = jog;

      console.log('[JOG DEBUG] executeJogCommand called', { active, mode, commands, jogXDir, jogYDir });

      if (mode === "JOG") {
        console.log('[JOG DEBUG] JOG mode, calling onJog with speed:', speed);
        commands.forEach(({ axis, dir }) => {
          // Apply direction modifier from machine.ini (0: normal, 1: reverse)
          const axisRev = axis === "X" ? (jogXDir === 1 ? -1 : 1) : (axis === "Y" ? (jogYDir === 1 ? -1 : 1) : 1);
          const effectiveDir = (dir * direction[axis] * axisRev) as 1 | -1;
          onJog(axis, effectiveDir, speed);
        });
      } else if (mode === "REL") {
        console.log('[JOG DEBUG] REL mode, calling onMoveRel');
        // REL 모드: 방향키 누르면 설정된 스텝만큼 이동
        commands.forEach(({ axis, dir }) => {
          const step = parseFloat(relStep[axis] || "0");
          // Apply direction modifier from machine.ini
          const axisRev = axis === "X" ? (jogXDir === 1 ? -1 : 1) : (axis === "Y" ? (jogYDir === 1 ? -1 : 1) : 1);
          const effectiveDir = (dir * direction[axis] * axisRev);
          const dist = step * effectiveDir;

          if (!isNaN(dist) && dist !== 0) {
            onMoveRel?.(axis, dist, speed);
          }
        });
      }
      // ABS 모드에서는 방향키 동작 안함 (별도 UI 사용)
    },
    [onJog, active, onMoveRel]
  );

  /** 모드 버튼 */
  const modeButtons = useMemo(() => {
    const m = strings.jog.mode;
    const items: { value: JogMode; label: string; tip: string }[] = [
      { value: "JOG", label: m.jog.label, tip: m.jog.tip },
      { value: "REL", label: m.rel.label, tip: m.rel.tip },
      { value: "ABS", label: m.abs.label, tip: m.abs.tip },
    ];
    return items.map(({ value, label, tip }) => (
      <Tooltip
        key={value}
        title={withCollapsedSuffix(tip, effectiveCollapsed, strings.jog.stateSuffix)}
        placement="top"
        arrow
        disableInteractive
      >
        <ButtonBase
          component="button"
          focusRipple
          type="button"
          aria-label={tip}
          TouchRippleProps={{ center: false }}
          disabled={isDisabled}
          sx={{
            ...getToggleButtonSx(theme, selectedMode === value, isDisabled),
            ...rippleSx,
          }}
          data-nodrag
          onClick={() =>
            !isDisabled && (setJogMode(value))
          }
        >
          <span
            className={classNames(
              "inline-flex h-3 w-3 items-center justify-center rounded-[3px] border transition-colors",
              selectedMode === value
                ? "border-sky-400 bg-sky-400"
                : "border-slate-400"
            )}
          />
          {label}
        </ButtonBase>
      </Tooltip>
    ));
  }, [strings, effectiveCollapsed, theme, selectedMode, setJogMode]);

  /** 속도 버튼 */
  const speedButtons = useMemo(() => {
    const s = strings.jog.speed;
    const items: { value: JogSpeed; label: string; tip: string }[] = [
      { value: "slow", label: s.slow.label, tip: s.slow.tip },
      { value: "mid", label: s.mid.label, tip: s.mid.tip },
      { value: "fast", label: s.fast.label, tip: s.fast.tip },
    ];
    return items.map(({ value, label, tip }) => (
      <Tooltip
        key={value}
        title={withCollapsedSuffix(tip, effectiveCollapsed, strings.jog.stateSuffix)}
        placement="top"
        arrow
        disableInteractive
      >
        <ButtonBase
          component="button"
          focusRipple
          type="button"
          aria-label={tip}
          TouchRippleProps={{ center: false }}
          disabled={isDisabled}
          sx={{
            ...getSpeedButtonSx(theme, selectedSpeed === value, isDisabled),
            ...rippleSx,
          }}
          data-nodrag
          onClick={() => {
            if (!isDisabled) {
              setJogSpeed(value);
              onSpeedChange?.(value);
            }
          }}
        >
          {label}
        </ButtonBase>
      </Tooltip>
    ));
  }, [strings, effectiveCollapsed, theme, selectedSpeed, setJogSpeed]);

  /** REL 입력 UI */
  const renderRelInputs = () => (
    <div className="flex flex-col gap-2 mt-1 w-full">
      {(["X", "Y", "Z"] as JogAxis[]).map((axis) => (
        <TextField
          key={axis}
          label={axis}
          size="small"
          variant="outlined"
          type="number"
          fullWidth
          value={relStep[axis]}
          onChange={(e) => handleRelChange(axis, e.target.value)}
          onBlur={(e) => handleBlur(axis, e.target.value, setJogRelStep)}
          disabled={isDisabled}
          InputProps={{
            endAdornment: <InputAdornment position="end"><span className="text-xs text-gray-500 dark:text-slate-400">mm</span></InputAdornment>,
            style: { fontSize: "0.9rem" }
          }}
          inputProps={{ step: 0.001, style: { padding: "8px 0 8px 12px", textAlign: "right" } }}
          InputLabelProps={{ shrink: true }}
          sx={{ bgcolor: "background.paper" }}
        />
      ))}
    </div>
  );

  /** ABS 입력 UI */
  const renderAbsInputs = () => (
    <div className="flex flex-col gap-2 mt-1 w-full">
      {(["X", "Y", "Z"] as JogAxis[]).map((axis) => (
        <div key={axis} className="flex items-center gap-2">
          <TextField
            label={axis}
            size="small"
            variant="outlined"
            type="number"
            fullWidth
            value={absTarget[axis]}
            onChange={(e) => handleAbsChange(axis, e.target.value)}
            onBlur={(e) => handleBlur(axis, e.target.value, setJogAbsTarget)}
            disabled={isDisabled}
            InputProps={{
              endAdornment: <InputAdornment position="end"><span className="text-xs text-gray-500 dark:text-slate-400">mm</span></InputAdornment>,
              style: { fontSize: "0.9rem" }
            }}
            inputProps={{ step: 0.001, style: { padding: "8px 0 8px 12px", textAlign: "right" } }}
            InputLabelProps={{ shrink: true }}
            sx={{ bgcolor: "background.paper" }}
          />
          <IconButton
            size="small"
            color="info"
            disabled={isDisabled}
            onClick={() => {
              const target = parseFloat(absTarget[axis] || "0");
              if (!isNaN(target)) {
                onMoveAbs?.(axis, target, selectedSpeed);
              }
            }}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              width: 40,
              height: 40,
              bgcolor: "background.paper",
              "&:hover": { bgcolor: "action.hover", borderColor: "info.main" }
            }}
          >
            <PlayArrowRoundedIcon fontSize="small" />
          </IconButton>
        </div>
      ))}
    </div>
  );

  return (
    <ControlSection
      title={sectionTitle}
      icon={icon}
      collapsible
      defaultExpanded={!collapsed}
      onToggle={(expanded) => {
        setIsCollapsed((prev) =>
          typeof expanded === "boolean" ? !expanded : !prev
        );
        onCollapsedChange?.(expanded);
      }}
      actions={
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {/* Reload Button */}
          <button
            disabled={isDisabled}
            onClick={(e) => {
              e.stopPropagation();
              onReload?.();
            }}
            className="text-xs px-2 py-0.5 rounded bg-slate-600 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            Reload
          </button>
          {/* Save Button */}
          <button
            disabled={isDisabled}
            onClick={(e) => {
              e.stopPropagation();
              onSave?.();
            }}
            className="text-xs px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            Save
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-2" data-nodrag>
        <div className="flex flex-row items-start gap-4" data-nodrag>
          {/* Main Content Area: Directional Controls OR Stop Button */}
          {selectedMode === "ABS" ? (
            // ABS Mode: Show Big STOP Button in place of Directional Controls
            <div className="flex justify-center items-center h-[118px] w-[170px]" data-nodrag>
              <ButtonBase
                className="w-full h-full rounded-lg border-2 border-red-500 bg-red-500 text-white hover:bg-red-600 transition-colors flex flex-col items-center justify-center gap-1"
                onClick={() => {
                  if (!active) onToggleActive(true);
                  onStop?.("X");
                  onStop?.("Y");
                  onStop?.("Z");
                }}
                disabled={isDisabled}
                sx={{ opacity: isCollapsed ? 0.5 : 1 }}
              >
                <StopCircleIcon sx={{ fontSize: 48 }} />
                <span className="text-xl font-bold">STOP</span>
              </ButtonBase>
            </div>
          ) : (
            // JOG/REL Mode: Show XY + Z
            // Unify size with ABS mode (w-[170px]) to prevent Speed buttons from shifting
            <div className="flex flex-row gap-4 w-[170px] h-[118px]" data-nodrag>
              {/* Left Column: XY Grid */}
              <div className="flex flex-col gap-2" data-nodrag>
                <div className="grid grid-cols-3 gap-1" data-nodrag>
                  {XY_DIRECTION_BUTTONS.map((config) => (
                    config.spacer ? (
                      <div
                        key={config.id}
                        className="h-10 w-12 rounded-md border border-transparent bg-transparent"
                        aria-hidden="true"
                        data-nodrag
                      />
                    ) : (
                      <JogDirectionButton
                        key={config.id}
                        config={config}
                        collapsed={isCollapsed}
                        isStop={Boolean(config.stop)}
                        strings={strings}
                        pressingIdRef={pressingIdRef}
                        disabled={isDisabled}
                        onExecute={executeJogCommand}
                        onStop={onStop}
                        onStopAll={onStopAll}
                      />
                    )
                  ))}
                </div>
              </div>

              {/* Middle: Z Axis */}
              <div className="flex flex-col gap-1" data-nodrag>
                {Z_DIRECTION_BUTTONS.map((config) => (
                  config.spacer ? (
                    <div
                      key={config.id}
                      className="h-10 w-12 rounded-md border border-transparent bg-transparent"
                      aria-hidden="true"
                      data-nodrag
                    />
                  ) : (
                    <JogDirectionButton
                      key={config.id}
                      config={config}
                      collapsed={isCollapsed}
                      isStop={Boolean(config.stop)}
                      strings={strings}
                      pressingIdRef={pressingIdRef}
                      disabled={isDisabled}
                      onExecute={executeJogCommand}
                      onStop={onStop}
                      onStopAll={onStopAll}
                    />
                  )
                ))}
              </div>
            </div>
          )}

          {/* Right Column: Speed Buttons (Always Visible) */}
          <div className="flex flex-col gap-2" data-nodrag>
            {speedButtons}
          </div>
        </div>

        {/* Mode Buttons & Inputs */}
        <div className="flex flex-col gap-2" data-nodrag>
          {/* Mode Buttons */}
          <div className="flex flex-row gap-2" data-nodrag>
            {modeButtons}
          </div>

          {/* Inputs */}
          <div data-nodrag className="flex flex-col gap-2">
            {selectedMode === "REL" && renderRelInputs()}
            {selectedMode === "ABS" && renderAbsInputs()}
          </div>
        </div>
      </div>
    </ControlSection>
  );
}

