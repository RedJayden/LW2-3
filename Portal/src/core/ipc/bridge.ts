import type { Envelope, Channel, ArgsMap, IpcVersion } from "./channels.gen";

declare global {
  interface Window {
    cefQuery?: (opt: {
      request: string;
      onSuccess: (resp: string) => void;
      onFailure: (code: number, msg: string) => void;
    }) => void;
    __ipcListeners?: Record<string, (payload: any) => void>;
  }
}

const IPC_VERSION: IpcVersion = "1.1.0";

export function callNative<C extends Channel>(channel: C, args: ArgsMap[C]) {
  if (!window.cefQuery) return Promise.reject(new Error("cefQuery not available"));
  const payload: Envelope<C> = { version: IPC_VERSION, channel, args };
  return new Promise<any>((resolve, reject) => {
    window.cefQuery!({
      request: JSON.stringify(payload),
      onSuccess: (resp) => {
        try { resolve(resp ? JSON.parse(resp) : undefined); }
        catch { resolve(undefined); }
      },
      onFailure: (_c, msg) => reject(new Error(msg))
    });
  });
}
