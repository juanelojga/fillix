import { describeLocator } from './field-locator';
import type { FillOutcome } from './fill-active-tab';

/**
 * Per-field wording, shown beside the field it belongs to.
 *
 * Deliberately not a `{summary, hint, detail}` diagnosis: a whole-run refusal already has one
 * — `diagnoseCaptureFailure`, reused unchanged, which is safe because every hint it gives says
 * "press Capture again" and that button is still on screen. This is the other half: a run that
 * succeeded overall and missed one field, where a sentence in place is the right size.
 */
export function describeFillOutcome(outcome: FillOutcome): string {
  if (outcome.ok) return '';

  if (outcome.reason === 'not-found') {
    return outcome.locator.by === 'ordinal'
      ? `Couldn't find this field — it was ${describeLocator(outcome.locator)}, and the form has fewer fields than that now. Press Capture again.`
      : "Couldn't find this field on the page. The form may have closed, or Toptal may have changed it — press Capture again.";
  }

  return 'Found this field, but it is not a text box that can be typed into. Fill this one in yourself.';
}

/** One line for the whole run, so the status region has something true to announce. */
export function summariseFill(outcomes: FillOutcome[]): string {
  const filled = outcomes.filter((o) => o.ok).length;
  if (outcomes.length === 0) return 'Nothing to fill.';
  if (filled === outcomes.length) {
    return `Filled ${filled} ${filled === 1 ? 'field' : 'fields'}. Check them, then submit the form yourself.`;
  }
  return `Filled ${filled} of ${outcomes.length} fields — the rest are named below.`;
}
