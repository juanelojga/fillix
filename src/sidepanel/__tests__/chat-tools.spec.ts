// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run --environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as ChatToolsModule from '../chat-tools';

vi.mock('../../lib/storage', () => ({}));

function buildChatDom(): HTMLElement {
  const messages = document.createElement('div');
  messages.id = 'messages';
  document.body.innerHTML = '';
  document.body.appendChild(messages);
  return messages;
}

// ---------- appendToolIndicator ----------

describe('appendToolIndicator', () => {
  beforeEach(() => {
    buildChatDom();
  });

  it('inserts a .tool-indicator.loading element into the messages container', async () => {
    const { appendToolIndicator } = (await import('../chat-tools')) as typeof ChatToolsModule;
    const messagesEl = document.getElementById('messages') as HTMLElement;
    appendToolIndicator('web_search', { query: 'AI news' }, messagesEl);
    const indicator = messagesEl.querySelector('.tool-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator?.classList.contains('loading')).toBe(true);
  });

  it('includes the tool name in the indicator text', async () => {
    const { appendToolIndicator } = (await import('../chat-tools')) as typeof ChatToolsModule;
    const messagesEl = document.getElementById('messages') as HTMLElement;
    appendToolIndicator('wikipedia', { title: 'TypeScript' }, messagesEl);
    const indicator = messagesEl.querySelector('.tool-indicator');
    expect(indicator?.textContent).toContain('wikipedia');
  });

  it('includes the primary arg value in the indicator text', async () => {
    const { appendToolIndicator } = (await import('../chat-tools')) as typeof ChatToolsModule;
    const messagesEl = document.getElementById('messages') as HTMLElement;
    appendToolIndicator('web_search', { query: 'climate change' }, messagesEl);
    const indicator = messagesEl.querySelector('.tool-indicator');
    expect(indicator?.textContent).toContain('climate change');
  });

  it('returns the created element', async () => {
    const { appendToolIndicator } = (await import('../chat-tools')) as typeof ChatToolsModule;
    const messagesEl = document.getElementById('messages') as HTMLElement;
    const el = appendToolIndicator('fetch_url', { url: 'https://example.com' }, messagesEl);
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.classList.contains('tool-indicator')).toBe(true);
  });

  it('handles empty args gracefully', async () => {
    const { appendToolIndicator } = (await import('../chat-tools')) as typeof ChatToolsModule;
    const messagesEl = document.getElementById('messages') as HTMLElement;
    const el = appendToolIndicator('wikipedia', {}, messagesEl);
    expect(el.classList.contains('tool-indicator')).toBe(true);
    expect(el.textContent).toContain('wikipedia');
  });
});

// ---------- resolveToolIndicator ----------

describe('resolveToolIndicator', () => {
  beforeEach(() => {
    buildChatDom();
  });

  it('updates class from loading to done', async () => {
    const { appendToolIndicator, resolveToolIndicator } =
      (await import('../chat-tools')) as typeof ChatToolsModule;
    const messagesEl = document.getElementById('messages') as HTMLElement;
    const el = appendToolIndicator('web_search', { query: 'x' }, messagesEl);
    resolveToolIndicator(el, 'some result');
    expect(el.classList.contains('done')).toBe(true);
    expect(el.classList.contains('loading')).toBe(false);
  });

  it('stores result in data-result attribute', async () => {
    const { appendToolIndicator, resolveToolIndicator } =
      (await import('../chat-tools')) as typeof ChatToolsModule;
    const messagesEl = document.getElementById('messages') as HTMLElement;
    const el = appendToolIndicator('wikipedia', { title: 'AI' }, messagesEl);
    resolveToolIndicator(el, 'Artificial intelligence is...');
    expect(el.dataset['result']).toBe('Artificial intelligence is...');
  });
});

// ---------- tool indicator expand/collapse ----------

describe('tool indicator click — expand', () => {
  beforeEach(() => {
    buildChatDom();
  });

  it('clicking a done indicator toggles a result preview showing ≤500 chars', async () => {
    const { appendToolIndicator, resolveToolIndicator } =
      (await import('../chat-tools')) as typeof ChatToolsModule;
    const messagesEl = document.getElementById('messages') as HTMLElement;
    const el = appendToolIndicator('web_search', { query: 'test' }, messagesEl);
    const longResult = 'x'.repeat(600);
    resolveToolIndicator(el, longResult);

    el.click();
    const preview = el.querySelector('.tool-result-preview');
    expect(preview).not.toBeNull();
    expect((preview?.textContent ?? '').length).toBeLessThanOrEqual(500);

    el.click();
    expect(el.querySelector('.tool-result-preview')).toBeNull();
  });
});
