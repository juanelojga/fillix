// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { detectFields } from '../forms';

describe('detectFields', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns one entry per fillable text-type input, paired with its element', () => {
    document.body.innerHTML = `
      <label for="name">Full Name</label>
      <input id="name" name="fullName" type="text" value="Alice" />
      <label for="email">Email</label>
      <input id="email" name="email" type="email" value="alice@example.com" />
    `;
    const found = detectFields();
    expect(found).toHaveLength(2);
    expect(found[0].element.value).toBe('Alice');
    expect(found[1].element.value).toBe('alice@example.com');
  });

  it('populates id, name, label and autocomplete from the DOM element', () => {
    document.body.innerHTML = `
      <label for="first">First Name</label>
      <input id="first" name="firstName" type="text" autocomplete="given-name" value="Bob" />
    `;
    const [{ context }] = detectFields();
    expect(context.id).toBe('first');
    expect(context.name).toBe('firstName');
    expect(context.label).toBe('First Name');
    expect(context.autocomplete).toBe('given-name');
  });

  it('excludes password fields', () => {
    document.body.innerHTML = `
      <input type="text" value="user" />
      <input type="password" value="secret" />
    `;
    const found = detectFields();
    expect(found).toHaveLength(1);
    expect(found.every(({ context }) => context.type !== 'password')).toBe(true);
  });

  it('excludes file fields', () => {
    document.body.innerHTML = `<input type="file" /><input type="text" value="x" />`;
    expect(detectFields()).toHaveLength(1);
  });

  it('excludes hidden fields', () => {
    document.body.innerHTML = `<input type="hidden" value="csrf" /><input type="email" value="a@b.com" />`;
    expect(detectFields()).toHaveLength(1);
  });

  it('includes textarea elements', () => {
    document.body.innerHTML = `<textarea>My bio</textarea>`;
    const [{ element, context }] = detectFields();
    expect(element.value).toBe('My bio');
    expect(context.type).toBe('textarea');
  });

  it('includes select elements', () => {
    document.body.innerHTML = `
      <select>
        <option value="a">A</option>
        <option value="b" selected>B</option>
      </select>
    `;
    const [{ element }] = detectFields();
    expect(element.value).toBe('b');
  });

  it('returns an empty array when the document has no fillable fields', () => {
    document.body.innerHTML = '<div>No fields here</div>';
    expect(detectFields()).toEqual([]);
  });

  it('resolves a label from a wrapping <label> when there is no for attribute', () => {
    document.body.innerHTML = `<label>Phone <input type="tel" /></label>`;
    const [{ context }] = detectFields();
    expect(context.label).toBe('Phone');
  });

  it('falls back to aria-label', () => {
    document.body.innerHTML = `<input type="text" aria-label="Search query" />`;
    const [{ context }] = detectFields();
    expect(context.label).toBe('Search query');
  });

  it('context is serializable — it carries no element reference', () => {
    document.body.innerHTML = `<input type="text" value="x" />`;
    const [{ context }] = detectFields();
    expect(context).not.toHaveProperty('element');
    expect(() => JSON.stringify(context)).not.toThrow();
  });
});
