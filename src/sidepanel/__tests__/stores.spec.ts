import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { messages, streamingState, activeMessage } from '../stores/chat';
import { providerConfig, searchConfig, modelList, favoriteModels } from '../stores/settings';
import { workflowList, pipelineStages, confirmFields, isAgentRunning } from '../stores/agent';

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
    it('providerConfig initialises as null', () => {
      expect(get(providerConfig)).toBeNull();
    });

    it('searchConfig initialises as null', () => {
      expect(get(searchConfig)).toBeNull();
    });

    it('modelList initialises as empty array', () => {
      expect(get(modelList)).toEqual([]);
    });

    it('favoriteModels initialises as empty object', () => {
      expect(get(favoriteModels)).toEqual({});
    });

    it('providerConfig is a writable store', () => {
      expect(typeof providerConfig.subscribe).toBe('function');
      expect(typeof providerConfig.set).toBe('function');
    });
  });

  describe('agent store', () => {
    it('workflowList initialises as empty array', () => {
      expect(get(workflowList)).toEqual([]);
    });

    it('pipelineStages initialises as empty array', () => {
      expect(get(pipelineStages)).toEqual([]);
    });

    it('confirmFields initialises as empty array', () => {
      expect(get(confirmFields)).toEqual([]);
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
