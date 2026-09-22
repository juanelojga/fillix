import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ResearchNotes from './ResearchNotes.svelte';
import type { TopicResearch } from '$lib/linkedin/topic-research';

function research(over: Partial<TopicResearch> = {}): TopicResearch {
  return {
    evidence: '[1] web · Something\nhttps://example.com\nA snippet.',
    sources: [
      { n: 1, origin: 'web', title: 'Something', url: 'https://example.com', date: '2026-09-14' },
    ],
    degraded: [],
    ...over,
  };
}

describe('ResearchNotes', () => {
  it('counts the sources it actually used', () => {
    render(ResearchNotes, { props: { research: research() } });
    expect(screen.getByText(/Researched 1 source/)).toBeTruthy();
  });

  it('links each source so a claim can be checked', () => {
    render(ResearchNotes, { props: { research: research() } });
    const link = screen.getByRole('link', { name: 'Something' }) as HTMLAnchorElement;
    expect(link.href).toBe('https://example.com/');
  });

  /**
   * The rule CaptureResult follows for a section it could not find. A post written from
   * Hacker News alone reads thinner, and this line is the only thing that would say why.
   */
  it('names a degraded source rather than dropping it silently', () => {
    render(ResearchNotes, {
      props: {
        research: research({
          degraded: [
            { origin: 'web', summary: 'No Tavily API key', hint: 'Paste one in the Settings tab.' },
          ],
        }),
      },
    });
    expect(screen.getByText('No Tavily API key')).toBeTruthy();
    expect(screen.getByText('Paste one in the Settings tab.')).toBeTruthy();
  });

  it('says so when nothing came back at all', () => {
    render(ResearchNotes, { props: { research: research({ sources: [], evidence: '' }) } });
    expect(screen.getByText(/No research came back/)).toBeTruthy();
  });

  it('omits an undateable source date rather than printing a bare separator', () => {
    const r = research({
      sources: [{ n: 1, origin: 'hn', title: 'Undated', url: 'https://example.com', date: '' }],
    });
    render(ResearchNotes, { props: { research: r } });
    expect(screen.queryByText(/·\s*$/)).toBeNull();
  });
});
