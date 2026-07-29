/**
 * @file CameraStream.tsx
 * @brief http://app/camera/frame?id=<0|1> 단일 JPEG 폴링 뷰어 (Canvas Render Loop 최적화 버전)
 * @details
 *  - React State 병목 문제 해결을 위해 <canvas> 기반의 더블 버퍼링 기법 적용
 *  - GC(가비지 컬렉터) 스파이크(Stuttering) 방지를 위해 new Image() 객체 중복 생성 금지
 *  - requestAnimationFrame을 이용해 브라우저 렌더링 주기와 프레임 동기화
 */

import type React from "react";
import { useEffect, useRef } from "react";
import { camFrameUrl } from "@/shared/endpoints";

export enum CameraId {
  Scanner = 0,
  Object = 1,
}

type Props = {
  id: CameraId;
  className?: string;
  style?: React.CSSProperties;
  /** 최초 프레임이 도착했을 때 한 번만 호출 */
  onFirstFrame?: () => void;
};

export function CameraStream({ id, className, style, onFirstFrame }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // onFirstFrame 콜백의 최신 값을 유지하기 위해 useRef 사용 (종속성 분리)
  const onFirstFrameRef = useRef(onFirstFrame);
  useEffect(() => {
    onFirstFrameRef.current = onFirstFrame;
  }, [onFirstFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isRunning = true;
    let isVisible = true;
    let firstFired = false;
    let tick = 0;
    let timeoutId: number | null = null;
    let observer: IntersectionObserver | null = null;

    let abortController = new AbortController();

    const fetchNextFrame = async () => {
      if (!isRunning) return;

      if (!isVisible) {
        // 화면 밖이면 100ms 대기 후 상태 재확인 (네트워크 트래픽 낭비 차단)
        timeoutId = window.setTimeout(fetchNextFrame, 100);
        return;
      }

      tick++;
      const base = camFrameUrl(id);
      const buster = Date.now().toString(36) + "-" + tick.toString(36);
      
      try {
        const response = await fetch(`${base}&_=${buster}`, {
          cache: "no-store",
          headers: { "Accept": "image/jpeg" },
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();
        
        // 메인 스레드 블로킹 없이 백그라운드 워커 스레드에서 JPEG 디코딩 (Stuttering의 핵심 원인 제거)
        const bitmap = await createImageBitmap(blob);
        
        if (!isRunning) return; // 디코딩 중 언마운트된 경우 방어

        // requestAnimationFrame을 통해 메인 렌더 스레드에 동기화시켜 부드럽게 드로우
        requestAnimationFrame(() => {
          if (!isRunning) return;

          const ctx = canvas.getContext("2d");
          if (ctx) {
            // 비디오 원본 해상도와 캔버스 내부 해상도 일치시켜 화질 보존
            if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
            }
            // 더블 버퍼링: 깜빡임 없이 즉시 덮어쓰기
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          }
          
          // 가비지 컬렉터(GC)에 맡기지 않고 GPU 텍스처 메모리 즉시 반환 (매우 중요)
          bitmap.close();

          if (!firstFired) {
            firstFired = true;
            onFirstFrameRef.current?.();
          }

          // 현재 렌더링이 완전히 마무리된 직후 안전하게 다음 프레임 요청 (Push Load 방식)
          fetchNextFrame();
        });

      } catch (err: any) {
        if (!isRunning) return;
        // AbortError가 아니면 서버/네트워크 에러 대기
        if (err.name !== 'AbortError') {
          timeoutId = window.setTimeout(fetchNextFrame, 200);
        }
      }
    };

    // Intersection Observer 연동 (부모 혹은 윈도우 뷰포트에 보일 때만 동작)
    observer = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.01 }
    );
    observer.observe(canvas);

    // 루프 시작점 (Kickstart)
    fetchNextFrame();

    // 클린업 함수: 컴포넌트 언마운트 혹은 id 변경 시 좀비 쓰레드 완전 차단
    return () => {
      isRunning = false;
      abortController.abort();
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (observer) observer.disconnect();
    };
  }, [id]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      draggable={false}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "fill", // 기존 UI에서 크기를 어떻게 잡고있을지에 따라 달라지나 fill이나 contain 주로 사용
        display: "block",
        ...style,
      }}
    />
  );
}
