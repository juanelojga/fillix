/**
 * Resolves which model summarizes a News article.
 *
 * The News tab keeps its own preference so a small, fast model can summarize while chat
 * runs the largest one that fits. Storage holds only the bytes; this is the one place the
 * ''-means-fallback convention is interpreted — the same split as system-prompt.ts.
 */

/**
 * '' (or whitespace) means follow the globally active model. Membership in the manual
 * model list is deliberately NOT checked — the active model may legitimately be absent
 * from it too, and ModelPicker surfaces an unlisted value anyway.
 */
export function resolveSummaryModel(newsModel: string, activeModel: string): string {
  return newsModel.trim() || activeModel;
}
