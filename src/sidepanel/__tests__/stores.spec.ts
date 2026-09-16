import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { messages, streamingState, activeMessage } from '../stores/chat';
import { ollamaConfig, modelList, systemPromptOverride } from '../stores/settings';

describe('svelte stores (Task 2.5)', () => {
  describe('chat store', () => {
    it('messages initialises as empty array', () => {
      expect(get(messages)).toEqual([]);
    });

    it('streamingState initialises as idle', () => {
      expect(get(streamingState)).toBe('idle');
    });

    it('activeMessage initialises as null', () => {
      expect(get(activeMessage)).toBeNull();
    });

    it('messages is a writable store (has subscribe/set/update)', () => {
      expect(typeof messages.subscribe).toBe('function');
      expect(typeof messages.set).toBe('function');
      expect(typeof messages.update).toBe('function');
    });
  });

  describe('settings store', () => {
    it('ollamaConfig initialises as null', () => {
      expect(get(ollamaConfig)).toBeNull();
    });

    it('modelList initialises as empty array', () => {
      expect(get(modelList)).toEqual([]);
    });

    it('ollamaConfig is a writable store', () => {
      expect(typeof ollamaConfig.subscribe).toBe('function');
      expect(typeof ollamaConfig.set).toBe('function');
    });

    it("systemPromptOverride initialises as '' — meaning the packaged default is in use", () => {
      expect(get(systemPromptOverride)).toBe('');
    });
  });
});
