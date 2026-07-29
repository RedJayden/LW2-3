/**
 * @file LightControlCard.tsx
 * @brief Defines the light environment control card.
 */
import { Slider, Switch, useTheme, Input, InputAdornment } from "@mui/material";
import type { ControlSectionProps } from "./ControlPanel";
import { ControlSection } from "./ControlPanel";

export type LightChannel = {
    id: number;
    label: string;
    value: number;
    isOn: boolean;
};

export type LightControlCardProps = {
    sectionTitle: string;
    channels: LightChannel[];
    onChange: (id: number, value: number) => void;
    onCommit?: (id: number, value: number) => void;
    onToggle?: (id: number, isOn: boolean) => void;
    icon?: ControlSectionProps["icon"];
    collapsible?: boolean;
    defaultExpanded?: boolean;
    onToggleExpand?: ControlSectionProps["onToggle"];
    onSave?: () => void;
    onReload?: () => void;
};

/**
 * @brief Renders the light channel controls.
 */
export function LightControlCard({
    sectionTitle,
    channels,
    onChange,
    onCommit,
    onToggle,
    icon,
    collapsible = true,
    defaultExpanded = true,
    onToggleExpand,
    onSave,
    onReload,
}: LightControlCardProps) {
    const theme = useTheme();

    const handleInputChange = (
        id: number,
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const val = Number(event.target.value);
        if (!isNaN(val)) {
            // Clamp between 0 and 100, floor to remove decimals
            const clamped = Math.min(Math.max(Math.floor(val), 0), 100);
            onChange(id, clamped);
            onCommit?.(id, clamped);
        }
    };

    return (
        <ControlSection
            title={sectionTitle}
            icon={icon}
            collapsible={collapsible}
            defaultExpanded={defaultExpanded}
            onToggle={onToggleExpand}
            actions={
                <div className="flex gap-1">
                    {onReload && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onReload();
                            }}
                            className="text-xs px-2 py-0.5 rounded bg-slate-600 hover:bg-slate-700 text-white transition-colors"
                        >
                            Reload
                        </button>
                    )}
                    {onSave && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onSave();
                            }}
                            className="text-xs px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                        >
                            Save
                        </button>
                    )}
                </div>
            }
        >
            <div className="grid grid-cols-2 gap-4">
                {channels.map((channel) => (
                    <div key={channel.id} className="flex flex-col gap-1 p-2 border border-gray-200 dark:border-slate-700/30 rounded-lg bg-white dark:bg-slate-800/20 shadow-sm dark:shadow-none">
                        {/* Row 1: Label + Switch */}
                        <div
                            className="flex items-center justify-between text-xs"
                            style={{ color: theme.palette.text.secondary }}
                        >
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-700 dark:text-slate-300">{channel.label}</span>
                                <Switch
                                    size="small"
                                    checked={channel.isOn}
                                    onChange={(_, checked) => onToggle?.(channel.id, checked)}
                                    sx={{ transform: "scale(0.8)" }}
                                />
                            </div>
                            <span
                                style={{
                                    fontSize: "0.7rem",
                                    color: channel.isOn ? theme.palette.primary.main : theme.palette.text.disabled
                                }}
                            >
                                {channel.isOn ? "On" : "Off"}
                            </span>
                        </div>

                        {/* Row 2: Slider + Input */}
                        <div className="flex items-center gap-3">
                            <Slider
                                size="small"
                                value={channel.value}
                                disabled={!channel.isOn}
                                onChange={(_, value) =>
                                    typeof value === "number" && onChange(channel.id, value)
                                }
                                onChangeCommitted={(_, value) =>
                                    typeof value === "number" && onCommit?.(channel.id, value)
                                }
                                sx={{
                                    flexGrow: 1,
                                    color: theme.palette.primary.main,
                                    "& .MuiSlider-thumb": {
                                        width: 12,
                                        height: 12,
                                        transition: '0.2s cubic-bezier(.47,1.64,.41,.8)',
                                        "&:before": { boxShadow: "0 2px 12px 0 rgba(0,0,0,0.4)" },
                                        "&:hover, &.Mui-focusVisible": {
                                            boxShadow: `0px 0px 0px 8px ${theme.palette.primary.main}16`
                                        },
                                        "&.Mui-active": { width: 14, height: 14 }
                                    },
                                    "& .MuiSlider-rail": { opacity: 0.2 },
                                }}
                            />
                            <Input
                                value={channel.value}
                                size="small"
                                disabled={!channel.isOn}
                                onChange={(e) =>
                                    handleInputChange(
                                        channel.id,
                                        e as React.ChangeEvent<HTMLInputElement>
                                    )
                                }
                                endAdornment={
                                    <InputAdornment position="end">
                                        <span className="text-[10px]" style={{ color: theme.palette.text.secondary }}>%</span>
                                    </InputAdornment>
                                }
                                inputProps={{
                                    step: 1,
                                    min: 0,
                                    max: 100,
                                    type: "number",
                                    style: {
                                        textAlign: "right",
                                        padding: 0,
                                        width: "50px",
                                        fontSize: "12px",
                                        fontWeight: 600,
                                    },
                                }}
                                disableUnderline
                                sx={{
                                    "& .MuiInputBase-input": { color: theme.palette.text.primary },
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </ControlSection>
    );
}
