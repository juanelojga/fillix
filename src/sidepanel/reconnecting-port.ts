import type { Message, PortMessage } from '../types';

/**
 * A `chrome.runtime.Port` that survives the background worker going away.
 *
 * Chrome suspends an MV3 service worker while the side panel stays open, and
 * force-closes its ports after ~5 minutes of inactivity. A port opened once at
 * panel load is therefore routinely dead by the time the user types, and
 * posting to a dead port *throws* — which aborted `send()`/`stop()` halfway and
 * stranded the UI in its streaming state (empty reply, stop button that does
 * nothing) until the panel was closed and reopened.
 *
 * This wrapper connects lazily, reconnects on the next post after a drop, and
 * keeps subscribers across reconnects. `postMessage` never throws. Reconnecting
 * cannot resume an interrupted stream, so `onDisconnect` fires on every drop and
 * callers are expected to tell the user their in-flight turn was cut.
 */
export interface ReconnectingPort {
  postMessage(msg: Message): void;
  onMessage: {
    addListener(fn: (msg: PortMessage) => void): void;
    removeListener(fn: (msg: PortMessage) => void): void;
  };
  onDisconnect: {
    addListener(fn: () => void): void;
    removeListener(fn: () => void): void;
  };
  disconnect(): void;
}

export function createReconnectingPort(
  name: string,
  connect: (portName: string) => chrome.runtime.Port = (portName) =>
    chrome.runtime.connect({ name: portName }),
): ReconnectingPort {
  const messageListeners = new Set<(msg: PortMessage) => void>();
  const disconnectListeners = new Set<() => void>();
  let port: chrome.runtime.Port | null = null;
  let closed = false;

  function notifyDropped(): void {
    for (const fn of [...disconnectListeners]) fn();
  }

  function ensure(): chrome.runtime.Port {
    if (port) return port;
    const fresh = connect(name);
    fresh.onMessage.addListener((raw: unknown) => {
      for (const fn of [...messageListeners]) fn(raw as PortMessage);
    });
    fresh.onDisconnect.addListener(() => {
      if (port === fresh) port = null;
      if (!closed) notifyDropped();
    });
    port = fresh;
    return fresh;
  }

  return {
    postMessage(msg: Message): void {
      if (closed) return;
      try {
        ensure().postMessage(msg);
      } catch {
        // The worker died between the last message and this one. Drop the stale
        // port and retry once on a fresh connection, which also wakes it.
        port = null;
        try {
          ensure().postMessage(msg);
        } catch {
          port = null;
          notifyDropped();
        }
      }
    },
    onMessage: {
      addListener(fn: (msg: PortMessage) => void): void {
        messageListeners.add(fn);
      },
      removeListener(fn: (msg: PortMessage) => void): void {
        messageListeners.delete(fn);
      },
    },
    onDisconnect: {
      addListener(fn: () => void): void {
        disconnectListeners.add(fn);
      },
      removeListener(fn: () => void): void {
        disconnectListeners.delete(fn);
      },
    },
    disconnect(): void {
      closed = true;
      port?.disconnect();
      port = null;
      messageListeners.clear();
      disconnectListeners.clear();
    },
  };
}
