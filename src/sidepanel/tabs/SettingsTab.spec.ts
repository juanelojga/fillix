import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SettingsTab from './SettingsTab.svelte';

describe('SettingsTab (smoke)', () => {
  it('renders without crashing', () => {
    expect(() => render(SettingsTab)).not.toThrow();
  });

  it('renders a save button', () => {
    render(SettingsTab);
    expect(screen.getByRole('button', { name: /save settings/i })).toBeInTheDocument();
  });

  it('renders the system prompt section', () => {
    render(SettingsTab);
    expect(screen.getByRole('heading', { name: /system prompt/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset to default/i })).toBeInTheDocument();
  });

  it('renders the Ollama section heading', () => {
    render(SettingsTab);
    expect(screen.getByRole('heading', { name: /ollama/i })).toBeInTheDocument();
  });
});

describe('SettingsTab (manual model list)', () => {
  it('renders an Add button for the model list', () => {
    render(SettingsTab);
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
  });

  it('renders a base URL field', () => {
    render(SettingsTab);
    expect(screen.getByLabelText(/base url/i)).toBeInTheDocument();
  });

  it('has no Refresh models button — the list is manual', () => {
    render(SettingsTab);
    expect(screen.queryByRole('button', { name: /refresh model/i })).not.toBeInTheDocument();
  });
});

