import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import WorkflowModelPicker from './WorkflowModelPicker.svelte';
import { modelList, ollamaConfig, setWorkflowModel, workflowModel } from '../stores/settings';
import type { OllamaConfig } from '../../types';

const baseConfig: OllamaConfig = { baseUrl: 'http://localhost:11434', model: 'llama3.2' };

beforeEach(() => {
  ollamaConfig.set(baseConfig);
  modelList.set(['llama3.2', 'phi4']);
  workflowModel.set('');
  // @ts-expect-error — replacing stub
  chrome.storage.local.get = vi
    .fn()
    .mockResolvedValue({ workflowsConfig: { playbook: 'toptal', model: '' } });
  // @ts-expect-error — replacing stub
  chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  ollamaConfig.set(null);
  modelList.set([]);
  workflowModel.set('');
});

describe('WorkflowModelPicker while following the chat model', () => {
  // The header question is "which model will draft these answers?", so the answer must be
  // a model name, even though the stored preference is ''.
  it('shows the chat model on the trigger', () => {
    render(WorkflowModelPicker);
    expect(screen.getByRole('button', { name: /workflow model: llama3\.2/i })).toBeInTheDocument();
  });

  // Deliberately dropped, as in NewsModelPicker: the dropdown lists models and nothing
  // else. '' survives as the stored default, so the follow behaviour is intact.
  it('offers no "Same as Chat" row', async () => {
    render(WorkflowModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /workflow model/i }));

    expect(screen.queryByRole('option', { name: /same as chat/i })).not.toBeInTheDocument();
  });

  it('lists every manual model and nothing more', async () => {
    render(WorkflowModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /workflow model/i }));

    expect(screen.getAllByRole('option').map((o) => o.textContent?.trim())).toEqual([
      'llama3.2',
      'phi4',
    ]);
  });

  it('marks no row selected while the stored value is empty', async () => {
    render(WorkflowModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /workflow model/i }));

    for (const option of screen.getAllByRole('option')) {
      expect(option).toHaveAttribute('aria-selected', 'false');
    }
  });
});

describe('WorkflowModelPicker placement', () => {
  // The trigger sits at the right edge of the Workflows header, between the playbook
  // picker and Capture. Anchored from the left it hangs off a narrow side panel.
  it('opens its dropdown anchored to the right edge', async () => {
    render(WorkflowModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /workflow model/i }));

    expect(screen.getByRole('listbox')).toHaveClass('right-0');
  });
});

describe('WorkflowModelPicker selection', () => {
  // `workflowsConfig` holds the playbook too, and that field belongs to another store.
  // The setter merges; this is what pins that a model change keeps the chosen playbook.
  it('writes the chosen model to workflowsConfig and keeps the playbook', async () => {
    render(WorkflowModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /workflow model/i }));
    await fireEvent.click(screen.getByRole('option', { name: /phi4/i }));

    await waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        workflowsConfig: { playbook: 'toptal', model: 'phi4' },
      });
    });
    expect(get(workflowModel)).toBe('phi4');
  });

  // The whole point of the feature: drafting on a bigger model must not change chat.
  it('never writes the ollama key', async () => {
    render(WorkflowModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /workflow model/i }));
    await fireEvent.click(screen.getByRole('option', { name: /phi4/i }));

    await waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalled());
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ ollama: expect.anything() }),
    );
    expect(get(ollamaConfig)?.model).toBe('llama3.2');
  });

  it('never writes the newsConfig key', async () => {
    render(WorkflowModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /workflow model/i }));
    await fireEvent.click(screen.getByRole('option', { name: /phi4/i }));

    await waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalled());
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ newsConfig: expect.anything() }),
    );
  });

  // With the follow row gone this is the only route back to '' — removing the selected
  // model in Settings. If it stops working, the tab keeps naming a deleted model.
  it('falls back to following the chat model when the selection is removed', async () => {
    workflowModel.set('phi4');
    render(WorkflowModelPicker);
    await setWorkflowModel('');

    await waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        workflowsConfig: { playbook: 'toptal', model: '' },
      });
    });
    expect(get(workflowModel)).toBe('');
    expect(screen.getByRole('button', { name: /workflow model: llama3\.2/i })).toBeInTheDocument();
  });
});

describe('WorkflowModelPicker with an override', () => {
  it('shows the override on the trigger, not the chat model', () => {
    workflowModel.set('phi4');
    render(WorkflowModelPicker);
    expect(screen.getByRole('button', { name: /workflow model: phi4/i })).toBeInTheDocument();
  });

  // Nothing validates a model name on entry, and removeModel only reconciles on removal.
  it('shows an override that is absent from the manual list', () => {
    modelList.set(['llama3.2']);
    workflowModel.set('qwen3:8b');
    render(WorkflowModelPicker);
    expect(screen.getByRole('button', { name: /workflow model: qwen3:8b/i })).toBeInTheDocument();
  });
});

describe('WorkflowModelPicker with nothing configured', () => {
  it('explains where models come from instead of offering a dead end', async () => {
    ollamaConfig.set({ ...baseConfig, model: '' });
    modelList.set([]);
    render(WorkflowModelPicker);
    await fireEvent.click(screen.getByRole('button', { name: /workflow model/i }));

    expect(screen.getByText(/add models in settings/i)).toBeInTheDocument();
  });
});
