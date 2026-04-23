import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Fillix',
  description: 'Auto-fill forms using a local Ollama model',
  version: '0.0.1',
  action: {},
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'activeTab', 'sidePanel', 'tabs', 'scripting'],
  host_permissions: [
    'http://localhost:11434/*',
    'http://localhost:27123/*',
    'https://api.openai.com/*',
    'https://openrouter.ai/*',
    'https://api.search.brave.com/*',
    'https://en.wikipedia.org/*',
    'https://news.google.com/*',
    'https://web.whatsapp.com/*',
    'https://www.linkedin.com/*',
    '<all_urls>',
  ],
});
