import type { ITransport } from "./ITransport";

/**
 * @class TransportCEF
 * @implements ITransport
 */
export class TransportCEF implements ITransport {
  send(channel: string, payload?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        // [7차 P3-2 2026-07-23] 대용량 payload의 직렬화 실패를 원인이 드러나는 에러로 변환.
        // Mark Times 100 사건에서 458만 커맨드의 단일 stringify(~500MB)가 V8 문자열 한계에서
        // RangeError로 터졌는데, 호출부에는 정보 없는 "Generation Failed"만 남았다.
        let request: string;
        try {
          request = JSON.stringify({ channel, payload });
        } catch (serErr) {
          const count = Array.isArray(payload?.commands) ? payload.commands.length : undefined;
          reject(new Error(
            `IPC payload too large to serialize (channel=${channel}` +
            (count !== undefined ? `, commands=${count}` : '') + `): ${String(serErr)}`
          ));
          return;
        }

        // window.cefQuery는 CEF에서 등록된 함수 (app_shell.cpp)
        if (window.cefQuery) {
          window.cefQuery({
            request,
            onSuccess: (response: string) => {
              try {
                resolve(response ? JSON.parse(response) : null);
              } catch {
                resolve(response);
              }
            },
            onFailure: (_code: number, msg: string) => reject(new Error(msg)),
          });
        } else {
          reject(new Error("window.cefQuery is not available"));
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  on(channel: string, handler: (payload: any) => void): void {
    // window.nativeEmit(channel, payload) 형태로 네이티브에서 이벤트를 전달
    if (!window.__ipcListeners) window.__ipcListeners = {};
    window.__ipcListeners[channel] = handler;
  }
}
