import { getOllamaConfig, getProfile, setOllamaConfig, setProfile } from '../lib/storage';
import type { Message, MessageResponse, UserProfile } from '../types';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};

async function load(): Promise<void> {
  const [config, profile] = await Promise.all([getOllamaConfig(), getProfile()]);
  $<HTMLInputElement>('#baseUrl').value = config.baseUrl;
  document.querySelectorAll<HTMLInputElement>('[data-profile]').forEach((el) => {
    el.value = profile[el.dataset.profile!] ?? '';
  });
  await refreshModels(config.model);
}

async function refreshModels(preferred?: string): Promise<void> {
  const select = $<HTMLSelectElement>('#model');
  select.innerHTML = '';
  const response = (await chrome.runtime.sendMessage({
    type: 'OLLAMA_LIST_MODELS',
  } satisfies Message)) as MessageResponse;
  if (!response.ok) {
    setStatus(`Model list failed: ${response.error}`);
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

async function save(): Promise<void> {
  const config = {
    baseUrl: $<HTMLInputElement>('#baseUrl').value.trim(),
    model: $<HTMLSelectElement>('#model').value,
  };
  const profile: UserProfile = {};
  document.querySelectorAll<HTMLInputElement>('[data-profile]').forEach((el) => {
    const key = el.dataset.profile!;
    const value = el.value.trim();
    if (value) profile[key] = value;
  });
  await Promise.all([setOllamaConfig(config), setProfile(profile)]);
  setStatus('Saved.');
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

void load();
