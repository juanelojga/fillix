import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Fillix',
  description: 'Auto-fill forms using a local Ollama model',
  version: '0.0.1',
  action: {},
  options_ui: {
    page: 'src/popup/index.html',
    open_in_tab: true,
  },
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
  permissions: ['storage', 'activeTab', 'sidePanel'],
  host_permissions: ['http://localhost:11434/*', 'http://localhost:27123/*'],
});
