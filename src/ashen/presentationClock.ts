/** Pause presentation deadlines with the page, matching the Spine visibility clock. */
export function waitForPresentation(duration: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let remaining = Math.max(0, duration), started: number | null = null, timer = 0;
    const cleanup = () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibility);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => { cleanup(); reject(new DOMException('Presentation disposed', 'AbortError')); };
    const schedule = () => {
      if (document.hidden) return;
      started = performance.now();
      timer = window.setTimeout(() => {
        if (document.hidden) { visibility(); return; }
        cleanup(); resolve();
      }, remaining);
    };
    const visibility = () => {
      if (document.hidden) {
        clearTimeout(timer);
        if (started !== null) remaining = Math.max(0, remaining - (performance.now() - started));
        started = null;
      } else if (started === null) schedule();
    };
    if (signal.aborted) { abort(); return; }
    document.addEventListener('visibilitychange', visibility);
    signal.addEventListener('abort', abort, { once: true });
    schedule();
  });
}
