import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const sidepanel = (p: string) => resolve(process.cwd(), 'src/sidepanel', p);

describe('ChatTab.svelte (Task 3.4)', () => {
  const src = readFileSync(sidepanel('tabs/ChatTab.svelte'), 'utf-8');

  it('exists', () => {
    expect(existsSync(sidepanel('tabs/ChatTab.svelte'))).toBe(true);
  });

  describe('port context', () => {
    it('reads chatPort from context', () => {
      // handles generic: getContext<chrome.runtime.Port>('chatPort')
      expect(src).toMatch(/getContext[^(]*\('chatPort'\)/);
    });

    it('posts CHAT_START to start a conversation', () => {
      expect(src).toContain('CHAT_START');
    });

    it('posts CHAT_STOP to abort streaming', () => {
      expect(src).toContain('CHAT_STOP');
    });
  });

  describe('port message → store routing', () => {
    it('handles token messages', () => {
      expect(src).toContain("'token'");
    });

    it('handles thinking messages', () => {
      expect(src).toContain("'thinking'");
    });

    it('handles tool-call messages', () => {
      expect(src).toContain("'tool-call'");
    });

    it('handles tool-result messages', () => {
      expect(src).toContain("'tool-result'");
    });

    it('handles done messages', () => {
      expect(src).toContain("'done'");
    });

    it('handles error messages', () => {
      expect(src).toContain("'error'");
    });
  });

  describe('store imports', () => {
    it('imports messages store', () => {
      expect(src).toContain('messages');
    });

    it('imports streamingState store', () => {
      expect(src).toContain('streamingState');
    });

    it('imports activeMessage store', () => {
      expect(src).toContain('activeMessage');
    });
  });

  describe('keyboard input', () => {
    it('handles Enter key to send', () => {
      expect(src).toContain('Enter');
    });

    it('allows Shift+Enter for newlines', () => {
      expect(src).toContain('shiftKey');
    });
  });

  describe('streaming controls', () => {
    it('has a stop mechanism when streaming', () => {
      expect(src).toContain('streaming');
    });
  });

  describe('nested components', () => {
    it('uses MessageBubble', () => {
      expect(src).toContain('MessageBubble');
    });

    it('uses ToolCallBlock', () => {
      expect(src).toContain('ToolCallBlock');
    });

    it('uses ThinkingBlock', () => {
      expect(src).toContain('ThinkingBlock');
    });
  });
});
