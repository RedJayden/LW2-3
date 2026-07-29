
/**
 * @file PositionControlCard.tsx
 * @brief Defines the position move control card.
 * @details
 *  - Design Pattern: Presentational component with dialog confirmation
 *  - Supports homing state disable + Cancel button
 */
import { useState, type ReactNode } from "react";
import {
    useTheme,
    ButtonBase,
    IconButton,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    CircularProgress
} from "@mui/material";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import { ControlSection } from "./ControlPanel";
import { DigitalDisplay } from "../ui/DigitalDisplay";

export type PositionAxisState = {
    axis: string;
    label: string;
    current: number;
    unit?: string;
    active?: boolean;
};

export type PositionControlCardProps = {
    sectionTitle: string;
    axes: PositionAxisState[];
    onHomeAll?: () => void;
    onHomeAxis?: (axis: string) => void;
    onCancelHome?: (axis?: string) => void;
    icon?: ReactNode;
    collapsible?: boolean;
    defaultExpanded?: boolean;
    /** @brief 호밍 진행 중 상태 */
    homing?: { active: boolean; type: "all" | "X" | "Y" | "Z" | null };
    /** @brief 외부 잠금(가공 중 등) — 호밍 진행 표시(스피너)와 분리해 버튼만 비활성화한다 */
    disabled?: boolean;
};

/**
 * @brief Renders position controls with home shortcuts.
 */
export function PositionControlCard({
    sectionTitle,
    axes,
    onHomeAll,
    onHomeAxis,
    onCancelHome,
    icon,
    collapsible = false,
    defaultExpanded = true,
    homing,
    disabled = false,
}: PositionControlCardProps) {
    const theme = useTheme();
    const [open, setOpen] = useState(false);
    const [pendingAxis, setPendingAxis] = useState<string | null>(null);

    const isHoming = homing?.active ?? false;
    // 호밍 중이거나 외부 잠금(가공 중)이면 Home all/축별 호밍을 막는다
    const locked = isHoming || disabled;

    const handleRequestHomeAll = () => {
        setPendingAxis(null);
        setOpen(true);
    };

    const handleRequestHomeAxis = (axis: string) => {
        setPendingAxis(axis);
        setOpen(true);
    };

    const handleConfirm = () => {
        if (pendingAxis) {
            onHomeAxis?.(pendingAxis);
        } else {
            onHomeAll?.();
        }
        setOpen(false);
    };

    const handleClose = () => {
        setOpen(false);
    };

    const handleCancel = () => {
        if (homing?.type && homing.type !== "all") {
            onCancelHome?.(homing.type);
        } else {
            onCancelHome?.();
        }
    };

    return (
        <>
            <ControlSection
                title={sectionTitle}
                icon={icon}
                collapsible={collapsible}
                defaultExpanded={defaultExpanded}
            >
                <div className="flex flex-col gap-2">
                    <div
                        className="flex items-center justify-between text-xs mb-1"
                        style={{ color: theme.palette.text.secondary }}
                    >
                        <span>Current position</span>
                        <div className="flex items-center gap-1.5">
                            {onHomeAll && (
                                <button
                                    onClick={handleRequestHomeAll}
                                    disabled={locked}
                                    className={`text-xs px-2 py-0.5 rounded transition-colors ${
                                        locked
                                            ? "bg-blue-600/50 text-white/50 cursor-not-allowed"
                                            : "bg-blue-600 hover:bg-blue-700 text-white"
                                    }`}
                                >
                                    {isHoming && homing?.type === "all" ? (
                                        <span className="flex items-center gap-1">
                                            <CircularProgress size={10} color="inherit" />
                                            Homing...
                                        </span>
                                    ) : (
                                        "Home all"
                                    )}
                                </button>
                            )}
                            {isHoming && onCancelHome && (
                                <button
                                    onClick={handleCancel}
                                    className="text-xs px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {axes.map((axis) => (
                            <div
                                key={axis.axis}
                                className={`flex items-center justify-between rounded-lg p-2 border shadow-sm dark:shadow-none transition-colors ${
                                    isHoming
                                        ? "border-slate-700/50 bg-slate-800/40 opacity-60"
                                        : "border-gray-200 dark:border-slate-700/30 bg-white dark:bg-slate-800/20"
                                }`}
                            >
                                {/* Modified to use DigitalDisplay */}
                                <div className="flex items-center gap-3">
                                    <DigitalDisplay
                                        label={axis.label}
                                        value={axis.current}
                                        unit={axis.unit ?? "mm"}
                                        minWidth={80}
                                        active={axis.active}
                                    />
                                </div>

                                {onHomeAxis && (
                                    <Tooltip title={`Home ${axis.label}`} arrow placement="left">
                                        <span>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleRequestHomeAxis(axis.axis)}
                                                disabled={locked}
                                                sx={{
                                                    padding: "4px",
                                                    color: locked
                                                        ? theme.palette.text.disabled
                                                        : theme.palette.text.secondary,
                                                    "&:hover": { color: theme.palette.primary.main }
                                                }}
                                            >
                                                {isHoming && homing?.type === axis.axis ? (
                                                    <CircularProgress size={18} color="inherit" />
                                                ) : (
                                                    <HomeRoundedIcon fontSize="small" />
                                                )}
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </ControlSection>

            <Dialog
                open={open}
                onClose={handleClose}
                aria-labelledby="alert-dialog-title"
                aria-describedby="alert-dialog-description"
            >
                <DialogTitle id="alert-dialog-title">
                    {"Check home"}
                </DialogTitle>
                <DialogContent>
                    <Typography>
                        {pendingAxis
                            ? `Would you like to start ${pendingAxis} homing?`
                            : "Would you like to start full motion homing?"}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose} color="inherit">
                        No
                    </Button>
                    <Button onClick={handleConfirm} autoFocus color="primary">
                        Yes
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
