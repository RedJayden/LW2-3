// Main.tsx
import { useEffect, useState } from "react";
import CameraView from "../shell/CameraView";

export default function MainPage() {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <CameraView />
    </div>
  );
}
