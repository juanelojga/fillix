// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';

// DOM wiring is tested via jsdom (Vitest default environment).
// We mock the chat controller and storage to isolate main.ts logic.

vi.mock('../chat', () => ({
  createChatController: vi.fn(() => ({
    send: vi.fn(),
    stop: vi.fn(),
    clear: vi.fn(),
    messages: [],
    state: 'idle' as const,
  })),
}));

vi.mock('../../lib/storage', () => ({
  getOllamaConfig: vi.fn(async () => ({ baseUrl: 'http://localhost:11434', model: 'llama3.2' })),
  getChatConfig: vi.fn(async () => ({ systemPrompt: 'You are helpful.' })),
  setOllamaConfig: vi.fn(async () => undefined),
  setChatConfig: vi.fn(async () => undefined),
}));

vi.mock('../../lib/ollama', () => ({
  listModels: vi.fn(async () => ['llama3.2', 'mistral']),
}));

// Helper: build the minimal HTML the side panel needs
function buildDOM() {
  document.body.innerHTML = `
    <button id="chat-tab">Chat</button>
    <button id="settings-tab">Settings</button>
    <button id="new-conversation">New conversation</button>
    <div id="chat-view">
      <div id="messages"></div>
      <textarea id="input"></textarea>
      <button id="send">Send</button>
      <button id="stop" hidden>Stop</button>
    </div>
    <div id="settings-view" hidden>
      <input id="baseUrl" />
      <select id="model"></select>
      <button id="refreshModels">Refresh</button>
      <textarea id="systemPrompt"></textarea>
      <button id="saveSettings">Save</button>
      <div id="settings-status"></div>
      <div id="localhost-warning" hidden></div>
    </div>
  `;
}

describe('side panel main — tab switching', () => {
  beforeEach(() => {
    buildDOM();
    vi.resetModules();
  });

  it('clicking settings-tab hides chat-view and shows settings-view', async () => {
    const { initSidePanel } = await import('../main');
    await initSidePanel();

    document.getElementById('settings-tab')!.click();

    expect((document.getElementById('chat-view') as HTMLElement).hidden).toBe(true);
    expect((document.getElementById('settings-view') as HTMLElement).hidden).toBe(false);
  });

  it('clicking chat-tab shows chat-view and hides settings-view', async () => {
    const { initSidePanel } = await import('../main');
    await initSidePanel();

    document.getElementById('settings-tab')!.click();
    document.getElementById('chat-tab')!.click();

    expect((document.getElementById('chat-view') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('settings-view') as HTMLElement).hidden).toBe(true);
  });
});

