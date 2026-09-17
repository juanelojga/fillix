// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ApplicationDrafts from './ApplicationDrafts.svelte';
import { drafts, fields, clearApplication } from '../stores/application';
import type { ApplicationField } from '$lib/playbooks/toptal-application-form';

const Q1 = 'Do you know Python?';
const Q2 = 'Do you speak Spanish?';

function field(question: string, locator: ApplicationField['locator']): ApplicationField {
  return { question, kind: 'question', locator, unfillableReason: '', prefilled: '' };
}

const FIELDS = [
  field('How soon can you start?', null),
  field(Q1, { by: 'name', value: 'q1' }),
  field(Q2, { by: 'name', value: 'q2' }),
];

beforeEach(() => {
  vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
  clearApplication();
});

describe('ApplicationDrafts', () => {
  it('renders nothing at all before a capture', () => {
    const { container } = render(ApplicationDrafts);

    expect(container.querySelector('section')).toBeNull();
  });

  it('lists every question, including the one that cannot be filled', () => {
    fields.set(FIELDS);
    render(ApplicationDrafts);

    expect(screen.getByText('How soon can you start?')).toBeInTheDocument();
    expect(screen.getByText(Q1)).toBeInTheDocument();
    expect(screen.getByText(Q2)).toBeInTheDocument();
  });

  // The count is of what can actually be answered, not of what is on the page.
  it('counts only the answerable questions', () => {
    fields.set(FIELDS);
    render(ApplicationDrafts);

    expect(screen.getByText('2 questions to answer')).toBeInTheDocument();
  });

  it('reports progress as answers land', () => {
    fields.set(FIELDS);
    drafts.set({
      [Q1]: {
        status: 'drafted',
        draft: { text: 'Yes.', drewOn: ['Python'], gaps: [] },
        edited: 'Yes.',
      },
    });
    render(ApplicationDrafts);

    expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();
  });

  // An empty answer is the model correctly finding nothing, not an answered question.
  it('does not count a blank answer as answered', () => {
    fields.set(FIELDS);
    drafts.set({
      [Q1]: { status: 'drafted', draft: { text: '', drewOn: [], gaps: [] }, edited: '' },
    });
    render(ApplicationDrafts);

    expect(screen.getByText('0 of 2 answered')).toBeInTheDocument();
  });

  /**
   * Every hint in capture-diagnostics.ts tells the user to "press Capture again", and those
   * stay true only while exactly one button on screen carries that name.
   */
  it('never calls its button Capture', () => {
    fields.set(FIELDS);
    render(ApplicationDrafts);

    expect(screen.queryByRole('button', { name: /^Capture/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Draft answers' })).toBeInTheDocument();
  });

  it('offers to redo the set once answers exist', () => {
    fields.set(FIELDS);
    drafts.set({
      [Q1]: {
        status: 'drafted',
        draft: { text: 'Yes.', drewOn: ['Python'], gaps: [] },
        edited: 'Yes.',
      },
    });
    render(ApplicationDrafts);

    expect(screen.getByRole('button', { name: 'Draft all again' })).toBeInTheDocument();
  });

  it('states that nothing is written to the page and Submit is never pressed', () => {
    fields.set(FIELDS);
    render(ApplicationDrafts);

    expect(screen.getByText(/nothing is written to\s+Toptal/)).toBeInTheDocument();
    expect(screen.getByText(/Submit is never pressed for you/)).toBeInTheDocument();
  });

  it('disables drafting when no question can be answered', () => {
    fields.set([field('How soon can you start?', null)]);
    render(ApplicationDrafts);

    expect(screen.getByRole('button', { name: 'Draft answers' })).toBeDisabled();
  });
});
