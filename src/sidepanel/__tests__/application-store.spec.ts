// @vitest-environment jsdom
// The store parses the captured form with DOMParser when a capture lands.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const sendMessage = vi.fn();
const storageGet = vi.fn().mockResolvedValue({});
const storageSet = vi.fn().mockResolvedValue(undefined);
vi.stubGlobal('chrome', {
  runtime: { sendMessage },
  storage: { local: { get: storageGet, set: storageSet } },
});

const { runState } = await import('../stores/playbook');
const { profile, embedModel, profileIndex } = await import('../stores/profile');
const { hashProfile } = await import('../../lib/profile/profile-hash');
const { answerable, draftedCount, drafts, fields, clearApplication, draftAll, editDraft, redraft } =
  await import('../stores/application');

const MARKDOWN = '## Python\n\nEight years.';
const Q1 = 'Do you know Python?';
const Q2 = 'Do you happen to be a Spanish speaker?';

const FORM = `<html><body><form>
  <div data-testid="matcherQuestions">
    <div data-testid="matcherQuestionSelect">
      <label for="s"><span>How soon can you start?</span></label>
      <input type="hidden" name="s" value="Immediately">
    </div>
    <div data-testid="matcherQuestionInput">
      <label for="q1"><span>${Q1}</span></label>
      <textarea id="q1" name="q1"></textarea>
      <textarea aria-hidden="true" readonly></textarea>
    </div>
    <div data-testid="matcherQuestionInput">
      <label for="q2"><span>${Q2}</span></label>
      <textarea id="q2" name="q2"></textarea>
      <textarea aria-hidden="true" readonly></textarea>
    </div>
  </div>
</form></body></html>`;

function capture(capturedAt: number) {
  return {
    html: FORM,
    totalChars: FORM.length,
    url: 'https://talent.toptal.com/portal/job/abc',
    title: 'Job',
    capturedAt,
  };
}

function ready(capturedAt = 1000) {
  runState.set({ status: 'ready', capture: capture(capturedAt), sections: [], brief: null });
}

/** A profile and index that let retrieval succeed, so drafting is what is under test. */
function profileIsReady() {
  profile.set({ markdown: MARKDOWN, updatedAt: 1 });
  embedModel.set('nomic');
  profileIndex.set({
    hash: hashProfile(MARKDOWN, 'nomic'),
    chars: MARKDOWN.length,
    model: 'nomic',
    dim: 2,
    builtAt: 1,
    chunks: [{ id: 'python-0', heading: 'Python', ordinal: 0, text: MARKDOWN, vector: [1, 0] }],
  });
}

function draftReply(text: string, drewOn: string[] = ['Python']) {
  return { ok: true, draft: { text, drewOn, gaps: [] } };
}

beforeEach(() => {
  sendMessage.mockReset();
  runState.set({ status: 'idle' });
  clearApplication();
  profileIsReady();
});

describe('fields follow the capture', () => {
  it('reads the questions off a capture as soon as one lands', () => {
    ready();

    expect(get(fields).map((f) => f.question)).toEqual(['How soon can you start?', Q1, Q2]);
  });

  // The dropdown has no locator, so it is shown but never drafted for.
  it('counts only the fields that can actually be written to', () => {
    ready();

    expect(get(answerable).map((f) => f.question)).toEqual([Q1, Q2]);
  });

  it('clears everything when the capture goes away', () => {
    ready();
    runState.set({ status: 'idle' });

    expect(get(fields)).toEqual([]);
    expect(get(drafts)).toEqual({});
  });

  // bits-ui drops the inactive TabsContent, so a capture taken while the user was on Chat
  // would otherwise leave the previous job's questions behind for them to come back to.
  it('replaces the questions when a second capture lands', () => {
    ready(1000);
    drafts.set({
      [Q1]: { status: 'drafted', draft: { text: 'old', drewOn: ['x'], gaps: [] }, edited: 'old' },
    });

    ready(2000);

    expect(get(drafts)).toEqual({});
  });
});

