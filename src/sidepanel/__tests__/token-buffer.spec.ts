import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTokenBuffer } from '../token-buffer';

describe('createTokenBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not flush before the interval elapses', () => {
    const onFlush = vi.fn();
    const buffer = createTokenBuffer(onFlush, 60);

    buffer.push('a');
    vi.advanceTimersByTime(59);

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('coalesces multiple pushes inside one window into a single flush', () => {
    const onFlush = vi.fn();
    const buffer = createTokenBuffer(onFlush, 60);

    buffer.push('a');
    buffer.push('b');
    buffer.push('c');
    vi.advanceTimersByTime(60);

    expect(onFlush).toHaveBeenCalledOnce();
    expect(onFlush).toHaveBeenCalledWith('abc');
  });

  it('flush() emits buffered text immediately and cancels the pending timer', () => {
    const onFlush = vi.fn();
    const buffer = createTokenBuffer(onFlush, 60);

    buffer.push('tail');
    buffer.flush();
    expect(onFlush).toHaveBeenCalledOnce();
    expect(onFlush).toHaveBeenCalledWith('tail');

    // The cancelled timer must not fire a second, empty flush.
    vi.advanceTimersByTime(60);
    expect(onFlush).toHaveBeenCalledOnce();
  });

  it('flush() is a no-op when nothing is buffered', () => {
    const onFlush = vi.fn();
    const buffer = createTokenBuffer(onFlush, 60);

    buffer.flush();

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('starts a fresh window after a flush', () => {
    const onFlush = vi.fn();
    const buffer = createTokenBuffer(onFlush, 60);

    buffer.push('first');
    vi.advanceTimersByTime(60);
    buffer.push('second');
    vi.advanceTimersByTime(60);

    expect(onFlush).toHaveBeenCalledTimes(2);
    expect(onFlush).toHaveBeenNthCalledWith(1, 'first');
    expect(onFlush).toHaveBeenNthCalledWith(2, 'second');
  });

  it('dispose() drops buffered text and cancels the timer', () => {
    const onFlush = vi.fn();
    const buffer = createTokenBuffer(onFlush, 60);

    buffer.push('discarded');
    buffer.dispose();
    vi.advanceTimersByTime(60);

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('preserves token order across a flush boundary', () => {
    const chunks: string[] = [];
    const buffer = createTokenBuffer((chunk) => chunks.push(chunk), 60);

    buffer.push('one ');
    buffer.push('two ');
    vi.advanceTimersByTime(60);
    buffer.push('three ');
    buffer.push('four');
    vi.advanceTimersByTime(60);

    expect(chunks.join('')).toBe('one two three four');
  });
});
