import { inferFieldValue, listModels } from './lib/ollama';
import { getOllamaConfig } from './lib/storage';
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg)
    .then(sendResponse)
    .catch((err) => {
      const error = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error });
    });
  return true;
});
async function handle(msg) {
  const config = await getOllamaConfig();
  switch (msg.type) {
    case 'OLLAMA_INFER': {
      const value = await inferFieldValue(config, msg.field, msg.profile);
      return { ok: true, value };
    }
    case 'OLLAMA_LIST_MODELS': {
      const models = await listModels(config);
      return { ok: true, models };
    }
  }
}
