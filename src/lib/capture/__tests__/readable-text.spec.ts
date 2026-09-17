// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readableText } from '../readable-text';

function parse(html: string): Element {
  const doc = new DOMParser().parseFromString(`<body><main>${html}</main></body>`, 'text/html');
  return doc.querySelector('main') as Element;
}

describe('readableText', () => {
  it('keeps a block per line', () => {
    expect(readableText(parse('<p>One</p><p>Two</p>'))).toBe('One\nTwo');
  });

  it('keeps inline tags on the same line', () => {
    expect(readableText(parse('<p>A <strong>bold</strong> word</p>'))).toBe('A bold word');
  });

  // Without this a row of form controls reads as "CancelSubmit Application".
  it('keeps adjacent buttons apart', () => {
    expect(readableText(parse('<button>Cancel</button><button>Submit</button>'))).toBe(
      'Cancel\nSubmit',
    );
  });

  it('breaks on <br>', () => {
    expect(readableText(parse('<p>One<br>Two</p>'))).toBe('One\nTwo');
  });

  it('keeps list items apart', () => {
    expect(readableText(parse('<ul><li>One</li><li>Two</li></ul>'))).toBe('One\nTwo');
  });

  // A React page nests a dozen wrappers deep, so the raw walk marks far more boundaries
  // than there are paragraphs. One line per block, never a blank one.
  it('leaves no blank line however deep the wrappers go', () => {
    const text = readableText(parse('<div><div><div><p>One</p></div></div></div><p>Two</p>'));
    expect(text).toBe('One\nTwo');
  });

  it('collapses runs of spaces and non-breaking spaces', () => {
    expect(readableText(parse('<p>One   two&nbsp;&nbsp;three</p>'))).toBe('One two three');
  });

  // Stripping only the tags would inline the whole stylesheet and bundle.
  it.each(['script', 'style', 'noscript', 'template'])('drops <%s> content', (tag) => {
    const text = readableText(parse(`<p>Keep</p><${tag}>DROP</${tag}>`));
    expect(text).toBe('Keep');
  });

  it('drops svg content, which is icon plumbing', () => {
    expect(readableText(parse('<p>Keep</p><svg><title>DROP</title></svg>'))).toBe('Keep');
  });

  // The answer lives in `value`, not in any text node — a plain textContent walk loses
  // every filled-in field.
  it('emits an input value', () => {
    expect(readableText(parse('<label>When</label><input value="Immediately">'))).toBe(
      'When\nImmediately',
    );
  });

  it('emits a textarea value', () => {
    expect(readableText(parse('<textarea>Typed answer</textarea>'))).toBe('Typed answer');
  });

  it('emits the selected option, not every option', () => {
    const html = '<select><option>No</option><option selected>Yes</option></select>';
    expect(readableText(parse(html))).toBe('Yes');
  });

  // An autosizing textarea ships a measuring twin carrying the same value; without the
  // aria-hidden skip every answer prints twice.
  it('ignores an aria-hidden twin of a field', () => {
    const html = '<textarea>Answer</textarea><textarea aria-hidden="true">Answer</textarea>';
    expect(readableText(parse(html))).toBe('Answer');
  });

  it('ignores a hidden subtree', () => {
    expect(readableText(parse('<p>Keep</p><div hidden><p>DROP</p></div>'))).toBe('Keep');
  });

  // A hidden input shadows the visible control carrying the same answer.
  it('ignores a hidden input', () => {
    const html = '<input type="hidden" value="Immediately"><input value="Immediately">';
    expect(readableText(parse(html))).toBe('Immediately');
  });

  it('reads a detached document, where innerText would be empty', () => {
    const el = parse('<p>Parsed elsewhere</p>');
    expect(el.ownerDocument).not.toBe(document);
    expect(readableText(el)).toBe('Parsed elsewhere');
  });
});
