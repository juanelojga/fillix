import type { ChatMessage, PortMessage } from '../types';

export type ChatState = 'idle' | 'streaming';

interface ChatControllerOptions {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}

interface ChatController {
  send(userText: string, systemPrompt: string): void;
  stop(): void;
  clear(): void;
  messages: ChatMessage[];
  state: ChatState;
}

export function createChatController(options: ChatControllerOptions): ChatController {
  const { onToken, onDone, onError } = options;

  const ctrl: ChatController = {
    messages: [],
    state: 'idle',
    send,
    stop,
    clear,
  };

  let port: chrome.runtime.Port | null = null;

  function openPort(): chrome.runtime.Port {
    const p = chrome.runtime.connect({ name: 'chat' });
    p.onMessage.addListener((msg: PortMessage) => {
      if (msg.type === 'token') {
        ctrl.messages[ctrl.messages.length - 1].content += msg.value;
        onToken(msg.value);
      } else if (msg.type === 'done') {
        ctrl.state = 'idle';
        onDone();
      } else if (msg.type === 'error') {
        ctrl.state = 'idle';
        onError(msg.error);
      }
    });
    p.onDisconnect.addListener(() => {
      port = null;
    });
    return p;
  }

  function send(userText: string, systemPrompt: string): void {
    if (!port) {
      port = openPort();
    }
    ctrl.messages.push({ role: 'user', content: userText });
    ctrl.state = 'streaming';
    // Snapshot messages (without the empty assistant placeholder) for the background.
    const snapshot = ctrl.messages.slice();
    ctrl.messages.push({ role: 'assistant', content: '' });
    port.postMessage({ type: 'CHAT_START', messages: snapshot, systemPrompt });
  }

  function stop(): void {
    if (ctrl.state === 'streaming') {
      port?.postMessage({ type: 'CHAT_STOP' });
    }
  }

  function clear(): void {
    ctrl.messages = [];
    ctrl.state = 'idle';
  }

  return ctrl;
}