describe('side panel main — send behaviour', () => {
  beforeEach(() => {
    buildDOM();
    vi.resetModules();
  });

  it('Enter key on non-empty input calls controller.send()', async () => {
    const chatModule = await import('../chat');
    const mockSend = vi.fn();
    (chatModule.createChatController as ReturnType<typeof vi.fn>).mockReturnValue({
      send: mockSend,
      stop: vi.fn(),
      clear: vi.fn(),
      messages: [],
      state: 'idle' as const,
    });

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    const input = document.getElementById('input') as HTMLTextAreaElement;
    input.value = 'Hello world';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(mockSend).toHaveBeenCalledWith('Hello world', expect.any(String));
  });

  it('Shift+Enter does NOT send — inserts newline', async () => {
    const chatModule = await import('../chat');
    const mockSend = vi.fn();
    (chatModule.createChatController as ReturnType<typeof vi.fn>).mockReturnValue({
      send: mockSend,
      stop: vi.fn(),
      clear: vi.fn(),
      messages: [],
      state: 'idle' as const,
    });

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    const input = document.getElementById('input') as HTMLTextAreaElement;
    input.value = 'Hello';
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
    );

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('Enter on empty input is a no-op (send not called)', async () => {
    const chatModule = await import('../chat');
    const mockSend = vi.fn();
    (chatModule.createChatController as ReturnType<typeof vi.fn>).mockReturnValue({
      send: mockSend,
      stop: vi.fn(),
      clear: vi.fn(),
      messages: [],
      state: 'idle' as const,
    });

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    const input = document.getElementById('input') as HTMLTextAreaElement;
    input.value = '   '; // only whitespace
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('send button click calls controller.send() with input value', async () => {
    const chatModule = await import('../chat');
    const mockSend = vi.fn();
    (chatModule.createChatController as ReturnType<typeof vi.fn>).mockReturnValue({
      send: mockSend,
      stop: vi.fn(),
      clear: vi.fn(),
      messages: [],
      state: 'idle' as const,
    });

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    const input = document.getElementById('input') as HTMLTextAreaElement;
    input.value = 'Hello';
    document.getElementById('send')!.click();

    expect(mockSend).toHaveBeenCalledWith('Hello', expect.any(String));
  });
});

describe('side panel main — streaming UI state', () => {
  beforeEach(() => {
    buildDOM();
    vi.resetModules();
  });

  it('send button is disabled and stop button shown while streaming', async () => {
    const chatModule = await import('../chat');
    let capturedOnToken: ((t: string) => void) | undefined;
    (chatModule.createChatController as ReturnType<typeof vi.fn>).mockImplementation(
      ({ onToken }: { onToken: (t: string) => void }) => {
        capturedOnToken = onToken;
        return {
          send: vi.fn(),
          stop: vi.fn(),
          clear: vi.fn(),
          messages: [],
          state: 'idle' as const,
        };
      },
    );

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    const input = document.getElementById('input') as HTMLTextAreaElement;
    input.value = 'Hello';
    document.getElementById('send')!.click();

    // Simulate streaming starting
    capturedOnToken?.('tok');

    expect((document.getElementById('send') as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById('stop') as HTMLButtonElement).hidden).toBe(false);
  });

  it('send button re-enabled and stop hidden after done', async () => {
    const chatModule = await import('../chat');
    let capturedOnDone: (() => void) | undefined;
    (chatModule.createChatController as ReturnType<typeof vi.fn>).mockImplementation(
      ({ onDone }: { onDone: () => void }) => {
        capturedOnDone = onDone;
        return {
          send: vi.fn(),
          stop: vi.fn(),
          clear: vi.fn(),
          messages: [],
          state: 'idle' as const,
        };
      },
    );

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    // Trigger done callback
    capturedOnDone?.();

    expect((document.getElementById('send') as HTMLButtonElement).disabled).toBe(false);
    expect((document.getElementById('stop') as HTMLButtonElement).hidden).toBe(true);
  });
});

describe('side panel main — stop button', () => {
  beforeEach(() => {
    buildDOM();
    vi.resetModules();
  });

  it('clicking stop calls controller.stop()', async () => {
    const chatModule = await import('../chat');
    const mockStop = vi.fn();
    (chatModule.createChatController as ReturnType<typeof vi.fn>).mockReturnValue({
      send: vi.fn(),
      stop: mockStop,
      clear: vi.fn(),
      messages: [],
      state: 'idle' as const,
    });

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    document.getElementById('stop')!.click();

    expect(mockStop).toHaveBeenCalledTimes(1);
  });
});

describe('side panel main — new conversation', () => {
  beforeEach(() => {
    buildDOM();
    vi.resetModules();
  });

  it('clicking new-conversation calls controller.clear()', async () => {
    const chatModule = await import('../chat');
    const mockClear = vi.fn();
    (chatModule.createChatController as ReturnType<typeof vi.fn>).mockReturnValue({
      send: vi.fn(),
      stop: vi.fn(),
      clear: mockClear,
      messages: [],
      state: 'idle' as const,
    });

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    document.getElementById('new-conversation')!.click();

    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it('clicking new-conversation clears #messages DOM', async () => {
    const { initSidePanel } = await import('../main');
    await initSidePanel();

    const messages = document.getElementById('messages')!;
    messages.innerHTML = '<div>old message</div>';

    document.getElementById('new-conversation')!.click();

    expect(messages.innerHTML).toBe('');
  });
});

describe('side panel main — onToken appends to current assistant bubble', () => {
  beforeEach(() => {
    buildDOM();
    vi.resetModules();
  });

  it('appends token text to the assistant bubble textContent', async () => {
    const chatModule = await import('../chat');
    let capturedOnToken: ((t: string) => void) | undefined;
    (chatModule.createChatController as ReturnType<typeof vi.fn>).mockImplementation(
      ({ onToken }: { onToken: (t: string) => void }) => {
        capturedOnToken = onToken;
        return {
          send: vi.fn(),
          stop: vi.fn(),
          clear: vi.fn(),
          messages: [],
          state: 'idle' as const,
        };
      },
    );

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    // Trigger a send to create an assistant bubble
    const input = document.getElementById('input') as HTMLTextAreaElement;
    input.value = 'Hi';
    document.getElementById('send')!.click();

    capturedOnToken?.('Hello');
    capturedOnToken?.(' world');

    const bubbles = document.querySelectorAll('.message.assistant');
    expect(bubbles[bubbles.length - 1].textContent).toBe('Hello world');
  });
});

describe('side panel main — error handling', () => {
  beforeEach(() => {
    buildDOM();
    vi.resetModules();
  });

  it('onError shows inline error in the assistant bubble including the base URL', async () => {
    const chatModule = await import('../chat');
    let capturedOnError: ((e: string) => void) | undefined;
    (chatModule.createChatController as ReturnType<typeof vi.fn>).mockImplementation(
      ({ onError }: { onError: (e: string) => void }) => {
        capturedOnError = onError;
        return {
          send: vi.fn(),
          stop: vi.fn(),
          clear: vi.fn(),
          messages: [],
          state: 'idle' as const,
        };
      },
    );

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    const input = document.getElementById('input') as HTMLTextAreaElement;
    input.value = 'Hi';
    document.getElementById('send')!.click();

    capturedOnError?.('connection refused');

    const bubbles = document.querySelectorAll('.message.assistant');
    const lastBubble = bubbles[bubbles.length - 1];
    expect(lastBubble.textContent).toContain('connection refused');
    expect(lastBubble.textContent).toContain('localhost:11434');
  });
});

// ── Sprint 4: Settings view ──────────────────────────────────────────────────

describe('side panel main — settings population on init', () => {
  beforeEach(() => {
    buildDOM();
    vi.resetModules();
  });

  it('populates #baseUrl from getOllamaConfig on init', async () => {
    const storageModule = await import('../../lib/storage');
    (storageModule.getOllamaConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
    });

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    expect((document.getElementById('baseUrl') as HTMLInputElement).value).toBe(
      'http://localhost:11434',
    );
  });

  it('populates #systemPrompt from getChatConfig on init', async () => {
    const storageModule = await import('../../lib/storage');
    (storageModule.getChatConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      systemPrompt: 'Be concise.',
    });

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    expect((document.getElementById('systemPrompt') as HTMLTextAreaElement).value).toBe(
      'Be concise.',
    );
  });

  it('populates #model select via OLLAMA_LIST_MODELS on init', async () => {
    Object.assign(globalThis, {
      chrome: {
        runtime: {
          sendMessage: vi.fn(async () => ({ ok: true, models: ['llama3.2', 'mistral'] })),
          connect: vi.fn(() => ({
            onMessage: { addListener: vi.fn() },
            onDisconnect: { addListener: vi.fn() },
            postMessage: vi.fn(),
            disconnect: vi.fn(),
          })),
        },
      },
    });

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    const modelSelect = document.getElementById('model') as HTMLSelectElement;
    const options = Array.from(modelSelect.options).map((o) => o.value);
    expect(options).toContain('llama3.2');
    expect(options).toContain('mistral');
  });
});

describe('side panel main — refresh models button', () => {
  beforeEach(() => {
    buildDOM();
    vi.resetModules();
  });

  it('clicking #refreshModels sends OLLAMA_LIST_MODELS and repopulates #model', async () => {
    const sendMessageMock = vi.fn(async () => ({ ok: true, models: ['llama3.2', 'gemma'] }));
    Object.assign(globalThis, {
      chrome: {
        runtime: {
          sendMessage: sendMessageMock,
          connect: vi.fn(() => ({
            onMessage: { addListener: vi.fn() },
            onDisconnect: { addListener: vi.fn() },
            postMessage: vi.fn(),
            disconnect: vi.fn(),
          })),
        },
      },
    });

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    sendMessageMock.mockResolvedValueOnce({ ok: true, models: ['phi3', 'mistral'] });
    document.getElementById('refreshModels')!.click();
    await Promise.resolve();
    await Promise.resolve(); // two ticks for async chain

    const modelSelect = document.getElementById('model') as HTMLSelectElement;
    const options = Array.from(modelSelect.options).map((o) => o.value);
    expect(options).toContain('phi3');
    expect(options).toContain('mistral');
  });
});

describe('side panel main — localhost warning', () => {
  beforeEach(() => {
    buildDOM();
    vi.resetModules();
  });

  it('hides #localhost-warning when baseUrl is http://localhost:11434 on init', async () => {
    const storageModule = await import('../../lib/storage');
    (storageModule.getOllamaConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
    });

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    expect((document.getElementById('localhost-warning') as HTMLElement).hidden).toBe(true);
  });

  it('shows #localhost-warning when baseUrl differs from http://localhost:11434 on init', async () => {
    const storageModule = await import('../../lib/storage');
    (storageModule.getOllamaConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      baseUrl: 'http://remote-server:11434',
      model: 'llama3.2',
    });

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    expect((document.getElementById('localhost-warning') as HTMLElement).hidden).toBe(false);
  });

  it('shows #localhost-warning when #baseUrl input changes to non-localhost value', async () => {
    const { initSidePanel } = await import('../main');
    await initSidePanel();

    const baseUrlInput = document.getElementById('baseUrl') as HTMLInputElement;
    baseUrlInput.value = 'http://other-host:11434';
    baseUrlInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect((document.getElementById('localhost-warning') as HTMLElement).hidden).toBe(false);
  });

  it('hides #localhost-warning when #baseUrl input changes back to localhost', async () => {
    const storageModule = await import('../../lib/storage');
    (storageModule.getOllamaConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      baseUrl: 'http://remote:11434',
      model: 'llama3.2',
    });

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    const baseUrlInput = document.getElementById('baseUrl') as HTMLInputElement;
    baseUrlInput.value = 'http://localhost:11434';
    baseUrlInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect((document.getElementById('localhost-warning') as HTMLElement).hidden).toBe(true);
  });
});

