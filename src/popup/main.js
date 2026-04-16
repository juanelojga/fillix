import { getOllamaConfig, getProfile, setOllamaConfig, setProfile } from '../lib/storage';
const $ = (sel) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};
async function load() {
  const [config, profile] = await Promise.all([getOllamaConfig(), getProfile()]);
  $('#baseUrl').value = config.baseUrl;
  document.querySelectorAll('[data-profile]').forEach((el) => {
    el.value = profile[el.dataset.profile] ?? '';
  });
  await refreshModels(config.model);
}
async function refreshModels(preferred) {
  const select = $('#model');
  select.innerHTML = '';
  const response = await chrome.runtime.sendMessage({
    type: 'OLLAMA_LIST_MODELS',
  });
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
async function save() {
  const config = {
    baseUrl: $('#baseUrl').value.trim(),
    model: $('#model').value,
  };
  const profile = {};
  document.querySelectorAll('[data-profile]').forEach((el) => {
    const key = el.dataset.profile;
    const value = el.value.trim();
    if (value) profile[key] = value;
  });
  await Promise.all([setOllamaConfig(config), setProfile(profile)]);
  setStatus('Saved.');
}
function setStatus(text) {
  $('#status').textContent = text;
}
$('#save').addEventListener('click', () => {
  void save();
});
$('#refresh').addEventListener('click', () => {
  void refreshModels();
});
void load();
