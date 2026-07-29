import { useEffect, useRef, useState } from "react";
import { camFps } from "@/shared/endpoints";

/**
 * @file useCameraFps.ts
 * @brief app://camera/fps?id=<id> 를 주기적으로 폴링해 FPS 표시
 * @details
 *  - 타임아웃(2s) + 지수 백오프(0.5 → 1 → 2 → 4 → 최대 5s)
 *  - 컴포넌트 언마운트 시 자동 중단
 */
export function useCameraFps(id: number) {
  const [fps, setFps] = useState(0);
  const aliveRef = useRef(true);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    retryRef.current = 0;

    const poll = async () => {
      const ctrl = new AbortController();
      const timeoutHandle = setTimeout(() => ctrl.abort(), 2000); // 2s

      try {
        const r = await fetch(camFps(id), {
          signal: ctrl.signal,
          headers: { "cache-control": "no-cache" },
        });
        clearTimeout(timeoutHandle);

        if (r.ok) {
          let value = 0;
          const ct = r.headers.get("content-type") || "";

          if (ct.includes("application/json")) {
            const j = await r.json();
            value = Number(j?.fps ?? 0);
          } else {
            const t = await r.text();
            value = Number(t) || 0;
          }

          if (aliveRef.current) {
            setFps(value);
          }
          retryRef.current = 0; // 성공 시 백오프 리셋
        } else {
          retryRef.current++;
        }
      } catch {
        clearTimeout(timeoutHandle);
        retryRef.current++;
      } finally {
        const base = 500;
        const delay = Math.min(5000, base * 2 ** retryRef.current);
        if (aliveRef.current) {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(poll, delay);
        }
      }
    };

    poll();

    return () => {
      aliveRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [id]);

  return fps;
}
