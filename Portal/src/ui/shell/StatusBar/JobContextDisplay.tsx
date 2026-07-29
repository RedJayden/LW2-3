/**
 * @file JobContextDisplay.tsx
 * @brief 현재 작업 컨텍스트(Mode, Process 등)를 표시하는 컴포넌트
 * @details 카메라 모드 및 프로세스 진행률 등을 화면 하단에 텍스트로 표시합니다.
 */
import useAppStore from "@/store/appStore";

export default function JobContextDisplay() {
  const cameraKind = useAppStore(s => s.cameraKind);
  const mag = useAppStore(s => s.objectMag);
  const processScanner = useAppStore(s => s.processStates.scanner);
  const processGCode = useAppStore(s => s.processStates.gcode);
  
  const isScannerRunning = processScanner.state === 'running';
  const isGCodeRunning = processGCode.state === 'running';
  
  const modeText = `Mode: ${cameraKind === 'object' ? `Object ${mag}` : 'Scanner'}`;

  return (
    <div className="flex items-center px-4 text-xs text-gray-400 font-medium whitespace-nowrap h-full min-w-[280px] gap-1">
      <span>{modeText}</span>
      {isScannerRunning && (
        <>
          <span className="text-white/20 mx-1">|</span>
          <span>Scanner Process</span>
          <span className="inline-block min-w-[55px] text-right font-mono text-cyan-400">
            ({processScanner.progress.toFixed(1)}%)
          </span>
        </>
      )}
      {isGCodeRunning && (
        <>
          <span className="text-white/20 mx-1">|</span>
          <span>GCode Job</span>
          <span className="inline-block min-w-[55px] text-right font-mono text-cyan-400">
            ({processGCode.progress.toFixed(1)}%)
          </span>
        </>
      )}
    </div>
  );
}
