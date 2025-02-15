/**
 * @param callback Same as setInterval
 * @param interval Same as setInterval
 * @param maxTimeout If the interval is running for more than maxTimeout, it will be stopped
 * @returns A function that can be called to cancel the interval
 */
export const cancellableInterval = (
  callback: CallableFunction,
  interval: number,
  maxTimeout?: number
): (() => void) => {
  let timeoutId: ReturnType<typeof setInterval>
  let lastTime = performance.now()
  const intervalFn = () => {
    const now = performance.now()
    if (maxTimeout && now - lastTime > maxTimeout) {
      clearInterval(timeoutId)
      return
    }
    lastTime = now
    callback()
  }
  timeoutId = setInterval(intervalFn, interval)
  return () => {
    clearInterval(timeoutId)
  }
}

/**
 * @param callback Same as setTimeout
 * @param timeout Same as setTimeout
 * @returns A function that can be called to cancel the timeout
 */
export const cancellableTimeout = (
  callback: CallableFunction,
  timeout: number
): (() => void) => {
  let cancelled = false
  const timeoutFn = () => {
    if (cancelled) {
      return
    }
    callback()
  }
  const timeoutId = setTimeout(timeoutFn, timeout)
  return () => {
    clearTimeout(timeoutId)
    cancelled = true
  }
}
