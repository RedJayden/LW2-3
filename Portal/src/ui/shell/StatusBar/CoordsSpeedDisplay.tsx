/**
 * @file CoordsSpeedDisplay.tsx
 * @brief 현재 좌표 및 조그 이동 속도를 표시하는 컴포넌트
 * @details 좌표 또는 속도 영역 클릭 시 우측의 모션 제어 패널을 열어 사용자 편의성을 제공합니다.
 */
import useAppStore from "@/store/appStore";

export default function CoordsSpeedDisplay() {
  const positions = useAppStore(s => s.positions);
  const speed = useAppStore(s => s.jog.speed);
  const setRightPanelOpen = useAppStore(s => s.setRightPanelOpen);
  const setParameterView = useAppStore(s => s.setParameterView);
  
  /**
   * @brief 좌표 영역 클릭 핸들러
   * @details 우측 패널을 열고 모션 축 정보 뷰로 이동합니다.
   */
  const handleCoordsClick = () => {
    setRightPanelOpen(true);
    setParameterView('motion-axis');
  };

  /**
   * @brief 속도 영역 클릭 핸들러
   * @details 우측 패널을 열고 이동 속도(Move Speed) 뷰로 이동합니다.
   */
  const handleSpeedClick = () => {
    setRightPanelOpen(true);
    setParameterView('motion-speed');
  };

  return (
    <div className="flex items-center space-x-3 px-3 text-xs font-mono text-gray-400 whitespace-nowrap h-full">
      <span 
        className="flex items-center cursor-pointer hover:text-white hover:bg-white/10 h-full px-2 transition-colors" 
        onClick={handleCoordsClick}
        title="포지션 설정 열기"
      >
        X:{positions.X?.toFixed(3)} Y:{positions.Y?.toFixed(3)} Z:{positions.Z?.toFixed(3)}
      </span>
      <span className="border-l border-white/20 h-4" />
      <span 
        className="flex items-center cursor-pointer hover:text-white hover:bg-white/10 h-full px-2 transition-colors" 
        onClick={handleSpeedClick}
        title="조그/속도 설정 열기"
      >
        speed:{speed.toUpperCase()}
      </span>
    </div>
  );
}
