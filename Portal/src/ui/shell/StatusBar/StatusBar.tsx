/**
 * @file StatusBar.tsx
 * @brief 하단 상태 표시줄의 메인 컨테이너 컴포넌트
 * @details 앱 전역의 상태(알람, 통신 등)를 구독하여 배경색을 변경하고 하위 컴포넌트들을 배치한다.
 */
import { useTheme } from "@mui/material";
import MachineStateDisplay from "./MachineStateDisplay";
import JobContextDisplay from "./JobContextDisplay";
import CoordsSpeedDisplay from "./CoordsSpeedDisplay";
import FpsStatusDisplay from "./FpsStatusDisplay";
import NotificationLogQueue from "./NotificationLogQueue";
import useAppStore from "@/store/appStore";

export default function StatusBar() {
  const theme = useTheme();
  
  const commError = useAppStore(s => s.motion.commError);
  const sysNotification = useAppStore(s => s.notification);
  const state = useAppStore(s => s.motion.state);
  
  const upperState = state.toUpperCase();
  const isGlobalError = commError || sysNotification.type === 'error' || upperState.includes("ERROR") || upperState.includes("ALARM");

  return (
    <div 
      className={`col-span-3 grid grid-cols-subgrid h-full w-full text-gray-400 select-none relative transition-colors duration-300 overflow-hidden ${isGlobalError ? 'bg-red-900 animate-pulse text-white' : 'bg-[#1e1e1e]'}`}
      style={{
        borderTop: `1px solid ${theme.palette.divider}`
      }}
    >
        {/* Left & Center Section (Span 2 to leave RightPanel alone) */}
        <div className="col-span-2 flex items-center h-full px-2 overflow-hidden gap-1">
            <MachineStateDisplay />
            <JobContextDisplay />
            <div className="mx-1 border-l border-white/10 h-4" />
            <CoordsSpeedDisplay />
            <div className="mx-1 border-l border-white/10 h-4" />
            <FpsStatusDisplay />
        </div>

        {/* Right Section (Matches RightPanel width exactly via subgrid) */}
        <div className="col-start-3 flex flex-row items-center h-full border-l border-white/10">
            <NotificationLogQueue />
        </div>
    </div>
  );
}
