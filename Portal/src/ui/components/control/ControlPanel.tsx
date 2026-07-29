/**
 * @file ControlPanel.tsx
 * @brief Provides a reusable control panel layout. (Compound Component pattern)
 */
import { useCallback, useMemo, useState } from "react";
import type { PropsWithChildren, ReactNode } from "react";
import classNames from "classnames";
import { useTheme } from "@mui/material";

export type ControlPanelProps = PropsWithChildren<{
  className?: string;
}>;

/**
 * @brief Renders the root container for control panel views.
 */
export function ControlPanel({ children, className }: ControlPanelProps) {
  const theme = useTheme();
  return (
    <div
      className={classNames("flex flex-col gap-2", className)}
      style={{
        backgroundColor: "transparent",
        color: theme.palette.text.primary,
      }}
    >
      {children}
    </div>
  );
}

export type ControlSectionProps = PropsWithChildren<{
  id?: string;
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  onToggle?: (expanded: boolean) => void;
}>;

/**
 * @brief Renders a single control section. (Strategy + Compound Component pattern)
 */
export function ControlSection({
  id,
  title,
  icon,
  actions,
  collapsible = false,
  defaultExpanded = true,
  onToggle,
  children,
}: ControlSectionProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);

  const handleToggle = useCallback(() => {
    if (!collapsible) {
      return;
    }
    setExpanded((prev) => {
      const next = !prev;
      onToggle?.(next);
      return next;
    });
  }, [collapsible, onToggle]);

  const sectionId = useMemo(() => id ?? `control-section-${title}`, [id, title]);

  return (
    <section
      id={sectionId}
      className="rounded-2xl shadow-sm"
      style={{
        backgroundColor: theme.palette.background.default,
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      <header
        className={classNames(
          "flex items-center gap-2 px-3 py-2",
          collapsible ? "cursor-pointer select-none" : "cursor-default"
        )}
        onClick={handleToggle}
      >
        {icon && <div style={{ color: theme.palette.primary.main }}>{icon}</div>}
        <div className="flex-1 font-bold text-sm truncate">
          {title}
        </div>
        <div className="flex items-center gap-2">
          {actions && <div className="flex items-center gap-1">{actions}</div>}
          {collapsible && (
            <span
              style={{
                color: theme.palette.text.secondary,
                width: '32px',
                textAlign: 'right'
              }}
              className="text-xs font-medium"
            >
              {expanded ? "Hide" : "Show"}
            </span>
          )}
        </div>
      </header>
      <div
        className={classNames(
          "px-3 pb-2 transition-all duration-200 ease-out",
          expanded
            ? "max-h-[800px] opacity-100"
            : "max-h-0 opacity-0 overflow-hidden"
        )}
      >
        <div className="flex flex-col gap-2 pt-1">{children}</div>
      </div>
    </section>
  );
}

ControlPanel.Section = ControlSection;

type ControlPanelComponent = typeof ControlPanel & {
  Section: typeof ControlSection;
};

(ControlPanel as ControlPanelComponent).Section = ControlSection;

export type { ControlPanelComponent };
