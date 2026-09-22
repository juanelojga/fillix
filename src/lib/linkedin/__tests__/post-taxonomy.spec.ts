import { describe, it, expect } from 'vitest';
import packaged from '../../../prompts/linkedin-voice.md?raw';
import {
  FUNNEL_STAGES,
  FUNNEL_STYLES,
  ICPS,
  PILLARS,
  PILLAR_LABEL,
  PILLAR_QUERY_TERMS,
  STYLES,
  isFunnelStage,
  isPillar,
} from '../post-taxonomy';

describe('post taxonomy', () => {
  /**
   * The failure this exists to prevent: the user renames a pillar in the `.md`, the model
   * dutifully answers with the new name, and `normalizeTopicSuggestions` drops every
   * suggestion with no clue why. The ids are the contract; the prose around them is not.
   */
  it('every id literally appears in the packaged voice spec', () => {
    for (const id of [...PILLARS, ...STYLES, ...FUNNEL_STAGES, ...ICPS]) {
      expect(packaged, `"${id}" is missing from linkedin-voice.md`).toContain(id);
    }
  });

  it('has the counts the voice spec describes', () => {
    expect(PILLARS).toHaveLength(6);
    expect(STYLES).toHaveLength(7);
    expect(FUNNEL_STAGES).toHaveLength(3);
    expect(ICPS).toHaveLength(4);
  });

  it('labels and query terms cover every pillar, so no lookup can be undefined', () => {
    for (const pillar of PILLARS) {
      expect(PILLAR_LABEL[pillar]).toBeTruthy();
      expect(PILLAR_QUERY_TERMS[pillar].length).toBeGreaterThan(0);
    }
  });

  it('maps every funnel stage to styles drawn from the real style list', () => {
    for (const stage of FUNNEL_STAGES) {
      const styles = FUNNEL_STYLES[stage];
      expect(styles.length).toBeGreaterThan(0);
      for (const style of styles) expect(STYLES).toContain(style);
    }
  });

  it('keeps tofu and mofu disjoint, which is what makes the cross-field guard meaningful', () => {
    const overlap = FUNNEL_STYLES.tofu.filter((s) => FUNNEL_STYLES.mofu.includes(s));
    expect(overlap).toEqual([]);
  });

  it('rejects a label where an id was asked for', () => {
    expect(isPillar('architecture')).toBe(true);
    expect(isPillar('Architecture & System Design')).toBe(false);
    expect(isPillar('Architecture')).toBe(false);
    expect(isPillar(3)).toBe(false);
    expect(isFunnelStage('TOFU')).toBe(false);
  });
});
