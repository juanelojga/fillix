// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message, MessageResponse, FieldFill, FieldSnapshot } from '../types';

// ---- Chrome API stubs (must be in place before content.ts is imported) ----

type ContentMessageListener = (
  msg: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (r: MessageResponse) => void,
) => boolean | undefined;

const messageListeners: ContentMessageListener[] = [];

vi.stubGlobal('chrome', {
  runtime: {
    onMessage: {
      addListener: vi.fn((cb: ContentMessageListener) => messageListeners.push(cb)),
    },
  },
});

// ---- Mock forms.ts ----
// detectFields returns [] so init() skips button injection.
// snapshotFields is controlled per-test.
// setFieldValue uses the real implementation so DOM mutations are verifiable.

const mockSnapshotFields = vi.fn<[], FieldSnapshot[]>().mockReturnValue([]);

vi.mock('../lib/forms', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    detectFields: vi.fn().mockReturnValue([]),
    snapshotFields: mockSnapshotFields,
  };
});

// ---- Helpers ----

async function loadContent(): Promise<void> {
  vi.resetModules();
  messageListeners.length = 0;
  await import('../content');
}

function fireMessage(msg: Message, sendResponse: (r: MessageResponse) => void = vi.fn()): void {
  const sender = {} as chrome.runtime.MessageSender;
  messageListeners.forEach((cb) => cb(msg, sender, sendResponse));
}

// ---- DETECT_FIELDS ----

describe('content.ts DETECT_FIELDS handler', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    await loadContent();
  });

  it('registers a chrome.runtime.onMessage listener on load', () => {
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
  });

  it('responds with { ok: true, fields } on DETECT_FIELDS', () => {
    const stubFields: FieldSnapshot[] = [
      { id: 'email', name: 'email', label: 'Email', currentValue: 'a@b.com', type: 'email' },
    ];
    mockSnapshotFields.mockReturnValue(stubFields);
    const sendResponse = vi.fn();
    fireMessage({ type: 'DETECT_FIELDS' }, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, fields: stubFields });
  });

  it('returns an empty fields array when no fillable fields exist', () => {
    mockSnapshotFields.mockReturnValue([]);
    const sendResponse = vi.fn();
    fireMessage({ type: 'DETECT_FIELDS' }, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, fields: [] });
  });
});

// ---- APPLY_FIELDS ----

describe('content.ts APPLY_FIELDS handler', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <input id="email" name="email" type="email" value="" />
      <input id="firstName" name="firstName" type="text" value="" />
    `;
    await loadContent();
  });

  it('applies proposedValue to the matched DOM element by id', () => {
    const fieldMap: FieldFill[] = [
      { fieldId: 'email', label: 'Email', currentValue: '', proposedValue: 'test@example.com' },
    ];
    fireMessage({ type: 'APPLY_FIELDS', fieldMap });
    const input = document.getElementById('email') as HTMLInputElement;
    expect(input.value).toBe('test@example.com');
  });

  it('uses editedValue over proposedValue when editedValue is set', () => {
    const fieldMap: FieldFill[] = [
      {
        fieldId: 'firstName',
        label: 'First Name',
        currentValue: '',
        proposedValue: 'Alice',
        editedValue: 'Bob',
      },
    ];
    fireMessage({ type: 'APPLY_FIELDS', fieldMap });
    expect((document.getElementById('firstName') as HTMLInputElement).value).toBe('Bob');
  });

  it('skips fields whose id is not found in the DOM without throwing', () => {
    const fieldMap: FieldFill[] = [
      { fieldId: 'nonexistent', label: 'Ghost', currentValue: '', proposedValue: 'x' },
    ];
    const sendResponse = vi.fn();
    expect(() => fireMessage({ type: 'APPLY_FIELDS', fieldMap }, sendResponse)).not.toThrow();
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, applied: 0 });
  });

  it('returns the count of successfully applied fills', () => {
    const fieldMap: FieldFill[] = [
      { fieldId: 'email', label: 'Email', currentValue: '', proposedValue: 'a@b.com' },
      { fieldId: 'firstName', label: 'Name', currentValue: '', proposedValue: 'Alice' },
      { fieldId: 'missing', label: 'Missing', currentValue: '', proposedValue: 'x' },
    ];
    const sendResponse = vi.fn();
    fireMessage({ type: 'APPLY_FIELDS', fieldMap }, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, applied: 2 });
  });

  it('dispatches input and change events when applying a value', () => {
    const input = document.getElementById('email') as HTMLInputElement;
    const inputSpy = vi.fn();
    const changeSpy = vi.fn();
    input.addEventListener('input', inputSpy);
    input.addEventListener('change', changeSpy);

    fireMessage({
      type: 'APPLY_FIELDS',
      fieldMap: [{ fieldId: 'email', label: 'Email', currentValue: '', proposedValue: 'x@y.com' }],
    });

    expect(inputSpy).toHaveBeenCalledOnce();
    expect(changeSpy).toHaveBeenCalledOnce();
  });

  it('falls back to querySelector by name when getElementById returns null', () => {
    document.body.innerHTML = `<input name="phone" type="tel" value="" />`;
    const fieldMap: FieldFill[] = [
      { fieldId: 'phone', label: 'Phone', currentValue: '', proposedValue: '555-1234' },
    ];
    fireMessage({ type: 'APPLY_FIELDS', fieldMap });
    const input = document.querySelector<HTMLInputElement>('[name="phone"]');
    expect(input?.value).toBe('555-1234');
  });
});
