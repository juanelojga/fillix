import { render, screen } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import AgentTab from './AgentTab.svelte';

const mockPort = {
  postMessage: vi.fn(),
  onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  onDisconnect: { addListener: vi.fn() },
  disconnect: vi.fn(),
};

describe('AgentTab (smoke)', () => {
  const context = new Map([['agentPort', mockPort]]);

  it('renders without crashing', () => {
    expect(() => render(AgentTab, { context })).not.toThrow();
  });

  it('renders a Run button', () => {
    render(AgentTab, { context });
    expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument();
  });

  it('Run button is disabled on initial render (no workflow selected, no active tab)', () => {
    render(AgentTab, { context });
    const btn = screen.getByRole('button', { name: /run/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('renders a workflow selector', () => {
    render(AgentTab, { context });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows placeholder option "Select workflow…"', () => {
    render(AgentTab, { context });
    expect(screen.getByText('Select workflow…')).toBeInTheDocument();
  });
});
