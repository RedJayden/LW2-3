
export type EventMap = {
  "init/progress": { step: number; total: number; message: string };
  "hw/status": { key: string; value: unknown };
  "gcode/upload-progress": number;
  "scanner/status": string;
  "scanner/progress": number;
  "scanner/markpass": { cur: number; total: number; color: string };
  "gcode/status": string;
};
type Listener<T> = (payload: T) => void;
export class EventBus<M extends Record<string, any>> {
  private map = new Map<keyof M, Set<Function>>();
  on<K extends keyof M>(key: K, fn: Listener<M[K]>) {
    if (!this.map.has(key)) this.map.set(key, new Set());
    this.map.get(key)!.add(fn);
    return () => this.map.get(key)!.delete(fn);
  }
  emit<K extends keyof M>(key: K, payload: M[K]) {
    this.map.get(key)?.forEach(fn => (fn as Listener<M[K]>)(payload));
  }
}
export const bus = new EventBus<EventMap>();
