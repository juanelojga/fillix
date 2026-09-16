import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import NewsModelPicker from './NewsModelPicker.svelte';
import { modelList, newsModel, ollamaConfig, setNewsModel } from '../stores/settings';
import type { OllamaConfig } from '../../types';

const baseConfig: OllamaConfig = { baseUrl: 'http://localhost:11434', model: 'llama3.2' };

beforeEach(() => {
  ollamaConfig.set(baseConfig);
  modelList.set(['llama3.2', 'phi4']);
  newsModel.set('');
  // @ts-expect-error — replacing stub
  chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  ollamaConfig.set(null);
  modelList.set([]);
  newsModel.set('');
});

describe('NewsModelPicker while following the chat model', () => {
  // The header question is "which model will summarize this?", so the answer must be a
  // model name, even though the stored preference is ''.
  it('shows the chat model on the trigger', () => {
    render(NewsModelPicker);
    expect(screen.getByRole('button', { name: /summary model: llama3\.2/i })).toBeInTheDocument();
  });

  // Deliberately dropped: the dropdown lists models and nothing else. '' survives as the
  // stored default, so the follow behaviour is intact — it is just not a menu entry.
  it('offers no "Same as Chat" row', async () => {
    render(NewsModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /summary model/i }));

    expect(screen.queryByRole('option', { name: /same as chat/i })).not.toBeInTheDocument();
  });

  it('lists every manual model and nothing more', async () => {
    render(NewsModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /summary model/i }));

    expect(screen.getAllByRole('option').map((o) => o.textContent?.trim())).toEqual([
      'llama3.2',
      'phi4',
    ]);
  });

  // The chat model is in the manual list here, so its row is the one marked selected even
  // though the stored value is ''. ModelPicker matches on value, not on display.
  it('marks no row selected while the stored value is empty', async () => {
    render(NewsModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /summary model/i }));

    for (const option of screen.getAllByRole('option')) {
      expect(option).toHaveAttribute('aria-selected', 'false');
    }
  });
});

describe('NewsModelPicker placement', () => {
  // The trigger sits at the right edge of the News header, next to Refresh. Anchored
  // from the left it would hang off the side panel once a model name runs long.
  it('opens its dropdown anchored to the right edge', async () => {
    render(NewsModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /summary model/i }));

    expect(screen.getByRole('listbox')).toHaveClass('right-0');
  });
});

describe('NewsModelPicker selection', () => {
  it('writes the chosen model to the newsConfig key', async () => {
    render(NewsModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /summary model/i }));
    await fireEvent.click(screen.getByRole('option', { name: /phi4/i }));

    await waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ newsConfig: { model: 'phi4' } });
    });
    expect(get(newsModel)).toBe('phi4');
  });

  // The whole point of the feature: summarizing with a small model must not change chat.
  it('never writes the ollama key', async () => {
    render(NewsModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /summary model/i }));
    await fireEvent.click(screen.getByRole('option', { name: /phi4/i }));

    await waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalled());
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ ollama: expect.anything() }),
    );
    expect(get(ollamaConfig)?.model).toBe('llama3.2');
  });

  // With the follow row gone this is the only route back to '' — removing the selected
  // model in Settings. If it ever stops working, News silently keeps naming a model the
  // user has deleted.
  it('falls back to following the chat model when the selection is removed', async () => {
    newsModel.set('phi4');
    render(NewsModelPicker);
    await setNewsModel('');

    await waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ newsConfig: { model: '' } });
    });
    expect(get(newsModel)).toBe('');
    expect(screen.getByRole('button', { name: /summary model: llama3\.2/i })).toBeInTheDocument();
  });
});

describe('NewsModelPicker with an override', () => {
  it('shows the override on the trigger, not the chat model', () => {
    newsModel.set('phi4');
    render(NewsModelPicker);
    expect(screen.getByRole('button', { name: /summary model: phi4/i })).toBeInTheDocument();
  });

  // Nothing validates a model name on entry, and removeModel only reconciles on removal.
  it('shows an override that is absent from the manual list', () => {
    modelList.set(['llama3.2']);
    newsModel.set('qwen3:8b');
    render(NewsModelPicker);
    expect(screen.getByRole('button', { name: /summary model: qwen3:8b/i })).toBeInTheDocument();
  });
});

describe('NewsModelPicker with nothing configured', () => {
  it('explains where models come from instead of offering a dead end', async () => {
    ollamaConfig.set({ ...baseConfig, model: '' });
    modelList.set([]);
    render(NewsModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /summary model/i }));

    expect(screen.getByText(/add models in settings/i)).toBeInTheDocument();
  });
});
