import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ModelPicker from './ModelPicker.svelte';
import { ollamaConfig, modelList } from '../stores/settings';

import type { OllamaConfig } from '../../types';

const baseConfig: OllamaConfig = {
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
};

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

describe('ModelPicker', () => {
  it('renders the active model name in the picker trigger button', () => {
    render(ModelPicker);
    expect(screen.getByText('llama3.2')).toBeInTheDocument();
  });

  it('shows "No model" when the active model is an empty string', () => {
    ollamaConfig.set({ ...baseConfig, model: '' });
    render(ModelPicker);
    expect(screen.getByText('No model')).toBeInTheDocument();
  });

  it('dropdown is closed by default (no listbox in DOM)', () => {
    render(ModelPicker);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('clicking the trigger button opens the dropdown', async () => {
    render(ModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('shows the "Add models in Settings" hint when the list is empty', async () => {
    ollamaConfig.set({ ...baseConfig, model: '' });
    render(ModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /no model/i }));
    expect(screen.getByText(/add models in settings/i)).toBeInTheDocument();
  });

  it('shows each model from the manual list as an option', async () => {
    modelList.set(['phi4', 'mistral']);
    render(ModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));
    expect(screen.getByRole('option', { name: /phi4/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /mistral/i })).toBeInTheDocument();
  });

  it('selecting a model writes the new model to the ollama storage key', async () => {
    modelList.set(['phi4']);
    render(ModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));
    await fireEvent.click(screen.getByRole('option', { name: /phi4/i }));
    await waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ ollama: expect.objectContaining({ model: 'phi4' }) }),
      );
    });
  });

  it('selecting the already-active model does not call chrome.storage.local.set', async () => {
    modelList.set(['llama3.2', 'phi4']);
    render(ModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));
    await fireEvent.click(screen.getByRole('option', { name: /^llama3\.2$/i }));
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ ollama: expect.any(Object) }),
    );
  });

  it('pressing Escape on the dropdown closes it', async () => {
    render(ModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('selecting a model closes the dropdown', async () => {
    modelList.set(['phi4']);
    render(ModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));
    await fireEvent.click(screen.getByRole('option', { name: /phi4/i }));
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  it('always lists the active model even when it is not in the manual list', async () => {
    modelList.set(['phi4']);
    render(ModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));
    expect(screen.getByRole('option', { name: /^llama3\.2$/i })).toBeInTheDocument();
  });

  it('trigger button has aria-haspopup="listbox"', () => {
    render(ModelPicker);
    const trigger = screen.getByRole('button', { name: /llama3\.2/i });
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
  });

  it('trigger aria-expanded reflects open state', async () => {
    render(ModelPicker);
    const trigger = screen.getByRole('button', { name: /llama3\.2/i });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });
});
