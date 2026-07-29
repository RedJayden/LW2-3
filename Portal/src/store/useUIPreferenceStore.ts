import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * @file useUIPreferenceStore.ts
 * @brief UI 설정 및 상태 유지(Persistence)를 위한 Zustand 스토어
 * @details 디자인 패턴: Singleton Store(Zustand), Memento(Persistence via middleware)
 */

interface SubBarState {
  cameraMode: "scanner" | "object";
  canvasVisible: boolean;
  mag: "x20" | "x50";
}

interface UIPreferenceState {
  // 경로(path)별 마지막 사용된 우측 패널 탭
  lastRightPanelTab: Record<string, string>;
  // 경로(path)별 마지막 사용된 서브 바 상태
  lastSubBarState: Record<string, SubBarState>;

  // Actions
  /**
   * @brief 특정 경로의 우측 패널 탭을 저장한다.
   * @param path 현재 경로 (예: /main)
   * @param tab 탭 키 (예: motion)
   */
  setRightPanelTab: (path: string, tab: string) => void;

  /**
   * @brief 특정 경로의 서브 바 상태를 저장한다.
   * @param path 현재 경로
   * @param state 서브 바 상태 객체
   */
  setSubBarState: (path: string, state: Partial<SubBarState>) => void;

  /**
   * @brief 특정 경로의 저장된 상태를 가져온다. (없을 시 기본값 반환)
   * @param path 현재 경로
   */
  getRightPanelTab: (path: string, fallback: string) => string;
  getSubBarState: (path: string) => SubBarState;
}

const DEFAULT_SUBBAR_STATE: SubBarState = {
  cameraMode: "scanner",
  canvasVisible: false,
  mag: "x20",
};

export const useUIPreferenceStore = create<UIPreferenceState>()(
  persist(
    (set, get) => ({
      lastRightPanelTab: {},
      lastSubBarState: {},

      setRightPanelTab: (path, tab) =>
        set((state) => ({
          lastRightPanelTab: { ...state.lastRightPanelTab, [path.toLowerCase()]: tab },
        })),

      setSubBarState: (path, patch) =>
        set((state) => {
          const key = path.toLowerCase();
          const current = state.lastSubBarState[key] || { ...DEFAULT_SUBBAR_STATE };
          return {
            lastSubBarState: {
              ...state.lastSubBarState,
              [key]: { ...current, ...patch },
            },
          };
        }),

      getRightPanelTab: (path, fallback) => {
        return get().lastRightPanelTab[path.toLowerCase()] || fallback;
      },

      getSubBarState: (path) => {
        return get().lastSubBarState[path.toLowerCase()] || { ...DEFAULT_SUBBAR_STATE };
      },
    }),
    {
      name: "ui-preferences", // 로컬 스토리지 키 이름
    }
  )
);

export default useUIPreferenceStore;
