import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import JobBriefCard from './JobBriefCard.svelte';
import type { JobBrief, SkillMention } from '$lib/playbooks/job-brief';

function skill(name: string, onProfile: boolean, connections: number | null = null): SkillMention {
  return { name, onProfile, connections };
}

function brief(overrides: Partial<JobBrief> = {}): JobBrief {
  return {
    description: 'We are seeking a senior full-stack engineer.',
    attributes: {
      Commitment: 'Full-time (40 hrs/wk)',
      'Time Zone': 'Madrid, 7 hrs ahead',
      'Workday Overlap': '7 hrs (4 hrs required)',
    },
    skills: {
      required: [
        skill('Python', true, 6),
        skill('React', true, 4),
        skill('Payment APIs', false),
        skill('Square', false),
      ],
      optional: [skill('PostgreSQL', true, 3)],
    },
    ...overrides,
  };
}

describe('JobBriefCard', () => {
  it('lists every attribute against its label', () => {
    render(JobBriefCard, { brief: brief() });

    expect(screen.getByText('Time Zone')).toBeInTheDocument();
    expect(screen.getByText('Madrid, 7 hrs ahead')).toBeInTheDocument();
    expect(screen.getByText('7 hrs (4 hrs required)')).toBeInTheDocument();
  });

  it('counts the required skills the profile already claims', () => {
    render(JobBriefCard, { brief: brief() });

    expect(
      screen.getByText(/2 of 4 required skills are on your Toptal profile/),
    ).toBeInTheDocument();
  });

  // The gaps are what a drafted answer must not claim experience with, so they are the part
  // worth reading and the only part coloured.
  it('shows the skills the profile does not claim', () => {
    render(JobBriefCard, { brief: brief() });

    expect(screen.getByText('Payment APIs')).toBeInTheDocument();
    expect(screen.getByText('Square')).toBeInTheDocument();
  });

  it('shows the claimed skills too', () => {
    render(JobBriefCard, { brief: brief() });

    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
  });

  it('says nothing about gaps when the profile claims every required skill', () => {
    render(JobBriefCard, {
      brief: brief({
        skills: { required: [skill('Python', true, 6)], optional: [] },
      }),
    });

    expect(screen.getByText(/1 of 1 required skills/)).toBeInTheDocument();
    expect(screen.queryByText('Payment APIs')).not.toBeInTheDocument();
  });

  // Pendo being blocked is a normal case, not drift, and the panel names what it lost rather
  // than quietly shrinking.
  it('words a missing attributes grid instead of rendering nothing', () => {
    render(JobBriefCard, { brief: brief({ attributes: {} }) });

    expect(screen.getByText(/No job attributes on this page/)).toBeInTheDocument();
  });

  it('omits the skills block entirely when the page listed none', () => {
    render(JobBriefCard, { brief: brief({ skills: { required: [], optional: [] } }) });

    expect(
      screen.queryByText(/required skills are on your Toptal profile/),
    ).not.toBeInTheDocument();
  });
});
