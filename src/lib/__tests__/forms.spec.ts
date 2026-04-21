// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { snapshotFields } from '../forms';

describe('snapshotFields', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns a FieldSnapshot for each fillable text-type input', () => {
    document.body.innerHTML = `
      <label for="name">Full Name</label>
      <input id="name" name="fullName" type="text" value="Alice" />
      <label for="email">Email</label>
      <input id="email" name="email" type="email" value="alice@example.com" />
    `;
    const snaps = snapshotFields();
    expect(snaps).toHaveLength(2);
    expect(snaps[0].currentValue).toBe('Alice');
    expect(snaps[1].currentValue).toBe('alice@example.com');
  });

  it('populates id, name, label, autocomplete from the DOM element', () => {
    document.body.innerHTML = `
      <label for="first">First Name</label>
      <input id="first" name="firstName" type="text" autocomplete="given-name" value="Bob" />
    `;
    const [snap] = snapshotFields();
    expect(snap.id).toBe('first');
    expect(snap.name).toBe('firstName');
    expect(snap.label).toBe('First Name');
    expect(snap.autocomplete).toBe('given-name');
    expect(snap.currentValue).toBe('Bob');
  });

  it('reflects the live DOM value at the time of the call', () => {
    document.body.innerHTML = `<input id="live" type="text" value="" />`;
    const input = document.getElementById('live') as HTMLInputElement;
    input.value = 'typed-later';
    const [snap] = snapshotFields();
    expect(snap.currentValue).toBe('typed-later');
  });

  it('excludes password fields', () => {
    document.body.innerHTML = `
      <input type="text" value="user" />
      <input type="password" value="secret" />
    `;
    const snaps = snapshotFields();
    expect(snaps).toHaveLength(1);
    expect(snaps.every((s) => s.type !== 'password')).toBe(true);
  });

  it('excludes file fields', () => {
    document.body.innerHTML = `<input type="file" /><input type="text" value="x" />`;
    expect(snapshotFields()).toHaveLength(1);
  });

  it('excludes hidden fields', () => {
    document.body.innerHTML = `<input type="hidden" value="csrf" /><input type="email" value="a@b.com" />`;
    expect(snapshotFields()).toHaveLength(1);
  });

  it('includes textarea elements with currentValue set to their content', () => {
    document.body.innerHTML = `<textarea>My bio</textarea>`;
    const [snap] = snapshotFields();
    expect(snap.currentValue).toBe('My bio');
    expect(snap.type).toBe('textarea');
  });

  it('includes select elements with currentValue set to the selected option', () => {
    document.body.innerHTML = `
      <select>
        <option value="a">A</option>
        <option value="b" selected>B</option>
      </select>
    `;
    const [snap] = snapshotFields();
    expect(snap.currentValue).toBe('b');
  });

  it('returns an empty array when the document has no fillable fields', () => {
    document.body.innerHTML = '<div>No fields here</div>';
    expect(snapshotFields()).toEqual([]);
  });

  it('does not include DOM element references — output is serializable', () => {
    document.body.innerHTML = `<input type="text" value="x" />`;
    const [snap] = snapshotFields();
    expect(snap).not.toHaveProperty('element');
    expect(() => JSON.stringify(snap)).not.toThrow();
  });
});
