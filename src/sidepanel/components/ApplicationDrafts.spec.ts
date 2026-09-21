// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ApplicationDrafts from './ApplicationDrafts.svelte';
import { drafts, fields, fillState, clearApplication } from '../stores/application';
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

const ANSWERED = {
  status: 'drafted' as const,
  draft: { text: 'Yes.', drewOn: ['Python'], gaps: [], noExperience: false },
  edited: 'Yes.',
};

beforeEach(() => {
  vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
  clearApplication();
});

describe('ApplicationDrafts', () => {
  // Only ever mounted under a ready capture, so no fields means the form was not found —
  // and with the brief and the decoded sections gone, a blank would explain nothing.
  it('words a capture that found no application form', () => {
    const { container } = render(ApplicationDrafts);

    expect(container.querySelector('section')).toBeNull();
    expect(screen.getByText(/No application questions on this page/)).toBeInTheDocument();
  });

  it('lists every question, including the one that cannot be filled', () => {
    fields.set(FIELDS);
    render(ApplicationDrafts);

    expect(screen.getByText('How soon can you start?')).toBeInTheDocument();
    expect(screen.getByText(Q1)).toBeInTheDocument();
    expect(screen.getByText(Q2)).toBeInTheDocument();
  });

  // The count is of what can actually be answered, not of what is on the page — and the
  // difference is named, so it does not read as a miscount above three cards.
  it('counts the answerable questions and names the rest as yours to pick', () => {
    fields.set(FIELDS);
    render(ApplicationDrafts);

    expect(screen.getByText('2 questions to answer · 1 you pick yourself')).toBeInTheDocument();
  });

  it('leaves the suffix off when every question can be answered', () => {
    fields.set([field(Q1, { by: 'name', value: 'q1' })]);
    render(ApplicationDrafts);

    expect(screen.getByText('1 question to answer')).toBeInTheDocument();
  });

  it('reports progress as answers land', () => {
    fields.set(FIELDS);
    drafts.set({
      [Q1]: {
        status: 'drafted',
        draft: { text: 'Yes.', drewOn: ['Python'], gaps: [], noExperience: false },
        edited: 'Yes.',
      },
    });
    render(ApplicationDrafts);

    expect(screen.getByText('1 of 2 answered · 1 you pick yourself')).toBeInTheDocument();
  });

  /**
   * A denial is a real answer: it is what gets written into the field, so it has to count.
   * Otherwise the header tells the user work is outstanding that Fill page will happily do.
   */
  it('counts a no-experience answer as answered, because it will be written', () => {
    fields.set(FIELDS);
    drafts.set({
      [Q1]: {
        status: 'drafted',
        draft: {
          text: "I don't have experience with Square.",
          drewOn: [],
          gaps: ['Square'],
          noExperience: true,
        },
        edited: "I don't have experience with Square.",
      },
    });
    render(ApplicationDrafts);

    expect(screen.getByText('1 of 2 answered · 1 you pick yourself')).toBeInTheDocument();
  });

  // The standing promise under the list. It stopped being true the moment an uncited denial
  // could be shown, and it is the claim the whole citation UI rests on.
  it('does not promise every answer names a section', () => {
    fields.set(FIELDS);
    render(ApplicationDrafts);

    expect(screen.getByText(/or says you do not have that experience/)).toBeInTheDocument();
  });

  // A blank is the model ignoring the instruction, not an answered question.
  it('does not count a blank answer as answered', () => {
    fields.set(FIELDS);
    drafts.set({
      [Q1]: {
        status: 'drafted',
        draft: { text: '', drewOn: [], gaps: [], noExperience: false },
        edited: '',
      },
    });
    render(ApplicationDrafts);

    expect(screen.getByText('0 of 2 answered · 1 you pick yourself')).toBeInTheDocument();
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
        draft: { text: 'Yes.', drewOn: ['Python'], gaps: [], noExperience: false },
        edited: 'Yes.',
      },
    });
    render(ApplicationDrafts);

    expect(screen.getByRole('button', { name: 'Draft all again' })).toBeInTheDocument();
  });

  it('states that Submit is never pressed for the user', () => {
    fields.set(FIELDS);
    render(ApplicationDrafts);

    expect(screen.getByText(/Submit is never pressed for you/)).toBeInTheDocument();
  });

  it('disables drafting when no question can be answered', () => {
    fields.set([field('How soon can you start?', null)]);
    render(ApplicationDrafts);

    expect(screen.getByRole('button', { name: 'Draft answers' })).toBeDisabled();
  });

  it('offers no way to fill the page until an answer is ready', () => {
    fields.set(FIELDS);
    render(ApplicationDrafts);

    expect(screen.queryByRole('button', { name: 'Fill page' })).not.toBeInTheDocument();
  });

  it('offers to write the ready answers into the page', () => {
    fields.set(FIELDS);
    drafts.set({ [Q1]: ANSWERED });
    render(ApplicationDrafts);

    expect(screen.getByRole('button', { name: 'Fill page' })).toBeEnabled();
    expect(screen.getByText(/1 answer ready to write into the page/)).toBeInTheDocument();
  });

  // The feature ends with the user pressing Submit, so the line that reports success says so.
  it('reports what landed, and that submitting is still the user move', () => {
    fields.set(FIELDS);
    drafts.set({ [Q1]: ANSWERED });
    fillState.set({
      status: 'done',
      outcomes: { [Q1]: { locator: { by: 'name', value: 'q1' }, ok: true } },
    });
    render(ApplicationDrafts);

    expect(screen.getByText(/Filled 1 field\./)).toBeInTheDocument();
    expect(screen.getByText(/submit the form yourself/)).toBeInTheDocument();
  });

  // Writing into whatever tab happens to be open is the worst thing this feature could do,
  // so a refusal is shown at the run level with its own next step.
  it('shows a refusal to write with its cause and next step', () => {
    fields.set(FIELDS);
    drafts.set({ [Q1]: ANSWERED });
    fillState.set({
      status: 'refused',
      diagnosis: {
        summary: 'This playbook does not read this page',
        hint: 'Open a Toptal job page and press Capture again.',
        detail: 'https://news.ycombinator.com',
      },
    });
    render(ApplicationDrafts);

    expect(screen.getByText('This playbook does not read this page')).toBeInTheDocument();
    expect(screen.getByText(/press Capture again/)).toBeInTheDocument();
    expect(screen.getByText('https://news.ycombinator.com')).toBeInTheDocument();
  });
});
