import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const comp = (p: string) => resolve(process.cwd(), 'src/sidepanel/components', p);

describe('ConfirmTable.svelte (Task 5.3)', () => {
  const src = readFileSync(comp('ConfirmTable.svelte'), 'utf-8');

  it('exists', () => {
    expect(existsSync(comp('ConfirmTable.svelte'))).toBe(true);
  });

  describe('props', () => {
    it('accepts a fields prop', () => {
      expect(src).toContain('fields');
    });

    it('imports FieldFill type', () => {
      expect(src).toContain('FieldFill');
    });
  });

  describe('table structure', () => {
    it('uses shadcn Table component', () => {
      expect(src).toContain('Table');
    });

    it('renders field label column', () => {
      expect(src).toContain('label');
    });

    it('renders current value column', () => {
      expect(src).toContain('currentValue');
    });

    it('renders proposed value column (editable)', () => {
      expect(src).toContain('proposedValue');
    });
  });

  describe('editable input', () => {
    it('uses Input component for proposed value editing', () => {
      expect(src).toContain('Input');
    });

    it('binds or sets editedValue on input change', () => {
      expect(src).toContain('editedValue');
    });
  });

  describe('iteration', () => {
    it('iterates over fields array', () => {
      expect(src).toMatch(/#each.*fields/);
    });

    it('uses fieldId as key', () => {
      expect(src).toContain('fieldId');
    });
  });
});
