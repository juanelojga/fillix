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
import { TOPICS_TIMEOUT_MS, suggestTopics } from './lib/linkedin/suggest-topics';
import { RESEARCH_TIMEOUT_MS, researchTopic } from './lib/linkedin/topic-research';
import { BRIEF_TIMEOUT_MS, writeBrief } from './lib/linkedin/write-brief';
import { gatherPostSpecifics } from './lib/linkedin/post-specifics';
import { POST_TIMEOUT_MS, writePost } from './lib/linkedin/write-post';
import { isPillar } from './lib/linkedin/post-taxonomy';
import { getVoiceSpec } from './lib/linkedin/voice-spec';
import { NOTE_TIMEOUT_MS, writeNoteVariants } from './lib/love-note/write-note';
import { getNoteInstructions } from './lib/love-note/note-instructions';
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
    case 'POST_TOPICS': {
      // The voice spec is read here rather than sent from the panel, the `chat-runner.ts`
      // rule: the prompt never crosses the port, so a document the user may have rewritten
      // cannot be stale by the time it reaches the model.
      const topics = await suggestTopics(
        { ...config, model: msg.model ?? config.model },
        msg.seed,
        await getVoiceSpec(),
        AbortSignal.timeout(TOPICS_TIMEOUT_MS),
      );
      return { ok: true, topics };
    }
    case 'POST_RESEARCH': {
      // '' is the degrade path, not a refusal: Hacker News alone is enough to write a post
      // from, and refusing would make an optional paid key mandatory for the whole playbook.
      const { apiKey } = await getTavilyConfig();
      try {
        const research = await researchTopic(
          apiKey,
          msg.topic,
          AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
        );
        return { ok: true, research };
      } catch (err) {
        // The second case in the product that touches the credential, sanitizing for the
        // reason TEST_TAVILY does: the listener's generic catch has no key to pass.
        const raw = err instanceof Error ? err.message : String(err);
        throw new Error(sanitizeError(raw, apiKey));
      }
    }
    case 'POST_BRIEF': {
      // Re-validated rather than trusted: the id crossed the port from a previous message.
      if (!isPillar(msg.pillar)) throw new Error('The model returned an unusable angle brief');
      const specifics = await gatherPostSpecifics(msg.topic, msg.angle, msg.pillar);
      const brief = await writeBrief(
        { ...config, model: msg.model ?? config.model },
        {
          topic: msg.topic,
          angle: msg.angle,
          pillar: msg.pillar,
          research: msg.evidence,
          specifics: specifics.text,
          today: new Date().toISOString().slice(0, 10),
          voiceSpec: await getVoiceSpec(),
        },
        AbortSignal.timeout(BRIEF_TIMEOUT_MS),
      );
      return { ok: true, brief, specifics };
    }
    case 'POST_WRITE': {
      // The timeout bounds the repairs, not the result: `writePost` checks the signal between
      // passes and returns the best draft it has with its failing rows attached.
      const post = await writePost(
        { ...config, model: msg.model ?? config.model },
        {
          brief: msg.brief,
          hook: msg.hook,
          research: msg.evidence,
          specifics: msg.specifics,
          voiceSpec: await getVoiceSpec(),
        },
        AbortSignal.timeout(POST_TIMEOUT_MS),
      );
      return { ok: true, post };
    }
    case 'NOTE_WRITE': {
      // The instructions are read here rather than sent from the panel, the POST_TOPICS rule:
      // the document never crosses the port, so a rewrite cannot be stale on arrival.
      const notes = await writeNoteVariants(
        { ...config, model: msg.model ?? config.model },
        msg.seed,
        await getNoteInstructions(),
        AbortSignal.timeout(NOTE_TIMEOUT_MS),
      );
      return { ok: true, notes };
    }
    default: {
      // The `never` is compile-time only. At runtime this arm is reached by a service worker
      // still running an older build when the panel sends a message type it never learned,
      // and echoing the request back — which is what returning `msg` did — reaches the panel
      // as a response with neither `ok` nor `error`, worded as a failure "without saying why".
      const unknown: never = msg;
      const type = (unknown as { type?: unknown }).type;
      return { ok: false, error: `Unknown message type: ${String(type)}` };
    }
  }
}
