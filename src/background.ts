import { inferFieldValue, testModel } from './lib/ollama';
import { getOllamaConfig } from './lib/storage';
import {
  migrateLegacyProviderKeys,
  removeRetiredObsidianKeys,
  removeRetiredSearchKey,
} from './lib/legacy-migration';
import { handleChatPort } from './lib/chat-runner';
import { refreshNews } from './lib/news/aggregator';
import { articleFailureMessage, resolveArticleText } from './lib/news/article-text';
import { SUMMARY_TIMEOUT_MS, summarizeArticle } from './lib/news/summarizer';
import type { Message, MessageResponse } from './types';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

async function initialize(): Promise<void> {
  await migrateLegacyProviderKeys().catch((err: unknown) => {
    console.warn('[fillix] Legacy provider migration failed:', err);
  });
  await removeRetiredSearchKey().catch((err: unknown) => {
    console.warn('[fillix] Retired search key cleanup failed:', err);
  });
  await removeRetiredObsidianKeys().catch((err: unknown) => {
    console.warn('[fillix] Retired Obsidian key cleanup failed:', err);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void initialize();
});
chrome.runtime.onStartup.addListener(() => {
  void initialize();
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'chat') {
    handleChatPort(port);
  }
});

export function sanitizeError(error: string, ...apiKeys: string[]): string {
  let result = error;
  for (const key of apiKeys) {
    if (key) result = result.split(key).join('[REDACTED]');
  }
  return result;
}

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  handle(msg)
    .then(sendResponse)
    .catch((err: unknown) => {
      const raw = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error: sanitizeError(raw) } satisfies MessageResponse);
    });
  return true;
});

async function handle(msg: Message): Promise<MessageResponse> {
  const config = await getOllamaConfig();
  switch (msg.type) {
    case 'OLLAMA_INFER': {
      const value = await inferFieldValue(config, msg.field);
      return { ok: true, value };
    }
    case 'TEST_MODEL': {
      const latencyMs = await testModel({ ...config, model: msg.model });
      return { ok: true, latencyMs };
    }
    case 'CHAT_START':
    case 'CHAT_STOP':
      return { ok: false, error: 'Use port channel for chat' };
    case 'NEWS_REFRESH': {
      const { items, degraded } = await refreshNews();
      return { ok: true, news: items, degraded };
    }
    case 'NEWS_ARTICLE': {
      const resolved = await resolveArticleText(msg.item);
      if (!resolved.ok) throw new Error(articleFailureMessage(resolved.reason));
      return { ok: true, article: { text: resolved.text, origin: resolved.origin } };
    }
    case 'NEWS_SUMMARIZE': {
      const summary = await summarizeArticle(
        // The News tab has its own model preference; the panel resolves it and sends it,
        // so the label it shows and the model that runs are the same string.
        { ...config, model: msg.model ?? config.model },
        { title: msg.title, source: msg.source, text: msg.text },
        AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
      );
      return { ok: true, summary };
    }
    default: {
      const _: never = msg;
      return _;
    }
  }
}
