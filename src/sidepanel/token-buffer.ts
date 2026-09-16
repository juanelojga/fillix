export interface TokenBuffer {
  push(text: string): void;
  flush(): void;
  dispose(): void;
}

/**
 * Coalesces rapid token appends into at most one flush per `intervalMs`.
 *
 * Rendering markdown on every token means re-parsing a growing string ~1500 times
 * over a long answer; at high token rates that saturates the main thread. 60ms caps
 * it at ~17 renders/s while staying under the threshold where streaming stops
 * reading as live.
 *
 * Chunks are deltas, not the accumulated string, so a flush that lands after other
 * `activeMessage` updates (thinking, tool calls) still appends in the right order.
 */
export function createTokenBuffer(onFlush: (chunk: string) => void, intervalMs = 60): TokenBuffer {
  let pending = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending === '') return;
    const chunk = pending;
    pending = '';
    onFlush(chunk);
  }

  return {
    push(text: string): void {
      pending += text;
      if (timer === null) timer = setTimeout(flush, intervalMs);
    },
    flush,
    dispose(): void {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = '';
    },
  };
}