describe('side panel main — save settings', () => {
  beforeEach(() => {
    buildDOM();
    vi.resetModules();
  });

  it('clicking #saveSettings calls setOllamaConfig with current baseUrl and model', async () => {
    const storageModule = await import('../../lib/storage');

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    const baseUrlInput = document.getElementById('baseUrl') as HTMLInputElement;
    const modelSelect = document.getElementById('model') as HTMLSelectElement;
    baseUrlInput.value = 'http://localhost:11434';
    const opt = document.createElement('option');
    opt.value = 'mistral';
    opt.selected = true;
    modelSelect.appendChild(opt);

    document.getElementById('saveSettings')!.click();
    await Promise.resolve(); // flush async

    expect(storageModule.setOllamaConfig).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:11434',
      model: expect.any(String),
    });
  });

  it('clicking #saveSettings calls setChatConfig with current systemPrompt', async () => {
    const storageModule = await import('../../lib/storage');

    const { initSidePanel } = await import('../main');
    await initSidePanel();

    const systemPromptInput = document.getElementById('systemPrompt') as HTMLTextAreaElement;
    systemPromptInput.value = 'New prompt';

    document.getElementById('saveSettings')!.click();
    await Promise.resolve();

    expect(storageModule.setChatConfig).toHaveBeenCalledWith({ systemPrompt: 'New prompt' });
  });

  it('shows "Saved" in #settings-status after saving', async () => {
    const { initSidePanel } = await import('../main');
    await initSidePanel();

    document.getElementById('saveSettings')!.click();
    await Promise.resolve();

    expect(document.getElementById('settings-status')!.textContent).toBe('Saved');
  });
});
