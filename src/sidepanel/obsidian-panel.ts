import { getObsidianConfig, setObsidianConfig } from '../lib/storage';
import type { Message, MessageResponse, ObsidianConfig } from '../types';

let obsidianConnected = false;

export function updateConnectionUI(connected: boolean): void {
  obsidianConnected = connected;
  const localSection = document.getElementById('system-prompt-local-section') as HTMLElement | null;
  const pathsSection = document.getElementById('obsidian-paths-section') as HTMLElement | null;
  const pathsAlert = document.getElementById('obsidian-paths-alert') as HTMLElement | null;
  if (localSection) localSection.hidden = connected;
  if (pathsSection) pathsSection.hidden = !connected;
  if (connected && pathsAlert) {
    const systemPromptPath = (
      document.getElementById('sp-obsidian-system-prompt-path') as HTMLInputElement | null
    )?.value.trim();
    pathsAlert.hidden = Boolean(systemPromptPath);
  } else if (pathsAlert) {
    pathsAlert.hidden = true;
  }
}

export function syncSidepanelBrowseState(): void {
  const hasKey = Boolean(
    (document.getElementById('sp-obsidian-api-key') as HTMLInputElement | null)?.value.trim(),
  );
  const browseSystem = document.getElementById(
    'sp-obsidian-browse-system-prompt',
  ) as HTMLButtonElement | null;
  const testBtn = document.getElementById('sp-obsidian-test') as HTMLButtonElement | null;
  if (browseSystem) browseSystem.disabled = !hasKey;
  if (testBtn) testBtn.disabled = !hasKey;
}

export async function loadSidepanelObsidian(): Promise<void> {
  const cfg = await getObsidianConfig();
  const host = document.getElementById('sp-obsidian-host') as HTMLInputElement | null;
  const port = document.getElementById('sp-obsidian-port') as HTMLInputElement | null;
  const apiKey = document.getElementById('sp-obsidian-api-key') as HTMLInputElement | null;
  const systemPromptPath = document.getElementById(
    'sp-obsidian-system-prompt-path',
  ) as HTMLInputElement | null;
  if (host) host.value = cfg.host;
  if (port) port.value = String(cfg.port);
  if (apiKey) apiKey.value = cfg.apiKey;
  if (systemPromptPath) systemPromptPath.value = cfg.systemPromptPath ?? '';
  syncSidepanelBrowseState();
}

export async function saveSidepanelObsidian(): Promise<void> {
  const cfg: ObsidianConfig = {
    host:
      (document.getElementById('sp-obsidian-host') as HTMLInputElement | null)?.value.trim() ??
      'localhost',
    port:
      Math.trunc(
        Number((document.getElementById('sp-obsidian-port') as HTMLInputElement | null)?.value),
      ) || 27123,
    apiKey:
      (document.getElementById('sp-obsidian-api-key') as HTMLInputElement | null)?.value.trim() ??
      '',
    systemPromptPath:
      (
        document.getElementById('sp-obsidian-system-prompt-path') as HTMLInputElement | null
      )?.value.trim() || undefined,
  };
  await setObsidianConfig(cfg);
}

export function wireSidepanelTestButton(): void {
  const btn = document.getElementById('sp-obsidian-test') as HTMLButtonElement | null;
  const statusEl = document.getElementById('obsidian-status') as HTMLElement | null;
  const warningEl = document.getElementById('obsidian-warning') as HTMLElement | null;
  if (!btn) return;
  btn.addEventListener('click', () => {
    btn.disabled = true;
    if (statusEl) statusEl.textContent = '';
    void (async () => {
      try {
        await saveSidepanelObsidian();
        const response = (await chrome.runtime.sendMessage({
          type: 'OBSIDIAN_TEST_CONNECTION',
        } satisfies Message)) as MessageResponse;
        if (response.ok) {
          if (statusEl) {
            statusEl.textContent = 'Connected';
            statusEl.classList.remove('error');
          }
          if (warningEl) warningEl.hidden = true;
          updateConnectionUI(true);
        } else {
          const errMsg = (response as { ok: false; error: string }).error;
          console.error('[Fillix] Obsidian test connection failed:', errMsg);
          if (statusEl) {
            statusEl.textContent = errMsg;
            statusEl.classList.add('error');
          }
          if (warningEl) warningEl.hidden = false;
          updateConnectionUI(false);
        }
      } catch (err) {
        console.error('[Fillix] Obsidian test connection error:', err);
        if (statusEl) {
          statusEl.textContent = String(err);
          statusEl.classList.add('error');
        }
        if (warningEl) warningEl.hidden = false;
        updateConnectionUI(false);
      } finally {
        syncSidepanelBrowseState();
      }
    })();
  });
}

