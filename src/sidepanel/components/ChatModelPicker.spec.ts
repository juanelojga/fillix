import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ChatModelPicker from './ChatModelPicker.svelte';
import { ollamaConfig, modelList } from '../stores/settings';
import type { OllamaConfig } from '../../types';

const baseConfig: OllamaConfig = { baseUrl: 'http://localhost:11434', model: 'llama3.2' };

beforeEach(() => {
  ollamaConfig.set(baseConfig);
  modelList.set([]);
  // @ts-expect-error — replacing stub
  chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  ollamaConfig.set(null);
  modelList.set([]);
});

describe('ChatModelPicker', () => {
  it('shows the active model', () => {
    render(ChatModelPicker);
    expect(screen.getByText('llama3.2')).toBeInTheDocument();
  });

  it('shows "No model" when no model is active', () => {
    ollamaConfig.set({ ...baseConfig, model: '' });
    render(ChatModelPicker);
    expect(screen.getByText('No model')).toBeInTheDocument();
  });

  it('offers the hand-maintained model list', async () => {
    modelList.set(['phi4', 'mistral']);
    render(ChatModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));

    expect(screen.getByRole('option', { name: /phi4/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /mistral/i })).toBeInTheDocument();
  });

  it('lists the active model even when it is absent from the list', async () => {
    modelList.set(['phi4']);
    render(ChatModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));

    expect(screen.getByRole('option', { name: /^llama3\.2$/i })).toBeInTheDocument();
  });

  // This is the global active model: picking here also changes what fills forms.
  it('writes the chosen model to the ollama storage key', async () => {
    modelList.set(['phi4']);
    render(ChatModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));
    await fireEvent.click(screen.getByRole('option', { name: /phi4/i }));

    await waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ ollama: expect.objectContaining({ model: 'phi4' }) }),
      );
    });
    expect(screen.getByText('phi4')).toBeInTheDocument();
  });

  it('writes nothing when the active model is re-selected', async () => {
    modelList.set(['llama3.2', 'phi4']);
    render(ChatModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));
    await fireEvent.click(screen.getByRole('option', { name: /^llama3\.2$/i }));

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  // The News tab has its own preference; the chat picker must not touch it.
  it('never writes the newsConfig key', async () => {
    modelList.set(['phi4']);
    render(ChatModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));
    await fireEvent.click(screen.getByRole('option', { name: /phi4/i }));

    await waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalled());
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ newsConfig: expect.anything() }),
    );
  });
});
