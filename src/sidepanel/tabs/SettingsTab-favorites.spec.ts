import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import SettingsTab from './SettingsTab.svelte';
import { modelList, favoriteModels } from '../stores/settings';
import type { FavoriteModels } from '../../lib/storage';

function setupStorageMock(initialFavorites: FavoriteModels = {}) {
  // @ts-expect-error — replacing the stub with a spy
  chrome.storage.local.get = vi.fn().mockImplementation(async (keys: string | string[]) => {
    if (Array.isArray(keys)) return {}; // getProviderConfig → defaults to ollama
    if (keys === 'providerConfigs') return {};
    if (keys === 'favoriteModels') return { favoriteModels: initialFavorites };
    return {};
  });
  // @ts-expect-error — replacing the stub
  chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);
}

function setupSendMessageMock(models: string[] = ['llama3.2', 'phi4']) {
  // @ts-expect-error — replacing the stub with a spy
  chrome.runtime.sendMessage = vi.fn().mockResolvedValue({ ok: true, models });
}

afterEach(() => {
  modelList.set([]);
  favoriteModels.set({});
});

describe('SettingsTab — pin toggle (Task 3.2)', () => {
  it('renders a pin button for each model in the list', async () => {
    setupStorageMock();
    setupSendMessageMock(['llama3.2', 'phi4']);
    render(SettingsTab);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^pin llama3\.2/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^pin phi4/i })).toBeInTheDocument();
    });
  });

  it('pin button aria-label is "Pin <model>" when model is not in favorites', async () => {
    setupStorageMock();
    setupSendMessageMock(['llama3.2']);
    render(SettingsTab);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^pin llama3\.2/i })).toBeInTheDocument();
    });
  });

  it('pin button aria-label is "Unpin <model>" when model is already favorited', async () => {
    setupStorageMock({ ollama: ['llama3.2'] });
    setupSendMessageMock(['llama3.2', 'phi4']);
    render(SettingsTab);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^unpin llama3\.2/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^pin phi4/i })).toBeInTheDocument();
    });
  });

  it('clicking a pin button calls chrome.storage.local.set with favoriteModels', async () => {
    setupStorageMock();
    setupSendMessageMock(['llama3.2']);
    render(SettingsTab);

    await waitFor(() => screen.getByRole('button', { name: /^pin llama3\.2/i }));
    await fireEvent.click(screen.getByRole('button', { name: /^pin llama3\.2/i }));

    await waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ favoriteModels: expect.any(Object) }),
      );
    });
  });

  it('pinned models appear before unpinned models in the list', async () => {
    setupStorageMock({ ollama: ['phi4'] });
    setupSendMessageMock(['llama3.2', 'phi4']);
    render(SettingsTab);

    await waitFor(() => {
      const listbox = screen.getByRole('listbox');
      const items = within(listbox).getAllByRole('option');
      expect(items[0].textContent).toContain('phi4');
      expect(items[1].textContent).toContain('llama3.2');
    });
  });

  it('toggling pin updates button aria-label reactively', async () => {
    setupStorageMock();
    setupSendMessageMock(['llama3.2']);
    render(SettingsTab);

    await waitFor(() => screen.getByRole('button', { name: /^pin llama3\.2/i }));
    await fireEvent.click(screen.getByRole('button', { name: /^pin llama3\.2/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^unpin llama3\.2/i })).toBeInTheDocument();
    });
  });

  it('each model row has role="option" and is selectable by clicking', async () => {
    setupStorageMock();
    setupSendMessageMock(['llama3.2', 'phi4']);
    render(SettingsTab);

    await waitFor(() => screen.getByRole('listbox'));

    const listbox = screen.getByRole('listbox');
    const phi4Option = within(listbox)
      .getAllByRole('option')
      .find((el) => el.textContent?.includes('phi4'));
    if (!phi4Option) throw new Error('phi4 option not found');
    await fireEvent.click(phi4Option);

    // After click, phi4 row should be aria-selected
    await waitFor(() => {
      const updated = within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .find((el) => el.textContent?.includes('phi4'));
      expect(updated?.getAttribute('aria-selected')).toBe('true');
    });
  });
});
