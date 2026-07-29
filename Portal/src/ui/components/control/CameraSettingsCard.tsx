
/**
 * @file CameraSettingsCard.tsx
 * @brief 카메라 설정(노출/게인) 슬라이더 카드 + 접힘/펼침 토글
 * @details
 *  - 디자인 패턴: Presentational + Stateful Collapsible
 *  - 헤더 클릭/키보드로 접힘/펼침
 *  - (선택) persistKey로 localStorage에 열림 상태를 기억
 */

import { memo, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Slider, useTheme, Input, InputAdornment } from "@mui/material";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { ControlSection } from "./ControlPanel";

export type CameraSettingField = {
    key: string;
    label?: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    showApply?: boolean; // 현재는 미사용(상위에서 디바운스로 처리)
};

export interface CameraSettingsCardProps {
    sectionTitle: string;
    fields: CameraSettingField[];
    onChange: (key: string, value: number) => void;
    onApply?: (key: string) => void;
    icon?: React.ReactNode;

    /** 접힘/펼침 옵션 */
    collapsible?: boolean;
    defaultOpen?: boolean;
    persistKey?: string; // e.g. "rightpanel.camera"
    onSave?: () => void;
    onReload?: () => void;
}

/** @brief key → Fallback 라벨 */
const toTitle = (k: string) =>
    k.replace(/[_\-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

/** @brief 값 포맷 */
const fmtVal = (v: number, unit?: string) => (unit ? `${Math.floor(v)} ${unit}` : `${Math.floor(v)}`);

const BufferedInput = ({
    value,
    min,
    max,
    step,
    unit,
    onChange,
    theme,
}: {
    value: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    onChange: (val: number) => void;
    theme: any;
}) => {
    const [localVal, setLocalVal] = useState(Math.floor(value).toString());
    const [focused, setFocused] = useState(false);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Clear debounce on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    useEffect(() => {
        if (!focused) {
            setLocalVal(Math.floor(value).toString());
        }
    }, [value, focused]);

    const handleCommit = () => {
        let v = parseFloat(localVal);
        if (isNaN(v)) {
            v = value;
        } else {
            v = Math.min(Math.max(Math.floor(v), min), max);
        }
        setLocalVal(v.toString());
        onChange(v);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
        }
    };

    return (
        <Input
            value={localVal}
            size="small"
            onChange={(e) => {
                setLocalVal(e.target.value);
            }}
            onFocus={() => {
                setFocused(true);
                setLocalVal(Math.floor(value).toString());
            }}
            onBlur={() => {
                setFocused(false);
                if (debounceRef.current) clearTimeout(debounceRef.current);
                handleCommit();
            }}
            onKeyDown={handleKeyDown}
            endAdornment={
                <InputAdornment position="end">
                    <span
                        className="text-[10px]"
                        style={{ color: theme.palette.text.secondary }}
                    >
                        {unit}
                    </span>
                </InputAdornment>
            }
            inputProps={{
                step: step,
                type: "text", // Changed to text to avoid browser spin-button/step interference
                style: {
                    textAlign: "right",
                    padding: 0,
                    width: "75px",
                    fontSize: "12px",
                    fontWeight: 700,
                },
            }}
            disableUnderline
            sx={{
                "& .MuiInputBase-input": { color: theme.palette.text.primary },
            }}
        />
    );
};

export const CameraSettingsCard = memo(function CameraSettingsCard({
    sectionTitle,
    fields,
    onChange,
    onApply,
    icon,
    collapsible = true,
    defaultOpen = true,
    persistKey,
    onSave,
    onReload,
}: CameraSettingsCardProps) {
    const theme = useTheme();
    // ---- 열림 상태 (localStorage 기억 지원) ----
    // [MOD] Forced to false based on user request: "Default should be Hide"
    // To strictly follow this, we ignore persistence if the user wants it hidden by default every time.
    const [open, setOpen] = useState<boolean>(false);

    useEffect(() => {
        if (!persistKey) return;
        try {
            localStorage.setItem(persistKey, open ? "1" : "0");
        } catch {
            /* ignore */
        }
    }, [open, persistKey]);

    // ---- 렌더 ----
    return (
        <ControlSection
            title={sectionTitle}
            icon={icon ?? <TuneRoundedIcon fontSize="small" />}
            collapsible={collapsible}
            defaultExpanded={open}
            onToggle={(expanded) => {
                setOpen(expanded);
            }}
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
            <div className="flex flex-col gap-3">
                {fields.map((f) => {
                    const label = f.label || f.key;
                    return (
                        <div
                            key={f.key}
                            className="flex flex-col gap-2 p-3 border border-gray-200 dark:border-slate-700/40 rounded-xl bg-white dark:bg-slate-900/40 shadow-sm transition-all hover:border-blue-400 dark:hover:border-blue-500/50"
                        >
                            {/* 상단 행: 라벨 + 입력창/단위 */}
                            <div className="flex items-center justify-between">
                                <div
                                    className="text-[10px] font-bold tracking-wider uppercase opacity-70 flex-1 min-w-0 truncate mr-2"
                                    style={{ color: theme.palette.text.secondary }}
                                >
                                    {label}
                                </div>
                                <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-md px-2 py-0.5 border border-transparent focus-within:border-blue-500/50 transition-all">
                                    <BufferedInput
                                        value={f.value}
                                        min={f.min}
                                        max={f.max}
                                        step={f.step ?? 1}
                                        unit={undefined} // unit은 아래에서 별도로 표시하거나 InputAdornment로 처리
                                        onChange={(v) => onChange(f.key, v)}
                                        theme={theme}
                                    />
                                    <span className="ml-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                                        {f.unit}
                                    </span>
                                </div>
                            </div>

                            {/* 하단 행: 슬라이더 */}
                            <div className="px-1">
                                <Slider
                                    value={f.value}
                                    min={f.min}
                                    max={f.max}
                                    step={f.step ?? 1}
                                    onChange={(_, v) =>
                                        onChange(f.key, Array.isArray(v) ? v[0] : v)
                                    }
                                    aria-label={label}
                                    size="small"
                                    sx={{
                                        display: "flex",
                                        py: 1,
                                        "& .MuiSlider-thumb": {
                                            width: 14,
                                            height: 14,
                                            backgroundColor: theme.palette.primary.main,
                                            border: `2px solid ${theme.palette.background.paper}`,
                                            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                                            "&:hover, &.Mui-focusVisible": {
                                                boxShadow: `0px 0px 0px 8px ${theme.palette.primary.main}16`,
                                            },
                                        },
                                        "& .MuiSlider-track": {
                                            height: 4,
                                            borderRadius: 2,
                                        },
                                        "& .MuiSlider-rail": {
                                            height: 4,
                                            borderRadius: 2,
                                            opacity: 0.15,
                                            backgroundColor: theme.palette.text.primary,
                                        },
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </ControlSection>
    );
});

export default CameraSettingsCard;

