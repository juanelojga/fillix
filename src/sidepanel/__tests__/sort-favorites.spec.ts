import { describe, it, expect } from 'vitest';
import { sortWithFavorites, pruneStaleModels } from '../stores/settings';

describe('sortWithFavorites (Task 3.1)', () => {
  it('returns pinned models first, then the rest', () => {
    expect(sortWithFavorites(['a', 'b', 'c'], ['c'])).toEqual(['c', 'a', 'b']);
  });

  it('returns original order when favorites is empty', () => {
    expect(sortWithFavorites(['a', 'b', 'c'], [])).toEqual(['a', 'b', 'c']);
  });

  it('preserves relative order among pinned models (order comes from models array, not favorites)', () => {
    // favorites = ['d', 'b'] but in models array 'b' comes before 'd'
    expect(sortWithFavorites(['a', 'b', 'c', 'd'], ['d', 'b'])).toEqual(['b', 'd', 'a', 'c']);
  });

  it('ignores favorites not present in the models list', () => {
    expect(sortWithFavorites(['a', 'b'], ['c', 'a'])).toEqual(['a', 'b']);
  });

  it('returns empty array when models list is empty', () => {
    expect(sortWithFavorites([], ['a'])).toEqual([]);
  });

  it('does not mutate the original models array', () => {
    const models = ['a', 'b', 'c'];
    sortWithFavorites(models, ['c']);
    expect(models).toEqual(['a', 'b', 'c']);
  });
});

describe('pruneStaleModels', () => {
  it('returns favorites unchanged when availableModels is empty', () => {
    const fav = { ollama: ['gone'] };
    expect(pruneStaleModels(fav, [], 'ollama')).toBe(fav);
  });

  it('removes stale favorites for the specified provider', () => {
    expect(pruneStaleModels({ ollama: ['gone', 'llama3.2'] }, ['llama3.2'], 'ollama')).toEqual({
      ollama: ['llama3.2'],
    });
  });

  it('returns same reference when no favorites are stale', () => {
    const fav = { ollama: ['llama3.2'] };
    expect(pruneStaleModels(fav, ['llama3.2', 'phi4'], 'ollama')).toBe(fav);
  });

  it('leaves other providers untouched', () => {
    const fav = { ollama: ['gone'], openai: ['gpt-4o'] };
    const result = pruneStaleModels(fav, ['llama3.2'], 'ollama');
    expect(result.openai).toEqual(['gpt-4o']);
  });

  it('handles provider with no favorites gracefully', () => {
    const fav = { openai: ['gpt-4o'] };
    expect(pruneStaleModels(fav, ['llama3.2'], 'ollama')).toBe(fav);
  });

  it('prunes to empty array when all favorites are stale', () => {
    expect(pruneStaleModels({ ollama: ['gone'] }, ['llama3.2'], 'ollama')).toEqual({
      ollama: [],
    });
  });
});
