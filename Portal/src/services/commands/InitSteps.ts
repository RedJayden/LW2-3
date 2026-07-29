
import { IPipelineStep } from "../../core/patterns/pipeline";
import { bus } from "../../core/patterns/events";
import { useAppStore } from "../../store/appStore";
import { useCanvasStore } from "../../ui/pages/Recipe/Canvas/useCanvasStore";

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
export const InitSteps: IPipelineStep[] = [
  {
    title: "System Workspace Initializing", async run() {
      await useAppStore.getState().loadCameraConfig();
      await useAppStore.getState().loadRecipeCenterData();
      await useCanvasStore.getState().loadPresetLibraryData();
      await delay(200);
    }
  },
  { title: "Synchronizing Motion Controllers", async run() { await delay(300); } },
  { title: "Establishing Vision Interface", async run() { await delay(300); } },
  { title: "Configuring Illumination Modules", async run() { await delay(200); } },
  { title: "Finalizing System Readiness", async run() { await delay(400); } },
].map((s, i, arr) => ({
  ...s,
  async run() {
    await s.run();
    bus.emit("init/progress", { step: i + 1, total: arr.length, message: s.title });
  }
}));
