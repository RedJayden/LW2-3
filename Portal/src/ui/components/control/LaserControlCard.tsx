/**
 * @file LaserControlCard.tsx
 * @brief 레이저 셔터 제어 컴포넌트 (RightPanel 삽입용)
 * @details Clean Code Principle: LaserParameterForm과 로직/디자인 연동 (State는 appStore로 분리)
 */
import { memo, useState } from "react";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import { ControlSection } from "./ControlPanel";
import { useAppStore } from "../../../store/appStore";
import { hwFacade } from "../../../services/HardwareFacade";

export const LaserControlCard = memo(function LaserControlCard() {
    const showToast = useAppStore(s => s.showToast);
    const laserShutter = useAppStore(s => s.laserShutter);
    const setLaserShutter = useAppStore(s => s.setLaserShutter);
    
    // 기본값은 숨김 처리(Hide)
    const [open, setOpen] = useState<boolean>(false);

    const handleShutterOn = async () => {
        try {
            setLaserShutter(true);
            await hwFacade.setLaserControl({ shutter: 1 });
            showToast("Laser Shutter ON", "success");
        } catch (err: any) {
            setLaserShutter(false);
            showToast("Failed to turn on Laser Shutter", "error");
        }
    };

    const handleShutterOff = async () => {
        try {
            setLaserShutter(false);
            await hwFacade.setLaserControl({ shutter: 2 });
            showToast("Laser Shutter OFF", "success");
        } catch (err: any) {
            setLaserShutter(true);
            showToast("Failed to turn off Laser Shutter", "error");
        }
    };

    return (
        <ControlSection
            title="Laser Shutter Control"
            icon={<BuildRoundedIcon fontSize="small" />}
            collapsible={true}
            defaultExpanded={open}
            onToggle={setOpen}
        >
            <div className="flex gap-4 p-2">
                <button
                    onClick={handleShutterOn}
                    className={`flex-1 h-10 text-sm font-bold rounded transition-all duration-300 ${
                        laserShutter === true
                            ? "bg-red-600 text-white shadow-[0_0_10px_-2px_rgba(220,38,38,0.5)] ring-1 ring-red-400 ring-offset-1 ring-offset-slate-900"
                            : "bg-transparent text-red-500 border border-red-500/30 hover:border-red-500 hover:bg-red-500/10"
                    }`}
                >
                    Laser Shutter ON
                </button>
                <button
                    onClick={handleShutterOff}
                    className={`flex-1 h-10 text-sm font-bold rounded transition-all duration-300 ${
                        laserShutter === false
                            ? "bg-slate-600 text-white shadow-[0_0_10px_-2px_rgba(71,85,105,0.5)] ring-1 ring-slate-400 ring-offset-1 ring-offset-slate-900"
                            : "bg-transparent text-slate-400 border border-slate-600/50 hover:border-slate-500 hover:bg-slate-600/20"
                    }`}
                >
                    Laser Shutter OFF
                </button>
            </div>
        </ControlSection>
    );
});

export default LaserControlCard;
