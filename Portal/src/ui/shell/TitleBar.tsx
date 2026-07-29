/**
 * @file TitleBar.tsx
 * @brief 애플리케이션 상단 타이틀 바 UI를 제공한다.
 */
import React, { useMemo, MouseEvent } from "react";
import { Button, IconButton, useTheme } from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import { callNative } from "@/core/ipc/bridge";
import { Channels } from "@/core/ipc/channels.gen";
import { uiText } from "../locale/strings";
import { useThemeContext } from "../hooks/useTheme";
import HardwareStatusGroup from "./HardwareStatusGroup";
import { RIGHT_PANEL_WIDTH } from "./RightPanel";
import { useAppStore } from "../../store/appStore";
import { hwFacade } from "@/services/HardwareFacade";
import useLogStore from "@/store/logStore";

// Layout Synchronization: Match SubTitleBar RightPanel width
const RIGHT_SECTION_WIDTH = RIGHT_PANEL_WIDTH;

type TabConfig = { to: string; label: string; disabled?: boolean };

type WindowControl = {
  key: string;
  title: string;
  label: string;
  onClick: () => void;
};

/**
 * @brief 드래그 금지 영역 여부를 판별한다.
 * @param e 마우스 이벤트
 */
function isNoDragTarget(e: MouseEvent) {
  return !!(e.target as HTMLElement).closest("[data-nodrag]");
}

/**
 * @brief 라우팅 탭 버튼을 렌더링한다.
 */
const TabBtn = ({ to, label, disabled }: TabConfig) => {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [isPending, startTransition] = React.useTransition();
  const active = pathname.toLowerCase() === to.toLowerCase();

  return (
    <Button
      onClick={() => {
        startTransition(() => {
          nav(to);
        });
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      size="small"
      variant={active ? "contained" : "text"}
      disabled={disabled}
      sx={{ 
        mx: 0.5, 
        minWidth: 64,
        opacity: isPending ? 0.7 : 1, // 전환 중 시각적 피드백
        transition: "opacity 0.2s ease",
      }}
      data-nodrag
    >
      {label}
    </Button>
  );
};

/**
 * @brief 타이틀 바 컴포넌트.
 */
export default function TitleBar() {
  const theme = useTheme();
  const { themeMode, toggleTheme } = useThemeContext();
  const titleBarText = uiText.shell.titleBar;
  const homingActive = useAppStore((s) => s.homingState.active);
  const advancedMode = useLogStore((s) => s.advancedMode);
  const setAdvancedMode = useLogStore((s) => s.setAdvancedMode);

  // [NEW] 로고를 1.5초 안에 5회 연속 클릭하면 고급(개발자) 모드를 켜고 끈다.
  // SYSTEM CONSOLE은 기본적으로 숨겨져 있고, 서비스 기술자만 이 제스처를 알고 필요할 때 켤 수 있다.
  const logoClickRef = React.useRef<{ count: number; lastTs: number }>({ count: 0, lastTs: 0 });
  const handleLogoClick = () => {
    const now = Date.now();
    const ref = logoClickRef.current;
    ref.count = (now - ref.lastTs < 1500) ? ref.count + 1 : 1;
    ref.lastTs = now;
    if (ref.count >= 5) {
      ref.count = 0;
      const next = !advancedMode;
      setAdvancedMode(next);
      useAppStore.getState().showToast(
        next ? "고급 모드 활성화 (SYSTEM CONSOLE 사용 가능)" : "고급 모드 비활성화",
        "info"
      );
    }
  };

  const tabs = useMemo<TabConfig[]>(
    () => [
      { to: "/main", label: titleBarText.tabs.main },
      { to: "/recipe", label: titleBarText.tabs.recipe },
      { to: "/parameter", label: titleBarText.tabs.parameter },
      { to: "/calibration", label: titleBarText.tabs.calibration },
    ],
    [titleBarText],
  );

  const windowControls = useMemo<WindowControl[]>(
    () => [
      {
        key: "minimize",
        title: titleBarText.windowControls.minimize.title,
        label: titleBarText.windowControls.minimize.label,
        onClick: () => callNative(Channels.app_window_minimize, {}),
      },
      {
        key: "maximize",
        title: titleBarText.windowControls.maximize.title,
        label: titleBarText.windowControls.maximize.label,
        onClick: () => callNative(Channels.app_window_maximizeToggle, {}),
      },
      {
        key: "close",
        title: titleBarText.windowControls.close.title,
        label: titleBarText.windowControls.close.label,
        onClick: async () => {
          try {
            const { features } = useAppStore.getState();
            const channels = features.lightChannels || 4;
            for (let i = 1; i <= channels; i++) {
              await hwFacade.setLightEnable("scanner", i, false);
            }
          } catch (e) {
            console.error("Failed to turn off lights on close", e);
          }
          callNative(Channels.app_window_close, {});
        },
      },
    ],
    [titleBarText],
  );

  return (
    <div
      className="h-12 flex items-center select-none"
      style={{
        backgroundColor: theme.palette.background.paper,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
      onMouseDown={(event) => {
        if (isNoDragTarget(event)) return;
        callNative(Channels.app_window_drag, {});
      }}
      onDoubleClick={(event) => {
        if (isNoDragTarget(event)) return;
        callNative(Channels.app_window_maximizeToggle, {});
      }}
    >
      <div
        className="ml-3 mr-2 flex items-center"
        data-nodrag
        onClick={handleLogoClick}
      >
        <img
          src={themeMode === 'dark' ? './Logo_White.png' : './Logo_Dark.png'}
          alt="App Logo"
          style={{ height: '38px', objectFit: 'contain' }}
        />
      </div>

      <div className="flex items-center gap-1" data-nodrag>
        {tabs.map((tab) => (
          <TabBtn key={tab.to} to={tab.to} label={tab.label} disabled={homingActive} />
        ))}
      </div>

      <div className="flex-1 min-w-4" />

      {/* Hardware Status Group: Responsive, can shrink or crop if window is small */}
      <div
        className="flex items-center min-w-0"
        style={{ flexShrink: 1, overflow: 'hidden' }}
      >
        <HardwareStatusGroup />
      </div>

      {/* Right Section Container (Matches SubTitleBar RightPanel width) */}
      <div
        className="flex items-center justify-end gap-1 px-4"
        style={{ width: RIGHT_SECTION_WIDTH, flexShrink: 0 }}
      >
        <IconButton
          onClick={toggleTheme}
          onDoubleClick={(e) => e.stopPropagation()}
          color="inherit"
          data-nodrag
        >
          {themeMode === "dark" ? <Brightness7Icon /> : <Brightness4Icon />}
        </IconButton>
        {windowControls.map((control) => (
          <button
            key={control.key}
            title={control.title}
            className="w-8 h-8 grid place-items-center rounded hover:bg-zinc-700/60"
            style={{ color: theme.palette.text.primary }}
            onClick={(e) => {
              e.stopPropagation();
              control.onClick();
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
            }}
            data-nodrag
          >
            {control.label}
          </button>
        ))}
      </div>
    </div>
  );
}
