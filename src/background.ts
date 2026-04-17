import { chatStream, inferFieldValue, listModels } from './lib/ollama';
import { getOllamaConfig } from './lib/storage';
import type { Message, MessageResponse, PortMessage } from './types';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'chat') return;
  let controller: AbortController | null = null;

  port.onMessage.addListener(async (msg: Message) => {
    if (msg.type === 'CHAT_START') {
      controller?.abort();
      controller = new AbortController();
      const config = await getOllamaConfig();
      await chatStream({ ...config, model: msg.model }, msg.messages, msg.systemPrompt, {
        signal: controller.signal,
        onToken: (value) => port.postMessage({ type: 'token', value } satisfies PortMessage),
        onDone: () => port.postMessage({ type: 'done' } satisfies PortMessage),
        onError: (error) => port.postMessage({ type: 'error', error } satisfies PortMessage),
      });
    } else if (msg.type === 'CHAT_STOP') {
      controller?.abort();
    }
  });

  port.onDisconnect.addListener(() => controller?.abort());
});

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  handle(msg)
    .then(sendResponse)
    .catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error } satisfies MessageResponse);
    });
  return true;
});

async function handle(msg: Message): Promise<MessageResponse> {
  const config = await getOllamaConfig();
  switch (msg.type) {
    case 'OLLAMA_INFER': {
      const value = await inferFieldValue(config, msg.field, msg.profile);
      return { ok: true, value };
    }
    case 'OLLAMA_LIST_MODELS': {
      const models = await listModels(config);
      return { ok: true, models };
    }
    case 'CHAT_START':
    case 'CHAT_STOP':
      return { ok: false, error: 'Use port channel for chat' };
    default: {
      const _: never = msg;
      return _;
    }
  }
}
