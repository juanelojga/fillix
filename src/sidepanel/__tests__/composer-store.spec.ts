import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

const sendMessage = vi.fn();
vi.stubGlobal('chrome', {
  runtime: { sendMessage },
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
});

const { composerState, seed, resetComposer } = await import('../stores/composer');
const { startTopics } = await import('../stores/composer-topics');
const { selectedPlaybookId } = await import('../stores/playbook');
const { ollamaConfig, workflowModel } = await import('../stores/settings');

const TOPICS = [{ title: 'Boring tech ships', angle: 'Why', pillar: 'startups' as const }];

/** A promise whose resolution the test controls, to open a window mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ ok: true, topics: TOPICS });
  selectedPlaybookId.set('linkedin-post');
  ollamaConfig.set({ baseUrl: 'http://localhost:11434', model: 'gemma4:12b' });
  workflowModel.set('');
  resetComposer();
});

afterEach(() => {
  selectedPlaybookId.set('toptal');
});

describe('composer session', () => {
  it('starts idle at stage one', () => {
    expect(get(composerState)).toEqual({ stage: 'topics', status: 'idle' });
  });

  it('runs and lands the topics', async () => {
    await startTopics();
    expect(get(composerState)).toEqual({ stage: 'topics', status: 'ready', topics: TOPICS });
  });

  it('sends the seed the user typed', async () => {
    seed.set('boring tech');
    await startTopics();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'POST_TOPICS', seed: 'boring tech' }),
    );
  });

  /**
   * The panel resolves the model and sends the result, `stores/news.ts`'s rule: the worker
   * is told exactly the model the header displays, so the failure hint and the on-screen
   * attribution can never name a model that did not run.
   */
  it('sends the resolved active model when no workflow preference is set', async () => {
    await startTopics();
    expect(sendMessage.mock.calls[0]?.[0]).toEqual({
      type: 'POST_TOPICS',
      seed: '',
      model: 'gemma4:12b',
    });
  });

  it('sends no model at all when nothing resolves, leaving the worker on its own default', async () => {
    ollamaConfig.set({ baseUrl: 'http://localhost:11434', model: '' });
    await startTopics();
    expect(sendMessage.mock.calls[0]?.[0].model).toBeUndefined();
  });

  it('sends the workflow model when one is chosen', async () => {
    workflowModel.set('qwen3:8b');
    await startTopics();
    expect(sendMessage.mock.calls[0]?.[0].model).toBe('qwen3:8b');
  });

  /**
   * The failure this prevents: a run started under the LinkedIn playbook resolves after the
   * user has switched to Toptal, and its topics land in a session that is supposed to be gone.
   */
  it('drops a reply that arrives after the playbook changed', async () => {
    const pending = deferred<unknown>();
    sendMessage.mockReturnValue(pending.promise);

    const run = startTopics();
    expect(get(composerState).status).toBe('running');

    selectedPlaybookId.set('toptal');
    pending.resolve({ ok: true, topics: TOPICS });
    await run;

    expect(get(composerState)).toEqual({ stage: 'topics', status: 'idle' });
  });

  it('clears the seed when the playbook changes, so nothing survives into a new session', () => {
    seed.set('boring tech');
    selectedPlaybookId.set('toptal');
    expect(get(seed)).toBe('');
  });

  it('refuses a second press while one is in flight', async () => {
    const pending = deferred<unknown>();
    sendMessage.mockReturnValue(pending.promise);
    const run = startTopics();
    await startTopics();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    pending.resolve({ ok: true, topics: TOPICS });
    await run;
  });

  it('words a worker failure through the diagnostics module, never raw', async () => {
    sendMessage.mockResolvedValue({ ok: false, error: 'Failed to fetch' });
    await startTopics();
    const state = get(composerState);
    expect(state.status).toBe('failed');
    if (state.status !== 'failed') return;
    expect(state.diagnosis.summary).toBe("Can't reach Ollama");
    expect(state.diagnosis.detail).toBe('Failed to fetch');
    expect(state.diagnosis.hint).toContain('Suggest topics');
  });

  /**
   * A suspended MV3 worker returns undefined rather than throwing, and the panel must word
   * that rather than spinning forever.
   */
  it('handles a worker that answers with nothing at all', async () => {
    sendMessage.mockResolvedValue(undefined);
    await startTopics();
    expect(get(composerState).status).toBe('failed');
  });

  it('handles a response of the wrong shape rather than trusting the key is there', async () => {
    sendMessage.mockResolvedValue({ ok: true, summary: 'wrong arm' });
    await startTopics();
    expect(get(composerState).status).toBe('failed');
  });

  /**
   * A worker from an older build — or one that threw before it could word anything — answers
   * with no `error` at all. `diagnosePostFailure` is a pure function of strings, so handing it
   * undefined would crash the panel on the one path whose job is to report failure gracefully.
   */
  it('words a failure that arrives without an error string', async () => {
    sendMessage.mockResolvedValue({});
    await startTopics();
    const state = get(composerState);
    expect(state.status).toBe('failed');
    if (state.status !== 'failed') return;
    expect(state.diagnosis.detail).toContain('without saying why');
  });

  it('names the model that actually ran in the failure hint', async () => {
    workflowModel.set('qwen3:8b');
    sendMessage.mockResolvedValue({ ok: false, error: 'Ollama /api/generate returned 404' });
    await startTopics();
    const state = get(composerState);
    if (state.status !== 'failed') throw new Error('expected failure');
    expect(state.diagnosis.hint).toContain('qwen3:8b');
  });
});
