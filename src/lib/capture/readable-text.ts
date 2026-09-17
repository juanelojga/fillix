/**
 * A DOM subtree as readable text.
 *
 * `textContent`, not `innerText`: this runs over a `DOMParser` document, which has no
 * layout — `innerText` is either absent or empty there. That is also what we want, because
 * the blocks worth reading on a captured page are routinely hidden by CSS on the live one
 * (a folded description, a collapsed accordion) while being present in the markup.
 *
 * Nothing here touches `chrome.*` or a global `document`: the element carries its own
 * ownerDocument, so the same function serves a parsed capture and a live page.
 */

/** Their text is source code, not content, and would swamp whatever follows. */
const SKIPPED = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

/** Tags that end the current line. Inline tags deliberately absent — they must not break. */
const BLOCK = new Set([
  'ARTICLE',
  'BLOCKQUOTE',
  // A discrete control, never a word inside a sentence — without it a row of buttons
  // reads as "CancelSubmit Application".
  'BUTTON',
  'DIV',
  'FIELDSET',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'LABEL',
  'LI',
  'OL',
  'P',
  'SECTION',
  'TABLE',
  'TR',
  'UL',
]);

/**
 * A form control's answer lives in `value`, not in any text node, so a plain walk loses
 * every filled-in field. Returns null for an element that is not a control.
 */
function controlValue(el: Element): string | null {
  if (el instanceof HTMLTextAreaElement) return el.value;
  if (el instanceof HTMLSelectElement) {
    return el.selectedOptions.length > 0 ? (el.selectedOptions[0].textContent ?? '') : '';
  }
  if (el instanceof HTMLInputElement) {
    // Hidden inputs shadow the visible control that carries the same answer, so including
    // them prints every pre-filled value twice.
    return el.type === 'hidden' ? '' : el.value;
  }
  return null;
}

function walk(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push(node.nodeValue ?? '');
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as Element;
  // SVG and MathML elements keep a lowercase tagName; their text is icon plumbing.
  const tag = el.tagName.toUpperCase();
  if (SKIPPED.has(tag) || tag === 'SVG' || tag === 'MATH') return;

  // Not politeness — correctness. An autosizing textarea ships a measuring twin that
  // carries the same value behind `aria-hidden`, so without this every answer prints
  // twice. `hidden` is the same story for a closed disclosure's duplicate.
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return;

  if (tag === 'BR') {
    out.push('\n');
    return;
  }

  const value = controlValue(el);
  if (value !== null) {
    out.push('\n', value, '\n');
    return;
  }

  const isBlock = BLOCK.has(tag);
  if (isBlock) out.push('\n');
  for (const child of Array.from(node.childNodes)) walk(child, out);
  if (isBlock) out.push('\n');
}

/**
 * Collapses horizontal runs, trims each line, and leaves no blank lines at all.
 *
 * One line per block, never two: the walk marks both edges of every block, and a React
 * page nests a dozen wrappers deep, so the raw output has far more newlines than there
 * are paragraphs. Keeping the blanks would put an empty line between every row of the
 * attributes grid in a panel barely wide enough for the rows themselves.
 */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function readableText(el: Element): string {
  const out: string[] = [];
  walk(el, out);
  return tidy(out.join(''));
}
