import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import PipelineStages from './PipelineStages.svelte';
import type { PipelineStageState } from '../stores/agent';

const idleStages = (): PipelineStageState[] =>
  (['collect', 'understand', 'plan', 'draft', 'review'] as const).map((stage) => ({
    stage,
    status: 'idle' as const,
  }));

describe('PipelineStages', () => {
  it('renders all 5 stage names', () => {
    render(PipelineStages, { props: { stages: idleStages() } });
    expect(screen.getByText('Collect')).toBeInTheDocument();
    expect(screen.getByText('Understand')).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('shows idle dot for stages with idle status', () => {
    const { container } = render(PipelineStages, { props: { stages: idleStages() } });
    const dots = container.querySelectorAll('.text-muted-foreground');
    expect(dots.length).toBeGreaterThan(0);
  });

  it('shows running spinner for running stage', () => {
    const stages: PipelineStageState[] = [
      { stage: 'collect', status: 'running' },
      ...(['understand', 'plan', 'draft', 'review'] as const).map((s) => ({
        stage: s,
        status: 'idle' as const,
      })),
    ];
    const { container } = render(PipelineStages, { props: { stages } });
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('shows error text for error stage', () => {
    const stages: PipelineStageState[] = idleStages().map((s) =>
      s.stage === 'understand' ? { stage: 'understand', status: 'error', error: 'LLM timeout' } : s,
    );
    render(PipelineStages, { props: { stages } });
    expect(screen.getByText('LLM timeout')).toBeInTheDocument();
  });

  it('shows summary as fallback for error stage with no error field', () => {
    const stages: PipelineStageState[] = idleStages().map((s) =>
      s.stage === 'plan' ? { stage: 'plan', status: 'error', summary: 'plan failed' } : s,
    );
    const { container } = render(PipelineStages, { props: { stages } });
    // summary shows in both muted and destructive <p> elements when no explicit error field
    const errorParas = container.querySelectorAll('p.text-destructive');
    const found = Array.from(errorParas).some((el) => el.textContent?.includes('plan failed'));
    expect(found).toBe(true);
  });

  it('renders idle state for a stage not present in the array', () => {
    render(PipelineStages, { props: { stages: [] } });
    expect(screen.getByText('Collect')).toBeInTheDocument();
  });

  it('shows duration when stage is done with durationMs', () => {
    const stages: PipelineStageState[] = idleStages().map((s) =>
      s.stage === 'draft' ? { stage: 'draft', status: 'done', durationMs: 1500 } : s,
    );
    render(PipelineStages, { props: { stages } });
    expect(screen.getByText('1.5 s')).toBeInTheDocument();
  });
});
