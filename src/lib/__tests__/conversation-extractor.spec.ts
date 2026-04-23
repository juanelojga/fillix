// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractConversation, detectPlatform } from '../conversation-extractor';

function setHostname(hostname: string): void {
  vi.stubGlobal('location', { hostname });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── detectPlatform ────────────────────────────────────────────────────────────

describe('detectPlatform', () => {
  it('returns "whatsapp" on web.whatsapp.com', () => {
    setHostname('web.whatsapp.com');
    expect(detectPlatform()).toBe('whatsapp');
  });

  it('returns "linkedin" on www.linkedin.com', () => {
    setHostname('www.linkedin.com');
    expect(detectPlatform()).toBe('linkedin');
  });

  it('returns null for an unknown hostname', () => {
    setHostname('example.com');
    expect(detectPlatform()).toBeNull();
  });
});

// ── extractConversation — unknown platform ────────────────────────────────────

describe('extractConversation — unknown platform', () => {
  beforeEach(() => {
    setHostname('example.com');
    document.body.innerHTML = '';
  });

  it('returns empty array', () => {
    expect(extractConversation()).toEqual([]);
  });
});

// ── extractConversation — WhatsApp Web ────────────────────────────────────────

describe('extractConversation — WhatsApp Web', () => {
  beforeEach(() => {
    setHostname('web.whatsapp.com');
    document.body.innerHTML = '';
  });

  it('returns [] when no message elements exist', () => {
    expect(extractConversation()).toEqual([]);
  });

  it('maps outgoing messages to sender "me"', () => {
    document.body.innerHTML = `<div class="message-out"><span class="copyable-text">Hello</span></div>`;
    expect(extractConversation()).toEqual([{ sender: 'me', text: 'Hello' }]);
  });

  it('maps incoming messages to sender "them"', () => {
    document.body.innerHTML = `<div class="message-in"><span class="copyable-text">Hi there</span></div>`;
    expect(extractConversation()).toEqual([{ sender: 'them', text: 'Hi there' }]);
  });

  it('preserves document order for mixed messages', () => {
    document.body.innerHTML = `
      <div class="message-in"><span class="copyable-text">First</span></div>
      <div class="message-out"><span class="copyable-text">Second</span></div>
      <div class="message-in"><span class="copyable-text">Third</span></div>
    `;
    expect(extractConversation()).toEqual([
      { sender: 'them', text: 'First' },
      { sender: 'me', text: 'Second' },
      { sender: 'them', text: 'Third' },
    ]);
  });

  it('skips message elements with no copyable-text content', () => {
    document.body.innerHTML = `
      <div class="message-out"><span class="copyable-text">Hi</span></div>
      <div class="message-in"></div>
    `;
    expect(extractConversation()).toEqual([{ sender: 'me', text: 'Hi' }]);
  });

  it('returns only the last 20 messages when more than 20 exist', () => {
    document.body.innerHTML = Array.from(
      { length: 25 },
      (_, i) => `<div class="message-in"><span class="copyable-text">msg ${i}</span></div>`,
    ).join('');
    const result = extractConversation();
    expect(result).toHaveLength(20);
    expect(result[0].text).toBe('msg 5');
    expect(result[19].text).toBe('msg 24');
  });

  it('returns [] without throwing when DOM access throws', () => {
    vi.spyOn(document, 'querySelectorAll').mockImplementationOnce(() => {
      throw new Error('DOM explosion');
    });
    expect(() => extractConversation()).not.toThrow();
    expect(extractConversation()).toEqual([]);
  });
});

// ── extractConversation — LinkedIn Messaging ──────────────────────────────────

describe('extractConversation — LinkedIn Messaging', () => {
  beforeEach(() => {
    setHostname('www.linkedin.com');
    document.body.innerHTML = '';
  });

  it('returns [] when no message elements exist', () => {
    expect(extractConversation()).toEqual([]);
  });

  it('maps own messages to sender "me" when inside a from-me group', () => {
    document.body.innerHTML = `
      <div class="msg-s-message-group--from-me">
        <ul><li class="msg-s-event-listitem">
          <p class="msg-s-event-listitem__body">Hey!</p>
        </li></ul>
      </div>
    `;
    expect(extractConversation()).toEqual([{ sender: 'me', text: 'Hey!' }]);
  });

  it('maps others\' messages to sender "them" when not in a from-me group', () => {
    document.body.innerHTML = `
      <ul><li class="msg-s-event-listitem">
        <p class="msg-s-event-listitem__body">Hello!</p>
      </li></ul>
    `;
    expect(extractConversation()).toEqual([{ sender: 'them', text: 'Hello!' }]);
  });

  it('preserves document order for mixed messages', () => {
    document.body.innerHTML = `
      <ul>
        <li class="msg-s-event-listitem">
          <p class="msg-s-event-listitem__body">First from them</p>
        </li>
        <div class="msg-s-message-group--from-me">
          <li class="msg-s-event-listitem">
            <p class="msg-s-event-listitem__body">My reply</p>
          </li>
        </div>
      </ul>
    `;
    expect(extractConversation()).toEqual([
      { sender: 'them', text: 'First from them' },
      { sender: 'me', text: 'My reply' },
    ]);
  });

  it('returns only the last 20 messages when more than 20 exist', () => {
    const items = Array.from(
      { length: 25 },
      (_, i) =>
        `<li class="msg-s-event-listitem"><p class="msg-s-event-listitem__body">msg ${i}</p></li>`,
    ).join('');
    document.body.innerHTML = `<ul>${items}</ul>`;
    const result = extractConversation();
    expect(result).toHaveLength(20);
    expect(result[19].text).toBe('msg 24');
  });

  it('returns [] without throwing when DOM access throws', () => {
    vi.spyOn(document, 'querySelectorAll').mockImplementationOnce(() => {
      throw new Error('DOM explosion');
    });
    expect(() => extractConversation()).not.toThrow();
    expect(extractConversation()).toEqual([]);
  });
});
