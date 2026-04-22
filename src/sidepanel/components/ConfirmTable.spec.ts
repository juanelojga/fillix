import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import ConfirmTable from './ConfirmTable.svelte';
import type { FieldFill } from '../../types';

const makeFields = (): FieldFill[] => [
  { fieldId: 'f1', label: 'First name', currentValue: 'John', proposedValue: 'Jonathan' },
  { fieldId: 'f2', label: 'Email', currentValue: '', proposedValue: 'john@example.com' },
];

describe('ConfirmTable', () => {
  it('renders one row per FieldFill entry', () => {
    render(ConfirmTable, { props: { fields: makeFields() } });
    expect(screen.getByText('First name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('shows column headers: Field, Current value, Proposed value', () => {
    render(ConfirmTable, { props: { fields: makeFields() } });
    expect(screen.getByText('Field')).toBeInTheDocument();
    expect(screen.getByText('Current value')).toBeInTheDocument();
    expect(screen.getByText('Proposed value')).toBeInTheDocument();
  });

  it('shows current value in the current column', () => {
    render(ConfirmTable, { props: { fields: makeFields() } });
    expect(screen.getByText('John')).toBeInTheDocument();
  });

  it('shows em dash for empty current value', () => {
    render(ConfirmTable, { props: { fields: makeFields() } });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('populates proposed input with proposedValue', () => {
    render(ConfirmTable, { props: { fields: makeFields() } });
    const inputs = screen.getAllByRole('textbox');
    expect((inputs[0] as HTMLInputElement).value).toBe('Jonathan');
  });

  it('updates editedValue on input event', () => {
    // ConfirmTable mutates field objects in place via Svelte 5 $props proxy —
    // the shared object reference reflects the edit immediately.
    const fields = makeFields();
    render(ConfirmTable, { props: { fields } });
    const inputs = screen.getAllByRole('textbox');
    fireEvent.input(inputs[0], { target: { value: 'Jon' } });
    expect(fields[0].editedValue).toBe('Jon');
  });

  it('prefers editedValue over proposedValue for input initial value', () => {
    const fields: FieldFill[] = [
      {
        fieldId: 'f1',
        label: 'Name',
        currentValue: 'Old',
        proposedValue: 'New',
        editedValue: 'Edited',
      },
    ];
    render(ConfirmTable, { props: { fields } });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Edited');
  });
});
