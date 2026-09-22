import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

const sendMessage = vi.fn();
vi.stubGlobal('chrome', {
  runtime: { sendMessage },
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
});

const { composerState, resetComposer } = await import('../stores/composer');
const { chooseTopic, chooseHook, regenerateBrief } = await import('../stores/composer-brief');
const { selectedPlaybookId } = await import('../stores/playbook');
const { ollamaConfig, workflowModel } = await import('../stores/settings');

const TOPIC = {
  title: 'Boring tech ships',
  angle: 'The dull stack wins',
  pillar: 'startups' as const,
};

const RESEARCH = {
  evidence: '[1] web · Something\nhttps://example.com\nA snippet.',
  sources: [
    {
      n: 1,
      origin: 'web' as const,
      title: 'Something',
      url: 'https://example.com',
      date: '2026-09-14',
    },
  ],
  degraded: [],
};

const DEGRADED = {
  ...RESEARCH,
  sources: [],
  evidence: '',
  degraded: [
    { origin: 'web' as const, summary: 'No Tavily API key', hint: 'Paste one in Settings.' },
  ],
};

const BRIEF = {
  icp: 'primary' as const,
  pillar: 'startups' as const,
  style: 'contrarian' as const,
  funnel: 'tofu' as const,
  spike: 'Boring tech ships faster.',
  hooks: [
    { trigger: 'curiosity', lines: ['A', 'B', 'C'] as [string, string, string] },
    { trigger: 'surprise', lines: ['D', 'E', 'F'] as [string, string, string] },
    { trigger: 'identity', lines: ['G', 'H', 'I'] as [string, string, string] },
  ],
};

const SPECIFICS = { text: '## Python\n\nEight years.', headings: ['Python'], failure: null };

/** Answers each message type in turn, so a single test can script the whole stage. */
function script(
  research: unknown = RESEARCH,
  brief: unknown = { brief: BRIEF, specifics: SPECIFICS },
) {
  sendMessage.mockImplementation(async (msg: { type: string }) => {
    if (msg.type === 'POST_RESEARCH') return { ok: true, research };
    return { ok: true, ...(brief as object) };
  });
}

async function atBrief() {
  composerState.set({ stage: 'topics', status: 'ready', topics: [TOPIC] });
  await chooseTopic(TOPIC.title);
}

beforeEach(() => {
  sendMessage.mockReset();
  script();
  selectedPlaybookId.set('linkedin-post');
  ollamaConfig.set({ baseUrl: 'http://localhost:11434', model: 'gemma4:12b' });
  workflowModel.set('');
  resetComposer();
});

afterEach(() => {
  selectedPlaybookId.set('toptal');
});

describe('composer stage 2', () => {
  it('advances to the brief and lands both round trips', async () => {
    await atBrief();
    const state = get(composerState);
    expect(state.stage).toBe('brief');
    if (state.stage !== 'brief' || state.status !== 'ready') throw new Error('expected ready');
    expect(state.brief.spike).toBe('Boring tech ships faster.');
    expect(state.specifics.headings).toEqual(['Python']);
    expect(state.hook).toBe(0);
  });

  it('hands the research evidence to the brief rather than researching twice', async () => {
    await atBrief();
    const brief = sendMessage.mock.calls.find((c) => c[0].type === 'POST_BRIEF')?.[0];
    expect(brief.evidence).toBe(RESEARCH.evidence);
    expect(sendMessage.mock.calls.filter((c) => c[0].type === 'POST_RESEARCH')).toHaveLength(1);
  });

  it('never sends the Tavily key — the worker reads it from storage', async () => {
    await atBrief();
    const research = sendMessage.mock.calls.find((c) => c[0].type === 'POST_RESEARCH')?.[0];
    expect(Object.keys(research)).toEqual(['type', 'topic']);
  });

  /**
   * The failure this prevents: a keyless install seeing the whole stage fail. Research
   * degrades inside TopicResearch and the brief is written from whatever arrived — only the
   * generation failing fails the stage.
   */
  it('reaches a brief when research came back degraded', async () => {
    script(DEGRADED);
    await atBrief();
    const state = get(composerState);
    if (state.stage !== 'brief' || state.status !== 'ready') throw new Error('expected ready');
    expect(state.research.degraded).toHaveLength(1);
  });

  it('keeps the topic through a failure, so Regenerate does not go back to stage one', async () => {
    sendMessage.mockImplementation(async (msg: { type: string }) =>
      msg.type === 'POST_RESEARCH'
        ? { ok: true, research: RESEARCH }
        : { ok: false, error: 'The model returned an unusable angle brief' },
    );
    await atBrief();
    const state = get(composerState);
    if (state.stage !== 'brief' || state.status !== 'failed') throw new Error('expected failure');
    expect(state.topic.title).toBe(TOPIC.title);
    expect(state.research).not.toBeNull();
    expect(state.diagnosis.cause).toBe('bad-brief');
  });

  it('reports a research failure as a research failure, not a drafting one', async () => {
    sendMessage.mockImplementation(async (msg: { type: string }) =>
      msg.type === 'POST_RESEARCH' ? { ok: false, error: 'Failed to fetch' } : { ok: true },
    );
    await atBrief();
    const state = get(composerState);
    if (state.stage !== 'brief' || state.status !== 'failed') throw new Error('expected failure');
    expect(state.diagnosis.stage).toBe('research');
    expect(state.diagnosis.hint).not.toMatch(/ollama serve/i);
  });

  /**
   * Read once, before the two round trips, so the message the worker gets and the model the
   * failure hint names can never disagree — even if the picker moves mid-flight.
   */
  it('resolves the model once, before either round trip', async () => {
    workflowModel.set('qwen3:8b');
    composerState.set({ stage: 'topics', status: 'ready', topics: [TOPIC] });
    const run = chooseTopic(TOPIC.title);
    workflowModel.set('llama3.2');
    await run;
    const brief = sendMessage.mock.calls.find((c) => c[0].type === 'POST_BRIEF')?.[0];
    expect(brief.model).toBe('qwen3:8b');
  });

  it('picks a hook without any round trip', async () => {
    await atBrief();
    sendMessage.mockClear();
    chooseHook(2);
    const state = get(composerState);
    if (state.stage !== 'brief' || state.status !== 'ready') throw new Error('expected ready');
    expect(state.hook).toBe(2);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('ignores a hook index the brief does not have', async () => {
    await atBrief();
    chooseHook(9);
    const state = get(composerState);
    if (state.stage !== 'brief' || state.status !== 'ready') throw new Error('expected ready');
    expect(state.hook).toBe(0);
  });

  it('regenerates for the topic already chosen', async () => {
    await atBrief();
    sendMessage.mockClear();
    script();
    await regenerateBrief();
    const research = sendMessage.mock.calls.find((c) => c[0].type === 'POST_RESEARCH')?.[0];
    expect(research.topic).toBe(TOPIC.title);
  });

  it('clears back to stage one when the playbook changes', async () => {
    await atBrief();
    selectedPlaybookId.set('toptal');
    expect(get(composerState)).toEqual({ stage: 'topics', status: 'idle' });
  });
});
