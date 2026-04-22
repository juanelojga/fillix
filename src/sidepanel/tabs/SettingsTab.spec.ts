import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import SettingsTab from './SettingsTab.svelte';

describe('SettingsTab (smoke)', () => {
  it('renders without crashing', () => {
    expect(() => render(SettingsTab)).not.toThrow();
  });

  it('renders a save button', () => {
    render(SettingsTab);
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('renders provider selector options', () => {
    render(SettingsTab);
    expect(screen.getByText(/ollama/i)).toBeInTheDocument();
  });
});
