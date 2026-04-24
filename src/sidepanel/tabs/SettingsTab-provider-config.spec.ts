import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import SettingsTab from './SettingsTab.svelte';
import { providerConfigs } from '../stores/settings';
import type { ProviderConfig } from '../../types';

// Control what chrome.storage.local.get returns per-test.
// getProviderConfig uses an array key; getProviderConfigs uses a string key.
function setupStorageMock(configuredMap: Partial<Record<string, ProviderConfig>> = {}) {
  const mockGet = vi.fn().mockImplementation(async (keys: string | string[]) => {
    if (Array.isArray(keys)) return {}; // getProviderConfig → defaults to ollama
    if (keys === 'providerConfigs') return { providerConfigs: configuredMap };
    return {};
  });
  // @ts-expect-error — replacing the stub with a spy
  chrome.storage.local.get = mockGet;
  // @ts-expect-error — replacing the stub
  chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);
  return mockGet;
}

afterEach(() => {
  providerConfigs.set({});
});

// ── Task 2.1: handleProviderChange restores saved config ──────────────────────

describe('SettingsTab — handleProviderChange (Task 2.1)', () => {
  const savedOpenAI: ProviderConfig = {
    provider: 'openai',
    baseUrl: 'https://custom.endpoint.com',
    model: 'gpt-4o',
    apiKey: 'sk-saved-key',
  };

  it('populates hardcoded defaults when switching to a never-configured provider', async () => {
    // openrouter has no saved config; openai has one so the summary row appears
    setupStorageMock({ openai: savedOpenAI });
    render(SettingsTab);
    // Wait for onMount / loadSettings to complete
    await waitFor(() => screen.getByRole('button', { name: /openai/i }));

    // Trigger handleProviderChange via the select (openrouter — not in providerConfigs)
    const select = screen.getByLabelText(/provider type/i);
    fireEvent.change(select, { target: { value: 'openrouter' } });
    flushSync(); // flush Svelte's batched reactive updates

    await waitFor(() => {
      expect(screen.getByLabelText(/base url/i)).toHaveValue('https://openrouter.ai');
    });
  });

  it('restores saved baseUrl when switching to a previously-configured provider', async () => {
    setupStorageMock({ openai: savedOpenAI });
    render(SettingsTab);
    // Wait for summary row; clicking it calls handleProviderChange('openai')
    await waitFor(() => screen.getByRole('button', { name: /openai/i }));

    await fireEvent.click(screen.getByRole('button', { name: /openai/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/base url/i)).toHaveValue('https://custom.endpoint.com');
    });
  });

  it('clears api key when switching to a never-configured provider', async () => {
    setupStorageMock({ openai: savedOpenAI });
    render(SettingsTab);
    await waitFor(() => screen.getByRole('button', { name: /openai/i }));

    const select = screen.getByLabelText(/provider type/i);
    fireEvent.change(select, { target: { value: 'openrouter' } });
    flushSync();

    // Use placeholder to distinguish provider API key from ObsidianPanel's "API key"
    await waitFor(() => {
      expect(screen.getByPlaceholderText('sk-...')).toHaveValue('');
    });
  });

  it('restores saved api key when switching to a previously-configured provider', async () => {
    setupStorageMock({ openai: savedOpenAI });
    render(SettingsTab);
    await waitFor(() => screen.getByRole('button', { name: /openai/i }));

    await fireEvent.click(screen.getByRole('button', { name: /openai/i }));

    await waitFor(() => {
      const apiKeyInput = screen.getByPlaceholderText('sk-...') as HTMLInputElement;
      expect(apiKeyInput.value).toBe('sk-saved-key');
    });
  });
});

// ── Task 2.2: Configured providers summary section ────────────────────────────

describe('SettingsTab — configured providers summary (Task 2.2)', () => {
  const openAIWithKey: ProviderConfig = {
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    model: 'gpt-4o',
    apiKey: 'sk-abcdefgh',
  };

  it('does not render summary heading when no non-default providers are configured', async () => {
    setupStorageMock({});
    render(SettingsTab);
    await waitFor(() => expect(chrome.storage.local.get).toHaveBeenCalled());

    expect(screen.queryByText(/configured providers/i)).not.toBeInTheDocument();
  });

  it('renders summary heading when at least one non-default provider is configured', async () => {
    setupStorageMock({ openai: openAIWithKey });
    render(SettingsTab);

    await waitFor(() => {
      expect(screen.getByText(/configured providers/i)).toBeInTheDocument();
    });
  });

  it('never renders the raw API key in the DOM', async () => {
    const rawKey = 'sk-very-secret-key-12345';
    setupStorageMock({
      openai: {
        provider: 'openai',
        baseUrl: 'https://api.openai.com',
        model: 'gpt-4o',
        apiKey: rawKey,
      },
    });
    const { container } = render(SettingsTab);

    await waitFor(() => {
      expect(screen.getByText(/configured providers/i)).toBeInTheDocument();
    });

    // The raw key must never appear as text content anywhere in the rendered tree
    expect(container.textContent).not.toContain(rawKey);
  });

  it('shows api key in masked sk-••••{last4} format', async () => {
    setupStorageMock({ openai: openAIWithKey });
    render(SettingsTab);

    await waitFor(() => {
      // apiKey 'sk-abcdefgh' → last 4 chars = 'efgh'
      expect(screen.getByText(/sk-••••efgh/)).toBeInTheDocument();
    });
  });

  it('renders a row for each configured provider', async () => {
    setupStorageMock({ openai: openAIWithKey });
    render(SettingsTab);

    await waitFor(() => {
      expect(screen.getByText(/configured providers/i)).toBeInTheDocument();
    });

    // The provider name should appear in a row button
    expect(screen.getByRole('button', { name: /openai/i })).toBeInTheDocument();
  });

  it('active provider row has a visible highlight (ring class)', async () => {
    setupStorageMock({ openai: openAIWithKey });
    render(SettingsTab);
    await waitFor(() => screen.getByRole('button', { name: /openai/i }));

    // Click the openai summary row → handleProviderChange('openai') → provider = 'openai'
    await fireEvent.click(screen.getByRole('button', { name: /openai/i }));

    await waitFor(() => {
      const openaiRow = screen.getByRole('button', { name: /openai/i });
      expect(openaiRow.className).toMatch(/ring/);
    });
  });

  it('clicking a summary row changes the active provider', async () => {
    setupStorageMock({ openai: openAIWithKey });
    render(SettingsTab);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /openai/i })).toBeInTheDocument();
    });

    await fireEvent.click(screen.getByRole('button', { name: /openai/i }));

    // After clicking, the Base URL field for openai should be visible
    await waitFor(() => {
      expect(screen.getByLabelText(/base url/i)).toBeInTheDocument();
    });
  });
});