describe('draftAll', () => {
  beforeEach(() => ready());

  it('drafts every answerable question and leaves the dropdown alone', async () => {
    sendMessage.mockImplementation(async (msg: { type: string; query?: string }) =>
      msg.type === 'PROFILE_QUERY' ? { ok: true, queryVector: [1, 0] } : draftReply('An answer.'),
    );

    await draftAll();

    const state = get(drafts);
    expect(Object.keys(state).sort()).toEqual([Q1, Q2].sort());
    expect(state[Q1]).toMatchObject({ status: 'drafted', edited: 'An answer.' });
    expect(get(draftedCount)).toBe(2);
  });

  // Ollama serialises generation on one model anyway, so firing them together would not
  // finish sooner — it would only make every question appear to hang at once.
  it('drafts one at a time rather than all at once', async () => {
    let inFlight = 0;
    let peak = 0;
    sendMessage.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'PROFILE_QUERY') return { ok: true, queryVector: [1, 0] };
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return draftReply('An answer.');
    });

    await draftAll();

    expect(peak).toBe(1);
  });

  it('records the model failure against the question it belongs to', async () => {
    sendMessage.mockImplementation(async (msg: { type: string }) =>
      msg.type === 'PROFILE_QUERY'
        ? { ok: true, queryVector: [1, 0] }
        : { ok: false, error: 'Ollama /api/generate returned 404' },
    );

    await draftAll();

    const state = get(drafts)[Q1];
    expect(state.status).toBe('failed');
    expect(state.status === 'failed' && state.diagnosis.summary).toMatch(/not installed/i);
  });

  // The user has to be told to go and index, not shown an answer drawn from nothing.
  it('reports a retrieval refusal without ever calling the model', async () => {
    profileIndex.set(null);
    sendMessage.mockResolvedValue({ ok: true, queryVector: [1, 0] });

    await draftAll();

    const state = get(drafts)[Q1];
    expect(state.status === 'failed' && state.diagnosis.summary).toMatch(/not been indexed/);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('refuses to start a second run while one is in flight', async () => {
    sendMessage.mockImplementation(async (msg: { type: string }) =>
      msg.type === 'PROFILE_QUERY' ? { ok: true, queryVector: [1, 0] } : draftReply('An answer.'),
    );

    await Promise.all([draftAll(), draftAll()]);

    // Two questions, two round trips each — not four.
    expect(sendMessage).toHaveBeenCalledTimes(4);
  });
});

describe('the generation guard', () => {
  /**
   * The invariant `stores/playbook.ts` states, carried across the store boundary: a displayed
   * draft must belong to the displayed capture. Without this a slow answer for the previous
   * job lands under this one's question.
   */
  it('drops a draft that resolves after a newer capture', async () => {
    ready(1000);
    let release: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      release = resolve;
    });

    sendMessage.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'PROFILE_QUERY') return { ok: true, queryVector: [1, 0] };
      await pending;
      return draftReply('Answer from the old job.');
    });

    const inFlight = redraft(Q1);
    ready(2000);
    release(null);
    await inFlight;

    expect(get(drafts)[Q1]).toBeUndefined();
  });
});

describe('editDraft', () => {
  beforeEach(() => ready());

  it('keeps the model output beside the edit, so both stay readable', () => {
    drafts.set({
      [Q1]: {
        status: 'drafted',
        draft: { text: 'Drafted.', drewOn: ['Python'], gaps: [] },
        edited: 'Drafted.',
      },
    });

    editDraft(Q1, 'Mine.');

    const state = get(drafts)[Q1];
    expect(state.status === 'drafted' && state.edited).toBe('Mine.');
    expect(state.status === 'drafted' && state.draft.text).toBe('Drafted.');
  });

  it('ignores an edit to a question that has no draft', () => {
    editDraft(Q1, 'Mine.');

    expect(get(drafts)[Q1]).toBeUndefined();
  });
});
