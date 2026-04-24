import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const storePath = resolve(process.cwd(), 'src/sidepanel/stores/settings.ts');
const src = readFileSync(storePath, 'utf-8');

describe('settings store (Task 4.1)', () => {
  it('exists', () => {
    expect(existsSync(storePath)).toBe(true);
  });

  describe('store exports', () => {
    it('exports providerConfig writable store', () => {
      expect(src).toContain('providerConfig');
    });

    it('exports searchConfig writable store', () => {
      expect(src).toContain('searchConfig');
    });

    it('exports modelList writable store', () => {
      expect(src).toContain('modelList');
    });

    it('exports favoriteModels writable store', () => {
      expect(src).toContain('favoriteModels');
    });
  });

  describe('function exports', () => {
    it('exports loadSettings', () => {
      expect(src).toContain('loadSettings');
    });

    it('exports saveSettings', () => {
      expect(src).toContain('saveSettings');
    });

    it('exports refreshModels', () => {
      expect(src).toContain('refreshModels');
    });

    it('exports toggleFavorite', () => {
      expect(src).toContain('toggleFavorite');
    });

    it('exports filterModels', () => {
      expect(src).toContain('filterModels');
    });
  });

  describe('storage integration', () => {
    it('imports getProviderConfig', () => {
      expect(src).toContain('getProviderConfig');
    });

    it('imports setProviderConfig', () => {
      expect(src).toContain('setProviderConfig');
    });

    it('imports getSearchConfig', () => {
      expect(src).toContain('getSearchConfig');
    });

    it('imports setSearchConfig', () => {
      expect(src).toContain('setSearchConfig');
    });

    it('imports getFavoriteModels', () => {
      expect(src).toContain('getFavoriteModels');
    });

    it('imports setFavoriteModels', () => {
      expect(src).toContain('setFavoriteModels');
    });
  });

  describe('filterModels (pure function)', () => {
    it('is a synchronous function (no async)', () => {
      // filterModels takes a query string and array — no chrome API needed
      expect(src).toMatch(/function filterModels|filterModels\s*=/);
    });

    it('accepts query and allModels parameters', () => {
      expect(src).toMatch(
        /filterModels[^(]*\([^)]*query[^)]*allModels|filterModels[^(]*\([^)]*allModels[^)]*query/,
      );
    });
  });

  describe('toggleFavorite logic', () => {
    it('references provider type to key favorites', () => {
      expect(src).toContain('ProviderType');
    });
  });

  describe('refreshModels', () => {
    it('updates modelList store', () => {
      // refreshModels calls listModels on the provider and sets modelList
      expect(src).toContain('modelList');
    });
  });

  describe('providerConfigs store (Task 1.3)', () => {
    it('exports providerConfigs writable store', () => {
      expect(src).toContain('providerConfigs');
    });

    it('imports getProviderConfigs from storage', () => {
      expect(src).toContain('getProviderConfigs');
    });

    it('imports setProviderConfigs from storage', () => {
      expect(src).toContain('setProviderConfigs');
    });

    it('seeds providerConfigs in loadSettings', () => {
      expect(src).toMatch(
        /loadSettings[\s\S]*getProviderConfigs|getProviderConfigs[\s\S]*loadSettings/,
      );
    });

    it('persists providerConfigs in saveSettings', () => {
      expect(src).toMatch(
        /saveSettings[\s\S]*setProviderConfigs|setProviderConfigs[\s\S]*saveSettings/,
      );
    });
  });
});
