import { describe, it, expect } from 'vitest';
import { diagnoseTavilyFailure } from '../../tavily/search-diagnostics';

const diagnose = (error: string) => diagnoseTavilyFailure(error, '/search');

describe('diagnoseTavilyFailure', () => {
  // This arm renders in the Settings badge and inside a chat reply, so the hint has to point at a
  // place rather than at a control that may not be on screen.
  it('names a missing key and points at the Settings tab', () => {
    const d = diagnose('No Tavily API key');
    expect(d.cause).toBe('no-key');
    expect(d.hint).toContain('Settings tab');
    expect(d.hint).not.toContain('above');
  });

  it('classifies a timeout', () => {
    const d = diagnose('The operation was aborted due to timeout');
    expect(d.cause).toBe('timeout');
    expect(d.summary).toContain('15s');
  });

  // The ordering model-test-diagnostics.ts documents: an aborted fetch also reads as a failure
  // to fetch, so the timeout arm has to be checked first.
  it('prefers timeout over unreachable when a message reads as both', () => {
    expect(diagnose('TypeError: Failed to fetch — signal timed out').cause).toBe('timeout');
  });

  it('classifies a network failure and names the host_permissions trap', () => {
    const d = diagnose('TypeError: Failed to fetch');
    expect(d.cause).toBe('unreachable');
    expect(d.hint).toContain('host_permissions');
  });

  // Checked before every status arm: on a first install a missing manifest entry fails exactly
  // like an offline network, with no status at all.
  it('prefers unreachable over a status arm when no status is present', () => {
    expect(diagnose('NetworkError when attempting to fetch resource').cause).toBe('unreachable');
  });

  for (const status of [401, 403]) {
    it(`classifies ${status} as a bad key and says the prefix`, () => {
      const d = diagnose(`Tavily /search returned ${status}: Unauthorized`);
      expect(d.cause).toBe('bad-key');
      expect(d.hint).toContain('tvly-');
    });
  }

  it('classifies a rate limit', () => {
    expect(diagnose('Tavily /search returned 429: slow down').cause).toBe('rate-limited');
  });

  it('repeats the Retry-After figure the client folded in', () => {
    const d = diagnose('Tavily /search returned 429: slow down (retry after 12s)');
    expect(d.hint).toContain('12-second');
  });

  it('falls back to a wordless pause when no figure was given', () => {
    const d = diagnose('Tavily /search returned 429: slow down');
    expect(d.hint).toContain('a few seconds');
  });

  it('distinguishes a spent plan from a spent pay-as-you-go cap', () => {
    expect(diagnose('Tavily /search returned 432: limit').cause).toBe('plan-limit');
    expect(diagnose('Tavily /search returned 433: limit').cause).toBe('paygo-limit');
  });

  it('says a plan limit affects nothing else in Fillix', () => {
    expect(diagnose('Tavily /search returned 432: limit').hint).toContain('Only web search');
  });

  for (const status of [400, 422]) {
    it(`classifies ${status} as our bug, not the user's`, () => {
      const d = diagnose(`Tavily /search returned ${status}: bad field`);
      expect(d.cause).toBe('bad-request');
      expect(d.hint).toContain('The key is fine');
    });
  }

  it('classifies a server error', () => {
    expect(diagnose('Tavily /search returned 503: upstream').cause).toBe('server-error');
  });

  // Deliberately no catch-all 4xx arm: a status Tavily adds later must not be reported as a bad
  // key with confidence.
  it('falls through to unknown for an unrecognised status, hint empty', () => {
    const d = diagnose('Tavily /search returned 418: teapot');
    expect(d.cause).toBe('unknown');
    expect(d.hint).toBe('');
    expect(d.detail).toBe('Tavily /search returned 418: teapot');
  });

  it('never discards the original error', () => {
    expect(diagnose('Tavily /search returned 401: Unauthorized').detail).toBe(
      'Tavily /search returned 401: Unauthorized',
    );
  });

  it('names the endpoint that was actually called', () => {
    expect(diagnose('x').context).toBe('POST https://api.tavily.com/search');
    expect(diagnoseTavilyFailure('x', '/usage').context).toBe('GET https://api.tavily.com/usage');
  });
});
