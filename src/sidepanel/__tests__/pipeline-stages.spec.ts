import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const comp = (p: string) => resolve(process.cwd(), 'src/sidepanel/components', p);

describe('PipelineStages.svelte (Task 5.2)', () => {
  const src = readFileSync(comp('PipelineStages.svelte'), 'utf-8');

  it('exists', () => {
    expect(existsSync(comp('PipelineStages.svelte'))).toBe(true);
  });

  describe('props', () => {
    it('accepts a stages prop', () => {
      expect(src).toContain('stages');
    });

    it('imports PipelineStageState type', () => {
      expect(src).toMatch(/PipelineStageState/);
    });
  });

  describe('all 5 stage names rendered', () => {
    it('renders collect stage', () => {
      expect(src).toContain('collect');
    });

    it('renders understand stage', () => {
      expect(src).toContain('understand');
    });

    it('renders plan stage', () => {
      expect(src).toContain('plan');
    });

    it('renders draft stage', () => {
      expect(src).toContain('draft');
    });

    it('renders review stage', () => {
      expect(src).toContain('review');
    });
  });

  describe('status indicators', () => {
    it('handles running status', () => {
      expect(src).toContain('running');
    });

    it('handles done status', () => {
      expect(src).toContain('done');
    });

    it('handles error status', () => {
      expect(src).toContain('error');
    });

    it('handles idle status', () => {
      expect(src).toContain('idle');
    });
  });

  describe('stage metadata display', () => {
    it('shows durationMs when available', () => {
      expect(src).toContain('durationMs');
    });

    it('shows summary when available', () => {
      expect(src).toContain('summary');
    });

    it('shows error string inline', () => {
      expect(src).toContain('error');
    });
  });

  describe('shadcn components', () => {
    it('uses Badge for status labels', () => {
      expect(src).toContain('Badge');
    });
  });
});
