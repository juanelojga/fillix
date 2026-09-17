import { describe, it, expect } from 'vitest';
import { statesNoExperience } from '../states-no-experience';

describe('statesNoExperience', () => {
  it('accepts a plain first-person denial', () => {
    expect(statesNoExperience("I don't have experience with the Square API.")).toBe(true);
  });

  it('accepts the wordings a model actually writes', () => {
    const denials = [
      'I do not have experience with Kubernetes.',
      "I haven't worked with Square Payments.",
      'I have not worked with ESC/POS printers.',
      'I have no experience with Elixir.',
      "I've never used Terraform.",
      'I have never worked with Salesforce APIs.',
      'I don’t have experience with Vue 3.',
    ];

    for (const text of denials) expect(statesNoExperience(text)).toBe(true);
  });

  it('rejects a positive claim', () => {
    expect(statesNoExperience('I am a Square API expert.')).toBe(false);
    expect(statesNoExperience('I have built several payment integrations.')).toBe(false);
  });

  /**
   * The case this gate exists for. It opens with a first-person negation, so any check built
   * on tone waves it through — and the clause after the comma invents an employer, a
   * technology and a date, with nothing cited to support any of them.
   */
  it('rejects a denial that turns into an uncited claim', () => {
    expect(
      statesNoExperience(
        "I don't have direct experience with the Square API, but I built payment integrations " +
          'with Stripe and handled ESC/POS printers at Acme in 2019.',
      ),
    ).toBe(false);
  });

  it('rejects a denial carrying a year or a tenure', () => {
    expect(statesNoExperience("I haven't used Square since 2019.")).toBe(false);
    expect(statesNoExperience('I do not have 5 years of Go.')).toBe(false);
    expect(statesNoExperience('I have no experience with Rust, only 6 months of C.')).toBe(false);
  });

  it('rejects a negation buried after the first sentence', () => {
    expect(
      statesNoExperience(
        'I led the payments rewrite and shipped the checkout flow end to end. I do not have ' +
          'Square experience specifically.',
      ),
    ).toBe(false);
  });

  it('rejects text too long to be a bare denial', () => {
    const padded = `I don't have experience with Square. ${'I worked on adjacent systems. '.repeat(10)}`;
    expect(padded.length).toBeGreaterThan(240);
    expect(statesNoExperience(padded)).toBe(false);
  });

  // A blank is a blank. Reading it as a denial would have the card tell the user the model
  // said something it never said.
  it('rejects an empty string, so a blank is never read as a denial', () => {
    expect(statesNoExperience('')).toBe(false);
    expect(statesNoExperience('   ')).toBe(false);
  });
});
