
/**
 * @file ZoomControlCard.tsx
 * @brief Defines the zoom control card.
 */
import type { ReactNode } from "react";
import { Button, useTheme } from "@mui/material";
import { ControlSection } from "./ControlPanel";

export type ZoomControlCardProps = {
  sectionTitle: string;
  zoomValue: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset?: () => void;
  icon?: ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
};

/**
 * @brief Renders zoom controls.
 */
export function ZoomControlCard({
  sectionTitle,
  zoomValue,
  onZoomIn,
  onZoomOut,
  onReset,
  icon,
  collapsible = true,
  defaultExpanded = true,
}: ZoomControlCardProps) {
  const theme = useTheme();
  return (
    <ControlSection
      title={sectionTitle}
      icon={icon}
      collapsible={collapsible}
      defaultExpanded={defaultExpanded}
    >
      <div className="flex items-center gap-3">
        <Button
          variant="outlined"
          size="small"
          onClick={onZoomOut}
          sx={{
            minWidth: 48,
            color: theme.palette.primary.main,
            borderColor: theme.palette.divider,
            "&:hover": {
              borderColor: theme.palette.primary.main,
              backgroundColor: theme.palette.action.hover,
            },
          }}
        >
          -
        </Button>
        <div
          className="flex-1 text-center text-sm font-semibold"
          style={{ color: theme.palette.text.primary }}
        >
          {zoomValue}%
        </div>
        <Button
          variant="outlined"
          size="small"
          onClick={onZoomIn}
          sx={{
            minWidth: 48,
            color: theme.palette.primary.main,
            borderColor: theme.palette.divider,
            "&:hover": {
              borderColor: theme.palette.primary.main,
              backgroundColor: theme.palette.action.hover,
            },
          }}
        >
          +
        </Button>
      </div>
      {onReset && (
        <button
          type="button"
          className="mt-2 text-xs"
          style={{ color: theme.palette.text.secondary }}
          onClick={onReset}
        >
          Reset to default
        </button>
      )}
    </ControlSection>
  );
}

