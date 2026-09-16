// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MessageResponse } from '../types';
import type { FillableElement } from '../lib/forms';

// ---- Chrome API stubs (must be in place before content.ts is imported) ----

const mockSendMessage = vi.hoisted(() => vi.fn<[unknown], Promise<MessageResponse>>());
const mockAddListener = vi.hoisted(() => vi.fn());

vi.stubGlobal('chrome', {
  runtime: {
    id: 'test-extension-id',
    sendMessage: mockSendMessage,
    onMessage: { addListener: mockAddListener },
  },
});

// detectFields is controlled per-test; setFieldValue stays real so DOM
// mutations (and the input/change events React relies on) are verifiable.
type Detected = { element: FillableElement; context: { id?: string; type?: string } };
const mockDetectFields = vi.hoisted(() => vi.fn<[], Detected[]>().mockReturnValue([]));

vi.mock('../lib/forms', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, detectFields: mockDetectFields };
});

async function loadContent(): Promise<void> {
  vi.resetModules();
  await import('../content');
}

function detected(el: HTMLInputElement): Detected {
  return { element: el as FillableElement, context: { id: el.id, type: el.type } };
}

describe('content.ts trigger button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    mockDetectFields.mockReturnValue([]);
  });

  // The content script runs on every URL the user visits, so staying passive
  // until the button is clicked is a hard requirement, not a preference.
  it('registers no chrome.runtime.onMessage listener', async () => {
    await loadContent();
    expect(mockAddListener).not.toHaveBeenCalled();
  });

  it('injects no button when the page has no fillable fields', async () => {
    await loadContent();
    expect(document.getElementById('fillix-trigger')).toBeNull();
  });

  it('injects the button when fillable fields are present', async () => {
    document.body.innerHTML = `<input id="email" type="email" />`;
    const el = document.getElementById('email') as HTMLInputElement;
    mockDetectFields.mockReturnValue([detected(el)]);

    await loadContent();

    const btn = document.getElementById('fillix-trigger');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toBe('Fillix: fill');
  });

  it('does not inject a second button when one is already present', async () => {
    document.body.innerHTML = `<input id="email" type="email" />`;
    const el = document.getElementById('email') as HTMLInputElement;
    mockDetectFields.mockReturnValue([detected(el)]);

    await loadContent();
    await loadContent();

    expect(document.querySelectorAll('#fillix-trigger')).toHaveLength(1);
  });

  it('makes no network or inference call on load', async () => {
    document.body.innerHTML = `<input id="email" type="email" />`;
    const el = document.getElementById('email') as HTMLInputElement;
    mockDetectFields.mockReturnValue([detected(el)]);

    await loadContent();

    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

describe('content.ts fill on click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <input id="email" type="email" value="" />
      <input id="name" type="text" value="" />
    `;
    const email = document.getElementById('email') as HTMLInputElement;
    const name = document.getElementById('name') as HTMLInputElement;
    mockDetectFields.mockReturnValue([detected(email), detected(name)]);
  });

  async function clickFill(): Promise<void> {
    await loadContent();
    document.getElementById('fillix-trigger')?.click();
    // Let the fillAll() microtask chain settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('sends one OLLAMA_INFER message per detected field', async () => {
    mockSendMessage.mockResolvedValue({ ok: true, value: 'x' });
    await clickFill();

    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'OLLAMA_INFER' }));
  });

  it('writes the returned value into the field', async () => {
    mockSendMessage.mockResolvedValue({ ok: true, value: 'alice@example.com' });
    await clickFill();

    expect((document.getElementById('email') as HTMLInputElement).value).toBe('alice@example.com');
  });

  it('dispatches input and change so framework state updates', async () => {
    const email = document.getElementById('email') as HTMLInputElement;
    const inputSpy = vi.fn();
    const changeSpy = vi.fn();
    email.addEventListener('input', inputSpy);
    email.addEventListener('change', changeSpy);

    mockSendMessage.mockResolvedValue({ ok: true, value: 'x@y.com' });
    await clickFill();

    expect(inputSpy).toHaveBeenCalled();
    expect(changeSpy).toHaveBeenCalled();
  });

  // A failed parse comes back as '' rather than invented text — leave the field alone.
  it('leaves the field untouched when the model returns an empty value', async () => {
    mockSendMessage.mockResolvedValue({ ok: true, value: '' });
    await clickFill();

    expect((document.getElementById('email') as HTMLInputElement).value).toBe('');
  });

  it('leaves the field untouched when the background reports an error', async () => {
    mockSendMessage.mockResolvedValue({ ok: false, error: 'model not found' });
    await clickFill();

    expect((document.getElementById('email') as HTMLInputElement).value).toBe('');
  });

  it('re-enables the button after a run', async () => {
    mockSendMessage.mockResolvedValue({ ok: true, value: 'x' });
    await clickFill();

    const btn = document.getElementById('fillix-trigger') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Fillix: fill');
  });
});
