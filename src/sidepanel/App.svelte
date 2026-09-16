<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { Tabs, TabsList, TabsTrigger, TabsContent } from '$components/ui/tabs';
  import ChatTab from './tabs/ChatTab.svelte';
  import SettingsTab from './tabs/SettingsTab.svelte';
  import WorkflowTab from './tabs/WorkflowTab.svelte';
  import NewsTab from './tabs/NewsTab.svelte';
  import { loadSettings } from './stores/settings';
  import { hydrateNewsCache } from './stores/news';

  let currentTab = $state('chat');

  const chatPort = chrome.runtime.connect({ name: 'chat' });
  const workflowPort = chrome.runtime.connect({ name: 'workflow' });
  setContext('chatPort', chatPort);
  setContext('workflowPort', workflowPort);

  onMount(() => {
    void loadSettings();
    // Storage read only, never the network — News fetches on the button, not on mount.
    // Lives here rather than in NewsTab, whose onMount runs on every tab switch back.
    void hydrateNewsCache();
    return () => {
      chatPort.disconnect();
      workflowPort.disconnect();
    };
  });
</script>

<Tabs bind:value={currentTab} class="h-full flex flex-col">
  <TabsList class="w-full">
    <TabsTrigger value="chat" class="px-2">Chat</TabsTrigger>
    <TabsTrigger value="news" class="px-2">News</TabsTrigger>
    <TabsTrigger value="workflow" class="px-2">Workflow</TabsTrigger>
    <TabsTrigger value="settings" class="px-2">Settings</TabsTrigger>
  </TabsList>
  <TabsContent value="chat" class="flex-1 overflow-hidden"><ChatTab /></TabsContent>
  <TabsContent value="news" class="flex-1 overflow-hidden"><NewsTab /></TabsContent>
  <TabsContent value="settings"><SettingsTab /></TabsContent>
  <TabsContent value="workflow" class="overflow-hidden"><WorkflowTab /></TabsContent>
</Tabs>
