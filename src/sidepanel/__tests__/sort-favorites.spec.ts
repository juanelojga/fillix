import { describe, it, expect } from 'vitest';
import { sortWithFavorites } from '../stores/settings';

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
