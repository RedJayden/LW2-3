/**
 * @brief 반도체 장비 상태 타입 정의
 */
export type EquipmentStatus = "IDLE" | "RUNNING" | "STOPPED" | "ERROR" | "WARNING";

/**
 * @brief 공정 데이터 인터페이스
 */
export interface ProcessData {
  id: string;
  timestamp: string;
  temperature: number;
  pressure: number;
  gasFlow: number;
  status: EquipmentStatus;
}

/**
 * @brief 웨이퍼 정보 인터페이스
 */
export interface WaferInfo {
  id: string;
  lotId: string;
  slotNumber: number;
  processProgress: number; // 0 to 100
  alerts: number;
}

/**
 * @brief 장비 실시간 파라미터
 */
export interface EquipmentParameters {
  power: number;
  vacuum: number;
  chamberTemp: number;
  laserOutput: number;
}
