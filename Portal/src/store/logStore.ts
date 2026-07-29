import { create } from "zustand";
import { hwFacade } from "@/services/HardwareFacade";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string; // Unique ID for React keys
  timestamp: string; // Formatted time
  level: LogLevel;
  source: string; // Where the log came from (e.g., HW, UI, System)
  message: string;
}

const ADVANCED_MODE_KEY = 'lasernGrapn_advancedMode';

interface LogStore {
  isLogPanelOpen: boolean;
  logs: LogEntry[];
  /** 개발자/서비스 기술자 전용 모드. false면 SYSTEM CONSOLE은 열리지 않는다(일반 사용자에게는 숨김).
   *  로고를 5회 연속 클릭하면 켜고 끌 수 있으며(TitleBar.tsx), localStorage에 영속된다. */
  advancedMode: boolean;

  toggleLogPanel: (open?: boolean) => void;
  setAdvancedMode: (v: boolean) => void;
  addLog: (level: LogLevel, source: string, message: string) => void;
  /** C++ 백엔드에서 이미 기록된 로그(OutputDebugStringA 등)를 화면에만 추가한다.
   *  addLog와 달리 hwFacade.writeLog()로 되돌려 보내지 않는다(왕복 방지). */
  addNativeLog: (level: LogLevel, source: string, message: string) => void;
  clearLogs: () => void;
}

const formatTime = () => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const ms = d.getMilliseconds().toString().padStart(3, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
};

const getInitialAdvancedMode = (): boolean => {
  try {
    return localStorage.getItem(ADVANCED_MODE_KEY) === '1';
  } catch {
    return false;
  }
};

export const useLogStore = create<LogStore>((set, get) => ({
  isLogPanelOpen: false,
  logs: [],
  advancedMode: getInitialAdvancedMode(),

  toggleLogPanel: (open) => set((state) => {
      // 고급 모드가 아니면 SYSTEM CONSOLE 자체를 열지 않는다(일반 사용자에게는 완전히 숨김).
      if (!state.advancedMode) return {};
      return { isLogPanelOpen: open !== undefined ? open : !state.isLogPanelOpen };
  }),

  setAdvancedMode: (v) => {
      try { localStorage.setItem(ADVANCED_MODE_KEY, v ? '1' : '0'); } catch {}
      set({ advancedMode: v, isLogPanelOpen: v ? get().isLogPanelOpen : false });
  },

  addLog: (level, source, message) => {
      // Send to backend C++ Logger
      hwFacade.writeLog(level, source, message).catch((err) => {
        console.warn("Failed to write log to backend:", err);
      });

      set((state) => {
          const entry: LogEntry = {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: formatTime(),
              level,
              source,
              message
          };
          
          return { logs: [...state.logs, entry] };
      });
  },

  addNativeLog: (level, source, message) => {
      set((state) => {
          const entry: LogEntry = {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: formatTime(),
              level,
              source,
              message
          };

          return { logs: [...state.logs, entry] };
      });
  },

  clearLogs: () => set({ logs: [] })
}));

export default useLogStore;
