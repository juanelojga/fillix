import { renderAvailability } from '../profile/availability-text';
import { getAvailability } from '../storage';

/**
 * The chat tool that reads the user's stored meeting hours.
 *
 * A sibling of `profile-search.ts` rather than a branch inside it, for the reason the hours
 * are stored under their own key in the first place: they are not part of the vector index,
 * they are rewritten on a different schedule, and asking for them is not a retrieval at all.
 *
 * `renderAvailability` returns the same `## Meeting availability` block the drafting path
 * appends to its evidence, written in the user's own first person. It returns '' when no day
 * reads, because an empty section would be a claim of having no availability at all — here
 * that becomes a worded refusal naming the tab that fixes it.
 */
export async function meetingAvailability(): Promise<string> {
  try {
    const block = renderAvailability(await getAvailability(), null);

    if (!block) {
      return 'Error: No meeting hours are saved yet. Open the Profile tab and fill in the Mon–Fri hours.';
    }

    return block;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
