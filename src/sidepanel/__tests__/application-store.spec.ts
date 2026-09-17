// @vitest-environment jsdom
// The store parses the captured form with DOMParser when a capture lands.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const sendMessage = vi.fn();
const storageGet = vi.fn().mockResolvedValue({});
const storageSet = vi.fn().mockResolvedValue(undefined);
const tabsQuery = vi.fn();
const executeScript = vi.fn();
vi.stubGlobal('chrome', {
  runtime: { sendMessage },
  storage: { local: { get: storageGet, set: storageSet } },
  tabs: { query: tabsQuery },
  scripting: { executeScript },
});

const { runState } = await import('../stores/playbook');
const { profile, embedModel, profileIndex } = await import('../stores/profile');
const { hashProfile } = await import('../../lib/profile/profile-hash');
const {
  answerable,
  draftedCount,
  drafts,
  fields,
  fillable,
  fillState,
  clearApplication,
  draftAll,
  editDraft,
  fillApproved,
  redraft,
} = await import('../stores/application');

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
  tabsQuery.mockReset().mockResolvedValue([
    {
      id: 7,
      url: 'https://talent.toptal.com/portal/job/abc',
      title: 'Job',
      status: 'complete',
    },
  ]);
  executeScript.mockReset().mockResolvedValue([{ result: [] }]);
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

function drafted(text: string) {
  return {
    status: 'drafted' as const,
    draft: { text, drewOn: ['Python'], gaps: [] },
    edited: text,
  };
}

describe('what would be written', () => {
  beforeEach(() => ready());

  it('offers the user edit, not the model original', () => {
    drafts.set({ [Q1]: { ...drafted('Drafted.'), edited: 'Mine.' } });

    expect(get(fillable)).toEqual([
      { question: Q1, locator: { by: 'name', value: 'q1' }, value: 'Mine.' },
    ]);
  });

  // Clearing a box the user had already typed in would be a silent deletion of their work.
  it('leaves a blank answer out rather than writing an empty string', () => {
    drafts.set({ [Q1]: drafted(''), [Q2]: drafted('   ') });

    expect(get(fillable)).toEqual([]);
  });

  it('never offers a question that has no locator', () => {
    drafts.set({ 'How soon can you start?': drafted('Immediately.') });

    expect(get(fillable)).toEqual([]);
  });

  it('offers nothing for a question that failed to draft', () => {
    drafts.set({
      [Q1]: {
        status: 'failed',
        diagnosis: { cause: 'unknown', summary: 's', hint: 'h', detail: 'd' },
      },
    });

    expect(get(fillable)).toEqual([]);
  });
});

describe('fillApproved', () => {
  beforeEach(() => {
    ready();
    drafts.set({ [Q1]: drafted('An answer.') });
  });

  it('writes the approved answers and records the outcome per question', async () => {
    const locator = { by: 'name', value: 'q1' };
    executeScript.mockResolvedValue([{ result: [{ locator, ok: true }] }]);

    await fillApproved();

    const state = get(fillState);
    expect(state.status).toBe('done');
    expect(state.status === 'done' && state.outcomes[Q1]).toEqual({ locator, ok: true });
    expect(executeScript.mock.calls[0][0].args[0]).toEqual([{ locator, value: 'An answer.' }]);
  });

  /**
   * The user may have switched tabs between drafting and pressing Fill. Writing a pitch into
   * whatever happens to be open now is the worst thing this feature could do.
   */
  it('refuses to write to a page that is not the job page any more', async () => {
    tabsQuery.mockResolvedValue([
      { id: 7, url: 'https://news.ycombinator.com', title: 'HN', status: 'complete' },
    ]);

    await fillApproved();

    const state = get(fillState);
    expect(state.status === 'refused' && state.diagnosis.summary).toMatch(
      /does not read this page/,
    );
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('does nothing at all when no answer is ready', async () => {
    drafts.set({});

    await fillApproved();

    expect(get(fillState)).toEqual({ status: 'idle' });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('refuses a second run while one is in flight', async () => {
    fillState.set({ status: 'filling' });

    await fillApproved();

    expect(executeScript).not.toHaveBeenCalled();
  });

  // A capture taken mid-write means the questions on screen are no longer the ones that were
  // filled, so reporting against them would attach the result to the wrong form.
  it('drops a result that lands after a newer capture', async () => {
    let release: (v: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    executeScript.mockImplementation(async () => {
      await pending;
      return [{ result: [{ locator: { by: 'name', value: 'q1' }, ok: true }] }];
    });

    const inFlight = fillApproved();
    ready(2000);
    release(null);
    await inFlight;

    expect(get(fillState)).toEqual({ status: 'idle' });
  });
});
