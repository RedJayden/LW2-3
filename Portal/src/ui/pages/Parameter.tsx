import React from "react";
import useAppStore, { selectors } from "../../store/appStore";
import { CameraParameterForm } from "./Parameter/CameraParameterForm";
import { MotionParameterForm } from "./Parameter/MotionParameterForm";
import { MoonsParameterForm } from "./Parameter/MoonsParameterForm";
import LightPage from "./Parameter/Light/LightPage";
import { LaserParameterForm } from "./Parameter/LaserParameterForm";
import { ScannerParameterForm } from "./Parameter/ScannerParameterForm";

export default function ParameterPage() {
  const parameterView = useAppStore(selectors.parameterView);

  return (
    <div className="h-full w-full bg-gray-50 dark:bg-[#0F0F0F] overflow-hidden">
      {!parameterView && (
        <div className="h-full flex items-center justify-center text-gray-500 font-mono animate-pulse">
          Select a parameter category to configure...
        </div>
      )}

      {parameterView === 'motion-axis' && <MotionParameterForm view="axis" />}
      {parameterView === 'motion-speed' && <MotionParameterForm view="speed" />}

      {parameterView === 'motion-lens' && <MoonsParameterForm view="lens" />}
      {parameterView === 'motion-mirror' && <MoonsParameterForm view="mirror" />}

      {parameterView === 'motion' && (
        <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-500">
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-400 mb-2">Motion Setting</h3>
            <p className="text-sm">Select a sub-category from the left menu.</p>
          </div>
        </div>
      )}

      {/* Pass configId: 1 for Scanner, 2 for Object */}
      {parameterView === 'scanCam' && <CameraParameterForm configId={1} />}
      {parameterView === 'objectCam' && <CameraParameterForm configId={2} />}

      {parameterView === 'lights' && <LightPage />}

      {parameterView === 'laser' && <LaserParameterForm />}
      {parameterView === 'scanner' && <ScannerParameterForm />}
    </div>
  );
}
