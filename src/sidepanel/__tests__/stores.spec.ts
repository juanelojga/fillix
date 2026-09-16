import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { messages, streamingState, activeMessage } from '../stores/chat';
import { ollamaConfig, modelList } from '../stores/settings';
import { workflowList, agentMessages, pendingGate, isAgentRunning } from '../stores/workflow';

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
  });

  describe('workflow store', () => {
    it('workflowList initialises as empty array', () => {
      expect(get(workflowList)).toEqual([]);
    });

    it('agentMessages initialises as empty array', () => {
      expect(get(agentMessages)).toEqual([]);
    });

    it('pendingGate initialises as null', () => {
      expect(get(pendingGate)).toBeNull();
    });

    it('isAgentRunning initialises as false', () => {
      expect(get(isAgentRunning)).toBe(false);
    });

    it('isAgentRunning is a writable store', () => {
      expect(typeof isAgentRunning.subscribe).toBe('function');
      expect(typeof isAgentRunning.set).toBe('function');
    });
  });
});
