import { chatStream, inferFieldValue, listModels } from './lib/ollama';
import { getFile, listFiles, testConnection } from './lib/obsidian';
import { getObsidianConfig, getOllamaConfig } from './lib/storage';
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

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
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
    case 'OBSIDIAN_TEST_CONNECTION': {
      const obsidian = await getObsidianConfig();
      await testConnection(obsidian);
      return { ok: true };
    }
    case 'OBSIDIAN_LIST_FILES': {
      const obsidian = await getObsidianConfig();
      const files = await listFiles(obsidian);
      return { ok: true, files };
    }
    case 'OBSIDIAN_GET_FILE': {
      const obsidian = await getObsidianConfig();
      const content = await getFile(obsidian, msg.path);
      return { ok: true, content };
    }
    default: {
      const _: never = msg;
      return _;
    }
  }
}
