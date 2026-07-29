/**
 * @file MachineStateDisplay.tsx
 * @brief 장비의 현재 모션 상태(READY, RUN, ERROR 등)를 표시하는 하단바 컴포넌트
 * @details 에러 발생 시 빨간색 점멸(`animate-pulse`)을 통해 사용자에게 즉각적인 경고를 제공한다.
 */
import useAppStore from "@/store/appStore";

export default function MachineStateDisplay() {
  const state = useAppStore(s => s.motion.state);
  
  // READY, RUN, PAUSE, ERROR, HOMING
  const upperState = state.toUpperCase();
  
  let bgColor = "bg-gray-600";
  let textColor = "text-white";
  let dotColor = "bg-gray-400";
  let pulse = false;

  if (upperState.includes("ERROR") || upperState.includes("ALARM")) {
    bgColor = "bg-red-600";
    dotColor = "bg-white";
    pulse = true;
  } else if (upperState.includes("RUN")) {
    bgColor = "bg-blue-600";
    dotColor = "bg-blue-200";
  } else if (upperState.includes("READY")) {
    bgColor = "bg-green-600";
    dotColor = "bg-green-200";
  } else if (upperState.includes("PAUSE") || upperState.includes("STOP")) {
    bgColor = "bg-yellow-600";
    dotColor = "bg-yellow-200";
  }

  return (
    <div className={`flex items-center px-3 h-full ${bgColor} ${textColor} text-xs font-bold ${pulse ? 'animate-pulse' : ''} cursor-pointer transition-colors hover:brightness-110`}>
      <span className={`w-2 h-2 rounded-full ${dotColor} mr-2`} />
      {upperState}
    </div>
  );
}
