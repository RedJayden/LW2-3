/**
 * @file FpsStatusDisplay.tsx
 * @brief 현재 선택된 카메라의 상태를 표시하는 하단바 컴포넌트
 * @details FPS, 노출(Exposure), 게인(Gain) 정보를 표시하고, 클릭 시 우측 패널의 카메라 설정 창을 엽니다.
 */
import useAppStore from "@/store/appStore";
import { useCameraFps } from "@/ui/hooks/useCameraFps";
import { useEffect, useState } from "react";
import { hwFacade } from "@/services/HardwareFacade";

export default function FpsStatusDisplay() {
  const currentId = useAppStore(s => s.currentCameraId);
  const currentCam = useAppStore(s => s.cameras[s.currentCameraId]);
  const cameraKind = useAppStore(s => s.cameraKind);
  const objectMag = useAppStore(s => s.objectMag);
  const fps = useCameraFps(currentId);
  const setRightPanelOpen = useAppStore(s => s.setRightPanelOpen);
  const setParameterView = useAppStore(s => s.setParameterView);
  
  const [hasCamera, setHasCamera] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await hwFacade.getRanges(currentId);
        if (!cancelled && r && typeof r.connected === 'boolean') {
            setHasCamera(r.connected);
        }
      } catch { /* no-op */ }
    })();
    return () => { cancelled = true; };
  }, [currentId]);

  /**
   * @brief 카메라 상태 영역 클릭 이벤트 핸들러
   * @details 우측 패널을 열고, 현재 카메라 모드에 맞는 설정 뷰(scanCam 또는 objectCam)로 이동한다.
   */
  const handleClick = () => {
    setRightPanelOpen(true);
    setParameterView(cameraKind === 'scanner' ? 'scanCam' : 'objectCam');
  };

  const camName = cameraKind === 'object' ? `Object ${objectMag}` : 'Scanner';

  return (
    <div 
      className="flex items-center px-4 text-xs font-mono text-gray-400 whitespace-nowrap hover:bg-white/10 hover:text-white transition-colors h-full cursor-pointer"
      onClick={handleClick}
      title="카메라 설정 열기"
    >
      {hasCamera ? (
          <span>
              {camName}, FPS: {fps.toFixed(1)} , exposure time : {currentCam?.exposure ?? '-'}, gain : {currentCam?.gain ?? '-'}
          </span>
      ) : (
          <span className="text-red-400 font-bold">NO CAM</span>
      )}
    </div>
  );
}