export function wireSidepanelBrowseButtons(): void {
  let activeDropdown: HTMLElement | null = null;
  let dismissHandlers: (() => void) | null = null;

  function closeDropdown(): void {
    activeDropdown?.remove();
    activeDropdown = null;
    if (dismissHandlers) {
      dismissHandlers();
      dismissHandlers = null;
    }
  }

  function openDropdown(files: string[], anchorInput: HTMLInputElement): void {
    closeDropdown();

    const dropdown = document.createElement('div');
    dropdown.className = 'fillix-browse-dropdown';

    const rect = anchorInput.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 2}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;

    for (const file of files) {
      const item = document.createElement('div');
      item.className = 'fillix-browse-item';
      item.textContent = file;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        anchorInput.value = file;
        anchorInput.dispatchEvent(new Event('input', { bubbles: true }));
        closeDropdown();
      });
      dropdown.appendChild(item);
    }

    document.body.appendChild(dropdown);
    activeDropdown = dropdown;

    const onOutsideClick = (e: MouseEvent): void => {
      if (!dropdown.contains(e.target as Node)) closeDropdown();
    };
    const onEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeDropdown();
    };

    setTimeout(() => {
      document.addEventListener('mousedown', onOutsideClick);
      document.addEventListener('keydown', onEscape);
    }, 0);

    dismissHandlers = () => {
      document.removeEventListener('mousedown', onOutsideClick);
      document.removeEventListener('keydown', onEscape);
    };
  }

  function wireBrowseButton(btnId: string, inputId: string): void {
    const btn = document.getElementById(btnId) as HTMLButtonElement | null;
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!btn || !input) return;

    btn.addEventListener('click', () => {
      const warningEl = document.getElementById('obsidian-warning') as HTMLElement | null;
      btn.disabled = true;
      void (async () => {
        try {
          const response = (await chrome.runtime.sendMessage({
            type: 'OBSIDIAN_LIST_FILES',
          } satisfies Message)) as MessageResponse;
          if (!response.ok || !('files' in response) || !Array.isArray(response.files)) {
            if (warningEl) warningEl.hidden = false;
            return;
          }
          if (warningEl) warningEl.hidden = true;

          const dl = document.getElementById('sidepanel-vault-files') as HTMLDataListElement | null;
          if (dl) {
            dl.innerHTML = '';
            response.files.forEach((f) => {
              const opt = document.createElement('option');
              opt.value = f;
              dl.appendChild(opt);
            });
          }

          openDropdown(response.files, input);
        } catch {
          if (warningEl) warningEl.hidden = false;
        } finally {
          syncSidepanelBrowseState();
        }
      })();
    });
  }

  wireBrowseButton('sp-obsidian-browse-system-prompt', 'sp-obsidian-system-prompt-path');
}

export async function buildSystemPrompt(cfg: ObsidianConfig, fallback: string): Promise<string> {
  const warningEl = document.getElementById('obsidian-warning') as HTMLElement | null;
  const sourceEl = document.getElementById('sp-source') as HTMLElement | null;

  if (!cfg.apiKey || !cfg.systemPromptPath) {
    if (warningEl) warningEl.hidden = true;
    if (sourceEl) sourceEl.hidden = true;
    return fallback;
  }

  let systemPrompt = fallback;
  let fetchFailed = false;

  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'OBSIDIAN_GET_FILE',
      path: cfg.systemPromptPath,
    } satisfies Message)) as MessageResponse;
    if (response.ok && 'content' in response) {
      systemPrompt = response.content;
    } else {
      fetchFailed = true;
    }
  } catch {
    fetchFailed = true;
  }

  if (warningEl) warningEl.hidden = !fetchFailed;
  if (sourceEl) {
    if (systemPrompt !== fallback) {
      sourceEl.textContent = `System prompt: ${cfg.systemPromptPath}`;
      sourceEl.hidden = false;
    } else {
      sourceEl.hidden = true;
    }
  }

  return systemPrompt;
}

export function getObsidianConnected(): boolean {
  return obsidianConnected;
}
