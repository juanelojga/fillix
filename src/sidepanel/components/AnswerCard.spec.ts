import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import AnswerCard from './AnswerCard.svelte';
import type { ApplicationField } from '$lib/playbooks/toptal-application-form';
import type { DraftState } from '../stores/application';
import { drafts } from '../stores/application';

const QUESTION = 'What is your experience with multi-tenant SaaS?';

function field(overrides: Partial<ApplicationField> = {}): ApplicationField {
  return {
    question: QUESTION,
    kind: 'question',
    locator: { by: 'name', value: 'q1' },
    unfillableReason: '',
    prefilled: '',
    ...overrides,
  };
}

function drafted(
  overrides: Partial<{
    text: string;
    drewOn: string[];
    gaps: string[];
    noExperience: boolean;
  }> = {},
): DraftState {
  const draft = {
    text: 'I have shipped one.',
    drewOn: ['Known gaps'],
    gaps: [],
    noExperience: false,
    ...overrides,
  };
  return { status: 'drafted', draft, edited: draft.text };
}

describe('AnswerCard', () => {
  beforeEach(() => {
    drafts.set({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('always shows the question, whatever the state', () => {
    render(AnswerCard, { field: field(), state: { status: 'idle' } });

    expect(screen.getByText(QUESTION)).toBeInTheDocument();
    expect(screen.getByText('Not drafted yet.')).toBeInTheDocument();
  });

  it('puts the draft in an editable box', () => {
    render(AnswerCard, { field: field(), state: drafted() });

    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(box.value).toBe('I have shipped one.');
  });

  // The citation is the point: it makes a claim checkable in one glance instead of requiring
  // the whole profile to be re-read.
  it('names the profile sections the answer came from', () => {
    render(AnswerCard, { field: field(), state: drafted({ drewOn: ['Python', 'Known gaps'] }) });

    expect(screen.getByText(/Drew on: Python · Known gaps/)).toBeInTheDocument();
  });

  it('names what the profile did not support', () => {
    render(AnswerCard, { field: field(), state: drafted({ gaps: ['Square API', 'ESC/POS'] }) });

    expect(screen.getByText(/Not in your profile: Square API · ESC\/POS/)).toBeInTheDocument();
  });

  // An answer citing nothing is one the user wrote or must write; saying so stops them
  // assuming it was drafted from their CV.
  it('says so when there was nothing in the profile to draw on', () => {
    render(AnswerCard, { field: field(), state: drafted({ text: '', drewOn: [] }) });

    expect(screen.getByText(/Your profile had nothing for this one/)).toBeInTheDocument();
  });

  /**
   * The answer cites nothing, so the card has to say that and not merely that the question
   * touched a gap. It is what stands between the user and a short uncited sentence that reads
   * like a denial while still claiming something.
   */
  it('says an uncited answer is the model declaring no experience', () => {
    render(AnswerCard, {
      field: field(),
      state: drafted({
        text: "I don't have experience with the Square API.",
        drewOn: [],
        noExperience: true,
      }),
    });

    expect(screen.getByText(/this answer says so, and cites nothing/)).toBeInTheDocument();
    // Not the blank-case wording, which would tell the user nothing was drafted at all.
    expect(screen.queryByText(/Your profile had nothing for this one/)).not.toBeInTheDocument();
  });

  it('puts a no-experience answer in the editable box like any other', () => {
    render(AnswerCard, {
      field: field(),
      state: drafted({
        text: "I don't have experience with the Square API.",
        drewOn: [],
        noExperience: true,
      }),
    });

    expect(screen.getByRole('textbox')).toHaveValue("I don't have experience with the Square API.");
  });

  it('shows a failure as a cause plus a next step, and offers Re-draft', () => {
    const state: DraftState = {
      status: 'failed',
      diagnosis: {
        cause: 'ungrounded',
        summary: 'The answer was not grounded in your profile',
        hint: 'Press Re-draft.',
        detail: 'raw error',
      },
    };
    render(AnswerCard, { field: field(), state });

    expect(screen.getByText('The answer was not grounded in your profile')).toBeInTheDocument();
    expect(screen.getByText('Press Re-draft.')).toBeInTheDocument();
    expect(screen.getByText('raw error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-draft' })).toBeInTheDocument();
  });

  it('shows the drafting state while one is in flight', () => {
    render(AnswerCard, { field: field(), state: { status: 'drafting' } });

    expect(screen.getByText('Writing an answer…')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  // The question is on the page whether or not we can fill it, and a silently missing card
  // reads as "Toptal did not ask this".
  it('words an unfillable question rather than hiding it', () => {
    render(AnswerCard, {
      field: field({
        locator: null,
        unfillableReason: 'Toptal renders this one as a dropdown — pick the answer yourself.',
        prefilled: 'Immediately',
      }),
      state: { status: 'idle' },
    });

    expect(screen.getByText(/renders this one as a dropdown/)).toBeInTheDocument();
    expect(screen.getByText('Immediately')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  // An ordinal locator points at a place rather than a control, so it silently moves when
  // Toptal inserts a question above it.
  it('warns when the field was matched by position', () => {
    render(AnswerCard, {
      field: field({ locator: { by: 'ordinal', index: 2 } }),
      state: drafted(),
    });

    expect(screen.getByText(/matched by position \(field 3\)/)).toBeInTheDocument();
  });

  it('says nothing about the locator when it pinned a named control', () => {
    render(AnswerCard, { field: field(), state: drafted() });

    expect(screen.queryByText(/matched by position/)).not.toBeInTheDocument();
  });

  it('disables Re-draft while a bulk run is going', () => {
    render(AnswerCard, { field: field(), state: drafted(), busy: true });

    expect(screen.getByRole('button', { name: 'Re-draft' })).toBeDisabled();
  });

  it('keeps the user edit in the store as they type', async () => {
    render(AnswerCard, { field: field(), state: drafted() });
    drafts.set({ [QUESTION]: drafted() });

    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'My own words.' } });

    const state = (await import('svelte/store')).get(drafts)[QUESTION];
    expect(state.status === 'drafted' && state.edited).toBe('My own words.');
  });

  it('confirms a field that was written into the page', () => {
    render(AnswerCard, {
      field: field(),
      state: drafted(),
      outcome: { locator: { by: 'name', value: 'q1' }, ok: true },
    });

    expect(screen.getByText('Written into the page.')).toBeInTheDocument();
  });

  // A partial fill must name which field it missed, beside that field — a run-level count
  // alone leaves the user hunting for the one that did not land.
  it('names a field the fill could not reach, in place', () => {
    render(AnswerCard, {
      field: field(),
      state: drafted(),
      outcome: { locator: { by: 'name', value: 'q1' }, ok: false, reason: 'not-found' },
    });

    expect(screen.getByText(/Couldn't find this field on the page/)).toBeInTheDocument();
    expect(screen.queryByText('Written into the page.')).not.toBeInTheDocument();
  });

  it('says nothing about filling before anything has been filled', () => {
    render(AnswerCard, { field: field(), state: drafted() });

    expect(screen.queryByText('Written into the page.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Couldn't find this field/)).not.toBeInTheDocument();
  });
});
