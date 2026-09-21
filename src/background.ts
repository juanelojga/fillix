import { inferFieldValue, testModel } from './lib/ollama';
import {
  getOllamaConfig,
  getProfile,
  getProfileConfig,
  getTavilyConfig,
  setProfileIndex,
} from './lib/storage';
import {
  migrateLegacyProviderKeys,
  removeRetiredObsidianKeys,
  removeRetiredSearchKey,
} from './lib/legacy-migration';
import { handleChatPort } from './lib/chat-runner';
import { refreshNews } from './lib/news/aggregator';
import { articleFailureMessage, resolveArticleText } from './lib/news/article-text';
import { SUMMARY_TIMEOUT_MS, summarizeArticle } from './lib/news/summarizer';
import { buildProfileIndex } from './lib/profile/profile-index';
import { embedTexts, testEmbedModel } from './lib/ollama-embed';
import { DRAFT_TIMEOUT_MS, draftAnswer } from './lib/answers/draft-answer';
import { extractQuestionTimes } from './lib/answers/extract-question-times';
import { EXTRACT_TIMEOUT_MS } from './lib/answers/question-times';
import { checkTavilyKey } from './lib/tavily/search';
import type { Message, MessageResponse } from './types';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

/** Shorter than the Ollama probe's 30s: there is no model to load into VRAM, just one GET. */
const TAVILY_TEST_TIMEOUT_MS = 15_000;

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
    case 'PROFILE_INDEX': {
      const { embedModel } = await getProfileConfig();
      if (!embedModel) throw new Error('No embedding model chosen — name one in the Profile tab.');
      const { markdown } = await getProfile();
      const index = await buildProfileIndex(config.baseUrl, embedModel, markdown);
      await setProfileIndex(index);
      // The vectors stay in storage; the panel only needs enough to word the status line.
      return {
        ok: true,
        indexed: { chunks: index.chunks.length, dim: index.dim, builtAt: index.builtAt },
      };
    }
    case 'PROFILE_QUERY': {
      const { embedModel } = await getProfileConfig();
      if (!embedModel) throw new Error('No embedding model chosen — name one in the Profile tab.');
      // One string in, one vector out. Scoring it against the index happens in the panel,
      // which already holds the vectors.
      const [queryVector] = await embedTexts({ baseUrl: config.baseUrl, model: embedModel }, [
        msg.query,
      ]);
      return { ok: true, queryVector };
    }
    case 'TEST_EMBED_MODEL': {
      // Not testModel(): that POSTs /api/chat, which an embed-only model rejects outright.
      const latencyMs = await testEmbedModel({ baseUrl: config.baseUrl, model: msg.model });
      return { ok: true, latencyMs };
    }
    // The only credential in the product, which is why this case redacts its own errors rather
    // than leaning on the listener's catch below: Tavily's message is the one string in the
    // system that could echo a secret back onto the screen, and the generic catch has no key to
    // pass. The precondition names the tab that fixes it, as PROFILE_INDEX's does.
    case 'TEST_TAVILY': {
      const { apiKey } = await getTavilyConfig();
      if (!apiKey) throw new Error('No Tavily API key saved — paste one in the Settings tab.');
      try {
        const tavily = await checkTavilyKey(apiKey, AbortSignal.timeout(TAVILY_TEST_TIMEOUT_MS));
        return { ok: true, tavily };
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        throw new Error(sanitizeError(raw, apiKey));
      }
    }
    case 'EXTRACT_QUESTION_TIMES': {
      const times = await extractQuestionTimes(
        { ...config, model: msg.model ?? config.model },
        msg.question,
        AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
      );
      return { ok: true, times };
    }
    case 'DRAFT_ANSWER': {
      const draft = await draftAnswer(
        { ...config, model: msg.model ?? config.model },
        {
          kind: msg.kind,
          question: msg.question,
          job: msg.job,
          evidence: msg.evidence,
          applicantName: msg.applicantName,
        },
        AbortSignal.timeout(DRAFT_TIMEOUT_MS),
      );
      return { ok: true, draft };
    }
    default: {
      const _: never = msg;
      return _;
    }
  }
}