describe('SettingsTab (model test result)', () => {
  const MODEL = 'qwen3:8b';
  const BASE_URL = 'http://localhost:11434';

  /** Resolves once the model list has been loaded from storage and rendered. */
  async function renderWithModel() {
    const result = render(SettingsTab);
    await screen.findByRole('button', { name: `Test ${MODEL}` });
    return result;
  }

  beforeEach(() => {
    vi.spyOn(chrome.storage.local, 'get').mockImplementation((async () => ({
      models: [MODEL],
      ollama: { baseUrl: BASE_URL, model: MODEL },
    })) as typeof chrome.storage.local.get);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockTestModel(response: unknown | Promise<unknown>) {
    vi.spyOn(chrome.runtime, 'sendMessage').mockImplementation((async (msg: { type: string }) =>
      msg.type === 'TEST_MODEL' ? await response : {}) as typeof chrome.runtime.sendMessage);
  }

  it('labels each Test button with its model so they are distinguishable', async () => {
    await renderWithModel();
    expect(screen.getByRole('button', { name: `Test ${MODEL}` })).toBeInTheDocument();
  });

  it('shows no result before the model has been tested', async () => {
    const { container } = await renderWithModel();
    expect(container.textContent).not.toContain('Working');
    expect(container.textContent).not.toContain('Model not installed');
  });

  it('disables the button and reads "Testing…" while in flight', async () => {
    mockTestModel(new Promise(() => {}));
    await renderWithModel();
    const button = screen.getByRole('button', { name: `Test ${MODEL}` });
    await fireEvent.click(button);
    await waitFor(() => expect(button.textContent?.trim()).toBe('Testing…'));
    expect(button).toBeDisabled();
  });

  it('reports a success as "Working" with the latency, not a bare glyph', async () => {
    mockTestModel({ ok: true, latencyMs: 312 });
    const { container } = await renderWithModel();
    await fireEvent.click(screen.getByRole('button', { name: `Test ${MODEL}` }));
    await waitFor(() => expect(container.textContent).toContain('Working · 312 ms'));
    expect(container.textContent).toContain('Ollama replied to a test prompt');
  });

  it('renders a slow result in seconds rather than four-digit milliseconds', async () => {
    mockTestModel({ ok: true, latencyMs: 11847 });
    const { container } = await renderWithModel();
    await fireEvent.click(screen.getByRole('button', { name: `Test ${MODEL}` }));
    await waitFor(() => expect(container.textContent).toContain('Working · 11.8 s'));
    expect(container.textContent).not.toContain('11847');
  });

  it('announces the outcome through an aria-live region', async () => {
    mockTestModel({ ok: true, latencyMs: 312 });
    const { container } = await renderWithModel();
    await fireEvent.click(screen.getByRole('button', { name: `Test ${MODEL}` }));
    await waitFor(() => expect(container.textContent).toContain('Working'));
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Working');
  });

  it('turns a 404 into a diagnosis, a next step, and the raw error', async () => {
    mockTestModel({
      ok: false,
      error: `Ollama /api/chat returned 404: model '${MODEL}' not found`,
    });
    const { container } = await renderWithModel();
    await fireEvent.click(screen.getByRole('button', { name: `Test ${MODEL}` }));
    await waitFor(() => expect(container.textContent).toContain('Model not installed'));
    expect(container.textContent).toContain(`ollama pull ${MODEL}`);
    expect(container.textContent).toContain(`model '${MODEL}' not found`);
    // The request line is the clue that shows which base URL was actually contacted.
    expect(container.textContent).toContain(`POST ${BASE_URL}/api/chat`);
  });

  it('turns an unreachable server into a diagnosis naming the base URL', async () => {
    mockTestModel({ ok: false, error: 'Failed to fetch' });
    const { container } = await renderWithModel();
    await fireEvent.click(screen.getByRole('button', { name: `Test ${MODEL}` }));
    await waitFor(() => expect(container.textContent).toContain("Can't reach Ollama"));
    expect(container.textContent).toContain(BASE_URL);
    expect(container.textContent).toContain('ollama serve');
  });

  it('turns a 403 into the OLLAMA_ORIGINS hint', async () => {
    mockTestModel({ ok: false, error: 'Ollama /api/chat returned 403: Forbidden' });
    const { container } = await renderWithModel();
    await fireEvent.click(screen.getByRole('button', { name: `Test ${MODEL}` }));
    await waitFor(() => expect(container.textContent).toContain('Ollama refused the extension'));
    expect(container.textContent).toContain('OLLAMA_ORIGINS');
  });
});

describe('SettingsTab (web search)', () => {
  const KEY = 'tvly-abc';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Resolves once the stored key has been hydrated into the field. */
  async function renderWithKey(stored = KEY) {
    vi.spyOn(chrome.storage.local, 'get').mockImplementation((async () => ({
      tavilyConfig: { apiKey: stored },
    })) as typeof chrome.storage.local.get);
    vi.spyOn(chrome.storage.local, 'set').mockImplementation(
      (async () => undefined) as typeof chrome.storage.local.set,
    );
    const result = render(SettingsTab);
    if (stored) await screen.findByRole('button', { name: /remove key/i });
    return result;
  }

  function mockTest(response: unknown | Promise<unknown>) {
    vi.spyOn(chrome.runtime, 'sendMessage').mockImplementation((async (msg: { type: string }) =>
      msg.type === 'TEST_TAVILY' ? await response : {}) as typeof chrome.runtime.sendMessage);
  }

  const testButton = () => screen.getByRole('button', { name: /^test$/i });

  it('renders the section heading', () => {
    render(SettingsTab);
    expect(screen.getByRole('heading', { name: /web search/i })).toBeInTheDocument();
  });

  it('masks the key field', () => {
    const { container } = render(SettingsTab);
    expect(container.querySelector('#tavily-key')).toHaveAttribute('type', 'password');
  });

  it('cannot be tested with nothing pasted in', () => {
    render(SettingsTab);
    expect(testButton()).toBeDisabled();
  });

  // Nothing to remove on a fresh install, so the control would only read as an error.
  it('offers no Remove key until one is stored', () => {
    render(SettingsTab);
    expect(screen.queryByRole('button', { name: /remove key/i })).not.toBeInTheDocument();
  });

  it('hydrates a stored key and offers to remove it', async () => {
    await renderWithKey();
    expect(screen.getByRole('button', { name: /remove key/i })).toBeInTheDocument();
  });

  it('reports a success as "Working" with the latency', async () => {
    mockTest({ ok: true, tavily: { latencyMs: 312, used: 150, limit: 1000 } });
    const { container } = await renderWithKey();
    await fireEvent.click(testButton());
    await waitFor(() => expect(container.textContent).toContain('Working · 312 ms'));
  });

  // The model is what spends the allowance, and a turn can search more than once, so the figure
  // belongs on screen rather than in a dashboard the user has to go and find.
  it('shows how much of the allowance is left', async () => {
    mockTest({ ok: true, tavily: { latencyMs: 312, used: 150, limit: 1000 } });
    const { container } = await renderWithKey();
    await fireEvent.click(testButton());
    await waitFor(() => expect(container.textContent).toContain('150 of 1000 credits used'));
  });

  it('says only that the key was accepted when Tavily reported no figures', async () => {
    mockTest({ ok: true, tavily: { latencyMs: 90, used: null, limit: null } });
    const { container } = await renderWithKey();
    await fireEvent.click(testButton());
    await waitFor(() => expect(container.textContent).toContain('Tavily accepted the key'));
    expect(container.textContent).not.toContain('credits used');
  });

  it('turns a 401 into a diagnosis, a next step, the raw error and the endpoint', async () => {
    mockTest({
      ok: false,
      error: 'Tavily /usage returned 401: Unauthorized: missing or invalid API key.',
    });
    const { container } = await renderWithKey();
    await fireEvent.click(testButton());
    await waitFor(() => expect(container.textContent).toContain('Tavily rejected the key'));
    expect(container.textContent).toContain('tvly-');
    expect(container.textContent).toContain('missing or invalid API key');
    expect(container.textContent).toContain('GET https://api.tavily.com/usage');
  });

  it('turns a spent plan into its own diagnosis rather than a bad-key one', async () => {
    mockTest({ ok: false, error: 'Tavily /usage returned 432: plan limit exceeded' });
    const { container } = await renderWithKey();
    await fireEvent.click(testButton());
    await waitFor(() => expect(container.textContent).toContain('Tavily credits used up'));
    expect(container.textContent).not.toContain('rejected the key');
  });

  it('announces the outcome through an aria-live region', async () => {
    mockTest({ ok: true, tavily: { latencyMs: 312, used: null, limit: null } });
    const { container } = await renderWithKey();
    await fireEvent.click(testButton());
    await waitFor(() => expect(container.textContent).toContain('Working'));
    const regions = [...container.querySelectorAll('[aria-live="polite"]')];
    expect(regions.some((r) => r.textContent?.includes('Working'))).toBe(true);
  });
});
