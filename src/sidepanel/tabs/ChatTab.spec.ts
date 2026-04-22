import { render, screen } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import ChatTab from './ChatTab.svelte';

const mockPort = {
  postMessage: vi.fn(),
  onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  onDisconnect: { addListener: vi.fn() },
  disconnect: vi.fn(),
};

describe('ChatTab (smoke)', () => {
  const context = new Map([['chatPort', mockPort]]);

  it('renders without crashing', () => {
    expect(() => render(ChatTab, { context })).not.toThrow();
  });

  it('renders a textarea for user input', () => {
    render(ChatTab, { context });
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders a send button', () => {
    render(ChatTab, { context });
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('send button is disabled when input is empty', () => {
    render(ChatTab, { context });
    const btn = screen.getByRole('button', { name: /send/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
