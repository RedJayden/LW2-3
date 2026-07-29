import type { ITransport } from "../../core/ipc/ITransport";
import { Channels } from "../../core/ipc/channels.gen";

export class MockTransport implements ITransport {
  private handlers = new Map<string, ((p: any) => void)[]>();

  async send(channel: string, payload?: any) {
    if (channel === "hw/jog") return { ok: true };
    if (channel === "hw/jog/stop") return { ok: true };
    if (channel === "hw/light") return { ok: true };
    if (channel === "hw/init") return { ok: true };
    if (channel === "app/openMain") return { ok: true };

    // [NEW] Mock Dialogs for Localhost
    if (channel === Channels.cmd_dialog_openImage) {
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = payload?.extensions || "image/*";
        input.onchange = (e: any) => {
          const file = e.target.files[0];
          if (!file) {
            resolve({ ok: false, message: "Canceled" });
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              ok: true,
              data: reader.result as string,
              path: file.name
            });
          };
          reader.readAsDataURL(file);
        };
        input.click();
      });
    }

    if (channel === Channels.cmd_dialog_saveImage) {
      const { data, fileName } = payload || {};
      if (!data) return { ok: false, message: "No data" };
      const a = document.createElement("a");
      a.href = data;
      a.download = fileName || "snapshot.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return { ok: true };
    }

    if (channel === "cmd.dialog.saveRecipeFile") {
      const { data, fileName } = payload || {};
      if (!data) return { ok: false, message: "No data" };

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileName || "project_recipe.lng",
            types: [{
              description: 'Laser Project File',
              accept: { 'text/plain': ['.lng'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(data);
          await writable.close();
          return { ok: true };
        } catch (err: any) {
          if (err.name === 'AbortError') {
            throw new Error("Canceled"); // Let it be caught or handled
          }
          console.error(err);
        }
      }

      // Fallback
      const blob = new Blob([data], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "project_recipe.lng";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { ok: true };
    }

    // [NEW] Mock Calibration (localStorage persistence)
    // Keys:
    // mock_calib_current_<profile> -> CalibrationData
    // mock_calib_history_<profile> -> List of { filename, ...summary } (Index)
    // mock_calib_file_<profile>_<filename> -> CalibrationData

    if (channel === Channels.cmd_calibration_load) {
      const { profile } = payload;
      const key = `mock_calib_current_${profile}`;
      const saved = localStorage.getItem(key);
      return { ok: true, data: saved ? JSON.parse(saved) : null };
    }

    if (channel === Channels.cmd_calibration_save) {
      const { profile, data } = payload;
      const ts = new Date();
      const filename = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}${String(ts.getSeconds()).padStart(2, '0')}_calib.json`;

      // 1. Save Current (SSOT)
      localStorage.setItem(`mock_calib_current_${profile}`, JSON.stringify(data));

      // 2. Save History File
      localStorage.setItem(`mock_calib_file_${profile}_${filename}`, JSON.stringify(data));

      // 3. Update Index
      const indexKey = `mock_calib_history_${profile}`;
      const indexStr = localStorage.getItem(indexKey);
      const index = indexStr ? JSON.parse(indexStr) : [];

      // Summary for index
      const summary = {
        filename,
        timestamp: data.meta?.timestamp || ts.toISOString(),
        operator: data.meta?.operator || "Unknown",
        rms: data.calibration?.rms || 0, // Mock RMS
        pass: true // Mock Pass
      };

      // Prepend new history (latest first)
      index.unshift(summary);
      if (index.length > 20) index.pop(); // Keep last 20
      localStorage.setItem(indexKey, JSON.stringify(index));

      return { ok: true };
    }

    if (channel === Channels.cmd_calibration_list) {
      const { profile } = payload;
      const indexKey = `mock_calib_history_${profile}`;
      const indexStr = localStorage.getItem(indexKey);
      return { ok: true, list: indexStr ? JSON.parse(indexStr) : [] };
    }

    if (channel === Channels.cmd_calibration_rollback) {
      const { profile, filename } = payload;
      const fileKey = `mock_calib_file_${profile}_${filename}`;
      const dataStr = localStorage.getItem(fileKey);

      if (!dataStr) return { ok: false, message: "History file not found" };

      // Overwrite current
      localStorage.setItem(`mock_calib_current_${profile}`, dataStr);

      // Add rollback record to history? 
      // User said: "history에 'rollback 이벤트'로 새 스냅샷도 남김"
      // Simplest way is just to leave it as overwriting current.
      // Or we can duplicate the history entry. Let's keep it simple for mock.

      return { ok: true };
    }

    if (channel === Channels.cmd_calibration_delete) {
      const { profile, filename } = payload;

      // 1. Remove file
      const fileKey = `mock_calib_file_${profile}_${filename}`;
      localStorage.removeItem(fileKey);

      // 2. Update Index
      const indexKey = `mock_calib_history_${profile}`;
      const indexStr = localStorage.getItem(indexKey);
      if (indexStr) {
        const list = JSON.parse(indexStr) as any[];
        const newList = list.filter((item: any) => item.filename !== filename);
        localStorage.setItem(indexKey, JSON.stringify(newList));
      }

      return { ok: true };
    }

    return { ok: true, echo: { channel, payload } };
  }
  on(channel: string, handler: (p: any) => void) {
    const list = this.handlers.get(channel) ?? [];
    list.push(handler);
    this.handlers.set(channel, list);
  }
  emit(channel: string, payload: any) {
    this.handlers.get(channel)?.forEach((h) => h(payload));
  }
}
