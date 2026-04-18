import {
  getObsidianConfig,
  getOllamaConfig,
  setObsidianConfig,
  setOllamaConfig,
} from '../lib/storage';
import type { Message, MessageResponse, ObsidianConfig } from '../types';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};

export function syncBrowseButtonState(): void {
  const hasKey = Boolean($<HTMLInputElement>('#obsidian-api-key').value.trim());
  $<HTMLButtonElement>('#obsidian-browse-system-prompt').disabled = !hasKey;
  $<HTMLButtonElement>('#obsidian-test').disabled = !hasKey;
}

export function wireTestButton(): void {
  const btn = $<HTMLButtonElement>('#obsidian-test');
  const status = $<HTMLElement>('#obsidian-status');
  btn.addEventListener('click', () => {
    btn.disabled = true;
    status.textContent = '';
    void (async () => {
      const warningEl = document.getElementById('obsidian-warning') as HTMLElement | null;
      try {
        const response = (await chrome.runtime.sendMessage({
          type: 'OBSIDIAN_TEST_CONNECTION',
        } satisfies Message)) as MessageResponse;
        if (response.ok) {
          status.textContent = 'Connected';
          if (warningEl) warningEl.hidden = true;
        } else {
          status.textContent = (response as { ok: false; error: string }).error;
          if (warningEl) warningEl.hidden = false;
        }
      } catch {
        if (warningEl) warningEl.hidden = false;
      } finally {
        syncBrowseButtonState();
      }
    })();
  });
}

export function wireBrowseButtons(): void {
  async function fetchAndPopulate(): Promise<void> {
    const warningEl = document.getElementById('obsidian-warning') as HTMLElement | null;
    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'OBSIDIAN_LIST_FILES',
      } satisfies Message)) as MessageResponse;
      if (!response.ok || !('files' in response) || !Array.isArray(response.files)) {
        if (warningEl) warningEl.hidden = false;
        return;
      }
      if (warningEl) warningEl.hidden = true;
      const dl = document.getElementById('vault-files') as HTMLDataListElement | null;
      if (!dl) return;
      dl.innerHTML = '';
      response.files.forEach((f) => {
        const opt = document.createElement('option');
        opt.value = f;
        dl.appendChild(opt);
      });
    } catch {
      if (warningEl) warningEl.hidden = false;
    }
  }

  $<HTMLButtonElement>('#obsidian-browse-system-prompt').addEventListener('click', () => {
    void fetchAndPopulate();
  });
}

export async function load(): Promise<void> {
  const [config, obsidian] = await Promise.all([getOllamaConfig(), getObsidianConfig()]);

  $<HTMLInputElement>('#baseUrl').value = config.baseUrl;

  $<HTMLInputElement>('#obsidian-host').value = obsidian.host;
  $<HTMLInputElement>('#obsidian-port').value = String(obsidian.port);
  $<HTMLInputElement>('#obsidian-api-key').value = obsidian.apiKey;
  $<HTMLInputElement>('#obsidian-system-prompt-path').value = obsidian.systemPromptPath ?? '';

  syncBrowseButtonState();

  await refreshModels(config.model);
}

export async function save(): Promise<void> {
  const obsidian: ObsidianConfig = {
    host: $<HTMLInputElement>('#obsidian-host').value.trim(),
    port: Math.trunc(Number($<HTMLInputElement>('#obsidian-port').value)) || 27123,
    apiKey: $<HTMLInputElement>('#obsidian-api-key').value.trim(),
    systemPromptPath: $<HTMLInputElement>('#obsidian-system-prompt-path').value.trim() || undefined,
  };

  const ollamaConfig = {
    baseUrl: $<HTMLInputElement>('#baseUrl').value.trim(),
    model: $<HTMLSelectElement>('#model').value,
  };

  await Promise.all([setOllamaConfig(ollamaConfig), setObsidianConfig(obsidian)]);
  setStatus('Saved.');
}

async function refreshModels(preferred?: string): Promise<void> {
  const select = $<HTMLSelectElement>('#model');
  select.innerHTML = '';
  const response = (await chrome.runtime.sendMessage({
    type: 'OLLAMA_LIST_MODELS',
  } satisfies Message)) as MessageResponse;
  if (!response.ok) {
    setStatus(`Model list failed: ${(response as { ok: false; error: string }).error}`);
    return;
  }
  if (!('models' in response)) return;
  response.models.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  if (preferred && response.models.includes(preferred)) {
    select.value = preferred;
  }
}

function setStatus(text: string): void {
  $<HTMLElement>('#status').textContent = text;
}

$<HTMLButtonElement>('#save').addEventListener('click', () => {
  void save();
});
$<HTMLButtonElement>('#refresh').addEventListener('click', () => {
  void refreshModels();
});
$<HTMLInputElement>('#obsidian-api-key').addEventListener('input', syncBrowseButtonState);

wireTestButton();
wireBrowseButtons();
void load();
