<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { get } from 'svelte/store';
  import { Tabs, TabsList, TabsTrigger, TabsContent } from '$components/ui/tabs';
  import ChatTab from './tabs/ChatTab.svelte';
  import SettingsTab from './tabs/SettingsTab.svelte';
  import WorkflowTab from './tabs/WorkflowTab.svelte';
  import { loadSettings, refreshModels, providerConfig } from './stores/settings';

  let currentTab = $state('chat');

  const chatPort = chrome.runtime.connect({ name: 'chat' });
  const workflowPort = chrome.runtime.connect({ name: 'workflow' });
  setContext('chatPort', chatPort);
  setContext('workflowPort', workflowPort);

  onMount(() => {
    void (async () => {
      await loadSettings();
      const cfg = get(providerConfig);
      if (cfg) await refreshModels(cfg);
    })();
    return () => {
      chatPort.disconnect();
      workflowPort.disconnect();
    };
  });
</script>

<Tabs bind:value={currentTab} class="h-full flex flex-col">
  <TabsList>
    <TabsTrigger value="chat">Chat</TabsTrigger>
    <TabsTrigger value="settings">Settings</TabsTrigger>
    <TabsTrigger value="workflow">Workflow</TabsTrigger>
  </TabsList>
  <TabsContent value="chat" class="flex-1 overflow-hidden"><ChatTab /></TabsContent>
  <TabsContent value="settings"><SettingsTab /></TabsContent>
  <TabsContent value="workflow" class="overflow-hidden"><WorkflowTab /></TabsContent>
</Tabs>
