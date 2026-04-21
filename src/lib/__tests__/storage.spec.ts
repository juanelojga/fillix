// TODO: Install test runner with: pnpm add -D vitest @vitest/ui
// Run with: pnpm exec vitest run
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getChatConfig,
  setChatConfig,
  getWorkflows,
  setWorkflows,
  getWorkflowsFolder,
  setWorkflowsFolder,
} from '../storage';
import type { ChatConfig } from '../storage';
import type { WorkflowDefinition } from '../../types';

const mockGet = vi.fn();
const mockSet = vi.fn();

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: mockGet,
      set: mockSet,
    },
  },
});

describe('getChatConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns the default systemPrompt when storage has no chat key', async () => {
    mockGet.mockResolvedValue({});
    const config = await getChatConfig();
    expect(config.systemPrompt).toBeTruthy();
    expect(typeof config.systemPrompt).toBe('string');
  });

  it('merges stored value over defaults', async () => {
    const stored: ChatConfig = { systemPrompt: 'Custom prompt' };
    mockGet.mockResolvedValue({ chat: stored });
    const config = await getChatConfig();
    expect(config.systemPrompt).toBe('Custom prompt');
  });

  it('reads from the "chat" storage key', async () => {
    mockGet.mockResolvedValue({});
    await getChatConfig();
    expect(mockGet).toHaveBeenCalledWith('chat');
  });

  it('preserves all fields from stored config', async () => {
    const stored: ChatConfig = { systemPrompt: 'My assistant' };
    mockGet.mockResolvedValue({ chat: stored });
    const config = await getChatConfig();
    expect(config).toMatchObject(stored);
  });
});

describe('setChatConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSet.mockResolvedValue(undefined);
  });

  it('writes to the "chat" storage key', async () => {
    const config: ChatConfig = { systemPrompt: 'Be brief.' };
    await setChatConfig(config);
    expect(mockSet).toHaveBeenCalledWith({ chat: config });
  });

  it('persists the exact config object passed', async () => {
    const config: ChatConfig = { systemPrompt: 'You are a pirate.' };
    await setChatConfig(config);
    expect(mockSet).toHaveBeenCalledWith({ chat: config });
  });
});

describe('getWorkflowsFolder', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns "fillix-workflows" when no value is stored', async () => {
    mockGet.mockResolvedValue({});
    const folder = await getWorkflowsFolder();
    expect(folder).toBe('fillix-workflows');
  });

  it('returns the stored value when one exists', async () => {
    mockGet.mockResolvedValue({ workflowsFolder: 'my-custom-folder' });
    const folder = await getWorkflowsFolder();
    expect(folder).toBe('my-custom-folder');
  });
});

describe('setWorkflowsFolder', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSet.mockResolvedValue(undefined);
  });

  it('persists the folder path to storage', async () => {
    await setWorkflowsFolder('custom-workflows');
    expect(mockSet).toHaveBeenCalledWith({ workflowsFolder: 'custom-workflows' });
  });
});

describe('getWorkflows', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns an empty array when no workflows are stored', async () => {
    mockGet.mockResolvedValue({});
    const workflows = await getWorkflows();
    expect(workflows).toEqual([]);
  });

  it('returns stored workflows array', async () => {
    const stub: WorkflowDefinition[] = [
      {
        id: 'workflows/test.md',
        name: 'Test Workflow',
        taskType: 'form',
        tone: 'professional',
        requiredProfileFields: [],
        review: true,
        logFullOutput: true,
        autoApply: false,
        systemPrompt: 'Fill the form.',
      },
    ];
    mockGet.mockResolvedValue({ workflows: stub });
    const workflows = await getWorkflows();
    expect(workflows).toEqual(stub);
  });
});

describe('setWorkflows', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSet.mockResolvedValue(undefined);
  });

  it('persists the workflows array to storage', async () => {
    const stub: WorkflowDefinition[] = [];
    await setWorkflows(stub);
    expect(mockSet).toHaveBeenCalledWith({ workflows: stub });
  });
});
