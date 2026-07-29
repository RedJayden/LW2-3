/**
 * @file ITransport.ts
 * @brief Portal <-> Native (CEF/MFC) 통신 인터페이스 정의
 * @details
 *  - `send`: 비동기 요청/응답형 IPC
 *  - `on`: 이벤트 구독형 IPC
 */
export interface ITransport {
  /**
   * @brief 네이티브로 비동기 요청 전송
   * @param channel 채널명 ("camera/start" 등)
   * @param payload 전송할 데이터 (객체 or 원시값)
   * @returns Promise로 응답 반환 (네이티브에서 Resolve/Reject 처리)
   */
  send(channel: string, payload?: any): Promise<any>;

  /**
   * @brief 네이티브에서 오는 이벤트 구독
   * @param channel 이벤트 채널명 ("log/message" 등)
   * @param handler 이벤트 핸들러
   */
  on(channel: string, handler: (payload: any) => void): void;
}
