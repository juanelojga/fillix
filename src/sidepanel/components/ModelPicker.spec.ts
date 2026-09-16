import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ModelPicker from './ModelPicker.svelte';
import type { ModelOption } from './model-picker';

const onSelect = vi.fn();

function opts(...names: string[]): ModelOption[] {
  return names.map((n) => ({ value: n, label: n }));
}

beforeEach(() => {
  onSelect.mockReset();
});

describe('ModelPicker trigger', () => {
  it('renders the selected option label', () => {
    render(ModelPicker, { value: 'llama3.2', options: opts('llama3.2'), onSelect });
    expect(screen.getByText('llama3.2')).toBeInTheDocument();
  });

  it('shows "No model" when nothing is selected', () => {
    render(ModelPicker, { value: '', options: [], onSelect });
    expect(screen.getByText('No model')).toBeInTheDocument();
  });

  it('honours a placeholder override', () => {
    render(ModelPicker, { value: '', options: [], onSelect, placeholder: 'Pick one' });
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });

  // News shows the effective model on the trigger while '' is selected, so the header
  // never reads "Same as Chat" where a model name belongs.
  it('display overrides the trigger text without changing the selection', async () => {
    render(ModelPicker, {
      value: '',
      options: [{ value: '', label: 'Same as Chat' }, ...opts('phi4')],
      onSelect,
      display: 'llama3.2',
    });

    expect(screen.getByRole('button', { name: /llama3\.2/ })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/ }));
    expect(screen.getByRole('option', { name: /same as chat/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('ModelPicker dropdown', () => {
  it('is closed by default', () => {
    render(ModelPicker, { value: 'llama3.2', options: opts('llama3.2'), onSelect });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens on the trigger', async () => {
    render(ModelPicker, { value: 'llama3.2', options: opts('llama3.2'), onSelect });
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('renders one option per prop entry', async () => {
    render(ModelPicker, { value: 'llama3.2', options: opts('phi4', 'mistral'), onSelect });
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));

    expect(screen.getByRole('option', { name: /phi4/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /mistral/i })).toBeInTheDocument();
  });

  // The active model is not required to be in the hand-maintained list.
  it('appends a selected value that no option carries', async () => {
    render(ModelPicker, { value: 'llama3.2', options: opts('phi4'), onSelect });
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));

    expect(screen.getByRole('option', { name: /^llama3\.2$/i })).toBeInTheDocument();
  });

  it('renders an option hint as secondary text', async () => {
    render(ModelPicker, {
      value: '',
      options: [{ value: '', label: 'Same as Chat', hint: 'llama3.2' }],
      onSelect,
    });
    // No `display` prop, so the trigger falls back to the matched option's own label.
    await fireEvent.click(screen.getByRole('button', { name: /same as chat/i }));

    expect(screen.getByRole('option')).toHaveTextContent('Same as Chat · llama3.2');
  });

  // Read from contents the name comes out glued ("Same as Chat· llama3.2"), so a hinted
  // option names itself explicitly.
  it('announces a hinted option as "label, hint"', async () => {
    render(ModelPicker, {
      value: 'phi4',
      options: [
        { value: '', label: 'Same as Chat', hint: 'llama3.2' },
        { value: 'phi4', label: 'phi4' },
      ],
      onSelect,
    });
    await fireEvent.click(screen.getByRole('button', { name: /phi4/i }));

    expect(screen.getByRole('option', { name: 'Same as Chat, llama3.2' })).toBeInTheDocument();
  });

  it('shows the empty hint when there are no options', async () => {
    render(ModelPicker, { value: '', options: [], onSelect });
    await fireEvent.click(screen.getByRole('button', { name: /no model/i }));

    expect(screen.getByText(/add models in settings/i)).toBeInTheDocument();
  });

  // A dropdown holding only a "follow" row is not a real choice — it would be a dead end
  // with no explanation of how to add models.
  it('shows the empty hint when every option has an empty value', async () => {
    render(ModelPicker, { value: '', options: [{ value: '', label: 'Same as Chat' }], onSelect });
    await fireEvent.click(screen.getByRole('button', { name: /same as chat/i }));

    expect(screen.getByText(/add models in settings/i)).toBeInTheDocument();
  });

  it('honours an empty-hint override', async () => {
    render(ModelPicker, { value: '', options: [], onSelect, emptyHint: 'Nothing here.' });
    await fireEvent.click(screen.getByRole('button', { name: /no model/i }));

    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
  });

  // The only observable difference is the anchoring class — there is no layout in jsdom
  // to measure — but getting this wrong puts the popup off the side panel entirely.
  it('hangs from the left edge by default', async () => {
    render(ModelPicker, { value: 'llama3.2', options: opts('llama3.2'), onSelect });
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));

    expect(screen.getByRole('listbox')).toHaveClass('left-0');
  });

  it('hangs from the right edge when align is "end"', async () => {
    render(ModelPicker, { value: 'llama3.2', options: opts('llama3.2'), onSelect, align: 'end' });
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));

    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveClass('right-0');
    expect(listbox).not.toHaveClass('left-0');
  });

  it('closes on Escape', async () => {
    render(ModelPicker, { value: 'llama3.2', options: opts('llama3.2'), onSelect });
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));
    await fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('ModelPicker selection', () => {
  it('calls onSelect with the clicked value', async () => {
    render(ModelPicker, { value: 'llama3.2', options: opts('phi4'), onSelect });
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));
    await fireEvent.click(screen.getByRole('option', { name: /phi4/i }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('phi4'));
  });

  // '' is a real choice for News: it means "go back to following the chat model".
  it("calls onSelect with '' for a follow option", async () => {
    render(ModelPicker, {
      value: 'phi4',
      options: [{ value: '', label: 'Same as Chat' }, ...opts('phi4')],
      onSelect,
    });
    await fireEvent.click(screen.getByRole('button', { name: /phi4/i }));
    await fireEvent.click(screen.getByRole('option', { name: /same as chat/i }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(''));
  });

  it('does not call onSelect when the current value is re-selected', async () => {
    render(ModelPicker, { value: 'llama3.2', options: opts('llama3.2', 'phi4'), onSelect });
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));
    await fireEvent.click(screen.getByRole('option', { name: /^llama3\.2$/i }));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes the dropdown on select', async () => {
    render(ModelPicker, { value: 'llama3.2', options: opts('phi4'), onSelect });
    await fireEvent.click(screen.getByRole('button', { name: /llama3\.2/i }));
    await fireEvent.click(screen.getByRole('option', { name: /phi4/i }));

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });
});

describe('ModelPicker accessibility', () => {
  it('trigger has aria-haspopup="listbox"', () => {
    render(ModelPicker, { value: 'llama3.2', options: opts('llama3.2'), onSelect });
    expect(screen.getByRole('button', { name: /llama3\.2/i })).toHaveAttribute(
      'aria-haspopup',
      'listbox',
    );
  });

  it('trigger aria-expanded reflects the open state', async () => {
    render(ModelPicker, { value: 'llama3.2', options: opts('llama3.2'), onSelect });
    const trigger = screen.getByRole('button', { name: /llama3\.2/i });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  // Composed, not replaced: a bare aria-label would hide the model name from queries.
  it('composes the label prop with the displayed model', () => {
    render(ModelPicker, {
      value: 'llama3.2',
      options: opts('llama3.2'),
      onSelect,
      label: 'Summary model',
    });

    expect(screen.getByRole('button', { name: 'Summary model: llama3.2' })).toBeInTheDocument();
  });

  it('sets no aria-label when no label prop is given', () => {
    render(ModelPicker, { value: 'llama3.2', options: opts('llama3.2'), onSelect });
    expect(screen.getByRole('button', { name: /llama3\.2/i })).not.toHaveAttribute('aria-label');
  });
});
