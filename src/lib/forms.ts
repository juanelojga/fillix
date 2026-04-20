import type { FieldContext, FieldSnapshot } from '../types';

export type FillableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface FillableField {
  element: FillableElement;
  context: FieldContext;
}

const FILLABLE_INPUT_TYPES = new Set([
  'text',
  'email',
  'tel',
  'url',
  'search',
  'number',
  'date',
  'month',
  'week',
]);

export function detectFields(root: ParentNode = document): FillableField[] {
  const fields: FillableField[] = [];
  root.querySelectorAll<HTMLElement>('input, textarea, select').forEach((el) => {
    if (el instanceof HTMLInputElement) {
      if (!FILLABLE_INPUT_TYPES.has(el.type)) return;
      if (el.disabled || el.readOnly) return;
    } else if (el instanceof HTMLTextAreaElement) {
      if (el.disabled || el.readOnly) return;
    } else if (el instanceof HTMLSelectElement) {
      if (el.disabled) return;
    } else {
      return;
    }
    fields.push({ element: el, context: extractContext(el) });
  });
  return fields;
}

function extractContext(el: FillableElement): FieldContext {
  return {
    name: el.name || undefined,
    id: el.id || undefined,
    label: findLabelText(el),
    placeholder: 'placeholder' in el ? el.placeholder || undefined : undefined,
    type: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(),
    autocomplete: el.autocomplete || undefined,
  };
}

function findLabelText(el: HTMLElement): string | undefined {
  if (el.id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (label?.textContent) return label.textContent.trim();
  }
  const wrapping = el.closest('label');
  if (wrapping?.textContent) return wrapping.textContent.trim();
  const aria = el.getAttribute('aria-label');
  if (aria) return aria;
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const target = document.getElementById(labelledBy);
    if (target?.textContent) return target.textContent.trim();
  }
  return undefined;
}

export function snapshotFields(root: Document = document): FieldSnapshot[] {
  return detectFields(root).map(({ element, context }) => ({
    ...context,
    currentValue: element.value ?? '',
  }));
}

export function setFieldValue(el: FillableElement, value: string): void {
  el.focus();
  if (el instanceof HTMLSelectElement) {
    const match = Array.from(el.options).find(
      (o) => o.value === value || o.textContent?.trim().toLowerCase() === value.toLowerCase(),
    );
    if (match) el.value = match.value;
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.blur();
}
