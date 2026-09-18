import { describe, it, expect } from 'vitest';
import { applicantName } from '../applicant-name';

describe('applicantName', () => {
  // How a CV usually opens, and the convention the Profile tab already states to the user.
  it('reads the name from a markdown title', () => {
    expect(
      applicantName('# Juan Almeida\n\nFullstack engineer.\n\n## Python\n\nEight years.'),
    ).toBe('Juan Almeida');
  });

  it('reads a bare first line with no heading marker', () => {
    expect(applicantName('Juan Almeida\n\n## Python\n\nEight years.')).toBe('Juan Almeida');
  });

  it('skips blank lines above the name', () => {
    expect(applicantName('\n\n\n#  Juan Almeida  \n\n## Python')).toBe('Juan Almeida');
  });

  /**
   * The defect `eval/golden.eval.ts` was holding open: the frozen profile's H1 is
   * `# Alex Rivera — Profile`, so every third-person pitch opened "Alex Rivera — Profile is a
   * Senior Software Engineer…" in the box Toptal forwards to a client.
   */
  it('strips a document-title suffix from the name', () => {
    expect(applicantName('# Alex Rivera — Profile\n\n## Python')).toBe('Alex Rivera');
    expect(applicantName('# Juan Almeida - CV\n\n## Python')).toBe('Juan Almeida');
    expect(applicantName('# Juan Almeida – Résumé\n\n## Python')).toBe('Juan Almeida');
    expect(applicantName('# Juan Almeida — Curriculum Vitae\n\n## Python')).toBe('Juan Almeida');
  });

  // The suffix comes off before the length check, so a real name is not rejected for the
  // punctuation of a title it never chose.
  it('measures the name without the suffix', () => {
    const name = 'Juan Sebastián Almeida de la Torre y Fernández Gutiérrez';

    expect(applicantName(`# ${name} — Curriculum Vitae\n\n## Python`)).toBe(name);
  });

  // Nothing is left to write a pitch about, and '' is the supported answer for that.
  it('gives nothing when the line is only a document title', () => {
    expect(applicantName('# — Profile\n\n## Python')).toBe('');
  });

  // 'Rivera-Profile' is not a title: the suffix needs the dash to stand on its own.
  it('keeps a name that merely ends in one of those words', () => {
    expect(applicantName('# Alex Profile\n\n## Python')).toBe('Alex Profile');
  });

  /**
   * '' is a supported answer, not a failure — `pitchSystemPrompt` says "The applicant" instead.
   * A guessed name in front of a recruiter is worse than a neutral one.
   */
  it('gives nothing for a profile with no preamble', () => {
    expect(applicantName('## Python\n\nEight years.')).toBe('');
  });

  it('gives nothing for an empty profile', () => {
    expect(applicantName('')).toBe('');
  });

  // 'Email: …' is what sits at the top when the name itself was never written down.
  it('gives nothing when the first line is a contact line', () => {
    expect(applicantName('Email: juan@example.com\n\n## Python')).toBe('');
  });

  // A headline or summary sentence, not a name. Writing a pitch "about" one would be absurd.
  it('gives nothing when the first line is too long to be a name', () => {
    const headline = 'Senior fullstack engineer with eight years across payments and robotics';

    expect(applicantName(`# ${headline}\n\n## Python`)).toBe('');
  });

  // Only the first non-blank line is a candidate: if it is not the name, nothing below it is
  // either, and walking on would find the contact line or the summary's first sentence.
  it('does not walk past a rejected first line looking for a better one', () => {
    expect(applicantName('Email: juan@example.com\n\nJuan Almeida\n\n## Python')).toBe('');
  });
});
