// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSidepanelSettings, saveSidepanelSettings } from '../settings';

const mockGetWorkflowsFolder = vi.fn();
const mockSetWorkflowsFolder = vi.fn();

vi.mock('../../lib/storage', () => ({
  getWorkflowsFolder: mockGetWorkflowsFolder,
  setWorkflowsFolder: mockSetWorkflowsFolder,
}));

function buildDOM(): void {
  document.body.innerHTML = `
    <input id="workflows-folder" type="text" />
  `;
}

describe('loadSidepanelSettings — workflowsFolder', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    buildDOM();
  });

  it('populates #workflows-folder input from getWorkflowsFolder()', async () => {
    mockGetWorkflowsFolder.mockResolvedValue('my-custom-folder');
    await loadSidepanelSettings();
    expect((document.getElementById('workflows-folder') as HTMLInputElement).value).toBe(
      'my-custom-folder',
    );
  });

  it('shows "fillix-workflows" as the value when storage returns the default', async () => {
    mockGetWorkflowsFolder.mockResolvedValue('fillix-workflows');
    await loadSidepanelSettings();
    expect((document.getElementById('workflows-folder') as HTMLInputElement).value).toBe(
      'fillix-workflows',
    );
  });

  it('sets value to empty string if getWorkflowsFolder returns empty', async () => {
    mockGetWorkflowsFolder.mockResolvedValue('');
    await loadSidepanelSettings();
    expect((document.getElementById('workflows-folder') as HTMLInputElement).value).toBe('');
  });
});

describe('saveSidepanelSettings — workflowsFolder', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSetWorkflowsFolder.mockResolvedValue(undefined);
    buildDOM();
  });

  it('calls setWorkflowsFolder with the trimmed input value on save', async () => {
    (document.getElementById('workflows-folder') as HTMLInputElement).value = '  custom-wf  ';
    await saveSidepanelSettings();
    expect(mockSetWorkflowsFolder).toHaveBeenCalledWith('custom-wf');
  });

  it('calls setWorkflowsFolder with the default value when input is empty', async () => {
    (document.getElementById('workflows-folder') as HTMLInputElement).value = '';
    await saveSidepanelSettings();
    expect(mockSetWorkflowsFolder).toHaveBeenCalledWith('fillix-workflows');
  });

  it('persists the workflows folder path when save is triggered', async () => {
    (document.getElementById('workflows-folder') as HTMLInputElement).value = 'sprints';
    await saveSidepanelSettings();
    expect(mockSetWorkflowsFolder).toHaveBeenCalledOnce();
    expect(mockSetWorkflowsFolder).toHaveBeenCalledWith('sprints');
  });
});
