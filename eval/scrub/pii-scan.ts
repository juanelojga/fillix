import { findPii } from './pii-patterns.ts';

/**
 * PII scanning over a parsed JSON value rather than its serialization.
 *
 * Scanning `JSON.stringify(set)` looks equivalent and is not: the patterns allow whitespace and
 * punctuation as separators, and pretty-printed JSON supplies both between every field. A
 * `phone` match then straddles two unrelated keys, and a real hit is indistinguishable from the
 * fifty-two the file's own structure produces. Checking each string on its own removes the
 * class of false positive entirely, and the path makes a genuine hit actionable instead of a
 * number.
 */
export interface PiiFinding {
  /** Dotted path to the offending string, e.g. `cases[3].knownOutput`. */
  path: string;
  name: string;
  hits: number;
}

export function scanPii(value: unknown, path = ''): PiiFinding[] {
  if (typeof value === 'string') {
    return findPii(value).map(({ name, hits }) => ({ path: path || '(root)', name, hits }));
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => scanPii(item, `${path}[${i}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      scanPii(item, path ? `${path}.${key}` : key),
    );
  }
  return [];
}
