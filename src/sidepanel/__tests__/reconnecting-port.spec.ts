import { describe, it, expect, vi } from 'vitest';
import { createReconnectingPort } from '../reconnecting-port';
import type { Message, PortMessage } from '../../types';

/** A fake chrome port whose disconnect and post failures the test drives. */
function makeFakePort() {
  const messageListeners: ((msg: unknown) => void)[] = [];
  const disconnectListeners: (() => void)[] = [];
  const posted: Message[] = [];
  let dead = false;

  const port = {
    postMessage: (msg: Message) => {
      if (dead) throw new Error('Attempting to use a disconnected port object');
      posted.push(msg);
    },
    onMessage: {
      addListener: (fn: (msg: unknown) => void) => messageListeners.push(fn),
      removeListener: vi.fn(),
    },
    onDisconnect: {
      addListener: (fn: () => void) => disconnectListeners.push(fn),
      removeListener: vi.fn(),
    },
    disconnect: vi.fn(),
  } as unknown as chrome.runtime.Port;

  return {
    port,
    posted,
    emit: (msg: PortMessage) => messageListeners.forEach((fn) => fn(msg)),
    /** Simulates Chrome tearing the port down with the panel none the wiser. */
    kill: () => {
      dead = true;
      disconnectListeners.forEach((fn) => fn());
    },
    /** Simulates a port that is already dead but has not fired onDisconnect. */
    killSilently: () => {
      dead = true;
    },
  };
}

const START: Message = { type: 'CHAT_START', messages: [], systemPrompt: '' };

describe('createReconnectingPort', () => {
  it('connects lazily — not before the first message', () => {
    const connect = vi.fn(() => makeFakePort().port);
    createReconnectingPort('chat', connect);
    expect(connect).not.toHaveBeenCalled();
  });

  it('connects once and reuses the port for later messages', () => {
    const fake = makeFakePort();
    const connect = vi.fn(() => fake.port);
    const port = createReconnectingPort('chat', connect);

    port.postMessage(START);
    port.postMessage({ type: 'CHAT_STOP' });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith('chat');
    expect(fake.posted).toHaveLength(2);
  });

  it('forwards port messages to subscribers', () => {
    const fake = makeFakePort();
    const port = createReconnectingPort('chat', () => fake.port);
    const seen: PortMessage[] = [];
    port.onMessage.addListener((msg) => seen.push(msg));

    port.postMessage(START);
    fake.emit({ type: 'token', value: 'hi' });

    expect(seen).toEqual([{ type: 'token', value: 'hi' }]);
  });

  it('stops forwarding to a removed subscriber', () => {
    const fake = makeFakePort();
    const port = createReconnectingPort('chat', () => fake.port);
    const seen: PortMessage[] = [];
    const listener = (msg: PortMessage) => seen.push(msg);
    port.onMessage.addListener(listener);
    port.onMessage.removeListener(listener);

    port.postMessage(START);
    fake.emit({ type: 'token', value: 'hi' });

    expect(seen).toEqual([]);
  });

  it('notifies subscribers when the worker drops the port', () => {
    const fake = makeFakePort();
    const port = createReconnectingPort('chat', () => fake.port);
    const dropped = vi.fn();
    port.onDisconnect.addListener(dropped);

    port.postMessage(START);
    fake.kill();

    expect(dropped).toHaveBeenCalledTimes(1);
  });

  it('reconnects on the next message after a drop', () => {
    const first = makeFakePort();
    const second = makeFakePort();
    const ports = [first, second];
    const port = createReconnectingPort('chat', () => ports.shift()!.port);

    port.postMessage(START);
    first.kill();
    port.postMessage(START);

    expect(second.posted).toEqual([START]);
  });

  it('keeps subscribers attached across a reconnect', () => {
    const first = makeFakePort();
    const second = makeFakePort();
    const ports = [first, second];
    const port = createReconnectingPort('chat', () => ports.shift()!.port);
    const seen: PortMessage[] = [];
    port.onMessage.addListener((msg) => seen.push(msg));

    port.postMessage(START);
    first.kill();
    port.postMessage(START);
    second.emit({ type: 'token', value: 'after' });

    expect(seen).toEqual([{ type: 'token', value: 'after' }]);
  });

  it('retries on a fresh port when posting to a silently dead one throws', () => {
    const first = makeFakePort();
    const second = makeFakePort();
    const ports = [first, second];
    const port = createReconnectingPort('chat', () => ports.shift()!.port);

    port.postMessage(START);
    first.killSilently();

    expect(() => port.postMessage({ type: 'CHAT_STOP' })).not.toThrow();
    expect(second.posted).toEqual([{ type: 'CHAT_STOP' }]);
  });

  it('reports a drop instead of throwing when even the reconnect fails', () => {
    const fakes = [makeFakePort(), makeFakePort()];
    fakes.forEach((f) => f.killSilently());
    const port = createReconnectingPort('chat', () => fakes.shift()!.port);
    const dropped = vi.fn();
    port.onDisconnect.addListener(dropped);

    expect(() => port.postMessage(START)).not.toThrow();
    expect(dropped).toHaveBeenCalledTimes(1);
  });

  it('does not report a drop or reconnect after an explicit disconnect', () => {
    const fake = makeFakePort();
    const connect = vi.fn(() => fake.port);
    const port = createReconnectingPort('chat', connect);
    const dropped = vi.fn();
    port.onDisconnect.addListener(dropped);

    port.postMessage(START);
    port.disconnect();
    fake.kill();
    port.postMessage(START);

    expect(dropped).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(fake.posted).toHaveLength(1);
  });
});
