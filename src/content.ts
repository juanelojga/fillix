import { detectFields, setFieldValue } from './lib/forms';
import { getProfile } from './lib/storage';
import type { Message, MessageResponse } from './types';

const BUTTON_ID = 'fillix-trigger';

function init(): void {
  if (document.getElementById(BUTTON_ID)) return;
  if (detectFields().length === 0) return;
  injectTriggerButton();
}

function injectTriggerButton(): void {
  const btn = document.createElement('button');
  btn.id = BUTTON_ID;
  btn.type = 'button';
  btn.textContent = 'Fillix: fill';
  btn.style.cssText = [
    'position:fixed', 'bottom:16px', 'right:16px', 'z-index:2147483647',
    'padding:8px 12px', 'background:#111', 'color:#fff', 'border:0',
    'border-radius:6px', 'font:13px system-ui,sans-serif', 'cursor:pointer',
    'box-shadow:0 2px 8px rgba(0,0,0,.2)',
  ].join(';');
  btn.addEventListener('click', () => {
    void fillAll(btn);
  });
  document.body.appendChild(btn);
}

async function fillAll(btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Fillix: thinking…';
  try {
    const profile = await getProfile();
    const fields = detectFields();
    for (const field of fields) {
      const msg: Message = { type: 'OLLAMA_INFER', field: field.context, profile };
      const response = (await chrome.runtime.sendMessage(msg)) as MessageResponse;
      if (response.ok && 'value' in response && response.value) {
        setFieldValue(field.element, response.value);
      }
    }
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
