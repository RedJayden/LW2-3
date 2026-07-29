/**
 * @file logger.ts
 * @brief 시스템 전역 Logger 유틸리티 (Facade Pattern)
 * @details
 *  - logStore.addLog를 래핑하여, 프론트엔드 어디서든 간편하게 호출 가능.
 *  - 브라우저 console에도 동시 출력하여 개발 편의성 유지.
 *  - 백엔드 C++ LogManager로의 IPC 전송은 logStore 내부에서 자동 처리.
 */
import useLogStore from "@/store/logStore";
import type { LogLevel } from "@/store/logStore";

/**
 * @brief 시스템 전역 로거 객체
 * @details 각 메서드(info, warn, error, debug)를 통해 로그 레벨별 기록 수행.
 *
 * @example
 *   import { logger } from "@/utils/logger";
 *   logger.info("UI", "Button clicked");
 *   logger.error("HW", "Connection lost");
 */
export const logger = {
  /**
   * @brief INFO 레벨 로그 기록
   * @param source 로그 발생 원천 (예: "UI", "HW", "System")
   * @param message 로그 메시지
   */
  info: (source: string, message: string) => {
    console.log(`[INFO][${source}] ${message}`);
    useLogStore.getState().addLog("info", source, message);
  },

  /**
   * @brief WARN 레벨 로그 기록
   * @param source 로그 발생 원천
   * @param message 로그 메시지
   */
  warn: (source: string, message: string) => {
    console.warn(`[WARN][${source}] ${message}`);
    useLogStore.getState().addLog("warn", source, message);
  },

  /**
   * @brief ERROR 레벨 로그 기록
   * @param source 로그 발생 원천
   * @param message 로그 메시지
   */
  error: (source: string, message: string) => {
    console.error(`[ERROR][${source}] ${message}`);
    useLogStore.getState().addLog("error", source, message);
  },

  /**
   * @brief DEBUG 레벨 로그 기록
   * @param source 로그 발생 원천
   * @param message 로그 메시지
   */
  debug: (source: string, message: string) => {
    console.debug(`[DEBUG][${source}] ${message}`);
    useLogStore.getState().addLog("debug", source, message);
  },
};

export default logger;
