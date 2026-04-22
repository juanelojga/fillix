import { inferFieldValue, listModels } from './lib/ollama';
import {
  appendToFile,
  getFile,
  listFiles,
  listFilesInFolder,
  testConnection,
  writeFile,
} from './lib/obsidian';
import { resolveProvider } from './lib/providers/index';
import {
  getObsidianConfig,
  getOllamaConfig,
  getProviderConfig,
  getWorkflows,
  getWorkflowsFolder,
  setWorkflows,
} from './lib/storage';
import { parseWorkflow } from './lib/workflow';
import { runAgentPipeline } from './lib/agent-runner';
import type { AgentPortIn, AgentPortOut } from './lib/agent-runner';
import { handleChatPort } from './lib/chat-runner';
import type { Message, MessageResponse } from './types';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

async function autoRefreshWorkflows(): Promise<void> {
  try {
    const obsidian = await getObsidianConfig();
    if (!obsidian.apiKey) return;
    await handle({ type: 'WORKFLOWS_REFRESH' });
  } catch (err) {
    console.warn('[fillix] Auto-refresh workflows failed:', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void autoRefreshWorkflows();
});
chrome.runtime.onStartup.addListener(() => {
  void autoRefreshWorkflows();
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'chat') {
    handleChatPort(port);
  } else if (port.name === 'agent') {
    let controller: AbortController | null = null;

    port.onMessage.addListener(async (msg: AgentPortIn) => {
      try {
        if (msg.type === 'AGENTIC_RUN') {
          controller?.abort();
          controller = new AbortController();
          await runAgentPipeline(port, msg.workflowId, msg.tabId, controller.signal);
        } else if (msg.type === 'AGENTIC_APPLY') {
          const obsidianConfig = await getObsidianConfig();
          const resp = (await chrome.tabs.sendMessage(msg.tabId, {
            type: 'APPLY_FIELDS',
            fieldMap: msg.fieldMap,
          })) as { ok: true; applied: number } | { ok: false; error: string };
          const applied = resp.ok ? resp.applied : 0;
          const logPath = `fillix-logs/${new Date().toISOString().slice(0, 10)}.md`;
          appendToFile(obsidianConfig, logPath, `\n\n**Applied:** ${applied} field(s)`).catch(
            () => {},
          );
          port.postMessage({ type: 'AGENTIC_COMPLETE', applied, logPath } satisfies AgentPortOut);
        } else if (msg.type === 'AGENTIC_CANCEL') {
          controller?.abort();
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        port.postMessage({ type: 'AGENTIC_ERROR', stage: 'collect', error } satisfies AgentPortOut);
      }
    });

    port.onDisconnect.addListener(() => controller?.abort());
  }
});

export function sanitizeError(error: string, ...apiKeys: string[]): string {
  let result = error;
  for (const key of apiKeys) {
    if (key) result = result.split(key).join('[REDACTED]');
  }
  return result;
}

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  handle(msg)
    .then(sendResponse)
    .catch(async (err: unknown) => {
      const raw = err instanceof Error ? err.message : String(err);
      const { apiKey: obsidianKey } = await getObsidianConfig().catch(() => ({ apiKey: '' }));
      const { apiKey: providerKey = '' } = await getProviderConfig().catch(() => ({
        apiKey: undefined,
      }));
      sendResponse({
        ok: false,
        error: sanitizeError(raw, obsidianKey, providerKey),
      } satisfies MessageResponse);
    });
  return true;
});

async function handle(msg: Message): Promise<MessageResponse> {
  const config = await getOllamaConfig();
  switch (msg.type) {
    case 'OLLAMA_INFER': {
      const value = await inferFieldValue(config, msg.field);
      return { ok: true, value };
    }
    case 'OLLAMA_LIST_MODELS': {
      const models = await listModels(config);
      return { ok: true, models };
    }
    case 'LIST_MODELS': {
      const providerConfig = msg.config ?? (await getProviderConfig());
      const models = await resolveProvider(providerConfig).listModels();
      return { ok: true, models };
    }
    case 'CHAT_START':
    case 'CHAT_STOP':
      return { ok: false, error: 'Use port channel for chat' };
    case 'OBSIDIAN_TEST_CONNECTION': {
      const obsidian = await getObsidianConfig();
      await testConnection(obsidian);
      return { ok: true };
    }
    case 'OBSIDIAN_LIST_FILES': {
      const obsidian = await getObsidianConfig();
      const files = await listFiles(obsidian);
      return { ok: true, files };
    }
    case 'OBSIDIAN_GET_FILE': {
      const obsidian = await getObsidianConfig();
      const content = await getFile(obsidian, msg.path);
      return { ok: true, content };
    }
    case 'OBSIDIAN_WRITE': {
      const obsidian = await getObsidianConfig();
      await writeFile(obsidian, msg.path, msg.content);
      return { ok: true };
    }
    case 'OBSIDIAN_APPEND': {
      const obsidian = await getObsidianConfig();
      await appendToFile(obsidian, msg.path, msg.content);
      return { ok: true };
    }
    case 'WORKFLOWS_REFRESH': {
      const obsidian = await getObsidianConfig();
      const folder = await getWorkflowsFolder();
      const workflowFiles = await listFilesInFolder(obsidian, folder);
      const results = await Promise.all(
        workflowFiles.map(async (path) => {
          try {
            const raw = await getFile(obsidian, path);
            return parseWorkflow(path, raw);
          } catch (err) {
            console.warn(`[fillix] Skipping workflow ${path}:`, err);
            return null;
          }
        }),
      );
      const workflows = results.filter((w) => w !== null);
      await setWorkflows(workflows);
      return { ok: true };
    }
    case 'WORKFLOWS_LIST': {
      const workflows = await getWorkflows();
      return { ok: true, workflows };
    }
    case 'DETECT_FIELDS': {
      const resp = await chrome.tabs.sendMessage(msg.tabId, { type: 'DETECT_FIELDS' });
      return resp as MessageResponse;
    }
    case 'APPLY_FIELDS': {
      const resp = await chrome.tabs.sendMessage(msg.tabId, {
        type: 'APPLY_FIELDS',
        fieldMap: msg.fieldMap,
      });
      return resp as MessageResponse;
    }
    default: {
      const _: never = msg;
      return _;
    }
  }
}
