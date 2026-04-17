import { chatStream, inferFieldValue, inferFieldValueFromMarkdown, listModels } from './lib/ollama';
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

export function sanitizeError(error: string, apiKey: string): string {
  if (!apiKey) return error;
  return error.split(apiKey).join('[REDACTED]');
}

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  handle(msg)
    .then(sendResponse)
    .catch(async (err: unknown) => {
      const raw = err instanceof Error ? err.message : String(err);
      const { apiKey } = await getObsidianConfig().catch(() => ({ apiKey: '' }));
      sendResponse({ ok: false, error: sanitizeError(raw, apiKey) } satisfies MessageResponse);
    });
  return true;
});

async function handle(msg: Message): Promise<MessageResponse> {
  const config = await getOllamaConfig();
  switch (msg.type) {
    case 'OLLAMA_INFER': {
      const obsidianCfg = await getObsidianConfig();
      if (obsidianCfg.profilePath && obsidianCfg.apiKey) {
        try {
          const markdown = await getFile(obsidianCfg, obsidianCfg.profilePath);
          const value = await inferFieldValueFromMarkdown(config, msg.field, markdown);
          return { ok: true, value };
        } catch {
          // fall through to structured profile
        }
      }
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
