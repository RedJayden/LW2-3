/**
 * @file scheduler.ts
 * @brief 커맨드 실행을 지연·병합하기 위한 스케줄러 유틸리티를 제공한다.
 */

/**
 * @brief 디바운스 방식으로 마지막 값만 실행하는 스케줄러.
 * @tparam T 스케줄링하는 데이터 타입
 */
export class DebounceScheduler<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastValue: T | null = null;

  constructor(
    private readonly delayMs: number,
    private readonly executor: (value: T) => void | Promise<void>
  ) { }

  /**
   * @brief 새 값을 스케줄링한다.
   * @param value 실행할 값
   */
  schedule(value: T): void {
    this.lastValue = value;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      if (this.lastValue !== null) {
        void this.executor(this.lastValue);
      }
      this.timer = null;
      this.lastValue = null;
    }, this.delayMs);
  }

  /**
   * @brief 대기 중인 작업을 즉시 실행한다.
   */
  flush(): void {
    if (this.lastValue === null) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    void this.executor(this.lastValue);
    this.timer = null;
    this.lastValue = null;
  }

  /**
   * @brief 내부 타이머를 취소하고 상태를 초기화한다.
   */
  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = null;
    this.lastValue = null;
  }
}

/**
 * @brief 키별로 독립적인 디바운스를 수행하는 스케줄러.
 * @tparam TKey 키 타입
 * @tparam TValue 값 타입
 */
export class KeyedDebounceScheduler<TKey, TValue> {
  private readonly timers = new Map<TKey, ReturnType<typeof setTimeout>>();
  private readonly lastValues = new Map<TKey, TValue>();

  constructor(
    private readonly delayMs: number,
    private readonly executor: (key: TKey, value: TValue) => void | Promise<void>
  ) { }

  /**
   * @brief 특정 키에 대한 실행을 스케줄링한다.
   * @param key 식별자
   * @param value 실행에 사용할 값
   */
  schedule(key: TKey, value: TValue): void {
    this.lastValues.set(key, value);
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
    }
    const newTimer = setTimeout(() => {
      this.execute(key);
    }, this.delayMs);
    this.timers.set(key, newTimer);
  }

  /**
   * @brief 특정 키에 대기 중인 명령을 즉시 실행한다.
   * @param key 식별자
   */
  flush(key: TKey): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
    }
    this.execute(key);
  }

  /**
   * @brief 특정 키의 대기 상태를 취소한다.
   * @param key 식별자
   */
  cancel(key: TKey): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
    }
    this.timers.delete(key);
    this.lastValues.delete(key);
  }

  /**
   * @brief 모든 키의 스케줄을 해제한다.
   */
  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.lastValues.clear();
  }

  private execute(key: TKey): void {
    const value = this.lastValues.get(key);
    if (value === undefined) {
      return;
    }
    this.lastValues.delete(key);
    this.timers.delete(key);
    void this.executor(key, value);
  }
}
