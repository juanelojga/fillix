import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

const sendMessage = vi.fn();
vi.stubGlobal('chrome', {
  runtime: { sendMessage },
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
});

const { composerState, resetComposer } = await import('../stores/composer');
const { writeDraft, editPost, regenerateDraft } = await import('../stores/composer-draft');
const { selectedPlaybookId } = await import('../stores/playbook');
const { ollamaConfig, workflowModel } = await import('../stores/settings');
const { MODEL_ROW_IDS, mergeAuditReport, runDeterministicRows, closePrecondition } =
  await import('$lib/linkedin/post-audit');
const { assemblePost } = await import('$lib/linkedin/post-draft');

const TOPIC = {
  title: 'Boring tech ships',
  angle: 'The dull stack wins',
  pillar: 'startups' as const,
};
const HOOK = { trigger: 'curiosity', lines: ['A', 'B', 'C'] as [string, string, string] };

const BRIEF = {
  icp: 'primary' as const,
  pillar: 'startups' as const,
  style: 'contrarian' as const,
  funnel: 'tofu' as const,
  spike: 'Boring tech ships faster.',
  hooks: [HOOK],
};

const RESEARCH = {
  evidence: '[1] web · X\nhttps://example.com\nA snippet.',
  sources: [],
  degraded: [],
};
const SPECIFICS = { text: '## Python\n\nEight years.', headings: ['Python'], failure: null };

const LONG = 'We cut the build from 9 minutes to 40 seconds with esbuild. '.repeat(24);
const CLOSE = 'What did you cut first, and what broke when you did?';

function postDraft(body = LONG) {
  const hook = 'A line.\nA second.\nA third.';
  return {
    hook,
    body,
    close: CLOSE,
    closeKind: 'ctc' as const,
    text: assemblePost(hook, body, CLOSE),
  };
}

function result(body = LONG) {
  const draft = postDraft(body);
  const report = mergeAuditReport(
    [...runDeterministicRows(draft), closePrecondition(draft)],
    MODEL_ROW_IDS.map((id) => ({ id, pass: true, why: '' })),
  );
  return { draft, report, passes: 0, exhausted: false };
}

function atBrief() {
  composerState.set({
    stage: 'brief',
    topic: TOPIC,
    status: 'ready',
    research: RESEARCH,
    brief: BRIEF,
    specifics: SPECIFICS,
    hook: 0,
  });
}

beforeEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true, post: result() });
  selectedPlaybookId.set('linkedin-post');
  ollamaConfig.set({ baseUrl: 'http://localhost:11434', model: 'gemma4:12b' });
  workflowModel.set('');
  resetComposer();
});

afterEach(() => {
  selectedPlaybookId.set('toptal');
});

describe('composer stage 3', () => {
  it('writes the post and seeds the editable copy from it', async () => {
    atBrief();
    await writeDraft();
    const state = get(composerState);
    if (state.stage !== 'draft' || state.status !== 'ready') throw new Error('expected ready');
    expect(state.edited).toBe(state.result.draft.text);
    expect(state.report.passed).toBe(true);
  });

  it('sends the hook the user picked, not the first one', async () => {
    const two = { trigger: 'surprise', lines: ['D', 'E', 'F'] as [string, string, string] };
    composerState.set({
      stage: 'brief',
      topic: TOPIC,
      status: 'ready',
      research: RESEARCH,
      brief: { ...BRIEF, hooks: [HOOK, two] },
      specifics: SPECIFICS,
      hook: 1,
    });
    await writeDraft();
    expect(sendMessage.mock.calls[0]?.[0].hook).toEqual(two);
  });

  /**
   * The specifics ride back in rather than being retrieved again: a second embedding call
   * could rank differently and ground the post in sections the angle was never built on.
   */
  it('reuses the research and specifics from the brief', async () => {
    atBrief();
    await writeDraft();
    const sent = sendMessage.mock.calls[0]?.[0];
    expect(sent.evidence).toBe(RESEARCH.evidence);
    expect(sent.specifics).toBe(SPECIFICS.text);
  });

  /** Regenerate must not need stage 2 again — re-researching would spend an unasked search. */
  it('regenerates from the same brief with no second research call', async () => {
    atBrief();
    await writeDraft();
    sendMessage.mockClear();
    await regenerateDraft();
    expect(sendMessage.mock.calls.map((c) => c[0].type)).toEqual(['POST_WRITE']);
  });

  /**
   * The deterministic rows are pure and imported into the panel, so a keystroke costs nothing.
   * Re-asking the judge per character would spend a generation each time.
   */
  it('re-audits an edit locally, with no round trip', async () => {
    atBrief();
    await writeDraft();
    sendMessage.mockClear();

    editPost('Too short.');

    const state = get(composerState);
    if (state.stage !== 'draft' || state.status !== 'ready') throw new Error('expected ready');
    expect(state.edited).toBe('Too short.');
    expect(state.report.rows.find((r) => r.id === 'length')?.pass).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('keeps the model verdicts across an edit rather than dropping them to failing', async () => {
    atBrief();
    await writeDraft();
    editPost(`${postDraft().text} And one more line.`);
    const state = get(composerState);
    if (state.stage !== 'draft' || state.status !== 'ready') throw new Error('expected ready');
    for (const id of MODEL_ROW_IDS) {
      expect(state.report.rows.find((r) => r.id === id)?.pass, id).toBe(true);
    }
  });

  it('leaves the original draft intact so Regenerate can say what it replaces', async () => {
    atBrief();
    await writeDraft();
    editPost('Edited.');
    const state = get(composerState);
    if (state.stage !== 'draft' || state.status !== 'ready') throw new Error('expected ready');
    expect(state.result.draft.text).toContain('esbuild');
  });

  it('words a failure through the diagnostics module and keeps the brief', async () => {
    sendMessage.mockResolvedValue({ ok: false, error: 'Failed to fetch' });
    atBrief();
    await writeDraft();
    const state = get(composerState);
    if (state.stage !== 'draft' || state.status !== 'failed') throw new Error('expected failure');
    expect(state.diagnosis.stage).toBe('draft');
    expect(state.brief.spike).toBe(BRIEF.spike);
    expect(state.hook).toEqual(HOOK);
  });

  it('drops a reply that lands after the playbook changed', async () => {
    let resolve!: (value: unknown) => void;
    sendMessage.mockReturnValue(new Promise((r) => (resolve = r)));
    atBrief();
    const run = writeDraft();
    selectedPlaybookId.set('toptal');
    resolve({ ok: true, post: result() });
    await run;
    expect(get(composerState)).toEqual({ stage: 'topics', status: 'idle' });
  });
});
