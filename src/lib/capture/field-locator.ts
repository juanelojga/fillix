/**
 * How to find one form control again in the live page.
 *
 * Lives in `capture/` rather than beside the Toptal parser because it is the vocabulary
 * *between* the two halves: a playbook reads a captured document and produces one of these,
 * and `fill-active-tab.ts` resolves it in the page world. Neither needs to know the other.
 *
 * The arms are ordered by how much they survive a redeploy, and the parser tries them in
 * that order. `ordinal` is last on purpose: it is the only one that silently points at the
 * wrong field when Toptal inserts a question, so the UI says so whenever it is what we got.
 */
export type FieldLocator =
  | { by: 'name'; value: string }
  | { by: 'id'; value: string }
  | { by: 'ordinal'; index: number };

/** One short phrase for the UI. Never the whole selector — these names are 60 chars of base64. */
export function describeLocator(locator: FieldLocator): string {
  switch (locator.by) {
    case 'name':
      return 'matched by field name';
    case 'id':
      return 'matched by field id';
    case 'ordinal':
      return `matched by position (field ${locator.index + 1})`;
  }
}

/** True for the arms that pin a specific control rather than a place in the document. */
export function isStableLocator(locator: FieldLocator): boolean {
  return locator.by !== 'ordinal';
}
