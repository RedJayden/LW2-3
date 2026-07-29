export function throttle<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
    options: { leading?: boolean; trailing?: boolean } = {}
): T {
    let context: any;
    let args: any;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let previous = 0;

    const { leading = true, trailing = true } = options;

    const later = function () {
        previous = leading === false ? 0 : Date.now();
        timeout = null;
        func.apply(context, args);
        if (!timeout) {
            context = args = null;
        }
    };

    const throttled = function (this: any, ..._args: any[]) {
        const now = Date.now();
        if (!previous && leading === false) previous = now;
        const remaining = wait - (now - previous);
        context = this;
        args = _args;

        if (remaining <= 0 || remaining > wait) {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            previous = now;
            func.apply(context, args);
            if (!timeout) context = args = null;
        } else if (!timeout && trailing !== false) {
            timeout = setTimeout(later, remaining);
        }
    };

    return throttled as unknown as T;
}
