import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildProfileIndex } from '../../src/lib/profile/profile-index';
import { isIndexStale } from '../../src/lib/profile/index-staleness';
import { hashProfile } from '../../src/lib/profile/profile-hash';
import type { ProfileIndex } from '../../src/lib/storage';

/**
 * Build the profile index once and reuse it across runs.
 *
 * Re-embedding 31 sections on every run costs a minute and changes nothing; the vectors are a
 * pure function of the profile text and the embed model. The cache key is `hashProfile`, which
 * is *production's own* staleness key — so the file cannot outlive its validity, and there is
 * no second invalidation policy here to drift away from the one the panel uses.
 *
 * A hit is still checked with `isIndexStale` rather than trusted: a key collision or a
 * half-written file would otherwise ground every answer in the wrong vectors, and by then the
 * scores look perfectly plausible.
 */
const CACHE_DIR = path.resolve('eval/.cache');

export async function loadOrBuildIndex(args: {
  markdown: string;
  baseUrl: string;
  embedModel: string;
}): Promise<{ index: ProfileIndex; built: boolean }> {
  const { markdown, baseUrl, embedModel } = args;
  const file = path.join(CACHE_DIR, `profile-index-${hashProfile(markdown, embedModel)}.json`);

  if (existsSync(file)) {
    try {
      const cached = JSON.parse(readFileSync(file, 'utf8')) as ProfileIndex;
      if (!isIndexStale(cached, markdown, embedModel)) return { index: cached, built: false };
    } catch {
      // A truncated or hand-edited file is a miss, not a crash.
    }
  }

  const index = await buildProfileIndex(baseUrl, embedModel, markdown);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(index), 'utf8');
  return { index, built: true };
}
