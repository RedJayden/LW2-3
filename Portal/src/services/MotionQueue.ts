// src//services//MotionQueue.ts
/**
 * @file MotionQueue.ts
 * @brief REL/ABS Click-to-Move 순차 실행 큐
 * @details 디자인패턴: Command + Observer
 */

export type MotionTask = () => Promise<void>;

export class MotionQueue {
  private busy = false;
  private q: MotionTask[] = [];

  /** @brief 작업 추가 후 자동 실행 */
  enqueue(task: MotionTask) {
    this.q.push(task);
    this.pump();
  }

  /** @brief 현재 작업 유/무 */
  isBusy() {
    return this.busy;
  }

  /** @brief 내부 펌프 */
  private async pump() {
    if (this.busy) return;
    const next = this.q.shift();
    if (!next) return;
    this.busy = true;
    try {
      await next(); // hwFacade가 완료 Promise를 resolve 해야 함
    } finally {
      this.busy = false;
      // 다음 작업으로
      this.pump();
    }
  }

  /** @brief 큐 비우기 */
  clear() {
    this.q = [];
  }
}
