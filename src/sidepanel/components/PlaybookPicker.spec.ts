import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import PlaybookPicker from './PlaybookPicker.svelte';
import { PLAYBOOKS } from '../../lib/playbooks/registry';
import { selectedPlaybookId } from '../stores/playbook';

let storageSet: ReturnType<typeof vi.fn>;

beforeEach(() => {
  selectedPlaybookId.set('toptal');
  storageSet = vi.fn().mockResolvedValue(undefined);
  // @ts-expect-error — replacing stub
  chrome.storage.local.set = storageSet;
});

describe('PlaybookPicker', () => {
  it('names the selected playbook on the trigger', () => {
    render(PlaybookPicker);
    expect(screen.getByRole('button', { name: /playbook: toptal/i })).toBeInTheDocument();
  });

  it('offers every registered playbook, and nothing more', async () => {
    render(PlaybookPicker);
    await fireEvent.click(screen.getByRole('button', { name: /playbook/i }));

    expect(screen.getAllByRole('option').map((o) => o.textContent?.trim())).toEqual(
      PLAYBOOKS.map((p) => p.label),
    );
  });

  it('marks the selected row', async () => {
    render(PlaybookPicker);
    await fireEvent.click(screen.getByRole('button', { name: /playbook/i }));

    expect(screen.getByRole('option', { name: 'Toptal' })).toHaveAttribute('aria-selected', 'true');
  });

  // Picking the row already selected is a no-op all the way down — the store
  // short-circuits, so nothing is written.
  it('writes nothing when the current playbook is picked again', async () => {
    render(PlaybookPicker);
    await fireEvent.click(screen.getByRole('button', { name: /playbook/i }));
    await fireEvent.click(screen.getByRole('option', { name: 'Toptal' }));

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(get(selectedPlaybookId)).toBe('toptal');
    expect(storageSet).not.toHaveBeenCalled();
  });

  // The `ollama` and `newsConfig` keys belong to other pickers; a cross-wired write
  // would silently change the user's model.
  it('persists a change under workflowsConfig and no other key', async () => {
    // Toptal is the only playbook today, so the change path needs somewhere to come
    // from. The cast goes away as soon as there are two.
    selectedPlaybookId.set('page-text' as 'toptal');

    render(PlaybookPicker);
    await fireEvent.click(screen.getByRole('button', { name: /playbook/i }));
    await fireEvent.click(screen.getByRole('option', { name: 'Toptal' }));

    await waitFor(() => expect(storageSet).toHaveBeenCalledTimes(1));
    expect(storageSet).toHaveBeenCalledWith({ workflowsConfig: { playbook: 'toptal' } });
  });

  // The trigger sits at the panel's right edge; a start-aligned popover runs off a
  // 240px panel, which has nowhere to scroll to.
  it('hangs the listbox from the right edge', async () => {
    render(PlaybookPicker);
    await fireEvent.click(screen.getByRole('button', { name: /playbook/i }));

    expect(screen.getByRole('listbox').className).toContain('right-0');
  });
});
